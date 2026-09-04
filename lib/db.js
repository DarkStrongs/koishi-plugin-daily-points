"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerModels = registerModels;
/** 在 ctx 上注册所有 daily_* 数据表 */
function registerModels(ctx) {
    // 用户主表：现金（积分）+ 活期存款
    ctx.model.extend('daily_points', {
        id: 'unsigned',
        userId: 'string(64)',
        points: 'integer',
        bank: 'double',
        bankUpdatedAt: 'timestamp(3)',
        totalEarned: 'integer',
        streak: 'integer',
        lastDate: 'string(10)',
        lastClaim: 'timestamp(3)',
        lastWork: 'timestamp(3)',
        bankruptCount: 'integer',
        bankruptUntil: 'timestamp(3)',
        dividendTotal: 'double',
        createdAt: 'timestamp(3)',
    }, {
        primary: 'id',
        autoInc: true,
        unique: ['userId'],
    });
    // 定期存款
    ctx.model.extend('daily_fixed', {
        id: 'unsigned',
        userId: 'string(64)',
        amount: 'unsigned',
        rate: 'double',
        termDays: 'unsigned',
        startAt: 'timestamp(3)',
        dueAt: 'timestamp(3)',
    }, {
        primary: 'id',
        autoInc: true,
    });
    // 贷款（normal = 正常贷款 / shark = 高利贷）
    ctx.model.extend('daily_loans', {
        id: 'unsigned',
        userId: 'string(64)',
        type: 'string(8)',
        principal: 'unsigned',
        rate: 'double',
        remaining: 'double',
        termDays: 'unsigned',
        startAt: 'timestamp(3)',
        dueAt: 'timestamp(3)',
        updatedAt: 'timestamp(3)',
        status: 'string(8)',
    }, {
        primary: 'id',
        autoInc: true,
    });
    // 股票行情
    ctx.model.extend('daily_stocks', {
        code: 'string(16)',
        name: 'string(64)',
        base: 'double',
        vol: 'double',
        price: 'double',
        prevPrice: 'double',
        updatedAt: 'timestamp(3)',
        haltedUntil: 'timestamp(3)',
        note: 'string(128)',
        sector: 'string(16)',
    }, {
        primary: 'code',
        index: [['sector']],
    });
    // K线历史（每周期一根：开高低收）
    ctx.model.extend('daily_stock_history', {
        id: 'unsigned',
        code: 'string(16)',
        open: 'double',
        close: 'double',
        high: 'double',
        low: 'double',
        time: 'timestamp(3)',
    }, {
        primary: 'id',
        autoInc: true,
        index: [['code'], ['time']],
    });
    // 用户持仓
    ctx.model.extend('daily_stock_holding', {
        id: 'unsigned',
        userId: 'string(64)',
        code: 'string(16)',
        quantity: 'unsigned',
        cost: 'double',
    }, {
        primary: 'id',
        autoInc: true,
        unique: [['userId', 'code']],
    });
    // 元数据（如股票上次刷新时间、IPO 计数、最新消息、彩票新闻、冷却时间戳）
    ctx.model.extend('daily_meta', {
        key: 'string(64)',
        value: 'string(256)',
    }, {
        primary: 'key',
    });
    // 赌场奖池（单行：id=1）
    ctx.model.extend('daily_casino_pool', {
        id: 'unsigned',
        amount: 'double',
        updatedAt: 'timestamp(3)',
    }, {
        primary: 'id',
    });
    // 彩票期数（v1.12.0 加 casinoContribution / payoutTotal / winningTier 字段）
    ctx.model.extend('daily_lottery_periods', {
        id: 'unsigned',
        period: 'unsigned',
        winningNumber: 'string(16)',
        status: 'string(16)',
        openedAt: 'timestamp(3)',
        drawnAt: 'timestamp(3)',
        winnerId: 'string(64)',
        ticketCount: 'unsigned',
        carriedOver: 'double',
        casinoContribution: 'double',
        basePool: 'double',
        ticketRevenue: 'double',
        poolTotal: 'double',
        payoutTotal: 'double',
        winningTier: 'string(16)',
    }, {
        primary: 'id',
        autoInc: true,
        unique: ['period'],
    });
    // 彩票投注
    ctx.model.extend('daily_lottery_tickets', {
        id: 'unsigned',
        period: 'unsigned',
        userId: 'string(64)',
        number: 'string(16)',
        createdAt: 'timestamp(3)',
    }, {
        primary: 'id',
        autoInc: true,
        index: [['period'], ['userId']],
    });
    // 彩票中奖明细（v1.12.0：多档奖项，每行一条中奖记录）
    ctx.model.extend('daily_lottery_winners', {
        id: 'unsigned',
        period: 'unsigned',
        userId: 'string(64)',
        number: 'string(16)',
        tier: 'string(16)',
        matchedCount: 'unsigned',
        prize: 'unsigned',
        createdAt: 'timestamp(3)',
    }, {
        primary: 'id',
        autoInc: true,
        index: [['period'], ['userId']],
    });
    // 刮刮乐记录
    ctx.model.extend('daily_scratch_log', {
        id: 'unsigned',
        userId: 'string(64)',
        cost: 'unsigned',
        tier: 'string(16)',
        prize: 'unsigned',
        createdAt: 'timestamp(3)',
    }, {
        primary: 'id',
        autoInc: true,
        index: [['userId'], ['createdAt']],
    });
    // 抢劫记录（用于冷却 + 每日上限）
    ctx.model.extend('daily_robbery_log', {
        id: 'unsigned',
        robberId: 'string(64)',
        victimId: 'string(64)',
        success: 'unsigned',
        amount: 'integer',
        createdAt: 'timestamp(3)',
    }, {
        primary: 'id',
        autoInc: true,
        index: [['robberId'], ['createdAt']],
    });
    // 坐牢状态
    ctx.model.extend('daily_jail', {
        userId: 'string(64)',
        releaseAt: 'timestamp(3)',
        reason: 'string(64)',
        createdAt: 'timestamp(3)',
    }, {
        primary: 'userId',
    });
    // 签到明细（v1.8.0）
    ctx.model.extend('daily_signin_log', {
        id: 'unsigned',
        userId: 'string(64)',
        date: 'string(10)',
        points: 'unsigned',
        source: 'string(16)',
        createdAt: 'timestamp(3)',
    }, {
        primary: 'id',
        autoInc: true,
        index: [['userId', 'date']],
    });
    // 用户道具（v1.8.0：通用库存表，首用 = 补签卡）
    ctx.model.extend('daily_props', {
        id: 'unsigned',
        userId: 'string(64)',
        type: 'string(32)',
        quantity: 'unsigned',
        issuedAt: 'timestamp(3)',
        meta: 'string(128)',
    }, {
        primary: 'id',
        autoInc: true,
        unique: [['userId', 'type']],
    });
    // 月度签到奖池（v1.8.0：每月一条，主键 YYYY-MM）
    ctx.model.extend('daily_signin_pool', {
        monthKey: 'string(7)',
        totalPool: 'double',
        distributedAt: 'timestamp(3)',
        shareCount: 'unsigned',
    }, {
        primary: 'monthKey',
    });
    // 板块定义（v1.11.0：投研联动）
    ctx.model.extend('daily_stock_sectors', {
        code: 'string(16)',
        name: 'string(32)',
        color: 'string(8)',
        icon: 'string(8)',
    }, {
        primary: 'code',
    });
    // 股票每日成交量（v1.11.0：用户行为驱动市场）
    ctx.model.extend('daily_stock_volume', {
        code: 'string(16)',
        date: 'string(10)',
        buyAmount: 'double',
        sellAmount: 'double',
        buyCount: 'unsigned',
        sellCount: 'unsigned',
        impactBias: 'double',
        lastEvent: 'string(32)',
        lastEventAt: 'timestamp(3)',
    }, {
        primary: ['code', 'date'],
    });
    // ─────── v1.13.0 房地产系统 ───────
    // 区域行情（市中心 / 老城区 / 开发区 / 远郊 等）
    ctx.model.extend('daily_property_zones', {
        code: 'string(16)',
        name: 'string(32)',
        icon: 'string(8)',
        basePrice: 'double', // 基础单价
        currentPrice: 'double', // 当前均价（按此卖/买）
        trend: 'double', // 最近涨跌累计（百分比，0.05 = 涨 5%）
        bubbleIndex: 'double', // 泡沫指数（0-100），>= 80 触发破裂
        lastEvent: 'string(32)', // 最近一次系统事件（涨/跌/崩/灾害/政策）
        lastEventAt: 'timestamp(3)',
        haltedUntil: 'timestamp(3)', // 政策限制交易时的截止时间
        policyNote: 'string(128)', // 当前政策描述
        updatedAt: 'timestamp(3)',
    }, {
        primary: 'code',
    });
    // 用户房产
    ctx.model.extend('daily_properties', {
        id: 'unsigned',
        userId: 'string(64)',
        zoneCode: 'string(16)',
        type: 'string(16)', // house / apartment / shop / office / mansion
        quality: 'unsigned', // 1-5，品质加成
        boughtPrice: 'double', // 买入价
        boughtAt: 'timestamp(3)',
        currentValue: 'double', // 当前估值（随市场更新）
        renting: 'unsigned', // 0 / 1：是否在出租
        lastRentAt: 'timestamp(3)', // 上次收租时间
        accumulatedRent: 'double', // 已收租金累计
        status: 'string(16)', // holding / sold
        soldAt: 'timestamp(3)',
        soldPrice: 'double',
        // ── v1.14.0：烂尾楼 + P2P 挂牌 ──
        isDerelict: 'unsigned', // 0 / 1：是否烂尾楼
        listedForSale: 'unsigned', // 0 / 1：是否已挂牌（P2P 出售）
        listedPrice: 'double', // 挂牌价格
        listedAt: 'timestamp(3)', // 挂牌时间
    }, {
        primary: 'id',
        autoInc: true,
        index: [['userId'], ['zoneCode'], ['status'], ['listedForSale']],
    });
    // 区域价格历史（每周期一根，用于趋势/K线）
    ctx.model.extend('daily_property_history', {
        id: 'unsigned',
        zoneCode: 'string(16)',
        price: 'double',
        time: 'timestamp(3)',
        event: 'string(32)', // tick / bubble_crash / policy / disaster
    }, {
        primary: 'id',
        autoInc: true,
        index: [['zoneCode'], ['time']],
    });
    // 政策 / 灾害事件（一次性写入，过期清理）
    // v1.14.0 新增类型：
    //   policy_urban_renewal       —— 旧改（老城区 升值）
    //   policy_development_plan    —— 新区规划（开发区 升值）
    //   policy_subway_open         —— 地铁开通（区域 升值）
    //   policy_special_economic    —— 经济特区（区域 大幅升值）
    //   policy_demolition          —— 强制拆迁（区域 暴跌）
    //   policy_relief_cleanup      —— 烂尾整治（修复/回收 烂尾楼）
    //   interest_down              —— 利率下调（区域 升值）
    ctx.model.extend('daily_property_events', {
        id: 'unsigned',
        zoneCode: 'string(16)',
        type: 'string(24)', // bubble_crash / policy_buy_limit / policy_tax_up / disaster_earthquake / disaster_flood / interest_up / interest_down / policy_urban_renewal / policy_development_plan / policy_subway_open / policy_special_economic / policy_demolition / policy_relief_cleanup
        severity: 'double', // 影响系数
        message: 'string(128)',
        startedAt: 'timestamp(3)',
        expiresAt: 'timestamp(3)', // null = 永久
    }, {
        primary: 'id',
        autoInc: true,
        index: [['zoneCode'], ['type'], ['expiresAt']],
    });
    // ─────── v1.15.0 赌石（收藏型积分回收）系统 ───────
    // 类型种子表：5 类原石 + 该类词条池
    // affixPool: JSON 字符串 '[{code,name,value}, ...]'（value = 加成比例，如 0.50 代表 +50%）
    // rarityWeights: JSON 字符串 '{brick:0.35, common:0.25, rare:0.18, epic:0.12, legendary:0.07, supreme:0.03}'
    ctx.model.extend('daily_stone_types', {
        code: 'string(16)', // jadeite / hetian / nanhong / agate / common
        name: 'string(32)',
        icon: 'string(8)',
        description: 'string(128)',
        basePrice: 'double', // 该类原石的统一基础购入价
        affixPool: 'string(2048)', // 词条池 JSON
        rarityWeights: 'string(256)', // 稀有度分布 JSON
        updatedAt: 'timestamp(3)',
    }, {
        primary: 'code',
    });
    // 当前市场库存（24h 自动刷新 / 启动时过期清理）
    ctx.model.extend('daily_stone_market', {
        id: 'unsigned',
        stoneType: 'string(16)', // 引用 daily_stone_types.code
        priceTier: 'unsigned', // 0..4 对应 stonePriceTiers
        listedAt: 'timestamp(3)',
        expiresAt: 'timestamp(3)',
    }, {
        primary: 'id',
        autoInc: true,
        index: [['stoneType'], ['expiresAt']],
    });
    // 用户背包：未切 / 已切未卖 / 已卖 三态复用一张表
    //   status = holding(待切) / cut(切了未卖) / sold(已卖)
    //   rarity = brick / common / rare / epic / legendary / supreme（切后才有值）
    //   affixes = JSON 字符串 '[{"code":"xxx","name":"帝王绿","value":1.5}, ...]'（砖头 = '[]'）
    //   saleMultiplier = 词条价值总和（不含砖头 5% 保护），砖头 = 0.05
    ctx.model.extend('daily_stone_inventory', {
        id: 'unsigned',
        userId: 'string(64)',
        stoneType: 'string(16)',
        priceTier: 'unsigned',
        boughtAt: 'timestamp(3)',
        cutAt: 'timestamp(3)',
        rarity: 'string(16)',
        affixes: 'string(512)',
        saleMultiplier: 'double', // 立即卖出时的词条系数（砖头 0.05）
        status: 'string(16)', // holding / cut / sold
        soldAt: 'timestamp(3)',
        soldValue: 'double', // 实际卖出价（含持有溢价）
    }, {
        primary: 'id',
        autoInc: true,
        index: [['userId'], ['stoneType'], ['status'], ['boughtAt']],
    });
    // 词条图鉴（玩家已发现的词条）
    ctx.model.extend('daily_stone_codex', {
        id: 'unsigned',
        userId: 'string(64)',
        stoneType: 'string(16)',
        affixCode: 'string(32)',
        discoveredAt: 'timestamp(3)',
    }, {
        primary: 'id',
        autoInc: true,
        unique: [['userId', 'stoneType', 'affixCode']],
        index: [['userId']],
    });
}
