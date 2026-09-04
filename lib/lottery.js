"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerLottery = registerLottery;
const koishi_1 = require("koishi");
const config_1 = require("./config");
const util_1 = require("./util");
/** 把 config 里的两个数组压平成有序档位数组（特 → 安慰）。长度按最小者截断。 */
function buildTiers(config) {
    const labels = ['特等奖', '一等奖', '二等奖', '三等奖', '安慰奖'];
    const keys = ['special', 'first', 'second', 'third', 'consolation'];
    const levels = (config.lotteryMatchLevels && config.lotteryMatchLevels.length) ? config.lotteryMatchLevels : [6, 5, 4, 3, 1];
    const ratios = (config.lotteryTierPayouts && config.lotteryTierPayouts.length) ? config.lotteryTierPayouts : [0.5, 0.2, 0.15, 0.1, 0.05];
    const n = Math.min(levels.length, ratios.length, labels.length, keys.length);
    const tiers = [];
    for (let i = 0; i < n; i++) {
        tiers.push({ key: keys[i], label: labels[i], level: levels[i], ratio: ratios[i] });
    }
    return tiers;
}
/** 计算 ticket 与 winning 的前缀匹配位数（digits 位）。 */
function prefixMatch(winning, ticket, digits) {
    let matched = 0;
    const max = Math.min(winning.length, ticket.length, digits);
    for (let i = 0; i < max; i++) {
        if (winning[i] === ticket[i])
            matched++;
        else
            break;
    }
    return matched;
}
/** 解析彩票命令参数。返回 picks（自选号码数组）+ autoCount（机选注数）。 */
function parseLotteryArgs(args, digits, maxTickets) {
    if (!args || !args.trim())
        return { picks: [], autoCount: 1 };
    const tokens = args.trim().split(/\s+/).filter(Boolean);
    const picks = [];
    let autoCount = 0;
    const numRe = new RegExp(`^[0-9]{${digits}}$`);
    const intRe = /^\d+$/;
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (numRe.test(t)) {
            if (picks.includes(t))
                return { picks, autoCount, error: `重复号码：${t}` };
            picks.push(t);
        }
        else if (intRe.test(t) && i === tokens.length - 1) {
            autoCount = parseInt(t);
        }
        else {
            return { picks, autoCount, error: `无效参数 "${t}"：号码必须是 ${digits} 位数字，或在末尾追加机选注数（整数）` };
        }
    }
    const total = picks.length + autoCount;
    if (total < 1)
        return { picks, autoCount, error: '至少买 1 注。' };
    if (total > maxTickets)
        return { picks, autoCount, error: `单期最多买 ${maxTickets} 注，当前 ${total} 注。` };
    return { picks, autoCount };
}
/** 彩票系统：买票 + 定期开奖 + 多档奖项 + 赌场奖池注入 */
function registerLottery({ ctx, config, core, casino, logger }) {
    const tiers = buildTiers(config);
    async function ensureLotteryPeriod() {
        // 用一个 inFlight promise 串行化并发调用（scheduleDraws 和 buy 可能同时触发）
        const prev = ensureLotteryPeriod._inFlight;
        let resolveNext;
        const next = new Promise((res) => { resolveNext = res; });
        ensureLotteryPeriod._inFlight = next;
        if (prev) {
            try {
                await prev;
            }
            catch (_) { /* swallow */ }
        }
        try {
            const openRows = await ctx.database.get('daily_lottery_periods', { status: 'open' }, { sort: { period: 'desc' }, limit: 1 });
            const open = Array.isArray(openRows) ? openRows : [];
            if (open.length) {
                resolveNext(open[0]);
                return open[0];
            }
            const lastRows = await ctx.database.get('daily_lottery_periods', {}, { sort: { period: 'desc' }, limit: 1 });
            const last = Array.isArray(lastRows) ? lastRows : [];
            const nextPeriod = last.length ? last[0].period + 1 : 1;
            const now = Date.now();
            const created = await ctx.database.create('daily_lottery_periods', {
                period: nextPeriod,
                status: 'open',
                openedAt: new Date(now),
                ticketCount: 0,
                carriedOver: 0,
                casinoContribution: 0,
                basePool: 0,
                ticketRevenue: 0,
                poolTotal: 0,
                payoutTotal: 0,
                winningTier: '',
            });
            const result = Array.isArray(created) ? created[0] : created;
            resolveNext(result);
            return result;
        }
        catch (e) {
            resolveNext(null);
            logger.warn('ensureLotteryPeriod 失败：', e.message);
            return null;
        }
        finally {
            if (ensureLotteryPeriod._inFlight === next)
                ensureLotteryPeriod._inFlight = undefined;
        }
    }
    ensureLotteryPeriod._inFlight = undefined;
    /** 奖池里程碑检测 + broadcast（多档：50/100/500/1000/5000/10000） */
    async function checkPoolMilestones(newPoolAmount) {
        if (!config.lotteryEnabled)
            return;
        const milestones = [50, 100, 500, 1000, 5000, 10000];
        let reached = [];
        try {
            const meta = await ctx.database.get('daily_meta', { key: 'lotteryMilestonesReached' });
            const metaArr = Array.isArray(meta) ? meta : [];
            if (metaArr[0]) {
                const raw = String(metaArr[0].value);
                reached = raw.split(',').map(s => parseInt(s)).filter(n => Number.isFinite(n));
            }
        }
        catch (_) { /* ignore */ }
        const newlyReached = [];
        for (const m of milestones) {
            if (newPoolAmount >= m && !reached.includes(m)) {
                newlyReached.push(m);
                reached.push(m);
            }
        }
        if (newlyReached.length) {
            try {
                await ctx.database.upsert('daily_meta', [{ key: 'lotteryMilestonesReached', value: reached.join(',') }]);
            }
            catch (_) { /* ignore */ }
            for (const m of newlyReached) {
                const msg = `🎉 奖池突破 ${m}！当前 ${Math.round(newPoolAmount)} 积分，下一期开得更大！`;
                try {
                    await core.broadcast(msg);
                }
                catch (_) { /* ignore */ }
                logger.info(msg);
            }
        }
    }
    /**
     * 把所有票按"最高档位"归档：返回 Map<tierKey, 票数组>。同一张票只出现在最高档。
     * "最高档"按 tiers 数组从前往后匹配（即特等奖优先）。
     */
    function bucketTicketsByBestTier(winning, tickets, digits) {
        const buckets = new Map();
        for (const t of tickets) {
            const matched = prefixMatch(winning, t.number, digits);
            let assigned = null;
            for (const tier of tiers) {
                if (matched >= tier.level) {
                    assigned = tier.key;
                    break;
                }
            }
            if (!assigned)
                continue;
            const arr = buckets.get(assigned) || [];
            arr.push(t);
            buckets.set(assigned, arr);
        }
        return buckets;
    }
    async function drawLotteryIfDue(force = false) {
        if (!config.lotteryEnabled)
            return null;
        const cur = await ensureLotteryPeriod();
        if (!cur)
            return null;
        const intervalMs = config.lotteryIntervalHours * config_1.HOUR;
        const due = force || (Date.now() - new Date(cur.openedAt).getTime() >= intervalMs);
        if (!due)
            return null;
        const digits = Math.floor(config.lotteryDigits);
        const tickets = await ctx.database.get('daily_lottery_tickets', { period: cur.period });
        // 1) 计算奖池来源
        const ticketRevenue = tickets.length * config.lotteryPrice;
        const basePool = Math.max(0, Math.floor(config.lotteryBasePool || 0));
        let casinoContribution = 0;
        if (config.lotteryIncludeCasinoPool) {
            const poolBefore = await casino.getCasinoPool();
            // 抽走赌场全部奖池（若奖池 < 100 万，抽走全部；否则按"基础 100 万 + 当前赌场池"抽走，最多抽完）
            const target = basePool + Math.max(0, poolBefore.amount);
            // 用 transferFromCasinoPool(target) 抽最多 target；用 minato 限制：赌场池不足就抽光
            casinoContribution = await casino.transferFromCasinoPool(target);
        }
        const carriedOver = cur.carriedOver || 0;
        const poolTotal = ticketRevenue + basePool + casinoContribution + carriedOver;
        // 2) 摇号：只从已购买号码集合中抽（空期回退到纯随机）
        let winning = '';
        const uniqNumbers = Array.from(new Set(tickets.map((t) => String(t.number))));
        if (uniqNumbers.length > 0) {
            winning = uniqNumbers[Math.floor(Math.random() * uniqNumbers.length)];
        }
        else {
            for (let i = 0; i < digits; i++)
                winning += String(Math.floor(Math.random() * 10));
        }
        // 3) 分档
        const buckets = bucketTicketsByBestTier(winning, tickets, digits);
        let highestTier = 'none';
        for (const tier of tiers) {
            if (buckets.get(tier.key)?.length) {
                highestTier = tier.key;
                break;
            }
        }
        const tierPayouts = new Map(); // tierKey → 单份奖金
        const tierWinnerCount = new Map();
        let payoutTotal = 0;
        const winnerRows = [];
        // 按特→安慰顺序派奖；某档无中奖者时该档奖金滚入下一档；末档无中奖者时滚入下期（由 carriedOver 兜底）
        let reservedForNext = 0;
        // 先按从特等奖开始的顺序累加 ratio，用于"未中奖滚入下一档"逻辑
        // 简化：固定按 tier.ratio × poolTotal 切池，剩余金额 = poolTotal - sum(ratio*poolTotal)，作为 carriedOver 滚入下期
        for (const tier of tiers) {
            const winners = buckets.get(tier.key) || [];
            if (winners.length === 0)
                continue;
            const tierPool = Math.floor(poolTotal * tier.ratio);
            const perWinner = Math.max(1, Math.floor(tierPool / winners.length));
            tierPayouts.set(tier.key, perWinner);
            tierWinnerCount.set(tier.key, winners.length);
            payoutTotal += perWinner * winners.length;
            for (const w of winners) {
                winnerRows.push({
                    period: cur.period,
                    userId: w.userId,
                    number: w.number,
                    tier: tier.key,
                    matchedCount: prefixMatch(winning, w.number, digits),
                    prize: perWinner,
                    createdAt: new Date(),
                });
            }
        }
        const nextCarry = Math.max(0, poolTotal - payoutTotal);
        // 4) 写库：更新本期 + 写 winners + 派奖到用户 + 新期（如果全未中或部分滚存）
        //    用 dbTx 保证原子性
        const totalPayout = payoutTotal;
        if (winnerRows.length) {
            await ctx.database.upsert('daily_lottery_winners', winnerRows);
        }
        // 派奖：每人加 prize 积分（同一用户可能多条票命中同档，winnerRows 已经按票展开）
        // 用 Map 合并同一 userId 的奖金（同一期同一用户可能多张票分散在不同档）
        const userPayouts = new Map();
        for (const r of winnerRows) {
            if (!r.userId || r.userId === '__none__')
                continue;
            userPayouts.set(r.userId, (userPayouts.get(r.userId) || 0) + (r.prize || 0));
        }
        // 事务：发奖 + 标定期数 原子化
        await core.dbTx(async (db) => {
            const dbAny = db;
            // 派奖（每人一次）
            for (const [uid, prize] of userPayouts) {
                const uRow = await core.getUser(uid);
                await dbAny.set('daily_points', { userId: uid }, { points: uRow.points + prize });
            }
            // 标定期数
            await dbAny.set('daily_lottery_periods', { id: cur.id }, {
                status: 'drawn',
                winningNumber: winning,
                drawnAt: new Date(),
                ticketCount: tickets.length,
                casinoContribution,
                basePool,
                ticketRevenue,
                poolTotal,
                payoutTotal: totalPayout,
                winningTier: highestTier,
                winnerId: winnerRows[0]?.userId || null,
            });
            // 创建新一期（滚存下一期）
            await dbAny.create('daily_lottery_periods', {
                period: cur.period + 1,
                status: 'open',
                openedAt: new Date(),
                ticketCount: 0,
                carriedOver: nextCarry,
                casinoContribution: 0,
                basePool: 0,
                ticketRevenue: 0,
                poolTotal: 0,
                payoutTotal: 0,
                winningTier: '',
            });
        });
        // 中奖后重置里程碑（奖池被领走 / 大部分发完）
        try {
            await ctx.database.upsert('daily_meta', [{ key: 'lotteryMilestonesReached', value: '' }]);
        }
        catch (_) { }
        // 5) 构造开奖播报
        const news = buildDrawNews({
            period: cur.period,
            winning,
            digits,
            highestTier,
            tiers,
            tierWinnerCount,
            tierPayouts,
            ticketCount: tickets.length,
            poolTotal,
            payoutTotal: totalPayout,
            basePool,
            casinoContribution,
            carriedOver,
            ticketRevenue,
            nextCarry,
            userPayouts,
        });
        await ctx.database.upsert('daily_meta', [{ key: 'lotteryNews', value: news }]);
        logger.info(news);
        await core.broadcast(news);
        return {
            period: cur.period,
            winning,
            highestTier,
            poolTotal,
            payoutTotal: totalPayout,
            winnerCount: userPayouts.size,
            carriedOverNext: nextCarry,
        };
    }
    /** 组装开奖播报（含每档中奖明细） */
    function buildDrawNews(opts) {
        const { period, winning, digits, highestTier, tiers, tierWinnerCount, tierPayouts, ticketCount, poolTotal, payoutTotal, basePool, casinoContribution, carriedOver, ticketRevenue, nextCarry, userPayouts } = opts;
        const lines = [];
        const time = (0, util_1.fmtTime)(Date.now());
        lines.push(`【${time}】🎰 彩票第 ${period} 期开奖：号码 ${winning}`);
        lines.push(`📊 本期奖池：${(0, util_1.fmtMoney)(poolTotal)}（基础池 ${(0, util_1.fmtMoney)(basePool)} + 赌场池 ${(0, util_1.fmtMoney)(casinoContribution)} + 票数收入 ${(0, util_1.fmtMoney)(ticketRevenue)} + 上期滚存 ${(0, util_1.fmtMoney)(carriedOver)}）`);
        if (ticketCount === 0) {
            lines.push(`本期 ${ticketCount} 注，无人购票，纯靠赌场 + 基础池开奖。`);
        }
        if (highestTier === 'none' || tierWinnerCount.size === 0) {
            lines.push(`无人中奖，奖池 ${(0, util_1.fmtMoney)(nextCarry)} 滚入第 ${period + 1} 期。`);
        }
        else {
            // 各档中奖明细
            lines.push(`💸 中奖派发 ${(0, util_1.fmtMoney)(payoutTotal)}：`);
            for (const tier of tiers) {
                const cnt = tierWinnerCount.get(tier.key);
                if (!cnt)
                    continue;
                const each = tierPayouts.get(tier.key) || 0;
                const total = each * cnt;
                lines.push(`  ${tier.label}（${tier.level}位匹配）：${cnt} 注 × ${(0, util_1.fmtMoney)(each)} = ${(0, util_1.fmtMoney)(total)}`);
            }
            if (nextCarry > 0) {
                lines.push(`  ↳ 剩余 ${(0, util_1.fmtMoney)(nextCarry)} 滚入第 ${period + 1} 期。`);
            }
        }
        // 总览中奖人
        if (userPayouts.size > 0) {
            const total = userPayouts.size;
            const winnerSample = Array.from(userPayouts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([uid, prize]) => {
                const display = uid.includes(':') ? uid.split(':')[1] : uid;
                return `${(0, koishi_1.h)('at', { id: display })}+${(0, util_1.fmtMoney)(prize)}`;
            })
                .join(' / ');
            lines.push(`🎉 本期 ${total} 位玩家中奖${total > 5 ? '（前 5）' : ''}：${winnerSample}`);
        }
        return lines.join('\n');
    }
    function scheduleDraws() {
        if (!config.lotteryEnabled)
            return;
        ensureLotteryPeriod().catch((e) => logger.warn('彩票期数初始化失败：', e));
        let inFlight = false;
        ctx.setInterval(() => {
            if (inFlight)
                return;
            inFlight = true;
            drawLotteryIfDue()
                .catch((e) => logger.warn('彩票开奖失败：', e))
                .finally(() => { inFlight = false; });
        }, 30 * 60000);
    }
    ctx.command('经济/娱乐', '娱乐系统总菜单（赌场 / 彩票 / 刮刮乐 / 抢劫）')
        .action(async () => {
        const pool = await casino.getCasinoPool();
        const cur = await ensureLotteryPeriod();
        const lastDraw = await ctx.database.get('daily_lottery_periods', { status: 'drawn' }, { sort: { period: 'desc' }, limit: 1 });
        const lines = [
            '🎲 娱乐指令（刺激型玩家专享）：',
            '  赌场 —— 猜大小 / 轮盘 / 21点 / 老虎机 / 百家乐 / 牛牛，庄家抽水 5%',
            '  彩票 —— 每期 10 积分一注，多档奖项（特/一/二/三/安慰），奖池 = 基础池 + 赌场池 + 票数收入 + 上期滚存',
            '  刮刮乐 —— 即买即开，小奖概率高、大奖概率极低',
            '  抢劫 @某人 —— 抢别人现金，成功拿 30%，失败赔 50%（有冷却+坐牢）',
            '',
            `💰 当前赌场奖池：${(0, util_1.fmtMoney)(pool.amount)}（每期开奖会被彩票抽走）`,
            `🎰 彩票当前第 ${cur.period} 期，已累计 ${cur.ticketCount} 注，滚存 ${(0, util_1.fmtMoney)(cur.carriedOver || 0)}`,
        ];
        if (lastDraw.length) {
            const last = lastDraw[0];
            const tierLabel = last.winningTier && last.winningTier !== 'none'
                ? `${last.winningTier}档`
                : '无人中奖';
            lines.push(`📜 上期开奖：第 ${last.period} 期 号码 ${last.winningNumber}｜${tierLabel}｜奖池 ${(0, util_1.fmtMoney)(last.poolTotal || 0)}（派发 ${(0, util_1.fmtMoney)(last.payoutTotal || 0)}）`);
        }
        return lines.join('\n');
    });
    ctx.command('经济/娱乐/彩票 [args:text]', '买彩票：自选或机选，例「彩票 123456 654321」或「彩票 5」机选 5 注')
        .alias('lottery', '买彩票', 'caipiao')
        .action(async ({ session }, args) => {
        if (!session.userId)
            return;
        if (!config.lotteryEnabled)
            return '彩票系统未开启。';
        const key = (0, util_1.userKey)(session);
        await drawLotteryIfDue();
        const cur = await ensureLotteryPeriod();
        const digits = Math.floor(config.lotteryDigits);
        const parsed = parseLotteryArgs(args, digits, config.lotteryMaxTicketsPerUser);
        if (parsed.error)
            return parsed.error;
        const { picks, autoCount } = parsed;
        const want = picks.length + autoCount;
        const cost = want * config.lotteryPrice;
        const row = await core.getUser(key);
        if (cost > row.points)
            return `现金不足：本想买 ${want} 注共 ${cost} 积分，当前现金 ${row.points}。`;
        // 事务：扣现金 + 创建彩票投注 + 增加期号计数 原子化
        const result = await core.dbTx(async (db) => {
            const dbAny = db;
            await dbAny.set('daily_points', { userId: key }, { points: row.points - cost });
            const tickets = [];
            const numbers = [...picks];
            for (let i = 0; i < autoCount; i++) {
                let num = '';
                for (let d = 0; d < digits; d++)
                    num += Math.floor(Math.random() * 10);
                numbers.push(num);
            }
            for (const num of numbers) {
                tickets.push({ period: cur.period, userId: key, number: num, createdAt: new Date() });
            }
            await dbAny.upsert('daily_lottery_tickets', tickets);
            await dbAny.set('daily_lottery_periods', { id: cur.id }, { ticketCount: cur.ticketCount + want });
            return numbers;
        });
        // 计算当前期累计奖池（票数 × 单价 + 滚存 + 赌场池 + 基础池），用于里程碑检查
        const newTicketCount = cur.ticketCount + want;
        const newTicketRevenue = newTicketCount * config.lotteryPrice;
        const poolBefore = await casino.getCasinoPool();
        const newPoolEstimate = newTicketRevenue + Math.max(0, config.lotteryBasePool || 0) + (config.lotteryIncludeCasinoPool ? Math.max(0, poolBefore.amount) : 0) + (cur.carriedOver || 0);
        // 买票后异步检查里程碑（不阻塞主返回）
        checkPoolMilestones(newPoolEstimate).catch(() => { });
        const lastDraw = await ctx.database.get('daily_lottery_periods', { status: 'drawn' }, { sort: { period: 'desc' }, limit: 1 });
        const lines = [
            `🎰 第 ${cur.period} 期：你买了 ${want} 注，扣 ${cost} 积分${picks.length ? `（${picks.length} 注自选）` : '（机选）'}`,
            `你的号码：${result.join(' / ')}`,
            `当前奖池预计：${(0, util_1.fmtMoney)(newPoolEstimate)}（基础池 ${(0, util_1.fmtMoney)(config.lotteryBasePool || 0)} + 赌场池 ${(0, util_1.fmtMoney)(config.lotteryIncludeCasinoPool ? poolBefore.amount : 0)} + 票数收入 ${(0, util_1.fmtMoney)(newTicketRevenue)} + 上期滚存 ${(0, util_1.fmtMoney)(cur.carriedOver || 0)}）`,
            `每 ${config.lotteryIntervalHours} 小时开奖一次，共 5 档奖项（中奖号只从已购票中摇出）：`,
            ...tiers.map((t) => `  ${t.label}：匹配 ${t.level} 位，奖池占比 ${(t.ratio * 100).toFixed(0)}%`),
        ];
        if (lastDraw.length) {
            const last = lastDraw[0];
            const tierLabel = last.winningTier && last.winningTier !== 'none'
                ? `${last.winningTier}档`
                : '无人中奖';
            lines.push(`📜 上期（第 ${last.period} 期）开奖：${last.winningNumber}｜${tierLabel}｜派发 ${(0, util_1.fmtMoney)(last.payoutTotal || 0)}`);
        }
        lines.push(`当前现金：${row.points - cost}`);
        return lines.join('\n');
    });
    /** 查询彩票本期 + 上期 + 中奖明细 */
    ctx.command('经济/娱乐/彩票查询', '查询本期彩票状态、上期开奖结果与中奖明细')
        .alias('彩票查询', 'lottery-status')
        .action(async () => {
        const cur = await ensureLotteryPeriod();
        const poolBefore = await casino.getCasinoPool();
        const lastDraw = await ctx.database.get('daily_lottery_periods', { status: 'drawn' }, { sort: { period: 'desc' }, limit: 1 });
        const lines = [];
        lines.push(`🎰 彩票当前第 ${cur.period} 期`);
        lines.push(`  累计注数：${cur.ticketCount}`);
        lines.push(`  上期滚存：${(0, util_1.fmtMoney)(cur.carriedOver || 0)}`);
        lines.push(`  基础池（固定）：${(0, util_1.fmtMoney)(config.lotteryBasePool || 0)}`);
        lines.push(`  赌场池（${config.lotteryIncludeCasinoPool ? '启用，开奖时全部注入' : '关闭'}）：${(0, util_1.fmtMoney)(poolBefore.amount)}`);
        lines.push(`  5 档比例：${tiers.map((t) => `${t.label} ${(t.ratio * 100).toFixed(0)}%`).join(' / ')}`);
        if (lastDraw.length) {
            const last = lastDraw[0];
            lines.push(`📜 上期（第 ${last.period} 期）开奖：${last.winningNumber}（${last.winningTier && last.winningTier !== 'none' ? last.winningTier + '档' : '无人中奖'}）`);
            lines.push(`  奖池：${(0, util_1.fmtMoney)(last.poolTotal || 0)}｜派发：${(0, util_1.fmtMoney)(last.payoutTotal || 0)}｜滚存下期：${(0, util_1.fmtMoney)(last.poolTotal - last.payoutTotal)}`);
            const winners = await ctx.database.get('daily_lottery_winners', { period: last.period });
            if (winners.length) {
                lines.push(`  中奖明细（${winners.length} 条）：`);
                // 按 tier 排序
                const tierOrder = new Map(tiers.map((t, i) => [t.key, i]));
                winners.sort((a, b) => (tierOrder.get(a.tier) ?? 99) - (tierOrder.get(b.tier) ?? 99));
                for (const w of winners.slice(0, 20)) {
                    const tierSpec = tiers.find((t) => t.key === w.tier);
                    const display = w.userId.includes(':') ? w.userId.split(':')[1] : w.userId;
                    lines.push(`    ${tierSpec?.label || w.tier} ${(0, koishi_1.h)('at', { id: display })} 号码 ${w.number} +${(0, util_1.fmtMoney)(w.prize)}`);
                }
                if (winners.length > 20)
                    lines.push(`    ... 还有 ${winners.length - 20} 条`);
            }
        }
        return lines.join('\n');
    });
    return { ensureLotteryPeriod, drawLotteryIfDue, scheduleDraws, checkPoolMilestones };
}
