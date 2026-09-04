import { CampaignDistrict, CampaignState } from './types'

type HistoricalRow = [margin: number, turnoutThousands: number, thirdPartyShare: number]
type StateTuple = [id: string, name: string, english: string, region: string, tileX: number, tileY: number, ev1960: number, ev1964: number, ev2020: number]

const STATE_TUPLES: StateTuple[] = [
  ['AK', '阿拉斯加', 'Alaska', 'pacific', 0, 0, 3, 3, 3],
  ['AL', '阿拉巴马', 'Alabama', 'south', 7, 5, 11, 10, 9],
  ['AR', '阿肯色', 'Arkansas', 'south', 5, 4, 8, 6, 6],
  ['AZ', '亚利桑那', 'Arizona', 'mountain', 2, 4, 4, 5, 11],
  ['CA', '加利福尼亚', 'California', 'pacific', 0, 3, 32, 40, 55],
  ['CO', '科罗拉多', 'Colorado', 'mountain', 3, 4, 6, 6, 9],
  ['CT', '康涅狄格', 'Connecticut', 'new-england', 10, 2, 8, 8, 7],
  ['DC', '华盛顿哥伦比亚特区', 'Washington DC', 'mid-atlantic', 9, 4, 0, 3, 3],
  ['DE', '特拉华', 'Delaware', 'mid-atlantic', 9, 3, 3, 3, 3],
  ['FL', '佛罗里达', 'Florida', 'south', 9, 6, 10, 14, 29],
  ['GA', '佐治亚', 'Georgia', 'south', 8, 5, 12, 12, 16],
  ['HI', '夏威夷', 'Hawaii', 'pacific', 1, 0, 3, 4, 4],
  ['IA', '艾奥瓦', 'Iowa', 'plains', 4, 2, 10, 9, 6],
  ['ID', '爱达荷', 'Idaho', 'mountain', 1, 2, 4, 4, 4],
  ['IL', '伊利诺伊', 'Illinois', 'great-lakes', 5, 2, 27, 26, 20],
  ['IN', '印第安纳', 'Indiana', 'great-lakes', 6, 2, 13, 13, 11],
  ['KS', '堪萨斯', 'Kansas', 'plains', 4, 3, 8, 7, 6],
  ['KY', '肯塔基', 'Kentucky', 'south', 6, 3, 10, 9, 8],
  ['LA', '路易斯安那', 'Louisiana', 'south', 5, 5, 10, 10, 8],
  ['MA', '马萨诸塞', 'Massachusetts', 'new-england', 10, 1, 16, 14, 11],
  ['MD', '马里兰', 'Maryland', 'mid-atlantic', 8, 3, 9, 10, 10],
  ['ME', '缅因', 'Maine', 'new-england', 11, 0, 5, 4, 4],
  ['MI', '密歇根', 'Michigan', 'great-lakes', 6, 1, 20, 21, 16],
  ['MN', '明尼苏达', 'Minnesota', 'great-lakes', 4, 1, 11, 10, 10],
  ['MO', '密苏里', 'Missouri', 'plains', 5, 3, 13, 12, 10],
  ['MS', '密西西比', 'Mississippi', 'south', 6, 5, 8, 7, 6],
  ['MT', '蒙大拿', 'Montana', 'mountain', 2, 1, 4, 4, 3],
  ['NC', '北卡罗来纳', 'North Carolina', 'south', 8, 4, 14, 13, 15],
  ['ND', '北达科他', 'North Dakota', 'plains', 3, 1, 4, 4, 3],
  ['NE', '内布拉斯加', 'Nebraska', 'plains', 3, 3, 6, 5, 5],
  ['NH', '新罕布什尔', 'New Hampshire', 'new-england', 10, 0, 4, 4, 4],
  ['NJ', '新泽西', 'New Jersey', 'mid-atlantic', 9, 2, 16, 17, 14],
  ['NM', '新墨西哥', 'New Mexico', 'mountain', 3, 5, 4, 4, 5],
  ['NV', '内华达', 'Nevada', 'mountain', 1, 3, 3, 3, 6],
  ['NY', '纽约', 'New York', 'mid-atlantic', 9, 1, 45, 43, 29],
  ['OH', '俄亥俄', 'Ohio', 'great-lakes', 7, 2, 25, 26, 18],
  ['OK', '俄克拉何马', 'Oklahoma', 'south', 4, 4, 8, 8, 7],
  ['OR', '俄勒冈', 'Oregon', 'pacific', 0, 2, 6, 6, 7],
  ['PA', '宾夕法尼亚', 'Pennsylvania', 'mid-atlantic', 8, 2, 32, 29, 20],
  ['RI', '罗得岛', 'Rhode Island', 'new-england', 11, 2, 4, 4, 4],
  ['SC', '南卡罗来纳', 'South Carolina', 'south', 8, 6, 8, 8, 9],
  ['SD', '南达科他', 'South Dakota', 'plains', 3, 2, 4, 4, 3],
  ['TN', '田纳西', 'Tennessee', 'south', 6, 4, 11, 11, 11],
  ['TX', '得克萨斯', 'Texas', 'south', 4, 6, 24, 25, 38],
  ['UT', '犹他', 'Utah', 'mountain', 2, 3, 4, 4, 6],
  ['VA', '弗吉尼亚', 'Virginia', 'south', 8, 3, 12, 12, 13],
  ['VT', '佛蒙特', 'Vermont', 'new-england', 11, 1, 3, 3, 3],
  ['WA', '华盛顿州', 'Washington', 'pacific', 0, 1, 9, 9, 12],
  ['WI', '威斯康星', 'Wisconsin', 'great-lakes', 5, 1, 12, 12, 10],
  ['WV', '西弗吉尼亚', 'West Virginia', 'south', 7, 3, 8, 7, 5],
  ['WY', '怀俄明', 'Wyoming', 'mountain', 2, 2, 3, 3, 3],
]

// [民主党相对共和党的两党得票差、总投票数（千）、主要第三方比例]。
// 1960—1968 原始票数来自公开的历史州级汇总，2020 依据官方最终结果汇总。
const RESULTS: Record<number, Record<string, HistoricalRow>> = {
  1960: {AK:[-1.88,61,0],AL:[14.44,564,1.45],AR:[7.64,429,6.76],AZ:[-11.17,398,.12],CA:[-.55,6507,.35],CO:[-9.77,736,.46],CT:[7.46,1223,0],DE:[1.64,197,.37],FL:[-3.03,1544,0],GA:[25.12,733,.03],HI:[.06,185,0],IA:[-13.5,1274,.07],ID:[-7.57,300,0],IL:[.19,4757,.22],IN:[-10.47,2135,.37],KS:[-21.44,929,.45],KY:[-7.18,1124,0],LA:[27.63,808,20.99],MA:[20.72,2469,.22],MD:[7.23,1055,0],ME:[-14.1,422,0],MI:[2.02,3318,.31],MN:[1.43,1542,.26],MO:[.52,1934,0],MS:[19.13,298,38.99],MT:[-2.51,278,.31],NC:[4.22,1369,0],ND:[-10.91,278,.06],NE:[-24.14,613,0],NH:[-6.84,296,0],NJ:[.8,2773,.88],NM:[.74,311,.43],NV:[2.32,107,0],NY:[5.27,7291,.2],OH:[-6.57,4162,0],OK:[-18.04,903,0],OR:[-5.24,776,.12],PA:[2.33,5007,.21],RI:[27.26,406,0],SC:[2.48,387,0],SD:[-16.43,306,0],TN:[-7.24,1052,1.31],TX:[2.02,2311,.96],UT:[-9.64,375,.03],VA:[-5.5,771,.6],VT:[-17.3,167,0],WA:[-2.44,1242,1.05],WI:[-3.73,1729,.18],WV:[5.47,838,0],WY:[-10.03,141,0]},
  1964: {AK:[31.82,67,0],AL:[-100,479,0],AR:[12.72,557,0],AZ:[-1,480,0],CA:[18.33,7051,0],CO:[23.2,773,0],CT:[35.76,1217,0],DC:[71,199,0],DE:[22.23,201,0],FL:[2.3,1854,0],GA:[-8.25,1139,0],HI:[57.52,207,0],IA:[24.01,1182,0],ID:[1.83,292,0],IL:[18.94,4703,0],IN:[12.48,2082,0],KS:[9.11,851,0],KY:[28.45,1043,0],LA:[-13.63,896,0],MA:[52.94,2336,0],MD:[30.94,1116,0],ME:[37.68,381,0],MI:[33.67,3197,0],MN:[27.82,1551,0],MO:[28.1,1818,0],MS:[-74.28,409,0],MT:[18.47,277,0],NC:[12.3,1425,0],ND:[16.12,258,0],NE:[5.21,584,0],NH:[27.78,288,0],NJ:[31.92,2832,0],NM:[19.08,326,0],NV:[17.16,135,0],NY:[37.3,7157,0],OH:[25.89,3969,0],OK:[11.49,932,0],OR:[27.84,784,0],PA:[30.33,4805,0],RI:[61.74,390,0],SC:[-17.79,525,0],SD:[11.22,293,0],TN:[11.01,1144,0],TX:[26.88,2622,0],UT:[9.73,400,0],VA:[7.38,1039,0],VT:[32.62,163,0],WA:[24.76,1250,0],WI:[24.39,1689,0],WV:[35.87,792,0],WY:[13.12,143,0]},
  1968: {AK:[-3,83,12.07],AL:[14.46,1035,66.81],AR:[-1.11,610,38.65],AZ:[-22,484,9.63],CA:[-3.33,7199,6.77],CO:[-9.96,805,7.55],CT:[5.5,1255,6.11],DC:[63.64,171,0],DE:[-4.05,214,13.28],FL:[-13.43,2188,28.53],GA:[-6.39,1250,42.84],HI:[21.44,236,1.47],IA:[-13,1162,5.72],ID:[-29.88,291,12.55],IL:[-3.2,4606,8.49],IN:[-13.94,2118,11.48],KS:[-22.47,871,10.21],KY:[-7.54,1053,18.34],LA:[9.18,1097,48.32],MA:[31.41,2323,3.75],MD:[1.92,1235,14.47],ME:[12.43,393,1.62],MI:[7.5,3296,10.07],MN:[13.13,1585,4.35],MO:[-1.28,1810,11.39],MS:[25.98,655,63.46],MT:[-9.77,273,7.33],NC:[-14.94,1587,31.26],ND:[-18.81,248,5.75],NE:[-30.57,537,8.36],NH:[-8.52,297,3.77],NJ:[-2.37,2852,9.19],NM:[-13.21,326,7.91],NV:[-9.41,154,13.25],NY:[5.8,6745,5.32],OH:[-2.59,3959,11.81],OK:[-19.7,943,20.33],OR:[-6.46,817,6.08],PA:[3.89,4728,8.01],RI:[33.66,385,4.08],SC:[-12.53,667,32.3],SD:[-11.88,281,4.76],TN:[-14.73,1249,34.02],TX:[1.56,3079,18.98],UT:[-20.75,422,6.37],VA:[-14.32,1355,23.76],VT:[-9.58,161,3.18],WA:[2.29,1302,7.45],WI:[-3.93,1687,7.58],WV:[9.76,754,9.62],WY:[-22.18,127,8.73]},
  2020: {AL:[-25.82,2291,2],AK:[-10.52,344,2],AZ:[.31,3334,2],AR:[-28.42,1185,2],CA:[29.82,17117,2],CO:[13.88,3169,2],CT:[20.39,1796,2],DE:[19.25,497,2],DC:[88.93,336,2],FL:[-3.39,10966,2],GA:[.24,4935,2],HI:[30.07,563,2],ID:[-31.75,841,2],IL:[17.32,5919,2],IN:[-16.4,2972,2],IA:[-8.37,1657,2],KS:[-14.99,1342,2],KY:[-26.4,2099,2],LA:[-18.93,2112,2],ME:[9.34,796,2],MD:[34.06,2961,2],MA:[34.23,3549,2],MI:[2.83,5454,2],MN:[7.28,3201,2],MS:[-16.77,1296,2],MO:[-15.67,2972,2],MT:[-16.79,588,2],NE:[-19.57,931,2],NV:[2.45,1373,2],NH:[7.5,791,2],NJ:[16.14,4492,2],NM:[11.04,904,2],NY:[23.45,8497,2],NC:[-1.37,5443,2],ND:[-34.41,351,2],OH:[-8.15,5834,2],OK:[-33.88,1524,2],OR:[16.61,2299,2],PA:[1.18,6836,2],RI:[21.2,507,2],SC:[-11.85,2477,2],SD:[-26.87,412,2],TN:[-23.66,2996,2],TX:[-5.66,11149,2],UT:[-21.39,1425,2],VT:[36.6,356,2],VA:[10.31,4376,2],WA:[19.85,3954,2],WV:[-39.6,781,2],WI:[.64,3241,2],WY:[-44.96,267,2]},
}

const EV_INDEX = { 1960: 6, 1964: 7, 1968: 7, 2020: 8 } as const

function districtsFor(year: number, id: string, margin: number): CampaignDistrict[] | undefined {
  if (year !== 2020) return undefined
  if (id === 'ME') return [
    { id: 'ME-AL', name: '缅因全州票', electoralVotes: 2, baselineMargin: margin },
    { id: 'ME-1', name: '缅因第一选区', electoralVotes: 1, baselineMargin: 23.77 },
    { id: 'ME-2', name: '缅因第二选区', electoralVotes: 1, baselineMargin: -7.66 },
  ]
  if (id === 'NE') return [
    { id: 'NE-AL', name: '内布拉斯加全州票', electoralVotes: 2, baselineMargin: margin },
    { id: 'NE-1', name: '内布拉斯加第一选区', electoralVotes: 1, baselineMargin: -15.37 },
    { id: 'NE-2', name: '内布拉斯加第二选区', electoralVotes: 1, baselineMargin: 6.68 },
    { id: 'NE-3', name: '内布拉斯加第三选区', electoralVotes: 1, baselineMargin: -54.27 },
  ]
}

export function createStates(year: 1960 | 1964 | 1968 | 2020): CampaignState[] {
  const evIndex = EV_INDEX[year]
  return STATE_TUPLES.map((row) => {
    const result = RESULTS[year][row[0]] || [0, 1, 0]
    const electoralVotes = row[evIndex] as number
    return {
      id: row[0],
      name: row[1],
      aliases: [row[0], row[1], row[2]],
      region: row[3],
      tileX: row[4],
      tileY: row[5],
      electoralVotes,
      baselineMargin: result[0],
      turnout: result[1] * 1000,
      thirdPartyShare: result[2],
      districts: districtsFor(year, row[0], result[0]),
    }
  })
}

export const STATE_IDS = STATE_TUPLES.map(([id]) => id)

export const ELECTION_SOURCE_NOTE = [
  '选举人票：美国国家档案馆历届 Electoral College Results。',
  '州级普选基线：公开历史州级票数汇总；2020 与官方最终结果交叉核对。',
  '游戏会压缩历史两党差距，显示的初始民调不等同于真实历史预测。',
].join(' ')

