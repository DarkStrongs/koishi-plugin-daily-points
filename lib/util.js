"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.randomInt = randomInt;
exports.fmtTime = fmtTime;
exports.fmtMoney = fmtMoney;
exports.dateKey = dateKey;
exports.parseAmount = parseAmount;
exports.toHalfWidth = toHalfWidth;
exports.userKey = userKey;
const config_1 = require("./config");
/** 整型随机数（含两端） */
function randomInt(min, max) {
    if (max < min)
        max = min;
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
/** 时间戳 → 本地化字符串（zh-CN，24 小时制） */
function fmtTime(ts) {
    return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}
/** 金额保留两位小数（用于显示） */
function fmtMoney(n) {
    return (Math.round(n * 100) / 100).toString();
}
/** 取本地日期字符串（YYYY-MM-DD），按配置时区计算；offsetDays 为相对今天的天数偏移 */
function dateKey(offsetHours, offsetDays = 0) {
    const t = Date.now() + offsetHours * config_1.HOUR - offsetDays * config_1.DAY;
    return new Date(t).toISOString().slice(0, 10);
}
/** 解析金额参数：支持「全部/all/所有」或正整数；返回 null 表示无效 */
function parseAmount(text, max) {
    if (text === undefined || text === null || text === '')
        return null;
    const t = String(text).trim().toLowerCase().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    if (['全部', '所有', 'all'].includes(t))
        return Math.floor(max);
    const n = Math.floor(Number(t));
    if (!Number.isFinite(n) || n <= 0)
        return null;
    return n;
}
/** 全角数字 → 半角（用于连写兼容中间件） */
function toHalfWidth(s) {
    return s.replace(/[：]/g, ':')
        .replace(/[，]/g, ',')
        .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}
/** 用户完整 key：拼上平台，便于跨平台隔离 */
function userKey(session) {
    return `${session.platform}:${session.userId}`;
}
