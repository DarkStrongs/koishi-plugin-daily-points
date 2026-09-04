import { Context } from 'koishi';
import { Config } from './config';
import { CoreUtils } from './core';
export interface CalendarDeps {
    ctx: Context;
    config: Config;
    core: CoreUtils;
}
export declare function registerCalendar({ ctx, config, core }: CalendarDeps): void;
