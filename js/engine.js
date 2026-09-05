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

  function round4(v) { return Math.round(v * 10000) / 10000; }
  function round6(v) { return Math.round(v * 1000000) / 1000000; }

  // 单张计算逻辑边部费用（2026-08-24 用户规则）：元/吨
  // 201/304/400系：毛边+100、切边+200、1000mm切边+400；316L：毛边+300、切边+500
  function surfSqmSafe(surfaceRaw) {
    if (typeof surfaceRaw === 'object' && surfaceRaw.needConvert) return surfaceRaw.sqmPrice;
    if (typeof surfaceRaw === 'number') return surfaceRaw;
    return 0;
  }

  function getEdgeFee(material, edgeType, width) {
    const m = String(material || '').trim().toUpperCase();
    let group = null;
    if (/^316L/.test(m)) group = EDGE_FEES['316l'];
    else if (/^201/.test(m) || /^304/.test(m) || /^(410|420|430|441|444)/.test(m)) group = EDGE_FEES.std;
    if (!group) return null;
    if (edgeType === 'rough') return group.rough;
    if (edgeType === 'trim') {
      const w = parseFloat(width);
      if (w === 1000 && group.trim1000 != null) return group.trim1000;
      return group.trim;
    }
    return null;
  }

  // 平板销售加价细分 key（2026-08-22 用户规则，出口木架基准）：命中返回 SHEET_MARKUP_DETAIL 的 key，否则 null
  // 1219/1240: std(201/304/410/430)/316l × 2100-2500/3000-4000
  // 1250/1280: 304/410430(410/430系)/316l × 2100-2500/3000-4000（304 与 410/430 分开定价）
  // 1030/1000: std/316l × 1001-2000/2001-4000
  function getSheetMarkupKey(material, width, length) {
    const m = String(material || '').toUpperCase();
    const w = parseFloat(width);
    const L = parseFloat(length);
    if (isNaN(w) || isNaN(L)) return null;
    let group = null, bands = null;
    if (w === 1219 || w === 1240) {
      group = /^(201|304|410|430)/.test(m) ? 'std' : (/^316L/.test(m) ? '316l' : null);
      bands = SHEET_LENGTH_BANDS;
    } else if (w === 1250 || w === 1280) {
      group = /^(410|420|430|441|444)/.test(m) ? '410430' : (/^316L/.test(m) ? '316l' : (/^304/.test(m) ? '304' : null));
      bands = SHEET_LENGTH_BANDS;
    } else if (w === 1030 || w === 1000) {
      group = /^(201|304|410|430)/.test(m) ? 'std' : (/^316L/.test(m) ? '316l' : null);
      bands = SHEET_LENGTH_BANDS_NARROW;
    } else if (w === 1500 || w === 1530 || w === 1524) {
      group = /^(201|304|410|430)/.test(m) ? 'std' : (/^316L/.test(m) ? '316l' : null);
      bands = SHEET_LENGTH_BANDS_WIDE;
    }
    if (!group || !bands) return null;
    const band = bands.find(b => L >= b.min && L <= b.max);
    if (!band) return null;
    // 1524 与 1500 同价（2026-08-22 用户规则：1524 归类到 1500mm 一块，都是齐边）
    const keyW = (w === 1524) ? 1500 : w;
    return group + '_' + keyW + '_' + band.key;
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
    // 316L：仅产地特异性加价表；未提供数据的产地（甬金/太钢）直接返回 null 报错（2026-08-20 用户确认）
    if (material === '316L') {
      if (origin && ORIGIN_THICKNESS_SURCHARGE_316L && ORIGIN_THICKNESS_SURCHARGE_316L[origin]) {
        return findInTable(ORIGIN_THICKNESS_SURCHARGE_316L[origin], t);
      }
      return null;
    }
    // 304：有产地特异性加价则用，否则用统一宏旺/德龙标准
    if (material && (material === '304' || material.startsWith('304'))) {
      if (origin && ORIGIN_THICKNESS_SURCHARGE_304 && ORIGIN_THICKNESS_SURCHARGE_304[origin]) {
        return findInTable(ORIGIN_THICKNESS_SURCHARGE_304[origin], t);
      }
      if (origin && ORIGIN_THICKNESS_SURCHARGE[origin]) {
        return findInTable(ORIGIN_THICKNESS_SURCHARGE[origin], t);
      }
      return findInTable(THICKNESS_SURCHARGE_304, t);
    }
    // 201J5锛堝寳娓級锛氬帤搴﹀姞浠蜂笌瀹忔椇 201 姝ｆ潗涓€鑷?2026-08-25 鐢ㄦ埛瑙勫垯锛屽鍚嶆椇201姝ｆ潗琛級
    if (material && /^201J5/.test(material)) {
      return findInTable(THICKNESS_SURCHARGE, t);
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
    // 400系表面加工费与304同价（2026-08-21：覆盖全部400系材质名，含带嵌入表面的 '430BA'/'410S-BA-宏旺' 等）
    const is400 = material && (material.includes('/') || material.startsWith('410S') || material.startsWith('430'));
    if ((is304 || is400) && SURFACE_FEES_304[surface]) {
      const fee304 = SURFACE_FEES_304[surface];
      if (Array.isArray(fee304)) {
        for (let i = 0; i < fee304.length; i++) {
          const tier = fee304[i];
          if (t >= tier.tMin && t <= tier.tMax && w >= tier.wMin && w <= tier.wMax) {
            const ov = userOverrides && userOverrides.surfaceTiers && userOverrides.surfaceTiers[surface];
            const price = (ov && ov[i] !== undefined) ? ov[i] : tier.price;
            if (tier.unit === 'ton') return price;
            return { sqmPrice: price, needConvert: true };
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
      for (let i = 0; i < fee.length; i++) {
        const tier = fee[i];
        const ov = userOverrides && userOverrides.surfaceTiers && userOverrides.surfaceTiers[surface];
        const price = (ov && ov[i] !== undefined) ? ov[i] : tier.price;
        if (surface === '单面抛光' || surface === '双面抛光') {
          if (t >= tier.tMin && t <= tier.tMax) return price;
        } else {
          if (t >= tier.tMin && t <= tier.tMax && w >= tier.wMin && w <= tier.wMax) {
            if (tier.unit === 'ton') return price;
            return { sqmPrice: price, needConvert: true };
          }
        }
      }
      return null;
    }
    if (fee.type === 'sqm') {
      if (t >= fee.tMin && t <= fee.tMax && w >= fee.wMin && w <= fee.wMax) {
        const ov = userOverrides && userOverrides.surfaceTiers && userOverrides.surfaceTiers[surface];
        const price = (ov && ov[0] !== undefined) ? ov[0] : fee.price;
        return { sqmPrice: price, needConvert: true };
      }
    }
    return null;
  }

  // 卷材自动映射：当输入未指定 (板)/(卷) 后缀时，根据 boardType 自动使用 (卷) 定价
  function autoMapCoilSurface(surface, boardType, rawInput) {
    if (!surface) return surface;
    // 用户明确输入了 (板)，尊重选择不自动映射
    if (rawInput && rawInput.endsWith('(板)')) return surface;
    // 2026-08-23 用户规则：单张8K 系列（普磨/高普/普精/精磨/超精）仅限平板；卷板自动按卷磨8K 计价
    if (boardType === 'coil' && surface.startsWith('单张')) return '8K';
    if (boardType === 'coil' && !surface.endsWith('(卷)')) {
      const coilKey = surface + '(卷)';
      if (SURFACE_FEES[coilKey] !== undefined) return coilKey;
    }
    return surface;
  }

  function getFilmFeePart(part) {
    const norm = normalizeFilm(part);
    if (userOverrides && userOverrides.filmFees && userOverrides.filmFees[norm] !== undefined) {
      return userOverrides.filmFees[norm];
    }
    const v = FILM_FEES[norm];
    return (v !== undefined) ? v : null;
  }

  function getFilmFee(filmName) {
    if (!filmName || filmName.trim() === '' || filmName.trim() === '无' || filmName.trim() === '/') return 0;
    // 优先使用用户覆盖（整名，含发布的自定义膜价）
    if (userOverrides && userOverrides.filmFees && userOverrides.filmFees[filmName] !== undefined) {
      return userOverrides.filmFees[filmName];
    }
    // 整名命中（含预定义组合如 5C-FILM+5C-FILM、带+的单膜 BLUE+KBE-5C-FILM）→ 不拆分
    if (FILM_FEES[filmName] !== undefined) {
      return FILM_FEES[filmName];
    }
    // 组合膜：按 + 拆分逐段识别，价格相加（10C-NOVACEL-LASER-FILM+5C-FILM = 8.8+1.0 = 9.8）
    if (filmName.includes('+')) {
      const parts = filmName.split('+').map(function (x) { return x.trim(); }).filter(Boolean);
      let total = 0;
      for (let k = 0; k < parts.length; k++) {
        const fee = getFilmFeePart(parts[k]);
        if (fee === null || fee === undefined) return null; // 任一段无法识别 → 整体无法识别（上层报错）
        total += fee;
      }
      return round2(total);
    }
    return FILM_FEES[filmName] ?? null;
  }

  function getSquareMetersPerTon(density, thickness) {
    return 1000 / density / parseFloat(thickness);
  }

  function normalizeSurface(raw) {
    if (!raw) return null;
    const s = raw.trim();
    // 2026-08-21：小炉/大炉后缀 S/L（带不带 / 都识别，如 '8K黄钛金(板)/S'、'8K黄钛金(板)S'）
    // 剥掉后缀后基础名必须能精确匹配（SURFACE_FEES 键或别名），避免误伤 'HL' 等字母结尾表面
    let suffix = null;
    let base = s;
    const sm = s.match(/^(.*?)[\/\s]*([sSlL])$/);
    if (sm) {
      const up = sm[2].toUpperCase();
      const b = sm[1].trim();
      if ((up === 'S' || up === 'L') && b && (SURFACE_FEES[b] || SURFACE_ALIASES[b.toLowerCase()])) {
        suffix = up;
        base = b;
      }
    }
    let norm;
    if (SURFACE_FEES[base]) norm = base;
    else {
      const lower = base.toLowerCase();
      // v1.0.165 组合名保护：单张彩色（钛铝古铜 vs 钛块古铜）与 AFP 组合（亮油/哑油）不模糊匹配，保持原样交给后续拆分
      const _sc = splitSheetColor(base);
      const _afp = detectAFP(base);
      if ((_sc && COLOR_FEES[_sc.colorName]) || _afp) norm = base;
      else norm = SURFACE_ALIASES[lower] || fuzzyMatchSurface(lower) || base;
    }
    if (suffix) {
      const key = norm + '/' + suffix;
      return SURFACE_FEES[key] !== undefined ? key : norm;
    }
    return norm;
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
    const upper = s.toUpperCase();
    if (FILM_FEES[upper] !== undefined) return upper; // 大小写归一（小写输入如 10c-film）
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
    m = s.match(/^(.+?)(?:哑光抗指纹|哑光无指纹|哑油)(?:\(卷\)|\(板\))?$/);
    if (m) return { baseName: m[1].trim().replace(/[+\s]+$/, ''), isMatte: true };

    // 格式4: "表面亮光抗指纹" / "表面亮光无指纹"
    m = s.match(/^(.+?)(?:亮光抗指纹|亮光无指纹|亮油)(?:\(卷\)|\(板\))?$/);
    if (m) return { baseName: m[1].trim().replace(/[+\s]+$/, ''), isMatte: false };

    // 格式5: "表面 + 亮油/哑油/亮光无指纹/哑光无指纹/亮光抗指纹/哑光抗指纹"（v1.0.166 用户常用写法）
    m = s.match(/^(.+?)\s*[+]\s*(亮油|哑油|亮光无指纹|哑光无指纹|亮光抗指纹|哑光抗指纹)(?:\(卷\)|\(板\))?$/);
    if (m) return { baseName: m[1].trim(), isMatte: m[2].indexOf('哑') === 0 };

    return null;
  }

  // v1.0.120 压花工艺：匹配单段（linen/小珠光等）→ EMBOSS_FEES 项或 null
  // v1.0.133 同时识别喷砂（SANDBLAST_ALIASES）；支持 feePerSqm（元/㎡，unit='sqm'）
  function matchEmboss(seg) {
    const low = (seg || '').trim().toLowerCase();
    const alias = EMBOSS_ALIASES[low] || SANDBLAST_ALIASES[low];
    if (!alias) return null;
    const e = EMBOSS_FEES[alias] || SANDBLAST_FEES[alias];
    if (!e) return null;
    const unit = e.feePerTon !== undefined ? 'ton' : 'sqm';
    // v1.0.121 压花覆盖价：配置板块压花工艺行修改后生效
    let fee = unit === 'ton' ? e.feePerTon : e.feePerSqm;
    if (userOverrides && userOverrides.surfaceFees && userOverrides.surfaceFees[alias] !== undefined) {
      fee = userOverrides.surfaceFees[alias];
    }
    return { key: alias, name: e.name, unit: unit, feePerTon: unit === 'ton' ? fee : 0, feePerSqm: unit === 'sqm' ? fee : 0 };
  }

  // v1.0.145 单张彩色工艺拆分：'单张普磨8K钛铝红铜' → { base:'单张普磨8K', colorName:'钛铝红铜' }
  // 仅单张 8K 系列（普磨/高普/普精/精磨/超精）；完整彩色 key（如 单张高普8K黄钛金）优先走 SURFACE_FEES
  function splitSheetColor(raw) {
    const s = String(raw || '').trim();
    const m = s.match(/^单张(砂面NO\.4|砂面|拉丝HL|拉丝|普磨8K|高普8K|普精8K|精磨8K|超精8K)(.+)$/);
    if (!m) return null;
    const ck = COLOR_ALIASES[m[2].trim()] || COLOR_ALIASES[String(m[2] || '').trim().toLowerCase()];
    if (!ck || !COLOR_FEES[ck]) return null;
    // v1.0.166 baseMap 精确映射（原 '单张'+m[1]+'8K' 对 砂面NO.4/拉丝HL/普磨8K 会拼出怪名，靠 fuzzy 兜底）
    const bm = { '砂面NO.4': '单张砂面NO.4', '砂面': '单张砂面NO.4', '拉丝HL': '单张拉丝HL', '拉丝': '单张拉丝HL' };
    return { base: bm[m[1]] || ('单张' + m[1]), colorName: ck };
  }
  // 颜色工艺费（元/㎡）：厚度 7 段匹配；1000mm 宽 = 窄板 ×1.25；1500+ 与 >2.0mm 无（报错由调用方处理）
  function getColorFee(name, thickness, width) {
    const arr = COLOR_FEES[name];
    if (!Array.isArray(arr)) return null;
    const idx = COLOR_FEE_SEGMENTS.findIndex(s => thickness >= s.tMin && thickness <= s.tMax);
    if (idx < 0) return null;
    let v = arr[idx];
    // v1.0.166 颜色费覆盖（老板面板调整后随单张加工价一起发布）
    const cov = userOverrides && userOverrides.colorFees && userOverrides.colorFees[name];
    if (cov && Array.isArray(cov) && cov[idx] !== undefined && cov[idx] !== null && !isNaN(parseFloat(cov[idx]))) v = parseFloat(cov[idx]);
    if (width === 1000) v = v * 1.25;
    else if (width >= 1500 && width <= 1530) v = v * 1.7; // v1.0.160 五尺彩色 = 四尺纯颜色费 ×1.7
    else if (width > 1530) return null;
    return round2(v + 1e-9);
  }
  // v1.0.145 喷砂打底规则放宽：任意单张 8K 系列即可（不再强制高普8K）
  function isSheet8kSurface(name) {
    return ['单张普磨8K', '单张高普8K', '单张普精8K', '单张精磨8K', '单张超精8K'].some(q => String(name || '').indexOf(q) === 0);
  }

  // v1.0.120 压花拆分：统一格式 "表面加工+压花工艺"（如 6K+linen、8K+小珠光），
  // 兼容 "6K+linen+AFP"（非压花段保留回 surfacePart）；无压花段时 surfacePart=原文
  function splitEmboss(raw) {
    const src = String(raw || '').trim();
    const segs = src.split('+').map(s => s.trim()).filter(Boolean);
    if (segs.length < 2) {
      // v1.0.122 单段也可能是纯压花（如 "小方格(square embossed)" / "linen"）
      const emb0 = matchEmboss(segs[0] || '');
      if (emb0) return { surfacePart: '', fees: [emb0] };
      return { surfacePart: src, fees: [] };
    }
    const fees = [];
    const plain = [];
    for (let i = 1; i < segs.length; i++) {
      // v1.0.122 先试两段合并（如 'square embossed' 带空格会被拆成两段），命中则跳过下一段
      let emb = null;
      if (i + 1 < segs.length) {
        emb = matchEmboss(segs[i] + ' ' + segs[i + 1]);
        if (emb) i++;
      }
      if (!emb) emb = matchEmboss(segs[i]);
      if (emb) fees.push(emb); else plain.push(segs[i]);
    }
    return {
      surfacePart: fees.length ? [segs[0], ...plain].join('+') : src,
      fees
    };
  }

  function calculate(item) {
    const errors = [];
    const material = (item.material || '').trim();
    // v1.0.120 压花工艺拆分（必须在表面归一化之前，避免 "6K+linen" 被模糊匹配吞掉压花段）
    const rawTrimmed = (item.surface || '').trim();
    const embossSplit = splitEmboss(rawTrimmed);
    const embossFees = embossSplit.fees;         // [{key,name,feePerTon}]
    let surfacePart = embossSplit.surfacePart; // 去掉压花段后的表面加工部分（v1.0.145 颜色拆分可能改写为品质名）
    const surface = normalizeSurface(surfacePart);
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
    // 2026-08-22：全局宽度白名单（只算这 8 个宽度，其他一律报错）
    if (!isNaN(width) && width > 0 && !WIDTH_ALLOWED.includes(width)) {
      errors.push(`宽度 ${width}mm 不在可计算宽度（1000/1030/1219/1240/1250/1280/1500/1524/1530）`);
    }
    // 2026-08-22 用户规则：201 材质不提供 1250/1280mm 宽度，一律不计算（卷板/平板都拦）
    if ((width === 1250 || width === 1280) && /^201/.test(String(material || '').toUpperCase())) {
      errors.push('201 材质不提供 ' + width + 'mm 宽度，无法计算（2026-08-22 用户规则）');
    }

    const density = getDensity(material);
    if (density === null) errors.push(`材质 "${material}" 无匹配密度`);

    let thickSurcharge = getThicknessSurcharge(thickness, isYanYan, material, item.origin, surface);
    if (thickSurcharge === null) {
      // v1.0.97: J5 thickness surcharge = standard 201 table (same as HongWang), no special error
      errors.push(`厚度 ${thickness}mm 不在任何${isYanYan ? '压延料' : ''}加价区间`);
    }
    // 甬金316L 薄料(0.25-0.50mm) 宽度 1500/1530：厚度加价额外 +300（2026-08-21 用户确认）
    let widthSurcharge = 0;
    if (thickSurcharge !== null && item.origin === '甬金' && material === '316L' && thickness >= 0.25 && thickness <= 0.50 && width >= 1500 && width <= 1530) {
      widthSurcharge = 300;
      thickSurcharge += widthSurcharge;
    }

    const edgeType = getEdgeType(width);
    if (edgeType === null) errors.push(`宽度 ${width}mm 无法判定毛边/齐边`);

    const boardType = getBoardType(length);

    // 平板长度区间校验（2026-08-22 用户规则：1219/1240 长度须在 2100-2500 或 3000-4000；1030/1000 须在 1001-2000 或 2001-4000，否则报错）
    if (boardType === 'sheet' && (width === 1219 || width === 1240 || width === 1030 || width === 1000 || width === 1250 || width === 1280 || width === 1500 || width === 1530 || width === 1524)) {
      const mNorm = String(material || '').toUpperCase();
      let inGroup;
      if (width === 1250 || width === 1280) {
        // 1250/1280 细分只覆盖 304 / 410/430系 / 316L（201 走旧价不限长度）
        inGroup = /^304/.test(mNorm) || /^(410|420|430|441|444)/.test(mNorm) || /^316L/.test(mNorm);
      } else {
        inGroup = /^(201|304|410|430)/.test(mNorm) || /^316L/.test(mNorm);
      }
      if (inGroup) {
        const L = parseFloat(length);
        let bands;
        if (width === 1030 || width === 1000) bands = SHEET_LENGTH_BANDS_NARROW;
        else if (width === 1500 || width === 1530 || width === 1524) bands = SHEET_LENGTH_BANDS_WIDE;
        else bands = SHEET_LENGTH_BANDS;
        if (!(L >= 0) || !bands.some(b => L >= b.min && L <= b.max)) {
          let rangeTxt;
          if (width === 1030 || width === 1000) rangeTxt = '1001-2000 或 2001-4000';
          else if (width === 1500 || width === 1530 || width === 1524) rangeTxt = '2100-3055 或 3056-4000';
          else rangeTxt = '2100-2500 或 3000-4000';
          errors.push(`平板长度 ${length}mm 不在可计算长度区间（${rangeTxt}，2026-08-22 用户规则）`);
        }
      }
    }

    // 包装方式（2026-08-22 用户规则）：平板必填木架/木箱，卷板不校验；v1.0.106：单张计价支持 5 种包装（长词优先）
    const packingRaw = item.packing != null ? String(item.packing).trim() : '';
    let packing = null;
    if (/密封木箱/.test(packingRaw)) packing = '密封木箱';
    else if (/出口铁架/.test(packingRaw)) packing = '出口铁架';
    else if (/出口铁箱/.test(packingRaw)) packing = '出口铁箱';
    else if (/出口木箱|木箱/.test(packingRaw)) packing = '出口木箱';
    else if (/木架/.test(packingRaw)) packing = '木架';
    // v1.0.83：单张计价曾用包装费用（packingFee）不再要求包装方式；v1.0.106 改回：单张按包装方式×重量均摊，过磅平板仍要求木架/木箱
    if (boardType === 'sheet' && item.calcMode !== 'sheet' && item.calcMode !== 'custom') {
      if (!packing) errors.push('平板必须填写包装方式（木架/出口木箱/密封木箱/出口铁架/出口铁箱）');
    }

    const sqmPerTon = getSquareMetersPerTon(density, thickness);

    // ---- 附加工艺检测 ----
    // v1.0.145 单张彩色工艺拆分：完整彩色 key（如 单张高普8K黑钛金）也拆为 品质+颜色 分别展示，总额不变；
    // 组合名（如 单张普磨8K钛铝红铜）拆为 品质+颜色
    let colorSplit = null;
    let fullKeyTotalSqm = null;
    if (SURFACE_FEES[surfacePart]) {
      const fk = getSurfaceFee(surfacePart, thickness, width, material);
      if (fk && fk.needConvert) fullKeyTotalSqm = fk.sqmPrice;
    }
    colorSplit = splitSheetColor(surfacePart);
    if (colorSplit) surfacePart = colorSplit.base;
    const rawLower = surfacePart.toLowerCase();
    const aliasedName = normalizeSurface(surfacePart); // 可以有模糊匹配
    const isExactAlias = SURFACE_FEES[surfacePart] || SURFACE_ALIASES[rawLower];

    // LINEN: 在别名归一化后的名称上检测（旧格式别名已把小珠光等转为-LINEN后缀，如 '8k linen'）
    const linenSuffix = aliasedName ? aliasedName.match(/^(.+)-LINEN$/i) : null;
    const hasLinen = linenSuffix || aliasedName === 'LINEN';
    if (hasLinen && !embossFees.some(e => e.key === 'linen')) {
      // v1.0.121 支持配置板块覆盖压花价
      const linCfg = { key: 'linen', name: EMBOSS_FEES.linen.name, unit: 'ton', feePerTon: EMBOSS_FEES.linen.feePerTon, feePerSqm: 0 };
      if (userOverrides && userOverrides.surfaceFees && userOverrides.surfaceFees.linen !== undefined) {
        linCfg.feePerTon = userOverrides.surfaceFees.linen;
      }
      embossFees.push(linCfg);
    }

    // AFP: 仅在原始输入不是直接表面命中时检测
    let afpSqmFee = 0;
    let baseSurface = aliasedName;

    if (hasLinen && linenSuffix) {
      // 剥离linen，归一化基础表面
      const linBase = normalizeSurface(linenSuffix[1]);
      if (linBase && SURFACE_FEES[linBase]) baseSurface = linBase;
    } else if (aliasedName === 'LINEN') {
      // 纯压花（无主表面，如只输 "linen"）：表面加工费为 0，压花费照算
      baseSurface = '';
    } else if (!SURFACE_FEES[surfacePart] && !isExactAlias) {
      const afpInfo = detectAFP(surfacePart);
      if (afpInfo) {
        const afpBase = normalizeSurface(afpInfo.baseName);
        // v1.0.166 单张彩色 + 油：afpBase 为单张彩色组合（如 单张砂面黄钛金）时继续拆 品质+颜色，三个费用分开
        const afpColor = (afpBase && !SURFACE_FEES[afpBase]) ? splitSheetColor(afpBase) : null;
        if (afpColor && COLOR_FEES[afpColor.colorName]) {
          if (!colorSplit) colorSplit = afpColor;
          baseSurface = afpColor.base;
          afpSqmFee = afpInfo.isMatte
          ? (boardType === 'sheet' ? AFP_MATTE_FEE_SHEET : AFP_MATTE_FEE)
          : (boardType === 'sheet' ? AFP_BRIGHT_FEE_SHEET : AFP_BRIGHT_FEE);
        } else if (afpBase && SURFACE_FEES[afpBase]) {
          baseSurface = afpBase;
          afpSqmFee = afpInfo.isMatte
          ? (boardType === 'sheet' ? AFP_MATTE_FEE_SHEET : AFP_MATTE_FEE)
          : (boardType === 'sheet' ? AFP_BRIGHT_FEE_SHEET : AFP_BRIGHT_FEE);
        }
      }
    }

    let surfaceFeePerTon = 0;
    // v1.0.133 附加项合计（元/吨）：吨项直接加；平方项 × 每吨面积折算
    let linenFeePerTon = 0;
    embossFees.forEach(e => { if (e.unit === 'sqm') linenFeePerTon += (e.feePerSqm || 0) * sqmPerTon; else linenFeePerTon += (e.feePerTon || 0); });
    linenFeePerTon = round2(linenFeePerTon + 1e-9);
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

    // v1.0.145 颜色工艺费：单张品质费（surfaceRaw）之外单独累加，detail 单独展示
    // 完整彩色 key：颜色费 = 彩色 key 总额 - 品质白板费（差额，总额不变）；组合名：按 COLOR_FEES 7 段取
    let colorFeeSqm = 0;
    let colorName = '';
    let colorBaseSqm = null;
    let colorMult = null;
    if (colorSplit) {
      colorName = colorSplit.colorName;
      if (fullKeyTotalSqm !== null) {
        const whiteSqm = (typeof surfaceRaw === 'object' && surfaceRaw.needConvert) ? surfaceRaw.sqmPrice : 0;
        colorFeeSqm = round2(Math.max(0, fullKeyTotalSqm - whiteSqm) + 1e-9);
        // v1.0.147 差额为 0（本地白板覆盖价 ≥ 彩色总价，数据异常）时回退公式价，保证颜色行正常展示
        if (colorFeeSqm <= 0) {
          const fb = getColorFee(colorSplit.colorName, thickness, width);
          if (fb !== null) colorFeeSqm = fb;
        }
      } else {
        colorFeeSqm = getColorFee(colorSplit.colorName, thickness, width);
      }
      if (colorFeeSqm === null) {
        errors.push('颜色 "' + colorName + '" 在 厚度' + thickness + 'mm × 宽度' + width + 'mm 下无匹配工艺费');
      } else {
        surfaceFeePerTon = round2(surfaceFeePerTon + colorFeeSqm * sqmPerTon);
        // v1.0.149 颜色基础价与系数（1000宽 ×1.25）供 UI 展示计算式（如 31.5*1.25=39.38）；完整彩色 key 与组合名两条路径统一
        const cIdx = COLOR_FEE_SEGMENTS.findIndex(s => thickness >= s.tMin && thickness <= s.tMax);
        if (cIdx >= 0 && Array.isArray(COLOR_FEES[colorName]) && COLOR_FEES[colorName][cIdx] != null) {
          colorBaseSqm = COLOR_FEES[colorName][cIdx];
          colorMult = width === 1000 ? 1.25 : (width >= 1500 && width <= 1530 ? 1.7 : 1);
        }
      }
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

    const calcMode = item.calcMode === 'sheet' ? 'sheet' : (item.calcMode === 'custom' ? 'custom' : 'weight');

    // ---- 定制化计价逻辑（v1.0.170 用户规则 2026-09-05）：平板为主，包装费总额手动输入按件数均摊，各费用可覆盖 ----
    if (calcMode === 'custom') {
      if (boardType !== 'sheet') errors.push('定制化计价仅适用于平板（长度需填固定尺寸，如 2438/3000，不能是 C 卷）');
      const qtyNum = (item.quantity != null && item.quantity !== '' && parseFloat(item.quantity) > 0) ? parseFloat(item.quantity) : 0;
      if (!(qtyNum > 0)) errors.push('定制化计价需填写件数（张数，须大于 0）');
      const packingTotalRmb = (item.packingFee != null && parseFloat(item.packingFee) > 0) ? parseFloat(item.packingFee) : 0;
      const packingNameTxt = packing || packingRaw || '';
      if (errors.length === 0) {
        const Lc = parseFloat(length);
        const sheetAreaC = round4(width * Lc / 1e6);
        const sheetVolumeC = round6(width * Lc * thickness / 1e9);
        const sheetWeightKgC = round3(sheetVolumeC * density * 1000);
        const totalTonC = round4(sheetWeightKgC * qtyNum / 1000);
        if (!(totalTonC > 0)) errors.push('定制化计价：单张重量或件数计算总重为 0');
        if (errors.length === 0) {
          // 包装费平摊（元/吨）：总额 ÷ 总吨；customPackingTon 可直接按元/吨填写覆盖
          const packingPerTonC = (item.customPackingTon != null && item.customPackingTon !== '' && parseFloat(item.customPackingTon) >= 0)
            ? (parseFloat(item.customPackingTon) || 0)
            : (packingTotalRmb > 0 ? round4(packingTotalRmb / totalTonC + 1e-9) : 0);
          // 装柜费：customContainerTon 覆盖（>=0），否则默认固定值
          const containerTonC = (item.customContainerTon != null && item.customContainerTon !== '' && parseFloat(item.customContainerTon) >= 0)
            ? (parseFloat(item.customContainerTon) || 0) : SHEET_CONTAINER_FEE;
          // 边部费：按规格自动（getEdgeFee），可覆盖
          let edgeTonC = getEdgeFee(material, edgeType, width);
          if (edgeTonC === null) { edgeTonC = 0; errors.push('材质/边部类型无匹配边部费用（定制化计价）'); }
          if (errors.length === 0 && item.customEdgeTon != null && item.customEdgeTon !== '' && parseFloat(item.customEdgeTon) >= 0) {
            edgeTonC = parseFloat(item.customEdgeTon) || 0;
          }
          if (errors.length === 0) {
            // 表面加工费：自动(表面+拉丝/压花+afp 元/吨) 可整体覆盖；膜费自动(film1+film2) 可整体覆盖
            const autoSurfTonC = round2(surfaceFeePerTon + linenFeePerTon + afpPerTon + 1e-9);
            const surfTonC = (item.customSurfaceTon != null && item.customSurfaceTon !== '' && parseFloat(item.customSurfaceTon) >= 0)
              ? (parseFloat(item.customSurfaceTon) || 0) : autoSurfTonC;
            const autoFilmTonC = round2(film1PerTon + film2PerTon + 1e-9);
            const filmTonC = (item.customFilmTon != null && item.customFilmTon !== '' && parseFloat(item.customFilmTon) >= 0)
              ? (parseFloat(item.customFilmTon) || 0) : autoFilmTonC;
            const inspectTonC = round2((parseFloat(item.inspect) > 0 ? parseFloat(item.inspect) : 0) * sqmPerTon + 1e-9);
            // v1.0.167 新公式：材料(含税)=基价+厚度加价；其他费用(不含税)÷0.92 折算
            const materialTaxRawC = basePrice + thickSurcharge;
            const otherTonC = round4(packingPerTonC + containerTonC + edgeTonC + surfTonC + filmTonC + inspectTonC + 1e-9);
            const costTaxRawC = round2(materialTaxRawC + otherTonC / 0.92 + 1e-9);
            const costNoTaxRawC = round2((basePrice + thickSurcharge) * 0.92 + otherTonC + 1e-9);
            const costTaxC = round10(costTaxRawC);
            const costNoTaxC = round10(costNoTaxRawC);
            // 每张折算（按单张重量 kg /1000 × 每吨价）
            const perKgC = sheetWeightKgC / 1000;
            const sheetCostTax = round2(costTaxC * perKgC + 1e-9);
            const sheetCostNoTax = round2(costNoTaxC * perKgC + 1e-9);
            const packingPerSheetC = round4(packingPerTonC / 1000 * sheetWeightKgC + 1e-9);
            const containerPerSheetC = round4(containerTonC / 1000 * sheetWeightKgC + 1e-9);
            const totalCostTax = round2(costTaxC * totalTonC + 1e-9);
            const totalCostNoTax = round2(costNoTaxC * totalTonC + 1e-9);
            return {
              success: true,
              calcMode: 'custom',
              detail: {
                calcMode: 'custom',
                origin: item.origin || '',
                stdThickness: item.stdThickness || '', inspectFlag: !!item.inspectFlag, quantity: qtyNum,
                material: material, surface: item.surface || '', normSurface: baseSurface, thickness: thicknessRaw || String(thickness), width: width, length: String(length),
                weight: totalTonC, film1: film1, film2: film2, basePrice: basePrice,
                isYanYan: isYanYan, hasLinen: !!hasLinen,
                density: density, sqmPerTon: round2(sqmPerTon),
                thickSurcharge: thickSurcharge, thickTable: getThickTableName(isYanYan, material, item.origin, baseSurface),
                surfaceFeeSqm: (typeof surfaceRaw === 'object' && surfaceRaw.needConvert) ? surfaceRaw.sqmPrice : (typeof surfaceRaw === 'number' ? null : 0),
                colorFeeSqm: colorFeeSqm, colorName: colorName, colorBaseSqm: colorBaseSqm, colorMult: colorMult,
                surfaceFeePerTon: round2(surfTonC),
                linenFeePerTon: linenFeePerTon,
                embossFees: embossFees.map(function (e) { return { key: e.key, name: e.name, unit: e.unit || 'ton', feePerTon: e.feePerTon || 0, feePerSqm: e.feePerSqm || 0 }; }),
                afpFeeSqm: afpSqmFee, afpPerTon: afpPerTon,
                film1FeeSqm: film1Fee || 0, film1PerTon: film1PerTon,
                film2FeeSqm: film2Fee || 0, film2PerTon: film2PerTon,
                inspectFeeSqm: (parseFloat(item.inspect) > 0 ? parseFloat(item.inspect) : 0), inspectPerTon: inspectTonC,
                costRaw: round2(costTaxRawC), costNoTaxRaw: round2(costNoTaxRawC), materialNoTaxRaw: round2((basePrice + thickSurcharge) * 0.92),
                costTax: costTaxC, costNoTax: costNoTaxC,
                edgeType: edgeType, boardType: 'sheet', markup: 0, widthSurcharge: widthSurcharge, packing: packingNameTxt,
                markupDetail: null,
                saleTax: costTaxC, saleNoTax: costNoTaxC,
                custom: {
                  quantity: qtyNum, totalTon: totalTonC, sheetArea: sheetAreaC, sheetWeightKg: sheetWeightKgC,
                  packingTotal: packingTotalRmb, packingName: packingNameTxt,
                  packingPerTon: packingPerTonC, packingPerSheet: packingPerSheetC,
                  containerPerTon: containerTonC, containerPerSheet: containerPerSheetC,
                  edgePerTon: edgeTonC, surfacePerTon: surfTonC, surfaceAutoPerTon: autoSurfTonC,
                  filmPerTon: filmTonC, filmAutoPerTon: autoFilmTonC, otherPerTon: otherTonC,
                  sheetCostTax: sheetCostTax, sheetCostNoTax: sheetCostNoTax,
                  totalCostTax: totalCostTax, totalCostNoTax: totalCostNoTax
                }
              }
            };
          }
        }
      }
    }


    // ---- 单张计算逻辑（2026-08-24 用户规则）：按张卖，输出 元/张 ----
    // 公式：(基价+厚度加价+边部费用)/1000 × 体积m³ × 密度g/cm³ × 1000 + 面积×单张加工费 + 面积×膜价
    let sheetResult = null;
    // v1.0.145 喷砂打底规则放宽：任意单张8K系列即可（含颜色组合，如 单张普磨8K钛铝红铜+喷砂）
    if (embossFees.some(e => e.key === 'sandblast')) {
      if (!isSheet8kSurface(baseSurface)) errors.push('喷砂仅支持单张8K系列打底（如 单张普磨8K+喷砂 / 单张高普8K黑钛金+喷砂，仅限单张加工）');
    }
    if (calcMode === 'sheet') {
      if (boardType !== 'sheet') errors.push('单张计算逻辑仅适用于平板（按张数销售的板材）');
      if (!SHEET_MODE_SURFACES.includes(baseSurface)) errors.push('单张计算逻辑目前仅支持 2B 与五种单张8K（当前表面：' + baseSurface + '）');
      if (typeof surfaceRaw === 'number' && surfaceRaw > 0) errors.push('单张计算逻辑需要按面积计价的表面加工费（当前表面按吨计价）');
      // v1.0.145 喷砂打底规则放宽：任意单张8K系列即可
      if (embossFees.some(e => e.key === 'sandblast') && !isSheet8kSurface(baseSurface)) {
        errors.push('喷砂仅支持单张8K系列打底（如 单张普磨8K+喷砂 / 单张高普8K黑钛金+喷砂，仅限单张加工）');
      }
      const packingName106 = item.packing != null ? String(item.packing).trim() : '';
      if (!SHEET_PACKING_FEES[packingName106]) errors.push('单张计价需选择包装方式（木架/出口木箱/密封木箱/出口铁架/出口铁箱）');
      const edgeFee = getEdgeFee(material, edgeType, width);
      if (edgeFee === null) errors.push('材质/边部类型无匹配边部费用（单张计算逻辑）');
      if (errors.length === 0) {
        const L = parseFloat(length);
        const sheetArea = round4(width * L / 1e6);                 // ㎡
        const sheetVolume = round6(width * L * thickness / 1e9);   // m³
        const sheetWeightKg = round3(sheetVolume * density * 1000); // kg
        // v1.0.77（2026-08-24 用户规则）：单张不含税 = 基价×0.93，其余不变
        const sheetMaterialCostRaw = (basePrice * 0.93 + thickSurcharge + edgeFee) / 1000 * sheetVolume * density * 1000;
        const surfSqm = (typeof surfaceRaw === 'object' && surfaceRaw.needConvert) ? surfaceRaw.sqmPrice : 0;
        const sheetSurfaceCostRaw = sheetArea * surfSqm + sheetArea * (colorFeeSqm || 0);
        const filmSqm1 = film1Fee || 0;
        const filmSqm2 = film2Fee || 0;
        const sheetFilmCostRaw = sheetArea * (filmSqm1 + filmSqm2);
        // v1.0.120 压花工艺：吨项按单张重量折算；平方项（6WL/喷砂）按单张面积
        let embossPerSheet = 0;
        embossFees.forEach(e => {
          if (e.unit === 'sqm') embossPerSheet += (e.feePerSqm || 0) * sheetArea;
          else embossPerSheet += (e.feePerTon || 0) / 1000 * sheetWeightKg;
        });
        embossPerSheet = round3(embossPerSheet + 1e-9);
        // v1.0.135 全检费（仅平板）：勾选后按 元/方 × 单张面积；卷板(weight)不计算
        const inspectFeeSqm = (parseFloat(item.inspect) > 0) ? parseFloat(item.inspect) : 0;
        const inspectPerSheet = round3(inspectFeeSqm * sheetArea + 1e-9);
        // 先求和再统一四舍五入（+epsilon 抵消浮点误差，2026-08-24：用户例 77.795 → 77.8）
        const sheetPrice = round2(sheetMaterialCostRaw + sheetSurfaceCostRaw + sheetFilmCostRaw + embossPerSheet + inspectPerSheet + 1e-9);
        const qty = (item.quantity != null && parseFloat(item.quantity) > 0) ? parseFloat(item.quantity) : 1;
        const sheetPriceTax = round2(sheetPrice / 0.91 + 1e-9);
        // v1.0.106（2026-08-25 用户规则）：单张均摊 = 包装(元/吨÷1000=元/kg×kg) + 装柜(50元/吨) + FOB/CIF(美元×汇率=元/吨)
        const packFeePerTon = SHEET_PACKING_FEES[packingName106] || 0;
        const packingPerSheet = round3(packFeePerTon / 1000 * sheetWeightKg + 1e-9);
        const containerPerSheet = round3(SHEET_CONTAINER_FEE / 1000 * sheetWeightKg + 1e-9);
        const term106 = item.term === 'FOB' ? 'FOB' : (item.term === 'CIF' ? 'CIF' : null);
        const termUsd106 = term106 === 'FOB' ? (parseFloat(item.fobUsd) > 0 ? parseFloat(item.fobUsd) : 0) : (term106 === 'CIF' ? (parseFloat(item.cifUsd) > 0 ? parseFloat(item.cifUsd) : 0) : 0);
        const usdRate106 = parseFloat(item.usdRate) > 0 ? parseFloat(item.usdRate) : 0;
        const termPerTon106 = round2(termUsd106 * usdRate106 + 1e-9);
        const termPerSheet = round3(termPerTon106 / 1000 * sheetWeightKg + 1e-9);
        const extraPerSheet = round2(packingPerSheet + containerPerSheet + termPerSheet + 1e-9);
        const sheetSaleNoTax = round2(sheetPrice + extraPerSheet + 1e-9);
        const sheetSaleTax = round2(sheetSaleNoTax / 0.91 + 1e-9);
        sheetResult = { edgeFee, sheetArea, sheetVolume, sheetWeightKg, sheetMaterialCost: round2(sheetMaterialCostRaw + 1e-9), sheetSurfaceCost: round2(sheetSurfaceCostRaw + 1e-9), sheetFilmCost: round2(sheetFilmCostRaw + 1e-9), embossPerSheet, inspectFeeSqm, inspectPerSheet, sheetPrice, sheetPriceTax, packingFee: packFeePerTon, packingName: packingName106, packingPerSheet, containerPerSheet, term: term106 || '', termUsd: termUsd106, usdRate: usdRate106, termPerTon: termPerTon106, termPerSheet, extraPerSheet, sheetSaleNoTax, sheetSaleTax, quantity: qty, sheetTotal: round2(sheetPrice * qty + 1e-9), sheetTotalTax: round2(sheetPriceTax * qty + 1e-9), sheetTotalSaleNoTax: round2(sheetSaleNoTax * qty + 1e-9), sheetTotalSaleTax: round2(sheetSaleTax * qty + 1e-9) };
      }
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    // v1.0.145 喷砂打底规则放宽：任意单张8K系列即可
    if (embossFees.some(e => e.key === 'sandblast')) {
      if (!isSheet8kSurface(baseSurface)) errors.push('喷砂仅支持单张8K系列打底（如 单张普磨8K+喷砂 / 单张高普8K黑钛金+喷砂，仅限单张加工）');
    }
    if (calcMode === 'sheet') {
      return {
        success: true,
        calcMode: 'sheet',
        detail: {
    stdThickness: item.stdThickness || '', inspectFlag: !!item.inspectFlag,
          origin: item.origin || '', material, surface: item.surface || '', normSurface: baseSurface, thickness: thicknessRaw || String(thickness), width, length, film1, film2, basePrice,
          isYanYan, density, sqmPerTon: round2(sqmPerTon),
          thickSurcharge, thickTable: getThickTableName(isYanYan, material, item.origin, baseSurface),
          surfaceFeeSqm: surfSqmSafe(surfaceRaw), colorFeeSqm, colorName, colorBaseSqm, colorMult,
          surfaceFeePerTon: 0, linenFeePerTon, embossFees: embossFees.map(e => ({ key: e.key, name: e.name, unit: e.unit || 'ton', feePerTon: e.feePerTon || 0, feePerSqm: e.feePerSqm || 0 })), afpFeeSqm: 0, afpPerTon: 0,
          film1FeeSqm: film1Fee || 0, film1PerTon: 0, film2FeeSqm: film2Fee || 0, film2PerTon: 0,
          inspectFeeSqm: (sheetResult && sheetResult.inspectFeeSqm) || 0, inspectPerSheet: (sheetResult && sheetResult.inspectPerSheet) || 0,
          costRaw: null, costNoTaxRaw: null, materialNoTaxRaw: null, costTax: null, costNoTax: null,
          edgeType, boardType, markup: 0, widthSurcharge, packing, saleTax: null, saleNoTax: null,
          calcMode: 'sheet',
          edgeFee: sheetResult.edgeFee,
          sheetArea: sheetResult.sheetArea, sheetVolume: sheetResult.sheetVolume, sheetWeightKg: sheetResult.sheetWeightKg,
          sheetMaterialCost: sheetResult.sheetMaterialCost, sheetSurfaceCost: sheetResult.sheetSurfaceCost,
          sheetFilmCost: sheetResult.sheetFilmCost, sheetPrice: sheetResult.sheetPrice, sheetPriceTax: sheetResult.sheetPriceTax,
          embossPerSheet: sheetResult.embossPerSheet,
          packingFee: sheetResult.packingFee, packingName: sheetResult.packingName, packingPerSheet: sheetResult.packingPerSheet,
          containerPerSheet: sheetResult.containerPerSheet, term: sheetResult.term, termUsd: sheetResult.termUsd, usdRate: sheetResult.usdRate, termPerTon: sheetResult.termPerTon, termPerSheet: sheetResult.termPerSheet, extraPerSheet: sheetResult.extraPerSheet,
          sheetSaleNoTax: sheetResult.sheetSaleNoTax, sheetSaleTax: sheetResult.sheetSaleTax,
          quantity: sheetResult.quantity, sheetTotal: sheetResult.sheetTotal, sheetTotalTax: sheetResult.sheetTotalTax,
          sheetTotalSaleNoTax: sheetResult.sheetTotalSaleNoTax, sheetTotalSaleTax: sheetResult.sheetTotalSaleTax
        }
      };
    }

    // v1.0.140 全检费（过磅模式）：元/方 × 每吨面积（检测要求列=全检 时 item.inspect>0）
    const inspectFeeSqmW = (parseFloat(item.inspect) > 0) ? parseFloat(item.inspect) : 0;
    const inspectPerTonW = round2(inspectFeeSqmW * sqmPerTon + 1e-9);
    // 2026-09-01 用户规则：基价+厚度加价本身即含税价；其他费用（表面/压花/抗指纹/膜/全检）不含税
    // 含税成本 = (基价+厚度加价) + 其他费用÷0.92；不含税成本 = (基价+厚度加价)×0.92 + 其他费用
    const materialTaxRaw = basePrice + thickSurcharge;
    const otherFeesRaw = round2(surfaceFeePerTon + linenFeePerTon + afpPerTon + film1PerTon + film2PerTon + inspectPerTonW);
    const subtotal = round2(materialTaxRaw + otherFeesRaw);           // 全加（原口径，保留）
    const taxExcluded = round2(materialTaxRaw * 0.92 + otherFeesRaw); // 不含税成本小计
    const costTaxRaw = round2(materialTaxRaw + otherFeesRaw / 0.92);  // 含税成本小计
    const costTax = round10(costTaxRaw);
    const costNoTax = round10(taxExcluded);
    const markupKey = `${edgeType}_${boardType}`;
    let markup = SALES_MARKUP[markupKey];
    let markupDetail = null;
    // v1.0.98 (2026-08-25 user rule): coil sales markup = edge fee + packing fee + container fee
    if (boardType === 'coil') {
      const coilInfo = getCoilMarkupInfo(material, width);
      if (coilInfo) { markup = coilInfo.total; markupDetail = coilInfo; }
    }
    // 平板销售加价细分（2026-08-22 用户规则，出口木架基准）：
    // 1219/1240 按 材质组×宽度×长度区间（2100-2500/3000-4000）；1030/1000 按 材质组×宽度×长度区间（1001-2000/2001-4000）
    // v1.0.105：平板命中细分时构造组成 = 边部加价 + 木架100 + 包装50 + 加工损耗50（出口木架基准固定 200，边部=总价-200）
    let usedSheetDetail = false;
    if (boardType === 'sheet') {
      const detailKey = getSheetMarkupKey(material, width, length);
      if (detailKey && SHEET_MARKUP_DETAIL[detailKey] != null) {
        markup = SHEET_MARKUP_DETAIL[detailKey];
        usedSheetDetail = true;
        markupDetail = {
          group: 'sheet',
          label: sheetMarkupLabel(detailKey),
          edgeFee: markup - 200,
          rackFee: (packing && SHEET_PACKING_FEES[packing]) ? SHEET_PACKING_FEES[packing] : 100, packFee: 50, lossFee: 50,
          total: (markup - 200) + ((packing && SHEET_PACKING_FEES[packing]) ? SHEET_PACKING_FEES[packing] : 100) + 100,
          rackLabel: packing || '木架',
        };
      }
      // 未命中细分（非细分宽度/材质组或区间外）：沿用旧加价（rough_sheet=300 / trim_sheet=500）
    }
    // 包装档位销售加价（v1.0.107 用户规则）：出口木箱=木架+50 / 密封木箱=木架+150 / 出口铁架=木架+100 / 出口铁箱=木架+150（卷板不受影响）
    if (boardType === 'sheet' && packing && SHEET_PACKING_FEES[packing] && SHEET_PACKING_FEES[packing] !== 100) {
      markup += SHEET_PACKING_FEES[packing] - 100;
    }
    // 1000mm 宽度特殊加价：仅对未命中 1000 细分表的材质生效（命中细分的已含明确价格，2026-08-22）
    if (width === 1000 && !usedSheetDetail && !markupDetail) {
      markup += 200;
    }
    const saleTax = round10(costTax + markup);
    const materialNoTaxRaw = round2((basePrice + thickSurcharge) * 0.92);
    const saleNoTax = round10(materialNoTaxRaw + surfaceFeePerTon + linenFeePerTon + afpPerTon + film1PerTon + film2PerTon + inspectPerTonW + markup);

    // 重量：只读取导入数据（客户填写的吨数），不自动计算
    const weight = item.weight ? parseFloat(item.weight) : null;

    return {
      success: true,
      detail: {
        origin: item.origin || '',
    // v1.0.139 导出报价单 18 列需要：标厚/检测要求/件数 透传
    stdThickness: item.stdThickness || '', inspectFlag: !!item.inspectFlag, quantity: (item.quantity != null && item.quantity !== '') ? item.quantity : '',
        material, surface: item.surface || '', normSurface: baseSurface, thickness: thicknessRaw || String(thickness), width, length, weight, film1, film2, basePrice,
        isYanYan, hasLinen: !!hasLinen,
        density, sqmPerTon: round2(sqmPerTon),
        thickSurcharge, thickTable: getThickTableName(isYanYan, material, item.origin, baseSurface),
        surfaceFeeSqm: (typeof surfaceRaw === 'object' && surfaceRaw.needConvert) ? surfaceRaw.sqmPrice : (typeof surfaceRaw === 'number' ? null : 0),
        colorFeeSqm, colorName, colorBaseSqm, colorMult,
        surfaceFeePerTon: round2(surfaceFeePerTon),
        linenFeePerTon,
        embossFees: embossFees.map(e => ({ key: e.key, name: e.name, unit: e.unit || 'ton', feePerTon: e.feePerTon || 0, feePerSqm: e.feePerSqm || 0 })),
        afpFeeSqm: afpSqmFee, afpPerTon,
        film1FeeSqm: film1Fee || 0, film1PerTon,
        film2FeeSqm: film2Fee || 0, film2PerTon,
    inspectFeeSqm: inspectFeeSqmW, inspectPerTon: inspectPerTonW,
        costRaw: round2(costTaxRaw), costNoTaxRaw: round2(taxExcluded), materialNoTaxRaw: round2(materialNoTaxRaw),
        costTax, costNoTax,
        edgeType, boardType, markup, widthSurcharge, packing,
        markupDetail: markupDetail ? { group: markupDetail.group, label: markupDetail.label, edgeFee: markupDetail.edgeFee, packingFee: markupDetail.packingFee, containerFee: markupDetail.containerFee, rackFee: markupDetail.rackFee, packFee: markupDetail.packFee, lossFee: markupDetail.lossFee, total: markupDetail.total, rackLabel: markupDetail.rackLabel } : null,
        saleTax, saleNoTax
      }
    };
  }

  // v1.0.105: sheet markup detail key -> readable width/edge label
  function sheetMarkupLabel(detailKey) {
    const map = {
      'std_1240': '1240毛边', 'std_1219': '1219齐边', 'std_1030': '1030毛边', 'std_1000': '1000齐边',
      '410430_1280': '1280毛边(410/430)', '410430_1250': '1250齐边(410/430)',
      '304_1280': '1280毛边(304)', '304_1250': '1250齐边(304)',
      'std_1530': '1530毛边', 'std_1500': '1500齐边',
      '316l_1240': '1240毛边(316L)', '316l_1219': '1219齐边(316L)', '316l_1030': '1030毛边(316L)', '316l_1000': '1000齐边(316L)',
      '316l_1280': '1280毛边(316L)', '316l_1250': '1250齐边(316L)', '316l_1530': '1530毛边(316L)', '316l_1500': '1500齐边(316L)'
    };
    const base = detailKey.replace(/_(s|l)$/, '');
    return map[base] || detailKey;
  }

  // v1.0.98 (2026-08-25 user rule): coil sales markup lookup by width
  function getCoilMarkupInfo(material, width) {
    const w = parseFloat(width);
    if (!w || !Number.isFinite(w)) return null;
    const is316 = material && /^316L/.test(material);
    const table = is316 && COIL_MARKUP_DETAIL_316L.length ? COIL_MARKUP_DETAIL_316L : COIL_MARKUP_DETAIL;
    for (const row of table) {
      if (row.widths.indexOf(w) !== -1) return row;
    }
    return null;
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
      return '316L 加价（未提供数据）';
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
    const materialPatterns = ['201J5', '201J4', '201J1', '201J3', '201J2', '201', '304', '316L', '410S/BA', '410S/2BA', '410S/2BA(非标)', '410S/2BA非标', '430B/BA', '430B/2BA', '430/BA', '430/2BA', '430W/2BA', '430W/2BB', '410S', '430B', '410', '430'];
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

    // 包装方式（2026-08-22 用户规则）：自由文本识别；v1.0.106 单张支持 5 种（长词优先）
    let packing = null;
    if (/密封木箱/.test(remaining)) packing = '密封木箱';
    else if (/出口铁架/.test(remaining)) packing = '出口铁架';
    else if (/出口铁箱/.test(remaining)) packing = '出口铁箱';
    else if (/出口木箱|木箱/.test(remaining)) packing = '出口木箱';
    else if (/木架/.test(remaining)) packing = '木架';
    if (packing) remaining = remaining.replace(/密封木箱|出口铁架|出口铁箱|木箱|木架/g, ' ').trim();

    // 根据材质 + 压延 计算基价
    let basePrice = 0;
    if (basePriceMap && material) {
      const key = isYanYan ? material + '压延' : material;
      basePrice = basePriceMap[key] || basePriceMap[material] || 0;
    }

    return {
      origin, material, surface: normalizeSurface(surface) || surface,
      thickness, width, length, film1, film2, basePrice, isYanYan, packing
    };
  }

  // 人民币 → 美元换算（rate100 = 每100美元的人民币买入价，如 670.97 → 1美元=6.7097）
  function cnToUsd(cny, rate100) {
    const r = parseFloat(rate100);
    if (!(r > 0)) return null;
    const v = parseFloat(cny);
    if (isNaN(v)) return null;
    return v * 100 / r;
  }

  // 美元加价加到人民币价格上（FOB/CIF 术语）：加价单位 USD/吨，按汇率折人民币
  // 返回 { cny, usd }；cny = 原人民币价 + 加价×汇率；usd = 原美元价 + 加价
  function addUsdSurcharge(cny, usdSurcharge, rate100) {
    const r = parseFloat(rate100);
    const s = parseFloat(usdSurcharge);
    const c = parseFloat(cny);
    if (!(r > 0) || isNaN(c)) return null;
    const s2 = isNaN(s) ? 0 : s;
    const cny2 = c + s2 * r / 100;
    return { cny: cny2, usd: cny2 * 100 / r };
  }

  // 附加费用（公司运营费/资金占用利息/利润）：均人民币/吨，勾选(on)才计入，直接加到人民币价上
  // extras = { opFee:{on,val}, interest:{on,val}, profit:{on,val} }
  function addExtras(cny, extras) {
    const c = parseFloat(cny);
    if (isNaN(c)) return null;
    const e = extras || {};
    let total = 0;
    for (const k of ['opFee', 'interest', 'profit']) {
      const it = e[k];
      if (it && it.on) {
        const v = parseFloat(it.val);
        if (!isNaN(v) && v > 0) total += v;
      }
    }
    return { cny: c + total, extra: total };
  }

  // 总价（按吨数）：人民币单价×吨数 求和；美元 = 人民币总价/汇率；count = 有重量且>0 的行数
  function calcTotal(cnyPrices, weights, rate100) {
    const r = parseFloat(rate100);
    if (!(r > 0)) return null;
    let cny = 0, count = 0;
    for (let i = 0; i < (cnyPrices || []).length; i++) {
      const c = parseFloat(cnyPrices[i]);
      if (isNaN(c)) continue;
      const w = parseFloat(weights && weights[i]);
      if (!isNaN(w) && w > 0) { cny += c * w; count++; }
    }
    return { cny: cny, usd: cny * 100 / r, count: count };
  }

  return {
    calculate, calculateBatch, parseSpec, parseFreeText,
    normalizeSurface, normalizeFilm, getDensity, getEdgeType, cnToUsd, addUsdSurcharge, addExtras, calcTotal,
    parseThicknessRange,
    getThicknessSurcharge, getSurfaceFee, getFilmFee, getSquareMetersPerTon, getSheetMarkupKey, getEdgeFee, getCoilMarkupInfo, matchEmboss, splitEmboss,
    setUserOverrides,
    DENSITY, THICKNESS_SURCHARGE, THICKNESS_SURCHARGE_304, YANYAN_THICKNESS_SURCHARGE,
    ORIGIN_THICKNESS_SURCHARGE, ORIGIN_THICKNESS_SURCHARGE_304, ORIGIN_THICKNESS_SURCHARGE_316L,
    SURFACE_FEES, SURFACE_FEES_304, FILM_FEES, SALES_MARKUP, COIL_MARKUP_DETAIL, COIL_MARKUP_DETAIL_316L, MATERIAL_OFFSETS, THICKNESS_SURCHARGE_400,
    SHEET_MARKUP_DETAIL, SHEET_LENGTH_BANDS, SHEET_LENGTH_BANDS_NARROW, SHEET_LENGTH_BANDS_WIDE, PACKING_OPTIONS, PACKING_WOODEN_BOX_SURCHARGE,
    SHEET_PACKING_FEES, SHEET_CONTAINER_FEE,
    WIDTH_BANDS_201, WIDTH_TO_BAND_201, MATERIALS_201, BEIGANG, getWidthBand201, isMaterial201,
    THICK_BANDS_1500, THICK_BANDS_1500_LABELS, getThickBand1500,
    EDGE_FEES, SHEET_MODE_SURFACES
  };
})();
