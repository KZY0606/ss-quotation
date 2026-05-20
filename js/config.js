/**
 * KK不锈钢报价系统 - 价格配置数据
 * 适用：宏旺 201 系列（J1/J2/J3/J4/J5）+ 压延料
 */

// 密度表 (吨/m³)
const DENSITY = {
  '201': 7.85, '201J1': 7.85, '201J2': 7.85, '201J3': 7.85, '201J4': 7.85, '201J5': 7.85,
  '304': 7.93, '316L': 7.98, '410': 7.75, '430': 7.75
};

// 201 材质基价偏移（相对于 J2）
const MATERIAL_OFFSETS = {
  '201J1': 900,
  '201J2': 0,
  '201J3': 400,
  '201J4': 1600,
  '201J5': null  // 需手动输入
};

// 边类型判定
const EDGE_TYPE = {
  rough: [1240, 1250, 1260, 1270, 1280, 1530],
  trim:  [1000, 1030, 1219, 1220, 1500]
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
  { min: 0.34, max: 0.43, price: 900  },
  { min: 0.44, max: 0.46, price: 700  },
  { min: 0.47, max: 0.49, price: 600  },
  { min: 0.50, max: 0.59, price: 500  },
  { min: 0.60, max: 0.75, price: 400  },
  { min: 0.76, max: 3.00, price: 300  }
];

// 表面加工费
const SURFACE_FEES = {
  '2B': { type: 'none', price: 0 },

  'NO.4': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1250, price: 0.5, unit: 'sqm' },
    { tMin: 1.21, tMax: 3.00, wMin: 1000, wMax: 1250, price: 100, unit: 'ton' },
    { tMin: 0.60, tMax: 1.20, wMin: 1500, wMax: 1530, price: 1.0, unit: 'sqm' },
    { tMin: 1.21, tMax: 3.00, wMin: 1500, wMax: 1530, price: 200, unit: 'ton' }
  ],
  'HL': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1250, price: 0.5, unit: 'sqm' },
    { tMin: 1.21, tMax: 3.00, wMin: 1000, wMax: 1250, price: 100, unit: 'ton' },
    { tMin: 0.60, tMax: 1.20, wMin: 1500, wMax: 1530, price: 1.0, unit: 'sqm' },
    { tMin: 1.21, tMax: 3.00, wMin: 1500, wMax: 1530, price: 200, unit: 'ton' }
  ],

  '8K': [
    { tMin: 0.24, tMax: 1.20, wMin: 1000, wMax: 1250, price: 2.5,  unit: 'sqm' },
    { tMin: 1.25, tMax: 1.50, wMin: 1000, wMax: 1250, price: 4.5,  unit: 'sqm' },
    { tMin: 1.55, tMax: 2.00, wMin: 1000, wMax: 1250, price: 8.0,  unit: 'sqm' },
    { tMin: 2.05, tMax: 2.50, wMin: 1000, wMax: 1250, price: 12.0, unit: 'sqm' },
    { tMin: 2.55, tMax: 3.00, wMin: 1000, wMax: 1250, price: 15.0, unit: 'sqm' },
    { tMin: 0.60, tMax: 1.20, wMin: 1500, wMax: 1530, price: 8.0,  unit: 'sqm' },
    { tMin: 1.25, tMax: 1.50, wMin: 1500, wMax: 1530, price: 10.0, unit: 'sqm' },
    { tMin: 1.55, tMax: 2.00, wMin: 1500, wMax: 1530, price: 12.0, unit: 'sqm' },
    { tMin: 2.05, tMax: 2.50, wMin: 1500, wMax: 1530, price: 15.0, unit: 'sqm' },
    { tMin: 2.55, tMax: 3.00, wMin: 1500, wMax: 1530, price: 18.0, unit: 'sqm' }
  ],

  '8K黄钛金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1219, wMax: 1250, price: 6,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1219, wMax: 1250, price: 11,  unit: 'sqm' }
  ],
  '8K玫瑰金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1219, wMax: 1250, price: 7,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1219, wMax: 1250, price: 12,  unit: 'sqm' }
  ],
  '8K黑钛金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1219, wMax: 1250, price: 5,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1219, wMax: 1250, price: 10,  unit: 'sqm' }
  ],
  '8K宝石蓝': [
    { tMin: 0.24, tMax: 1.20, wMin: 1219, wMax: 1250, price: 10.5, unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1219, wMax: 1250, price: 16.5, unit: 'sqm' }
  ],
  '8K紫罗兰': [
    { tMin: 0.24, tMax: 1.20, wMin: 1219, wMax: 1250, price: 14.5, unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1219, wMax: 1250, price: 20.5, unit: 'sqm' }
  ],
  '8K翡翠绿': [
    { tMin: 0.24, tMax: 1.20, wMin: 1219, wMax: 1250, price: 25.5, unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1219, wMax: 1250, price: 31.5, unit: 'sqm' }
  ],
  '8K紫红': [
    { tMin: 0.24, tMax: 1.20, wMin: 1219, wMax: 1250, price: 17.5, unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1219, wMax: 1250, price: 23.5, unit: 'sqm' }
  ],
  '8K中国红': [
    { tMin: 0.24, tMax: 1.20, wMin: 1219, wMax: 1250, price: 20.5, unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1219, wMax: 1250, price: 26.5, unit: 'sqm' }
  ],
  '8K古铜': [
    { tMin: 0.24, tMax: 1.20, wMin: 1219, wMax: 1250, price: 11.5, unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1219, wMax: 1250, price: 17.5, unit: 'sqm' }
  ],

  '拉丝黄钛金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1219, wMax: 1250, price: 5,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1219, wMax: 1250, price: 9,   unit: 'sqm' }
  ],
  '磨砂黄钛金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1219, wMax: 1250, price: 5,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1219, wMax: 1250, price: 9,   unit: 'sqm' }
  ],
  '拉丝玫瑰金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1219, wMax: 1250, price: 6,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1219, wMax: 1250, price: 10,  unit: 'sqm' }
  ],
  '磨砂玫瑰金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1219, wMax: 1250, price: 6,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1219, wMax: 1250, price: 10,  unit: 'sqm' }
  ],
  '拉丝黑钛金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1219, wMax: 1250, price: 4,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1219, wMax: 1250, price: 8,   unit: 'sqm' }
  ],
  '磨砂黑钛金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1219, wMax: 1250, price: 4,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1219, wMax: 1250, price: 8,   unit: 'sqm' }
  ],
  '拉丝古铜哑光抗指纹': [
    { tMin: 0.24, tMax: 1.20, wMin: 1219, wMax: 1250, price: 15,  unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1219, wMax: 1250, price: 19,  unit: 'sqm' }
  ],
  '拉丝古铜亮光抗指纹': [
    { tMin: 0.24, tMax: 1.20, wMin: 1219, wMax: 1250, price: 12,  unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1219, wMax: 1250, price: 16,  unit: 'sqm' }
  ],

  '8K香槟金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1219, wMax: 1250, price: 7.5, unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1219, wMax: 1250, price: 12,  unit: 'sqm' }
  ],
  '拉丝香槟金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1219, wMax: 1250, price: 6,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1219, wMax: 1250, price: 10,  unit: 'sqm' }
  ],
  '磨砂香槟金': [
    { tMin: 0.24, tMax: 1.20, wMin: 1219, wMax: 1250, price: 6,   unit: 'sqm' },
    { tMin: 1.21, tMax: 1.50, wMin: 1219, wMax: 1250, price: 10,  unit: 'sqm' }
  ],

  '单面抛光': [
    { tMin: 0.20, tMax: 0.29, price: 200 },
    { tMin: 0.30, tMax: 1.20, price: 150 }
  ],
  '双面抛光': [
    { tMin: 0.20, tMax: 0.29, price: 400 },
    { tMin: 0.30, tMax: 1.20, price: 300 }
  ]
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
  'HW 5C-FILM':     1.0,
  '7C-FILM':        1.2,
  'HW 7C-FILM':     1.2,
  '10C-FILM':       2.0,
  '7C-LASER-FILM':  2.2,
  '7C-ACHEM-FILM':  3.5,
  '7C-POLI-FILM':   5.0,
  '7C-NOVACEL-FILM':6.5,
  '8C-NOVACEL-FILM':7.5,
  '10C-NOVACEL-FILM':8.5,
  // 胶膜组合
  '5C+5C-FILM':  2.0,
  '7C+5C-FILM':  2.2,
  '7C+7C-FILM':  2.4
};

// 销售加价 (元/吨)
const SALES_MARKUP = {
  'rough_coil':  200,
  'trim_coil':   400,
  'rough_sheet': 300,
  'trim_sheet':  500
};

// 表面名称标准化映射
// 预设常用产地
const ORIGIN_PRESETS = ['宏旺', '青山', '联众', '甬金', '太钢', '德龙', '上克'];

// 自由文本解析中的产地关键词
const ORIGIN_KEYWORDS = ['宏旺', '青山', '联众', '甬金', '太钢', '德龙', '上克',
  '北海诚德', '张浦', '酒钢', '宝钢', '鞍钢', '东方特钢'];

const SURFACE_ALIASES = {
  'no.4': 'NO.4', 'no4': 'NO.4', 'no 4': 'NO.4', 'hl': 'HL',
  '2b': '2B', '8k': '8K',
  '磨砂': 'NO.4', '雪花砂': 'NO.4', '砂面': 'NO.4',
  '拉丝': 'HL',
  '镜面8k': '8K', '镜面8K': '8K',
  '黄钛金': '8K黄钛金', '8k黄钛金': '8K黄钛金', '镜面黄钛金': '8K黄钛金', '镜面8k黄钛金': '8K黄钛金',
  'gold mirror 8k': '8K黄钛金', 'gold mirror': '8K黄钛金',
  '玫瑰金': '8K玫瑰金', '8k玫瑰金': '8K玫瑰金', '镜面玫瑰金': '8K玫瑰金', '镜面8k玫瑰金': '8K玫瑰金',
  'rosegold mirror 8k': '8K玫瑰金', 'rosegold mirror': '8K玫瑰金',
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
  'rosegold no4': '磨砂玫瑰金', '磨砂玫瑰金': '磨砂玫瑰金', '砂面玫瑰金': '磨砂玫瑰金',
  '磨砂黄钛金': '磨砂黄钛金', '磨砂黑钛金': '磨砂黑钛金', '磨砂香槟金': '磨砂香槟金',
  'champagne gold no4': '磨砂香槟金',
  '拉丝古铜哑光抗指纹': '拉丝古铜哑光抗指纹', '拉丝古铜亮光抗指纹': '拉丝古铜亮光抗指纹',
  '拉丝古铜': '拉丝古铜', 'antique bronze hairline': '拉丝古铜',
  '香槟金': '8K香槟金', '镜面8k香槟金': '8K香槟金', '镜面8K香槟金': '8K香槟金',
  '拉丝香槟金': '拉丝香槟金',
  // 小珠光 (linen) 复合表面
  '小珠光': 'LINEN', 'linen': 'LINEN',
  'ba linen': 'BA-LINEN', 'ba-linen': 'BA-LINEN', 'ba小珠光': 'BA-LINEN', 'ba': '单面抛光',
  '8k linen': '8K-LINEN', '8k-linen': '8K-LINEN', '镜面8k小珠光': '8K-LINEN', '镜面8K小珠光': '8K-LINEN',
  '8k黄钛金小珠光': '8K黄钛金-LINEN', '镜面8k黄钛金小珠光': '8K黄钛金-LINEN',
  '8k玫瑰金小珠光': '8K玫瑰金-LINEN', '8k黑钛金小珠光': '8K黑钛金-LINEN',
  '拉丝黄钛金小珠光': '拉丝黄钛金-LINEN', '拉丝玫瑰金小珠光': '拉丝玫瑰金-LINEN',
  '单面抛光': '单面抛光', '双面抛光': '双面抛光',
};

// 保护膜名称标准化映射
const FILM_ALIASES = {
  '5c': '5C-FILM', '5c-film': '5C-FILM', 'hw5c': 'HW 5C-FILM', 'hw 5c': 'HW 5C-FILM', 'hw5c-film': 'HW 5C-FILM', 'hw 5c-film': 'HW 5C-FILM',
  '7c': '7C-FILM', '7c-film': '7C-FILM', 'hw7c': 'HW 7C-FILM', 'hw 7c': 'HW 7C-FILM', 'hw7c-film': 'HW 7C-FILM', 'hw 7c-film': 'HW 7C-FILM',
  '10c': '10C-FILM', '10c-film': '10C-FILM',
  '7c-laser': '7C-LASER-FILM', '7c-laser-film': '7C-LASER-FILM', '7c laser film pvc': '7C-LASER-FILM',
  '7c-achem': '7C-ACHEM-FILM', '7c-achem-film': '7C-ACHEM-FILM',
  '7c-poli': '7C-POLI-FILM', '7c-poli-film': '7C-POLI-FILM',
  '7c-novacel': '7C-NOVACEL-FILM', '7c-novacel-film': '7C-NOVACEL-FILM', '7c novacell laser film pvc': '7C-NOVACEL-FILM',
  '8c-novacel': '8C-NOVACEL-FILM', '8c-novacel-film': '8C-NOVACEL-FILM',
  '10c-novacel': '10C-NOVACEL-FILM', '10c-novacel-film': '10C-NOVACEL-FILM',
  '垫纸': '垫纸',
  // 胶膜组合短名
  '5c+5c': '5C+5C-FILM', '5c+5c-film': '5C+5C-FILM', '5c-film+5c-film': '5C+5C-FILM',
  '7c+5c': '7C+5C-FILM', '7c+5c-film': '7C+5C-FILM', '7c-film+5c-film': '7C+5C-FILM',
  '7c+7c': '7C+7C-FILM', '7c+7c-film': '7C+7C-FILM', '7c-film+7c-film': '7C+7C-FILM'
};
