/**
 * KK不锈钢报价系统 - 计算引擎
 */

const PricingEngine = (() => {

  function round2(v) { return Math.round(v * 100) / 100; }
  function round10(v) { return Math.round(v / 10) * 10; }

  function findInTable(table, t) {
    for (const tier of table) {
      if (t >= tier.min && t <= tier.max) return tier.price;
    }
    return null;
  }

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

  function getThicknessSurcharge(thickness, isYanYan, material, origin, surface) {
    const t = parseFloat(thickness);
    // 400系：按材质+表面(+产地)对应独立加价，无匹配则返回 null
    if (material && THICKNESS_SURCHARGE_400) {
      // 生成待尝试的表面键：首选 surface，若为'单面抛光'则额外尝试'BA'
      const surfaceKeys = [surface];
      if (surface === '单面抛光') surfaceKeys.push('BA');

      for (const s of surfaceKeys) {
        // 优先尝试产地特异性键 (如 '410S-2BA-瑞钢')
        if (origin) {
          const originKey = material + '-' + s + '-' + origin;
          if (THICKNESS_SURCHARGE_400[originKey]) {
            return findInTable(THICKNESS_SURCHARGE_400[originKey], t);
          }
        }
        // 再尝试通用键 (如 '410S-BA')
        const key = material + '-' + s;
        if (THICKNESS_SURCHARGE_400[key]) {
          return findInTable(THICKNESS_SURCHARGE_400[key], t);
        }
      }
      // 如果材质是400系已知材料但该表面未配置 → 返回 null
      if (material === '410S' || material === '430' || material === '430B') return null;
    }
    // 压延料使用独立加价表（不分产地）
    if (isYanYan) {
      return findInTable(YANYAN_THICKNESS_SURCHARGE, t);
    }
    // 304：有产地特异性加价则用，否则用统一宏旺/德龙标准
    if (material && (material === '304' || material.startsWith('304'))) {
      if (origin && ORIGIN_THICKNESS_SURCHARGE[origin]) {
        return findInTable(ORIGIN_THICKNESS_SURCHARGE[origin], t);
      }
      return findInTable(THICKNESS_SURCHARGE_304, t);
    }
    // 201（正材）：暂时不分产地，统一标准
    return findInTable(THICKNESS_SURCHARGE, t);
  }

  // 用户价格覆盖（由 App 注入，存于 localStorage）
  let userOverrides = null;
  function setUserOverrides(overrides) { userOverrides = overrides; }

  function getSurfaceFee(surface, thickness, width, material) {
    const t = parseFloat(thickness);
    const w = parseFloat(width);
    // 304 特例表面：优先查 304 专用表
    const is304 = material && (material === '304' || material.startsWith('304'));
    if (is304 && SURFACE_FEES_304[surface]) {
      const fee304 = SURFACE_FEES_304[surface];
      if (Array.isArray(fee304)) {
        for (const tier of fee304) {
          if (t >= tier.tMin && t <= tier.tMax && w >= tier.wMin && w <= tier.wMax) {
            if (tier.unit === 'ton') return tier.price;
            return { sqmPrice: tier.price, needConvert: true };
          }
        }
      }
    }
    // 用户覆盖：简单单价（元/平米）模式（不分材质）
    if (userOverrides && userOverrides.surfaceFees && userOverrides.surfaceFees[surface] !== undefined) {
      const val = userOverrides.surfaceFees[surface];
      if (typeof val === 'number') {
        return { sqmPrice: val, needConvert: true };
      }
      return val;
    }
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

  // 卷材自动映射：当输入未指定 (板)/(卷) 后缀时，根据 boardType 自动使用 (卷) 定价
  function autoMapCoilSurface(surface, boardType, rawInput) {
    if (!surface) return surface;
    // 用户明确输入了 (板)，尊重选择不自动映射
    if (rawInput && rawInput.endsWith('(板)')) return surface;
    if (boardType === 'coil' && !surface.endsWith('(卷)')) {
      const coilKey = surface + '(卷)';
      if (SURFACE_FEES[coilKey] !== undefined) return coilKey;
    }
    return surface;
  }

  function getFilmFee(filmName) {
    if (!filmName || filmName.trim() === '' || filmName.trim() === '无' || filmName.trim() === '/') return 0;
    // 优先使用用户覆盖
    if (userOverrides && userOverrides.filmFees && userOverrides.filmFees[filmName] !== undefined) {
      return userOverrides.filmFees[filmName];
    }
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
    // 模糊匹配：别名匹配失败时，用Levenshtein找最接近的表面
    return fuzzyMatchSurface(lower) || s;
  }

  let _fuzzyCache = null;
  function _buildFuzzyDict() {
    if (_fuzzyCache) return _fuzzyCache;
    const seen = new Set();
    const dict = [];
    // 收集所有表面别名key
    for (const key of Object.keys(SURFACE_ALIASES)) {
      const norm = SURFACE_ALIASES[key];
      if (!seen.has(key)) {
        dict.push({ key, norm, label: key });
        seen.add(key);
      }
    }
    // 收集所有直接表面名（中文）
    for (const key of Object.keys(SURFACE_FEES)) {
      if (!seen.has(key)) {
        dict.push({ key, norm: key, label: key });
        seen.add(key);
      }
    }
    _fuzzyCache = dict;
    return dict;
  }

  // Levenshtein距离
  function levenshtein(a, b) {
    const al = a.length, bl = b.length;
    const m = Array.from({length: al + 1}, () => new Uint8Array(bl + 1));
    for (let i = 0; i <= al; i++) m[i][0] = i;
    for (let j = 0; j <= bl; j++) m[0][j] = j;
    for (let i = 1; i <= al; i++) {
      for (let j = 1; j <= bl; j++) {
        const cost = a[i-1] === b[j-1] ? 0 : 1;
        m[i][j] = Math.min(m[i-1][j] + 1, m[i][j-1] + 1, m[i-1][j-1] + cost);
      }
    }
    return m[al][bl];
  }

  // 模糊匹配：用Levenshtein找最接近的已知表面名
  function fuzzyMatchSurface(input) {
    const dict = _buildFuzzyDict();
    let bestScore = 0;
    let bestNorm = null;
    for (const entry of dict) {
      const dist = levenshtein(input, entry.key);
      const maxLen = Math.max(input.length, entry.key.length);
      const score = maxLen > 0 ? 1 - dist / maxLen : 0;
      if (score > bestScore && score >= 0.55) {
        bestScore = score;
        bestNorm = entry.norm;
      }
    }
    return bestNorm;
  }

  function normalizeFilm(raw) {
    if (!raw) return null;
    const s = raw.trim();
    if (FILM_FEES[s]) return s;
    const lower = s.toLowerCase();
    if (FILM_ALIASES[lower]) return FILM_ALIASES[lower];
    return s;
  }

  // AFP检测：从表面名称中提取AFP变种
  // 支持的格式：
  //   "表面 + AFP" / "表面+AFP(M)" / "表面(AFP)" / "表面(AFP(M))"
  //   "表面哑光抗指纹" / "表面亮光抗指纹"
  function detectAFP(surface) {
    if (!surface) return null;
    const s = surface.trim();

    // 格式1b: "表面 + BRIGHT AFP" / "表面 + MATTE AFP"（集装箱表格格式）
    let m = s.match(/^(.+?)\s*[+]\s*(BRIGHT|MATTE)\s+AFP\s*$/i);
    if (m) {
      return { baseName: m[1].trim(), isMatte: m[2].toLowerCase() === 'matte' };
    }

    // 格式1: "表面 + AFP" / "表面+AFP(B)" / "表面+AFP(M)"
    m = s.match(/^(.+?)\s*[+]\s*AFP\s*(?:\(([^)]*)\))?\s*$/i);
    if (m) {
      const spec = (m[2] || '').toLowerCase();
      return { baseName: m[1].trim(), isMatte: spec === 'm' || spec === 'matte' };
    }

    // 格式2: "表面(AFP)" / "表面(AFP(M))"
    m = s.match(/^(.+?)\s*\(AFP\s*(?:\(?([^)]*)\)?)?\)\s*$/i);
    if (m) {
      const spec = (m[2] || '').toLowerCase();
      return { baseName: m[1].trim(), isMatte: spec === 'm' || spec === 'matte' };
    }

    // 格式3: "表面哑光抗指纹" / "表面哑光无指纹"
    m = s.match(/^(.+?)(?:哑光抗指纹|哑光无指纹)$/);
    if (m) return { baseName: m[1].trim(), isMatte: true };

    // 格式4: "表面亮光抗指纹" / "表面亮光无指纹"
    m = s.match(/^(.+?)(?:亮光抗指纹|亮光无指纹)$/);
    if (m) return { baseName: m[1].trim(), isMatte: false };

    return null;
  }

  function calculate(item) {
    const errors = [];
    const material = (item.material || '').trim();
    const surface = normalizeSurface(item.surface);
    const thickness = parseFloat(item.thickness);
    const width = parseFloat(item.width);
    const length = (item.length || '').trim();
    // "/" 自动拆分膜：5C-FILM/5C-FILM → film1=5C-FILM, film2=5C-FILM
    const rawFilm1 = (item.film1 || '').trim();
    const rawFilm2 = (item.film2 || '').trim();
    let splitFilm1 = rawFilm1, splitFilm2 = rawFilm2;
    // 先检查原始输入是否匹配 FILM_FEES（含打包价如 "5C膜/5C膜=3"），匹配则不拆分
    if (rawFilm1 && !FILM_FEES[rawFilm1] && rawFilm1.includes('/')) {
      const parts = rawFilm1.split('/').map(s => s.trim());
      splitFilm1 = parts[0] || '';
      if (parts.length > 1 && !rawFilm2) splitFilm2 = parts[1] || '';
    }
    if (rawFilm2 && !FILM_FEES[rawFilm2] && rawFilm2.includes('/')) {
      const parts = rawFilm2.split('/').map(s => s.trim());
      splitFilm2 = parts[0] || '';
    }
    const film1 = normalizeFilm(splitFilm1);
    const film2 = normalizeFilm(splitFilm2);
    const basePrice = parseFloat(item.basePrice);
    const isYanYan = !!item.isYanYan;

    if (isNaN(basePrice) || basePrice <= 0) errors.push('基价无效');
    if (isNaN(thickness) || thickness <= 0) errors.push('厚度无效');
    if (isNaN(width) || width <= 0) errors.push('宽度无效');

    const density = getDensity(material);
    if (density === null) errors.push(`材质 "${material}" 无匹配密度`);

    const thickSurcharge = getThicknessSurcharge(thickness, isYanYan, material, item.origin, surface);
    if (thickSurcharge === null) errors.push(`厚度 ${thickness}mm 不在任何${isYanYan ? '压延料' : ''}加价区间`);

    const edgeType = getEdgeType(width);
    if (edgeType === null) errors.push(`宽度 ${width}mm 无法判定毛边/齐边`);

    const boardType = getBoardType(length);
    const sqmPerTon = getSquareMetersPerTon(density, thickness);

    // ---- 附加工艺检测 ----
    const rawTrimmed = (item.surface || '').trim();
    const rawLower = rawTrimmed.toLowerCase();
    const aliasedName = normalizeSurface(rawTrimmed); // 可以有模糊匹配
    const isExactAlias = SURFACE_FEES[rawTrimmed] || SURFACE_ALIASES[rawLower];

    // LINEN: 在别名归一化后的名称上检测（别名已把小珠光等转为-LINEN后缀）
    const linenSuffix = aliasedName.match(/^(.+)-LINEN$/i);
    const hasLinen = linenSuffix || /^LINEN$/.test(aliasedName);

    // AFP: 仅在原始输入不是直接表面命中时检测
    let afpSqmFee = 0;
    let baseSurface = aliasedName;

    if (hasLinen && linenSuffix) {
      // 剥离linen，归一化基础表面
      const linBase = normalizeSurface(linenSuffix[1]);
      if (linBase && SURFACE_FEES[linBase]) baseSurface = linBase;
    } else if (!SURFACE_FEES[rawTrimmed] && !isExactAlias) {
      const afpInfo = detectAFP(rawTrimmed);
      if (afpInfo) {
        const afpBase = normalizeSurface(afpInfo.baseName);
        if (afpBase && SURFACE_FEES[afpBase]) {
          baseSurface = afpBase;
          afpSqmFee = afpInfo.isMatte ? AFP_MATTE_FEE : AFP_BRIGHT_FEE;
        }
      }
    }

    let surfaceFeePerTon = 0;
    let linenFeePerTon = hasLinen ? LINEN_FEE : 0;
    // 板/卷自动映射：卷材自动使用 (卷) 定价
    baseSurface = autoMapCoilSurface(baseSurface, boardType, rawTrimmed);
    const surfaceRaw = getSurfaceFee(baseSurface, thickness, width, material);
    if (surfaceRaw === null) {
      errors.push(`表面 "${baseSurface}" 在 厚度${thickness}mm × 宽度${width}mm 下无匹配加工费`);
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
    const afpPerTon = round2(afpSqmFee * sqmPerTon);

    if (errors.length > 0) {
      return { success: false, errors };
    }

    const subtotal = round2(basePrice + thickSurcharge + surfaceFeePerTon + linenFeePerTon + afpPerTon + film1PerTon + film2PerTon);
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
        material, surface: item.surface || '', normSurface: baseSurface, thickness, width, length, film1, film2, basePrice,
        isYanYan, hasLinen: !!hasLinen,
        density, sqmPerTon: round2(sqmPerTon),
        thickSurcharge, thickTable: getThickTableName(isYanYan, material, item.origin, baseSurface),
        surfaceFeeSqm: (typeof surfaceRaw === 'object' && surfaceRaw.needConvert) ? surfaceRaw.sqmPrice : (typeof surfaceRaw === 'number' ? null : 0),
        surfaceFeePerTon: round2(surfaceFeePerTon),
        linenFeePerTon,
        afpFeeSqm: afpSqmFee, afpPerTon,
        film1FeeSqm: film1Fee || 0, film1PerTon,
        film2FeeSqm: film2Fee || 0, film2PerTon,
        costRaw: round2(subtotal), costNoTaxRaw: round2(taxExcluded),
        costTax, costNoTax,
        edgeType, boardType, markup,
        saleTax, saleNoTax
      }
    };
  }

  function getThickTableName(isYanYan, material, origin, surface) {
    if (isYanYan) return '压延料';
    if (material && THICKNESS_SURCHARGE_400) {
      const surfaceKeys = [surface];
      if (surface === '单面抛光') surfaceKeys.push('BA');
      for (const s of surfaceKeys) {
        const key = material + '-' + s;
        if (THICKNESS_SURCHARGE_400[key]) return '400系(' + key + ')';
        if (origin) {
          const originKey = material + '-' + s + '-' + origin;
          if (THICKNESS_SURCHARGE_400[originKey]) return '400系(' + originKey + ')';
        }
      }
    }
    if (material && (material === '304' || material.startsWith('304'))) {
      if (origin && ORIGIN_THICKNESS_SURCHARGE[origin]) return origin + ' 加价';
      return '304 加价';
    }
    return '常规';
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
    let remaining = text.trim();
    // 处理中文逗号和全角符号
    remaining = remaining.replace(/[，,、；;：:]/g, ' ').trim();

    const specRegex = /(\d+\.?\d*)\s*[*×xX]\s*(\d+\.?\d*)\s*[*×xX]\s*(\S+)/;
    const specMatch = remaining.match(specRegex);

    let thickness = null, width = null, length = null;
    if (specMatch) {
      thickness = parseFloat(specMatch[1]);
      width = parseFloat(specMatch[2]);
      const lenStr = specMatch[3].toUpperCase();
      length = (lenStr === 'C' || lenStr === 'COIL') ? 'C' : specMatch[3];
      remaining = remaining.replace(specRegex, ' ').trim();
    } else {
      // 无完整规格，尝试单独提取厚度如 "0.3MM"
      const thkMatch = remaining.match(/(\d+\.?\d+)\s*MM/i);
      if (thkMatch) {
        thickness = parseFloat(thkMatch[0]);
        width = 1240;
        length = 'C';
        remaining = remaining.replace(thkMatch[0], ' ').trim();
      } else {
        return null;
      }
    }

    // 提取括号里的膜信息: "GOLD MIRROR(7C-FILM+5C-FILM)"
    let film1 = '', film2 = '';
    const parenFilm = remaining.match(/\(([^)]+)\)/);
    if (parenFilm) {
      const parts = parenFilm[1].split('+').map(s => s.trim());
      for (const p of parts) {
        const norm = normalizeFilm(p);
        if (norm) {
          if (!film1) film1 = norm;
          else if (!film2 && norm !== film1) film2 = norm;
        }
      }
      remaining = remaining.replace(parenFilm[0], ' ').trim();
    }

    // 检测压延
    let isYanYan = false;
    if (/压延/.test(remaining)) {
      isYanYan = true;
      remaining = remaining.replace(/压延/g, ' ').trim();
    }

    // 提取材质 (201J5 > 201J4 > ... > 201)
    const materialPatterns = ['201J5', '201J4', '201J1', '201J3', '201J2', '201', '304', '316L', '410S/BA', '410S/2BA', '410S/2BA(非标)', '410S/2BA非标', '430/BA', '430/2BA', '430B/BA', '430B/2BA', '410S', '430B', '410', '430'];
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

    // 提取保护膜（如果括号里没找到）
    if (!film1) {
      // "/" 自动拆分：5C膜/5C膜 → film1=5C-FILM, film2=5C-FILM
      const slashSplit = remaining.match(/^(.+?)\s*\/\s*(.+?)$/);
      if (slashSplit) {
        const left = slashSplit[1].trim();
        const right = slashSplit[2].trim();
        // 仅在两侧都能归一化为同一标准膜时拆分
        const nl = normalizeFilm(left);
        const nr = normalizeFilm(right);
        if (nl && nr && nl === nr) {
          film1 = nl; film2 = nr;
          remaining = remaining.replace(left, ' ').replace(right, ' ').trim();
        }
      }
      if (!film1) {
        for (const [alias, standard] of Object.entries(FILM_ALIASES)) {
          const regex = new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          if (regex.test(remaining)) {
            if (!film1) film1 = standard;
            else if (!film2 && standard !== film1) film2 = standard;
            remaining = remaining.replace(regex, ' ').trim();
          }
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
    }

    // 提取表面 — 用 SURFACE_ALIASES 按长度排序优先匹配
    let surface = '';
    const sortedAliases = Object.entries(SURFACE_ALIASES).sort((a,b) => b[0].length - a[0].length);
    for (const [alias, norm] of sortedAliases) {
      const re = new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      if (re.test(remaining)) {
        surface = norm;
        remaining = remaining.replace(re, ' ').trim();
        break;
      }
    }
    if (!surface) {
      // 全文尝试 normalizeSurface
      const normed = normalizeSurface(remaining.trim());
      if (normed && normed !== remaining.trim()) {
        surface = normed;
        remaining = '';
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
    setUserOverrides,
    DENSITY, THICKNESS_SURCHARGE, THICKNESS_SURCHARGE_304, YANYAN_THICKNESS_SURCHARGE, ORIGIN_THICKNESS_SURCHARGE,
    SURFACE_FEES, SURFACE_FEES_304, FILM_FEES, SALES_MARKUP, MATERIAL_OFFSETS, THICKNESS_SURCHARGE_400
  };
})();
