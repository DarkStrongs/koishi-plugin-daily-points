import { Context } from 'koishi';
import { Config } from './config';
import { CoreUtils } from './core';
export interface SigninDeps {
    ctx: Context;
    config: Config;
    core: CoreUtils;
}
/** 注册签到 / 查询 / 排行 / 转移 / 修改 五个命令 */
export declare function registerSignin({ ctx, config, core }: SigninDeps): void;
