/** 内部数据行的接口定义（导出，供外部扩展 / 测试使用） */
export interface UserRow {
    id: number;
    userId: string;
    points: number;
    bank: number;
    bankUpdatedAt: Date;
    totalEarned: number;
    streak: number;
    lastDate: string;
    lastClaim: Date;
    lastWork: Date;
    bankruptCount: number;
    bankruptUntil: Date;
    dividendTotal: number;
    createdAt: Date;
}
export interface FixedRow {
    id: number;
    userId: string;
    amount: number;
    rate: number;
    termDays: number;
    startAt: Date;
    dueAt: Date;
}
export interface LoanRow {
    id: number;
    userId: string;
    type: 'normal' | 'shark' | string;
    principal: number;
    rate: number;
    remaining: number;
    termDays: number;
    startAt: Date;
    dueAt: Date;
    updatedAt: Date;
    status: 'active' | 'cleared' | string;
}
export interface StockRow {
    code: string;
    name: string;
    base: number;
    vol: number;
    price: number;
    prevPrice: number;
    updatedAt: Date;
    haltedUntil?: Date | null;
    note?: string | null;
}
export interface HistoryRow {
    id: number;
    code: string;
    open: number;
    close: number;
    high: number;
    low: number;
    time: Date;
}
export interface HoldingRow {
    id: number;
    userId: string;
    code: string;
    quantity: number;
    cost: number;
}
/** v1.11.0：每只股每日累计买卖数据（驱动市场） */
export interface VolumeRow {
    code: string;
    date: string;
    buyAmount: number;
    sellAmount: number;
    buyCount: number;
    sellCount: number;
    impactBias: number;
    lastEvent: string;
    lastEventAt: Date;
}
/** v1.11.0：板块定义（投研 + 联动） */
export interface SectorRow {
    code: string;
    name: string;
    color: string;
    icon: string;
}
/** v1.13.0：区域行情（房地产） */
export interface PropertyZoneRow {
    code: string;
    name: string;
    icon: string;
    basePrice: number;
    currentPrice: number;
    trend: number;
    bubbleIndex: number;
    lastEvent: string;
    lastEventAt: Date | null;
    haltedUntil: Date | null;
    policyNote: string;
    updatedAt: Date;
}
/** v1.13.0：用户房产 */
export interface PropertyRow {
    id: number;
    userId: string;
    zoneCode: string;
    type: string;
    quality: number;
    boughtPrice: number;
    boughtAt: Date;
    currentValue: number;
    renting: number;
    lastRentAt: Date;
    accumulatedRent: number;
    status: string;
    soldAt: Date | null;
    soldPrice: number;
    isDerelict: number;
    listedForSale: number;
    listedPrice: number;
    listedAt: Date | null;
}
/** v1.13.0：区域价格历史（K线） */
export interface PropertyHistoryRow {
    id: number;
    zoneCode: string;
    price: number;
    time: Date;
    event: string;
}
/** v1.13.0：政策/灾害事件 */
export interface PropertyEventRow {
    id: number;
    zoneCode: string;
    type: string;
    severity: number;
    message: string;
    startedAt: Date;
    expiresAt: Date | null;
}
/** v1.15.0：赌石 — 类型种子（5 类原石） */
export interface StoneTypeRow {
    code: string;
    name: string;
    icon: string;
    description: string;
    basePrice: number;
    affixPool: string;
    rarityWeights: string;
    updatedAt: Date;
}
/** v1.15.0：赌石 — 当前市场库存 */
export interface StoneMarketRow {
    id: number;
    stoneType: string;
    priceTier: number;
    listedAt: Date;
    expiresAt: Date;
}
/** v1.15.0：赌石 — 用户背包 */
export interface StoneInventoryRow {
    id: number;
    userId: string;
    stoneType: string;
    priceTier: number;
    boughtAt: Date;
    cutAt: Date | null;
    rarity: string | null;
    affixes: string;
    saleMultiplier: number;
    status: 'holding' | 'cut' | 'sold' | string;
    soldAt: Date | null;
    soldValue: number;
}
/** v1.15.0：赌石 — 词条图鉴 */
export interface StoneCodexRow {
    id: number;
    userId: string;
    stoneType: string;
    affixCode: string;
    discoveredAt: Date;
}
/** 词条数据（运行时解析自 affixPool JSON） */
export interface StoneAffix {
    code: string;
    name: string;
    value: number;
}
/** 稀有度枚举（runtime 值） */
export type StoneRarity = 'brick' | 'common' | 'rare' | 'epic' | 'legendary' | 'supreme';
export interface MetaRow {
    key: string;
    value: string;
}
export interface CasinoPoolRow {
    id: number;
    amount: number;
    updatedAt: Date;
}
export interface LotteryPeriodRow {
    id: number;
    period: number;
    winningNumber: string;
    status: 'open' | 'drawn' | string;
    openedAt: Date;
    drawnAt: Date;
    winnerId: string | null;
    ticketCount: number;
    carriedOver: number;
}
export interface LotteryTicketRow {
    id: number;
    period: number;
    userId: string;
    number: string;
    createdAt: Date;
}
export interface ScratchLogRow {
    id: number;
    userId: string;
    cost: number;
    tier: string;
    prize: number;
    createdAt: Date;
}
export interface RobberyLogRow {
    id: number;
    robberId: string;
    victimId: string;
    success: number;
    amount: number;
    createdAt: Date;
}
export interface JailRow {
    userId: string;
    releaseAt: Date;
    reason: string;
    createdAt: Date;
}
/** 签到明细（v1.8.0 新增） */
export interface SigninLogRow {
    id: number;
    userId: string;
    date: string;
    points: number;
    source: string;
    createdAt: Date;
}
/** 用户道具（v1.8.0 新增：通用库存表，首个用途 = 补签卡） */
export interface PropsRow {
    id: number;
    userId: string;
    type: string;
    quantity: number;
    issuedAt: Date;
    meta: string | null;
}
/** 月度签到奖池（v1.8.0 新增） */
export interface MonthlyPoolRow {
    monthKey: string;
    totalPool: number;
    distributedAt: Date | null;
    shareCount: number;
}
/** 还款明细 */
export interface RepayDetail {
    id: number;
    type: string;
    pay: number;
    cleared: boolean;
}
