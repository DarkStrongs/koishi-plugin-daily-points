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
    if (typeKey == null)
        return null;
    const k = String(typeKey).trim();
    // 兼容英文 key 与中文名（如 house / 住宅 / 豪宅），并忽略大小写
    return TYPES.find(t => t.key === k || t.name === k || t.key.toLowerCase() === k.toLowerCase()) || null;
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
    // ── 行情 每小时推进 ──
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
                    const dur = 2 + Math.floor(Math.random() * 5); // 2-6 小时
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
                    // 20% 概率仅记录不处理（避免连续几小时都处理同一批）
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
                    // 仅更新 lastRentAt 让下一次推进不会重蹈覆辙
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
        // v1.17.0：开发商/楼盘种子化（与 ensureZones 并行）
        seedDevelopersAndProjects().catch(e => logger.warn('seedDevelopersAndProjects 失败：', e.message));
        // 行情 每小时推进
        const tickMs = Math.max(1, config.propertyUpdateIntervalHours) * config_1.HOUR;
        let inFlight = false;
        ctx.setInterval(() => {
            if (inFlight)
                return;
            inFlight = true;
            Promise.all([tickMarket(), tickProjects()])
                .catch(e => logger.warn('property 每小时推进失败：', e.message))
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
    // ── 命令：买房（v1.17.0 改为 NPC 二手急售市场） ──
    ctx.command('经济/房地产/买房 <type:string> <zone:string> [quality:number]', '买房（v1.17.0 二手急售）：选 [类型] [区域] [品质1-5]，NPC 急售降价房，烂尾风险高于一手')
        .alias('买房', 'goufang', '急售买房')
        .action(async ({ session }, typeKey, zoneCode, qualityArg) => {
        if (!session.userId)
            return;
        if (!config.propertyEnabled)
            return '房地产系统未开启。';
        const ts = getType(typeKey);
        if (!ts)
            return `房产类型只能是：${TYPES.map(t => `${t.icon}${t.name}`).join(' / ')}。例如「买房 住宅 市中心 3」`;
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
        const activePolicies = await ctx.database.get('daily_property_events', { zoneCode: zs.code });
        const hasBuyBan = activePolicies.some(p => p.type === 'policy_buy_limit' && (!p.expiresAt || new Date(p.expiresAt).getTime() > now));
        if (hasBuyBan)
            return `【${zs.name}】当前限购新政生效中，暂不能买入。`;
        // 二手急售：降价 + 高烂尾率
        const resellerChance = config.propertyDevResaleDerelictChance ?? 0.20;
        const willBeDerelict = Math.random() < resellerChance;
        const derelictFactor = willBeDerelict ? config.propertyDerelictDiscount : 1;
        const resaleFactor = config.propertyDevResaleDiscount ?? 0.85;
        // 在 computeBuyPrice 基础上再叠加 resaleFactor（同时烂尾的话再叠加 derelictFactor）
        const jitter = 0.95 + Math.random() * 0.1;
        const qm = qualityMul(quality);
        const basePrice = Math.max(1, Math.floor(zone.currentPrice * ts.priceMul * qm * jitter));
        const price = Math.max(1, Math.floor(basePrice * resaleFactor * derelictFactor));
        const key = (0, util_1.userKey)(session);
        const row = await core.getUser(key);
        const myProps = await ctx.database.get('daily_properties', { userId: key, status: 'holding' });
        if (myProps.length >= config.propertyMaxProperties) {
            return `您已持有 ${myProps.length} 套房产，达到上限 ${config.propertyMaxProperties}。先卖出一些吧。`;
        }
        if (row.points < price)
            return `现金不足：${ts.icon}${ts.name}(${quality}品) 在 ${zs.name} 当前 ${(0, util_1.fmtMoney)(price)} 积分，您现金 ${(0, util_1.fmtMoney)(row.points)}。`;
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
            lines.push(`⚠️ 你从二手急售市场买到一套**烂尾楼**！${ts.icon}${ts.name}(${quality}品) 位于 ${zs.icon}${zs.name}`);
            lines.push(`成交价：${(0, util_1.fmtMoney)(price)}（含二手折扣 ${(resaleFactor * 100).toFixed(0)}% + 烂尾折扣 ${(config.propertyDerelictDiscount * 100).toFixed(0)}%）`);
            lines.push(`当前估值：${(0, util_1.fmtMoney)(price)}（市场估值 × 0.5 = ${(0, util_1.fmtMoney)(Math.floor(price * 0.5))}）`);
            lines.push(`❌ 不能出租、不能 P2P 挂牌，只能等政府烂尾整治或卖给 NPC 市场`);
        }
        else {
            lines.push(`🎉 恭喜！你从二手急售市场买到 ${ts.icon}${ts.name}(${quality}品) 位于 ${zs.icon}${zs.name}`);
            lines.push(`成交价：${(0, util_1.fmtMoney)(price)}（二手急售 ${(resaleFactor * 100).toFixed(0)}% 折｜税 ${(0, util_1.fmtMoney)(tax)}，合计 ${(0, util_1.fmtMoney)(total)}）`);
            lines.push(`当前估值：${(0, util_1.fmtMoney)(price)}`);
        }
        lines.push(`剩余现金：${(0, util_1.fmtMoney)(row.points - total)}`);
        lines.push('');
        lines.push(`📌 提示：v1.17.0 起更推荐「开盘购买 <户型ID>」从一手新盘入手（更便宜、户型明确、可挑选小区/楼栋/朝向）；或者「投资楼盘 <项目ID>」参与楼盘前期投资获取开盘优先权 + 折扣 + 竣工分红。`);
        lines.push(`⚠️ 当前 ${zs.name} 泡沫指数：${zone.bubbleIndex.toFixed(0)}/100`);
        return lines.join('\n');
    });
    // ════════════════════════════════════════════════════════
    //   v1.17.0 开发商 / 楼盘 / 户型 / 投资 核心引擎
    // ════════════════════════════════════════════════════════
    // ── 开发商种子 ──
    async function seedDevelopersAndProjects() {
        if (!config.propertyDevEnabled)
            return;
        const now = new Date();
        // 1. 开发商种子
        const devs = await ctx.database.get('daily_property_developers', {});
        const have = new Set(devs.map(d => d.code));
        for (const d of DEVELOPERS) {
            if (have.has(d.code))
                continue;
            await ctx.database.create('daily_property_developers', {
                code: d.code,
                name: d.name,
                icon: d.icon,
                brand: d.brand,
                specialty: JSON.stringify(d.specialty),
                reputation: d.baseReputation,
                totalProjects: 0,
                completedProjects: 0,
                createdAt: now,
                updatedAt: now,
            });
        }
        // 2. 楼盘种子：每个开发商维护 2-3 个活跃项目
        const projects = await ctx.database.get('daily_property_projects', {});
        const allZones = await ctx.database.get('daily_property_zones', {});
        if (!allZones.length)
            return; // 区域尚未初始化
        for (const dev of DEVELOPERS) {
            const myActive = projects.filter(p => p.developerCode === dev.code
                && ['planning', 'building', 'presale', 'sold_out'].includes(p.status));
            if (myActive.length >= 3)
                continue;
            // 缺少几个补几个
            const need = Math.max(0, 2 + Math.floor(Math.random() * 2) - myActive.length); // 目标 2-3
            for (let i = 0; i < need; i++) {
                // 选专长户型
                const type = pickOne(dev.specialty);
                // 选区域（避开当前已有同开发商同区域的项目）
                const usedZones = new Set(projects.filter(p => p.developerCode === dev.code).map(p => p.zoneCode));
                const candidates = allZones.filter(z => !usedZones.has(z.code));
                if (!candidates.length)
                    break;
                const zone = pickOne(candidates);
                await createNewProject(dev, zone, type, now);
            }
        }
    }
    /** 创建一个新楼盘（用于种子 + 楼盘每周期推进时主动补新项目） */
    async function createNewProject(dev, zone, typeKey, now) {
        const ts = getType(typeKey) || getType('house');
        const zoneCurrent = zone.currentPrice || zone.basePrice;
        // 楼盘系数：luxury × 1.4 / mid × 1.0 / economy × 0.8
        const brandMul = dev.brand === 'luxury' ? 1.4 : dev.brand === 'mid' ? 1.0 : 0.8;
        const basePrice = Math.floor(zoneCurrent * ts.priceMul * 0.65 * brandMul); // 楼盘单价 = 区域均价 × 类型系数 × 0.65 × 品牌
        // 总套数：经济型多 / 豪宅少
        const totalUnits = dev.brand === 'luxury' ? clampInt(8 + Math.random() * 8, 6, 16)
            : dev.brand === 'mid' ? clampInt(12 + Math.random() * 12, 10, 24)
                : clampInt(16 + Math.random() * 14, 12, 30);
        // 启动资金 = 总套数 × 总价 × 资金占比 30%（开发商自筹 70%）
        const sampleUnitPrice = basePrice * 90; // 90 ㎡ 样板
        const fundingRequired = Math.floor(totalUnits * sampleUnitPrice * 0.30);
        // 品质：luxury 3-5 / mid 2-4 / economy 1-3
        const qMin = dev.brand === 'luxury' ? 3 : dev.brand === 'mid' ? 2 : 1;
        const qMax = dev.brand === 'luxury' ? 5 : dev.brand === 'mid' ? 4 : 3;
        const quality = qMin + Math.floor(Math.random() * (qMax - qMin + 1));
        // 项目名（不重复）
        const namePool = PROJECT_NAMES[dev.brand];
        const existingNames = new Set((await ctx.database.get('daily_property_projects', {})).map(p => p.name));
        let pname = pickOne(namePool);
        let suffix = 0;
        while (existingNames.has(pname)) {
            suffix++;
            pname = `${pickOne(namePool)}${suffix}期`;
        }
        // 编号：P-YYYY-NNN
        const yearCode = now.getFullYear();
        const allExist = await ctx.database.get('daily_property_projects', {});
        const yearCount = allExist.filter(p => p.code.startsWith(`P-${yearCode}-`)).length;
        const code = `P-${yearCode}-${String(yearCount + 1).padStart(3, '0')}`;
        // 阶段：30% 概率直接 building / 70% 概率 planning
        const startBuilding = Math.random() < 0.3;
        const planningTicks = Math.max(1, config.propertyDevPlanningTicks + Math.floor(Math.random() * 2) - 1);
        const buildingTicks = Math.max(1, config.propertyDevBuildingTicks + Math.floor(Math.random() * 4) - 2);
        const status = startBuilding ? 'building' : 'planning';
        const statusTickLeft = startBuilding ? buildingTicks : planningTicks;
        const row = await ctx.database.create('daily_property_projects', {
            code,
            name: pname,
            developerCode: dev.code,
            zoneCode: zone.code,
            type: typeKey,
            quality,
            totalUnits,
            remainingUnits: totalUnits,
            basePrice,
            fundingRequired,
            fundingCollected: 0,
            expectedReturn: config.propertyDevReturnMin + Math.random() * (config.propertyDevReturnMax - config.propertyDevReturnMin),
            status,
            statusTickLeft,
            startedAt: startBuilding ? now : null,
            openedAt: null,
            completedAt: null,
            createdAt: now,
            updatedAt: now,
        });
        // 开发商承接数 +1
        await ctx.database.set('daily_property_developers', { code: dev.code }, {
            totalProjects: ((await ctx.database.get('daily_property_developers', { code: dev.code }))[0]?.totalProjects || 0) + 1,
            updatedAt: now,
        });
        return Array.isArray(row) ? row[0] : row;
    }
    // ── 楼盘 每小时推进：推进阶段 / 判定烂尾 / 自动开盘 / 竣工分红 ──
    let projectTickInFlight = false;
    async function tickProjects(force = false) {
        if (!config.propertyDevEnabled)
            return null;
        if (projectTickInFlight)
            return null;
        projectTickInFlight = true;
        try {
            const now = new Date();
            const projects = await ctx.database.get('daily_property_projects', {});
            const devs = await ctx.database.get('daily_property_developers', {});
            const dMap = new Map(devs.map(d => [d.code, d]));
            const events = [];
            for (const p of projects) {
                // 1) 烂尾判定（仅 planning/building）
                if (['planning', 'building'].includes(p.status)) {
                    const dev = dMap.get(p.developerCode);
                    // 信誉越高 → 烂尾概率越低（信誉 100 = 概率 × 0.4，信誉 0 = 概率 × 1.6）
                    const repFactor = dev ? Math.max(0.4, 1.6 - dev.reputation / 100) : 1.0;
                    const derelictChance = (config.propertyDevDerelictChance ?? 0.04) * repFactor;
                    if (Math.random() < derelictChance) {
                        await markProjectDerelict(p, now, events);
                        continue;
                    }
                }
                // 2) 阶段推进
                if (p.status === 'planning') {
                    if (p.statusTickLeft <= 1) {
                        // → building
                        await ctx.database.set('daily_property_projects', { id: p.id }, {
                            status: 'building',
                            statusTickLeft: Math.max(1, config.propertyDevBuildingTicks + Math.floor(Math.random() * 4) - 2),
                            startedAt: now,
                            updatedAt: now,
                        });
                    }
                    else {
                        await ctx.database.set('daily_property_projects', { id: p.id }, {
                            statusTickLeft: p.statusTickLeft - 1,
                            updatedAt: now,
                        });
                    }
                }
                else if (p.status === 'building') {
                    if (p.statusTickLeft <= 1) {
                        // → presale 并生成户型
                        await openProject(p, now, events);
                    }
                    else {
                        await ctx.database.set('daily_property_projects', { id: p.id }, {
                            statusTickLeft: p.statusTickLeft - 1,
                            updatedAt: now,
                        });
                    }
                }
                else if (p.status === 'presale') {
                    // 检查是否售罄
                    if (p.remainingUnits <= 0) {
                        await ctx.database.set('daily_property_projects', { id: p.id }, {
                            status: 'sold_out',
                            statusTickLeft: Math.max(1, Math.floor(config.propertyDevPresaleTicks / 4)), // 售罄后等 N 小时 进入竣工
                            updatedAt: now,
                        });
                        events.push(`🏁 [${p.code} ${p.name}] 已售罄，进入竣工等待`);
                    }
                    else {
                        // 推进：投资者优先窗口 小时数递减
                        const newLeft = Math.max(0, p.statusTickLeft - 1);
                        await ctx.database.set('daily_property_projects', { id: p.id }, {
                            statusTickLeft: newLeft,
                            updatedAt: now,
                        });
                        // 超期：若 remainingUnits 长期未动，触发自动售罄判定（> presaleTicks × 1.5 视为失败）
                        // 这里简化：让玩家主动买，自动售罄通过剩余单位为 0 时触发
                    }
                }
                else if (p.status === 'sold_out') {
                    if (p.statusTickLeft <= 1) {
                        // → completed 并分红
                        await completeProject(p, now, events);
                    }
                    else {
                        await ctx.database.set('daily_property_projects', { id: p.id }, {
                            statusTickLeft: p.statusTickLeft - 1,
                            updatedAt: now,
                        });
                    }
                }
            }
            // 3) 主动补新项目：每个开发商维持 2-3 个活跃楼盘
            await seedDevelopersAndProjects();
            // 4) 广播
            if (events.length) {
                const msg = events.join('\n');
                logger.info('楼盘更新：\n' + msg);
                await core.broadcast(`🏗️ 楼盘市场异动：\n${msg}`);
            }
            return { events };
        }
        catch (e) {
            logger.warn('楼盘每周期推进异常：', e.message);
            return null;
        }
        finally {
            projectTickInFlight = false;
        }
    }
    /** 开盘：生成户型 + 设置 presale 状态 */
    async function openProject(p, now, events) {
        const dev = (await ctx.database.get('daily_property_developers', { code: p.developerCode }))[0];
        const ts = getType(p.type);
        if (!ts || !dev)
            return;
        // 决定生成几个户型（开盘先放 50%，之后随时间释放）
        const totalUnits = p.totalUnits;
        const initialUnits = Math.max(4, Math.floor(totalUnits * 0.5));
        const layouts = LAYOUTS_BY_TYPE[p.type] || LAYOUTS_BY_TYPE.house;
        // 楼栋数 = ceil(totalUnits / 单栋套数)
        const perBuilding = 6;
        const buildingCount = Math.ceil(totalUnits / perBuilding);
        const usedBuildings = BUILDING_LETTERS.slice(0, buildingCount);
        let unitCount = 0;
        for (const b of usedBuildings) {
            if (unitCount >= initialUnits)
                break;
            const inBuilding = Math.min(perBuilding, initialUnits - unitCount);
            for (let i = 0; i < inBuilding; i++) {
                const floor = 2 + Math.floor(Math.random() * 28); // 2-30 层
                const area = 60 + Math.floor(Math.random() * 90); // 60-150 ㎡
                const facing = pickFacing();
                const layout = pickOne(layouts);
                // 品质 = 楼盘基础品质 ± 1（夹紧 1-5）
                const qOffset = Math.floor(Math.random() * 3) - 1; // -1, 0, 1
                const unitQ = clampInt(p.quality + qOffset, 1, 5);
                const qMul = qualityMul(unitQ);
                // 总价 = 楼盘单价 × 面积 × 朝向 × 品质
                const price = Math.max(1, Math.floor(p.basePrice * area * facing.mul * qMul));
                const unitNo = `${floor.toString().padStart(2, '0')}${1 + Math.floor(Math.random() * 4)}`;
                await ctx.database.create('daily_property_units', {
                    projectId: p.id,
                    building: b,
                    unitNumber: `${b}-${unitNo}`,
                    floor,
                    area: Math.floor(area),
                    facing: facing.code,
                    layout,
                    quality: unitQ,
                    price,
                    status: 'available',
                    reservedFor: null,
                    buyerUserId: null,
                    soldAt: null,
                    createdAt: now,
                });
                unitCount++;
            }
        }
        await ctx.database.set('daily_property_projects', { id: p.id }, {
            status: 'presale',
            statusTickLeft: config.propertyDevPresalePriorityTicks,
            openedAt: now,
            updatedAt: now,
        });
        events.push(`🎉 [${dev.icon}${dev.name}] 新盘开盘：${p.name}(${p.code}) ${p.totalUnits} 套｜${ts.icon}${ts.name}｜单价 ${(0, util_1.fmtMoney)(p.basePrice)}/㎡`);
    }
    /** 项目烂尾：投资者按 refundRate 退款 */
    async function markProjectDerelict(p, now, events) {
        const investments = await ctx.database.get('daily_property_investments', { projectId: p.id, status: 'active' });
        const refundRate = config.propertyDevDerelictRefundRate ?? 0.5;
        let totalRefund = 0;
        for (const inv of investments) {
            const refund = Math.floor(inv.amount * refundRate);
            totalRefund += refund;
            await core.dbTx(async (db) => {
                const dbAny = db;
                const uRow = await core.getUser(inv.userId);
                if (uRow) {
                    await dbAny.set('daily_points', { userId: inv.userId }, { points: uRow.points + refund });
                }
                await dbAny.set('daily_property_investments', { id: inv.id }, {
                    status: 'refunded',
                    payout: refund,
                    settledAt: now,
                });
            });
        }
        await ctx.database.set('daily_property_projects', { id: p.id }, {
            status: 'derelict',
            statusTickLeft: 0,
            updatedAt: now,
        });
        const dev = (await ctx.database.get('daily_property_developers', { code: p.developerCode }))[0];
        events.push(`💥 [${dev?.icon || ''}${dev?.name || p.developerCode}] ${p.name}(${p.code}) **烂尾**！${investments.length} 位投资者共退回 ${(0, util_1.fmtMoney)(totalRefund)}（按 ${(refundRate * 100).toFixed(0)}% 退还）`);
    }
    /** 项目竣工：结算分红 + 开发商信誉调整 */
    async function completeProject(p, now, events) {
        const investments = await ctx.database.get('daily_property_investments', { projectId: p.id, status: 'active' });
        // 分红池 = 已投资 × 实际回报率（在 min..max 之间，按品牌信誉调整）
        const dev = (await ctx.database.get('daily_property_developers', { code: p.developerCode }))[0];
        const repFactor = dev ? (dev.reputation / 100) : 0.5;
        const returnRate = config.propertyDevReturnMin + repFactor * (config.propertyDevReturnMax - config.propertyDevReturnMin);
        const pool = Math.floor(p.fundingCollected * returnRate);
        let totalPaid = 0;
        for (const inv of investments) {
            const share = p.fundingCollected > 0 ? inv.amount / p.fundingCollected : 0;
            const payout = Math.floor(pool * share);
            totalPaid += payout;
            await core.dbTx(async (db) => {
                const dbAny = db;
                const uRow = await core.getUser(inv.userId);
                if (uRow) {
                    await dbAny.set('daily_points', { userId: inv.userId }, { points: uRow.points + payout });
                }
                await dbAny.set('daily_property_investments', { id: inv.id }, {
                    status: 'collected',
                    payout,
                    settledAt: now,
                });
            });
        }
        // 开发商信誉 +/- （取决于投资者比例）
        const investorCount = investments.length;
        const totalUnits = p.totalUnits;
        const soldRatio = 1; // 售罄完成 = 100%
        let repDelta = 0;
        if (investorCount === 0)
            repDelta = -3;
        else if (investorCount >= 5)
            repDelta = +3;
        if (soldRatio >= 0.99)
            repDelta += 1;
        await ctx.database.set('daily_property_developers', { code: p.developerCode }, {
            completedProjects: (dev?.completedProjects || 0) + 1,
            reputation: Math.max(0, Math.min(100, (dev?.reputation || 50) + repDelta)),
            updatedAt: now,
        });
        await ctx.database.set('daily_property_projects', { id: p.id }, {
            status: 'completed',
            statusTickLeft: 0,
            completedAt: now,
            updatedAt: now,
        });
        events.push(`🏆 [${dev?.icon || ''}${dev?.name || p.developerCode}] ${p.name}(${p.code}) **竣工**！${investorCount} 位投资者共分红 ${(0, util_1.fmtMoney)(totalPaid)}（回报率 ${(returnRate * 100).toFixed(1)}%）`);
    }
    // ── 命令：开发商列表 ──
    ctx.command('经济/房地产/开发商', '查看所有开发商的品牌、专长、信誉、在建楼盘数')
        .alias('开发商', '开发商列表', 'propertydevs')
        .action(async () => {
        if (!config.propertyEnabled)
            return '房地产系统未开启。';
        if (!config.propertyDevEnabled)
            return '楼盘开发系统未启用（旧版 NPC 市场）。';
        const devs = await ctx.database.get('daily_property_developers', {});
        if (!devs.length)
            await seedDevelopersAndProjects();
        const allProjects = await ctx.database.get('daily_property_projects', {});
        const lines = ['🏗️ 开发商一览：', ''];
        for (const d of devs) {
            let spec = [];
            try {
                spec = JSON.parse(d.specialty);
            }
            catch {
                spec = [];
            }
            const specNames = spec.map(s => getType(s)?.icon + (getType(s)?.name || s)).join(' / ');
            const activeCount = allProjects.filter(p => p.developerCode === d.code
                && ['planning', 'building', 'presale', 'sold_out'].includes(p.status)).length;
            const brandTag = d.brand === 'luxury' ? '🏆豪宅' : d.brand === 'mid' ? '🏠中端' : '🏘️经济';
            const repColor = d.reputation >= 70 ? '🟢' : d.reputation >= 50 ? '🟡' : '🔴';
            lines.push(`${d.icon} ${d.name} [${brandTag}] ${repColor}信誉 ${d.reputation.toFixed(0)}/100`);
            lines.push(`   专长户型：${specNames || '通用'}`);
            lines.push(`   在建/开盘：${activeCount} 个｜累计竣工 ${d.completedProjects}｜累计承接 ${d.totalProjects}`);
        }
        lines.push('');
        lines.push(`💡 输入「楼盘」查看当前开盘的可投资 / 可购买楼盘；输入「开发商 <代号>」查看某家详情。`);
        return lines.join('\n');
    });
    // ── 命令：开发商详情 ──
    ctx.command('经济/房地产/开发商详情 <code:string>', '开发商详情：查看其所有楼盘（含历史）')
        .alias('开发商详情')
        .action(async ({ session }, code) => {
        if (!config.propertyEnabled || !config.propertyDevEnabled)
            return '系统未启用。';
        const devs = await ctx.database.get('daily_property_developers', { code });
        const d = devs[0];
        if (!d) {
            // 按名搜
            const all = await ctx.database.get('daily_property_developers', {});
            const found = all.find(x => x.name.includes(code) || x.code === code);
            if (!found)
                return `找不到开发商「${code}」。发「开发商」查看列表。`;
            return detailDeveloper(found);
        }
        return detailDeveloper(d);
    });
    async function detailDeveloper(d) {
        let spec = [];
        try {
            spec = JSON.parse(d.specialty);
        }
        catch {
            spec = [];
        }
        const specNames = spec.map(s => getType(s)?.icon + (getType(s)?.name || s)).join(' / ');
        const brandTag = d.brand === 'luxury' ? '🏆豪宅系' : d.brand === 'mid' ? '🏠中端系' : '🏘️经济系';
        const allProjects = await ctx.database.get('daily_property_projects', { developerCode: d.code });
        const lines = [
            `${d.icon} ${d.name} [${brandTag}] 信誉 ${d.reputation.toFixed(0)}/100`,
            `专长户型：${specNames || '通用'}`,
            `累计承接：${d.totalProjects} 个楼盘｜竣工：${d.completedProjects}`,
            '',
            '📋 该开发商的所有楼盘：',
        ];
        const statusName = {
            planning: '📝规划中', building: '🏗️施工中', presale: '🏪开盘中',
            sold_out: '🏁已售罄', completed: '✅已竣工', derelict: '💥烂尾',
        };
        for (const p of allProjects.slice(0, 10)) {
            const z = (await ctx.database.get('daily_property_zones', { code: p.zoneCode }))[0];
            const ts = getType(p.type);
            lines.push(`  ${p.code} ${p.name} [${statusName[p.status] || p.status}]`);
            lines.push(`     ${z?.icon || ''}${z?.name || p.zoneCode}｜${ts?.icon || ''}${ts?.name || p.type}｜剩余 ${p.remainingUnits}/${p.totalUnits}｜单价 ${(0, util_1.fmtMoney)(p.basePrice)}/㎡`);
        }
        return lines.join('\n');
    }
    // ── 命令：楼盘列表（在售楼盘） ──
    ctx.command('经济/房地产/楼盘', '查看当前所有可投资 / 开盘中的楼盘')
        .alias('楼盘', '在售楼盘', '楼盘列表', 'propertyprojects')
        .action(async () => {
        if (!config.propertyEnabled || !config.propertyDevEnabled)
            return '系统未启用。';
        const projects = await ctx.database.get('daily_property_projects', {});
        if (!projects.length)
            await seedDevelopersAndProjects();
        const visible = projects.filter(p => ['planning', 'building', 'presale', 'sold_out'].includes(p.status));
        if (!visible.length)
            return '当前没有活跃楼盘。稍后再试。';
        const devs = await ctx.database.get('daily_property_developers', {});
        const dMap = new Map(devs.map(d => [d.code, d]));
        const zones = await ctx.database.get('daily_property_zones', {});
        const zMap = new Map(zones.map(z => [z.code, z]));
        const lines = ['🏗️ 楼盘列表：', ''];
        const statusTag = {
            planning: '📝规划',
            building: '🏗️施工',
            presale: '🔴开盘',
            sold_out: '🏁售罄',
        };
        // 按状态分组
        const grouped = { presale: [], building: [], planning: [], sold_out: [] };
        for (const p of visible)
            (grouped[p.status] || (grouped[p.status] = [])).push(p);
        for (const status of ['presale', 'building', 'planning', 'sold_out']) {
            if (!grouped[status] || !grouped[status].length)
                continue;
            lines.push(`【${statusTag[status]}】`);
            for (const p of grouped[status]) {
                const d = dMap.get(p.developerCode);
                const z = zMap.get(p.zoneCode);
                const ts = getType(p.type);
                const fundingRatio = p.fundingRequired > 0 ? (p.fundingCollected / p.fundingRequired * 100).toFixed(0) : '0';
                lines.push(`  ${p.code} ${d?.icon || ''}${d?.name || p.developerCode}·${p.name}`);
                lines.push(`     ${z?.icon || ''}${z?.name || p.zoneCode}｜${ts?.icon || ''}${ts?.name || p.type}｜单价 ${(0, util_1.fmtMoney)(p.basePrice)}/㎡｜剩余 ${p.remainingUnits}/${p.totalUnits}`);
                if (['planning', 'building'].includes(p.status)) {
                    lines.push(`     💰 启动资金 ${(0, util_1.fmtMoney)(p.fundingRequired)}（已募 ${fundingRatio}%）｜预期回报 ${(p.expectedReturn * 100).toFixed(0)}%｜输入「投资楼盘 ${p.id}」参与`);
                }
                else if (p.status === 'presale') {
                    const prioLeft = p.statusTickLeft;
                    lines.push(`     🏪 开盘中｜${p.totalUnits} 套｜投资者优先窗口剩 ${prioLeft} 小时｜输入「楼盘详情 ${p.id}」看户型`);
                }
                else if (p.status === 'sold_out') {
                    lines.push(`     🏁 售罄｜等待竣工`);
                }
            }
            lines.push('');
        }
        lines.push(`💡 输入「楼盘详情 <项目ID>」看具体楼盘的开发商、地块、户型列表、已投资人数。`);
        lines.push(`💡 输入「投资楼盘 <项目ID>」投资规划中/施工中的楼盘（开盘优先权 + 折扣 + 竣工分红）。`);
        return lines.join('\n');
    });
    // ── 命令：楼盘详情 ──
    ctx.command('经济/房地产/楼盘详情 <id:number>', '查看楼盘详情：开发商 / 地块 / 户型列表 / 已投资人数')
        .alias('楼盘详情')
        .action(async ({ session }, idStr) => {
        if (!config.propertyEnabled || !config.propertyDevEnabled)
            return '系统未启用。';
        const id = Number(idStr);
        if (!Number.isFinite(id))
            return '楼盘 ID 必须是数字。发「楼盘」看列表。';
        const p = (await ctx.database.get('daily_property_projects', { id }))[0];
        if (!p)
            return `找不到楼盘 #${id}。`;
        const d = (await ctx.database.get('daily_property_developers', { code: p.developerCode }))[0];
        const z = (await ctx.database.get('daily_property_zones', { code: p.zoneCode }))[0];
        const ts = getType(p.type);
        const investments = await ctx.database.get('daily_property_investments', { projectId: p.id, status: 'active' });
        const statusName = {
            planning: '📝规划中', building: '🏗️施工中', presale: '🏪开盘中',
            sold_out: '🏁已售罄', completed: '✅已竣工', derelict: '💥烂尾',
        };
        const totalInvest = investments.reduce((s, x) => s + x.amount, 0);
        const investorCount = investments.length;
        const myKey = (0, util_1.userKey)(session);
        const myInvest = investments.find(x => x.userId === myKey);
        const myShare = myInvest ? myInvest.amount : 0;
        const myRatio = p.fundingRequired > 0 ? (myShare / p.fundingRequired * 100).toFixed(1) : '0.0';
        const lines = [
            `${d?.icon || ''}${d?.name || p.developerCode}·${p.name}  [${p.code}]`,
            `状态：${statusName[p.status] || p.status}（剩 ${p.statusTickLeft} 小时）`,
            `地块：${z?.icon || ''}${z?.name || p.zoneCode}｜户型：${ts?.icon || ''}${ts?.name || p.type}｜基础品质 ${p.quality}`,
            `单价：${(0, util_1.fmtMoney)(p.basePrice)}/㎡｜总套数 ${p.totalUnits}｜剩余 ${p.remainingUnits}`,
            '',
            '💰 投资情况：',
            `   启动资金：${(0, util_1.fmtMoney)(p.fundingRequired)}｜已募集：${(0, util_1.fmtMoney)(totalInvest)}（${(p.fundingRequired > 0 ? totalInvest / p.fundingRequired * 100 : 0).toFixed(0)}%）`,
            `   投资者人数：${investorCount}｜预期回报率：${(p.expectedReturn * 100).toFixed(0)}%`,
        ];
        if (myInvest) {
            lines.push(`   📌 您已投资 ${(0, util_1.fmtMoney)(myShare)}（占 ${myRatio}%）`);
        }
        lines.push('');
        lines.push('🏘️ 户型 / 楼栋（开盘中可见）：');
        const units = await ctx.database.get('daily_property_units', { projectId: p.id });
        if (!units.length) {
            lines.push('   （开盘时才会生成户型）');
        }
        else {
            // 按楼栋分组
            const byBuilding = {};
            for (const u of units) {
                if (!byBuilding[u.building])
                    byBuilding[u.building] = [];
                byBuilding[u.building].push(u);
            }
            const buildingList = Object.keys(byBuilding).sort();
            for (const b of buildingList.slice(0, 4)) { // 最多展示 4 个楼栋
                const us = byBuilding[b];
                const available = us.filter(u => u.status === 'available').length;
                const sold = us.filter(u => u.status === 'sold').length;
                const reserved = us.filter(u => u.status === 'reserved').length;
                lines.push(`  📦 ${b}栋（${available} 可售｜${reserved} 预留｜${sold} 已售）：`);
                for (const u of us.slice(0, 5)) {
                    const statusTag = u.status === 'available' ? '🟢'
                        : u.status === 'reserved' ? '🟡' : '🔴';
                    const facingInfo = FACING_TABLE.find(f => f.code === u.facing);
                    lines.push(`     ${statusTag} #${u.id} ${u.unitNumber} ${u.layout} ${u.area}㎡ ${facingInfo?.label || u.facing} ${u.quality}品 ${(0, util_1.fmtMoney)(u.price)}`);
                }
                if (us.length > 5)
                    lines.push(`     ... 还有 ${us.length - 5} 套（发「楼盘详情 ${id}」翻不到，建议直接用「开盘购买 #户型ID」）`);
            }
            if (buildingList.length > 4)
                lines.push(`  📦 ...还有 ${buildingList.length - 4} 个楼栋未列出`);
        }
        lines.push('');
        if (['planning', 'building'].includes(p.status)) {
            lines.push(`💡 操作：发「投资楼盘 ${id}」参与楼盘前期投资（开盘优先权 + 投资者折扣 + 竣工分红）。`);
        }
        else if (p.status === 'presale') {
            lines.push(`💡 操作：发「开盘购买 <户型ID>」直接买具体户型。`);
            if (myInvest && p.statusTickLeft > 0) {
                lines.push(`⭐ 您已投资，享有 ${(p.statusTickLeft)} 小时 优先窗口 + 投资者折扣 ${((1 - config.propertyDevInvestorDiscount) * 100).toFixed(0)}%。`);
            }
            else if (p.statusTickLeft > 0) {
                lines.push(`⏰ 当前仅对投资者开放（剩 ${p.statusTickLeft} 小时）。非投资者请先「投资楼盘」。`);
            }
        }
        return lines.join('\n');
    });
    // ── 命令：投资楼盘 ──
    ctx.command('经济/房地产/投资楼盘 <id:number> [tier:number]', '投资楼盘 <项目ID> [档位1/2/3]：选档位(1=小额,2=中额,3=大额)，系统按楼盘规模配份额')
        .alias('投资楼盘', '楼盘投资', 'devinvest')
        .action(async ({ session }, idStr, tierArg) => {
        if (!session.userId)
            return;
        if (!config.propertyEnabled || !config.propertyDevEnabled)
            return '系统未启用。';
        const id = Number(idStr);
        const tier = clampInt(Number(tierArg) || 1, 1, config.propertyDevInvestmentTiers.length);
        const amount = config.propertyDevInvestmentTiers[tier - 1];
        if (!amount)
            return `投资档位无效（1~${config.propertyDevInvestmentTiers.length}）。`;
        const p = (await ctx.database.get('daily_property_projects', { id }))[0];
        if (!p)
            return `找不到楼盘 #${id}。`;
        if (!['planning', 'building'].includes(p.status)) {
            return `「${p.name}」当前状态为「${p.status}」，不可投资（仅规划中 / 施工中的楼盘可投资）。`;
        }
        // 每日投资次数限制
        const todayKey = new Date().toISOString().slice(0, 10);
        const todayInvests = await ctx.database.get('daily_property_investments', { userId: (0, util_1.userKey)(session), investedAt: { $gte: new Date(todayKey + 'T00:00:00') } });
        if (todayInvests.length >= config.propertyDevInvestDailyLimit) {
            return `今日已投资 ${todayInvests.length} 次，达到单日上限 ${config.propertyDevInvestDailyLimit}。`;
        }
        // 同楼盘不能重复投（除非上一笔已 refunded/collected）
        const exist = await ctx.database.get('daily_property_investments', { userId: (0, util_1.userKey)(session), projectId: p.id });
        const activeExist = exist.find(x => x.status === 'active');
        if (activeExist)
            return `您已投资过本楼盘（${(0, util_1.fmtMoney)(activeExist.amount)}）。同一楼盘不可重复投资。`;
        // 资金校验
        const key = (0, util_1.userKey)(session);
        const row = await core.getUser(key);
        if (row.points < amount)
            return `现金不足：档位 ${tier} = ${(0, util_1.fmtMoney)(amount)}，您现金 ${(0, util_1.fmtMoney)(row.points)}。`;
        // 份额
        const shareRatio = p.fundingRequired > 0 ? amount / p.fundingRequired : 0;
        const now = new Date();
        await core.dbTx(async (db) => {
            const dbAny = db;
            await dbAny.set('daily_points', { userId: key }, { points: row.points - amount });
            await dbAny.create('daily_property_investments', {
                userId: key,
                projectId: p.id,
                amount,
                shareRatio,
                investedAt: now,
                status: 'active',
                payout: 0,
                settledAt: null,
            });
            await dbAny.set('daily_property_projects', { id: p.id }, {
                fundingCollected: p.fundingCollected + amount,
                updatedAt: now,
            });
        });
        return [
            `🏗️ 投资成功！`,
            `楼盘：${p.name}（${p.code}）`,
            `档位：${tier}（${(0, util_1.fmtMoney)(amount)}）｜占项目份额 ${(shareRatio * 100).toFixed(2)}%`,
            `剩余现金：${(0, util_1.fmtMoney)(row.points - amount)}`,
            ``,
            `📌 您将获得：`,
            `  ⭐ 开盘优先权（开盘后 ${config.propertyDevPresalePriorityTicks} 小时内按投资额排名优先挑选户型）`,
            `  💸 投资者购房折扣 ${((1 - config.propertyDevInvestorDiscount) * 100).toFixed(0)}%（开盘购买时自动应用）`,
            `  💰 竣工后分红（${(p.expectedReturn * 100).toFixed(0)}% 预期回报率）`,
            ``,
            `⚠️ 风险：项目在竣工前有 ${((config.propertyDevDerelictChance ?? 0.04) * 100).toFixed(1)}% 概率/小时 烂尾，烂尾按 ${((config.propertyDevDerelictRefundRate ?? 0.5) * 100).toFixed(0)}% 退款。`,
        ].join('\n');
    });
    // ── 命令：我的投资 ──
    ctx.command('经济/房地产/我的投资', '查看我的所有投资记录及预期回报')
        .alias('我的投资', 'myinvests')
        .action(async ({ session }) => {
        if (!session.userId)
            return;
        if (!config.propertyEnabled || !config.propertyDevEnabled)
            return '系统未启用。';
        const key = (0, util_1.userKey)(session);
        const investments = await ctx.database.get('daily_property_investments', { userId: key });
        if (!investments.length)
            return '您还没投资过任何楼盘。发「楼盘」看可投资项目。';
        const projects = await ctx.database.get('daily_property_projects', {});
        const pMap = new Map(projects.map((p) => [p.id, p]));
        const lines = ['💼 我的投资记录：', ''];
        let totalActive = 0, totalPayout = 0;
        for (const inv of investments) {
            const p = pMap.get(inv.projectId);
            const statusTag = inv.status === 'active' ? '🟢进行中'
                : inv.status === 'collected' ? '✅已分红'
                    : inv.status === 'refunded' ? '🔴烂尾退款'
                        : inv.status;
            const projectTag = p ? `${p.code} ${p.name}` : `#${inv.projectId}`;
            const statusName = p ? p.status : inv.status;
            lines.push(`  ${statusTag} ${projectTag}（${(0, util_1.fmtMoney)(inv.amount)}）`);
            if (inv.status === 'active' && p) {
                const expPayout = Math.floor(p.fundingCollected * p.expectedReturn * (p.fundingCollected > 0 ? inv.amount / p.fundingCollected : 0));
                lines.push(`     状态：${statusName}｜预期分红：${(0, util_1.fmtMoney)(expPayout)}`);
                totalActive += inv.amount;
            }
            else {
                lines.push(`     状态：${statusName}｜已收：${(0, util_1.fmtMoney)(inv.payout)}`);
                totalPayout += inv.payout;
            }
        }
        lines.push('');
        lines.push(`📊 投资中本金：${(0, util_1.fmtMoney)(totalActive)}｜已收分红/退款：${(0, util_1.fmtMoney)(totalPayout)}`);
        return lines.join('\n');
    });
    // ── 命令：开盘购买（从开盘楼盘的户型里直接买一套） ──
    ctx.command('经济/房地产/开盘购买 <unitId:number>', '开盘购买 <户型ID>：从开盘楼盘里买一套具体户型（投资者享折扣 + 优先权）')
        .alias('开盘购买', '开盘买房', 'buyunit')
        .action(async ({ session }, unitIdStr) => {
        if (!session.userId)
            return;
        if (!config.propertyEnabled || !config.propertyDevEnabled)
            return '系统未启用。';
        const unitId = Number(unitIdStr);
        if (!Number.isFinite(unitId))
            return '户型 ID 必须是数字。';
        const u = (await ctx.database.get('daily_property_units', { id: unitId }))[0];
        if (!u)
            return `找不到户型 #${unitId}。`;
        const p = (await ctx.database.get('daily_property_projects', { id: u.projectId }))[0];
        if (!p)
            return `楼盘不存在。`;
        if (p.status !== 'presale')
            return `「${p.name}」当前状态为「${p.status}」，不可开盘购买。`;
        // 优先窗口检查
        const myKey = (0, util_1.userKey)(session);
        const myInvest = await ctx.database.get('daily_property_investments', { userId: myKey, projectId: p.id, status: 'active' });
        const isInvestor = myInvest.length > 0;
        if (p.statusTickLeft > 0 && !isInvestor) {
            return `⏰ 当前处于投资者优先窗口期（剩 ${p.statusTickLeft} 小时），仅投资者可购买。\n💡 输入「投资楼盘 ${p.id}」参与投资（开盘后立即解锁）。`;
        }
        // 锁定检查
        if (u.status === 'sold')
            return `#${unitId} 已售出。`;
        if (u.status === 'reserved' && u.reservedFor && u.reservedFor !== myKey) {
            return `#${unitId} 已被其他投资者锁定。`;
        }
        // 价格（投资者折扣）
        let price = u.price;
        let discountTag = '';
        if (isInvestor) {
            price = Math.floor(price * config.propertyDevInvestorDiscount);
            discountTag = `（投资者折扣 ${((1 - config.propertyDevInvestorDiscount) * 100).toFixed(0)}%）`;
        }
        // 资金
        const row = await core.getUser(myKey);
        if (row.points < price)
            return `现金不足：${(0, util_1.fmtMoney)(price)}${discountTag}，您现金 ${(0, util_1.fmtMoney)(row.points)}。`;
        // 限购检查
        const myProps = await ctx.database.get('daily_properties', { userId: myKey, status: 'holding' });
        if (myProps.length >= config.propertyMaxProperties) {
            return `您已持有 ${myProps.length} 套房产，达到上限 ${config.propertyMaxProperties}。`;
        }
        const tax = Math.floor(price * config.propertyTradeTax);
        const total = price + tax;
        if (row.points < total)
            return `含税 ${(0, util_1.fmtMoney)(tax)} 后需 ${(0, util_1.fmtMoney)(total)}，您现金 ${(0, util_1.fmtMoney)(row.points)}。`;
        const now = new Date();
        const dev = (await ctx.database.get('daily_property_developers', { code: p.developerCode }))[0];
        const z = (await ctx.database.get('daily_property_zones', { code: p.zoneCode }))[0];
        const ts = getType(p.type);
        // 写入：扣款 + 户型 sold + 新 daily_properties + 楼盘 remainingUnits--
        await core.dbTx(async (db) => {
            const dbAny = db;
            await dbAny.set('daily_points', { userId: myKey }, { points: row.points - total });
            await dbAny.set('daily_property_units', { id: u.id }, {
                status: 'sold',
                buyerUserId: myKey,
                soldAt: now,
            });
            await dbAny.set('daily_property_projects', { id: p.id }, {
                remainingUnits: Math.max(0, p.remainingUnits - 1),
                updatedAt: now,
            });
            await dbAny.create('daily_properties', {
                userId: myKey,
                zoneCode: p.zoneCode,
                type: p.type,
                quality: u.quality,
                boughtPrice: price,
                boughtAt: now,
                currentValue: price,
                renting: 0,
                lastRentAt: now,
                accumulatedRent: 0,
                status: 'holding',
                soldAt: null,
                soldPrice: 0,
                isDerelict: 0,
                listedForSale: 0,
                listedPrice: 0,
                listedAt: null,
            });
        });
        const lines = [
            `🎉 开盘购买成功！`,
            `${dev?.icon || ''}${dev?.name}·${p.name}（${p.code}）`,
            `${ts?.icon || ''}${ts?.name}｜${u.building}栋 ${u.unitNumber}｜${u.layout} ${u.area}㎡ ${(FACING_TABLE.find(f => f.code === u.facing)?.label) || u.facing} ${u.quality}品`,
            `地块：${z?.icon || ''}${z?.name}`,
            `成交价：${(0, util_1.fmtMoney)(price)}${discountTag}（税 ${(0, util_1.fmtMoney)(tax)}，合计 ${(0, util_1.fmtMoney)(total)}）`,
            `剩余现金：${(0, util_1.fmtMoney)(row.points - total)}`,
            ``,
            `📌 提示：发「租房 <新ID> 1」开启出租，或「卖房 <新ID>」/「挂牌 <新ID> <价格>」转手。`,
        ];
        return lines.join('\n');
    });
    // ── 命令：我的户型（v1.17.0 我持有的楼盘户型） ──
    ctx.command('经济/房地产/我的户型', '查看我从开盘楼盘购买的户型（含开发商 / 楼盘 / 楼栋）')
        .alias('我的户型', 'myunits')
        .action(async ({ session }) => {
        if (!session.userId)
            return;
        if (!config.propertyEnabled || !config.propertyDevEnabled)
            return '系统未启用。';
        const key = (0, util_1.userKey)(session);
        const units = await ctx.database.get('daily_property_units', { buyerUserId: key, status: 'sold' });
        if (!units.length)
            return '您尚未从开盘楼盘购买任何户型。发「楼盘」查看当前开盘楼盘。';
        const projects = await ctx.database.get('daily_property_projects', {});
        const pMap = new Map(projects.map((p) => [p.id, p]));
        const devs = await ctx.database.get('daily_property_developers', {});
        const dMap = new Map(devs.map((d) => [d.code, d]));
        const zones = await ctx.database.get('daily_property_zones', {});
        const zMap = new Map(zones.map((z) => [z.code, z]));
        const lines = ['🏠 我的户型（开盘购买）：', ''];
        for (const u of units) {
            const p = pMap.get(u.projectId);
            if (!p)
                continue;
            const z = zMap.get(p.zoneCode);
            const d = dMap.get(p.developerCode);
            const ts = getType(p.type);
            const myProp = (await ctx.database.get('daily_properties', { userId: key, zoneCode: p.zoneCode, type: p.type, boughtAt: u.soldAt }))[0];
            lines.push(`  ${d?.icon || ''}${d?.name}·${p.name}（${p.code}）`);
            lines.push(`     ${u.building}栋 ${u.unitNumber}｜${u.layout} ${u.area}㎡ ${(FACING_TABLE.find(f => f.code === u.facing)?.label) || u.facing} ${u.quality}品`);
            lines.push(`     ${z?.icon || ''}${z?.name}｜${ts?.icon || ''}${ts?.name}｜${myProp ? `当前估值 ${(0, util_1.fmtMoney)(myProp.currentValue)}｜房产 #${myProp.id}` : '房产记录缺失'}`);
        }
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
    ctx.command('经济/房地产', '房地产分组菜单（买房 / 卖房 / 挂牌 / 购房 / 出租 / 收租 / 房产市场 / 政策 / 楼盘 / 开发商 / 投资）')
        .action(async () => {
        const zones = await ctx.database.get('daily_property_zones', {});
        const lines = [
            '🏘️ 房地产指令：',
            '  买房 <类型> <区域> [品质1-5] —— 从 NPC 二手急售市场入手（v1.17.0 降价但烂尾率高）',
            '  卖房 <ID> —— 按当前估值卖给 NPC 市场（扣税）',
            '  挂牌 <ID> <价格> —— 挂到 P2P 市场等别的玩家接盘',
            '  购房 <ID> —— 接盘挂牌中的房产（按挂牌价成交 + 平台抽成 + 税）',
            '  取消挂牌 <ID> —— 撤回挂牌',
            '  挂牌列表 —— 查看 P2P 挂牌市场',
            '  租房 <ID> 1/0 —— 开启/关闭出租（自动每 N 小时收租）',
            '  收租 —— 立即收取所有出租房的租金',
            '  我的房产 —— 查看我的房产 + 估值 + 累计租金',
            '  我的户型 —— 查看从开盘楼盘购买的户型（含开发商 / 楼栋）',
            '  房产市场 —— 所有区域行情速览',
            '  房产走势 <区域> —— K 线 / 折线图',
            '  政策 —— 当前生效的政策 / 升值 / 危机 事件',
            '',
            '🏗️ v1.17.0 楼盘开发系统：',
            '  开发商 —— 查看所有开发商品牌 / 专长 / 信誉 / 在建楼盘',
            '  开发商详情 <代号> —— 某开发商的所有楼盘',
            '  楼盘 —— 查看当前所有可投资 / 开盘中的楼盘',
            '  楼盘详情 <ID> —— 楼盘户型 / 楼栋 / 已投资人数',
            '  投资楼盘 <ID> [档位] —— 投资某楼盘（开盘优先权 + 折扣 + 竣工分红）',
            '  我的投资 —— 查看投资记录 + 预期回报',
            '  开盘购买 <户型ID> —— 从开盘楼盘直接买具体户型',
            '',
            '🏠 房产类型：' + TYPES.map(t => `${t.icon}${t.name}(${t.priceMul}x)`).join(' / '),
            '🗺️ 区域：' + ZONES.map(z => `${z.icon}${z.name}(${z.code} / 基础 ${(0, util_1.fmtMoney)(z.basePrice)})`).join(' / '),
            '',
            '⚠️ 风险提示：泡沫指数 ≥ ' + config.propertyBubbleThreshold + ' 时下一次刷新必破裂；二手急售烂尾率 ' + ((config.propertyDevResaleDerelictChance ?? 0.20) * 100).toFixed(0) + '%（远高于一手 8%）；楼盘在施工中每小时有 ' + ((config.propertyDevDerelictChance ?? 0.04) * 100).toFixed(1) + '% 概率烂尾（信誉越低越高）。',
        ];
        if (zones.length) {
            lines.push('');
            lines.push('📊 当前区域行情：');
            for (const z of zones) {
                const change = z.currentPrice / z.basePrice - 1;
                lines.push(`  ${z.icon}${z.name}：${(0, util_1.fmtMoney)(z.currentPrice)}（${fmtPct(change)}）泡沫 ${z.bubbleIndex.toFixed(0)}/100`);
            }
        }
        if (config.propertyDevEnabled) {
            const projects = await ctx.database.get('daily_property_projects', {});
            const presale = projects.filter(p => p.status === 'presale').length;
            const building = projects.filter(p => ['planning', 'building'].includes(p.status)).length;
            if (presale + building > 0) {
                lines.push('');
                lines.push('🏗️ 楼盘速览：');
                lines.push(`   在建/规划：${building} 个｜开盘中：${presale} 个（发「楼盘」看详情）`);
            }
        }
        return lines.join('\n');
    });
    return { ensureZones, tickMarket, collectRent, schedulePropertyUpdates, seedDevelopersAndProjects, tickProjects };
}
/** 4 家固定开发商 NPC */
const DEVELOPERS = [
    { code: 'wanrun', name: '万润置地', icon: '🏙️', brand: 'luxury', specialty: ['mansion', 'office'], baseReputation: 78 },
    { code: 'hengyuan', name: '恒远地产', icon: '🏢', brand: 'mid', specialty: ['apartment', 'shop'], baseReputation: 65 },
    { code: 'bigui', name: '碧桂园系', icon: '🌳', brand: 'mid', specialty: ['house', 'apartment'], baseReputation: 60 },
    { code: 'longhe', name: '龙合建工', icon: '🏗️', brand: 'economy', specialty: ['house'], baseReputation: 40 },
];
/** 楼盘名称模板（按品牌档次） */
const PROJECT_NAMES = {
    luxury: ['御湾华府', '蔚蓝官邸', '紫宸壹号', '御园金座', '半山雅院', '君悦台'],
    mid: ['金色家园', '锦城花园', '和煦苑', '云栖谷', '凤凰城', '御景湾', '星河里', '润园'],
    economy: ['幸福里', '康乐家园', '祥和苑', '聚贤居', '嘉和苑', '青松园', '乐居'],
};
/** 楼栋字母（A-I） */
const BUILDING_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
/** 户型布局（按房产类型） */
const LAYOUTS_BY_TYPE = {
    house: ['2室1厅', '3室1厅', '3室2厅', '4室2厅'],
    apartment: ['1室1厅', '2室1厅', '2室2厅', '3室1厅'],
    shop: ['临街铺', '商场铺', '社区铺'],
    office: ['小型办公', '标准办公', '整层办公'],
    mansion: ['5室3厅', '6室3厅', '独栋别墅', '联排别墅'],
};
/** 朝向（系数 south 1.05 / southeast 1.03 / east 0.98 / west 0.95 / north 0.92） */
const FACING_TABLE = [
    { code: 'south', mul: 1.05, label: '朝南' },
    { code: 'southeast', mul: 1.03, label: '东南' },
    { code: 'east', mul: 0.98, label: '朝东' },
    { code: 'west', mul: 0.95, label: '朝西' },
    { code: 'north', mul: 0.92, label: '朝北' },
];
/** 朝向随机（带权重，南方最常见） */
function pickFacing() {
    const weights = [40, 15, 15, 10, 20]; // south/SE/E/W/N
    let total = 0;
    for (const w of weights)
        total += w;
    let r = Math.random() * total;
    for (let i = 0; i < FACING_TABLE.length; i++) {
        r -= weights[i];
        if (r <= 0)
            return FACING_TABLE[i];
    }
    return FACING_TABLE[0];
}
/** 从一个数组里 pick 一个 */
function pickOne(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
/** 取整夹紧 */
function clampInt(n, lo, hi) {
    return Math.max(lo, Math.min(hi, Math.floor(n)));
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
