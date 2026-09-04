import { Context } from 'koishi';
import { Config } from './config';
import { CoreUtils } from './core';
export interface RobberyDeps {
    ctx: Context;
    config: Config;
    core: CoreUtils;
    casino: {
        feedCasinoPool(delta: number): Promise<number>;
    };
}
/** 抢劫 + 坐牢系统 */
export declare function registerRobbery({ ctx, config, core, casino }: RobberyDeps): void;
