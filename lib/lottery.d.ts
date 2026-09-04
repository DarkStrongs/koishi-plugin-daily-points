import { Context } from 'koishi';
import { Config } from './config';
import { CoreUtils } from './core';
export interface LotteryDeps {
    ctx: Context;
    config: Config;
    core: CoreUtils;
    casino: {
        getCasinoPool(): Promise<{
            amount: number;
        }>;
        /** 从赌场奖池抽走最多 amount 积分，返回实际抽走的金额 */
        transferFromCasinoPool(amount: number): Promise<number>;
    };
    logger: import('koishi').Logger;
}
export interface LotteryHelpers {
    ensureLotteryPeriod(): Promise<any>;
    drawLotteryIfDue(force?: boolean): Promise<any>;
    scheduleDraws(): void;
    /** 检查奖池是否跨过里程碑（用于买票后即时触发） */
    checkPoolMilestones?(poolAmount: number): Promise<void>;
}
/** 彩票系统：买票 + 定期开奖 + 多档奖项 + 赌场奖池注入 */
export declare function registerLottery({ ctx, config, core, casino, logger }: LotteryDeps): LotteryHelpers;
