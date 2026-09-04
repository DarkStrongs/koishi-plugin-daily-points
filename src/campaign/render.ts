import { keyStates } from './engine'
import { CampaignCandidate, CampaignProjection, CampaignQuestionVariant, CampaignScenario, CampaignSessionState } from './types'

function escapeHtml(value: unknown) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function pct(value: number) {
  return `${value.toFixed(1)}%`
}

function candidateById(scenario: CampaignScenario, id: string) {
  return scenario.candidates.find((item) => item.id === id)
}

function projectionLine(scenario: CampaignScenario, session: CampaignSessionState, projection: CampaignProjection) {
  const player = candidateById(scenario, session.candidateId)!
  const opponent = candidateById(scenario, session.opponentId)!
  const extra = projection.thirdPartyElectoralVotes ? `｜第三方 ${projection.thirdPartyElectoralVotes}` : ''
  return `${player.name} ${projection.playerElectoralVotes}｜${opponent.name} ${projection.opponentElectoralVotes}${extra}（过半 ${scenario.majority}）`
}

export function formatQuestion(scenario: CampaignScenario, session: CampaignSessionState, question: CampaignQuestionVariant) {
  const candidate = candidateById(scenario, session.candidateId)!
  return [
    `🗳️ ${scenario.title}｜${candidate.name} / ${candidate.runningMate}`,
    `第 ${session.turn + 1}/15 题`,
    '',
    question.prompt,
    '',
    ...question.options.map((option, index) => `${index + 1}. ${option.text}`),
    '',
    '直接发送 1、2、3 或 4 作答。',
  ].join('\n')
}

export function formatCampaignStatus(scenario: CampaignScenario, session: CampaignSessionState) {
  const candidate = candidateById(scenario, session.candidateId)!
  const phase = session.phase === 'question' ? '等待答题' : session.phase === 'visit' ? '等待访问州' : '已经完成'
  return [
    `🗳️ ${scenario.title}`,
    `候选人：${candidate.name} / ${candidate.runningMate}`,
    `难度：${session.difficulty === 'easy' ? '简单' : session.difficulty === 'hard' ? '困难' : '普通'}`,
    `进度：${Math.min(session.turn + (session.phase === 'visit' ? 1 : 0), 15)}/15｜${phase}`,
    `访问记录：${session.visits.length ? session.visits.join('、') : '尚无'}`,
  ].join('\n')
}

export function formatProjectionText(scenario: CampaignScenario, session: CampaignSessionState, projection: CampaignProjection, stateId?: string, mode: 'poll' | 'final' = 'poll') {
  const player = candidateById(scenario, session.candidateId)!
  const opponent = candidateById(scenario, session.opponentId)!
  const lines = [
    `📊 ${scenario.title}｜${mode === 'final' ? '最终开票' : `第 ${projection.turn}/15 轮民调`}`,
    projectionLine(scenario, session, projection),
    `全国普选：${player.name} ${pct(projection.playerPopularShare)}｜${opponent.name} ${pct(projection.opponentPopularShare)}${projection.thirdPartyPopularShare >= .1 ? `｜第三方 ${pct(projection.thirdPartyPopularShare)}` : ''}`,
  ]
  if (stateId) {
    const state = projection.states.find((item) => item.stateId === stateId)
    if (state) lines.push(`${state.stateName}（${state.electoralVotes}票）：${player.name} ${pct(state.playerShare)}｜${opponent.name} ${pct(state.opponentShare)}${state.thirdPartyShare >= .1 ? `｜第三方 ${pct(state.thirdPartyShare)}` : ''}`)
  } else {
    lines.push('最接近的州：')
    for (const state of keyStates(projection)) {
      const leader = state.winnerId === session.candidateId ? player.name : state.winnerId === session.opponentId ? opponent.name : '第三方'
      lines.push(`  ${state.stateName} ${state.electoralVotes}票｜${leader}领先 ${Math.abs(state.margin).toFixed(1)}%`)
    }
    const playerStates = projection.states.filter((item) => item.winnerId === session.candidateId).map((item) => `${item.stateId}(${item.electoralVotes})`)
    const opponentStates = projection.states.filter((item) => item.winnerId === session.opponentId).map((item) => `${item.stateId}(${item.electoralVotes})`)
    const thirdStates = projection.states.filter((item) => item.winnerId !== session.candidateId && item.winnerId !== session.opponentId).map((item) => `${item.stateId}(${item.electoralVotes})`)
    lines.push(`${player.name}领先州：${playerStates.join('、') || '无'}`)
    lines.push(`${opponent.name}领先州：${opponentStates.join('、') || '无'}`)
    if (thirdStates.length) lines.push(`第三方领先州：${thirdStates.join('、')}`)
    if (scenario.year === 2020) lines.push('注：ME、NE 的括号为全州票数，实际总票已按全州票和国会选区分别结算。')
  }
  lines.push(mode === 'final' ? '最终结果由本局固定随机种子结算。' : '民调含固定抽样误差；同一轮重复查询不会刷新。')
  return lines.join('\n')
}

function stateColor(scenario: CampaignScenario, session: CampaignSessionState, winnerId: string, margin: number) {
  const candidate = candidateById(scenario, winnerId)
  if (!candidate) return '#ca8a04'
  const strength = Math.min(Math.abs(margin) / 18, 1)
  if (candidate.party === 'democratic') return strength > .65 ? '#1d4ed8' : strength > .25 ? '#3b82f6' : '#93c5fd'
  if (candidate.party === 'republican') return strength > .65 ? '#b91c1c' : strength > .25 ? '#ef4444' : '#fca5a5'
  return '#d4a72c'
}

export function buildMapHtml(scenario: CampaignScenario, session: CampaignSessionState, projection: CampaignProjection, heading = '选情地图') {
  const player = candidateById(scenario, session.candidateId)!
  const opponent = candidateById(scenario, session.opponentId)!
  const cards = scenario.states.map((state) => {
    const projected = projection.states.find((item) => item.stateId === state.id)!
    const background = stateColor(scenario, session, projected.winnerId, projected.margin)
    const foreground = Math.abs(projected.margin) > 10 ? '#fff' : '#111827'
    const detail = `${state.name}：${player.name} ${pct(projected.playerShare)}，${opponent.name} ${pct(projected.opponentShare)}`
    return `<div class="state" title="${escapeHtml(detail)}" style="grid-column:${state.tileX + 1};grid-row:${state.tileY + 1};background:${background};color:${foreground}"><b>${escapeHtml(state.id)}</b><span>${state.electoralVotes}</span></div>`
  }).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:30px;background:#f3f4f6;color:#111827;font-family:Arial,"Microsoft YaHei",sans-serif;width:1040px}
    .panel{background:white;border-radius:20px;padding:26px;box-shadow:0 12px 32px #0002}.title{font-size:28px;font-weight:800}.sub{margin-top:8px;color:#4b5563;font-size:16px}
    .score{display:flex;gap:16px;margin:22px 0}.candidate{flex:1;border-radius:14px;padding:14px 18px;color:white;font-weight:700;font-size:20px}.candidate small{display:block;font-size:13px;font-weight:400;opacity:.9;margin-top:4px}
    .map{display:grid;grid-template-columns:repeat(12,68px);grid-template-rows:repeat(7,58px);gap:7px;justify-content:center;background:#e5e7eb;border-radius:16px;padding:20px}
    .state{border-radius:9px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px solid #fff8;box-shadow:0 2px 4px #0002}.state b{font-size:17px}.state span{font-size:12px;margin-top:2px}
    .legend{display:flex;justify-content:center;gap:24px;margin-top:18px;color:#4b5563}.dot{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px}
    .note{font-size:12px;color:#6b7280;margin-top:16px;text-align:center}
  </style></head><body><div class="panel"><div class="title">${escapeHtml(scenario.title)}｜${escapeHtml(heading)}</div><div class="sub">第 ${projection.turn}/15 轮 · 获胜需要 ${scenario.majority} 张选举人票</div>
  <div class="score"><div class="candidate" style="background:${escapeHtml(player.color)}">${escapeHtml(player.name)}：${projection.playerElectoralVotes}<small>普选 ${pct(projection.playerPopularShare)}</small></div><div class="candidate" style="background:${escapeHtml(opponent.color)}">${escapeHtml(opponent.name)}：${projection.opponentElectoralVotes}<small>普选 ${pct(projection.opponentPopularShare)}</small></div></div>
  <div class="map">${cards}</div><div class="legend"><span><i class="dot" style="background:#2563eb"></i>民主党</span><span><i class="dot" style="background:#dc2626"></i>共和党</span><span><i class="dot" style="background:#d4a72c"></i>第三方</span><span>浅色表示差距接近</span></div>
  <div class="note">这是按地理位置排列的州级方块图；缅因与内布拉斯加分区票已计入上方总票数。</div></div></body></html>`
}

export function formatFinalText(scenario: CampaignScenario, session: CampaignSessionState, projection: CampaignProjection, ending: string) {
  const headline = (projection as any).outcome === 'win' ? '🏛️ 赢得白宫' : (projection as any).outcome === 'tie' ? '⚖️ 进入国会裁决' : '📰 竞选落败'
  return [
    `${headline}｜${scenario.title}`,
    projectionLine(scenario, session, projection),
    `普选得票：${pct(projection.playerPopularShare)}（对手 ${pct(projection.opponentPopularShare)}）`,
    ending,
    '',
    '关键州：',
    ...keyStates(projection, 5).map((state) => `  ${state.stateName}：差距 ${Math.abs(state.margin).toFixed(1)}%`),
  ].join('\n')
}
