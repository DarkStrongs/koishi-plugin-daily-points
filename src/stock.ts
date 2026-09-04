import { Context } from 'koishi'
import { Config, DAY, HOUR } from './config'
import { CoreUtils } from './core'
import { HoldingRow, StockRow } from './types'
import { fmtMoney, fmtTime, userKey } from './util'
import { STOCK_SEED, IPO_PRESETS } from './seeds'

export interface StockDeps {
  ctx: Context
  config: Config
  core: CoreUtils
  logger: import('koishi').Logger
}

export interface StockHelpers {
  /** 主动推进行情（初始化时 + 每个刷新周期），返回当前所有股票行 */
  updateStocks(): Promise<StockRow[]>
  /** 启动行情刷新定时器（由 index.ts 调用） */
  scheduleUpdates(): void
}

/** 股票系统：行情引擎 + 买入/卖出/持仓/K线 */
export function registerStock({ ctx, config, core, logger }: StockDeps): StockHelpers {

  async function ensureStocks(): Promise<StockRow[]> {
    let stocks = await ctx.database.get('daily_stocks')
    if (!stocks.length) {
      const now = new Date()
      for (const s of STOCK_SEED) {
        await ctx.database.create('daily_stocks', {
          code: s.code,
          name: s.name,
          base: s.base,
          vol: s.vol,
          price: s.base,
          prevPrice: s.base,
          updatedAt: now,
        })
      }
      stocks = await ctx.database.get('daily_stocks')
      await ctx.database.upsert('daily_meta', [{ key: 'stockLastUpdate', value: String(now.getTime()) }])
    }
    await seedHistory(stocks)
    const [metaCheck] = await ctx.database.get('daily_meta', { key: 'stockLastUpdate' })
    if (!metaCheck) await ctx.database.upsert('daily_meta', [{ key: 'stockLastUpdate', value: String(Date.now()) }])
    return stocks
  }

  /** 为没有历史K线的股票回填历史（倒推随机游走），保证图表不为空 */
  async function seedHistory(stocks: { code: string; name: string; base: number; vol: number; price: number }[]) {
    const intervalMs = config.stockIntervalMinutes * 60000
    const N = 48
    const now = Date.now()
    const r2 = (v: number) => Math.round(v * 100) / 100
    for (const s of stocks) {
      const existing = await ctx.database.get('daily_stock_history', { code: s.code }, 1)
      if (existing.length) continue
      const closes = [s.price]
      for (let i = 1; i < N; i++) {
        const prev = closes[0]
        const drift = 0.03 * (s.base - prev) / s.base
        const p = prev * (1 + drift + (Math.random() * 2 - 1) * s.vol * config.stockVolatility)
        closes.unshift(Math.max(0.5, Math.min(p, s.base * 10)))
      }
      const rows: any[] = []
      for (let i = 0; i < N; i++) {
        const close = closes[i]
        const open = i === 0 ? close * (1 + (Math.random() * 2 - 1) * s.vol * 0.3) : closes[i - 1]
        const high = Math.max(open, close) * (1 + Math.random() * s.vol * 0.4)
        const low = Math.min(open, close) * (1 - Math.random() * s.vol * 0.4)
        rows.push({
          code: s.code,
          open: r2(open),
          close: r2(close),
          high: r2(high),
          low: r2(low),
          time: new Date(now - (N - 1 - i) * intervalMs),
        })
      }
      await ctx.database.upsert('daily_stock_history', rows)
    }
  }

  /** 单只股票走一步随机行情（带均值回归，防止无限暴涨/暴跌） */
  function nextPrice(s: { base: number; price: number; vol: number }): number {
    const vol = s.vol * config.stockVolatility
    const drift = 0.03 * (s.base - s.price) / s.base
    const p = s.price * (1 + drift + (Math.random() * 2 - 1) * vol)
    return Math.max(0.5, Math.min(p, s.base * 10))
  }

  /** 随机事件 */
  function rollStockEvent(s: { name: string }): { mult?: number; haltPeriods?: number; text: string } {
    const r = Math.random()
    if (r < 0.3) return { mult: 0.5 + Math.random() * 0.2, text: `${s.name} 财报暴雷，股价跳水` }
    if (r < 0.55) return { mult: 1.3 + Math.random() * 0.5, text: `${s.name} 被巨头收购，股价飙升` }
    if (r < 0.75) return { haltPeriods: 2 + Math.floor(Math.random() * 4), text: `${s.name} 涉嫌财务造假，被临时停牌调查` }
    if (r < 0.9) return { mult: 0.8 + Math.random() * 0.1, text: `${s.name} 高管跑路传闻，股价受挫` }
    return { mult: 1.1 + Math.random() * 0.2, text: `${s.name} 拿下大单，股价走高` }
  }

  async function setNews(text: string) {
    await ctx.database.upsert('daily_meta', [{ key: 'stockNews', value: text }])
  }

  async function setNewsAndBroadcast(text: string) {
    await ctx.database.upsert('daily_meta', [{ key: 'stockNews', value: text }])
    await core.broadcast(text)
  }

  async function maybeIPO(stocks: { code: string }[]) {
    if (config.ipoPeriods <= 0 || stocks.length >= config.stockMaxCount) return
    const target = Math.max(1, Math.round(config.ipoPeriods * 60 / Math.max(1, config.stockIntervalMinutes)))
    const [meta] = await ctx.database.get('daily_meta', { key: 'stockIPOCounter' })
    const counter = meta ? Number(meta.value) + 1 : 1
    if (counter < target) {
      await ctx.database.upsert('daily_meta', [{ key: 'stockIPOCounter', value: String(counter) }])
      return
    }
    await ctx.database.upsert('daily_meta', [{ key: 'stockIPOCounter', value: '0' }])
    const used = new Set(stocks.map((s) => s.code))
    const pool = IPO_PRESETS.filter((p) => !used.has(p.code))
    if (!pool.length) return
    const pick = pool[Math.floor(Math.random() * pool.length)]
    await ctx.database.create('daily_stocks', {
      code: pick.code,
      name: pick.name,
      base: pick.base,
      vol: pick.vol,
      price: pick.base,
      prevPrice: pick.base,
      updatedAt: new Date(),
      note: '新股上市，波动剧烈',
    })
    const [newStock] = await ctx.database.get('daily_stocks', { code: pick.code })
    await seedHistory([newStock])
    await setNewsAndBroadcast(`【${fmtTime(Date.now())}】🔔 新股上市：${pick.name}（${pick.code}），发行价 ${fmtMoney(pick.base)}，正式开盘交易！`)
  }

  /** 分红（按概率，持股者每股得 现价 × dividendRate） */
  async function maybePayDividend(stocks: { code: string; name: string; price: number; haltedUntil?: Date | null }[]) {
    const scale = Math.min(1, config.stockIntervalMinutes / 60)
    if (Math.random() >= config.dividendChance * scale) return
    const tradable = stocks.filter((s) => !s.haltedUntil || new Date(s.haltedUntil).getTime() <= Date.now())
    if (!tradable.length) return
    const pick = tradable[Math.floor(Math.random() * tradable.length)]
    const perShare = Math.round(pick.price * config.dividendRate * 100) / 100
    if (perShare <= 0) return
    const holdings = await ctx.database.get('daily_stock_holding', { code: pick.code })
    let paid = 0, holders = 0
    for (const h of holdings) {
      const amount = Math.floor(perShare * h.quantity)
      if (amount <= 0) continue
      const [row] = await ctx.database.get('daily_points', { userId: h.userId })
      if (!row) continue
      // 事务：分红发放原子化（虽然此处单笔独立，但写在一处更安全）
      await core.dbTx(async (db) => {
        const dbAny: any = db
        await dbAny.set('daily_points', { userId: h.userId }, {
          points: row.points + amount,
          dividendTotal: (row.dividendTotal || 0) + amount,
        })
      })
      paid += amount
      holders++
    }
    if (holders > 0) {
      await setNewsAndBroadcast(`【${fmtTime(Date.now())}】💰 ${pick.name}（${pick.code}）发放分红：每股 ${fmtMoney(perShare)}，${holders} 位股东共分得 ${paid} 积分（已入现金）`)
    }
  }

  /** 到期则补齐刷新（含停机期间），推进水位时间 */
  async function updateStocks(): Promise<StockRow[]> {
    const stocks = await ensureStocks()
    const [meta] = await ctx.database.get('daily_meta', { key: 'stockLastUpdate' })
    const intervalMs = config.stockIntervalMinutes * 60000
    let last = meta ? Number(meta.value) : Date.now()
    if (!Number.isFinite(last)) last = Date.now()
    let steps = Math.floor((Date.now() - last) / intervalMs)
    if (steps <= 0) return stocks
    steps = Math.min(steps, 48)
    const now = Date.now()
    const r2 = (v: number) => Math.round(v * 100) / 100
    const eventScale = Math.min(1, config.stockIntervalMinutes / 60)
    const histRows: any[] = []
    let lastEventNews: string | null = null
    for (let i = 0; i < steps; i++) {
      const stepMs = Math.min(last + (i + 1) * intervalMs, now)
      const stepTime = new Date(stepMs)
      for (const s of stocks) {
        const haltedMs = s.haltedUntil ? new Date(s.haltedUntil).getTime() : 0
        const open = s.price
        let close = open, high = open, low = open
        if (haltedMs > stepMs) {
          // 停牌中：价格冻结
        } else {
          close = nextPrice(s)
          if (Math.random() < config.stockEventChance * eventScale) {
            const ev = rollStockEvent(s)
            if (ev.haltPeriods) s.haltedUntil = new Date(stepMs + ev.haltPeriods * HOUR)
            if (ev.mult) close = Math.max(0.5, close * ev.mult)
            s.note = ev.text
            const newsText = `【${fmtTime(stepMs)}】📰 ${ev.text}${ev.haltPeriods ? `（停牌约 ${ev.haltPeriods} 小时）` : ''}`
            await setNews(newsText)
            if (i === steps - 1) lastEventNews = newsText
          }
          high = Math.max(open, close) * (1 + Math.random() * s.vol * 0.4)
          low = Math.min(open, close) * (1 - Math.random() * s.vol * 0.4)
        }
        s.prevPrice = open
        s.price = r2(close)
        histRows.push({ code: s.code, open: r2(open), close: s.price, high: r2(high), low: r2(low), time: stepTime })
      }
    }
    if (lastEventNews) await core.broadcast(lastEventNews)
    for (const s of stocks) {
      await ctx.database.set('daily_stocks', { code: s.code }, {
        price: s.price,
        prevPrice: s.prevPrice,
        updatedAt: new Date(),
        haltedUntil: s.haltedUntil || null,
        note: s.note || null,
      })
    }
    if (histRows.length) await ctx.database.upsert('daily_stock_history', histRows)
    await ctx.database.remove('daily_stock_history', { time: { $lt: new Date(now - 14 * DAY) } })
    await ctx.database.upsert('daily_meta', [{ key: 'stockLastUpdate', value: String(last + steps * intervalMs) }])
    await maybeIPO(stocks)
    await maybePayDividend(stocks)
    return await ctx.database.get('daily_stocks')
  }

  function scheduleUpdates() {
    if (!config.stockEnabled) return
    updateStocks().catch((e) => logger.warn('股票行情初始化失败：', e))
    let inFlight = false
    ctx.setInterval(() => {
      if (inFlight) return
      inFlight = true
      updateStocks()
        .catch((e) => logger.warn('股票行情刷新失败：', e))
        .finally(() => { inFlight = false })
    }, config.stockIntervalMinutes * 60000)
  }

  // ── K线 HTML 渲染 ──────────────────────────────────
  function buildKlineHTML(stock: { name: string; code: string; price: number }, candles: { open: number; close: number; high: number; low: number }[]) {
    const W = 760, H = 420
    const padL = 18, padR = 70, padT = 56, padB = 30
    const plotW = W - padL - padR, plotH = H - padT - padB
    let min = Infinity, max = -Infinity
    for (const c of candles) {
      min = Math.min(min, c.low)
      max = Math.max(max, c.high)
    }
    const span0 = (max - min) || 1
    min -= span0 * 0.05
    max += span0 * 0.05
    const y = (v: number) => padT + (max - v) / (max - min) * plotH
    const n = candles.length
    const cw = plotW / n
    const up = '#d93026', down = '#0f9d58'
    const first = candles[0], last = candles[n - 1]
    const chg = first.open ? (last.close / first.open - 1) * 100 : 0
    let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`
    svg += `<rect width="${W}" height="${H}" fill="#ffffff"/>`
    svg += `<text x="${padL}" y="26" font-size="20" font-weight="600" fill="#1a1a1a" font-family="sans-serif">${stock.name}（${stock.code}）</text>`
    svg += `<text x="${padL}" y="46" font-size="13" fill="#5f6368" font-family="sans-serif">现价 ${fmtMoney(stock.price)} · 区间 ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% · 每根K线 = ${config.stockIntervalMinutes} 分钟 · 共 ${n} 根</text>`
    for (let g = 0; g <= 4; g++) {
      const v = min + (max - min) * g / 4
      const gy = y(v)
      svg += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="#eeeeee" stroke-width="1"/>`
      svg += `<text x="${W - padR + 6}" y="${(gy + 4).toFixed(1)}" font-size="11" fill="#999999" font-family="sans-serif">${fmtMoney(v)}</text>`
    }
    for (let i = 0; i < n; i++) {
      const c = candles[i]
      const cx = padL + i * cw + cw / 2
      const color = c.close >= c.open ? up : down
      const bodyW = Math.max(2, Math.floor(cw * 0.6))
      const yO = y(c.open), yC = y(c.close)
      svg += `<line x1="${cx.toFixed(1)}" y1="${y(c.high).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${y(c.low).toFixed(1)}" stroke="${color}" stroke-width="1.2"/>`
      const top = Math.min(yO, yC)
      const bh = Math.max(1, Math.abs(yC - yO))
      svg += `<rect x="${(cx - bodyW / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bodyW}" height="${bh.toFixed(1)}" fill="${color}"/>`
    }
    const ly = y(last.close)
    svg += `<line x1="${padL}" y1="${ly.toFixed(1)}" x2="${W - padR}" y2="${ly.toFixed(1)}" stroke="#666666" stroke-width="1" stroke-dasharray="4 3"/>`
    svg += `<text x="${W - padR + 6}" y="${(ly + 4).toFixed(1)}" font-size="12" font-weight="600" fill="#d93026" font-family="sans-serif">${fmtMoney(last.close)}</text>`
    svg += '</svg>'
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;}</style></head><body>${svg}</body></html>`
  }

  // ── 命令注册 ─────────────────────────────────────────

  ctx.command('经济/股票', '查看实时股票行情')
    .alias('股票列表', '股票行情')
    .action(async () => {
      if (!config.stockEnabled) return '股票系统未开启。'
      const stocks = await updateStocks()
      const now = Date.now()
      const lines = stocks.map((s) => {
        const change = s.prevPrice ? (s.price / s.prevPrice - 1) * 100 : 0
        const arrow = change >= 0 ? '📈 +' : '📉 '
        const halted = s.haltedUntil && new Date(s.haltedUntil).getTime() > now
        const tag = halted ? '🚫停牌' : (s.note ? `📌${s.note}` : '')
        return `${s.code} ${s.name}｜${fmtMoney(s.price)}（${arrow}${change.toFixed(2)}%）${tag}`
      })
      const [meta] = await ctx.database.get('daily_meta', { key: 'stockLastUpdate' })
      const [ipoMeta] = await ctx.database.get('daily_meta', { key: 'stockIPOCounter' })
      const [newsMeta] = await ctx.database.get('daily_meta', { key: 'stockNews' })
      const nextMin = meta ? Math.max(0, Math.ceil((Number(meta.value) + config.stockIntervalMinutes * 60000 - Date.now()) / 60000)) : config.stockIntervalMinutes
      const out = [`📊 股票行情（每 ${config.stockIntervalMinutes} 分钟刷新一次）：`, ...lines]
      if (newsMeta?.value) out.push(`📰 最新消息：${newsMeta.value}`)
      if (config.ipoPeriods > 0 && stocks.length < config.stockMaxCount) {
        const target = Math.max(1, Math.round(config.ipoPeriods * 60 / Math.max(1, config.stockIntervalMinutes)))
        out.push(`🔔 新股上市倒计时：还需 ${Math.max(1, target - Number(ipoMeta?.value || 0))} 个周期（当前 ${stocks.length}/${config.stockMaxCount} 只）`)
      }
      out.push(`下次刷新约 ${nextMin} 分钟后。买入用「买入 代码 数量」，看走势发「K线 代码」`)
      return out.join('\n')
    })

  ctx.command('经济/股票/K线 [code:string] [count:number]', '查看股票K线走势图')
    .alias('k线', '蜡烛图', '走势图')
    .action(async ({ session }, code, count) => {
      if (!session.userId) return
      if (!config.stockEnabled) return '股票系统未开启。'
      if (!code) return '请提供股票代码，如「K线 DMHJ」，可指定根数如「K线 DMHJ 48」。'
      const upper = String(code).trim().toUpperCase()
      const stocks = await updateStocks()
      const stock = stocks.find((s) => s.code === upper)
      if (!stock) return `没有找到股票「${upper}」，发送「股票」查看列表。`
      const n = Math.min(Math.max(count || 30, 10), 96)
      const candles = (await ctx.database.get('daily_stock_history', { code: upper }, { sort: { time: 'desc' }, limit: n })).reverse()
      if (!candles.length) return '暂无历史K线数据，请等待行情刷新后再试。'
      if (!ctx.puppeteer) {
        const spark = candles.slice(-24).map((c) => (c.close >= c.open ? '█' : '▁')).join('')
        return `${stock.name}（${upper}）近 ${candles.length} 根K线（█涨 ▁跌）：\n${spark}\n提示：未启用 puppeteer 插件，无法生成图片走势。`
      }
      try {
        return await ctx.puppeteer.render(buildKlineHTML(stock, candles))
      } catch (e) {
        logger.warn('K线渲染失败：', e)
        return 'K线图渲染失败，请稍后再试。'
      }
    })

  ctx.command('经济/股票/买入 <code:string> <qty:integer>', '用现金买入股票')
    .action(async ({ session }, code, qty) => {
      if (!session.userId) return
      if (!config.stockEnabled) return '股票系统未开启。'
      const key = userKey(session)
      if (!code) return '请提供股票代码，如「买入 DMHJ 10」。'
      const upper = String(code).trim().toUpperCase()
      if (!qty || qty <= 0) return '购买数量必须是正整数。'
      const stocks = await updateStocks()
      const stock = stocks.find((s) => s.code === upper)
      if (!stock) return `没有找到股票「${upper}」，发送「股票」查看列表。`
      if (stock.haltedUntil && new Date(stock.haltedUntil).getTime() > Date.now()) {
        return `🚫 ${stock.name}（${upper}）已停牌，暂停交易，复牌时间约 ${fmtTime(new Date(stock.haltedUntil).getTime())}。`
      }
      const total = Math.round(stock.price * qty)
      if (total <= 0) return '购买数量太少啦。'
      const row = await core.getUser(key)
      if (row.points < total) return `现金不足：需要 ${total}，当前 ${row.points}。`
      const [holding] = await ctx.database.get('daily_stock_holding', { userId: key, code: upper })
      // 事务：扣现金 + 更新/创建持仓 原子化
      return await core.dbTx(async (db) => {
        const dbAny: any = db
        if (holding) {
          await dbAny.set('daily_stock_holding', { id: holding.id }, {
            quantity: holding.quantity + qty,
            cost: holding.cost + total,
          })
        } else {
          await dbAny.create('daily_stock_holding', {
            userId: key,
            code: upper,
            quantity: qty,
            cost: total,
          })
        }
        await dbAny.set('daily_points', { userId: key }, { points: row.points - total })
        return `买入成功：${stock.name}（${upper}）× ${qty} @ ${fmtMoney(stock.price)}，花费 ${total}，现金剩余 ${row.points - total}`
      })
    })

  ctx.command('经济/股票/卖出 <code:string> <qty:integer>', '卖出股票换回现金')
    .action(async ({ session }, code, qty) => {
      if (!session.userId) return
      if (!config.stockEnabled) return '股票系统未开启。'
      const key = userKey(session)
      if (!code) return '请提供股票代码，如「卖出 DMHJ 10」。'
      const upper = String(code).trim().toUpperCase()
      const [holding] = await ctx.database.get('daily_stock_holding', { userId: key, code: upper })
      if (!holding || !holding.quantity) return `你没有持有 ${upper}，发送「持仓」查看。`
      if (!qty || qty <= 0) return '卖出数量必须是正整数。'
      if (qty > holding.quantity) return `持有数量不足（当前 ${holding.quantity}）。`
      const stocks = await updateStocks()
      const stock = stocks.find((s) => s.code === upper)
      if (!stock) return `没有找到股票「${upper}」的数据。`
      if (stock.haltedUntil && new Date(stock.haltedUntil).getTime() > Date.now()) {
        return `🚫 ${stock.name}（${upper}）已停牌，暂停交易，复牌时间约 ${fmtTime(new Date(stock.haltedUntil).getTime())}。`
      }
      const proceeds = Math.round(stock.price * qty)
      const costPart = Math.round(holding.cost * qty / holding.quantity)
      const profit = proceeds - costPart
      const row = await core.getUser(key)
      // 事务：减仓 + 加现金 原子化
      return await core.dbTx(async (db) => {
        const dbAny: any = db
        if (qty === holding.quantity) {
          await dbAny.remove('daily_stock_holding', { id: holding.id })
        } else {
          await dbAny.set('daily_stock_holding', { id: holding.id }, {
            quantity: holding.quantity - qty,
            cost: holding.cost - costPart,
          })
        }
        await dbAny.set('daily_points', { userId: key }, { points: row.points + proceeds })
        return [
          `卖出成功：${stock.name}（${upper}）× ${qty} @ ${fmtMoney(stock.price)}，获得 ${proceeds}`,
          `本次盈亏：${profit >= 0 ? '+' : ''}${profit}（成本 ${costPart}）`,
          `现金：${row.points + proceeds}`,
        ].join('\n')
      })
    })

  ctx.command('经济/股票/持仓', '查看我的股票持仓')
    .alias('我的持仓')
    .action(async ({ session }) => {
      if (!session.userId) return
      if (!config.stockEnabled) return '股票系统未开启。'
      const key = userKey(session)
      const holdings: HoldingRow[] = await ctx.database.get('daily_stock_holding', { userId: key })
      if (!holdings.length) return '当前空仓，发送「股票」查看行情，「买入 代码 数量」建仓。'
      const stocks = await updateStocks()
      const priceMap = new Map(stocks.map((s) => [s.code, s]))
      let totalValue = 0, totalCost = 0
      const lines = holdings.map((hld) => {
        const s: any = priceMap.get(hld.code)
        const price = s ? s.price : 0
        const value = Math.round(price * hld.quantity)
        const avg = hld.quantity ? hld.cost / hld.quantity : 0
        const profit = value - hld.cost
        totalValue += value
        totalCost += hld.cost
        const pct = hld.cost > 0 ? ((profit / hld.cost) * 100).toFixed(2) : '0.00'
        return `${hld.code}｜持有 ${hld.quantity} 股｜现价 ${fmtMoney(price)}｜市值 ${value}｜成本均价 ${fmtMoney(avg)}｜浮盈 ${profit >= 0 ? '+' : ''}${profit}（${profit >= 0 ? '+' : ''}${pct}%）`
      })
      const tp = totalValue - totalCost
      const row = await core.getUser(key)
      const div = Math.floor(row.dividendTotal || 0)
      const outLines = [`📈 我的持仓（市值 ${totalValue}，总成本 ${Math.round(totalCost)}）：`, ...lines,
        `合计浮盈：${tp >= 0 ? '+' : ''}${tp}（${totalCost > 0 ? ((tp / totalCost) * 100).toFixed(2) : '0.00'}%）`]
      if (div > 0) outLines.push(`累计分红：${div} 积分（分红自动存入现金）`)
      return outLines.join('\n')
    })

  return { updateStocks, scheduleUpdates }
}
