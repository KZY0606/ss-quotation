/**
 * 不锈钢批量报价系统 - 计算引擎
 */

const PricingEngine = (() => {

  /**
   * 辅助：两位小数四舍五入
   */
  function round2(v) {
    return Math.round(v * 100) / 100;
  }

  /**
   * 辅助：四舍五入到十位
   */
  function round10(v) {
    return Math.round(v / 10) * 10;
  }

  /**
   * 获取材质密度
   */
  function getDensity(material) {
    const key = material.replace(/\s/g, '').toUpperCase();
    // 匹配最精确的key
    if (DENSITY[key]) return DENSITY[key];
    // 模糊匹配：201J2 → 201, 304 → 304
    for (const [k, v] of Object.entries(DENSITY)) {
      if (key.startsWith(k) || k.startsWith(key)) return v;
    }
    return null;
  }

  /**
   * 判断边类型
   */
  function getEdgeType(width) {
    const w = parseFloat(width);
    if (EDGE_TYPE.trim.includes(w)) return 'trim';
    if (EDGE_TYPE.rough.includes(w)) return 'rough';
    return null;
  }

  /**
   * 判断板类型（卷板/平板）
   */
  function getBoardType(length) {
    const l = String(length).trim().toUpperCase();
    return (l === 'C' || l === 'COIL') ? 'coil' : 'sheet';
  }

  /**
   * 查找厚度加价
   */
  function getThicknessSurcharge(thickness) {
    const t = parseFloat(thickness);
    for (const tier of THICKNESS_SURCHARGE) {
      if (t >= tier.min && t <= tier.max) return tier.price;
    }
    return null;
  }

  /**
   * 查找表面加工费（返回 元/吨）
   */
  function getSurfaceFee(surface, thickness, width) {
    const t = parseFloat(thickness);
    const w = parseFloat(width);
    const fee = SURFACE_FEES[surface];
    if (!fee) return null;

    // 无加工费
    if (fee.type === 'none') return 0;

    // 数组类型（NO.4/HL/单面抛光/双面抛光）
    if (Array.isArray(fee)) {
      for (const tier of fee) {
        // 单面/双面抛光只有厚度条件（元/吨，不需要宽度和平方数量）
        if (surface === '单面抛光' || surface === '双面抛光') {
          if (t >= tier.tMin && t <= tier.tMax) return tier.price;
        } else {
          // NO.4/HL: 检查厚度+宽度
          if (t >= tier.tMin && t <= tier.tMax && w >= tier.wMin && w <= tier.wMax) {
            if (tier.unit === 'ton') return tier.price;
            // sqm: 需要转成元/吨（由调用方处理）
            return { sqmPrice: tier.price, needConvert: true };
          }
        }
      }
      return null;
    }

    // 对象类型（彩色8K、拉丝系列）
    if (fee.type === 'sqm') {
      if (t >= fee.tMin && t <= fee.tMax && w >= fee.wMin && w <= fee.wMax) {
        return { sqmPrice: fee.price, needConvert: true };
      }
    }

    return null;
  }

  /**
   * 查找保护膜费用（元/平米）
   */
  function getFilmFee(filmName) {
    if (!filmName || filmName.trim() === '' || filmName.trim() === '无' || filmName.trim() === '/') return 0;
    return FILM_FEES[filmName] || null;
  }

  /**
   * 平方数量：1吨有多少平米
   */
  function getSquareMetersPerTon(density, thickness) {
    return 1000 / density / parseFloat(thickness);
  }

  /**
   * 标准化表面名称
   */
  function normalizeSurface(raw) {
    if (!raw) return null;
    const s = raw.trim();
    if (SURFACE_FEES[s]) return s;
    const lower = s.toLowerCase();
    if (SURFACE_ALIASES[lower]) return SURFACE_ALIASES[lower];
    return s; // 保持原样，后续计算时会报错
  }

  /**
   * 标准化保护膜名称
   */
  function normalizeFilm(raw) {
    if (!raw) return null;
    const s = raw.trim();
    if (FILM_FEES[s]) return s;
    const lower = s.toLowerCase();
    if (FILM_ALIASES[lower]) return FILM_ALIASES[lower];
    return s;
  }

  /**
   * 核心计算：计算单条数据的完整报价
   * @param {Object} item - { material, surface, thickness, width, length, film1, film2, basePrice }
   * @returns {Object} 计算结果或错误信息
   */
  function calculate(item) {
    const errors = [];

    // 1. 解析输入
    const material = (item.material || '').trim();
    const surface = normalizeSurface(item.surface);
    const thickness = parseFloat(item.thickness);
    const width = parseFloat(item.width);
    const length = (item.length || '').trim();
    const film1 = normalizeFilm(item.film1);
    const film2 = normalizeFilm(item.film2);
    const basePrice = parseFloat(item.basePrice);

    // 2. 验证
    if (isNaN(basePrice) || basePrice <= 0) errors.push('基价无效');
    if (isNaN(thickness) || thickness <= 0) errors.push('厚度无效');
    if (isNaN(width) || width <= 0) errors.push('宽度无效');

    const density = getDensity(material);
    if (density === null) errors.push(`材质 "${material}" 无匹配密度`);

    const thickSurcharge = getThicknessSurcharge(thickness);
    if (thickSurcharge === null) errors.push(`厚度 ${thickness}mm 不在任何加价区间`);

    const edgeType = getEdgeType(width);
    if (edgeType === null) errors.push(`宽度 ${width}mm 无法判定毛边/齐边`);

    const boardType = getBoardType(length);

    // 表面加工费
    let surfaceFeePerTon = 0;
    const sqmPerTon = getSquareMetersPerTon(density, thickness);

    const surfaceRaw = getSurfaceFee(surface, thickness, width);
    if (surfaceRaw === null) {
      errors.push(`表面 "${surface}" 在 厚度${thickness}mm × 宽度${width}mm 下无匹配加工费`);
    } else if (typeof surfaceRaw === 'number') {
      surfaceFeePerTon = surfaceRaw;
    } else if (surfaceRaw.needConvert) {
      surfaceFeePerTon = round2(surfaceRaw.sqmPrice * sqmPerTon);
    }

    // 保护膜
    const film1Fee = getFilmFee(film1);
    const film2Fee = getFilmFee(film2);
    if (film1 === null && (item.film1 || '').trim() !== '' && (item.film1 || '').trim() !== '无' && (item.film1 || '').trim() !== '/') {
      // film1 输入了但没匹配到，normalizeFilm 返回了原样
    }
    if (film1 !== null && film1 !== undefined && getFilmFee(film1) === null) {
      errors.push(`保护膜1 "${item.film1}" 无法识别`);
    }
    if (film2 !== null && film2 !== undefined && getFilmFee(film2) === null) {
      errors.push(`保护膜2 "${item.film2}" 无法识别`);
    }
    const film1PerTon = film1Fee ? round2(film1Fee * sqmPerTon) : 0;
    const film2PerTon = film2Fee ? round2(film2Fee * sqmPerTon) : 0;

    if (errors.length > 0) {
      return { success: false, errors };
    }

    // 3. 计算
    const subtotal = round2(basePrice + thickSurcharge + surfaceFeePerTon + film1PerTon + film2PerTon);
    const taxExcluded = round2(subtotal * 0.92);

    const costTax = round10(subtotal);
    const costNoTax = round10(taxExcluded);

    // 4. 销售价
    const markupKey = `${edgeType}_${boardType}`;
    const markup = SALES_MARKUP[markupKey];

    const saleTax = round10(costTax + markup);
    const saleNoTax = round10(costNoTax + markup);

    return {
      success: true,
      detail: {
        // 输入
        material, surface, thickness, width, length, film1, film2, basePrice,
        // 中间值
        density, sqmPerTon: round2(sqmPerTon),
        thickSurcharge,
        surfaceFeeSqm: (typeof surfaceRaw === 'object' && surfaceRaw.needConvert) ? surfaceRaw.sqmPrice : (typeof surfaceRaw === 'number' ? null : 0),
        surfaceFeePerTon: round2(surfaceFeePerTon),
        film1FeeSqm: film1Fee || 0, film1PerTon,
        film2FeeSqm: film2Fee || 0, film2PerTon,
        // 成本价（四舍五入到十位前）
        costRaw: round2(subtotal),
        costNoTaxRaw: round2(taxExcluded),
        // 成本价
        costTax, costNoTax,
        // 销售加价
        edgeType, boardType, markup,
        // 销售价
        saleTax, saleNoTax
      }
    };
  }

  /**
   * 批量计算
   */
  function calculateBatch(items) {
    return items.map((item, index) => ({
      index: index + 1,
      ...calculate(item)
    }));
  }

  /**
   * 从规格字符串解析厚度、宽度、长度
   * 支持格式：
   *   "0.50*1240*C"
   *   "0.50*1240*2500"
   *   "0.50×1240×C"
   *   "0.50 x 1240 x C"
   */
  function parseSpec(specStr) {
    if (!specStr) return null;
    // 统一分隔符
    const s = specStr.replace(/×/g, '*').replace(/x/gi, '*').replace(/\s/g, '');
    const parts = s.split('*').map(p => p.trim());
    if (parts.length < 3) return null;
    return {
      thickness: parseFloat(parts[0]),
      width: parseFloat(parts[1]),
      length: parts[2].toUpperCase() === 'C' || parts[2].toUpperCase() === 'COIL' ? 'C' : parts[2]
    };
  }

  /**
   * 尝试从自由文本解析一条报价数据
   * 支持格式示例：
   *   "宏旺201J2 NO.4 5C-FILM 0.50*1240*C"
   *   "宏旺 201J2 NO.4+5C-FILM 0.50*1240*C"
   *   "0.50*1240*C NO.4 5C"
   */
  function parseFreeText(text, basePrice) {
    if (!text) return null;

    // 提取规格 (厚度*宽度*长度)
    const specRegex = /(\d+\.?\d*)\s*[*×xX]\s*(\d+\.?\d*)\s*[*×xX]\s*(\S+)/;
    const specMatch = text.match(specRegex);

    if (!specMatch) return null;

    const thickness = parseFloat(specMatch[1]);
    const width = parseFloat(specMatch[2]);
    const lengthStr = specMatch[3].toUpperCase();
    const length = (lengthStr === 'C' || lengthStr === 'COIL') ? 'C' : specMatch[3];

    // 去掉规格部分，剩下的文本用于提取其他字段
    let remaining = text.replace(specRegex, ' ').trim();

    // 提取材质 (优先级高的在前面)
    const materialPatterns = ['201J2', '201J1', '201J5', '201J3', '201', '304', '316L', '410', '430'];
    let material = '';
    for (const mp of materialPatterns) {
      if (remaining.toUpperCase().includes(mp.toUpperCase())) {
        material = mp;
        remaining = remaining.replace(new RegExp(mp, 'gi'), ' ').trim();
        break;
      }
    }

    // 提取产地
    const originPatterns = ['宏旺', '联众', '甬金', '青山', '德龙', '北海诚德', '张浦'];
    let origin = '';
    for (const op of originPatterns) {
      if (remaining.includes(op)) {
        origin = op;
        remaining = remaining.replace(op, ' ').trim();
        break;
      }
    }

    // 提取保护膜（已知膜名称匹配）
    let film1 = '', film2 = '';
    for (const [alias, standard] of Object.entries(FILM_ALIASES)) {
      const regex = new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      if (regex.test(remaining)) {
        if (!film1) {
          film1 = standard;
        } else if (!film2) {
          film2 = standard;
        }
        remaining = remaining.replace(regex, ' ').trim();
      }
    }
    // 也检查 FILM_FEES 直接key
    for (const fname of Object.keys(FILM_FEES)) {
      if (remaining.includes(fname) && fname !== film1 && fname !== film2) {
        if (!film1) film1 = fname;
        else if (!film2) film2 = fname;
        remaining = remaining.replace(fname, ' ').trim();
      }
    }
    // 检查 "垫纸"
    if (remaining.includes('垫纸')) {
      if (!film1) film1 = '垫纸';
      else if (!film2) film2 = '垫纸';
      remaining = remaining.replace('垫纸', ' ').trim();
    }

    // 提取表面
    let surface = '';
    // 先检查长名称（彩色8K、拉丝系列），再检查短名称
    const surfaceNames = [
      '拉丝古铜哑光抗指纹', '拉丝古铜亮光抗指纹',
      '镜面8K紫罗兰', '镜面8K翡翠绿', '镜面8K中国红', '镜面8K紫红', '镜面8K宝石蓝', '镜面8K古铜',
      '镜面8K黄钛金', '镜面8K玫瑰金', '镜面8K黑钛金',
      '镜面紫罗兰', '镜面翡翠绿', '镜面中国红', '镜面紫红', '镜面宝石蓝', '镜面古铜',
      '镜面黄钛金', '镜面玫瑰金', '镜面黑钛金',
      '8K紫罗兰', '8K翡翠绿', '8K中国红', '8K紫红', '8K宝石蓝', '8K古铜',
      '8K黄钛金', '8K玫瑰金', '8K黑钛金',
      '拉丝黄钛金', '拉丝玫瑰金', '拉丝黑钛金',
      '单面抛光', '双面抛光',
      'NO.4', 'HL', '8K', '2B'
    ];
    for (const sn of surfaceNames) {
      if (remaining.toUpperCase().includes(sn.toUpperCase())) {
        surface = sn;
        remaining = remaining.replace(new RegExp(sn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ').trim();
        break;
      }
    }

    return {
      origin, material, surface: normalizeSurface(surface) || surface,
      thickness, width, length, film1, film2, basePrice
    };
  }

  // 公开 API
  return {
    calculate,
    calculateBatch,
    parseSpec,
    parseFreeText,
    normalizeSurface,
    normalizeFilm,
    getDensity,
    getEdgeType,
    getThicknessSurcharge,
    getSurfaceFee,
    getFilmFee,
    getSquareMetersPerTon,
    DENSITY,
    THICKNESS_SURCHARGE,
    SURFACE_FEES,
    FILM_FEES,
    SALES_MARKUP
  };
})();
