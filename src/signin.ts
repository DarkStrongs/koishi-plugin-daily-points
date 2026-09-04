import { Context, h } from 'koishi'
import { Config } from './config'
import { CoreUtils } from './core'
import { dateKey, fmtTime, parseAmount, randomInt, userKey } from './util'

export interface SigninDeps {
  ctx: Context
  config: Config
  core: CoreUtils
  /** 签到成功后触发的副作用钩子（由 signin.bonus 提供） */
  onSigninSuccess?: (userId: string, streak: number, pointsAwarded: number) => Promise<{ grantedCard: boolean; poolTax: number }>
  /** 查用户当前补签卡数量 */
  getCardCount?: (userId: string) => Promise<number>
}

/** 注册签到 / 查询 / 排行 / 转移 / 修改 五个命令 */
export function registerSignin({ ctx, config, core, onSigninSuccess, getCardCount }: SigninDeps): void {
  ctx.command('经济/积分/签到', '每日签到领取积分')
    .alias('qd', '积分签到', '领取积分', 'daily-points')
    .action(async ({ session }) => {
      if (!session.userId) return
      const key = userKey(session)
      const today = dateKey(config.timezoneOffset)
      const yesterday = dateKey(config.timezoneOffset, 1)
      const row = await core.getUser(key)
      if (row.lastDate === today) {
        return `今天已经签到过啦，明天再来吧～\n当前现金：${row.points}`
      }
      const streak = row.lastDate === yesterday ? row.streak + 1 : 1
      const bonus = randomInt(config.minBonus, config.maxBonus)
      const streakGain = Math.min(config.streakBonusPerDay * (streak - 1), config.maxStreakBonus)
      let gain = config.basePoints + bonus + streakGain
      const blackUntil = await core.inBankruptcy(key)
      if (blackUntil) gain = Math.floor(gain / 2)
      const points = row.points + gain
      await ctx.database.set('daily_points', { userId: key }, {
        points,
        totalEarned: row.totalEarned + gain,
        streak,
        lastDate: today,
        lastClaim: new Date(),
      })

      // v1.8.0 钩子：写明细 + 抽水入月池 + 可能发补签卡
      let grantedCard = false
      let poolTax = 0
      if (onSigninSuccess) {
        try {
          const r = await onSigninSuccess(key, streak, gain)
          grantedCard = r.grantedCard
          poolTax = r.poolTax
        } catch (e: any) {
          // 钩子失败不影响主流程（已落库的核心数值不会回滚，但本设计允许滞后补写）
          // 这里只是 toast，不做特别处理
        }
      }

      const lines = [
        `签到成功！获得 ${gain} 积分`,
        `（基础 ${config.basePoints} + 随机 ${bonus} + 连续签到 ${streakGain}）`,
        `已连续签到 ${streak} 天，当前现金：${points}`,
      ]
      if (streakGain >= config.maxStreakBonus && config.maxStreakBonus > 0) {
        lines.push(`连续签到奖励已达上限，感谢每天的陪伴！`)
      }
      if (blackUntil) {
        lines.push(`⚠️ 破产惩罚期内，签到收益减半（${fmtTime(blackUntil)} 恢复信用）。`)
      }
      if (poolTax > 0) {
        lines.push(`💰 其中 ${poolTax} 积分已自动入月度奖池（${new Date().toISOString().slice(0, 7)} 期）`)
      }
      if (grantedCard) {
        lines.push(`🎟 恭喜！连续签到 ${streak} 天达成，赠送你 1 张补签卡（发送「补签」可补回过去 ${config.makeupWindowDays} 天内漏签日期）`)
      }
      return lines.join('\n')
    })

  ctx.command('经济/积分/查询', '查询当前积分与资产')
    .alias('我的积分', '积分余额', 'chaxun')
    .action(async ({ session }) => {
      if (!session.userId) return
      const key = userKey(session)
      const row = await core.getUser(key, false)
      if (!row) return '你还没有积分哦，发送「签到」领取今天的积分吧～'
      const interest = await core.settleBank(row)
      const fixed = await ctx.database.get('daily_fixed', { userId: key })
      const fixedSum = fixed.reduce((s, f) => s + f.amount, 0)
      const stockValue = config.stockEnabled ? await core.getStockValue(key) : 0
      const lines = [`当前现金：${row.points}`]
      if (row.bank > 0) lines.push(`活期存款：${(Math.round(row.bank * 100) / 100).toString()}${interest > 0 ? `（含刚结算利息 ${interest}）` : ''}`)
      if (fixedSum > 0) lines.push(`定期存款：${fixedSum}（${fixed.length} 笔）`)
      if (stockValue > 0) lines.push(`股票市值：${(Math.round(stockValue * 100) / 100).toString()}`)
      if (config.loanEnabled) {
        const loans = (await ctx.database.get('daily_loans', { userId: key, status: 'active' }))
          .filter((l: any) => Date.now() >= new Date(l.dueAt).getTime())
        if (loans.length) {
          const settled = await ctx.database.get('daily_loans', { userId: key, status: 'active' })
          if (settled.length) {
            const debt = settled.reduce((s: number, l: any) => s + l.remaining, 0)
            lines.push(`⚠️ 欠款：${(Math.round(debt * 100) / 100).toString()}（发送「欠款」查看明细）`)
          }
        }
      }
      lines.push(`累计签到获得：${row.totalEarned}，连续签到：${row.streak} 天`)
      if (getCardCount) {
        const cards = await getCardCount(key)
        if (cards > 0) lines.push(`🎟 补签卡：${cards} 张（发送「日历」看本月出勤 / 「补签」补回漏签）`)
      }
      return lines.join('\n')
    })

  ctx.command('经济/积分/排行', '查看积分排行榜')
    .alias('积分排行', 'points-rank', 'paihang')
    .action(async () => {
      const rows = await ctx.database.get('daily_points', {}, {
        sort: { points: 'desc' },
        limit: Math.ceil(config.leaderboardSize),
      })
      if (!rows.length) return '还没有人签到过哦～'
      const lines = []
      let rank = 0
      for (const row of rows) {
        // 提取 QQ 号：必须为纯数字（onebot qq 字段仅接受数字 QQ）
        const rawId = row.userId.includes(':') ? row.userId.split(':').slice(-1)[0] : row.userId
        // 跳过异常 userId（空 / 含非数字 / 数字段超过 12 位也不可信）
        const safeId = typeof rawId === 'string' && /^\d{1,12}$/.test(rawId) ? rawId : null
        // 同分跳过名次上升（先占名次再渲染）
        rank += 1
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`
        if (safeId) {
          lines.push(`${medal} ${h('at', { id: safeId })}  ${row.points} 分`)
        } else {
          // 非 onebot 平台（sandbox/web）回退为文本展示，避免 onebot 拒绝整条消息
          const fallback = rawId || row.userId || '匿名'
          lines.push(`${medal} ${fallback}  ${row.points} 分`)
        }
      }
      return `积分排行榜：\n${lines.join('\n')}`
    })

  ctx.command('经济/积分/转移 <user:user> <amount:integer>', '把积分转移给别人')
    .alias('转让积分', '积分转移', 'zhuanyi')
    .action(async ({ session }, user, amount) => {
      if (!session.userId) return
      if (!user) return '请 @ 你要转移积分的对象。'
      if (!amount || amount <= 0) return '转移数量必须是正整数。'
      const fromKey = userKey(session)
      const [toPlatform, toId] = user.split(':')
      if (!toPlatform || !toId) return '对方信息解析失败，请在群里 @ 对方后再试。'
      const toKey = `${toPlatform}:${toId}`
      if (toKey === fromKey) return '不能转移给自己哦。'
      // 防跑路机制：有未结清欠款时禁止转账
      const activeLoans = await ctx.database.get('daily_loans', { userId: fromKey, status: 'active' })
      if (activeLoans.length) {
        return '你还有未结清的欠款，还清之前不能转移积分（防止借钱转给小号后跑路）。'
      }
      const from = await core.getUser(fromKey)
      if (from.points < amount) return `你的现金不足（当前 ${from.points}）。`
      const to = await core.getUser(toKey)
      // 事务包裹：双方积分更新原子化
      return await core.dbTx(async (db) => {
        const dbAny: any = db
        await dbAny.set('daily_points', { userId: fromKey }, { points: from.points - amount })
        await dbAny.set('daily_points', { userId: toKey }, { points: to.points + amount })
        return `已转移 ${amount} 积分给 ${h('at', { id: toId })}，剩余 ${from.points - amount} 积分。`
      })
    })

  ctx.command('经济/积分/修改 <user:user> <amount:integer>', '管理员调整用户积分（可为负数）', { authority: 3 })
    .alias('积分修改', 'kaifen')
    .action(async ({ session }, user, amount) => {
      if (!user) return '请 @ 要调整积分的对象。'
      if (typeof amount !== 'number') return '请提供调整数量（正数增加，负数扣减）。'
      const [platform, id] = user.split(':')
      if (!platform || !id) return '对方信息解析失败，请在群里 @ 对方后再试。'
      const key = `${platform}:${id}`
      const row = await core.getUser(key)
      const next = row.points + amount
      if (next < 0) return `调整后积分不能为负（对方当前 ${row.points}）。`
      await ctx.database.set('daily_points', { userId: key }, { points: next })
      return `已将 ${h('at', { id })} 的积分调整为 ${next}（${amount >= 0 ? '+' : ''}${amount}）。`
    })
}
