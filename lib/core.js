"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCore = createCore;
const config_1 = require("./config");
function createCore({ ctx, config, logger }) {
    /** 主动广播：向配置的所有频道发送消息 */
    async function broadcast(message) {
        if (!config.broadcastChannels?.length)
            return;
        for (const channel of config.broadcastChannels) {
            const [platform, channelId] = channel.split(':');
            if (!platform || !channelId)
                continue;
            try {
                await ctx.broadcast([`${platform}:${channelId}`], message);
            }
            catch (e) {
                logger.warn(`广播到 ${channel} 失败：`, e.message);
            }
        }
    }
    async function getUser(userId, create = true) {
        const rows = await ctx.database.get('daily_points', { userId });
        const row = rows[0];
        if (row)
            return row;
        if (!create)
            return null;
        // 一次性 upsert，避免双重读
        const fresh = await ctx.database.create('daily_points', {
            userId,
            points: 0,
            bank: 0,
            bankUpdatedAt: new Date(),
            totalEarned: 0,
            streak: 0,
            lastDate: null,
            lastClaim: new Date(),
            createdAt: new Date(),
        });
        return Array.isArray(fresh) ? fresh[0] : fresh;
    }
    async function settleBank(row) {
        const now = Date.now();
        if (!row.bankUpdatedAt)
            row.bankUpdatedAt = new Date(now);
        if (!row.bank || row.bank <= 0) {
            if (row.bank !== 0) {
                row.bank = 0;
                await ctx.database.set('daily_points', { userId: row.userId }, { bank: 0, bankUpdatedAt: new Date(now) });
            }
            return 0;
        }
        const elapsed = now - new Date(row.bankUpdatedAt).getTime();
        const hours = Math.min(Math.floor(elapsed / config_1.HOUR), 720); // 最多补 30 天利息
        if (hours < 1)
            return 0;
        const factor = Math.pow(1 + config.bankHourlyRate, hours);
        const interest = Math.floor(row.bank * factor - row.bank);
        const newTs = new Date(new Date(row.bankUpdatedAt).getTime() + hours * config_1.HOUR);
        if (interest > 0)
            row.bank += interest;
        await ctx.database.set('daily_points', { userId: row.userId }, { bank: row.bank, bankUpdatedAt: newTs });
        row.bankUpdatedAt = newTs;
        return interest;
    }
    async function inBankruptcy(userId) {
        const row = await getUser(userId, false);
        if (!row || !row.bankruptUntil)
            return 0;
        const ts = new Date(row.bankruptUntil).getTime();
        return Date.now() < ts ? ts : 0;
    }
    async function inJail(userId) {
        const rows = await ctx.database.get('daily_jail', { userId });
        const row = rows[0];
        if (!row || !row.releaseAt)
            return 0;
        const ts = new Date(row.releaseAt).getTime();
        if (Date.now() < ts)
            return ts;
        await ctx.database.remove('daily_jail', { userId });
        return 0;
    }
    async function getStockValue(userId) {
        const [holdings, stocks] = await Promise.all([
            ctx.database.get('daily_stock_holding', { userId }),
            ctx.database.get('daily_stocks'),
        ]);
        const priceMap = new Map(stocks.map((s) => [s.code, s.price]));
        return holdings.reduce((sum, h) => sum + (priceMap.get(h.code) || 0) * h.quantity, 0);
    }
    /** Koishi v4 提供 transaction；用 ts-unknown 兼容旧实现 */
    async function dbTx(fn) {
        const db = ctx.database;
        if (typeof db.transaction === 'function') {
            return await db.transaction(async (tx) => {
                return await fn(tx);
            });
        }
        return await fn(ctx.database);
    }
    return {
        getUser, settleBank, inBankruptcy, inJail, getStockValue,
        broadcast, dbTx,
    };
}
