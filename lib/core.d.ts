import { Context } from 'koishi';
import { Config } from './config';
import { UserRow } from './types';
/** 共享数据访问层。被其他模块 import，避免循环依赖。
 *  - getUser / settleBank / inJail / inBankruptcy / getStockValue / broadcast / dbTx
 */
export interface CoreDeps {
    ctx: Context;
    config: Config;
    logger: import('koishi').Logger;
}
export interface CoreUtils {
    /** 获取或创建用户行。create=false 时找不到返回 null */
    getUser(userId: string, create?: boolean): Promise<UserRow | null>;
    /** 结算活期利息（按整小时复利），返回本次获得的利息（积分），并回写 row.bank */
    settleBank(row: UserRow): Promise<number>;
    /** 当前是否处于破产黑名单期（破产 punchlist），返回到期时间戳（0 表示不在惩罚期） */
    inBankruptcy(userId: string): Promise<number>;
    /** 当前是否在坐牢（来自抢劫），返回到期时间戳（0 表示不在牢） */
    inJail(userId: string): Promise<number>;
    /** 查询用户总股票市值 */
    getStockValue(userId: string): Promise<number>;
    /** 主动广播到配置频道 */
    broadcast(message: string): Promise<void>;
    /** 事务包装：所有相关 set/create/remove 在一个事务内，要么全成要么全败 */
    dbTx<T>(fn: (db: Context['database']) => Promise<T>): Promise<T>;
}
export declare function createCore({ ctx, config, logger }: CoreDeps): CoreUtils;
