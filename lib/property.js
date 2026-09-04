"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerProperty = registerProperty;
const config_1 = require("./config");
const util_1 = require("./util");
const TYPES = [
    { key: 'house', name: '住宅', icon: '🏠', priceMul: 1.0, rentMul: 0.8, volMul: 0.7, desc: '刚需保值，波动小、收益低' },
    { key: 'apartment', name: '公寓', icon: '🏢', priceMul: 1.3, rentMul: 1.0, volMul: 0.9, desc: '租售比高，稳健首选' },
    { key: 'shop', name: '商铺', icon: '🏪', priceMul: 1.8, rentMul: 1.4, volMul: 1.2, desc: '依赖人流，旺季大涨淡季大跌' },
    { key: 'office', name: '写字楼', icon: '🏬', priceMul: 2.5, rentMul: 1.6, volMul: 1.4, desc: '高租高波，受政策/利率敏感' },
    { key: 'mansion', name: '豪宅', icon: '🏰', priceMul: 5.0, rentMul: 1.2, volMul: 2.0, desc: '泡沫最爱，最刺激也最容易蒸发' },
];
/** 4 个固定区域（基础价按股票 / 用户群经济实力调过；远郊最便宜、市中心最贵） */
const ZONES = [
    { code: 'center', name: '市中心', icon: '🌆', basePrice: 50000 },
    { code: 'oldcity', name: '老城区', icon: '🏛️', basePrice: 30000 },
    { code: 'newdev', name: '开发区', icon: '🏗️', basePrice: 25000 },
    { code: 'suburb', name: '远郊', icon: '🌾', basePrice: 12000 },
];
// ──────────────── 工具函数 ────────────────
function getType(typeKey) {
    return TYPES.find(t => t.key === typeKey) || null;
}
function getZone(zoneCode) {
    return ZONES.find(z => z.code === zoneCode) || null;
}
function qualityMul(quality) {
    // 品质 1-5 → 0.85 / 1.0 / 1.2 / 1.5 / 2.0
    const q = Math.max(1, Math.min(5, Math.floor(quality)));
    return [0.85, 1.0, 1.2, 1.5, 2.0][q - 1] || 1;
}
function fmtPct(n) {
    const sign = n > 0 ? '+' : '';
    return `${sign}${(n * 100).toFixed(1)}%`;
}
// ──────────────── 主模块 ────────────────
function registerProperty({ ctx, config, core, logger }) {
    /** 确保所有区域已初始化，并将旧房产行补齐 v1.14.0 新字段 */
    async function ensureZones() {
        const existing = await ctx.database.get('daily_property_zones', {});
        const have = new Set(existing.map(z => z.code));
        for (const z of ZONES) {
            if (have.has(z.code))
                continue;
            await ctx.database.create('daily_property_zones', {
                code: z.code,
                name: z.name,
                icon: z.icon,
                basePrice: z.basePrice,
                currentPrice: z.basePrice,
                trend: 0,
                bubbleIndex: 0,
                lastEvent: 'init',
                lastEventAt: new Date(),
                haltedUntil: null,
                policyNote: '',
                updatedAt: new Date(),
            });
            // 写一行 history 让 K 线起点对齐
            await ctx.database.create('daily_property_history', {
                zoneCode: z.code,
                price: z.basePrice,
                time: new Date(),
                event: 'init',
            });
        }
        // v1.14.0：将旧 daily_properties 行补齐 isDerelict / listedForSale / listedPrice 字段
        try {
            const allProps = await ctx.database.get('daily_properties', {});
            for (const p of allProps) {
                const upd = {};
                if (p.isDerelict == null)
                    upd.isDerelict = 0;
                if (p.listedForSale == null)
                    upd.listedForSale = 0;
                if (p.listedPrice == null || Number.isNaN(p.listedPrice))
                    upd.listedPrice = 0;
                if (Object.keys(upd).length) {
                    await ctx.database.set('daily_properties', { id: p.id }, upd);
                }
            }
        }
        catch (e) {
            logger.warn('房产字段迁移失败（可忽略）:', e.message);
        }
    }
    /** 计算买入价 = 区域当前价 × 类型倍数 × 品质倍数 × 轻微随机 × 烂尾折扣(可选) */
    function computeBuyPrice(zone, typeKey, quality, isDerelict = false) {
        const ts = getType(typeKey);
        if (!ts)
            return 0;
        const qm = qualityMul(quality);
        const jitter = 0.95 + Math.random() * 0.1; // ±5%
        const derelictFactor = isDerelict ? config.propertyDerelictDiscount : 1;
        return Math.max(1, Math.floor(zone.currentPrice * ts.priceMul * qm * jitter * derelictFactor));
    }
    // ── 行情 tick ──
    let tickInFlight = false;
    async function tickMarket(force = false) {
        if (!config.propertyEnabled)
            return null;
        if (tickInFlight)
            return null;
        tickInFlight = true;
        try {
            const zones = await ctx.database.get('daily_property_zones', {});
            if (!zones.length)
                return null;
            const events = [];
            const now = new Date();
            for (const z of zones) {
                // 清理过期事件
                const expiredEvents = await ctx.database.get('daily_property_events', { zoneCode: z.code });
                for (const ev of expiredEvents) {
                    if (ev.expiresAt && new Date(ev.expiresAt).getTime() < now.getTime()) {
                        await ctx.database.remove('daily_property_events', { id: ev.id });
                    }
                }
                const ts = getType('house'); // 默认波动用住宅
                let cur = z.currentPrice;
                let trend = z.trend;
                let bubble = z.bubbleIndex;
                let lastEvent = '';
                const halted = z.haltedUntil && new Date(z.haltedUntil).getTime() > now.getTime();
                // 1) 限购/停牌检查：halted 时不允许交易，但价格仍可涨（政策预期）
                // 2) 随机涨跌
                if (!halted) {
                    const baseVol = config.propertyTickVolatility;
                    // 基础噪声 [-vol, vol]
                    const noise = (Math.random() * 2 - 1) * baseVol;
                    // 趋势加成：trend 越大，下一次更倾向同向（动量）
                    const momentum = trend * 0.3;
                    const change = noise + momentum;
                    // 利率上调：估值下降
                    if (Math.random() < config.propertyInterestUpChance) {
                        const drop = -(0.05 + Math.random() * 0.10);
                        cur = cur * (1 + drop);
                        bubble = Math.max(0, bubble - 5);
                        lastEvent = 'interest_up';
                        trend += drop;
                    }
                    else if (Math.random() < (config.propertyInterestDownChance || 0.04)) {
                        // v1.14.0：利率下调 → 估值上升
                        const rise = 0.03 + Math.random() * 0.05;
                        cur = cur * (1 + rise);
                        bubble = Math.min(100, bubble + 5);
                        lastEvent = 'interest_down';
                        trend += rise;
                    }
                    cur = cur * (1 + change);
                    trend = trend * 0.7 + change * 0.3; // 衰减 + 更新
                    if (lastEvent !== 'interest_up' && lastEvent !== 'interest_down') {
                        if (change > 0)
                            lastEvent = 'tick_up';
                        else if (change < 0)
                            lastEvent = 'tick_down';
                        else
                            lastEvent = 'tick_flat';
                    }
                }
                else {
                    lastEvent = 'policy_halted';
                }
                // 2.5) v1.14.0 升值政策：旧改 / 新区规划 / 地铁开通 / 经济特区
                if (!halted && Math.random() < config.propertyAppreciationChance) {
                    const candidates = [];
                    if (z.code === 'oldcity')
                        candidates.push({ type: 'policy_urban_renewal', label: '旧城改造', range: [0.10, 0.20] });
                    if (z.code === 'newdev')
                        candidates.push({ type: 'policy_development_plan', label: '新区规划', range: [0.10, 0.20] });
                    candidates.push({ type: 'policy_subway_open', label: '地铁开通', range: [0.05, 0.15] });
                    candidates.push({ type: 'policy_special_economic', label: '经济特区', range: [0.15, 0.25] });
                    const pick = candidates[Math.floor(Math.random() * candidates.length)];
                    const up = pick.range[0] + Math.random() * (pick.range[1] - pick.range[0]);
                    cur = cur * (1 + up);
                    bubble = Math.min(100, bubble + 8);
                    trend = Math.min(0.5, trend + up);
                    lastEvent = pick.type;
                    await ctx.database.create('daily_property_events', {
                        zoneCode: z.code,
                        type: pick.type,
                        severity: up,
                        message: `${pick.label}：区域均价上涨 ${(up * 100).toFixed(1)}%`,
                        startedAt: now,
                        expiresAt: new Date(now.getTime() + config_1.DAY * 3),
                    });
                    events.push(`📈 [${z.icon}${z.name}] ${pick.label}！均价 +${(up * 100).toFixed(1)}%`);
                }
                // 2.6) v1.14.0 危机政策：强制拆迁
                if (!halted && Math.random() < (config.propertyCrisisChance || 0.04)) {
                    const drop = -(0.30 + Math.random() * 0.20);
                    cur = cur * (1 + drop);
                    trend = Math.min(0, trend) - 0.3;
                    bubble = 0;
                    lastEvent = 'policy_demolition';
                    const dur = 3 + Math.floor(Math.random() * 4);
                    await ctx.database.create('daily_property_events', {
                        zoneCode: z.code,
                        type: 'policy_demolition',
                        severity: Math.abs(drop),
                        message: `强制拆迁令：区域均价暴跌 ${(Math.abs(drop) * 100).toFixed(0)}%，存量房贬值`,
                        startedAt: now,
                        expiresAt: new Date(now.getTime() + dur * config.propertyUpdateIntervalHours * config_1.HOUR),
                    });
                    events.push(`💥 [${z.icon}${z.name}] 强制拆迁令！价格暴跌 ${(Math.abs(drop) * 100).toFixed(0)}%！`);
                    const zoneProps = await ctx.database.get('daily_properties', { zoneCode: z.code, status: 'holding' });
                    for (const up of zoneProps) {
                        await ctx.database.set('daily_properties', { id: up.id }, {
                            currentValue: Math.floor((up.currentValue || 0) * Math.max(0.4, 1 + drop)),
                        });
                    }
                }
                // 3) 泡沫破裂检查
                if (bubble >= config.propertyBubbleThreshold) {
                    // 暴跌
                    const crashRatio = config.propertyCrashRatio + (Math.random() - 0.5) * 0.1;
                    const factor = Math.max(0.1, 1 - crashRatio);
                    cur = cur * factor;
                    trend = Math.min(0, trend) - 0.2;
                    bubble = 0;
                    lastEvent = 'bubble_crash';
                    events.push(`💥 [${z.icon}${z.name}] 泡沫破裂！价格暴跌 ${(crashRatio * 100).toFixed(0)}%！`);
                    await ctx.database.create('daily_property_events', {
                        zoneCode: z.code,
                        type: 'bubble_crash',
                        severity: crashRatio,
                        message: `泡沫破裂，暴跌 ${(crashRatio * 100).toFixed(0)}%`,
                        startedAt: now,
                        expiresAt: new Date(now.getTime() + config_1.DAY),
                    });
                }
                // 4) 政策触发
                if (Math.random() < config.propertyPolicyChance) {
                    const policyType = ['policy_buy_limit', 'policy_sell_limit', 'policy_tax_up'][Math.floor(Math.random() * 3)];
                    const dur = 2 + Math.floor(Math.random() * 5); // 2-6 tick
                    let msg = '';
                    if (policyType === 'policy_buy_limit') {
                        msg = `限购新政：暂停买入 ${dur} 小时`;
                        // 下次开盘时仍可交易，但买入会被拒绝
                    }
                    else if (policyType === 'policy_sell_limit') {
                        msg = `限售新政：暂停卖出 ${dur} 小时`;
                    }
                    else {
                        msg = `房产税上调：交易税临时 +50%`;
                    }
                    await ctx.database.create('daily_property_events', {
                        zoneCode: z.code,
                        type: policyType,
                        severity: 0.5,
                        message: msg,
                        startedAt: now,
                        expiresAt: new Date(now.getTime() + dur * config.propertyUpdateIntervalHours * config_1.HOUR),
                    });
                    events.push(`📜 [${z.icon}${z.name}] ${msg}`);
                    if (policyType === 'policy_buy_limit' || policyType === 'policy_sell_limit') {
                        await ctx.database.set('daily_property_zones', { code: z.code }, { haltedUntil: new Date(now.getTime() + dur * config.propertyUpdateIntervalHours * config_1.HOUR) });
                    }
                }
                // 5) 自然灾害
                if (Math.random() < config.propertyDisasterChance) {
                    const dType = ['disaster_earthquake', 'disaster_flood'][Math.floor(Math.random() * 2)];
                    const sev = 0.15 + Math.random() * 0.35;
                    cur = cur * (1 - sev);
                    trend -= sev;
                    bubble = Math.max(0, bubble - 10);
                    lastEvent = dType;
                    const dur = 1 + Math.floor(Math.random() * 3);
                    await ctx.database.create('daily_property_events', {
                        zoneCode: z.code,
                        type: dType,
                        severity: sev,
                        message: `${dType === 'disaster_earthquake' ? '地震' : '洪水'}来袭，估值受损 ${(sev * 100).toFixed(0)}%`,
                        startedAt: now,
                        expiresAt: new Date(now.getTime() + dur * config.propertyUpdateIntervalHours * config_1.HOUR),
                    });
                    events.push(`🌋 [${z.icon}${z.name}] ${dType === 'disaster_earthquake' ? '地震' : '洪水'}来袭，估值 -${(sev * 100).toFixed(0)}%`);
                }
                // 5.5) v1.14.0 烂尾整治（处理该区域已有的烂尾楼）
                const zoneDerelicts = await ctx.database.get('daily_properties', { zoneCode: z.code, status: 'holding', isDerelict: 1 });
                if (zoneDerelicts.length && Math.random() < (config.propertyDerelictRescueChance || 0.5)) {
                    const r = Math.random();
                    if (r < 0.3) {
                        // 修复完工
                        const restoreMul = config.propertyDerelictRestoreMul || 0.5;
                        for (const d of zoneDerelicts) {
                            const newVal = Math.floor((d.currentValue || 0) * (1 + restoreMul));
                            await ctx.database.set('daily_properties', { id: d.id }, {
                                isDerelict: 0,
                                currentValue: newVal,
                            });
                        }
                        await ctx.database.create('daily_property_events', {
                            zoneCode: z.code,
                            type: 'policy_relief_cleanup',
                            severity: restoreMul,
                            message: `政府对 ${zoneDerelicts.length} 套烂尾楼完成修复验收，恢复正常出租与转手`,
                            startedAt: now,
                            expiresAt: new Date(now.getTime() + config_1.DAY),
                        });
                        events.push(`🛠️ [${z.icon}${z.name}] 烂尾整治：${zoneDerelicts.length} 套修复完工`);
                    }
                    else if (r < 0.8) {
                        // 强制回购
                        const buybackRate = config.propertyDerelictBuybackRate || 0.3;
                        let totalRefund = 0;
                        for (const d of zoneDerelicts) {
                            const refund = Math.floor((d.boughtPrice || 0) * buybackRate);
                            totalRefund += refund;
                            await core.dbTx(async (db) => {
                                const uRow = await core.getUser(d.userId);
                                await db.set('daily_points', { userId: d.userId }, { points: uRow.points + refund });
                                await db.set('daily_properties', { id: d.id }, {
                                    status: 'sold',
                                    soldAt: now,
                                    soldPrice: refund,
                                    isDerelict: 0,
                                });
                            });
                        }
                        await ctx.database.create('daily_property_events', {
                            zoneCode: z.code,
                            type: 'policy_relief_cleanup',
                            severity: buybackRate,
                            message: `政府强制回购 ${zoneDerelicts.length} 套烂尾楼，按原价 ${(buybackRate * 100).toFixed(0)}% 补偿`,
                            startedAt: now,
                            expiresAt: new Date(now.getTime() + config_1.DAY),
                        });
                        events.push(`🏛️ [${z.icon}${z.name}] 烂尾整治：强制回购 ${zoneDerelicts.length} 套`);
                    }
                    // 20% 概率仅记录不处理（避免连续几 tick 都处理同一批）
                }
                // 6) 泡沫积累：连续上涨 → 泡沫 +
                if (trend > 0.05) {
                    bubble = Math.min(100, bubble + config.propertyBubbleMaxIncrease * trend * 0.5);
                }
                else if (trend < -0.05) {
                    bubble = Math.max(0, bubble - 5);
                }
                // 7) 价格 floor：不低于基础价 30%
                cur = Math.max(z.basePrice * 0.3, cur);
                // 8) 写回
                await ctx.database.set('daily_property_zones', { code: z.code }, {
                    currentPrice: Math.floor(cur),
                    trend,
                    bubbleIndex: Math.floor(bubble),
                    lastEvent,
                    lastEventAt: now,
                    updatedAt: now,
                });
                // 9) 写 history
                await ctx.database.create('daily_property_history', {
                    zoneCode: z.code,
                    price: Math.floor(cur),
                    time: now,
                    event: lastEvent,
                });
                // 10) 同步用户房产估值（烂尾楼再打 5 折，反映低流动性）
                const userProps = await ctx.database.get('daily_properties', { zoneCode: z.code, status: 'holding' });
                for (const up of userProps) {
                    const newVal = Math.floor(cur * getType(up.type).priceMul * qualityMul(up.quality));
                    const finalVal = up.isDerelict ? Math.floor(newVal * 0.5) : newVal;
                    await ctx.database.set('daily_properties', { id: up.id }, { currentValue: finalVal });
                }
            }
            // 清理过期 haltedUntil
            for (const z of zones) {
                if (z.haltedUntil && new Date(z.haltedUntil).getTime() < now.getTime()) {
                    await ctx.database.set('daily_property_zones', { code: z.code }, { haltedUntil: null });
                }
            }
            // 清理过期 P2P 挂牌（v1.14.0）
            try {
                const allListed = await ctx.database.get('daily_properties', { listedForSale: 1 });
                for (const p of allListed) {
                    if (p.listedAt && new Date(p.listedAt).getTime() + (config.propertyListingExpiryHours || 168) * config_1.HOUR < now.getTime()) {
                        await ctx.database.set('daily_properties', { id: p.id }, { listedForSale: 0, listedPrice: 0, listedAt: null });
                    }
                }
            }
            catch (e) { /* ignore */ }
            // 广播重大事件
            if (events.length) {
                const msg = events.join('\n');
                logger.info('房产行情更新：\n' + msg);
                await core.broadcast(`📊 房产市场异动：\n${msg}`);
            }
            return { zones: zones.length, events };
        }
        finally {
            tickInFlight = false;
        }
    }
    // ── 自动收租 ──
    let rentInFlight = false;
    async function collectRent(force = false) {
        if (!config.propertyEnabled)
            return null;
        if (rentInFlight)
            return null;
        rentInFlight = true;
        try {
            // v1.14.0：自动跳过烂尾楼
            const props = await ctx.database.get('daily_properties', { status: 'holding', renting: 1 });
            const rentFactor = config.propertyDerelictRentFactor ?? 0;
            const now = Date.now();
            const intervalMs = config.propertyRentIntervalHours * config_1.HOUR;
            let totalCollected = 0;
            let houseCount = 0;
            for (const p of props) {
                // 烂尾楼：租金 × factor（默认 0，即不产生租金）
                if (p.isDerelict) {
                    // 仅更新 lastRentAt 让 next tick 不会重蹈覆辙
                    if (Math.floor((now - new Date(p.lastRentAt || p.boughtAt).getTime()) / config_1.HOUR) >= 1) {
                        await ctx.database.set('daily_properties', { id: p.id }, { lastRentAt: new Date(now) });
                    }
                    continue;
                }
                const last = p.lastRentAt ? new Date(p.lastRentAt).getTime() : new Date(p.boughtAt).getTime();
                const elapsedH = Math.floor((now - last) / config_1.HOUR);
                if (elapsedH < 1 && !force)
                    continue;
                const ts = getType(p.type);
                if (!ts)
                    continue;
                const rent = Math.max(1, Math.floor(p.currentValue * config.propertyRentYieldBase * ts.rentMul * elapsedH));
                if (rent < 1)
                    continue;
                await core.dbTx(async (db) => {
                    const dbAny = db;
                    const uRow = await core.getUser(p.userId);
                    await dbAny.set('daily_points', { userId: p.userId }, { points: uRow.points + rent });
                    await dbAny.set('daily_properties', { id: p.id }, {
                        lastRentAt: new Date(now),
                        accumulatedRent: (p.accumulatedRent || 0) + rent,
                    });
                });
                totalCollected += rent;
                houseCount++;
            }
            return { houseCount, totalCollected };
        }
        finally {
            rentInFlight = false;
        }
    }
    function schedulePropertyUpdates() {
        if (!config.propertyEnabled)
            return;
        ensureZones().catch(e => logger.warn('ensureZones 失败：', e.message));
        // 行情 tick
        const tickMs = Math.max(1, config.propertyUpdateIntervalHours) * config_1.HOUR;
        let inFlight = false;
        ctx.setInterval(() => {
            if (inFlight)
                return;
            inFlight = true;
            tickMarket()
                .catch(e => logger.warn('tickMarket 失败：', e.message))
                .finally(() => { inFlight = false; });
        }, tickMs);
        // 收租
        const rentMs = Math.max(1, config.propertyRentIntervalHours) * config_1.HOUR;
        let rentFl = false;
        ctx.setInterval(() => {
            if (rentFl)
                return;
            rentFl = true;
            collectRent()
                .catch(e => logger.warn('collectRent 失败：', e.message))
                .finally(() => { rentFl = false; });
        }, rentMs);
    }
    // ── 命令：买房 ──
    ctx.command('经济/房地产/买房 <type:string> <zone:string> [quality:number]', '买房：选 [类型] [区域] [品质1-5]')
        .alias('买房', 'goufang')
        .action(async ({ session }, typeKey, zoneCode, qualityArg) => {
        if (!session.userId)
            return;
        if (!config.propertyEnabled)
            return '房地产系统未开启。';
        const ts = getType(typeKey);
        if (!ts)
            return `房产类型只能是：${TYPES.map(t => `${ts ? '' : ''}${t.icon}${t.name}`).join(' / ')}。例如「买房 住宅 市中心 3」`;
        const zs = ZONES.find(z => z.code === zoneCode || z.name === zoneCode);
        if (!zs)
            return `区域只能是：${ZONES.map(z => `${z.icon}${z.name}(${z.code})`).join(' / ')}。`;
        const quality = Math.max(1, Math.min(5, Math.floor(Number(qualityArg) || 3)));
        await tickMarket(true);
        const zones = await ctx.database.get('daily_property_zones', { code: zs.code });
        const zone = zones[0];
        if (!zone)
            return '区域不存在，请稍后再试。';
        const now = Date.now();
        if (zone.haltedUntil && new Date(zone.haltedUntil).getTime() > now) {
            return `【${zs.name}】当前限购中（至 ${(0, util_1.fmtTime)(new Date(zone.haltedUntil).getTime())}），暂不能买入。`;
        }
        // 检查限购政策
        const activePolicies = await ctx.database.get('daily_property_events', { zoneCode: zs.code });
        const hasBuyBan = activePolicies.some(p => p.type === 'policy_buy_limit' && (!p.expiresAt || new Date(p.expiresAt).getTime() > now));
        if (hasBuyBan)
            return `【${zs.name}】当前限购新政生效中，暂不能买入。`;
        const willBeDerelict = Math.random() < (config.propertyDerelictChance ?? 0.08);
        const price = computeBuyPrice(zone, ts.key, quality, willBeDerelict);
        const key = (0, util_1.userKey)(session);
        const row = await core.getUser(key);
        // 上限
        const myProps = await ctx.database.get('daily_properties', { userId: key, status: 'holding' });
        if (myProps.length >= config.propertyMaxProperties) {
            return `您已持有 ${myProps.length} 套房产，达到上限 ${config.propertyMaxProperties}。先卖出一些吧。`;
        }
        if (row.points < price)
            return `现金不足：${ts.icon}${ts.name}(${quality}品) 在 ${zs.name} 当前 ${(0, util_1.fmtMoney)(price)} 积分，您现金 ${(0, util_1.fmtMoney)(row.points)}。`;
        // 交易税（买房也收，按配置）
        const tax = Math.floor(price * config.propertyTradeTax);
        const total = price + tax;
        if (row.points < total)
            return `含税 ${(0, util_1.fmtMoney)(tax)} 后需 ${(0, util_1.fmtMoney)(total)} 积分，您现金 ${(0, util_1.fmtMoney)(row.points)}。`;
        await core.dbTx(async (db) => {
            const dbAny = db;
            await dbAny.set('daily_points', { userId: key }, { points: row.points - total });
            await dbAny.create('daily_properties', {
                userId: key,
                zoneCode: zs.code,
                type: ts.key,
                quality,
                boughtPrice: price,
                boughtAt: new Date(now),
                currentValue: price,
                renting: 0,
                lastRentAt: new Date(now),
                accumulatedRent: 0,
                status: 'holding',
                soldAt: null,
                soldPrice: 0,
                isDerelict: willBeDerelict ? 1 : 0,
                listedForSale: 0,
                listedPrice: 0,
                listedAt: null,
            });
        });
        const lines = [];
        if (willBeDerelict) {
            lines.push(`⚠️ 你「买」到一套烂尾楼！${ts.icon}${ts.name}(${quality}品) 位于 ${zs.icon}${zs.name}`);
            lines.push(`成交价：${(0, util_1.fmtMoney)(price)}（原价 ${(0, util_1.fmtMoney)(Math.round(price / config.propertyDerelictDiscount))}，以 ${(config.propertyDerelictDiscount * 100).toFixed(0)}% 折价入手）`);
            lines.push(`当前估值：${(0, util_1.fmtMoney)(price)}（市场估值 × 0.5 = ${(0, util_1.fmtMoney)(Math.floor(price * 0.5))}）`);
            lines.push(`❌ 不能出租、不能 P2P 挂牌，只能等政府烂尾整治或按当前估值卖给 NPC 市场`);
            lines.push(`剩余现金：${(0, util_1.fmtMoney)(row.points - total)}`);
        }
        else {
            lines.push(`🎉 恭喜！你成功买下 ${ts.icon}${ts.name}(${quality}品) 位于 ${zs.icon}${zs.name}`);
            lines.push(`成交价：${(0, util_1.fmtMoney)(price)}（税 ${(0, util_1.fmtMoney)(tax)}，合计 ${(0, util_1.fmtMoney)(total)}）`);
            lines.push(`当前估值：${(0, util_1.fmtMoney)(price)}`);
            lines.push(`剩余现金：${(0, util_1.fmtMoney)(row.points - total)}`);
        }
        lines.push('');
        lines.push(`📌 提示：发送「租房 <ID> 1」开启出租（每 ${config.propertyRentIntervalHours} 小时自动收租）；发「卖房 <ID>」随时按当前估值卖给 NPC 市场，或「挂牌 <ID> <价格>」尝试卖给其他玩家。`);
        lines.push(`⚠️ 风险提示：泡沫可能在 ${zs.name} ${ts.name} 上一瞬间破裂！当前泡沫指数：${zone.bubbleIndex.toFixed(0)}/100`);
        return lines.join('\n');
    });
    // ── 命令：卖房 ──
    ctx.command('经济/房地产/卖房 <id:number>', '卖出指定 ID 的房产（按当前估值扣税）')
        .alias('卖房', 'maifang')
        .action(async ({ session }, id) => {
        if (!session.userId)
            return;
        if (!config.propertyEnabled)
            return '房地产系统未开启。';
        const key = (0, util_1.userKey)(session);
        const props = await ctx.database.get('daily_properties', { id: Number(id) });
        const p = props[0];
        if (!p)
            return '找不到这套房产。';
        if (p.userId !== key)
            return '这套房不是您的。';
        if (p.status !== 'holding')
            return '这套房已经卖出过了。';
        const now = Date.now();
        // 限售检查
        const zone = (await ctx.database.get('daily_property_zones', { code: p.zoneCode }))[0];
        if (zone?.haltedUntil && new Date(zone.haltedUntil).getTime() > now) {
            return `【${zone.name}】当前限售中（至 ${(0, util_1.fmtTime)(new Date(zone.haltedUntil).getTime())}），暂不能卖出。`;
        }
        const activePolicies = await ctx.database.get('daily_property_events', { zoneCode: p.zoneCode });
        const hasSellBan = activePolicies.some(pp => pp.type === 'policy_sell_limit' && (!pp.expiresAt || new Date(pp.expiresAt).getTime() > now));
        if (hasSellBan)
            return `【${zone.name}】当前限售新政生效中，暂不能卖出。`;
        const taxUp = activePolicies.some(pp => pp.type === 'policy_tax_up' && (!pp.expiresAt || new Date(pp.expiresAt).getTime() > now));
        const taxRate = config.propertyTradeTax * (taxUp ? 1.5 : 1);
        const saleValue = Math.floor(p.currentValue);
        const tax = Math.floor(saleValue * taxRate);
        const net = saleValue - tax;
        const profit = net - p.boughtPrice;
        const rentIncome = p.accumulatedRent || 0;
        await core.dbTx(async (db) => {
            const dbAny = db;
            const uRow = await core.getUser(key);
            await dbAny.set('daily_points', { userId: key }, { points: uRow.points + net });
            await dbAny.set('daily_properties', { id: p.id }, {
                status: 'sold',
                soldAt: new Date(now),
                soldPrice: net,
            });
        });
        const lines = [
            `🏦 卖出 ${(getType(p.type))?.icon}${(getType(p.type))?.name}(${p.quality}品) 位于 ${zone?.icon}${zone?.name}`,
            `成交价：${(0, util_1.fmtMoney)(saleValue)}｜交易税：${(0, util_1.fmtMoney)(tax)}（${(taxRate * 100).toFixed(0)}%）｜到手：${(0, util_1.fmtMoney)(net)}`,
            `买入价：${(0, util_1.fmtMoney)(p.boughtPrice)}｜资本利得：${(0, util_1.fmtMoney)(profit)}｜累计租金：${(0, util_1.fmtMoney)(rentIncome)}｜综合收益：${(0, util_1.fmtMoney)(profit + rentIncome)}`,
        ];
        return lines.join('\n');
    });
    // ── 命令：租房开关 ──
    ctx.command('经济/房地产/租房 <id:number> <flag:string>', '租房 <ID> 1/0：开启/关闭出租')
        .alias('租房', 'zufang')
        .action(async ({ session }, id, flag) => {
        if (!session.userId)
            return;
        if (!config.propertyEnabled)
            return '房地产系统未开启。';
        const key = (0, util_1.userKey)(session);
        const props = await ctx.database.get('daily_properties', { id: Number(id) });
        const p = props[0];
        if (!p)
            return '找不到这套房产。';
        if (p.userId !== key)
            return '这套房不是您的。';
        if (p.status !== 'holding')
            return '这套房已卖出。';
        // v1.14.0：烂尾楼无法出租
        if (p.isDerelict) {
            return `❌ #${p.id} 是烂尾楼，无法出租。请等待政府烂尾整治（修复完工/强制回购），或按当前估值卖给 NPC 市场。`;
        }
        const on = ['1', '开', 'on', '开启', '出租'].includes(String(flag).toLowerCase());
        await ctx.database.set('daily_properties', { id: p.id }, { renting: on ? 1 : 0 });
        return on
            ? `🏠 房产 #${p.id} 已开启出租，每 ${config.propertyRentIntervalHours} 小时自动收租（基础年化收益率 ≈ ${(config.propertyRentYieldBase * 24 * 365 * 100).toFixed(2)}%）。`
            : `🚪 房产 #${p.id} 已停止出租。`;
    });
    // ── 命令：收租（手动触发） ──
    ctx.command('经济/房地产/收租', '手动触发所有出租房产的租金结算（每 N 小时系统也会自动收）')
        .alias('收租')
        .action(async ({ session }) => {
        if (!session.userId)
            return;
        if (!config.propertyEnabled)
            return '房地产系统未开启。';
        const key = (0, util_1.userKey)(session);
        // 先按 user 维度收集
        const before = await ctx.database.get('daily_points', { userId: key });
        const me = before[0];
        if (!me)
            return '请先签到。';
        const myProps = await ctx.database.get('daily_properties', { userId: key, status: 'holding', renting: 1 });
        if (!myProps.length)
            return '您没有在出租的房产。';
        const now = Date.now();
        let totalRent = 0;
        for (const p of myProps) {
            // 烂尾楼不产生租金
            if (p.isDerelict) {
                await ctx.database.set('daily_properties', { id: p.id }, { lastRentAt: new Date(now) });
                continue;
            }
            const last = p.lastRentAt ? new Date(p.lastRentAt).getTime() : new Date(p.boughtAt).getTime();
            const elapsedH = Math.floor((now - last) / config_1.HOUR);
            if (elapsedH < 1)
                continue;
            const ts = getType(p.type);
            if (!ts)
                continue;
            const rent = Math.max(1, Math.floor(p.currentValue * config.propertyRentYieldBase * ts.rentMul * elapsedH));
            totalRent += rent;
            await core.dbTx(async (db) => {
                const dbAny = db;
                await dbAny.set('daily_points', { userId: key }, { points: me.points + rent });
                await dbAny.set('daily_properties', { id: p.id }, {
                    lastRentAt: new Date(now),
                    accumulatedRent: (p.accumulatedRent || 0) + rent,
                });
            });
        }
        if (totalRent === 0)
            return `您的出租房暂未到收租时间（每 ${config.propertyRentIntervalHours} 小时收一次），或者您持有的均为烂尾楼（不产生租金）。`;
        return `🏠 共收取租金 ${(0, util_1.fmtMoney)(totalRent)} 积分，已存入现金。当前现金：${(0, util_1.fmtMoney)(me.points + totalRent)}`;
    });
    // ── 命令：挂牌（P2P / 用户间交易） ──
    ctx.command('经济/房地产/挂牌 <id:number> <price:number>', '挂牌 <ID> <价格>：把您的房产挂到 P2P 市场，其他玩家可用「购房 <ID>」接盘')
        .alias('挂牌', 'guapai')
        .action(async ({ session }, id, priceArg) => {
        if (!session.userId)
            return;
        if (!config.propertyEnabled)
            return '房地产系统未开启。';
        const key = (0, util_1.userKey)(session);
        const props = await ctx.database.get('daily_properties', { id: Number(id) });
        const p = props[0];
        if (!p)
            return '找不到这套房产。';
        if (p.userId !== key)
            return '这套房不是您的。';
        if (p.status !== 'holding')
            return '这套房已卖出。';
        if (p.isDerelict)
            return `❌ #${p.id} 是烂尾楼，无法 P2P 挂牌（请走 NPC 市场「卖房 #${p.id}」回收）。`;
        if (p.listedForSale)
            return `❌ #${p.id} 已经在挂牌中（${(0, util_1.fmtMoney)(p.listedPrice)}），先「取消挂牌 #${p.id}」再操作。`;
        const price = Math.max(1, Math.floor(Number(priceArg)));
        if (!Number.isFinite(price) || price <= 0)
            return '挂牌价必须是正整数。';
        const now = Date.now();
        // 限售检查：参考卖房命令
        const zone = (await ctx.database.get('daily_property_zones', { code: p.zoneCode }))[0];
        if (zone?.haltedUntil && new Date(zone.haltedUntil).getTime() > now) {
            return `【${zone.name}】当前限售中（至 ${(0, util_1.fmtTime)(new Date(zone.haltedUntil).getTime())}），暂不能挂牌。`;
        }
        const activePolicies = await ctx.database.get('daily_property_events', { zoneCode: p.zoneCode });
        const hasSellBan = activePolicies.some((pp) => pp.type === 'policy_sell_limit' && (!pp.expiresAt || new Date(pp.expiresAt).getTime() > now));
        if (hasSellBan)
            return `【${zone.name}】当前限售新政生效中，暂不能挂牌。`;
        await ctx.database.set('daily_properties', { id: p.id }, {
            listedForSale: 1,
            listedPrice: price,
            listedAt: new Date(now),
        });
        return `🏷️ 您的 ${(getType(p.type))?.icon}${(getType(p.type))?.name}(${p.quality}品) 已挂牌：${(0, util_1.fmtMoney)(price)} 积分\n` +
            `📌 其他玩家可发送「购房 ${p.id}」以 ${(0, util_1.fmtMoney)(price)} 接盘\n` +
            `⏰ 挂牌有效期：${config.propertyListingExpiryHours} 小时（到期自动撤回）\n` +
            `💡 撤牌请发「取消挂牌 ${p.id}」`;
    });
    // ── 命令：挂牌列表 ──
    ctx.command('经济/房地产/挂牌列表', '查看 P2P 挂牌市场上所有可购买的房产')
        .alias('挂牌列表', '挂牌市场', 'marketplace')
        .action(async ({ session }) => {
        if (!session.userId)
            return;
        if (!config.propertyEnabled)
            return '房地产系统未开启。';
        const all = await ctx.database.get('daily_properties', { listedForSale: 1 });
        if (!all.length)
            return '🏷️ 当前没有 P2P 挂牌房产。';
        const zones = await ctx.database.get('daily_property_zones', {});
        const zMap = new Map(zones.map((z) => [z.code, z]));
        const lines = ['🏷️ P2P 挂牌市场：'];
        // 按挂牌时间倒序
        all.sort((a, b) => (b.listedAt ? new Date(b.listedAt).getTime() : 0) - (a.listedAt ? new Date(a.listedAt).getTime() : 0));
        const now = Date.now();
        for (const p of all) {
            const z = zMap.get(p.zoneCode);
            const ts = getType(p.type);
            if (!ts)
                continue;
            const diff = p.currentValue - p.listedPrice;
            const deltaTag = diff >= 0 ? `（市场估值 -${(0, util_1.fmtMoney)(diff)}）` : `（市场估值 +${(0, util_1.fmtMoney)(-diff)}）`;
            const expiresIn = p.listedAt ? Math.max(0, Math.floor((new Date(p.listedAt).getTime() + config.propertyListingExpiryHours * config_1.HOUR - now) / config_1.HOUR)) : 0;
            lines.push(`  #${p.id} ${ts.icon}${ts.name}(${p.quality}品) ${z?.icon || ''}${z?.name || p.zoneCode}`);
            lines.push(`     挂牌价 ${(0, util_1.fmtMoney)(p.listedPrice)} ${deltaTag}｜${expiresIn} 小时后到期｜发「购房 ${p.id}」接盘`);
        }
        lines.push('');
        lines.push(`💡 总共 ${all.length} 套挂牌｜发「购房 <ID>」接盘`);
        return lines.join('\n');
    });
    // ── 命令：购房（P2P 接盘） ──
    ctx.command('经济/房地产/购房 <id:number>', '购房 <ID>：从 P2P 挂牌市场接盘一套房产（按挂牌价成交，平台抽 2% 服务费 + 5% 交易税）')
        .alias('购房', 'goufangp2p', '买挂牌')
        .action(async ({ session }, id) => {
        if (!session.userId)
            return;
        if (!config.propertyEnabled)
            return '房地产系统未开启。';
        const key = (0, util_1.userKey)(session);
        const props = await ctx.database.get('daily_properties', { id: Number(id) });
        const p = props[0];
        if (!p)
            return '找不到这套房产。';
        if (!p.listedForSale)
            return '这套房没有挂牌出售，不能用「购房」。请走「买房 <类型> <区域> <品质>」从 NPC 市场入手。';
        if (p.userId === key)
            return '这是您自己挂牌的房。';
        if (p.status !== 'holding')
            return '这套房已卖出。';
        if (p.isDerelict)
            return '❌ 烂尾楼不能 P2P 挂牌（异常状态）。';
        const now = Date.now();
        const buyer = await core.getUser(key);
        // 限购政策（参考买房）
        const zone = (await ctx.database.get('daily_property_zones', { code: p.zoneCode }))[0];
        if (zone?.haltedUntil && new Date(zone.haltedUntil).getTime() > now) {
            return `【${zone.name}】当前限购中（至 ${(0, util_1.fmtTime)(new Date(zone.haltedUntil).getTime())}），暂不能买入。`;
        }
        const activePolicies = await ctx.database.get('daily_property_events', { zoneCode: p.zoneCode });
        const hasBuyBan = activePolicies.some((pp) => pp.type === 'policy_buy_limit' && (!pp.expiresAt || new Date(pp.expiresAt).getTime() > now));
        if (hasBuyBan)
            return `【${zone.name}】当前限购新政生效中，暂不能买入。`;
        // 上限
        const myProps = await ctx.database.get('daily_properties', { userId: key, status: 'holding' });
        if (myProps.length >= config.propertyMaxProperties) {
            return `您已持有 ${myProps.length} 套房产，达到上限 ${config.propertyMaxProperties}。先卖出一些吧。`;
        }
        const salePrice = Math.floor(p.listedPrice);
        const taxUp = activePolicies.some((pp) => pp.type === 'policy_tax_up' && (!pp.expiresAt || new Date(pp.expiresAt).getTime() > now));
        const tradeTax = config.propertyTradeTax * (taxUp ? 1.5 : 1);
        const fee = Math.floor(salePrice * config.propertyListingFee);
        const tax = Math.floor(salePrice * tradeTax);
        const totalCost = salePrice + tax + fee;
        if (buyer.points < totalCost)
            return `现金不足：成交价 ${(0, util_1.fmtMoney)(salePrice)} + 服务费 ${(0, util_1.fmtMoney)(fee)} + 税 ${(0, util_1.fmtMoney)(tax)} = ${(0, util_1.fmtMoney)(totalCost)}，您只有 ${(0, util_1.fmtMoney)(buyer.points)}。`;
        // 转账：买家付款 → 卖家得 net，平台抽 fee + tax
        await core.dbTx(async (db) => {
            const dbAny = db;
            const seller = await core.getUser(p.userId);
            const net = salePrice - tax - fee;
            await dbAny.set('daily_points', { userId: key }, { points: buyer.points - totalCost });
            await dbAny.set('daily_points', { userId: p.userId }, { points: seller.points + net });
            // 房产过户：修改 userId/listedForSale
            await dbAny.set('daily_properties', { id: p.id }, {
                userId: key,
                listedForSale: 0,
                listedPrice: 0,
                listedAt: null,
                // boughtAt 不变 (首次购买时间), boughtPrice = 当前挂牌价
                boughtPrice: salePrice,
                currentValue: Math.floor(salePrice),
                renting: 0,
                lastRentAt: new Date(now),
                accumulatedRent: 0,
            });
        });
        const ts = getType(p.type);
        const lines = [
            `🏠 P2P 交易成功！`,
            `${ts.icon}${ts.name}(${p.quality}品) 位于 ${zone?.icon || ''}${zone?.name || p.zoneCode}（#${p.id}）已过户给您`,
            `成交价：${(0, util_1.fmtMoney)(salePrice)}（税 ${(0, util_1.fmtMoney)(tax)} + 服务费 ${(0, util_1.fmtMoney)(fee)}，合计支出 ${(0, util_1.fmtMoney)(totalCost)}）`,
            `卖家（原持有）到手：${(0, util_1.fmtMoney)(salePrice - tax - fee)} 积分`,
            `剩余现金：${(0, util_1.fmtMoney)(buyer.points - totalCost)}`,
            '',
            `📌 提示：发「租房 #${p.id} 1」开启出租，或再「卖房 #${p.id}」/「挂牌 #${p.id} <价格>」转手。`,
        ];
        return lines.join('\n');
    });
    // ── 命令：取消挂牌 ──
    ctx.command('经济/房地产/取消挂牌 <id:number>', '取消挂牌 <ID>：撤下 P2P 挂牌中的房产')
        .alias('取消挂牌', '撤牌')
        .action(async ({ session }, id) => {
        if (!session.userId)
            return;
        if (!config.propertyEnabled)
            return '房地产系统未开启。';
        const key = (0, util_1.userKey)(session);
        const props = await ctx.database.get('daily_properties', { id: Number(id) });
        const p = props[0];
        if (!p)
            return '找不到这套房产。';
        if (p.userId !== key)
            return '这套房不是您的。';
        if (!p.listedForSale)
            return '这套房没有在挂牌。';
        await ctx.database.set('daily_properties', { id: p.id }, {
            listedForSale: 0,
            listedPrice: 0,
            listedAt: null,
        });
        return `✅ #${p.id} 已撤牌，恢复为私人持有状态。`;
    });
    // ── 命令：我的房产 ──
    ctx.command('经济/房地产/我的房产', '查看我持有的所有房产及当前估值')
        .alias('我的房产', 'myhouses')
        .action(async ({ session }) => {
        if (!session.userId)
            return;
        if (!config.propertyEnabled)
            return '房地产系统未开启。';
        const key = (0, util_1.userKey)(session);
        const props = await ctx.database.get('daily_properties', { userId: key }, { sort: { id: 'asc' } });
        if (!props.length)
            return '您还没买房。发送「买房 <类型> <区域> <品质>」入手您的第一套。';
        const zones = await ctx.database.get('daily_property_zones', {});
        const zMap = new Map(zones.map((z) => [z.code, z]));
        const lines = ['🏘️ 我的房产：'];
        let totalValue = 0;
        let totalCost = 0;
        let totalRent = 0;
        for (const p of props) {
            if (p.status === 'sold') {
                lines.push(`  #${p.id} ${(getType(p.type))?.icon}${(getType(p.type))?.name}(${p.quality}品) [已卖出 ${(0, util_1.fmtMoney)(p.soldPrice)}]`);
                continue;
            }
            const z = zMap.get(p.zoneCode);
            const ts = getType(p.type);
            const valueDelta = p.currentValue - p.boughtPrice;
            const rentingFlag = p.isDerelict ? '🟡烂尾楼' : (p.renting ? '🟢出租中' : '⚪空置');
            const listedFlag = p.listedForSale ? `🏷️挂牌 ${(0, util_1.fmtMoney)(p.listedPrice)}` : '';
            const flags = [rentingFlag, listedFlag].filter(Boolean).join(' ');
            lines.push(`  #${p.id} ${ts.icon}${ts.name}(${p.quality}品) ${z?.icon || ''}${z?.name || p.zoneCode} ${flags}`);
            lines.push(`     买入：${(0, util_1.fmtMoney)(p.boughtPrice)}｜现估：${(0, util_1.fmtMoney)(p.currentValue)}（${fmtPct(valueDelta / Math.max(1, p.boughtPrice))}）｜累计租金：${(0, util_1.fmtMoney)(p.accumulatedRent || 0)}`);
            totalValue += p.currentValue;
            totalCost += p.boughtPrice;
            totalRent += p.accumulatedRent || 0;
        }
        const totalDelta = totalValue - totalCost;
        lines.push('');
        lines.push(`📊 总览：持有 ${props.filter(p => p.status === 'holding').length} 套（含 ${props.filter(p => p.isDerelict).length} 套烂尾）｜市值 ${(0, util_1.fmtMoney)(totalValue)}｜成本 ${(0, util_1.fmtMoney)(totalCost)}｜浮动 ${fmtPct(totalDelta / Math.max(1, totalCost))}`);
        lines.push(`💰 累计已收租金：${(0, util_1.fmtMoney)(totalRent)}`);
        return lines.join('\n');
    });
    // ── 命令：房产市场（所有区域） ──
    ctx.command('经济/房地产/房产市场', '查看所有房产区域的当前行情')
        .alias('房产市场', 'housemarket')
        .action(async () => {
        if (!config.propertyEnabled)
            return '房地产系统未开启。';
        await tickMarket(true);
        const zones = await ctx.database.get('daily_property_zones', {});
        const lines = ['🏘️ 房产市场行情：', ''];
        for (const z of zones) {
            const change = z.currentPrice / z.basePrice - 1;
            const bubble = z.bubbleIndex.toFixed(0);
            const halted = z.haltedUntil && new Date(z.haltedUntil).getTime() > Date.now() ? '🚫限购' : '';
            const eventTag = z.lastEvent === 'bubble_crash' ? '💥泡沫破裂'
                : z.lastEvent === 'tick_up' ? '📈上涨'
                    : z.lastEvent === 'tick_down' ? '📉下跌'
                        : z.lastEvent === 'interest_up' ? '💹利率上调'
                            : z.lastEvent === 'interest_down' ? '📉利率下调'
                                : z.lastEvent === 'disaster_earthquake' ? '🌋地震'
                                    : z.lastEvent === 'disaster_flood' ? '🌊洪水'
                                        : z.lastEvent === 'policy_urban_renewal' ? '🏛️旧改'
                                            : z.lastEvent === 'policy_development_plan' ? '🏗️新区规划'
                                                : z.lastEvent === 'policy_subway_open' ? '🚇地铁'
                                                    : z.lastEvent === 'policy_special_economic' ? '💎特区'
                                                        : z.lastEvent === 'policy_demolition' ? '🚧强拆'
                                                            : z.lastEvent === 'policy_relief_cleanup' ? '🛠️烂尾整治'
                                                                : '—';
            lines.push(`${z.icon} ${z.name}（${z.code}）${halted}`);
            lines.push(`   当前均价：${(0, util_1.fmtMoney)(z.currentPrice)}｜基础价：${(0, util_1.fmtMoney)(z.basePrice)}｜涨跌：${fmtPct(change)}`);
            lines.push(`   泡沫指数：${bubble}/100${Number(bubble) >= config.propertyBubbleThreshold ? ' ⚠️濒临破裂' : ''}｜最近：${eventTag}`);
        }
        lines.push('');
        lines.push(`💡 提示：「买房 <类型> <区域> <品质>」立即下单。或「房产走势 <区域>」看 K 线。`);
        return lines.join('\n');
    });
    // ── 命令：房产走势（区域 K 线） ──
    ctx.command('经济/房地产/房产走势 <zone:string>', '查看某区域近 N 期的价格走势（K线/折线）')
        .alias('房产走势', '房产K线', 'housechart')
        .action(async ({ session }, zoneCode) => {
        if (!config.propertyEnabled)
            return '房地产系统未开启。';
        const zs = ZONES.find(z => z.code === zoneCode || z.name === zoneCode);
        if (!zs)
            return `区域只能是：${ZONES.map(z => `${z.icon}${z.name}(${z.code})`).join(' / ')}`;
        const history = await ctx.database.get('daily_property_history', { zoneCode: zs.code }, { sort: { time: 'asc' } });
        const last30 = history.slice(-30);
        const zoneLive = (await ctx.database.get('daily_property_zones', { code: zs.code }))[0];
        if (ctx.puppeteer) {
            return await ctx.puppeteer.render(buildZoneHTML(zs, zoneLive, last30));
        }
        // fallback：sparkline
        const spark = last30.map(h => h.price).join(',');
        return `${zs.icon}${zs.name} 近 ${last30.length} 期均价：\n${spark}\n提示：启用 puppeteer 插件可看图。`;
    });
    // ── 命令：政策（查看当前生效的政策/灾害） ──
    ctx.command('经济/房地产/政策', '查看当前生效的政策 / 灾害事件')
        .alias('政策', '房产政策')
        .action(async () => {
        if (!config.propertyEnabled)
            return '房地产系统未开启。';
        const events = await ctx.database.get('daily_property_events', {});
        const now = Date.now();
        const active = events.filter(e => !e.expiresAt || new Date(e.expiresAt).getTime() > now);
        if (!active.length)
            return '当前没有生效的政策或灾害事件。';
        const zones = await ctx.database.get('daily_property_zones', {});
        const zMap = new Map(zones.map((z) => [z.code, z]));
        const lines = ['📜 当前生效的政策/灾害：'];
        for (const ev of active) {
            const z = zMap.get(ev.zoneCode);
            const expires = ev.expiresAt ? (0, util_1.fmtTime)(new Date(ev.expiresAt).getTime()) : '永久';
            const tag = ev.type === 'bubble_crash' ? '💥泡沫破裂'
                : ev.type === 'policy_buy_limit' ? '🚫限购'
                    : ev.type === 'policy_sell_limit' ? '🚫限售'
                        : ev.type === 'policy_tax_up' ? '💸加税'
                            : ev.type === 'disaster_earthquake' ? '🌋地震'
                                : ev.type === 'disaster_flood' ? '🌊洪水'
                                    : ev.type === 'interest_up' ? '💹利率上调'
                                        : ev.type === 'interest_down' ? '📉利率下调'
                                            : ev.type === 'policy_urban_renewal' ? '🏛️旧改'
                                                : ev.type === 'policy_development_plan' ? '🏗️新区规划'
                                                    : ev.type === 'policy_subway_open' ? '🚇地铁开通'
                                                        : ev.type === 'policy_special_economic' ? '💎经济特区'
                                                            : ev.type === 'policy_demolition' ? '🚧强制拆迁'
                                                                : ev.type === 'policy_relief_cleanup' ? '🛠️烂尾整治'
                                                                    : ev.type;
            lines.push(`  ${z?.icon || ''}${z?.name || ev.zoneCode}｜${tag}｜${ev.message}｜到期：${expires}`);
        }
        return lines.join('\n');
    });
    // ── 命令：房地产（分组菜单） ──
    ctx.command('经济/房地产', '房地产分组菜单（买房 / 卖房 / 挂牌 / 购房 / 出租 / 收租 / 房产市场 / 政策）')
        .action(async () => {
        const zones = await ctx.database.get('daily_property_zones', {});
        const lines = [
            '🏘️ 房地产指令：',
            '  买房 <类型> <区域> [品质1-5] —— 从 NPC 市场入手（含交易税，可能买到烂尾楼）',
            '  卖房 <ID> —— 按当前估值卖给 NPC 市场（扣税）',
            '  挂牌 <ID> <价格> —— 挂到 P2P 市场等别的玩家接盘',
            '  购房 <ID> —— 接盘挂牌中的房产（按挂牌价成交 + 平台抽成 + 税）',
            '  取消挂牌 <ID> —— 撤回挂牌',
            '  挂牌列表 —— 查看 P2P 挂牌市场',
            '  租房 <ID> 1/0 —— 开启/关闭出租（自动每 N 小时收租）',
            '  收租 —— 立即收取所有出租房的租金',
            '  我的房产 —— 查看我的房产 + 估值 + 累计租金',
            '  房产市场 —— 所有区域行情速览',
            '  房产走势 <区域> —— K 线 / 折线图',
            '  政策 —— 当前生效的政策 / 升值 / 危机 事件',
            '',
            '🏠 房产类型：' + TYPES.map(t => `${t.icon}${t.name}(${t.priceMul}x)`).join(' / '),
            '🗺️ 区域：' + ZONES.map(z => `${z.icon}${z.name}(${z.code} / 基础 ${(0, util_1.fmtMoney)(z.basePrice)})`).join(' / '),
            '',
            '⚠️ 风险提示：泡沫指数 ≥ ' + config.propertyBubbleThreshold + ' 时下一次刷新必破裂；购买房产时 ' + ((config.propertyDerelictChance ?? 0.08) * 100).toFixed(0) + '% 概率买到烂尾楼（仅 ' + ((config.propertyDerelictDiscount ?? 0.5) * 100).toFixed(0) + '% 折价，禁出租、禁 P2P 转让，只能政府整治或卖给 NPC）。',
        ];
        if (zones.length) {
            lines.push('');
            lines.push('📊 当前行情：');
            for (const z of zones) {
                const change = z.currentPrice / z.basePrice - 1;
                lines.push(`  ${z.icon}${z.name}：${(0, util_1.fmtMoney)(z.currentPrice)}（${fmtPct(change)}）泡沫 ${z.bubbleIndex.toFixed(0)}/100`);
            }
        }
        return lines.join('\n');
    });
    return { ensureZones, tickMarket, collectRent, schedulePropertyUpdates };
}
/** 房产走势 HTML（折线图 + 事件标注） */
function buildZoneHTML(zone, live, hist) {
    const cur = live?.currentPrice ?? zone.basePrice;
    const bubble = live?.bubbleIndex ?? 0;
    const W = 820, H = 360;
    const padL = 80, padR = 30, padT = 50, padB = 60;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const prices = hist.map(h => h.price);
    if (!prices.length)
        return `<div style="padding:20px;color:#888">暂无数据</div>`;
    const min = Math.min(...prices, zone.basePrice) * 0.95;
    const max = Math.max(...prices, zone.basePrice) * 1.05;
    const span = max - min || 1;
    const xStep = innerW / Math.max(1, hist.length - 1);
    const points = hist.map((h, i) => {
        const x = padL + i * xStep;
        const y = padT + innerH - ((h.price - min) / span) * innerH;
        return { x, y, p: h.price, e: h.event, t: h.time };
    });
    const pathD = points.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    // 基础价水平线
    const baseY = padT + innerH - ((zone.basePrice - min) / span) * innerH;
    // Y 轴刻度（5 档）
    const yTicks = [];
    for (let i = 0; i <= 4; i++)
        yTicks.push(min + (span * i) / 4);
    const color = bubble >= 80 ? '#ef4444' : '#2563eb';
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body { margin:0; padding:0; font-family:'Microsoft YaHei',sans-serif; background:#f8fafc; }
.box { width:${W}px; padding:0; }
.title { padding:14px 20px 4px; font-size:20px; font-weight:600; color:#1e293b; border-bottom:2px solid ${color}; }
.subtitle { padding:0 20px 8px; font-size:13px; color:#64748b; }
.chart { position:relative; }
svg { display:block; }
.event-tag { fill:#fff; stroke:${color}; stroke-width:1; font-size:11px; font-family:'Microsoft YaHei',sans-serif; }
.legend { padding:0 20px 12px; font-size:12px; color:#475569; }
  </style></head><body><div class="box">
<div class="title">${zone.icon} ${zone.name} 房产走势</div>
<div class="subtitle">当前 ${cur} ｜ 基础 ${zone.basePrice} ｜ 泡沫 ${bubble.toFixed(0)}/100 ｜ ${hist.length} 期</div>
<div class="chart"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${yTicks.map((v, i) => {
        const y = padT + innerH - ((v - min) / span) * innerH;
        return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>
<text x="${padL - 8}" y="${(y + 4).toFixed(1)}" font-size="11" fill="#94a3b8" text-anchor="end" font-family="Microsoft YaHei">${Math.round(v)}</text>`;
    }).join('\n')}
<line x1="${padL}" y1="${baseY.toFixed(1)}" x2="${W - padR}" y2="${baseY.toFixed(1)}" stroke="#94a3b8" stroke-dasharray="4,3" stroke-width="1"/>
<text x="${W - padR - 5}" y="${(baseY - 4).toFixed(1)}" font-size="10" fill="#94a3b8" text-anchor="end">基础价 ${zone.basePrice}</text>
<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.5"/>
${points.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${color}" stroke="#fff" stroke-width="1"/>`).join('\n')}
${points.map(p => {
        if (p.e === 'tick_up' || p.e === 'tick_down' || p.e === 'init')
            return '';
        const tag = p.e === 'bubble_crash' ? '💥破裂'
            : p.e === 'disaster_earthquake' ? '🌋地震'
                : p.e === 'disaster_flood' ? '🌊洪水'
                    : p.e === 'interest_up' ? '💹利率'
                        : p.e === 'interest_down' ? '📉利率⬇'
                            : p.e === 'policy_buy_limit' ? '🚫限购'
                                : p.e === 'policy_sell_limit' ? '🚫限售'
                                    : p.e === 'policy_tax_up' ? '💸加税'
                                        : p.e === 'policy_halted' ? '⏸停牌'
                                            : p.e === 'policy_urban_renewal' ? '🏛️旧改'
                                                : p.e === 'policy_development_plan' ? '🏗️新区'
                                                    : p.e === 'policy_subway_open' ? '🚇地铁'
                                                        : p.e === 'policy_special_economic' ? '💎特区'
                                                            : p.e === 'policy_demolition' ? '🚧强拆'
                                                                : p.e === 'policy_relief_cleanup' ? '🛠️整治'
                                                                    : '';
        if (!tag)
            return '';
        return `<text x="${p.x.toFixed(1)}" y="${(p.y - 8).toFixed(1)}" class="event-tag" text-anchor="middle">${tag}</text>`;
    }).join('\n')}
${hist.map((h, i) => {
        if (hist.length > 12 && i % Math.ceil(hist.length / 6) !== 0)
            return '';
        const x = padL + i * xStep;
        const lbl = `${(h.time.getMonth() + 1).toString().padStart(2, '0')}-${h.time.getDate().toString().padStart(2, '0')} ${h.time.getHours().toString().padStart(2, '0')}:${h.time.getMinutes().toString().padStart(2, '0')}`;
        return `<text x="${x.toFixed(1)}" y="${(H - 30).toFixed(1)}" font-size="10" fill="#94a3b8" text-anchor="middle" font-family="Microsoft YaHei">${lbl}</text>`;
    }).join('\n')}
</svg></div>
<div class="legend">📌 虚线 = 基础价 ｜ 颜色越红泡沫越高 ｜ 💥=泡沫破裂 ｜ 🌋🌊=灾害 ｜ 💹=利率 ｜ 🚫=政策 ｜ 🏛️🏗️🚇💎=升值事件 ｜ 🚧=强拆 ｜ 🛠️=烂尾整治</div>
</div></body></html>`;
}
