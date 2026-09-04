import { Context } from 'koishi';
import { Config } from './config';
import { CoreUtils } from './core';
export interface SigninDeps {
    ctx: Context;
    config: Config;
    core: CoreUtils;
    /** 签到成功后触发的副作用钩子（由 signin.bonus 提供） */
    onSigninSuccess?: (userId: string, streak: number, pointsAwarded: number) => Promise<{
        grantedCard: boolean;
        poolTax: number;
    }>;
    /** 查用户当前补签卡数量 */
    getCardCount?: (userId: string) => Promise<number>;
}
/** 注册签到 / 查询 / 排行 / 转移 / 修改 五个命令 */
export declare function registerSignin({ ctx, config, core, onSigninSuccess, getCardCount }: SigninDeps): void;
