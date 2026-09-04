import { Context, h } from 'koishi'
import { Config, HOUR, DAY } from './config'
import { CoreUtils } from './core'
import { fmtTime, userKey } from './util'

export interface RobberyDeps {
  ctx: Context
  config: Config
  core: CoreUtils
  casino: { feedCasinoPool(delta: number): Promise<number> }
}

/**
 * 抢劫 + 坐牢系统（v1.10.0 起支持削弱模式）
 *
 * 削弱模式（`robberyNerfMode = true`，默认开启）下：
 *   - 数值上界/下界自动收紧（成功率 0.3 / 抢得 15% / 失败赔 60% / 冷却 60min / 日限 3 次）
 *   - 4 档机制保护：
 *       A 被抢冷却 N 小时：被同一人抢过，对方再来被拦下
 *       B 复仇窗口 N 分钟：被抢 N 分钟内抢回对方，成功率 × boost
 *       C 连败加刑：连续失败 N 次后，本轮刑期 × multiplier
 *       D 被抢方广播通知：成功后自动向全平台广播「被抢」消息（含 at 提及）
 */
export function registerRobbery({ ctx, config, core, casino }: RobberyDeps): void {
  ctx.command('经济/娱乐/抢劫 <user:user>', '抢别人现金：成功拿 30%，失败赔 50%（失败坐牢）')
    .alias('抢', '打劫', 'rob')
    .action(async ({ session }, user) => {
      if (!session.userId) return
      if (!config.robberyEnabled) return '抢劫系统未开启。'
      if (!user) return '请 @ 你想抢的对象。'
      const [toPlatform, toId] = user.split(':')
      if (!toPlatform || !toId) return '对方信息解析失败，请在群里 @ 对方后再试。'
      const fromKey = userKey(session)
      const fromId = fromKey.split(':').slice(1).join(':') || session.userId
      const toKey = `${toPlatform}:${toId}`
      if (toKey === fromKey) return '不能抢自己。'

      // ===== 削弱模式：effective 值（数值边界收紧） =====
      const N = config.robberyNerfMode
      const effSuccessRate = N ? Math.min(config.robberySuccessRate, 0.30) : config.robberySuccessRate
      const effSuccessPct = N ? Math.min(config.robberySuccessPct, 0.15) : config.robberySuccessPct
      const effFailPct = N ? Math.max(config.robberyFailPct, 0.60) : config.robberyFailPct
      const effCooldownMin = N ? Math.max(config.robberyCooldownMinutes, 60) : config.robberyCooldownMinutes
      const effDailyLimit = N ? Math.min(config.robberyDailyLimit, 3) : config.robberyDailyLimit
      const effMinVictimCash = N ? Math.max(config.robberyMinVictimCash, 200) : config.robberyMinVictimCash

      // ===== 0. 坐牢检查 =====
      const jail = await core.inJail(fromKey)
      if (jail) return `🚔 你还在坐牢：${fmtTime(jail)} 才释放，老实点。`

      // ===== 1. 削弱模式：被抢冷却（对方抢过我 → 拦下对方再来） =====
      if (N) {
        const prevOnMe = await ctx.database.get('daily_robbery_log', {
          robberId: toKey, victimId: fromKey, success: 1,
        })
        const recent = prevOnMe.find((r) =>
          Date.now() - new Date(r.createdAt).getTime() < config.robberyVictimCooldownHours * HOUR,
        )
        if (recent) {
          const left = Math.ceil(
            (config.robberyVictimCooldownHours * HOUR - (Date.now() - new Date(recent.createdAt).getTime())) / 60000,
          )
          return `🛡️ 你刚被 ${h('at', { id: toId })} 抢过，${left} 分钟内对方不能再动你（被抢保护 ${config.robberyVictimCooldownHours}h）。`
        }
      }

      // ===== 2. 全局冷却 =====
      const lastRobs = await ctx.database.get('daily_robbery_log', { robberId: fromKey }, { sort: { createdAt: 'desc' } })
      const cooldownMs = effCooldownMin * 60000
      if (lastRobs.length) {
        const last = new Date(lastRobs[0].createdAt).getTime()
        if (Date.now() - last < cooldownMs) {
          const left = Math.ceil((last + cooldownMs - Date.now()) / 60000)
          return N
            ? `🕵️ 刚动手不久，${left} 分钟后才能再抢（削弱模式下冷却已加长至 ${effCooldownMin} 分钟）。`
            : `🕵️ 刚动手不久，${left} 分钟后才能再抢（风头正紧）。`
        }
      }

      // ===== 3. 今日上限 =====
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todays = lastRobs.filter((r) => new Date(r.createdAt).getTime() >= todayStart.getTime())
      if (todays.length >= effDailyLimit) {
        return N
          ? `⛔ 今天已经动手 ${todays.length} 次了（削弱模式下日限收紧到 ${effDailyLimit}），明天再来。`
          : `⛔ 今天已经动手 ${todays.length} 次了（上限 ${effDailyLimit}），明天再来。`
      }

      // ===== 4. 目标保护线 =====
      const victim = await core.getUser(toKey)
      if (victim.points < effMinVictimCash) {
        return `对方现金只有 ${victim.points}，低于最低保护线 ${effMinVictimCash}，抢了也不体面${N ? '（削弱模式下保护线已上调）' : ''}。`
      }

      // ===== 5. 削弱模式：复仇加成（对方抢过我 → 这次成功率 × boost） =====
      let finalRate = effSuccessRate
      let revengeTag = ''
      if (N) {
        const prevOnMe = await ctx.database.get('daily_robbery_log', {
          robberId: toKey, victimId: fromKey, success: 1,
        })
        const revenge = prevOnMe.find((r) =>
          Date.now() - new Date(r.createdAt).getTime() < config.robberyRevengeWindowMinutes * 60000,
        )
        if (revenge) {
          finalRate = Math.min(1, effSuccessRate * config.robberyRevengeBoost)
          revengeTag = `🔥 [复仇窗口] ${config.robberyRevengeWindowMinutes}min 内抢回对方，成功率 ${(effSuccessRate * 100).toFixed(0)}% → ${(finalRate * 100).toFixed(0)}%！\n`
        }
      }
      const me = await core.getUser(fromKey)
      const success = Math.random() < finalRate

      // ===== 6. 成功路径 =====
      if (success) {
        const take = Math.floor(victim.points * effSuccessPct)
        const newVictimPoints = victim.points - take
        const newMePoints = me.points + take
        const result = await core.dbTx(async (db) => {
          const dbAny: any = db
          await dbAny.set('daily_points', { userId: toKey }, { points: newVictimPoints })
          await dbAny.set('daily_points', { userId: fromKey }, { points: newMePoints })
          await dbAny.create('daily_robbery_log', {
            robberId: fromKey, victimId: toKey, success: 1, amount: take, createdAt: new Date(),
          })
          return [
            `${revengeTag}💰 抢劫成功！从 ${h('at', { id: toId })} 顺走 ${take} 积分（对方现金 ${newVictimPoints}，你 ${newMePoints}）`,
            `今日已抢 ${todays.length + 1}/${effDailyLimit} 次。`,
          ].join('\n')
        })
        // ===== 7. 削弱模式：被抢方广播通知 =====
        if (N) {
          const notify = `🕵️ [被抢通知] ${h('at', { id: toId })} 你被 ${h('at', { id: fromId })} 抢了 ${take} 积分（剩余 ${newVictimPoints}）。${config.robberyRevengeWindowMinutes} 分钟内发「抢劫 @对方」可触发复仇加成（×${config.robberyRevengeBoost}）。`
          ctx.broadcast([notify]).catch(() => { /* 广播失败不影响主流程 */ })
        }
        return result
      }

      // ===== 8. 削弱模式：连败加刑 =====
      let failMultiplier = 1
      if (N) {
        const myFails = await ctx.database.get('daily_robbery_log', { robberId: fromKey, success: 0 })
        const recentFails = myFails.filter((r) =>
          Date.now() - new Date(r.createdAt).getTime() < DAY,
        )
        if (recentFails.length >= config.robberyStreakLossThreshold) {
          failMultiplier = config.robberyStreakLossMultiplier
        }
      }
      const jailMinutes = Math.round(config.robberyJailMinutes * failMultiplier)
      const jailTag = failMultiplier > 1 ? `⚠️ [连败加刑] 24h 内已失败 ≥${config.robberyStreakLossThreshold} 次，刑期 ×${failMultiplier}！\n` : ''

      // ===== 9. 失败路径：有赔款 =====
      const fine = Math.floor(me.points * effFailPct)
      const releaseTs = Date.now() + jailMinutes * 60000
      if (fine > 0) {
        const victimComp = Math.floor(fine * 0.3)
        const poolFee = fine - victimComp
        const newMePoints = me.points - fine
        const newVictimPoints = victim.points + victimComp
        return await core.dbTx(async (db) => {
          const dbAny: any = db
          await dbAny.set('daily_points', { userId: fromKey }, { points: newMePoints })
          if (victimComp > 0) {
            await dbAny.set('daily_points', { userId: toKey }, { points: newVictimPoints })
          }
          await dbAny.create('daily_robbery_log', {
            robberId: fromKey, victimId: toKey, success: 0, amount: fine, createdAt: new Date(),
          })
          await dbAny.upsert('daily_jail', [{
            userId: fromKey,
            releaseAt: new Date(releaseTs),
            reason: '抢劫失败',
            createdAt: new Date(),
          }])
          const newPool = await casino.feedCasinoPool(poolFee)
          return [
            `${jailTag}🚔 抢劫失败！被揍一顿不说，还赔了 ${fine} 积分（其中 ${victimComp} 给 ${h('at', { id: toId })} 做安慰，${poolFee} 入赌场奖池 ${(Math.round(newPool * 100) / 100).toString()}）`,
            `⛓️ 进局子 ${jailMinutes} 分钟，${fmtTime(releaseTs)} 才放出来。`,
            `当前现金：${newMePoints}`,
          ].join('\n')
        })
      }

      // ===== 10. 失败路径：贫民版（无赔款但仍坐牢） =====
      const releaseTs2 = Date.now() + jailMinutes * 60000
      return await core.dbTx(async (db) => {
        const dbAny: any = db
        await dbAny.upsert('daily_jail', [{
          userId: fromKey,
          releaseAt: new Date(releaseTs2),
          reason: '抢劫失败',
          createdAt: new Date(),
        }])
        await dbAny.create('daily_robbery_log', {
          robberId: fromKey, victimId: toKey, success: 0, amount: 0, createdAt: new Date(),
        })
        return [
          `${jailTag}🚔 抢劫失败！虽然你已经一贫如洗没钱赔，但该坐的牢还得坐。`,
          `⛓️ ${jailMinutes} 分钟后出来，${fmtTime(releaseTs2)} 释放。`,
        ].join('\n')
      })
    })
}
