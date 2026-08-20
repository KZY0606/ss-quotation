/**
 * KK不锈钢报价系统 - 计算引擎
 */

const PricingEngine = (() => {

  function round2(v) { return Math.round(v * 100) / 100; }
  function round3(v) { return Math.round(v * 1000) / 1000; }
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

  // 201 系判断：材质以 201 开头（含压延变体）
  function isMaterial201(material) {
    return !!material && /^201/.test(material);
  }

  // 201 基价宽度档：返回档位(1-4)或 null（不在档内）
  function getWidthBand201(width) {
    if (isNaN(width) || width <= 0) return null;
    return WIDTH_TO_BAND_201[width] || null;
  }

  // 1500/1530 宽度档：按材质查厚度档位（返回 t1..t6 或 null=范围外/材质不支持）
  function getThickBand1500(material, thickness) {
    const m = (material || '').trim();
    const bands = THICK_BANDS_1500[m];
    if (!bands) return null; // J4/J5/其他材质暂无厚度分档
    const t = parseFloat(thickness);
    if (isNaN(t)) return null;
    for (const b of bands) {
      if (t >= b.min && t <= b.max) return b.key;
    }
    return null;
  }

  function getEdgeType(width) {
    const w = parseFloat(width);
    // 精确匹配齐边（1250 为齐边，2026-08-20 用户确认）
    if (EDGE_TYPE.trim.includes(w)) return 'trim';
    // 精确匹配毛边
    if (EDGE_TYPE.rough.includes(w)) return 'rough';
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
      // 标准化：Excel中"非标"可能没有括号
      let normMaterial = (material || '').replace(/\(?非标\)?/g, '(非标)').replace(/（非标）/g, '(非标)');
      // 400系材质名如 '410S/BA' 含嵌入表面名 → 拆分为 baseMaterial='410S', embeddedSurface='BA'
      let baseMaterial = normMaterial;
      let embeddedSurface = null;
      if (normMaterial.includes('/')) {
        const parts = normMaterial.split('/');
        baseMaterial = parts[0];
        embeddedSurface = parts[1];
      }
      // 生成待尝试的表面键：嵌入表面优先，其次参数 surface，额外尝试 'BA'（兼容单面抛光）
      const surfaceKeys = [embeddedSurface || surface];
      if ((embeddedSurface || surface) === '单面抛光') surfaceKeys.push('BA');

      for (const s of surfaceKeys) {
        if (!s) continue;
        // 优先尝试产地特异性键 (如 '410S-2BA-瑞钢')
        if (origin) {
          const originKey = baseMaterial + '-' + s + '-' + origin;
          if (THICKNESS_SURCHARGE_400[originKey]) {
            return findInTable(THICKNESS_SURCHARGE_400[originKey], t);
          }
        }
        // 再尝试通用键 (如 '410S-BA')
        const key = baseMaterial + '-' + s;
        if (THICKNESS_SURCHARGE_400[key]) {
          return findInTable(THICKNESS_SURCHARGE_400[key], t);
        }
      }
      // 如果基材是400系已知材料但该组合未配置 → 返回 null
      if (baseMaterial === '410S' || baseMaterial === '430' || baseMaterial === '430B' || baseMaterial === '430W') return null;
    }
    // 压延料使用独立加价表（不分产地）
    if (isYanYan) {
      return findInTable(YANYAN_THICKNESS_SURCHARGE, t);
    }
    // 316L：有产地特异性加价则用，否则用通用 316L 表
    if (material === '316L') {
      if (origin && ORIGIN_THICKNESS_SURCHARGE_316L && ORIGIN_THICKNESS_SURCHARGE_316L[origin]) {
        return findInTable(ORIGIN_THICKNESS_SURCHARGE_316L[origin], t);
      }
      return findInTable(THICKNESS_SURCHARGE_316L, t);
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
    // 表面为"无"或空 → 无加工费（常见于400系，表面已嵌入材质名）
    if (!surface || surface === '无') return 0;
    const t = parseFloat(thickness);
    const w = parseFloat(width);
    // 304 特例表面：优先查 304 专用表
    const is304 = material && (material === '304' || material.startsWith('304') || material === '316L');
    // 400系表面加工费与304同价
    const is400 = material && (material.includes('/') || material === '410S' || material === '430' || material === '430B');
    if ((is304 || is400) && SURFACE_FEES_304[surface]) {
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
    // 厚度支持范围（如 "0.55-0.60"）：保留原始字符串用于显示/导出，计算取下限
    const thicknessRaw = String(item.thickness === null || item.thickness === undefined ? '' : item.thickness).trim();
    const thkRange = parseThicknessRange(thicknessRaw);
    const thickness = thkRange ? thkRange.min : NaN;
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
    const isYanYan = !!item.isYanYan || (item.material && /压延/.test(item.material));

    // 201 系基价宽度档校验（精确值档位；J5 不分宽度，跳过）
    if (isMaterial201(material) && !/^201J5/.test(material)) {
      const wb = getWidthBand201(width);
      if (wb === null) {
        errors.push(`宽度 ${isNaN(width) ? (item.width || '?') : width}mm 不在 201 基价档位（1219/1240、1250/1280、1500/1530）`);
      } else if (wb === 4) {
        // 1500/1530 宽板：按厚度分基价（J4 暂不支持）
        if (material === '201J4') {
          errors.push(`宽度 ${width}mm 档暂不支持 201J4（未配置厚度分档）`);
        } else {
          // material 无 J 后缀（如 '201'）按 201J2 查厚度档
          const thickMat = material === '201' ? '201J2' : material;
          const tk = getThickBand1500(thickMat, thickness);
          if (tk === null) {
            errors.push(`厚度 ${isNaN(thickness) ? (item.thickness || '?') : thickness}mm 不在 1500/1530 宽度档 ${material} 的厚度档位内（见基价面板“1500/1530 宽板”版块）`);
          }
        }
      }
    }

    if (isNaN(basePrice) || basePrice <= 0) errors.push('基价无效');
    if (isNaN(thickness) || thickness <= 0) errors.push('厚度无效');
    if (isNaN(width) || width <= 0) errors.push('宽度无效');

    const density = getDensity(material);
    if (density === null) errors.push(`材质 "${material}" 无匹配密度`);

    let thickSurcharge = getThicknessSurcharge(thickness, isYanYan, material, item.origin, surface);
    if (thickSurcharge === null) errors.push(`厚度 ${thickness}mm 不在任何${isYanYan ? '压延料' : ''}加价区间`);
    // 甬金316L 宽度1500~1550mm 额外宽度加价（加入厚度加价），仅0.25~0.50mm适用
    let widthSurcharge = 0;
    if (thickSurcharge !== null && item.origin === '甬金' && material === '316L' && thickness >= 0.25 && thickness <= 0.50 && width >= 1500 && width <= 1550) {
      widthSurcharge = 300;
      thickSurcharge += widthSurcharge;
    }

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
    const linenSuffix = aliasedName ? aliasedName.match(/^(.+)-LINEN$/i) : null;
    const hasLinen = linenSuffix || aliasedName === 'LINEN';

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
    let markup = SALES_MARKUP[markupKey];
    // 1000mm宽度特殊加价：所有材质宽度为1000mm时的切边卷/板额外+200元/吨
    if (width === 1000) {
      markup += 200;
    }
    const saleTax = round10(costTax + markup);
    const saleNoTax = round10(costNoTax + markup);

    // 重量：只读取导入数据（客户填写的吨数），不自动计算
    const weight = item.weight ? parseFloat(item.weight) : null;

    return {
      success: true,
      detail: {
        origin: item.origin || '',
        material, surface: item.surface || '', normSurface: baseSurface, thickness: thicknessRaw || String(thickness), width, length, weight, film1, film2, basePrice,
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
        edgeType, boardType, markup, widthSurcharge,
        saleTax, saleNoTax
      }
    };
  }

  function getThickTableName(isYanYan, material, origin, surface) {
    if (isYanYan) return '压延料';
    if (material && THICKNESS_SURCHARGE_400) {
      // 标准化：Excel中"非标"可能没有括号
      let normMaterial = (material || '').replace(/\(?非标\)?/g, '(非标)').replace(/（非标）/g, '(非标)');
      // 400系材质名如 '410S/BA' 含嵌入表面
      let baseMaterial = normMaterial;
      let embeddedSurface = null;
      if (normMaterial.includes('/')) {
        const parts = normMaterial.split('/');
        baseMaterial = parts[0];
        embeddedSurface = parts[1];
      }
      const surfaceKeys = [embeddedSurface || surface];
      if ((embeddedSurface || surface) === '单面抛光') surfaceKeys.push('BA');
      for (const s of surfaceKeys) {
        if (!s) continue;
        const key = baseMaterial + '-' + s;
        if (THICKNESS_SURCHARGE_400[key]) return '400系(' + key + ')';
        if (origin) {
          const originKey = baseMaterial + '-' + s + '-' + origin;
          if (THICKNESS_SURCHARGE_400[originKey]) return '400系(' + originKey + ')';
        }
      }
    }
    if (material === '316L') {
      if (origin && ORIGIN_THICKNESS_SURCHARGE_316L && ORIGIN_THICKNESS_SURCHARGE_316L[origin]) return origin + ' 316L加价';
      return '316L 加价';
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
      thickness: parts[0], // 保留原始字符串（可能是范围如 0.55-0.60）
      width: parseFloat(parts[1]),
      length: parts[2].toUpperCase() === 'C' || parts[2].toUpperCase() === 'COIL' ? 'C' : parts[2]
    };
  }

  // 厚度范围解析: "0.55-0.60" / "0.55~0.60" / "0.55 - 0.60" / "0.55" → {min, max}
  // 无法识别返回 null；范围参与计算时取 min（与历史 parseFloat 截断行为一致）
  function parseThicknessRange(raw) {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim().replace(/\s*MM\s*/i, '').trim();
    if (!s) return null;
    const m = s.match(/^(\d+\.?\d*)\s*[-~—–]\s*(\d+\.?\d*)$/);
    if (m) {
      const a = parseFloat(m[1]), b = parseFloat(m[2]);
      if (isNaN(a) || isNaN(b) || a <= 0 || b <= 0) return null;
      return { min: Math.min(a, b), max: Math.max(a, b), raw: s };
    }
    const v = parseFloat(s);
    if (isNaN(v) || v <= 0) return null;
    return { min: v, max: v, raw: s };
  }

  function parseFreeText(text, basePriceMap) {
    if (!text) return null;
    let remaining = text.trim();
    // 处理中文逗号和全角符号
    remaining = remaining.replace(/[，,、；;：:]/g, ' ').trim();

    // 规格支持厚度范围（如 0.55-0.60*1240*2500）
    const specRegex = /(\d+\.?\d*(?:\s*[-~—–]\s*\d+\.?\d*)?)\s*[*×xX]\s*(\d+\.?\d*)\s*[*×xX]\s*(\S+)/;
    const specMatch = remaining.match(specRegex);

    let thickness = null, width = null, length = null;
    if (specMatch) {
      thickness = specMatch[1]; // 保留原始字符串（可能为范围）
      width = parseFloat(specMatch[2]);
      const lenStr = specMatch[3].toUpperCase();
      length = (lenStr === 'C' || lenStr === 'COIL') ? 'C' : specMatch[3];
      remaining = remaining.replace(specRegex, ' ').trim();
    } else {
      // 无完整规格，尝试单独提取厚度如 "0.3MM" 或 "0.55-0.60MM"
      const thkMatch = remaining.match(/(\d+\.?\d*(?:\s*[-~—–]\s*\d+\.?\d*)?)\s*MM/i);
      if (thkMatch) {
        thickness = thkMatch[1]; // 保留原始字符串（可能为范围）
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
    const materialPatterns = ['201J5', '201J4', '201J1', '201J3', '201J2', '201', '304', '316L', '410S/BA', '410S/2BA', '410S/2BA(非标)', '410S/2BA非标', '430B/BA', '430B/2BA', '430/BA', '430/2BA', '430W/BA', '430W/2BA', '410S', '430B', '410', '430'];
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
      if (remaining.includes('衬纸')) {
        if (!film1) film1 = '垫纸';
        else if (!film2) film2 = '垫纸';
        remaining = remaining.replace('衬纸', ' ').trim();
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
    parseThicknessRange,
    getThicknessSurcharge, getSurfaceFee, getFilmFee, getSquareMetersPerTon,
    setUserOverrides,
    DENSITY, THICKNESS_SURCHARGE, THICKNESS_SURCHARGE_304, THICKNESS_SURCHARGE_316L, YANYAN_THICKNESS_SURCHARGE,
    ORIGIN_THICKNESS_SURCHARGE, ORIGIN_THICKNESS_SURCHARGE_316L,
    SURFACE_FEES, SURFACE_FEES_304, FILM_FEES, SALES_MARKUP, MATERIAL_OFFSETS, THICKNESS_SURCHARGE_400,
    WIDTH_BANDS_201, WIDTH_TO_BAND_201, MATERIALS_201, BEIGANG, getWidthBand201, isMaterial201,
    THICK_BANDS_1500, THICK_BANDS_1500_LABELS, getThickBand1500
  };
})();
