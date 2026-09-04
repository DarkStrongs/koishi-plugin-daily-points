"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerStone = registerStone;
const config_1 = require("./config");
const ORIGIN_SEEDS = [
    { code: 'myanmar', name: '缅甸', flag: '🇲🇲', priceMul: 2.5, rarityMod: { emperor: 1.30, ice: 1.15, supreme: 1.20, trash: 0.85, brick: 0.90 }, stoneTypes: ['jadeite'] },
    { code: 'vietnam', name: '越南', flag: '🇻🇳', priceMul: 1.4, rarityMod: {}, stoneTypes: ['jadeite'] },
    { code: 'japan', name: '日本丝鱼川', flag: '🇯🇵', priceMul: 2.0, rarityMod: { ice: 1.10, common: 1.05 }, stoneTypes: ['jadeite'] },
    { code: 'xinjiang', name: '新疆和田', flag: '🐪', priceMul: 2.5, rarityMod: { supreme: 1.50, emperor: 1.20, trash: 0.80, brick: 0.85 }, stoneTypes: ['hetian'] },
    { code: 'yunnan', name: '云南腾冲', flag: '🐘', priceMul: 1.2, rarityMod: {}, stoneTypes: ['jadeite'] },
    { code: 'russia', name: '俄罗斯外兴安岭', flag: '🐺', priceMul: 1.0, rarityMod: {}, stoneTypes: ['hetian'] },
    { code: 'mongolia', name: '内蒙古乌兰', flag: '🐎', priceMul: 1.6, rarityMod: { supreme: 1.10 }, stoneTypes: ['hetian', 'agate', 'nanhong'] },
    { code: 'brazil', name: '巴西米纳斯', flag: '🇧🇷', priceMul: 0.7, rarityMod: { trash: 1.05 }, stoneTypes: ['agate', 'nanhong'] },
    { code: 'argentina', name: '阿根廷冰川', flag: '🇦🇷', priceMul: 0.5, rarityMod: { common: 1.10 }, stoneTypes: ['agate'] },
    { code: 'thailand', name: '泰国清迈', flag: '🇹🇭', priceMul: 0.8, rarityMod: { trash: 1.05 }, stoneTypes: ['agate', 'nanhong'] },
    { code: 'various', name: '江湖散石', flag: '🌐', priceMul: 0.6, rarityMod: { trash: 1.20, brick: 1.10 }, stoneTypes: ['common'] },
];
const ATTRIBUTE_POOLS = [
    {
        key: 'size', label: '体积',
        choices: [
            { code: 'thumb', label: '拇指', desc: '小巧如卵', weight: 1, rarityMod: { emperor: 0.85, ice: 0.92 } },
            { code: 'fist', label: '拳头', desc: '一手可握', weight: 5, rarityMod: {} },
            { code: 'bowl', label: '脸盆', desc: '体型大', weight: 3, rarityMod: { glutinous: 1.10, ice: 1.05 } },
            { code: 'huge', label: '巨石', desc: '需两人抬', weight: 1, rarityMod: { emperor: 1.20, ice: 1.10 } },
        ],
    },
    {
        key: 'shape', label: '形状',
        choices: [
            { code: 'rounded', label: '圆润', desc: '圆润光滑', weight: 4, yieldMul: 1.0 },
            { code: 'blocky', label: '方正', desc: '棱角分明', weight: 3, yieldMul: 0.9 },
            { code: 'slab', label: '片状', desc: '扁平如饼', weight: 2, yieldMul: 0.7 },
            { code: 'jagged', label: '锯齿', desc: '凹凸不平', weight: 1, yieldMul: 0.85 },
        ],
    },
    {
        key: 'skin', label: '皮壳',
        choices: [
            { code: 'wax', label: '蜡皮', desc: '油润有蜡感', weight: 2, rarityMod: { emperor: 1.10 } },
            { code: 'water', label: '水石', desc: '冲刷光润', weight: 3, rarityMod: { ice: 1.08 } },
            { code: 'sand', label: '砂皮', desc: '粗糙含砂', weight: 4, rarityMod: { common: 1.05 } },
            { code: 'basalt', label: '火山岩', desc: '焦黑粗硬', weight: 1, rarityMod: { trash: 0.95, brick: 0.95 } },
        ],
    },
    {
        key: 'transparency', label: '透光度',
        choices: [
            { code: 'opaque', label: '不透', desc: '密不透光', weight: 3, rarityMod: { trash: 1.15 } },
            { code: 'micro', label: '微透', desc: '隐约透光', weight: 4, rarityMod: {} },
            { code: 'half', label: '半透', desc: '半透明泽', weight: 3, rarityMod: {} },
            { code: 'full', label: '全透', desc: '清澈如水', weight: 1, rarityMod: { ice: 1.05, emperor: 1.03 } },
        ],
    },
    {
        key: 'clarity', label: '净度',
        choices: [
            { code: 'pure', label: '全净', desc: '纯净无瑕', weight: 2, rarityMod: { glutinous: 1.05 } },
            { code: 'minor', label: '微瑕', desc: '微小杂质', weight: 4, rarityMod: {} },
            { code: 'major', label: '多杂质', desc: '满布杂质', weight: 3, rarityMod: { trash: 1.10 } },
            { code: 'cracked', label: '多裂', desc: '裂纹纵横', weight: 1, rarityMod: { trash: 1.15, brick: 1.05 } },
        ],
    },
];
const WASTE_SUBTYPES = [
    { code: 'trash', label: '废石', emoji: '💀', returnRate: 0.00, weight: 35, desc: '一无所有，颗粒无收', comment: ['一刀下去，竟全是灰白石灰，毫无玉质可言。', '内里空无一物，连砖头料都算不上。'] },
    { code: 'brick', label: '砖头料', emoji: '🧱', returnRate: 0.05, weight: 22, desc: '勉强能当建材', comment: ['切开一看，瓷实似砖。仅退一点保护费。', '标准的砖头料，石质过密无玉。'] },
    { code: 'sandstone', label: '砂岩化', emoji: '🪨', returnRate: 0.08, weight: 12, desc: '沙化严重', comment: ['整块已砂岩化，无法雕琢，仅能铺路。', '风化严重，用手一捏就碎。'] },
    { code: 'limestone', label: '石灰岩', emoji: '🪨', returnRate: 0.12, weight: 10, desc: '钙化变质', comment: ['已完全钙化，反应剧烈冒泡。', 'CaCO3 含量爆表，不见玉相。'] },
    { code: 'ore', label: '伴生矿', emoji: '⛓️', returnRate: 0.02, weight: 8, desc: '玉纹伴生铁矿', comment: ['玉纹伴生铁矿，可回收但不值钱。', '黄铁矿颗颗分明，可惜不是玉。'] },
    { code: 'cracked', label: '裂石', emoji: '💔', returnRate: 0.03, weight: 6, desc: '裂纹纵横', comment: ['切了四五刀，裂了七八条，根本无法成件。', '满裂贯穿，开片即碎。'] },
    { code: 'blinded', label: '蒙头料', emoji: '🌫️', returnRate: 0.00, weight: 5, desc: '皮厚如墙，看不出内部', comment: ['皮厚如墙，看不出内部。赌石中最怕这种。', '这就是赌石的"盲盒"——看不到内在。'] },
    { code: 'fake_skin', label: '假皮石', emoji: '🎭', returnRate: 0.10, weight: 2, desc: '皮壳染色伪装', comment: ['切开才发现皮壳是染色的。赌石骗局！', '👺 染色伪装成老坑料，骗子石。'] },
];
// 切割评语库（按稀有度桶定义；supreme=冰种传说，legendary=帝王级）
const CUT_COMMENTARY = {
    supreme: [
        '一刀切下金光四射！此乃传说之姿，可传家。',
        '开窗处千年罕见之纹，神品也。',
        '切面流光溢彩，号称神品亦不为过。',
    ],
    legendary: [
        '切开一刹，金翠之色夺目而出，正是帝王无疑。',
        '糯冰底子翠绿通灵，端的是好石头！',
        '内部满色满绿，结构致密——帝王之选。',
    ],
    epic: [
        '冰清玉洁，可见冰种细纹，性价比极高。',
        '切面透明带荧光，正是冰种所在。',
        '种水一流，结构细腻——上品也。',
    ],
    rare: [
        '糯种呈现，色泽中规中矩，恰到好处。',
        '切面糯种，色正水头尚可——已是不错。',
        '糯冰之间，结构尚稳，可出手也可再观望。',
    ],
    common: [
        '豆种显现，色泽中等，可圈可点。',
        '切面豆种，晶体颗粒清晰，能保本已是上策。',
        '豆青底，结构疏松——玩玩就好。',
    ],
    brick: [
        '切面瓷实如砖，毫无玉相。',
        '看来这块是真砖头，运气稍逊。',
    ],
};
const RATING_BY_RARITY = {
    supreme: { grade: 'A+', verdict: '神品。可传家，慎出手。' },
    legendary: { grade: 'A+', verdict: '极品帝王，传世佳品。' },
    epic: { grade: 'A', verdict: '上品，推荐收藏。' },
    rare: { grade: 'B+', verdict: '佳品，可转手或自用。' },
    common: { grade: 'B', verdict: '中档货，可出手。' },
    brick: { grade: 'C', verdict: '勉强保本，建议尽快出手。' },
};
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
const RANK_RARITY = ['brick', 'common', 'rare', 'epic', 'legendary', 'supreme'];
// ──────────────────────────────────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────────────────────────────────
/**
 * 计算一块切好的石头当前的"收藏价值"
 * 公式：baseSale × (1 + rate)^daysHeld，带软/硬上限
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
function pickWeighted(pool) {
    const total = pool.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    for (const item of pool) {
        r -= item.weight;
        if (r <= 0)
            return item;
    }
    return pool[pool.length - 1];
}
/** 抽全部 5 维随机属性 → { size:{...}, shape:{...}, ... } */
function rollAttributes() {
    const out = {};
    for (const pool of ATTRIBUTE_POOLS) {
        out[pool.key] = pickWeighted(pool.choices);
    }
    return out;
}
/** 计算产地-相容的原石价格 = baseTier × origin.priceMul */
function computeOriginPrice(baseTier, origin) {
    return Math.floor(baseTier * origin.priceMul);
}
/** mod key → 标准稀有度桶（允许 emperor / ice / glutinous / trash 这样的叙事性小类名） */
const MOD_ALIAS = {
    emperor: 'supreme',
    ice: 'epic',
    glutinous: 'rare',
    legendary: 'legendary',
    supreme: 'supreme',
    epic: 'epic',
    rare: 'rare',
    common: 'common',
    brick: 'brick',
    trash: 'brick',
};
/**
 * 给定基础 rarityWeights，应用产地 + 5 维属性修正后，归一化
 * 修正键（mod key）允许使用叙事性小类名（如 emperor / ice / glutinous / trash），
 * 内部通过 MOD_ALIAS 映射到标准稀有度桶。
 */
function applyRarityModifiers(base, origin, attrs) {
    const merged = { ...base };
    const apply = (mod) => {
        if (!mod)
            return;
        for (const [k, v] of Object.entries(mod)) {
            if (typeof v !== 'number' || v <= 0)
                continue;
            const bucket = MOD_ALIAS[k] || k;
            merged[bucket] = (merged[bucket] || 0) * v;
        }
    };
    apply(origin.rarityMod);
    for (const pool of ATTRIBUTE_POOLS) {
        apply(attrs[pool.key]?.rarityMod);
    }
    const total = Object.values(merged).reduce((s, v) => s + (v > 0 ? v : 0), 0);
    if (total <= 0)
        return base;
    for (const k of RANK_RARITY)
        merged[k] = merged[k] / total;
    return merged;
}
/**
 * 抽稀有度（已应用 modifier）。trash 桶内再按 WASTE_SUBTYPES.weight 加权细分 8 种子类
 * 返回 { rarity, wasteSubtype? }
 */
function rollQualityAndWaste(weights) {
    const r = Math.random();
    let cum = 0;
    let rarity = 'brick';
    for (const k of RANK_RARITY) {
        cum += weights[k] || 0;
        if (r < cum) {
            rarity = k;
            break;
        }
    }
    if (rarity === 'brick') {
        return { rarity: 'brick', wasteSubtype: pickWeighted(WASTE_SUBTYPES).code };
    }
    return { rarity };
}
/** 从 affix 池中无重复抽样 N 个 */
function sampleAffixes(pool, n, forceHighValue = false) {
    if (n <= 0 || pool.length === 0)
        return [];
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
/** 解析 seed 行（affixPool / rarityWeights 都是 JSON 字符串，originCatalog v1.16.0） */
function parseStoneRow(row) {
    return {
        ...row,
        affixes: JSON.parse(row.affixPool || '[]'),
        rarityWeights: JSON.parse(row.rarityWeights || '{}'),
        originCatalog: row.originCatalog ? JSON.parse(row.originCatalog) : [],
    };
}
/**
 * 生成切后完整评语（评语系统核心）
 * @param stoneType  类型种子
 * @param origin     产地
 * @param attrs      切前 5 维属性
 * @param rarity     切后稀有度
 * @param wasteSubtype 当 rarity=brick 时的子废石类型
 * @param affixes    词条数组
 * @param basePrice  实际购入价（含产地倍数）
 */
function buildCommentary(stoneType, origin, attrs, rarity, wasteSubtype, affixes, basePrice) {
    const lines = [];
    // 1) 来源介绍
    lines.push(`此乃${origin.flag}${origin.name}出产的${stoneType.icon}${stoneType.name}原石，购入价 ¥${basePrice.toLocaleString()}。`);
    // 2) 外形观察
    const obs = [];
    obs.push(`体积为「${attrs.size.label}」`);
    if (attrs.shape.code !== 'rounded')
        obs.push(`形${attrs.shape.label}`);
    if (attrs.skin.code !== 'sand')
        obs.push(`${attrs.skin.label}（${attrs.skin.desc}）`);
    if (attrs.transparency.label !== '微透')
        obs.push(attrs.transparency.desc);
    if (attrs.clarity.label !== '微瑕')
        obs.push(`净度"${attrs.clarity.label}"`);
    lines.push(`皮壳观察：${obs.join('，')}。`);
    // 3) 切割结果
    let cutLine;
    let effectiveSaleMul;
    if (rarity === 'brick') {
        const wt = WASTE_SUBTYPES.find((w) => w.code === (wasteSubtype || 'brick')) || WASTE_SUBTYPES[1];
        const commentPick = wt.comment[Math.floor(Math.random() * wt.comment.length)];
        cutLine = `${wt.emoji} ${wt.label}：${commentPick}`;
        effectiveSaleMul = wt.returnRate;
    }
    else {
        const pool = CUT_COMMENTARY[rarity] || CUT_COMMENTARY.common;
        cutLine = pool[Math.floor(Math.random() * pool.length)];
        effectiveSaleMul = affixes.reduce((s, a) => s + a.value, 0);
    }
    lines.push(`切开结果：${cutLine}`);
    // 4) 词条 / 评级
    if (rarity !== 'brick' && affixes.length > 0) {
        const affixStr = affixes.map((a) => `${a.name}+${(a.value * 100).toFixed(0)}%`).join(' / ');
        lines.push(`词条（${affixes.length}）：${affixStr}`);
    }
    else if (rarity === 'brick') {
        lines.push('词条：无（砖头料）');
    }
    const rating = RATING_BY_RARITY[rarity];
    lines.push(`综合评级：${rating.grade}（${rating.verdict}）`);
    // 5) 收藏价值
    const baseSale = Math.floor(basePrice * effectiveSaleMul * 100) / 100;
    lines.push(`立即卖出价：¥${baseSale.toLocaleString()}（系数 ${effectiveSaleMul.toFixed(2)}）`);
    if (rarity !== 'brick') {
        lines.push('持有：每日 +5%（软上限内），超软上限后衰减 +2%，硬上限 100×基础价');
    }
    else {
        lines.push('废石 / 砖头无收藏价值（无持有溢价）');
    }
    return { comment: lines.join('\n'), grade: rating.grade, effectiveSaleMul };
}
// ──────────────────────────────────────────────────────────────────────────
// registerStone
// ──────────────────────────────────────────────────────────────────────────
function registerStone({ ctx, config, core, casino }) {
    // ── 工具：从字符串还原属性对象 ──
    function parseAttrs(raw) {
        if (!raw)
            return {};
        try {
            return JSON.parse(raw) || {};
        }
        catch {
            return {};
        }
    }
    // ── 工具：取一个产地对象 ──
    function getOrigin(code) {
        return ORIGIN_SEEDS.find((o) => o.code === code) || ORIGIN_SEEDS[ORIGIN_SEEDS.length - 1];
    }
    // ── 启动时初始化 5 类原石 + 各自产地目录 ──
    async function ensureStoneTypes() {
        const existing = await ctx.database.get('daily_stone_types', {});
        const existingMap = new Map(existing.map((r) => [r.code, r]));
        const now = new Date();
        for (const seed of STONE_TYPE_SEEDS) {
            // 自动算出该类石头支持的产地（v1.16.0）
            const compatible = ORIGIN_SEEDS.filter((o) => o.stoneTypes.includes(seed.code));
            const originCatalog = compatible.map((o) => ({
                code: o.code,
                name: o.name,
                flag: o.flag,
                priceMul: o.priceMul,
                rarityMod: o.rarityMod,
            }));
            const payload = {
                code: seed.code,
                name: seed.name,
                icon: seed.icon,
                description: seed.description,
                basePrice: seed.basePrice,
                affixPool: JSON.stringify(seed.affixes),
                rarityWeights: JSON.stringify(seed.rarityWeights),
                originCatalog: JSON.stringify(originCatalog),
                updatedAt: now,
            };
            if (!existingMap.has(seed.code)) {
                await ctx.database.create('daily_stone_types', payload);
            }
            else {
                const cur = existingMap.get(seed.code);
                const need = cur.basePrice !== seed.basePrice
                    || cur.affixPool !== payload.affixPool
                    || cur.rarityWeights !== payload.rarityWeights
                    || (cur.originCatalog || '') !== payload.originCatalog
                    || cur.name !== seed.name
                    || cur.icon !== seed.icon;
                if (need)
                    await ctx.database.set('daily_stone_types', { code: seed.code }, payload);
            }
        }
    }
    // ── 清理过期市场库存，并按需补满（含产地/属性） ──
    async function refreshMarketIfDue() {
        await ensureStoneTypes();
        const now = Date.now();
        const expired = await ctx.database.get('daily_stone_market', {});
        const expiredIds = expired
            .filter((r) => new Date(r.expiresAt).getTime() <= now)
            .map((r) => r.id);
        if (expiredIds.length > 0) {
            await ctx.database.remove('daily_stone_market', { id: expiredIds });
        }
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
            // 70% 概率出"普通石头 + 玛瑙"这种低档，30% 出"翡翠 / 和田玉 / 南红"高档
            const roll = Math.random();
            let pool;
            if (roll < 0.35)
                pool = ['jadeite'];
            else if (roll < 0.55)
                pool = ['hetian'];
            else if (roll < 0.7)
                pool = ['nanhong'];
            else if (roll < 0.9)
                pool = ['agate'];
            else
                pool = ['common'];
            const stoneType = pool[Math.floor(Math.random() * pool.length)];
            // 与石头类型相容的产地（兜底用 'various'，避免空池）
            const compatible = ORIGIN_SEEDS.filter((o) => o.stoneTypes.includes(stoneType));
            const fallback = ORIGIN_SEEDS[ORIGIN_SEEDS.length - 1];
            const origin = compatible[Math.floor(Math.random() * compatible.length)] || fallback;
            // 价格档按"指数分布"——低价档数量多，高价档稀少
            const tierRoll = Math.random();
            let priceTier;
            if (tierRoll < 0.40)
                priceTier = 0;
            else if (tierRoll < 0.70)
                priceTier = 1;
            else if (tierRoll < 0.88)
                priceTier = 2;
            else if (tierRoll < 0.97)
                priceTier = 3;
            else
                priceTier = 4;
            // 5 维随机属性
            const attributes = rollAttributes();
            rows.push({
                stoneType,
                priceTier,
                origin: origin.code,
                attributes: JSON.stringify(attributes),
                listedAt: new Date(now),
                expiresAt,
            });
        }
        // minato 的 Model.create 不支持一次喂数组（遍历时 keys 变成 '0'/'1'，导致 unknown field）
        // 改成逐条 create，每次写一行，性能 OK（启动时一次性补满最多 ~30 块）
        if (rows.length > 0) {
            for (const row of rows) {
                await ctx.database.create('daily_stone_market', row);
            }
        }
    }
    // ── 计算 saleMultiplier：词条价值加和（砖头/废石 = returnRate） ──
    function calcSaleMultiplier(rarity, affixes, wasteSubtype) {
        if (rarity === 'brick') {
            const wt = WASTE_SUBTYPES.find((w) => w.code === wasteSubtype);
            return wt ? wt.returnRate : config.stoneBrickProtectionRate;
        }
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
    // ── 玩家当日已购石头数 + 金额 ──
    async function getTodayPurchaseStats(userKey) {
        const dayMs = 24 * config_1.HOUR;
        const since = Date.now() - dayMs;
        const rows = await ctx.database.get('daily_stone_inventory', { userId: userKey });
        const today = rows.filter((r) => new Date(r.boughtAt).getTime() >= since);
        let amount = 0;
        for (const r of today) {
            amount += computeOriginPrice(config.stonePriceTiers[r.priceTier] || 0, getOrigin(r.origin || 'various'));
        }
        return { count: today.length, amount };
    }
    // ── 写图鉴（不重复） ──
    async function recordCodex(userKey, stoneType, affixes) {
        if (affixes.length === 0)
            return;
        for (const a of affixes) {
            const existing = await ctx.database.get('daily_stone_codex', {
                userId: userKey, stoneType, affixCode: a.code,
            });
            if (existing.length === 0) {
                await ctx.database.create('daily_stone_codex', {
                    userId: userKey,
                    stoneType,
                    affixCode: a.code,
                    discoveredAt: new Date(),
                });
            }
        }
    }
    // ─────────────────────────────────────────────────────────────────
    // 命令注册
    // ─────────────────────────────────────────────────────────────────
    // 解析命令里的石头 ID：容忍漏传 / `#` 前缀 / 非法值，返回 null 表示无效（避免 `.replace` 崩）
    const parseStoneId = (idStr) => {
        if (typeof idStr !== 'string')
            return null;
        const id = parseInt(idStr.replace(/^#/, ''), 10);
        return Number.isFinite(id) && id > 0 ? id : null;
    };
    ctx.command('经济/娱乐/赌石', '赌石收藏玩法（积分回收器）：囤石流 + 词条 + 持有溢价')
        .action(() => {
        const tiersStr = config.stonePriceTiers.map((t, i) => `T${i + 1}:¥${t.toLocaleString()}`).join(' / ');
        const originSamples = ORIGIN_SEEDS.slice(0, 5).map((o) => `${o.flag}${o.name} ×${o.priceMul.toFixed(1)}`).join(' ');
        const wasteSamples = WASTE_SUBTYPES.slice(0, 5).map((w) => `${w.emoji}${w.label}`).join(' ');
        return [
            '🪨 赌石玩法：',
            '  · 这是积分回收器，不是暴富机。买 = 投钱，切 = 揭示词条，卖 = 落袋为安（亏）。',
            '  · 11 个产地：缅甸 / 越南 / 日本 / 新疆 / 云南 / 俄罗斯 / 内蒙 / 巴西 / 阿根廷 / 泰国 / 江湖散石（每块石头背后有"出生地"）',
            '  · 5 维属性：体积 / 形状 / 皮壳 / 透光度 / 净度（切前可见，会影响出货概率）',
            '  · 8 种废石：除砖头料/废石，还有砂岩化/石灰岩/伴生矿/裂石/蒙头料/假皮石，收藏价值各不相同',
            '  · 完整评语：每块切开的石头都会有一段评语（来源/外形/结果/评级），' + RANK_RARITY.map((r) => r).join('/') + ' 共 6 档',
            '',
            `  示例产地：${originSamples}`,
            `  示例废石：${wasteSamples}`,
            '',
            `  价格档：${tiersStr}`,
            `  词条等级：🧱砖头 → 🟢普通 → 🔵稀有 → 🟣史诗 → 🟡传说 → 🔴至宝（0~5 个词条）`,
            '  立即卖出价 = 基础价 × 词条价值加和（砖头仅退 5%），多数情况是亏的',
            `  持有溢价：每日 +${(config.stoneHoldingDailyRate * 100).toFixed(0)}% 复利（≤${config.stoneHoldingSoftCapMul}×基础价内），超软上限后 +${(config.stoneHoldingDecayRate * 100).toFixed(0)}%，硬上限 ${config.stoneHoldingHardCapMul}×`,
            `  卖出后 ${(config.stoneCasinoPoolRate * 100).toFixed(0)}% 入赌场池（v1.12.0 已连接），剩余销毁 → 积分永久出系统`,
            '',
            '指令：赌石市场｜赌石情报 [#ID]｜买原石 [#ID]｜切石 [#ID]｜卖石 [#ID]｜我的原石｜原石图鉴｜原石排行榜｜原石估价 [#ID]｜原石概览',
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
        const lines = ['🪨 今日原石市场（共 ' + sorted.length + ' 块），每块均带"产地 + 5 维属性"，切前可发「赌石情报」细看', ''];
        for (const row of sorted) {
            const t = typeMap.get(row.stoneType);
            if (!t)
                continue;
            const origin = getOrigin(row.origin || 'various');
            const baseTier = config.stonePriceTiers[row.priceTier] || 0;
            const finalPrice = computeOriginPrice(baseTier, origin);
            const tierLabel = 'T' + (row.priceTier + 1);
            const attrs = parseAttrs(row.attributes);
            const tag = (origin.code === 'myanmar' || origin.code === 'xinjiang') ? '💎' : (origin.priceMul >= 1.5 ? '✨' : '');
            lines.push(`${tag}#${row.id}  ${origin.flag}${origin.name} ${t.icon}${t.name} ${tierLabel}=¥${finalPrice.toLocaleString()}  ${attrs.skin.label}/${attrs.size.label}/${attrs.clarity.label[0]}`);
        }
        const expiresAt = new Date(Math.min(...sorted.map((r) => new Date(r.expiresAt).getTime())));
        const hoursLeft = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / config_1.HOUR * 10) / 10);
        lines.push('');
        lines.push(`市场将于 ${hoursLeft} 小时后刷新。`);
        lines.push('发送「买原石 #ID」入手一块；切前可发「赌石情报 #ID」查属性。');
        return lines.join('\n');
    });
    // 赌石情报 v1.16.0 — 切前详细查看一块石头
    ctx.command('经济/娱乐/赌石情报 <id:string>', '切前详细查看原石的市场信息（产地 / 价格 / 5 维属性）')
        .alias('原石情报', '鉴石', 'stone-intel')
        .action(async ({ session }, idStr) => {
        if (!config.stoneEnabled)
            return '赌石系统未开启。';
        const id = parseStoneId(idStr);
        if (!id)
            return '请用「赌石情报 #ID」格式。';
        const market = await ctx.database.get('daily_stone_market', { id });
        const row = market[0];
        if (!row)
            return '市场上找不到这块石头（可能被买走或已刷新）。';
        if (new Date(row.expiresAt).getTime() <= Date.now())
            return '这块石头已过期下架。';
        const types = await ctx.database.get('daily_stone_types', { code: row.stoneType });
        const t = parseStoneRow(types[0]);
        const origin = getOrigin(row.origin || 'various');
        const baseTier = config.stonePriceTiers[row.priceTier] || 0;
        const finalPrice = computeOriginPrice(baseTier, origin);
        const attrs = parseAttrs(row.attributes);
        // 把 5 维属性附加的稀有度修正整理出来
        const adjList = [];
        for (const pool of ATTRIBUTE_POOLS) {
            const a = attrs[pool.key];
            if (!a || !a.rarityMod)
                continue;
            for (const [rk, v] of Object.entries(a.rarityMod)) {
                if (Math.abs(v - 1) > 0.01) {
                    const sign = v > 1 ? '+' : '';
                    adjList.push(`${rk}${sign}${(((v - 1) * 100).toFixed(0))}%`);
                }
            }
        }
        const lines = [
            `🔍 #${id} ${origin.flag}${origin.name} ${t.icon}${t.name}  ${'T' + (row.priceTier + 1)}`,
            `标价：¥${baseTier.toLocaleString()} × 产地倍数 ${origin.priceMul.toFixed(1)} = ¥${finalPrice.toLocaleString()}`,
            '',
            `体积：${attrs.size.label}（${attrs.size.desc}）`,
            `形状：${attrs.shape.label}（${attrs.shape.desc}）`,
            `皮壳：${attrs.skin.label}（${attrs.skin.desc}）`,
            `透光度：${attrs.transparency.label}（${attrs.transparency.desc}）`,
            `净度：${attrs.clarity.label}（${attrs.clarity.desc}）`,
        ];
        if (adjList.length > 0)
            lines.push('', `⚙️ 概率修正：${adjList.join(' ')}`);
        const modWeights = applyRarityModifiers(t.rarityWeights, origin, attrs);
        const line2 = [];
        for (const r of RANK_RARITY) {
            const pct = ((modWeights[r] || 0) * 100).toFixed(1);
            line2.push(`${RARITY_LABELS[r]} ${pct}%`);
        }
        lines.push('', '📊 修正后分布：', line2.join(' / '));
        lines.push('', `产地介绍：${t.description}`);
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
        const id = parseStoneId(idStr);
        if (!id)
            return '请用「买原石 #ID」格式，ID 在「赌石市场」列表里。';
        const market = await ctx.database.get('daily_stone_market', { id });
        if (market.length === 0)
            return '市场上找不到这块石头（可能被抢走或已刷新）。';
        const block = market[0];
        if (new Date(block.expiresAt).getTime() <= Date.now())
            return '这块石头已过期下架，市场即将刷新。';
        const origin = getOrigin(block.origin || 'various');
        const baseTier = config.stonePriceTiers[block.priceTier];
        if (!baseTier || baseTier <= 0)
            return '价格档配置异常，请联系管理员。';
        const finalPrice = computeOriginPrice(baseTier, origin);
        // 限购检查
        const stats = await getTodayPurchaseStats(key);
        if (stats.count >= config.stoneDailyPurchaseLimit) {
            return `今日已达购买上限 ${config.stoneDailyPurchaseLimit} 块，明天再来。`;
        }
        if (config.stoneDailyAmountLimit > 0 && stats.amount + finalPrice > config.stoneDailyAmountLimit) {
            return `今日累计买入已达 ¥${stats.amount.toLocaleString()}，超 ¥${config.stoneDailyAmountLimit.toLocaleString()} 上限，明天再来。`;
        }
        const user = await core.getUser(key);
        if (!user)
            return '用户初始化失败。';
        if (user.points < finalPrice)
            return `现金不足：需要 ¥${finalPrice.toLocaleString()}，你只有 ¥${user.points.toLocaleString()}。`;
        const types = await ctx.database.get('daily_stone_types', { code: block.stoneType });
        const stoneType = parseStoneRow(types[0]);
        const newId = await core.dbTx(async (db) => {
            const dbAny = db;
            await dbAny.remove('daily_stone_market', { id: block.id });
            await dbAny.set('daily_points', { userId: key }, { points: user.points - finalPrice });
            const fresh = await dbAny.create('daily_stone_inventory', {
                userId: key,
                stoneType: block.stoneType,
                priceTier: block.priceTier,
                origin: block.origin || 'various',
                attributes: block.attributes || '{}',
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
            `✅ 已入手 #${newId}  ${origin.flag}${origin.name} ${stoneType.icon}${stoneType.name}（${tierLabel}）`,
            `原价 ¥${baseTier.toLocaleString()} × 产地 ${origin.priceMul.toFixed(1)} = ¥${finalPrice.toLocaleString()}`,
            `现金：¥${user.points.toLocaleString()} → ¥${(user.points - finalPrice).toLocaleString()}`,
            `状态：holding（未切，可囤可卖；不过卖未切的 = 仅退 5%）`,
            `发送「赌石情报 #${newId}」查看切前属性，或「切石 #${newId}」揭示词条。`,
        ].join('\n');
    });
    // 切石 v1.16.0：调产地 + 属性修正 + 完整评语
    ctx.command('经济/娱乐/切石 <id:string>', '切开背包里的原石，揭示词条并生成完整评语')
        .alias('切原石', 'cut-stone', '揭石', '解石')
        .action(async ({ session }, idStr) => {
        if (!config.stoneEnabled)
            return '赌石系统未开启。';
        if (!session.userId)
            return;
        const key = `${session.platform}:${session.userId}`;
        const id = parseStoneId(idStr);
        if (!id)
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
        const origin = getOrigin(stone.origin || 'various');
        const attrs = parseAttrs(stone.attributes);
        const basePrice = computeOriginPrice(config.stonePriceTiers[stone.priceTier] || 0, origin);
        // 应用产地 + 属性修正后的权重
        const modWeights = applyRarityModifiers(stoneType.rarityWeights, origin, attrs);
        const { rarity, wasteSubtype } = rollQualityAndWaste(modWeights);
        const need = RARITY_AFFIX_COUNT[rarity];
        const affixes = sampleAffixes(stoneType.affixes, need, rarity === 'supreme');
        // 生成完整评语
        const { comment, grade, effectiveSaleMul } = buildCommentary(stoneType, origin, attrs, rarity, wasteSubtype, affixes, basePrice);
        // 写回背包
        await ctx.database.set('daily_stone_inventory', { id: stone.id }, {
            cutAt: new Date(),
            rarity,
            wasteSubtype: wasteSubtype || null,
            comment,
            grade,
            affixes: JSON.stringify(affixes),
            saleMultiplier: effectiveSaleMul,
            status: 'cut',
        });
        await recordCodex(key, stone.stoneType, affixes);
        const header = `🔪 切开 #${stone.id}  ${origin.flag}${origin.name} ${stoneType.icon}${stoneType.name}`;
        return [header, '', ...comment.split('\n'), '', `发送「卖石 #${stone.id}」立即出售 / 「原石估价 #${stone.id}」先看当前价值。`].join('\n');
    });
    // 卖石 — 与 v1.15.0 一致（卖"切后"按词条系数；卖"切前"按 brickProtectionRate）
    ctx.command('经济/娱乐/卖石 <id:string>', '立即卖出某块石头（按词条价值 + 持有溢价结算）')
        .alias('卖原石', 'sell-stone', '出石')
        .action(async ({ session }, idStr) => {
        if (!config.stoneEnabled)
            return '赌石系统未开启。';
        if (!session.userId)
            return;
        const key = `${session.platform}:${session.userId}`;
        const id = parseStoneId(idStr);
        if (!id)
            return '请用「卖石 #ID」格式。';
        const rows = await ctx.database.get('daily_stone_inventory', { id, userId: key });
        const stone = rows[0];
        if (!stone)
            return '背包里没这块石头。';
        if (stone.status === 'sold')
            return `这块石头已经卖出过（¥${stone.soldValue.toLocaleString()}）。`;
        const types = await ctx.database.get('daily_stone_types', { code: stone.stoneType });
        if (types.length === 0)
            return '原石类型不存在。';
        const stoneType = parseStoneRow(types[0]);
        const origin = getOrigin(stone.origin || 'various');
        const basePrice = computeOriginPrice(config.stonePriceTiers[stone.priceTier] || 0, origin);
        const saleMultiplier = stone.saleMultiplier || (stone.status === 'holding' ? config.stoneBrickProtectionRate : 0);
        const currentValue = calcCurrentValue(basePrice, saleMultiplier, stone.boughtAt);
        const originalSale = calcImmediateSale(basePrice, saleMultiplier);
        const holdBonus = Math.max(0, Math.round((currentValue - originalSale) * 100) / 100);
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
        if (toPool > 0)
            await casino.feedCasinoPool(toPool);
        const lines = [
            `💰 卖出 #${stone.id}  ${origin.flag}${origin.name} ${stoneType.icon}${stoneType.name}`,
            '',
            stone.status === 'cut' ? `稀有度：${RARITY_LABELS[stone.rarity] || stone.rarity}（${stone.grade || '?'}）` : '状态：未切（仅退 5%）',
            `立即卖出价：¥${originalSale.toLocaleString()}（系数 ${saleMultiplier.toFixed(2)}）`,
            `持有加成：+¥${holdBonus.toLocaleString()}`,
            `实收：¥${finalPayout.toLocaleString()}`,
            `其中 ¥${toPool.toLocaleString()}（${(config.stoneCasinoPoolRate * 100).toFixed(0)}%）入赌场池 → 已被彩票征走，余下 ${(100 - config.stoneCasinoPoolRate * 100).toFixed(0)}% 销毁（积分回收）。`,
            `现金：¥${user.points.toLocaleString()} → ¥${(user.points + finalPayout).toLocaleString()}`,
        ];
        return lines.join('\n');
    });
    // 我的原石 v1.16.0：加产地信息
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
        const rows = inv.map((r) => {
            const origin = getOrigin(r.origin || 'various');
            const basePrice = computeOriginPrice(config.stonePriceTiers[r.priceTier] || 0, origin);
            const value = calcCurrentValue(basePrice, r.saleMultiplier || 0, r.boughtAt);
            return { ...r, currentValue: value, basePrice, originObj: origin };
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
            const statusLabel = r.status === 'holding'
                ? '🪨未切'
                : r.rarity === 'brick'
                    ? `🧱${(WASTE_SUBTYPES.find((w) => w.code === r.wasteSubtype) || WASTE_SUBTYPES[1]).label}`
                    : `${RARITY_LABELS[r.rarity] || r.rarity}${r.grade ? '/' + r.grade : ''}`;
            lines.push(`${r.originObj.flag}#${r.id} ${tName} ${tierLabel}  ${statusLabel}  已持 ${daysHeld}d  当前价值 ¥${Math.floor(r.currentValue).toLocaleString()}（投入 ¥${r.basePrice.toLocaleString()}）`);
        }
        if (rows.length > 30)
            lines.push(`…还有 ${rows.length - 30} 块未显示`);
        return lines.join('\n');
    });
    // 原石估价 v1.16.0：加产地 + 评语引用
    ctx.command('经济/娱乐/原石估价 <id:string>', '详细算一块石头的当前价值（持有天数 × 涨幅）')
        .alias('估价', 'stone-estimate')
        .action(async ({ session }, idStr) => {
        if (!config.stoneEnabled)
            return '赌石系统未开启。';
        if (!session.userId)
            return;
        const key = `${session.platform}:${session.userId}`;
        const id = parseStoneId(idStr);
        if (!id)
            return '请用「原石估价 #ID」格式。';
        const rows = await ctx.database.get('daily_stone_inventory', { id, userId: key });
        const stone = rows[0];
        if (!stone)
            return '背包里没这块石头。';
        if (stone.status === 'sold')
            return `这块石头已卖出，结算价 ¥${stone.soldValue.toLocaleString()}。`;
        const types = await ctx.database.get('daily_stone_types', { code: stone.stoneType });
        const t = parseStoneRow(types[0]);
        const origin = getOrigin(stone.origin || 'various');
        const basePrice = computeOriginPrice(config.stonePriceTiers[stone.priceTier] || 0, origin);
        const baseSale = calcImmediateSale(basePrice, stone.saleMultiplier || (stone.status === 'holding' ? config.stoneBrickProtectionRate : 0));
        const current = calcCurrentValue(basePrice, stone.saleMultiplier || (stone.status === 'holding' ? config.stoneBrickProtectionRate : 0), stone.boughtAt);
        const daysHeld = (Date.now() - new Date(stone.boughtAt).getTime()) / config_1.DAY;
        const affixList = stone.affixes ? JSON.parse(stone.affixes) : [];
        const lines = [
            `🔍 原石 #${stone.id} 估值`,
            `${origin.flag}${origin.name} ${t.icon}${t.name}（T${stone.priceTier + 1} 基础价 ¥${config.stonePriceTiers[stone.priceTier].toLocaleString()} × ${origin.priceMul.toFixed(1)} = ¥${basePrice.toLocaleString()}）`,
            `状态：${stone.status === 'holding' ? '🪨 未切（卖只能退 ' + (config.stoneBrickProtectionRate * 100).toFixed(0) + '%）' : (stone.rarity === 'brick' ? `🧱${(WASTE_SUBTYPES.find((w) => w.code === stone.wasteSubtype) || WASTE_SUBTYPES[1]).label}（${stone.grade || 'D'}）` : RARITY_LABELS[stone.rarity] || stone.rarity + ('/' + (stone.grade || '')))}`,
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
            lines.push('');
        }
        if (stone.comment) {
            lines.push('━━ 评语 ━━');
            lines.push(stone.comment);
            lines.push('');
        }
        lines.push(stone.status === 'holding'
            ? `切石后才有收藏溢价。先「切石 #${stone.id}」再来看。`
            : `发送「卖石 #${stone.id}」按当前价值 ¥${Math.floor(current).toLocaleString()} 结算。`);
        return lines.join('\n');
    });
    // 原石图鉴（不变）
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
    // 原石排行榜
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
            const origin = getOrigin(r.origin || 'various');
            const basePrice = computeOriginPrice(config.stonePriceTiers[r.priceTier] || 0, origin);
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
    // 原石概览 v1.16.0：全服按产地汇总
    ctx.command('经济/娱乐/原石概览', '全服原石按产地汇总（分布 / 平均价格 / 总投入）')
        .alias('赌石概览', 'stone-overview')
        .action(async () => {
        if (!config.stoneEnabled)
            return '赌石系统未开启。';
        const all = await ctx.database.get('daily_stone_inventory', {});
        const active = all.filter((r) => r.status !== 'sold');
        const byOrigin = new Map();
        for (const o of ORIGIN_SEEDS) {
            byOrigin.set(o.code, { count: 0, invested: 0, soldCount: 0, soldTotal: 0 });
        }
        for (const r of all) {
            const code = r.origin || 'various';
            const bucket = byOrigin.get(code) || { count: 0, invested: 0, soldCount: 0, soldTotal: 0 };
            const origin = getOrigin(code);
            const basePrice = computeOriginPrice(config.stonePriceTiers[r.priceTier] || 0, origin);
            if (r.status === 'sold') {
                bucket.soldCount += 1;
                bucket.soldTotal += r.soldValue || 0;
            }
            else {
                bucket.count += 1;
                bucket.invested += basePrice;
            }
            byOrigin.set(code, bucket);
        }
        const sorted = [...byOrigin.entries()]
            .sort((a, b) => b[1].count - a[1].count)
            .filter(([, v]) => v.count > 0 || v.soldCount > 0);
        const lines = ['🌐 原石概览（按产地统计）', ''];
        for (const [code, v] of sorted) {
            const o = getOrigin(code);
            lines.push(`${o.flag} ${o.name}（${o.code}，价格倍数 ×${o.priceMul.toFixed(1)}）：`);
            lines.push(`  持仓 ${v.count} 块｜投入 ¥${v.invested.toLocaleString()}`);
            lines.push(`  累计卖出 ${v.soldCount} 块｜回款 ¥${v.soldTotal.toLocaleString()}`);
        }
        const totalHeld = active.length;
        const totalSold = all.length - totalHeld;
        lines.push('', `全服：${totalHeld} 块持仓 + ${totalSold} 块已售`);
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
                // ignore
            }
            finally {
                inFlight = false;
            }
        };
        setTimeout(tick, 5000);
        setInterval(tick, Math.max(1, config.stoneMarketRefreshHours) * config_1.HOUR / 4);
    }
    return { scheduleStoneMarketRefresh };
}
