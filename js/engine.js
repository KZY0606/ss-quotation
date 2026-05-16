/**
 * KK不锈钢报价系统 - 计算引擎
 */

const PricingEngine = (() => {

  function round2(v) { return Math.round(v * 100) / 100; }
  function round10(v) { return Math.round(v / 10) * 10; }

  function getDensity(material) {
    const key = material.replace(/\s/g, '').toUpperCase();
    if (DENSITY[key]) return DENSITY[key];
    for (const [k, v] of Object.entries(DENSITY)) {
      if (key.startsWith(k) || k.startsWith(key)) return v;
    }
    return null;
  }

  function getEdgeType(width) {
    const w = parseFloat(width);
    // 精确匹配齐边
    if (EDGE_TYPE.trim.includes(w)) return 'trim';
    // 1240-1280 都是毛边 (粗磨)，以及 1530
    if ((w >= 1240 && w <= 1280) || w === 1530 || EDGE_TYPE.rough.includes(w)) return 'rough';
    return null;
  }

  function getBoardType(length) {
    const l = String(length).trim().toUpperCase();
    return (l === 'C' || l === 'COIL') ? 'coil' : 'sheet';
  }

  function getThicknessSurcharge(thickness, isYanYan) {
    const t = parseFloat(thickness);
    const table = isYanYan ? YANYAN_THICKNESS_SURCHARGE : THICKNESS_SURCHARGE;
    for (const tier of table) {
      if (t >= tier.min && t <= tier.max) return tier.price;
    }
    return null;
  }

  function getSurfaceFee(surface, thickness, width) {
    const t = parseFloat(thickness);
    const w = parseFloat(width);
    const fee = SURFACE_FEES[surface];
    if (!fee) return null;
    if (fee.type === 'none') return 0;
    if (Array.isArray(fee)) {
      for (const tier of fee) {
        if (surface === '单面抛光' || surface === '双面抛光') {
          if (t >= tier.tMin && t <= tier.tMax) return tier.price;
        } else {
          if (t >= tier.tMin && t <= tier.tMax && w >= tier.wMin && w <= tier.wMax) {
            if (tier.unit === 'ton') return tier.price;
            return { sqmPrice: tier.price, needConvert: true };
          }
        }
      }
      return null;
    }
    if (fee.type === 'sqm') {
      if (t >= fee.tMin && t <= fee.tMax && w >= fee.wMin && w <= fee.wMax) {
        return { sqmPrice: fee.price, needConvert: true };
      }
    }
    return null;
  }

  function getFilmFee(filmName) {
    if (!filmName || filmName.trim() === '' || filmName.trim() === '无' || filmName.trim() === '/') return 0;
    return FILM_FEES[filmName] || null;
  }

  function getSquareMetersPerTon(density, thickness) {
    return 1000 / density / parseFloat(thickness);
  }

  function normalizeSurface(raw) {
    if (!raw) return null;
    const s = raw.trim();
    if (SURFACE_FEES[s]) return s;
    const lower = s.toLowerCase();
    if (SURFACE_ALIASES[lower]) return SURFACE_ALIASES[lower];
    return s;
  }

  function normalizeFilm(raw) {
    if (!raw) return null;
    const s = raw.trim();
    if (FILM_FEES[s]) return s;
    const lower = s.toLowerCase();
    if (FILM_ALIASES[lower]) return FILM_ALIASES[lower];
    return s;
  }

  function calculate(item) {
    const errors = [];
    const material = (item.material || '').trim();
    const surface = normalizeSurface(item.surface);
    const thickness = parseFloat(item.thickness);
    const width = parseFloat(item.width);
    const length = (item.length || '').trim();
    const film1 = normalizeFilm(item.film1);
    const film2 = normalizeFilm(item.film2);
    const basePrice = parseFloat(item.basePrice);
    const isYanYan = !!item.isYanYan;

    if (isNaN(basePrice) || basePrice <= 0) errors.push('基价无效');
    if (isNaN(thickness) || thickness <= 0) errors.push('厚度无效');
    if (isNaN(width) || width <= 0) errors.push('宽度无效');

    const density = getDensity(material);
    if (density === null) errors.push(`材质 "${material}" 无匹配密度`);

    const thickSurcharge = getThicknessSurcharge(thickness, isYanYan);
    if (thickSurcharge === null) errors.push(`厚度 ${thickness}mm 不在任何${isYanYan ? '压延料' : ''}加价区间`);

    const edgeType = getEdgeType(width);
    if (edgeType === null) errors.push(`宽度 ${width}mm 无法判定毛边/齐边`);

    const boardType = getBoardType(length);
    const sqmPerTon = getSquareMetersPerTon(density, thickness);

    let surfaceFeePerTon = 0;
    const surfaceRaw = getSurfaceFee(surface, thickness, width);
    if (surfaceRaw === null) {
      errors.push(`表面 "${surface}" 在 厚度${thickness}mm × 宽度${width}mm 下无匹配加工费`);
    } else if (typeof surfaceRaw === 'number') {
      surfaceFeePerTon = surfaceRaw;
    } else if (surfaceRaw.needConvert) {
      surfaceFeePerTon = round2(surfaceRaw.sqmPrice * sqmPerTon);
    }

    const film1Fee = getFilmFee(film1);
    const film2Fee = getFilmFee(film2);
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

    const subtotal = round2(basePrice + thickSurcharge + surfaceFeePerTon + film1PerTon + film2PerTon);
    const taxExcluded = round2(subtotal * 0.92);
    const costTax = round10(subtotal);
    const costNoTax = round10(taxExcluded);
    const markupKey = `${edgeType}_${boardType}`;
    const markup = SALES_MARKUP[markupKey];
    const saleTax = round10(costTax + markup);
    const saleNoTax = round10(costNoTax + markup);

    return {
      success: true,
      detail: {
        origin: item.origin || '',
        material, surface, thickness, width, length, film1, film2, basePrice,
        isYanYan,
        density, sqmPerTon: round2(sqmPerTon),
        thickSurcharge, thickTable: isYanYan ? '压延料' : '常规',
        surfaceFeeSqm: (typeof surfaceRaw === 'object' && surfaceRaw.needConvert) ? surfaceRaw.sqmPrice : (typeof surfaceRaw === 'number' ? null : 0),
        surfaceFeePerTon: round2(surfaceFeePerTon),
        film1FeeSqm: film1Fee || 0, film1PerTon,
        film2FeeSqm: film2Fee || 0, film2PerTon,
        costRaw: round2(subtotal), costNoTaxRaw: round2(taxExcluded),
        costTax, costNoTax,
        edgeType, boardType, markup,
        saleTax, saleNoTax
      }
    };
  }

  function calculateBatch(items) {
    return items.map((item, index) => ({ index: index + 1, ...calculate(item) }));
  }

  function parseSpec(specStr) {
    if (!specStr) return null;
    const s = specStr.replace(/×/g, '*').replace(/x/gi, '*').replace(/\s/g, '');
    const parts = s.split('*').map(p => p.trim());
    if (parts.length < 3) return null;
    return {
      thickness: parseFloat(parts[0]),
      width: parseFloat(parts[1]),
      length: parts[2].toUpperCase() === 'C' || parts[2].toUpperCase() === 'COIL' ? 'C' : parts[2]
    };
  }

  function parseFreeText(text, basePriceMap) {
    if (!text) return null;
    const specRegex = /(\d+\.?\d*)\s*[*×xX]\s*(\d+\.?\d*)\s*[*×xX]\s*(\S+)/;
    const specMatch = text.match(specRegex);
    if (!specMatch) return null;

    const thickness = parseFloat(specMatch[1]);
    const width = parseFloat(specMatch[2]);
    const lengthStr = specMatch[3].toUpperCase();
    const length = (lengthStr === 'C' || lengthStr === 'COIL') ? 'C' : specMatch[3];

    let remaining = text.replace(specRegex, ' ').trim();

    // 检测压延
    let isYanYan = false;
    if (/压延/.test(remaining)) {
      isYanYan = true;
      remaining = remaining.replace(/压延/g, ' ').trim();
    }

    // 提取材质 (201J5 > 201J4 > ... > 201)
    const materialPatterns = ['201J5', '201J4', '201J1', '201J3', '201J2', '201', '304', '316L', '410', '430'];
    let material = '';
    for (const mp of materialPatterns) {
      if (remaining.toUpperCase().includes(mp.toUpperCase())) {
        material = mp;
        remaining = remaining.replace(new RegExp(mp, 'gi'), ' ').trim();
        break;
      }
    }

    // 提取产地 (使用 ORIGIN_KEYWORDS)
    const originPatterns = ORIGIN_KEYWORDS;
    let origin = '';
    for (const op of originPatterns) {
      if (remaining.includes(op)) {
        origin = op;
        remaining = remaining.replace(op, ' ').trim();
        break;
      }
    }

    // 提取保护膜
    let film1 = '', film2 = '';
    for (const [alias, standard] of Object.entries(FILM_ALIASES)) {
      const regex = new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      if (regex.test(remaining)) {
        if (!film1) film1 = standard;
        else if (!film2) film2 = standard;
        remaining = remaining.replace(regex, ' ').trim();
      }
    }
    for (const fname of Object.keys(FILM_FEES)) {
      if (remaining.includes(fname) && fname !== film1 && fname !== film2) {
        if (!film1) film1 = fname;
        else if (!film2) film2 = fname;
        remaining = remaining.replace(fname, ' ').trim();
      }
    }
    if (remaining.includes('垫纸')) {
      if (!film1) film1 = '垫纸';
      else if (!film2) film2 = '垫纸';
      remaining = remaining.replace('垫纸', ' ').trim();
    }

    // 提取表面
    let surface = '';
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

    // 根据材质 + 压延 计算基价
    let basePrice = 0;
    if (basePriceMap && material) {
      const key = isYanYan ? material + '压延' : material;
      basePrice = basePriceMap[key] || basePriceMap[material] || 0;
    }

    return {
      origin, material, surface: normalizeSurface(surface) || surface,
      thickness, width, length, film1, film2, basePrice, isYanYan
    };
  }

  return {
    calculate, calculateBatch, parseSpec, parseFreeText,
    normalizeSurface, normalizeFilm, getDensity, getEdgeType,
    getThicknessSurcharge, getSurfaceFee, getFilmFee, getSquareMetersPerTon,
    DENSITY, THICKNESS_SURCHARGE, YANYAN_THICKNESS_SURCHARGE,
    SURFACE_FEES, FILM_FEES, SALES_MARKUP, MATERIAL_OFFSETS
  };
})();
