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
/**
 * 抢劫 + 坐牢系统（v1.10.0 起支持削弱模式）
 *
 * 削弱模式（`robberyNerfMode = true`，默认开启）下：
 *   - 数值上界/下界自动收紧（成功率 0.3 / 抢得 15% / 失败赔 60% / 冷却 60min / 日限 3 次）
 *   - 4 档机制保护：
 *       A 被抢冷却 N 小时：被同一人抢过，对方再来被拦下
 *       B 复仇窗口 N 分钟：被抢 N 分钟内抢回对方，成功率 × boost
 *       C 连败加刑：连续失败 N 次后，本轮刑期 × multiplier
 *       D 被抢方广播通知：成功后自动向全平台广播「被抢」消息（含 at 提及）
 */
export declare function registerRobbery({ ctx, config, core, casino }: RobberyDeps): void;
