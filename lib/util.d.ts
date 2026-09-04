/** 整型随机数（含两端） */
export declare function randomInt(min: number, max: number): number;
/** 时间戳 → 本地化字符串（zh-CN，24 小时制） */
export declare function fmtTime(ts: number): string;
/** 金额保留两位小数（用于显示） */
export declare function fmtMoney(n: number): string;
/** 取本地日期字符串（YYYY-MM-DD），按配置时区计算；offsetDays 为相对今天的天数偏移 */
export declare function dateKey(offsetHours: number, offsetDays?: number): string;
/** 解析金额参数：支持「全部/all/所有」或正整数；返回 null 表示无效 */
export declare function parseAmount(text: string | undefined, max: number): number | null;
/** 全角数字 → 半角（用于连写兼容中间件） */
export declare function toHalfWidth(s: string): string;
/** 用户完整 key：拼上平台，便于跨平台隔离 */
export declare function userKey(session: {
    platform: string;
    userId: string;
}): string;
