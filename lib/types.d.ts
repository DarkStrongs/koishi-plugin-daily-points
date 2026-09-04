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
/** 还款明细 */
export interface RepayDetail {
    id: number;
    type: string;
    pay: number;
    cleared: boolean;
}
