"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerLottery = registerLottery;
const koishi_1 = require("koishi");
const config_1 = require("./config");
const util_1 = require("./util");
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
            '  赌场 —— 猜大小 / 轮盘 / 21点，庄家抽水 5%，输了的钱进奖池',
            '  彩票 —— 每期 10 积分一注，头奖独得奖池，未中滚入下期',
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
    ctx.command('经济/娱乐/彩票 [count:number]', '买彩票：每注 ' + 10 + ' 积分，头奖独得奖池')
        .alias('lottery', '买彩票', 'caipiao')
        .action(async ({ session }, count) => {
        if (!session.userId)
            return;
        if (!config.lotteryEnabled)
            return '彩票系统未开启。';
        const key = (0, util_1.userKey)(session);
        await drawLotteryIfDue();
        const cur = await ensureLotteryPeriod();
        const want = Math.max(1, Math.floor(count || 1));
        if (want > config.lotteryMaxTicketsPerUser)
            return `单期最多买 ${config.lotteryMaxTicketsPerUser} 注。`;
        const cost = want * config.lotteryPrice;
        const row = await core.getUser(key);
        if (cost > row.points)
            return `现金不足：本想买 ${want} 注共 ${cost} 积分，当前现金 ${row.points}。`;
        const digits = Math.floor(config.lotteryDigits);
        // 事务：扣现金 + 创建彩票投注 + 增加期号计数 原子化
        return await core.dbTx(async (db) => {
            const dbAny = db;
            await dbAny.set('daily_points', { userId: key }, { points: row.points - cost });
            const tickets = [];
            const numbers = [];
            for (let i = 0; i < want; i++) {
                let num = '';
                for (let d = 0; d < digits; d++)
                    num += Math.floor(Math.random() * 10);
                tickets.push({ period: cur.period, userId: key, number: num, createdAt: new Date() });
                numbers.push(num);
            }
            await dbAny.upsert('daily_lottery_tickets', tickets);
            await dbAny.set('daily_lottery_periods', { id: cur.id }, { ticketCount: cur.ticketCount + want });
            const lastDraw = await ctx.database.get('daily_lottery_periods', { status: 'drawn' }, { sort: { period: 'desc' }, limit: 1 });
            const lines = [
                `🎰 第 ${cur.period} 期：你买了 ${want} 注，扣 ${cost} 积分`,
                `你的号码：${numbers.join(' / ')}`,
                `当前奖池（含本期累计）：${(cur.ticketCount + want) * config.lotteryPrice + (cur.carriedOver || 0)}`,
                `每 ${config.lotteryIntervalHours} 小时开奖一次，到期自动开奖，全中拿走全部奖池`,
            ];
            if (lastDraw.length) {
                lines.push(`📜 上期（第 ${lastDraw[0].period} 期）开奖：${lastDraw[0].winningNumber}｜${lastDraw[0].winnerId ? '🎉 已开走' : '无人全中，奖池已滚入新期'}`);
            }
            lines.push(`当前现金：${row.points - cost}`);
            return lines.join('\n');
        });
    });
    return { ensureLotteryPeriod, drawLotteryIfDue, scheduleDraws };
}
