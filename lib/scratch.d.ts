import { Context } from 'koishi';
import { Config } from './config';
import { CoreUtils } from './core';
export interface ScratchDeps {
    ctx: Context;
    config: Config;
    core: CoreUtils;
}
/** 刮刮乐：即买即开 */
export declare function registerScratch({ ctx, config, core }: ScratchDeps): void;
