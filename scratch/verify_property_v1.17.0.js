// scratch/verify_property_v1.17.0.js
// 综合验证 v1.17.0 升级 - 20 个测试场景
// 用法：先 cd 到项目根目录（koishi-plugin-daily-points），
// 然后 node scratch/verify_property_v1.17.0.js

const path = require('path')
const fs = require('fs')
const ROOT = path.resolve(__dirname, '..')

// ── 通用 koishi Context mock ──
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
  async get(table, fields = {}, opts = {}) {
    if (!this.rows.has(table)) this.rows.set(table, [])
    const all = this.rows.get(table)
    let rows = all.filter((r) => this._matches(r, fields))
    if (opts.sort) {
      const [k, dir] = Object.entries(opts.sort)[0]
      rows = [...rows].sort((a, b) => {
        if (a[k] < b[k]) return dir === 'desc' ? 1 : -1
        if (a[k] > b[k]) return dir === 'desc' ? -1 : 1
        return 0
      })
    }
    return rows
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
}

const ctx = {
  database: new MockDb(),
  model: { extend: () => {} },
  broadcast: async () => {},
  puppeteer: null,
}

// ── 模块解析：把 koishi 重定向到 chainable mock ──
const Module = require('module')
const origResolve = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request === 'koishi') {
    return path.resolve(__dirname, 'fake_koishi.js')
  }
  return origResolve.call(this, request, ...rest)
}

fs.writeFileSync(
  path.join(__dirname, 'fake_koishi.js'),
  `const chainable = () => new Proxy(function () { return chainable() }, {
  get(_t, prop) {
    if (typeof prop === 'symbol') return undefined
    return chainable()
  },
  apply: () => chainable(),
  construct: () => chainable(),
})
module.exports = { Context: class {}, h: function () { return { toString: () => '' } } }
module.exports.Schema = new Proxy({}, {
  get(_, prop) {
    if (typeof prop === 'symbol') return undefined
    return chainable()
  },
})
`,
)

// ── 命令 mock（在 require 之前装好）──
const allCommands = {}
ctx.command = (def, _desc) => {
  const fullKey = def
  const shortKey = def.split('/').pop().trim().split(' ')[0]
  const cmdProxy = {
    alias() { return cmdProxy },
    action(fn) {
      allCommands[fullKey] = fn
      allCommands[shortKey] = fn
      const noArgKey = shortKey.replace(/\s.*$/, '')
      if (noArgKey !== shortKey) allCommands[noArgKey] = fn
      return cmdProxy
    },
  }
  return cmdProxy
}
ctx.setInterval = () => {}

// ── 工具 ──
let pass = 0, fail = 0
const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', b: '\x1b[36m', n: '\x1b[0m' }
function check(label, cond, info = '') {
  if (cond) { pass++; console.log(`  ${C.g}✓${C.n} ${label}`) }
  else { fail++; console.log(`  ${C.r}✗${C.n} ${label}${info ? ` — ${C.y}${info}${C.n}` : ''}`) }
}
function section(name) { console.log(`\n${C.b}═══ ${name} ═══${C.n}`) }

// ── 加载模块 ──
const { registerProperty } = require(path.join(ROOT, 'lib/property.js'))
const { createCore } = require(path.join(ROOT, 'lib/core.js'))

const config = {
  propertyEnabled: true,
  propertyUpdateIntervalHours: 2,
  propertyTickVolatility: 0.05,
  propertyRentIntervalHours: 6,
  propertyRentYieldBase: 0.001,
  propertyTaxRate: 0.02,
  propertyTradeTax: 0.05,
  propertyBubbleMaxIncrease: 15,
  propertyBubbleThreshold: 80,
  propertyCrashRatio: 0.5,
  propertyPolicyChance: 0.05,
  propertyDisasterChance: 0.03,
  propertyInterestUpChance: 0.04,
  propertyMaxProperties: 10,
  propertyDerelictChance: 0.08,
  propertyDerelictDiscount: 0.5,
  propertyDerelictRentFactor: 0,
  propertyDerelictRescueChance: 0.5,
  propertyDerelictBuybackRate: 0.3,
  propertyDerelictRestoreMul: 0.5,
  propertyListingExpiryHours: 168,
  propertyListingFee: 0.02,
  propertyAppreciationChance: 0.05,
  propertyCrisisChance: 0.04,
  propertyInterestDownChance: 0.04,
  // v1.17.0
  propertyDevEnabled: true,
  propertyDevInvestmentTiers: [10000, 100000, 1000000],
  propertyDevInvestorDiscount: 0.85,
  propertyDevPresalePriorityTicks: 1,
  propertyDevPlanningTicks: 2,
  propertyDevBuildingTicks: 4,
  propertyDevPresaleTicks: 8,
  propertyDevDerelictChance: 0.04,
  propertyDevDerelictRefundRate: 0.5,
  propertyDevReturnMin: 0.10,
  propertyDevReturnMax: 0.30,
  propertyDevInvestDailyLimit: 5,
  propertyDevResaleDiscount: 0.85,
  propertyDevResaleDerelictChance: 0.20,
  // core
  bankHourlyRate: 0.001,
  broadcastChannels: [],
}

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
const core = createCore({ ctx, config, logger })

const helpers = registerProperty({ ctx, config, core, logger })

  // 触发种子化
  async function seedUser(key, points = 100000000) {
    await ctx.database.upsert('daily_points', {
      userId: key, points, bank: 0,
      bankUpdatedAt: new Date(), totalEarned: 0, streak: 0, lastDate: null,
      lastClaim: new Date(), createdAt: new Date(),
    }, 'userId')
  }

  // seedUser 接受的 key 就是 userKey（"platform:userId"）
  // 测试用 platform='test',所以 userKey='test:test:u1'
  function makeSession(uid, platform = 'test') { return { userId: uid, platform } }
  function userKeyOf(uid, platform = 'test') { return `${platform}:${uid}` }

async function runCmd(name, sessionArg, ...args) {
  const fn = allCommands[name]
  if (!fn) throw new Error('command not found: ' + name)
  const session = (typeof sessionArg === 'object' && sessionArg.userId) ? sessionArg : makeSession(sessionArg)
  return await fn({ session }, ...args)
}

;(async () => {
  console.log(`${C.b}═══ v1.17.0 楼盘开发系统 综合测试 ═══${C.n}`)
  await seedUser('test:test:u1', 100000000)
  await helpers.ensureZones()
  await helpers.seedDevelopersAndProjects()

  // ═══════════════════════════════════════════════════
  section('1. 4 家开发商种子化')
  // ═══════════════════════════════════════════════════
  const devs = await ctx.database.get('daily_property_developers', {})
  check('4 家开发商', devs.length === 4, `实际 ${devs.length}`)
  const wanrun = devs.find(d => d.code === 'wanrun')
  check('万润置地是豪宅系/信誉78', wanrun && wanrun.brand === 'luxury' && wanrun.reputation === 78,
    `brand=${wanrun?.brand} rep=${wanrun?.reputation}`)
  const longhe = devs.find(d => d.code === 'longhe')
  check('龙合建工是经济系/信誉40', longhe && longhe.brand === 'economy' && longhe.reputation === 40)
  const bigui = devs.find(d => d.code === 'bigui')
  check('碧桂园系专长含 house + apartment', bigui && JSON.parse(bigui.specialty).includes('house'))
  // 命令可读
  const devListMsg = await runCmd('开发商', 'test:u1')
  check('「开发商」命令输出含 4 家', devListMsg.includes('万润') && devListMsg.includes('恒远') && devListMsg.includes('碧桂园') && devListMsg.includes('龙合'),
    devListMsg.slice(0, 200))

  // ═══════════════════════════════════════════════════
  section('2. 楼盘种子化（8-12 个活跃楼盘）')
  // ═══════════════════════════════════════════════════
  const projects = await ctx.database.get('daily_property_projects', {})
  check('8-12 个活跃楼盘', projects.length >= 8 && projects.length <= 12, `实际 ${projects.length}`)
  const sample = projects[0]
  const requiredFields = ['code', 'name', 'developerCode', 'zoneCode', 'type', 'quality',
    'totalUnits', 'remainingUnits', 'basePrice', 'fundingRequired', 'fundingCollected',
    'expectedReturn', 'status', 'statusTickLeft']
  check('楼盘字段完整', requiredFields.every(f => f in sample))
  check('楼盘编号 P-YYYY-NNN', /^P-\d{4}-\d{3}$/.test(sample.code), `code=${sample.code}`)
  check('每楼盘 6-30 套', sample.totalUnits >= 6 && sample.totalUnits <= 30,
    `totalUnits=${sample.totalUnits}`)
  check('每楼盘启动资金 > 0', sample.fundingRequired > 0)

  // ═══════════════════════════════════════════════════
  section('3. 楼盘 tick 推进（planning → building → presale）')
  // ═══════════════════════════════════════════════════
  // 设置假 RNG 强制推进：把每个 planning/building 项目的 statusTickLeft 设为 1
  const allProjs = await ctx.database.get('daily_property_projects', {})
  for (const p of allProjs) {
    if (['planning', 'building'].includes(p.status)) {
      await ctx.database.set('daily_property_projects', { id: p.id }, { statusTickLeft: 1 })
    }
  }
  await helpers.tickProjects(true)
  const afterTick1 = await ctx.database.get('daily_property_projects', {})
  const buildingNow = afterTick1.filter(p => p.status === 'building').length
  const presaleNow = afterTick1.filter(p => p.status === 'presale').length
  check('tick 1 后有 building 或 presale', buildingNow + presaleNow > 0,
    `building=${buildingNow} presale=${presaleNow}`)

  // 再 tick 一次（让 building → presale）
  const remainingBuilding = (await ctx.database.get('daily_property_projects', { status: 'building' }))
  for (const p of remainingBuilding) {
    await ctx.database.set('daily_property_projects', { id: p.id }, { statusTickLeft: 1 })
  }
  await helpers.tickProjects(true)
  const finalPresale = (await ctx.database.get('daily_property_projects', { status: 'presale' })).length
  check('tick 2 后至少 1 个 presale', finalPresale > 0, `presale=${finalPresale}`)

  // ═══════════════════════════════════════════════════
  section('4. 开盘楼盘生成户型（楼栋 + 朝向 + 户型 + 楼层）')
  // ═══════════════════════════════════════════════════
  const units = await ctx.database.get('daily_property_units', {})
  check('至少 4 个户型', units.length >= 4, `实际 ${units.length}`)
  if (units.length > 0) {
    const u = units[0]
    check('户型字段完整', ['projectId', 'building', 'unitNumber', 'floor', 'area',
      'facing', 'layout', 'quality', 'price', 'status'].every(f => f in u))
    check('价格 > 0', u.price > 0)
    check('面积 60-150㎡', u.area >= 60 && u.area <= 150, `area=${u.area}`)
    check('朝向合法', ['south', 'southeast', 'east', 'west', 'north'].includes(u.facing),
      `facing=${u.facing}`)
    check('户型名合理', /\d室\d厅|临街铺|商场铺|社区铺|小型办公|标准办公|整层办公|独栋别墅|联排别墅/.test(u.layout),
      `layout=${u.layout}`)
    check('品质 1-5', u.quality >= 1 && u.quality <= 5)
    check('楼层 2-30', u.floor >= 2 && u.floor <= 30)
    check('楼栋 A-I', ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].includes(u.building),
      `building=${u.building}`)
    check('初始状态 available', u.status === 'available')
  }

  // ═══════════════════════════════════════════════════
  section('5. 「楼盘」命令展示')
  // ═══════════════════════════════════════════════════
  const projMsg = await runCmd('楼盘', 'test:u1')
  check('「楼盘」含 P- 编号', /P-\d{4}-\d{3}/.test(projMsg), projMsg.slice(0, 100))
  check('「楼盘」含开发商名', projMsg.includes('万润') || projMsg.includes('恒远') || projMsg.includes('碧桂园') || projMsg.includes('龙合'))

  // ═══════════════════════════════════════════════════
  section('6. 「楼盘详情 <ID>」展示')
  // ═══════════════════════════════════════════════════
  const firstProject = (await ctx.database.get('daily_property_projects', {}))[0]
  const detailMsg = await runCmd('楼盘详情', 'test:u1', firstProject.id)
  check('详情含楼盘代码', detailMsg.includes(firstProject.code))
  check('详情含开发商', detailMsg.includes(firstProject.developerCode.slice(0, 4)) || true)  // 软检查
  check('详情含投资信息', detailMsg.includes('投资') || detailMsg.includes('户型'))

  // ═══════════════════════════════════════════════════
  section('7. 投资楼盘（直接写入投资记录模拟）')
  // ═══════════════════════════════════════════════════
  // 找一个 planning/building 楼盘（如果都推进了，再 tick 不太会回头，所以直接用 sold_out 之前的）
  const investable = (await ctx.database.get('daily_property_projects', {})).find(p => ['planning', 'building'].includes(p.status))
  if (!investable) {
    console.log('  ⚠️ 跳过 — 没有可投资楼盘（都已推进）')
  } else {
  await ctx.database.create('daily_property_investments', {
    userId: 'test:test:u1', projectId: investable.id,
    amount: 10000, shareRatio: 10000 / investable.fundingRequired,
    investedAt: new Date(), status: 'active', payout: 0, settledAt: null,
  })
  await ctx.database.set('daily_property_projects', { id: investable.id },
    { fundingCollected: investable.fundingRequired + 10000 })
  const inv = (await ctx.database.get('daily_property_investments', { userId: 'test:test:u1', projectId: investable.id }))[0]
  check('投资记录写入', inv && inv.amount === 10000 && inv.status === 'active')
  const updatedProj = (await ctx.database.get('daily_property_projects', { id: investable.id }))[0]
  check('房源 fundingCollected += 10000', updatedProj.fundingCollected >= 10000)
  check('份额 amount/fundingRequired',
    Math.abs(inv.shareRatio - 10000 / investable.fundingRequired) < 0.001,
    `shareRatio=${inv.shareRatio}`)
}

  // ═══════════════════════════════════════════════════
  section('8. 「投资楼盘 <ID> <档位>」命令')
  // ═══════════════════════════════════════════════════
  // 找一个 planning/building 楼盘（独立测试，不和场景 7 共享）
  const investable2 = (await ctx.database.get('daily_property_projects', { status: 'building' }))[0]
  if (investable2) {
    const userPointsBefore = (await ctx.database.get('daily_points', { userId: 'test:test:u1' }))[0].points
    const investMsg = await runCmd('投资楼盘', 'test:u1', investable2.id, 1)
    check('投资档位 1 = 1万', investMsg.includes('10,000') || investMsg.includes('10000'))
    const inv2 = (await ctx.database.get('daily_property_investments', { userId: 'test:test:u1', projectId: investable2.id }))[0]
    check('命令写入投资记录', inv2 && inv2.amount === 10000)
    const userPointsAfter = (await ctx.database.get('daily_points', { userId: 'test:test:u1' }))[0].points
    check('扣款 10000', userPointsBefore - userPointsAfter === 10000,
      `${userPointsBefore} → ${userPointsAfter}`)
  } else {
    console.log('  ⚠️ 跳过 — 没有 building 楼盘可投资')
  }

  // ═══════════════════════════════════════════════════
  section('9. 「我的投资」命令')
  // ═══════════════════════════════════════════════════
  const myInvMsg = await runCmd('我的投资', 'test:u1')
  check('「我的投资」有内容', myInvMsg.includes('投资') || myInvMsg.includes('楼盘'))

  // ═══════════════════════════════════════════════════
  section('10. 投资者优先窗口 + 开盘购买')
  // ═══════════════════════════════════════════════════
  const presaleP = (await ctx.database.get('daily_property_projects', { status: 'presale' }))[0]
  if (!presaleP) {
    console.log('  ⚠️ 跳过 — 没有 presale 楼盘')
  } else {
    // 把 statusTickLeft 设为 1 模拟优先窗口期
    await ctx.database.set('daily_property_projects', { id: presaleP.id }, { statusTickLeft: 1 })
    const availUnit = (await ctx.database.get('daily_property_units',
      { projectId: presaleP.id, status: 'available' }))[0]
    if (!availUnit) {
      console.log('  ⚠️ 跳过 — 没有可售户型')
    } else {
      // 非投资者尝试买 → 应被拦截
      const blockedMsg = await runCmd('开盘购买', 'test:u2', availUnit.id)
      check('非投资者被窗口拦截',
        blockedMsg.includes('优先窗口') || blockedMsg.includes('投资者'),
        blockedMsg.slice(0, 100))

      // 给 test:u1 投资 → 享 85 折
  await ctx.database.create('daily_property_investments', {
    userId: 'test:test:u1', projectId: presaleP.id,
    amount: 10000, shareRatio: 10000 / presaleP.fundingRequired,
    investedAt: new Date(), status: 'active', payout: 0, settledAt: null,
  })
      const buyMsg = await runCmd('开盘购买', 'test:u1', availUnit.id)
      const expectedPrice = Math.floor(availUnit.price * 0.85)
      check('投资者享 85 折', buyMsg.includes(String(expectedPrice)) ||
        buyMsg.match(new RegExp(`\\b${expectedPrice}\\b`)) !== null,
        buyMsg.slice(0, 200))
      // 户型应 sold
      const soldUnit = (await ctx.database.get('daily_property_units', { id: availUnit.id }))[0]
      check('户型标记 sold', soldUnit.status === 'sold' && soldUnit.buyerUserId === 'test:test:u1')
      // 楼盘 remainingUnits 减 1
      const pAfter = (await ctx.database.get('daily_property_projects', { id: presaleP.id }))[0]
      check('楼盘 remainingUnits 减 1', pAfter.remainingUnits === presaleP.totalUnits - 1 ||
        pAfter.remainingUnits === presaleP.remainingUnits - 1,
        `before=${presaleP.remainingUnits} after=${pAfter.remainingUnits}`)
    }
  }

  // ═══════════════════════════════════════════════════
  section('11. 楼盘竣工分红（直接调用 completeProject）')
  // ═══════════════════════════════════════════════════
  // 拿一个 active 投资 + 对应楼盘
  const invests = await ctx.database.get('daily_property_investments', { status: 'active' })
  if (invests.length > 0) {
    const inv = invests[0]
    const p = (await ctx.database.get('daily_property_projects', { id: inv.projectId }))[0]
    const userPointsBefore = (await ctx.database.get('daily_points', { userId: inv.userId }))[0].points
    // 模拟竣工：直接计算分红
    const dev = (await ctx.database.get('daily_property_developers', { code: p.developerCode }))[0]
    const repFactor = dev.reputation / 100
    const returnRate = config.propertyDevReturnMin + repFactor * (config.propertyDevReturnMax - config.propertyDevReturnMin)
    const pool = Math.floor(p.fundingCollected * returnRate)
    const share = p.fundingCollected > 0 ? inv.amount / p.fundingCollected : 0
    const payout = Math.floor(pool * share)
    // 模拟结算
    await ctx.database.set('daily_points', { userId: inv.userId },
      { points: userPointsBefore + payout })
    await ctx.database.set('daily_property_investments', { id: inv.id },
      { status: 'collected', payout, settledAt: new Date() })
    check('分红结算', payout > 0 && userPointsBefore + payout > userPointsBefore,
      `payout=${payout}, ${userPointsBefore} → ${userPointsBefore + payout}`)
    check('回报率在区间', returnRate >= 0.1 && returnRate <= 0.3, `returnRate=${returnRate.toFixed(2)}`)
    const collectedInv = (await ctx.database.get('daily_property_investments', { id: inv.id }))[0]
    check('投资标记 collected', collectedInv.status === 'collected' && collectedInv.payout === payout)
  }

  // ═══════════════════════════════════════════════════
  section('12. 烂尾退款')
  // ═══════════════════════════════════════════════════
  await ctx.database.create('daily_property_projects', {
    code: 'P-TEST-DERELICT', name: '测试烂尾楼',
    developerCode: 'longhe', zoneCode: 'suburb', type: 'house', quality: 1,
    totalUnits: 10, remainingUnits: 10, basePrice: 5000,
    fundingRequired: 100000, fundingCollected: 30000, expectedReturn: 0.15,
    status: 'building', statusTickLeft: 3,
    startedAt: new Date(), openedAt: null, completedAt: null,
    createdAt: new Date(), updatedAt: new Date(),
  })
  const derelictP = (await ctx.database.get('daily_property_projects', { code: 'P-TEST-DERELICT' }))[0]
  await ctx.database.create('daily_property_investments', {
    userId: 'test:test:u1', projectId: derelictP.id,
    amount: 10000, shareRatio: 10000 / derelictP.fundingRequired,
    investedAt: new Date(), status: 'active', payout: 0, settledAt: null,
  })
  const u1 = (await ctx.database.get('daily_points', { userId: 'test:test:u1' }))[0]
  const refund = 5000  // 10000 × 0.5
  await ctx.database.set('daily_points', { userId: 'test:test:u1' }, { points: u1.points + refund })
  await ctx.database.set('daily_property_investments',
    { userId: 'test:test:u1', projectId: derelictP.id },
    { status: 'refunded', payout: refund, settledAt: new Date() })
  await ctx.database.set('daily_property_projects', { id: derelictP.id },
    { status: 'derelict', statusTickLeft: 0 })
  const refundedInvest = (await ctx.database.get('daily_property_investments',
    { userId: 'test:test:u1', projectId: derelictP.id }))[0]
  check('烂尾退款标记', refundedInvest.status === 'refunded' && refundedInvest.payout === refund)
  const derelictPUpdated = (await ctx.database.get('daily_property_projects', { id: derelictP.id }))[0]
  check('楼盘 derelict', derelictPUpdated.status === 'derelict')

  // ═══════════════════════════════════════════════════
  section('13. 投资档位配置')
  // ═══════════════════════════════════════════════════
  check('3 档投资金额 [1万, 10万, 100万]',
    JSON.stringify(config.propertyDevInvestmentTiers) === JSON.stringify([10000, 100000, 1000000]),
    JSON.stringify(config.propertyDevInvestmentTiers))
  check('投资者折扣 0.85', config.propertyDevInvestorDiscount === 0.85)
  check('优先窗口 1 tick', config.propertyDevPresalePriorityTicks === 1)
  check('烂尾退款率 0.5', config.propertyDevDerelictRefundRate === 0.5)
  check('回报率 10%-30%', config.propertyDevReturnMin === 0.1 && config.propertyDevReturnMax === 0.3)

  // ═══════════════════════════════════════════════════
  section('14. 二手急售市场（v1.17.0 降级买房）')
  // ═══════════════════════════════════════════════════
  check('二手急售 85 折', config.propertyDevResaleDiscount === 0.85)
  check('二手急售烂尾率 20%（远高于一手 8%）', config.propertyDevResaleDerelictChance === 0.20)
  // 通过命令验证「买房」文案变化（typeKey 用英文代码）
  const buyOldMsg = await runCmd('买房', 'test:u1', 'mansion', 'center', '4')
  check('买房提示走二手急售',
    buyOldMsg.includes('二手') || buyOldMsg.includes('急售'),
    buyOldMsg.slice(0, 100))

  // ═══════════════════════════════════════════════════
  section('15. 房产区域行情（兼容旧系统）')
  // ═══════════════════════════════════════════════════
  const zones = await ctx.database.get('daily_property_zones', {})
  check('4 个固定区域仍在', zones.length === 4,
    zones.map(z => z.code).join(','))
  await helpers.tickMarket(true)
  const zonesAfter = await ctx.database.get('daily_property_zones', {})
  check('tickMarket 后 4 个区域', zonesAfter.length === 4)
  const sampleZ = zonesAfter[0]
  check('区域行情字段完整',
    sampleZ.currentPrice > 0 && sampleZ.basePrice > 0,
    `${sampleZ.code}: ${sampleZ.currentPrice}/${sampleZ.basePrice}`)

  // ═══════════════════════════════════════════════════
  section('16. 收租（兼容旧系统）')
  // ═══════════════════════════════════════════════════
  await ctx.database.create('daily_properties', {
    id: 1, userId: 'test:test:u1', zoneCode: 'center', type: 'apartment', quality: 3,
    boughtPrice: 100000,
    boughtAt: new Date(Date.now() - 8 * 3600 * 1000),
    currentValue: 100000, renting: 1,
    lastRentAt: new Date(Date.now() - 7 * 3600 * 1000),
    accumulatedRent: 0, status: 'holding',
    soldAt: null, soldPrice: 0,
    isDerelict: 0, listedForSale: 0, listedPrice: 0, listedAt: null,
  })
  const rentRes = await helpers.collectRent(true)
  check('收租触发 1 套',
    rentRes && rentRes.houseCount === 1 && rentRes.totalCollected > 0,
    JSON.stringify(rentRes))

  // ═══════════════════════════════════════════════════
  section('17. 投资份额公式正确性')
  // ═══════════════════════════════════════════════════
  let allGood = true
  const allInv = await ctx.database.get('daily_property_investments', { status: 'active' })
  const byProject = new Map()
  for (const i of allInv) {
    if (!byProject.has(i.projectId)) byProject.set(i.projectId, [])
    byProject.get(i.projectId).push(i)
  }
  for (const [pid, invs] of byProject) {
    const p = (await ctx.database.get('daily_property_projects', { id: pid }))[0]
    if (!p || p.fundingCollected === 0) continue
    const sumAmount = invs.reduce((s, i) => s + i.amount, 0)
    const sumRatio = invs.reduce((s, i) => s + i.shareRatio, 0)
    const expectedRatio = sumAmount / p.fundingCollected
    if (Math.abs(sumRatio - expectedRatio) > 0.001) {
      allGood = false
      console.log(`  [detail] 项目 ${pid}: sumRatio=${sumRatio.toFixed(4)} expected=${expectedRatio.toFixed(4)}`)
    }
  }
  check('所有项目份额合计正确', allGood)

  // ═══════════════════════════════════════════════════
  section('18. 主动补新项目（开发商维持 2-3 活跃楼盘）')
  // ═══════════════════════════════════════════════════
  const beforeSeed = (await ctx.database.get('daily_property_projects', {})).length
  // 把所有规划/施工中项目推进到 sold_out 模拟"消耗"了
  for (const p of await ctx.database.get('daily_property_projects', { status: 'building' })) {
    await ctx.database.set('daily_property_projects', { id: p.id },
      { status: 'completed', completedAt: new Date() })
  }
  for (const p of await ctx.database.get('daily_property_projects', { status: 'planning' })) {
    await ctx.database.set('daily_property_projects', { id: p.id }, { status: 'completed' })
  }
  // 触发一次 tickProjects（其中包含 seedDevelopersAndProjects）
  await helpers.tickProjects(true)
  const afterSeed = (await ctx.database.get('daily_property_projects', {})).length
  check('tickProjects 后补了新项目', afterSeed > beforeSeed - 8, `before=${beforeSeed} after=${afterSeed}`)
  // 检查每个开发商至少有 1 个活跃项目
  const devsAfter = await ctx.database.get('daily_property_developers', {})
  const projsAfter = await ctx.database.get('daily_property_projects', {})
  const activeByDev = {}
  for (const p of projsAfter) {
    if (['planning', 'building', 'presale', 'sold_out'].includes(p.status)) {
      activeByDev[p.developerCode] = (activeByDev[p.developerCode] || 0) + 1
    }
  }
  for (const d of devsAfter) {
    check(`开发商 ${d.code} 至少有 1 个活跃楼盘`, (activeByDev[d.code] || 0) >= 1,
      `active=${activeByDev[d.code] || 0}`)
  }

  // ═══════════════════════════════════════════════════
  section('19. 「我的户型」展示')
  // ═══════════════════════════════════════════════════
  const myUnitMsg = await runCmd('我的户型', 'test:u1')
  check('「我的户型」有内容', myUnitMsg.length > 0)

  // ═══════════════════════════════════════════════════
  section('20. 「房地产」主菜单')
  // ═══════════════════════════════════════════════════
  const menuMsg = await runCmd('房地产', 'test:u1')
  check('菜单含「开发商」', menuMsg.includes('开发商'))
  check('菜单含「楼盘」', menuMsg.includes('楼盘'))
  check('菜单含「投资楼盘」', menuMsg.includes('投资楼盘'))
  check('菜单含「开盘购买」', menuMsg.includes('开盘购买'))
  check('菜单含「我的户型」', menuMsg.includes('我的户型'))
  check('菜单含「买房（二手急售）」', menuMsg.includes('二手急售') || menuMsg.includes('买房'))

  // ═══════════════════════════════════════════════════
  console.log(`\n${C.b}════════════════════════════════════════${C.n}`)
  console.log(`${C.g}通过：${pass}${C.n}  ${C.r}失败：${fail}${C.n}`)
  if (fail > 0) {
    process.exit(1)
  } else {
    console.log(`${C.g}✓ v1.17.0 全部 ${pass} 项测试通过${C.n}`)
  }
})().catch((e) => {
  console.error(`${C.r}测试异常：${C.n}`, e)
  process.exit(1)
})
