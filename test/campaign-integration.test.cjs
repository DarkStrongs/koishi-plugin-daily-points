const test = require('node:test')
const assert = require('node:assert/strict')

const { applyCampaign } = require('../lib/campaign/index.js')
const { BUILTIN_SCENARIOS } = require('../lib/campaign/scenarios.js')

class MemoryDatabase {
  constructor() { this.tables = new Map(); this.nextId = 1 }
  rows(table) { if (!this.tables.has(table)) this.tables.set(table, []); return this.tables.get(table) }
  matches(row, query) { return Object.entries(query || {}).every(([key, value]) => row[key] === value) }
  async get(table, query, cursor = {}) {
    let rows = this.rows(table).filter((row) => this.matches(row, query)).map((row) => ({ ...row }))
    if (cursor.sort) {
      const [[key, direction]] = Object.entries(cursor.sort)
      rows.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (direction === 'desc' ? -1 : 1))
    }
    if (cursor.limit) rows = rows.slice(0, cursor.limit)
    return rows
  }
  uniqueKey(table, row) {
    if (table === 'daily_campaign_sessions') return `u:${row.userKey}`
    if (table === 'daily_campaign_records') return `s:${row.sessionId}`
    if (table === 'daily_campaign_scenarios') return `v:${row.scenarioId}:${row.version}`
    return undefined
  }
  async upsert(table, input) {
    const rows = this.rows(table)
    for (const item of input) {
      const key = this.uniqueKey(table, item)
      const current = rows.find((row) => this.uniqueKey(table, row) === key)
      if (current) Object.assign(current, item)
      else rows.push({ ...item, id: item.id ?? this.nextId++ })
    }
    return { inserted: input.length }
  }
  async create(table, item) {
    const row = { ...item, id: item.id ?? this.nextId++ }
    this.rows(table).push(row)
    return { ...row }
  }
  async set(table, query, update) {
    const rows = this.rows(table).filter((row) => this.matches(row, query))
    rows.forEach((row) => Object.assign(row, update))
    return { matched: rows.length, modified: rows.length }
  }
  async remove(table, query) {
    const rows = this.rows(table)
    const kept = rows.filter((row) => !this.matches(row, query))
    this.tables.set(table, kept)
    return { removed: rows.length - kept.length }
  }
}

function mockContext(database = new MemoryDatabase()) {
  const actions = new Map()
  const commandConfigs = new Map()
  const middlewares = []
  const ctx = {
    database,
    model: { extend() {} },
    logger: () => ({ warn() {} }),
    command(definition, _description, config) {
      const commandName = definition.split(' ')[0]
      commandConfigs.set(commandName, config || {})
      const command = {
        action(handler) { actions.set(commandName, handler); return command },
        subcommand(suffix, description, childConfig) {
          const childDefinition = suffix.startsWith('.') ? commandName + suffix : `${commandName}.${suffix}`
          return ctx.command(childDefinition, description, childConfig || config)
        },
      }
      return command
    },
    middleware(handler) { middlewares.push(handler) },
  }
  applyCampaign(ctx, { campaignEnabled: true, campaignAdminAuthority: 3 })
  return { ctx, database, actions, commandConfigs, middleware: middlewares[0] }
}

function chat(userId = 'u1', channelId = 'c1', content = '') {
  return { platform: 'test', userId, channelId, content, sent: [], async send(value) { this.sent.push(value) } }
}

test('命令会话持久化、频道隔离并串行处理重复数字', async () => {
  const app = mockContext()
  const session = chat()
  const start = app.actions.get('竞选开始')
  const opening = await start({ session }, '1960', '肯尼迪', '普通')
  assert.match(opening, /第 1\/15 题/)
  assert.equal(app.database.rows('daily_campaign_sessions').length, 1)

  const elsewhere = chat('u1', 'c2', '1')
  const passed = await app.middleware(elsewhere, async () => 'NEXT')
  assert.equal(passed, 'NEXT')

  session.content = '1'
  const [first, duplicate] = await Promise.all([
    app.middleware(session, async () => 'NEXT'),
    app.middleware(session, async () => 'NEXT'),
  ])
  assert.ok([first, duplicate].some((value) => /顾问反馈/.test(value)))
  assert.ok([first, duplicate].some((value) => /本轮已经作答/.test(value)))
  const state = JSON.parse(app.database.rows('daily_campaign_sessions')[0].stateJson)
  assert.equal(state.answers.length, 1)
  assert.equal(state.phase, 'visit')

  const resume = app.actions.get('竞选继续')
  const resumed = await resume({ session: elsewhere })
  assert.match(resumed, /等待访问州/)
  assert.equal(app.database.rows('daily_campaign_sessions')[0].channelKey, 'test:c2')
})

test('管理员场景命令要求三级权限并按版本导入', async () => {
  const app = mockContext()
  for (const name of ['竞选场景', '竞选场景.导入', '竞选场景.列表', '竞选场景.启用', '竞选场景.禁用', '竞选场景.删除', '竞选场景.导出']) {
    assert.equal(app.commandConfigs.get(name).authority, 3, `${name} 应要求三级权限`)
  }
  const custom = structuredClone(BUILTIN_SCENARIOS[0])
  custom.id = 'integration-1960'
  const importScenario = app.actions.get('竞选场景.导入')
  const session = chat('admin')
  assert.match(await importScenario({ session }, JSON.stringify(custom)), /版本 1/)
  assert.match(await importScenario({ session }, JSON.stringify(custom)), /版本 2/)
  const rows = app.database.rows('daily_campaign_scenarios')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].enabled, 0)
  assert.equal(rows[1].enabled, 1)
  assert.equal(rows[1].scenarioId, 'custom/integration-1960')
})

test('重新注册插件后仍能恢复未完成存档', async () => {
  const database = new MemoryDatabase()
  const firstApp = mockContext(database)
  const session = chat()
  await firstApp.actions.get('竞选开始')({ session }, '2020', '拜登', '困难')
  session.content = '2'
  await firstApp.middleware(session, async () => 'NEXT')

  const restarted = mockContext(database)
  const result = await restarted.actions.get('竞选继续')({ session })
  assert.match(result, /等待访问州/)
  assert.match(result, /困难/)
})

test('完整命令流程结算一次战绩并清除活动存档', async () => {
  const app = mockContext()
  const session = chat()
  await app.actions.get('竞选开始')({ session }, '1968', '汉弗莱', '普通')
  const poll = await app.actions.get('竞选民调')({ session })
  assert.match(poll, /第 0\/15 轮民调/)
  let last
  for (let turn = 0; turn < 15; turn++) {
    session.content = String(turn % 4 + 1)
    const answer = await app.middleware(session, async () => 'NEXT')
    assert.match(answer, /顾问反馈/)
    last = await app.actions.get('竞选访问')({ session }, ['PA', 'OH', 'TX'][turn % 3])
  }
  assert.match(last, /(赢得白宫|竞选落败|进入国会裁决)/)
  assert.equal(app.database.rows('daily_campaign_sessions').length, 0)
  assert.equal(app.database.rows('daily_campaign_records').length, 1)
  const records = await app.actions.get('竞选战绩')({ session })
  assert.match(records, /完成 1 局/)
})

test('管理员不能修改内置场景', async () => {
  const app = mockContext()
  assert.match(await app.actions.get('竞选场景.禁用')({}, '1960'), /内置场景不可修改/)
  assert.match(await app.actions.get('竞选场景.删除')({}, 'builtin\/2020'), /内置场景不可修改/)
})
