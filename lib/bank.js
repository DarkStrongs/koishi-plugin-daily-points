"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBank = registerBank;
const config_1 = require("./config");
const util_1 = require("./util");
/** 银行：活期存款 / 取款 / 定期 / 列表 / 取出 / 资产总览 */
function registerBank({ ctx, config, core, settleUserLoans }) {
    ctx.command('经济/银行/存款 <amount:string>', '把现金存入银行（活期，每小时计息）')
        .action(async ({ session }, amount) => {
        if (!session.userId)
            return;
        const key = (0, util_1.userKey)(session);
        const row = await core.getUser(key);
        const n = (0, util_1.parseAmount)(amount, row.points);
        if (n === null)
            return '请输入正确的金额（正整数或「全部」）。';
        if (n > row.points)
            return `现金不足（当前 ${row.points}）。`;
        const interest = await core.settleBank(row);
        await ctx.database.set('daily_points', { userId: key }, {
            points: row.points - n,
            bank: row.bank + n,
            bankUpdatedAt: row.bank <= 0 ? new Date() : row.bankUpdatedAt,
        });
        const lines = [`已存入 ${n} 积分，活期余额：${(Math.round((row.bank + n) * 100) / 100).toString()}，现金剩余：${row.points - n}`];
        if (interest > 0)
            lines.push(`本次结算活期利息：${interest}`);
        return lines.join('\n');
    });
    ctx.command('经济/银行/取款 <amount:string>', '从银行取出活期存款')
        .action(async ({ session }, amount) => {
        if (!session.userId)
            return;
        const key = (0, util_1.userKey)(session);
        const row = await core.getUser(key);
        const interest = await core.settleBank(row);
        const n = (0, util_1.parseAmount)(amount, row.bank);
        if (n === null)
            return '请输入正确的金额（正整数或「全部」）。';
        if (n > Math.floor(row.bank))
            return `活期余额不足（当前 ${(Math.round(row.bank * 100) / 100).toString()}）。`;
        await ctx.database.set('daily_points', { userId: key }, {
            points: row.points + n,
            bank: row.bank - n,
        });
        const lines = [`已取出 ${n} 积分，现金：${row.points + n}，活期剩余：${(Math.round((row.bank - n) * 100) / 100).toString()}`];
        if (interest > 0)
            lines.push(`本次结算活期利息：${interest}`);
        return lines.join('\n');
    });
    const termRates = () => ({ 3: config.fixedRate3, 7: config.fixedRate7, 30: config.fixedRate30 });
    ctx.command('经济/银行/定期存款 <amount:string> <days:number>', '存定期（3/7/30 天，利率更高，提前取出无利息）')
        .action(async ({ session }, amount, days) => {
        if (!session.userId)
            return;
        const key = (0, util_1.userKey)(session);
        const rates = termRates();
        if (!rates[days])
            return `定期期限只支持：${Object.keys(rates).join(' / ')} 天。`;
        const row = await core.getUser(key);
        const n = (0, util_1.parseAmount)(amount, row.points);
        if (n === null)
            return '请输入正确的金额（正整数或「全部」）。';
        if (n > row.points)
            return `现金不足（当前 ${row.points}）。`;
        const now = Date.now();
        // 事务：扣现金 + 创建定期单原子化
        return await core.dbTx(async (db) => {
            const dbAny = db;
            const created = await dbAny.create('daily_fixed', {
                userId: key,
                amount: n,
                rate: rates[days],
                termDays: days,
                startAt: new Date(now),
                dueAt: new Date(now + days * config_1.DAY),
            });
            await dbAny.set('daily_points', { userId: key }, { points: row.points - n });
            const id = Array.isArray(created) ? created[0]?.id : created?.id;
            return [
                `定期存款成功！单号 ${id ?? ''}`,
                `本金 ${n}，期限 ${days} 天，日利率 ${(rates[days] * 100).toFixed(2)}%`,
                `到期可得 ${Math.floor(n * (1 + rates[days] * days))} 积分（${(0, util_1.fmtTime)(now + days * config_1.DAY)} 到期）`,
            ].join('\n');
        });
    });
    ctx.command('经济/银行/定期列表', '查看我的定期存款')
        .action(async ({ session }) => {
        if (!session.userId)
            return;
        const fixed = await ctx.database.get('daily_fixed', { userId: (0, util_1.userKey)(session) });
        if (!fixed.length)
            return '你还没有定期存款。';
        const lines = fixed
            .sort((a, b) => a.id - b.id)
            .map((f) => {
            const matured = Date.now() >= new Date(f.dueAt).getTime();
            const interest = Math.floor(f.amount * f.rate * f.termDays);
            return `单号 ${f.id}｜本金 ${f.amount}｜${f.termDays} 天｜到期利息 ${interest}｜${matured ? '✅ 已到期' : `还剩 ${Math.ceil((new Date(f.dueAt).getTime() - Date.now()) / config_1.DAY)} 天`}`;
        });
        return `定期存款（${fixed.length} 笔，本金合计 ${fixed.reduce((s, f) => s + f.amount, 0)}）：\n${lines.join('\n')}`;
    });
    ctx.command('经济/银行/定期取出 <id:number>', '取出定期存款（提前取出只还本金）')
        .action(async ({ session }, id) => {
        if (!session.userId)
            return;
        const key = (0, util_1.userKey)(session);
        if (!id)
            return '请提供定期单号，可用「定期列表」查看。';
        const [f] = await ctx.database.get('daily_fixed', { id, userId: key });
        if (!f)
            return '没有找到这笔定期存款。';
        const row = await core.getUser(key);
        const matured = Date.now() >= new Date(f.dueAt).getTime();
        // 事务：删定期单 + 加现金 原子化
        return await core.dbTx(async (db) => {
            const dbAny = db;
            await dbAny.remove('daily_fixed', { id });
            if (matured) {
                const interest = Math.floor(f.amount * f.rate * f.termDays);
                await dbAny.set('daily_points', { userId: key }, { points: row.points + f.amount + interest });
                return `定期存款到期取出：本金 ${f.amount} + 利息 ${interest}，现金：${row.points + f.amount + interest}`;
            }
            await dbAny.set('daily_points', { userId: key }, { points: row.points + f.amount });
            return `定期存款尚未到期，提前取出仅返还本金 ${f.amount}（损失全部利息），现金：${row.points + f.amount}`;
        });
    });
    ctx.command('经济/银行', '查看我的资产总览')
        .action(async ({ session }) => {
        if (!session.userId)
            return;
        const key = (0, util_1.userKey)(session);
        const row = await core.getUser(key);
        const interest = await core.settleBank(row);
        const fixed = await ctx.database.get('daily_fixed', { userId: key });
        const fixedSum = fixed.reduce((s, f) => s + f.amount, 0);
        const fixedDue = fixed.reduce((s, f) => s + Math.floor(f.amount * f.rate * f.termDays), 0);
        const stockValue = config.stockEnabled ? await core.getStockValue(key) : 0;
        const loans = config.loanEnabled ? await settleUserLoans(key) : [];
        const debt = loans.reduce((s, l) => s + l.remaining, 0);
        const total = row.points + row.bank + fixedSum + stockValue;
        const lines = [
            `💰 资产总览（总值 ${(Math.round(total * 100) / 100).toString()}）`,
            `现金：${row.points}`,
            `活期存款：${(Math.round(row.bank * 100) / 100).toString()}（每小时 ${(config.bankHourlyRate * 100).toFixed(3)}%）${interest > 0 ? `，刚结算利息 ${interest}` : ''}`,
        ];
        if (fixed.length)
            lines.push(`定期存款：${fixedSum}（到期共可得利息 ${fixedDue}）`);
        if (config.stockEnabled)
            lines.push(`股票市值：${(Math.round(stockValue * 100) / 100).toString()}`);
        if (loans.length) {
            const overdue = loans.filter((l) => Date.now() >= new Date(l.dueAt).getTime()).length;
            lines.push(`⚠️ 欠款：${(Math.round(debt * 100) / 100).toString()}（${loans.length} 笔${overdue ? `，其中 ${overdue} 笔已逾期` : ''}）`);
            lines.push(`净资产：${(Math.round((total - debt) * 100) / 100).toString()}`);
        }
        lines.push('用「存款/取款」操作活期，「贷款/高利贷」借钱，「还款」还钱，「股票」查看行情。');
        return lines.join('\n');
    });
}
