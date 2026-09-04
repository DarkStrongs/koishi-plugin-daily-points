"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerLottery = registerLottery;
const koishi_1 = require("koishi");
const config_1 = require("./config");
const util_1 = require("./util");
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
/** 彩票系统：买票 + 定期开奖 + 全局奖池滚存 */
function registerLottery({ ctx, config, core, casino, logger }) {
    async function ensureLotteryPeriod() {
        try {
            const openRows = await ctx.database.get('daily_lottery_periods', { status: 'open' }, { sort: { period: 'desc' }, limit: 1 });
            const open = Array.isArray(openRows) ? openRows : [];
            if (open.length)
                return open[0];
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
            });
            return Array.isArray(created) ? created[0] : created;
        }
        catch (e) {
            logger.warn('ensureLotteryPeriod 失败：', e.message);
            return null;
        }
    }
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
        const tickets = await ctx.database.get('daily_lottery_tickets', { period: cur.period });
        const digits = Math.floor(config.lotteryDigits);
        let winning = '';
        for (let i = 0; i < digits; i++)
            winning += Math.floor(Math.random() * 10);
        let winnerId = null;
        for (const t of tickets) {
            if (t.number === winning) {
                winnerId = t.userId;
                break;
            }
        }
        const totalTickets = tickets.length;
        const ticketRevenue = totalTickets * config.lotteryPrice;
        const pool = ticketRevenue + (cur.carriedOver || 0);
        await ctx.database.set('daily_lottery_periods', { id: cur.id }, {
            status: 'drawn',
            winningNumber: winning,
            drawnAt: new Date(),
            winnerId: winnerId || null,
            ticketCount: totalTickets,
        });
        let news = `【${(0, util_1.fmtTime)(Date.now())}】🎰 彩票第 ${cur.period} 期开奖：号码 ${winning}`;
        if (winnerId) {
            const wRow = await core.getUser(winnerId);
            // 事务：发奖 + 标定期数 原子化
            await core.dbTx(async (db) => {
                const dbAny = db;
                await dbAny.set('daily_points', { userId: winnerId }, { points: wRow.points + pool });
            });
            // 中奖后重置里程碑（奖池被领走）
            try {
                await ctx.database.upsert('daily_meta', [{ key: 'lotteryMilestonesReached', value: '' }]);
            }
            catch (_) { }
            const wid = winnerId.includes(':') ? winnerId.split(':')[1] : winnerId;
            news += `，🎉 ${(0, koishi_1.h)('at', { id: wid })} 全中头奖，独得奖池 ${pool} 积分！`;
        }
        else {
            await ctx.database.create('daily_lottery_periods', {
                period: cur.period + 1,
                status: 'open',
                openedAt: new Date(Date.now()),
                ticketCount: 0,
                carriedOver: pool,
            });
            news += `，无人全中，奖池 ${pool} 滚入第 ${cur.period + 1} 期。`;
            // 滚存后检查里程碑
            await checkPoolMilestones(pool);
        }
        await ctx.database.upsert('daily_meta', [{ key: 'lotteryNews', value: news }]);
        logger.info(news);
        await core.broadcast(news);
        return { period: cur.period, winning, winnerId, pool };
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
            '  彩票 —— 每期 10 积分一注，支持自选号码（例「彩票 123456」）',
            '  刮刮乐 —— 即买即开，小奖概率高、大奖概率极低',
            '  抢劫 @某人 —— 抢别人现金，成功拿 30%，失败赔 50%（有冷却+坐牢）',
            '',
            `💰 当前赌场奖池：${(Math.round(pool.amount * 100) / 100).toString()}`,
            `🎰 彩票当前第 ${cur.period} 期，已累计 ${cur.ticketCount} 注`,
        ];
        if (lastDraw.length) {
            lines.push(`📜 上期开奖：第 ${lastDraw[0].period} 期 号码 ${lastDraw[0].winningNumber}（${lastDraw[0].winnerId ? '🎉 已有人中头奖' : '无人全中，奖池已滚入新期'}）`);
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
        // 计算当前期累计奖池（票数 × 单价 + 滚存），用于里程碑检查
        const newTicketCount = cur.ticketCount + want;
        const newPoolEstimate = newTicketCount * config.lotteryPrice + (cur.carriedOver || 0);
        // 买票后异步检查里程碑（不阻塞主返回）
        checkPoolMilestones(newPoolEstimate).catch(() => { });
        const lastDraw = await ctx.database.get('daily_lottery_periods', { status: 'drawn' }, { sort: { period: 'desc' }, limit: 1 });
        const lines = [
            `🎰 第 ${cur.period} 期：你买了 ${want} 注，扣 ${cost} 积分${picks.length ? `（${picks.length} 注自选）` : '（机选）'}`,
            `你的号码：${result.join(' / ')}`,
            `当前奖池（含本期累计）：${newPoolEstimate}`,
            `每 ${config.lotteryIntervalHours} 小时开奖一次，到期自动开奖，全中拿走全部奖池`,
        ];
        if (lastDraw.length) {
            lines.push(`📜 上期（第 ${lastDraw[0].period} 期）开奖：${lastDraw[0].winningNumber}｜${lastDraw[0].winnerId ? '🎉 已开走' : '无人全中，奖池已滚入新期'}`);
        }
        lines.push(`当前现金：${row.points - cost}`);
        return lines.join('\n');
    });
    return { ensureLotteryPeriod, drawLotteryIfDue, scheduleDraws, checkPoolMilestones };
}
