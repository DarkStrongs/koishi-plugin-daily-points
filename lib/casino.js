"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCasino = registerCasino;
const util_1 = require("./util");
/** 赌场系统：猜大小 / 轮盘 / 21点 + 奖池 */
function registerCasino({ ctx, config, core }) {
    async function getCasinoPool() {
        const rows = await ctx.database.get('daily_casino_pool', { id: 1 });
        if (rows[0])
            return rows[0];
        await ctx.database.create('daily_casino_pool', { id: 1, amount: 0, updatedAt: new Date() });
        const [created] = await ctx.database.get('daily_casino_pool', { id: 1 });
        return created;
    }
    async function feedCasinoPool(delta) {
        const pool = await getCasinoPool();
        const next = Math.round((pool.amount + delta) * 100) / 100;
        await ctx.database.set('daily_casino_pool', { id: 1 }, { amount: next, updatedAt: new Date() });
        return next;
    }
    async function drainCasinoPool() {
        const pool = await getCasinoPool();
        await ctx.database.set('daily_casino_pool', { id: 1 }, { amount: 0, updatedAt: new Date() });
        return pool.amount;
    }
    /** 检查并执行下注前冷却（公用） */
    async function checkCasinoCooldown(key) {
        const cooldownMs = config.casinoCooldownSeconds * 1000;
        const lastCasino = await ctx.database.get('daily_meta', { key: `casino:${key}` });
        if (lastCasino.length && Date.now() - Number(lastCasino[0].value) < cooldownMs) {
            const left = Math.ceil((Number(lastCasino[0].value) + cooldownMs - Date.now()) / 1000);
            return `🎰 荷官说歇会儿：${left} 秒后再下注。`;
        }
        await ctx.database.upsert('daily_meta', [{ key: `casino:${key}`, value: String(Date.now()) }]);
        return null;
    }
    // ── 命令注册 ──────────────────────────────────────────
    ctx.command('经济/娱乐/赌场', '赌场分组菜单')
        .action(() => {
        return [
            '🎰 赌场规则一览：',
            '  猜大小 押注 大|小 —— 两个骰子，2-6 为小、8-12 为大；7 点庄家通吃',
            '  轮盘 押注 红|黑|单|双 —— 0-36 中随机一格，按红黑/单双赔率结算',
            '  21点 押注 —— 玩家和庄家各两张起手，按硬规则补到 ≥17，比点数',
            '  老虎机 押注 —— 3 个相同赢 50×，2 个相同赢 2×，全不中输',
            '  百家乐 押注 庄|闲|和 —— 各抽 1 张比大小，赔率 0.95 / 1.0 / 8.0',
            '  牛牛 押注 —— 抽 5 张，凑出 3 张整 10 倍数算有牛，1:2 赢',
            '',
            `通用规则：单笔 ${config.casinoMinBet} ~ ${config.casinoMaxBet} 积分，押注间隔 ${config.casinoCooldownSeconds} 秒；赢了 1:1 赔付（含本金），输了按 ${(config.casinoHouseEdge * 100).toFixed(0)}% 抽水入奖池。`,
        ].join('\n');
    });
    ctx.command('经济/娱乐/赌场/猜大小 <amount:string> <choice:string>', '两个骰子猜大小（7 点庄家通吃）')
        .alias('赌大小', '大小', 'ducai', 'casino-bigsmall')
        .action(async ({ session }, amount, choice) => {
        if (!session.userId)
            return;
        if (!config.casinoEnabled)
            return '赌场系统未开启。';
        const key = (0, util_1.userKey)(session);
        const choiceMap = { '大': 'big', '小': 'small', big: 'big', small: 'small', BIG: 'big', SMALL: 'small' };
        let pickEn = null;
        if (choiceMap[choice])
            pickEn = choiceMap[choice];
        else if (choice.includes('大'))
            pickEn = 'big';
        else if (choice.includes('小'))
            pickEn = 'small';
        if (!pickEn)
            return '请输入「大」或「小」，例如「猜大小 100 大」。';
        const row = await core.getUser(key);
        const n = parseInt(amount);
        if (!Number.isFinite(n) || n <= 0)
            return '请输入正确的金额（正整数）。';
        if (n < config.casinoMinBet)
            return `单笔最低 ${config.casinoMinBet}。`;
        if (n > config.casinoMaxBet)
            return `单笔最高 ${config.casinoMaxBet}。`;
        if (n > row.points)
            return `现金不足（当前 ${row.points}）。`;
        const cd = await checkCasinoCooldown(key);
        if (cd)
            return cd;
        const d1 = (0, util_1.randomInt)(1, 6), d2 = (0, util_1.randomInt)(1, 6);
        const sum = d1 + d2;
        let result;
        if (sum === 7)
            result = { win: false, reason: '7 点庄家通吃' };
        else if (sum >= 8)
            result = { win: pickEn === 'big', label: '大' };
        else
            result = { win: pickEn === 'small', label: '小' };
        if (result.win) {
            const payout = n * 2;
            // 事务：返还（含本金）
            return await core.dbTx(async (db) => {
                const dbAny = db;
                await dbAny.set('daily_points', { userId: key }, { points: row.points + payout });
                return [
                    `🎲 骰子：${d1} + ${d2} = ${sum}（${result.label}）`,
                    `✅ 命中！赔付 1:1，到手 ${payout}（含本金 ${n}），现金：${row.points + payout}`,
                ].join('\n');
            });
        }
        const poolFee = Math.floor(n * config.casinoHouseEdge);
        const newPool = await feedCasinoPool(poolFee);
        return [
            `🎲 骰子：${d1} + ${d2} = ${sum}${result.reason ? `（${result.reason}）` : `（${pickEn === 'big' ? '小' : '大'}）`}`,
            `❌ 没中，输掉 ${n}，其中 ${poolFee} 入赌场奖池（奖池 ${(0, util_1.fmtMoney)(newPool)}）`,
            `当前现金：${row.points - n}`,
        ].join('\n');
    });
    ctx.command('经济/娱乐/赌场/轮盘 <amount:string> <choice:string>', '轮盘：红/黑/单/双，1:1 赔率')
        .alias('赌轮盘', '轮盘赌', 'roulette')
        .action(async ({ session }, amount, choice) => {
        if (!session.userId)
            return;
        if (!config.casinoEnabled)
            return '赌场系统未开启。';
        const key = (0, util_1.userKey)(session);
        let pickEn = null;
        if (choice === '红' || choice.includes('红'))
            pickEn = 'red';
        else if (choice === '黑' || choice.includes('黑'))
            pickEn = 'black';
        else if (choice === '单' || choice.includes('单'))
            pickEn = 'odd';
        else if (choice === '双' || choice.includes('双'))
            pickEn = 'even';
        if (!pickEn)
            return '请输入「红」「黑」「单」或「双」，例如「轮盘 100 红」。';
        const row = await core.getUser(key);
        const n = parseInt(amount);
        if (!Number.isFinite(n) || n <= 0)
            return '请输入正确的金额（正整数）。';
        if (n < config.casinoMinBet)
            return `单笔最低 ${config.casinoMinBet}。`;
        if (n > config.casinoMaxBet)
            return `单笔最高 ${config.casinoMaxBet}。`;
        if (n > row.points)
            return `现金不足（当前 ${row.points}）。`;
        const cd = await checkCasinoCooldown(key);
        if (cd)
            return cd;
        const ball = (0, util_1.randomInt)(0, 36);
        const isRed = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(ball);
        const isBlack = ball !== 0 && !isRed;
        const isOdd = ball % 2 === 1 && ball !== 0;
        const isEven = ball % 2 === 0 && ball !== 0;
        let win = false;
        if (pickEn === 'red' && isRed)
            win = true;
        if (pickEn === 'black' && isBlack)
            win = true;
        if (pickEn === 'odd' && isOdd)
            win = true;
        if (pickEn === 'even' && isEven)
            win = true;
        const colorLabel = ball === 0 ? '绿(0)' : (isRed ? '红' : '黑');
        const choiceLabel = pickEn === 'red' ? '红' : pickEn === 'black' ? '黑' : pickEn === 'odd' ? '单' : '双';
        if (win) {
            const payout = n * 2;
            return await core.dbTx(async (db) => {
                const dbAny = db;
                await dbAny.set('daily_points', { userId: key }, { points: row.points + payout });
                return [
                    `🎡 轮盘球落 ${ball}（${colorLabel}）`,
                    `✅ 命中「${choiceLabel}」！赔付 1:1，到手 ${payout}（含本金），现金：${row.points + payout}`,
                ].join('\n');
            });
        }
        const poolFee = Math.floor(n * config.casinoHouseEdge);
        const newPool = await feedCasinoPool(poolFee);
        return [
            `🎡 轮盘球落 ${ball}（${colorLabel}）`,
            ball === 0 ? `❌ 球落 0，所有押注通吃` : `❌ 没中「${choiceLabel}」，输掉 ${n}，其中 ${poolFee} 入赌场奖池（奖池 ${(0, util_1.fmtMoney)(newPool)}）`,
            `当前现金：${row.points - n}`,
        ].join('\n');
    });
    function bjScore(hand) {
        let total = 0, aces = 0;
        for (const c of hand) {
            if (c.rank === 'A') {
                aces += 1;
                total += 1;
            }
            else if (['J', 'Q', 'K'].includes(c.rank))
                total += 10;
            else
                total += Number(c.rank);
        }
        while (aces > 0 && total + 10 <= 21) {
            total += 10;
            aces -= 1;
        }
        return total;
    }
    function bjNewDeck() {
        const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        const deck = [];
        for (const r of ranks)
            for (let i = 0; i < 4; i++)
                deck.push({ rank: r });
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }
    function bjCardStr(c) {
        const suit = ['♠', '♥', '♦', '♣'][Math.floor(Math.random() * 4)];
        return `${suit}${c.rank}`;
    }
    ctx.command('经济/娱乐/赌场/21点 <amount:string>', '21点：玩家和庄家按硬规则自动比大小')
        .alias('黑杰克', '二十一点', 'blackjack')
        .action(async ({ session }, amount) => {
        if (!session.userId)
            return;
        if (!config.casinoEnabled)
            return '赌场系统未开启。';
        const key = (0, util_1.userKey)(session);
        const row = await core.getUser(key);
        const n = parseInt(amount);
        if (!Number.isFinite(n) || n <= 0)
            return '请输入正确的金额（正整数）。';
        if (n < config.casinoMinBet)
            return `单笔最低 ${config.casinoMinBet}。`;
        if (n > config.casinoMaxBet)
            return `单笔最高 ${config.casinoMaxBet}。`;
        if (n > row.points)
            return `现金不足（当前 ${row.points}）。`;
        const cd = await checkCasinoCooldown(key);
        if (cd)
            return cd;
        const deck = bjNewDeck();
        let pHand = [deck.pop(), deck.pop()];
        let dHand = [deck.pop(), deck.pop()];
        while (bjScore(pHand) < 17)
            pHand.push(deck.pop());
        while (bjScore(dHand) < config.blackjackStandOn)
            dHand.push(deck.pop());
        const pScore = bjScore(pHand);
        const dScore = bjScore(dHand);
        const pStr = pHand.map(bjCardStr).join(' ');
        const dStr = dHand.map(bjCardStr).join(' ');
        const pBust = pScore > 21, dBust = dScore > 21;
        const lines = [
            `♠️ 你的手牌：${pStr}（${pScore}${pBust ? ' 爆牌' : ''}）`,
            `♣️ 庄家手牌：${dStr}（${dScore}${dBust ? ' 爆牌' : ''}）`,
        ];
        if (pBust && dBust) {
            const poolFee = Math.floor(n * config.casinoHouseEdge);
            const newPool = await feedCasinoPool(poolFee);
            lines.push(`💥 双爆，按惯例算庄家赢，输掉 ${n}（其中 ${poolFee} 入奖池 ${(0, util_1.fmtMoney)(newPool)}）`);
            lines.push(`当前现金：${row.points - n}`);
            return lines.join('\n');
        }
        if (pBust) {
            const poolFee = Math.floor(n * config.casinoHouseEdge);
            const newPool = await feedCasinoPool(poolFee);
            lines.push(`❌ 爆牌，输掉 ${n}（其中 ${poolFee} 入奖池 ${(0, util_1.fmtMoney)(newPool)}）`);
            lines.push(`当前现金：${row.points - n}`);
            return lines.join('\n');
        }
        if (dBust) {
            const payout = n * 2;
            return await core.dbTx(async (db) => {
                const dbAny = db;
                await dbAny.set('daily_points', { userId: key }, { points: row.points + payout });
                lines.push(`✅ 庄家爆牌！赔付 1:1，到手 ${payout}，现金：${row.points + payout}`);
                return lines.join('\n');
            });
        }
        if (pScore > dScore) {
            const payout = n * 2;
            return await core.dbTx(async (db) => {
                const dbAny = db;
                await dbAny.set('daily_points', { userId: key }, { points: row.points + payout });
                lines.push(`✅ ${pScore} vs ${dScore}，点数大，赔付 1:1，到手 ${payout}，现金：${row.points + payout}`);
                return lines.join('\n');
            });
        }
        const poolFee = Math.floor(n * config.casinoHouseEdge);
        const newPool = await feedCasinoPool(poolFee);
        lines.push(`❌ ${pScore} vs ${dScore}，点数小或平，输掉 ${n}（其中 ${poolFee} 入奖池 ${(0, util_1.fmtMoney)(newPool)}）`);
        lines.push(`当前现金：${row.points - n}`);
        return lines.join('\n');
    });
    // ── v1.9.0 新增：老虎机 / 百家乐 / 牛牛 ─────────────────────
    /** 老虎机符号（6 种 emoji 凑对） */
    const SLOT_SYMBOLS = ['🍒', '🍋', '🍉', '🔔', '⭐', '7️⃣'];
    /** 通用押注前校验 + 冷却 + 现金判断；返回 null 通过 / 返回字符串报错 */
    async function preBet(key, amount, row) {
        const n = parseInt(amount);
        if (!Number.isFinite(n) || n <= 0)
            return '请输入正确的金额（正整数）。';
        if (n < config.casinoMinBet)
            return `单笔最低 ${config.casinoMinBet}。`;
        if (n > config.casinoMaxBet)
            return `单笔最高 ${config.casinoMaxBet}。`;
        if (n > row.points)
            return `现金不足（当前 ${row.points}）。`;
        const cd = await checkCasinoCooldown(key);
        if (cd)
            return cd;
        return { n };
    }
    ctx.command('经济/娱乐/赌场/老虎机 <amount:string>', '老虎机：3 个相同赢 50×，2 个相同赢 2×')
        .alias('slot', 'slots', '水果机')
        .action(async ({ session }, amount) => {
        if (!session.userId)
            return;
        if (!config.casinoEnabled)
            return '赌场系统未开启。';
        const key = (0, util_1.userKey)(session);
        const row = await core.getUser(key);
        const prep = await preBet(key, amount, row);
        if (typeof prep === 'string')
            return prep;
        const n = prep.n;
        const s1 = SLOT_SYMBOLS[(0, util_1.randomInt)(0, SLOT_SYMBOLS.length - 1)];
        const s2 = SLOT_SYMBOLS[(0, util_1.randomInt)(0, SLOT_SYMBOLS.length - 1)];
        const s3 = SLOT_SYMBOLS[(0, util_1.randomInt)(0, SLOT_SYMBOLS.length - 1)];
        const lines = [`🎰 老虎机：${s1} | ${s2} | ${s3}`];
        if (s1 === s2 && s2 === s3) {
            // 大奖：净赚 50 × n
            const payout = n + n * 50;
            return await core.dbTx(async (db) => {
                const dbAny = db;
                await dbAny.set('daily_points', { userId: key }, { points: row.points + payout });
                lines.push(`🎉 三连 ${s1}！头奖 50×，到手 ${payout}（含本金），现金：${row.points + payout}`);
                return lines.join('\n');
            });
        }
        if (s1 === s2 || s2 === s3 || s1 === s3) {
            // 小奖：净赚 2 × n（含本金）
            const payout = n + n * 2;
            return await core.dbTx(async (db) => {
                const dbAny = db;
                await dbAny.set('daily_points', { userId: key }, { points: row.points + payout });
                lines.push(`✨ 两连！小奖 2×，到手 ${payout}（含本金），现金：${row.points + payout}`);
                return lines.join('\n');
            });
        }
        const poolFee = Math.floor(n * config.casinoHouseEdge);
        const newPool = await feedCasinoPool(poolFee);
        lines.push(`❌ 三个都不一样，输掉 ${n}（其中 ${poolFee} 入奖池 ${(0, util_1.fmtMoney)(newPool)}）`);
        lines.push(`当前现金：${row.points - n}`);
        return lines.join('\n');
    });
    ctx.command('经济/娱乐/赌场/百家乐 <amount:string> <pick:string>', '百家乐：庄/闲/和，赔率 0.95 / 1.0 / 8.0')
        .alias('baccarat', '庄闲')
        .action(async ({ session }, amount, pick) => {
        if (!session.userId)
            return;
        if (!config.casinoEnabled)
            return '赌场系统未开启。';
        const key = (0, util_1.userKey)(session);
        const row = await core.getUser(key);
        const prep = await preBet(key, amount, row);
        if (typeof prep === 'string')
            return prep;
        const n = prep.n;
        let pickEn = null;
        if (pick === '庄' || pick.includes('庄'))
            pickEn = 'banker';
        else if (pick === '闲' || pick.includes('闲'))
            pickEn = 'player';
        else if (pick === '和' || pick.includes('和'))
            pickEn = 'tie';
        if (!pickEn)
            return '请输入「庄」「闲」或「和」，例如「百家乐 100 庄」。';
        const banker = (0, util_1.randomInt)(0, 9);
        const player = (0, util_1.randomInt)(0, 9);
        const bankerWin = banker > player;
        const playerWin = player > banker;
        const isTie = banker === player;
        const lines = [`🎴 庄 ${banker} | 闲 ${player}${isTie ? '（和）' : ''}`];
        let won = false, mult = 0;
        if (pickEn === 'banker' && bankerWin) {
            won = true;
            mult = 0.95;
        }
        else if (pickEn === 'player' && playerWin) {
            won = true;
            mult = 1.0;
        }
        else if (pickEn === 'tie' && isTie) {
            won = true;
            mult = 8.0;
        }
        if (won) {
            // 净赚 mult × n（含本金）→ 总到手 = n + n*mult
            const payout = Math.floor(n + n * mult);
            return await core.dbTx(async (db) => {
                const dbAny = db;
                await dbAny.set('daily_points', { userId: key }, { points: row.points + payout });
                lines.push(`✅ 命中！赔率 ${mult}×，到手 ${payout}（含本金），现金：${row.points + payout}`);
                return lines.join('\n');
            });
        }
        const poolFee = Math.floor(n * config.casinoHouseEdge);
        const newPool = await feedCasinoPool(poolFee);
        lines.push(`❌ 没中，输掉 ${n}（其中 ${poolFee} 入奖池 ${(0, util_1.fmtMoney)(newPool)}）`);
        lines.push(`当前现金：${row.points - n}`);
        return lines.join('\n');
    });
    ctx.command('经济/娱乐/赌场/牛牛 <amount:string>', '牛牛：抽 5 张，凑出 3 张整 10 倍数算有牛，1:2 赢')
        .alias('niuniu', '妞妞')
        .action(async ({ session }, amount) => {
        if (!session.userId)
            return;
        if (!config.casinoEnabled)
            return '赌场系统未开启。';
        const key = (0, util_1.userKey)(session);
        const row = await core.getUser(key);
        const prep = await preBet(key, amount, row);
        if (typeof prep === 'string')
            return prep;
        const n = prep.n;
        // 抽 5 张（1-10），判断能否选 3 张组成整 10 倍数
        const hand = [];
        for (let i = 0; i < 5; i++)
            hand.push((0, util_1.randomInt)(1, 10));
        const handStr = hand.join(' ');
        // 5 选 3 共 10 种组合，遍历任一组合 mod 10 == 0 即有牛
        const hasNiu = (() => {
            for (let i = 0; i < 5; i++)
                for (let j = i + 1; j < 5; j++)
                    for (let k = j + 1; k < 5; k++)
                        if ((hand[i] + hand[j] + hand[k]) % 10 === 0)
                            return true;
            return false;
        })();
        const lines = [`🐂 牛牛：${handStr}`];
        if (hasNiu) {
            // 1:2 赢（含本金）→ 到手 = 2n
            const payout = n * 2;
            return await core.dbTx(async (db) => {
                const dbAny = db;
                await dbAny.set('daily_points', { userId: key }, { points: row.points + payout });
                lines.push(`🐄 有牛！1:2 赢，到手 ${payout}（含本金），现金：${row.points + payout}`);
                return lines.join('\n');
            });
        }
        const poolFee = Math.floor(n * config.casinoHouseEdge);
        const newPool = await feedCasinoPool(poolFee);
        lines.push(`❌ 无牛，输掉 ${n}（其中 ${poolFee} 入奖池 ${(0, util_1.fmtMoney)(newPool)}）`);
        lines.push(`当前现金：${row.points - n}`);
        return lines.join('\n');
    });
    return { getCasinoPool, feedCasinoPool, drainCasinoPool };
}
