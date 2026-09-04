import {
  CampaignCandidate,
  CampaignDifficulty,
  CampaignEffect,
  CampaignFinalResult,
  CampaignProjection,
  CampaignQuestionVariant,
  CampaignScenario,
  CampaignSessionState,
  CampaignState,
  CampaignStateProjection,
} from './types'
import { getCandidate, getRoute } from './scenarios'

const DIFFICULTY = {
  easy: { initial: 2.5, answer: 1.1, opponentVisit: .85 },
  normal: { initial: 0, answer: 1, opponentVisit: 1 },
  hard: { initial: -2.5, answer: .9, opponentVisit: 1.2 },
} as const

const REGION_ISSUES: Record<string, Record<string, number>> = {
  'new-england': { moderation: .4, rights: .55, diplomacy: .35, economy: .15, security: -.1, federalism: -.2 },
  'mid-atlantic': { moderation: .35, rights: .4, labor: .35, economy: .3, security: .05, federalism: -.1 },
  'great-lakes': { labor: .55, economy: .5, organization: .25, moderation: .15, security: .1 },
  plains: { fiscal: .45, federalism: .35, economy: .3, security: .25, labor: -.1 },
  south: { federalism: .45, security: .35, base: .3, rights: -.35, labor: .05 },
  mountain: { federalism: .55, fiscal: .45, security: .2, environment: -.1 },
  pacific: { rights: .4, diplomacy: .3, environment: .4, moderation: .15, federalism: -.1 },
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function hash32(input: string): number {
  let hash = 2166136261
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function uniform(seed: number, key: string): number {
  let value = hash32(`${seed}:${key}`) || 1
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  return (value >>> 0) / 4294967296
}

function normal(seed: number, key: string): number {
  const first = Math.max(uniform(seed, `${key}:a`), 1e-9)
  const second = uniform(seed, `${key}:b`)
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second)
}

function initialMargin(state: CampaignState, candidate: CampaignCandidate, difficulty: CampaignDifficulty): number {
  const partyMargin = clamp(state.baselineMargin * .35, -12, 12)
  const perspective = candidate.party === 'republican' ? -partyMargin : partyMargin
  return clamp(perspective + DIFFICULTY[difficulty].initial, -18, 18)
}

export function createCampaignSession(
  scenario: CampaignScenario,
  candidateId: string,
  difficulty: CampaignDifficulty = 'normal',
  seed = Math.floor(Math.random() * 0x7fffffff),
  scenarioVersion = 1,
): CampaignSessionState {
  const selected = getCandidate(scenario, candidateId)
  if (!selected || !selected.playable) throw new Error('候选人不存在或不可操作')
  const opponent = scenario.candidates.find((item) => item.playable && item.id !== selected.id)
  if (!opponent) throw new Error('场景缺少可操作的主要对手')
  const stateMargins = Object.fromEntries(scenario.states.map((state) => [state.id, initialMargin(state, selected, difficulty)]))
  return {
    scenarioId: scenario.id,
    scenarioVersion,
    candidateId: selected.id,
    opponentId: opponent.id,
    difficulty,
    phase: 'question',
    turn: 0,
    stateMargins,
    thirdPartyShift: {},
    visitCounts: {},
    opponentVisitCounts: {},
    flags: {},
    answers: [],
    visits: [],
    seed,
    revision: 1,
  }
}

function matches(when: Record<string, string> | undefined, flags: Record<string, string>) {
  if (!when) return true
  return Object.entries(when).every(([key, value]) => flags[key] === value)
}

export function currentQuestion(scenario: CampaignScenario, session: CampaignSessionState): CampaignQuestionVariant | undefined {
  if (session.phase === 'completed') return undefined
  const route = getRoute(scenario, session.candidateId)
  const slot = route?.slots[session.turn]
  if (!slot) return undefined
  return slot.variants.find((variant) => variant.when && matches(variant.when, session.flags))
    || slot.variants.find((variant) => !variant.when)
    || slot.variants[0]
}

function stateEffect(scenario: CampaignScenario, state: CampaignState, value: CampaignEffect): number {
  let delta = value.national || 0
  delta += value.regions?.[state.region] || 0
  delta += value.states?.[state.id] || 0
  const weights = { ...(REGION_ISSUES[state.region] || {}), ...(scenario.issueWeights?.[state.region] || {}) }
  for (const [issue, amount] of Object.entries(value.issues || {})) delta += amount * (weights[issue] || 0)
  return delta
}

export function describeTrend(effect: CampaignEffect): string {
  const values = [effect.national || 0, ...Object.values(effect.regions || {}), ...Object.values(effect.states || {})]
  const average = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
  if (average >= .55) return '全国趋势：明显改善'
  if (average >= .12) return '全国趋势：小幅改善'
  if (average <= -.55) return '全国趋势：明显恶化'
  if (average <= -.12) return '全国趋势：小幅恶化'
  return '全国趋势：总体稳定，影响主要集中在特定地区'
}

export function answerQuestion(scenario: CampaignScenario, session: CampaignSessionState, optionNumber: number) {
  if (session.phase !== 'question') throw new Error('当前不是答题阶段')
  const question = currentQuestion(scenario, session)
  if (!question) throw new Error('当前问题不存在')
  const selected = question.options[optionNumber - 1]
  if (!selected) throw new Error('选项必须是 1—4')
  const multiplier = DIFFICULTY[session.difficulty].answer
  const changes: Array<{ stateId: string, stateName: string, delta: number, electoralVotes: number }> = []
  for (const state of scenario.states) {
    const delta = stateEffect(scenario, state, selected.effect) * multiplier
    const next = session.stateMargins[state.id] + delta
    session.stateMargins[state.id] = clamp(next, -30, 30)
    changes.push({ stateId: state.id, stateName: state.name, delta, electoralVotes: state.electoralVotes })
    if (selected.effect.thirdParty) {
      session.thirdPartyShift[state.id] = clamp((session.thirdPartyShift[state.id] || 0) + selected.effect.thirdParty, -10, 10)
    }
  }
  Object.assign(session.flags, selected.setFlags || {})
  session.answers.push({ turn: session.turn, questionId: question.id, option: optionNumber })
  session.phase = 'visit'
  session.cachedPoll = undefined
  session.cachedPollTurn = undefined
  session.revision++
  const keyStateTrends = changes
    .filter((item) => item.electoralVotes > 0)
    .sort((left, right) => Math.abs(right.delta) + right.electoralVotes * .015 - Math.abs(left.delta) - left.electoralVotes * .015)
    .slice(0, 3)
  return { question, selected, trend: describeTrend(selected.effect), keyStateTrends }
}

export function resolveState(scenario: CampaignScenario, input: string): CampaignState | undefined {
  const value = input.trim().toLowerCase().replace(/州$/, '')
  return scenario.states.find((state) => state.id.toLowerCase() === value
    || state.name.toLowerCase().replace(/州$/, '') === value
    || state.aliases.some((alias) => alias.toLowerCase().replace(/州$/, '') === value))
}

function pickOpponentVisit(scenario: CampaignScenario, session: CampaignSessionState): CampaignState {
  return [...scenario.states]
    .filter((state) => state.electoralVotes > 0)
    .sort((left, right) => {
      const leftScore = left.electoralVotes * 2 - Math.abs(session.stateMargins[left.id]) * 1.5 + uniform(session.seed, `ai:${session.turn}:${left.id}`)
      const rightScore = right.electoralVotes * 2 - Math.abs(session.stateMargins[right.id]) * 1.5 + uniform(session.seed, `ai:${session.turn}:${right.id}`)
      return rightScore - leftScore
    })[0]
}

export function visitState(scenario: CampaignScenario, session: CampaignSessionState, stateInput: string) {
  if (session.phase !== 'visit') throw new Error('请先回答当前问题')
  const state = resolveState(scenario, stateInput)
  if (!state || state.electoralVotes <= 0) throw new Error('州名或缩写无效')
  const count = (session.visitCounts[state.id] || 0) + 1
  session.visitCounts[state.id] = count
  const gain = 1.4 / Math.sqrt(count)
  session.stateMargins[state.id] = clamp(session.stateMargins[state.id] + gain, -30, 30)
  session.visits.push(state.id)

  const opponentState = pickOpponentVisit(scenario, session)
  const opponentCount = (session.opponentVisitCounts[opponentState.id] || 0) + 1
  session.opponentVisitCounts[opponentState.id] = opponentCount
  const opponentGain = (1.15 / Math.sqrt(opponentCount)) * DIFFICULTY[session.difficulty].opponentVisit
  session.stateMargins[opponentState.id] = clamp(session.stateMargins[opponentState.id] - opponentGain, -30, 30)

  session.turn++
  const route = getRoute(scenario, session.candidateId)
  session.phase = session.turn >= (route?.slots.length || 15) ? 'completed' : 'question'
  session.cachedPoll = undefined
  session.cachedPollTurn = undefined
  session.revision++
  return { state, gain, count, opponentState, opponentGain, completed: session.phase === 'completed' }
}

function sharesForMargin(margin: number, thirdShare: number) {
  const third = clamp(thirdShare, 0, 70)
  const available = 100 - third
  const playerTwoParty = clamp(50 + margin / 2, 1, 99)
  const player = available * playerTwoParty / 100
  return { player, opponent: available - player, third }
}

function stateWinner(player: number, opponent: number, third: number, session: CampaignSessionState, scenario: CampaignScenario) {
  if (third > player && third > opponent) return scenario.candidates.find((item) => !item.playable)?.id || 'other'
  return player >= opponent ? session.candidateId : session.opponentId
}

interface ProjectionNoise {
  kind: 'poll' | 'final'
  national: number
  state: number
}

function projectInternal(scenario: CampaignScenario, session: CampaignSessionState, noise?: ProjectionNoise): CampaignProjection {
  const nationalNoise = noise ? normal(session.seed, `${noise.kind}:${session.turn}:national`) * noise.national : 0
  let playerElectoralVotes = 0
  let opponentElectoralVotes = 0
  let thirdPartyElectoralVotes = 0
  let playerVotes = 0
  let opponentVotes = 0
  let thirdVotes = 0
  const states: CampaignStateProjection[] = []

  const addElectors = (winner: string, count: number) => {
    if (winner === session.candidateId) playerElectoralVotes += count
    else if (winner === session.opponentId) opponentElectoralVotes += count
    else thirdPartyElectoralVotes += count
  }

  for (const state of scenario.states) {
    const stateNoise = noise ? normal(session.seed, `${noise.kind}:${session.turn}:${state.id}`) * noise.state : 0
    const margin = session.stateMargins[state.id] + nationalNoise + stateNoise
    const thirdShare = (state.thirdPartyShare || 0) + (session.thirdPartyShift[state.id] || 0)
    const shares = sharesForMargin(margin, thirdShare)
    const winnerId = stateWinner(shares.player, shares.opponent, shares.third, session, scenario)
    playerVotes += shares.player * state.turnout
    opponentVotes += shares.opponent * state.turnout
    thirdVotes += shares.third * state.turnout
    states.push({
      stateId: state.id,
      stateName: state.name,
      electoralVotes: state.electoralVotes,
      playerShare: shares.player,
      opponentShare: shares.opponent,
      thirdPartyShare: shares.third,
      margin: shares.player - shares.opponent,
      winnerId,
    })

    if (state.districts?.length) {
      const initial = initialMargin(state, getCandidate(scenario, session.candidateId)!, session.difficulty)
      const campaignDelta = session.stateMargins[state.id] - initial
      for (const district of state.districts) {
        const raw = getCandidate(scenario, session.candidateId)!.party === 'republican' ? -district.baselineMargin : district.baselineMargin
        const districtNoise = noise ? normal(session.seed, `${noise.kind}:${session.turn}:${district.id}`) * noise.state : 0
        const districtMargin = clamp(raw * .35, -12, 12) + DIFFICULTY[session.difficulty].initial + campaignDelta + nationalNoise + districtNoise
        const districtShares = sharesForMargin(districtMargin, thirdShare)
        addElectors(stateWinner(districtShares.player, districtShares.opponent, districtShares.third, session, scenario), district.electoralVotes)
      }
    } else {
      addElectors(winnerId, state.electoralVotes)
    }
  }
  const totalVotes = playerVotes + opponentVotes + thirdVotes || 1
  return {
    turn: session.turn,
    playerElectoralVotes,
    opponentElectoralVotes,
    thirdPartyElectoralVotes,
    playerPopularShare: playerVotes / totalVotes * 100,
    opponentPopularShare: opponentVotes / totalVotes * 100,
    thirdPartyPopularShare: thirdVotes / totalVotes * 100,
    states,
  }
}

export function projectCampaign(scenario: CampaignScenario, session: CampaignSessionState, polling = false): CampaignProjection {
  return projectInternal(scenario, session, polling ? { kind: 'poll', national: 1.2, state: 1.8 } : undefined)
}

export function finalizeCampaign(scenario: CampaignScenario, session: CampaignSessionState): CampaignFinalResult {
  if (session.phase !== 'completed') throw new Error('竞选尚未完成')
  const projection = projectInternal(scenario, session, { kind: 'final', national: 1.5, state: 1 })
  const contingentElection = projection.playerElectoralVotes < scenario.majority && projection.opponentElectoralVotes < scenario.majority
  const outcome = contingentElection
    ? 'tie'
    : projection.playerElectoralVotes >= scenario.majority ? 'win' : 'loss'
  return { ...projection, outcome, contingentElection }
}

export function resultEnding(scenario: CampaignScenario, session: CampaignSessionState, result: CampaignFinalResult): string {
  const route = getRoute(scenario, session.candidateId)!
  if (result.outcome === 'tie') return route.endings.tie
  if (result.outcome === 'win') return result.playerElectoralVotes >= scenario.totalElectoralVotes * .65 ? route.endings.landslideWin : route.endings.win
  return result.opponentElectoralVotes >= scenario.totalElectoralVotes * .65 ? route.endings.landslideLoss : route.endings.loss
}

export function keyStates(projection: CampaignProjection, limit = 6) {
  return [...projection.states]
    .filter((state) => state.electoralVotes > 0)
    .sort((left, right) => Math.abs(left.margin) - Math.abs(right.margin) || right.electoralVotes - left.electoralVotes)
    .slice(0, limit)
}
