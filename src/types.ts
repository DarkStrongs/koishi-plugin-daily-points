/** 内部数据行的接口定义（导出，供外部扩展 / 测试使用） */

export interface UserRow {
  id: number
  userId: string
  points: number
  bank: number
  bankUpdatedAt: Date
  totalEarned: number
  streak: number
  lastDate: string
  lastClaim: Date
  lastWork: Date
  bankruptCount: number
  bankruptUntil: Date
  dividendTotal: number
  createdAt: Date
}

export interface FixedRow {
  id: number
  userId: string
  amount: number
  rate: number
  termDays: number
  startAt: Date
  dueAt: Date
}

export interface LoanRow {
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

export interface StockRow {
  code: string
  name: string
  base: number
  vol: number
  price: number
  prevPrice: number
  updatedAt: Date
  haltedUntil?: Date | null
  note?: string | null
}

export interface HistoryRow {
  id: number
  code: string
  open: number
  close: number
  high: number
  low: number
  time: Date
}

export interface HoldingRow {
  id: number
  userId: string
  code: string
  quantity: number
  cost: number
}

/** v1.11.0：每只股每日累计买卖数据（驱动市场） */
export interface VolumeRow {
  code: string
  date: string         // YYYY-MM-DD（按配置时区切日）
  buyAmount: number    // 当日累计买入积分
  sellAmount: number   // 当日累计卖出积分
  buyCount: number     // 当日买入笔数
  sellCount: number    // 当日卖出笔数
  impactBias: number   // 累计冲击偏移（±百分比，带衰减）
  lastEvent: string    // 最后一次系统事件名（追捧/踩踏），用于去重
  lastEventAt: Date
}

/** v1.11.0：板块定义（投研 + 联动） */
export interface SectorRow {
  code: string         // 主键，如 'tech' / 'consumer' / 'finance' / 'energy'
  name: string         // 板块名
  color: string        // 图表用的色值，如 '#d93026'
  icon: string         // 板块 emoji，如 '🔬'
}

/** v1.13.0：区域行情（房地产） */
export interface PropertyZoneRow {
  code: string
  name: string
  icon: string
  basePrice: number
  currentPrice: number
  trend: number
  bubbleIndex: number
  lastEvent: string
  lastEventAt: Date | null
  haltedUntil: Date | null
  policyNote: string
  updatedAt: Date
}

/** v1.13.0：用户房产 */
export interface PropertyRow {
  id: number
  userId: string
  zoneCode: string
  type: string
  quality: number
  boughtPrice: number
  boughtAt: Date
  currentValue: number
  renting: number
  lastRentAt: Date
  accumulatedRent: number
  status: string
  soldAt: Date | null
  soldPrice: number
  // ── v1.14.0：烂尾 + P2P ──
  isDerelict: number         // 0 / 1
  listedForSale: number      // 0 / 1：是否已挂牌（P2P 出售中）
  listedPrice: number        // 挂牌价
  listedAt: Date | null      // 挂牌时间
}

/** v1.13.0：区域价格历史（K线） */
export interface PropertyHistoryRow {
  id: number
  zoneCode: string
  price: number
  time: Date
  event: string
}

/** v1.13.0：政策/灾害事件 */
export interface PropertyEventRow {
  id: number
  zoneCode: string
  type: string
  severity: number
  message: string
  startedAt: Date
  expiresAt: Date | null
}

/** v1.15.0：赌石 — 类型种子（5 类原石） */
export interface StoneTypeRow {
  code: string
  name: string
  icon: string
  description: string
  basePrice: number
  affixPool: string          // JSON 数组字符串
  rarityWeights: string      // JSON 对象字符串
  /** v1.16.0：JSON 字符串，列出该类石头支持的产地 + 配置 */
  originCatalog?: string | null
  updatedAt: Date
}

/** v1.15.0：赌石 — 当前市场库存 */
export interface StoneMarketRow {
  id: number
  stoneType: string
  priceTier: number
  /** v1.16.0：产地代码 */
  origin?: string
  /** v1.16.0：5 维属性的 JSON 字符串 */
  attributes?: string
  listedAt: Date
  expiresAt: Date
}

/** v1.15.0：赌石 — 用户背包 */
export interface StoneInventoryRow {
  id: number
  userId: string
  stoneType: string
  priceTier: number
  /** v1.16.0：产地代码（从市场快照） */
  origin?: string
  /** v1.16.0：切前 5 维属性（切后保留） */
  attributes?: string
  boughtAt: Date
  cutAt: Date | null
  rarity: string | null
  /** v1.16.0：trash 子分类（sandstone / limestone / ore / cracked / blinded / fake_skin） */
  wasteSubtype?: string | null
  /** v1.16.0：切开时生成的完整评语 */
  comment?: string | null
  /** v1.16.0：综合评级（A+ / A / B+ / B / C / D） */
  grade?: string | null
  affixes: string            // JSON 数组字符串
  saleMultiplier: number     // 词条价值加和（砖头 = 0.05）
  status: 'holding' | 'cut' | 'sold' | string
  soldAt: Date | null
  soldValue: number
}

/** v1.15.0：赌石 — 词条图鉴 */
export interface StoneCodexRow {
  id: number
  userId: string
  stoneType: string
  affixCode: string
  discoveredAt: Date
}

/** 词条数据（运行时解析自 affixPool JSON） */
export interface StoneAffix {
  code: string
  name: string
  value: number              // 加成比例，如 0.50 = +50%
}

/** 稀有度枚举（runtime 值） */
export type StoneRarity = 'brick' | 'common' | 'rare' | 'epic' | 'legendary' | 'supreme'

export interface MetaRow {
  key: string
  value: string
}

export interface CasinoPoolRow {
  id: number
  amount: number
  updatedAt: Date
}

export interface LotteryPeriodRow {
  id: number
  period: number
  winningNumber: string
  status: 'open' | 'drawn' | string
  openedAt: Date
  drawnAt: Date
  winnerId: string | null
  ticketCount: number
  carriedOver: number
}

export interface LotteryTicketRow {
  id: number
  period: number
  userId: string
  number: string
  createdAt: Date
}

export interface ScratchLogRow {
  id: number
  userId: string
  cost: number
  tier: string
  prize: number
  createdAt: Date
}

export interface RobberyLogRow {
  id: number
  robberId: string
  victimId: string
  success: number
  amount: number
  createdAt: Date
}

export interface JailRow {
  userId: string
  releaseAt: Date
  reason: string
  createdAt: Date
}

/** 签到明细（v1.8.0 新增） */
export interface SigninLogRow {
  id: number
  userId: string
  date: string          // YYYY-MM-DD（按配置时区切日）
  points: number        // 那天领到的积分
  source: string        // normal | makeup | bonus
  createdAt: Date
}

/** 用户道具（v1.8.0 新增：通用库存表，首个用途 = 补签卡） */
export interface PropsRow {
  id: number
  userId: string
  type: string          // streak_makeup_card | ...
  quantity: number
  issuedAt: Date
  meta: string | null
}

/** 月度签到奖池（v1.8.0 新增） */
export interface MonthlyPoolRow {
  monthKey: string      // YYYY-MM 主键
  totalPool: number     // 当前奖池余额
  distributedAt: Date | null  // null = 未发放
  shareCount: number    // 实际瓜分人数（发放后写回）
}

/** 还款明细 */
export interface RepayDetail {
  id: number
  type: string
  pay: number
  cleared: boolean
}
