"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCalendar = registerCalendar;
const util_1 = require("./util");
/** 解析 [YYYY-MM] 参数。空 = 当月；非法 = null */
function parseMonthArg(s, refToday) {
    const t = (s || '').trim();
    if (!t) {
        const parts = refToday.split('-');
        return { y: Number(parts[0]), m: Number(parts[1]), monthKey: `${parts[0]}-${parts[1]}` };
    }
    const m2 = /^(\d{4})-(\d{1,2})$/.exec(t);
    if (!m2)
        return null;
    const y = Number(m2[1]);
    const m = Number(m2[2]);
    if (m < 1 || m > 12)
        return null;
    return { y, m, monthKey: `${y}-${String(m).padStart(2, '0')}` };
}
function registerCalendar({ ctx, config, core }) {
    ctx.command('经济/积分/日历 [month:string]', '查看签到日历（可选 [YYYY-MM]，默认当月）')
        .alias('签到日历', 'rili', 'calendar')
        .action(async ({ session }, monthStr) => {
        if (!session.userId)
            return;
        const key = (0, util_1.userKey)(session);
        const today = (0, util_1.dateKey)(config.timezoneOffset);
        const todayY = Number(today.slice(0, 4));
        const todayM = Number(today.slice(5, 7));
        const m = parseMonthArg(monthStr || '', today);
        if (!m)
            return '月份格式不正确，请输入 YYYY-MM（如 2026-09），或留空查当月。';
        // 拉取该用户全部签到日志，再按月过滤
        const logs = await ctx.database.get('daily_signin_log', { userId: key });
        const dates = new Set();
        for (const log of logs) {
            if (log.date && log.date.startsWith(m.monthKey))
                dates.add(log.date);
        }
        const isCurrentMonth = (m.y === todayY && m.m === todayM);
        const todayDay = isCurrentMonth ? Number(today.slice(8, 10)) : 0;
        // 第一天是星期几？JS: 0=Sun, 1=Mon, ..., 6=Sat。我们想要周一开头
        const firstWeekday = new Date(Date.UTC(m.y, m.m - 1, 1)).getUTCDay();
        const startPad = (firstWeekday + 6) % 7; // 把周日(0) -> 6；其他 -1
        const lastDay = new Date(Date.UTC(m.y, m.m, 0)).getUTCDate();
        // 渲染单元
        const cells = [];
        for (let i = 0; i < startPad; i++)
            cells.push('   '); // 3 空格对齐
        for (let day = 1; day <= lastDay; day++) {
            const dateStr = `${m.monthKey}-${String(day).padStart(2, '0')}`;
            let mark = '·'; // 未签
            if (day === todayDay)
                mark = '◉'; // 今天优先
            else if (dates.has(dateStr))
                mark = '✓';
            cells.push(`${String(day).padStart(2, '0')}${mark}`);
        }
        // 7 列分行
        const lines = [];
        lines.push(`${m.monthKey} 签到日历`);
        lines.push('一  二  三  四  五  六  日');
        for (let i = 0; i < cells.length; i += 7) {
            const row = cells.slice(i, i + 7).join(' ');
            // 去掉行尾多余空格
            lines.push(row.replace(/\s+$/, ''));
        }
        // 统计
        const monthSigned = logs.filter((l) => l.date && l.date.startsWith(m.monthKey)).length;
        const userRow = (await core.getUser(key, false)) || null;
        const curStreak = userRow?.streak ?? 0;
        // 本月最长连胜
        let monthMaxStreak = 0;
        const monthDates = [...dates].sort();
        if (monthDates.length) {
            let run = 1;
            for (let i = 1; i < monthDates.length; i++) {
                const diff = Math.round((new Date(monthDates[i]).getTime() - new Date(monthDates[i - 1]).getTime()) / 86400000);
                if (diff === 1)
                    run++;
                else
                    run = 1;
                monthMaxStreak = Math.max(monthMaxStreak, run);
            }
            monthMaxStreak = Math.max(monthMaxStreak, run);
        }
        const missing = lastDay - monthSigned;
        const fillRate = lastDay ? Math.round((monthSigned / lastDay) * 100) : 0;
        lines.push('');
        lines.push(`📊 当月已签 ${monthSigned} / ${lastDay} 天（出勤率 ${fillRate}%${missing > 0 ? `，还差 ${missing} 天满勤` : '，满勤 ✨'}）`);
        lines.push(`🔥 本月最长连胜：${monthMaxStreak} 天 · 当前连续：${curStreak} 天`);
        // 补签卡提示（如果有牌且当月有漏签）
        if (isCurrentMonth && dates.size < todayDay) {
            const cards = (await ctx.database.get('daily_props', { userId: key, type: 'streak_makeup_card' }))[0];
            const cardCount = cards?.quantity ?? 0;
            if (cardCount > 0) {
                lines.push(`🎟 你还有 ${cardCount} 张补签卡，发送「补签」可补回近期漏签日期。`);
            }
        }
        return lines.join('\n');
    });
}
