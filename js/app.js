/**
 * KK不锈钢报价系统 - 主应用逻辑
 */
const App = (() => {
  let dataItems = [];
  let results = [];
  let allExpanded = false;

  // 美金汇率状态（中国银行美元现汇买入价，每 100 美元的人民币）
  // live 来自 rate.json（GitHub Actions 定时抓中行官网）；manual 为用户手动覆盖（localStorage）
  let rateState = { live: null, liveTime: null, liveSource: null, manual: null };
  // 贸易术语状态：EXW 默认；FOB/CIF 加价（USD/吨）手动填写，持久化
  let termState = { term: 'EXW', fobUsd: 0, cifUsd: 0 };
  // 附加费用（人民币/吨，勾选生效）：公司运营费 / 资金占用利息 / 利润
  let extrasState = {
    opFee: { on: false, val: 0 },
    interest: { on: false, val: 0 },
    profit: { on: false, val: 0 }
  };
  const EXTRA_KEYS = { opFee: 'kk_extra_opfee', interest: 'kk_extra_interest', profit: 'kk_extra_profit' };

  // 各产地 201 基价（新结构：产地 → 4 个宽度档 × J1/J2/J3/J4）
  // { 产地: { b1: {201J1,201J2,201J3,201J4}, b2: {...}, b3: {...}, b4: {...} } }
  let originPrices = {};
  let originOrder = [...ORIGIN_PRESETS];
  let lockedOrigins = {};
  const ORIGINS_201 = ['宏旺'];
  // 304 产地顺序（2026-08-20 用户指定）：德龙、宏旺、上克、甬金、张浦、太钢
  const ORIGINS_304 = ['德龙', '宏旺', '上克', '甬金', '张浦', '太钢'];
  // 各产地 J2 基价 (304)
  let originPrices304 = {};
  let lockedOrigins304 = {};
  // 各产地 316L 基价（仅已配置数据的产地）
  const ORIGINS_316L = ['甬金', '张浦', '太钢'];
  let originPrices316L = {};
  let lockedOrigins316L = {};
  // v1.0.96 五尺（1500/1524/1530mm）基价：仅部分产地提供
  let fiveFootPrices304 = {};
  let fiveFootPrices316L = {};
  let fiveFootPrices400 = {};
  let lockedFiveFoot304 = {};
  let lockedFiveFoot316L = {};
  let lockedFiveFoot400 = {};
  // 北港 J5 基价（北港只卖 J5，单独一行填写，不分宽度）
  let beigangJ5Price = 0;
  let beigangJ5Locked = false;

  // 201 基价空结构
  function emptyBandPrices() { return { '201J1': 0, '201J2': 0, '201J3': 0, '201J4': 0 }; }
  // 1500/1530 宽板：按厚度分档的空结构（J4 暂不支持）
  function emptyThickPrices(mat) {
    const m = mat || '201J1';
    const keys = (PricingEngine.THICK_BANDS_1500_LABELS && PricingEngine.THICK_BANDS_1500_LABELS[m]) ? PricingEngine.THICK_BANDS_1500_LABELS[m].map((_, i) => 't' + (i + 1)) : ['t1','t2','t3','t4','t5','t6'];
    const o = {};
    keys.forEach(k => { o[k] = 0; });
    return o;
  }
  function emptyOrigin201() {
    return {
      b1: emptyBandPrices(), b2: emptyBandPrices(), b3: emptyBandPrices(),
      b4: {
        '201J1': emptyThickPrices('201J1'),
        '201J2': emptyThickPrices('201J2'),
        '201J3': emptyThickPrices('201J3')
      }
    };
  }
  // 400系基价（按材质+表面）
  let prices400 = {};
  let lockedPrices400 = {};
  const PRODUCTS_400 = [
    // 410 系列
    { origin: '甬金', material: '410S/BA' },
    { origin: '上克', material: '410S/BA' },
    { origin: '宏旺', material: '410S/2BA' },
    { origin: '瑞钢', material: '410S/2BA' },
    { origin: '瑞钢', material: '410S/2BA(非标)' },
    // 430 系列
    { origin: '甬金', material: '430B/BA' },
    { origin: '甬金', material: '430/BA' },
    { origin: '上克', material: '430B/BA' },
    { origin: '上克', material: '430/BA' },
    { origin: '宏旺', material: '430W/2BA' },
    { origin: '宏旺', material: '430W/2BB' },
    { origin: '瑞钢', material: '430B/2BA' },
  ];
  // 400系面板分组渲染（2026-08-20 用户指定：410/430 分板块；产地顺序 甬金→上克→宏旺→瑞钢）
  const PRODUCTS_400_GROUPS = [
    {
      title: '410 系列',
      items: [
        { origin: '甬金', material: '410S/BA' },
        { origin: '上克', material: '410S/BA' },
        { origin: '宏旺', material: '410S/2BA' },
        { origin: '瑞钢', material: '410S/2BA' },
        { origin: '瑞钢', material: '410S/2BA(非标)' },
      ]
    },
    {
      title: '430 系列',
      items: [
        { origin: '甬金', material: '430B/BA' },
        { origin: '甬金', material: '430/BA' },
        { origin: '上克', material: '430B/BA' },
        { origin: '上克', material: '430/BA' },
        { origin: '宏旺', material: '430W/2BA' },
        { origin: '宏旺', material: '430W/2BB' },
        { origin: '瑞钢', material: '430B/2BA' },
      ]
    }
  ];
  // 400系材质名标准化：Excel中的"非标"可能没有括号
  function normalize400Material(m) {
    return (m || '').replace(/\(?非标\)?/g, '(非标)').replace(/（非标）/g, '(非标)');
  }

  // 用户自定义价格覆盖（保护膜、表面加工费等）
  let priceOverrides = { filmFees: {}, surfaceFees: {}, surfaceTiers: {}, filmLocked: {}, surfaceLocked: {} };

  // ========== 基价计算 ==========
  function isFiveFootWidth(width) {
    const w = parseFloat(width);
    return w === 1500 || w === 1524 || w === 1530;
  }

  function getMaterialPrice(origin, material, surface, width, thickness) {
    // 400系：查独立基价表（按产地+材质），410S/BA 是一个整体材质名
    if (origin && material) {
      const normMat = normalize400Material(material);
      if (PRODUCTS_400.some(p => p.origin === origin && p.material === normMat)) {
        const key = origin + '-' + normMat;
        // v1.0.96 五尺（1500/1524/1530mm）：仅宏旺410S/2BA、宏旺430W/2BA 提供
        if (isFiveFootWidth(width)) {
          if (FIVE_FOOT_ORIGINS['400'].includes(key)) {
            const p = fiveFootPrices400[key];
            return (p && p > 0) ? p : null;
          }
          return null;
        }
        return prices400[key] || null;
      }
    }
    if (material === '304' || material.startsWith('304')) {
      if (isFiveFootWidth(width)) {
        if (FIVE_FOOT_ORIGINS['304'].includes(origin)) {
          const p = fiveFootPrices304[origin];
          return (p && p > 0) ? p : null;
        }
        return null;
      }
      const p = originPrices304[origin];
      return (p && p > 0) ? p : null;
    }
    if (material === '316L') {
      if (isFiveFootWidth(width)) {
        if (FIVE_FOOT_ORIGINS['316L'].includes(origin)) {
          const p = fiveFootPrices316L[origin];
          return (p && p > 0) ? p : null;
        }
        return null;
      }
      const p = originPrices316L[origin];
      return (p && p > 0) ? p : null;
    }
    // 201 系：按 产地 → 宽度档 → 材质(J1/J2/J3/J4) 取基价；J5 仅北港，不分宽度
    const is201 = material === '201' || (material && /^201J[1-5]$/.test(material));
    if (is201) {
      if (material === '201J5') {
        return (beigangJ5Price > 0) ? beigangJ5Price : null;
      }
      const w = parseFloat(width);
      const band = WIDTH_TO_BAND_201[w];
      if (band === undefined || band === null) return null; // 宽度不在档
      const matKey = material === '201' ? '201J2' : material;
      const prices = originPrices[origin] || {};
      if (band === 4) {
        // 1500/1530 宽板：按 材质 → 厚度档位 取基价（J4 暂不支持）
        if (matKey === '201J4') return null;
        const tk = PricingEngine.getThickBand1500(matKey, thickness);
        if (tk === null) return null; // 厚度不在档位
        const b4 = prices.b4 || {};
        const m = b4[matKey] || {};
        const v = m[tk];
        return (v && v > 0) ? v : null;
      }
      const b = prices['b' + band] || {};
      const v = b[matKey];
      return (v && v > 0) ? v : null;
    }
    return null;
  }

  // ========== DOM Cache ==========
  const els = {};
  function dom(id) { return document.getElementById(id); }

  function init() {
    // Initialize origin prices
    originOrder.forEach(o => { originPrices[o] = emptyOrigin201(); });
    originPrices['宏旺'].b2['201J2'] = 7800; // default（1219/1240 档）
    originOrder.forEach(o => { originPrices304[o] = 0; });
    originOrder.forEach(o => { originPrices316L[o] = 0; });
    loadLockedPrices(); // 恢复已锁定的价格（201 + 304 + 316L）
    loadPrices400();    // 恢复400系基价
    loadPriceOverrides(); // 恢复保护膜/表面加工费覆盖
    PricingEngine.setUserOverrides(priceOverrides); // 注入引擎

    cacheDom();
    initUsdRate();
    initTradeTerm();
    initExtras();
    bindEvents();
    renderOriginGrid();
    renderFilmConfig();
    renderSurfaceConfig();
    renderSheetSurfaceConfig();
    renderPriceReference();
    // 更新版本号
    const vb = document.getElementById('versionBadge');
    if (vb && typeof APP_VERSION !== 'undefined') vb.textContent = 'v' + APP_VERSION;
    const fv = document.getElementById('footerVersion');
    if (fv && typeof APP_VERSION !== 'undefined') fv.textContent = 'v' + APP_VERSION;
    initChangelog();
    updateAllDerived();
    render();
    initPriceSync(); // v1.0.119 基价云端同步（拉取老板发布的最新基价）
    initFilmSync(); // v1.0.124 保护膜价云端同步（拉取老板发布的最新膜价）
    initSurfaceSync('surfaces', 'surfacePublishBar', 'surfaceStatusText', 'publishSurfaceBtn', '📢 发布当前表面加工价格'); // v1.0.127 表面加工价一键发布
    initSurfaceSync('sheetSurfaces', 'sheetSurfacePublishBar', 'sheetSurfaceStatusText', 'publishSheetSurfaceBtn', '📢 发布当前单张加工价格'); // v1.0.127 单张加工价一键发布
  }

  // ===== 更新公告 v1.0.111 =====
  function initChangelog() {
    const btn = dom('changelogBtn');
    const overlay = dom('changelogOverlay');
    if (!btn || !overlay || typeof CHANGELOG === 'undefined' || !CHANGELOG.length) return;
    btn.addEventListener('click', openChangelog);
    dom('changelogClose').addEventListener('click', closeChangelog);
    dom('changelogOk').addEventListener('click', () => {
      try { localStorage.setItem('kk_last_seen_version', CHANGELOG[0].v); } catch (e) {}
      closeChangelog();
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) closeChangelog(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeChangelog(); });
    // 新版本（或新用户）自动弹出
    let seen = null;
    try { seen = localStorage.getItem('kk_last_seen_version'); } catch (e) {}
    if (seen !== CHANGELOG[0].v) openChangelog();
  }

  function openChangelog() {
    const overlay = dom('changelogOverlay');
    const body = dom('changelogBody');
    if (!overlay || !body) return;
    // v1.0.113 用户规则：按「近两天」过滤（今天+昨天，按公告日期），不再固定条数
    const dayCut = new Date();
    dayCut.setDate(dayCut.getDate() - 1);
    dayCut.setHours(0, 0, 0, 0);
    let show = CHANGELOG.filter(cc => {
      const d = new Date(cc.date + 'T00:00:00');
      return !isNaN(d.getTime()) && d >= dayCut;
    });
    // 过滤为空时的缩底：显示最新一条
    if (!show.length) show = CHANGELOG.slice(0, 1);
    let h = '';
    show.forEach((c, i) => {
      const items = c.items.map(it => '<li>' + it + '</li>').join('');
      if (i === 0) {
        h += '<div class="changelog-item changelog-first">' +
          '<div class="changelog-ver">v' + c.v + ' <span class="changelog-date">' + c.date + '</span>' + (isNewChangelog() ? '<span class="changelog-tag">新</span>' : '') + '</div>' +
          '<div class="changelog-item-title">' + c.title + '</div>' +
          '<ul>' + items + '</ul>' +
          '</div>';
      } else {
        h += '<details class="changelog-item"><summary>' +
          '<span class="changelog-ver">v' + c.v + '</span> <span class="changelog-date">' + c.date + '</span> <span class="changelog-item-title">' + c.title + '</span>' +
          '</summary><ul>' + items + '</ul></details>';
      }
    });
    h += '<div class="changelog-hint">显示近两天的更新公告共 ' + show.length + ' 条（更新频繁，只保留最近两天）</div>';
    body.innerHTML = h;
    overlay.style.display = 'flex';
  }

  function closeChangelog() {
    const overlay = dom('changelogOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  function isNewChangelog() {
    let seen = null;
    try { seen = localStorage.getItem('kk_last_seen_version'); } catch (e) {}
    return seen !== CHANGELOG[0].v;
  }

  function cacheDom() {
    els.calcBtn = dom('calculateBtn'); els.expBtn = dom('exportBtn'); els.expBtn2 = dom('exportBtn2');
    els.clearBtn = dom('clearBtn'); els.addBtn = dom('addManualBtn');
    els.fileInput = dom('fileInput'); els.tBody = dom('resultBody');
    els.emptyState = dom('emptyState'); els.resultCard = dom('resultCard');
    els.totalC = dom('totalCount'); els.okC = dom('successCount'); els.errC = dom('errorCount');
    els.minP = dom('minSaleTax'); els.maxP = dom('maxSaleTax');
    els.freeText = dom('freeText'); els.parseTextBtn = dom('parseTextBtn');
    els.calcModeSheet = dom('calcModeSheet');
    els.thSaleTax = dom('thSaleTax'); els.thSaleNoTax = dom('thSaleNoTax');
    els.thWeight = dom('thWeight'); els.thCostTax = dom('thCostTax'); els.thCostNoTax = dom('thCostNoTax');
    els.rateBar = dom('rateBar'); els.rateLive = dom('rateLive'); els.rateManual = dom('rateManual'); els.rateReset = dom('rateReset');
    els.termBar = dom('termBar'); els.termRadios = document.querySelectorAll('input[name="tradeTerm"]');
    els.fobSurcharge = dom('fobSurcharge'); els.cifSurcharge = dom('cifSurcharge');
    els.extrasBar = dom('extrasBar');
    els.totalBar = dom('totalBar'); els.totalValue = dom('totalValue');
    els.extraItems = { opFee: { on: dom('opFeeOn'), val: dom('opFeeVal'), item: null },
                      interest: { on: dom('interestOn'), val: dom('interestVal'), item: null },
                      profit: { on: dom('profitOn'), val: dom('profitVal'), item: null } };
    els.extraItems.opFee.item = els.extraItems.opFee.on.closest('.extra-item');
    els.extraItems.interest.item = els.extraItems.interest.on.closest('.extra-item');
    els.extraItems.profit.item = els.extraItems.profit.on.closest('.extra-item');
    els.originRows201 = dom('originRows201'); els.originRows304 = dom('originRows304');
    els.originRows316L = dom('originRows316L');
    els.newOriginInput = dom('newOriginInput');
    els.addOriginBtn = dom('addOriginBtn'); els.expandAllBtn = dom('expandAllBtn');
  }

  function bindEvents() {
    els.calcBtn.addEventListener('click', runCalc);
    els.expBtn.addEventListener('click', exportResults);
    els.expBtn2.addEventListener('click', exportResults);
    els.clearBtn.addEventListener('click', clearAll);
    els.addBtn.addEventListener('click', addManual);
    // v1.0.122 压花工艺勾选 ↔ 表面输入联动（小珠光 linen / 小方格 square，各 +300元/吨）
    const embossCbs = { linen: dom('manualEmbossLinen'), square: dom('manualEmbossSquare') };
    const surfInput = dom('manualSurface');
    if (surfInput) {
      const embossMatch = {
        linen: (x) => /^linen$/i.test(x) || /小珠光/.test(x),
        square: (x) => /^square(\s+embossed)?$/i.test(x) || /小方格/.test(x)
      };
      const stripSeg = (v, key) => v.split('+').map(x => x.trim()).filter(x => {
        if (!x) return false;
        return !embossMatch[key](x);
      }).join('+');
      Object.keys(embossCbs).forEach(key => {
        const cb = embossCbs[key];
        if (!cb) return;
        cb.addEventListener('change', () => {
          let v = (surfInput.value || '').trim();
          if (cb.checked) {
            const b = stripSeg(v, key);
            surfInput.value = b ? b + '+' + key : key;
          } else {
            surfInput.value = stripSeg(v, key);
          }
        });
      });
      surfInput.addEventListener('input', () => {
        const v = surfInput.value || '';
        Object.keys(embossCbs).forEach(key => {
          const cb = embossCbs[key];
          if (!cb) return;
          cb.checked = v.split('+').some(x => embossMatch[key](x.trim()));
        });
      });
    }
    els.fileInput.addEventListener('change', handleFile);
    els.parseTextBtn.addEventListener('click', parseText);
    els.addOriginBtn.addEventListener('click', addOrigin);
    els.expandAllBtn.addEventListener('click', toggleAllExpand);

    // 美金汇率：手动覆盖 + 恢复实时
    els.rateManual.addEventListener('input', () => {
      const v = parseFloat(els.rateManual.value);
      if (!isNaN(v) && v > 0) {
        rateState.manual = v;
        try { localStorage.setItem(USD_RATE_KEY_MANUAL, String(v)); } catch (e) {}
      } else {
        rateState.manual = null;
        try { localStorage.removeItem(USD_RATE_KEY_MANUAL); } catch (e) {}
      }
      renderRateBar(); render();
    });
    els.rateReset.addEventListener('click', () => {
      rateState.manual = null;
      els.rateManual.value = '';
      try { localStorage.removeItem(USD_RATE_KEY_MANUAL); } catch (e) {}
      renderRateBar(); render();
      showToast('已恢复实时汇率', 'info');
    });

    // 贸易术语：EXW/FOB/CIF 单选 + FOB/CIF 美元加价
    els.termRadios.forEach(r => r.addEventListener('change', () => {
      if (!r.checked) return;
      termState.term = r.value;
      try { localStorage.setItem(TERM_KEY, r.value); } catch (e) {}
      render();
    }));
    els.fobSurcharge.addEventListener('input', () => {
      const v = parseFloat(els.fobSurcharge.value);
      termState.fobUsd = (!isNaN(v) && v >= 0) ? v : 0;
      try { localStorage.setItem(TERM_KEY_FOB, String(termState.fobUsd)); } catch (e) {}
      render();
    });
    els.cifSurcharge.addEventListener('input', () => {
      const v = parseFloat(els.cifSurcharge.value);
      termState.cifUsd = (!isNaN(v) && v >= 0) ? v : 0;
      try { localStorage.setItem(TERM_KEY_CIF, String(termState.cifUsd)); } catch (e) {}
      render();
    });

    // 附加费用：勾选生效 + 金额输入（人民币/吨）
    ['opFee', 'interest', 'profit'].forEach(k => {
      const it = els.extraItems[k];
      it.on.addEventListener('change', () => {
        extrasState[k].on = it.on.checked;
        it.val.disabled = !it.on.checked;
        it.item.classList.toggle('disabled', !it.on.checked);
        try { localStorage.setItem(EXTRA_KEYS[k], JSON.stringify(extrasState[k])); } catch (e) {}
        render();
      });
      it.val.addEventListener('input', () => {
        const v = parseFloat(it.val.value);
        extrasState[k].val = (!isNaN(v) && v > 0) ? v : 0;
        try { localStorage.setItem(EXTRA_KEYS[k], JSON.stringify(extrasState[k])); } catch (e) {}
        render();
      });
    });

    // 价格参数配置选项卡切换
    document.querySelectorAll('.config-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.config-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.config-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = document.querySelector(`.config-panel[data-config="${btn.dataset.config}"]`);
        if (panel) panel.classList.add('active');
        // 渲染对应面板
        if (btn.dataset.config === 'films') renderFilmConfig();
        if (btn.dataset.config === 'surfaces') renderSurfaceConfig();
        if (btn.dataset.config === 'sheetSurfaces') renderSheetSurfaceConfig();
        if (btn.dataset.config === 'reference') renderPriceReference();
        if (btn.dataset.config === 'coilMarkup') renderCoilMarkupConfig();
      });
    });

    dom('manualOrigin')?.addEventListener('change', () => {
      updateManualDropdown();
      dom('manualMaterial')?.focus();
    });

    // 手动添加表单：Enter 跳转下一个字段，最后一个字段 Enter 直接添加
    const manualFields = ['manualOrigin', 'manualMaterial', 'manualSurface', 'manualThickness', 'manualWidth', 'manualLength', 'manualFilm1', 'manualFilm2'];
    manualFields.forEach((id, i) => {
      const el = dom(id);
      if (!el) return;
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (i < manualFields.length - 1) {
            const next = dom(manualFields[i + 1]);
            if (next) { next.focus(); if (typeof next.select === 'function') next.select(); }
          } else {
            addManual();
          }
        }
      });
    });
  }

  // ========== 产地价格管理 ==========
  function renderOriginGrid() {
    renderOriginGrid201();
    renderOriginGrid304();
    renderOriginGrid316L();
    renderPrices400();
  }

  function renderOriginGrid201() {
    els.originRows201.innerHTML = '';
    ORIGINS_201.forEach(origin => {
      const prices = originPrices[origin] || emptyOrigin201();
      originPrices[origin] = prices;
      const locked = !!lockedOrigins[origin];
      const div = document.createElement('div');
      div.className = 'origin-block-201';
      // 表头行：产地 + 锁定 + 3 个宽度档标签（1500/1530 已拆为独立版块）
      let html = `
        <div class="origin-row origin-head201">
          <span class="oname201">${origin}</span>
          <span class="oband201">1219/1240</span>
          <span class="oband201">1250/1280</span>
          <button class="o-lock ${locked ? 'locked' : ''}" data-origin="${origin}" data-mat="201" title="${locked ? '点击解锁' : '点击锁定'}">${locked ? '🔒' : '🔓'}</button>
        </div>`;
      ['201J1','201J2','201J3','201J4'].forEach(mat => {
        html += `
        <div class="origin-row origin-row-201">
          <span class="omat201">${mat.replace('201','')}</span>
          ${[2,3].map(b => `<input type="number" class="origin201-input" data-origin="${origin}" data-band="${b}" data-mat="${mat}" value="${prices['b'+b][mat] > 0 ? prices['b'+b][mat] : ''}" step="10" placeholder="未填" ${locked ? 'readonly' : ''}>`).join('')}
        </div>`;
      });
      div.innerHTML = html;
      els.originRows201.appendChild(div);

      // 1500/1530 宽板独立版块（按厚度分基价；J4 暂不支持；仅宏旺）
      const thickLabels = (PricingEngine.THICK_BANDS_1500_LABELS) || {};
      if (origin === '宏旺' && Object.keys(thickLabels).length) {
        const tb = document.createElement('div');
        tb.className = 'origin-block-201 thick-block-1500';
        const b4 = (originPrices['宏旺'].b4) || {};
        let th = `
          <div class="origin-row origin-head201 thick-head1500">
            <span class="oname201">宏旺 201 · 1500/1530 宽板</span>
            <span class="oband201 thick-note">按厚度分基价（元/吨）</span>
          </div>`;
        Object.entries(thickLabels).forEach(([mat, arr]) => {
          const mp = (b4[mat]) || {};
          th += `
          <div class="origin-row origin-row-201 thick-row-1500">
            <span class="omat201">${mat.replace('201','')}</span>
            ${arr.map((lab, i) => {
              const tk = 't' + (i + 1);
              return `<div class="thick-cell"><span class="thick-label">${lab}</span><input type="number" class="origin201-thick-input" data-origin="${origin}" data-mat="${mat}" data-thick="${tk}" value="${mp[tk] > 0 ? mp[tk] : ''}" step="10" placeholder="未填" ${locked ? 'readonly' : ''}></div>`;
            }).join('')}
          </div>`;
        });
        tb.innerHTML = th;
        els.originRows201.appendChild(tb);
      }
    });
    bindOrigin201Inputs();
    document.querySelectorAll('.o-lock[data-mat="201"]').forEach(btn => {
      btn.addEventListener('click', () => {
        lockedOrigins[btn.dataset.origin] = !lockedOrigins[btn.dataset.origin];
        saveLockedPrices();
        renderOriginGrid201();
      });
    });

    // 北港 J5 行：与宏旺 201 矩阵同一面板，外观与其他产地行一致
    const bg = document.createElement('div');
    bg.className = 'origin-row';
    bg.innerHTML = `
      <span class="oname">北港</span>
      <div class="oj2"><label>J5</label><input type="number" id="beigangJ5Price" class="origin-j2-input" value="${beigangJ5Price > 0 ? beigangJ5Price : ''}" step="10" placeholder="未填" ${beigangJ5Locked ? 'readonly' : ''}></div>
      <button id="beigangJ5Lock" class="o-lock ${beigangJ5Locked ? 'locked' : ''}" title="${beigangJ5Locked ? '点击解锁' : '点击锁定'}">${beigangJ5Locked ? '🔒' : '🔓'}</button>
      <span class="oderived" style="margin-left:auto;font-size:11px;color:var(--text-muted);">北港只售 J5，不分宽度</span>
    `;
    els.originRows201.appendChild(bg);
    const bgInp = bg.querySelector('#beigangJ5Price');
    const bgLock = bg.querySelector('#beigangJ5Lock');
    if (bgInp) {
      bgInp.addEventListener('input', () => {
        beigangJ5Price = parseFloat(bgInp.value) || 0;
      });
      bgInp.addEventListener('blur', () => {
        beigangJ5Price = parseFloat(bgInp.value) || 0;
        saveBeigangJ5();
      });
    }
    if (bgLock) {
      bgLock.addEventListener('click', () => {
        beigangJ5Locked = !beigangJ5Locked;
        saveBeigangJ5();
        renderOriginGrid201();
      });
    }

    updateManualDropdown();
  }

  function bindOrigin201Inputs() {
    document.querySelectorAll('.origin201-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const o = inp.dataset.origin, b = inp.dataset.band, m = inp.dataset.mat;
        if (!originPrices[o]) originPrices[o] = emptyOrigin201();
        if (!originPrices[o]['b'+b]) originPrices[o]['b'+b] = emptyBandPrices();
        originPrices[o]['b'+b][m] = parseFloat(inp.value) || 0;
        updateAllDerived();
      });
      inp.addEventListener('blur', () => {
        const o = inp.dataset.origin, b = inp.dataset.band, m = inp.dataset.mat;
        if (!originPrices[o]) originPrices[o] = emptyOrigin201();
        if (!originPrices[o]['b'+b]) originPrices[o]['b'+b] = emptyBandPrices();
        originPrices[o]['b'+b][m] = parseFloat(inp.value) || 0;
        saveLockedPrices();
      });
    });
    // 1500/1530 宽板厚度档输入（b4 按 材质 → 厚度档 存储）
    document.querySelectorAll('.origin201-thick-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const o = inp.dataset.origin, m = inp.dataset.mat, tk = inp.dataset.thick;
        if (!originPrices[o]) originPrices[o] = emptyOrigin201();
        if (!originPrices[o].b4) originPrices[o].b4 = emptyOrigin201().b4;
        if (!originPrices[o].b4[m]) originPrices[o].b4[m] = {};
        originPrices[o].b4[m][tk] = parseFloat(inp.value) || 0;
        updateAllDerived();
      });
      inp.addEventListener('blur', () => {
        const o = inp.dataset.origin, m = inp.dataset.mat, tk = inp.dataset.thick;
        if (!originPrices[o]) originPrices[o] = emptyOrigin201();
        if (!originPrices[o].b4) originPrices[o].b4 = emptyOrigin201().b4;
        if (!originPrices[o].b4[m]) originPrices[o].b4[m] = {};
        originPrices[o].b4[m][tk] = parseFloat(inp.value) || 0;
        saveLockedPrices();
      });
    });
  }

  function renderOriginGrid304() {
    els.originRows304.innerHTML = '';
    ORIGINS_304.forEach(origin => {
      const price304 = originPrices304[origin] || 0;
      const locked304 = !!lockedOrigins304[origin];
      const div = document.createElement('div');
      div.className = 'origin-row';
      div.innerHTML = `
        <span class="oname" style="min-width:56px">${origin}</span>
        <div class="oj2" style="width:90px"><label>304</label><input type="number" class="origin-304-input" data-origin="${origin}" value="${price304 || ''}" step="10" placeholder="未填" style="width:70px;font-size:13px;" ${locked304 ? 'readonly' : ''}></div>
        <button class="o-lock ${locked304 ? 'locked' : ''}" style="padding:0 2px;font-size:11px" data-origin="${origin}" data-mat="304" title="${locked304 ? '点击解锁' : '点击锁定'}">${locked304 ? '🔒' : '🔓'}</button>
        ${FIVE_FOOT_ORIGINS['304'].includes(origin) ? `
        <div class="oj2" style="width:90px"><label>五尺</label><input type="number" class="origin-304-ff-input" data-origin="${origin}" value="${fiveFootPrices304[origin] || ''}" step="10" placeholder="未填" style="width:70px;font-size:13px;" ${lockedFiveFoot304[origin] ? 'readonly' : ''}></div>
        <button class="o-lock ${lockedFiveFoot304[origin] ? 'locked' : ''}" style="padding:0 2px;font-size:11px" data-origin="${origin}" data-mat="304" data-ff="1" title="${lockedFiveFoot304[origin] ? '点击解锁' : '点击锁定'}">${lockedFiveFoot304[origin] ? '🔒' : '🔓'}</button>` : ''}
        <span class="oderived" style="margin-left:4px;font-size:12px;color:var(--text-secondary);">
          ${price304 > 0 ? `基价: <b>${price304.toLocaleString()}</b>` : '<span class="oderived-hint">请填写基价</span>'}
        </span>
      `;
      els.originRows304.appendChild(div);
    });
    bindOriginInputs('.origin-304-input', originPrices304);
    bindOriginInputs('.origin-304-ff-input', fiveFootPrices304);
    document.querySelectorAll('.o-lock[data-mat="304"][data-ff="1"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const o = btn.dataset.origin;
        lockedFiveFoot304[o] = !lockedFiveFoot304[o];
        saveLockedPrices();
        renderOriginGrid304();
      });
    });
    document.querySelectorAll('.o-lock[data-mat="304"]:not([data-ff])').forEach(btn => {
      btn.addEventListener('click', () => {
        lockedOrigins304[btn.dataset.origin] = !lockedOrigins304[btn.dataset.origin];
        saveLockedPrices();
        renderOriginGrid304();
      });
    });
  }

  function renderOriginGrid316L() {
    if (!els.originRows316L) return;
    els.originRows316L.innerHTML = '';
    ORIGINS_316L.forEach(origin => {
      const price316L = originPrices316L[origin] || 0;
      const locked316L = !!lockedOrigins316L[origin];
      const div = document.createElement('div');
      div.className = 'origin-row';
      div.innerHTML = `
        <span class="oname" style="min-width:56px">${origin}</span>
        <div class="oj2" style="width:90px"><label>316L</label><input type="number" class="origin-316L-input" data-origin="${origin}" value="${price316L || ''}" step="10" placeholder="未填" style="width:70px;font-size:13px;" ${locked316L ? 'readonly' : ''}></div>
        <button class="o-lock ${locked316L ? 'locked' : ''}" style="padding:0 2px;font-size:11px" data-origin="${origin}" data-mat="316L" title="${locked316L ? '点击解锁' : '点击锁定'}">${locked316L ? '🔒' : '🔓'}</button>
        ${FIVE_FOOT_ORIGINS['316L'].includes(origin) ? `
        <div class="oj2" style="width:90px"><label>五尺</label><input type="number" class="origin-316L-ff-input" data-origin="${origin}" value="${fiveFootPrices316L[origin] || ''}" step="10" placeholder="未填" style="width:70px;font-size:13px;" ${lockedFiveFoot316L[origin] ? 'readonly' : ''}></div>
        <button class="o-lock ${lockedFiveFoot316L[origin] ? 'locked' : ''}" style="padding:0 2px;font-size:11px" data-origin="${origin}" data-mat="316L" data-ff="1" title="${lockedFiveFoot316L[origin] ? '点击解锁' : '点击锁定'}">${lockedFiveFoot316L[origin] ? '🔒' : '🔓'}</button>` : ''}
        <span class="oderived" style="margin-left:4px;font-size:12px;color:var(--text-secondary);">
          ${price316L > 0 ? `基价: <b>${price316L.toLocaleString()}</b>` : '<span class="oderived-hint">请填写基价</span>'}
        </span>
      `;
      els.originRows316L.appendChild(div);
    });
    bindOriginInputs('.origin-316L-input', originPrices316L);
    bindOriginInputs('.origin-316L-ff-input', fiveFootPrices316L);
    document.querySelectorAll('.o-lock[data-mat="316L"][data-ff="1"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const o = btn.dataset.origin;
        lockedFiveFoot316L[o] = !lockedFiveFoot316L[o];
        saveLockedPrices();
        renderOriginGrid316L();
      });
    });
    document.querySelectorAll('.o-lock[data-mat="316L"]:not([data-ff])').forEach(btn => {
      btn.addEventListener('click', () => {
        lockedOrigins316L[btn.dataset.origin] = !lockedOrigins316L[btn.dataset.origin];
        saveLockedPrices();
        renderOriginGrid316L();
      });
    });
  }

  function updateAllDerived() {
    // 201 区域 J1/J3/J4 已改为完全手动填写；北港 J5 直接显示在输入框内，无需额外刷新（避免重建 DOM 丢失焦点）
  }

  function bindOriginInputs(selector, priceMap) {
    const inputs = document.querySelectorAll(selector);
    inputs.forEach(inp => {
      inp.addEventListener('input', () => {
        priceMap[inp.dataset.origin] = parseFloat(inp.value) || 0;
        if (selector === '.origin-j2-input') updateAllDerived();
        else saveLockedPrices();
      });
      inp.addEventListener('blur', () => {
        priceMap[inp.dataset.origin] = parseFloat(inp.value) || 0;
        saveLockedPrices();
        if (selector === '.origin-j2-input') {
          renderOriginGrid201();
        }
      });
    });
  }

  function updateManualDropdown() {
    const sel = dom('manualOrigin');
    const display = dom('manualPriceDisplay');
    if (!sel) return;
    sel.innerHTML = originOrder.map(o => `<option value="${o}">${o}</option>`).join('');
    if (display) {
      const o = sel.value;
      const prices = originPrices[o];
      let hasAny = false;
      if (prices) for (const bk of Object.keys(prices)) for (const mk of Object.keys(prices[bk])) if (prices[bk][mk] > 0) { hasAny = true; break; }
      if (hasAny) {
        const j2b2 = (prices.b2 && prices.b2['201J2'] > 0) ? prices.b2['201J2'].toLocaleString() : '未填';
        display.innerHTML = `201 基价按宽度档填写 · 1219/1240档 J2 = <b>${j2b2}</b>`;
        display.style.color = 'var(--text-secondary)';
      } else {
        display.textContent = '⚠️ 该产地未设置 201 基价';
        display.style.color = 'var(--danger)';
      }
    }
  }

  function addOrigin() {
    const name = els.newOriginInput.value.trim();
    if (!name) { showToast('请输入产地名称', 'error'); return; }
    if (originOrder.includes(name)) { showToast('该产地已存在', 'error'); return; }
    originOrder.push(name);
    originPrices[name] = emptyOrigin201();
    originPrices304[name] = 0;
    originPrices316L[name] = 0;
    // 添加到 304 列表
    if (!ORIGINS_304.includes(name)) ORIGINS_304.push(name);
    els.newOriginInput.value = '';
    renderOriginGrid();
    showToast(`已添加产地: ${name}`, 'success');
  }

  // ========== 锁定价格持久化 ==========
  function saveLockedPrices() {
    try {
      const data = {};
      for (const [o, p] of Object.entries(originPrices)) {
        if (lockedOrigins[o]) {
          // 保存兗底：确保 b4（宽板厚度档）结构存在，避免旧结构覆盖导致宽板价格丢失
          if (p && (!p.b4 || typeof p.b4 !== 'object')) p.b4 = emptyOrigin201().b4;
          data[o] = p;
        }
      }
      localStorage.setItem('kk_locked_prices', JSON.stringify(data));
      // 304 locked prices
      const data304 = {};
      for (const [o, p] of Object.entries(originPrices304)) {
        if (lockedOrigins304[o]) data304[o] = p;
      }
      localStorage.setItem('kk_locked_prices_304', JSON.stringify(data304));
      // 316L locked prices
      const data316L = {};
      for (const [o, p] of Object.entries(originPrices316L)) {
        if (lockedOrigins316L[o]) data316L[o] = p;
      }
      localStorage.setItem('kk_locked_prices_316L', JSON.stringify(data316L));
      // 304/316L 五尺锁定价
      const data304ff = {};
      for (const [o, p] of Object.entries(fiveFootPrices304)) { if (lockedFiveFoot304[o]) data304ff[o] = p; }
      localStorage.setItem('kk_locked_prices_304_ff', JSON.stringify(data304ff));
      const data316Lff = {};
      for (const [o, p] of Object.entries(fiveFootPrices316L)) { if (lockedFiveFoot316L[o]) data316Lff[o] = p; }
      localStorage.setItem('kk_locked_prices_316L_ff', JSON.stringify(data316Lff));
      saveBeigangJ5();
    } catch (e) { /* ignore */ }
  }

  function saveBeigangJ5() {
    try { localStorage.setItem('kk_beigang_j5', JSON.stringify({ price: beigangJ5Price, locked: beigangJ5Locked })); } catch (e) { /* ignore */ }
  }

  function loadLockedPrices() {
    try {
      const raw = localStorage.getItem('kk_locked_prices');
      if (raw) {
        const data = JSON.parse(raw);
        for (const [o, v] of Object.entries(data)) {
          if (originPrices.hasOwnProperty(o) || originOrder.includes(o)) {
            if (typeof v === 'number') {
              // 旧格式迁移：单值基价 → 1219/1240 档的 J2
              if (!originPrices[o]) originPrices[o] = emptyOrigin201();
              if (v > 0) originPrices[o].b2['201J2'] = v;
            } else if (v && typeof v === 'object') {
              // 补全 b4（1500/1530 宽板厚度档）结构：旧版本（v1.0.10 前）锁定的数据没有 b4，
              // 若不补全会导致宽板价格显示空白且 locked 时无法填写
              const base = emptyOrigin201();
              if (!v.b4 || typeof v.b4 !== 'object') v.b4 = base.b4;
              for (const mk of Object.keys(base.b4)) {
                if (!v.b4[mk] || typeof v.b4[mk] !== 'object') v.b4[mk] = base.b4[mk];
                else for (const tk of Object.keys(base.b4[mk])) {
                  if (v.b4[mk][tk] === undefined) v.b4[mk][tk] = 0;
                }
              }
              originPrices[o] = v;
            }
            lockedOrigins[o] = true;
          }
        }
      }
    } catch (e) { /* ignore */ }
    try {
      const j5raw = localStorage.getItem('kk_beigang_j5');
      if (j5raw) {
        const j5 = JSON.parse(j5raw);
        if (j5 && typeof j5.price === 'number') {
          beigangJ5Price = j5.price;
          beigangJ5Locked = !!j5.locked;
        }
      }
    } catch (e) { /* ignore */ }
    try {
      try {
      const raw304ff = localStorage.getItem('kk_locked_prices_304_ff');
      if (raw304ff) {
        const d = JSON.parse(raw304ff);
        for (const [o, p] of Object.entries(d)) { fiveFootPrices304[o] = p; lockedFiveFoot304[o] = true; }
      }
    } catch (e) { /* ignore */ }
    const raw304 = localStorage.getItem('kk_locked_prices_304');
      if (!raw304) return;
      const data304 = JSON.parse(raw304);
      for (const [o, p] of Object.entries(data304)) {
        if (originPrices304.hasOwnProperty(o) || originOrder.includes(o)) {
          originPrices304[o] = p;
          lockedOrigins304[o] = true;
        }
      }
    } catch (e) { /* ignore */ }
    try {
      try {
      const raw316Lff = localStorage.getItem('kk_locked_prices_316L_ff');
      if (raw316Lff) {
        const d = JSON.parse(raw316Lff);
        for (const [o, p] of Object.entries(d)) { fiveFootPrices316L[o] = p; lockedFiveFoot316L[o] = true; }
      }
    } catch (e) { /* ignore */ }
    const raw316L = localStorage.getItem('kk_locked_prices_316L');
      if (raw316L) {
        const data316L = JSON.parse(raw316L);
        for (const [o, p] of Object.entries(data316L)) {
          if (originPrices316L.hasOwnProperty(o) || originOrder.includes(o)) {
            originPrices316L[o] = p;
            lockedOrigins316L[o] = true;
          }
        }
      }
    } catch (e) { /* ignore */ }
  }

  // ========== 基价云端同步 v1.0.119（老板/管理员发布，全员自动同步） ==========
  function collectBasePrices() {
    return {
      originPrices: originPrices,
      originPrices304: originPrices304,
      originPrices316L: originPrices316L,
      fiveFootPrices304: fiveFootPrices304,
      fiveFootPrices316L: fiveFootPrices316L,
      fiveFootPrices400: fiveFootPrices400,
      beigangJ5Price: beigangJ5Price,
      prices400: prices400
    };
  }
  function countBasePrices() {
    let n = 0;
    const cnt = (o) => {
      if (o && typeof o === 'object') {
        for (const k of Object.keys(o)) {
          const v = o[k];
          if (typeof v === 'number' && v > 0) n++;
          else if (v && typeof v === 'object') cnt(v);
        }
      }
    };
    cnt(originPrices); cnt(originPrices304); cnt(originPrices316L);
    cnt(fiveFootPrices304); cnt(fiveFootPrices316L); cnt(fiveFootPrices400);
    cnt(prices400);
    if (beigangJ5Price > 0) n++;
    return n;
  }
  function clearLocalLocked() {
    try {
      ['kk_locked_prices','kk_locked_prices_304','kk_locked_prices_316L','kk_locked_prices_304_ff','kk_locked_prices_316L_ff','kk_beigang_j5','kk_prices_400','kk_prices_400_ff']
        .forEach(k => localStorage.removeItem(k));
    } catch (e) { /* ignore */ }
  }
  function applyBasePrices(p) {
    if (!p || typeof p !== 'object') return false;
    let changed = false;
    if (p.originPrices && typeof p.originPrices === 'object') {
      for (const [o, v] of Object.entries(p.originPrices)) {
        if (v && typeof v === 'object' && (originPrices.hasOwnProperty(o) || originOrder.includes(o))) {
          originPrices[o] = v; lockedOrigins[o] = false; changed = true;
        }
      }
    }
    if (p.originPrices304 && typeof p.originPrices304 === 'object') {
      for (const [o, v] of Object.entries(p.originPrices304)) {
        if (originPrices304.hasOwnProperty(o) || originOrder.includes(o)) { originPrices304[o] = v; lockedOrigins304[o] = false; changed = true; }
      }
    }
    if (p.originPrices316L && typeof p.originPrices316L === 'object') {
      for (const [o, v] of Object.entries(p.originPrices316L)) {
        if (originPrices316L.hasOwnProperty(o) || originOrder.includes(o)) { originPrices316L[o] = v; lockedOrigins316L[o] = false; changed = true; }
      }
    }
    if (p.fiveFootPrices304 && typeof p.fiveFootPrices304 === 'object') { for (const [o, v] of Object.entries(p.fiveFootPrices304)) { fiveFootPrices304[o] = v; lockedFiveFoot304[o] = false; changed = true; } }
    if (p.fiveFootPrices316L && typeof p.fiveFootPrices316L === 'object') { for (const [o, v] of Object.entries(p.fiveFootPrices316L)) { fiveFootPrices316L[o] = v; lockedFiveFoot316L[o] = false; changed = true; } }
    if (p.fiveFootPrices400 && typeof p.fiveFootPrices400 === 'object') { for (const [k, v] of Object.entries(p.fiveFootPrices400)) { fiveFootPrices400[k] = v; lockedFiveFoot400[k] = false; changed = true; } }
    if (p.prices400 && typeof p.prices400 === 'object') { for (const [k, v] of Object.entries(p.prices400)) { prices400[k] = v; lockedPrices400[k] = false; changed = true; } }
    if (typeof p.beigangJ5Price === 'number') { beigangJ5Price = p.beigangJ5Price; beigangJ5Locked = false; changed = true; }
    return changed;
  }
  function fmtSyncTime(t) { return t ? String(t).replace('T', ' ').slice(0, 16) : ''; }
  function initPriceSync() {
    const bar = dom('pricePublishBar');
    if (!bar) return;
    bar.style.display = '';
    const st = dom('publishStatusText');
    const btn = dom('publishPriceBtn');
    let auth = null;
    try { auth = window.KKAuth && KKAuth.getAuth(); } catch (e) {}
    const isAdmin = !!(auth && auth.role === 'admin');
    if (btn) btn.style.display = isAdmin ? '' : 'none';
    if (btn && !btn._bound) {
      btn._bound = true;
      btn.addEventListener('click', () => {
        const n = countBasePrices();
        if (!confirm('确认将当前页面基价发布给全体员工？\n（共 ' + n + ' 个有效基价，发布后所有员工打开页面自动生效）')) return;
        btn.disabled = true;
        btn.textContent = '发布中…';
        KKAuth.call('priceTable', { action: 'save', token: (auth && auth.token) || '', prices: collectBasePrices() }).then(r => {
          btn.disabled = false;
          btn.textContent = '📢 发布当前基价';
          if (r && r.ok) {
            showToast('已发布，全员生效', 'success');
            if (st) st.textContent = '全员基价：' + (r.updatedBy || '') + ' 发布（刚刚）';
          } else {
            showToast((r && r.msg) || '发布失败', 'error');
          }
        }).catch(() => {
          btn.disabled = false;
          btn.textContent = '📢 发布当前基价';
          showToast('发布失败：网络错误', 'error');
        });
      });
    }
    if (!window.KKAuth || !KKAuth.call) { if (st) st.textContent = '基价同步：登录后可用'; return; }
    KKAuth.call('priceTable', { action: 'get', token: (auth && auth.token) || '' }).then(r => {
      if (r && r.ok && r.data && r.data.prices) {
        if (applyBasePrices(r.data.prices)) {
          clearLocalLocked();
          renderOriginGrid();
          if (typeof updateAllDerived === 'function') updateAllDerived();
          render();
        }
        if (st) st.textContent = '全员基价：' + (r.data.updatedBy || '') + ' 发布（' + fmtSyncTime(r.data.updatedAt) + '）';
      } else {
        if (st) st.textContent = '基价同步：老板尚未发布，当前使用本地基价';
      }
    }).catch(() => {
      if (st) st.textContent = '基价同步：拉取失败，当前使用本地基价';
    });
  }
  // ========== 保护膜价云端同步 v1.0.124（老板/管理员发布，全员自动同步） ==========
  function collectFilmPrices() {
    const out = {};
    for (const [name, def] of Object.entries(FILM_FEES)) {
      const v = priceOverrides.filmFees[name] ?? def;
      if (typeof v === 'number' && v >= 0) out[name] = v;
    }
    return out;
  }
  function countFilmPrices() {
    let n = 0;
    for (const v of Object.values(collectFilmPrices())) if (v > 0) n++;
    return n;
  }
  function applyFilmPrices(p) {
    if (!p || typeof p !== 'object') return false;
    let changed = false;
    for (const [name, v] of Object.entries(p)) {
      if (FILM_FEES.hasOwnProperty(name) && typeof v === 'number' && v >= 0) {
        priceOverrides.filmFees[name] = v;
        changed = true;
      }
    }
    if (changed) {
      // 云端价优先：清掉本机膜价锁定，刷新后仍以云端价为准
      priceOverrides.filmLocked = {};
      savePriceOverrides();
      renderFilmConfig();
    }
    return changed;
  }
  function initFilmSync() {
    const bar = dom('filmPublishBar');
    if (!bar) return;
    bar.style.display = '';
    const st = dom('filmStatusText');
    const btn = dom('publishFilmBtn');
    let auth = null;
    try { auth = window.KKAuth && KKAuth.getAuth(); } catch (e) {}
    const isAdmin = !!(auth && auth.role === 'admin');
    if (btn) btn.style.display = isAdmin ? '' : 'none';
    if (btn && !btn._bound) {
      btn._bound = true;
      btn.addEventListener('click', () => {
        const n = countFilmPrices();
        if (!confirm('确认将当前页面保护膜价格发布给全体员工？\n（共 ' + n + ' 项保护膜价格，发布后所有员工打开页面自动生效）')) return;
        btn.disabled = true;
        btn.textContent = '发布中…';
        KKAuth.call('priceTable', { action: 'save', scope: 'films', token: (auth && auth.token) || '', prices: collectFilmPrices() }).then(r => {
          btn.disabled = false;
          btn.textContent = '📢 发布当前保护膜价格';
          if (r && r.ok) {
            showToast('已发布，全员生效', 'success');
            if (st) st.textContent = '全员膜价：' + (r.updatedBy || '') + ' 发布（刚刚）';
          } else {
            showToast((r && r.msg) || '发布失败', 'error');
          }
        }).catch(() => {
          btn.disabled = false;
          btn.textContent = '📢 发布当前保护膜价格';
          showToast('发布失败：网络错误', 'error');
        });
      });
    }
    if (!window.KKAuth || !KKAuth.call) { if (st) st.textContent = '保护膜同步：登录后可用'; return; }
    KKAuth.call('priceTable', { action: 'get', scope: 'films', token: (auth && auth.token) || '' }).then(r => {
      if (r && r.ok && r.data && r.data.prices) {
        if (applyFilmPrices(r.data.prices)) {
          render();
        }
        if (st) st.textContent = '全员膜价：' + (r.data.updatedBy || '') + ' 发布（' + fmtSyncTime(r.data.updatedAt) + '）';
      } else {
        if (st) st.textContent = '保护膜同步：老板尚未发布，当前使用本地膜价';
      }
    }).catch(() => {
      if (st) st.textContent = '保护膜同步：拉取失败，当前使用本地膜价';
    });
  }
  // ========== 表面加工/单张加工价云端同步 v1.0.127（老板/管理员发布，全员自动同步） ==========
  function collectSurfacePrices() {
    return { surfaceFees: priceOverrides.surfaceFees || {}, surfaceTiers: priceOverrides.surfaceTiers || {} };
  }
  function applySurfacePrices(p) {
    if (!p || typeof p !== 'object') return false;
    let changed = false;
    if (p.surfaceFees && typeof p.surfaceFees === 'object') {
      for (const [k, v] of Object.entries(p.surfaceFees)) { priceOverrides.surfaceFees[k] = v; changed = true; }
    }
    if (p.surfaceTiers && typeof p.surfaceTiers === 'object') {
      for (const [k, v] of Object.entries(p.surfaceTiers)) { priceOverrides.surfaceTiers[k] = v; changed = true; }
    }
    if (changed) {
      priceOverrides.surfaceLocked = {};
      savePriceOverrides();
      renderSurfaceConfig();
      renderSheetSurfaceConfig();
      if (typeof render === 'function') render();
    }
    return changed;
  }
  function initSurfaceSync(scope, barId, statusId, btnId, btnText) {
    const bar = dom(barId);
    if (!bar) return;
    bar.style.display = '';
    const st = dom(statusId);
    const btn = dom(btnId);
    let auth = null;
    try { auth = window.KKAuth && KKAuth.getAuth(); } catch (e) {}
    const isAdmin = !!(auth && auth.role === 'admin');
    if (btn) btn.style.display = isAdmin ? '' : 'none';
    if (btn && !btn._bound) {
      btn._bound = true;
      btn.addEventListener('click', () => {
        const prices = collectSurfacePrices();
        const n = Object.keys(prices.surfaceFees).length + Object.keys(prices.surfaceTiers).length;
        if (!confirm('确认将当前页面价格发布给全体员工？\n（共 ' + n + ' 项价格设置，发布后所有员工打开页面自动生效）')) return;
        btn.disabled = true;
        btn.textContent = '发布中…';
        KKAuth.call('priceTable', { action: 'save', scope: scope, token: (auth && auth.token) || '', prices: prices }).then(r => {
          btn.disabled = false;
          btn.textContent = btnText;
          if (r && r.ok) {
            showToast('已发布，全员生效', 'success');
            if (st) st.textContent = '全员价格：' + (r.updatedBy || '') + ' 发布（刚刚）';
          } else {
            showToast((r && r.msg) || '发布失败', 'error');
          }
        }).catch(() => {
          btn.disabled = false;
          btn.textContent = btnText;
          showToast('发布失败：网络错误', 'error');
        });
      });
    }
    if (!window.KKAuth || !KKAuth.call) { if (st) st.textContent = '价格同步：登录后可用'; return; }
    KKAuth.call('priceTable', { action: 'get', scope: scope, token: (auth && auth.token) || '' }).then(r => {
      if (r && r.ok && r.data && r.data.prices) {
        if (applySurfacePrices(r.data.prices)) {
          if (typeof render === 'function') render();
        }
        if (st) st.textContent = '全员价格：' + (r.data.updatedBy || '') + ' 发布（' + fmtSyncTime(r.data.updatedAt) + '）';
      } else {
        if (st) st.textContent = '价格同步：老板尚未发布，当前使用本地价格';
      }
    }).catch(() => {
      if (st) st.textContent = '价格同步：拉取失败，当前使用本地价格';
    });
  }
  // ========== 400系基价 ==========
  function get400Key(origin, material) { return origin + '-' + material; }

  function savePrices400() {
    try { localStorage.setItem('kk_prices_400', JSON.stringify(prices400)); localStorage.setItem('kk_prices_400_ff', JSON.stringify(fiveFootPrices400)); }
    catch (e) { /* ignore */ }
  }
  function loadPrices400() {
    try {
      try {
      const rawFF = localStorage.getItem('kk_prices_400_ff');
      if (rawFF) {
        const dataFF = JSON.parse(rawFF);
        fiveFootPrices400 = {};
        for (const [k, v] of Object.entries(dataFF)) { if (v > 0) fiveFootPrices400[k] = v; }
      } else { fiveFootPrices400 = {}; }
    } catch (e) { fiveFootPrices400 = {}; }
    const raw = localStorage.getItem('kk_prices_400');
      if (!raw) { prices400 = {}; return; }
      const data = JSON.parse(raw);
      // 旧格式数据（纯键值对）直接废弃，以新格式覆盖
      prices400 = {};
      for (const [k, v] of Object.entries(data)) {
        if (v > 0) {
          // 2026-08-21：宏旺 410S/BA 改名 410S/2BA，旧键数据迁移
          const nk = k === '宏旺-410S/BA' ? '宏旺-410S/2BA' : k;
          prices400[nk] = v;
        }
      }
    } catch (e) { prices400 = {}; }
  }
  function renderPrices400() {
    const section = document.getElementById('prices400Section');
    if (!section) return;
    // 清除旧行与板块标题（保留标题span）
    const rows = section.querySelectorAll('.p400-row, .p400-group-title');
    rows.forEach(el => el.remove());

    PRODUCTS_400_GROUPS.forEach(group => {
      const title = document.createElement('div');
      title.className = 'p400-group-title';
      title.textContent = group.title;
      section.appendChild(title);
      group.items.forEach(item => {
        const key = get400Key(item.origin, item.material);
        const val = prices400[key] || 0;
        const locked = !!lockedPrices400[key];
        const div = document.createElement('div');
        div.className = 'origin-row p400-row'; // reuse origin-row styles
        div.innerHTML = `
          <span class="oname">${item.origin}</span>
          <span class="p400-mat">${item.material}</span>
          <div class="oj2"><label>基价</label><input type="number" class="p400-input" data-key="${key}" value="${val || ''}" step="10" placeholder="未填" ${locked ? 'readonly' : ''}></div>
          <button class="o-lock ${locked ? 'locked' : ''}" data-key="${key}" title="${locked ? '解锁' : '锁定'}">${locked ? '🔒' : '🔓'}</button>
        ${FIVE_FOOT_ORIGINS['400'].includes(key) ? `
        <div class="oj2"><label>五尺</label><input type="number" class="p400-ff-input" data-key="${key}" value="${fiveFootPrices400[key] || ''}" step="10" placeholder="未填" ${lockedFiveFoot400[key] ? 'readonly' : ''}></div>
        <button class="o-lock ${lockedFiveFoot400[key] ? 'locked' : ''}" data-key="${key}" data-ff="1" title="${lockedFiveFoot400[key] ? '解锁' : '锁定'}">${lockedFiveFoot400[key] ? '🔒' : '🔓'}</button>` : ''}
        `;
        section.appendChild(div);
      });
    });
    document.querySelectorAll('.p400-input').forEach(inp => {
      inp.addEventListener('change', () => {
        const key = inp.dataset.key;
        const v = parseFloat(inp.value);
        prices400[key] = (v > 0) ? v : 0;
        if (lockedPrices400[key]) savePrices400();
      });
      inp.addEventListener('blur', () => {
        const key = inp.dataset.key;
        const v = parseFloat(inp.value);
        prices400[key] = (v > 0) ? v : 0;
        if (lockedPrices400[key]) savePrices400();
      });
    });
    document.querySelectorAll('.p400-ff-input').forEach(inp => {
      inp.addEventListener('change', () => {
        const key = inp.dataset.key;
        const v = parseFloat(inp.value);
        fiveFootPrices400[key] = (v > 0) ? v : 0;
        if (lockedFiveFoot400[key]) savePrices400();
      });
      inp.addEventListener('blur', () => {
        const key = inp.dataset.key;
        const v = parseFloat(inp.value);
        fiveFootPrices400[key] = (v > 0) ? v : 0;
        if (lockedFiveFoot400[key]) savePrices400();
      });
    });
    document.querySelectorAll('.p400-row .o-lock[data-ff="1"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        lockedFiveFoot400[key] = !lockedFiveFoot400[key];
        savePrices400();
        renderPrices400();
      });
    });
    document.querySelectorAll('.p400-row .o-lock:not([data-ff])').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        lockedPrices400[key] = !lockedPrices400[key];
        savePrices400();
        renderPrices400();
      });
    });
  }

  // ========== 价格覆盖管理 ==========
  function savePriceOverrides() {
    try { localStorage.setItem('kk_price_overrides', JSON.stringify(priceOverrides)); }
    catch (e) { /* ignore */ }
  }

  function loadPriceOverrides() {
    try {
      const raw = localStorage.getItem('kk_price_overrides');
      if (!raw) return;
      const data = JSON.parse(raw);
      priceOverrides.filmFees = data.filmFees || {};
      priceOverrides.surfaceFees = data.surfaceFees || {};
      priceOverrides.surfaceTiers = data.surfaceTiers || {};
      priceOverrides.filmLocked = data.filmLocked || {};
      priceOverrides.surfaceLocked = data.surfaceLocked || {};
    } catch (e) { /* ignore */ }
  }

  function getFilmOrder() {
    try { const o = JSON.parse(localStorage.getItem('kk_film_order') || '[]'); return Array.isArray(o) ? o : []; } catch (e) { return []; }
  }
  function saveFilmOrder(o) { try { localStorage.setItem('kk_film_order', JSON.stringify(o)); } catch (e) { /* ignore */ } }
  function renderFilmConfig() {
    const wrap = dom('filmConfigTable');
    if (!wrap) return;
    const order = getFilmOrder();
    const inOrder = order.filter(x => FILM_FEES.hasOwnProperty(x));
    const rest = Object.keys(FILM_FEES).filter(x => !inOrder.includes(x));
    const names = inOrder.concat(rest);
    let html = '<table><thead><tr><th>保护膜名称</th><th>单价(元/平米)</th><th>默认</th><th></th></tr></thead><tbody>';
    names.forEach((name, i) => {
      const defaultPrice = FILM_FEES[name];
      const val = priceOverrides.filmFees[name] ?? defaultPrice;
      const locked = !!priceOverrides.filmLocked[name];
      html += `<tr draggable="true" data-film="${name}">
        <td><span class="film-drag-handle" title="拖动调整顺序">⠿</span><span class="cfg-name">${name}</span></td>
        <td><input type="number" class="cfg-price-input film-price-inp" data-name="${name}" value="${val}" step="0.1" ${locked ? 'readonly' : ''}></td>
        <td><span class="cfg-default">${defaultPrice}</span></td>
        <td><button class="cfg-lock-btn ${locked ? 'locked' : ''}" data-name="${name}" data-type="film">${locked ? '🔒' : '🔓'}</button></td>
      </tr>`;
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
    // v1.0.128 拖拽排序（手柄/行均可拖，拖到目标行上/下半部决定插入位置）
    let dragFilm = null;
    const rows = wrap.querySelectorAll('tr[draggable="true"]');
    rows.forEach(tr => {
      tr.addEventListener('dragstart', e => {
        dragFilm = tr.dataset.film;
        tr.classList.add('dragging');
        try { e.dataTransfer.setData('text/plain', dragFilm); e.dataTransfer.effectAllowed = 'move'; } catch (err) {}
      });
      tr.addEventListener('dragend', () => {
        tr.classList.remove('dragging');
        wrap.querySelectorAll('tr').forEach(r => r.classList.remove('drop-before', 'drop-after'));
        dragFilm = null;
      });
      tr.addEventListener('dragover', e => {
        if (!dragFilm || dragFilm === tr.dataset.film) return;
        e.preventDefault();
        const rect = tr.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        wrap.querySelectorAll('tr').forEach(r => r.classList.remove('drop-before', 'drop-after'));
        tr.classList.add(before ? 'drop-before' : 'drop-after');
      });
      tr.addEventListener('dragleave', () => { tr.classList.remove('drop-before', 'drop-after'); });
      tr.addEventListener('drop', e => {
        if (!dragFilm) return;
        e.preventDefault();
        const target = tr.dataset.film;
        if (!target || target === dragFilm) return;
        const rect = tr.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        const order2 = getFilmOrder();
        const all = Object.keys(FILM_FEES);
        const ordered = order2.filter(x => all.includes(x)).concat(all.filter(x => !order2.includes(x)));
        const from = ordered.indexOf(dragFilm);
        const to = ordered.indexOf(target);
        if (from < 0 || to < 0) return;
        ordered.splice(from, 1);
        let insertAt = ordered.indexOf(target);
        if (!before) insertAt = insertAt + 1;
        ordered.splice(insertAt, 0, dragFilm);
        saveFilmOrder(ordered);
        renderFilmConfig();
      });
    });

    // 绑定输入事件
    wrap.querySelectorAll('.film-price-inp').forEach(inp => {
      inp.addEventListener('input', () => {
        const name = inp.dataset.name;
        priceOverrides.filmFees[name] = parseFloat(inp.value) || 0;
        savePriceOverrides();
      });
    });
    // 绑定锁定事件
    wrap.querySelectorAll('.cfg-lock-btn[data-type="film"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.name;
        priceOverrides.filmLocked[name] = !priceOverrides.filmLocked[name];
        savePriceOverrides();
        renderFilmConfig(); // 刷新显示
      });
    });
  }

  // 2026-08-23 用户规则：单张8K 系列按窄板/宽板分组显示（key 唯一，输入按宽度自动匹配）
  function single8kGroups(display) {
    if (!display || display.indexOf('单张') !== 0) return null;
    const cfg = SURFACE_FEES[display];
    if (!Array.isArray(cfg)) return null;
    const withIdx = cfg.map((t, i) => Object.assign({}, t, { _i: i }));
    const narrow = withIdx.filter(t => (t.wMin || 0) >= 1219 && (t.wMax || 9999) <= 1250);
    const w1000 = withIdx.filter(t => (t.wMin || 0) === 1000 && (t.wMax || 0) === 1000);
    const wide = withIdx.filter(t => (t.wMin || 0) >= 1500);
    const groups = [];
    if (w1000.length) groups.push({ label: display + '（1000）', tiers: w1000 });
    if (narrow.length) groups.push({ label: display + '（1219/1240/1250）', tiers: narrow });
    if (wide.length) groups.push({ label: display + '（1500/1524/1530）', tiers: wide });
    return groups.length ? groups : null;
  }

  // 2026-08-26 用户规则：表面加工板块按类别分组，外观对齐单张加工板块（sg-group 卡片）
  function tierLabelParts(t) {
    const thick = t.tMin + '-' + t.tMax + 'mm';
    const w = (t.wMin !== undefined && t.wMin !== null) ? '【' + (t.wMin === t.wMax ? t.wMin : t.wMin + '-' + t.wMax) + '】' : '';
    return { thick: thick, width: w };
  }
  function tierCellsHtml(tiers, names, locked) {
    const main = names.split(',')[0];
    return tiers.map((t, j) => {
      const idx = t._i !== undefined ? t._i : j;
      const ov = priceOverrides.surfaceTiers[main];
      const v = (ov && ov[idx] !== undefined) ? ov[idx] : t.price;
      const unit = t.unit === 'ton' ? '元/吨' : '元/㎡';
      const parts = tierLabelParts(t);
      const full = parts.thick + parts.width + ' ' + unit;
      return '<div class="tier-cell" title="' + full + '"><span class="tier-label">' + parts.thick + '</span>' +
        '<span class="tier-width">' + parts.width + '</span>' +
        '<span class="tier-sub">' + unit + '</span>' +
        '<input type="number" class="cfg-price-input surf-tier-inp" data-names="' + names + '" data-tier="' + idx + '" value="' + v + '" step="0.5" ' + (locked ? 'readonly' : '') + '></div>';
    }).join('');
  }
  function renderSurfaceConfig() {
    const wrap = dom('surfaceConfigTable');
    if (!wrap) return;
    const groupDefs = [
      {
        cls: 'sf-base', label: '基础表面',
        items: [
          { display: '2B', key: '2B' },
          { display: 'NO.4', key: 'NO.4' },
          { display: 'HL', key: 'HL' },
          { display: '单面抛光', key: '单面抛光' },
          { display: '双面抛光', key: '双面抛光' },
          { display: '6K', key: '6K' },
          { display: '双面6K', key: '双面6K' },
          { display: '普磨8K（卷磨）', key: '8K' },
          { display: '双面8K', key: '双面8K' }
        ]
      },
      {
        cls: 'sf-color8k', label: '8K 彩色（板）',
        items: [
          { display: '8K黄钛金(板)', key: '8K黄钛金' },
          { display: '8K黄钛金(板)/L', key: '8K黄钛金/L' },
          { display: '8K黄钛金(板)/S', key: '8K黄钛金/S' },
          { display: '8K玫瑰金(板)', key: '8K玫瑰金' },
          { display: '8K玫瑰金(板)/L', key: '8K玫瑰金/L' },
          { display: '8K玫瑰金(板)/S', key: '8K玫瑰金/S' },
          { display: '8K香槟金(板)', key: '8K香槟金' },
          { display: '8K香槟金(板)/L', key: '8K香槟金/L' },
          { display: '8K香槟金(板)/S', key: '8K香槟金/S' },
          { display: '8K黑钛金(板)', key: '8K黑钛金' },
          { display: '8K宝石蓝(板)', key: '8K宝石蓝' },
          { display: '8K紫罗兰(板)', key: '8K紫罗兰' },
          { display: '8K翡翠绿(板)', key: '8K翡翠绿' },
          { display: '8K紫红(板)', key: '8K紫红' },
          { display: '8K中国红(板)', key: '8K中国红' },
          { display: '8K古铜(板)', key: '8K古铜' }
        ]
      },
      {
        cls: 'sf-hairline', label: '砂面/拉丝（板）',
        items: [
          { display: '砂面/拉丝(NO.4/HL)黄钛金(板)', keys: ['拉丝黄钛金','磨砂黄钛金'] },
          { display: '砂面/拉丝(NO.4/HL)黄钛金(板)/L', keys: ['拉丝黄钛金/L','磨砂黄钛金/L'] },
          { display: '砂面/拉丝(NO.4/HL)黄钛金(板)/S', keys: ['拉丝黄钛金/S','磨砂黄钛金/S'] },
          { display: '砂面/拉丝(NO.4/HL)玫瑰金(板)', keys: ['拉丝玫瑰金','磨砂玫瑰金'] },
          { display: '砂面/拉丝(NO.4/HL)玫瑰金(板)/L', keys: ['拉丝玫瑰金/L','磨砂玫瑰金/L'] },
          { display: '砂面/拉丝(NO.4/HL)玫瑰金(板)/S', keys: ['拉丝玫瑰金/S','磨砂玫瑰金/S'] },
          { display: '砂面/拉丝(NO.4/HL)香槟金(板)', keys: ['拉丝香槟金','磨砂香槟金'] },
          { display: '砂面/拉丝(NO.4/HL)香槟金(板)/L', keys: ['拉丝香槟金/L','磨砂香槟金/L'] },
          { display: '砂面/拉丝(NO.4/HL)香槟金(板)/S', keys: ['拉丝香槟金/S','磨砂香槟金/S'] },
          { display: '砂面/拉丝(NO.4/HL)黑钛金(板)', keys: ['拉丝黑钛金','磨砂黑钛金'] },
          { display: '砂面/拉丝(NO.4/HL)古铜(板)', keys: ['拉丝古铜','磨砂古铜'] },
          { display: '砂面/拉丝(NO.4/HL)古铜哑光抗指纹(板)', key: '拉丝古铜哑光抗指纹' },
          { display: '砂面/拉丝(NO.4/HL)古铜亮光抗指纹(板)', key: '拉丝古铜亮光抗指纹' }
        ]
      },
      {
        cls: 'sf-afp', label: 'AFP 彩色（板）',
        items: [
          { display: '砂面/拉丝(NO.4/HL)黄钛金亮光无指纹(板)', key: '拉丝黄钛金亮光无指纹' },
          { display: '砂面/拉丝(NO.4/HL)黄钛金哑光无指纹(板)', key: '拉丝黄钛金哑光无指纹' },
          { display: '砂面/拉丝(NO.4/HL)玫瑰金亮光无指纹(板)', key: '拉丝玫瑰金亮光无指纹' },
          { display: '砂面/拉丝(NO.4/HL)玫瑰金哑光无指纹(板)', key: '拉丝玫瑰金哑光无指纹' },
          { display: '砂面/拉丝(NO.4/HL)香槟金亮光无指纹(板)', key: '拉丝香槟金亮光无指纹' },
          { display: '砂面/拉丝(NO.4/HL)香槟金哑光无指纹(板)', key: '拉丝香槟金哑光无指纹' },
          { display: '砂面/拉丝(NO.4/HL)黑钛金亮光无指纹(板)', key: '拉丝黑钛金亮光无指纹' },
          { display: '砂面/拉丝(NO.4/HL)黑钛金哑光无指纹(板)', key: '拉丝黑钛金哑光无指纹' }
        ]
      },
      {
        cls: 'sf-emboss', label: '压花工艺（附加项·元/吨）', emboss: true,
        items: [
          { display: '小珠光(linen)', key: 'linen' },
          { display: '小方格(Square embossed)', key: 'square' }
        ]
      },
      {
        cls: 'sf-coil', label: '卷材彩色表面',
        items: [
          { display: '8K黄钛金(卷)', key: '8K黄钛金(卷)' },
          { display: '8K玫瑰金(卷)', key: '8K玫瑰金(卷)' },
          { display: '8K香槟金(卷)', key: '8K香槟金(卷)' },
          { display: '8K黑钛金(卷)', key: '8K黑钛金(卷)' },
          { display: '砂面/拉丝(NO.4/HL)黄钛金(卷)', keys: ['拉丝黄钛金(卷)','磨砂黄钛金(卷)'] },
          { display: '砂面/拉丝(NO.4/HL)玫瑰金(卷)', keys: ['拉丝玫瑰金(卷)','磨砂玫瑰金(卷)'] },
          { display: '砂面/拉丝(NO.4/HL)香槟金(卷)', keys: ['拉丝香槟金(卷)','磨砂香槟金(卷)'] },
          { display: '砂面/拉丝(NO.4/HL)黑钛金(卷)', keys: ['拉丝黑钛金(卷)','磨砂黑钛金(卷)'] },
          { display: '砂面/拉丝(NO.4/HL)黄钛金亮光无指纹(卷)', key: '拉丝黄钛金亮光无指纹(卷)' },
          { display: '砂面/拉丝(NO.4/HL)黄钛金哑光无指纹(卷)', key: '拉丝黄钛金哑光无指纹(卷)' },
          { display: '砂面/拉丝(NO.4/HL)玫瑰金亮光无指纹(卷)', key: '拉丝玫瑰金亮光无指纹(卷)' },
          { display: '砂面/拉丝(NO.4/HL)玫瑰金哑光无指纹(卷)', key: '拉丝玫瑰金哑光无指纹(卷)' },
          { display: '砂面/拉丝(NO.4/HL)香槟金亮光无指纹(卷)', key: '拉丝香槟金亮光无指纹(卷)' },
          { display: '砂面/拉丝(NO.4/HL)香槟金哑光无指纹(卷)', key: '拉丝香槟金哑光无指纹(卷)' },
          { display: '砂面/拉丝(NO.4/HL)黑钛金亮光无指纹(卷)', key: '拉丝黑钛金亮光无指纹(卷)' },
          { display: '砂面/拉丝(NO.4/HL)黑钛金哑光无指纹(卷)', key: '拉丝黑钛金哑光无指纹(卷)' },
          { display: '砂面/拉丝(NO.4/HL)灰钛金哑光无指纹(卷)', key: '拉丝灰钛金哑光无指纹(卷)' },
          { display: '砂面/拉丝(NO.4/HL)古铜亮光无指纹(卷)', key: '拉丝古铜亮光无指纹(卷)' },
          { display: '砂面/拉丝(NO.4/HL)古铜哑光无指纹(卷)', key: '拉丝古铜哑光无指纹(卷)' }
        ]
      }
    ];
    let html = '';
    groupDefs.forEach(gd => {
      const rows = [];
      gd.items.forEach(item => {
        const cfgKey = item.key || item.keys[0];
        // v1.0.121 压花工艺行（EMBOSS_FEES 配置，元/吨）
        if (gd.emboss) {
          const ecfg = EMBOSS_FEES[item.key];
          if (!ecfg) return;
          const ev = priceOverrides.surfaceFees[item.key] ?? ecfg.feePerTon;
          const elock = !!priceOverrides.surfaceLocked[item.key];
          rows.push('<tr class="sf-emboss-row">' +
            '<td><span class="cfg-name">' + item.display + '</span></td>' +
            '<td class="tier-cells"><div class="tier-cell"><span class="tier-label">附加项</span><span class="tier-width"></span><span class="tier-sub">元/吨</span>' +
            '<input type="number" class="cfg-price-input surf-price-inp" data-names="' + item.key + '" value="' + ev + '" step="0.5" ' + (elock ? 'readonly' : '') + '></div></td>' +
            '<td><button class="cfg-lock-btn ' + (elock ? 'locked' : '') + '" data-names="' + item.key + '" data-type="surf">' + (elock ? '🔒' : '🔓') + '</button></td>' +
            '</tr>');
          return;
        }
        const cfg = SURFACE_FEES[cfgKey];
        if (!cfg) return;
        const names = item.key ? item.key : item.keys.join(',');
        const display = item.display;
        const rowCls = ' class="' + gd.cls + '-row"';
        if (typeof cfg === 'object' && cfg.price !== undefined && !Array.isArray(cfg)) {
          const locked = !!priceOverrides.surfaceLocked[cfgKey];
          rows.push('<tr' + rowCls + '>' +
            '<td><span class="cfg-name">' + display + '</span></td>' +
            '<td class="tier-cells">' + tierCellsHtml([{ tMin: cfg.tMin, tMax: cfg.tMax, wMin: cfg.wMin, wMax: cfg.wMax, price: cfg.price, _i: 0 }], names, locked) + '</td>' +
            '<td><button class="cfg-lock-btn ' + (locked ? 'locked' : '') + '" data-names="' + names + '" data-type="surf">' + (locked ? '🔒' : '🔓') + '</button></td>' +
            '</tr>');
        } else if (Array.isArray(cfg)) {
          const subGroups = single8kGroups(display) || [{ label: display, tiers: cfg.map((t, i) => Object.assign({}, t, { _i: i })) }];
          subGroups.forEach(g => {
            const tiers = g.tiers;
            if (!tiers || tiers.length === 0) return;
            const locked = !!priceOverrides.surfaceLocked[cfgKey];
            rows.push('<tr' + rowCls + '>' +
              '<td><span class="cfg-name">' + g.label + '</span></td>' +
              '<td class="tier-cells">' + tierCellsHtml(tiers, names, locked) + '</td>' +
              '<td><button class="cfg-lock-btn ' + (locked ? 'locked' : '') + '" data-names="' + names + '" data-type="surf">' + (locked ? '🔒' : '🔓') + '</button></td>' +
              '</tr>');
          });
        }
      });
      const unitHead = gd.emboss ? '覆盖价（元/吨）' : '各档位价格（元/平方米，可横拉）';
      html += '<div class="sg-group ' + gd.cls + '"><div class="sg-group-title">' + gd.label + '</div><table><thead><tr><th>表面加工</th><th>' + unitHead + '</th><th></th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
    });
    wrap.innerHTML = html;
    bindSurfRowEvents(wrap, renderSurfaceConfig);
  }
  function bindSurfRowEvents(wrap, rerender) {
    wrap.querySelectorAll('.surf-tier-inp').forEach(inp => {
      inp.addEventListener('input', () => {
        const names = inp.dataset.names.split(',');
        const idx = parseInt(inp.dataset.tier, 10);
        const v = parseFloat(inp.value) || 0;
        names.forEach(nm => {
          priceOverrides.surfaceTiers[nm] = priceOverrides.surfaceTiers[nm] || {};
          priceOverrides.surfaceTiers[nm][idx] = v;
        });
        savePriceOverrides();
      });
    });
    wrap.querySelectorAll('.surf-price-inp').forEach(inp => {
      inp.addEventListener('input', () => {
        const names = inp.dataset.names.split(',');
        const v = parseFloat(inp.value) || 0;
        names.forEach(n => { priceOverrides.surfaceFees[n] = v; });
        savePriceOverrides();
      });
    });
    wrap.querySelectorAll('.cfg-lock-btn[data-type="surf"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const names = btn.dataset.names.split(',');
        const locked = !priceOverrides.surfaceLocked[names[0]];
        names.forEach(n => { priceOverrides.surfaceLocked[n] = locked; });
        savePriceOverrides();
        if (typeof rerender === 'function') rerender(); else renderSurfaceConfig();
      });
    });
    // 2026-08-24 v1.0.89：单张高普8K 彩色行箭头展开/收起
    wrap.querySelectorAll('.cfg-expand').forEach(btn => {
      btn.addEventListener('click', () => {
        const g = btn.dataset.group;
        const q = btn.dataset.owner;
        const rows = wrap.querySelectorAll('.sg-color-row[data-group="' + g + '"][data-owner="' + q + '"]');
        const open = btn.textContent === '▼';
        rows.forEach(r => { r.style.display = open ? 'none' : ''; });
        btn.textContent = open ? '▶' : '▼';
      });
    });
  }

  // 2026-08-24 用户规则：单张加工单价独立板块，按宽度档分组，三组颜色区分
  function renderSheetSurfaceConfig() {
    const wrap = dom('sheetSurfaceConfigTable');
    if (!wrap) return;
    // v1.0.94 用户规则：单张砂面NO.4/单张拉丝HL 合并一行（价格永远一致，覆盖价同步），1250 单独一行区分
    // v1.0.95：砂面/拉丝合并行排每个宽度档第一位
    const qualities = ['单张砂面NO.4', '单张普磨8K', '单张拉丝HL', '单张高普8K', '单张普精8K', '单张精磨8K', '单张超精8K'];
    const colorGroups = {
      '单张高普8K': ['单张高普8K黄钛金', '单张高普8K玫瑰金', '单张高普8K香槟金', '单张高普8K黑钛金', '单张高普8K宝石蓝', '单张高普8K钛块古铜', '单张高普8K紫罗兰', '单张高普8K紫红', '单张高普8K中国红', '单张高普8K翡翠绿', '单张高普8K彩虹色'],
      '单张普精8K': ['单张普精8K黄钛金', '单张普精8K玫瑰金', '单张普精8K香槟金', '单张普精8K黑钛金', '单张普精8K宝石蓝', '单张普精8K钛块古铜', '单张普精8K紫罗兰', '单张普精8K紫红', '单张普精8K中国红', '单张普精8K翡翠绿', '单张普精8K彩虹色'],
      '单张精磨8K': ['单张精磨8K黄钛金', '单张精磨8K玫瑰金', '单张精磨8K香槟金', '单张精磨8K黑钛金', '单张精磨8K宝石蓝', '单张精磨8K钛块古铜', '单张精磨8K紫罗兰', '单张精磨8K紫红', '单张精磨8K中国红', '单张精磨8K翡翠绿', '单张精磨8K彩虹色'],
      '单张超精8K': ['单张超精8K黄钛金', '单张超精8K玫瑰金', '单张超精8K香槟金', '单张超精8K黑钛金', '单张超精8K宝石蓝', '单张超精8K钛块古铜', '单张超精8K紫罗兰', '单张超精8K紫红', '单张超精8K中国红', '单张超精8K翡翠绿', '单张超精8K彩虹色'],
      '单张砂面NO.4': ['单张砂面NO.4黄钛金', '单张拉丝HL黄钛金', '单张砂面NO.4玫瑰金', '单张拉丝HL玫瑰金', '单张砂面NO.4香槟金', '单张拉丝HL香槟金', '单张砂面NO.4黑钛金', '单张拉丝HL黑钛金', '单张砂面NO.4宝石蓝', '单张拉丝HL宝石蓝', '单张砂面NO.4钛块古铜', '单张拉丝HL钛块古铜', '单张砂面NO.4紫罗兰', '单张拉丝HL紫罗兰', '单张砂面NO.4紫红', '单张拉丝HL紫红', '单张砂面NO.4中国红', '单张拉丝HL中国红', '单张砂面NO.4翡翠绿', '单张拉丝HL翡翠绿', '单张砂面NO.4彩虹色', '单张拉丝HL彩虹色']
    };
    const groups = [
      { cls: 'sg-1000', label: '宽度档：1000mm', filter: t => (t.wMin || 0) === 1000 && (t.wMax || 0) === 1000 },
      { cls: 'sg-narrow', label: '宽度档：1219 / 1240 / 1250', filter: t => (t.wMin || 0) >= 1219 && (t.wMax || 9999) <= 1250 },
      { cls: 'sg-wide', label: '宽度档：1500 / 1524 / 1530', filter: t => (t.wMin || 0) >= 1500 }
    ];
    const colorNameOf = cn => cn.split('8K').pop().replace(/^单张砂面NO\.4/, '').replace(/^单张拉丝HL/, '');
    let html = '';
    groups.forEach(g => {
      const rows = [];
      qualities.forEach(q => {
        if (q === '单张拉丝HL') return; // 合并进砂面行
        const cfg = SURFACE_FEES[q];
        if (!Array.isArray(cfg)) return;
        // v1.0.95：砂面/拉丝所有宽度档统一合并名；窄板组拆 1219/1240 与 1250 两行；其余一组一行
        let rowDefs;
        if (q === '单张砂面NO.4') {
          if (g.cls === 'sg-narrow') {
            rowDefs = [
              { name: '单张砂面NO.4/单张拉丝HL', tierFilter: t => t.wMax <= 1240, owner: q, names: ['单张砂面NO.4', '单张拉丝HL'] },
              { name: '单张砂面NO.4/单张拉丝HL (1250)', tierFilter: t => t.wMin >= 1250, owner: q + '_1250', names: ['单张砂面NO.4', '单张拉丝HL'] }
            ];
          } else {
            rowDefs = [{ name: '单张砂面NO.4/单张拉丝HL', tierFilter: g.filter, owner: q, names: ['单张砂面NO.4', '单张拉丝HL'] }];
          }
        } else {
          rowDefs = [{ name: q, tierFilter: g.filter, owner: q, names: [q] }];
        }
        rowDefs.forEach(rd => {
          const tiers = cfg.map((t, i) => Object.assign({}, t, { _i: i })).filter(rd.tierFilter);
          if (!tiers.length) return;
          const locked = !!priceOverrides.surfaceLocked[rd.names[0]];
          const colorKeys = colorGroups[q];
          let colorRows = '';
          let hasColor = false;
          if (colorKeys) {
            // 按颜色名分组（砂面/拉丝同色合并一行，覆盖价同步）
            const colorMap = {};
            colorKeys.forEach(cn => {
              const cc = SURFACE_FEES[cn];
              if (!Array.isArray(cc)) return;
              const ct = cc.filter(rd.tierFilter);
              if (!ct.length) return;
              const cn2 = colorNameOf(cn);
              (colorMap[cn2] = colorMap[cn2] || []).push(cn);
            });
            Object.keys(colorMap).forEach(cn2 => {
              const keys = colorMap[cn2];
              const ct = SURFACE_FEES[keys[0]].map((t, i) => Object.assign({}, t, { _i: i })).filter(rd.tierFilter);
              if (!ct.length) return;
              hasColor = true;
              const cLocked = !!priceOverrides.surfaceLocked[keys[0]];
              colorRows += '<tr class="sg-color-row" data-owner="' + rd.owner + '" data-group="' + g.cls + '" style="display:none">' +
                '<td><span class="cfg-name sg-color-name">' + cn2 + '</span></td>' +
                '<td class="tier-cells">' + tierCellsHtml(ct, keys.join(','), cLocked) + '</td>' +
                '<td><button class="cfg-lock-btn ' + (cLocked ? 'locked' : '') + '" data-names="' + keys.join(',') + '" data-type="surf">' + (cLocked ? '🔒' : '🔓') + '</button></td>' +
                '</tr>';
            });
          }
          rows.push('<tr class="' + g.cls + '-row' + (hasColor ? ' has-color' : '') + '">' +
            '<td>' + (hasColor ? '<span class="cfg-expand" data-group="' + g.cls + '" data-owner="' + rd.owner + '">▶</span> ' : '') + '<span class="cfg-name">' + rd.name + '</span></td>' +
            '<td class="tier-cells">' + tierCellsHtml(tiers, rd.names.join(','), locked) + '</td>' +
            '<td><button class="cfg-lock-btn ' + (locked ? 'locked' : '') + '" data-names="' + rd.names.join(',') + '" data-type="surf">' + (locked ? '🔒' : '🔓') + '</button></td>' +
            '</tr>' + colorRows);
        });
      });
      html += '<div class="sg-group ' + g.cls + '"><div class="sg-group-title">' + g.label + '</div><table><thead><tr><th>单张加工</th><th>各档位价格（元/平方米，可横拉）</th><th></th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
    });
    wrap.innerHTML = html;
    bindSurfRowEvents(wrap, renderSheetSurfaceConfig);
  }

  function renderPriceReference() {
    const el = dom('priceReferenceTable');
    if (!el) return;
    let h = [];
    h.push('<div class="ref-nav">' +
      '<button class="ref-nav-btn" data-target="ref-sec-1">📋 厚度加价</button>' +
      '<button class="ref-nav-btn" data-target="ref-sec-2">✅ 表面加工费</button>' +
      '<button class="ref-nav-btn" data-target="ref-sec-3">🔒 保护膜</button>' +
      '<button class="ref-nav-btn" data-target="ref-sec-4">⚙️ 辅助参数</button>' +
      '<button class="ref-nav-btn" data-target="ref-top">↑ 顶部</button>' +
      '</div>');
    // ===== 1. 厚度加价总表 =====
    h.push('<div class="ref-section" id="ref-sec-1"><h3 class="ref-title"><span class="ref-toggle">▾</span>📐 厚度加价总表</h3>');
    // 默认表
    h.push('<h4 class="ref-subtitle">宏旺201(正材）</h4>');
    h.push('<table class="ref-table"><tr><th>厚度 (mm)</th><th>加价 (元/吨)</th></tr>');
    THICKNESS_SURCHARGE.forEach(t => {
      h.push(`<tr><td>${t.min}～${t.max}</td><td class="ref-num">+${t.price}</td></tr>`);
    });
    h.push('</table>');
    // 2026-08-25: 北港 J5：厚度加价与宏旺 201 正材一致
    h.push('<div style="font-size:11px;font-weight:500;color:var(--text-muted);margin:4px 0 2px;">北港 J5：厚度加价与宏旺 201 正材一致');

    // 压延料表
    h.push('<h4 class="ref-subtitle">本地201(压延）</h4>');
    h.push('<table class="ref-table"><tr><th>厚度 (mm)</th><th>加价 (元/吨)</th></tr>');
    YANYAN_THICKNESS_SURCHARGE.forEach(t => {
      h.push(`<tr><td>${t.min}～${t.max}</td><td class="ref-num">+${t.price}</td></tr>`);
    });
    h.push('</table>');

    // 304 表（2026-08-21：宏旺已建独立表，通用表仅德龙）
    h.push('<h4 class="ref-subtitle">德龙304</h4>');
    h.push('<table class="ref-table"><tr><th>厚度 (mm)</th><th>加价 (元/吨)</th></tr>');
    THICKNESS_SURCHARGE_304.forEach(t => {
      h.push(`<tr><td>${t.min}～${t.max}</td><td class="ref-num">+${t.price}</td></tr>`);
    });
    h.push('</table>');

    // 产地特异性表（2026-08-20：张浦 304 已用独立新表，跳过避免误导）
    Object.entries(ORIGIN_THICKNESS_SURCHARGE).forEach(([origin, table]) => {
      if (origin === '张浦') return;
      h.push(`<h4 class="ref-subtitle">${origin} (304正材)</h4>`);
      h.push('<table class="ref-table"><tr><th>厚度 (mm)</th><th>加价 (元/吨)</th></tr>');
      table.forEach(t => {
        h.push(`<tr><td>${t.min}～${t.max}</td><td class="ref-num">+${t.price}</td></tr>`);
      });
      h.push('</table>');
    });
    // 304 产地特异性表（2026-08-20：张浦上限 6.00mm；2026-08-21：宏旺 0.26-0.27 +1500 上限 3.00）
    Object.entries(ORIGIN_THICKNESS_SURCHARGE_304).forEach(([origin, table]) => {
      const maxThk = origin === '张浦' ? '上限 6.00mm' : '上限 3.00mm';
      h.push(`<h4 class="ref-subtitle">${origin} 304（${maxThk}${origin === '宏旺' ? '，含 0.26-0.27 +1500' : ''}）</h4>`);
      h.push('<table class="ref-table"><tr><th>厚度 (mm)</th><th>加价 (元/吨)</th></tr>');
      table.forEach(t => {
        h.push(`<tr><td>${t.min}～${t.max}</td><td class="ref-num">+${t.price}</td></tr>`);
      });
      h.push('</table>');
    });
    // 400系厚度加价表（标签顺序对齐面板板块：410 系列 → 430 系列）
    const THICK_400_LABELS = [
      ['410S-BA', '410S/BA（甬金/上克）'],
      ['410S-2BA-瑞钢', '410S/2BA（瑞钢）'],
      ['410S-2BA(非标)', '410S/2BA(非标)（瑞钢）'],
      ['430B-BA', '430B/BA（甬金/上克）'],
      ['430-BA', '430/BA（甬金/上克）'],
      ['430W-2BA', '宏旺 400系（410S/2BA、430W/2BA、430W/2BB，同价）'],
      ['430B-2BA-瑞钢', '430B/2BA（瑞钢）']
    ];
    h.push('<h4 class="ref-subtitle">400系厚度加价</h4>');
    for (const [key, label] of THICK_400_LABELS) {
      const table = THICKNESS_SURCHARGE_400[key];
      if (!table) continue;
      h.push(`<div style="font-size:11px;font-weight:500;color:var(--text-secondary);margin:6px 0 2px;">${label}</div>`);
      h.push('<table class="ref-table" style="margin-bottom:8px;"><tr><th>厚度 (mm)</th><th>加价 (元/吨)</th></tr>');
      table.forEach(t => {
        h.push(`<tr><td>${t.min}～${t.max}</td><td class="ref-num">+${t.price}</td></tr>`);
      });
      h.push('</table>');
    }
    // 316L 厚度加价（2026-08-21：张浦 16 档 + 甬金 17 档；太钢未提供）
    h.push('<h4 class="ref-subtitle">316L厚度加价</h4>');
    Object.entries(ORIGIN_THICKNESS_SURCHARGE_316L).forEach(([origin, table]) => {
      h.push(`<div style="font-size:11px;font-weight:500;color:var(--text-secondary);margin:6px 0 2px;">${origin} 316L${origin === '甬金' ? '（薄料 0.25-0.50mm 且宽度 1500/1530 时厚度加价额外 +300）' : ''}</div>`);
      h.push('<table class="ref-table" style="margin-bottom:8px;"><tr><th>厚度 (mm)</th><th>加价 (元/吨)</th></tr>');
      table.forEach(t => {
        h.push(`<tr><td>${t.min}～${t.max}</td><td class="ref-num">+${t.price}</td></tr>`);
      });
      h.push('</table>');
    });
    h.push('<div style="font-size:11px;font-weight:500;color:var(--text-muted);margin:4px 0 2px;">太钢 316L：未提供厚度加价数据，暂不报价（2026-08-20）</div>');
    h.push('</div>');

    // ===== 2. 表面加工费总表 =====
    h.push('<div class="ref-section" id="ref-sec-2"><h3 class="ref-title"><span class="ref-toggle">▾</span>✨ 表面加工费总表</h3>');
    h.push('<h4 class="ref-subtitle">201 表面加工费</h4>');
    h.push('<table class="ref-table"><tr><th>表面</th><th>厚度范围 (mm)</th><th>宽度范围 (mm)</th><th>单价</th></tr>');

    // 自定义排列顺序：8K彩色 → 砂面/拉丝 → 其他标准表面
    const coloredDisplay = [
      { display: '8K黄钛金(板)', key: '8K黄钛金' },
      { display: '8K黄钛金(板)/L', key: '8K黄钛金/L' },
      { display: '8K黄钛金(板)/S', key: '8K黄钛金/S' },
      { display: '8K玫瑰金(板)', key: '8K玫瑰金' },
      { display: '8K玫瑰金(板)/L', key: '8K玫瑰金/L' },
      { display: '8K玫瑰金(板)/S', key: '8K玫瑰金/S' },
      { display: '8K香槟金(板)', key: '8K香槟金' },
      { display: '8K香槟金(板)/L', key: '8K香槟金/L' },
      { display: '8K香槟金(板)/S', key: '8K香槟金/S' },
      { display: '8K黑钛金(板)', key: '8K黑钛金' },
      { display: '8K宝石蓝(板)', key: '8K宝石蓝' },
      { display: '8K紫罗兰(板)', key: '8K紫罗兰' },
      { display: '8K翡翠绿(板)', key: '8K翡翠绿' },
      { display: '8K紫红(板)', key: '8K紫红' },
      { display: '8K中国红(板)', key: '8K中国红' },
      { display: '8K古铜(板)', key: '8K古铜' },
      { display: '砂面/拉丝(NO.4/HL)黄钛金(板)', keys: ['拉丝黄钛金','磨砂黄钛金'] },
      { display: '砂面/拉丝(NO.4/HL)黄钛金(板)/L', keys: ['拉丝黄钛金/L','磨砂黄钛金/L'] },
      { display: '砂面/拉丝(NO.4/HL)黄钛金(板)/S', keys: ['拉丝黄钛金/S','磨砂黄钛金/S'] },
      { display: '砂面/拉丝(NO.4/HL)玫瑰金(板)', keys: ['拉丝玫瑰金','磨砂玫瑰金'] },
      { display: '砂面/拉丝(NO.4/HL)玫瑰金(板)/L', keys: ['拉丝玫瑰金/L','磨砂玫瑰金/L'] },
      { display: '砂面/拉丝(NO.4/HL)玫瑰金(板)/S', keys: ['拉丝玫瑰金/S','磨砂玫瑰金/S'] },
      { display: '砂面/拉丝(NO.4/HL)香槟金(板)', keys: ['拉丝香槟金','磨砂香槟金'] },
      { display: '砂面/拉丝(NO.4/HL)香槟金(板)/L', keys: ['拉丝香槟金/L','磨砂香槟金/L'] },
      { display: '砂面/拉丝(NO.4/HL)香槟金(板)/S', keys: ['拉丝香槟金/S','磨砂香槟金/S'] },
      { display: '砂面/拉丝(NO.4/HL)黑钛金(板)', keys: ['拉丝黑钛金','磨砂黑钛金'] },
      { display: '砂面/拉丝(NO.4/HL)古铜(板)', keys: ['拉丝古铜','磨砂古铜'] },
      { display: '砂面/拉丝(NO.4/HL)古铜哑光抗指纹(板)', key: '拉丝古铜哑光抗指纹' },
      { display: '砂面/拉丝(NO.4/HL)古铜亮光抗指纹(板)', key: '拉丝古铜亮光抗指纹' },
      // AFP 彩色表面
      { display: '砂面/拉丝(NO.4/HL)黄钛金亮光无指纹(板)', key: '拉丝黄钛金亮光无指纹' },
      { display: '砂面/拉丝(NO.4/HL)黄钛金哑光无指纹(板)', key: '拉丝黄钛金哑光无指纹' },
      { display: '砂面/拉丝(NO.4/HL)玫瑰金亮光无指纹(板)', key: '拉丝玫瑰金亮光无指纹' },
      { display: '砂面/拉丝(NO.4/HL)玫瑰金哑光无指纹(板)', key: '拉丝玫瑰金哑光无指纹' },
      { display: '砂面/拉丝(NO.4/HL)香槟金亮光无指纹(板)', key: '拉丝香槟金亮光无指纹' },
      { display: '砂面/拉丝(NO.4/HL)香槟金哑光无指纹(板)', key: '拉丝香槟金哑光无指纹' },
      { display: '砂面/拉丝(NO.4/HL)黑钛金亮光无指纹(板)', key: '拉丝黑钛金亮光无指纹' },
      { display: '砂面/拉丝(NO.4/HL)黑钛金哑光无指纹(板)', key: '拉丝黑钛金哑光无指纹' }
    ];
    // 卷材表面
    const coilDisplay = [
      { display: '8K黄钛金(卷)', key: '8K黄钛金(卷)' },
      { display: '8K玫瑰金(卷)', key: '8K玫瑰金(卷)' },
      { display: '8K香槟金(卷)', key: '8K香槟金(卷)' },
      { display: '8K黑钛金(卷)', key: '8K黑钛金(卷)' },
      { display: '砂面/拉丝(NO.4/HL)黄钛金(卷)', keys: ['拉丝黄钛金(卷)','磨砂黄钛金(卷)'] },
      { display: '砂面/拉丝(NO.4/HL)玫瑰金(卷)', keys: ['拉丝玫瑰金(卷)','磨砂玫瑰金(卷)'] },
      { display: '砂面/拉丝(NO.4/HL)香槟金(卷)', keys: ['拉丝香槟金(卷)','磨砂香槟金(卷)'] },
      { display: '砂面/拉丝(NO.4/HL)黑钛金(卷)', keys: ['拉丝黑钛金(卷)','磨砂黑钛金(卷)'] },
      { display: '砂面/拉丝(NO.4/HL)黄钛金亮光无指纹(卷)', key: '拉丝黄钛金亮光无指纹(卷)' },
      { display: '砂面/拉丝(NO.4/HL)黄钛金哑光无指纹(卷)', key: '拉丝黄钛金哑光无指纹(卷)' },
      { display: '砂面/拉丝(NO.4/HL)玫瑰金亮光无指纹(卷)', key: '拉丝玫瑰金亮光无指纹(卷)' },
      { display: '砂面/拉丝(NO.4/HL)玫瑰金哑光无指纹(卷)', key: '拉丝玫瑰金哑光无指纹(卷)' },
      { display: '砂面/拉丝(NO.4/HL)香槟金亮光无指纹(卷)', key: '拉丝香槟金亮光无指纹(卷)' },
      { display: '砂面/拉丝(NO.4/HL)香槟金哑光无指纹(卷)', key: '拉丝香槟金哑光无指纹(卷)' },
      { display: '砂面/拉丝(NO.4/HL)黑钛金亮光无指纹(卷)', key: '拉丝黑钛金亮光无指纹(卷)' },
      { display: '砂面/拉丝(NO.4/HL)黑钛金哑光无指纹(卷)', key: '拉丝黑钛金哑光无指纹(卷)' },
      { display: '砂面/拉丝(NO.4/HL)灰钛金哑光无指纹(卷)', key: '拉丝灰钛金哑光无指纹(卷)' },
      { display: '砂面/拉丝(NO.4/HL)古铜亮光无指纹(卷)', key: '拉丝古铜亮光无指纹(卷)' },
      { display: '砂面/拉丝(NO.4/HL)古铜哑光无指纹(卷)', key: '拉丝古铜哑光无指纹(卷)' }
    ];
    const standardSurfaces = ['2B', '砂面/拉丝(NO.4/HL)', '单面抛光', '双面抛光', '6K', '双面6K', '8K', '单张普磨8K', '单张砂面NO.4', '单张砂面NO.4黄钛金', '单张砂面NO.4玫瑰金', '单张砂面NO.4香槟金', '单张砂面NO.4黑钛金', '单张砂面NO.4宝石蓝', '单张砂面NO.4钛块古铜', '单张砂面NO.4紫罗兰', '单张砂面NO.4紫红', '单张砂面NO.4中国红', '单张砂面NO.4翡翠绿', '单张砂面NO.4彩虹色', '单张拉丝HL', '单张拉丝HL黄钛金', '单张拉丝HL玫瑰金', '单张拉丝HL香槟金', '单张拉丝HL黑钛金', '单张拉丝HL宝石蓝', '单张拉丝HL钛块古铜', '单张拉丝HL紫罗兰', '单张拉丝HL紫红', '单张拉丝HL中国红', '单张拉丝HL翡翠绿', '单张拉丝HL彩虹色', '单张高普8K', '单张高普8K黄钛金', '单张高普8K玫瑰金', '单张高普8K香槟金', '单张高普8K黑钛金', '单张高普8K宝石蓝', '单张高普8K钛块古铜', '单张高普8K紫罗兰', '单张高普8K紫红', '单张高普8K中国红', '单张高普8K翡翠绿', '单张高普8K彩虹色', '单张普精8K', '单张普精8K黄钛金', '单张普精8K玫瑰金', '单张普精8K香槟金', '单张普精8K黑钛金', '单张普精8K宝石蓝', '单张普精8K钛块古铜', '单张普精8K紫罗兰', '单张普精8K紫红', '单张普精8K中国红', '单张普精8K翡翠绿', '单张普精8K彩虹色', '单张精磨8K', '单张精磨8K黄钛金', '单张精磨8K玫瑰金', '单张精磨8K香槟金', '单张精磨8K黑钛金', '单张精磨8K宝石蓝', '单张精磨8K钛块古铜', '单张精磨8K紫罗兰', '单张精磨8K紫红', '单张精磨8K中国红', '单张精磨8K翡翠绿', '单张精磨8K彩虹色', '单张超精8K', '单张超精8K黄钛金', '单张超精8K玫瑰金', '单张超精8K香槟金', '单张超精8K黑钛金', '单张超精8K宝石蓝', '单张超精8K钛块古铜', '单张超精8K紫罗兰', '单张超精8K紫红', '单张超精8K中国红', '单张超精8K翡翠绿', '单张超精8K彩虹色', '双面8K'];

    function renderSurfaceRows(displayName, cfg) {
      if (Array.isArray(cfg)) {
        cfg.forEach((tier, i) => {
          const thick = `${tier.tMin ?? '—'}～${tier.tMax ?? '—'}`;
          const wide = (tier.wMin || tier.wMax) ? `${tier.wMin ?? '—'}～${tier.wMax ?? '—'}` : '—';
          const unit = tier.unit === 'sqm' ? '元/㎡' : '元/吨';
          h.push(`<tr><td>${i === 0 ? displayName : ''}</td><td>${thick}</td><td>${wide}</td><td class="ref-num">${tier.price} ${unit}</td></tr>`);
        });
      } else if (typeof cfg === 'object' && cfg.price !== undefined) {
        const unit = cfg.type === 'sqm' ? '元/㎡' : '元/吨';
        h.push(`<tr><td>${displayName}</td><td colspan="2">所有厚度</td><td class="ref-num">${cfg.price} ${unit}</td></tr>`);
      }
    }

    standardSurfaces.forEach(name => {
      if (name === '砂面/拉丝(NO.4/HL)') {
        const cfg = SURFACE_FEES['NO.4'];
        if (cfg) renderSurfaceRows(name, cfg);
      } else {
        const cfg = SURFACE_FEES[name];
        if (!cfg) return;
        const gs = single8kGroups(name);
        if (gs) gs.forEach(g => renderSurfaceRows(g.label, g.tiers));
        else renderSurfaceRows(name === '8K' ? '普磨8K（卷磨）' : name, cfg);
      }
    });
    coloredDisplay.forEach(item => {
      const cfg = SURFACE_FEES[item.key || item.keys[0]];
      if (cfg) renderSurfaceRows(item.display, cfg);
    });
    h.push('</table>');

    // 卷材彩色表面
    h.push('<h4 class="ref-subtitle" style="margin-top:12px">彩色卷材表面加工费 (0.24~1.20mm)</h4>');
    h.push('<table class="ref-table"><tr><th>表面</th><th>厚度范围 (mm)</th><th>宽度范围 (mm)</th><th>单价</th></tr>');
    coilDisplay.forEach(item => {
      const cfg = SURFACE_FEES[item.key || item.keys[0]];
      if (cfg) renderSurfaceRows(item.display, cfg);
    });
    h.push('</table>');

    // 304 特例表面
    if (Object.keys(SURFACE_FEES_304).length > 0) {
      h.push('<h4 class="ref-subtitle">304 特例表面加工费 (与 201 不同的)</h4>');
      h.push('<table class="ref-table"><tr><th>表面</th><th>厚度范围 (mm)</th><th>宽度范围 (mm)</th><th>单价</th></tr>');
      // 8K黑钛金 单独显示；拉丝+磨砂黑钛金合并
      const cfg8k = SURFACE_FEES_304['8K黑钛金'];
      if (cfg8k) renderSurfaceRows('8K黑钛金(板)', cfg8k);
      const cfgWire = SURFACE_FEES_304['拉丝黑钛金'];
      if (cfgWire) renderSurfaceRows('砂面/拉丝(NO.4/HL)黑钛金(板)', cfgWire);
      h.push('</table>');
    }
    h.push('</div>');

    // ===== 3. 保护膜价格表 =====
    h.push('<div class="ref-section" id="ref-sec-3"><h3 class="ref-title"><span class="ref-toggle">▾</span>🔖 保护膜价格</h3>');
    h.push('<table class="ref-table"><tr><th>膜型号</th><th>单价 (元/㎡)</th></tr>');
    Object.entries(FILM_FEES).forEach(([name, price]) => {
      h.push(`<tr><td>${name}</td><td class="ref-num">${price}</td></tr>`);
    });
    h.push('</table></div>');

    // ===== 4. 辅助参数 =====
    h.push('<div class="ref-section" id="ref-sec-4"><h3 class="ref-title"><span class="ref-toggle">▾</span>⚙️ 辅助参数</h3>');
    h.push('<table class="ref-table">');
    h.push('<tr><td>密度 (201)</td><td class="ref-num">' + DENSITY['201'] + '</td></tr>');
    h.push('<tr><td>密度 (304)</td><td class="ref-num">' + DENSITY['304'] + '</td></tr>');
    h.push('<tr><td>不含税系数</td><td class="ref-num">0.92</td></tr>');
    h.push('<tr><td>小珠光压花附加费 (linen)</td><td class="ref-num">' + LINEN_FEE + ' 元/吨</td></tr>');
    h.push('<tr><td>小方格压花附加费 (square)</td><td class="ref-num">' + EMBOSS_FEES.square.feePerTon + ' 元/吨</td></tr>');
    h.push('<tr><td colspan="2" style="font-size:11px;color:var(--text-muted)">压花格式：表面加工+压花工艺（如 6K+linen / 8K+小珠光），加工费分开计算；也可在报价页勾选"压花工艺：小珠光(linen)"</td></tr>');
    h.push('<tr><td>亮光抗指纹 (AFP Bright)</td><td class="ref-num">' + AFP_BRIGHT_FEE + ' 元/㎡</td></tr>');
    h.push('<tr><td>哑光抗指纹 (AFP Matte)</td><td class="ref-num">' + AFP_MATTE_FEE + ' 元/㎡</td></tr>');
    h.push('<tr><td colspan="2" style="padding:4px"></td></tr>');
    h.push('</table></div>');

    el.innerHTML = h.join('');
    // v1.0.101: 目录导航 + 折叠
    el.querySelectorAll('.ref-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = document.getElementById(btn.dataset.target);
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    el.querySelectorAll('.ref-title').forEach(h3 => {
      h3.addEventListener('click', () => {
        const sec = h3.parentElement;
        if (!sec || !sec.classList.contains('ref-section')) return;
        sec.classList.toggle('ref-collapsed');
      });
    });
  }

  function renderCoilMarkupConfig() {
    const el = dom('coilMarkupTable');
    if (!el) return;
    let h = [];
    h.push('<div class="ref-section"><h3 class="ref-title">📈 销售加价</h3>');
    h.push('<h4 class="ref-subtitle">卷板销售加价（201/304/410/430）</h4>');
    h.push('<table class="ref-table"><tr><th>宽度</th><th>类型</th><th>边部加价</th><th>包装费用</th><th>装柜费用</th><th class="ref-num">合计 (元/吨)</th></tr>');
    for (const row of COIL_MARKUP_DETAIL) {
      const w = row.widths.join('/');
      h.push('<tr><td>' + w + 'mm</td><td>' + row.label + '</td><td class="ref-num">+' + row.edgeFee + '</td><td class="ref-num">+' + row.packingFee + '</td><td class="ref-num">+' + row.containerFee + '</td><td class="ref-num">+' + row.total + '</td></tr>');
      h.push('<tr><td colspan="6" style="padding:2px 8px;font-size:11px;color:var(--text-muted);">' + w + 'mm ' + row.label + '卷板销售加价 = ' + row.label + '边部加价' + row.edgeFee + '元/吨 + 包装费用' + row.packingFee + '元/吨 + 装柜费用' + row.containerFee + '元/吨 = ' + row.total + '元/吨</td></tr>');
    }
    h.push('</table>');
    h.push('<h4 class="ref-subtitle">卷板销售加价（316L）</h4>');
    h.push('<table class="ref-table"><tr><th>宽度</th><th>类型</th><th>边部加价</th><th>包装费用</th><th>装柜费用</th><th class="ref-num">合计 (元/吨)</th></tr>');
    for (const row of COIL_MARKUP_DETAIL_316L) {
      const w = row.widths.join('/');
      h.push('<tr><td>' + w + 'mm</td><td>' + row.label + '</td><td class="ref-num">+' + row.edgeFee + '</td><td class="ref-num">+' + row.packingFee + '</td><td class="ref-num">+' + row.containerFee + '</td><td class="ref-num">+' + row.total + '</td></tr>');
      h.push('<tr><td colspan="6" style="padding:2px 8px;font-size:11px;color:var(--text-muted);">' + w + 'mm ' + row.label + '卷板销售加价 = ' + row.label + '边部加价' + row.edgeFee + '元/吨 + 包装费用' + row.packingFee + '元/吨 + 装柜费用' + row.containerFee + '元/吨 = ' + row.total + '元/吨</td></tr>');
    }
    h.push('</table>');
    h.push('<h4 class="ref-subtitle">平板销售加价（201/304/410/430，出口木架基准）</h4>');
    h.push('<table class="ref-table"><tr><th>材质</th><th>宽度/边部</th><th>长度区间</th><th class="ref-num">加价 (元/吨)</th></tr>');
    const sheetRows = [
      ['201/304/410/430', '1240毛边', '2100-2500', 'std_1240_s'],
      ['201/304/410/430', '1240毛边', '3000-4000', 'std_1240_l'],
      ['201/304/410/430', '1219齐边', '2100-2500', 'std_1219_s'],
      ['201/304/410/430', '1219齐边', '3000-4000', 'std_1219_l'],
    ];
    for (const [m, w, l, key] of sheetRows) {
      const _v = SHEET_MARKUP_DETAIL[key];
      h.push(`<tr><td>${m}</td><td>${w}</td><td>${l}（出口木架）</td><td class="ref-num">+${_v}</td></tr>`);
      h.push(`<tr><td colspan="4" style="padding:2px 8px;font-size:11px;color:var(--text-muted);">边部加价(${w})${_v - 200}元/吨 + 木架100元/吨 + 装柜50元/吨 + 加工损耗50元/吨 = ${_v}元/吨</td></tr>`);
    }
    const narrowRows = [
      ['201/304/410/430', '1030毛边', '1001-2000', 'std_1030_s'],
      ['201/304/410/430', '1030毛边', '2001-4000', 'std_1030_l'],
      ['201/304/410/430', '1000齐边', '1001-2000', 'std_1000_s'],
      ['201/304/410/430', '1000齐边', '2001-4000', 'std_1000_l'],
    ];
    for (const [m, w, l, key] of narrowRows) {
      const _v = SHEET_MARKUP_DETAIL[key];
      h.push(`<tr><td>${m}</td><td>${w}</td><td>${l}（出口木架）</td><td class="ref-num">+${_v}</td></tr>`);
      h.push(`<tr><td colspan="4" style="padding:2px 8px;font-size:11px;color:var(--text-muted);">边部加价(${w})${_v - 200}元/吨 + 木架100元/吨 + 装柜50元/吨 + 加工损耗50元/吨 = ${_v}元/吨</td></tr>`);
    }
    const wideRows = [
      ['410/430', '1280毛边', '2100-2500', '410430_1280_s'],
      ['410/430', '1280毛边', '3000-4000', '410430_1280_l'],
      ['410/430', '1250齐边', '2100-2500', '410430_1250_s'],
      ['410/430', '1250齐边', '3000-4000', '410430_1250_l'],
      ['304', '1280毛边', '2100-2500', '304_1280_s'],
      ['304', '1280毛边', '3000-4000', '304_1280_l'],
      ['304', '1250齐边', '2100-2500', '304_1250_s'],
      ['304', '1250齐边', '3000-4000', '304_1250_l'],
    ];
    for (const [m, w, l, key] of wideRows) {
      const _v = SHEET_MARKUP_DETAIL[key];
      h.push(`<tr><td>${m}</td><td>${w}</td><td>${l}（出口木架）</td><td class="ref-num">+${_v}</td></tr>`);
      h.push(`<tr><td colspan="4" style="padding:2px 8px;font-size:11px;color:var(--text-muted);">边部加价(${w})${_v - 200}元/吨 + 木架100元/吨 + 装柜50元/吨 + 加工损耗50元/吨 = ${_v}元/吨</td></tr>`);
    }
    const wide2Rows = [
      ['201/304/410/430', '1530毛边', '2100-3055', 'std_1530_s'],
      ['201/304/410/430', '1530毛边', '3056-4000', 'std_1530_l'],
      ['201/304/410/430', '1500齐边', '2100-3055', 'std_1500_s'],
      ['201/304/410/430', '1500齐边', '3056-4000', 'std_1500_l'],
    ];
    for (const [m, w, l, key] of wide2Rows) {
      const _v = SHEET_MARKUP_DETAIL[key];
      h.push(`<tr><td>${m}</td><td>${w}</td><td>${l}（出口木架）</td><td class="ref-num">+${_v}</td></tr>`);
      h.push(`<tr><td colspan="4" style="padding:2px 8px;font-size:11px;color:var(--text-muted);">边部加价(${w})${_v - 200}元/吨 + 木架100元/吨 + 装柜50元/吨 + 加工损耗50元/吨 = ${_v}元/吨</td></tr>`);
    }
    h.push('</table>');
    h.push('<h4 class="ref-subtitle">平板销售加价（316L，出口木架基准）</h4>');
    h.push('<table class="ref-table"><tr><th>材质</th><th>宽度/边部</th><th>长度区间</th><th class="ref-num">加价 (元/吨)</th></tr>');
    const sheet316Rows = [
      ['316L', '1240毛边', '2100-2500', '316l_1240_s'],
      ['316L', '1240毛边', '3000-4000', '316l_1240_l'],
      ['316L', '1219齐边', '2100-2500', '316l_1219_s'],
      ['316L', '1219齐边', '3000-4000', '316l_1219_l'],
      ['316L', '1030毛边', '1001-2000', '316l_1030_s'],
      ['316L', '1030毛边', '2001-4000', '316l_1030_l'],
      ['316L', '1000齐边', '1001-2000', '316l_1000_s'],
      ['316L', '1000齐边', '2001-4000', '316l_1000_l'],
      ['316L', '1280毛边', '2100-2500', '316l_1280_s'],
      ['316L', '1280毛边', '3000-4000', '316l_1280_l'],
      ['316L', '1250齐边', '2100-2500', '316l_1250_s'],
      ['316L', '1250齐边', '3000-4000', '316l_1250_l'],
      ['316L', '1530毛边', '2100-3055', '316l_1530_s'],
      ['316L', '1530毛边', '3056-4000', '316l_1530_l'],
      ['316L', '1500齐边', '2100-3055', '316l_1500_s'],
      ['316L', '1500齐边', '3056-4000', '316l_1500_l']
    ];
    for (const [m, w, l, key] of sheet316Rows) {
      const _v = SHEET_MARKUP_DETAIL[key];
      h.push(`<tr><td>${m}</td><td>${w}</td><td>${l}（出口木架）</td><td class="ref-num">+${_v}</td></tr>`);
      h.push(`<tr><td colspan="4" style="padding:2px 8px;font-size:11px;color:var(--text-muted);">边部加价(${w})${_v - 200}元/吨 + 木架100元/吨 + 装柜50元/吨 + 加工损耗50元/吨 = ${_v}元/吨</td></tr>`);
    }
    h.push('</table>');
    h.push('<tr><td>其他宽度平板 毛边（旧价）</td><td colspan="2"></td><td class="ref-num">+' + SALES_MARKUP.rough_sheet + '</td></tr>');
    h.push('<tr><td colspan="4" style="padding:2px 8px;font-size:11px;color:var(--text-muted);">边部加价' + (SALES_MARKUP.rough_sheet - 200) + '元/吨 + 木架100元/吨 + 装柜50元/吨 + 加工损耗50元/吨 = ' + SALES_MARKUP.rough_sheet + '元/吨</td></tr>');
    h.push('<tr><td>其他宽度平板 齐边（旧价）</td><td colspan="2"></td><td class="ref-num">+' + SALES_MARKUP.trim_sheet + '</td></tr>');
    h.push('<tr><td colspan="4" style="padding:2px 8px;font-size:11px;color:var(--text-muted);">边部加价' + (SALES_MARKUP.trim_sheet - 200) + '元/吨 + 木架100元/吨 + 装柜50元/吨 + 加工损耗50元/吨 = ' + SALES_MARKUP.trim_sheet + '元/吨</td></tr>');
    h.push('<tr><td colspan="4" style="padding:2px;font-size:11px;color:var(--text-muted);">出口木箱 = 对应木架 +' + PACKING_WOODEN_BOX_SURCHARGE + '元/吨</td></tr>');
    h.push('</table>');
    h.push('<div style="font-size:11px;color:var(--text-muted);margin-top:6px;">201/304/410/430 与 316L 分别定价；1250mm 与 1000mm 同价（201/304/410/430=550、316L=850）；四尺=1219/1240/1250/1280，米尺=1000，五尺=1500/1524/1530</div>');
    h.push('</div>');
    el.innerHTML = h.join('');
  }


  // ========== 数据操作 ==========
  function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    showToast('解析中...', 'info');
    ExcelParser.parseExcel(f, 0).then(items => {
      if (!items.length) { showToast('未解析出数据', 'error'); return; }
      items.forEach(item => {
        // 压延料检测：材质名含"压延"时剥离，标记压延料
        if (item.material && /压延/.test(item.material)) {
          item.material = item.material.replace(/压延/g, '').trim();
          item.isYanYan = true;
        }
        // 400系：材质含"/"且未填写表面时显示"无"，有表面则保留
        if (item.material && item.material.includes('/') && !item.surface) {
          item.surface = '无';
        }
        item.basePrice = getMaterialPrice(item.origin || '宏旺', item.material, null, parseFloat(item.width), parseFloat(item.thickness)) || 0;
      });
      dataItems = dataItems.concat(items);
      results = [];
      showToast(`导入 ${items.length} 条`, 'success');
      render();
    }).catch(err => showToast('解析失败: ' + err.message, 'error'));
    e.target.value = '';
  }

  function addManual() {
    const origin = dom('manualOrigin').value;
    const mat = dom('manualMaterial').value;
    const yan = dom('manualYanYan').checked;
    const thk = dom('manualThickness').value.trim();
    const wid = dom('manualWidth').value.trim();
    const len = dom('manualLength').value.trim();
    const surf = dom('manualSurface').value.trim();
    const packing = dom('manualPacking') ? dom('manualPacking').value : '';
    let f1 = dom('manualFilm1').value.trim();
    let f2 = dom('manualFilm2').value.trim();
    // "/" 自动拆分：5C膜/5C膜 → film1=5C-FILM, film2=5C-FILM
    if (f1.includes('/')) {
      const parts = f1.split('/').map(s => s.trim());
      f1 = parts[0] || '';
      if (parts.length > 1 && !f2) f2 = parts[1] || '';
    }
    if (f2.includes('/')) {
      const parts = f2.split('/').map(s => s.trim());
      f2 = parts[0] || '';
    }
    f1 = PricingEngine.normalizeFilm(f1) || f1;
    f2 = PricingEngine.normalizeFilm(f2) || f2;
    const bp = getMaterialPrice(origin, mat, surf, parseFloat(wid), parseFloat(thk));
    if (!bp || bp <= 0) {
      if (/^201/.test(mat) && mat !== '201J5' && PricingEngine.getWidthBand201(parseFloat(wid)) === null) {
        showToast(`宽度 ${wid}mm 不在 201 基价档位（1219/1240、1250/1280、1500/1530）`, 'error');
      } else {
        showToast(`${origin} ${mat} 基价未设置`, 'error');
      }
      return;
    }
    if (!thk || !wid) { showToast('请填写厚度和宽度', 'error'); return; }
    dataItems.push({ origin, material: mat, isYanYan: yan, surface: surf, thickness: thk, width: wid, length: len || 'C', film1: f1, film2: f2, basePrice: bp, packing });
    results = []; showToast('已添加', 'success');
    render();
    ['manualThickness','manualWidth','manualLength','manualSurface','manualFilm1','manualFilm2'].forEach(id => dom(id).value = '');
    dom('manualThickness').focus();
  }

  function parseText() {
    const text = els.freeText.value.trim();
    if (!text) { showToast('请输入数据', 'error'); return; }

    // Detect grouped format: 第一行有公共信息（产地/材质/基础规格），后续有"表面："行
    function isGroupedFormat(lines) {
      const first = lines[0] || '';
      const hasSurface = lines.some(l => /表面[：:]/.test(l));
      const hasSpec = /\d+\.?\d*\s*[*×xX]\s*\d+/.test(first);
      const hasOrigin = ORIGIN_KEYWORDS.some(o => first.includes(o));
      return hasSurface && hasSpec && (hasOrigin || lines.length > 3);
    }

    function extractCommonInfo(raw) {
      let s = raw.replace(/[，,、；;：:]/g, ' ').trim();
      let origin = '', material = '';
      for (const op of ORIGIN_KEYWORDS) { if (s.includes(op)) { origin = op; s = s.replace(op, ' ').trim(); break; } }
      const mps = ['201J5','201J4','201J1','201J3','201J2','201','304','316L','410S/BA','410S','430B','430/BA','430W/2BA','430W/2BB','410','430'];
      for (const mp of mps) { if (s.toUpperCase().includes(mp)) { material = mp; s = s.replace(new RegExp(mp,'gi'), ' ').trim(); break; } }
      let width = 1240, length = 'C';
      const sp = s.match(/(\d+\.?\d*)\s*[*×xX]\s*(\d+\.?\d*)(?:\s*MM)?/i);
      if (sp) { width = parseFloat(sp[1]); length = sp[2]; }
      else { const sp2 = s.match(/(\d+)\s*[*×xX]\s*(\d+)/); if (sp2) { width = parseFloat(sp2[1]); length = sp2[2]; } }
      return { origin, material, width, length };
    }

    function extractSurfaceFilm(line) {
      const m = line.match(/表面[：:]\s*(.+?)\s*膜[：:]\s*(.+)/);
      if (!m) return null;
      const surface = m[1].trim();
      const filmPart = m[2].trim();
      const fps = filmPart.split('+').map(s => s.trim());
      let f1 = '', f2 = '';
      const normed = PricingEngine.normalizeFilm(fps[0]) || fps[0];
      f1 = normed;
      if (fps.length > 1) f2 = PricingEngine.normalizeFilm(fps[1]) || fps[1];
      return { surface, film1: f1, film2: f2 };
    }

    function extractThickness(line) {
      // 优先匹配厚度范围（如 0.55-0.60MM），其次单值
      const m = line.match(/(\d+\.?\d*(?:\s*[-~—–]\s*\d+\.?\d*)?)\s*MM/i);
      return m ? m[1] : null;
    }

    const rawLines = text.split('\n');
    const trimmed = rawLines.map(l => l.trim());

    // 如果数量少，先尝试原始逐行解析
    let count = 0;
    const useGrouped = isGroupedFormat(trimmed);
    let items = [];

    if (useGrouped) {
      const common = extractCommonInfo(trimmed[0]);
      let curSurface = '', curFilm1 = '', curFilm2 = '';
      for (let i = 1; i < trimmed.length; i++) {
        const line = trimmed[i];
        if (!line) continue;
        const sf = extractSurfaceFilm(line);
        if (sf) { curSurface = sf.surface; curFilm1 = sf.film1; curFilm2 = sf.film2; continue; }
        const thk = extractThickness(line);
        if (thk !== null && curSurface) {
          const fakeLine = `${common.origin || '宏旺'}${common.material} ${curSurface} ${curFilm1}${curFilm2 ? '+' + curFilm2 : ''} ${thk}*${common.width}*${common.length}`;
          const p = PricingEngine.parseFreeText(fakeLine, {});
          if (p && p.thickness && p.width) items.push(p);
        }
      }
    } else {
      // 原始逐行解析
      for (const line of trimmed) {
        if (!line) continue;
        const p = PricingEngine.parseFreeText(line, {});
        if (p && p.thickness && p.width) items.push(p);
      }
    }

    for (const p of items) {
      if (p.origin && !originOrder.includes(p.origin)) {
        originOrder.push(p.origin);
        originPrices[p.origin] = emptyOrigin201();
      }
      const bp = getMaterialPrice(p.origin || '宏旺', p.material, null, parseFloat(p.width), parseFloat(p.thickness));
      // v1.0.96：基价无效也入行（计算时给出明确错误，如五尺宽度未提供），不再静默丢弃
      p.basePrice = bp || 0;
      dataItems.push(p);
      count++;
    }
    if (count > 0) {
      results = []; renderOriginGrid();
      showToast(`解析 ${count} 条`, 'success');
      els.freeText.value = '';
      render();
    } else { showToast('未能解析（检查各产地基价是否已设置）', 'error'); }
  }

  function isSheetMode() { return !!(els.calcModeSheet && els.calcModeSheet.checked); }
  function updateSheetHeaders() {
    const sheet = isSheetMode();
    if (els.thSaleTax) els.thSaleTax.innerHTML = (sheet ? '含税售价' : '含税售价') + '<sup class="usd-sup">（$）</sup>';
    if (els.thSaleNoTax) els.thSaleNoTax.innerHTML = (sheet ? '不含税售价' : '不含税售价') + '<sup class="usd-sup">（$）</sup>';
    if (els.thWeight) els.thWeight.textContent = sheet ? '数量' : '重量(吨)';
    if (els.thCostTax) els.thCostTax.style.display = sheet ? 'none' : '';
    if (els.thCostNoTax) els.thCostNoTax.style.display = sheet ? 'none' : '';
  }

  function runCalc() {
    if (!dataItems.length) { showToast('请先添加数据', 'error'); return; }
    // Sync 北港 J5
    const j5Inp = dom('beigangJ5Price');
    if (j5Inp) beigangJ5Price = parseFloat(j5Inp.value) || 0;
    // Inject user price overrides
    PricingEngine.setUserOverrides(priceOverrides);
    // Update base prices（模式B：能算的算，算不出的逐行标详细原因，不再整体中止）
    dataItems.forEach(item => {
      const w = parseFloat(item.width);
      const bp = getMaterialPrice(item.origin || '宏旺', item.material, null, w, parseFloat(item.thickness));
      item.basePrice = bp || 0;
      item._bpError = null;
      if (!bp || bp <= 0) {
        const isFF = w === 1500 || w === 1524 || w === 1530;
        if (isFF && !/^201/.test(item.material)) {
          item._bpError = item.origin + ' ' + item.material + ' 暂不提供五尺（1500/1524/1530mm）宽度或五尺基价未填，请在基价面板填写「五尺」基价';
        } else if (/^201/.test(item.material) && item.material !== '201J5' && PricingEngine.getWidthBand201(w) === null) {
          item._bpError = `宽度 ${isNaN(w) ? (item.width || '?') : w}mm 不在 201 基价档位（1219/1240、1250/1280、1500/1530），请检查宽度或补充对应档位基价`;
        } else {
          item._bpError = `${item.origin || '?'} ${item.material} 基价未设置${isNaN(w) ? '' : `（宽度 ${w}mm 对应档位）`}，请在基价面板填写`;
        }
      }
    });
    dataItems.forEach(it => {
      it.calcMode = isSheetMode() ? 'sheet' : 'weight';
      // v1.0.106：单张计价注入 汇率(元/美元) + 贸易术语 FOB/CIF 美元价（按当天汇率均摊）
      if (it.calcMode === 'sheet') {
        it.usdRate = effectiveRate() / 100;
        it.term = termState.term;
        it.fobUsd = termState.fobUsd || 0;
        it.cifUsd = termState.cifUsd || 0;
      }
    });
    updateSheetHeaders();
    results = PricingEngine.calculateBatch(dataItems);
    // 把基价预检的详细原因合并进行级错误（替换笼统的"基价无效"）
    results.forEach((r, i) => {
      const item = dataItems[i];
      if (r.success || !item || !item._bpError) return;
      r.errors = r.errors.filter(e => e !== '基价无效');
      if (!r.errors.includes(item._bpError)) r.errors.unshift(item._bpError);
    });
    const ok = results.filter(r => r.success).length;
    const fail = results.filter(r => !r.success).length;
    if (fail > 0) {
      showToast(`完成：${ok} 成功，${fail} 行未计算（已标红，点击行查看原因）`, ok > 0 ? 'warning' : 'error');
    } else {
      showToast(`完成：${ok} 成功`, 'success');
    }
    renderResults();
    // v1.0.116: 使用记录上报（异步，失败不影响报价）
    if (window.KKAuth && KKAuth.isHttp && results && results.length) {
      var items = [];
      results.forEach(function (r, i) {
        if (!r.success) return;
        var it = dataItems[i];
        if (!it) return;
        items.push({
          material: it.material || '',
          spec: (it.thickness || '') + '*' + (it.width || '') + '*' + (it.length || ''),
          surface: it.surface || '',
          calcMode: it.calcMode || '',
          unitPrice: r.detail ? r.detail.costTax : null
        });
      });
      if (items.length) {
        if (items.length <= 200) items.forEach(function (it) { KKAuth.reportUsage(it); });
        else KKAuth.reportUsage({ material: items[0].material || '', spec: items.length + ' 行批量', surface: items[0].surface || '', calcMode: items[0].calcMode || '', unitPrice: null });
      }
    }
  }

  function clearAll() { dataItems = []; results = []; allExpanded = false; render(); showToast('已清空', 'info'); }
  function removeRow(idx) { dataItems.splice(idx - 1, 1); results = []; render(); }

  async function exportResults() {
    if (!results.length) { showToast('请先计算', 'error'); return; }
    const d = new Date(); const ds = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    try {
      await ExcelParser.exportToExcel(results, `KK报价_${ds}.xlsx`, {
        term: termState.term,
        fobUsd: termState.fobUsd || 0,
        cifUsd: termState.cifUsd || 0,
        rate: effectiveRate(),
        extras: { opFee: extrasState.opFee, interest: extrasState.interest, profit: extrasState.profit }
      });
      showToast('导出成功', 'success');
    } catch (err) {
      console.error(err);
      showToast('导出失败: ' + (err && err.message ? err.message : '未知错误'), 'error');
    }
  }

  function toggleExpand(idx) {
    dom(`detail-${idx}`)?.classList.toggle('open');
    dom(`expand-btn-${idx}`)?.classList.toggle('open');
  }

  function setPacking(idx, val) {
    const i = idx - 1;
    if (!dataItems[i]) return;
    dataItems[i].packing = val;
    results = [];
    render();
  }

  function setPackingFee(idx, val) {
    const i = idx - 1;
    if (!dataItems[i]) return;
    dataItems[i].packingFee = parseFloat(val) > 0 ? parseFloat(val) : 0;
    if (results && results.length > 0) { runCalc(); } else { render(); }
  }

  function toggleAllExpand() {
    allExpanded = !allExpanded;
    results.forEach((r, i) => {
      if (r.success) {
        const idx = i + 1;
        dom(`detail-${idx}`)?.classList.toggle('open', allExpanded);
        dom(`expand-btn-${idx}`)?.classList.toggle('open', allExpanded);
      }
    });
    els.expandAllBtn.textContent = allExpanded ? '📋 收起明细' : '📋 全部明细';
  }

  // ========== 渲染 ==========
  function render() { renderStats(); renderTable(); renderTotal(); }
  function renderResults() { renderStats(); renderTable(); renderTotal(); }

  // ---------- 美金汇率（中国银行美元买入价） ----------
  // 生效汇率：手动覆盖 > 实时（rate.json）> 内置默认
  function effectiveRate() {
    if (rateState.manual && rateState.manual > 0) return rateState.manual;
    if (rateState.live && rateState.live > 0) return rateState.live;
    return USD_RATE_DEFAULT;
  }
  function usd(cny) {
    const v = PricingEngine.cnToUsd(cny, effectiveRate());
    return v == null ? null : v;
  }
  const fmtUsd = (v) => '$' + (v == null ? '-' : v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  function initUsdRate() {
    // 恢复手动覆盖
    try {
      const m = parseFloat(localStorage.getItem(USD_RATE_KEY_MANUAL));
      if (!isNaN(m) && m > 0) { rateState.manual = m; els.rateManual.value = m; }
    } catch (e) {}
    // 拉取实时汇率（GitHub Actions 定时抓取中行官网写入 rate.json）
    fetch(USD_RATE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('汇率接口不可用')))
      .then(j => {
        const v = parseFloat(j.rate);
        if (!isNaN(v) && v > 0) {
          rateState.live = v;
          rateState.liveTime = j.time || '';
          rateState.liveSource = j.source || '中国银行';
        }
        renderRateBar(); render();
      })
      .catch(() => {
        // 实时抓取失败：退回内置默认值，不影响报价
        rateState.live = null;
        renderRateBar();
      });
    renderRateBar();
  }

  function renderRateBar() {
    if (!els.rateBar) return;
    const r = effectiveRate();
    const mode = rateState.manual ? '手动' : (rateState.live ? '实时' : '默认');
    const tm = rateState.liveTime ? `（${rateState.liveTime}）` : '';
    els.rateLive.textContent = `${r.toFixed(2)}（每100美元） · ${mode}${tm}${rateState.manual && rateState.live ? ` · 实时 ${rateState.live.toFixed(2)}` : ''}`;
  }

  // ---------- 贸易术语（EXW/FOB/CIF） ----------
  function initTradeTerm() {
    try {
      const t = localStorage.getItem(TERM_KEY);
      if (TRADE_TERMS.includes(t)) termState.term = t;
      const f = parseFloat(localStorage.getItem(TERM_KEY_FOB));
      if (!isNaN(f) && f >= 0) termState.fobUsd = f;
      const c = parseFloat(localStorage.getItem(TERM_KEY_CIF));
      if (!isNaN(c) && c >= 0) termState.cifUsd = c;
    } catch (e) {}
    els.termRadios.forEach(r => { r.checked = (r.value === termState.term); });
    els.fobSurcharge.value = termState.fobUsd > 0 ? String(termState.fobUsd) : '';
    els.cifSurcharge.value = termState.cifUsd > 0 ? String(termState.cifUsd) : '';
  }
  // 当前术语的美元加价（$/吨）；EXW=0
  function termSurchargeUsd() {
    if (termState.term === 'FOB') return termState.fobUsd || 0;
    if (termState.term === 'CIF') return termState.cifUsd || 0;
    return 0;
  }
  // 按术语算最终人民币价（EXW 原价；FOB/CIF = EXW + 美元加价×汇率）
  function termPriceWith(cny, surchargeUsd) {
    const r = PricingEngine.addUsdSurcharge(cny, surchargeUsd || 0, effectiveRate());
    return r ? r.cny : cny;
  }
  function termPrice(cny) { return termPriceWith(cny, termSurchargeUsd()); }
  function termPriceUsd(cny) { return usd(termPrice(cny)); }

  // ---------- 附加费用（运营费/资金占用利息/利润，人民币/吨） ----------
  function initExtras() {
    ['opFee', 'interest', 'profit'].forEach(k => {
      try {
        const saved = JSON.parse(localStorage.getItem(EXTRA_KEYS[k]) || 'null');
        if (saved && typeof saved.on === 'boolean') {
          extrasState[k].on = saved.on;
          extrasState[k].val = (typeof saved.val === 'number' && saved.val > 0) ? saved.val : 0;
        }
      } catch (e) {}
      const it = els.extraItems[k];
      it.on.checked = extrasState[k].on;
      it.val.disabled = !extrasState[k].on;
      it.val.value = extrasState[k].val > 0 ? String(extrasState[k].val) : '';
      it.item.classList.toggle('disabled', !extrasState[k].on);
    });
  }
  // 已勾选的附加费用合计（人民币/吨）
  function extraTotal() {
    let t = 0;
    for (const k of ['opFee', 'interest', 'profit']) {
      if (extrasState[k].on && extrasState[k].val > 0) t += extrasState[k].val;
    }
    return t;
  }
  // 最终人民币价 = 术语价 + 附加费用合计；FOB/CIF 时美元 = 最终人民币/汇率
  function finalPrice(cny) { return termPrice(cny) + extraTotal(); }
  function finalPriceUsd(cny) { return usd(finalPrice(cny)); }
  // 不含税最终单价（术语加价+附加费）——导出主表与总价条统一口径
  function finalNoTax(cnyNoTax) { return termPrice(cnyNoTax) + extraTotal(); }

  function renderStats() {
    const sr = results.filter(r => r.success);
    els.totalC.textContent = dataItems.length;
    els.okC.textContent = sr.length;
    els.errC.textContent = results.filter(r => !r.success).length;
    if (sr.length > 0) {
      const sp = sr.map(r => (r.detail && r.detail.calcMode === 'sheet') ? ((r.detail.sheetTotalSaleNoTax != null ? r.detail.sheetTotalSaleNoTax : r.detail.sheetTotal) || 0) : finalPrice(r.detail.saleTax));
      const mn = Math.min(...sp), mx = Math.max(...sp);
      if (termState.term === 'EXW') {
        els.minP.textContent = mn.toLocaleString() + '  /  ' + fmtUsd(usd(mn));
        els.maxP.textContent = mx.toLocaleString() + '  /  ' + fmtUsd(usd(mx));
      } else {
        // FOB/CIF 只显示美金
        els.minP.textContent = fmtUsd(usd(mn));
        els.maxP.textContent = fmtUsd(usd(mx));
      }
    } else { els.minP.textContent = '-'; els.maxP.textContent = '-'; }
    els.expBtn.disabled = els.expBtn2.disabled = sr.length === 0;
    els.calcBtn.disabled = dataItems.length === 0;
    if (dataItems.length > 0) { els.emptyState.style.display = 'none'; els.resultCard.style.display = 'block'; }
    else { els.emptyState.style.display = 'block'; els.resultCard.style.display = 'none'; }
  }

  // 总价（所有数据总计，按导入重量；不含税口径与导出一致）；FOB/CIF 只显示美金
  function renderTotal() {
    if (!els.totalBar) return;
    const sr = results.filter(r => r.success);
    if (sr.length === 0) { els.totalValue.textContent = '-'; els.totalValue.classList.add('total-muted'); return; }
    const hasSheet = sr.some(r => r.detail && r.detail.calcMode === 'sheet');
    if (hasSheet) {
      const sum = sr.reduce((a, r) => a + ((r.detail.sheetTotalSaleNoTax != null ? r.detail.sheetTotalSaleNoTax : r.detail.sheetTotal) || 0), 0);
      const sumTax = sr.reduce((a, r) => a + ((r.detail.sheetTotalSaleTax != null ? r.detail.sheetTotalSaleTax : r.detail.sheetTotalTax) || 0), 0);
      els.totalValue.classList.remove('total-muted');
      els.totalValue.innerHTML = `<div>不含税售价 ¥${sum.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})} / ${fmtUsd(usd(sum))}</div><div>含税售价 ¥${sumTax.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})} / ${fmtUsd(usd(sumTax))}</div>`;
      return;
    }
    const cnyArr = [], wArr = [];
    sr.forEach(r => {
      cnyArr.push(finalNoTax(r.detail.saleNoTax));
      const w = r.detail.weight;
      wArr.push(w != null && w > 0 ? w : 0);
    });
    const t = PricingEngine.calcTotal(cnyArr, wArr, effectiveRate());
    if (!t || t.count === 0) {
      els.totalValue.textContent = '在导入的表格中填写重量(吨)后自动计算';
      els.totalValue.classList.add('total-muted');
      return;
    }
    const extraHint = t.count < sr.length ? '（' + (sr.length - t.count) + ' 行未填重量）' : '';
    els.totalValue.classList.remove('total-muted');
    els.totalValue.textContent = (termState.term === 'EXW'
      ? `¥${Math.round(t.cny).toLocaleString()}  /  ${fmtUsd(t.usd)}`
      : `${fmtUsd(t.usd)}`) + extraHint;
  }

  function renderTable() {
    const h = [];
    dataItems.forEach((item, i) => {
      const idx = i + 1, r = results[i];
      const isErr = r && !r.success, isOk = r && r.success;
      const d = r?.detail;

      h.push(`<tr class="${isErr ? 'error-row' : 'main-row'}">`);
      h.push(isOk ? `<td><button class="expand-btn" id="expand-btn-${idx}" onclick="App.toggleExpand(${idx})">▶</button></td>` : '<td></td>');
      h.push(`<td><div class="index-cell"><span class="index-num">${idx}</span></div></td>`);
      h.push(`<td>${item.origin || '<span style="color:var(--text-muted)">-</span>'}</td>`);
      let mat = item.material || '';
      if (item.isYanYan) mat += ' <span class="tag tag-yanyan">压延</span>';
      h.push(`<td>${mat}</td>`);
      h.push(`<td>${item.surface || '<span style="color:var(--text-muted)">2B</span>'}</td>`);
      h.push(`<td>${fmtThk(item.thickness)}</td><td>${item.width}</td>`);
      h.push(`<td>${(item.length||'C') === 'C' ? '<span style="color:#5b21b6;font-weight:600">C</span>' : item.length}</td>`);
      const isCoil = String(item.length || 'C').trim().toUpperCase() === 'C';
      const pk = item.packing || '';
      h.push(isSheetMode()
        ? `<td><select class="packing-select" onchange="App.setPacking(${idx}, this.value)" style="font-size:12px;padding:2px 4px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);">
            <option value="" ${!pk ? 'selected' : ''}>请选择</option>
            ${['木架','出口木箱','密封木箱','出口铁架','出口铁箱'].map(o => `<option value="${o}" ${pk === o ? 'selected' : ''}>${o}</option>`).join('')}
          </select></td>`
        : `<td>${isCoil
          ? '<span style="color:var(--text-muted)">-</span>'
          : `<select class="packing-select" onchange="App.setPacking(${idx}, this.value)" style="font-size:12px;padding:2px 4px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);">
              <option value="" ${!pk ? 'selected' : ''}>请选择</option>
              <option value="木架" ${pk === '木架' ? 'selected' : ''}>木架</option>
              <option value="出口木箱" ${pk === '出口木箱' ? 'selected' : ''}>出口木箱</option>
              <option value="密封木箱" ${pk === '密封木箱' ? 'selected' : ''}>密封木箱</option>
              <option value="出口铁架" ${pk === '出口铁架' ? 'selected' : ''}>出口铁架</option>
              <option value="出口铁箱" ${pk === '出口铁箱' ? 'selected' : ''}>出口铁箱</option>
            </select>`}</td>`);
      const wgt = d && d.weight != null ? d.weight : (item.weight || null);
      h.push(d && d.calcMode === 'sheet'
        ? `<td><span style="color:var(--accent);font-weight:600">${d.quantity || 1}</span></td>`
        : `<td>${wgt != null ? wgt : '<span style="color:var(--text-muted)">-</span>'}</td>`);
      h.push(`<td>${item.film1 || '<span style="color:var(--text-muted)">-</span>'}</td>`);
      h.push(`<td>${item.film2 || '<span style="color:var(--text-muted)">-</span>'}</td>`);
      if (isOk) {
        if (d && d.calcMode === 'sheet') {
          const uSheet = usd(d.sheetSaleNoTax != null ? d.sheetSaleNoTax : d.sheetPrice);
          const uTax = usd(d.sheetSaleTax != null ? d.sheetSaleTax : d.sheetPriceTax);
          const uTotal = usd(d.sheetTotalSaleNoTax != null ? d.sheetTotalSaleNoTax : d.sheetTotal);
          const qty = d.quantity || 1;
          const taxCell = `${(d.sheetSaleTax != null ? d.sheetSaleTax : d.sheetPriceTax).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}<div class=\"usd-sub\">${fmtUsd(uTax)}</div><div class=\"exw-sub\">×${qty}张 ${(d.sheetTotalSaleTax != null ? d.sheetTotalSaleTax : d.sheetTotalTax).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>`;
          const noTaxCell = `${(d.sheetSaleNoTax != null ? d.sheetSaleNoTax : d.sheetPrice).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}<div class=\"usd-sub\">${fmtUsd(uSheet)}</div><div class=\"exw-sub\">×${qty}张 ${(d.sheetTotalSaleNoTax != null ? d.sheetTotalSaleNoTax : d.sheetTotal).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>`;
          h.push(`<td><span class="tag tag-${d.edgeType}">${d.edgeType === 'rough' ? '毛边' : '齐边'}</span> <span class="tag tag-sheet">板</span></td>`);
          h.push(`<td class="price-cell price-sale"><span class="term-tag">含税</span>${taxCell}</td>`);
          h.push(`<td class="price-cell price-subtle"><span class="term-tag">单张</span>${noTaxCell}</td>`);
        } else {
        const tSaleTax = finalPrice(d.saleTax), tSaleNoTax = finalPrice(d.saleNoTax);
        const uSaleTax = usd(tSaleTax), uSaleNoTax = usd(tSaleNoTax);
        const isExw = termState.term === 'EXW';
        // FOB/CIF 只显示美金；EXW 显示人民币 + 美金（均含附加费用）
        const taxCell = isExw
          ? `${Math.round(tSaleTax).toLocaleString()}<div class="usd-sub">${fmtUsd(uSaleTax)}</div>`
          : `<div class="usd-sub">${fmtUsd(uSaleTax)}</div>`;
        const noTaxCell = isExw
          ? `${Math.round(tSaleNoTax).toLocaleString()}<div class="usd-sub">${fmtUsd(uSaleNoTax)}</div>`
          : `<div class="usd-sub">${fmtUsd(uSaleNoTax)}</div>`;
        const exwRef = !isExw
          ? `<div class="exw-sub">EXW ¥${d.saleTax.toLocaleString()} / ${fmtUsd(usd(d.saleTax))}</div>` : '';
        const extraRef = extraTotal() > 0
          ? `<div class="exw-sub">含附加费 ${extraTotal().toLocaleString()} 元/吨</div>` : '';
        h.push(`<td class="price-cell price-cost">${d.costTax.toLocaleString()}</td>`);
        h.push(`<td class="price-cell price-subtle">${d.costNoTax.toLocaleString()}</td>`);
        h.push(`<td><span class="tag tag-${d.edgeType}">${d.edgeType === 'rough' ? '毛边' : '齐边'}</span> <span class="tag tag-${d.boardType}">${d.boardType === 'coil' ? '卷' : '板'}</span></td>`);
        h.push(`<td class="price-cell price-sale"><span class="term-tag">${termState.term}</span>${taxCell}${extraRef}${exwRef}</td>`);
        h.push(`<td class="price-cell price-subtle"><span class="term-tag">${termState.term}</span>${noTaxCell}${extraRef}${exwRef}</td>`);
        }
      } else if (isErr) { h.push(`<td colspan="6" class="error-text">⚠️ ${r.errors.join('；')}</td>`); }
      else { h.push(`<td colspan="6" style="color:var(--text-muted);font-size:12px">待计算</td>`); }
      h.push(`<td><button class="btn-icon btn-ghost delete-btn" onclick="App.removeRow(${idx})">✕</button></td></tr>`);

      if (isOk) {
        h.push(`<tr class="detail-row" id="detail-${idx}"><td colspan="17"><div class="detail-content">`);
        h.push(renderBreakdown(d, item));
        h.push('</div></td></tr>');
      }
    });
    els.tBody.innerHTML = h.join('');
  }

  const fmt = (v) => v.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmtI = (v) => v.toLocaleString();
  const fmtThk = (v) => { const s = String(v == null ? '' : v).trim(); if (!s) return ''; if (/\d\s*[-~—–]\s*\d/.test(s)) return s; const n = parseFloat(s); return isNaN(n) ? s : n.toFixed(2); };

  function renderSheetBreakdown(d, item) {
    const spec = `${fmtThk(d.thickness)} × ${d.width} × ${d.length}`;
    const mat = d.material + (d.isYanYan ? ' 压延料' : '');
    const bt = (d.edgeType === 'rough' ? '毛边' : '齐边') + '平板';
    const hd = `规格：${spec}　～　产地：${item.origin||''}　～　材质：${mat}　～　表面：${d.surface}　～　类型：${bt}`;
    const edgeTxt = `${d.edgeType === 'rough' ? '毛边' : '切边'}${d.width === 1000 ? '（1000mm 特殊+400）' : ''}`;
    const filmSqm = (d.film1FeeSqm || 0) + (d.film2FeeSqm || 0);
    const filmTxt = [d.film1, d.film2].filter(Boolean).join(' + ');
    const qty = d.quantity || 1;
    // v1.0.106：包装/装柜/FOB均摊（按单张重量 kg）
    const pp = d.packingPerSheet || 0;
    const cp = d.containerPerSheet || 0;
    const tp = d.termPerSheet || 0;
    const ex = d.extraPerSheet || 0;
    const packLabel = d.packingName || d.packing || '';
    const packPerKg = d.packingFee ? (d.packingFee / 1000) : 0;
    const termLabel = d.term || 'EXW';
    let html = `<div style="margin-bottom:12px;font-size:12px;color:var(--text-secondary);font-weight:500;">${hd}</div><div class="calc-breakdown"><div class="calc-section"><div class="calc-section-title">单张计算（售价 = 成本 + 包装/装柜/FOB均摊，按张计价）</div>`;
    html += `<div class="calc-step"><span class="calc-step-label">① 材料费：(基价 ${fmtI(d.basePrice)}×0.93 + 厚度加价 ${fmtI(d.thickSurcharge)} + 边部费用 ${fmtI(d.edgeFee)}（${edgeTxt}）/1000 × 体积 ${d.sheetVolume}m³ × 密度 ${d.density}g/cm³</span><span class="calc-step-value positive">+${fmt(d.sheetMaterialCost)} 元</span></div>`;
    html += `<div class="calc-step"><span class="calc-step-label">② 单张加工费：面积 ${fmt(d.sheetArea)}㎡ × ${fmt(d.surfaceFeeSqm)}元/㎡${d.normSurface === '2B' ? '（2B 无加工费）' : ''}</span><span class="calc-step-value ${d.sheetSurfaceCost > 0 ? 'positive' : 'zero'}">${d.sheetSurfaceCost > 0 ? '+' + fmt(d.sheetSurfaceCost) : '0'} 元</span></div>`;
    if (d.linenFeePerTon) {
      const embossList = (d.embossFees && d.embossFees.length) ? d.embossFees : [{ name: '小珠光(linen)', feePerTon: d.linenFeePerTon }];
      for (const e of embossList) {
        const perSheet = Math.round(e.feePerTon / 1000 * (d.sheetWeightKg || 0) * 1000) / 1000;
        html += `<div class="calc-step"><span class="calc-step-label">③ 压花工艺（${e.name}）：${e.feePerTon}元/吨 ÷ 1000 × ${fmt(d.sheetWeightKg)}kg</span><span class="calc-step-value ${perSheet > 0 ? 'positive' : 'zero'}">${perSheet > 0 ? '+' + fmt(perSheet) : '0'} 元</span></div>`;
      }
    }
    html += `<div class="calc-step"><span class="calc-step-label">④ 膜费：面积 ${fmt(d.sheetArea)}㎡ × ${filmSqm}元/㎡${filmTxt ? '（' + filmTxt + '）' : ''}</span><span class="calc-step-value ${d.sheetFilmCost > 0 ? 'positive' : 'zero'}">${d.sheetFilmCost > 0 ? '+' + fmt(d.sheetFilmCost) : '0'} 元</span></div>`;
    html += `<div class="calc-step"><span class="calc-step-label">单张价格（成本）</span><span class="calc-step-value positive">${fmt(d.sheetPrice)} 元/张</span></div>`;
    // v1.0.106 均摊三项
    html += `<div class="calc-step"><span class="calc-step-label">包装均摊：${packLabel || '?'} ${fmtI(d.packingFee || 0)}元/吨 = ${packPerKg}元/kg × ${fmt(d.sheetWeightKg)}kg</span><span class="calc-step-value ${pp > 0 ? 'positive' : 'zero'}">${pp > 0 ? '+' + fmt(pp) : '0'} 元/张</span></div>`;
    html += `<div class="calc-step"><span class="calc-step-label">装柜均摊：50元/吨 = 0.05元/kg × ${fmt(d.sheetWeightKg)}kg</span><span class="calc-step-value ${cp > 0 ? 'positive' : 'zero'}">${cp > 0 ? '+' + fmt(cp) : '0'} 元/张</span></div>`;
    html += `<div class="calc-step"><span class="calc-step-label">${termLabel}均摊：${d.termUsd || 0}$ × 汇率${d.usdRate || 0} = ${fmtI(d.termPerTon || 0)}元/吨 → ${d.termPerTon ? (d.termPerTon / 1000) : 0}元/kg × ${fmt(d.sheetWeightKg)}kg</span><span class="calc-step-value ${tp > 0 ? 'positive' : 'zero'}">${tp > 0 ? '+' + fmt(tp) : '0'} 元/张</span></div>`;
    html += `<div class="calc-step"><span class="calc-step-label">均摊合计：${fmt(pp)} + ${fmt(cp)} + ${fmt(tp)}</span><span class="calc-step-value positive">+ ${fmt(ex)} 元/张</span></div>`;
    html += `<div class="calc-step"><span class="calc-step-label">不含税售价：${fmt(d.sheetPrice)} + ${fmt(ex)}</span><span class="calc-step-value positive">= ${fmt(d.sheetSaleNoTax)} 元/张</span></div>`;
    html += `<div class="calc-step"><span class="calc-step-label">含税售价（不含税 ÷ 0.91）：${fmt(d.sheetSaleNoTax)} ÷ 0.91</span><span class="calc-step-value positive">= ${fmt(d.sheetSaleTax)} 元/张</span></div>`;
    html += `<div class="calc-step"><span class="calc-step-label">数量 × 不含税售价</span><span class="calc-step-value positive">${qty} 张 × ${fmt(d.sheetSaleNoTax)} = ${fmt(d.sheetTotalSaleNoTax)} 元</span></div>`;
    html += `<div class="calc-step"><span class="calc-step-label">数量 × 含税售价</span><span class="calc-step-value positive">${qty} 张 × ${fmt(d.sheetSaleTax)} = ${fmt(d.sheetTotalSaleTax)} 元</span></div>`;
    html += `<div class="calc-step"><span class="calc-step-label">单张重量</span><span class="calc-step-value zero">${fmt(d.sheetWeightKg)} kg</span></div>`;
    html += '<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">包装/装柜/FOB均摊 = 元/吨 ÷ 1000 = 元/kg × 单张重量kg（包装5档：木架100/出口木箱150/密封木箱250/出口铁架200/出口铁箱250元/吨，装柜固定50元/吨，FOB/CIF 按当天汇率×美元价）</div>';
    html += '</div></div>';
    return html;
  }

  function renderBreakdown(d, item) {
    if (d && d.calcMode === 'sheet') return renderSheetBreakdown(d, item);
    const spec = `${fmtThk(d.thickness)} × ${d.width} × ${d.length}`;
    const mat = d.material + (d.isYanYan ? ' 压延料' : '');
    const bt = (d.edgeType === 'rough' ? '毛边' : '齐边') + (d.boardType === 'coil' ? '卷板' : '平板');
    // 销售加价标签（2026-08-22 用户规则：平板标注 材质/宽度/长度区间/包装，方便区分检查）
    let markupLabel = bt;
    if (d.boardType === 'sheet' && d.packing) {
      const w = d.width;
      const L = parseFloat(d.length);
      let bands;
      if (w === 1030 || w === 1000) bands = SHEET_LENGTH_BANDS_NARROW;
      else if (w === 1500 || w === 1530 || w === 1524) bands = SHEET_LENGTH_BANDS_WIDE;
      else bands = SHEET_LENGTH_BANDS;
      const band = bands.find(b => L >= b.min && L <= b.max);
      const bandTxt = band ? (band.min + '-' + band.max) : String(d.length);
      markupLabel = `${d.material} ${w}${d.edgeType === 'rough' ? '毛边' : '齐边'} 长${bandTxt}（${d.packing}）`;
    } else if (d.boardType === 'sheet') {
      markupLabel = bt + '（未填包装）';
    }
    const hd = `规格：${spec}　｜　产地：${item.origin||''}　｜　材质：${mat}　｜　表面：${d.surface}　｜　类型：${bt}`;

    let html = `<div style="margin-bottom:12px;font-size:12px;color:var(--text-secondary);font-weight:500;">${hd}</div><div class="calc-breakdown"><div class="calc-section"><div class="calc-section-title">含税成本计算过程</div>`;
    html += step('① 基价', d.basePrice, '元/吨', true);
    html += step(`② 厚度加价 (${fmtThk(d.thickness)}mm, ${d.thickTable})`, d.thickSurcharge, '元/吨', d.thickSurcharge > 0);
    if (d.widthSurcharge > 0) {
      html += step(`   宽度加价 (${fmtThk(d.width)}mm × ${fmtThk(d.width)}mm)`, d.widthSurcharge, '元/吨', true);
    }
    if (d.surfaceFeeSqm > 0) html += step(`③ 表面加工费 (${d.normSurface || d.surface}, ${fmt(d.surfaceFeeSqm)}元/² × ${fmt(d.sqmPerTon)}²/吨)`, d.surfaceFeePerTon, '元/吨', true);
    else if (d.surfaceFeePerTon > 0) html += step(`③ 表面加工费 (${d.normSurface || d.surface})`, d.surfaceFeePerTon, '元/吨', true);
    else html += step(`③ 表面加工费 (${d.normSurface || d.surface})`, 0, '', false);
    // v1.0.120 压花工艺明细（表面加工+压花 分开显示，如 6K+linen → 6K加工费 + 小珠光压花300元/吨）
    if (d.linenFeePerTon) {
      const embossList = (d.embossFees && d.embossFees.length) ? d.embossFees : [{ name: '小珠光(linen)', feePerTon: d.linenFeePerTon }];
      for (const e of embossList) html += step(`④ 压花工艺（${e.name}）`, e.feePerTon, '元/吨', true);
    }
    let stepN = d.linenFeePerTon ? 5 : 4;
    if (d.afpPerTon) html += step(`④ 抗指纹${d.afpFeeSqm === 5 ? '(哑光)' : '(亮光)'}`, d.afpPerTon, '元/吨', true);
    if (d.film1PerTon > 0) html += step(`⑤ 保护膜1 (${d.film1}, ${d.film1FeeSqm}元/² × ${fmt(d.sqmPerTon)}²/吨)`, d.film1PerTon, '元/吨', true);
    else html += step(`⑤ 保护膜1`, 0, '', false);
    if (d.film2PerTon > 0) html += step(`⑥ 保护膜2 (${d.film2}, ${d.film2FeeSqm}元/² × ${fmt(d.sqmPerTon)}²/吨)`, d.film2PerTon, '元/吨', true);
    else if (d.film2?.trim()) html += step(`⑥ 保护膜2`, 0, '', false);
    html += total('含税成本小计', d.costRaw, 'tax');
    html += total('四舍五入 (十位)', d.costTax, 'tax');
    html += '</div><div class="calc-section"><div class="calc-section-title">不含税售价（2026-08-22 规则：(基价+厚度加价)×0.92 + 表面 + 膜 + 加价）</div>';
    html += step(`(基价 ${fmtI(d.basePrice)} + 厚度加价 ${fmtI(d.thickSurcharge)}) × 0.92`, d.materialNoTaxRaw, '元/吨', true);
    html += step('+ 表面加工费（含纹路/AFP）', d.surfaceFeePerTon + (d.linenFeePerTon || 0) + (d.afpPerTon || 0), '元/吨', true);
    html += step('+ 膜费', (d.film1PerTon || 0) + (d.film2PerTon || 0), '元/吨', true);
    const mkExtra = d.markupDetail ? (d.markupDetail.group === 'sheet'
      ? ' = 边部加价(' + d.markupDetail.label + ')' + d.markupDetail.edgeFee + ' + ' + (d.markupDetail.rackLabel || '木架') + d.markupDetail.rackFee + ' + 装柜' + d.markupDetail.packFee + ' + 加工损耗' + d.markupDetail.lossFee
      : ' = ' + d.markupDetail.label + '加价' + d.markupDetail.edgeFee + ' + 包装费用' + d.markupDetail.packingFee + ' + 装柜费用' + d.markupDetail.containerFee) : '';
    html += step('+ 销售加价(' + markupLabel + ')' + mkExtra, d.markup, '元/吨', d.markup > 0);
    html += total('不含税售价（十位取整）', d.saleNoTax, 'sale');
    html += total('含税售价', d.saleTax, 'sale');
    html += '</div><div class="calc-section"><div class="calc-section-title">贸易术语（不含税售价；EXW 人民币+美元，FOB/CIF 仅美元）</div>';
    html += termRow('EXW', d.saleNoTax, 0);
    html += termRow('FOB', d.saleNoTax, termState.fobUsd || 0);
    html += termRow('CIF', d.saleNoTax, termState.cifUsd || 0);
    // 附加费用（勾选生效）
    html += '<div class="calc-section-title">附加费用（元/吨，勾选生效）</div>';
    html += extraRow('公司运营费', extrasState.opFee);
    html += extraRow('资金占用利息', extrasState.interest);
    html += extraRow('利润', extrasState.profit);
    const ex = extraTotal();
    html += `<div class="calc-step"><span class="calc-step-label">附加费用合计</span><span class="calc-step-value ${ex > 0 ? 'positive' : 'zero'}">${ex > 0 ? '+' + ex.toLocaleString() : '0'} 元/吨</span></div>`;
    // 最终售价（含附加费）
    const fTax = finalPrice(d.saleNoTax);
    html += `<div class="calc-step final-step"><span class="calc-step-label">最终不含税售价（${termState.term}，含附加费）</span><span class="calc-step-value positive">¥${Math.round(fTax).toLocaleString()} / ${fmtUsd(usd(fTax))}</span></div>`;
    html += '</div></div>';
    return html;
  }

  const step = (l, v, u, p) => `<div class="calc-step"><span class="calc-step-label">${l}</span><span class="calc-step-value ${p?'positive':'zero'}">${p?'+'+fmt(v):'0'} ${u}</span></div>`;
  // 附加费用行：勾选显示 +金额，未勾选显示未启用
  const extraRow = (label, st) => {
    const on = st.on && st.val > 0;
    return `<div class="calc-step"><span class="calc-step-label">${st.on ? '☑' : '☐'} ${label}</span><span class="calc-step-value ${on ? 'positive' : 'zero'}">${on ? '+' + st.val.toLocaleString() : '未启用'} 元/吨</span></div>`;
  };
  // 贸易术语行：EXW 人民币+美元（核验基准）；FOB/CIF 只显示美元；当前术语高亮
  const termRow = (t, saleTax, s) => {
    const isCur = termState.term === t;
    const p = termPriceWith(saleTax, s);
    const val = t === 'EXW'
      ? `¥${Math.round(p).toLocaleString()} / ${fmtUsd(usd(p))}`
      : fmtUsd(usd(p));
    return `<div class="calc-step term-row${isCur ? ' term-cur' : ''}"><span class="calc-step-label">${t}${s > 0 ? `（+$${s}/吨）` : ''}${isCur ? ' ◀ 当前' : ''}</span><span class="calc-step-value positive">${val}</span></div>`;
  };
  const total = (l, v, t) => {
    const u = usd(v);
    const usdPart = t === 'sale' && u != null ? ` <span class="calc-total-usd">${fmtUsd(u)}</span>` : '';
    return `<div class="calc-total"><span class="calc-total-label">${l}</span><span class="calc-total-value ${t}">${fmtI(v)} 元/吨${usdPart}</span></div>`;
  };

  function showToast(msg, type = 'info') {
    const c = dom('toastContainer');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<span>${{success:'✅',error:'❌',info:'ℹ️'}[type]||''}</span> ${msg}`;
    c.appendChild(t);
    setTimeout(() => { t.style.animation = 'toastIn 0.3s ease reverse'; setTimeout(() => t.remove(), 300); }, 3500);
  }

  return { init, removeRow, toggleExpand, setPacking, setPackingFee };
})();

document.addEventListener('DOMContentLoaded', App.init);

