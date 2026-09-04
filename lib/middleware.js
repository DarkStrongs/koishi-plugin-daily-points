"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerGlueMiddleware = registerGlueMiddleware;
const util_1 = require("./util");
/** 指令「连写」兼容：存款100、还款:500、彩票3 等没有空格的形式被拆成「存款 100」「还款 500」「彩票 3」再 dispatch。 */
function registerGlueMiddleware(ctx) {
    const glueNames = new Set([
        '存款', '取款', '定期存款', '定期取出',
        '贷款', '正常贷款', '高利贷', '还款', '还贷',
        '猜大小', '赌大小', '轮盘', '赌轮盘', '轮盘赌', '21点', '二十一点', '黑杰克',
        '彩票', '买彩票', '刮刮乐', '刮奖', 'ggl',
        'K线', 'k线', '蜡烛图', '走势图', '买入', '卖出',
    ]);
    ctx.middleware((session, next) => {
        const raw = session.content;
        if (typeof raw !== 'string')
            return next();
        const content = raw.trim();
        if (content.length < 3)
            return next();
        // 指令头 + 可选的 [：:，,、] + 数字/全部/all
        const m = content.match(/^(\S+?)[：:，,、]?\s*((?:[０-９0-9][０-９0-9.,，]*)|全部|所有|all)$/);
        if (!m)
            return next();
        const head = m[1];
        if (!glueNames.has(head) && !glueNames.has(head.toLowerCase()))
            return next();
        const cm = ctx.$commander;
        const cmd = cm?.get?.(head) || cm?.get?.(head.toLowerCase());
        if (!cmd || !cmd._arguments || !cmd._arguments.length)
            return next();
        const arg = (0, util_1.toHalfWidth)(m[2]);
        return session.execute(`${head} ${arg}`, next);
    }, true);
}
