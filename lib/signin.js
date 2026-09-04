"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSignin = registerSignin;
const koishi_1 = require("koishi");
const util_1 = require("./util");
/** 注册签到 / 查询 / 排行 / 转移 / 修改 五个命令 */
function registerSignin({ ctx, config, core }) {
    ctx.command('经济/积分/签到', '每日签到领取积分')
        .alias('qd', '积分签到', '领取积分', 'daily-points')
        .action(async ({ session }) => {
        if (!session.userId)
            return;
        const key = (0, util_1.userKey)(session);
        const today = (0, util_1.dateKey)(config.timezoneOffset);
        const yesterday = (0, util_1.dateKey)(config.timezoneOffset, 1);
        const row = await core.getUser(key);
        if (row.lastDate === today) {
            return `今天已经签到过啦，明天再来吧～\n当前现金：${row.points}`;
        }
        const streak = row.lastDate === yesterday ? row.streak + 1 : 1;
        const bonus = (0, util_1.randomInt)(config.minBonus, config.maxBonus);
        const streakGain = Math.min(config.streakBonusPerDay * (streak - 1), config.maxStreakBonus);
        let gain = config.basePoints + bonus + streakGain;
        const blackUntil = await core.inBankruptcy(key);
        if (blackUntil)
            gain = Math.floor(gain / 2);
        const points = row.points + gain;
        await ctx.database.set('daily_points', { userId: key }, {
            points,
            totalEarned: row.totalEarned + gain,
            streak,
            lastDate: today,
            lastClaim: new Date(),
        });
        const lines = [
            `签到成功！获得 ${gain} 积分`,
            `（基础 ${config.basePoints} + 随机 ${bonus} + 连续签到 ${streakGain}）`,
            `已连续签到 ${streak} 天，当前现金：${points}`,
        ];
        if (streakGain >= config.maxStreakBonus && config.maxStreakBonus > 0) {
            lines.push(`连续签到奖励已达上限，感谢每天的陪伴！`);
        }
        if (blackUntil) {
            lines.push(`⚠️ 破产惩罚期内，签到收益减半（${(0, util_1.fmtTime)(blackUntil)} 恢复信用）。`);
        }
        return lines.join('\n');
    });
    ctx.command('经济/积分/查询', '查询当前积分与资产')
        .alias('我的积分', '积分余额', 'chaxun')
        .action(async ({ session }) => {
        if (!session.userId)
            return;
        const key = (0, util_1.userKey)(session);
        const row = await core.getUser(key, false);
        if (!row)
            return '你还没有积分哦，发送「签到」领取今天的积分吧～';
        const interest = await core.settleBank(row);
        const fixed = await ctx.database.get('daily_fixed', { userId: key });
        const fixedSum = fixed.reduce((s, f) => s + f.amount, 0);
        const stockValue = config.stockEnabled ? await core.getStockValue(key) : 0;
        const lines = [`当前现金：${row.points}`];
        if (row.bank > 0)
            lines.push(`活期存款：${(Math.round(row.bank * 100) / 100).toString()}${interest > 0 ? `（含刚结算利息 ${interest}）` : ''}`);
        if (fixedSum > 0)
            lines.push(`定期存款：${fixedSum}（${fixed.length} 笔）`);
        if (stockValue > 0)
            lines.push(`股票市值：${(Math.round(stockValue * 100) / 100).toString()}`);
        if (config.loanEnabled) {
            const loans = (await ctx.database.get('daily_loans', { userId: key, status: 'active' }))
                .filter((l) => Date.now() >= new Date(l.dueAt).getTime());
            if (loans.length) {
                const settled = await ctx.database.get('daily_loans', { userId: key, status: 'active' });
                if (settled.length) {
                    const debt = settled.reduce((s, l) => s + l.remaining, 0);
                    lines.push(`⚠️ 欠款：${(Math.round(debt * 100) / 100).toString()}（发送「欠款」查看明细）`);
                }
            }
        }
        lines.push(`累计签到获得：${row.totalEarned}，连续签到：${row.streak} 天`);
        return lines.join('\n');
    });
    ctx.command('经济/积分/排行', '查看积分排行榜')
        .alias('积分排行', 'points-rank', 'paihang')
        .action(async () => {
        const rows = await ctx.database.get('daily_points', {}, {
            sort: { points: 'desc' },
            limit: Math.ceil(config.leaderboardSize),
        });
        if (!rows.length)
            return '还没有人签到过哦～';
        const lines = rows.map((row, i) => {
            const userId = row.userId.includes(':') ? row.userId.split(':')[1] : row.userId;
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            return `${medal} ${(0, koishi_1.h)('at', { id: userId })}  ${row.points} 分`;
        });
        return `积分排行榜：\n${lines.join('\n')}`;
    });
    ctx.command('经济/积分/转移 <user:user> <amount:integer>', '把积分转移给别人')
        .alias('转让积分', '积分转移', 'zhuanyi')
        .action(async ({ session }, user, amount) => {
        if (!session.userId)
            return;
        if (!user)
            return '请 @ 你要转移积分的对象。';
        if (!amount || amount <= 0)
            return '转移数量必须是正整数。';
        const fromKey = (0, util_1.userKey)(session);
        const [toPlatform, toId] = user.split(':');
        if (!toPlatform || !toId)
            return '对方信息解析失败，请在群里 @ 对方后再试。';
        const toKey = `${toPlatform}:${toId}`;
        if (toKey === fromKey)
            return '不能转移给自己哦。';
        // 防跑路机制：有未结清欠款时禁止转账
        const activeLoans = await ctx.database.get('daily_loans', { userId: fromKey, status: 'active' });
        if (activeLoans.length) {
            return '你还有未结清的欠款，还清之前不能转移积分（防止借钱转给小号后跑路）。';
        }
        const from = await core.getUser(fromKey);
        if (from.points < amount)
            return `你的现金不足（当前 ${from.points}）。`;
        const to = await core.getUser(toKey);
        // 事务包裹：双方积分更新原子化
        return await core.dbTx(async (db) => {
            const dbAny = db;
            await dbAny.set('daily_points', { userId: fromKey }, { points: from.points - amount });
            await dbAny.set('daily_points', { userId: toKey }, { points: to.points + amount });
            return `已转移 ${amount} 积分给 ${(0, koishi_1.h)('at', { id: toId })}，剩余 ${from.points - amount} 积分。`;
        });
    });
    ctx.command('经济/积分/修改 <user:user> <amount:integer>', '管理员调整用户积分（可为负数）', { authority: 3 })
        .alias('积分修改', 'kaifen')
        .action(async ({ session }, user, amount) => {
        if (!user)
            return '请 @ 要调整积分的对象。';
        if (typeof amount !== 'number')
            return '请提供调整数量（正数增加，负数扣减）。';
        const [platform, id] = user.split(':');
        if (!platform || !id)
            return '对方信息解析失败，请在群里 @ 对方后再试。';
        const key = `${platform}:${id}`;
        const row = await core.getUser(key);
        const next = row.points + amount;
        if (next < 0)
            return `调整后积分不能为负（对方当前 ${row.points}）。`;
        await ctx.database.set('daily_points', { userId: key }, { points: next });
        return `已将 ${(0, koishi_1.h)('at', { id })} 的积分调整为 ${next}（${amount >= 0 ? '+' : ''}${amount}）。`;
    });
}
