import { Context } from 'koishi';
import { Config } from './config';
import { CoreUtils } from './core';
export interface BonusDeps {
    ctx: Context;
    config: Config;
    core: CoreUtils;
    logger: import('koishi').Logger;
}
/** 用户当前道具数量（默认查询补签卡） */
export declare function getPropCount(ctx: Context, userId: string, type?: string): Promise<number>;
export declare function registerBonus({ ctx, config, core, logger }: BonusDeps): {
    onSigninSuccess: (userId: string, streak: number, pointsAwarded: number) => Promise<{
        grantedCard: boolean;
        poolTax: number;
    }>;
    scheduleMonthlyDistribution: () => void;
    /** 查询道具数量（供 signin 查询命令复用） */
    getCardCount: (userId: string) => Promise<number>;
};
