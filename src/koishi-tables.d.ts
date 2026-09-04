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
      sector?: string | null
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
      casinoContribution: number
      basePool: number
      ticketRevenue: number
      poolTotal: number
      payoutTotal: number
      winningTier: string
    }
    daily_lottery_tickets: {
      id: number
      period: number
      userId: string
      number: string
      createdAt: Date
    }
    daily_lottery_winners: {
      id: number
      period: number
      userId: string
      number: string
      tier: string
      matchedCount: number
      prize: number
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
    daily_signin_log: {
      id: number
      userId: string
      date: string
      points: number
      source: string
      createdAt: Date
    }
    daily_props: {
      id: number
      userId: string
      type: string
      quantity: number
      issuedAt: Date
      meta: string | null
    }
    daily_signin_pool: {
      monthKey: string
      totalPool: number
      distributedAt: Date | null
      shareCount: number
    }
    daily_stock_sectors: {
      code: string
      name: string
      color: string
      icon: string
    }
    daily_stock_volume: {
      code: string
      date: string
      buyAmount: number
      sellAmount: number
      buyCount: number
      sellCount: number
      impactBias: number
      lastEvent: string
      lastEventAt: Date
    }
    daily_property_zones: {
      code: string
      name: string
      icon: string
      basePrice: number
      currentPrice: number
      trend: number
      bubbleIndex: number
      lastEvent: string
      lastEventAt: Date
      haltedUntil: Date | null
      policyNote: string
      updatedAt: Date
    }
    daily_properties: {
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
      // v1.14.0
      isDerelict: number
      listedForSale: number
      listedPrice: number
      listedAt: Date | null
    }
    daily_property_history: {
      id: number
      zoneCode: string
      price: number
      time: Date
      event: string
    }
    daily_property_events: {
      id: number
      zoneCode: string
      type: string
      severity: number
      message: string
      startedAt: Date
      expiresAt: Date | null
    }
    daily_stone_types: {
      code: string
      name: string
      icon: string
      description: string
      basePrice: number
      affixPool: string
      rarityWeights: string
      updatedAt: Date
    }
    daily_stone_market: {
      id: number
      stoneType: string
      priceTier: number
      listedAt: Date
      expiresAt: Date
    }
    daily_stone_inventory: {
      id: number
      userId: string
      stoneType: string
      priceTier: number
      boughtAt: Date
      cutAt: Date | null
      rarity: string | null
      affixes: string
      saleMultiplier: number
      status: string
      soldAt: Date | null
      soldValue: number
    }
    daily_stone_codex: {
      id: number
      userId: string
      stoneType: string
      affixCode: string
      discoveredAt: Date
    }
  }

  interface Session {
    userId?: string
  }
}
