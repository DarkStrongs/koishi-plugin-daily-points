import { Context } from 'koishi';
import { Config } from './config';
import { CoreUtils } from './core';
export interface CasinoDeps {
    ctx: Context;
    config: Config;
    core: CoreUtils;
}
export interface CasinoHelpers {
    /** 获取/初始化赌场奖池，返回当前行 */
    getCasinoPool(): Promise<{
        id: number;
        amount: number;
        updatedAt: Date;
    }>;
    /** 往奖池添加金额（按当前值上浮；delta 可负表示抽出） */
    feedCasinoPool(delta: number): Promise<number>;
    /** 抽干奖池（清零并返回原值） */
    drainCasinoPool(): Promise<number>;
    /** 按需从赌场奖池抽走最多 amount 积分，返回实际抽走的金额（奖池不足则抽走全部） */
    transferFromCasinoPool(amount: number): Promise<number>;
}
/** 赌场系统：猜大小 / 轮盘 / 21点 + 奖池 */
export declare function registerCasino({ ctx, config, core }: CasinoDeps): CasinoHelpers;
