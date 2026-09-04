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
    /** 主动推进行情（初始化时 + 每个刷新周期），返回当前所有股票行 */
    updateStocks(): Promise<StockRow[]>;
    /** 启动行情刷新定时器（由 index.ts 调用） */
    scheduleUpdates(): void;
}
/** 股票系统：行情引擎 + 买入/卖出/持仓/K线 */
export declare function registerStock({ ctx, config, core, logger }: StockDeps): StockHelpers;
