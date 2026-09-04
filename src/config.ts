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
    broadcastChannels: Schema.array(String).default([]).description('广播频道列表（格式：平台:频道ID，如 onebot:123456）。彩票开奖和股市新闻会主动发到这些频道'),
  }).description('广播设置'),
]) as unknown as Schema<Config>
