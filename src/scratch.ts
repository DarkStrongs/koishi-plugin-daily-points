import { Context } from 'koishi'
import { Config } from './config'
import { CoreUtils } from './core'
import { userKey } from './util'

export interface ScratchDeps {
  ctx: Context
  config: Config
  core: CoreUtils
}

/** 刮刮乐：即买即开 */
export function registerScratch({ ctx, config, core }: ScratchDeps): void {
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

  ctx.command('经济/娱乐/刮刮乐 [count:number]', '刮刮乐：即买即开，每张 ' + 10 + ' 积分')
    .alias('刮奖', 'ggl', 'scratch')
    .action(async ({ session }, count) => {
      if (!session.userId) return
      if (!config.scratchEnabled) return '刮刮乐未开启。'
      const key = userKey(session)
      const want = Math.max(1, Math.min(Math.floor(count || 1), 10))
      const cost = want * config.scratchPrice
      const row = await core.getUser(key)
      if (cost > row.points) return `现金不足：本想刮 ${want} 张共 ${cost} 积分，当前现金 ${row.points}。`
      // 先生成所有结果（先 roll 再统一入账，事务化）
      const tickets: { tier: string, prize: number }[] = []
      const lines = [`🎫 刮刮乐 ${want} 张，花费 ${cost} 积分：`]
      for (let i = 0; i < want; i++) {
        const r = rollScratchTier()
        tickets.push(r)
        lines.push(`  第 ${i + 1} 张：${tierName(r.tier)}，奖金 ${r.prize}`)
      }
      const totalBack = tickets.reduce((s, t) => s + t.prize, 0)
      const net = totalBack - cost
      const finalPoints = row.points - cost + totalBack
      // 事务：扣现金 + 加奖金 + 写日志 原子化
      return await core.dbTx(async (db) => {
        const dbAny: any = db
        await dbAny.set('daily_points', { userId: key }, { points: finalPoints })
        const logs = tickets.map((t) => ({
          userId: key,
          cost: config.scratchPrice,
          tier: t.tier,
          prize: t.prize,
          createdAt: new Date(),
        }))
        await dbAny.upsert('daily_scratch_log', logs)
        lines.push(`总奖金 ${totalBack}，净${net >= 0 ? '赚' : '亏'} ${net >= 0 ? '+' : ''}${net}，当前现金：${finalPoints}`)
        return lines.join('\n')
      })
    })
}
