import { Context, Schema, h } from 'koishi'
import { randomInt as cryptoRandomInt } from 'node:crypto'

export const name = 'daily-points'
export const inject = { required: ['database'], optional: ['puppeteer'] }

export const usage = `签到积分 + 银行 + 股票 + 贷款 + 娱乐 插件。
发送「经济」可查看全部指令菜单。
直接发送短名即可调用：
  积分：签到 / 查询 / 排行 / 转移 / 修改
  银行：存款 / 取款 / 定期存款 / 定期列表 / 定期取出 / 银行（资产总览）
  贷款：贷款（正常） / 高利贷 / 还款（可指定ID） / 欠款 / 打工 / 破产
  股票：股票 / K线 / 买入 / 卖出 / 持仓
  娱乐：赌场 / 猜大小 / 轮盘 / 21点 / 赌场战绩 / 彩票 / 刮刮乐 / 抢劫
（旧写法「积分签到 / 我的积分 / 积分排行 / 积分转移」同样有效）`

export interface Config {
  basePoints: number
  minBonus: number
  maxBonus: number
  streakBonusPerDay: number
  maxStreakBonus: number
  timezoneOffset: number
  leaderboardSize: number
  bankHourlyRate: number
  fixedRate3: number
  fixedRate7: number
  fixedRate30: number
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
  stockEnabled: boolean
  stockIntervalMinutes: number
  stockVolatility: number
  stockMaxCount: number
  ipoPeriods: number
  stockEventChance: number
  dividendChance: number
  dividendRate: number
  casinoEnabled: boolean
  casinoPoolContributionRate?: number
  /** @deprecated 兼容旧配置，请改用 casinoPoolContributionRate。 */
  casinoHouseEdge?: number
  casinoMinBet: number
  casinoMaxBet: number
  casinoCooldownSeconds: number
  blackjackStandOn: number
  blackjackHitSoft17: boolean
  lotteryEnabled: boolean
  lotteryPrice: number
  lotteryDigits: number
  lotteryIntervalHours: number
  lotteryMaxTicketsPerUser: number
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
  robberyEnabled: boolean
  robberySuccessRate: number
  robberySuccessPct: number
  robberyFailPct: number
  robberyCooldownMinutes: number
  robberyJailMinutes: number
  robberyDailyLimit: number
  robberyMinVictimCash: number
  broadcastChannels: string[]
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    basePoints: Schema.number().default(10).min(0).description('每次签到的基础积分'),
    minBonus: Schema.number().default(1).min(0).description('随机额外积分下限'),
    maxBonus: Schema.number().default(10).min(0).description('随机额外积分上限'),
    streakBonusPerDay: Schema.number().default(2).min(0).description('连续签到每日递增奖励'),
    maxStreakBonus: Schema.number().default(30).min(0).description('连续签到奖励上限'),
    timezoneOffset: Schema.number().default(8).step(1).description('时区偏移（小时），用于判断一天的起止'),
    leaderboardSize: Schema.number().default(10).min(1).max(50).description('排行榜显示人数'),
  }).description('签到与积分设置'),
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
  }).description('股票设置'),
  Schema.object({
    casinoEnabled: Schema.boolean().default(true).description('启用赌场'),
    casinoPoolContributionRate: Schema.number().min(0).max(0.5).step(0.01).description('输掉的押注按此比例计入赌场奖池（留空时兼容旧配置，默认 0.05）'),
    casinoMinBet: Schema.number().default(10).min(1).description('赌场单笔最低押注'),
    casinoMaxBet: Schema.number().default(5000).min(1).description('赌场单笔最高押注'),
    casinoCooldownSeconds: Schema.number().default(20).min(0).description('两次赌场下注的冷却（秒）'),
    blackjackStandOn: Schema.number().default(17).min(15).max(20).description('21点庄家停牌点数'),
    blackjackHitSoft17: Schema.boolean().default(false).description('21点庄家是否在软 17 点继续摸牌'),
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
    broadcastChannels: Schema.array(String).default([]).description('广播频道列表（格式：平台:频道ID，如 onebot:123456）。彩票开奖和股市新闻会主动发到这些频道'),
  }).description('广播设置'),
]) as Schema<Config>

const HOUR = 3600000
const DAY = 86400000

/** 内置股票：代码 / 名称 / 基准价 / 单步波动率 */
const STOCK_SEED = [
  { code: 'DMHJ', name: '大摸鱼控股', base: 52.0, vol: 0.04 },
  { code: 'KFXW', name: '咖啡因生物', base: 88.8, vol: 0.06 },
  { code: 'YYKJ', name: '熬夜科技', base: 33.5, vol: 0.05 },
  { code: 'MYYH', name: '摸鱼银行', base: 12.6, vol: 0.02 },
  { code: 'XHNY', name: '小熊新能源', base: 45.0, vol: 0.08 },
  { code: 'GFSP', name: '干饭人食品', base: 20.2, vol: 0.03 },
]

/** 新股 IPO 候选池（随机挑选上市） */
const IPO_PRESETS = [
  { code: 'SSKL', name: '神仙快乐水', base: 66.6, vol: 0.05 },
  { code: 'TMDL', name: '躺平地产', base: 8.8, vol: 0.07 },
  { code: 'BJHL', name: '北极海缆', base: 120.0, vol: 0.04 },
  { code: 'WLMQ', name: '万物量子', base: 210.0, vol: 0.1 },
  { code: 'PPTG', name: '拼团团购', base: 15.5, vol: 0.06 },
  { code: 'ZQMG', name: '追星传媒', base: 42.0, vol: 0.09 },
  { code: 'CYYS', name: '熬夜能源', base: 77.7, vol: 0.08 },
  { code: 'JZMW', name: '卷王劳务', base: 28.8, vol: 0.05 },
  { code: 'XHDX', name: '闲话电信', base: 9.9, vol: 0.02 },
  { code: 'TMSC', name: '天马芯片', base: 320.0, vol: 0.11 },
  { code: 'DBCM', name: '地板传媒', base: 5.2, vol: 0.06 },
  { code: 'SLSD', name: '水里生物', base: 38.6, vol: 0.07 },
]

/** 取本地日期字符串（YYYY-MM-DD），按配置时区计算；offsetDays 为相对今天的天数偏移 */
function dateKey(offsetHours: number, offsetDays = 0): string {
  const t = Date.now() + offsetHours * HOUR - offsetDays * DAY
  return new Date(t).toISOString().slice(0, 10)
}

function randomInt(min: number, max: number): number {
  if (max < min) max = min
  const lo = Math.ceil(min)
  const hi = Math.floor(max)
  return cryptoRandomInt(lo, hi + 1)
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

function fmtMoney(n: number): string {
  return (Math.round(n * 100) / 100).toString()
}

/** 解析金额参数：支持「全部/all」或正整数 */
function parseAmount(text: string | undefined, max: number): number | null {
  if (text === undefined || text === null || text === '') return null
  const t = String(text).trim().toLowerCase().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
  if (['全部', '所有', 'all'].includes(t)) return Math.floor(max)
  const n = Math.floor(Number(t))
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

interface UserRow {
  id: number
  userId: string
  points: number
  bank: number
  bankUpdatedAt: Date
  totalEarned: number
  streak: number
  lastDate: string
  lastClaim: Date
  createdAt: Date
}

interface LoanRow {
  id: number
  userId: string
  type: 'normal' | 'shark' | string
  principal: number
  rate: number
  remaining: number
  termDays: number
  startAt: Date
  dueAt: Date
  updatedAt: Date
  status: 'active' | 'cleared' | string
}

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('daily-points')

  // ── 主动广播：向配置的所有频道发送消息 ──────────────
  async function broadcast(message: string) {
    if (!config.broadcastChannels?.length) return
    for (const channel of config.broadcastChannels) {
      const [platform, channelId] = channel.split(':')
      if (!platform || !channelId) continue
      try {
        await ctx.broadcast([`${platform}:${channelId}`], message)
      } catch (e: any) {
        logger.warn(`广播到 ${channel} 失败：`, e.message)
      }
    }
  }

  // ── 数据表 ──────────────────────────────────────────
  // 用户主表：现金（积分）+ 活期存款
  ctx.model.extend('daily_points', {
    id: 'unsigned',
    userId: 'string(64)',
    points: 'integer',
    bank: 'double',
    bankUpdatedAt: 'timestamp(3)',
    totalEarned: 'integer',
    streak: 'integer',
    lastDate: 'string(10)',
        lastClaim: 'timestamp(3)',
        lastWork: 'timestamp(3)',
        bankruptCount: 'integer',
        bankruptUntil: 'timestamp(3)',
        dividendTotal: 'double',
        createdAt: 'timestamp(3)',
  }, {
    primary: 'id',
    autoInc: true,
    unique: ['userId'],
  })
  // 定期存款
  ctx.model.extend('daily_fixed', {
    id: 'unsigned',
    userId: 'string(64)',
    amount: 'unsigned',
    rate: 'double',
    termDays: 'unsigned',
    startAt: 'timestamp(3)',
    dueAt: 'timestamp(3)',
  }, {
    primary: 'id',
    autoInc: true,
  })
  // 贷款（normal = 正常贷款 / shark = 高利贷）
  ctx.model.extend('daily_loans', {
    id: 'unsigned',
    userId: 'string(64)',
    type: 'string(8)',
    principal: 'unsigned',
    rate: 'double',
    remaining: 'double',
    termDays: 'unsigned',
    startAt: 'timestamp(3)',
    dueAt: 'timestamp(3)',
    updatedAt: 'timestamp(3)',
    status: 'string(8)',
  }, {
    primary: 'id',
    autoInc: true,
  })
  // 股票行情
  ctx.model.extend('daily_stocks', {
    code: 'string(16)',
    name: 'string(64)',
    base: 'double',
    vol: 'double',
    price: 'double',
    prevPrice: 'double',
    updatedAt: 'timestamp(3)',
    haltedUntil: 'timestamp(3)',
    note: 'string(128)',
  }, {
    primary: 'code',
  })
  // K线历史（每周期一根：开高低收）
  ctx.model.extend('daily_stock_history', {
    id: 'unsigned',
    code: 'string(16)',
    open: 'double',
    close: 'double',
    high: 'double',
    low: 'double',
    time: 'timestamp(3)',
  }, {
    primary: 'id',
    autoInc: true,
    index: [['code'], ['time']],
  })
  // 用户持仓
  ctx.model.extend('daily_stock_holding', {
    id: 'unsigned',
    userId: 'string(64)',
    code: 'string(16)',
    quantity: 'unsigned',
    cost: 'double',
  }, {
    primary: 'id',
    autoInc: true,
    unique: [['userId', 'code']],
  })
  // 元数据（如股票上次刷新时间）
  ctx.model.extend('daily_meta', {
    key: 'string(64)',
    value: 'string(256)',
  }, {
    primary: 'key',
  })

  // 赌场奖池（单行：id=1）
  ctx.model.extend('daily_casino_pool', {
    id: 'unsigned',
    amount: 'double',
    updatedAt: 'timestamp(3)',
  }, {
    primary: 'id',
  })

  // 21点进行中的牌局；牌堆和双方手牌使用紧凑字符串持久化，重启后仍可继续
  ctx.model.extend('daily_blackjack_sessions', {
    userId: 'string(64)',
    bet: 'unsigned',
    playerCards: 'string(128)',
    dealerCards: 'string(128)',
    deck: 'string(512)',
    createdAt: 'timestamp(3)',
    updatedAt: 'timestamp(3)',
  }, {
    primary: 'userId',
  })

  // 赌场累计战绩（每个用户、每种游戏一行）
  ctx.model.extend('daily_casino_stats', {
    id: 'unsigned',
    userId: 'string(64)',
    game: 'string(16)',
    plays: 'unsigned',
    wins: 'unsigned',
    losses: 'unsigned',
    pushes: 'unsigned',
    naturals: 'unsigned',
    wagered: 'double',
    net: 'double',
    updatedAt: 'timestamp(3)',
  }, {
    primary: 'id',
    autoInc: true,
    unique: [['userId', 'game']],
  })

  // 彩票期数
  ctx.model.extend('daily_lottery_periods', {
    id: 'unsigned',
    period: 'unsigned',
    winningNumber: 'string(16)',
    status: 'string(16)',
    openedAt: 'timestamp(3)',
    drawnAt: 'timestamp(3)',
    winnerId: 'string(64)',
    ticketCount: 'unsigned',
    carriedOver: 'double',
  }, {
    primary: 'id',
    autoInc: true,
    unique: ['period'],
  })

  // 彩票投注
  ctx.model.extend('daily_lottery_tickets', {
    id: 'unsigned',
    period: 'unsigned',
    userId: 'string(64)',
    number: 'string(16)',
    createdAt: 'timestamp(3)',
  }, {
    primary: 'id',
    autoInc: true,
    index: [['period'], ['userId']],
  })

  // 刮刮乐记录
  ctx.model.extend('daily_scratch_log', {
    id: 'unsigned',
    userId: 'string(64)',
    cost: 'unsigned',
    tier: 'string(16)',
    prize: 'unsigned',
    createdAt: 'timestamp(3)',
  }, {
    primary: 'id',
    autoInc: true,
    index: [['userId'], ['createdAt']],
  })

  // 抢劫记录（用于冷却 + 每日上限）
  ctx.model.extend('daily_robbery_log', {
    id: 'unsigned',
    robberId: 'string(64)',
    victimId: 'string(64)',
    success: 'unsigned',
    amount: 'integer',
    createdAt: 'timestamp(3)',
  }, {
    primary: 'id',
    autoInc: true,
    index: [['robberId'], ['createdAt']],
  })

  // 坐牢状态
  ctx.model.extend('daily_jail', {
    userId: 'string(64)',
    releaseAt: 'timestamp(3)',
    reason: 'string(64)',
    createdAt: 'timestamp(3)',
  }, {
    primary: 'userId',
  })

  // ── 通用工具 ────────────────────────────────────────
  // 同一用户的余额变更串行执行，避免快速重复指令造成读旧值、重复扣款或重复返奖。
  const operationLocks = new Map<string, Promise<void>>()
  async function withUserLock<T>(userId: string, task: () => Promise<T>): Promise<T> {
    const lockKey = `user:${userId}`
    const previous = operationLocks.get(lockKey) || Promise.resolve()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const tail = previous.then(() => gate)
    operationLocks.set(lockKey, tail)
    await previous
    try {
      return await task()
    } finally {
      release()
      if (operationLocks.get(lockKey) === tail) operationLocks.delete(lockKey)
    }
  }

  async function getUser(userId: string, create = true): Promise<UserRow | null> {
    const [row] = await ctx.database.get('daily_points', { userId })
    if (row) return row
    if (!create) return null
    await ctx.database.create('daily_points', {
      userId,
      points: 0,
      bank: 0,
      bankUpdatedAt: new Date(),
      totalEarned: 0,
      streak: 0,
      lastDate: null,
      lastClaim: new Date(),
      createdAt: new Date(),
    })
    const [created] = await ctx.database.get('daily_points', { userId })
    return created
  }

  /** 结算活期利息（按整小时，复利），返回获得的利息 */
  async function settleBank(row: UserRow): Promise<number> {
    const now = Date.now()
    if (!row.bankUpdatedAt) row.bankUpdatedAt = new Date(now)
    if (!row.bank || row.bank <= 0) {
      if (row.bank !== 0) {
        row.bank = 0
        await ctx.database.set('daily_points', { userId: row.userId }, { bank: 0, bankUpdatedAt: new Date(now) })
      }
      return 0
    }
    const elapsed = now - new Date(row.bankUpdatedAt).getTime()
    const hours = Math.min(Math.floor(elapsed / HOUR), 720) // 最多补 30 天利息
    if (hours < 1) return 0
    const factor = Math.pow(1 + config.bankHourlyRate, hours)
    const interest = Math.floor(row.bank * factor - row.bank)
    const newTs = new Date(new Date(row.bankUpdatedAt).getTime() + hours * HOUR)
    if (interest > 0) row.bank += interest
    await ctx.database.set('daily_points', { userId: row.userId }, { bank: row.bank, bankUpdatedAt: newTs })
    row.bankUpdatedAt = newTs
    return interest
  }

  /** 查询用户的总股票市值 */
  async function getStockValue(userId: string): Promise<number> {
    const [holdings, stocks] = await Promise.all([
      ctx.database.get('daily_stock_holding', { userId }),
      ctx.database.get('daily_stocks'),
    ])
    const priceMap = new Map(stocks.map((s) => [s.code, s.price]))
    return holdings.reduce((sum, h) => sum + (priceMap.get(h.code) || 0) * h.quantity, 0)
  }

  // ── 贷款引擎 ────────────────────────────────────────
  /** 结算某用户所有未结清贷款的利息（按小时复利，逾期后利率上浮） */
  async function settleUserLoans(userId: string): Promise<LoanRow[]> {
    const loans = await ctx.database.get('daily_loans', { userId, status: 'active' })
    const now = Date.now()
    for (const l of loans) {
      const lastTs = new Date(l.updatedAt || l.startAt).getTime()
      const elapsed = now - lastTs
      if (elapsed < HOUR) continue
      const overdue = now >= new Date(l.dueAt).getTime()
      const mult = overdue ? (l.type === 'shark' ? config.sharkOverdueMultiplier : config.loanOverdueMultiplier) : 1
      const daily = l.rate * mult
      const hours = Math.min(Math.floor(elapsed / HOUR), 24 * 30) // 最多补 30 天
      const factor = Math.pow(1 + daily / 24, hours)
      const next = Math.round(l.remaining * factor * 100) / 100
      await ctx.database.set('daily_loans', { id: l.id }, {
        remaining: next,
        updatedAt: new Date(lastTs + hours * HOUR),
      })
    }
    return ctx.database.get('daily_loans', { userId, status: 'active' })
  }

  /** 用一笔现金还贷（逾期优先，其次按到期先后），返回还款明细 */
  async function repayLoans(userId: string, amount: number) {
    let rest = amount
    const loans = (await settleUserLoans(userId)).sort((a, b) => {
      const oa = Date.now() >= new Date(a.dueAt).getTime() ? 0 : 1
      const ob = Date.now() >= new Date(b.dueAt).getTime() ? 0 : 1
      if (oa !== ob) return oa - ob
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
    })
    const detail: Array<{ id: number; type: string; pay: number; cleared: boolean }> = []
    for (const l of loans) {
      if (rest <= 0) break
      const pay = Math.min(rest, l.remaining)
      const left = Math.round((l.remaining - pay) * 100) / 100
      await ctx.database.set('daily_loans', { id: l.id }, {
        remaining: left,
        status: left <= 0.01 ? 'cleared' : 'active',
        updatedAt: new Date(),
      })
      rest = Math.round((rest - pay) * 100) / 100
      detail.push({ id: l.id, type: l.type, pay, cleared: left <= 0.01 })
    }
    return { paid: Math.round((amount - rest) * 100) / 100, refunded: rest, detail }
  }

  /** 催收：按顺序没收 现金 → 活期 → 定期本金 → 股票（按市价强平） */
  async function seizeAssets(userId: string, need: number): Promise<number> {
    let got = 0
    const row = await getUser(userId, false)
    if (!row) return 0
    if (row.points > 0) {
      const take = Math.min(row.points, Math.ceil(need))
      got += take
      need -= take
      await ctx.database.set('daily_points', { userId }, { points: row.points - take })
    }
    if (need > 0) {
      await settleBank(row)
      if (row.bank > 0) {
        const take = Math.min(row.bank, need)
        got += take
        need -= take
        await ctx.database.set('daily_points', { userId }, { bank: row.bank - take })
      }
    }
    if (need > 0) {
      const fixed = await ctx.database.get('daily_fixed', { userId })
      for (const f of fixed) {
        if (need <= 0) break
        await ctx.database.remove('daily_fixed', { id: f.id })
        got += f.amount
        need -= f.amount
      }
    }
    if (need > 0 && config.stockEnabled) {
      const stocks = await ctx.database.get('daily_stocks')
      const priceMap = new Map(stocks.map((s) => [s.code, s.price]))
      const holdings = await ctx.database.get('daily_stock_holding', { userId })
      for (const hld of holdings) {
        if (need <= 0) break
        const value = Math.round((priceMap.get(hld.code) || 0) * hld.quantity)
        await ctx.database.remove('daily_stock_holding', { id: hld.id })
        got += value
        need -= value
      }
    }
    return got
  }

  /** 定时催收：处理所有逾期贷款 */
  async function runCollectors() {
    if (!config.loanEnabled) return
    const loans = await ctx.database.get('daily_loans', { status: 'active' })
    const now = Date.now()
    const users = new Set<string>()
    for (const l of loans) {
      if (now >= new Date(l.dueAt).getTime()) users.add(l.userId)
    }
    for (const userId of users) {
      const active = await settleUserLoans(userId)
      const overdue = active.filter((l) => now >= new Date(l.dueAt).getTime())
      if (!overdue.length) continue
      const debt = overdue.reduce((s, l) => s + l.remaining, 0)
      const got = await seizeAssets(userId, debt)
      if (got > 0) await repayLoans(userId, got)
      logger.warn(`催收完成：${userId} 逾期欠款 ${fmtMoney(debt)}，已没收资产 ${fmtMoney(got)}`)
    }
  }

  // ── 股票引擎 ────────────────────────────────────────
  async function ensureStocks() {
    let stocks = await ctx.database.get('daily_stocks')
    if (!stocks.length) {
      const now = new Date()
      for (const s of STOCK_SEED) {
        await ctx.database.create('daily_stocks', {
          code: s.code,
          name: s.name,
          base: s.base,
          vol: s.vol,
          price: s.base,
          prevPrice: s.base,
          updatedAt: now,
        })
      }
      stocks = await ctx.database.get('daily_stocks')
      await ctx.database.upsert('daily_meta', [{ key: 'stockLastUpdate', value: String(now.getTime()) }])
    }
    await seedHistory(stocks)
    // 没水位就强制补一次（注意 set 不插入新行，必须用 upsert）
    const [metaCheck] = await ctx.database.get('daily_meta', { key: 'stockLastUpdate' })
    if (!metaCheck) await ctx.database.upsert('daily_meta', [{ key: 'stockLastUpdate', value: String(Date.now()) }])
    return stocks
  }

  /** 为没有历史K线的股票回填历史（倒推随机游走），保证图表不为空 */
  async function seedHistory(stocks: { code: string; name: string; base: number; vol: number; price: number }[]) {
    const intervalMs = config.stockIntervalMinutes * 60000
    const N = 48
    const now = Date.now()
    const r2 = (v: number) => Math.round(v * 100) / 100
    for (const s of stocks) {
      const existing = await ctx.database.get('daily_stock_history', { code: s.code }, 1)
      if (existing.length) continue
      const closes = [s.price]
      for (let i = 1; i < N; i++) {
        const prev = closes[0]
        const drift = 0.03 * (s.base - prev) / s.base
        const p = prev * (1 + drift + (Math.random() * 2 - 1) * s.vol * config.stockVolatility)
        closes.unshift(Math.max(0.5, Math.min(p, s.base * 10)))
      }
      const rows = []
      for (let i = 0; i < N; i++) {
        const close = closes[i]
        const open = i === 0 ? close * (1 + (Math.random() * 2 - 1) * s.vol * 0.3) : closes[i - 1]
        const high = Math.max(open, close) * (1 + Math.random() * s.vol * 0.4)
        const low = Math.min(open, close) * (1 - Math.random() * s.vol * 0.4)
        rows.push({
          code: s.code,
          open: r2(open),
          close: r2(close),
          high: r2(high),
          low: r2(low),
          time: new Date(now - (N - 1 - i) * intervalMs),
        })
      }
      await ctx.database.upsert('daily_stock_history', rows)
    }
  }

  /** 单只股票走一步随机行情（带均值回归，防止无限暴涨/暴跌） */
  function nextPrice(s: { base: number; price: number; vol: number }): number {
    const vol = s.vol * config.stockVolatility
    const drift = 0.03 * (s.base - s.price) / s.base // 向基准价回归
    const p = s.price * (1 + drift + (Math.random() * 2 - 1) * vol)
    return Math.max(0.5, Math.min(p, s.base * 10))
  }

  /** 随机事件：崩盘 / 暴涨 / 停牌等（haltPeriods 单位：小时，不随行情周期缩放） */
  function rollStockEvent(s: { name: string }): { mult?: number; haltPeriods?: number; text: string } {
    const r = Math.random()
    if (r < 0.3) return { mult: 0.5 + Math.random() * 0.2, text: `${s.name} 财报暴雷，股价跳水` }
    if (r < 0.55) return { mult: 1.3 + Math.random() * 0.5, text: `${s.name} 被巨头收购，股价飙升` }
    if (r < 0.75) return { haltPeriods: randomInt(2, 5), text: `${s.name} 涉嫌财务造假，被临时停牌调查` }
    if (r < 0.9) return { mult: 0.8 + Math.random() * 0.1, text: `${s.name} 高管跑路传闻，股价受挫` }
    return { mult: 1.1 + Math.random() * 0.2, text: `${s.name} 拿下大单，股价走高` }
  }

  async function setNews(text: string) {
    await ctx.database.upsert('daily_meta', [{ key: 'stockNews', value: text }])
  }

  /** 存新闻 + 主动广播 */
  async function setNewsAndBroadcast(text: string) {
    await ctx.database.upsert('daily_meta', [{ key: 'stockNews', value: text }])
    await broadcast(text)
  }

  /** 新股 IPO：每 ipoPeriods 个"小时"真实上市一只（按周期长度换算） */
  async function maybeIPO(stocks: { code: string }[]) {
    if (config.ipoPeriods <= 0 || stocks.length >= config.stockMaxCount) return
    // ipoPeriods 的语义是"多少个 60 分钟周期"，换成当前周期长度下的目标数，保持真实时间节奏不变
    const target = Math.max(1, Math.round(config.ipoPeriods * 60 / Math.max(1, config.stockIntervalMinutes)))
    const [meta] = await ctx.database.get('daily_meta', { key: 'stockIPOCounter' })
    const counter = meta ? Number(meta.value) + 1 : 1
    if (counter < target) {
      await ctx.database.upsert('daily_meta', [{ key: 'stockIPOCounter', value: String(counter) }])
      return
    }
    await ctx.database.upsert('daily_meta', [{ key: 'stockIPOCounter', value: '0' }])
    const used = new Set(stocks.map((s) => s.code))
    const pool = IPO_PRESETS.filter((p) => !used.has(p.code))
    if (!pool.length) return
    const pick = pool[Math.floor(Math.random() * pool.length)]
    await ctx.database.create('daily_stocks', {
      code: pick.code,
      name: pick.name,
      base: pick.base,
      vol: pick.vol,
      price: pick.base,
      prevPrice: pick.base,
      updatedAt: new Date(),
      note: '新股上市，波动剧烈',
    })
    const [newStock] = await ctx.database.get('daily_stocks', { code: pick.code })
    await seedHistory([newStock])
    await setNewsAndBroadcast(`【${fmtTime(Date.now())}】🔔 新股上市：${pick.name}（${pick.code}），发行价 ${fmtMoney(pick.base)}，正式开盘交易！`)
  }

  /** 随机一只股票分红：持股者每股得 现价 × dividendRate（概率按真实时间缩放） */
  async function maybePayDividend(stocks: { code: string; name: string; price: number; haltedUntil?: Date }[]) {
    const scale = Math.min(1, config.stockIntervalMinutes / 60) // 周期越短，单次概率越低，保持每小时节奏不变
    if (Math.random() >= config.dividendChance * scale) return
    const tradable = stocks.filter((s) => !s.haltedUntil || new Date(s.haltedUntil).getTime() <= Date.now())
    if (!tradable.length) return
    const pick = tradable[Math.floor(Math.random() * tradable.length)]
    const perShare = Math.round(pick.price * config.dividendRate * 100) / 100
    if (perShare <= 0) return
    const holdings = await ctx.database.get('daily_stock_holding', { code: pick.code })
    let paid = 0, holders = 0
    for (const h of holdings) {
      const amount = Math.floor(perShare * h.quantity)
      if (amount <= 0) continue
      const [row] = await ctx.database.get('daily_points', { userId: h.userId })
      if (!row) continue
      await ctx.database.set('daily_points', { userId: h.userId }, {
        points: row.points + amount,
        dividendTotal: (row.dividendTotal || 0) + amount,
      })
      paid += amount
      holders++
    }
    if (holders > 0)
      await setNewsAndBroadcast(`【${fmtTime(Date.now())}】💰 ${pick.name}（${pick.code}）发放分红：每股 ${fmtMoney(perShare)}，${holders} 位股东共分得 ${paid} 积分（已入现金）`)
  }

  /** 到期则补齐刷新（含停机期间），并推进水位时间 */
  async function updateStocks() {
    const stocks = await ensureStocks()
    const [meta] = await ctx.database.get('daily_meta', { key: 'stockLastUpdate' })
    const intervalMs = config.stockIntervalMinutes * 60000
    let last = meta ? Number(meta.value) : Date.now()
    if (!Number.isFinite(last)) last = Date.now()
    let steps = Math.floor((Date.now() - last) / intervalMs)
    if (steps <= 0) return stocks
    steps = Math.min(steps, 48) // 一次最多补 48 个周期
    const now = Date.now()
    const r2 = (v: number) => Math.round(v * 100) / 100
    const eventScale = Math.min(1, config.stockIntervalMinutes / 60) // 周期缩短时降低单次事件概率，保持每小时事件密度不变
    const histRows = []
    let lastEventNews: string | null = null
    for (let i = 0; i < steps; i++) {
      const stepMs = Math.min(last + (i + 1) * intervalMs, now)
      const stepTime = new Date(stepMs)
      for (const s of stocks) {
        const haltedMs = s.haltedUntil ? new Date(s.haltedUntil).getTime() : 0
        const open = s.price
        let close = open, high = open, low = open
        if (haltedMs > stepMs) {
          // 停牌中：价格冻结，K线走一字
        } else {
          close = nextPrice(s)
          if (Math.random() < config.stockEventChance * eventScale) {
            const ev = rollStockEvent(s)
            if (ev.haltPeriods) s.haltedUntil = new Date(stepMs + ev.haltPeriods * HOUR)
            if (ev.mult) close = Math.max(0.5, close * ev.mult)
            s.note = ev.text
            const newsText = `【${fmtTime(stepMs)}】📰 ${ev.text}${ev.haltPeriods ? `（停牌约 ${ev.haltPeriods} 小时）` : ''}`
            await setNews(newsText)
            // 只记录最后一个周期的事件新闻用于广播
            if (i === steps - 1) lastEventNews = newsText
          }
          high = Math.max(open, close) * (1 + Math.random() * s.vol * 0.4)
          low = Math.min(open, close) * (1 - Math.random() * s.vol * 0.4)
        }
        s.prevPrice = open
        s.price = r2(close)
        histRows.push({ code: s.code, open: r2(open), close: s.price, high: r2(high), low: r2(low), time: stepTime })
      }
    }
    // 广播最新一周期的股市事件新闻
    if (lastEventNews) await broadcast(lastEventNews)
    // 持久化行情与K线
    for (const s of stocks) {
      await ctx.database.set('daily_stocks', { code: s.code }, {
        price: s.price,
        prevPrice: s.prevPrice,
        updatedAt: new Date(),
        haltedUntil: s.haltedUntil || null,
        note: s.note || null,
      })
    }
    if (histRows.length) await ctx.database.upsert('daily_stock_history', histRows)
    // 清理 14 天前的历史K线
    await ctx.database.remove('daily_stock_history', { time: { $lt: new Date(now - 14 * DAY) } })
    await ctx.database.upsert('daily_meta', [{ key: 'stockLastUpdate', value: String(last + steps * intervalMs) }])
    // 新股 IPO 与分红（按次触发，不受补算影响）
    await maybeIPO(stocks)
    await maybePayDividend(stocks)
    return ctx.database.get('daily_stocks')
  }

  if (config.stockEnabled) {
    updateStocks().catch((e) => logger.warn('股票行情初始化失败：', e))
    ctx.setInterval(() => {
      updateStocks().catch((e) => logger.warn('股票行情刷新失败：', e))
    }, config.stockIntervalMinutes * 60000)
  }

  // ── 娱乐引擎 ────────────────────────────────────────
  /** 赌场奖池注入比例。新名称优先，旧 casinoHouseEdge 仅用于兼容已有配置。 */
  function casinoPoolRate() {
    const configured = config.casinoPoolContributionRate ?? config.casinoHouseEdge ?? 0.05
    return Math.max(0, Math.min(0.5, Number(configured) || 0))
  }

  async function casinoCooldownLeft(userId: string) {
    const cooldownMs = config.casinoCooldownSeconds * 1000
    if (cooldownMs <= 0) return 0
    const [last] = await ctx.database.get('daily_meta', { key: `casino:${userId}` })
    if (!last) return 0
    return Math.max(0, Math.ceil((Number(last.value) + cooldownMs - Date.now()) / 1000))
  }

  async function markCasinoPlay(userId: string) {
    await ctx.database.upsert('daily_meta', [{ key: `casino:${userId}`, value: String(Date.now()) }])
  }

  type CasinoResult = 'win' | 'loss' | 'push' | 'natural' | 'surrender'
  async function recordCasinoResult(userId: string, game: string, bet: number, net: number, result: CasinoResult) {
    const [stats] = await ctx.database.get('daily_casino_stats', { userId, game })
    const delta = {
      plays: 1,
      wins: result === 'win' || result === 'natural' ? 1 : 0,
      losses: result === 'loss' || result === 'surrender' ? 1 : 0,
      pushes: result === 'push' ? 1 : 0,
      naturals: result === 'natural' ? 1 : 0,
    }
    if (!stats) {
      await ctx.database.create('daily_casino_stats', {
        userId,
        game,
        ...delta,
        wagered: bet,
        net,
        updatedAt: new Date(),
      })
      return
    }
    await ctx.database.set('daily_casino_stats', { id: stats.id }, {
      plays: stats.plays + 1,
      wins: stats.wins + delta.wins,
      losses: stats.losses + delta.losses,
      pushes: stats.pushes + delta.pushes,
      naturals: stats.naturals + delta.naturals,
      wagered: stats.wagered + bet,
      net: stats.net + net,
      updatedAt: new Date(),
    })
  }

  /** 获取赌场奖池（单行 id=1，不存在则初始化为 0） */
  async function getCasinoPool() {
    const [row] = await ctx.database.get('daily_casino_pool', { id: 1 })
    if (row) return row
    await ctx.database.create('daily_casino_pool', { id: 1, amount: 0, updatedAt: new Date() })
    const [created] = await ctx.database.get('daily_casino_pool', { id: 1 })
    return created
  }
  async function feedCasinoPool(delta: number) {
    if (delta <= 0) return (await getCasinoPool()).amount
    return withUserLock('$casino-pool', async () => {
      const pool = await getCasinoPool()
      const next = Math.round((pool.amount + delta) * 100) / 100
      await ctx.database.set('daily_casino_pool', { id: 1 }, { amount: next, updatedAt: new Date() })
      return next
    })
  }
  async function ensureLotteryPeriod() {
    try {
      const openRows = await ctx.database.get('daily_lottery_periods', { status: 'open' }, { sort: { period: 'desc' }, limit: 1 })
      const open = Array.isArray(openRows) ? openRows : []
      if (open.length) return open[0]
      const lastRows = await ctx.database.get('daily_lottery_periods', {}, { sort: { period: 'desc' }, limit: 1 })
      const last = Array.isArray(lastRows) ? lastRows : []
      const nextPeriod = last.length ? last[0].period + 1 : 1
      const now = Date.now()
      const created = await ctx.database.create('daily_lottery_periods', {
        period: nextPeriod,
        status: 'open',
        openedAt: new Date(now),
        ticketCount: 0,
        carriedOver: 0,
      })
      return Array.isArray(created) ? created[0] : created
    } catch (e: any) {
      logger.warn('ensureLotteryPeriod 失败：', e.message)
      return null
    }
  }
  async function drawLotteryIfDue(force = false) {
    if (!config.lotteryEnabled) return null
    const cur = await ensureLotteryPeriod()
    const intervalMs = config.lotteryIntervalHours * HOUR
    const due = force || (Date.now() - new Date(cur.openedAt).getTime() >= intervalMs)
    if (!due) return null
    const tickets = await ctx.database.get('daily_lottery_tickets', { period: cur.period })
    const digits = Math.floor(config.lotteryDigits)
    let winning = ''
    for (let i = 0; i < digits; i++) winning += Math.floor(Math.random() * 10)
    let winnerId: string | null = null
    for (const t of tickets) {
      if (t.number === winning) { winnerId = t.userId; break }
    }
    const totalTickets = tickets.length
    const ticketRevenue = totalTickets * config.lotteryPrice
    const pool = ticketRevenue + (cur.carriedOver || 0)
    await ctx.database.set('daily_lottery_periods', { id: cur.id }, {
      status: 'drawn',
      winningNumber: winning,
      drawnAt: new Date(),
      winnerId: winnerId || null,
      ticketCount: totalTickets,
    })
    let news = `【${fmtTime(Date.now())}】🎰 彩票第 ${cur.period} 期开奖：号码 ${winning}`
    if (winnerId) {
      const wRow = await getUser(winnerId)
      await ctx.database.set('daily_points', { userId: winnerId }, { points: wRow.points + pool })
      const wid = winnerId.includes(':') ? winnerId.split(':')[1] : winnerId
      news += `，🎉 ${h('at', { id: wid })} 全中头奖，独得奖池 ${pool} 积分！`
    } else {
      const next = await ctx.database.create('daily_lottery_periods', {
        period: cur.period + 1,
        status: 'open',
        openedAt: new Date(Date.now()),
        ticketCount: 0,
        carriedOver: pool,
      })
      news += `，无人全中，奖池 ${pool} 滚入第 ${next.period} 期。`
    }
    await ctx.database.upsert('daily_meta', [{ key: 'lotteryNews', value: news }])
    logger.info(news)
    // 主动广播开奖结果
    await broadcast(news)
    return { period: cur.period, winning, winnerId, pool }
  }
  function rollScratchTier(): { tier: string, prize: number } {
    const r = Math.random()
    let acc = 0
    const tiers = [
      { tier: 'consolation', chance: config.scratchChanceConsolation },
      { tier: 'small', chance: config.scratchChanceSmall },
      { tier: 'mid', chance: config.scratchChanceMid },
      { tier: 'big', chance: config.scratchChanceBig },
    ]
    for (const t of tiers) {
      acc += t.chance
      if (r < acc) return { tier: t.tier, prize: tierPrize(t.tier) }
    }
    return { tier: 'consolation', prize: tierPrize('consolation') }
  }
  function tierPrize(tier: string) {
    switch (tier) {
      case 'big': return config.scratchBig
      case 'mid': return config.scratchMid
      case 'small': return config.scratchSmall
      default: return config.scratchConsolation
    }
  }
  function tierName(tier: string) {
    switch (tier) {
      case 'big': return '🏆 大奖'
      case 'mid': return '🎉 中奖'
      case 'small': return '✨ 小奖'
      default: return '安慰奖'
    }
  }
  async function inJail(userId: string) {
    const [row] = await ctx.database.get('daily_jail', { userId })
    if (!row || !row.releaseAt) return 0
    const ts = new Date(row.releaseAt).getTime()
    if (Date.now() < ts) return ts
    await ctx.database.remove('daily_jail', { userId })
    return 0
  }
  type BjSuit = 'S' | 'H' | 'D' | 'C'
  interface BjCard { rank: string; suit: BjSuit }

  function bjScoreDetail(hand: BjCard[]) {
    let total = 0, aces = 0
    for (const c of hand) {
      if (c.rank === 'A') { aces += 1; total += 1 }
      else if (['J', 'Q', 'K'].includes(c.rank)) total += 10
      else total += Number(c.rank)
    }
    let soft = false
    if (aces > 0 && total + 10 <= 21) {
      total += 10
      soft = true
    }
    return { score: total, soft }
  }

  function bjScore(hand: BjCard[]) {
    return bjScoreDetail(hand).score
  }

  function bjNatural(hand: BjCard[]) {
    return hand.length === 2 && bjScore(hand) === 21
  }

  function bjNewDeck(): BjCard[] {
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    const suits: BjSuit[] = ['S', 'H', 'D', 'C']
    const deck: BjCard[] = []
    for (const suit of suits) for (const rank of ranks) deck.push({ rank, suit })
    for (let i = deck.length - 1; i > 0; i--) {
      const j = randomInt(0, i)
      ;[deck[i], deck[j]] = [deck[j], deck[i]]
    }
    return deck
  }

  function bjCardStr(c: BjCard) {
    const suits: Record<BjSuit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }
    return `${suits[c.suit]}${c.rank}`
  }

  function bjEncode(cards: BjCard[]) {
    return cards.map((c) => `${c.rank}${c.suit}`).join(',')
  }

  function bjDecode(value: string): BjCard[] {
    if (!value) return []
    return value.split(',').filter(Boolean).map((code) => ({
      rank: code.slice(0, -1),
      suit: code.slice(-1) as BjSuit,
    }))
  }

  function bjPlayerText(cards: BjCard[]) {
    return cards.map((c, index) => index === 1 ? `[暗牌 ${bjCardStr(c)}]` : bjCardStr(c)).join(' ')
  }

  function bjDealerText(cards: BjCard[], reveal = false) {
    if (reveal) return cards.map(bjCardStr).join(' ')
    return `${cards[0] ? bjCardStr(cards[0]) : '无'} [暗牌 🎴]`
  }

  function bjDealerDraw(deck: BjCard[], hand: BjCard[]) {
    while (deck.length) {
      const detail = bjScoreDetail(hand)
      const hitSoft17 = config.blackjackHitSoft17 && detail.soft && detail.score === 17
      if (detail.score >= config.blackjackStandOn && !hitSoft17) break
      hand.push(deck.pop()!)
    }
  }

  async function getBlackjackRound(userId: string) {
    const [round] = await ctx.database.get('daily_blackjack_sessions', { userId })
    return round || null
  }

  async function saveBlackjackRound(userId: string, bet: number, player: BjCard[], dealer: BjCard[], deck: BjCard[], create = false) {
    const data = {
      userId,
      bet,
      playerCards: bjEncode(player),
      dealerCards: bjEncode(dealer),
      deck: bjEncode(deck),
      updatedAt: new Date(),
    }
    if (create) {
      await ctx.database.create('daily_blackjack_sessions', { ...data, createdAt: new Date() })
    } else {
      await ctx.database.set('daily_blackjack_sessions', { userId }, data)
    }
  }

  function blackjackPrompt(player: BjCard[], dealer: BjCard[], bet: number) {
    return [
      `♠️ 你的牌：${bjPlayerText(player)}（${bjScore(player)} 点）`,
      `♣️ 庄家：${bjDealerText(dealer)}（明牌 ${dealer[0] ? bjScore([dealer[0]]) : 0} 点）`,
      `当前押注：${bet}。请选择「摸牌」「加注 金额」「开牌」或「放弃」。`,
    ].join('\n')
  }

  async function settleBlackjackRound(userId: string, round: any, forced?: 'surrender') {
    const player = bjDecode(round.playerCards)
    const dealer = bjDecode(round.dealerCards)
    const deck = bjDecode(round.deck)
    const bet = Number(round.bet)
    const playerNatural = bjNatural(player)
    const dealerNatural = bjNatural(dealer)
    let result: CasinoResult
    let payout = 0
    let message = ''

    if (forced === 'surrender') {
      result = 'surrender'
      payout = Math.floor(bet / 2)
      message = `🏳️ 你选择放弃，返还一半押注 ${payout}。`
    } else if (playerNatural || dealerNatural) {
      if (playerNatural && dealerNatural) {
        result = 'push'
        payout = bet
        message = '🤝 双方都是天然 21 点，平局退还本金。'
      } else if (playerNatural) {
        result = 'natural'
        payout = bet + Math.floor(bet * 1.5)
        message = `✨ 天然 21 点！按 3:2 获利，返还 ${payout}（含本金）。`
      } else {
        result = 'loss'
        message = '❌ 庄家天然 21 点，本局失败。'
      }
    } else if (bjScore(player) > 21) {
      result = 'loss'
      message = '💥 你爆牌了，本局失败。'
    } else {
      bjDealerDraw(deck, dealer)
      const playerScore = bjScore(player)
      const dealerScore = bjScore(dealer)
      if (dealerScore > 21 || playerScore > dealerScore) {
        result = 'win'
        payout = bet * 2
        message = dealerScore > 21 ? '✅ 庄家爆牌，你赢了！' : `✅ ${playerScore} vs ${dealerScore}，你赢了！`
      } else if (playerScore === dealerScore) {
        result = 'push'
        payout = bet
        message = `🤝 ${playerScore} vs ${dealerScore}，平局退还本金。`
      } else {
        result = 'loss'
        message = `❌ ${playerScore} vs ${dealerScore}，庄家获胜。`
      }
    }

    const row = await getUser(userId)
    await ctx.database.set('daily_points', { userId }, { points: row.points + payout })
    const lost = Math.max(0, bet - payout)
    const poolFee = Math.floor(lost * casinoPoolRate())
    const pool = poolFee > 0 ? await feedCasinoPool(poolFee) : null
    await recordCasinoResult(userId, 'blackjack', bet, payout - bet, result)
    await ctx.database.remove('daily_blackjack_sessions', { userId })

    const lines = [
      `♠️ 你的牌：${player.map(bjCardStr).join(' ')}（${bjScore(player)} 点）`,
      `♣️ 庄家牌：${dealer.map(bjCardStr).join(' ')}（${bjScore(dealer)} 点）`,
      message,
    ]
    if (poolFee > 0) lines.push(`其中 ${poolFee} 计入赌场奖池（奖池 ${fmtMoney(pool!)}）。`)
    lines.push(`本局净收益：${payout - bet >= 0 ? '+' : ''}${payout - bet}，当前现金：${row.points + payout}`)
    return lines.join('\n')
  }
  if (config.loanEnabled) {
    runCollectors().catch((e) => logger.warn('启动催收失败：', e))
    ctx.setInterval(() => {
      runCollectors().catch((e) => logger.warn('催收失败：', e))
    }, config.collectorIntervalHours * HOUR)
  }
  if (config.lotteryEnabled) {
    ensureLotteryPeriod().catch((e) => logger.warn('彩票期数初始化失败：', e))
    ctx.setInterval(() => {
      drawLotteryIfDue().catch((e) => logger.warn('彩票开奖失败：', e))
    }, 30 * 60000)
  }

  // ── 兼容连写：指令和数字之间没空格（「存款100」「还款全部」「彩票3」「还款：500」等） ──
  // Koishi 按空白分词，连写时整条消息会变成一个无法匹配的「命令名」，机器人毫无反应。
  // 这里在命令派发前把消息拆开重组成带空格的形式再派发，只对本插件带参数的指令生效。
  const glueNames = new Set([
    '存款', '取款', '定期存款', '定期取出',
    '贷款', '正常贷款', '高利贷', '还款', '还贷',
    '猜大小', '赌大小', '轮盘', '赌轮盘', '轮盘赌', '21点', '二十一点', '黑杰克',
    '加注',
    '彩票', '买彩票', '刮刮乐', '刮奖', 'ggl',
    'K线', 'k线', '蜡烛图', '走势图', '买入', '卖出',
  ])
  ctx.middleware((session, next) => {
    const raw = session.content
    if (typeof raw !== 'string') return next()
    const content = raw.trim()
    if (content.length < 3) return next()
    // 指令头 + 可选的中文/英文分隔符 + 数字参数或「全部/所有/all」
    const m = content.match(/^(\S+?)[：:，,、]?\s*((?:[０-９0-9][０-９0-9.,，]*)|全部|所有|all)$/)
    if (!m) return next()
    const head = m[1]
    if (!glueNames.has(head) && !glueNames.has(head.toLowerCase())) return next()
    const cm = ctx.$commander
    const cmd = cm.get(head) || cm.get(head.toLowerCase())
    if (!cmd || !cmd._arguments || !cmd._arguments.length) return next()
    const arg = m[2]
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)) // 全角数字转半角
      .replace(/，/g, ',')
    return session.execute(`${head} ${arg}`, next)
  }, true)

  // ── 经济系统总菜单（二级分组，避免 help 一屏刷满） ──
  ctx.command('经济', '经济系统总菜单（积分 / 银行 / 贷款 / 股票 / 娱乐）')
    .action(() => {
      return [
        '🏦 经济系统指令一览',
        '',
        '💰 积分：签到｜查询｜排行｜转移 @人 数量',
        '🏦 银行：存款｜取款｜定期存款｜定期列表｜定期取出｜银行（资产总览）',
        '💳 贷款：贷款（正常）｜高利贷｜还款（可指定ID）｜欠款｜打工｜破产',
        '📈 股票：股票（行情）｜K线（走势图）｜买入｜卖出｜持仓',
        '🎲 娱乐：赌场（猜大小/轮盘/21点）｜彩票｜刮刮乐｜抢劫 @人',
        '',
        '直接发送指令名即可使用，无需加前缀。',
        '详细用法可发送「help 经济」或「help 指令名」查看。',
      ].join('\n')
    })

  ctx.command('经济/积分', '积分分组：签到 / 查询 / 排行 / 转移 / 修改')
    .action(() => {
      return [
        '💰 积分指令：',
        '  签到 —— 每日签到领积分，连续签到奖励递增',
        '  查询 —— 查询现金、存款、股票市值与欠款',
        '  排行 —— 积分排行榜',
        '  转移 @某人 数量 —— 把积分转给别人',
        '  修改 @某人 数量 —— 管理员调整积分（3 级权限）',
        '',
        '（旧写法「积分签到 / 我的积分 / 积分排行 / 积分转移」同样有效）',
      ].join('\n')
    })

  // ── 签到 ─────────────────────────────────────────────
  ctx.command('经济/积分/签到', '每日签到领取积分')
    .alias('qd', '积分签到', '领取积分', 'daily-points')
    .action(async ({ session }) => {
      if (!session.userId) return
      const key = `${session.platform}:${session.userId}`
      const today = dateKey(config.timezoneOffset)
      const yesterday = dateKey(config.timezoneOffset, 1)
      const row = await getUser(key)
      if (row.lastDate === today) {
        return `今天已经签到过啦，明天再来吧～\n当前现金：${row.points}`
      }
      const streak = row.lastDate === yesterday ? row.streak + 1 : 1
      const bonus = randomInt(config.minBonus, config.maxBonus)
      const streakGain = Math.min(config.streakBonusPerDay * (streak - 1), config.maxStreakBonus)
      let gain = config.basePoints + bonus + streakGain
      const blackUntil = await inBankruptcy(key)
      if (blackUntil) gain = Math.floor(gain / 2)
      const points = row.points + gain
      await ctx.database.set('daily_points', { userId: key }, {
        points,
        totalEarned: row.totalEarned + gain,
        streak,
        lastDate: today,
        lastClaim: new Date(),
      })
      const lines = [
        `签到成功！获得 ${gain} 积分`,
        `（基础 ${config.basePoints} + 随机 ${bonus} + 连续签到 ${streakGain}）`,
        `已连续签到 ${streak} 天，当前现金：${points}`,
      ]
        if (streakGain >= config.maxStreakBonus && config.maxStreakBonus > 0) {
            lines.push(`连续签到奖励已达上限，感谢每天的陪伴！`)
        }
        if (blackUntil)
            lines.push(`⚠️ 破产惩罚期内，签到收益减半（${fmtTime(blackUntil)} 恢复信用）。`)
      return lines.join('\n')
    })

  // ── 查询 ─────────────────────────────────────────────
  ctx.command('经济/积分/查询', '查询当前积分与资产')
    .alias('我的积分', '积分余额', 'chaxun')
    .action(async ({ session }) => {
      if (!session.userId) return
      const key = `${session.platform}:${session.userId}`
      const row = await getUser(key, false)
      if (!row) return '你还没有积分哦，发送「签到」领取今天的积分吧～'
      const interest = await settleBank(row)
      const fixed = await ctx.database.get('daily_fixed', { userId: key })
      const fixedSum = fixed.reduce((s, f) => s + f.amount, 0)
      const stockValue = config.stockEnabled ? await getStockValue(key) : 0
      const lines = [`当前现金：${row.points}`]
      if (row.bank > 0) lines.push(`活期存款：${fmtMoney(row.bank)}${interest > 0 ? `（含刚结算利息 ${interest}）` : ''}`)
      if (fixedSum > 0) lines.push(`定期存款：${fixedSum}（${fixed.length} 笔）`)
      if (stockValue > 0) lines.push(`股票市值：${fmtMoney(stockValue)}`)
      if (config.loanEnabled) {
        const loans = await settleUserLoans(key)
        if (loans.length) lines.push(`⚠️ 欠款：${fmtMoney(loans.reduce((s, l) => s + l.remaining, 0))}（发送「欠款」查看明细）`)
      }
      lines.push(`累计签到获得：${row.totalEarned}，连续签到：${row.streak} 天`)
      return lines.join('\n')
    })

  // ── 排行榜 ───────────────────────────────────────────
  ctx.command('经济/积分/排行', '查看积分排行榜')
    .alias('积分排行', 'points-rank', 'paihang')
    .action(async () => {
      const rows = await ctx.database.get('daily_points', {}, {
        sort: { points: 'desc' },
        limit: Math.ceil(config.leaderboardSize),
      })
      if (!rows.length) return '还没有人签到过哦～'
      const lines = rows.map((row, i) => {
        const userId = row.userId.includes(':') ? row.userId.split(':')[1] : row.userId
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
        return `${medal} ${h('at', { id: userId })}  ${row.points} 分`
      })
      return `积分排行榜：\n${lines.join('\n')}`
    })

  // ── 银行：活期 ───────────────────────────────────────
  ctx.command('经济/银行/存款 <amount:string>', '把现金存入银行（活期，每小时计息）')
    .action(async ({ session }, amount) => {
      if (!session.userId) return
      const key = `${session.platform}:${session.userId}`
      const row = await getUser(key)
      const n = parseAmount(amount, row.points)
      if (n === null) return '请输入正确的金额（正整数或「全部」）。'
      if (n > row.points) return `现金不足（当前 ${row.points}）。`
      const interest = await settleBank(row)
      await ctx.database.set('daily_points', { userId: key }, {
        points: row.points - n,
        bank: row.bank + n,
        bankUpdatedAt: row.bank <= 0 ? new Date() : row.bankUpdatedAt,
      })
      const lines = [`已存入 ${n} 积分，活期余额：${fmtMoney(row.bank + n)}，现金剩余：${row.points - n}`]
      if (interest > 0) lines.push(`本次结算活期利息：${interest}`)
      return lines.join('\n')
    })

  ctx.command('经济/银行/取款 <amount:string>', '从银行取出活期存款')
    .action(async ({ session }, amount) => {
      if (!session.userId) return
      const key = `${session.platform}:${session.userId}`
      const row = await getUser(key)
      const interest = await settleBank(row)
      const n = parseAmount(amount, row.bank)
      if (n === null) return '请输入正确的金额（正整数或「全部」）。'
      if (n > Math.floor(row.bank)) return `活期余额不足（当前 ${fmtMoney(row.bank)}）。`
      await ctx.database.set('daily_points', { userId: key }, {
        points: row.points + n,
        bank: row.bank - n,
      })
      const lines = [`已取出 ${n} 积分，现金：${row.points + n}，活期剩余：${fmtMoney(row.bank - n)}`]
      if (interest > 0) lines.push(`本次结算活期利息：${interest}`)
      return lines.join('\n')
    })

  // ── 银行：定期 ───────────────────────────────────────
  const termRates = () => ({
    3: config.fixedRate3,
    7: config.fixedRate7,
    30: config.fixedRate30,
  })

  ctx.command('经济/银行/定期存款 <amount:string> <days:number>', '存定期（3/7/30 天，利率更高，提前取出无利息）')
    .action(async ({ session }, amount, days) => {
      if (!session.userId) return
      const key = `${session.platform}:${session.userId}`
      const rates = termRates()
      if (!rates[days]) return `定期期限只支持：${Object.keys(rates).join(' / ')} 天。`
      const row = await getUser(key)
      const n = parseAmount(amount, row.points)
      if (n === null) return '请输入正确的金额（正整数或「全部」）。'
      if (n > row.points) return `现金不足（当前 ${row.points}）。`
      const now = Date.now()
      const [created] = await ctx.database.create('daily_fixed', {
        userId: key,
        amount: n,
        rate: rates[days],
        termDays: days,
        startAt: new Date(now),
        dueAt: new Date(now + days * DAY),
      })
      await ctx.database.set('daily_points', { userId: key }, { points: row.points - n })
      return [
        `定期存款成功！单号 ${created ? created.id : ''}`,
        `本金 ${n}，期限 ${days} 天，日利率 ${(rates[days] * 100).toFixed(2)}%`,
        `到期可得 ${Math.floor(n * (1 + rates[days] * days))} 积分（${fmtTime(now + days * DAY)} 到期）`,
      ].join('\n')
    })

  ctx.command('经济/银行/定期列表', '查看我的定期存款')
    .action(async ({ session }) => {
      if (!session.userId) return
      const fixed = await ctx.database.get('daily_fixed', { userId: `${session.platform}:${session.userId}` })
      if (!fixed.length) return '你还没有定期存款。'
      const lines = fixed
        .sort((a, b) => a.id - b.id)
        .map((f) => {
          const matured = Date.now() >= new Date(f.dueAt).getTime()
          const interest = Math.floor(f.amount * f.rate * f.termDays)
          return `单号 ${f.id}｜本金 ${f.amount}｜${f.termDays} 天｜到期利息 ${interest}｜${matured ? '✅ 已到期' : `还剩 ${Math.ceil((new Date(f.dueAt).getTime() - Date.now()) / DAY)} 天`}`
        })
      return `定期存款（${fixed.length} 笔，本金合计 ${fixed.reduce((s, f) => s + f.amount, 0)}）：\n${lines.join('\n')}`
    })

  ctx.command('经济/银行/定期取出 <id:number>', '取出定期存款（提前取出只还本金）')
    .action(async ({ session }, id) => {
      if (!session.userId) return
      const key = `${session.platform}:${session.userId}`
      if (!id) return '请提供定期单号，可用「定期列表」查看。'
      const [f] = await ctx.database.get('daily_fixed', { id, userId: key })
      if (!f) return '没有找到这笔定期存款。'
      const row = await getUser(key)
      const matured = Date.now() >= new Date(f.dueAt).getTime()
      if (matured) {
        const interest = Math.floor(f.amount * f.rate * f.termDays)
        await ctx.database.remove('daily_fixed', { id })
        await ctx.database.set('daily_points', { userId: key }, { points: row.points + f.amount + interest })
        return `定期存款到期取出：本金 ${f.amount} + 利息 ${interest}，现金：${row.points + f.amount + interest}`
      }
      await ctx.database.remove('daily_fixed', { id })
      await ctx.database.set('daily_points', { userId: key }, { points: row.points + f.amount })
      return `定期存款尚未到期，提前取出仅返还本金 ${f.amount}（损失全部利息），现金：${row.points + f.amount}`
    })

  // ── 银行总览（银行分组入口） ─────────────────────────
  ctx.command('经济/银行', '查看我的资产总览')
    .action(async ({ session }) => {
      if (!session.userId) return
      const key = `${session.platform}:${session.userId}`
      const row = await getUser(key)
      const interest = await settleBank(row)
      const fixed = await ctx.database.get('daily_fixed', { userId: key })
      const fixedSum = fixed.reduce((s, f) => s + f.amount, 0)
      const fixedDue = fixed.reduce((s, f) => s + Math.floor(f.amount * f.rate * f.termDays), 0)
      const stockValue = config.stockEnabled ? await getStockValue(key) : 0
      const loans = config.loanEnabled ? await settleUserLoans(key) : []
      const debt = loans.reduce((s, l) => s + l.remaining, 0)
      const total = row.points + row.bank + fixedSum + stockValue
      const lines = [
        `💰 资产总览（总值 ${fmtMoney(total)}）`,
        `现金：${row.points}`,
        `活期存款：${fmtMoney(row.bank)}（每小时 ${(config.bankHourlyRate * 100).toFixed(3)}%）${interest > 0 ? `，刚结算利息 ${interest}` : ''}`,
      ]
      if (fixed.length) lines.push(`定期存款：${fixedSum}（到期共可得利息 ${fixedDue}）`)
      if (config.stockEnabled) lines.push(`股票市值：${fmtMoney(stockValue)}`)
      if (loans.length) {
        const overdue = loans.filter((l) => Date.now() >= new Date(l.dueAt).getTime()).length
        lines.push(`⚠️ 欠款：${fmtMoney(debt)}（${loans.length} 笔${overdue ? `，其中 ${overdue} 笔已逾期` : ''}）`)
        lines.push(`净资产：${fmtMoney(total - debt)}`)
      }
      lines.push('用「存款/取款」操作活期，「贷款/高利贷」借钱，「还款」还钱，「股票」查看行情。')
      return lines.join('\n')
    })

  // ── 贷款 ─────────────────────────────────────────────
  const loanRates = () => ({ 3: config.loanRate3, 7: config.loanRate7, 30: config.loanRate30 })

  /** 计算正常贷款可用授信：按「净资产」（总资产 − 全部欠款）计算。
   * 借款时现金 +n、欠款 +n，净资产不变，因此借来的钱不会抬高额度，杜绝无限套贷。 */
  async function normalCredit(key: string) {
    const row = await getUser(key)
    await settleBank(row)
    const fixed = await ctx.database.get('daily_fixed', { userId: key })
    const fixedSum = fixed.reduce((s, f) => s + f.amount, 0)
    const stockValue = config.stockEnabled ? await getStockValue(key) : 0
    const assets = row.points + row.bank + fixedSum + stockValue
    const loans = await ctx.database.get('daily_loans', { userId: key, status: 'active' })
    const totalDebt = loans.reduce((s, l) => s + l.remaining, 0)
    const activeNormal = loans.filter((l) => l.type === 'normal').reduce((s, l) => s + l.remaining, 0)
    const netAssets = assets - totalDebt
    const limit = netAssets >= 0 ? Math.max(config.loanMinLimit, Math.floor(netAssets * config.loanCreditRatio)) : 0
    return { limit, available: Math.max(0, Math.floor(limit - activeNormal)), assets, debt: totalDebt }
  }

  /** 是否处于破产惩罚期：返回惩罚截止时间戳（0 表示不在惩罚期） */
  async function inBankruptcy(userId: string): Promise<number> {
    const row = await getUser(userId, false)
    if (!row || !row.bankruptUntil) return 0
    const ts = new Date(row.bankruptUntil).getTime()
    return Date.now() < ts ? ts : 0
  }

  ctx.command('经济/贷款 <amount:string> [days:number]', '向银行申请正常贷款（额度与资产挂钩）')
    .alias('正常贷款')
    .action(async ({ session }, amount, days) => {
      if (!session.userId) return
      if (!config.loanEnabled) return '贷款系统未开启。'
      const key = `${session.platform}:${session.userId}`
      const blacklistUntil = await inBankruptcy(key)
      if (blacklistUntil)
        return `⛔ 你在破产惩罚期内（${fmtTime(blacklistUntil)} 恢复信用），银行不批新贷。可以先「打工」攒钱。`
      const rates = loanRates()
      if (!amount) {
        const { limit, available } = await normalCredit(key)
        return [
          '🏦 正常贷款：',
          `期限与日利率：${Object.entries(rates).map(([d, r]) => `${d} 天 ${(r * 100).toFixed(1)}%`).join(' / ')}`,
          `你的信用额度：${limit}，当前还可借 ${available}`,
          '用法：贷款 数量 [天数]，天数可选 3 / 7 / 30（默认 7）',
          '逾期后利率翻倍，催收员会直接划扣你的资产！',
        ].join('\n')
      }
      const term = days && rates[days] !== undefined ? days : 7
      const { available } = await normalCredit(key)
      const overdueLoans = (await ctx.database.get('daily_loans', { userId: key, status: 'active' })).filter((l) => Date.now() >= new Date(l.dueAt).getTime())
      if (overdueLoans.length)
        return '⛔ 你有逾期未还的贷款，银行已冻结你的信用。先「还款」，还不上就「打工」，别想着以贷养贷。'
      const n = parseAmount(amount, available)
      if (n === null) return '请输入正确的金额（正整数）。'
      if (n > available) return `超出信用额度（当前可借 ${available}），多攒点资产再来吧。`
      const now = Date.now()
      await ctx.database.create('daily_loans', {
        userId: key,
        type: 'normal',
        principal: n,
        rate: rates[term],
        remaining: n,
        termDays: term,
        startAt: new Date(now),
        dueAt: new Date(now + term * DAY),
        updatedAt: new Date(now),
        status: 'active',
      })
      const row = await getUser(key)
      await ctx.database.set('daily_points', { userId: key }, { points: row.points + n })
      return [
        `✅ 贷款获批：${n} 积分已到账（现金 ${row.points + n}）`,
        `期限 ${term} 天，日利率 ${(rates[term] * 100).toFixed(1)}%，到期应还约 ${Math.floor(n * (1 + rates[term] * term))}`,
        `请于 ${fmtTime(now + term * DAY)} 前还款，逾期利率翻倍并触发催收。`,
      ].join('\n')
    })

  ctx.command('经济/贷款/高利贷 <amount:string>', '找地下钱庄借钱：无需信用、秒到账，但利率极高')
    .alias('地下钱庄')
    .action(async ({ session }, amount) => {
      if (!session.userId) return
      if (!config.loanEnabled) return '贷款系统未开启。'
      const key = `${session.platform}:${session.userId}`
      const blacklistUntil = await inBankruptcy(key)
      if (blacklistUntil)
        return `⛔ 你在破产惩罚期内（${fmtTime(blacklistUntil)} 恢复信用），连钱庄都不放贷给你。可以先「打工」攒钱。`
      if (!amount) {
        return [
          '🦈 地下钱庄：',
          `无需信用审核，单笔最高 ${config.sharkMaxAmount}，未结清总额上限 ${config.sharkMaxTotal}，日利率 ${(config.sharkRate * 100).toFixed(1)}%，期限 ${config.sharkTermHours} 小时。`,
          `逾期后利率再乘 ${config.sharkOverdueMultiplier} 倍，催收员会直接没收你的现金、存款、定期甚至股票！`,
          '用法：高利贷 数量',
        ].join('\n')
      }
      const n = parseAmount(amount, config.sharkMaxAmount)
      if (n === null) return '请输入正确的金额（正整数）。'
      if (n > config.sharkMaxAmount) return `单笔上限 ${config.sharkMaxAmount}，贪多嚼不烂。`
      const sharkLoans = await ctx.database.get('daily_loans', { userId: key, status: 'active', type: 'shark' })
      const sharkTotal = sharkLoans.reduce((s, l) => s + l.remaining, 0)
      if (sharkLoans.some((l) => Date.now() >= new Date(l.dueAt).getTime()))
        return '🦈 打手把你拦在门口：上一笔账还逾期着呢，想再借？先还钱！'
      if (sharkTotal + n > config.sharkMaxTotal)
        return `🦈 钱庄也不是傻子：你未结清的借款已有 ${fmtMoney(sharkTotal)}，加上这笔会超过总额上限 ${config.sharkMaxTotal}。`
      const now = Date.now()
      await ctx.database.create('daily_loans', {
        userId: key,
        type: 'shark',
        principal: n,
        rate: config.sharkRate,
        remaining: n,
        termDays: 1,
        startAt: new Date(now),
        dueAt: new Date(now + config.sharkTermHours * HOUR),
        updatedAt: new Date(now),
        status: 'active',
      })
      const row = await getUser(key)
      await ctx.database.set('daily_points', { userId: key }, { points: row.points + n })
      const due = Math.ceil(n * (1 + config.sharkRate * config.sharkTermHours / 24))
      return [
        `🦈 拿到钱了：${n} 积分已到账（现金 ${row.points + n}）`,
        `日利率 ${(config.sharkRate * 100).toFixed(1)}%，${config.sharkTermHours} 小时内需还约 ${due}`,
        `⚠️ ${fmtTime(now + config.sharkTermHours * HOUR)} 前不还清，利率暴涨，催收员随时上门！`,
      ].join('\n')
    })

  ctx.command('经济/贷款/还款 [id:number] <amount:string>', '偿还贷款（可指定贷款ID，不指定则按优先级还）')
    .alias('还贷')
    .action(async ({ session }, id, amount) => {
      if (!session.userId) return
      const key = `${session.platform}:${session.userId}`
      const active = await settleUserLoans(key)
      if (!active.length) return '你目前没有任何欠款，无债一身轻～'
      const totalDebt = active.reduce((s, l) => s + l.remaining, 0)
      const row = await getUser(key)

      // 有 id 参数 → 指定贷款还款
      if (id) {
        const target = active.find((l) => l.id === id)
        if (!target) return `没有找到单号 ${id} 的活跃贷款，发送「欠款」查看你的贷款列表。`
        const maxPay = Math.min(row.points, Math.ceil(target.remaining))
        const n = parseAmount(amount, maxPay)
        if (n === null) return `请输入正确的金额（正整数或「全部」）。该笔贷款当前应还 ${fmtMoney(target.remaining)}，现金 ${row.points}。`
        if (n > row.points) return `现金不足（当前 ${row.points}），该笔贷款应还 ${fmtMoney(target.remaining)}。`
        // 直接还这笔指定贷款
        const left = Math.round((target.remaining - n) * 100) / 100
        await ctx.database.set('daily_loans', { id: target.id }, {
          remaining: left,
          status: left <= 0.01 ? 'cleared' : 'active',
          updatedAt: new Date(),
        })
        const refunded = n > target.remaining ? Math.round((n - target.remaining) * 100) / 100 : 0
        await ctx.database.set('daily_points', { userId: key }, { points: row.points - n + Math.floor(refunded) })
        const lines = [`本次还款 ${fmtMoney(n - refunded)} 积分（指定单号 ${id}）。`]
        lines.push(`  贷款单 ${id}（${target.type === 'shark' ? '🦈 高利贷' : '🏦 正常贷款'}）还款 ${fmtMoney(n - refunded)}${left <= 0.01 ? '，✅ 已结清' : `，剩余 ${fmtMoney(left)}`}`)
        const still = await ctx.database.get('daily_loans', { userId: key, status: 'active' })
        if (still.length) lines.push(`仍有欠款 ${fmtMoney(still.reduce((s, l) => s + l.remaining, 0))}，发送「欠款」查看明细。`)
        else lines.push('🎉 全部欠款已结清，无债一身轻！')
        return lines.join('\n')
      }

      // 无 id 参数 → 原有逻辑：按优先级还
      const n = parseAmount(amount, Math.min(row.points, Math.ceil(totalDebt)))
      if (n === null) return `请输入正确的金额（正整数或「全部」）。当前总欠款 ${fmtMoney(totalDebt)}，现金 ${row.points}。\n也可以用「还款 贷款ID 金额」指定还哪笔，发送「欠款」查看贷款列表。`
      if (n > row.points) return `现金不足（当前 ${row.points}），总欠款 ${fmtMoney(totalDebt)}。`
      const { paid, refunded, detail } = await repayLoans(key, n)
      await ctx.database.set('daily_points', { userId: key }, { points: row.points - n + Math.floor(refunded) })
      const lines = [`本次还款 ${fmtMoney(paid)} 积分。`]
      for (const d of detail) lines.push(`  贷款单 ${d.id}（${d.type === 'shark' ? '🦈 高利贷' : '🏦 正常贷款'}）还款 ${fmtMoney(d.pay)}${d.cleared ? '，✅ 已结清' : ''}`)
      const still = await ctx.database.get('daily_loans', { userId: key, status: 'active' })
      if (still.length) lines.push(`仍有欠款 ${fmtMoney(still.reduce((s, l) => s + l.remaining, 0))}，发送「欠款」查看明细。`)
      else lines.push('🎉 全部欠款已结清，无债一身轻！')
      return lines.join('\n')
    })

  ctx.command('经济/贷款/欠款', '查看我的贷款与欠款')
    .alias('我的欠款', '我的贷款')
    .action(async ({ session }) => {
      if (!session.userId) return
      const key = `${session.platform}:${session.userId}`
      const active = await settleUserLoans(key)
      if (!active.length) return '你目前没有任何欠款，无债一身轻～'
      const lines = active
        .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
        .map((l) => {
          const overdue = Date.now() >= new Date(l.dueAt).getTime()
          const mult = overdue ? (l.type === 'shark' ? config.sharkOverdueMultiplier : config.loanOverdueMultiplier) : 1
          return `单号 ${l.id}｜${l.type === 'shark' ? '🦈 高利贷' : '🏦 正常贷款'}｜本金 ${l.principal}｜当前应还 ${fmtMoney(l.remaining)}｜日利率 ${(l.rate * mult * 100).toFixed(1)}%｜${overdue ? '🚨 已逾期，利率已上浮！' : `${fmtTime(new Date(l.dueAt).getTime())} 到期`}`
        })
      const total = active.reduce((s, l) => s + l.remaining, 0)
      return [`💳 我的欠款（合计 ${fmtMoney(total)}）：`, ...lines, '用「还款 数量」按优先级偿还（逾期优先），或用「还款 贷款ID 数量」指定还哪笔；实在还不起可以「打工」赚积分（逾期时收入会被强制划扣），或发送「破产」了解出路。'].join('\n')
    })

  // ── 打工：还不起钱的出路之一 ────────────────────────
  ctx.command('经济/贷款/打工', '打工赚积分（有逾期欠款时收入会被强制划扣还债）')
    .alias('搬砖')
    .action(async ({ session }) => {
      if (!session.userId) return
      const key = `${session.platform}:${session.userId}`
      const row = await getUser(key)
      const lastTs = row.lastWork ? new Date(row.lastWork).getTime() : 0
      const cooldown = config.workCooldownMinutes * 60000
      if (Date.now() - lastTs < cooldown)
        return `🧱 工头说歇会儿再来：${fmtTime(lastTs + cooldown)} 之后开工。`
      await ctx.database.set('daily_points', { userId: key }, { lastWork: new Date() })
      const earn = randomInt(Math.floor(config.workMin), Math.floor(config.workMax))
      const active = await settleUserLoans(key)
      const hasOverdue = active.some((l) => Date.now() >= new Date(l.dueAt).getTime())
      let keep = earn
      let garnished = 0
      if (hasOverdue && config.workGarnishRate > 0) {
        garnished = Math.floor(earn * config.workGarnishRate)
        keep = earn - garnished
        if (garnished > 0) await repayLoans(key, garnished)
      }
      const fresh = await getUser(key)
      await ctx.database.set('daily_points', { userId: key }, { points: fresh.points + keep, totalEarned: fresh.totalEarned + keep })
      const lines = [`🧱 打工赚了 ${earn} 积分！`]
      if (garnished > 0) {
        lines.push(`⚠️ 催收员当场划走 ${garnished} 积分抵债（工资扣押 ${(config.workGarnishRate * 100).toFixed(0)}%），到手 ${keep}。`)
        const still = await ctx.database.get('daily_loans', { userId: key, status: 'active' })
        if (still.length)
          lines.push(`仍欠 ${fmtMoney(still.reduce((s, l) => s + l.remaining, 0))}，继续搬砖总有一天能还清。`)
      } else if (active.length) {
        lines.push('你的贷款尚未逾期，本次工资全额到手。')
      }
      lines.push(`当前现金：${fresh.points + keep}`)
      return lines.join('\n')
    })

  // ── 破产：还不起钱的出路之二 ────────────────────────
  ctx.command('经济/贷款/破产', '申请破产：债务一笔勾销，但资产全部没收并进入信用黑名单')
    .alias('申请破产')
    .action(async ({ session }) => {
      if (!session.userId) return
      if (!config.loanEnabled) return '贷款系统未开启。'
      const key = `${session.platform}:${session.userId}`
      const active = await settleUserLoans(key)
      if (!active.length)
        return '你没有任何欠款，破产个啥？好好过日子吧。'
      const overdue = active.filter((l) => Date.now() >= new Date(l.dueAt).getTime())
      if (!overdue.length)
        return [
          '⚖️ 法院驳回了你的破产申请：你的贷款尚未逾期，说明你还还得起。',
          '真到了还不起的那天（逾期后）再来申请；也可以发送「打工」，搬砖也能还债。',
        ].join('\n')
      const totalDebt = active.reduce((s, l) => s + l.remaining, 0)
      // 没收全部资产
      const row = await getUser(key)
      await settleBank(row)
      const fixed = await ctx.database.get('daily_fixed', { userId: key })
      for (const f of fixed) await ctx.database.remove('daily_fixed', { id: f.id })
      let holdingValue = 0
      if (config.stockEnabled) {
        const stocks = await ctx.database.get('daily_stocks')
        const priceMap = new Map(stocks.map((s) => [s.code, s.price]))
        const holdings = await ctx.database.get('daily_stock_holding', { userId: key })
        for (const hd of holdings) {
          holdingValue += Math.round((priceMap.get(hd.code) || 0) * hd.quantity)
          await ctx.database.remove('daily_stock_holding', { id: hd.id })
        }
      }
      const seized = Math.round(row.points + row.bank + fixed.reduce((s, f) => s + f.amount, 0) + holdingValue)
      // 所有贷款作废
      for (const l of active)
        await ctx.database.set('daily_loans', { id: l.id }, { status: 'bankrupt', updatedAt: new Date() })
      const penaltyDays = Math.floor(config.bankruptPenaltyDays)
      const until = Date.now() + penaltyDays * DAY
      await ctx.database.set('daily_points', { userId: key }, {
        points: 0,
        bank: 0,
        bankruptCount: (row.bankruptCount || 0) + 1,
        bankruptUntil: new Date(until),
      })
      return [
        '⚖️ 法院裁定：破产申请通过。',
        `名下 ${active.length} 笔贷款（合计 ${fmtMoney(totalDebt)}）一笔勾销，催收员不会再来了。`,
        `作为代价，全部资产没收充公${seized > 0 ? `（现金/存款/股票合计约 ${fmtMoney(seized)}）` : ''}，归零从头开始。`,
        `惩罚：${penaltyDays} 天内不能贷款、不能碰高利贷，签到收益减半。`,
        `破产记录 +1（累计 ${(row.bankruptCount || 0) + 1} 次），${fmtTime(until)} 恢复信用。`,
        '期间可以「打工」慢慢攒钱——浪子回头金不换。',
      ].join('\n')
    })

  // ── 股票：行情 ───────────────────────────────────────
  ctx.command('经济/股票', '查看实时股票行情')
    .alias('股票列表', '股票行情')
    .action(async () => {
      if (!config.stockEnabled) return '股票系统未开启。'
      const stocks = await updateStocks()
      const now = Date.now()
      const lines = stocks.map((s) => {
        const change = s.prevPrice ? (s.price / s.prevPrice - 1) * 100 : 0
        const arrow = change >= 0 ? '📈 +' : '📉 '
        const halted = s.haltedUntil && new Date(s.haltedUntil).getTime() > now
        const tag = halted ? '🚫停牌' : (s.note ? `📌${s.note}` : '')
        return `${s.code} ${s.name}｜${fmtMoney(s.price)}（${arrow}${change.toFixed(2)}%）${tag}`
      })
      const [meta] = await ctx.database.get('daily_meta', { key: 'stockLastUpdate' })
      const [ipoMeta] = await ctx.database.get('daily_meta', { key: 'stockIPOCounter' })
      const [newsMeta] = await ctx.database.get('daily_meta', { key: 'stockNews' })
      const nextMin = meta ? Math.max(0, Math.ceil((Number(meta.value) + config.stockIntervalMinutes * 60000 - Date.now()) / 60000)) : config.stockIntervalMinutes
      const out = [`📊 股票行情（每 ${config.stockIntervalMinutes} 分钟刷新一次）：`, ...lines]
      if (newsMeta?.value) out.push(`📰 最新消息：${newsMeta.value}`)
      if (config.ipoPeriods > 0 && stocks.length < config.stockMaxCount) {
        // 与 maybeIPO 相同的换算：ipoPeriods 语义是"多少个 60 分钟周期"
        const target = Math.max(1, Math.round(config.ipoPeriods * 60 / Math.max(1, config.stockIntervalMinutes)))
        out.push(`🔔 新股上市倒计时：还需 ${Math.max(1, target - Number(ipoMeta?.value || 0))} 个周期（当前 ${stocks.length}/${config.stockMaxCount} 只）`)
      }
      out.push(`下次刷新约 ${nextMin} 分钟后。买入用「买入 代码 数量」，看走势发「K线 代码」`)
      return out.join('\n')
    })

  // ── 股票：K线图 ────────────────────────────────────
  function buildKlineHTML(stock: { name: string; code: string; price: number }, candles: { open: number; close: number; high: number; low: number }[]) {
    const W = 760, H = 420
    const padL = 18, padR = 70, padT = 56, padB = 30
    const plotW = W - padL - padR, plotH = H - padT - padB
    let min = Infinity, max = -Infinity
    for (const c of candles) {
      min = Math.min(min, c.low)
      max = Math.max(max, c.high)
    }
    const span0 = (max - min) || 1
    min -= span0 * 0.05
    max += span0 * 0.05
    const y = (v: number) => padT + (max - v) / (max - min) * plotH
    const n = candles.length
    const cw = plotW / n
    const up = '#d93026', down = '#0f9d58' // 红涨绿跌
    const first = candles[0], last = candles[n - 1]
    const chg = first.open ? (last.close / first.open - 1) * 100 : 0
    let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`
    svg += `<rect width="${W}" height="${H}" fill="#ffffff"/>`
    svg += `<text x="${padL}" y="26" font-size="20" font-weight="600" fill="#1a1a1a" font-family="sans-serif">${stock.name}（${stock.code}）</text>`
    svg += `<text x="${padL}" y="46" font-size="13" fill="#5f6368" font-family="sans-serif">现价 ${fmtMoney(stock.price)} · 区间 ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% · 每根K线 = ${config.stockIntervalMinutes} 分钟 · 共 ${n} 根</text>`
    for (let g = 0; g <= 4; g++) {
      const v = min + (max - min) * g / 4
      const gy = y(v)
      svg += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="#eeeeee" stroke-width="1"/>`
      svg += `<text x="${W - padR + 6}" y="${(gy + 4).toFixed(1)}" font-size="11" fill="#999999" font-family="sans-serif">${fmtMoney(v)}</text>`
    }
    for (let i = 0; i < n; i++) {
      const c = candles[i]
      const cx = padL + i * cw + cw / 2
      const color = c.close >= c.open ? up : down
      const bodyW = Math.max(2, Math.floor(cw * 0.6))
      const yO = y(c.open), yC = y(c.close)
      svg += `<line x1="${cx.toFixed(1)}" y1="${y(c.high).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${y(c.low).toFixed(1)}" stroke="${color}" stroke-width="1.2"/>`
      const top = Math.min(yO, yC)
      const bh = Math.max(1, Math.abs(yC - yO))
      svg += `<rect x="${(cx - bodyW / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bodyW}" height="${bh.toFixed(1)}" fill="${color}"/>`
    }
    const ly = y(last.close)
    svg += `<line x1="${padL}" y1="${ly.toFixed(1)}" x2="${W - padR}" y2="${ly.toFixed(1)}" stroke="#666666" stroke-width="1" stroke-dasharray="4 3"/>`
    svg += `<text x="${W - padR + 6}" y="${(ly + 4).toFixed(1)}" font-size="12" font-weight="600" fill="#d93026" font-family="sans-serif">${fmtMoney(last.close)}</text>`
    svg += '</svg>'
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;}</style></head><body>${svg}</body></html>`
  }

  ctx.command('经济/股票/K线 [code:string] [count:number]', '查看股票K线走势图')
    .alias('k线', '蜡烛图', '走势图')
    .action(async ({ session }, code, count) => {
      if (!session.userId) return
      if (!config.stockEnabled) return '股票系统未开启。'
      if (!code) return '请提供股票代码，如「K线 DMHJ」，可指定根数如「K线 DMHJ 48」。'
      const upper = String(code).trim().toUpperCase()
      const stocks = await updateStocks()
      const stock = stocks.find((s) => s.code === upper)
      if (!stock) return `没有找到股票「${upper}」，发送「股票」查看列表。`
      const n = Math.min(Math.max(count || 30, 10), 96)
      const candles = (await ctx.database.get('daily_stock_history', { code: upper }, { sort: { time: 'desc' }, limit: n })).reverse()
      if (!candles.length) return '暂无历史K线数据，请等待行情刷新后再试。'
      if (!ctx.puppeteer) {
        const spark = candles.slice(-24).map((c) => (c.close >= c.open ? '█' : '▁')).join('')
        return `${stock.name}（${upper}）近 ${candles.length} 根K线（█涨 ▁跌）：\n${spark}\n提示：未启用 puppeteer 插件，无法生成图片走势。`
      }
      try {
        return await ctx.puppeteer.render(buildKlineHTML(stock, candles))
      } catch (e) {
        logger.warn('K线渲染失败：', e)
        return 'K线图渲染失败，请稍后再试。'
      }
    })

  // ── 股票：交易 ──────────────────────────────────────
  ctx.command('经济/股票/买入 <code:string> <qty:integer>', '用现金买入股票')
    .action(async ({ session }, code, qty) => {
      if (!session.userId) return
      if (!config.stockEnabled) return '股票系统未开启。'
      const key = `${session.platform}:${session.userId}`
      if (!code) return '请提供股票代码，如「买入 DMHJ 10」。'
      const upper = String(code).trim().toUpperCase()
      if (!qty || qty <= 0) return '购买数量必须是正整数。'
      const stocks = await updateStocks()
      const stock = stocks.find((s) => s.code === upper)
      if (!stock) return `没有找到股票「${upper}」，发送「股票」查看列表。`
      if (stock.haltedUntil && new Date(stock.haltedUntil).getTime() > Date.now())
        return `🚫 ${stock.name}（${upper}）已停牌，暂停交易，复牌时间约 ${fmtTime(new Date(stock.haltedUntil).getTime())}。`
      const total = Math.round(stock.price * qty)
      if (total <= 0) return '购买数量太少啦。'
      const row = await getUser(key)
      if (row.points < total) return `现金不足：需要 ${total}，当前 ${row.points}。`
      const [holding] = await ctx.database.get('daily_stock_holding', { userId: key, code: upper })
      if (holding) {
        await ctx.database.set('daily_stock_holding', { id: holding.id }, {
          quantity: holding.quantity + qty,
          cost: holding.cost + total,
        })
      } else {
        await ctx.database.create('daily_stock_holding', {
          userId: key,
          code: upper,
          quantity: qty,
          cost: total,
        })
      }
      await ctx.database.set('daily_points', { userId: key }, { points: row.points - total })
      return `买入成功：${stock.name}（${upper}）× ${qty} @ ${fmtMoney(stock.price)}，花费 ${total}，现金剩余 ${row.points - total}`
    })

  ctx.command('经济/股票/卖出 <code:string> <qty:integer>', '卖出股票换回现金')
    .action(async ({ session }, code, qty) => {
      if (!session.userId) return
      if (!config.stockEnabled) return '股票系统未开启。'
      const key = `${session.platform}:${session.userId}`
      if (!code) return '请提供股票代码，如「卖出 DMHJ 10」。'
      const upper = String(code).trim().toUpperCase()
      const [holding] = await ctx.database.get('daily_stock_holding', { userId: key, code: upper })
      if (!holding || !holding.quantity) return `你没有持有 ${upper}，发送「持仓」查看。`
      if (!qty || qty <= 0) return '卖出数量必须是正整数。'
      if (qty > holding.quantity) return `持有数量不足（当前 ${holding.quantity}）。`
      const stocks = await updateStocks()
      const stock = stocks.find((s) => s.code === upper)
      if (!stock) return `没有找到股票「${upper}」的数据。`
      if (stock.haltedUntil && new Date(stock.haltedUntil).getTime() > Date.now())
        return `🚫 ${stock.name}（${upper}）已停牌，暂停交易，复牌时间约 ${fmtTime(new Date(stock.haltedUntil).getTime())}。`
      const proceeds = Math.round(stock.price * qty)
      const costPart = Math.round(holding.cost * qty / holding.quantity)
      const profit = proceeds - costPart
      if (qty === holding.quantity) {
        await ctx.database.remove('daily_stock_holding', { id: holding.id })
      } else {
        await ctx.database.set('daily_stock_holding', { id: holding.id }, {
          quantity: holding.quantity - qty,
          cost: holding.cost - costPart,
        })
      }
      const row = await getUser(key)
      await ctx.database.set('daily_points', { userId: key }, { points: row.points + proceeds })
      return [
        `卖出成功：${stock.name}（${upper}）× ${qty} @ ${fmtMoney(stock.price)}，获得 ${proceeds}`,
        `本次盈亏：${profit >= 0 ? '+' : ''}${profit}（成本 ${costPart}）`,
        `现金：${row.points + proceeds}`,
      ].join('\n')
    })

  ctx.command('经济/股票/持仓', '查看我的股票持仓')
    .alias('我的持仓')
    .action(async ({ session }) => {
      if (!session.userId) return
      if (!config.stockEnabled) return '股票系统未开启。'
      const key = `${session.platform}:${session.userId}`
      const holdings = await ctx.database.get('daily_stock_holding', { userId: key })
      if (!holdings.length) return '当前空仓，发送「股票」查看行情，「买入 代码 数量」建仓。'
      const stocks = await updateStocks()
      const priceMap = new Map(stocks.map((s) => [s.code, s]))
      let totalValue = 0, totalCost = 0
      const lines = holdings.map((hld) => {
        const s = priceMap.get(hld.code)
        const price = s ? s.price : 0
        const value = Math.round(price * hld.quantity)
        const avg = hld.quantity ? hld.cost / hld.quantity : 0
        const profit = value - hld.cost
        totalValue += value
        totalCost += hld.cost
        const pct = hld.cost > 0 ? ((profit / hld.cost) * 100).toFixed(2) : '0.00'
        return `${hld.code}｜持有 ${hld.quantity} 股｜现价 ${fmtMoney(price)}｜市值 ${value}｜成本均价 ${fmtMoney(avg)}｜浮盈 ${profit >= 0 ? '+' : ''}${profit}（${profit >= 0 ? '+' : ''}${pct}%）`
      })
      const tp = totalValue - totalCost
      const row = await getUser(key)
      const div = Math.floor(row.dividendTotal || 0)
      const outLines = [`📈 我的持仓（市值 ${totalValue}，总成本 ${Math.round(totalCost)}）：`, ...lines,
        `合计浮盈：${tp >= 0 ? '+' : ''}${tp}（${totalCost > 0 ? ((tp / totalCost) * 100).toFixed(2) : '0.00'}%）`]
      if (div > 0) outLines.push(`累计分红：${div} 积分（分红自动存入现金）`)
      return outLines.join('\n')
    })

  // ── 积分转移 / 管理员调整 ────────────────────────────
  ctx.command('经济/积分/转移 <user:user> <amount:integer>', '把积分转移给别人')
    .alias('转让积分', '积分转移', 'zhuanyi')
    .action(async ({ session }, user, amount) => {
      if (!session.userId) return
      if (!user) return '请 @ 你要转移积分的对象。'
      if (!amount || amount <= 0) return '转移数量必须是正整数。'
      const fromKey = `${session.platform}:${session.userId}`
      const [toPlatform, toId] = user.split(':')
      if (!toPlatform || !toId) return '对方信息解析失败，请在群里 @ 对方后再试。'
      const toKey = `${toPlatform}:${toId}`
      if (toKey === fromKey) return '不能转移给自己哦。'
      const activeLoans = await ctx.database.get('daily_loans', { userId: fromKey, status: 'active' })
      if (activeLoans.length)
        return '你还有未结清的欠款，还清之前不能转移积分（防止借钱转给小号后跑路）。'
      const from = await getUser(fromKey)
      if (from.points < amount) return `你的现金不足（当前 ${from.points}）。`
      const to = await getUser(toKey)
      await ctx.database.set('daily_points', { userId: fromKey }, { points: from.points - amount })
      await ctx.database.set('daily_points', { userId: toKey }, { points: to.points + amount })
      return `已转移 ${amount} 积分给 ${h('at', { id: toId })}，剩余 ${from.points - amount} 积分。`
    })

  ctx.command('经济/积分/修改 <user:user> <amount:integer>', '管理员调整用户积分（可为负数）', { authority: 3 })
    .alias('积分修改', 'kaifen')
    .action(async ({ session }, user, amount) => {
      if (!user) return '请 @ 要调整积分的对象。'
      if (typeof amount !== 'number') return '请提供调整数量（正数增加，负数扣减）。'
      const [platform, id] = user.split(':')
      if (!platform || !id) return '对方信息解析失败，请在群里 @ 对方后再试。'
      const key = `${platform}:${id}`
      const row = await getUser(key)
      const next = row.points + amount
      if (next < 0) return `调整后积分不能为负（对方当前 ${row.points}）。`
      await ctx.database.set('daily_points', { userId: key }, { points: next })
      return `已将 ${h('at', { id })} 的积分调整为 ${next}（${amount >= 0 ? '+' : ''}${amount}）。`
    })

  // ── 娱乐：总菜单 ───────────────────────────────────
  ctx.command('经济/娱乐', '娱乐系统总菜单（赌场 / 彩票 / 刮刮乐 / 抢劫）')
    .action(async () => {
      const pool = await getCasinoPool()
      const cur = await ensureLotteryPeriod()
      const lastDraw = await ctx.database.get('daily_lottery_periods', { status: 'drawn' }, { sort: { period: 'desc' }, limit: 1 })
      const lines = [
        '🎲 娱乐指令（刺激型玩家专享）：',
        `  赌场 —— 猜大小 / 轮盘 / 21点，输局的 ${(casinoPoolRate() * 100).toFixed(0)}% 计入奖池`,
        `  彩票 —— 每期 ${config.lotteryPrice} 积分一注，头奖独得奖池，未中滚入下期`,
        '  刮刮乐 —— 即买即开，小奖概率高、大奖概率极低',
        `  抢劫 @某人 —— 成功拿 ${(config.robberySuccessPct * 100).toFixed(0)}%，失败赔 ${(config.robberyFailPct * 100).toFixed(0)}%（有冷却+坐牢）`,
        '',
        `💰 当前赌场奖池：${fmtMoney(pool.amount)}`,
        `🎰 彩票当前第 ${cur.period} 期，已累计 ${cur.ticketCount} 注`,
      ]
      if (lastDraw.length) {
        lines.push(`📜 上期开奖：第 ${lastDraw[0].period} 期 号码 ${lastDraw[0].winningNumber}（${lastDraw[0].winnerId ? '🎉 已有人中头奖' : '无人全中，奖池已滚入新期'}）`)
      }
      return lines.join('\n')
    })

  // ── 娱乐：赌场 ────────────────────────────────────
  ctx.command('经济/娱乐/赌场', '赌场分组菜单')
    .action(() => {
      return [
        '🎰 赌场规则一览：',
        '  猜大小 押注 大|小 —— 三枚骰子，4-10 为小、11-17 为大；任意豹子庄家通吃',
        '  轮盘 押注 红|黑|单|双 —— 0-36 中随机一格，按红黑/单双赔率结算',
        '  21点 押注 —— 开始交互牌局；随后发送「摸牌 / 加注 金额 / 开牌 / 放弃」',
        '  赌场战绩 —— 查看累计局数、胜负和净收益',
        '',
        `通用规则：单笔 ${config.casinoMinBet} ~ ${config.casinoMaxBet} 积分，开新局间隔 ${config.casinoCooldownSeconds} 秒；普通胜局 1:1，输掉金额的 ${(casinoPoolRate() * 100).toFixed(0)}% 计入奖池。`,
      ].join('\n')
    })

  ctx.command('经济/娱乐/赌场/战绩', '查看我的赌场累计战绩')
    .alias('赌场战绩', '赌局统计')
    .action(async ({ session }) => {
      if (!session.userId) return
      const key = `${session.platform}:${session.userId}`
      const stats = await ctx.database.get('daily_casino_stats', { userId: key })
      if (!stats.length) return '还没有赌场战绩，发送「赌场」看看玩法吧。'
      const names: Record<string, string> = { bigsmall: '🎲 猜大小', roulette: '🎡 轮盘', blackjack: '♠️ 21点' }
      let plays = 0, wagered = 0, net = 0
      const lines = stats.map((s) => {
        plays += s.plays
        wagered += s.wagered
        net += s.net
        const natural = s.naturals ? `｜天然21点 ${s.naturals}` : ''
        return `${names[s.game] || s.game}｜${s.plays} 局｜胜 ${s.wins} 负 ${s.losses} 和 ${s.pushes}${natural}｜累计下注 ${fmtMoney(s.wagered)}｜净收益 ${s.net >= 0 ? '+' : ''}${fmtMoney(s.net)}`
      })
      return [`📊 我的赌场战绩：`, ...lines, `合计 ${plays} 局，累计下注 ${fmtMoney(wagered)}，总净收益 ${net >= 0 ? '+' : ''}${fmtMoney(net)}`].join('\n')
    })

  ctx.command('经济/娱乐/赌场/猜大小 <amount:string> <choice:string>', '三枚骰子猜大小（豹子庄家通吃）')
    .alias('赌大小', '大小', 'ducai', 'casino-bigsmall')
    .action(async ({ session }, amount, choice) => {
      if (!session.userId) return
      if (!config.casinoEnabled) return '赌场系统未开启。'
      const key = `${session.platform}:${session.userId}`
      return withUserLock(key, async () => {
        const rawChoice = String(choice || '').trim().toLowerCase()
        const pick = rawChoice.includes('大') || rawChoice === 'big' ? 'big'
          : rawChoice.includes('小') || rawChoice === 'small' ? 'small' : null
        if (!pick) return '请输入「大」或「小」，例如「猜大小 100 大」。'
        const row = await getUser(key)
        const n = parseAmount(amount, row.points)
        if (n === null) return '请输入正确的金额（正整数）。'
        if (n < config.casinoMinBet) return `单笔最低 ${config.casinoMinBet}。`
        if (n > config.casinoMaxBet) return `单笔最高 ${config.casinoMaxBet}。`
        if (n > row.points) return `现金不足（当前 ${row.points}）。`
        const cooldown = await casinoCooldownLeft(key)
        if (cooldown > 0) return `🎰 荷官说歇会儿：${cooldown} 秒后再下注。`
        await markCasinoPlay(key)
        await ctx.database.set('daily_points', { userId: key }, { points: row.points - n })
        const dice = [randomInt(1, 6), randomInt(1, 6), randomInt(1, 6)]
        const sum = dice.reduce((a, b) => a + b, 0)
        const triple = dice[0] === dice[1] && dice[1] === dice[2]
        const label = sum <= 10 ? '小' : '大'
        const win = !triple && ((pick === 'big' && sum >= 11) || (pick === 'small' && sum <= 10))
        if (win) {
          const payout = n * 2
          await ctx.database.set('daily_points', { userId: key }, { points: row.points - n + payout })
          await recordCasinoResult(key, 'bigsmall', n, n, 'win')
          return [`🎲 骰子：${dice.join(' + ')} = ${sum}（${label}）`, `✅ 命中！返还 ${payout}（含本金），本局净赚 ${n}，现金：${row.points + n}`].join('\n')
        }
        const poolFee = Math.floor(n * casinoPoolRate())
        const newPool = await feedCasinoPool(poolFee)
        await recordCasinoResult(key, 'bigsmall', n, -n, 'loss')
        return [
          `🎲 骰子：${dice.join(' + ')} = ${sum}${triple ? `（豹子 ${dice[0]}-${dice[1]}-${dice[2]}，庄家通吃）` : `（${label}）`}`,
          `❌ 没中，输掉 ${n}，其中 ${poolFee} 计入赌场奖池（奖池 ${fmtMoney(newPool)}）`,
          `当前现金：${row.points - n}`,
        ].join('\n')
      })
    })

  ctx.command('经济/娱乐/赌场/轮盘 <amount:string> <choice:string>', '轮盘：红/黑/单/双，1:1 赔率')
    .alias('赌轮盘', '轮盘赌', 'roulette')
    .action(async ({ session }, amount, choice) => {
      if (!session.userId) return
      if (!config.casinoEnabled) return '赌场系统未开启。'
      const key = `${session.platform}:${session.userId}`
      return withUserLock(key, async () => {
        const rawChoice = String(choice || '').trim()
        let pickEn: string | null = null
        if (rawChoice === '红' || rawChoice.includes('红')) pickEn = 'red'
        else if (rawChoice === '黑' || rawChoice.includes('黑')) pickEn = 'black'
        else if (rawChoice === '单' || rawChoice.includes('单')) pickEn = 'odd'
        else if (rawChoice === '双' || rawChoice.includes('双')) pickEn = 'even'
        if (!pickEn) return '请输入「红」「黑」「单」或「双」，例如「轮盘 100 红」。'
        const row = await getUser(key)
        const n = parseAmount(amount, row.points)
        if (n === null) return '请输入正确的金额（正整数）。'
        if (n < config.casinoMinBet) return `单笔最低 ${config.casinoMinBet}。`
        if (n > config.casinoMaxBet) return `单笔最高 ${config.casinoMaxBet}。`
        if (n > row.points) return `现金不足（当前 ${row.points}）。`
        const cooldown = await casinoCooldownLeft(key)
        if (cooldown > 0) return `🎰 荷官说歇会儿：${cooldown} 秒后再下注。`
        await markCasinoPlay(key)
        await ctx.database.set('daily_points', { userId: key }, { points: row.points - n })
        const ball = randomInt(0, 36)
        const isRed = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(ball)
        const isBlack = ball !== 0 && !isRed
        const isOdd = ball % 2 === 1 && ball !== 0
        const isEven = ball % 2 === 0 && ball !== 0
        const win = (pickEn === 'red' && isRed) || (pickEn === 'black' && isBlack) || (pickEn === 'odd' && isOdd) || (pickEn === 'even' && isEven)
        const colorLabel = ball === 0 ? '绿(0)' : (isRed ? '红' : '黑')
        const choiceLabel = pickEn === 'red' ? '红' : pickEn === 'black' ? '黑' : pickEn === 'odd' ? '单' : '双'
        if (win) {
          const payout = n * 2
          await ctx.database.set('daily_points', { userId: key }, { points: row.points - n + payout })
          await recordCasinoResult(key, 'roulette', n, n, 'win')
          return [`🎡 轮盘球落 ${ball}（${colorLabel}）`, `✅ 命中「${choiceLabel}」！返还 ${payout}（含本金），现金：${row.points + n}`].join('\n')
        }
        const poolFee = Math.floor(n * casinoPoolRate())
        const newPool = await feedCasinoPool(poolFee)
        await recordCasinoResult(key, 'roulette', n, -n, 'loss')
        return [
          `🎡 轮盘球落 ${ball}（${colorLabel}）`,
          `❌ ${ball === 0 ? '球落 0，庄家通吃' : `没中「${choiceLabel}」`}，输掉 ${n}，其中 ${poolFee} 计入赌场奖池（奖池 ${fmtMoney(newPool)}）`,
          `当前现金：${row.points - n}`,
        ].join('\n')
      })
    })

  ctx.command('经济/娱乐/赌场/21点 <amount:string>', '开始或查看一局21点（交互玩法）')
    .alias('黑杰克', '二十一点', 'blackjack')
    .action(async ({ session }, amount) => {
      if (!session.userId) return
      if (!config.casinoEnabled) return '赌场系统未开启。'
      const key = `${session.platform}:${session.userId}`
      return withUserLock(key, async () => {
        const active = await getBlackjackRound(key)
        if (active) {
          const player = bjDecode(active.playerCards)
          const dealer = bjDecode(active.dealerCards)
          return `你已有一局未结束的21点。\n${blackjackPrompt(player, dealer, active.bet)}`
        }
        if (!amount) return '请先下注开局，例如「21点 100」。'
        const row = await getUser(key)
        const n = parseAmount(amount, row.points)
        if (n === null) return '请输入正确的金额（正整数）。'
        if (n < config.casinoMinBet) return `单笔最低 ${config.casinoMinBet}。`
        if (n > config.casinoMaxBet) return `单局累计押注最高 ${config.casinoMaxBet}。`
        if (n > row.points) return `现金不足（当前 ${row.points}）。`
        const cooldown = await casinoCooldownLeft(key)
        if (cooldown > 0) return `🎰 荷官说歇会儿：${cooldown} 秒后再开新局。`
        const deck = bjNewDeck()
        const player = [deck.pop()!, deck.pop()!]
        const dealer = [deck.pop()!, deck.pop()!]
        await markCasinoPlay(key)
        await ctx.database.set('daily_points', { userId: key }, { points: row.points - n })
        await saveBlackjackRound(key, n, player, dealer, deck, true)
        const round = { bet: n, playerCards: bjEncode(player), dealerCards: bjEncode(dealer), deck: bjEncode(deck) }
        if (bjNatural(player) || bjNatural(dealer)) return settleBlackjackRound(key, round)
        return [`♠️ 21点开局，已扣除押注 ${n}。`, blackjackPrompt(player, dealer, n)].join('\n')
      })
    })

  ctx.command('经济/娱乐/赌场/21点/摸牌', '21点继续摸一张牌')
    .alias('摸牌', '要牌', 'hit')
    .action(async ({ session }) => {
      if (!session.userId) return
      if (!config.casinoEnabled) return '赌场系统未开启。'
      const key = `${session.platform}:${session.userId}`
      return withUserLock(key, async () => {
        const round = await getBlackjackRound(key)
        if (!round) return '你没有进行中的21点牌局，先发送「21点 金额」开局。'
        const player = bjDecode(round.playerCards)
        const dealer = bjDecode(round.dealerCards)
        const deck = bjDecode(round.deck)
        const card = deck.pop()
        if (!card) return '牌堆异常，请发送「放弃」结束本局。'
        player.push(card)
        await saveBlackjackRound(key, round.bet, player, dealer, deck)
        if (bjScore(player) >= 21) {
          const fresh = await getBlackjackRound(key)
          return settleBlackjackRound(key, fresh)
        }
        return [`你摸到 ${bjCardStr(card)}。`, blackjackPrompt(player, dealer, round.bet)].join('\n')
      })
    })

  ctx.command('经济/娱乐/赌场/21点/加注 <amount:string>', '为当前21点牌局追加押注')
    .alias('加注', 'raise')
    .action(async ({ session }, amount) => {
      if (!session.userId) return
      if (!config.casinoEnabled) return '赌场系统未开启。'
      const key = `${session.platform}:${session.userId}`
      return withUserLock(key, async () => {
        const round = await getBlackjackRound(key)
        if (!round) return '你没有进行中的21点牌局，先发送「21点 金额」开局。'
        const row = await getUser(key)
        const room = config.casinoMaxBet - round.bet
        if (room <= 0) return `本局累计押注已达到上限 ${config.casinoMaxBet}。`
        const n = parseAmount(amount, Math.min(row.points, room))
        if (n === null || n <= 0) return '请输入正确的加注金额（正整数或「全部」）。'
        if (n > row.points) return `现金不足（当前 ${row.points}）。`
        if (n > room) return `本局累计押注最高 ${config.casinoMaxBet}，当前还能加注 ${Math.max(0, room)}。`
        await ctx.database.set('daily_points', { userId: key }, { points: row.points - n })
        const player = bjDecode(round.playerCards)
        const dealer = bjDecode(round.dealerCards)
        const deck = bjDecode(round.deck)
        await saveBlackjackRound(key, round.bet + n, player, dealer, deck)
        return [`已加注 ${n}，本局累计押注 ${round.bet + n}，现金剩余 ${row.points - n}。`, blackjackPrompt(player, dealer, round.bet + n)].join('\n')
      })
    })

  ctx.command('经济/娱乐/赌场/21点/开牌', '停止摸牌并与庄家结算')
    .alias('开牌', '展示牌', '停牌', 'stand')
    .action(async ({ session }) => {
      if (!session.userId) return
      if (!config.casinoEnabled) return '赌场系统未开启。'
      const key = `${session.platform}:${session.userId}`
      return withUserLock(key, async () => {
        const round = await getBlackjackRound(key)
        if (!round) return '你没有进行中的21点牌局。'
        return settleBlackjackRound(key, round)
      })
    })

  ctx.command('经济/娱乐/赌场/21点/放弃', '放弃当前牌局并返还一半押注')
    .alias('放弃', '认输', 'surrender')
    .action(async ({ session }) => {
      if (!session.userId) return
      if (!config.casinoEnabled) return '赌场系统未开启。'
      const key = `${session.platform}:${session.userId}`
      return withUserLock(key, async () => {
        const round = await getBlackjackRound(key)
        if (!round) return '你没有进行中的21点牌局。'
        return settleBlackjackRound(key, round, 'surrender')
      })
    })

  // ── 娱乐：彩票 ─────────────────────────────────────
  ctx.command('经济/娱乐/彩票 [count:number]', '买彩票：每注 ' + 10 + ' 积分，头奖独得奖池')
    .alias('lottery', '买彩票', 'caipiao')
    .action(async ({ session }, count) => {
      if (!session.userId) return
      if (!config.lotteryEnabled) return '彩票系统未开启。'
      const key = `${session.platform}:${session.userId}`
      await drawLotteryIfDue()
      const cur = await ensureLotteryPeriod()
      const want = Math.max(1, Math.floor(count || 1))
      if (want > config.lotteryMaxTicketsPerUser) return `单期最多买 ${config.lotteryMaxTicketsPerUser} 注。`
      const cost = want * config.lotteryPrice
      const row = await getUser(key)
      if (cost > row.points) return `现金不足：本想买 ${want} 注共 ${cost} 积分，当前现金 ${row.points}。`
      await ctx.database.set('daily_points', { userId: key }, { points: row.points - cost })
      const digits = Math.floor(config.lotteryDigits)
      const tickets: { period: number, userId: string, number: string, createdAt: Date }[] = []
      const numbers: string[] = []
      for (let i = 0; i < want; i++) {
        let num = ''
        for (let d = 0; d < digits; d++) num += Math.floor(Math.random() * 10)
        tickets.push({ period: cur.period, userId: key, number: num, createdAt: new Date() })
        numbers.push(num)
      }
      await ctx.database.upsert('daily_lottery_tickets', tickets)
      await ctx.database.set('daily_lottery_periods', { id: cur.id }, { ticketCount: cur.ticketCount + want })
      const lastDraw = await ctx.database.get('daily_lottery_periods', { status: 'drawn' }, { sort: { period: 'desc' }, limit: 1 })
      const lines = [
        `🎰 第 ${cur.period} 期：你买了 ${want} 注，扣 ${cost} 积分`,
        `你的号码：${numbers.join(' / ')}`,
        `当前奖池（含本期累计）：${cur.ticketCount * config.lotteryPrice + (cur.carriedOver || 0)}`,
        `每 ${config.lotteryIntervalHours} 小时开奖一次，到期自动开奖，全中拿走全部奖池`,
      ]
      if (lastDraw.length) {
        lines.push(`📜 上期（第 ${lastDraw[0].period} 期）开奖：${lastDraw[0].winningNumber}｜${lastDraw[0].winnerId ? '🎉 已开走' : '无人全中，奖池已滚入新期'}`)
      }
      lines.push(`当前现金：${row.points - cost}`)
      return lines.join('\n')
    })

  // ── 娱乐：刮刮乐 ────────────────────────────────────
  ctx.command('经济/娱乐/刮刮乐 [count:number]', '刮刮乐：即买即开，每张 ' + 10 + ' 积分')
    .alias('刮奖', 'ggl', 'scratch')
    .action(async ({ session }, count) => {
      if (!session.userId) return
      if (!config.scratchEnabled) return '刮刮乐未开启。'
      const key = `${session.platform}:${session.userId}`
      const want = Math.max(1, Math.min(Math.floor(count || 1), 10))
      const cost = want * config.scratchPrice
      const row = await getUser(key)
      if (cost > row.points) return `现金不足：本想刮 ${want} 张共 ${cost} 积分，当前现金 ${row.points}。`
      await ctx.database.set('daily_points', { userId: key }, { points: row.points - cost })
      let totalBack = 0
      const logs: { userId: string, cost: number, tier: string, prize: number, createdAt: Date }[] = []
      const lines = [`🎫 刮刮乐 ${want} 张，花费 ${cost} 积分：`]
      for (let i = 0; i < want; i++) {
        const r = rollScratchTier()
        totalBack += r.prize
        logs.push({ userId: key, cost: config.scratchPrice, tier: r.tier, prize: r.prize, createdAt: new Date() })
        lines.push(`  第 ${i + 1} 张：${tierName(r.tier)}，奖金 ${r.prize}`)
      }
      await ctx.database.upsert('daily_scratch_log', logs)
      await ctx.database.set('daily_points', { userId: key }, { points: row.points - cost + totalBack })
      const net = totalBack - cost
      lines.push(`总奖金 ${totalBack}，净${net >= 0 ? '赚' : '亏'} ${net >= 0 ? '+' : ''}${net}，当前现金：${row.points - cost + totalBack}`)
      return lines.join('\n')
    })

  // ── 娱乐：抢劫 ─────────────────────────────────────
  ctx.command('经济/娱乐/抢劫 <user:user>', '抢别人现金：成功拿 30%，失败赔 50%（失败坐牢）')
    .alias('抢', '打劫', 'rob')
    .action(async ({ session }, user) => {
      if (!session.userId) return
      if (!config.robberyEnabled) return '抢劫系统未开启。'
      if (!user) return '请 @ 你想抢的对象。'
      const [toPlatform, toId] = user.split(':')
      if (!toPlatform || !toId) return '对方信息解析失败，请在群里 @ 对方后再试。'
      const fromKey = `${session.platform}:${session.userId}`
      const toKey = `${toPlatform}:${toId}`
      if (toKey === fromKey) return '不能抢自己。'
      const jail = await inJail(fromKey)
      if (jail) return `🚔 你还在坐牢：${fmtTime(jail)} 才释放，老实点。`
      const lastRobs = await ctx.database.get('daily_robbery_log', { robberId: fromKey }, { sort: { createdAt: 'desc' } })
      const cooldownMs = config.robberyCooldownMinutes * 60000
      if (lastRobs.length) {
        const last = new Date(lastRobs[0].createdAt).getTime()
        if (Date.now() - last < cooldownMs) {
          const left = Math.ceil((last + cooldownMs - Date.now()) / 60000)
          return `🕵️ 刚动手不久，${left} 分钟后才能再抢（风头正紧）。`
        }
      }
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todays = lastRobs.filter((r) => new Date(r.createdAt).getTime() >= todayStart.getTime())
      if (todays.length >= config.robberyDailyLimit) return `⛔ 今天已经动手 ${todays.length} 次了（上限 ${config.robberyDailyLimit}），明天再来。`
      const victim = await getUser(toKey)
      if (victim.points < config.robberyMinVictimCash) return `对方现金只有 ${victim.points}，低于最低保护线 ${config.robberyMinVictimCash}，抢了也不体面。`
      const me = await getUser(fromKey)
      const success = Math.random() < config.robberySuccessRate
      if (success) {
        const take = Math.floor(victim.points * config.robberySuccessPct)
        await ctx.database.set('daily_points', { userId: toKey }, { points: victim.points - take })
        await ctx.database.set('daily_points', { userId: fromKey }, { points: me.points + take })
        await ctx.database.create('daily_robbery_log', {
          robberId: fromKey, victimId: toKey, success: 1, amount: take, createdAt: new Date(),
        })
        return [
          `💰 抢劫成功！从 ${h('at', { id: toId })} 顺走 ${take} 积分（对方现金 ${victim.points - take}，你 ${me.points + take}）`,
          `今日已抢 ${todays.length + 1}/${config.robberyDailyLimit} 次。`,
        ].join('\n')
      }
      // 失败：赔自己 50% + 坐牢
      const fine = Math.floor(me.points * config.robberyFailPct)
      if (fine > 0) {
        const victimComp = Math.floor(fine * 0.3)
        const poolFee = fine - victimComp
        await ctx.database.set('daily_points', { userId: fromKey }, { points: me.points - fine })
        if (victimComp > 0)
          await ctx.database.set('daily_points', { userId: toKey }, { points: victim.points + victimComp })
        const newPool = await feedCasinoPool(poolFee)
        await ctx.database.create('daily_robbery_log', {
          robberId: fromKey, victimId: toKey, success: 0, amount: fine, createdAt: new Date(),
        })
        const releaseTs = Date.now() + config.robberyJailMinutes * 60000
        await ctx.database.upsert('daily_jail', [{
          userId: fromKey,
          releaseAt: new Date(releaseTs),
          reason: '抢劫失败',
          createdAt: new Date(),
        }])
        return [
          `🚔 抢劫失败！被揍一顿不说，还赔了 ${fine} 积分（其中 ${victimComp} 给 ${h('at', { id: toId })} 做安慰，${poolFee} 入赌场奖池 ${fmtMoney(newPool)}）`,
          `⛓️ 进局子 ${config.robberyJailMinutes} 分钟，${fmtTime(releaseTs)} 才放出来。`,
          `当前现金：${me.points - fine}`,
        ].join('\n')
      }
      const releaseTs = Date.now() + config.robberyJailMinutes * 60000
      await ctx.database.upsert('daily_jail', [{
        userId: fromKey,
        releaseAt: new Date(releaseTs),
        reason: '抢劫失败',
        createdAt: new Date(),
      }])
      await ctx.database.create('daily_robbery_log', {
        robberId: fromKey, victimId: toKey, success: 0, amount: 0, createdAt: new Date(),
      })
      return [
        `🚔 抢劫失败！虽然你已经一贫如洗没钱赔，但该坐的牢还得坐。`,
        `⛓️ ${config.robberyJailMinutes} 分钟后出来，${fmtTime(releaseTs)} 释放。`,
      ].join('\n')
    })
}
