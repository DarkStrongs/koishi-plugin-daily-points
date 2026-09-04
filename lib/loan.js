"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerLoan = registerLoan;
const config_1 = require("./config");
const util_1 = require("./util");
/** 贷款系统：正常贷款 + 高利贷 + 还款 + 欠款 + 催收 + 打工 + 破产 */
function registerLoan({ ctx, config, core, logger }) {
    const loanRates = () => ({ 3: config.loanRate3, 7: config.loanRate7, 30: config.loanRate30 });
    /** 计算正常贷款可用授信：按「净资产」（总资产 − 全部欠款）计算。 */
    async function normalCredit(key) {
        const row = await core.getUser(key);
        await core.settleBank(row);
        const fixed = await ctx.database.get('daily_fixed', { userId: key });
        const fixedSum = fixed.reduce((s, f) => s + f.amount, 0);
        const stockValue = config.stockEnabled ? await core.getStockValue(key) : 0;
        const assets = row.points + row.bank + fixedSum + stockValue;
        const loans = await ctx.database.get('daily_loans', { userId: key, status: 'active' });
        const totalDebt = loans.reduce((s, l) => s + l.remaining, 0);
        const activeNormal = loans.filter((l) => l.type === 'normal').reduce((s, l) => s + l.remaining, 0);
        const netAssets = assets - totalDebt;
        const limit = netAssets >= 0 ? Math.max(config.loanMinLimit, Math.floor(netAssets * config.loanCreditRatio)) : 0;
        return { limit, available: Math.max(0, Math.floor(limit - activeNormal)), assets, debt: totalDebt };
    }
    /** 结算某用户所有未结清贷款的利息 */
    async function settleUserLoans(userId) {
        const loans = await ctx.database.get('daily_loans', { userId, status: 'active' });
        const now = Date.now();
        for (const l of loans) {
            const lastTs = new Date(l.updatedAt || l.startAt).getTime();
            const elapsed = now - lastTs;
            if (elapsed < config_1.HOUR)
                continue;
            const overdue = now >= new Date(l.dueAt).getTime();
            const mult = overdue ? (l.type === 'shark' ? config.sharkOverdueMultiplier : config.loanOverdueMultiplier) : 1;
            const daily = l.rate * mult;
            const hours = Math.min(Math.floor(elapsed / config_1.HOUR), 24 * 30); // 最多补 30 天
            const factor = Math.pow(1 + daily / 24, hours);
            const next = Math.round(l.remaining * factor * 100) / 100;
            await ctx.database.set('daily_loans', { id: l.id }, {
                remaining: next,
                updatedAt: new Date(lastTs + hours * config_1.HOUR),
            });
        }
        return await ctx.database.get('daily_loans', { userId, status: 'active' });
    }
    /** 用一笔现金还贷（逾期优先，其次按到期先后），返回还款明细 */
    async function repayLoans(userId, amount) {
        let rest = amount;
        const loans = (await settleUserLoans(userId)).sort((a, b) => {
            const oa = Date.now() >= new Date(a.dueAt).getTime() ? 0 : 1;
            const ob = Date.now() >= new Date(b.dueAt).getTime() ? 0 : 1;
            if (oa !== ob)
                return oa - ob;
            return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
        });
        const detail = [];
        for (const l of loans) {
            if (rest <= 0)
                break;
            const pay = Math.min(rest, l.remaining);
            const left = Math.round((l.remaining - pay) * 100) / 100;
            await ctx.database.set('daily_loans', { id: l.id }, {
                remaining: left,
                status: left <= 0.01 ? 'cleared' : 'active',
                updatedAt: new Date(),
            });
            rest = Math.round((rest - pay) * 100) / 100;
            detail.push({ id: l.id, type: l.type, pay, cleared: left <= 0.01 });
        }
        return {
            paid: Math.round((amount - rest) * 100) / 100,
            refunded: rest,
            detail,
        };
    }
    /** 催收：按顺序没收 现金 → 活期 → 定期本金 → 股票（按市价强平） */
    async function seizeAssets(userId, need) {
        let got = 0;
        const row = await core.getUser(userId, false);
        if (!row)
            return 0;
        if (row.points > 0) {
            const take = Math.min(row.points, Math.ceil(need));
            got += take;
            need -= take;
            await ctx.database.set('daily_points', { userId }, { points: row.points - take });
        }
        if (need > 0) {
            await core.settleBank(row);
            if (row.bank > 0) {
                const take = Math.min(row.bank, need);
                got += take;
                need -= take;
                await ctx.database.set('daily_points', { userId }, { bank: row.bank - take });
            }
        }
        if (need > 0) {
            const fixed = await ctx.database.get('daily_fixed', { userId });
            for (const f of fixed) {
                if (need <= 0)
                    break;
                await ctx.database.remove('daily_fixed', { id: f.id });
                got += f.amount;
                need -= f.amount;
            }
        }
        if (need > 0 && config.stockEnabled) {
            const stocks = await ctx.database.get('daily_stocks');
            const priceMap = new Map(stocks.map((s) => [s.code, s.price]));
            const holdings = await ctx.database.get('daily_stock_holding', { userId });
            for (const hld of holdings) {
                if (need <= 0)
                    break;
                const value = Math.round((priceMap.get(hld.code) || 0) * hld.quantity);
                await ctx.database.remove('daily_stock_holding', { id: hld.id });
                got += value;
                need -= value;
            }
        }
        return got;
    }
    /** 定时催收：处理所有逾期贷款 */
    async function runCollectors() {
        if (!config.loanEnabled)
            return;
        const loans = await ctx.database.get('daily_loans', { status: 'active' });
        const now = Date.now();
        const users = new Set();
        for (const l of loans) {
            if (now >= new Date(l.dueAt).getTime())
                users.add(l.userId);
        }
        for (const userId of users) {
            const active = await settleUserLoans(userId);
            const overdue = active.filter((l) => now >= new Date(l.dueAt).getTime());
            if (!overdue.length)
                continue;
            const debt = overdue.reduce((s, l) => s + l.remaining, 0);
            const got = await seizeAssets(userId, debt);
            if (got > 0)
                await repayLoans(userId, got);
            logger.warn(`催收完成：${userId} 逾期欠款 ${(Math.round(debt * 100) / 100).toString()}，已没收资产 ${(Math.round(got * 100) / 100).toString()}`);
        }
    }
    function scheduleCollectors() {
        if (!config.loanEnabled)
            return;
        runCollectors().catch((e) => logger.warn('启动催收失败：', e));
        let inFlight = false;
        ctx.setInterval(() => {
            if (inFlight)
                return;
            inFlight = true;
            runCollectors()
                .catch((e) => logger.warn('催收失败：', e))
                .finally(() => { inFlight = false; });
        }, config.collectorIntervalHours * config_1.HOUR);
    }
    // ── 命令注册 ────────────────────────────────────────
    ctx.command('经济/贷款 <amount:string> [days:number]', '向银行申请正常贷款（额度与资产挂钩）')
        .alias('正常贷款')
        .action(async ({ session }, amount, days) => {
        if (!session.userId)
            return;
        if (!config.loanEnabled)
            return '贷款系统未开启。';
        const key = (0, util_1.userKey)(session);
        const blacklistUntil = await core.inBankruptcy(key);
        if (blacklistUntil) {
            return `⛔ 你在破产惩罚期内（${(0, util_1.fmtTime)(blacklistUntil)} 恢复信用），银行不批新贷。可以先「打工」攒钱。`;
        }
        const rates = loanRates();
        if (!amount) {
            const { limit, available } = await normalCredit(key);
            return [
                '🏦 正常贷款：',
                `期限与日利率：${Object.entries(rates).map(([d, r]) => `${d} 天 ${(r * 100).toFixed(1)}%`).join(' / ')}`,
                `你的信用额度：${limit}，当前还可借 ${available}`,
                '用法：贷款 数量 [天数]，天数可选 3 / 7 / 30（默认 7）',
                '逾期后利率翻倍，催收员会直接划扣你的资产！',
            ].join('\n');
        }
        const term = days && rates[days] !== undefined ? days : 7;
        const { available } = await normalCredit(key);
        const overdueLoans = (await ctx.database.get('daily_loans', { userId: key, status: 'active' }))
            .filter((l) => Date.now() >= new Date(l.dueAt).getTime());
        if (overdueLoans.length) {
            return '🚨 你有逾期的贷款未结清，必须先还款才能再借。';
        }
        const n = parseInt(amount);
        if (!Number.isFinite(n) || n <= 0)
            return '请输入正确的金额（正整数）。';
        if (n > available)
            return `超出可用额度（${available}），最高可借 ${available}。`;
        const now = Date.now();
        const row = await core.getUser(key);
        // 事务：扣现金 = 0（直接加积分）+ 创建贷款单 原子化
        return await core.dbTx(async (db) => {
            const dbAny = db;
            await dbAny.create('daily_loans', {
                userId: key,
                type: 'normal',
                principal: n,
                rate: rates[term],
                remaining: n,
                termDays: term,
                startAt: new Date(now),
                dueAt: new Date(now + term * config_1.DAY),
                updatedAt: new Date(now),
                status: 'active',
            });
            await dbAny.set('daily_points', { userId: key }, { points: row.points + n });
            return [
                `✅ 贷款获批：${n} 积分已到账（现金 ${row.points + n}）`,
                `期限 ${term} 天，日利率 ${(rates[term] * 100).toFixed(1)}%，到期应还约 ${Math.floor(n * (1 + rates[term] * term))}`,
                `请于 ${(0, util_1.fmtTime)(now + term * config_1.DAY)} 前还款，逾期利率翻倍并触发催收。`,
            ].join('\n');
        });
    });
    ctx.command('经济/贷款/高利贷 <amount:string>', '找地下钱庄借钱：无需信用、秒到账，但利率极高')
        .alias('地下钱庄')
        .action(async ({ session }, amount) => {
        if (!session.userId)
            return;
        if (!config.loanEnabled)
            return '贷款系统未开启。';
        const key = (0, util_1.userKey)(session);
        const blacklistUntil = await core.inBankruptcy(key);
        if (blacklistUntil) {
            return `⛔ 你在破产惩罚期内（${(0, util_1.fmtTime)(blacklistUntil)} 恢复信用），连钱庄都不放贷给你。可以先「打工」攒钱。`;
        }
        if (!amount) {
            return [
                '🦈 地下钱庄：',
                `无需信用审核，单笔最高 ${config.sharkMaxAmount}，未结清总额上限 ${config.sharkMaxTotal}，日利率 ${(config.sharkRate * 100).toFixed(1)}%，期限 ${config.sharkTermHours} 小时。`,
                `逾期后利率再乘 ${config.sharkOverdueMultiplier} 倍，催收员会直接没收你的现金、存款、定期甚至股票！`,
                '用法：高利贷 数量',
            ].join('\n');
        }
        const n = parseInt(amount);
        if (!Number.isFinite(n) || n <= 0)
            return '请输入正确的金额（正整数）。';
        if (n > config.sharkMaxAmount)
            return `单笔上限 ${config.sharkMaxAmount}，贪多嚼不烂。`;
        const sharkLoans = await ctx.database.get('daily_loans', { userId: key, status: 'active', type: 'shark' });
        const sharkTotal = sharkLoans.reduce((s, l) => s + l.remaining, 0);
        if (sharkLoans.some((l) => Date.now() >= new Date(l.dueAt).getTime())) {
            return '🦈 打手把你拦在门口：上一笔账还逾期着呢，想再借？先还钱！';
        }
        if (sharkTotal + n > config.sharkMaxTotal) {
            return `🦈 钱庄也不是傻子：你未结清的借款已有 ${(Math.round(sharkTotal * 100) / 100).toString()}，加上这笔会超过总额上限 ${config.sharkMaxTotal}。`;
        }
        const now = Date.now();
        const row = await core.getUser(key);
        // 事务：创建贷款单 + 加现金 原子化
        return await core.dbTx(async (db) => {
            const dbAny = db;
            await dbAny.create('daily_loans', {
                userId: key,
                type: 'shark',
                principal: n,
                rate: config.sharkRate,
                remaining: n,
                termDays: 1,
                startAt: new Date(now),
                dueAt: new Date(now + config.sharkTermHours * config_1.HOUR),
                updatedAt: new Date(now),
                status: 'active',
            });
            await dbAny.set('daily_points', { userId: key }, { points: row.points + n });
            const due = Math.ceil(n * (1 + config.sharkRate * config.sharkTermHours / 24));
            return [
                `🦈 拿到钱了：${n} 积分已到账（现金 ${row.points + n}）`,
                `日利率 ${(config.sharkRate * 100).toFixed(1)}%，${config.sharkTermHours} 小时内需还约 ${due}`,
                `⚠️ ${(0, util_1.fmtTime)(now + config.sharkTermHours * config_1.HOUR)} 前不还清，利率暴涨，催收员随时上门！`,
            ].join('\n');
        });
    });
    ctx.command('经济/贷款/还款 [id:number] <amount:string>', '偿还贷款（可指定贷款ID，不指定则按优先级还）')
        .alias('还贷')
        .action(async ({ session }, id, amount) => {
        if (!session.userId)
            return;
        const key = (0, util_1.userKey)(session);
        const active = await settleUserLoans(key);
        if (!active.length)
            return '你目前没有任何欠款，无债一身轻～';
        const totalDebt = active.reduce((s, l) => s + l.remaining, 0);
        // 指定贷款还款
        if (id) {
            const target = active.find((l) => l.id === id);
            if (!target)
                return `没有找到单号 ${id} 的活跃贷款，发送「欠款」查看你的贷款列表。`;
            const row = await core.getUser(key);
            const maxPay = Math.min(row.points, Math.ceil(target.remaining));
            let n = parseInt(amount);
            if (!Number.isFinite(n) || n <= 0) {
                return `请输入正确的金额（正整数）。该笔贷款当前应还 ${(Math.round(target.remaining * 100) / 100).toString()}，现金 ${row.points}。`;
            }
            if (n > row.points)
                return `现金不足（当前 ${row.points}），该笔贷款应还 ${(Math.round(target.remaining * 100) / 100).toString()}。`;
            n = Math.min(n, maxPay);
            const left = Math.round((target.remaining - n) * 100) / 100;
            const refunded = n > target.remaining ? Math.round((n - target.remaining) * 100) / 100 : 0;
            // 事务：扣现金 + 更新贷款单 原子化
            return await core.dbTx(async (db) => {
                const dbAny = db;
                await dbAny.set('daily_loans', { id: target.id }, {
                    remaining: left,
                    status: left <= 0.01 ? 'cleared' : 'active',
                    updatedAt: new Date(),
                });
                await dbAny.set('daily_points', { userId: key }, { points: row.points - n + Math.floor(refunded) });
                const lines = [`本次还款 ${(Math.round((n - refunded) * 100) / 100).toString()} 积分（指定单号 ${id}）。`];
                lines.push(`  贷款单 ${id}（${target.type === 'shark' ? '🦈 高利贷' : '🏦 正常贷款'}）还款 ${(Math.round((n - refunded) * 100) / 100).toString()}${left <= 0.01 ? '，✅ 已结清' : `，剩余 ${(Math.round(left * 100) / 100).toString()}`}`);
                const still = await ctx.database.get('daily_loans', { userId: key, status: 'active' });
                if (still.length)
                    lines.push(`仍有欠款 ${(Math.round(still.reduce((s, l) => s + l.remaining, 0) * 100) / 100).toString()}，发送「欠款」查看明细。`);
                else
                    lines.push('🎉 全部欠款已结清，无债一身轻！');
                return lines.join('\n');
            });
        }
        // 默认按优先级还
        const row = await core.getUser(key);
        let n = parseInt(amount);
        if (!Number.isFinite(n) || n <= 0) {
            return `请输入正确的金额（正整数或「全部」）。当前总欠款 ${(Math.round(totalDebt * 100) / 100).toString()}，现金 ${row.points}。\n也可以用「还款 贷款ID 金额」指定还哪笔，发送「欠款」查看贷款列表。`;
        }
        if (n > row.points)
            return `现金不足（当前 ${row.points}），总欠款 ${(Math.round(totalDebt * 100) / 100).toString()}。`;
        // 事务：扣现金 + 还贷明细 原子化
        return await core.dbTx(async (db) => {
            const dbAny = db;
            const { paid, refunded, detail } = await repayLoans(key, n);
            await dbAny.set('daily_points', { userId: key }, { points: row.points - n + Math.floor(refunded) });
            const lines = [`本次还款 ${(Math.round(paid * 100) / 100).toString()} 积分。`];
            for (const d of detail)
                lines.push(`  贷款单 ${d.id}（${d.type === 'shark' ? '🦈 高利贷' : '🏦 正常贷款'}）还款 ${(Math.round(d.pay * 100) / 100).toString()}${d.cleared ? '，✅ 已结清' : ''}`);
            const still = await ctx.database.get('daily_loans', { userId: key, status: 'active' });
            if (still.length)
                lines.push(`仍有欠款 ${(Math.round(still.reduce((s, l) => s + l.remaining, 0) * 100) / 100).toString()}，发送「欠款」查看明细。`);
            else
                lines.push('🎉 全部欠款已结清，无债一身轻！');
            return lines.join('\n');
        });
    });
    ctx.command('经济/贷款/欠款', '查看我的贷款与欠款')
        .alias('我的欠款', '我的贷款')
        .action(async ({ session }) => {
        if (!session.userId)
            return;
        const key = (0, util_1.userKey)(session);
        const active = await settleUserLoans(key);
        if (!active.length)
            return '你目前没有任何欠款，无债一身轻～';
        const lines = active
            .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
            .map((l) => {
            const overdue = Date.now() >= new Date(l.dueAt).getTime();
            const mult = overdue ? (l.type === 'shark' ? config.sharkOverdueMultiplier : config.loanOverdueMultiplier) : 1;
            return `单号 ${l.id}｜${l.type === 'shark' ? '🦈 高利贷' : '🏦 正常贷款'}｜本金 ${l.principal}｜当前应还 ${(Math.round(l.remaining * 100) / 100).toString()}｜日利率 ${(l.rate * mult * 100).toFixed(1)}%｜${overdue ? '🚨 已逾期，利率已上浮！' : `${(0, util_1.fmtTime)(new Date(l.dueAt).getTime())} 到期`}`;
        });
        const total = active.reduce((s, l) => s + l.remaining, 0);
        return [`💳 我的欠款（合计 ${(Math.round(total * 100) / 100).toString()}）：`, ...lines, '用「还款 数量」按优先级偿还（逾期优先），或用「还款 贷款ID 数量」指定还哪笔；实在还不起可以「打工」赚积分（逾期时收入会被强制划扣），或发送「破产」了解出路。'].join('\n');
    });
    ctx.command('经济/贷款/打工', '打工赚积分（有逾期欠款时收入会被强制划扣还债）')
        .alias('搬砖')
        .action(async ({ session }) => {
        if (!session.userId)
            return;
        const key = (0, util_1.userKey)(session);
        const row = await core.getUser(key);
        const lastTs = row.lastWork ? new Date(row.lastWork).getTime() : 0;
        const cooldown = config.workCooldownMinutes * 60000;
        if (Date.now() - lastTs < cooldown) {
            return `🧱 工头说歇会儿再来：${(0, util_1.fmtTime)(lastTs + cooldown)} 之后开工。`;
        }
        await ctx.database.set('daily_points', { userId: key }, { lastWork: new Date() });
        const earn = (0, util_1.randomInt)(Math.floor(config.workMin), Math.floor(config.workMax));
        const active = await settleUserLoans(key);
        const hasOverdue = active.some((l) => Date.now() >= new Date(l.dueAt).getTime());
        let keep = earn;
        let garnished = 0;
        if (hasOverdue && config.workGarnishRate > 0) {
            garnished = Math.floor(earn * config.workGarnishRate);
            keep = earn - garnished;
            if (garnished > 0)
                await repayLoans(key, garnished);
        }
        const fresh = await core.getUser(key);
        await ctx.database.set('daily_points', { userId: key }, {
            points: fresh.points + keep,
            totalEarned: fresh.totalEarned + keep,
        });
        const lines = [`🧱 打工赚了 ${earn} 积分！`];
        if (garnished > 0) {
            lines.push(`⚠️ 催收员当场划走 ${garnished} 积分抵债（工资扣押 ${(config.workGarnishRate * 100).toFixed(0)}%），到手 ${keep}。`);
            const still = await ctx.database.get('daily_loans', { userId: key, status: 'active' });
            if (still.length)
                lines.push(`仍欠 ${(Math.round(still.reduce((s, l) => s + l.remaining, 0) * 100) / 100).toString()}，继续搬砖总有一天能还清。`);
        }
        else if (active.length) {
            lines.push('你的贷款尚未逾期，本次工资全额到手。');
        }
        lines.push(`当前现金：${fresh.points + keep}`);
        return lines.join('\n');
    });
    ctx.command('经济/贷款/破产', '申请破产：债务一笔勾销，但资产全部没收并进入信用黑名单')
        .alias('申请破产')
        .action(async ({ session }) => {
        if (!session.userId)
            return;
        if (!config.loanEnabled)
            return '贷款系统未开启。';
        const key = (0, util_1.userKey)(session);
        const active = await settleUserLoans(key);
        if (!active.length)
            return '你没有任何欠款，破产个啥？好好过日子吧。';
        const overdue = active.filter((l) => Date.now() >= new Date(l.dueAt).getTime());
        if (!overdue.length) {
            return [
                '⚖️ 法院驳回了你的破产申请：你的贷款尚未逾期，说明你还还得起。',
                '真到了还不起的那天（逾期后）再来申请；也可以发送「打工」，搬砖也能还债。',
            ].join('\n');
        }
        const totalDebt = active.reduce((s, l) => s + l.remaining, 0);
        // 没收全部资产
        const row = await core.getUser(key);
        await core.settleBank(row);
        const fixed = await ctx.database.get('daily_fixed', { userId: key });
        let holdingValue = 0;
        if (config.stockEnabled) {
            const stocks = await ctx.database.get('daily_stocks');
            const priceMap = new Map(stocks.map((s) => [s.code, s.price]));
            const holdings = await ctx.database.get('daily_stock_holding', { userId: key });
            for (const hd of holdings) {
                holdingValue += Math.round((priceMap.get(hd.code) || 0) * hd.quantity);
            }
        }
        const seized = Math.round(row.points + row.bank + fixed.reduce((s, f) => s + f.amount, 0) + holdingValue);
        const penaltyDays = Math.floor(config.bankruptPenaltyDays);
        const until = Date.now() + penaltyDays * config_1.DAY;
        const bankruptCount = (row.bankruptCount || 0) + 1;
        // 事务：清资产 + 作废贷款 + 写黑名单 原子化
        return await core.dbTx(async (db) => {
            const dbAny = db;
            for (const f of fixed)
                await dbAny.remove('daily_fixed', { id: f.id });
            if (config.stockEnabled) {
                const holdings = await ctx.database.get('daily_stock_holding', { userId: key });
                for (const hd of holdings)
                    await dbAny.remove('daily_stock_holding', { id: hd.id });
            }
            for (const l of active) {
                await dbAny.set('daily_loans', { id: l.id }, { status: 'bankrupt', updatedAt: new Date() });
            }
            await dbAny.set('daily_points', { userId: key }, {
                points: 0,
                bank: 0,
                bankruptCount,
                bankruptUntil: new Date(until),
            });
            return [
                '⚖️ 法院裁定：破产申请通过。',
                `名下 ${active.length} 笔贷款（合计 ${(Math.round(totalDebt * 100) / 100).toString()}）一笔勾销，催收员不会再来了。`,
                `作为代价，全部资产没收充公${seized > 0 ? `（现金/存款/股票合计约 ${(Math.round(seized * 100) / 100).toString()}）` : ''}，归零从头开始。`,
                `惩罚：${penaltyDays} 天内不能贷款、不能碰高利贷，签到收益减半。`,
                `破产记录 +1（累计 ${bankruptCount} 次），${(0, util_1.fmtTime)(until)} 恢复信用。`,
                '期间可以「打工」慢慢攒钱——浪子回头金不换。',
            ].join('\n');
        });
    });
    return { settleUserLoans, scheduleCollectors };
}
