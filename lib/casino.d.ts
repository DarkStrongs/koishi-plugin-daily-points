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
    /** 往奖池添加金额（按当前值上浮） */
    feedCasinoPool(delta: number): Promise<number>;
    /** 抽干奖池（未使用，留给彩票等） */
    drainCasinoPool(): Promise<number>;
}
/** 赌场系统：猜大小 / 轮盘 / 21点 + 奖池 */
export declare function registerCasino({ ctx, config, core }: CasinoDeps): CasinoHelpers;
