const assert = require('node:assert/strict')
const Module = require('node:module')

function schemaNode() {
  return new Proxy({}, { get: () => () => schemaNode() })
}

const Schema = new Proxy({}, {
  get: () => () => schemaNode(),
})

const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'koishi') return { Schema, h: (type, attrs) => `<${type}:${attrs.id}>` }
  if (request === 'node:crypto') return { randomInt: (min, max) => max - 1 }
  return originalLoad.call(this, request, parent, isMain)
}

const plugin = require('../lib/index.js')
Module._load = originalLoad

function createDatabase(models) {
  const tables = new Map()
  const nextIds = new Map()
  const rows = (name) => {
    if (!tables.has(name)) tables.set(name, [])
    return tables.get(name)
  }
  const matches = (row, query = {}) => Object.entries(query).every(([key, value]) => {
    if (value && typeof value === 'object' && '$lt' in value) return new Date(row[key]).getTime() < new Date(value.$lt).getTime()
    return row[key] === value
  })
  return {
    tables,
    async get(name, query = {}, options = {}) {
      let result = rows(name).filter((row) => matches(row, query))
      if (options && options.sort) {
        const [key, direction] = Object.entries(options.sort)[0]
        result = result.slice().sort((a, b) => direction === 'desc' ? b[key] - a[key] : a[key] - b[key])
      }
      if (options && options.limit) result = result.slice(0, options.limit)
      if (typeof options === 'number') result = result.slice(0, options)
      return result
    },
    async create(name, data) {
      const row = { ...data }
      const model = models.get(name)
      if (model?.options?.autoInc && row.id == null) {
        const id = (nextIds.get(name) || 0) + 1
        nextIds.set(name, id)
        row.id = id
      }
      rows(name).push(row)
      return row
    },
    async set(name, query, patch) {
      for (const row of rows(name)) if (matches(row, query)) Object.assign(row, patch)
    },
    async remove(name, query) {
      tables.set(name, rows(name).filter((row) => !matches(row, query)))
    },
    async upsert(name, input) {
      const list = Array.isArray(input) ? input : [input]
      const model = models.get(name)
      const unique = model?.options?.unique?.[0]
      const uniqueKeys = Array.isArray(unique) ? unique : unique ? [unique] : [model?.options?.primary || 'id']
      for (const data of list) {
        let row = rows(name).find((candidate) => uniqueKeys.every((key) => candidate[key] === data[key]))
        if (row) Object.assign(row, data)
        else await this.create(name, data)
      }
    },
  }
}

function createContext() {
  const commands = new Map()
  const models = new Map()
  const ctx = {
    model: { extend: (name, fields, options) => models.set(name, { fields, options }) },
    command(name) {
      const command = {
        alias() { return command },
        action(fn) { commands.set(name, fn); return command },
      }
      return command
    },
    middleware() {},
    setInterval() {},
    logger: () => ({ warn() {}, info() {} }),
    broadcast: async () => {},
  }
  ctx.database = createDatabase(models)
  return { ctx, commands, models }
}

const config = {
  stockEnabled: false,
  loanEnabled: false,
  lotteryEnabled: false,
  casinoEnabled: true,
  casinoPoolContributionRate: 0.05,
  casinoMinBet: 10,
  casinoMaxBet: 5000,
  casinoCooldownSeconds: 0,
  blackjackStandOn: 17,
  blackjackHitSoft17: false,
  broadcastChannels: [],
}

async function main() {
  const { ctx, commands, models } = createContext()
  plugin.apply(ctx, config)
  assert(models.has('daily_blackjack_sessions'))
  assert(models.has('daily_casino_stats'))

  const session = { platform: 'test', userId: 'alice' }
  await ctx.database.create('daily_points', {
    userId: 'test:alice', points: 1000, bank: 0, totalEarned: 0, streak: 0,
    bankUpdatedAt: new Date(), createdAt: new Date(),
  })

  const bigSmall = commands.get('经济/娱乐/赌场/猜大小 <amount:string> <choice:string>')
  const diceResult = await bigSmall({ session }, '100', '大')
  assert.match(diceResult, /6 \+ 6 \+ 6 = 18/)
  assert.match(diceResult, /豹子/)
  assert.equal((await ctx.database.get('daily_points', { userId: 'test:alice' }))[0].points, 900)

  const blackjack = commands.get('经济/娱乐/赌场/21点 <amount:string>')
  const opening = await blackjack({ session }, '100')
  assert.match(opening, /请选择「摸牌」「加注 金额」「开牌」或「放弃」/)
  assert.equal((await ctx.database.get('daily_blackjack_sessions', { userId: 'test:alice' })).length, 1)

  const raise = commands.get('经济/娱乐/赌场/21点/加注 <amount:string>')
  await raise({ session }, '50')
  const show = commands.get('经济/娱乐/赌场/21点/开牌')
  const pushResult = await show({ session })
  assert.match(pushResult, /平局退还本金/)
  assert.equal((await ctx.database.get('daily_points', { userId: 'test:alice' }))[0].points, 900)
  assert.equal((await ctx.database.get('daily_blackjack_sessions', { userId: 'test:alice' })).length, 0)

  await ctx.database.set('daily_points', { userId: 'test:alice' }, { points: 800 })
  await ctx.database.create('daily_blackjack_sessions', {
    userId: 'test:alice', bet: 100, playerCards: 'AS,KH', dealerCards: '9D,8C', deck: '2S,3H',
    createdAt: new Date(), updatedAt: new Date(),
  })
  const naturalResult = await show({ session })
  assert.match(naturalResult, /天然 21 点/)
  assert.equal((await ctx.database.get('daily_points', { userId: 'test:alice' }))[0].points, 1050)

  const stats = await ctx.database.get('daily_casino_stats', { userId: 'test:alice', game: 'blackjack' })
  assert.equal(stats[0].plays, 2)
  assert.equal(stats[0].pushes, 1)
  assert.equal(stats[0].naturals, 1)
  assert.equal(stats[0].net, 150)

  const bob = { platform: 'test', userId: 'bob' }
  await ctx.database.create('daily_points', {
    userId: 'test:bob', points: 100, bank: 0, totalEarned: 0, streak: 0,
    bankUpdatedAt: new Date(), createdAt: new Date(),
  })
  const concurrent = await Promise.all([
    bigSmall({ session: bob }, '100', '大'),
    bigSmall({ session: bob }, '100', '大'),
  ])
  assert.equal(concurrent.filter((text) => text.includes('豹子')).length, 1)
  assert.equal(concurrent.filter((text) => text.includes('现金不足')).length, 1)
  assert.equal((await ctx.database.get('daily_points', { userId: 'test:bob' }))[0].points, 0)
  assert.equal((await ctx.database.get('daily_casino_stats', { userId: 'test:bob', game: 'bigsmall' }))[0].plays, 1)

  const report = commands.get('经济/娱乐/赌场/战绩')
  assert.match(await report({ session }), /天然21点 1/)

  console.log('casino tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
