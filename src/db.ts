import { Context } from 'koishi'

/** 在 ctx 上注册所有 daily_* 数据表 */
export function registerModels(ctx: Context): void {
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

  // 元数据（如股票上次刷新时间、IPO 计数、最新消息、彩票新闻、冷却时间戳）
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
}
