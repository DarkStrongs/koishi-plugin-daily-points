const test = require('node:test')
const assert = require('node:assert/strict')

const {
  answerQuestion,
  createCampaignSession,
  currentQuestion,
  finalizeCampaign,
  projectCampaign,
  resolveState,
  visitState,
} = require('../lib/campaign/engine.js')
const { BUILTIN_SCENARIOS, getCandidate } = require('../lib/campaign/scenarios.js')
const { buildMapHtml } = require('../lib/campaign/render.js')
const { MAX_SCENARIO_BYTES, parseScenarioJson, validateScenario } = require('../lib/campaign/validator.js')

function playableRoutes() {
  return BUILTIN_SCENARIOS.flatMap((scenario) => scenario.routes.map((route) => ({ scenario, route })))
}

function finishCampaign(scenario, candidateId, difficulty = 'normal', seed = 20200905) {
  const session = createCampaignSession(scenario, candidateId, difficulty, seed)
  for (let turn = 0; turn < 15; turn++) {
    answerQuestion(scenario, session, turn % 4 + 1)
    visitState(scenario, session, ['PA', 'OH', 'CA', 'TX'][turn % 4])
  }
  return session
}

test('内置场景拥有完整年份、州和选举人票数据', () => {
  assert.deepEqual(BUILTIN_SCENARIOS.map((item) => item.year), [1960, 1964, 1968, 2020])
  assert.deepEqual(BUILTIN_SCENARIOS.map((item) => item.totalElectoralVotes), [537, 538, 538, 538])
  for (const scenario of BUILTIN_SCENARIOS) {
    assert.equal(scenario.states.length, 51)
    assert.equal(scenario.majority, Math.floor(scenario.totalElectoralVotes / 2) + 1)
    assert.equal(scenario.routes.length, 2)
    assert.equal(validateScenario(scenario).valid, true, validateScenario(scenario).errors.join('\n'))
    for (const route of scenario.routes) {
      assert.equal(route.slots.length, 15)
      assert.equal(route.slots.filter((slot) => slot.variants.length > 1).length, 3)
      for (const slot of route.slots) for (const variant of slot.variants) assert.equal(variant.options.length, 4)
    }
  }
})

test('八条候选人路线均严格完成十五轮', () => {
  assert.equal(playableRoutes().length, 8)
  for (const { scenario, route } of playableRoutes()) {
    for (const difficulty of ['easy', 'normal', 'hard']) {
      const session = finishCampaign(scenario, route.candidateId, difficulty)
      assert.equal(session.turn, 15)
      assert.equal(session.answers.length, 15)
      assert.equal(session.visits.length, 15)
      assert.equal(session.phase, 'completed')
      const result = finalizeCampaign(scenario, session)
      assert.equal(result.playerElectoralVotes + result.opponentElectoralVotes + result.thirdPartyElectoralVotes, scenario.totalElectoralVotes)
      assert.ok(['win', 'loss', 'tie'].includes(result.outcome))
    }
  }
})

test('答题、访问和分支阶段不可跳过或重复', () => {
  const scenario = BUILTIN_SCENARIOS[0]
  const session = createCampaignSession(scenario, 'kennedy-1960', 'normal', 1)
  assert.throws(() => visitState(scenario, session, 'PA'), /先回答/)
  assert.throws(() => answerQuestion(scenario, session, 0), /1—4/)
  answerQuestion(scenario, session, 1)
  assert.throws(() => answerQuestion(scenario, session, 1), /不是答题阶段/)
  assert.throws(() => visitState(scenario, session, '不存在'), /无效/)
  visitState(scenario, session, 'PA')
  for (let turn = 1; turn < 4; turn++) {
    answerQuestion(scenario, session, 1)
    visitState(scenario, session, 'PA')
  }
  assert.match(currentQuestion(scenario, session).id, /moderate$/)
})

test('州名和缩写均可解析，重复访问收益递减', () => {
  const scenario = BUILTIN_SCENARIOS[3]
  assert.equal(resolveState(scenario, '宾夕法尼亚州').id, 'PA')
  assert.equal(resolveState(scenario, 'pa').id, 'PA')
  const session = createCampaignSession(scenario, 'biden-2020', 'normal', 2)
  answerQuestion(scenario, session, 1)
  const first = visitState(scenario, session, 'PA').gain
  answerQuestion(scenario, session, 1)
  const second = visitState(scenario, session, '宾夕法尼亚').gain
  assert.ok(second < first)
})

test('固定种子的民调和最终结果可复现且票数守恒', () => {
  const scenario = BUILTIN_SCENARIOS[3]
  const first = createCampaignSession(scenario, 'trump-2020', 'hard', 777)
  const second = createCampaignSession(scenario, 'trump-2020', 'hard', 777)
  assert.deepEqual(projectCampaign(scenario, first, true), projectCampaign(scenario, second, true))
  const poll = projectCampaign(scenario, first, true)
  for (const state of poll.states) {
    assert.ok(Math.abs(state.playerShare + state.opponentShare + state.thirdPartyShare - 100) < 1e-8)
  }
})

test('1968 华莱士参与计票，2020 缅因和内布拉斯加按分区计票', () => {
  const scenario1968 = BUILTIN_SCENARIOS.find((item) => item.year === 1968)
  const wallace = scenario1968.candidates.find((item) => item.id === 'wallace-1968')
  assert.equal(wallace.playable, false)
  const session1968 = createCampaignSession(scenario1968, 'humphrey-1968', 'normal', 8)
  assert.ok(projectCampaign(scenario1968, session1968).thirdPartyElectoralVotes > 0)

  const scenario2020 = BUILTIN_SCENARIOS.find((item) => item.year === 2020)
  assert.equal(scenario2020.states.find((item) => item.id === 'ME').districts.reduce((sum, item) => sum + item.electoralVotes, 0), 4)
  assert.equal(scenario2020.states.find((item) => item.id === 'NE').districts.reduce((sum, item) => sum + item.electoralVotes, 0), 5)
  const projection = projectCampaign(scenario2020, createCampaignSession(scenario2020, 'biden-2020', 'normal', 3))
  assert.equal(projection.playerElectoralVotes + projection.opponentElectoralVotes + projection.thirdPartyElectoralVotes, 538)
})

test('无人取得过半时记为平局并进入国会裁决', () => {
  const scenario = structuredClone(BUILTIN_SCENARIOS.find((item) => item.year === 2020))
  scenario.states.forEach((state) => { state.districts = undefined; state.thirdPartyShare = 0 })
  const session = createCampaignSession(scenario, 'biden-2020', 'normal', 42)
  const states = scenario.states.filter((state) => state.electoralVotes > 0)
  const reachable = new Map([[0, []]])
  for (const state of states) {
    for (const [sum, picked] of [...reachable.entries()].sort((a, b) => b[0] - a[0])) {
      if (sum + state.electoralVotes <= 269 && !reachable.has(sum + state.electoralVotes)) reachable.set(sum + state.electoralVotes, [...picked, state.id])
    }
  }
  const playerStates = new Set(reachable.get(269))
  assert.equal(playerStates.size > 0, true)
  for (const state of states) session.stateMargins[state.id] = playerStates.has(state.id) ? 30 : -30
  session.phase = 'completed'
  session.turn = 15
  const result = finalizeCampaign(scenario, session)
  assert.equal(result.playerElectoralVotes, 269)
  assert.equal(result.opponentElectoralVotes, 269)
  assert.equal(result.outcome, 'tie')
  assert.equal(result.contingentElection, true)
})

test('自定义场景导入严格校验保留ID、恶意文本、体积和效果范围', () => {
  const custom = structuredClone(BUILTIN_SCENARIOS[0])
  custom.id = 'sample-1960'
  const valid = parseScenarioJson('```json\n' + JSON.stringify(custom) + '\n```')
  assert.equal(valid.valid, true, valid.errors.join('\n'))
  assert.equal(valid.scenario.id, 'custom/sample-1960')

  custom.id = '1960'
  assert.equal(parseScenarioJson(JSON.stringify(custom)).valid, false)
  custom.id = 'sample-xss'
  custom.title = '<script>alert(1)</script>'
  assert.equal(parseScenarioJson(JSON.stringify(custom)).valid, false)
  custom.title = '安全标题'
  custom.routes[0].slots[0].variants[0].options[0].effect.national = 99
  assert.equal(parseScenarioJson(JSON.stringify(custom)).valid, false)
  assert.equal(parseScenarioJson('x'.repeat(MAX_SCENARIO_BYTES + 1)).valid, false)
})

test('地图完全使用本地内容并转义场景文本', () => {
  const scenario = structuredClone(BUILTIN_SCENARIOS[3])
  const session = createCampaignSession(scenario, 'biden-2020', 'normal', 10)
  const projection = projectCampaign(scenario, session, true)
  scenario.title = '<script>bad()</script>'
  const html = buildMapHtml(scenario, session, projection)
  assert.doesNotMatch(html, /<script>bad/)
  assert.match(html, /&lt;script&gt;bad/)
  assert.doesNotMatch(html, /https?:\/\//)
})

