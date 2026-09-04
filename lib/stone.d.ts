import { Context } from 'koishi';
import { Config } from './config';
import { CoreUtils } from './core';
/**
 * v1.16.0 赌石（产地×属性×评语×废石升级）
 *
 * 新增维度：
 *  - 11 个产地（缅甸 / 越南 / 日本 / 新疆 / 云南 / 俄罗斯 / 蒙古 / 巴西 / 阿根廷 / 泰国 / 江湖散石）
 *  - 5 维随机属性（体积 / 形状 / 皮壳 / 透光度 / 净度），全部影响出货概率
 *  - 完整评语系统（切石后生成完整段落：来源 / 外形 / 切割结果 / 评级 / 建议）
 *  - 8 种废石头（除 trash + brick，新增 sandstone / limestone / ore / cracked / blinded / fake_skin）
 *  - 价格档提价 5×~15×（T1=¥500；T5=¥1.5M；与产地 mul 相乘可达 ¥3.75M）
 *
 * 与 v1.15.0 关系：
 *  - market/inventory 各加 2 列（origin + attributes）+ inventory +3 列（comment/grade/wasteSubtype）
 *  - stone_types +1 列（originCatalog JSON，列出该类石头支持的产地与稀有度修正）
 *  - 已有命令行为完全兼容；旧数据没新列时默认 'various' + {}
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
export interface OriginSeed {
    code: string;
    name: string;
    flag: string;
    priceMul: number;
    /** 任意稀有度倍率（key 含 base 的 brick/common/rare/epic/legendary/supreme + 子废石 trash） */
    rarityMod: Record<string, number>;
    stoneTypes: string[];
}
export declare function registerStone({ ctx, config, core, casino }: StoneDeps): StoneHelpers;
