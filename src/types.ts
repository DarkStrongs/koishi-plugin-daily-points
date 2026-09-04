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
