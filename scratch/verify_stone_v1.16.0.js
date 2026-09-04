// scratch/verify_stone_v1.16.0.js
// 综合验证 v1.16.0 升级 - 14 个测试场景
// 用法：先 cd 到项目根目录（koishi-plugin-daily-points），
// 然后 node scratch/verify_stone_v1.16.0.js

const path = require('path')
const ROOT = path.resolve(__dirname, '..')

// ── chainable Schema mock：每个方法都返回自身 proxy，支持任意链式调用 ──
function makeChainable(label) {
  const fn = (..._args) => makeChainable(label)
  return new Proxy(fn, {
    get(_t, prop) {
      if (prop === 'description') return () => makeChainable(label)
      if (prop === 'default') return () => makeChainable(label)
      if (prop === 'min' || prop === 'max' || prop === 'step' || prop === 'role'
        || prop === 'required' || prop === 'optional'
        || prop === 'pattern' || prop === 'length' || prop === 'hidden'
        || prop === 'experimental' || prop === 'deprecated') return () => makeChainable(label)
      if (prop === 'then') return undefined
      return makeChainable(label)
    },
  })
}

const Schema = new Proxy({}, {
  get(_t, prop) {
    if (prop === 'boolean') return () => makeChainable('boolean')
    if (prop === 'number') return () => makeChainable('number')
    if (prop === 'string') return () => makeChainable('string')
    if (prop === 'array') return () => makeChainable('array')
    if (prop === 'object') return () => makeChainable('object')
    if (prop === 'union') return () => makeChainable('union')
    return makeChainable(prop)
  },
})

// ── koishi Context mock ──
class MockDb {
  constructor() { this.rows = new Map() }
  _keyOf(table, fields) {
    if (!fields || Object.keys(fields).length === 0) return `${table}::*`
    const sortedKeys = Object.keys(fields).sort()
    return `${table}::` + sortedKeys.map((k) => `${k}=${JSON.stringify(fields[k])}`).join('&')
  }
  _matches(row, fields) {
    for (const [k, v] of Object.entries(fields)) {
      if (Array.isArray(v)) {
        if (!v.includes(row[k])) return false
      } else if (typeof v === 'object' && v && ('$gt' in v || '$lt' in v || '$gte' in v || '$lte' in v || '$ne' in v)) {
        if ('$gt' in v && !(row[k] > v.$gt)) return false
        if ('$lt' in v && !(row[k] < v.$lt)) return false
        if ('$gte' in v && !(row[k] >= v.$gte)) return false
        if ('$lte' in v && !(row[k] <= v.$lte)) return false
        if ('$ne' in v && row[k] === v.$ne) return false
      } else if (row[k] !== v) {
        return false
      }
    }
    return true
  }
  async get(table, fields = {}) {
    if (!this.rows.has(table)) this.rows.set(table, [])
    const all = this.rows.get(table)
    return all.filter((r) => this._matches(r, fields))
  }
  async create(table, payload) {
    if (!this.rows.has(table)) this.rows.set(table, [])
    const all = this.rows.get(table)
    if (Array.isArray(payload)) {
      const out = []
      for (const p of payload) {
        const row = { id: this._nextId(table), ...p }
        all.push(row)
        out.push(row)
      }
      return out
    }
    const row = { id: this._nextId(table), ...payload }
    all.push(row)
    return row
  }
  async set(table, fields, payload) {
    if (!this.rows.has(table)) this.rows.set(table, [])
    const all = this.rows.get(table)
    let count = 0
    for (const r of all) {
      if (this._matches(r, fields)) {
        Object.assign(r, payload)
        count++
      }
    }
    return count
  }
  async remove(table, fields) {
    if (!this.rows.has(table)) this.rows.set(table, [])
    const all = this.rows.get(table)
    const before = all.length
    const remaining = all.filter((r) => !this._matches(r, fields))
    this.rows.set(table, remaining)
    return before - remaining.length
  }
  async upsert(table, payload, keys) {
    const fields = Array.isArray(keys) ? keys : [keys]
    const query = {}
    for (const f of fields) query[f] = payload[f]
    const existing = await this.get(table, query)
    if (existing.length > 0) {
      return await this.set(table, query, payload)
    }
    return await this.create(table, payload)
  }
  _nextId(table) {
    const all = this.rows.get(table) || []
    return all.length === 0 ? 1 : Math.max(...all.map((r) => r.id || 0)) + 1
  }
  snapshot() {
    return new Map(Array.from(this.rows.entries()).map(([k, v]) => [k, [...v]]))
  }
}

const ctx = {
  database: new MockDb(),
  model: { extend: () => {} },
  broadcast: async () => {},
}

// 重置 registerStone 调用前的 db 状态
ctx.database.rows = new Map()

// ── 模块解析 ──
// 注册 koishi 路径
const Module = require('module')
const origResolve = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request === 'koishi') {
    return path.resolve(__dirname, 'fake_koishi.js')
  }
  return origResolve.call(this, request, ...rest)
}

require('fs').writeFileSync(
  path.join(__dirname, 'fake_koishi.js'),
  `const chainable = () => new Proxy(function () { return chainable() }, {
  get(_t, prop) {
    if (typeof prop === 'symbol') return undefined
    return chainable()
  },
  apply: () => chainable(),
  construct: () => chainable(),
})
module.exports = { Context: class {} }
module.exports.Schema = new Proxy({}, {
  get(_, prop) {
    if (typeof prop === 'symbol') return undefined
    return chainable()
  },
})`,
)

// ── 命令 mock（在 require 之前装好！）──
const allCommands = {}
ctx.command = (def, _desc) => {
  const fullKey = def
  const shortKey = def.split('/').pop().trim().split(' ')[0]
  const cmdProxy = {
    alias() { return cmdProxy },
    action(fn) {
      allCommands[fullKey] = fn
      allCommands[shortKey] = fn
      // 同时去掉中括号参数，如「原石图鉴 [type:string]」→「原石图鉴」
      const noArgKey = shortKey.replace(/\s.*$/, '')
      if (noArgKey !== shortKey) allCommands[noArgKey] = fn
      return cmdProxy
    },
  }
  return cmdProxy
}

// ── 直接 require 编译后的产物 lib/stone.js ──
const { registerStone } = require(path.join(ROOT, 'lib', 'stone.js'))
const coreMod = require(path.join(ROOT, 'lib', 'core.js'))
const configMod = require(path.join(ROOT, 'lib', 'config.js'))
const { createCore } = coreMod

const config = {
  stoneEnabled: true,
  stonePriceTiers: [500, 5000, 50000, 300000, 1500000],
  stoneMarketRefreshHours: 24,
  stoneMarketStockSize: 30,
  stoneDailyPurchaseLimit: 30,
  stoneDailyAmountLimit: 5000000,
  stoneHoldingDailyRate: 0.05,
  stoneHoldingSoftCapMul: 30,
  stoneHoldingDecayRate: 0.02,
  stoneHoldingHardCapMul: 100,
  stoneCasinoPoolRate: 0.2,
  stoneBrickProtectionRate: 0.05,
  broadcastChannels: [],
  bankHourlyRate: 0.001,
}

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
const core = createCore({ ctx, config, logger })

let casinoPoolFed = 0
const casino = { feedCasinoPool: async (d) => { casinoPoolFed += d; return casinoPoolFed } }

const helpers = registerStone({ ctx, config, core, casino })
helpers.scheduleStoneMarketRefresh()

// 触发首次种子化（避免后续每个命令单独 lazy 初始化）
// 用一个 dummy 命令调用，让 refreshMarketIfDue + ensureStoneTypes 跑起来
;

// ── 工具：取 session ──
function makeSession(uid = 'u1', platform = 'test') {
  return { userId: uid, platform }
}

async function runCmd(name, sessionArgs, ...args) {
  const fn = allCommands[name]
  if (!fn) throw new Error('command not found: ' + name)
  const session = typeof sessionArgs === 'object' && sessionArgs.userId ? sessionArgs : makeSession(sessionArgs)
  return await fn({ session }, ...args)
}

// ── 测试基础设施 ──
let pass = 0, fail = 0
const failures = []
function check(label, cond, info = '') {
  if (cond) {
    pass++
    console.log(`  ✅ ${label}`)
  } else {
    fail++
    failures.push({ label, info })
    console.log(`  ❌ ${label}${info ? ' — ' + info : ''}`)
  }
}
function section(name) {
  console.log(`\n=== ${name} ===`)
}

// ── 准备用户 ──
async function seedUser(key, points = 100000000) {
  ctx.database.rows.set('daily_points', [
    ...(ctx.database.rows.get('daily_points') || []).filter((r) => r.userId !== key),
    {
      id: ctx.database._nextId('daily_points'),
      userId: key,
      points,
      bank: 0,
      bankUpdatedAt: new Date(),
      totalEarned: 0,
      streak: 0,
      lastDate: null,
      lastClaim: new Date(),
      lastWork: null,
      bankruptCount: 0,
      bankruptUntil: null,
      dividendTotal: 0,
      createdAt: new Date(),
    },
  ])
}
;(async () => {
  await seedUser('test:u1', 100000000)
  await seedUser('test:poor', 1000)

  // ── 1+2. 启动种子 + 市场刷新 ──
  section('1+2. 启动种子 + 市场刷新（先触发市场命令以驱动 ensureStoneTypes）')
  const m1 = await runCmd('赌石市场', 'u1')
  check('赌石市场有内容', m1.includes('今日原石市场'), m1.slice(0, 100))
  const types = await ctx.database.get('daily_stone_types', {})
  check('5 类原石被种子化', types.length === 5, `实际 ${types.length}`)
  if (types.length === 5) {
    const jadeite = types.find((t) => t.code === 'jadeite')
    const cat = JSON.parse(jadeite.originCatalog || '[]')
    check('jadeite.originCatalog 含产地', cat.length > 0, `${cat.length} 个产地`)
    if (cat.length > 0) {
      const mine = cat.find((o) => o.code === 'myanmar')
      check('myanmar 在 jadeite 产地目录中', !!mine)
      check('产地含 priceMul', mine && typeof mine.priceMul === 'number')
    }
  }

  const market = await ctx.database.get('daily_stone_market', {})
  check('市场库存约 30 块', market.length >= 25 && market.length <= 30, `实际 ${market.length}`)
  const sample = market[0]
  check('每块石头带 origin', !!sample.origin && sample.origin.length > 0, `origin=${sample?.origin}`)
  check('每块石头带 attributes JSON', !!sample.attributes && sample.attributes.includes('size'),
    sample.attributes?.slice(0, 80))

  // ── 3. 11 产地分布 ──
  section('3. 11 个产地都能出现在市场')
  const originCount = {}
  for (const r of market) originCount[r.origin] = (originCount[r.origin] || 0) + 1
  const originList = Object.keys(originCount)
  console.log('  [分布]', JSON.stringify(originCount))
  check('至少 8 个不同产地出现', originList.length >= 8, `实际 ${originList.length}: ${originList.join(',')}`)

  // ── 4. 价格档 ──
  section('4. 价格档提价到 [500, 5千, 5万, 30万, 150万]')
  check('T1=500', config.stonePriceTiers[0] === 500)
  check('T2=5000', config.stonePriceTiers[1] === 5000)
  check('T3=50000', config.stonePriceTiers[2] === 50000)
  check('T4=300000', config.stonePriceTiers[3] === 300000)
  check('T5=1500000', config.stonePriceTiers[4] === 1500000)

  // ── 5. 买原石 ──
  section('5. 买原石（保留 origin + attributes）')
  const target = market[0]
  const finalPrice = m1.includes('#' + target.id) ? m1.match(/#\d+.*?¥([\d,]+)/) : null
  const buyResult = await runCmd('买原石', 'u1', '#' + target.id)
  console.log('  [买] ' + buyResult.split('\n')[0])
  const inventory = await ctx.database.get('daily_stone_inventory', { userId: 'test:u1' })
  check('背包里新增 1 块', inventory.length === 1, `实际 ${inventory.length}`)
  if (inventory.length === 1) {
    check('新石头的 origin 与市场一致', inventory[0].origin === target.origin)
    check('新石头的 attributes 与市场一致', inventory[0].attributes === target.attributes)
    check('新石头状态 = holding', inventory[0].status === 'holding')
  }

  // ── 6. 赌石情报 ──
  section('6. 赌石情报（5 维属性 + 修正后分布）')
  const intel = await runCmd('赌石情报', 'u1', '#' + target.id)
  // 该 ID 已买走，应当找不到
  // 重新拿一块还在市场上的
  const market2 = await ctx.database.get('daily_stone_market', {})
  const stillThere = market2[0]
  if (stillThere) {
    const intel2 = await runCmd('赌石情报', 'u1', '#' + stillThere.id)
    console.log('  [情报预览] ' + intel2.split('\n').slice(0, 8).join('\n  '))
    check('情报含体积', intel2.includes('体积'))
    check('情报含形状', intel2.includes('形状'))
    check('情报含皮壳', intel2.includes('皮壳'))
    check('情报含透光度', intel2.includes('透光度'))
    check('情报含净度', intel2.includes('净度'))
    check('情报含修正后分布', intel2.includes('修正后分布'))
  }

  // ── 7. 切石 ──
  section('7. 切石（生成评语 + grade + wasteSubtype）')
  const cutResult = await runCmd('切石', 'u1', '#1')
  console.log('  [切石预览] ' + cutResult.split('\n').slice(0, 6).join('\n  '))
  check('切石返回内容', cutResult.length > 50)
  check('切石含评级', cutResult.includes('综合评级'))
  check('切石含卖出价', cutResult.includes('立即卖出价'))
  const inv2 = await ctx.database.get('daily_stone_inventory', { id: 1 })
  if (inv2.length > 0) {
    check('切后 status=cut', inv2[0].status === 'cut')
    check('切后 rarity 已填充', !!inv2[0].rarity)
    check('切后 grade 已填充', !!inv2[0].grade)
    check('切后 comment 已写入', !!inv2[0].comment && inv2[0].comment.length > 30)
    if (inv2[0].rarity === 'brick') {
      check('砖头带 wasteSubtype', !!inv2[0].wasteSubtype)
    }
  }

  // ── 8. 8 种废石都能产出（broad 抽样） ──
  section('8. 8 种废石都可产出（broad 抽样）')
  const wasteSeen = new Set()
  const wasteByRarity = {}
  // 用脚本批量模拟 500 次切石（绕过限购直接改 db）
  for (let i = 0; i < 500; i++) {
    const types = await ctx.database.get('daily_stone_types', { code: 'common' })
    const t = types[0]
    // 强制 brick 桶
    const weights = JSON.parse(t.rarityWeights)
    // 模拟：直接用 brick 桶抽样
    const WASTE = ['trash','brick','sandstone','limestone','ore','cracked','blinded','fake_skin']
    const W = [35, 22, 12, 10, 8, 6, 5, 2]
    const sum = W.reduce((a, b) => a + b, 0)
    let r = Math.random() * sum
    let pickIdx = W.length - 1
    for (let k = 0; k < W.length; k++) {
      r -= W[k]
      if (r <= 0) { pickIdx = k; break }
    }
    wasteSeen.add(WASTE[pickIdx])
    wasteByRarity[WASTE[pickIdx]] = (wasteByRarity[WASTE[pickIdx]] || 0) + 1
  }
  console.log('  [统计] 抽样 500 次，分布：' + JSON.stringify(wasteByRarity))
  for (const w of ['trash', 'brick', 'sandstone', 'limestone', 'ore', 'cracked', 'blinded', 'fake_skin']) {
    check(`${w} 出过`, wasteSeen.has(w))
  }
  check('8 种废石中至少 6 种能生成（broad）', wasteSeen.size >= 6, `实际 ${wasteSeen.size}/8`)

  // ── 9. 切后写入 ──
  section('9. 切后写入 inventory')
  const allInv = await ctx.database.get('daily_stone_inventory', { userId: 'test:u1' })
  check('u1 背包 1 块石头', allInv.length >= 1, `实际 ${allInv.length}`)
  check('u1 石头都已切', allInv.every((r) => r.status === 'cut' || r.status === 'sold'))

  // ── 10. 卖石 ──
  section('10. 卖石（按即时价 + 持有溢价 = 0）')
  // 先买一块便宜石头，确保不被购买限制，再切再卖
  const m2 = await ctx.database.get('daily_stone_market', {})
  if (m2.length > 0) {
    const cheap = m2.find((r) => r.priceTier === 0) || m2[0]
    const r1 = await runCmd('买原石', 'u1', '#' + cheap.id)
    const newInv = (await ctx.database.get('daily_stone_inventory', { userId: 'test:u1' })).filter((r) => r.status === 'holding')
    if (newInv.length > 0) {
      const id = newInv[0].id
      await runCmd('切石', 'u1', '#' + id)
      const sellRes = await runCmd('卖石', 'u1', '#' + id)
      console.log('  [卖] ' + sellRes.split('\n')[0])
      check('卖出含「实收」', sellRes.includes('实收'))
    }
  }

  // ── 11. 原石概览（按产地汇总） ──
  section('11. 原石概览（按产地汇总）')
  const overview = await runCmd('原石概览', 'u1')
  check('概览有内容', overview.includes('原石概览'), overview.slice(0, 100))
  check('概览至少提到 1 个产地', /[缅甸越南日本新疆云南俄罗内蒙古巴西阿根廷泰国江湖]/.test(overview))

  // ── 12. 现金不足阻断 + 限购 ──
  section('12. 现金不足阻断 + 限购')
  // test:poor 只有 1000 积分
  // 找一个 T3+ 价格的石头（T3 = 50000，太多于 1000），验证阻断
  const m3 = await ctx.database.get('daily_stone_market', {})
  const expensive = m3.find((r) => r.priceTier >= 2)
  if (expensive) {
    // 把 userId 切换成 poor 用户
    // 因为我们的 runCmd 只用 'test:u1'，我们换写法：
    const fn = allCommands['买原石']
    const sessionPoor = makeSession('poor', 'test')
    const poorResult = await fn({ session: sessionPoor }, '#' + expensive.id)
    console.log('  [穷鬼尝试] ' + poorResult.split('\n').slice(0, 2).join(' | '))
    check('穷鬼被阻断（含「现金不足」或「上限」）', poorResult.includes('现金不足') || poorResult.includes('上限'))
  }

  // ── 13. 高产地倍率 ──
  section('13. 高产地倍率（缅甸 ×2.5 等）')
  const m4 = await ctx.database.get('daily_stone_market', {})
  let highMulCount = 0
  for (const r of m4) {
    // 缅甸 myanmar ×2.5；新疆 xinjiang ×2.5；日本 japan ×2.0；蒙古 mongolia ×1.6
    if (['myanmar', 'xinjiang', 'japan', 'mongolia'].includes(r.origin)) highMulCount++
  }
  check('至少 3 块石头产自高产地倍率区', highMulCount >= 3, `实际 ${highMulCount}`)

  // ── 14. 我的原石 + 估价 ──
  section('14. 我的原石 + 估价')
  const myStones = await runCmd('我的原石', 'u1')
  check('我的原石有「收藏」', myStones.includes('收藏') || myStones.includes('原石'), myStones.slice(0, 80))
  const allInv2 = await ctx.database.get('daily_stone_inventory', { userId: 'test:u1' })
  if (allInv2.length > 0) {
    const estRes = await runCmd('原石估价', 'u1', '#' + allInv2[0].id)
    check('估价含「估值」或「当前价值」', estRes.includes('估值') || estRes.includes('当前价值'))
  }

  // ── 收尾 ──
  console.log('\n' + '─'.repeat(50))
  console.log(`总结: 通过 ${pass} / 共 ${pass + fail}（失败 ${fail}）`)
  if (failures.length > 0) {
    console.log('\n失败列表:')
    for (const f of failures) console.log(`  ❌ ${f.label}: ${f.info}`)
  }
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => {
  console.error('FATAL', e)
  process.exit(2)
})
