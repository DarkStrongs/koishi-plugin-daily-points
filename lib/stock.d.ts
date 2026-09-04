import { Context } from 'koishi';
import { Config } from './config';
import { CoreUtils } from './core';
import { StockRow } from './types';
export interface StockDeps {
    ctx: Context;
    config: Config;
    core: CoreUtils;
    logger: import('koishi').Logger;
}
export interface StockHelpers {
    updateStocks(): Promise<StockRow[]>;
    scheduleUpdates(): void;
}
/** 股票系统：行情引擎 + 撮合冲击 + 板块联动 + 5 命令 + 4 图表 */
export declare function registerStock({ ctx, config, core, logger }: StockDeps): StockHelpers;
