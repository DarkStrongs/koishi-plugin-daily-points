import { Context } from 'koishi';
import { Config } from './config';
import { CoreUtils } from './core';
/**
 * v1.15.0 赌石（收藏型积分回收）系统
 *
 * 设计核心：
 *  - 强制囤石流（不买不切不卖→不卖啥事都没有；卖掉就亏）
 *  - 词条是 RPG 风格的随机 affix 集合
 *  - 立即卖出价 = basePrice × (词条价值总和)，亏；持有越久价值越高，但有软/硬上限
 *  - 卖出后部分流回赌场池（v1.12.0 已建立的连接），剩余部分销毁
 *  - E[立即卖] < 买入价 → 高投入低回报（积分回收）
 */
export interface StoneDeps {
    ctx: Context;
    config: Config;
    core: CoreUtils;
    /** 外部注入：casino.feedCasinoPool(amount)（让赌石抽水能流到赌场池） */
    casino: {
        feedCasinoPool(delta: number): Promise<number>;
    };
}
export interface StoneHelpers {
    /** 启动定时器：刷新市场 + 清理过期库存 */
    scheduleStoneMarketRefresh(): void;
}
export declare function registerStone({ ctx, config, core, casino }: StoneDeps): StoneHelpers;
