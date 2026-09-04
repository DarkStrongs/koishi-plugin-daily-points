import { Context } from 'koishi';
import { Config } from './config';
import { CoreUtils } from './core';
import { LoanRow } from './types';
export interface LoanDeps {
    ctx: Context;
    config: Config;
    core: CoreUtils;
    logger: import('koishi').Logger;
}
export interface LoanHelpers {
    /** 结算某用户所有未结清贷款的利息（按小时复利，逾期后利率上浮），返回结算后的活跃贷款列表 */
    settleUserLoans(userId: string): Promise<LoanRow[]>;
    /** 启动催收定时器（由 index.ts 调用） */
    scheduleCollectors(): void;
}
/** 贷款系统：正常贷款 + 高利贷 + 还款 + 欠款 + 催收 + 打工 + 破产 */
export declare function registerLoan({ ctx, config, core, logger }: LoanDeps): LoanHelpers;
