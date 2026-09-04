import {
  CampaignCandidate,
  CampaignEffect,
  CampaignOption,
  CampaignQuestionSlot,
  CampaignRoute,
  CampaignScenario,
} from './types'
import { createStates, ELECTION_SOURCE_NOTE } from './states'

interface RouteProfile {
  candidate: CampaignCandidate
  introduction: string
  prompts: string[]
  homeRegions: string[]
  targetStates: string[]
}

const D = '#2563eb'
const R = '#dc2626'
const I = '#d4a72c'

function candidate(id: string, name: string, aliases: string[], party: CampaignCandidate['party'], runningMate: string, playable = true): CampaignCandidate {
  return { id, name, aliases: [name, ...aliases], party, runningMate, playable, color: party === 'democratic' ? D : party === 'republican' ? R : I }
}

function effect(national: number, regions: Record<string, number> = {}, states: Record<string, number> = {}, issues: Record<string, number> = {}): CampaignEffect {
  return { national, regions, states, issues }
}

function answer(text: string, advisor: string, value: CampaignEffect, setFlags?: Record<string, string>): CampaignOption {
  return { text, advisor, effect: value, setFlags }
}

const OPTION_TEXTS: string[][] = [
  ['发表面向全国的团结演说，先定义竞选的核心主题。', '先回到党内基本盘，用鲜明立场鼓舞志愿者。', '把开场全部用于攻击对手的履历和可信度。', '保持低调，让地方组织自行推进。'],
  ['提出完整经济方案，同时说明普通家庭会得到什么。', '缩小承诺，只强调平衡预算和稳定物价。', '把经济争论变成对手执政表现的公投。', '给出一个未经测算、听起来极其大胆的承诺。'],
  ['明确支持联邦政府保障平等权利。', '支持目标，但主张通过国会协商和渐进执行。', '强调各州自行处理，避免联邦进一步介入。', '拒绝表态，并要求记者更换话题。'],
  ['展示强硬姿态，并承诺扩大美国的全球责任。', '强调实力与谈判并用，避免无上限承诺。', '主张降低紧张、优先外交和军备控制。', '给出互相矛盾的承诺，试图讨好所有阵营。'],
  ['重申全国联盟，说明原则与妥协并不冲突。', '承认党内存在分歧，把决定交给未来国会。', '转向更强硬的党派语言，要求基本盘归队。', '指责提问者制造分裂，拒绝继续回答。'],
  ['让竞选搭档专攻其最熟悉的地区和议题。', '两人共同出席大型集会，突出团结形象。', '让搭档承担全部负面攻击，候选人保持超然。', '尽量隐藏搭档，避免任何额外风险。'],
  ['接受全国性辩论，用准备充分的政策回答争取观众。', '参加经过协商的访谈，减少不可控的现场交锋。', '把媒体偏见作为竞选主题，主要面向支持者发声。', '临时取消活动，却不给出可信解释。'],
  ['扩大联盟，主动接触尚未完全信任你的中间选民。', '优先动员党内核心群体，提高他们的投票热情。', '集中争取工薪阶层和地方组织的背书。', '只依靠全国广告，不再安排基层接触。'],
  ['把资源集中在选举人票多且差距很小的州。', '守住传统优势州，避免意外失守。', '尝试在对手腹地制造一个象征性突破。', '平均分配全部资源，不区分安全州和摇摆州。'],
  ['公开与党内盟友共同亮相，同时保留自己的政策品牌。', '接受党内全部要求，换取组织和资金支持。', '刻意与本党切割，宣称自己不需要任何政治盟友。', '继续回避矛盾，希望新闻周期自行结束。'],
  ['增加基层办公室、电话动员和选民登记投入。', '把大部分预算投入电视与广播广告。', '依靠大型集会制造免费媒体曝光。', '暂停开支，把资金留到选举结束之后。'],
  ['逐条回应事实争议，然后迅速回到竞选主题。', '用幽默化解攻击，不延长负面新闻周期。', '发动更猛烈的人身攻击作为报复。', '否认所有报道，包括已经公开可核实的部分。'],
  ['提出清晰的联邦与州政府分工方案。', '强调联邦项目能为地方带来直接资源。', '强调地方自主，把多数政策责任交还各州。', '同时许诺扩大项目和全面减税，却不解释资金来源。'],
  ['召开简短发布会，稳定盟友并解释既定路线。', '根据新局势有限调整，但保留此前的核心原则。', '彻底推翻此前立场，希望新闻界忘记旧承诺。', '停止公开活动，等待危机自行过去。'],
  ['以乐观、团结和明确的执政目标结束竞选。', '发出紧迫的基本盘动员令，强调每一票的重要性。', '把最后讲话全部用于警告对手获胜的风险。', '临时改变核心主题，推出一个从未讨论的新议题。'],
]

function regional(profile: RouteProfile, amount: number): Record<string, number> {
  return Object.fromEntries(profile.homeRegions.map((region) => [region, amount]))
}

function targeted(profile: RouteProfile, amount: number): Record<string, number> {
  return Object.fromEntries(profile.targetStates.map((state) => [state, amount]))
}

function standardOptions(profile: RouteProfile, slot: number): CampaignOption[] {
  const text = OPTION_TEXTS[slot]
  const flags: Array<Record<string, string> | undefined> = slot === 0
    ? [{ tone: 'moderate' }, { tone: 'base' }, { tone: 'attack' }, { tone: 'passive' }]
    : slot === 3
      ? [{ foreign: 'hawk' }, { foreign: 'balanced' }, { foreign: 'dove' }, { foreign: 'unclear' }]
      : slot === 7
        ? [{ coalition: 'broad' }, { coalition: 'base' }, { coalition: 'labor' }, { coalition: 'airwar' }]
        : [undefined, undefined, undefined, undefined]

  const patterns: CampaignEffect[][] = [
    [effect(.8, {}, {}, { moderation: .4 }), effect(.25, regional(profile, .75), {}, { base: .5 }), effect(.05, {}, targeted(profile, .45), { attack: .35 }), effect(-.8)],
    [effect(.7, {}, {}, { economy: .55 }), effect(.35, { plains: .25, mountain: .25 }, {}, { fiscal: .4 }), effect(.15, {}, targeted(profile, .35), { economy: .2 }), effect(-.95)],
    [effect(.2, { 'new-england': .45, 'mid-atlantic': .55, 'great-lakes': .25, south: -.45 }, {}, { rights: .7 }), effect(.45, { south: .2, 'mid-atlantic': .2 }, {}, { rights: .3 }), effect(-.15, { south: .65, 'new-england': -.5, 'mid-atlantic': -.4 }, {}, { federalism: .5 }), effect(-.7)],
    [effect(.2, { south: .25, mountain: .25 }, {}, { security: .65 }), effect(.65, {}, {}, { security: .35, moderation: .25 }), effect(.2, { 'new-england': .35, pacific: .35 }, {}, { diplomacy: .55 }), effect(-.8)],
    [effect(.65, {}, {}, { moderation: .45 }), effect(.15, regional(profile, .3)), effect(.05, regional(profile, .6), {}, { base: .5 }), effect(-.75)],
    [effect(.45, regional(profile, .25), targeted(profile, .25)), effect(.7), effect(.05, {}, targeted(profile, .35), { attack: .3 }), effect(-.4)],
    [effect(.8, {}, targeted(profile, .15), { competence: .5 }), effect(.45, {}, {}, { competence: .25 }), effect(.1, regional(profile, .45), {}, { base: .35 }), effect(-.95)],
    [effect(.65, {}, targeted(profile, .25), { moderation: .35 }), effect(.2, regional(profile, .7), {}, { base: .6 }), effect(.45, { 'great-lakes': .55, plains: .35 }, {}, { labor: .5 }), effect(-.65)],
    [effect(.45, {}, targeted(profile, .85)), effect(.15, regional(profile, .6)), effect(-.05, {}, targeted(profile, .55)), effect(-.5)],
    [effect(.55, regional(profile, .25), {}, { unity: .5 }), effect(.15, regional(profile, .55), {}, { base: .6 }), effect(.1, {}, targeted(profile, .3), { independence: .5 }), effect(-.65)],
    [effect(.55, {}, targeted(profile, .35), { organization: .7 }), effect(.35, {}, targeted(profile, .45), { media: .4 }), effect(.15, regional(profile, .45), {}, { enthusiasm: .5 }), effect(-.8)],
    [effect(.55, {}, {}, { competence: .45 }), effect(.45, {}, {}, { moderation: .3 }), effect(-.15, regional(profile, .45), {}, { attack: .45 }), effect(-.9)],
    [effect(.55, {}, {}, { federalism: .45 }), effect(.25, { 'great-lakes': .35, south: .25 }, {}, { spending: .45 }), effect(.2, { south: .35, mountain: .35 }, {}, { federalism: .6 }), effect(-.85)],
    [effect(.55, {}, targeted(profile, .25), { competence: .45 }), effect(.7, {}, {}, { moderation: .35 }), effect(-.45, {}, {}, { trust: -.5 }), effect(-.9)],
    [effect(.75, {}, {}, { optimism: .55 }), effect(.25, regional(profile, .6), {}, { base: .55 }), effect(.25, {}, targeted(profile, .45), { attack: .35 }), effect(-.75)],
  ]
  const advisors = [
    '这让竞选显得稳健，也给摇摆选民留下了空间。',
    '基本盘会喜欢这番话，但全国扩张的幅度有限。',
    '你赢得了一个新闻周期，同时提高了竞选的对抗性。',
    '顾问们沉默了几秒；这不是我们希望占据头条的方式。',
  ]
  return text.map((label, index) => answer(label, advisors[index], patterns[slot][index], flags[index]))
}

function conditionalPrompt(profile: RouteProfile, slot: number, flag: string, value: string, suffix: string) {
  return {
    id: `${profile.candidate.id}-q${slot + 1}-${value}`,
    prompt: `${profile.prompts[slot]} ${suffix}`,
    when: { [flag]: value },
    options: standardOptions(profile, slot),
  }
}

function buildSlots(profile: RouteProfile): CampaignQuestionSlot[] {
  return profile.prompts.map((prompt, slot) => {
    const base = {
      id: `${profile.candidate.id}-q${slot + 1}`,
      prompt,
      options: standardOptions(profile, slot),
    }
    if (slot === 4) return {
      id: `slot-${slot + 1}`,
      variants: [conditionalPrompt(profile, slot, 'tone', 'moderate', '你此前的温和开局让记者追问：这会不会削弱党内热情？'), base],
    }
    if (slot === 9) return {
      id: `slot-${slot + 1}`,
      variants: [conditionalPrompt(profile, slot, 'coalition', 'base', '此前优先基本盘的决定已经引起部分中间派盟友担忧。'), base],
    }
    if (slot === 13) return {
      id: `slot-${slot + 1}`,
      variants: [conditionalPrompt(profile, slot, 'foreign', 'hawk', '你此前的强硬外交表态使这次危机格外受关注。'), base],
    }
    return { id: `slot-${slot + 1}`, variants: [base] }
  })
}

function route(profile: RouteProfile): CampaignRoute {
  return {
    candidateId: profile.candidate.id,
    introduction: profile.introduction,
    slots: buildSlots(profile),
    endings: {
      landslideWin: `${profile.candidate.name}不仅赢得白宫，还重塑了这场选举的政治版图。`,
      win: `${profile.candidate.name}组织起足够广泛的联盟，赢得了总统选举。`,
      tie: '没有候选人取得选举人票多数，决定权将转交国会。',
      loss: `${profile.candidate.name}在若干关键州惜败，这条竞选路线未能通向白宫。`,
      landslideLoss: `${profile.candidate.name}的联盟在全国范围崩解，竞选以明显失利告终。`,
    },
  }
}

function profile(candidate: CampaignCandidate, introduction: string, prompts: string[], homeRegions: string[], targetStates: string[]): RouteProfile {
  if (prompts.length !== 15) throw new Error(`${candidate.id} 必须配置 15 个问题`)
  return { candidate, introduction, prompts, homeRegions, targetStates }
}

function scenario(year: 1960 | 1964 | 1968 | 2020, title: string, description: string, candidates: CampaignCandidate[], profiles: RouteProfile[]): CampaignScenario {
  const states = createStates(year)
  const totalElectoralVotes = states.reduce((sum, state) => sum + state.electoralVotes, 0)
  return {
    schemaVersion: 1,
    id: `builtin/${year}`,
    title,
    year,
    description,
    sourceNote: ELECTION_SOURCE_NOTE,
    totalElectoralVotes,
    majority: Math.floor(totalElectoralVotes / 2) + 1,
    candidates,
    states,
    routes: profiles.map(route),
  }
}

const kennedy = candidate('kennedy-1960', '约翰·肯尼迪', ['肯尼迪', 'JFK', 'Kennedy'], 'democratic', '林登·约翰逊')
const nixon60 = candidate('nixon-1960', '理查德·尼克松', ['尼克松', 'Nixon'], 'republican', '亨利·卡伯特·洛奇')
const johnson = candidate('johnson-1964', '林登·约翰逊', ['约翰逊', 'LBJ', 'Johnson'], 'democratic', '休伯特·汉弗莱')
const goldwater = candidate('goldwater-1964', '巴里·戈德华特', ['戈德华特', 'Goldwater'], 'republican', '威廉·米勒')
const humphrey = candidate('humphrey-1968', '休伯特·汉弗莱', ['汉弗莱', 'Humphrey'], 'democratic', '埃德蒙·马斯基')
const nixon68 = candidate('nixon-1968', '理查德·尼克松', ['尼克松', 'Nixon'], 'republican', '斯皮罗·阿格纽')
const wallace = candidate('wallace-1968', '乔治·华莱士', ['华莱士', 'Wallace'], 'independent', '柯蒂斯·勒梅', false)
const biden = candidate('biden-2020', '乔·拜登', ['拜登', 'Biden'], 'democratic', '卡玛拉·哈里斯')
const trump = candidate('trump-2020', '唐纳德·特朗普', ['特朗普', '川普', 'Trump'], 'republican', '迈克·彭斯')

export const BUILTIN_SCENARIOS: CampaignScenario[] = [
  scenario(1960, '1960：新边疆', '冷战、经济增长、民权与电视辩论共同塑造了一场极其接近的选举。', [kennedy, nixon60], [
    profile(kennedy, '你是年轻的马萨诸塞州参议员约翰·肯尼迪。宗教疑虑、经验问题和一场势均力敌的全国竞选摆在面前。', [
      '洛杉矶党代会之后，你需要向全国介绍“新边疆”，同时安抚对年轻与经验的担忧。',
      '经济增长放缓，选民在意就业、住房和美国是否正在落后。你怎样解释自己的经济议程？',
      '民权静坐抗议持续扩大，南方民主党人与北方自由派要求你给出不同答案。',
      '古巴革命、柏林局势和所谓“导弹差距”让国家安全成为竞选焦点。',
      '党内领袖担心你的全国化策略忽视了传统民主党组织，你必须回应。',
      '林登·约翰逊熟悉国会和南方，但与你的核心团队并非总是步调一致。如何使用这位搭档？',
      '尼克松接受电视辩论邀请。你的团队认为镜头表现可能比政策细节更重要。',
      '天主教身份引发一些新教选民疑虑，你如何建立跨宗教联盟？',
      '伊利诺伊、密歇根、宾夕法尼亚和得克萨斯都要求更多资源，竞选经费却有限。',
      '南方保守派与北方城市组织在政纲上出现裂痕，党内团结受到检验。',
      '工会希望你强化基层登记，而媒体顾问希望购买更多黄金时段。',
      '共和党指责你经验不足，无法在危机中面对赫鲁晓夫。',
      '医疗、教育与最低工资提案引发有关联邦权力边界的争论。',
      '马丁·路德·金被捕的消息进入新闻，你的回应可能影响黑人选民与南方白人选民。',
      '选举进入最后几天，民调差距已经小到无法分辨。你怎样结束竞选？',
    ], ['new-england', 'mid-atlantic'], ['IL', 'MI', 'PA', 'TX']),
    profile(nixon60, '你是副总统理查德·尼克松，拥有八年行政经验，却必须摆脱“现任副手”的局限并完成五十州竞选承诺。', [
      '你获得共和党提名后，需要把艾森豪威尔时代的稳定转化为属于自己的竞选主题。',
      '经济在选举年前后放缓，肯尼迪称美国需要更积极的增长政策。你如何回应？',
      '你曾支持民权立法，但共和党在南方也看到了新的机会。你准备如何定位？',
      '你的莫斯科“厨房辩论”经历是重要资产，古巴与柏林却不断制造新的风险。',
      '五十州巡回承诺消耗了时间，顾问建议你缩小战场范围。',
      '亨利·卡伯特·洛奇拥有外交资历，你需要决定他在竞选中的主要角色。',
      '首场电视辩论临近。膝伤和紧密行程影响了状态，但取消会被视为退缩。',
      '共和党商业派、郊区中产与新兴南方选民的诉求并不完全一致。',
      '加利福尼亚、俄亥俄、伊利诺伊和纽约都可能决定结果，你必须重新分配时间。',
      '部分保守派认为你的政策不够坚定，温和派则担心竞选右转。',
      '你的团队擅长组织，但肯尼迪的媒体形象正在吸引大量注意力。',
      '民主党用“导弹差距”和经济停滞攻击政府，你需要保护自己的执政记录。',
      '教育援助、医疗保险和住房项目让联邦政府角色成为争论中心。',
      '国际局势再次紧张，记者要求你说明是否会采取军事行动。',
      '最后一周到来，你仍在履行五十州行程。竞选的最终讯息是什么？',
    ], ['pacific', 'mountain'], ['CA', 'OH', 'IL', 'NY']),
  ]),
  scenario(1964, '1964：伟大社会与保守革命', '肯尼迪遇刺后的国家情绪、民权法案、越南和联邦政府角色主导竞选。', [johnson, goldwater], [
    profile(johnson, '你是总统林登·约翰逊，希望以压倒性授权推进“伟大社会”，同时必须处理越南不断升级的压力。', [
      '你在悲剧后接任总统，如今需要把国家团结转化为一份面向未来的竞选纲领。',
      '减税后的增长与“向贫困宣战”同时出现，选民询问伟大社会的成本。',
      '你签署了《1964年民权法》，南方传统民主党联盟正发生剧烈变化。',
      '北部湾事件令越南成为紧迫议题，你需要说明美国承诺的边界。',
      '一些顾问希望竞选保持总统式姿态，另一些人希望把戈德华特描绘成危险选择。',
      '休伯特·汉弗莱是民权与自由派的重要声音，你如何安排他的任务？',
      '戈德华特要求展开直接政策辩论，而你的民调优势很大。',
      '工会、南方民主党、黑人选民和郊区中产构成一个越来越复杂的联盟。',
      '加利福尼亚、得克萨斯、佛罗里达与上中西部需要不同的竞选讯息。',
      '保守派民主党议员担忧你的国内计划会扩大联邦政府。',
      '“雏菊”广告引发巨大关注，也带来竞选是否过度恐吓选民的争论。',
      '共和党称你的政府在开支、权力和诚信方面缺乏约束。',
      '医疗保险、教育拨款与反贫困项目需要地方政府共同执行。',
      '越南出现新的军事压力，你必须在选前决定公开语气。',
      '大幅领先的情况下，最后讲话既关系胜负，也关系未来执政授权。',
    ], ['south', 'great-lakes'], ['CA', 'TX', 'FL', 'OH']),
    profile(goldwater, '你是亚利桑那州参议员巴里·戈德华特，试图把有限政府和坚定反共塑造成新的保守主义多数。', [
      '共和党大会后，媒体把你的提名描述为一次意识形态革命。你如何向全国开场？',
      '你反对大型联邦项目，但选民仍期待增长、就业和社会保障的稳定。',
      '你因宪法与联邦权力理由反对民权法案，这一投票成为竞选核心争议。',
      '你主张更强硬地遏制共产主义，但民主党称这种立场可能扩大越南战争。',
      '温和派共和党人拒绝全力支持你，竞选必须决定是否修复关系。',
      '威廉·米勒在全国知名度有限，你要为他确定一个清晰角色。',
      '约翰逊拒绝正式辩论，你仍可通过长篇电视讲话直接陈述保守主义。',
      '西部保守派、南方白人选民和传统东北共和党人之间存在明显差异。',
      '亚利桑那、深南部与快速增长的西部州是机会，但大州资源仍不能完全放弃。',
      '共和党建制派担忧你的路线会拖累国会候选人，要求调整语气。',
      '小额捐款热情很高，但全国组织和媒体预算明显落后于总统。',
      '民主党广告把你描绘成核战争风险，你必须作出回应。',
      '社会保障、田纳西河谷管理局和教育拨款把有限政府原则推向具体选择。',
      '越南和冷战危机再次登上头条，记者要求你解释“强硬”的实际含义。',
      '民调仍然落后，你的最后目标是争取胜利、保存运动，还是重塑共和党？',
    ], ['mountain', 'south'], ['AZ', 'CA', 'GA', 'SC']),
  ]),
  scenario(1968, '1968：秩序、战争与分裂', '越南战争、城市动荡、党内分裂和第三党挑战让传统两党版图重新组合。', [humphrey, nixon68, wallace], [
    profile(humphrey, '你是副总统休伯特·汉弗莱。芝加哥党代会后，必须在约翰逊政府、反战选民和新政联盟之间找到自己的声音。', [
      '党代会外的冲突仍占据电视画面，你需要重建民主党竞选的合法性与希望。',
      '通胀、城市财政和就业问题让传统新政经济联盟承受压力。',
      '你长期支持民权，但城市骚乱让“法律与秩序”成为强烈反击口号。',
      '越南战争是最大负担，你需要决定与约翰逊政府政策保持多大距离。',
      '反战派怀疑你缺乏独立性，南方保守派又可能转向华莱士或尼克松。',
      '埃德蒙·马斯基形象稳健，你希望他修复哪些地区和群体？',
      '尼克松避免传统辩论，媒体转而安排专题访谈和电视广告。',
      '工会、黑人选民、反战青年与白人工薪阶层之间的裂缝持续扩大。',
      '密歇根、宾夕法尼亚、俄亥俄、得克萨斯和加利福尼亚都仍有机会。',
      '芝加哥余波让地方民主党组织互相指责，资源协调困难。',
      '竞选起步晚、资金不足，你必须在基层组织和全国电视之间取舍。',
      '共和党把你与战争和国内混乱绑定，要求选民否定现任政府。',
      '住房、学校、治安与反贫困计划都涉及联邦和地方政府的冲突。',
      '巴黎和谈出现新的可能性，你的公开回应可能决定反战选民是否回归。',
      '民调迅速追近，最后讲话必须同时说服和平派与传统民主党选民。',
    ], ['great-lakes', 'mid-atlantic'], ['MI', 'PA', 'OH', 'TX']),
    profile(nixon68, '你是前副总统理查德·尼克松。八年前的惜败和政治复出让你有机会以“新尼克松”形象争取沉默的大多数。', [
      '共和党提名到手后，你要把个人复出故事转化为稳定、秩序与经验的全国主题。',
      '通胀与财政压力上升，你需要提出区别于民主党伟大社会的经济路线。',
      '城市动荡与民权进展并存，你的“法律与秩序”必须避免被理解为拒绝平等。',
      '你声称拥有结束越战的办法，但不愿公开谈判细节，记者持续追问。',
      '温和派与保守派都暂时支持你，却对未来政府方向有不同期待。',
      '斯皮罗·阿格纽能够攻击民主党，但他的措辞可能制造额外争议。',
      '竞选团队偏好受控电视节目，汉弗莱则指责你逃避公开辩论。',
      '郊区中产、南方保守派、民族白人工薪选民和传统共和党人形成新联盟。',
      '加利福尼亚、俄亥俄、伊利诺伊、新泽西和南方边缘州需要大量时间。',
      '部分南方共和党人要求更直接地争夺华莱士选民，东北温和派对此警惕。',
      '你的竞选拥有更强组织和资金，但必须防止领先优势让支持者松懈。',
      '民主党再次提起你过去的败选与政治争议，质疑“新尼克松”是否真实。',
      '治安、学校与城市政策让联邦权力问题进入每一个地方选举。',
      '越南和平谈判在最后阶段出现变化，任何表态都可能影响你的领先。',
      '选举日前夕，你要给“沉默的大多数”留下怎样的最后印象？',
    ], ['pacific', 'south'], ['CA', 'OH', 'IL', 'NJ']),
  ]),
  scenario(2020, '2020：危机中的选择', '疫情、经济震荡、种族正义、医疗与政治极化贯穿一场高投票率选举。', [biden, trump], [
    profile(biden, '你是前副总统乔·拜登，竞选主轴是控制疫情、恢复制度稳定并重建奥巴马时代的广泛联盟。', [
      '疫情改变了传统竞选方式，你需要在特拉华向全国定义“国家灵魂”与危机领导力。',
      '封锁冲击就业和小企业，复苏方案的规模与速度成为首要经济争论。',
      '乔治·弗洛伊德之死引发全国抗议，种族正义与公共安全同时成为焦点。',
      '盟友关系、中国、俄罗斯与长期海外战争构成复杂外交议程。',
      '进步派希望更大胆改革，温和派则担心共和党把你描绘得过于左倾。',
      '卡玛拉·哈里斯能够动员多个群体，也会成为共和党集中攻击的目标。',
      '首场总统辩论充满打断与冲突，你要决定后续场合的应对方式。',
      '郊区选民、黑人选民、工会家庭、年轻人和反特朗普共和党人都在联盟之中。',
      '宾夕法尼亚、密歇根、威斯康星、亚利桑那、佐治亚和佛罗里达争夺激烈。',
      '进步派与建制派围绕医疗、气候和警务改革继续谈判。',
      '疫情限制线下活动，竞选必须平衡数字组织、广告和安全的小型活动。',
      '共和党集中攻击你的年龄、政策记录以及家人相关争议。',
      '医疗保险、疫情救济和州政府执行能力让联邦角色成为现实问题。',
      '总统确诊新冠后，竞选环境突然变化，你需要决定公开回应的语气。',
      '提前投票已经开始，最后讲话要同时动员基本盘并降低国家对立。',
    ], ['mid-atlantic', 'great-lakes'], ['PA', 'MI', 'WI', 'AZ', 'GA']),
    profile(trump, '你是总统唐纳德·特朗普，希望凭借疫情前经济表现、保守派政策与强烈基本盘赢得连任。', [
      '共和党大会后，你需要解释为什么选民应在全国危机中继续选择现任政府。',
      '疫情前经济强劲，但失业与企业倒闭改变了选民感受。你怎样定义复苏？',
      '全国抗议与城市暴力让种族关系、警务和公共安全成为高度对立的议题。',
      '对华政策、中东协议、北约关系与海外驻军都可成为外交成绩或争议。',
      '传统共和党人、民粹选民和摇摆郊区对你的风格有不同评价。',
      '迈克·彭斯负责疫情工作组，也是连接福音派与党内组织的重要人物。',
      '首场辩论后的焦点不是政策，而是秩序和总统风格。团队建议调整策略。',
      '农村选民、白人工薪阶层、福音派、小企业主与部分少数族裔选民构成连任联盟。',
      '佛罗里达、宾夕法尼亚、北卡罗来纳、亚利桑那、佐治亚与上中西部仍是核心。',
      '部分共和党官员希望竞选强调政策成绩，而不是持续扩大党内冲突。',
      '大型集会能激发热情，但疫情使传统动员方式面临健康与舆论风险。',
      '民主党把疫情死亡、失业和你的个人风格作为全民公投的核心。',
      '疫情政策、学校开放、救济支出与州长权力使联邦制争论高度具体。',
      '你本人确诊并住院后重返竞选，公众正在评估这段经历传递的信号。',
      '最后阶段必须在扩大郊区支持和最大化基本盘投票率之间作出选择。',
    ], ['south', 'mountain'], ['FL', 'PA', 'NC', 'AZ', 'GA']),
  ]),
]

export function getBuiltinScenario(idOrYear: string | number): CampaignScenario | undefined {
  const value = String(idOrYear).trim().toLowerCase()
  return BUILTIN_SCENARIOS.find((item) => item.id.toLowerCase() === value || String(item.year) === value)
}

export function getRoute(scenario: CampaignScenario, candidateId: string): CampaignRoute | undefined {
  return scenario.routes.find((item) => item.candidateId === candidateId)
}

export function getCandidate(scenario: CampaignScenario, idOrAlias: string): CampaignCandidate | undefined {
  const value = idOrAlias.trim().toLowerCase()
  return scenario.candidates.find((item) => item.id.toLowerCase() === value || item.aliases.some((alias) => alias.toLowerCase() === value))
}

