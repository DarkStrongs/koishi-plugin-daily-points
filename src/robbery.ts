import { Context, h } from 'koishi'
import { Config } from './config'
import { CoreUtils } from './core'
import { fmtTime, userKey } from './util'

export interface RobberyDeps {
  ctx: Context
  config: Config
  core: CoreUtils
  casino: { feedCasinoPool(delta: number): Promise<number> }
}

/** 抢劫 + 坐牢系统 */
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
      const toKey = `${toPlatform}:${toId}`
      if (toKey === fromKey) return '不能抢自己。'
      const jail = await core.inJail(fromKey)
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
      if (todays.length >= config.robberyDailyLimit) {
        return `⛔ 今天已经动手 ${todays.length} 次了（上限 ${config.robberyDailyLimit}），明天再来。`
      }
      const victim = await core.getUser(toKey)
      if (victim.points < config.robberyMinVictimCash) {
        return `对方现金只有 ${victim.points}，低于最低保护线 ${config.robberyMinVictimCash}，抢了也不体面。`
      }
      const me = await core.getUser(fromKey)
      const success = Math.random() < config.robberySuccessRate
      if (success) {
        const take = Math.floor(victim.points * config.robberySuccessPct)
        const newVictimPoints = victim.points - take
        const newMePoints = me.points + take
        // 事务：双方积分 + 抢劫日志 原子化
        return await core.dbTx(async (db) => {
          const dbAny: any = db
          await dbAny.set('daily_points', { userId: toKey }, { points: newVictimPoints })
          await dbAny.set('daily_points', { userId: fromKey }, { points: newMePoints })
          await dbAny.create('daily_robbery_log', {
            robberId: fromKey, victimId: toKey, success: 1, amount: take, createdAt: new Date(),
          })
          return [
            `💰 抢劫成功！从 ${h('at', { id: toId })} 顺走 ${take} 积分（对方现金 ${newVictimPoints}，你 ${newMePoints}）`,
            `今日已抢 ${todays.length + 1}/${config.robberyDailyLimit} 次。`,
          ].join('\n')
        })
      }
      // 失败：赔自己 50% + 坐牢
      const fine = Math.floor(me.points * config.robberyFailPct)
      const releaseTs = Date.now() + config.robberyJailMinutes * 60000
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
            `🚔 抢劫失败！被揍一顿不说，还赔了 ${fine} 积分（其中 ${victimComp} 给 ${h('at', { id: toId })} 做安慰，${poolFee} 入赌场奖池 ${(Math.round(newPool * 100) / 100).toString()}）`,
            `⛓️ 进局子 ${config.robberyJailMinutes} 分钟，${fmtTime(releaseTs)} 才放出来。`,
            `当前现金：${newMePoints}`,
          ].join('\n')
        })
      }
      const releaseTs2 = Date.now() + config.robberyJailMinutes * 60000
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
          `🚔 抢劫失败！虽然你已经一贫如洗没钱赔，但该坐的牢还得坐。`,
          `⛓️ ${config.robberyJailMinutes} 分钟后出来，${fmtTime(releaseTs2)} 释放。`,
        ].join('\n')
      })
    })
}
