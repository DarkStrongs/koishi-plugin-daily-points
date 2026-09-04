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
}
export declare function registerProperty({ ctx, config, core, logger }: PropertyDeps): PropertyHelpers;
