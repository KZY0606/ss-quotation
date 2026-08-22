/**
 * KK不锈钢报价系统 - 价格配置数据
 * 适用：201 系列（J1/J2/J3/J4/J5）+ 304 + 压延料
 */

const APP_VERSION = '2.4';

// 密度表 (吨/m³)
const DENSITY = {
  '201': 7.85, '201J1': 7.85, '201J2': 7.85, '201J3': 7.85, '201J4': 7.85, '201J5': 7.85,
  '304': 7.93, '316L': 7.98, '410': 7.75, '410S': 7.75, '430': 7.75, '430B': 7.75
};

// 201 材质基价偏移（相对于 J2）
const MATERIAL_OFFSETS = {
  '201J1': 900,
  '201J2': 0,
  '201J3': 400,
  '201J4': 1600,
  '201J5': null  // 需手动输入
};

// 201 基价宽度档（精确值，不是区间；档外宽度直接报错）
// 1000/1030 档已取消（2026-08-20 用户确认）：宽度 1000/1030 时基价引用 1219/1240 档
const WIDTH_BANDS_201 = [
  { band: 2, widths: [1219, 1240], label: '1219/1240' },
  { band: 3, widths: [1250, 1280], label: '1250/1280' },
  { band: 4, widths: [1500, 1530], label: '1500/1530' }
];

// 宽度 → 档位 反查表（1000/1030 并入 band2 取 1219/1240 基价；只认这些精确值）
const WIDTH_TO_BAND_201 = { 1000: 2, 1030: 2, 1219: 2, 1240: 2, 1250: 3, 1280: 3, 1500: 4, 1530: 4, 1524: 4 };

// 全局可计算宽度白名单（2026-08-22 用户确认：1280 为毛边也要计算，共 9 个宽度，其他一律报错）
const WIDTH_ALLOWED = [1000, 1030, 1219, 1240, 1250, 1280, 1500, 1524, 1530];

// 1500/1530 宽度档：宏旺 201 按厚度分基价（J4 暂不支持；范围外厚度报错）
// 2026-08-20：201 最厚只做到 3.00mm，最后档 max 由 Infinity 改为 3.00
// 每档 { min, max, key }，max=Infinity 表示“及以上”
const THICK_BANDS_1500 = {
  '201J1': [
    { min: 0.55, max: 0.67, key: 't1' },
    { min: 0.68, max: 0.87, key: 't2' },
    { min: 0.88, max: 1.17, key: 't3' },
    { min: 1.18, max: 1.27, key: 't4' },
    { min: 1.28, max: 1.37, key: 't5' },
    { min: 1.38, max: 3.00, key: 't6' }
  ],
  '201J2': [
    { min: 0.68, max: 0.88, key: 't1' },
    { min: 0.89, max: 1.17, key: 't2' },
    { min: 1.18, max: 1.57, key: 't3' },
    { min: 1.58, max: 3.00, key: 't4' }
  ],
  '201J3': [
    { min: 0.85, max: 0.87, key: 't1' },
    { min: 0.88, max: 1.17, key: 't2' },
    { min: 1.18, max: 1.27, key: 't3' },
    { min: 1.28, max: 1.37, key: 't4' },
    { min: 1.38, max: 1.57, key: 't5' },
    { min: 1.58, max: 3.00, key: 't6' }
  ]
};

// 1500/1530 档各材质的厚度档位标签（UI 展示用）
const THICK_BANDS_1500_LABELS = {
  '201J1': ['0.55-0.67', '0.68-0.87', '0.88-1.17', '1.18-1.27', '1.28-1.37', '1.38-3.00'],
  '201J2': ['0.68-0.88', '0.89-1.17', '1.18-1.57', '1.58-3.00'],
  '201J3': ['0.85-0.87', '0.88-1.17', '1.18-1.27', '1.28-1.37', '1.38-1.57', '1.58-3.00']
};

// 美金汇率：中国银行美元现汇买入价（每 100 美元的人民币，如 670.97 → 1 美元=6.7097）
// 实时值由 GitHub Actions 定时抓取中行官网写入 rate.json，前端优先用实时值；手动输入覆盖
const USD_RATE_DEFAULT = 671.18; // 内置兜底汇率（2026-08-22 更新为中行今日牌价；实时值以 rate.json 为准）
const USD_RATE_URL = 'rate.json';
const USD_RATE_KEY_MANUAL = 'kk_usd_rate_manual';

// 贸易术语：EXW 默认；FOB/CIF = EXW 人民币价 + 手动美元加价（$/吨）
const TRADE_TERMS = ['EXW', 'FOB', 'CIF'];
const TERM_KEY = 'kk_trade_term';
const TERM_KEY_FOB = 'kk_fob_surcharge_usd';
const TERM_KEY_CIF = 'kk_cif_surcharge_usd';

// 201 系材质名列表（用于档位校验）
const MATERIALS_201 = ['201', '201J1', '201J2', '201J3', '201J4', '201J5'];

// J5 专属产地：北港（只卖 J5，单独一行填写基价，不分宽度）
const BEIGANG = '北港';

// 边类型判定
const EDGE_TYPE = {
  rough: [1030, 1240, 1260, 1270, 1280, 1520, 1530, 1550],
  trim:  [1000, 1219, 1220, 1250, 1500, 1524]
};

// 常规 201 厚度加价表 (元/吨)
const THICKNESS_SURCHARGE = [
  { min: 0.24, max: 0.25, price: 2000 },
  { min: 0.26, max: 0.28, price: 1700 },
  { min: 0.29, max: 0.30, price: 1500 },
  { min: 0.31, max: 0.35, price: 1200 },
  { min: 0.36, max: 0.40, price: 1100 },
  { min: 0.41, max: 0.45, price: 900  },
  { min: 0.46, max: 0.49, price: 700  },
  { min: 0.50, max: 0.59, price: 500  },
  { min: 0.60, max: 0.75, price: 400  },
  { min: 0.76, max: 0.79, price: 300  },
  { min: 0.80, max: 3.00, price: 200  }
];

// 压延料厚度加价表 (元/吨)
const YANYAN_THICKNESS_SURCHARGE = [
  { min: 0.24, max: 0.26, price: 1500 },
  { min: 0.27, max: 0.28, price: 1200 },
  { min: 0.29, max: 0.33, price: 1000 },
  { min: 0.34, max: 0.43, price: 800  },
  { min: 0.44, max: 0.46, price: 700  },
  { min: 0.47, max: 0.49, price: 600  },
  { min: 0.50, max: 0.59, price: 500  },
  { min: 0.60, max: 0.75, price: 400  },
  { min: 0.76, max: 3.00, price: 300  }
];

// 304 厚度加价表 (元/吨) — 德龙/宏旺相同
const THICKNESS_SURCHARGE_304 = [
  { min: 0.28, max: 0.30, price: 1300 },
  { min: 0.31, max: 0.35, price: 1000 },
  { min: 0.36, max: 0.40, price: 800 },
  { min: 0.41, max: 0.49, price: 700 },
  { min: 0.50, max: 0.59, price: 600 },
  { min: 0.60, max: 0.69, price: 500 },
  { min: 0.70, max: 0.79, price: 400 },
  { min: 0.80, max: 3.00, price: 300 }
];

// 304 产地特异性厚度加价表（优先使用）
// 2026-08-20：张浦 304 厚度上限 6.00mm；3.00-6.00 段暂延续 300（未另行报价）
const ORIGIN_THICKNESS_SURCHARGE_304 = {
  // 2026-08-21：宏旺 304 新增薄档 0.26-0.27 +1500；其余与通用 304 表一致（上限 3.00）
  '宏旺': [
    { min: 0.26, max: 0.27, price: 1500 },
    { min: 0.28, max: 0.30, price: 1300 },
    { min: 0.31, max: 0.35, price: 1000 },
    { min: 0.36, max: 0.40, price: 800 },
    { min: 0.41, max: 0.49, price: 700 },
    { min: 0.50, max: 0.59, price: 600 },
    { min: 0.60, max: 0.69, price: 500 },
    { min: 0.70, max: 0.79, price: 400 },
    { min: 0.80, max: 3.00, price: 300 }
  ],
  '张浦': [
    { min: 0.28, max: 0.30, price: 1300 },
    { min: 0.31, max: 0.35, price: 1000 },
    { min: 0.36, max: 0.40, price: 800 },
    { min: 0.41, max: 0.49, price: 700 },
    { min: 0.50, max: 0.59, price: 600 },
    { min: 0.60, max: 0.69, price: 500 },
    { min: 0.70, max: 0.79, price: 400 },
    { min: 0.80, max: 6.00, price: 300 }
  ]
};

// 产地特异性厚度加价表 (201系列)
// 未列出的产地使用默认 THICKNESS_SURCHARGE（宏旺/德龙标准）
const ORIGIN_THICKNESS_SURCHARGE = {
  '甬金': [
    { min: 0.25, max: 0.27, price: 2100 },
    { min: 0.28, max: 0.29, price: 1300 },
    { min: 0.30, max: 0.32, price: 1200 },
    { min: 0.33, max: 0.37, price: 1100 },
    { min: 0.38, max: 0.39, price: 900 },
    { min: 0.40, max: 0.40, price: 850 },
    { min: 0.41, max: 0.49, price: 800 },
    { min: 0.50, max: 0.50, price: 700 },
    { min: 0.51, max: 0.59, price: 650 },
    { min: 0.60, max: 0.69, price: 600 },
    { min: 0.70, max: 0.79, price: 500 },
    { min: 0.80, max: 1.20, price: 400 },
    { min: 1.21, max: 1.50, price: 300 },
    { min: 1.51, max: 3.00, price: 300 }
  ],
  '上克': [
    { min: 0.25, max: 0.27, price: 2100 },
    { min: 0.28, max: 0.29, price: 1300 },
    { min: 0.30, max: 0.32, price: 1200 },
    { min: 0.33, max: 0.37, price: 1100 },
    { min: 0.38, max: 0.39, price: 850 },
    { min: 0.40, max: 0.40, price: 850 },
    { min: 0.41, max: 0.49, price: 800 },
    { min: 0.50, max: 0.50, price: 700 },
    { min: 0.51, max: 0.59, price: 650 },
    { min: 0.60, max: 0.69, price: 600 },
    { min: 0.70, max: 0.79, price: 450 },
    { min: 0.80, max: 1.20, price: 350 },
    { min: 1.21, max: 1.50, price: 300 },
    { min: 1.51, max: 3.00, price: 300 }
  ],
  '张浦': [
    { min: 0.26, max: 0.27, price: 2100 },
    { min: 0.28, max: 0.29, price: 1300 },
    { min: 0.30, max: 0.32, price: 1200 },
    { min: 0.33, max: 0.37, price: 1100 },
    { min: 0.38, max: 0.49, price: 900 },
    { min: 0.50, max: 0.60, price: 900 },
    { min: 0.61, max: 0.70, price: 700 },
    { min: 0.71, max: 0.80, price: 600 },
    { min: 0.81, max: 1.00, price: 500 },
    { min: 1.01, max: 1.20, price: 450 },
    { min: 1.21, max: 2.00, price: 400 },
    { min: 2.01, max: 3.00, price: 300 },
    { min: 3.01, max: 999, price: 500 }
  ]
};

// 316L 产地特异性厚度加价表（2026-08-20：仅张浦有数据；甬金/太钢未提供，不落通用表）
const ORIGIN_THICKNESS_SURCHARGE_316L = {
  '张浦': [
    { min: 0.26, max: 0.27, price: 2100 },
    { min: 0.28, max: 0.29, price: 1400 },
    { min: 0.30, max: 0.32, price: 1400 },
    { min: 0.33, max: 0.37, price: 1200 },
    { min: 0.38, max: 0.42, price: 1000 },
    { min: 0.43, max: 0.49, price: 900 },
    { min: 0.50, max: 0.50, price: 900 },
    { min: 0.51, max: 0.60, price: 900 },
    { min: 0.61, max: 0.70, price: 700 },
    { min: 0.71, max: 0.80, price: 600 },
    { min: 0.81, max: 1.00, price: 500 },
    { min: 1.01, max: 1.20, price: 450 },
    { min: 1.21, max: 1.50, price: 400 },
    { min: 1.51, max: 2.00, price: 300 },
    // 2026-08-20：3.00 归 700 档（连续区间，上档不含 3.00）
    { min: 2.01, max: 2.99, price: 300 },
    { min: 3.00, max: 6.00, price: 700 }
  ],
  // 2026-08-21 用户录入：甬金 316L 厚度加价（薄料 1500/1530 宽度额外 +300 见 engine）
  '甬金': [
    { min: 0.25, max: 0.27, price: 2100 },
    { min: 0.28, max: 0.29, price: 1400 },
    { min: 0.30, max: 0.32, price: 1400 },
    { min: 0.33, max: 0.34, price: 1200 },
    { min: 0.35, max: 0.37, price: 1200 },
    { min: 0.38, max: 0.39, price: 1000 },
    { min: 0.40, max: 0.40, price: 1000 },
    { min: 0.41, max: 0.42, price: 1000 },
    { min: 0.43, max: 0.49, price: 800 },
    { min: 0.50, max: 0.50, price: 700 },
    { min: 0.51, max: 0.59, price: 700 },
    { min: 0.60, max: 0.69, price: 600 },
    { min: 0.70, max: 0.79, price: 500 },
    { min: 0.80, max: 0.89, price: 400 },
    { min: 0.90, max: 0.99, price: 400 },
    { min: 1.00, max: 1.19, price: 400 }, // 1.2 归下档（连续区间）
    { min: 1.20, max: 3.00, price: 300 }
  ]
  // 太钢 316L 未提供厚度加价数据（用户确认），报价时直接报错
};

// 400系厚度加价表 — 按材质+表面对应独立加价（甬金/上克同价）
const THICKNESS_SURCHARGE_400 = {
  '410S-BA': [
    { min: 0.22, max: 0.23, price: 1200 },
    { min: 0.24, max: 0.26, price: 1000 },
    { min: 0.27, max: 0.29, price: 800  },
    { min: 0.30, max: 0.35, price: 600  },
    { min: 0.36, max: 0.39, price: 400  },
    { min: 0.40, max: 0.49, price: 200  },
    { min: 0.50, max: 1.20, price: 0    },
    { min: 1.21, max: 1.50, price: 100  }
  ],
  '430B-BA': [
    { min: 0.22, max: 0.23, price: 1200 },
    { min: 0.24, max: 0.26, price: 1000 },
    { min: 0.27, max: 0.29, price: 800  },
    { min: 0.30, max: 0.35, price: 600  },
    { min: 0.36, max: 0.39, price: 400  },
    { min: 0.40, max: 0.49, price: 200  },
    { min: 0.50, max: 1.20, price: 0    },
    { min: 1.21, max: 1.50, price: 100  }
  ],
  '410S-2BA-瑞钢': [
    { min: 0.21, max: 0.25, price: 600  },
    { min: 0.26, max: 0.30, price: 400  },
    { min: 0.31, max: 0.35, price: 200  },
    { min: 0.36, max: 0.50, price: 100  },
    { min: 0.51, max: 3.00, price: 0    }
  ],
  '430B-2BA-瑞钢': [
    { min: 0.21, max: 0.25, price: 900  },
    { min: 0.26, max: 0.30, price: 600  },
    { min: 0.31, max: 0.35, price: 400  },
    { min: 0.36, max: 0.42, price: 300  },
    { min: 0.43, max: 0.47, price: 100  },
    { min: 0.48, max: 3.00, price: 0    } // 2026-08-20 用户确认：最高厚度 3.00mm
  ],
  '410S-2BA(非标)': [
    { min: 0.18, max: 0.20, price: 400  },
    { min: 0.21, max: 0.25, price: 200  },
    { min: 0.26, max: 0.30, price: 100  },
    { min: 0.31, max: 3.00, price: 0    }
  ]
};
// 430/BA 使用与 430B/BA 相同的厚度加价
THICKNESS_SURCHARGE_400['430-BA'] = THICKNESS_SURCHARGE_400['430B-BA'];
// 430W/2BA（宏旺）厚度加价（2026-08-21 用户更新：闭区间 10 档，0.30 单点档）
// 注意：宏旺只有 430W/2BA，无 430W/BA；本表独立于 430B/2BA（瑞钢）
THICKNESS_SURCHARGE_400['430W-2BA'] = [
  { min: 0.21, max: 0.24, price: 1600 },
  { min: 0.25, max: 0.26, price: 1300 },
  { min: 0.27, max: 0.29, price: 900  },
  { min: 0.30, max: 0.30, price: 750  },
  { min: 0.31, max: 0.36, price: 650  },
  { min: 0.37, max: 0.39, price: 400  },
  { min: 0.40, max: 0.42, price: 300  },
  { min: 0.43, max: 0.49, price: 200  },
  { min: 0.50, max: 0.51, price: 100  },
  { min: 0.52, max: 2.00, price: 0    }
];
// 430W/2BB（宏旺）：与 430W/2BA 同厚度加价（2026-08-20 用户确认）
THICKNESS_SURCHARGE_400['430W-2BB'] = THICKNESS_SURCHARGE_400['430W-2BA'];
// 410S/BA（宏旺）：与宏旺其他 400 系同厚度加价（2026-08-20 用户确认）
// 注意：宏旺 410S/BA 用宏旺 10 档表，甬金/上克 410S/BA 仍用旧 410S-BA 表（0.23-0.24 1300...）
THICKNESS_SURCHARGE_400['410S-2BA-宏旺'] = THICKNESS_SURCHARGE_400['430W-2BA'];

// 表面加工费 — 304 特例（与201不同价格的表面）
const SURFACE_FEES_304 = {
  '8K黑钛金': [
    { tMin: 0.28, tMax: 1.20, wMin: 1000, wMax: 1280, price: 10, unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 15, unit: 'sqm' }
  ],
  '拉丝黑钛金': [
    { tMin: 0.28, tMax: 1.20, wMin: 1000, wMax: 1280, price: 8,  unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 12, unit: 'sqm' }
  ],
  '磨砂黑钛金': [
    { tMin: 0.28, tMax: 1.20, wMin: 1000, wMax: 1280, price: 8,  unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 12, unit: 'sqm' }
  ]
};

// 表面加工费
const SURFACE_FEES = {
  '2B': { type: 'none', price: 0 },

  'NO.4': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 0.5, unit: 'sqm' },
    { tMin: 1.21, tMax: 3.00, wMin: 1000, wMax: 1280, price: 100, unit: 'ton' },
    { tMin: 0.60, tMax: 1.20, wMin: 1500, wMax: 1530, price: 1.0, unit: 'sqm' },
    { tMin: 1.21, tMax: 3.00, wMin: 1500, wMax: 1530, price: 200, unit: 'ton' }
  ],
  'HL': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 0.5, unit: 'sqm' },
    { tMin: 1.21, tMax: 3.00, wMin: 1000, wMax: 1280, price: 100, unit: 'ton' },
    { tMin: 0.60, tMax: 1.20, wMin: 1500, wMax: 1530, price: 1.0, unit: 'sqm' },
    { tMin: 1.21, tMax: 3.00, wMin: 1500, wMax: 1530, price: 200, unit: 'ton' }
  ],

  '8K': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 2.5,  unit: 'sqm' },
    { tMin: 1.25, tMax: 1.50, wMin: 1000, wMax: 1280, price: 4.5,  unit: 'sqm' },
    { tMin: 1.55, tMax: 2.00, wMin: 1000, wMax: 1280, price: 8.0,  unit: 'sqm' },
    { tMin: 2.05, tMax: 2.50, wMin: 1000, wMax: 1280, price: 12.0, unit: 'sqm' },
    { tMin: 2.55, tMax: 3.00, wMin: 1000, wMax: 1280, price: 15.0, unit: 'sqm' },
    { tMin: 0.60, tMax: 1.20, wMin: 1500, wMax: 1530, price: 8.0,  unit: 'sqm' },
    { tMin: 1.25, tMax: 1.50, wMin: 1500, wMax: 1530, price: 10.0, unit: 'sqm' },
    { tMin: 1.55, tMax: 2.00, wMin: 1500, wMax: 1530, price: 12.0, unit: 'sqm' },
    { tMin: 2.05, tMax: 2.50, wMin: 1500, wMax: 1530, price: 15.0, unit: 'sqm' },
    { tMin: 2.55, tMax: 3.00, wMin: 1500, wMax: 1530, price: 18.0, unit: 'sqm' }
  ],

  '8K黄钛金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 5.5, unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 10.5,unit: 'sqm' }
  ],
  // 2026-08-21：彩色表面区分大炉 /L 与小炉 /S（原价均为大炉 L）
  '8K黄钛金/L': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 5.5, unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 10.5,unit: 'sqm' }
  ],
  '8K黄钛金/S': [
    { tMin: 0.24, tMax: 1.50, wMin: 1000, wMax: 1280, price: 10, unit: 'sqm' }
  ],
  '8K玫瑰金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 6.5, unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 11.5,unit: 'sqm' }
  ],
  '8K玫瑰金/L': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 6.5, unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 11.5,unit: 'sqm' }
  ],
  '8K玫瑰金/S': [
    { tMin: 0.24, tMax: 1.50, wMin: 1000, wMax: 1280, price: 10, unit: 'sqm' }
  ],
  '8K黑钛金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 5,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 10,  unit: 'sqm' }
  ],
  '8K宝石蓝': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 10.5, unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 16.5, unit: 'sqm' }
  ],
  '8K紫罗兰': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 14.5, unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 20.5, unit: 'sqm' }
  ],
  '8K翡翠绿': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 25.5, unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 31.5, unit: 'sqm' }
  ],
  '8K紫红': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 17.5, unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 23.5, unit: 'sqm' }
  ],
  '8K中国红': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 20.5, unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 26.5, unit: 'sqm' }
  ],
  '8K古铜': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 11.5, unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 17.5, unit: 'sqm' }
  ],

  '拉丝黄钛金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 5,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 9,   unit: 'sqm' }
  ],
  '拉丝黄钛金/L': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 5,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 9,   unit: 'sqm' }
  ],
  '拉丝黄钛金/S': [
    { tMin: 0.24, tMax: 1.50, wMin: 1000, wMax: 1280, price: 7.5, unit: 'sqm' }
  ],
  '磨砂黄钛金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 5,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 9,   unit: 'sqm' }
  ],
  '磨砂黄钛金/L': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 5,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 9,   unit: 'sqm' }
  ],
  '磨砂黄钛金/S': [
    { tMin: 0.24, tMax: 1.50, wMin: 1000, wMax: 1280, price: 7.5, unit: 'sqm' }
  ],
  '拉丝玫瑰金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 6,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 10,  unit: 'sqm' }
  ],
  '拉丝玫瑰金/L': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 6,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 10,  unit: 'sqm' }
  ],
  '拉丝玫瑰金/S': [
    { tMin: 0.24, tMax: 1.50, wMin: 1000, wMax: 1280, price: 7.5, unit: 'sqm' }
  ],
  '磨砂玫瑰金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 6,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 10,  unit: 'sqm' }
  ],
  '磨砂玫瑰金/L': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 6,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 10,  unit: 'sqm' }
  ],
  '磨砂玫瑰金/S': [
    { tMin: 0.24, tMax: 1.50, wMin: 1000, wMax: 1280, price: 7.5, unit: 'sqm' }
  ],
  '拉丝黑钛金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 4,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 8,   unit: 'sqm' }
  ],
  '磨砂黑钛金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 4,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 8,   unit: 'sqm' }
  ],
  '拉丝古铜哑光抗指纹': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 15,  unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 19,  unit: 'sqm' }
  ],
  '拉丝古铜亮光抗指纹': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 12,  unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 16,  unit: 'sqm' }
  ],

  '8K香槟金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 6.5, unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 11.5,unit: 'sqm' }
  ],
  '8K香槟金/L': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 6.5, unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 11.5,unit: 'sqm' }
  ],
  '8K香槟金/S': [
    { tMin: 0.24, tMax: 1.50, wMin: 1000, wMax: 1280, price: 10, unit: 'sqm' }
  ],
  '拉丝香槟金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 6,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 10,  unit: 'sqm' }
  ],
  '拉丝香槟金/L': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 6,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 10,  unit: 'sqm' }
  ],
  '拉丝香槟金/S': [
    { tMin: 0.24, tMax: 1.50, wMin: 1000, wMax: 1280, price: 7.5, unit: 'sqm' }
  ],
  '磨砂香槟金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 6,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 10,  unit: 'sqm' }
  ],
  '磨砂香槟金/L': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 6,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 10,  unit: 'sqm' }
  ],
  '磨砂香槟金/S': [
    { tMin: 0.24, tMax: 1.50, wMin: 1000, wMax: 1280, price: 7.5, unit: 'sqm' }
  ],
  '拉丝古铜': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 10,  unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 14,  unit: 'sqm' }
  ],
  '磨砂古铜': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 10,  unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 14,  unit: 'sqm' }
  ],

  '双面8K': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 5,   unit: 'sqm' },
    { tMin: 1.25, tMax: 1.50, wMin: 1000, wMax: 1280, price: 9,   unit: 'sqm' },
    { tMin: 1.55, tMax: 2.00, wMin: 1000, wMax: 1280, price: 16,  unit: 'sqm' },
    { tMin: 2.05, tMax: 2.50, wMin: 1000, wMax: 1280, price: 24,  unit: 'sqm' },
    { tMin: 2.55, tMax: 3.00, wMin: 1000, wMax: 1280, price: 30,  unit: 'sqm' }
  ],
  '6K': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 1.6, unit: 'sqm' },
    { tMin: 1.25, tMax: 1.50, wMin: 1000, wMax: 1280, price: 3.6, unit: 'sqm' }
  ],
  '双面6K': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 3.2, unit: 'sqm' },
    { tMin: 1.25, tMax: 1.50, wMin: 1000, wMax: 1280, price: 7.2, unit: 'sqm' }
  ],

  '单面抛光': [
    { tMin: 0.20, tMax: 0.29, price: 200 },
    { tMin: 0.30, tMax: 1.20, price: 150 }
  ],
  '双面抛光': [
    { tMin: 0.20, tMax: 0.29, price: 400 },
    { tMin: 0.30, tMax: 1.20, price: 300 }
  ],

  // AFP 彩色表面（砂面/拉丝+抗指纹组合）
  '拉丝黄钛金亮光无指纹': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 7,  unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 11, unit: 'sqm' }
  ],
  '拉丝黄钛金哑光无指纹': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 9,  unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 13, unit: 'sqm' }
  ],
  '拉丝玫瑰金亮光无指纹': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 8,  unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 12, unit: 'sqm' }
  ],
  '拉丝玫瑰金哑光无指纹': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 10, unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 14, unit: 'sqm' }
  ],
  '拉丝香槟金亮光无指纹': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 8,  unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 12, unit: 'sqm' }
  ],
  '拉丝香槟金哑光无指纹': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 10, unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 14, unit: 'sqm' }
  ],
  '拉丝黑钛金亮光无指纹': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 6,  unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 10, unit: 'sqm' }
  ],
  '拉丝黑钛金哑光无指纹': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1280, price: 8,  unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1000, wMax: 1280, price: 12, unit: 'sqm' }
  ],

  // ========== 卷材彩色表面 (单档 0.24~1.20mm) ==========
  '8K黄钛金(卷)': [{ tMin:0.24, tMax:1.20, wMin:1219, wMax:1280, price:6.5, unit:'sqm' }],
  '8K玫瑰金(卷)': [{ tMin:0.24, tMax:1.20, wMin:1219, wMax:1280, price:7.5, unit:'sqm' }],
  '8K黑钛金(卷)': [{ tMin:0.24, tMax:1.20, wMin:1219, wMax:1280, price:5,   unit:'sqm' }],
  '8K香槟金(卷)': [{ tMin:0.24, tMax:1.20, wMin:1219, wMax:1280, price:7.5, unit:'sqm' }],
  '拉丝黄钛金(卷)': [{ tMin:0.24, tMax:1.20, wMin:1219, wMax:1280, price:4.5, unit:'sqm' }],
  '磨砂黄钛金(卷)': [{ tMin:0.24, tMax:1.20, wMin:1219, wMax:1280, price:4.5, unit:'sqm' }],
  '拉丝玫瑰金(卷)': [{ tMin:0.24, tMax:1.20, wMin:1219, wMax:1280, price:5.5, unit:'sqm' }],
  '磨砂玫瑰金(卷)': [{ tMin:0.24, tMax:1.20, wMin:1219, wMax:1280, price:5.5, unit:'sqm' }],
  '拉丝香槟金(卷)': [{ tMin:0.24, tMax:1.20, wMin:1219, wMax:1280, price:5.5, unit:'sqm' }],
  '磨砂香槟金(卷)': [{ tMin:0.24, tMax:1.20, wMin:1219, wMax:1280, price:5.5, unit:'sqm' }],
  '拉丝黑钛金(卷)': [{ tMin:0.24, tMax:1.20, wMin:1219, wMax:1280, price:2.5, unit:'sqm' }],
  '磨砂黑钛金(卷)': [{ tMin:0.24, tMax:1.20, wMin:1219, wMax:1280, price:2.5, unit:'sqm' }],
  // AFP 卷材
  '拉丝黑钛金亮光无指纹(卷)': [{ tMin:0.24, tMax:1.20, wMin:1219, wMax:1280, price:4,   unit:'sqm' }],
  '拉丝黑钛金哑光无指纹(卷)': [{ tMin:0.24, tMax:1.20, wMin:1219, wMax:1280, price:5,   unit:'sqm' }],
  '拉丝黄钛金亮光无指纹(卷)': [{ tMin:0.24, tMax:1.20, wMin:1219, wMax:1280, price:6.5, unit:'sqm' }],
  '拉丝黄钛金哑光无指纹(卷)': [{ tMin:0.24, tMax:1.20, wMin:1219, wMax:1280, price:7.5, unit:'sqm' }],
  '拉丝玫瑰金亮光无指纹(卷)': [{ tMin:0.24, tMax:1.20, wMin:1219, wMax:1280, price:7.5, unit:'sqm' }],
  '拉丝玫瑰金哑光无指纹(卷)': [{ tMin:0.24, tMax:1.20, wMin:1219, wMax:1280, price:8.5, unit:'sqm' }],
  '拉丝香槟金亮光无指纹(卷)': [{ tMin:0.24, tMax:1.20, wMin:1219, wMax:1280, price:7.5, unit:'sqm' }],
  // 灰钛金 — 新颜色
  '拉丝灰钛金哑光无指纹(卷)': [{ tMin:0.24, tMax:1.20, wMin:1219, wMax:1280, price:4.5, unit:'sqm' }],
  // 古铜 AFP 卷材
  '拉丝香槟金哑光无指纹(卷)': [{ tMin:0.24, tMax:1.20, wMin:1219, wMax:1280, price:8.5, unit:'sqm' }],
  // 古铜 AFP 卷材 (待定，价暂为 0)
  '拉丝古铜亮光无指纹(卷)': [{ tMin:0.24, tMax:1.20, wMin:1219, wMax:1280, price:0,   unit:'sqm' }],
  '拉丝古铜哑光无指纹(卷)': [{ tMin:0.24, tMax:1.20, wMin:1219, wMax:1280, price:0,   unit:'sqm' }],
};

// 小珠光压花附加费 (元/吨)
const LINEN_FEE = 300;

// AFP抗指纹价格 (元/平米)
const AFP_BRIGHT_FEE = 2;  // 亮光无指纹 (默认)
const AFP_MATTE_FEE = 5;   // 哑光抗指纹

// 保护膜 (元/平米)
const FILM_FEES = {
  '垫纸':           0.3,
  '5C-FILM':        1.0,
  'BLUE-5C-FILM':  0.7,
  'BLUE+KBE-5C-FILM': 1.0,
  'RED+KBE-5C-FILM':  1.0,
  'HW-5C-FILM':     1.0,
  '7C-FILM':        1.2,
  'HW-7C-FILM':     1.4,
  '10C-FILM':       2.0,
  '7C-ZIYE-LASER-FILM':   1.5,
  '7C-LASER-FILM':  1.5,
  '7C-ACHEM-LASER-FILM':  4.0,
  '7C-POLI-LASER-FILM':   5.5,
  '7C-NOVACEL-LASER-FILM':6.6,
  '8C-NOVACEL-LASER-FILM':7.7,
  '10C-NOVACEL-LASER-FILM':8.8,
  // 进口膜（2026-08-20 新增：7C=3.3 / 8C=4.0 / 10C=4.5）
  '7C-IMPORT-FILM':  3.3,
  '8C-IMPORT-FILM':  4.0,
  '10C-IMPORT-FILM': 4.5,
  // 胶膜组合
  '5C-FILM+5C-FILM':  2.0,
  '7C-FILM+5C-FILM':  2.2,
  '7C-FILM+7C-FILM':  2.4,
  '10C-FILM+10C-FILM': 4.0,
  '7C-LASER-FILM+5C-FILM':  2.5,
  '7C-LASER-FILM+7C-FILM': 2.9,
  '7C-ACHEM-LASER-FILM+5C-FILM':  5.0,
  '7C-ACHEM-LASER-FILM+7C-FILM':  5.4,
  '7C哑光膜': 1.6,
  '7C古铜膜': 1.6,
};

// 销售加价 (元/吨)
const SALES_MARKUP = {
  'rough_coil':  200,
  'trim_coil':   400,
  'rough_sheet': 300,
  'trim_sheet':  500
};

// 平板销售加价细分（2026-08-22 用户规则，出口木架基准；出口木箱=基准+50 待后续加 UI）
// group: std=201/304/410/430, 316l=316L；band: s=2100-2500mm, l=3000-4000mm
// 仅 1219/1240 宽度平板走此表；其他宽度平板沿用 SALES_MARKUP 旧价
const SHEET_MARKUP_DETAIL = {
  'std_1240_s': 300, 'std_1240_l': 350,
  'std_1219_s': 400, 'std_1219_l': 450,
  '316l_1240_s': 500, '316l_1240_l': 550,
  '316l_1219_s': 700, '316l_1219_l': 750
};
// 平板可计算长度区间（用户规则：区间外一律报错不计算）
const SHEET_LENGTH_BANDS = [
  { key: 's', min: 2100, max: 2500 },
  { key: 'l', min: 3000, max: 4000 }
];

// 包装方式（2026-08-22 用户规则）：平板必须二选一（木架/木箱），卷板不校验
// 出口木箱 = 出口木架基准 + PACKING_WOODEN_BOX_SURCHARGE
const PACKING_OPTIONS = ['木架', '木箱'];
const PACKING_WOODEN_BOX_SURCHARGE = 50;

// 表面名称标准化映射
// 预设常用产地
const ORIGIN_PRESETS = ['宏旺', '青山', '联众', '甬金', '太钢', '德龙', '上克', '瑞钢', '张浦']; 

// 自由文本解析中的产地关键词
const ORIGIN_KEYWORDS = ['宏旺', '青山', '联众', '甬金', '太钢', '德龙', '上克', '瑞钢',
  '北海诚德', '张浦', '酒钢', '宝钢', '鞍钢', '东方特钢'];

const SURFACE_ALIASES = {
  'no.4': 'NO.4', 'no4': 'NO.4', 'no 4': 'NO.4', 'hl': 'HL',
  '2b': '2B', '2ba': '2BA', '2ba(非标)': '2BA(非标)', '2BA': '2BA', '8k': '8K',
  '磨砂': 'NO.4', '雪花砂': 'NO.4', '砂面': 'NO.4',
  '拉丝': 'HL',
  '镜面8k': '8K', '镜面8K': '8K',
  '黄钛金': '8K黄钛金', '8k黄钛金': '8K黄钛金', '镜面黄钛金': '8K黄钛金', '镜面8k黄钛金': '8K黄钛金',
  'gold mirror 8k': '8K黄钛金', 'gold mirror': '8K黄钛金',
  'mirror ti-gold': '8K黄钛金', 'mirror ti gold': '8K黄钛金',
  '玫瑰金': '8K玫瑰金', '8k玫瑰金': '8K玫瑰金', '镜面玫瑰金': '8K玫瑰金', '镜面8k玫瑰金': '8K玫瑰金',
  'rosegold mirror 8k': '8K玫瑰金', 'rosegold mirror': '8K玫瑰金',
  'mirror rose gold': '8K玫瑰金',
  '黑钛金': '8K黑钛金', '8k黑钛金': '8K黑钛金', '镜面黑钛金': '8K黑钛金', '镜面8k黑钛金': '8K黑钛金',
  'dark black mirror 8k': '8K黑钛金', 'dark black mirror': '8K黑钛金',
  '宝石蓝': '8K宝石蓝', '8k宝石蓝': '8K宝石蓝', '镜面宝石蓝': '8K宝石蓝', '镜面8k宝石蓝': '8K宝石蓝',
  '紫罗兰': '8K紫罗兰', '8k紫罗兰': '8K紫罗兰', '镜面紫罗兰': '8K紫罗兰', '镜面8k紫罗兰': '8K紫罗兰',
  '翡翠绿': '8K翡翠绿', '8k翡翠绿': '8K翡翠绿', '镜面翡翠绿': '8K翡翠绿', '镜面8k翡翠绿': '8K翡翠绿',
  '紫红': '8K紫红', '8k紫红': '8K紫红', '镜面紫红': '8K紫红', '镜面8k紫红': '8K紫红',
  '中国红': '8K中国红', '8k中国红': '8K中国红', '镜面中国红': '8K中国红', '镜面8k中国红': '8K中国红',
  '古铜': '8K古铜', '8k古铜': '8K古铜', '镜面古铜': '8K古铜', '镜面8k古铜': '8K古铜',
  'bronze mirror 8k': '8K古铜', 'bronze mirror': '8K古铜',
  '青古铜': '8K古铜', '黄古铜': '8K古铜', '红古铜': '8K古铜',
  '拉丝黄钛金': '拉丝黄钛金', '拉丝玫瑰金': '拉丝玫瑰金', '拉丝黑钛金': '拉丝黑钛金',
  'gold no4': '拉丝黄钛金',
  '玫瑰金no.4': '磨砂玫瑰金', 'rosegold no4': '磨砂玫瑰金', '磨砂玫瑰金': '磨砂玫瑰金', '砂面玫瑰金': '磨砂玫瑰金',
  '磨砂黄钛金': '磨砂黄钛金', '磨砂黑钛金': '磨砂黑钛金', '磨砂香槟金': '磨砂香槟金',
  '砂面黄钛金': '磨砂黄钛金', '砂面黑钛金': '磨砂黑钛金', '砂面香槟金': '磨砂香槟金', '砂面古铜': '磨砂古铜',
  'champagne gold no4': '磨砂香槟金', 'champange gold no4': '磨砂香槟金',
  'no.4 champagne gold': '磨砂香槟金', 'no4 champagne gold': '磨砂香槟金', 'no.4 champagne': '磨砂香槟金',
  'no.4 black': '磨砂黑钛金', 'no4 black': '磨砂黑钛金',
  // 中文混合写法: NO.4 + 颜色 (行业常用, 如 "No.4黑钛金" = 磨砂黑钛金)
  'no.4黑钛金': '磨砂黑钛金', 'no4黑钛金': '磨砂黑钛金', 'no.4 黑钛金': '磨砂黑钛金', 'no.4黑钛金(板)': '磨砂黑钛金', 'no4黑钛金(板)': '磨砂黑钛金',
  'no.4黄钛金': '磨砂黄钛金', 'no4黄钛金': '磨砂黄钛金', 'no.4 黄钛金': '磨砂黄钛金', 'no.4黄钛金(板)': '磨砂黄钛金', 'no4黄钛金(板)': '磨砂黄钛金',
  'no.4玫瑰金': '磨砂玫瑰金', 'no4玫瑰金': '磨砂玫瑰金', 'no.4 玫瑰金': '磨砂玫瑰金', 'no.4玫瑰金(板)': '磨砂玫瑰金', 'no4玫瑰金(板)': '磨砂玫瑰金',
  'no.4香槟金': '磨砂香槟金', 'no4香槟金': '磨砂香槟金', 'no.4 香槟金': '磨砂香槟金', 'no.4香槟金(板)': '磨砂香槟金', 'no4香槟金(板)': '磨砂香槟金',
  'no.4古铜': '磨砂古铜', 'no4古铜': '磨砂古铜', 'no.4 古铜': '磨砂古铜', 'no.4古铜(板)': '磨砂古铜', 'no4古铜(板)': '磨砂古铜',
  // 中文混合写法: NO.4 + 颜色 + 拉丝(HL 面)
  'no.4拉丝黑钛金': '拉丝黑钛金', 'no4拉丝黑钛金': '拉丝黑钛金', 'no.4拉丝黄钛金': '拉丝黄钛金', 'no4拉丝黄钛金': '拉丝黄钛金',
  'no.4拉丝玫瑰金': '拉丝玫瑰金', 'no4拉丝玫瑰金': '拉丝玫瑰金', 'no.4拉丝香槟金': '拉丝香槟金', 'no4拉丝香槟金': '拉丝香槟金',
  // 中文混合写法: HL + 颜色 (如 "HL黑钛金" = 拉丝黑钛金, 与图片价格表口径一致)
  'hl黑钛金': '拉丝黑钛金', 'hl 黑钛金': '拉丝黑钛金', 'hl黑钛金(板)': '拉丝黑钛金',
  'hl黄钛金': '拉丝黄钛金', 'hl 黄钛金': '拉丝黄钛金', 'hl黄钛金(板)': '拉丝黄钛金',
  'hl玫瑰金': '拉丝玫瑰金', 'hl 玫瑰金': '拉丝玫瑰金', 'hl玫瑰金(板)': '拉丝玫瑰金',
  'hl香槟金': '拉丝香槟金', 'hl 香槟金': '拉丝香槟金', 'hl香槟金(板)': '拉丝香槟金',
  'hl古铜': '拉丝古铜', 'hl 古铜': '拉丝古铜', 'hl古铜(板)': '拉丝古铜',
  'no.4 gold': '磨砂黄钛金', 'no4 gold': '磨砂黄钛金',
  'no.4 rose gold': '磨砂玫瑰金', 'no4 rose gold': '磨砂玫瑰金', 'no.4 rosegold': '磨砂玫瑰金',
  'no.4 bronze': '磨砂古铜', 'no4 bronze': '磨砂古铜',
  'dark black no4': '磨砂黑钛金',
  'bronze no4': '拉丝古铜', '磨砂古铜': '磨砂古铜',
  '8k mirror': '8K',
  'red mirror': '8K中国红', 'red mirror 8k': '8K中国红',
  '拉丝古铜哑光抗指纹': '拉丝古铜哑光抗指纹', '拉丝古铜亮光抗指纹': '拉丝古铜亮光抗指纹',
  '拉丝古铜': '拉丝古铜', 'antique bronze hairline': '拉丝古铜', 'antique copper hairline': '拉丝古铜',
  // Hairline Ti- = 砂面/拉丝(NO.4/HL) 钛金彩色表面
  'hairline ti-black': '拉丝黑钛金', 'hairline-ti-black': '拉丝黑钛金',
  'hairline ti-gold': '拉丝黄钛金', 'hairline-ti-gold': '拉丝黄钛金',
  'hairline ti-rose gold': '拉丝玫瑰金', 'hairline-ti-rose-gold': '拉丝玫瑰金',
  'hairline ti-rosegold': '拉丝玫瑰金', 'hairline-ti-rosegold': '拉丝玫瑰金',
  'hairline ti-champagne': '拉丝香槟金', 'hairline-ti-champagne': '拉丝香槟金',
  'hairline champagne': '拉丝香槟金', 'hairline champagne gold': '拉丝香槟金',
  'hairline ti-bronze': '拉丝古铜', 'hairline-ti-bronze': '拉丝古铜',
  // NO.4 Ti- = 砂面/磨砂(NO.4) 钛金彩色表面（价格=拉丝同色）
  'no.4 ti-black': '磨砂黑钛金', 'no4 ti-black': '磨砂黑钛金',
  'no.4 ti-gold': '磨砂黄钛金', 'no4 ti-gold': '磨砂黄钛金',
  'no.4 ti-rose gold': '磨砂玫瑰金', 'no4 ti-rosegold': '磨砂玫瑰金',
  'no.4 ti-champagne': '磨砂香槟金', 'no4 ti-champagne': '磨砂香槟金',
  'no.4 ti-bronze': '磨砂古铜', 'no4 ti-bronze': '磨砂古铜',
  // Mirror Ti- = 8K镜面 钛金彩色表面
  'mirror ti-black': '8K黑钛金', 'mirror-ti-black': '8K黑钛金',
  'mirror ti-gold': '8K黄钛金', 'mirror-ti-gold': '8K黄钛金',
  'mirror ti-rose gold': '8K玫瑰金', 'mirror-ti-rose-gold': '8K玫瑰金',
  'mirror ti-rosegold': '8K玫瑰金', 'mirror-ti-rosegold': '8K玫瑰金',
  'mirror ti-champagne': '8K香槟金', 'mirror-ti-champagne': '8K香槟金',
  'mirror ti-bronze': '8K古铜', 'mirror-ti-bronze': '8K古铜',
  // Mirror + 颜色（无 Ti 前缀）
  'mirror champagne gold': '8K香槟金',
  'mirror champagne': '8K香槟金',
  'mirror rose gold': '8K玫瑰金', 'mirror rosegold': '8K玫瑰金',
  'mirror bronze': '8K古铜',
  'mirror black': '8K黑钛金',
  'mirror gold': '8K黄钛金',
  '香槟金': '8K香槟金', '镜面8k香槟金': '8K香槟金', '镜面8K香槟金': '8K香槟金',
  '拉丝香槟金': '拉丝香槟金',
  // AFP 彩色表面（砂面/拉丝+抗指纹）
  '砂面/拉丝(no.4/hl)黄钛金亮光无指纹': '拉丝黄钛金亮光无指纹', '拉丝黄钛金亮光无指纹': '拉丝黄钛金亮光无指纹',
  '砂面/拉丝(no.4/hl)黄钛金哑光无指纹': '拉丝黄钛金哑光无指纹', '拉丝黄钛金哑光无指纹': '拉丝黄钛金哑光无指纹',
  '砂面/拉丝(no.4/hl)玫瑰金亮光无指纹': '拉丝玫瑰金亮光无指纹', '拉丝玫瑰金亮光无指纹': '拉丝玫瑰金亮光无指纹',
  '砂面/拉丝(no.4/hl)玫瑰金哑光无指纹': '拉丝玫瑰金哑光无指纹', '拉丝玫瑰金哑光无指纹': '拉丝玫瑰金哑光无指纹',
  '砂面/拉丝(no.4/hl)香槟金亮光无指纹': '拉丝香槟金亮光无指纹', '拉丝香槟金亮光无指纹': '拉丝香槟金亮光无指纹',
  '砂面/拉丝(no.4/hl)香槟金哑光无指纹': '拉丝香槟金哑光无指纹', '拉丝香槟金哑光无指纹': '拉丝香槟金哑光无指纹',
  '砂面/拉丝(no.4/hl)黑钛金亮光无指纹': '拉丝黑钛金亮光无指纹', '拉丝黑钛金亮光无指纹': '拉丝黑钛金亮光无指纹',
  '砂面/拉丝(no.4/hl)黑钛金哑光无指纹': '拉丝黑钛金哑光无指纹', '拉丝黑钛金哑光无指纹': '拉丝黑钛金哑光无指纹',
  // 小珠光 (linen) 复合表面
  '小珠光': 'LINEN', 'linen': 'LINEN',
  'ba linen': 'BA-LINEN', 'ba-linen': 'BA-LINEN', 'ba小珠光': 'BA-LINEN', 'ba': '单面抛光',
  '8k linen': '8K-LINEN', '8k-linen': '8K-LINEN', '镜面8k小珠光': '8K-LINEN', '镜面8K小珠光': '8K-LINEN',
  '8k黄钛金小珠光': '8K黄钛金-LINEN', '镜面8k黄钛金小珠光': '8K黄钛金-LINEN',
  '8k玫瑰金小珠光': '8K玫瑰金-LINEN', '8k黑钛金小珠光': '8K黑钛金-LINEN',
  '拉丝黄钛金小珠光': '拉丝黄钛金-LINEN', '拉丝玫瑰金小珠光': '拉丝玫瑰金-LINEN',
  '单面抛光': '单面抛光', '双面抛光': '双面抛光',
  // 双面8K / 6K / 双面6K
  '双面8k': '双面8K', '双面8K': '双面8K', '双面镜面8K': '双面8K', '双面镜面8k': '双面8K',
  '6k': '6K', '6K': '6K', '镜面6K': '6K', '镜面6k': '6K',
  '双面6k': '双面6K', '双面6K': '双面6K', '双面镜面6K': '双面6K', '双面镜面6k': '双面6K',

  // (板) 后缀别名 —— 不锈钢板
  '8k黄钛金(板)': '8K黄钛金', '8k玫瑰金(板)': '8K玫瑰金',
  '8k黑钛金(板)': '8K黑钛金', '8k宝石蓝(板)': '8K宝石蓝',
  '8k紫罗兰(板)': '8K紫罗兰', '8k翡翠绿(板)': '8K翡翠绿',
  '8k紫红(板)': '8K紫红', '8k中国红(板)': '8K中国红',
  '8k古铜(板)': '8K古铜', '8k香槟金(板)': '8K香槟金',
  '拉丝黄钛金(板)': '拉丝黄钛金', '拉丝玫瑰金(板)': '拉丝玫瑰金',
  '拉丝香槟金(板)': '拉丝香槟金', '拉丝黑钛金(板)': '拉丝黑钛金',
  '磨砂黄钛金(板)': '磨砂黄钛金', '磨砂玫瑰金(板)': '磨砂玫瑰金',
  '磨砂香槟金(板)': '磨砂香槟金', '磨砂黑钛金(板)': '磨砂黑钛金',
  // 2026-08-21：砂面/拉丝(NO.4/HL) 板类基础别名（/S /L 后缀由 normalizeSurface 拼接）
  '砂面/拉丝(no.4/hl)黄钛金(板)': '拉丝黄钛金', '砂面/拉丝(no.4/hl)玫瑰金(板)': '拉丝玫瑰金',
  '砂面/拉丝(no.4/hl)香槟金(板)': '拉丝香槟金',
  '拉丝古铜(板)': '拉丝古铜', '磨砂古铜(板)': '磨砂古铜',
  '拉丝古铜哑光抗指纹(板)': '拉丝古铜哑光抗指纹', '拉丝古铜亮光抗指纹(板)': '拉丝古铜亮光抗指纹',
  // AFP (板) 别名
  '拉丝黄钛金亮光无指纹(板)': '拉丝黄钛金亮光无指纹', '拉丝黄钛金哑光无指纹(板)': '拉丝黄钛金哑光无指纹',
  '拉丝玫瑰金亮光无指纹(板)': '拉丝玫瑰金亮光无指纹', '拉丝玫瑰金哑光无指纹(板)': '拉丝玫瑰金哑光无指纹',
  '拉丝香槟金亮光无指纹(板)': '拉丝香槟金亮光无指纹', '拉丝香槟金哑光无指纹(板)': '拉丝香槟金哑光无指纹',
  '拉丝黑钛金亮光无指纹(板)': '拉丝黑钛金亮光无指纹', '拉丝黑钛金哑光无指纹(板)': '拉丝黑钛金哑光无指纹',
  // (卷) 后缀别名 —— 不锈钢卷
  '8k黄钛金(卷)': '8K黄钛金(卷)', '8k玫瑰金(卷)': '8K玫瑰金(卷)',
  '8k黑钛金(卷)': '8K黑钛金(卷)', '8k香槟金(卷)': '8K香槟金(卷)',
  '砂面/拉丝(no.4/hl)黄钛金(卷)': '拉丝黄钛金(卷)', '拉丝黄钛金(卷)': '拉丝黄钛金(卷)',
  '砂面/拉丝(no.4/hl)玫瑰金(卷)': '拉丝玫瑰金(卷)', '拉丝玫瑰金(卷)': '拉丝玫瑰金(卷)',
  '砂面/拉丝(no.4/hl)香槟金(卷)': '拉丝香槟金(卷)', '拉丝香槟金(卷)': '拉丝香槟金(卷)',
  '砂面/拉丝(no.4/hl)黑钛金(卷)': '拉丝黑钛金(卷)', '拉丝黑钛金(卷)': '拉丝黑钛金(卷)',
  '磨砂黄钛金(卷)': '磨砂黄钛金(卷)', '磨砂玫瑰金(卷)': '磨砂玫瑰金(卷)',
  '磨砂香槟金(卷)': '磨砂香槟金(卷)', '磨砂黑钛金(卷)': '磨砂黑钛金(卷)',
  '砂面/拉丝(no.4/hl)黄钛金亮光无指纹(卷)': '拉丝黄钛金亮光无指纹(卷)', '拉丝黄钛金亮光无指纹(卷)': '拉丝黄钛金亮光无指纹(卷)',
  '砂面/拉丝(no.4/hl)黄钛金哑光无指纹(卷)': '拉丝黄钛金哑光无指纹(卷)', '拉丝黄钛金哑光无指纹(卷)': '拉丝黄钛金哑光无指纹(卷)',
  '砂面/拉丝(no.4/hl)玫瑰金亮光无指纹(卷)': '拉丝玫瑰金亮光无指纹(卷)', '拉丝玫瑰金亮光无指纹(卷)': '拉丝玫瑰金亮光无指纹(卷)',
  '砂面/拉丝(no.4/hl)玫瑰金哑光无指纹(卷)': '拉丝玫瑰金哑光无指纹(卷)', '拉丝玫瑰金哑光无指纹(卷)': '拉丝玫瑰金哑光无指纹(卷)',
  '砂面/拉丝(no.4/hl)香槟金亮光无指纹(卷)': '拉丝香槟金亮光无指纹(卷)', '拉丝香槟金亮光无指纹(卷)': '拉丝香槟金亮光无指纹(卷)',
  '砂面/拉丝(no.4/hl)黑钛金亮光无指纹(卷)': '拉丝黑钛金亮光无指纹(卷)', '拉丝黑钛金亮光无指纹(卷)': '拉丝黑钛金亮光无指纹(卷)',
  '砂面/拉丝(no.4/hl)黑钛金哑光无指纹(卷)': '拉丝黑钛金哑光无指纹(卷)', '拉丝黑钛金哑光无指纹(卷)': '拉丝黑钛金哑光无指纹(卷)',
  '砂面/拉丝(no.4/hl)灰钛金哑光无指纹(卷)': '拉丝灰钛金哑光无指纹(卷)', '拉丝灰钛金哑光无指纹(卷)': '拉丝灰钛金哑光无指纹(卷)',
  '砂面/拉丝(no.4/hl)香槟金哑光无指纹(卷)': '拉丝香槟金哑光无指纹(卷)', '拉丝香槟金哑光无指纹(卷)': '拉丝香槟金哑光无指纹(卷)',
  '砂面/拉丝(no.4/hl)古铜亮光无指纹(卷)': '拉丝古铜亮光无指纹(卷)', '拉丝古铜亮光无指纹(卷)': '拉丝古铜亮光无指纹(卷)',
  '砂面/拉丝(no.4/hl)古铜哑光无指纹(卷)': '拉丝古铜哑光无指纹(卷)', '拉丝古铜哑光无指纹(卷)': '拉丝古铜哑光无指纹(卷)',
};

// 保护膜名称标准化映射
const FILM_ALIASES = {
  // 进口膜（7C/8C/10C）— 必须排在最前：防止 remaining 里的 "7c进口膜" 先被短别名 "7c" 子串误匹配
  '7c进口膜': '7C-IMPORT-FILM', '进口膜7c': '7C-IMPORT-FILM', '7c-import': '7C-IMPORT-FILM', '7c-import-film': '7C-IMPORT-FILM', 'import-7c': '7C-IMPORT-FILM', '7c import film': '7C-IMPORT-FILM', 'import 7c': '7C-IMPORT-FILM',
  '8c进口膜': '8C-IMPORT-FILM', '进口膜8c': '8C-IMPORT-FILM', '8c-import': '8C-IMPORT-FILM', '8c-import-film': '8C-IMPORT-FILM', 'import-8c': '8C-IMPORT-FILM', '8c import film': '8C-IMPORT-FILM', 'import 8c': '8C-IMPORT-FILM',
  '10c进口膜': '10C-IMPORT-FILM', '进口膜10c': '10C-IMPORT-FILM', '10c-import': '10C-IMPORT-FILM', '10c-import-film': '10C-IMPORT-FILM', 'import-10c': '10C-IMPORT-FILM', '10c import film': '10C-IMPORT-FILM', 'import 10c': '10C-IMPORT-FILM',
  // 基础膜
  '5c': '5C-FILM', '5c-film': '5C-FILM', '5c膜': '5C-FILM', '5c黑白膜': '5C-FILM',
  '7c': '7C-FILM', '7c-film': '7C-FILM', '7c膜': '7C-FILM', '7c黑白膜': '7C-FILM',
  '10c': '10C-FILM', '10c-film': '10C-FILM', '10c膜': '10C-FILM',
  // 蓝膜 / BLUE-5C-FILM
  '5c蓝色': 'BLUE-5C-FILM', '5c蓝': 'BLUE-5C-FILM', '5c蓝膜': 'BLUE-5C-FILM', '蓝膜': 'BLUE-5C-FILM',
  '5c blue': 'BLUE-5C-FILM', '5c-blue-film': 'BLUE-5C-FILM', 'blue-5c-film': 'BLUE-5C-FILM',
  // 宏旺膜 / HW-5C / HW-7C
  'hw5c': 'HW-5C-FILM', 'hw 5c': 'HW-5C-FILM', 'hw5c-film': 'HW-5C-FILM', 'hw 5c-film': 'HW-5C-FILM',
  '宏旺5c膜': 'HW-5C-FILM', '5c宏旺膜': 'HW-5C-FILM', 'hw-5c-film': 'HW-5C-FILM',
  'hw7c': 'HW-7C-FILM', 'hw 7c': 'HW-7C-FILM', 'hw7c-film': 'HW-7C-FILM', 'hw 7c-film': 'HW-7C-FILM',
  '宏旺7c膜': 'HW-7C-FILM', '7c宏旺膜': 'HW-7C-FILM', 'hw-7c-film': 'HW-7C-FILM',
  // 7C 激光膜
  '7c-laser': '7C-LASER-FILM', '7c-laser-film': '7C-LASER-FILM', '7c laser-film': '7C-LASER-FILM',
  '7c laser film': '7C-LASER-FILM', '7c laser film pvc': '7C-LASER-FILM',
  '7c箭头激光膜': '7C-LASER-FILM', '7c激光膜': '7C-LASER-FILM',
  '7c蓝箭激光膜': '7C-LASER-FILM', '7c兰箭激光膜': '7C-LASER-FILM',
  // 亚化 / 7C-ACHEM-LASER
  '7c-achem': '7C-ACHEM-LASER-FILM', '7c-achem-film': '7C-ACHEM-LASER-FILM',
  '7c-achem-laser-film': '7C-ACHEM-LASER-FILM',
  '亚化7c激光膜': '7C-ACHEM-LASER-FILM', '亚化7c膜': '7C-ACHEM-LASER-FILM',
  '台湾亚化7c激光膜': '7C-ACHEM-LASER-FILM',
  // 宝丽菲母 / 7C-POLI-LASER
  '7c-poli': '7C-POLI-LASER-FILM', '7c-poli-film': '7C-POLI-LASER-FILM',
  '7c-poli-laser-film': '7C-POLI-LASER-FILM',
  '宝丽菲母7c激光膜': '7C-POLI-LASER-FILM', '宝丽菲母7c膜': '7C-POLI-LASER-FILM',
  '德国宝丽菲母7c激光膜': '7C-POLI-LASER-FILM',
  // 诺凡赛尔 / NOVACEL LASER
  '7c-novacel': '7C-NOVACEL-LASER-FILM', '7c-novacel-film': '7C-NOVACEL-LASER-FILM',
  '7c-novacel-laser-film': '7C-NOVACEL-LASER-FILM',
  '7c novacell laser film pvc': '7C-NOVACEL-LASER-FILM',
  '诺凡赛尔7c': '7C-NOVACEL-LASER-FILM', '诺凡赛尔7c膜': '7C-NOVACEL-LASER-FILM',
  '诺凡赛尔7c激光膜': '7C-NOVACEL-LASER-FILM',
  '法国诺凡赛尔7c激光膜': '7C-NOVACEL-LASER-FILM', '法国诺凡赛尔7c膜': '7C-NOVACEL-LASER-FILM',
  '8c-novacel': '8C-NOVACEL-LASER-FILM', '8c-novacel-film': '8C-NOVACEL-LASER-FILM',
  '8c-novacel-laser-film': '8C-NOVACEL-LASER-FILM',
  '诺凡赛尔8c膜': '8C-NOVACEL-LASER-FILM', '诺凡赛尔8c激光膜': '8C-NOVACEL-LASER-FILM',
  '法国诺凡赛尔8c激光膜': '8C-NOVACEL-LASER-FILM', '法国诺凡赛尔8c膜': '8C-NOVACEL-LASER-FILM',
  '10c-novacel': '10C-NOVACEL-LASER-FILM', '10c-novacel-film': '10C-NOVACEL-LASER-FILM',
  '10c-novacel-laser-film': '10C-NOVACEL-LASER-FILM',
  '诺凡赛尔10c膜': '10C-NOVACEL-LASER-FILM', '诺凡赛尔10c激光膜': '10C-NOVACEL-LASER-FILM',
  '法国诺凡赛尔10c激光膜': '10C-NOVACEL-LASER-FILM', '法国诺凡赛尔10c膜': '10C-NOVACEL-LASER-FILM',
  // 梓烨 / ZIYE 激光膜
  '7c-ziye-laser-film': '7C-ZIYE-LASER-FILM', '7c ziye laser film': '7C-ZIYE-LASER-FILM',
  'ziye 7c激光膜': '7C-ZIYE-LASER-FILM', '梓烨7c激光膜': '7C-ZIYE-LASER-FILM',
  // KBE 膜
  'blue+kbe-5c-film': 'BLUE+KBE-5C-FILM', '蓝k膜': 'BLUE+KBE-5C-FILM',
  '蓝kbe膜': 'BLUE+KBE-5C-FILM', '蓝色kbe膜': 'BLUE+KBE-5C-FILM',
  'red+kbe-5c-film': 'RED+KBE-5C-FILM', '红k膜': 'RED+KBE-5C-FILM',
  '红kbe膜': 'RED+KBE-5C-FILM', '红色kbe膜': 'RED+KBE-5C-FILM',
   // 垫纸
  '垫纸': '垫纸',
  '衬纸': '垫纸',
  '纸': '垫纸',
  'paper': '垫纸',
  // 胶膜组合短名
  '5c+5c': '5C-FILM+5C-FILM', '5c+5c-film': '5C-FILM+5C-FILM', '5c-film+5c-film': '5C-FILM+5C-FILM',
  '7c+5c': '7C-FILM+5C-FILM', '7c+5c-film': '7C-FILM+5C-FILM', '7c-film+5c-film': '7C-FILM+5C-FILM',
  '7c+7c': '7C-FILM+7C-FILM', '7c+7c-film': '7C-FILM+7C-FILM', '7c-film+7c-film': '7C-FILM+7C-FILM',
  '5c蓝色': 'BLUE-5C-FILM', '5c蓝': 'BLUE-5C-FILM', '5c蓝膜': 'BLUE-5C-FILM', '蓝膜': 'BLUE-5C-FILM', '5c blue': 'BLUE-5C-FILM', '5c-blue-film': 'BLUE-5C-FILM',
  '7c-laser+5c': '7C-LASER+5C-FILM', '7c-laser+5c-film': '7C-LASER+5C-FILM', '7c laser-film+5c-film': '7C-LASER+5C-FILM', '7c激光膜+5c': '7C-LASER+5C-FILM', '7c激光膜+5c膜': '7C-LASER+5C-FILM',
  '胶膜': '7C-FILM',
  '7c哑光膜': '7C哑光膜', '7c哑光': '7C哑光膜',
  '7c古铜膜': '7C古铜膜', '7c古铜': '7C古铜膜',
};