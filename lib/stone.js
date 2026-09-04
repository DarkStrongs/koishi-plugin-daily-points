"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerStone = registerStone;
const config_1 = require("./config");
/**
 * 5 类原石的种子数据。
 *
 * 词条价值分布：高价值词条（≥80%）稀缺，低价值词条（≤30%）普遍。
 *  翡翠 / 和田玉 含 +90%/+100% 顶级词条（至宝出货天花板）
 *  普通石头 最高仅 +50%（化石） → 至宝也只是"小赚"
 */
const STONE_TYPE_SEEDS = [
    {
        code: 'jadeite',
        name: '翡翠原石',
        icon: '🪨',
        description: '高风险高回报，出帝王绿直接翻 100×；普通石头里 99% 是砖头',
        basePrice: 100,
        rarityWeights: { brick: 0.40, common: 0.22, rare: 0.16, epic: 0.12, legendary: 0.07, supreme: 0.03 },
        affixes: [
            { code: 'emperor_green', name: '帝王绿', value: 1.50 },
            { code: 'glass_type', name: '玻璃种', value: 0.90 },
            { code: 'yang_green', name: '阳绿', value: 0.80 },
            { code: 'spring_color', name: '春带彩', value: 0.60 },
            { code: 'old_pagan', name: '老帕敢', value: 0.60 },
            { code: 'hou_jiang', name: '后江', value: 0.70 },
            { code: 'mo_xi_sha', name: '莫西沙', value: 0.50 },
            { code: 'ice_type', name: '冰种', value: 0.50 },
            { code: 'violet', name: '紫罗兰', value: 0.50 },
            { code: 'mu_na', name: '木那', value: 0.40 },
            { code: 'mo_wan_ji', name: '莫湾基', value: 0.40 },
            { code: 'full_green', name: '满绿', value: 0.40 },
            { code: 'yellow_green', name: '黄加绿', value: 0.35 },
            { code: 'hui_ka', name: '会卡', value: 0.30 },
            { code: 'carving', name: '雕工精湛', value: 0.30 },
            { code: 'glutinous_ice', name: '糯冰种', value: 0.30 },
            { code: 'old_pat', name: '老坑', value: 0.25 },
            { code: 'floating_flower', name: '飘花', value: 0.25 },
            { code: 'wrapped', name: '满包浆', value: 0.25 },
            { code: 'black_spot', name: '飘黑', value: 0.20 },
            { code: 'natural_grain', name: '天然纹路', value: 0.15 },
        ],
    },
    {
        code: 'hetian',
        name: '和田玉',
        icon: '💎',
        description: '白润为上，羊脂白千金难求；老坑籽料有市无价',
        basePrice: 100,
        rarityWeights: { brick: 0.45, common: 0.22, rare: 0.16, epic: 0.10, legendary: 0.05, supreme: 0.02 },
        affixes: [
            { code: 'mutton_fat', name: '羊脂白', value: 1.00 },
            { code: 'topaz_hetian', name: '黄玉', value: 0.60 },
            { code: 'seed', name: '籽料', value: 0.50 },
            { code: 'qi_se', name: '沁色', value: 0.45 },
            { code: 'sa_jin_pi', name: '洒金皮', value: 0.40 },
            { code: 'jade_green', name: '碧玉', value: 0.40 },
            { code: 'sugar', name: '糖玉', value: 0.35 },
            { code: 'ju_pi', name: '聚皮', value: 0.35 },
            { code: 'ink', name: '墨玉', value: 0.30 },
            { code: 'gobi', name: '戈壁料', value: 0.30 },
            { code: 'hetian_carving', name: '雕工精湛', value: 0.30 },
            { code: 'hetian_old', name: '老坑', value: 0.25 },
            { code: 'hetian_pat', name: '包浆', value: 0.25 },
            { code: 'full_skin', name: '满皮', value: 0.20 },
            { code: 'mountain', name: '山料', value: 0.20 },
        ],
    },
    {
        code: 'nanhong',
        name: '南红玛瑙',
        icon: '🔴',
        description: '红得热烈，柿子红/锦红最珍贵；保山料为王',
        basePrice: 100,
        rarityWeights: { brick: 0.50, common: 0.22, rare: 0.15, epic: 0.08, legendary: 0.04, supreme: 0.01 },
        affixes: [
            { code: 'brocade_red', name: '锦红', value: 0.90 },
            { code: 'rose_red', name: '玫瑰红', value: 0.60 },
            { code: 'persimmon_red', name: '柿子红', value: 0.50 },
            { code: 'baoshan', name: '保山料', value: 0.50 },
            { code: 'full_meat', name: '满肉', value: 0.45 },
            { code: 'cherry_red', name: '樱桃红', value: 0.40 },
            { code: 'persimmon_yellow', name: '柿子黄', value: 0.40 },
            { code: 'flame_grain', name: '火焰纹', value: 0.35 },
            { code: 'jiukou', name: '九口料', value: 0.30 },
            { code: 'ice_float', name: '冰飘', value: 0.30 },
            { code: 'liangshan', name: '凉山料', value: 0.25 },
            { code: 'nanhong_old', name: '老坑', value: 0.25 },
        ],
    },
    {
        code: 'agate',
        name: '玛瑙',
        icon: '🟤',
        description: '入门级宝石，水胆玛瑙和战国红有惊喜',
        basePrice: 100,
        rarityWeights: { brick: 0.55, common: 0.22, rare: 0.13, epic: 0.06, legendary: 0.03, supreme: 0.01 },
        affixes: [
            { code: 'warring_states', name: '战国红', value: 0.70 },
            { code: 'water_agate', name: '水胆玛瑙', value: 0.60 },
            { code: 'fire_agate', name: '火玛瑙', value: 0.50 },
            { code: 'agate_nanhong', name: '南红玛瑙', value: 0.50 },
            { code: 'moss_agate', name: '苔藓玛瑙', value: 0.45 },
            { code: 'silk_agate', name: '缠丝玛瑙', value: 0.40 },
            { code: 'grape_agate', name: '葡萄玛瑙', value: 0.35 },
            { code: 'purple_agate', name: '紫玛瑙', value: 0.35 },
            { code: 'north_red', name: '北红', value: 0.30 },
            { code: 'rain_flower', name: '雨花石', value: 0.25 },
        ],
    },
    {
        code: 'common',
        name: '普通石头',
        icon: '🪨',
        description: '几乎全是砖头料，化石已是最大惊喜；收藏价值有限',
        basePrice: 100,
        rarityWeights: { brick: 0.70, common: 0.18, rare: 0.07, epic: 0.03, legendary: 0.015, supreme: 0.005 },
        affixes: [
            { code: 'fossil', name: '化石', value: 0.50 },
            { code: 'marble', name: '大理石纹', value: 0.20 },
            { code: 'stalactite', name: '钟乳石', value: 0.15 },
            { code: 'quartz', name: '石英', value: 0.10 },
            { code: 'cobble', name: '鹅卵石', value: 0.08 },
            { code: 'calcite', name: '方解石', value: 0.05 },
            { code: 'gneiss', name: '片麻岩', value: 0.05 },
            { code: 'gravel', name: '砾石', value: 0.03 },
        ],
    },
];
const RARITY_LABELS = {
    brick: '🧱砖头料',
    common: '🟢普通',
    rare: '🔵稀有',
    epic: '🟣史诗',
    legendary: '🟡传说',
    supreme: '🔴至宝',
};
const RARITY_AFFIX_COUNT = {
    brick: 0,
    common: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
    supreme: 5,
};
/** 排序时由低到高（砖头 → 至宝），用于稀有度比较 */
const RARITY_RANK = {
    brick: 0, common: 1, rare: 2, epic: 3, legendary: 4, supreme: 5,
};
// ──────────────────────────────────────────────────────────────────────────
/**
 * 计算一块切好的石头当前的"收藏价值"
 * 公式：baseSale × (1 + rate)^daysHeld，带软/硬上限
 *
 * @param baseSale   立即卖出价（已含词条价值）
 * @param basePrice  原石基础购入价（用于硬上限计算）
 * @param daysHeld  持有天数（> 0）
 */
function computeCollectionValue(baseSale, basePrice, daysHeld, config) {
    if (daysHeld <= 0 || baseSale <= 0)
        return baseSale;
    let value = baseSale;
    const dailyRate = config.stoneHoldingDailyRate;
    const softCap = basePrice * config.stoneHoldingSoftCapMul;
    const decayRate = config.stoneHoldingDecayRate;
    const hardCap = basePrice * config.stoneHoldingHardCapMul;
    for (let i = 0; i < Math.floor(daysHeld); i++) {
        if (value >= hardCap) {
            value = hardCap;
            break;
        }
        const rate = value < softCap ? dailyRate : decayRate;
        value = value * (1 + rate);
        if (value > hardCap)
            value = hardCap;
    }
    return Math.floor(value * 100) / 100;
}
/** 按概率分布抽一个稀有度 */
function rollRarity(weights) {
    const r = Math.random();
    let cum = 0;
    for (const rarity of ['brick', 'common', 'rare', 'epic', 'legendary', 'supreme']) {
        cum += weights[rarity];
        if (r < cum)
            return rarity;
    }
    return 'brick';
}
/** 从 affix 池中无重复抽样 N 个 */
function sampleAffixes(pool, n, forceHighValue = false) {
    if (n <= 0 || pool.length === 0)
        return [];
    // 至宝：必含一个 value >= 0.8 的高价值词条（若有）
    if (forceHighValue) {
        const high = pool.filter((a) => a.value >= 0.8);
        if (high.length > 0) {
            const pickHigh = high[Math.floor(Math.random() * high.length)];
            const others = pool.filter((a) => a.code !== pickHigh.code);
            const rest = sampleAffixes(others, n - 1, false);
            return [pickHigh, ...rest];
        }
    }
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(n, shuffled.length));
}
// ──────────────────────────────────────────────────────────────────────────
function registerStone({ ctx, config, core, casino }) {
    // ── 工具：解析 seed 行（affixPool / rarityWeights 都是 JSON 字符串） ──
    function parseStoneRow(row) {
        return {
            ...row,
            affixes: JSON.parse(row.affixPool || '[]'),
            rarityWeights: JSON.parse(row.rarityWeights || '{}'),
        };
    }
    // ── 启动时初始化 5 类原石（不存在则插入，存在则确保 affixPool 同步） ──
    async function ensureStoneTypes() {
        const existing = await ctx.database.get('daily_stone_types', {});
        const existingMap = new Map(existing.map((r) => [r.code, r]));
        const now = new Date();
        for (const seed of STONE_TYPE_SEEDS) {
            const payload = {
                code: seed.code,
                name: seed.name,
                icon: seed.icon,
                description: seed.description,
                basePrice: seed.basePrice,
                affixPool: JSON.stringify(seed.affixes),
                rarityWeights: JSON.stringify(seed.rarityWeights),
                updatedAt: now,
            };
            if (!existingMap.has(seed.code)) {
                await ctx.database.create('daily_stone_types', payload);
            }
            else {
                // 仅在配置变更时（basePrice/affixPool/rarityWeights 与现有不一致）才更新
                const cur = existingMap.get(seed.code);
                const need = cur.basePrice !== seed.basePrice
                    || cur.affixPool !== payload.affixPool
                    || cur.rarityWeights !== payload.rarityWeights
                    || cur.name !== seed.name
                    || cur.icon !== seed.icon;
                if (need)
                    await ctx.database.set('daily_stone_types', { code: seed.code }, payload);
            }
        }
    }
    // ── 清理过期市场库存，并按需补满 ──
    async function refreshMarketIfDue() {
        // 0) 先确保 5 类原石种子存在（首次运行时）
        await ensureStoneTypes();
        const now = Date.now();
        // 1) 清掉过期的
        const expired = await ctx.database.get('daily_stone_market', {});
        const expiredIds = expired
            .filter((r) => new Date(r.expiresAt).getTime() <= now)
            .map((r) => r.id);
        if (expiredIds.length > 0) {
            await ctx.database.remove('daily_stone_market', { id: expiredIds });
        }
        // 2) 看是否需要补库存
        const remaining = await ctx.database.get('daily_stone_market', {});
        const target = Math.max(0, config.stoneMarketStockSize);
        const need = target - remaining.length;
        if (need <= 0)
            return;
        const types = await ctx.database.get('daily_stone_types', {});
        if (types.length === 0)
            return;
        const expiresAt = new Date(now + config.stoneMarketRefreshHours * config_1.HOUR);
        const rows = [];
        for (let i = 0; i < need; i++) {
            // 70% 概率出"普通石头 + 玛瑙"这种低档，30% 出"翡翠 / 和田玉"高档
            let pool;
            const roll = Math.random();
            if (roll < 0.3) {
                pool = ['jadeite', 'hetian'];
            }
            else if (roll < 0.6) {
                pool = ['nanhong'];
            }
            else if (roll < 0.85) {
                pool = ['agate'];
            }
            else {
                pool = ['common'];
            }
            const stoneType = pool[Math.floor(Math.random() * pool.length)];
            // 价格档按"指数分布"——低价档数量多，高价档稀少
            const tierRoll = Math.random();
            let priceTier;
            if (tierRoll < 0.4)
                priceTier = 0;
            else if (tierRoll < 0.7)
                priceTier = 1;
            else if (tierRoll < 0.88)
                priceTier = 2;
            else if (tierRoll < 0.97)
                priceTier = 3;
            else
                priceTier = 4;
            rows.push({
                stoneType,
                priceTier,
                listedAt: new Date(now),
                expiresAt,
            });
        }
        if (rows.length > 0)
            await ctx.database.create('daily_stone_market', rows);
    }
    // ── 计算 saleMultiplier：词条价值加和（砖头 = brickProtectionRate） ──
    function calcSaleMultiplier(rarity, affixes) {
        if (rarity === 'brick')
            return config.stoneBrickProtectionRate;
        return affixes.reduce((sum, a) => sum + a.value, 0);
    }
    // ── 立即卖出价 = basePrice × saleMultiplier（无论是否切了） ──
    function calcImmediateSale(basePrice, saleMultiplier) {
        return Math.floor(basePrice * saleMultiplier * 100) / 100;
    }
    // ── 当前价值（持仓 N 天，含持有溢价） ──
    function calcCurrentValue(basePrice, saleMultiplier, boughtAt) {
        const daysHeld = Math.max(0, (Date.now() - new Date(boughtAt).getTime()) / config_1.DAY);
        const baseSale = calcImmediateSale(basePrice, saleMultiplier);
        return computeCollectionValue(baseSale, basePrice, daysHeld, config);
    }
    // ── 玩家当日已购石头数 ──
    async function getTodayPurchaseStats(userKey) {
        const dayMs = 24 * config_1.HOUR;
        const since = Date.now() - dayMs;
        const rows = await ctx.database.get('daily_stone_inventory', { userId: userKey });
        const today = rows.filter((r) => new Date(r.boughtAt).getTime() >= since);
        let amount = 0;
        for (const r of today) {
            const tierPrice = config.stonePriceTiers[r.priceTier] || 0;
            amount += tierPrice;
        }
        return { count: today.length, amount };
    }
    // ── 写图鉴（不重复） ──
    async function recordCodex(userKey, stoneType, affixes) {
        if (affixes.length === 0)
            return;
        const rows = affixes.map((a) => ({
            userId: userKey,
            stoneType,
            affixCode: a.code,
            discoveredAt: new Date(),
        }));
        // 逐条 upsert，避免 unique 冲突
        for (const row of rows) {
            const existing = await ctx.database.get('daily_stone_codex', {
                userId: row.userId, stoneType: row.stoneType, affixCode: row.affixCode,
            });
            if (existing.length === 0) {
                await ctx.database.create('daily_stone_codex', row);
            }
        }
    }
    // ─────────────────────────────────────────────────────────────────────
    // 命令注册
    // ─────────────────────────────────────────────────────────────────────
    ctx.command('经济/娱乐/赌石', '赌石收藏玩法（积分回收器）：囤石流 + 词条 + 持有溢价')
        .action(() => {
        const tiersStr = config.stonePriceTiers.map((t) => `T${config.stonePriceTiers.indexOf(t) + 1}:¥${t.toLocaleString()}`).join(' / ');
        const examples = STONE_TYPE_SEEDS.map((s) => `${s.icon}${s.code === 'jadeite' ? '翡翠' : s.code === 'hetian' ? '和田玉' : s.code === 'nanhong' ? '南红' : s.code === 'agate' ? '玛瑙' : '普通'}`).join(' ');
        return [
            '🪨 赌石玩法：',
            '  · 这是积分回收器，不是暴富机。买 = 投钱，切 = 揭示词条，卖 = 落袋为安（亏）。',
            '  · 每 24h 市场刷新一次（' + config.stoneMarketStockSize + ' 块），过期自动下架',
            '  · 词条等级：🧱砖头 → 🟢普通 → 🔵稀有 → 🟣史诗 → 🟡传说 → 🔴至宝（0~5 个词条）',
            '  · 立即卖出价 = 基础价 × 词条价值加和（砖头仅退 ' + (config.stoneBrickProtectionRate * 100).toFixed(0) + '%），多数情况是亏的',
            '  · 持有溢价：每日 +' + (config.stoneHoldingDailyRate * 100).toFixed(0) + '% 复利（在 ≤' + config.stoneHoldingSoftCapMul + '×基础价内），超软上限后降到 +' + (config.stoneHoldingDecayRate * 100).toFixed(0) + '%，硬上限 = ' + config.stoneHoldingHardCapMul + '×基础价',
            '  · 卖出后 ' + (config.stoneCasinoPoolRate * 100).toFixed(0) + '% 入赌场池（v1.12.0 已连接），剩余销毁 → 积分永久出系统',
            '',
            '  价格档：' + tiersStr,
            '  类型：' + examples,
            '',
            '指令：赌石市场｜买原石 [#ID]｜切石 [#ID]｜卖石 [#ID]｜我的原石｜原石图鉴｜原石排行榜｜原石估价 [#ID]',
        ].join('\n');
    });
    // 赌石市场
    ctx.command('经济/娱乐/赌石市场', '查看今日原石市场（每 24h 刷新）')
        .alias('赌石列表', '赌石货架', '赌石stock', 'dushi-market')
        .action(async ({ session }) => {
        if (!config.stoneEnabled)
            return '赌石系统未开启。';
        await refreshMarketIfDue();
        const rows = await ctx.database.get('daily_stone_market', {});
        if (rows.length === 0)
            return '🪨 原石市场空着，等待刷新。';
        const types = await ctx.database.get('daily_stone_types', {});
        const typeMap = new Map(types.map((t) => [t.code, parseStoneRow(t)]));
        const sorted = [...rows].sort((a, b) => a.id - b.id);
        const lines = ['🪨 今日原石市场（共 ' + sorted.length + ' 块）', ''];
        for (const row of sorted) {
            const t = typeMap.get(row.stoneType);
            if (!t)
                continue;
            const tierPrice = config.stonePriceTiers[row.priceTier] || 0;
            const tierLabel = 'T' + (row.priceTier + 1);
            lines.push(`#${row.id}  ${t.icon} ${t.name}  ${tierLabel}=¥${tierPrice.toLocaleString()}  ` +
                `（${RARITY_LABELS.brick}概率 ${((t.rarityWeights.brick || 0) * 100).toFixed(0)}%）`);
        }
        const expiresAt = new Date(Math.min(...sorted.map((r) => new Date(r.expiresAt).getTime())));
        const hoursLeft = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / config_1.HOUR * 10) / 10);
        lines.push('');
        lines.push(`市场将于 ${hoursLeft} 小时后刷新。`);
        lines.push('发送「买原石 #ID」入手一块。');
        return lines.join('\n');
    });
    // 买原石
    ctx.command('经济/娱乐/买原石 <id:string>', '从市场买入一块原石（仅锁定，未切）')
        .alias('买原石', 'buy-stone', '入石', '囤石')
        .action(async ({ session }, idStr) => {
        if (!config.stoneEnabled)
            return '赌石系统未开启。';
        if (!session.userId)
            return;
        const key = `${session.platform}:${session.userId}`;
        const id = parseInt(idStr.replace(/^#/, ''));
        if (!Number.isFinite(id) || id <= 0)
            return '请用「买原石 #ID」格式，ID 在「赌石市场」列表里。';
        const market = await ctx.database.get('daily_stone_market', { id });
        if (market.length === 0)
            return '市场上找不到这块石头（可能被抢走或已刷新）。';
        const block = market[0];
        if (new Date(block.expiresAt).getTime() <= Date.now())
            return '这块石头已过期下架，市场即将刷新。';
        const tierPrice = config.stonePriceTiers[block.priceTier];
        if (!tierPrice || tierPrice <= 0)
            return '价格档配置异常，请联系管理员。';
        // 限购检查
        const stats = await getTodayPurchaseStats(key);
        if (stats.count >= config.stoneDailyPurchaseLimit) {
            return `今日已达购买上限 ${config.stoneDailyPurchaseLimit} 块，明天再来。`;
        }
        if (config.stoneDailyAmountLimit > 0 && stats.amount + tierPrice > config.stoneDailyAmountLimit) {
            return `今日累计买入已达 ¥${stats.amount.toLocaleString()}，超 ¥${config.stoneDailyAmountLimit.toLocaleString()} 上限，明天再来。`;
        }
        const user = await core.getUser(key);
        if (!user)
            return '用户初始化失败。';
        if (user.points < tierPrice)
            return `现金不足：需要 ¥${tierPrice.toLocaleString()}，你只有 ¥${user.points.toLocaleString()}。`;
        const types = await ctx.database.get('daily_stone_types', { code: block.stoneType });
        const stoneType = parseStoneRow(types[0]);
        // 事务：从市场移除 + 扣现金 + 写入背包
        const newId = await core.dbTx(async (db) => {
            const dbAny = db;
            await dbAny.remove('daily_stone_market', { id: block.id });
            await dbAny.set('daily_points', { userId: key }, { points: user.points - tierPrice });
            const fresh = await dbAny.create('daily_stone_inventory', {
                userId: key,
                stoneType: block.stoneType,
                priceTier: block.priceTier,
                boughtAt: new Date(),
                cutAt: null,
                rarity: null,
                affixes: '[]',
                saleMultiplier: 0,
                status: 'holding',
                soldAt: null,
                soldValue: 0,
            });
            const id = Array.isArray(fresh) ? fresh[0]?.id : fresh?.id;
            return id;
        });
        const tierLabel = 'T' + (block.priceTier + 1);
        return [
            `✅ 已入手 #${newId}  ${stoneType.icon} ${stoneType.name}（${tierLabel} ¥${tierPrice.toLocaleString()}）`,
            `现金：¥${user.points.toLocaleString()} → ¥${(user.points - tierPrice).toLocaleString()}`,
            `状态：holding（未切，可囤可卖；不过卖未切的 = 仅退 ${(config.stoneBrickProtectionRate * 100).toFixed(0)}%）`,
            `发送「切石 #${newId}」揭示词条。`,
        ].join('\n');
    });
    // 切石
    ctx.command('经济/娱乐/切石 <id:string>', '切开背包里的原石，揭示词条')
        .alias('切原石', 'cut-stone', '揭石', '解石')
        .action(async ({ session }, idStr) => {
        if (!config.stoneEnabled)
            return '赌石系统未开启。';
        if (!session.userId)
            return;
        const key = `${session.platform}:${session.userId}`;
        const id = parseInt(idStr.replace(/^#/, ''));
        if (!Number.isFinite(id) || id <= 0)
            return '请用「切石 #ID」格式。';
        const rows = await ctx.database.get('daily_stone_inventory', { id, userId: key });
        const stone = rows[0];
        if (!stone)
            return '背包里没这块石头（ID 或用户不匹配）。';
        if (stone.status === 'sold')
            return '这块石头已经卖了。';
        if (stone.status === 'cut')
            return `这块石头已经切过了（${RARITY_LABELS[stone.rarity] || stone.rarity}）。`;
        const types = await ctx.database.get('daily_stone_types', { code: stone.stoneType });
        if (types.length === 0)
            return '原石类型不存在。';
        const stoneType = parseStoneRow(types[0]);
        // 切石：抽稀有度 + 词条 + 写图鉴 + 更新背包
        const rarity = rollRarity(stoneType.rarityWeights);
        const need = RARITY_AFFIX_COUNT[rarity];
        const affixes = sampleAffixes(stoneType.affixes, need, rarity === 'supreme');
        const saleMul = calcSaleMultiplier(rarity, affixes);
        await ctx.database.set('daily_stone_inventory', { id: stone.id }, {
            cutAt: new Date(),
            rarity,
            affixes: JSON.stringify(affixes),
            saleMultiplier: saleMul,
            status: 'cut',
        });
        await recordCodex(key, stone.stoneType, affixes);
        // 渲染消息
        const tierPrice = config.stonePriceTiers[stone.priceTier];
        const baseSale = calcImmediateSale(tierPrice, saleMul);
        const lines = [
            `🔪 切开 #${stone.id}  ${stoneType.icon} ${stoneType.name}`,
            '',
            `稀有度：${RARITY_LABELS[rarity]}`,
        ];
        if (affixes.length === 0) {
            lines.push('词条：无（纯砖头料）');
            lines.push(`立即卖出价：¥${baseSale.toLocaleString()}（基础 ¥${tierPrice.toLocaleString()} 的 ${(config.stoneBrickProtectionRate * 100).toFixed(0)}%）`);
        }
        else {
            const affixStr = affixes.map((a) => `${a.name} +${(a.value * 100).toFixed(0)}%`).join(' / ');
            lines.push(`词条（${affixes.length}）：` + affixStr);
            lines.push(`立即卖出价：¥${baseSale.toLocaleString()}（基础 ¥${tierPrice.toLocaleString()} × 词条系数 ${saleMul.toFixed(2)}）`);
        }
        lines.push('');
        lines.push(`持有奖励：每天 +${(config.stoneHoldingDailyRate * 100).toFixed(0)}%（≤${config.stoneHoldingSoftCapMul}×基础价内），上限 ${config.stoneHoldingHardCapMul}×基础价。`);
        lines.push(`发送「卖石 #${stone.id}」立即出售 / 「原石估价 #${stone.id}」先看当前价值。`);
        return lines.join('\n');
    });
    // 卖石
    ctx.command('经济/娱乐/卖石 <id:string>', '立即卖出某块石头（按词条价值 + 持有溢价结算）')
        .alias('卖原石', 'sell-stone', '出石')
        .action(async ({ session }, idStr) => {
        if (!config.stoneEnabled)
            return '赌石系统未开启。';
        if (!session.userId)
            return;
        const key = `${session.platform}:${session.userId}`;
        const id = parseInt(idStr.replace(/^#/, ''));
        if (!Number.isFinite(id) || id <= 0)
            return '请用「卖石 #ID」格式。';
        const rows = await ctx.database.get('daily_stone_inventory', { id, userId: key });
        const stone = rows[0];
        if (!stone)
            return '背包里没这块石头。';
        if (stone.status === 'sold')
            return `这块石头已经卖出过（¥${stone.soldValue.toLocaleString()}，${new Date(stone.soldAt).toLocaleString('zh-CN', { hour12: false })}）。`;
        const types = await ctx.database.get('daily_stone_types', { code: stone.stoneType });
        if (types.length === 0)
            return '原石类型不存在。';
        const stoneType = parseStoneRow(types[0]);
        const tierPrice = config.stonePriceTiers[stone.priceTier];
        // 计算当前价值（含持有溢价）
        const currentValue = calcCurrentValue(tierPrice, stone.saleMultiplier || config.stoneBrickProtectionRate, stone.boughtAt);
        const originalSale = calcImmediateSale(tierPrice, stone.saleMultiplier || config.stoneBrickProtectionRate);
        const holdBonus = Math.max(0, Math.round((currentValue - originalSale) * 100) / 100);
        // 事务：标记 sold + 加钱 + 抽水进赌场池
        const user = await core.getUser(key);
        if (!user)
            return '用户不存在。';
        const finalPayout = Math.floor(currentValue);
        const toPool = Math.round(finalPayout * config.stoneCasinoPoolRate);
        await core.dbTx(async (db) => {
            const dbAny = db;
            await dbAny.set('daily_stone_inventory', { id: stone.id }, {
                status: 'sold',
                soldAt: new Date(),
                soldValue: finalPayout,
            });
            await dbAny.set('daily_points', { userId: key }, { points: user.points + finalPayout });
            await dbAny.create('daily_meta', { key: `stone:last_sell:${Date.now()}`, value: String(finalPayout) });
        });
        // 抽水 → 赌场池
        if (toPool > 0)
            await casino.feedCasinoPool(toPool);
        const lines = [
            `💰 卖出 #${stone.id}  ${stoneType.icon} ${stoneType.name}`,
            '',
            `稀有度：${RARITY_LABELS[stone.rarity] || stone.rarity}`,
            `立即卖出价：¥${originalSale.toLocaleString()}（基础 ${(stone.saleMultiplier || config.stoneBrickProtectionRate).toFixed(2)}×）`,
            `持有加成：+¥${holdBonus.toLocaleString()}`,
            `实收：¥${finalPayout.toLocaleString()}`,
            `其中 ¥${toPool.toLocaleString()}（${(config.stoneCasinoPoolRate * 100).toFixed(0)}%）入赌场池 → 已被彩票征走，余下 ${(100 - config.stoneCasinoPoolRate * 100).toFixed(0)}% 销毁（积分回收）。`,
            `现金：¥${user.points.toLocaleString()} → ¥${(user.points + finalPayout).toLocaleString()}`,
        ];
        return lines.join('\n');
    });
    // 我的原石
    ctx.command('经济/娱乐/我的原石', '查看我的原石收藏，按当前价值排序')
        .alias('原石背包', '我的石头', 'my-stones')
        .action(async ({ session }) => {
        if (!config.stoneEnabled)
            return '赌石系统未开启。';
        if (!session.userId)
            return;
        const key = `${session.platform}:${session.userId}`;
        const all = await ctx.database.get('daily_stone_inventory', { userId: key });
        const inv = all.filter((r) => r.status !== 'sold');
        if (inv.length === 0)
            return '🪨 你的原石收藏还是空的，去「赌石市场」入手一块。';
        const types = await ctx.database.get('daily_stone_types', {});
        const typeMap = new Map(types.map((t) => [t.code, parseStoneRow(t)]));
        // 计算当前价值
        const rows = inv.map((r) => {
            const tPrice = config.stonePriceTiers[r.priceTier];
            const value = calcCurrentValue(tPrice, r.saleMultiplier || 0, r.boughtAt);
            return { ...r, currentValue: value, basePrice: tPrice };
        });
        rows.sort((a, b) => b.currentValue - a.currentValue);
        const totalValue = rows.reduce((s, r) => s + r.currentValue, 0);
        const holding = rows.filter((r) => r.status === 'holding').length;
        const cut = rows.filter((r) => r.status === 'cut').length;
        const lines = [`🪨 我的原石收藏（共 ${inv.length} 块｜未切 ${holding}｜已切 ${cut}）`, `总收藏价值：¥${Math.floor(totalValue).toLocaleString()}`, ''];
        for (const r of rows.slice(0, 30)) {
            const t = typeMap.get(r.stoneType);
            const tName = t ? `${t.icon}${t.name}` : r.stoneType;
            const tierLabel = 'T' + (r.priceTier + 1);
            const daysHeld = Math.max(0, Math.round((Date.now() - new Date(r.boughtAt).getTime()) / config_1.DAY * 10) / 10);
            const statusLabel = r.status === 'holding' ? '🪨未切' : `${RARITY_LABELS[r.rarity] || r.rarity}`;
            lines.push(`#${r.id} ${tName} ${tierLabel}  ${statusLabel}  已持 ${daysHeld}d  当前价值 ¥${Math.floor(r.currentValue).toLocaleString()}（投入 ¥${r.basePrice.toLocaleString()}）`);
        }
        if (rows.length > 30)
            lines.push(`…还有 ${rows.length - 30} 块未显示`);
        return lines.join('\n');
    });
    // 原石估价
    ctx.command('经济/娱乐/原石估价 <id:string>', '详细算一块石头的当前价值（持有天数 × 涨幅）')
        .alias('估价', 'stone-estimate')
        .action(async ({ session }, idStr) => {
        if (!config.stoneEnabled)
            return '赌石系统未开启。';
        if (!session.userId)
            return;
        const key = `${session.platform}:${session.userId}`;
        const id = parseInt(idStr.replace(/^#/, ''));
        if (!Number.isFinite(id) || id <= 0)
            return '请用「原石估价 #ID」格式。';
        const rows = await ctx.database.get('daily_stone_inventory', { id, userId: key });
        const stone = rows[0];
        if (!stone)
            return '背包里没这块石头。';
        if (stone.status === 'sold')
            return `这块石头已卖出，结算价 ¥${stone.soldValue.toLocaleString()}。`;
        const types = await ctx.database.get('daily_stone_types', { code: stone.stoneType });
        const t = parseStoneRow(types[0]);
        const basePrice = config.stonePriceTiers[stone.priceTier];
        const baseSale = calcImmediateSale(basePrice, stone.saleMultiplier || config.stoneBrickProtectionRate);
        const current = calcCurrentValue(basePrice, stone.saleMultiplier || config.stoneBrickProtectionRate, stone.boughtAt);
        const daysHeld = (Date.now() - new Date(stone.boughtAt).getTime()) / config_1.DAY;
        const affixList = stone.affixes ? JSON.parse(stone.affixes) : [];
        const lines = [
            `🔍 原石 #${stone.id} 估值`,
            `类型：${t.icon}${t.name}（T${stone.priceTier + 1} 基础价 ¥${basePrice.toLocaleString()}）`,
            `状态：${stone.status === 'holding' ? '🪨 未切（卖只能退 ' + (config.stoneBrickProtectionRate * 100).toFixed(0) + '%）' : RARITY_LABELS[stone.rarity] || stone.rarity}`,
            '',
            `立即卖出价：¥${baseSale.toLocaleString()}（词条系数 ${(stone.saleMultiplier || config.stoneBrickProtectionRate).toFixed(2)}）`,
            `持有天数：${daysHeld.toFixed(1)} d`,
            `当前价值（含持有溢价）：¥${Math.floor(current).toLocaleString()}`,
            `对比：投入 ¥${basePrice.toLocaleString()} → 当前 ¥${Math.floor(current).toLocaleString()}（${current >= basePrice ? '+' : ''}${((current / basePrice - 1) * 100).toFixed(1)}%）`,
            '',
        ];
        if (affixList.length > 0) {
            lines.push('词条：');
            for (const a of affixList) {
                lines.push(`  · ${a.name} +${(a.value * 100).toFixed(0)}%`);
            }
        }
        lines.push('');
        lines.push(stone.status === 'holding'
            ? `切石后才有收藏溢价。先「切石 #${stone.id}」再来看。`
            : `发送「卖石 #${stone.id}」按当前价值 ¥${Math.floor(current).toLocaleString()} 结算。`);
        return lines.join('\n');
    });
    // 原石图鉴
    ctx.command('经济/娱乐/原石图鉴 [type:string]', '查看已发现的词条图鉴（含收集率）')
        .alias('图鉴', 'stone-codex')
        .action(async ({ session }, typeArg) => {
        if (!config.stoneEnabled)
            return '赌石系统未开启。';
        if (!session.userId)
            return;
        const key = `${session.platform}:${session.userId}`;
        const codexRows = await ctx.database.get('daily_stone_codex', { userId: key });
        const types = await ctx.database.get('daily_stone_types', {});
        const filterType = typeArg
            ? types.find((t) => t.name.includes(typeArg) || t.code === typeArg)?.code
            : null;
        if (typeArg && !filterType)
            return `未找到类型 "${typeArg}"，可选：${types.map((t) => t.name).join('/')}`;
        const lines = ['📖 词条图鉴', ''];
        for (const t of types) {
            if (filterType && t.code !== filterType)
                continue;
            const pool = parseStoneRow(t);
            const discovered = codexRows.filter((c) => c.stoneType === t.code).map((c) => c.affixCode);
            const discoveredSet = new Set(discovered);
            const discoveredList = pool.affixes.filter((a) => discoveredSet.has(a.code));
            const remaining = pool.affixes.filter((a) => !discoveredSet.has(a.code));
            const rate = (discoveredSet.size / pool.affixes.length) * 100;
            const tag = rate >= 100 ? '✅' : rate >= 50 ? '🟡' : '🔴';
            lines.push(`${tag} ${pool.icon}${pool.name}（${discoveredSet.size}/${pool.affixes.length} ${rate.toFixed(0)}%）`);
            if (discoveredList.length > 0) {
                lines.push('  已发现：' + discoveredList.map((a) => `${a.name}+${(a.value * 100).toFixed(0)}%`).join(' / '));
            }
            if (remaining.length > 0 && rate < 100) {
                lines.push('  未发现：' + remaining.map((a) => `${a.name}+${(a.value * 100).toFixed(0)}%`).join(' / '));
            }
            lines.push('');
        }
        return lines.join('\n');
    });
    // 原石排行榜（按总持仓价值）
    ctx.command('经济/娱乐/原石排行榜', '全服总收藏价值 TOP')
        .alias('赌石排行', '原石榜', 'stone-leaderboard')
        .action(async () => {
        if (!config.stoneEnabled)
            return '赌石系统未开启。';
        const all = await ctx.database.get('daily_stone_inventory', {});
        const inv = all.filter((r) => r.status !== 'sold');
        if (inv.length === 0)
            return '🪨 还没有人入手原石。';
        const userTotals = new Map();
        for (const r of inv) {
            const basePrice = config.stonePriceTiers[r.priceTier];
            const value = calcCurrentValue(basePrice, r.saleMultiplier || 0, r.boughtAt);
            userTotals.set(r.userId, (userTotals.get(r.userId) || 0) + value);
        }
        const sorted = [...userTotals.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        const lines = ['🏆 原石收藏 TOP 10', ''];
        const medals = ['🥇', '🥈', '🥉'];
        for (let i = 0; i < sorted.length; i++) {
            const [uid, val] = sorted[i];
            const medal = medals[i] || ` ${i + 1}.`;
            const count = inv.filter((r) => r.userId === uid).length;
            lines.push(`${medal} ${uid} — ¥${Math.floor(val).toLocaleString()}（收藏 ${count} 块）`);
        }
        return lines.join('\n');
    });
    // ── 定时器：每 N 小时刷一次市场 + 启动时清过期 ──
    function scheduleStoneMarketRefresh() {
        let inFlight = false;
        const tick = async () => {
            if (inFlight)
                return;
            inFlight = true;
            try {
                await ensureStoneTypes();
                await refreshMarketIfDue();
            }
            catch (e) {
                // ignore — 缺日志接口，不影响主流程
            }
            finally {
                inFlight = false;
            }
        };
        // 启动后 5 秒（确保 ctx 就绪），随后按配置间隔反复跑
        setTimeout(tick, 5000);
        setInterval(tick, Math.max(1, config.stoneMarketRefreshHours) * config_1.HOUR / 4); // 探测间隔 = 配置/4，保持库存不会卡死太久
    }
    return { scheduleStoneMarketRefresh };
}
