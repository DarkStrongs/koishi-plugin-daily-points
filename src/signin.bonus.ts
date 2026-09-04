import { Context } from 'koishi'
import { Config, DAY } from './config'
import { CoreUtils } from './core'
import { dateKey, randomInt, userKey } from './util'

export interface BonusDeps {
  ctx: Context
  config: Config
  core: CoreUtils
  logger: import('koishi').Logger
}

const PROP_CARD = 'streak_makeup_card'

/** 原子地增加某道具数量（无 transaction，但同 user/type 串行足够） */
async function grantProp(ctx: Context, userId: string, type: string, qty: number, current?: number): Promise<number> {
  const existing = (await ctx.database.get('daily_props', { userId, type }))[0]
  if (existing) {
    const next = (existing.quantity || 0) + qty
    await ctx.database.set('daily_props', { id: existing.id }, { quantity: next, issuedAt: existing.issuedAt })
    return next
  } else {
    const initial = (typeof current === 'number' ? current : qty)
    await ctx.database.create('daily_props', { userId, type, quantity: initial, issuedAt: new Date(), meta: null })
    return initial
  }
}

/** 用户当前道具数量（默认查询补签卡） */
export async function getPropCount(ctx: Context, userId: string, type = PROP_CARD): Promise<number> {
  const rows = await ctx.database.get('daily_props', { userId, type })
  return rows[0]?.quantity ?? 0
}

/** 抽水/注入月度奖池（同月则累加，跨月则新建并自动注入基础池） */
async function addToMonthlyPool(ctx: Context, config: Config, amount: number, today: string): Promise<void> {
  if (!config.monthlyPoolEnabled || amount <= 0) return
  const monthKey = today.slice(0, 7)
  const existing = (await ctx.database.get('daily_signin_pool', { monthKey }))[0]
  if (existing) {
    await ctx.database.set('daily_signin_pool', { monthKey }, {
      totalPool: (existing.totalPool || 0) + amount,
    })
  } else {
    await ctx.database.create('daily_signin_pool', {
      monthKey,
      totalPool: (config.monthlyPoolBase || 0) + amount,
      distributedAt: null,
      shareCount: 0,
    })
  }
}

/** 单月奖池发放：找出当月连续签到 ≥ 阈值的玩家平分 */
async function distributeMonth(
  { ctx, config, core }: { ctx: Context; config: Config; core: CoreUtils },
  monthKey: string,
): Promise<{ paid: number; recipients: number }> {
  const rows = await ctx.database.get('daily_signin_pool', { monthKey })
  const pool = rows[0]
  if (!pool) return { paid: 0, recipients: 0 }
  if (pool.distributedAt) return { paid: 0, recipients: 0 }
  if (!pool.totalPool || pool.totalPool <= 0) {
    await ctx.database.set('daily_signin_pool', { monthKey }, { distributedAt: new Date(), shareCount: 0 })
    return { paid: 0, recipients: 0 }
  }

  // 拉取本月的所有 normal 签到日志
  const allLogs: any[] = await ctx.database.get('daily_signin_log', {})
  const perUserDates = new Map<string, string[]>()
  for (const log of allLogs) {
    if (!log.date || !log.date.startsWith(monthKey)) continue
    if (log.source !== 'normal') continue
    if (!perUserDates.has(log.userId)) perUserDates.set(log.userId, [])
    perUserDates.get(log.userId)!.push(log.date)
  }

  // 计算每用户在本月内的最长连续签到天数
  const qualifiers: string[] = []
  for (const [userId, dates] of perUserDates) {
    const sorted = [...new Set(dates)].sort()
    if (!sorted.length) continue
    let maxRun = 1
    let currentRun = 1
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1]).getTime()
      const cur = new Date(sorted[i]).getTime()
      const diff = Math.round((cur - prev) / DAY)
      if (diff === 1) currentRun++
      else currentRun = 1
      maxRun = Math.max(maxRun, currentRun)
    }
    if (maxRun >= config.monthlyStreakThreshold) qualifiers.push(userId)
  }

  if (qualifiers.length === 0) {
    await ctx.database.set('daily_signin_pool', { monthKey }, {
      distributedAt: new Date(), shareCount: 0,
    })
    return { paid: 0, recipients: 0 }
  }

  const share = Math.floor(pool.totalPool / qualifiers.length)
  if (share <= 0) {
    await ctx.database.set('daily_signin_pool', { monthKey }, {
      distributedAt: new Date(), shareCount: 0,
    })
    return { paid: 0, recipients: 0 }
  }

  await core.dbTx(async (db) => {
    for (const userId of qualifiers) {
      const userRows = await db.get('daily_points', { userId })
      const u = userRows[0]
      if (!u) continue
      await db.set('daily_points', { userId }, {
        points: u.points + share,
        totalEarned: u.totalEarned + share,
      })
    }
    await db.set('daily_signin_pool', { monthKey }, {
      totalPool: 0,
      distributedAt: new Date(),
      shareCount: qualifiers.length,
    })
  })

  await core.broadcast(
    `💰 ${monthKey} 月度签到奖池已发放！${qualifiers.length} 名玩家（当月连续签到 ≥ ${config.monthlyStreakThreshold} 天）各分得 ${share} 积分。`,
  )
  return { paid: share, recipients: qualifiers.length }
}

let _scheduled = false
let _inFlight = false

export function registerBonus({ ctx, config, core, logger }: BonusDeps): {
  onSigninSuccess: (userId: string, streak: number, pointsAwarded: number) => Promise<{ grantedCard: boolean; poolTax: number }>
  scheduleMonthlyDistribution: () => void
  /** 查询道具数量（供 signin 查询命令复用） */
  getCardCount: (userId: string) => Promise<number>
} {

  /** 签到成功后调用：写 log + 抽水入池 + 可能发补签卡 */
  const onSigninSuccess = async (
    userId: string, streak: number, pointsAwarded: number,
  ): Promise<{ grantedCard: boolean; poolTax: number }> => {
    const today = dateKey(config.timezoneOffset)
    await ctx.database.create('daily_signin_log', {
      userId, date: today, points: pointsAwarded, source: 'normal', createdAt: new Date(),
    })

    let poolTax = 0
    if (config.monthlyPoolEnabled && config.monthlyPoolTaxRate > 0) {
      poolTax = Math.max(0, Math.floor(pointsAwarded * config.monthlyPoolTaxRate))
      if (poolTax > 0) await addToMonthlyPool(ctx, config, poolTax, today)
    }

    let grantedCard = false
    if (streak > 0 && streak % config.makeupCardStreakDays === 0) {
      await grantProp(ctx, userId, PROP_CARD, 1)
      grantedCard = true
      // 私聊通知本人（不广播，避免打扰其他人）
      try {
        await ctx.broadcast([userId], `🎁 连续签到 ${streak} 天达成，赠送 1 张「补签卡」！发送「补签」可补回过去 ${config.makeupWindowDays} 天内的漏签日期。`)
      } catch {
        // 私聊可能不可达，忽略
      }
    }

    return { grantedCard, poolTax }
  }

  /** 补签命令 */
  ctx.command('经济/积分/补签 [date:string]', '补一张未签到的日期（消耗 1 张补签卡，连胜保留）')
    .alias('补卡', '签到补签', 'buqian')
    .action(async ({ session }, dateStr?: string) => {
      if (!session.userId) return
      const key = userKey(session)
      const today = dateKey(config.timezoneOffset)

      let target: string
      const t = (dateStr || '').trim()
      if (!t) {
        target = dateKey(config.timezoneOffset, 1) // 默认 = 昨天
      } else if (t === '昨天') {
        target = dateKey(config.timezoneOffset, 1)
      } else if (t === '前天') {
        target = dateKey(config.timezoneOffset, 2)
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
        target = t
      } else {
        return '日期格式不正确，请输入 YYYY-MM-DD（如 2026-09-03）、「昨天」或留空。'
      }

      if (target >= today) {
        return '不能补今天或未来日期（发送「签到」正常领今天的积分）。'
      }

      const diffDays = Math.round((new Date(today).getTime() - new Date(target).getTime()) / DAY)
      if (diffDays > config.makeupWindowDays) {
        return `${target} 超出可补范围（只能补过去 ${config.makeupWindowDays} 天内的漏签）。`
      }

      const existing = await ctx.database.get('daily_signin_log', { userId: key, date: target })
      if (existing.length) return `${target} 已经签过到了，无需补签。`

      return await core.dbTx(async (db) => {
        const cards = await db.get('daily_props', { userId: key, type: PROP_CARD })
        const card = cards[0]
        if (!card || card.quantity < 1) {
          return '你的补签卡不足（当前 0 张），继续签到攒卡吧。'
        }
        const cardRemain = card.quantity - 1
        await db.set('daily_props', { id: card.id }, { quantity: cardRemain, issuedAt: card.issuedAt })

        const userRows = await db.get('daily_points', { userId: key })
        const u = userRows[0]
        if (!u) return '你的账户不存在，无法补签。'

        const bonus = randomInt(config.minBonus, config.maxBonus)
        const streakGain = Math.min(
          config.streakBonusPerDay * Math.max(0, (u.streak || 1) - 1),
          config.maxStreakBonus,
        )
        let gain = config.basePoints + bonus + streakGain
        const blackUntil = u.bankruptUntil ? new Date(u.bankruptUntil).getTime() : 0
        if (Date.now() < blackUntil) gain = Math.floor(gain / 2)
        gain = Math.max(1, Math.floor(gain * config.makeupPayoutRate))

        await db.create('daily_signin_log', {
          userId: key, date: target, points: gain, source: 'makeup', createdAt: new Date(),
        })
        await db.set('daily_points', { userId: key }, {
          points: u.points + gain,
          totalEarned: u.totalEarned + gain,
        })

        return [
          `✅ 补签 ${target} 成功！`,
          `获得 ${gain} 积分（按当前签到应得的 ${(config.makeupPayoutRate * 100).toFixed(0)}% 计）`,
          `剩余补签卡：${cardRemain} 张`,
          `当前现金：${u.points + gain} · 连续签到仍为 ${u.streak} 天（补签不打断连胜）`,
        ].join('\n')
      })
    })

  /** 启动月度奖池定时发放（inFlight 防重入） */
  function scheduleMonthlyDistribution() {
    if (_scheduled) return
    _scheduled = true
    ctx.setInterval(async () => {
      if (_inFlight) return
      _inFlight = true
      try {
        const all = await ctx.database.get('daily_signin_pool', {})
        const now = new Date()
        const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
        for (const row of all) {
          if (row.distributedAt) continue
          if (row.monthKey >= currentMonth) continue
          const r = await distributeMonth({ ctx, config, core }, row.monthKey)
          if (r.recipients > 0) {
            logger.info(`${row.monthKey} 月度奖池发放 ${r.recipients} 人各 ${r.paid} 积分`)
          }
        }
      } catch (e: any) {
        logger.warn('月度奖池发放失败：', e?.message || e)
      } finally {
        _inFlight = false
      }
    }, 30 * 60 * 1000) // 每 30 分钟扫一次，与 lottery 对齐
  }

  const getCardCount = (userId: string) => getPropCount(ctx, userId, PROP_CARD)

  return { onSigninSuccess, scheduleMonthlyDistribution, getCardCount }
}
