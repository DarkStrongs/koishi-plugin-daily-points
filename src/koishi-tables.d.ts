/** 扩展 Koishi 的 Tables 类型，使 ctx.database.* 能识别 daily_* 表 */

declare module 'koishi' {
  interface Tables {
    daily_points: {
      id: number
      userId: string
      points: number
      bank: number
      bankUpdatedAt: Date
      totalEarned: number
      streak: number
      lastDate: string | null
      lastClaim: Date
      lastWork: Date | null
      bankruptCount: number
      bankruptUntil: Date | null
      dividendTotal: number
      createdAt: Date
    }
    daily_fixed: {
      id: number
      userId: string
      amount: number
      rate: number
      termDays: number
      startAt: Date
      dueAt: Date
    }
    daily_loans: {
      id: number
      userId: string
      type: string
      principal: number
      rate: number
      remaining: number
      termDays: number
      startAt: Date
      dueAt: Date
      updatedAt: Date
      status: string
    }
    daily_stocks: {
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
    daily_stock_history: {
      id: number
      code: string
      open: number
      close: number
      high: number
      low: number
      time: Date
    }
    daily_stock_holding: {
      id: number
      userId: string
      code: string
      quantity: number
      cost: number
    }
    daily_meta: {
      key: string
      value: string
    }
    daily_casino_pool: {
      id: number
      amount: number
      updatedAt: Date
    }
    daily_lottery_periods: {
      id: number
      period: number
      winningNumber: string
      status: string
      openedAt: Date
      drawnAt: Date
      winnerId: string | null
      ticketCount: number
      carriedOver: number
    }
    daily_lottery_tickets: {
      id: number
      period: number
      userId: string
      number: string
      createdAt: Date
    }
    daily_scratch_log: {
      id: number
      userId: string
      cost: number
      tier: string
      prize: number
      createdAt: Date
    }
    daily_robbery_log: {
      id: number
      robberId: string
      victimId: string
      success: number
      amount: number
      createdAt: Date
    }
    daily_jail: {
      userId: string
      releaseAt: Date
      reason: string
      createdAt: Date
    }
  }

  interface Session {
    userId?: string
  }
}
