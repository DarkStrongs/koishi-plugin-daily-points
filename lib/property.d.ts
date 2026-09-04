import { Context } from 'koishi';
import { Config } from './config';
import { CoreUtils } from './core';
export interface PropertyDeps {
    ctx: Context;
    config: Config;
    core: CoreUtils;
    logger: import('koishi').Logger;
}
export interface PropertyHelpers {
    ensureZones(): Promise<void>;
    tickMarket(force?: boolean): Promise<any>;
    collectRent(force?: boolean): Promise<any>;
    schedulePropertyUpdates(): void;
    /** 开发商 / 楼盘 / 户型 / 投资 一并种子化 */
    seedDevelopersAndProjects(): Promise<void>;
    /** 项目生命周期 每小时推进：推进阶段 / 判定烂尾 / 自动开盘 / 竣工分红 */
    tickProjects(force?: boolean): Promise<any>;
}
export declare function registerProperty({ ctx, config, core, logger }: PropertyDeps): PropertyHelpers;
