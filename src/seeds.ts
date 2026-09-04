/** 内置股票池 / IPO 候选 / 板块定义 */

export const STOCK_SEED = [
  { code: 'DMHJ', name: '大摸鱼控股', base: 52.0, vol: 0.04, sector: 'tech' },
  { code: 'KFXW', name: '咖啡因生物', base: 88.8, vol: 0.06, sector: 'tech' },
  { code: 'YYKJ', name: '熬夜科技', base: 33.5, vol: 0.05, sector: 'tech' },
  { code: 'MYYH', name: '摸鱼银行', base: 12.6, vol: 0.02, sector: 'finance' },
  { code: 'XHNY', name: '小熊新能源', base: 45.0, vol: 0.08, sector: 'energy' },
  { code: 'GFSP', name: '干饭人食品', base: 20.2, vol: 0.03, sector: 'consumer' },
]

export const IPO_PRESETS = [
  { code: 'SSKL', name: '神仙快乐水', base: 66.6, vol: 0.05, sector: 'consumer' },
  { code: 'TMDL', name: '躺平地产', base: 8.8, vol: 0.07, sector: 'finance' },
  { code: 'BJHL', name: '北极海缆', base: 120.0, vol: 0.04, sector: 'energy' },
  { code: 'WLMQ', name: '万物量子', base: 210.0, vol: 0.10, sector: 'tech' },
  { code: 'PPTG', name: '拼团团购', base: 15.5, vol: 0.06, sector: 'consumer' },
  { code: 'ZQMG', name: '追星传媒', base: 42.0, vol: 0.09, sector: 'consumer' },
  { code: 'CYYS', name: '熬夜能源', base: 77.7, vol: 0.08, sector: 'energy' },
  { code: 'JZMW', name: '卷王劳务', base: 28.8, vol: 0.05, sector: 'consumer' },
  { code: 'XHDX', name: '闲话电信', base: 9.9, vol: 0.02, sector: 'tech' },
  { code: 'TMSC', name: '天马芯片', base: 320.0, vol: 0.11, sector: 'tech' },
  { code: 'DBCM', name: '地板传媒', base: 5.2, vol: 0.06, sector: 'consumer' },
  { code: 'SLSD', name: '水里生物', base: 38.6, vol: 0.07, sector: 'energy' },
]

/** 板块定义（v1.11.0 起：驱动板块联动 + 投研分类） */
export const SECTOR_DEFINITIONS = [
  { code: 'tech', name: '科技', color: '#4285f4', icon: '🔬' },
  { code: 'consumer', name: '消费', color: '#f59e0b', icon: '🍔' },
  { code: 'finance', name: '金融', color: '#9c27b0', icon: '💰' },
  { code: 'energy', name: '能源', color: '#0f9d58', icon: '⚡' },
]