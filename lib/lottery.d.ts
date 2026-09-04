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
    };
    logger: import('koishi').Logger;
}
export interface LotteryHelpers {
    ensureLotteryPeriod(): Promise<any>;
    drawLotteryIfDue(force?: boolean): Promise<any>;
    scheduleDraws(): void;
}
/** 彩票系统：买票 + 定期开奖 + 全局奖池滚存 */
export declare function registerLottery({ ctx, config, core, casino, logger }: LotteryDeps): LotteryHelpers;
