import { Schema } from 'koishi'

export interface Config {
  // 签到与积分
  basePoints: number
  minBonus: number
  maxBonus: number
  streakBonusPerDay: number
  maxStreakBonus: number
  timezoneOffset: number
  leaderboardSize: number

  // 签到增强（v1.8.0）：补签卡
  makeupCardStreakDays: number
  makeupWindowDays: number
  makeupPayoutRate: number

  // 月度签到奖池（v1.8.0）
  monthlyPoolEnabled: boolean
  monthlyPoolBase: number
  monthlyPoolTaxRate: number
  monthlyStreakThreshold: number

  // 银行
  bankHourlyRate: number
  fixedRate3: number
  fixedRate7: number
  fixedRate30: number

  // 贷款
  loanEnabled: boolean
  loanRate3: number
  loanRate7: number
  loanRate30: number
  loanCreditRatio: number
  loanMinLimit: number
  loanOverdueMultiplier: number
  sharkRate: number
  sharkTermHours: number
  sharkMaxAmount: number
  sharkMaxTotal: number
  sharkOverdueMultiplier: number
  collectorIntervalHours: number
  workCooldownMinutes: number
  workMin: number
  workMax: number
  workGarnishRate: number
  bankruptPenaltyDays: number

  // 股票
  stockEnabled: boolean
  stockIntervalMinutes: number
  stockVolatility: number
  stockMaxCount: number
  ipoPeriods: number
  stockEventChance: number
  dividendChance: number
  dividendRate: number

  // 用户行为驱动市场（v1.11.0）
  stockImpactRatio: number
  stockImpactMaxBias: number
  stockMomentumDecay: number
  stockSectorLinkStrength: number

  // 赌场
  casinoEnabled: boolean
  casinoHouseEdge: number
  casinoMinBet: number
  casinoMaxBet: number
  casinoCooldownSeconds: number
  blackjackStandOn: number

  // 彩票
  lotteryEnabled: boolean
  lotteryPrice: number
  lotteryDigits: number
  lotteryIntervalHours: number
  lotteryMaxTicketsPerUser: number
  /** 基础奖池：每期开奖注入的固定金额（0 表示关闭） */
  lotteryBasePool: number
  /** 是否把当期赌场奖池全额注入彩票（每期开奖扣走） */
  lotteryIncludeCasinoPool: boolean
  /** 各档派奖比例（5 档：特/一/二/三/安慰，剩余自动滚存下期）。建议总和 ≤ 1 */
  lotteryTierPayouts: number[]
  /** 各档匹配位数阈值（按特→安慰顺序；特等奖 = digits，末档 = 0 表示未中不奖） */
  lotteryMatchLevels: number[]

  // 刮刮乐
  scratchEnabled: boolean
  scratchPrice: number
  scratchConsolation: number
  scratchSmall: number
  scratchMid: number
  scratchBig: number
  scratchChanceConsolation: number
  scratchChanceSmall: number
  scratchChanceMid: number
  scratchChanceBig: number

  // 抢劫
  robberyEnabled: boolean
  robberySuccessRate: number
  robberySuccessPct: number
  robberyFailPct: number
  robberyCooldownMinutes: number
  robberyJailMinutes: number
  robberyDailyLimit: number
  robberyMinVictimCash: number

  // 削弱模式（v1.10.0）：4 档机制开关 + 数值边界
  robberyNerfMode: boolean
  robberyVictimCooldownHours: number
  robberyRevengeWindowMinutes: number
  robberyRevengeBoost: number
  robberyStreakLossThreshold: number
  robberyStreakLossMultiplier: number

  // 房地产（v1.13.0）：买房 / 卖房 / 出租 / 收租 / 泡沫破裂 / 政策 / 灾害
  propertyEnabled: boolean
  /** 房产行情刷新间隔（小时）；越短波动越频繁 */
  propertyUpdateIntervalHours: number
  /** 每 tick 随机涨跌基础幅度（百分比，0.05 = ±5%） */
  propertyTickVolatility: number
  /** 收租间隔（小时）：每 N 小时按租收益率发一次租金 */
  propertyRentIntervalHours: number
  /** 基础租收益率（每次发租 = 房价 × 此比例 × 经过小时数）；类型会加成 */
  propertyRentYieldBase: number
  /** 持有税（每年占房价的比例，每次刷价时按持有时长扣）；0.02 = 2% / 年 */
  propertyTaxRate: number
  /** 交易税（买卖时按成交额扣），0.05 = 5% */
  propertyTradeTax: number
  /** 每次刷新时泡沫积累概率上限（基于 trend 与随机） */
  propertyBubbleMaxIncrease: number
  /** 泡沫指数阈值：>= 此值触发泡沫破裂（暴跌） */
  propertyBubbleThreshold: number
  /** 泡沫破裂时价格暴跌比例（0.5 = 跌 50%）；同时清零泡沫 */
  propertyCrashRatio: number
  /** 每 tick 政策调控触发概率（含限购/限售/加税） */
  propertyPolicyChance: number
  /** 每 tick 自然灾害触发概率（含地震/洪水） */
  propertyDisasterChance: number
  /** 每 tick 利率上调触发概率；上调后估值下降 N% */
  propertyInterestUpChance: number
  /** 单用户最大持有房产数 */
  propertyMaxProperties: number

  // ─── v1.14.0：烂尾楼 + P2P 挂牌 + 升值 / 危机政策 ───
  /** 买房时买到烂尾楼的概率（0.08 = 8%） */
  propertyDerelictChance: number
  /** 烂尾楼折扣（0.5 = 5 折），原始价格 × 此系数 */
  propertyDerelictDiscount: number
  /** 烂尾楼租金系数（0 = 完全不出租，0.1 = 仅 10% 租金） */
  propertyDerelictRentFactor: number
  /** 每 tick 烂尾整治处理概率（0.5 = 50% 概率会影响到该区域烂尾楼） */
  propertyDerelictRescueChance: number
  /** 烂尾整治"回购"路径时给原房主的返还比例（0.3 = 30%） */
  propertyDerelictBuybackRate: number
  /** 烂尾整治"完工"路径的相对估值提升比例（0.5 = 估值回升 50%） */
  propertyDerelictRestoreMul: number
  /** P2P 挂牌默认有效期（小时，过期自动撤回） */
  propertyListingExpiryHours: number
  /** P2P 挂牌服务费比例（0.02 = 2% 平台抽成，与交易税分开） */
  propertyListingFee: number
  /** 每 tick 升值政策触发概率（旧改 / 新区规划 / 地铁 / 经济特区 / 利率下调） */
  propertyAppreciationChance: number
  /** 每 tick 危机政策触发概率（强制拆迁 等） */
  propertyCrisisChance: number
  /** 每 tick 利率下调触发概率；下调后该 tick 估值上升 N% */
  propertyInterestDownChance: number

  // ─── v1.15.0：赌石（收藏型积分回收）系统 ───
  /** 启用赌石 */
  stoneEnabled: boolean
  /** 5 档原石购入价（积分）；索引对应 priceTier 0..4 */
  stonePriceTiers: number[]
  /** 市场刷新间隔（小时） */
  stoneMarketRefreshHours: number
  /** 单次刷新时的库存数量 */
  stoneMarketStockSize: number
  /** 单玩家每日最多买入的石头数 */
  stoneDailyPurchaseLimit: number
  /** 单玩家每日买入原石的总花费上限（积分）；0 = 不限 */
  stoneDailyAmountLimit: number
  /** 持有每日涨价率（复利，0.05 = 每日 +5%） */
  stoneHoldingDailyRate: number
  /** 持有软上限倍数（达到 N × basePrice 后涨价率衰减为 stoneHoldingDecayRate） */
  stoneHoldingSoftCapMul: number
  /** 软上限之后的涨价率（0.02 = 每日 +2%） */
  stoneHoldingDecayRate: number
  /** 持有硬上限倍数（达到后停止累计） */
  stoneHoldingHardCapMul: number
  /** 卖出后流回赌场池的比例（剩余部分销毁，积分回收器核心） */
  stoneCasinoPoolRate: number
  /** 砖头(0词条)的最低保护退款率（0.05 = 仅退 5% 成本） */
  stoneBrickProtectionRate: number

  // 广播
  broadcastChannels: string[]
}

export const HOUR = 3600000
export const DAY = 86400000

export const Config = Schema.intersect([
  Schema.object({
    basePoints: Schema.number().default(10).min(0).description('每次签到的基础积分'),
    minBonus: Schema.number().default(1).min(0).description('随机额外积分下限'),
    maxBonus: Schema.number().default(10).min(0).description('随机额外积分上限'),
    streakBonusPerDay: Schema.number().default(2).min(0).description('连续签到每日递增奖励'),
    maxStreakBonus: Schema.number().default(30).min(0).description('连续签到奖励上限'),
    timezoneOffset: Schema.number().default(8).step(1).description('时区偏移（小时），用于判断一天的起止'),
    leaderboardSize: Schema.number().default(10).min(1).max(50).description('排行榜显示人数'),
    makeupCardStreakDays: Schema.number().default(7).min(1).description('每连续签到多少天赠送 1 张补签卡'),
    makeupWindowDays: Schema.number().default(7).min(1).description('补签可补的最大回溯天数（默认 7 天内）'),
    makeupPayoutRate: Schema.number().default(0.6).min(0).max(1).step(0.05).description('补签积分系数（按当日应得积分的比例发放，0.6 = 60%）'),
  }).description('签到与积分设置'),
  Schema.object({
    monthlyPoolEnabled: Schema.boolean().default(true).description('启用月度签到奖池'),
    monthlyPoolBase: Schema.number().default(1000).min(0).description('每月基础奖池（月初自动注入）'),
    monthlyPoolTaxRate: Schema.number().default(0.05).min(0).max(0.5).step(0.01).description('每次签到按此比例抽水入当月奖池（0.05 = 5%）'),
    monthlyStreakThreshold: Schema.number().default(28).min(1).max(31).description('当月连续签到满多少天才有资格瓜分奖池'),
  }).description('月度奖池设置'),
  Schema.object({
    bankHourlyRate: Schema.number().default(0.001).min(0).description('活期存款每小时利率（0.001 = 每小时 0.1%）'),
    fixedRate3: Schema.number().default(0.01).min(0).description('定期 3 天：日利率'),
    fixedRate7: Schema.number().default(0.015).min(0).description('定期 7 天：日利率'),
    fixedRate30: Schema.number().default(0.02).min(0).description('定期 30 天：日利率'),
  }).description('银行设置'),
  Schema.object({
    loanEnabled: Schema.boolean().default(true).description('启用贷款系统'),
    loanRate3: Schema.number().default(0.03).min(0).description('正常贷款 3 天期：日利率'),
    loanRate7: Schema.number().default(0.025).min(0).description('正常贷款 7 天期：日利率'),
    loanRate30: Schema.number().default(0.02).min(0).description('正常贷款 30 天期：日利率'),
    loanCreditRatio: Schema.number().default(1).min(0).description('正常贷款额度 = 净资产（总资产−欠款）× 此倍数'),
    loanMinLimit: Schema.number().default(100).min(0).description('正常贷款最低授信额度（净资产为正时生效）'),
    loanOverdueMultiplier: Schema.number().default(2).min(1).description('正常贷款逾期后利率倍数'),
    sharkRate: Schema.number().default(0.10).min(0).description('高利贷日利率'),
    sharkTermHours: Schema.number().default(24).min(1).description('高利贷期限（小时）'),
    sharkMaxAmount: Schema.number().default(5000).min(1).description('高利贷单笔上限'),
    sharkMaxTotal: Schema.number().default(10000).min(1).description('高利贷未结清总额上限'),
    sharkOverdueMultiplier: Schema.number().default(3).min(1).description('高利贷逾期后利率倍数'),
    collectorIntervalHours: Schema.number().default(1).min(0.1).description('催收员巡逻间隔（小时）'),
    workCooldownMinutes: Schema.number().default(30).min(1).description('打工冷却（分钟）'),
    workMin: Schema.number().default(5).min(0).description('打工最低收益'),
    workMax: Schema.number().default(15).min(1).description('打工最高收益'),
    workGarnishRate: Schema.number().default(0.6).min(0).max(1).description('有逾期欠款时打工收入的强制划扣比例'),
    bankruptPenaltyDays: Schema.number().default(7).min(1).description('破产后的信用黑名单天数'),
  }).description('贷款设置'),
  Schema.object({
    stockEnabled: Schema.boolean().default(true).description('启用股票系统'),
    stockIntervalMinutes: Schema.number().default(60).min(1).max(1440).description('股票行情刷新间隔（分钟）'),
    stockVolatility: Schema.number().default(1).min(0.1).max(5).description('股票波动倍率（越大越刺激）'),
    stockMaxCount: Schema.number().default(12).min(1).max(30).description('股票池上限（新股上市后总数不超过此数）'),
    ipoPeriods: Schema.number().default(24).min(2).description('每刷新多少个周期上市一只新股（默认 24 = 每天一只）'),
    stockEventChance: Schema.number().default(0.08).min(0).max(1).step(0.01).description('每周期每只股票触发黑天鹅/利好事件的概率'),
    dividendChance: Schema.number().default(0.15).min(0).max(1).step(0.01).description('每周期发放一次分红的概率'),
    dividendRate: Schema.number().default(0.01).min(0).step(0.001).description('分红：每股发放 = 现价 × 此比例'),
    stockImpactRatio: Schema.number().default(0.05).min(0).max(0.5).step(0.01).description('价格冲击阈值：玩家单笔 > 卖盘 N 倍时触发 1% 推动（0.05 = 5%）'),
    stockImpactMaxBias: Schema.number().default(0.05).min(0).max(0.3).step(0.01).description('单 tick 累计冲击上限（防止恶性循环，0.05 = ±5%）'),
    stockMomentumDecay: Schema.number().default(0.5).min(0).max(1).step(0.05).description('每 tick 动量衰减系数（0.5 = 衰减一半，0 = 立即清零）'),
    stockSectorLinkStrength: Schema.number().default(0.3).min(0).max(1).step(0.05).description('板块联动强度：同板块其他股涨跌影响本股的比例（0.3 = 30%）'),
  }).description('股票设置'),
  Schema.object({
    casinoEnabled: Schema.boolean().default(true).description('启用赌场'),
    casinoHouseEdge: Schema.number().default(0.05).min(0).max(0.5).step(0.01).description('庄家抽水比例（输的钱按此比例入奖池）'),
    casinoMinBet: Schema.number().default(10).min(1).description('赌场单笔最低押注'),
    casinoMaxBet: Schema.number().default(5000).min(1).description('赌场单笔最高押注'),
    casinoCooldownSeconds: Schema.number().default(20).min(0).description('两次赌场下注的冷却（秒）'),
    blackjackStandOn: Schema.number().default(17).min(15).max(20).description('21点庄家硬停牌点数'),
  }).description('赌场设置'),
  Schema.object({
    lotteryEnabled: Schema.boolean().default(true).description('启用彩票'),
    lotteryPrice: Schema.number().default(10).min(1).description('每注价格'),
    lotteryDigits: Schema.number().default(6).min(3).max(8).description('每位数字（每位 0-9，总组合数 = 10^digits）'),
    lotteryIntervalHours: Schema.number().default(1).min(0.1).description('开奖间隔（小时）'),
    lotteryMaxTicketsPerUser: Schema.number().default(20).min(1).description('单期单人最多买几注'),
    lotteryBasePool: Schema.number().default(1000000).min(0).description('基础奖池：每期开奖注入的固定金额（0 = 关闭）'),
    lotteryIncludeCasinoPool: Schema.boolean().default(true).description('是否把当期赌场奖池全额注入彩票（每期开奖扣走）'),
    lotteryTierPayouts: Schema.array(Schema.number().min(0).max(1)).default([0.50, 0.20, 0.15, 0.10, 0.05]).description('5 档派奖比例 [特,一,二,三,安慰]，剩余自动滚存下期'),
    lotteryMatchLevels: Schema.array(Schema.number().min(0)).default([6, 5, 4, 3, 1]).description('5 档匹配位数阈值 [特,一,二,三,安慰]，默认 6 位数字下分别要求 6/5/4/3/1 位匹配'),
  }).description('彩票设置'),
  Schema.object({
    scratchEnabled: Schema.boolean().default(true).description('启用刮刮乐'),
    scratchPrice: Schema.number().default(10).min(1).description('每张价格'),
    scratchConsolation: Schema.number().default(5).min(0).description('安慰奖：拿回的积分'),
    scratchSmall: Schema.number().default(20).min(0).description('小奖：纯利润'),
    scratchMid: Schema.number().default(100).min(0).description('中奖：纯利润'),
    scratchBig: Schema.number().default(1000).min(0).description('大奖：纯利润'),
    scratchChanceConsolation: Schema.number().default(0.60).min(0).max(1).step(0.01).description('安慰奖概率'),
    scratchChanceSmall: Schema.number().default(0.30).min(0).max(1).step(0.01).description('小奖概率'),
    scratchChanceMid: Schema.number().default(0.09).min(0).max(1).step(0.01).description('中奖概率'),
    scratchChanceBig: Schema.number().default(0.01).min(0).max(1).step(0.01).description('大奖概率'),
  }).description('刮刮乐设置'),
  Schema.object({
    robberyEnabled: Schema.boolean().default(true).description('启用抢劫'),
    robberySuccessRate: Schema.number().default(0.5).min(0).max(1).step(0.05).description('抢劫成功率'),
    robberySuccessPct: Schema.number().default(0.30).min(0).max(1).step(0.01).description('成功时抢得对方现金的比例'),
    robberyFailPct: Schema.number().default(0.50).min(0).max(1).step(0.01).description('失败时赔自己的比例（从自己现金扣）'),
    robberyCooldownMinutes: Schema.number().default(30).min(1).description('抢劫冷却（分钟）'),
    robberyJailMinutes: Schema.number().default(60).min(1).description('抢劫失败坐牢时长（分钟）'),
    robberyDailyLimit: Schema.number().default(5).min(1).description('每日最多抢劫次数（成功+失败合计）'),
    robberyMinVictimCash: Schema.number().default(50).min(0).description('对方现金低于此值不可抢'),
  }).description('抢劫设置'),
  Schema.object({
    robberyNerfMode: Schema.boolean().default(true).description('抢劫削弱模式（v1.10.0）。开启后自动应用：成功率 0.3 / 抢得 15% / 失败赔 60% / 冷却 60min / 日限 3 次 + 4 档保护机制（被抢冷却 / 复仇加成 / 连败加刑 / 被抢方通知）。关闭则回到上方原始数值与机制。'),
    robberyVictimCooldownHours: Schema.number().default(12).min(1).description('被抢保护：被同一人抢过 N 小时内，该人不能再来抢你'),
    robberyRevengeWindowMinutes: Schema.number().default(30).min(1).description('复仇窗口：被抢 N 分钟内抢回对方，成功率按下方倍数加成'),
    robberyRevengeBoost: Schema.number().default(1.5).min(1).max(3).step(0.1).description('复仇加成倍率（成功率 × 此值，上限 1.0）'),
    robberyStreakLossThreshold: Schema.number().default(3).min(2).description('连续失败 N 次触发加刑'),
    robberyStreakLossMultiplier: Schema.number().default(2).min(1).max(5).step(0.5).description('连续失败超过阈值后刑期倍数'),
  }).description('抢劫削弱模式（v1.10.0 起生效）'),
  Schema.object({
    propertyEnabled: Schema.boolean().default(true).description('启用房地产系统'),
    propertyUpdateIntervalHours: Schema.number().default(2).min(0.1).description('房产行情刷新间隔（小时）；越短波动越频繁'),
    propertyTickVolatility: Schema.number().default(0.05).min(0).max(0.3).step(0.01).description('每 tick 随机涨跌基础幅度（0.05 = ±5%）'),
    propertyRentIntervalHours: Schema.number().default(6).min(1).description('收租间隔（小时）；到达后自动结算持有出租房的租金'),
    propertyRentYieldBase: Schema.number().default(0.001).min(0).max(0.05).step(0.0001).description('基础租收益率（每次发租 = 当前估值 × 此比例 × 经过小时数）；类型会按倍率加成'),
    propertyTaxRate: Schema.number().default(0.02).min(0).max(0.2).step(0.005).description('年化持有税（每次刷价时按持有时长扣，0.02 = 2% / 年）'),
    propertyTradeTax: Schema.number().default(0.05).min(0).max(0.2).step(0.01).description('交易税（买卖时按成交额扣，0.05 = 5%）'),
    propertyBubbleMaxIncrease: Schema.number().default(15).min(0).max(50).step(1).description('每 tick 泡沫指数最大增加值（涨幅越大积累越快）'),
    propertyBubbleThreshold: Schema.number().default(80).min(50).max(100).step(5).description('泡沫指数阈值：>= 此值时下一次 tick 必触发破裂'),
    propertyCrashRatio: Schema.number().default(0.5).min(0.1).max(0.9).step(0.05).description('泡沫破裂时价格暴跌比例（0.5 = 跌 50%）；同时清零泡沫'),
    propertyPolicyChance: Schema.number().default(0.05).min(0).max(1).step(0.01).description('每 tick 政策调控触发概率（限购 / 限售 / 加税）'),
    propertyDisasterChance: Schema.number().default(0.03).min(0).max(1).step(0.01).description('每 tick 自然灾害触发概率（地震 / 洪水）'),
    propertyInterestUpChance: Schema.number().default(0.04).min(0).max(1).step(0.01).description('每 tick 利率上调触发概率；上调后该 tick 估值下降'),
    propertyMaxProperties: Schema.number().default(10).min(1).max(50).description('单用户最大持有房产数'),
    propertyDerelictChance: Schema.number().default(0.08).min(0).max(1).step(0.01).description('买房时买到烂尾楼的概率（0.08 = 8%）'),
    propertyDerelictDiscount: Schema.number().default(0.5).min(0.1).max(1).step(0.05).description('烂尾楼折扣（0.5 = 5 折）；原价 × 此比例'),
    propertyDerelictRentFactor: Schema.number().default(0).min(0).max(1).step(0.05).description('烂尾楼租金系数（0 = 完全不出租，0.1 = 仅 10% 租金）'),
    propertyDerelictRescueChance: Schema.number().default(0.5).min(0).max(1).step(0.05).description('每 tick 烂尾整治触发概率（0.5 = 50%）'),
    propertyDerelictBuybackRate: Schema.number().default(0.3).min(0.1).max(1).step(0.05).description('烂尾整治"强制回购"时的现金返还比例（0.3 = 30%）'),
    propertyDerelictRestoreMul: Schema.number().default(0.5).min(0.1).max(1).step(0.05).description('烂尾整治"修复完工"时估值回升比例（0.5 = 回升 50%）'),
    propertyListingExpiryHours: Schema.number().default(168).min(1).max(720).description('P2P 挂牌默认有效期（小时，过期自动撤回）'),
    propertyListingFee: Schema.number().default(0.02).min(0).max(0.2).step(0.01).description('P2P 挂牌服务费（0.02 = 平台抽成 2%）'),
    propertyAppreciationChance: Schema.number().default(0.05).min(0).max(1).step(0.01).description('每 tick 升值政策触发概率（旧改/新区/地铁/特区/利率下调 等）'),
    propertyCrisisChance: Schema.number().default(0.04).min(0).max(1).step(0.01).description('每 tick 危机政策触发概率（强制拆迁/烂尾清理等）'),
    propertyInterestDownChance: Schema.number().default(0.04).min(0).max(1).step(0.01).description('每 tick 利率下调触发概率；下调后该 tick 估值上升'),
  }).description('房地产设置（v1.13.0+，v1.14.0 新增烂尾楼 / P2P 挂牌 / 升值危机政策）'),
  Schema.object({
    stoneEnabled: Schema.boolean().default(true).description('启用赌石系统（v1.15.0）。关闭后整个赌石菜单不可用。'),
    stonePriceTiers: Schema.array(Schema.number().min(1)).default([100, 1000, 10000, 50000, 100000]).description('5 档原石购入价（积分）。索引 0..4。玩家在赌石市场只能看到这 5 档。'),
    stoneMarketRefreshHours: Schema.number().default(24).min(1).max(168).description('原石市场刷新周期（小时）。到点自动清空过期库存、补满 stoneMarketStockSize 块。'),
    stoneMarketStockSize: Schema.number().default(30).min(5).max(200).description('单次市场刷新时的库存数量。0 = 关闭市场刷新但保留现有库存。'),
    stoneDailyPurchaseLimit: Schema.number().default(50).min(1).max(500).description('单玩家每日最多买入多少块原石（不论什么档）。防刷。'),
    stoneDailyAmountLimit: Schema.number().default(1000000).min(0).description('单玩家每日买入原石的总花费上限（积分）。0 = 不限。富玩家冲动下单阻断。'),
    stoneHoldingDailyRate: Schema.number().default(0.05).min(0).max(0.5).step(0.01).description('持有每日涨价率（复利）。0.05 = 每天在当前值基础上 +5%。'),
    stoneHoldingSoftCapMul: Schema.number().default(30).min(2).max(200).description('持有软上限倍数（×basePrice 算）。达到此值后涨价率切换为 stoneHoldingDecayRate。'),
    stoneHoldingDecayRate: Schema.number().default(0.02).min(0).max(0.2).step(0.005).description('软上限之后的涨价率（0.02 = 每天 +2%）。'),
    stoneHoldingHardCapMul: Schema.number().default(100).min(5).max(500).description('持有硬上限倍数（×basePrice 算）。达到此值后停止累计，防无限囤积。'),
    stoneCasinoPoolRate: Schema.number().default(0.2).min(0).max(1).step(0.05).description('卖出后流回赌场池的比例（剩余部分销毁）。0.2 = 20% 喂赌场池，80% 销毁。这就是积分回收的核心。'),
    stoneBrickProtectionRate: Schema.number().default(0.05).min(0).max(0.5).step(0.01).description('砖头(0词条)立即卖出的最低退款比例（× basePrice）。0.05 = 仅退 5%。'),
  }).description('赌石系统设置（v1.15.0 收藏型积分回收）'),
  Schema.object({
    broadcastChannels: Schema.array(String).default([]).description('广播频道列表（格式：平台:频道ID，如 onebot:123456）。彩票开奖和股市新闻会主动发到这些频道'),
  }).description('广播设置'),
]) as unknown as Schema<Config>
