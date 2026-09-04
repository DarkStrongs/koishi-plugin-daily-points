"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerStock = registerStock;
const config_1 = require("./config");
const util_1 = require("./util");
const seeds_1 = require("./seeds");
/** 股票系统：行情引擎 + 撮合冲击 + 板块联动 + 5 命令 + 4 图表 */
function registerStock({ ctx, config, core, logger }) {
    // ── 板块初始化 ──────────────────────────────────────
    async function ensureSectors() {
        const existing = await ctx.database.get('daily_stock_sectors');
        if (existing.length)
            return existing;
        await ctx.database.upsert('daily_stock_sectors', seeds_1.SECTOR_DEFINITIONS.map((s) => ({ ...s })));
        return seeds_1.SECTOR_DEFINITIONS.slice();
    }
    /** 板块查找 */
    async function sectorsByCode() {
        const list = await ensureSectors();
        return new Map(list.map((s) => [s.code, s]));
    }
    /** 按板块聚合股票 */
    function stocksBySector(stocks) {
        const m = new Map();
        for (const s of stocks) {
            const sec = s.sector || 'unknown';
            const arr = m.get(sec) || [];
            arr.push(s);
            m.set(sec, arr);
        }
        return m;
    }
    /** 当日日期（YYYY-MM-DD），按配置时区切日 */
    function todayKey() {
        return (0, util_1.fmtTime)(Date.now()).slice(0, 10); // fmtTime 是中文格式，改用下面的纯日期
    }
    // 上面那个是占位，下面这个是真正的 YYYY-MM-DD
    function todayDate() {
        const off = config.timezoneOffset || 8;
        const d = new Date(Date.now() + off * config_1.HOUR);
        return d.toISOString().slice(0, 10);
    }
    // ── 行情引擎（基础） ──────────────────────────────────
    async function ensureStocks() {
        let stocks = await ctx.database.get('daily_stocks');
        const sectors = await ensureSectors();
        const sectorMap = new Map(sectors.map((s) => [s.code, s]));
        if (!stocks.length) {
            const now = new Date();
            // 用 upsert（基于 code 主键）做并发安全插入：第二次跑时 upsert 找到就跳过
            const rows = seeds_1.STOCK_SEED.map((s) => ({
                code: s.code,
                name: s.name,
                base: s.base,
                vol: s.vol,
                sector: sectorMap.has(s.sector) ? s.sector : 'consumer',
                price: s.base,
                prevPrice: s.base,
                updatedAt: now,
            }));
            await ctx.database.upsert('daily_stocks', rows);
            stocks = await ctx.database.get('daily_stocks');
            await ctx.database.upsert('daily_meta', [{ key: 'stockLastUpdate', value: String(now.getTime()) }]);
        }
        else {
            // 给老股票补 sector 字段（迁移）
            const missing = stocks.filter((s) => !s.sector);
            if (missing.length) {
                const seedMap = new Map([...seeds_1.STOCK_SEED, ...seeds_1.IPO_PRESETS].map((s) => [s.code, s.sector]));
                const upd = missing.map((s) => ({ code: s.code, sector: seedMap.get(s.code) || 'consumer' }));
                await ctx.database.upsert('daily_stocks', upd);
                stocks = await ctx.database.get('daily_stocks');
            }
        }
        await seedHistory(stocks);
        const [metaCheck] = await ctx.database.get('daily_meta', { key: 'stockLastUpdate' });
        if (!metaCheck)
            await ctx.database.upsert('daily_meta', [{ key: 'stockLastUpdate', value: String(Date.now()) }]);
        return stocks;
    }
    /** 为没有历史K线的股票回填历史（倒推随机游走），保证图表不为空 */
    async function seedHistory(stocks) {
        const intervalMs = config.stockIntervalMinutes * 60000;
        const N = 48;
        const now = Date.now();
        const r2 = (v) => Math.round(v * 100) / 100;
        for (const s of stocks) {
            const existing = await ctx.database.get('daily_stock_history', { code: s.code }, 1);
            if (existing.length)
                continue;
            const closes = [s.price];
            for (let i = 1; i < N; i++) {
                const prev = closes[0];
                const drift = 0.03 * (s.base - prev) / s.base;
                const p = prev * (1 + drift + (Math.random() * 2 - 1) * s.vol * config.stockVolatility);
                closes.unshift(Math.max(0.5, Math.min(p, s.base * 10)));
            }
            const rows = [];
            for (let i = 0; i < N; i++) {
                const close = closes[i];
                const open = i === 0 ? close * (1 + (Math.random() * 2 - 1) * s.vol * 0.3) : closes[i - 1];
                const high = Math.max(open, close) * (1 + Math.random() * s.vol * 0.4);
                const low = Math.min(open, close) * (1 - Math.random() * s.vol * 0.4);
                rows.push({
                    code: s.code,
                    open: r2(open),
                    close: r2(close),
                    high: r2(high),
                    low: r2(low),
                    time: new Date(now - (N - 1 - i) * intervalMs),
                });
            }
            await ctx.database.upsert('daily_stock_history', rows);
        }
    }
    /** 单只股票走一步随机行情（带均值回归 + 板块联动） */
    function nextPrice(s, sectorChange) {
        const vol = s.vol * config.stockVolatility;
        const drift = 0.03 * (s.base - s.price) / s.base;
        const sectorBias = sectorChange ? sectorChange * (config.stockSectorLinkStrength || 0.3) : 0;
        const p = s.price * (1 + drift + sectorBias + (Math.random() * 2 - 1) * vol);
        return Math.max(0.5, Math.min(p, s.base * 10));
    }
    /** 随机事件 */
    function rollStockEvent(s) {
        const r = Math.random();
        if (r < 0.3)
            return { mult: 0.5 + Math.random() * 0.2, text: `${s.name} 财报暴雷，股价跳水` };
        if (r < 0.55)
            return { mult: 1.3 + Math.random() * 0.5, text: `${s.name} 被巨头收购，股价飙升` };
        if (r < 0.75)
            return { haltPeriods: 2 + Math.floor(Math.random() * 4), text: `${s.name} 涉嫌财务造假，被临时停牌调查` };
        if (r < 0.9)
            return { mult: 0.8 + Math.random() * 0.1, text: `${s.name} 高管跑路传闻，股价受挫` };
        return { mult: 1.1 + Math.random() * 0.2, text: `${s.name} 拿下大单，股价走高` };
    }
    async function setNews(text) {
        await ctx.database.upsert('daily_meta', [{ key: 'stockNews', value: text }]);
    }
    async function setNewsAndBroadcast(text) {
        await ctx.database.upsert('daily_meta', [{ key: 'stockNews', value: text }]);
        await core.broadcast(text);
    }
    async function maybeIPO(stocks) {
        if (config.ipoPeriods <= 0 || stocks.length >= config.stockMaxCount)
            return;
        const target = Math.max(1, Math.round(config.ipoPeriods * 60 / Math.max(1, config.stockIntervalMinutes)));
        const [meta] = await ctx.database.get('daily_meta', { key: 'stockIPOCounter' });
        const counter = meta ? Number(meta.value) + 1 : 1;
        if (counter < target) {
            await ctx.database.upsert('daily_meta', [{ key: 'stockIPOCounter', value: String(counter) }]);
            return;
        }
        await ctx.database.upsert('daily_meta', [{ key: 'stockIPOCounter', value: '0' }]);
        const used = new Set(stocks.map((s) => s.code));
        const pool = seeds_1.IPO_PRESETS.filter((p) => !used.has(p.code));
        if (!pool.length)
            return;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        const sectors = await sectorsByCode();
        // IPO 也用 upsert（基于 code 主键），并发安全
        await ctx.database.upsert('daily_stocks', [{
                code: pick.code,
                name: pick.name,
                base: pick.base,
                vol: pick.vol,
                sector: sectors.has(pick.sector) ? pick.sector : 'consumer',
                price: pick.base,
                prevPrice: pick.base,
                updatedAt: new Date(),
                note: '新股上市，波动剧烈',
            }]);
        const [newStock] = await ctx.database.get('daily_stocks', { code: pick.code });
        if (newStock)
            await seedHistory([newStock]);
        await setNewsAndBroadcast(`【${(0, util_1.fmtTime)(Date.now())}】🔔 新股上市：${pick.name}（${pick.code}），发行价 ${(0, util_1.fmtMoney)(pick.base)}，正式开盘交易！`);
    }
    // ── 用户行为驱动市场（v1.11.0 核心） ─────────────────
    /**
     * 撮合 + 价格冲击：
     *   玩家单笔买入/卖出后写入 daily_stock_volume；
     *   若单笔金额 > 当日累计卖盘/买盘的 stockImpactRatio 倍 → 推动现价 ±1~3%；
     *   累计买盘/卖盘 > 日均阈值 → 触发"散户追捧/踩踏"系统事件。
     * 返回：本笔产生的价格偏移（百分比，已应用）。
     */
    async function recordTrade(code, direction, amount) {
        const today = todayDate();
        let [v] = await ctx.database.get('daily_stock_volume', { code, date: today });
        if (!v) {
            v = {
                code,
                date: today,
                buyAmount: 0,
                sellAmount: 0,
                buyCount: 0,
                sellCount: 0,
                impactBias: 0,
                lastEvent: '',
                lastEventAt: new Date(0),
            };
            await ctx.database.create('daily_stock_volume', { ...v });
            const [fetched] = await ctx.database.get('daily_stock_volume', { code, date: today });
            v = fetched || v;
        }
        let bias = 0;
        let event = null;
        if (direction === 'buy') {
            // 单笔冲击 = 金额 / 当日累计卖盘 超过 ratio
            const ratio = v.sellAmount > 0 ? amount / v.sellAmount : 1;
            if (ratio > (config.stockImpactRatio || 0.05)) {
                bias = Math.min(0.03, ratio * 0.02); // 上推，最多 3%
            }
            v.buyAmount += amount;
            v.buyCount += 1;
            // 散户追捧：累计买盘 > 日均阈值（今日累计卖盘的 30%）→ 触发
            if (v.buyAmount > (v.sellAmount + 1) * 1.3 && v.lastEvent !== '追捧') {
                bias += 0.05 + Math.random() * 0.05;
                event = '追捧';
                v.lastEvent = '追捧';
                v.lastEventAt = new Date();
            }
        }
        else {
            const ratio = v.buyAmount > 0 ? amount / v.buyAmount : 1;
            if (ratio > (config.stockImpactRatio || 0.05)) {
                bias = -Math.min(0.03, ratio * 0.02);
            }
            v.sellAmount += amount;
            v.sellCount += 1;
            if (v.sellAmount > (v.buyAmount + 1) * 1.3 && v.lastEvent !== '踩踏') {
                bias -= 0.05 + Math.random() * 0.05;
                event = '踩踏';
                v.lastEvent = '踩踏';
                v.lastEventAt = new Date();
            }
        }
        v.impactBias += bias;
        // 单 tick 累计冲击钳到 stockImpactMaxBias
        const maxBias = config.stockImpactMaxBias || 0.05;
        if (v.impactBias > maxBias)
            v.impactBias = maxBias;
        if (v.impactBias < -maxBias)
            v.impactBias = -maxBias;
        await ctx.database.set('daily_stock_volume', { code, date: today }, {
            buyAmount: v.buyAmount,
            sellAmount: v.sellAmount,
            buyCount: v.buyCount,
            sellCount: v.sellCount,
            impactBias: v.impactBias,
            lastEvent: v.lastEvent,
            lastEventAt: v.lastEventAt,
        });
        return { bias, event };
    }
    /** 分红（按概率，持股者每股得 现价 × dividendRate） */
    async function maybePayDividend(stocks) {
        const scale = Math.min(1, config.stockIntervalMinutes / 60);
        if (Math.random() >= config.dividendChance * scale)
            return;
        const tradable = stocks.filter((s) => !s.haltedUntil || new Date(s.haltedUntil).getTime() <= Date.now());
        if (!tradable.length)
            return;
        const pick = tradable[Math.floor(Math.random() * tradable.length)];
        const perShare = Math.round(pick.price * config.dividendRate * 100) / 100;
        if (perShare <= 0)
            return;
        const holdings = await ctx.database.get('daily_stock_holding', { code: pick.code });
        let paid = 0, holders = 0;
        for (const h of holdings) {
            const amount = Math.floor(perShare * h.quantity);
            if (amount <= 0)
                continue;
            const [row] = await ctx.database.get('daily_points', { userId: h.userId });
            if (!row)
                continue;
            await core.dbTx(async (db) => {
                const dbAny = db;
                await dbAny.set('daily_points', { userId: h.userId }, {
                    points: row.points + amount,
                    dividendTotal: (row.dividendTotal || 0) + amount,
                });
            });
            paid += amount;
            holders++;
        }
        if (holders > 0) {
            await setNewsAndBroadcast(`【${(0, util_1.fmtTime)(Date.now())}】💰 ${pick.name}（${pick.code}）发放分红：每股 ${(0, util_1.fmtMoney)(perShare)}，${holders} 位股东共分得 ${paid} 积分（已入现金）`);
        }
    }
    /** tick：动量衰减 + 板块联动 */
    async function applyMomentumAndSectorLink(stocks) {
        const today = todayDate();
        const decay = config.stockMomentumDecay || 0.5;
        // 衰减所有股票的 impactBias
        const vols = await ctx.database.get('daily_stock_volume', { date: today });
        for (const v of vols) {
            if (Math.abs(v.impactBias) < 0.001)
                continue;
            const newBias = v.impactBias * (1 - decay);
            await ctx.database.set('daily_stock_volume', { code: v.code, date: today }, { impactBias: newBias });
        }
        // 板块联动：计算每个板块均涨跌，注入 nextPrice 的 sectorChange
        const group = stocksBySector(stocks);
        const sectorChange = new Map();
        for (const [sec, arr] of group) {
            const avgChange = arr.reduce((s, st) => s + (st.prevPrice ? (st.price / st.prevPrice - 1) : 0), 0) / Math.max(1, arr.length);
            sectorChange.set(sec, avgChange);
        }
        return sectorChange;
    }
    /** 到期则补齐刷新（含停机期间），推进水位时间 */
    async function updateStocks() {
        const stocks = await ensureStocks();
        await ensureSectors();
        const [meta] = await ctx.database.get('daily_meta', { key: 'stockLastUpdate' });
        const intervalMs = config.stockIntervalMinutes * 60000;
        let last = meta ? Number(meta.value) : Date.now();
        if (!Number.isFinite(last))
            last = Date.now();
        let steps = Math.floor((Date.now() - last) / intervalMs);
        if (steps <= 0)
            return stocks;
        steps = Math.min(steps, 48);
        const now = Date.now();
        const r2 = (v) => Math.round(v * 100) / 100;
        const eventScale = Math.min(1, config.stockIntervalMinutes / 60);
        const histRows = [];
        let lastEventNews = null;
        for (let i = 0; i < steps; i++) {
            // 每步前衰减 + 计算板块联动
            const sectorChange = await applyMomentumAndSectorLink(stocks);
            const stepMs = Math.min(last + (i + 1) * intervalMs, now);
            const stepTime = new Date(stepMs);
            for (const s of stocks) {
                const haltedMs = s.haltedUntil ? new Date(s.haltedUntil).getTime() : 0;
                const open = s.price;
                let close = open, high = open, low = open;
                if (haltedMs > stepMs) {
                    // 停牌中：价格冻结
                }
                else {
                    close = nextPrice(s, sectorChange.get(s.sector) || 0);
                    // 应用冲击偏移（v1.11.0）
                    const [vol] = await ctx.database.get('daily_stock_volume', { code: s.code, date: todayDate() });
                    if (vol && Math.abs(vol.impactBias) > 0.001) {
                        close = close * (1 + vol.impactBias);
                    }
                    if (Math.random() < config.stockEventChance * eventScale) {
                        const ev = rollStockEvent(s);
                        if (ev.haltPeriods)
                            s.haltedUntil = new Date(stepMs + ev.haltPeriods * config_1.HOUR);
                        if (ev.mult)
                            close = Math.max(0.5, close * ev.mult);
                        s.note = ev.text;
                        const newsText = `【${(0, util_1.fmtTime)(stepMs)}】📰 ${ev.text}${ev.haltPeriods ? `（停牌约 ${ev.haltPeriods} 小时）` : ''}`;
                        await setNews(newsText);
                        if (i === steps - 1)
                            lastEventNews = newsText;
                    }
                    high = Math.max(open, close) * (1 + Math.random() * s.vol * 0.4);
                    low = Math.min(open, close) * (1 - Math.random() * s.vol * 0.4);
                }
                s.prevPrice = open;
                s.price = r2(close);
                histRows.push({ code: s.code, open: r2(open), close: s.price, high: r2(high), low: r2(low), time: stepTime });
            }
        }
        if (lastEventNews)
            await core.broadcast(lastEventNews);
        for (const s of stocks) {
            await ctx.database.set('daily_stocks', { code: s.code }, {
                price: s.price,
                prevPrice: s.prevPrice,
                updatedAt: new Date(),
                haltedUntil: s.haltedUntil || null,
                note: s.note || null,
            });
        }
        if (histRows.length)
            await ctx.database.upsert('daily_stock_history', histRows);
        await ctx.database.remove('daily_stock_history', { time: { $lt: new Date(now - 14 * config_1.DAY) } });
        await ctx.database.upsert('daily_meta', [{ key: 'stockLastUpdate', value: String(last + steps * intervalMs) }]);
        await maybeIPO(stocks);
        await maybePayDividend(stocks);
        return await ctx.database.get('daily_stocks');
    }
    function scheduleUpdates() {
        if (!config.stockEnabled)
            return;
        let inFlight = false;
        // 首次初始化也走 inFlight 保护，防止并发时重复插入种子股
        const runOnce = () => {
            if (inFlight)
                return;
            inFlight = true;
            return updateStocks()
                .catch((e) => logger.warn('股票行情刷新失败：', e))
                .finally(() => { inFlight = false; });
        };
        runOnce();
        ctx.setInterval(() => { runOnce(); }, config.stockIntervalMinutes * 60000);
    }
    // ── 图表 HTML 渲染 ──────────────────────────────────
    function buildKlineHTML(stock, candles) {
        const W = 820, H = 520;
        const padL = 56, padR = 84, padT = 60, padB = 56;
        const plotW = W - padL - padR;
        // 主图占上 70%，副图（成交量）占下 22%
        const mainH = Math.floor((H - padT - padB) * 0.7);
        const volH = Math.floor((H - padT - padB) * 0.22);
        const gap = 18;
        const mainTop = padT;
        const volTop = mainTop + mainH + gap;
        const baseY = volTop + volH;
        // 价格范围（仅基于主图）
        let pMin = Infinity, pMax = -Infinity;
        let vMax = 0;
        for (const c of candles) {
            pMin = Math.min(pMin, c.low, c.open, c.close);
            pMax = Math.max(pMax, c.high, c.open, c.close);
            // 用 (high-low) 近似"该段成交活跃度"
            vMax = Math.max(vMax, Math.abs(c.close - c.open) + (c.high - c.low) * 0.5);
        }
        const span = (pMax - pMin) || 1;
        pMin -= span * 0.05;
        pMax += span * 0.05;
        const yMain = (v) => mainTop + (pMax - v) / (pMax - pMin) * mainH;
        const yVol = (v) => volTop + volH - (v / Math.max(0.0001, vMax)) * volH;
        const n = candles.length;
        const cw = plotW / n;
        const up = '#ef4444', down = '#22c55e';
        const maColor = ['#f59e0b', '#6366f1'];
        const first = candles[0], last = candles[n - 1];
        const chg = first.open ? (last.close / first.open - 1) * 100 : 0;
        const chgColor = chg >= 0 ? up : down;
        const FONT = 'Microsoft YaHei, sans-serif';
        // MA 计算
        const closes = candles.map((c) => c.close);
        const ma = (k) => closes.map((_, i) => {
            if (i < k - 1)
                return null;
            let s = 0;
            for (let j = i - k + 1; j <= i; j++)
                s += closes[j];
            return s / k;
        });
        let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
        svg += `<rect width="${W}" height="${H}" fill="#fafafa"/>`;
        // 标题
        svg += `<text x="${padL}" y="30" font-size="22" font-weight="700" fill="#1a1a1a" font-family="${FONT}">${stock.name}（${stock.code}）</text>`;
        svg += `<text x="${padL}" y="50" font-size="13" fill="#666" font-family="${FONT}">现价 ${(0, util_1.fmtMoney)(stock.price)} · 区间 ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% · 每根K线 = ${config.stockIntervalMinutes} 分钟 · 共 ${n} 根</text>`;
        // 图例
        svg += `<g font-family="${FONT}" font-size="11">`;
        svg += `<rect x="${W - padR - 130}" y="22" width="10" height="10" fill="${up}"/><text x="${W - padR - 116}" y="31" fill="#444">涨</text>`;
        svg += `<rect x="${W - padR - 90}" y="22" width="10" height="10" fill="${down}"/><text x="${W - padR - 76}" y="31" fill="#444">跌</text>`;
        svg += `<line x1="${W - padR - 50}" y1="27" x2="${W - padR - 32}" y2="27" stroke="${maColor[0]}" stroke-width="1.5"/><text x="${W - padR - 28}" y="31" fill="#444">MA5</text>`;
        svg += `<line x1="${W - padR - 90}" y1="44" x2="${W - padR - 72}" y2="44" stroke="${maColor[1]}" stroke-width="1.5"/><text x="${W - padR - 68}" y="48" fill="#444">MA10</text>`;
        svg += `</g>`;
        // 主图网格 + Y 轴刻度
        for (let g = 0; g <= 4; g++) {
            const v = pMin + (pMax - pMin) * g / 4;
            const gy = yMain(v);
            svg += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="#e5e5e5" stroke-width="1"/>`;
            svg += `<text x="${W - padR + 6}" y="${(gy + 4).toFixed(1)}" font-size="11" fill="#999" font-family="${FONT}">${(0, util_1.fmtMoney)(v)}</text>`;
        }
        // 主图分隔线（副图标题）
        svg += `<text x="${padL}" y="${volTop - 4}" font-size="12" fill="#666" font-family="${FONT}">成交量</text>`;
        // 副图 Y 轴
        svg += `<text x="${W - padR + 6}" y="${volTop + 12}" font-size="10" fill="#aaa" font-family="${FONT}">高</text>`;
        svg += `<text x="${W - padR + 6}" y="${(volTop + volH).toFixed(1)}" font-size="10" fill="#aaa" font-family="${FONT}">低</text>`;
        // X 轴时间标签（每 ~max(1, n/6) 根一个）
        const xStep = Math.max(1, Math.floor(n / 6));
        for (let i = 0; i < n; i += xStep) {
            const cx = padL + i * cw + cw / 2;
            const t = candles[i]?.time;
            const ts = t ? new Date(t).getTime() : 0;
            const d = new Date(ts);
            const pad = (n) => String(n).padStart(2, '0');
            const label = t ? `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` : `#${i + 1}`;
            svg += `<text x="${cx.toFixed(1)}" y="${(H - padB + 18).toFixed(1)}" font-size="10" fill="#999" font-family="${FONT}" text-anchor="middle">${label}</text>`;
            // X 轴刻度短线
            svg += `<line x1="${cx.toFixed(1)}" y1="${(H - padB).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${(H - padB + 4).toFixed(1)}" stroke="#bbb"/>`;
        }
        // X 轴基线
        svg += `<line x1="${padL}" y1="${(H - padB).toFixed(1)}" x2="${W - padR}" y2="${(H - padB).toFixed(1)}" stroke="#bbb"/>`;
        // 副图（成交量）先画，避免被蜡烛覆盖
        for (let i = 0; i < n; i++) {
            const c = candles[i];
            const cx = padL + i * cw + cw / 2;
            const bw = Math.max(2, Math.floor(cw * 0.6));
            const vol = Math.abs(c.close - c.open) + (c.high - c.low) * 0.5;
            const top = yVol(vol);
            const bh = volTop + volH - top;
            const color = c.close >= c.open ? up : down;
            svg += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw}" height="${Math.max(1, bh).toFixed(1)}" fill="${color}" opacity="0.85"/>`;
        }
        // 主图蜡烛
        for (let i = 0; i < n; i++) {
            const c = candles[i];
            const cx = padL + i * cw + cw / 2;
            const color = c.close >= c.open ? up : down;
            const bodyW = Math.max(2, Math.floor(cw * 0.6));
            const yO = yMain(c.open), yC = yMain(c.close);
            svg += `<line x1="${cx.toFixed(1)}" y1="${yMain(c.high).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${yMain(c.low).toFixed(1)}" stroke="${color}" stroke-width="1.2"/>`;
            const top = Math.min(yO, yC);
            const bh = Math.max(1, Math.abs(yC - yO));
            svg += `<rect x="${(cx - bodyW / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bodyW}" height="${bh.toFixed(1)}" fill="${color}"/>`;
        }
        // MA 折线（5、10）
        const drawMA = (k, color) => {
            const m = ma(k);
            let path = '';
            for (let i = 0; i < n; i++) {
                if (m[i] == null)
                    continue;
                const x = padL + i * cw + cw / 2;
                const y = yMain(m[i]);
                path += (path ? ' L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
            }
            if (path)
                svg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="1.4"/>`;
        };
        drawMA(5, maColor[0]);
        drawMA(10, maColor[1]);
        // 当前价水平虚线
        const ly = yMain(last.close);
        svg += `<line x1="${padL}" y1="${ly.toFixed(1)}" x2="${W - padR}" y2="${ly.toFixed(1)}" stroke="${chgColor}" stroke-width="1" stroke-dasharray="4 3" opacity="0.6"/>`;
        svg += `<rect x="${W - padR}" y="${(ly - 9).toFixed(1)}" width="${padR - 8}" height="18" fill="${chgColor}" rx="2"/>`;
        svg += `<text x="${W - padR + 4}" y="${(ly + 4).toFixed(1)}" font-size="12" font-weight="700" fill="#fff" font-family="${FONT}">${(0, util_1.fmtMoney)(last.close)}</text>`;
        // 涨跌幅大字
        svg += `<text x="${W - padL - 4}" y="${(mainTop + 22).toFixed(1)}" font-size="22" font-weight="700" fill="${chgColor}" font-family="${FONT}" text-anchor="end">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</text>`;
        svg += '</svg>';
        return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fafafa;}</style></head><body>${svg}</body></html>`;
    }
    /** 大盘指数图 + 涨跌分布（合成一张图） */
    function buildMarketHTML(stocks, sectors) {
        const W = 820, H = 540;
        const padL = 100, padR = 80, padT = 64, padB = 36;
        const plotW = W - padL - padR;
        const allPrices = stocks.map((s) => ({ prev: s.prevPrice || s.base, cur: s.price, name: s.name, code: s.code, sector: s.sector }));
        const avg = allPrices.reduce((s, p) => s + p.cur, 0) / Math.max(1, allPrices.length);
        const prevAvg = allPrices.reduce((s, p) => s + p.prev, 0) / Math.max(1, allPrices.length);
        const change = prevAvg ? (avg / prevAvg - 1) * 100 : 0;
        const FONT = 'Microsoft YaHei, sans-serif';
        // 上半区：涨跌分布（占 plotH 38%）
        // 下半区：板块表现（占 plotH 45%）
        // 中间留 6% 给分隔
        const totalPlotH = H - padT - padB;
        const distTop = padT + 24; // 涨跌分布区顶（标题 24px 高）
        const distH = Math.floor(totalPlotH * 0.38);
        const secTopY = distTop + distH + 56; // 板块表现区顶（含"板块表现"标题 28 + 间隔 28）
        const secBarMaxH = Math.floor(totalPlotH * 0.28);
        const secBaseY = secTopY + 28 + secBarMaxH; // 板块柱底（柱子向上生长）
        const secLabelY = secBaseY + 18; // 板块名
        const secPctY = secLabelY + 16; // 板块涨跌幅
        // 涨跌分布：按涨跌幅度从大到小排，向上为涨向下为跌
        const sorted = [...allPrices].sort((a, b) => (b.cur / b.prev - 1) - (a.cur / a.prev - 1));
        const maxAbs = Math.max(0.01, ...sorted.map((p) => Math.abs(p.cur / p.prev - 1) * 100));
        let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
        svg += `<rect width="${W}" height="${H}" fill="#fafafa"/>`;
        // 标题
        svg += `<text x="${padL}" y="30" font-size="22" font-weight="700" fill="#1a1a1a" font-family="${FONT}">大盘指数</text>`;
        const chgColor = change >= 0 ? '#ef4444' : '#22c55e';
        svg += `<text x="${padL}" y="50" font-size="13" fill="#666" font-family="${FONT}">综合指数 ${(0, util_1.fmtMoney)(avg)} · ${change >= 0 ? '+' : ''}${change.toFixed(2)}% · 共 ${stocks.length} 只</text>`;
        // 大涨跌幅大字
        svg += `<text x="${W - padR}" y="32" font-size="26" font-weight="700" fill="${chgColor}" font-family="${FONT}" text-anchor="end">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</text>`;
        svg += `<text x="${W - padR}" y="50" font-size="11" fill="#999" font-family="${FONT}" text-anchor="end">${change >= 0 ? '▲' : '▼'} 综合涨跌</text>`;
        // 涨跌分布小标题
        svg += `<text x="${padL}" y="${(distTop - 6).toFixed(1)}" font-size="13" font-weight="600" fill="#333" font-family="${FONT}">涨跌分布（按涨跌幅排序）</text>`;
        svg += `<line x1="${padL}" y1="${(distTop + distH + 4).toFixed(1)}" x2="${W - padR}" y2="${(distTop + distH + 4).toFixed(1)}" stroke="#e5e5e5" stroke-width="1"/>`;
        const rowH = Math.max(10, Math.min(18, distH / Math.max(1, sorted.length)));
        sorted.forEach((p, i) => {
            const cy = distTop + i * rowH + rowH / 2;
            const pct = (p.cur / p.prev - 1) * 100;
            const color = pct >= 0 ? '#ef4444' : '#22c55e';
            const halfW = (Math.abs(pct) / maxAbs) * (plotW * 0.5) * 0.9;
            const x = pct >= 0 ? padL + plotW * 0.5 : padL + plotW * 0.5 - halfW;
            svg += `<rect x="${x.toFixed(1)}" y="${(cy - rowH * 0.35).toFixed(1)}" width="${Math.max(2, halfW).toFixed(1)}" height="${(rowH * 0.7).toFixed(1)}" fill="${color}" opacity="0.85" rx="1"/>`;
            // 代码贴柱内侧左端（涨）或右端（跌）
            const labelX = pct >= 0 ? x - 6 : x + halfW + 6;
            const anchor = pct >= 0 ? 'end' : 'start';
            svg += `<text x="${labelX.toFixed(1)}" y="${(cy + 3).toFixed(1)}" font-size="11" fill="#333" text-anchor="${anchor}" font-family="${FONT}">${p.code} ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</text>`;
            // 名称贴在另一端
            const nameX = pct >= 0 ? x + halfW + 6 : x - 6;
            const nameAnchor = pct >= 0 ? 'start' : 'end';
            svg += `<text x="${nameX.toFixed(1)}" y="${(cy + 3).toFixed(1)}" font-size="11" fill="#666" text-anchor="${nameAnchor}" font-family="${FONT}">${p.name}</text>`;
        });
        // 中线（0%）
        const midX = padL + plotW * 0.5;
        svg += `<line x1="${midX}" y1="${distTop}" x2="${midX}" y2="${(distTop + distH).toFixed(1)}" stroke="#bbb" stroke-width="1" stroke-dasharray="3 3"/>`;
        // 板块表现
        svg += `<text x="${padL}" y="${(secTopY - 4).toFixed(1)}" font-size="13" font-weight="600" fill="#333" font-family="${FONT}">板块表现（按平均涨跌）</text>`;
        const sectorGroup = stocksBySector(stocks);
        const sectorStats = [];
        for (const [sec, arr] of sectorGroup) {
            const avgChg = arr.reduce((s, st) => s + (st.prevPrice ? (st.price / st.prevPrice - 1) * 100 : 0), 0) / Math.max(1, arr.length);
            const meta = sectors.get(sec);
            sectorStats.push({ code: sec, name: meta?.name || sec, color: meta?.color || '#888888', icon: meta?.icon || '📊', avgChg });
        }
        const secMax = Math.max(1, ...sectorStats.map((s) => Math.abs(s.avgChg)));
        const sectorCount = sectorStats.length || 1;
        const gap = 14;
        const secBarW = Math.min(60, (plotW - gap * (sectorCount - 1)) / sectorCount);
        sectorStats.forEach((sec, i) => {
            const cx = padL + i * (secBarW + gap) + secBarW / 2;
            const color = sec.avgChg >= 0 ? '#ef4444' : '#22c55e';
            const barH = (Math.abs(sec.avgChg) / secMax) * secBarMaxH;
            const yTop = sec.avgChg >= 0 ? secBaseY - barH : secBaseY;
            // 柱子
            svg += `<rect x="${(cx - secBarW / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${secBarW.toFixed(1)}" height="${Math.max(2, barH).toFixed(1)}" fill="${color}" opacity="0.85" rx="2"/>`;
            // 板块 icon（柱子顶部上方）
            svg += `<text x="${cx.toFixed(1)}" y="${(secTopY + 20).toFixed(1)}" font-size="20" text-anchor="middle" font-family="${FONT}">${sec.icon}</text>`;
            // 板块名（柱底外）
            svg += `<text x="${cx.toFixed(1)}" y="${secLabelY.toFixed(1)}" font-size="12" text-anchor="middle" fill="#333" font-family="${FONT}">${sec.name}</text>`;
            // 涨跌幅（板块名下方，间隔 16px）
            svg += `<text x="${cx.toFixed(1)}" y="${secPctY.toFixed(1)}" font-size="13" font-weight="700" text-anchor="middle" fill="${color}" font-family="${FONT}">${sec.avgChg >= 0 ? '+' : ''}${sec.avgChg.toFixed(2)}%</text>`;
        });
        // 板块底基线
        svg += `<line x1="${padL}" y1="${secBaseY.toFixed(1)}" x2="${W - padR}" y2="${secBaseY.toFixed(1)}" stroke="#bbb" stroke-width="1"/>`;
        svg += '</svg>';
        return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fafafa;}</style></head><body>${svg}</body></html>`;
    }
    /** 资金流图：个股当日买卖净额柱状（按时段） */
    function buildFlowHTML(stock, history, volumes) {
        const W = 820, H = 460;
        const padL = 56, padR = 80, padT = 76, padB = 40;
        const plotW = W - padL - padR, plotH = H - padT - padB;
        const FONT = 'Microsoft YaHei, sans-serif';
        const today = volumes[0];
        const buy = today?.buyAmount || 0;
        const sell = today?.sellAmount || 0;
        const net = buy - sell;
        const netColor = net >= 0 ? '#ef4444' : '#22c55e';
        let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
        svg += `<rect width="${W}" height="${H}" fill="#fafafa"/>`;
        // 标题
        svg += `<text x="${padL}" y="30" font-size="22" font-weight="700" fill="#1a1a1a" font-family="${FONT}">${stock.name}（${stock.code}）资金流</text>`;
        svg += `<text x="${padL}" y="50" font-size="13" fill="#666" font-family="${FONT}">当日累计买 ${(0, util_1.fmtMoney)(buy)} · 卖 ${(0, util_1.fmtMoney)(sell)} · 净 ${net >= 0 ? '+' : ''}${(0, util_1.fmtMoney)(net)}</text>`;
        // 大字净额
        svg += `<text x="${W - padR}" y="32" font-size="26" font-weight="700" fill="${netColor}" font-family="${FONT}" text-anchor="end">${net >= 0 ? '+' : ''}${(0, util_1.fmtMoney)(net)}</text>`;
        svg += `<text x="${W - padR}" y="50" font-size="11" fill="#999" font-family="${FONT}" text-anchor="end">净流入/流出</text>`;
        // 时段分布图（按 history 顺序：每根 K 看作一个时段）
        svg += `<text x="${padL}" y="${padT - 6}" font-size="13" font-weight="600" fill="#333" font-family="${FONT}">时段资金流向</text>`;
        svg += `<text x="${W - padR}" y="${padT - 6}" font-size="11" fill="#999" font-family="${FONT}" text-anchor="end">红=净买 · 绿=净卖</text>`;
        if (history && history.length > 0) {
            // 估算每段流量
            // 用 (close - open) 涨幅方向映射买/卖流向（近似，无真实分时数据）
            const flows = history.map((k) => {
                const o = k.open ?? k.close;
                const flow = (k.close - o) * 1000; // 数量级放大
                return flow;
            });
            const maxAbs = Math.max(1, ...flows.map((f) => Math.abs(f)));
            const yMid = padT + plotH / 2;
            const n = history.length;
            const cw = plotW / n;
            const bw = Math.max(2, Math.floor(cw * 0.6));
            // 中线
            svg += `<line x1="${padL}" y1="${yMid.toFixed(1)}" x2="${W - padR}" y2="${yMid.toFixed(1)}" stroke="#bbb" stroke-width="1" stroke-dasharray="3 3"/>`;
            svg += `<text x="${W - padR + 6}" y="${(yMid + 4).toFixed(1)}" font-size="10" fill="#aaa" font-family="${FONT}">0</text>`;
            // Y 轴上下界
            const yMax = (v) => yMid - (v / maxAbs) * (plotH * 0.45);
            const yMin = (v) => yMid - (v / maxAbs) * (plotH * 0.45);
            // 上界标签
            svg += `<text x="${W - padR + 6}" y="${(yMid - plotH * 0.45 + 4).toFixed(1)}" font-size="10" fill="#aaa" font-family="${FONT}">+${(0, util_1.fmtMoney)(maxAbs / 1000)}</text>`;
            svg += `<text x="${W - padR + 6}" y="${(yMid + plotH * 0.45 + 4).toFixed(1)}" font-size="10" fill="#aaa" font-family="${FONT}">-${(0, util_1.fmtMoney)(maxAbs / 1000)}</text>`;
            for (let i = 0; i < n; i++) {
                const f = flows[i];
                const cx = padL + i * cw + cw / 2;
                const color = f >= 0 ? '#ef4444' : '#22c55e';
                if (f >= 0) {
                    const yTop = yMax(f);
                    const h = yMid - yTop;
                    svg += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${bw}" height="${Math.max(1, h).toFixed(1)}" fill="${color}" opacity="0.85" rx="1"/>`;
                }
                else {
                    const yBot = yMin(f);
                    const h = yBot - yMid;
                    svg += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${yMid.toFixed(1)}" width="${bw}" height="${Math.max(1, h).toFixed(1)}" fill="${color}" opacity="0.85" rx="1"/>`;
                }
                // X 轴时间（每 ~max(1, n/6) 根）
                if (i % Math.max(1, Math.floor(n / 6)) === 0) {
                    const t = history[i]?.time;
                    const ts = t ? new Date(t).getTime() : 0;
                    const d = new Date(ts);
                    const pad = (n) => String(n).padStart(2, '0');
                    const label = t ? `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` : `#${i + 1}`;
                    svg += `<text x="${cx.toFixed(1)}" y="${(H - padB + 16).toFixed(1)}" font-size="10" fill="#999" font-family="${FONT}" text-anchor="middle">${label}</text>`;
                }
            }
            // X 轴基线
            svg += `<line x1="${padL}" y1="${(H - padB).toFixed(1)}" x2="${W - padR}" y2="${(H - padB).toFixed(1)}" stroke="#bbb"/>`;
            // 顶部摘要：买卖笔数
            svg += `<text x="${padL}" y="${(padT + 18).toFixed(1)}" font-size="11" fill="#666" font-family="${FONT}">买 ${today?.buyCount || 0} 笔 · 卖 ${today?.sellCount || 0} 笔 · ${n} 个时段</text>`;
        }
        else {
            // 无 history 数据
            svg += `<text x="${(padL + plotW / 2).toFixed(1)}" y="${(padT + plotH / 2).toFixed(1)}" font-size="14" text-anchor="middle" fill="#999" font-family="${FONT}">暂无K线数据，无法分段</text>`;
        }
        svg += '</svg>';
        return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fafafa;}</style></head><body>${svg}</body></html>`;
    }
    // ── 命令注册 ─────────────────────────────────────────
    ctx.command('经济/股票', '查看实时股票行情')
        .alias('股票列表', '股票行情')
        .action(async () => {
        if (!config.stockEnabled)
            return '股票系统未开启。';
        const stocks = await updateStocks();
        const sectors = await sectorsByCode();
        const now = Date.now();
        const group = stocksBySector(stocks);
        const lines = [];
        for (const [sec, arr] of group) {
            const meta = sectors.get(sec);
            lines.push(`${meta?.icon || '📊'} ${meta?.name || sec}（${arr.length} 只）`);
            for (const s of arr) {
                const change = s.prevPrice ? (s.price / s.prevPrice - 1) * 100 : 0;
                const arrow = change >= 0 ? '📈 +' : '📉 ';
                const halted = s.haltedUntil && new Date(s.haltedUntil).getTime() > now;
                const tag = halted ? '🚫停牌' : (s.note ? `📌${s.note}` : '');
                lines.push(`  ${s.code} ${s.name}｜${(0, util_1.fmtMoney)(s.price)}（${arrow}${change.toFixed(2)}%）${tag}`);
            }
        }
        const [meta] = await ctx.database.get('daily_meta', { key: 'stockLastUpdate' });
        const [ipoMeta] = await ctx.database.get('daily_meta', { key: 'stockIPOCounter' });
        const [newsMeta] = await ctx.database.get('daily_meta', { key: 'stockNews' });
        const nextMin = meta ? Math.max(0, Math.ceil((Number(meta.value) + config.stockIntervalMinutes * 60000 - Date.now()) / 60000)) : config.stockIntervalMinutes;
        const out = [`📊 股票行情（按板块，每 ${config.stockIntervalMinutes} 分钟刷新一次）：`, ...lines];
        if (newsMeta?.value)
            out.push(`📰 最新消息：${newsMeta.value}`);
        if (config.ipoPeriods > 0 && stocks.length < config.stockMaxCount) {
            const target = Math.max(1, Math.round(config.ipoPeriods * 60 / Math.max(1, config.stockIntervalMinutes)));
            out.push(`🔔 新股上市倒计时：还需 ${Math.max(1, target - Number(ipoMeta?.value || 0))} 个周期（当前 ${stocks.length}/${config.stockMaxCount} 只）`);
        }
        out.push(`下次刷新约 ${nextMin} 分钟后。更多指令：大盘 / 股票排行 / 资金流 <代码> / 持仓榜`);
        return out.join('\n');
    });
    // 大盘（v1.11.0）：综合指数 + 涨跌分布 + 板块表现
    ctx.command('经济/股票/大盘', '查看大盘指数和板块表现（图表）')
        .alias('大盘')
        .action(async () => {
        if (!config.stockEnabled)
            return '股票系统未开启。';
        const stocks = await updateStocks();
        const sectors = await sectorsByCode();
        if (!ctx.puppeteer) {
            // 降级：文字
            const avg = stocks.reduce((s, st) => s + st.price, 0) / Math.max(1, stocks.length);
            const prevAvg = stocks.reduce((s, st) => s + (st.prevPrice || st.base), 0) / Math.max(1, stocks.length);
            const chg = prevAvg ? (avg / prevAvg - 1) * 100 : 0;
            const group = stocksBySector(stocks);
            const lines = [`📊 大盘指数 ${(0, util_1.fmtMoney)(avg)}（${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%）`, ''];
            for (const [sec, arr] of group) {
                const avgChg = arr.reduce((s, st) => s + (st.prevPrice ? (st.price / st.prevPrice - 1) * 100 : 0), 0) / Math.max(1, arr.length);
                const meta = sectors.get(sec);
                lines.push(`${meta?.icon || '📊'} ${meta?.name || sec}：${avgChg >= 0 ? '+' : ''}${avgChg.toFixed(2)}%（${arr.length} 只）`);
            }
            return lines.join('\n') + '\n提示：启用 puppeteer 插件可看图。';
        }
        try {
            return await ctx.puppeteer.render(buildMarketHTML(stocks, sectors));
        }
        catch (e) {
            logger.warn('大盘图渲染失败：', e);
            return '大盘图渲染失败，请稍后再试。';
        }
    });
    // 股票排行（v1.11.0）：按涨跌幅排前 5 / 后 5
    ctx.command('经济/股票/股票排行 [count:number]', '按涨跌幅排行前 N / 后 N（默认 5）')
        .alias('股票排行', '涨幅榜', '跌幅榜')
        .action(async (_session, count) => {
        if (!config.stockEnabled)
            return '股票系统未开启。';
        const n = Math.min(Math.max(count || 5, 3), 12);
        const stocks = await updateStocks();
        const sorted = [...stocks].sort((a, b) => (b.price / (b.prevPrice || b.base) - 1) - (a.price / (a.prevPrice || a.base) - 1));
        const top = sorted.slice(0, n);
        const bottom = sorted.slice(-n).reverse();
        const lines = ['📊 涨幅榜：'];
        for (const s of top) {
            const chg = (s.price / (s.prevPrice || s.base) - 1) * 100;
            lines.push(`  ${s.code} ${s.name}：${(0, util_1.fmtMoney)(s.price)}（+${chg.toFixed(2)}%）`);
        }
        lines.push('📉 跌幅榜：');
        for (const s of bottom) {
            const chg = (s.price / (s.prevPrice || s.base) - 1) * 100;
            lines.push(`  ${s.code} ${s.name}：${(0, util_1.fmtMoney)(s.price)}（${chg.toFixed(2)}%）`);
        }
        return lines.join('\n');
    });
    // 成交榜（v1.11.0）：当日成交额 / 笔数前 5
    ctx.command('经济/股票/成交榜 [count:number]', '当日成交额排行（默认 5）')
        .alias('成交榜')
        .action(async (_session, count) => {
        if (!config.stockEnabled)
            return '股票系统未开启。';
        const n = Math.min(Math.max(count || 5, 3), 12);
        const today = todayDate();
        const vols = await ctx.database.get('daily_stock_volume', { date: today });
        const stocks = await updateStocks();
        const nameMap = new Map(stocks.map((s) => [s.code, s.name]));
        const sorted = [...vols].sort((a, b) => (b.buyAmount + b.sellAmount) - (a.buyAmount + a.sellAmount));
        const top = sorted.slice(0, n);
        if (!top.length)
            return '今日暂无成交，发送「股票」看看行情，「买入 代码 数量」开始交易。';
        const lines = ['💰 今日成交榜（按总成交额）：'];
        for (const v of top) {
            const total = v.buyAmount + v.sellAmount;
            const net = v.buyAmount - v.sellAmount;
            lines.push(`  ${v.code} ${nameMap.get(v.code) || ''}：${(0, util_1.fmtMoney)(total)}（买 ${(0, util_1.fmtMoney)(v.buyAmount)} / 卖 ${(0, util_1.fmtMoney)(v.sellAmount)} · 净 ${net >= 0 ? '+' : ''}${(0, util_1.fmtMoney)(net)} · ${v.buyCount + v.sellCount} 笔）`);
        }
        return lines.join('\n');
    });
    // 资金流（v1.11.0）：个股当日买卖净额
    ctx.command('经济/股票/资金流 <code:string>', '查看个股当日资金流向（图表）')
        .alias('资金流')
        .action(async ({ session }, code) => {
        if (!session.userId)
            return;
        if (!config.stockEnabled)
            return '股票系统未开启。';
        if (!code)
            return '请提供股票代码，如「资金流 DMHJ」。';
        const upper = String(code).trim().toUpperCase();
        const stocks = await updateStocks();
        const stock = stocks.find((s) => s.code === upper);
        if (!stock)
            return `没有找到股票「${upper}」，发送「股票」查看列表。`;
        const today = todayDate();
        const vols = await ctx.database.get('daily_stock_volume', { code: upper, date: today });
        if (!ctx.puppeteer) {
            const v = vols[0];
            if (!v)
                return `${stock.name}（${upper}）今日暂无成交。`;
            const net = v.buyAmount - v.sellAmount;
            return `${stock.name}（${upper}）今日资金流\n买 ${(0, util_1.fmtMoney)(v.buyAmount)}（${v.buyCount} 笔）\n卖 ${(0, util_1.fmtMoney)(v.sellAmount)}（${v.sellCount} 笔）\n净 ${net >= 0 ? '+' : ''}${(0, util_1.fmtMoney)(net)}\n提示：启用 puppeteer 插件可看图。`;
        }
        try {
            const hist = await ctx.database.get('daily_stock_history', { code: upper }, { sort: { time: 'desc' }, limit: 30 });
            return await ctx.puppeteer.render(buildFlowHTML({ name: stock.name, code: upper }, hist, vols));
        }
        catch (e) {
            logger.warn('资金流渲染失败：', e);
            return '资金流图渲染失败，请稍后再试。';
        }
    });
    ctx.command('经济/股票/K线 [code:string] [count:number]', '查看股票K线走势图')
        .alias('k线', '蜡烛图', '走势图')
        .action(async ({ session }, code, count) => {
        if (!session.userId)
            return;
        if (!config.stockEnabled)
            return '股票系统未开启。';
        if (!code)
            return '请提供股票代码，如「K线 DMHJ」，可指定根数如「K线 DMHJ 48」。';
        const upper = String(code).trim().toUpperCase();
        const stocks = await updateStocks();
        const stock = stocks.find((s) => s.code === upper);
        if (!stock)
            return `没有找到股票「${upper}」，发送「股票」查看列表。`;
        const n = Math.min(Math.max(count || 30, 10), 96);
        const candles = (await ctx.database.get('daily_stock_history', { code: upper }, { sort: { time: 'desc' }, limit: n })).reverse();
        if (!candles.length)
            return '暂无历史K线数据，请等待行情刷新后再试。';
        if (!ctx.puppeteer) {
            const spark = candles.slice(-24).map((c) => (c.close >= c.open ? '█' : '▁')).join('');
            return `${stock.name}（${upper}）近 ${candles.length} 根K线（█涨 ▁跌）：\n${spark}\n提示：未启用 puppeteer 插件，无法生成图片走势。`;
        }
        try {
            return await ctx.puppeteer.render(buildKlineHTML(stock, candles));
        }
        catch (e) {
            logger.warn('K线渲染失败：', e);
            return 'K线图渲染失败，请稍后再试。';
        }
    });
    // 持仓榜（v1.11.0）：玩家浮盈率前 10
    ctx.command('经济/股票/持仓榜', '玩家浮盈率排行榜（前 10）')
        .alias('持仓榜', '股票榜')
        .action(async () => {
        if (!config.stockEnabled)
            return '股票系统未开启。';
        const stocks = await updateStocks();
        const priceMap = new Map(stocks.map((s) => [s.code, s.price]));
        const all = await ctx.database.get('daily_stock_holding');
        // 按 userId 聚合
        const userTotals = new Map();
        for (const h of all) {
            const cur = priceMap.get(h.code) || 0;
            const value = cur * h.quantity;
            const u = userTotals.get(h.userId) || { value: 0, cost: 0 };
            u.value += value;
            u.cost += h.cost;
            userTotals.set(h.userId, u);
        }
        const ranked = Array.from(userTotals.entries())
            .map(([uid, u]) => ({ uid, value: u.value, cost: u.cost, profit: u.value - u.cost, pct: u.cost > 0 ? (u.value - u.cost) / u.cost * 100 : 0 }))
            .sort((a, b) => b.pct - a.pct)
            .slice(0, 10);
        if (!ranked.length)
            return '当前无人持仓，发送「股票」看行情，「买入 代码 数量」建仓。';
        const lines = ['🏆 持仓浮盈榜（前 10）：'];
        ranked.forEach((r, i) => {
            lines.push(`  ${i + 1}. ${r.uid}：${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(2)}%（市值 ${(0, util_1.fmtMoney)(r.value)} · 成本 ${(0, util_1.fmtMoney)(r.cost)} · 浮盈 ${r.profit >= 0 ? '+' : ''}${(0, util_1.fmtMoney)(r.profit)}）`);
        });
        return lines.join('\n');
    });
    ctx.command('经济/股票/买入 <code:string> <qty:integer>', '用现金买入股票')
        .action(async ({ session }, code, qty) => {
        if (!session.userId)
            return;
        if (!config.stockEnabled)
            return '股票系统未开启。';
        const key = (0, util_1.userKey)(session);
        if (!code)
            return '请提供股票代码，如「买入 DMHJ 10」。';
        const upper = String(code).trim().toUpperCase();
        if (!qty || qty <= 0)
            return '购买数量必须是正整数。';
        const stocks = await updateStocks();
        const stock = stocks.find((s) => s.code === upper);
        if (!stock)
            return `没有找到股票「${upper}」，发送「股票」查看列表。`;
        if (stock.haltedUntil && new Date(stock.haltedUntil).getTime() > Date.now()) {
            return `🚫 ${stock.name}（${upper}）已停牌，暂停交易，复牌时间约 ${(0, util_1.fmtTime)(new Date(stock.haltedUntil).getTime())}。`;
        }
        const total = Math.round(stock.price * qty);
        if (total <= 0)
            return '购买数量太少啦。';
        const row = await core.getUser(key);
        if (row.points < total)
            return `现金不足：需要 ${total}，当前 ${row.points}。`;
        const [holding] = await ctx.database.get('daily_stock_holding', { userId: key, code: upper });
        // 事务：扣现金 + 更新/创建持仓 + 写入成交量 + 应用价格冲击
        return await core.dbTx(async (db) => {
            const dbAny = db;
            if (holding) {
                await dbAny.set('daily_stock_holding', { id: holding.id }, {
                    quantity: holding.quantity + qty,
                    cost: holding.cost + total,
                });
            }
            else {
                await dbAny.create('daily_stock_holding', {
                    userId: key,
                    code: upper,
                    quantity: qty,
                    cost: total,
                });
            }
            await dbAny.set('daily_points', { userId: key }, { points: row.points - total });
            // 写入成交量 + 冲击
            const { bias, event } = await recordTrade(upper, 'buy', total);
            if (Math.abs(bias) > 0.001) {
                const [s] = await dbAny.get('daily_stocks', { code: upper });
                if (s)
                    await dbAny.set('daily_stocks', { code: upper }, { price: Math.max(0.5, Math.round(s.price * (1 + bias) * 100) / 100) });
            }
            const evtText = event === '追捧' ? ' 📢触发散户追捧事件！' : '';
            return `买入成功：${stock.name}（${upper}）× ${qty} @ ${(0, util_1.fmtMoney)(stock.price)}，花费 ${total}，现金剩余 ${row.points - total}${evtText}`;
        });
    });
    ctx.command('经济/股票/卖出 <code:string> <qty:integer>', '卖出股票换回现金')
        .action(async ({ session }, code, qty) => {
        if (!session.userId)
            return;
        if (!config.stockEnabled)
            return '股票系统未开启。';
        const key = (0, util_1.userKey)(session);
        if (!code)
            return '请提供股票代码，如「卖出 DMHJ 10」。';
        const upper = String(code).trim().toUpperCase();
        const [holding] = await ctx.database.get('daily_stock_holding', { userId: key, code: upper });
        if (!holding || !holding.quantity)
            return `你没有持有 ${upper}，发送「持仓」查看。`;
        if (!qty || qty <= 0)
            return '卖出数量必须是正整数。';
        if (qty > holding.quantity)
            return `持有数量不足（当前 ${holding.quantity}）。`;
        const stocks = await updateStocks();
        const stock = stocks.find((s) => s.code === upper);
        if (!stock)
            return `没有找到股票「${upper}」的数据。`;
        if (stock.haltedUntil && new Date(stock.haltedUntil).getTime() > Date.now()) {
            return `🚫 ${stock.name}（${upper}）已停牌，暂停交易，复牌时间约 ${(0, util_1.fmtTime)(new Date(stock.haltedUntil).getTime())}。`;
        }
        const proceeds = Math.round(stock.price * qty);
        const costPart = Math.round(holding.cost * qty / holding.quantity);
        const profit = proceeds - costPart;
        const row = await core.getUser(key);
        // 事务：减仓 + 加现金 + 写入成交量 + 应用价格冲击
        return await core.dbTx(async (db) => {
            const dbAny = db;
            if (qty === holding.quantity) {
                await dbAny.remove('daily_stock_holding', { id: holding.id });
            }
            else {
                await dbAny.set('daily_stock_holding', { id: holding.id }, {
                    quantity: holding.quantity - qty,
                    cost: holding.cost - costPart,
                });
            }
            await dbAny.set('daily_points', { userId: key }, { points: row.points + proceeds });
            const { bias, event } = await recordTrade(upper, 'sell', proceeds);
            if (Math.abs(bias) > 0.001) {
                const [s] = await dbAny.get('daily_stocks', { code: upper });
                if (s)
                    await dbAny.set('daily_stocks', { code: upper }, { price: Math.max(0.5, Math.round(s.price * (1 + bias) * 100) / 100) });
            }
            const evtText = event === '踩踏' ? ' 📢触发恐慌踩踏事件！' : '';
            return [
                `卖出成功：${stock.name}（${upper}）× ${qty} @ ${(0, util_1.fmtMoney)(stock.price)}，获得 ${proceeds}${evtText}`,
                `本次盈亏：${profit >= 0 ? '+' : ''}${profit}（成本 ${costPart}）`,
                `现金：${row.points + proceeds}`,
            ].join('\n');
        });
    });
    ctx.command('经济/股票/持仓', '查看我的股票持仓')
        .alias('我的持仓')
        .action(async ({ session }) => {
        if (!session.userId)
            return;
        if (!config.stockEnabled)
            return '股票系统未开启。';
        const key = (0, util_1.userKey)(session);
        const holdings = await ctx.database.get('daily_stock_holding', { userId: key });
        if (!holdings.length)
            return '当前空仓，发送「股票」查看行情，「买入 代码 数量」建仓。';
        const stocks = await updateStocks();
        const priceMap = new Map(stocks.map((s) => [s.code, s]));
        let totalValue = 0, totalCost = 0;
        const lines = holdings.map((hld) => {
            const s = priceMap.get(hld.code);
            const price = s ? s.price : 0;
            const value = Math.round(price * hld.quantity);
            const avg = hld.quantity ? hld.cost / hld.quantity : 0;
            const profit = value - hld.cost;
            totalValue += value;
            totalCost += hld.cost;
            const pct = hld.cost > 0 ? ((profit / hld.cost) * 100).toFixed(2) : '0.00';
            return `${hld.code}｜持有 ${hld.quantity} 股｜现价 ${(0, util_1.fmtMoney)(price)}｜市值 ${value}｜成本均价 ${(0, util_1.fmtMoney)(avg)}｜浮盈 ${profit >= 0 ? '+' : ''}${profit}（${profit >= 0 ? '+' : ''}${pct}%）`;
        });
        const tp = totalValue - totalCost;
        const row = await core.getUser(key);
        const div = Math.floor(row.dividendTotal || 0);
        const outLines = [`📈 我的持仓（市值 ${totalValue}，总成本 ${Math.round(totalCost)}）：`, ...lines,
            `合计浮盈：${tp >= 0 ? '+' : ''}${tp}（${totalCost > 0 ? ((tp / totalCost) * 100).toFixed(2) : '0.00'}%）`];
        if (div > 0)
            outLines.push(`累计分红：${div} 积分（分红自动存入现金）`);
        return outLines.join('\n');
    });
    return { updateStocks, scheduleUpdates };
}
