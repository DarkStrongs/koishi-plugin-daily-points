import { Context } from 'koishi';
import { Config } from './config';
import { CoreUtils } from './core';
export interface BankDeps {
    ctx: Context;
    config: Config;
    core: CoreUtils;
    /** 从 loan 模块注入：结算贷款的利息滚动；返回的是结算后的活跃贷款列表 */
    settleUserLoans(userId: string): Promise<any[]>;
}
/** 银行：活期存款 / 取款 / 定期 / 列表 / 取出 / 资产总览 */
export declare function registerBank({ ctx, config, core, settleUserLoans }: BankDeps): void;
