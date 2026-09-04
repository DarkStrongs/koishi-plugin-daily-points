import { STATE_IDS } from './states'
import { CampaignEffect, CampaignScenario, ScenarioValidationResult } from './types'

export const MAX_SCENARIO_BYTES = 512 * 1024
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/
const FORBIDDEN_TEXT = /<\/?[a-z!]|https?:\/\/|javascript:/i

function isObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function textOkay(value: unknown, max: number) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !FORBIDDEN_TEXT.test(value)
}

function boundedNumber(value: unknown, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function validateEffect(value: unknown, stateIds: Set<string>, regions: Set<string>, path: string, errors: string[]) {
  if (!isObject(value)) {
    errors.push(`${path} 必须是对象`)
    return
  }
  const effect = value as CampaignEffect
  if (effect.national !== undefined && !boundedNumber(effect.national, -5, 5)) errors.push(`${path}.national 必须在 -5 到 5 之间`)
  if (effect.thirdParty !== undefined && !boundedNumber(effect.thirdParty, -5, 5)) errors.push(`${path}.thirdParty 必须在 -5 到 5 之间`)
  for (const [region, amount] of Object.entries(effect.regions || {})) {
    if (!regions.has(region)) errors.push(`${path}.regions 引用了未知地区 ${region}`)
    if (!boundedNumber(amount, -5, 5)) errors.push(`${path}.regions.${region} 越界`)
  }
  for (const [state, amount] of Object.entries(effect.states || {})) {
    if (!stateIds.has(state)) errors.push(`${path}.states 引用了未知州 ${state}`)
    if (!boundedNumber(amount, -5, 5)) errors.push(`${path}.states.${state} 越界`)
  }
  for (const [issue, amount] of Object.entries(effect.issues || {})) {
    if (!ID_PATTERN.test(issue)) errors.push(`${path}.issues 包含无效议题ID ${issue}`)
    if (!boundedNumber(amount, -5, 5)) errors.push(`${path}.issues.${issue} 越界`)
  }
}

function inspectStrings(value: unknown, path: string, errors: string[]) {
  if (typeof value === 'string') {
    if (FORBIDDEN_TEXT.test(value)) errors.push(`${path} 不允许包含 HTML、脚本或远程 URL`)
    return
  }
  if (Array.isArray(value)) return value.forEach((item, index) => inspectStrings(item, `${path}[${index}]`, errors))
  if (isObject(value)) Object.entries(value).forEach(([key, item]) => inspectStrings(item, `${path}.${key}`, errors))
}

export function stripJsonFence(input: string) {
  const value = input.trim()
  const match = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return match ? match[1] : value
}

export function parseScenarioJson(input: string): ScenarioValidationResult {
  const bytes = new TextEncoder().encode(input).byteLength
  if (bytes > MAX_SCENARIO_BYTES) return { valid: false, errors: [`场景超过 ${MAX_SCENARIO_BYTES / 1024} KiB 限制`] }
  let value: unknown
  try {
    value = JSON.parse(stripJsonFence(input))
  } catch {
    return { valid: false, errors: ['JSON 格式无效'] }
  }
  return validateScenario(value, true)
}

export function validateScenario(value: unknown, custom = false): ScenarioValidationResult {
  const errors: string[] = []
  if (!isObject(value)) return { valid: false, errors: ['场景必须是 JSON 对象'] }
  inspectStrings(value, 'scenario', errors)
  if (value.schemaVersion !== 1) errors.push('schemaVersion 必须为 1')
  if (!textOkay(value.id, 64)) errors.push('id 必须是 1—64 字符的安全文本')
  if (custom && (typeof value.id !== 'string' || !ID_PATTERN.test(value.id))) errors.push('自定义 id 仅允许 3—64 位小写字母、数字、下划线和连字符')
  if (custom && typeof value.id === 'string' && (value.id.startsWith('builtin/') || /^\d{4}$/.test(value.id))) errors.push('不能使用内置场景保留ID')
  if (!textOkay(value.title, 100)) errors.push('title 必须是 1—100 字符')
  if (!textOkay(value.description, 1000)) errors.push('description 必须是 1—1000 字符')
  if (!textOkay(value.sourceNote, 2000)) errors.push('sourceNote 必须是 1—2000 字符')
  if (!Number.isInteger(value.year) || value.year < 1789 || value.year > 2100) errors.push('year 必须在 1789—2100 之间')
  if (!Array.isArray(value.candidates) || value.candidates.length < 2 || value.candidates.length > 4) errors.push('candidates 必须包含 2—4 名候选人')
  if (!Array.isArray(value.states) || value.states.length !== STATE_IDS.length) errors.push(`states 必须完整包含 ${STATE_IDS.length} 个州级单位（含DC）`)
  if (!Array.isArray(value.routes)) errors.push('routes 必须是数组')

  const candidateIds = new Set<string>()
  const playableIds = new Set<string>()
  for (const [index, item] of (Array.isArray(value.candidates) ? value.candidates : []).entries()) {
    const path = `candidates[${index}]`
    if (!isObject(item)) { errors.push(`${path} 必须是对象`); continue }
    if (!textOkay(item.id, 64) || !ID_PATTERN.test(item.id)) errors.push(`${path}.id 无效`)
    if (candidateIds.has(item.id)) errors.push(`${path}.id 重复`)
    candidateIds.add(item.id)
    if (!textOkay(item.name, 80)) errors.push(`${path}.name 无效`)
    if (!Array.isArray(item.aliases) || item.aliases.length < 1 || item.aliases.some((alias: unknown) => !textOkay(alias, 40))) errors.push(`${path}.aliases 无效`)
    if (!['democratic', 'republican', 'independent'].includes(item.party)) errors.push(`${path}.party 无效`)
    if (!textOkay(item.runningMate, 80)) errors.push(`${path}.runningMate 无效`)
    if (typeof item.playable !== 'boolean') errors.push(`${path}.playable 必须是布尔值`)
    if (item.playable) playableIds.add(item.id)
    if (typeof item.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(item.color)) errors.push(`${path}.color 必须是十六进制颜色`)
  }
  if (playableIds.size !== 2) errors.push('场景必须恰好有两名可操作候选人')
  const playableParties = (Array.isArray(value.candidates) ? value.candidates : []).filter((item: any) => item?.playable).map((item: any) => item.party)
  if (!playableParties.includes('democratic') || !playableParties.includes('republican')) errors.push('两名可操作候选人必须分别属于 democratic 和 republican')

  const stateIds = new Set<string>()
  const regions = new Set<string>()
  let electoralTotal = 0
  for (const [index, item] of (Array.isArray(value.states) ? value.states : []).entries()) {
    const path = `states[${index}]`
    if (!isObject(item)) { errors.push(`${path} 必须是对象`); continue }
    if (!STATE_IDS.includes(item.id)) errors.push(`${path}.id 不是有效州ID`)
    if (stateIds.has(item.id)) errors.push(`${path}.id 重复`)
    stateIds.add(item.id)
    if (!textOkay(item.name, 80)) errors.push(`${path}.name 无效`)
    if (!Array.isArray(item.aliases) || item.aliases.some((alias: unknown) => !textOkay(alias, 40))) errors.push(`${path}.aliases 无效`)
    if (!textOkay(item.region, 64) || !ID_PATTERN.test(item.region)) errors.push(`${path}.region 无效`)
    regions.add(item.region)
    if (!Number.isInteger(item.electoralVotes) || item.electoralVotes < 0 || item.electoralVotes > 100) errors.push(`${path}.electoralVotes 无效`)
    else electoralTotal += item.electoralVotes
    if (!boundedNumber(item.baselineMargin, -100, 100)) errors.push(`${path}.baselineMargin 无效`)
    if (!boundedNumber(item.turnout, 1, 100000000)) errors.push(`${path}.turnout 无效`)
    if (item.thirdPartyShare !== undefined && !boundedNumber(item.thirdPartyShare, 0, 70)) errors.push(`${path}.thirdPartyShare 无效`)
    if (!Number.isInteger(item.tileX) || !Number.isInteger(item.tileY) || item.tileX < 0 || item.tileY < 0 || item.tileX > 20 || item.tileY > 20) errors.push(`${path} 的地图坐标无效`)
    if (item.districts !== undefined) {
      if (!Array.isArray(item.districts) || item.districts.reduce((sum: number, district: any) => sum + (district.electoralVotes || 0), 0) !== item.electoralVotes) errors.push(`${path}.districts 选举人票之和必须等于州总票数`)
      const districtIds = new Set<string>()
      for (const [districtIndex, district] of (Array.isArray(item.districts) ? item.districts : []).entries()) {
        const districtPath = `${path}.districts[${districtIndex}]`
        if (!isObject(district) || !textOkay(district.id, 64) || !textOkay(district.name, 80)) errors.push(`${districtPath} 无效`)
        if (districtIds.has(district?.id)) errors.push(`${districtPath}.id 重复`)
        districtIds.add(district?.id)
        if (!Number.isInteger(district?.electoralVotes) || district.electoralVotes < 1 || district.electoralVotes > 100) errors.push(`${districtPath}.electoralVotes 无效`)
        if (!boundedNumber(district?.baselineMargin, -100, 100)) errors.push(`${districtPath}.baselineMargin 无效`)
      }
    }
  }
  for (const id of STATE_IDS) if (!stateIds.has(id)) errors.push(`states 缺少 ${id}`)
  if (!Number.isInteger(value.totalElectoralVotes) || value.totalElectoralVotes !== electoralTotal) errors.push('totalElectoralVotes 与州数据之和不符')
  if (value.majority !== Math.floor(electoralTotal / 2) + 1) errors.push('majority 必须是总选举人票的过半数')

  const routeCandidates = new Set<string>()
  for (const [routeIndex, item] of (Array.isArray(value.routes) ? value.routes : []).entries()) {
    const path = `routes[${routeIndex}]`
    if (!isObject(item)) { errors.push(`${path} 必须是对象`); continue }
    if (!playableIds.has(item.candidateId)) errors.push(`${path}.candidateId 必须指向可操作候选人`)
    if (routeCandidates.has(item.candidateId)) errors.push(`${path}.candidateId 重复`)
    routeCandidates.add(item.candidateId)
    if (!textOkay(item.introduction, 2000)) errors.push(`${path}.introduction 无效`)
    if (!isObject(item.endings) || ['landslideWin', 'win', 'tie', 'loss', 'landslideLoss'].some((key) => !textOkay(item.endings?.[key], 1000))) errors.push(`${path}.endings 必须完整包含五类安全结局文案`)
    if (!Array.isArray(item.slots) || item.slots.length !== 15) { errors.push(`${path}.slots 必须恰好包含 15 个问题位置`); continue }
    const declaredFlags = new Set<string>()
    for (const [slotIndex, slot] of item.slots.entries()) {
      const slotPath = `${path}.slots[${slotIndex}]`
      if (!isObject(slot) || !textOkay(slot.id, 64) || !Array.isArray(slot.variants) || !slot.variants.length) { errors.push(`${slotPath} 无效`); continue }
      if (!slot.variants.some((variant: any) => !variant.when)) errors.push(`${slotPath} 必须包含无条件默认问题`)
      for (const [variantIndex, variant] of slot.variants.entries()) {
        const variantPath = `${slotPath}.variants[${variantIndex}]`
        if (!isObject(variant) || !textOkay(variant.id, 80) || !textOkay(variant.prompt, 2000)) { errors.push(`${variantPath} 无效`); continue }
        if (variant.when !== undefined) {
          if (!isObject(variant.when)) errors.push(`${variantPath}.when 必须是对象`)
          else for (const [flag, expected] of Object.entries(variant.when)) {
            if (!declaredFlags.has(flag)) errors.push(`${variantPath}.when 引用了此前未声明的标志 ${flag}`)
            if (!textOkay(expected, 64)) errors.push(`${variantPath}.when.${flag} 无效`)
          }
        }
        if (!Array.isArray(variant.options) || variant.options.length !== 4) { errors.push(`${variantPath}.options 必须恰好包含 4 项`); continue }
        for (const [optionIndex, option] of variant.options.entries()) {
          const optionPath = `${variantPath}.options[${optionIndex}]`
          if (!isObject(option) || !textOkay(option.text, 1000) || !textOkay(option.advisor, 1000)) { errors.push(`${optionPath} 文本无效`); continue }
          validateEffect(option.effect, stateIds, regions, `${optionPath}.effect`, errors)
          if (option.setFlags !== undefined && (!isObject(option.setFlags) || Object.entries(option.setFlags).some(([key, flag]) => !ID_PATTERN.test(key) || !textOkay(flag, 64)))) errors.push(`${optionPath}.setFlags 无效`)
        }
      }
      for (const variant of slot.variants) for (const option of variant.options || []) for (const flag of Object.keys(option.setFlags || {})) declaredFlags.add(flag)
    }
  }
  for (const id of playableIds) if (!routeCandidates.has(id)) errors.push(`缺少候选人 ${id} 的路线`)

  if (value.issueWeights !== undefined) {
    if (!isObject(value.issueWeights)) errors.push('issueWeights 必须是对象')
    else for (const [region, weights] of Object.entries(value.issueWeights)) {
      if (!regions.has(region) || !isObject(weights)) { errors.push(`issueWeights.${region} 引用了未知地区或格式无效`); continue }
      for (const [issue, amount] of Object.entries(weights)) {
        if (!ID_PATTERN.test(issue) || !boundedNumber(amount, -2, 2)) errors.push(`issueWeights.${region}.${issue} 必须在 -2 到 2 之间`)
      }
    }
  }

  if (errors.length) return { valid: false, errors: [...new Set(errors)].slice(0, 30) }
  const scenario = JSON.parse(JSON.stringify(value)) as CampaignScenario
  if (custom) scenario.id = `custom/${scenario.id}`
  return { valid: true, errors: [], scenario }
}
