import { Context } from 'koishi'
import { Config as ConfigSchema } from './config'
import { registerModels } from './db'
import { createCore } from './core'
import { registerGlueMiddleware } from './middleware'
import { registerSignin } from './signin'
import { registerBonus } from './signin.bonus'
import { registerCalendar } from './signin.calendar'
import { registerBank } from './bank'
import { registerLoan } from './loan'
import { registerStock } from './stock'
import { registerCasino } from './casino'
import { registerLottery } from './lottery'
import { registerScratch } from './scratch'
import { registerRobbery } from './robbery'
import { registerProperty } from './property'
import { registerStone } from './stone'

export const name = 'daily-points'
export const inject = { required: ['database'], optional: ['puppeteer'] }

export const usage = `签到积分 + 银行 + 股票 + 贷款 + 娱乐 插件。
发送「经济」可查看全部指令菜单。
直接发送短名即可调用：
  积分：签到 / 查询 / 排行 / 转移 / 修改 / 日历 / 补签
  银行：存款 / 取款 / 定期存款 / 定期列表 / 定期取出 / 银行（资产总览）
  贷款：贷款（正常） / 高利贷 / 还款（可指定ID） / 欠款 / 打工 / 破产
  股票：股票 / 大盘 / 股票排行 / 资金流 <代码> / 持仓榜 / K线 / 买入 / 卖出 / 持仓
  娱乐：赌场（猜大小/轮盘/21点/老虎机/百家乐/牛牛）｜彩票｜刮刮乐｜抢劫 @人
  房产：买房（旧 NPC 二手急售）/ 卖房 / 挂牌 / 购房 / 取消挂牌 / 挂牌列表 / 租房 / 收租 / 我的房产 / 我的户型 / 房产市场 / 房产走势 / 政策 / 开发商 / 楼盘 / 楼盘详情 / 投资楼盘 / 我的投资 / 开盘购买
  赌石：赌石市场 / 赌石情报 / 买原石 / 切石 / 卖石 / 我的原石 / 原石图鉴 / 原石排行榜 / 原石估价 / 原石概览
（v1.14.0：买房会买到烂尾楼、可 P2P 用户间交易、突发升值/危机政策）
（v1.15.0：赌石 = 收藏型积分回收。买 → 切（揭示词条） → 卖/囤。囤越久收藏价值越高，卖价多半亏）
（v1.16.0：赌石升级 — 11 个产地（缅甸/越南/日本/新疆/云南/俄罗斯/内蒙/巴西/阿根廷/泰国/江湖散石）、5 维随机属性（体积/形状/皮壳/透光度/净度）、8 种废石、完整评语系统、价格档升至 ¥500/5千/5万/30万/150万）
（v1.17.0：房地产升级 — 4 家开发商（万润/恒远/碧桂园系/龙合）承接楼盘项目，按 规划→施工→开盘→售罄→竣工 推进；玩家可投资楼盘获取开盘优先权 + 投资者折扣 + 竣工分红；开盘后买具体户型（小区/楼栋/朝向/户型明确）；旧「买房」降级为二手急售市场）
（旧写法「积分签到 / 我的积分 / 积分排行 / 积分转移」同样有效）`

// 兼容 Koishi 默认从 index 拿 Config / apply 的导出风格
export const Config = ConfigSchema
export type { Config } from './config'

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('daily-points')

  // 1. 注册所有 daily_* 数据表
  registerModels(ctx)

  // 2. 创建共享数据访问层（getUser / settleBank / broadcast / dbTx / ...）
  const core = createCore({ ctx, config, logger })

  // 3. 注册核心业务模块
  // 注意注入顺序：
  //   bank 需要 loan.settleUserLoans，故 loan 先注册
  //   lottery / robbery 需要 casino，故 casino 先注册
  //   signin 需要 bonus 的 onSigninSuccess / getCardCount 钩子，故 bonus 先注册
  const loanHelpers = registerLoan({ ctx, config, core, logger })
  const bankDeps = { ctx, config, core, settleUserLoans: loanHelpers.settleUserLoans }
  registerBank(bankDeps)
  const bonusHelpers = registerBonus({ ctx, config, core, logger })
  registerSignin({ ctx, config, core, onSigninSuccess: bonusHelpers.onSigninSuccess, getCardCount: bonusHelpers.getCardCount })
  registerCalendar({ ctx, config, core })
  const stockHelpers = registerStock({ ctx, config, core, logger })
  const casinoHelpers = registerCasino({ ctx, config, core })
  const lotteryHelpers = registerLottery({
    ctx, config, core,
    casino: {
      getCasinoPool: casinoHelpers.getCasinoPool,
      transferFromCasinoPool: casinoHelpers.transferFromCasinoPool,
    },
    logger,
  })
  registerScratch({ ctx, config, core })
  registerRobbery({
    ctx, config, core,
    casino: { feedCasinoPool: casinoHelpers.feedCasinoPool },
  })
  const propertyHelpers = registerProperty({ ctx, config, core, logger })
  const stoneHelpers = registerStone({ ctx, config, core, casino: { feedCasinoPool: casinoHelpers.feedCasinoPool } })

  // 4. 兼容连写（存款100、还款500、彩票3 等无空格形式）
  registerGlueMiddleware(ctx)

  // 5. 启动定时器（防重入版）
  loanHelpers.scheduleCollectors()
  stockHelpers.scheduleUpdates()
  lotteryHelpers.scheduleDraws()
  bonusHelpers.scheduleMonthlyDistribution()
  propertyHelpers.schedulePropertyUpdates()
  stoneHelpers.scheduleStoneMarketRefresh()

  // 6. 经济系统总菜单（二级分组，避免 help 一屏刷满）
  ctx.command('经济', '经济系统总菜单（积分 / 银行 / 贷款 / 股票 / 房产 / 娱乐）')
    .action(() => {
      return [
        '🏦 经济系统指令一览',
        '',
        '💰 积分：签到｜查询｜排行｜转移 @人 数量｜日历｜补签',
        '🏦 银行：存款｜取款｜定期存款｜定期列表｜定期取出｜银行（资产总览）',
        '💳 贷款：贷款（正常）｜高利贷｜还款（可指定ID）｜欠款｜打工｜破产',
        '📈 股票：股票（行情）｜K线（走势图）｜买入｜卖出｜持仓',
        '🏘️ 房产：买房（二手急售）｜卖房｜挂牌｜购房｜取消挂牌｜挂牌列表｜租房｜收租｜我的房产｜我的户型｜房产市场｜房产走势｜政策',
        '🏗️ 楼盘开发：开发商｜楼盘｜楼盘详情｜投资楼盘｜我的投资｜开盘购买',
        '🎲 娱乐：赌场（猜大小/轮盘/21点/老虎机/百家乐/牛牛）｜彩票（多档奖项，奖池 = 基础池 + 赌场池 + 票数收入）｜刮刮乐｜抢劫 @人',
        '',
        '直接发送指令名即可使用，无需加前缀。',
        '详细用法可发送「help 经济」或「help 指令名」查看。',
      ].join('\n')
    })

  ctx.command('经济/积分', '积分分组：签到 / 查询 / 排行 / 转移 / 修改 / 日历 / 补签')
    .action(() => {
      return [
        '💰 积分指令：',
        '  签到 —— 每日签到领积分，连续签到奖励递增；每 7 天赠 1 张补签卡',
        '  查询 —— 查询现金、存款、股票市值、欠款、连续天数与补签卡',
        '  排行 —— 积分排行榜',
        '  转移 @某人 数量 —— 把积分转给别人',
        '  修改 @某人 数量 —— 管理员调整积分（3 级权限）',
        '  日历 [YYYY-MM] —— 查看签到日历（月度格子图），留空看当月',
        '  补签 [日期] —— 用补签卡补回过去漏签日期（保留连胜），留空补昨天',
        '',
        '（旧写法「积分签到 / 我的积分 / 积分排行 / 积分转移」同样有效）',
      ].join('\n')
    })

  ctx.command('经济/贷款', '贷款分组菜单（也可直接用「贷款」「高利贷」等）')
    .action(() => {
      return [
        '💳 贷款指令：',
        '  贷款 [数量] [天数] —— 正常贷款，期限 3/7/30 天',
        '  高利贷 [数量] —— 找地下钱庄借钱，秒到账但利率极高',
        '  还款 [贷款ID] 数量 —— 还贷款，不指定 ID 则按优先级还（逾期优先）',
        '  欠款 —— 查看我的贷款明细（含利率与到期时间）',
        '  打工 —— 赚积分还债（逾期时收入会被划扣还债）',
        '  破产 —— 逾期之后可申请破产，债务一笔勾销但资产全部没收',
      ].join('\n')
    })
}
