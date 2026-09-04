import { Schema } from 'koishi';
export interface Config {
    basePoints: number;
    minBonus: number;
    maxBonus: number;
    streakBonusPerDay: number;
    maxStreakBonus: number;
    timezoneOffset: number;
    leaderboardSize: number;
    makeupCardStreakDays: number;
    makeupWindowDays: number;
    makeupPayoutRate: number;
    monthlyPoolEnabled: boolean;
    monthlyPoolBase: number;
    monthlyPoolTaxRate: number;
    monthlyStreakThreshold: number;
    bankHourlyRate: number;
    fixedRate3: number;
    fixedRate7: number;
    fixedRate30: number;
    loanEnabled: boolean;
    loanRate3: number;
    loanRate7: number;
    loanRate30: number;
    loanCreditRatio: number;
    loanMinLimit: number;
    loanOverdueMultiplier: number;
    sharkRate: number;
    sharkTermHours: number;
    sharkMaxAmount: number;
    sharkMaxTotal: number;
    sharkOverdueMultiplier: number;
    collectorIntervalHours: number;
    workCooldownMinutes: number;
    workMin: number;
    workMax: number;
    workGarnishRate: number;
    bankruptPenaltyDays: number;
    stockEnabled: boolean;
    stockIntervalMinutes: number;
    stockVolatility: number;
    stockMaxCount: number;
    ipoPeriods: number;
    stockEventChance: number;
    dividendChance: number;
    dividendRate: number;
    stockImpactRatio: number;
    stockImpactMaxBias: number;
    stockMomentumDecay: number;
    stockSectorLinkStrength: number;
    casinoEnabled: boolean;
    casinoHouseEdge: number;
    casinoMinBet: number;
    casinoMaxBet: number;
    casinoCooldownSeconds: number;
    blackjackStandOn: number;
    lotteryEnabled: boolean;
    lotteryPrice: number;
    lotteryDigits: number;
    lotteryIntervalHours: number;
    lotteryMaxTicketsPerUser: number;
    /** 基础奖池：每期开奖注入的固定金额（0 表示关闭） */
    lotteryBasePool: number;
    /** 是否把当期赌场奖池全额注入彩票（每期开奖扣走） */
    lotteryIncludeCasinoPool: boolean;
    /** 各档派奖比例（5 档：特/一/二/三/安慰，剩余自动滚存下期）。建议总和 ≤ 1 */
    lotteryTierPayouts: number[];
    /** 各档匹配位数阈值（按特→安慰顺序；特等奖 = digits，末档 = 0 表示未中不奖） */
    lotteryMatchLevels: number[];
    scratchEnabled: boolean;
    scratchPrice: number;
    scratchConsolation: number;
    scratchSmall: number;
    scratchMid: number;
    scratchBig: number;
    scratchChanceConsolation: number;
    scratchChanceSmall: number;
    scratchChanceMid: number;
    scratchChanceBig: number;
    robberyEnabled: boolean;
    robberySuccessRate: number;
    robberySuccessPct: number;
    robberyFailPct: number;
    robberyCooldownMinutes: number;
    robberyJailMinutes: number;
    robberyDailyLimit: number;
    robberyMinVictimCash: number;
    robberyNerfMode: boolean;
    robberyVictimCooldownHours: number;
    robberyRevengeWindowMinutes: number;
    robberyRevengeBoost: number;
    robberyStreakLossThreshold: number;
    robberyStreakLossMultiplier: number;
    propertyEnabled: boolean;
    /** 房产行情刷新间隔（小时）；越短波动越频繁 */
    propertyUpdateIntervalHours: number;
    /** 每 tick 随机涨跌基础幅度（百分比，0.05 = ±5%） */
    propertyTickVolatility: number;
    /** 收租间隔（小时）：每 N 小时按租收益率发一次租金 */
    propertyRentIntervalHours: number;
    /** 基础租收益率（每次发租 = 房价 × 此比例 × 经过小时数）；类型会加成 */
    propertyRentYieldBase: number;
    /** 持有税（每年占房价的比例，每次刷价时按持有时长扣）；0.02 = 2% / 年 */
    propertyTaxRate: number;
    /** 交易税（买卖时按成交额扣），0.05 = 5% */
    propertyTradeTax: number;
    /** 每次刷新时泡沫积累概率上限（基于 trend 与随机） */
    propertyBubbleMaxIncrease: number;
    /** 泡沫指数阈值：>= 此值触发泡沫破裂（暴跌） */
    propertyBubbleThreshold: number;
    /** 泡沫破裂时价格暴跌比例（0.5 = 跌 50%）；同时清零泡沫 */
    propertyCrashRatio: number;
    /** 每 tick 政策调控触发概率（含限购/限售/加税） */
    propertyPolicyChance: number;
    /** 每 tick 自然灾害触发概率（含地震/洪水） */
    propertyDisasterChance: number;
    /** 每 tick 利率上调触发概率；上调后估值下降 N% */
    propertyInterestUpChance: number;
    /** 单用户最大持有房产数 */
    propertyMaxProperties: number;
    /** 买房时买到烂尾楼的概率（0.08 = 8%） */
    propertyDerelictChance: number;
    /** 烂尾楼折扣（0.5 = 5 折），原始价格 × 此系数 */
    propertyDerelictDiscount: number;
    /** 烂尾楼租金系数（0 = 完全不出租，0.1 = 仅 10% 租金） */
    propertyDerelictRentFactor: number;
    /** 每 tick 烂尾整治处理概率（0.5 = 50% 概率会影响到该区域烂尾楼） */
    propertyDerelictRescueChance: number;
    /** 烂尾整治"回购"路径时给原房主的返还比例（0.3 = 30%） */
    propertyDerelictBuybackRate: number;
    /** 烂尾整治"完工"路径的相对估值提升比例（0.5 = 估值回升 50%） */
    propertyDerelictRestoreMul: number;
    /** P2P 挂牌默认有效期（小时，过期自动撤回） */
    propertyListingExpiryHours: number;
    /** P2P 挂牌服务费比例（0.02 = 2% 平台抽成，与交易税分开） */
    propertyListingFee: number;
    /** 每 tick 升值政策触发概率（旧改 / 新区规划 / 地铁 / 经济特区 / 利率下调） */
    propertyAppreciationChance: number;
    /** 每 tick 危机政策触发概率（强制拆迁 等） */
    propertyCrisisChance: number;
    /** 每 tick 利率下调触发概率；下调后该 tick 估值上升 N% */
    propertyInterestDownChance: number;
    /** 启用赌石 */
    stoneEnabled: boolean;
    /** 5 档原石购入价（积分）；索引对应 priceTier 0..4 */
    stonePriceTiers: number[];
    /** 市场刷新间隔（小时） */
    stoneMarketRefreshHours: number;
    /** 单次刷新时的库存数量 */
    stoneMarketStockSize: number;
    /** 单玩家每日最多买入的石头数 */
    stoneDailyPurchaseLimit: number;
    /** 单玩家每日买入原石的总花费上限（积分）；0 = 不限 */
    stoneDailyAmountLimit: number;
    /** 持有每日涨价率（复利，0.05 = 每日 +5%） */
    stoneHoldingDailyRate: number;
    /** 持有软上限倍数（达到 N × basePrice 后涨价率衰减为 stoneHoldingDecayRate） */
    stoneHoldingSoftCapMul: number;
    /** 软上限之后的涨价率（0.02 = 每日 +2%） */
    stoneHoldingDecayRate: number;
    /** 持有硬上限倍数（达到后停止累计） */
    stoneHoldingHardCapMul: number;
    /** 卖出后流回赌场池的比例（剩余部分销毁，积分回收器核心） */
    stoneCasinoPoolRate: number;
    /** 砖头(0词条)的最低保护退款率（0.05 = 仅退 5% 成本） */
    stoneBrickProtectionRate: number;
    broadcastChannels: string[];
}
export declare const HOUR = 3600000;
export declare const DAY = 86400000;
export declare const Config: Schema<Config>;
