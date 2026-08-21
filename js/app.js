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
  let priceOverrides = { filmFees: {}, surfaceFees: {}, filmLocked: {}, surfaceLocked: {} };

  // ========== 基价计算 ==========
  function getMaterialPrice(origin, material, surface, width, thickness) {
    // 400系：查独立基价表（按产地+材质），410S/BA 是一个整体材质名
    if (origin && material) {
      const normMat = normalize400Material(material);
      if (PRODUCTS_400.some(p => p.origin === origin && p.material === normMat)) {
        const key = origin + '-' + normMat;
        return prices400[key] || null;
      }
    }
    if (material === '304' || material.startsWith('304')) {
      const p = originPrices304[origin];
      return (p && p > 0) ? p : null;
    }
    if (material === '316L') {
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
    renderPriceReference();
    // 更新版本号
    const vb = document.getElementById('versionBadge');
    if (vb && typeof APP_VERSION !== 'undefined') vb.textContent = 'v' + APP_VERSION;
    const fv = document.getElementById('footerVersion');
    if (fv && typeof APP_VERSION !== 'undefined') fv.textContent = 'v' + APP_VERSION;
    // 材质标签动态化
    const mb = document.getElementById('materialBadge');
    if (mb) {
      mb.textContent = '201/304 全系列';
      mb.className = 'badge badge-accent';
    }
    updateAllDerived();
    render();
  }

  function cacheDom() {
    els.calcBtn = dom('calculateBtn'); els.expBtn = dom('exportBtn'); els.expBtn2 = dom('exportBtn2');
    els.clearBtn = dom('clearBtn'); els.addBtn = dom('addManualBtn');
    els.fileInput = dom('fileInput'); els.tBody = dom('resultBody');
    els.emptyState = dom('emptyState'); els.resultCard = dom('resultCard');
    els.totalC = dom('totalCount'); els.okC = dom('successCount'); els.errC = dom('errorCount');
    els.minP = dom('minSaleTax'); els.maxP = dom('maxSaleTax');
    els.freeText = dom('freeText'); els.parseTextBtn = dom('parseTextBtn');
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
        if (btn.dataset.config === 'reference') renderPriceReference();
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
        <span class="oderived" style="margin-left:4px;font-size:12px;color:var(--text-secondary);">
          ${price304 > 0 ? `基价: <b>${price304.toLocaleString()}</b>` : '<span class="oderived-hint">请填写基价</span>'}
        </span>
      `;
      els.originRows304.appendChild(div);
    });
    bindOriginInputs('.origin-304-input', originPrices304);
    document.querySelectorAll('.o-lock[data-mat="304"]').forEach(btn => {
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
        <span class="oderived" style="margin-left:4px;font-size:12px;color:var(--text-secondary);">
          ${price316L > 0 ? `基价: <b>${price316L.toLocaleString()}</b>` : '<span class="oderived-hint">请填写基价</span>'}
        </span>
      `;
      els.originRows316L.appendChild(div);
    });
    bindOriginInputs('.origin-316L-input', originPrices316L);
    document.querySelectorAll('.o-lock[data-mat="316L"]').forEach(btn => {
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

  // ========== 400系基价 ==========
  function get400Key(origin, material) { return origin + '-' + material; }

  function savePrices400() {
    try { localStorage.setItem('kk_prices_400', JSON.stringify(prices400)); }
    catch (e) { /* ignore */ }
  }
  function loadPrices400() {
    try {
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
    document.querySelectorAll('.p400-row .o-lock').forEach(btn => {
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
      priceOverrides.filmLocked = data.filmLocked || {};
      priceOverrides.surfaceLocked = data.surfaceLocked || {};
    } catch (e) { /* ignore */ }
  }

  function renderFilmConfig() {
    const wrap = dom('filmConfigTable');
    if (!wrap) return;
    let html = '<table><thead><tr><th>保护膜名称</th><th>单价(元/平米)</th><th>默认</th><th></th></tr></thead><tbody>';
    for (const [name, defaultPrice] of Object.entries(FILM_FEES)) {
      const val = priceOverrides.filmFees[name] ?? defaultPrice;
      const locked = !!priceOverrides.filmLocked[name];
      html += `<tr>
        <td><span class="cfg-name">${name}</span></td>
        <td><input type="number" class="cfg-price-input film-price-inp" data-name="${name}" value="${val}" step="0.1" ${locked ? 'readonly' : ''}></td>
        <td><span class="cfg-default">${defaultPrice}</span></td>
        <td><button class="cfg-lock-btn ${locked ? 'locked' : ''}" data-name="${name}" data-type="film">${locked ? '🔒' : '🔓'}</button></td>
      </tr>`;
    }
    html += '</tbody></table>';
    wrap.innerHTML = html;

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

  function renderSurfaceConfig() {
    const wrap = dom('surfaceConfigTable');
    if (!wrap) return;
    const surfOrder = [
      { display: '2B', key: '2B' },
      { display: 'NO.4', key: 'NO.4' },
      { display: 'HL', key: 'HL' },
      { display: '单面抛光', key: '单面抛光' },
      { display: '双面抛光', key: '双面抛光' },
      { display: '6K', key: '6K' },
      { display: '双面6K', key: '双面6K' },
      { display: '8K', key: '8K' },
      { display: '双面8K', key: '双面8K' },
      // 8K 彩色
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
      // 砂面/拉丝 合并
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
      { display: '砂面/拉丝(NO.4/HL)黑钛金哑光无指纹(板)', key: '拉丝黑钛金哑光无指纹' },
      // ===== 卷材 =====
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
    let html = '<table><thead><tr><th>表面名称</th><th>覆盖价(元/平米)</th><th>阶梯默认价</th><th></th></tr></thead><tbody>';
    surfOrder.forEach(item => {
      const cfgKey = item.key || item.keys[0];
      const cfg = SURFACE_FEES[cfgKey];
      if (!cfg) return;
      const names = item.key ? item.key : item.keys.join(',');
      const display = item.display;
      if (typeof cfg === 'object' && cfg.price !== undefined && !Array.isArray(cfg)) {
        const defaultPrice = cfg.price;
        const val = priceOverrides.surfaceFees[cfgKey] ?? defaultPrice;
        const locked = !!priceOverrides.surfaceLocked[cfgKey];
        html += `<tr>
          <td><span class="cfg-name">${display}</span></td>
          <td><input type="number" class="cfg-price-input surf-price-inp" data-names="${names}" value="${val}" step="0.5" ${locked ? 'readonly' : ''}></td>
          <td><span class="cfg-default">${defaultPrice}</span></td>
          <td><button class="cfg-lock-btn ${locked ? 'locked' : ''}" data-names="${names}" data-type="surf">${locked ? '🔒' : '🔓'}</button></td>
        </tr>`;
      } else if (Array.isArray(cfg)) {
        const tiers = cfg.filter(t => t.unit === 'sqm' || !t.unit);
        if (tiers.length === 0) return;
        const tierDesc = tiers.map(t => `${t.tMin}-${t.tMax}mm: ${t.price}元`).join(' / ');
        const val = priceOverrides.surfaceFees[cfgKey] ?? tiers[0].price;
        const locked = !!priceOverrides.surfaceLocked[cfgKey];
        html += `<tr>
          <td><span class="cfg-name">${display}</span></td>
          <td><input type="number" class="cfg-price-input surf-price-inp" data-names="${names}" value="${val}" step="0.5" ${locked ? 'readonly' : ''}></td>
          <td><span class="cfg-default">${tierDesc}</span></td>
          <td><button class="cfg-lock-btn ${locked ? 'locked' : ''}" data-names="${names}" data-type="surf">${locked ? '🔒' : '🔓'}</button></td>
        </tr>`;
      }
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;

    // 绑定输入事件 (支持合并名)
    wrap.querySelectorAll('.surf-price-inp').forEach(inp => {
      inp.addEventListener('input', () => {
        const names = inp.dataset.names.split(',');
        const v = parseFloat(inp.value) || 0;
        names.forEach(n => { priceOverrides.surfaceFees[n] = v; });
        savePriceOverrides();
      });
    });
    // 绑定锁定事件 (支持合并名)
    wrap.querySelectorAll('.cfg-lock-btn[data-type="surf"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const names = btn.dataset.names.split(',');
        const locked = !priceOverrides.surfaceLocked[names[0]];
        names.forEach(n => { priceOverrides.surfaceLocked[n] = locked; });
        savePriceOverrides();
        renderSurfaceConfig();
      });
    });
  }

  function renderPriceReference() {
    const el = dom('priceReferenceTable');
    if (!el) return;
    let h = [];

    // ===== 1. 厚度加价总表 =====
    h.push('<div class="ref-section"><h3 class="ref-title">📐 厚度加价总表</h3>');
    // 默认表
    h.push('<h4 class="ref-subtitle">宏旺201(正材）</h4>');
    h.push('<table class="ref-table"><tr><th>厚度 (mm)</th><th>加价 (元/吨)</th></tr>');
    THICKNESS_SURCHARGE.forEach(t => {
      h.push(`<tr><td>${t.min}～${t.max}</td><td class="ref-num">+${t.price}</td></tr>`);
    });
    h.push('</table>');
    // 2026-08-21：北港 J5 无厚度加价数据
    h.push('<div style="font-size:11px;font-weight:500;color:var(--text-muted);margin:4px 0 2px;">北港 J5：未提供厚度加价数据，暂不报价（补数据后恢复）</div>');

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
    h.push('<div class="ref-section"><h3 class="ref-title">✨ 表面加工费总表</h3>');
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
    const standardSurfaces = ['2B', '砂面/拉丝(NO.4/HL)', '单面抛光', '双面抛光', '6K', '双面6K', '8K', '双面8K'];

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
        if (cfg) renderSurfaceRows(name, cfg);
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
    h.push('<div class="ref-section"><h3 class="ref-title">🔖 保护膜价格</h3>');
    h.push('<table class="ref-table"><tr><th>膜型号</th><th>单价 (元/㎡)</th></tr>');
    Object.entries(FILM_FEES).forEach(([name, price]) => {
      h.push(`<tr><td>${name}</td><td class="ref-num">${price}</td></tr>`);
    });
    h.push('</table></div>');

    // ===== 4. 辅助参数 =====
    h.push('<div class="ref-section"><h3 class="ref-title">⚙️ 辅助参数</h3>');
    h.push('<table class="ref-table">');
    h.push('<tr><td>密度 (201)</td><td class="ref-num">' + DENSITY['201'] + '</td></tr>');
    h.push('<tr><td>密度 (304)</td><td class="ref-num">' + DENSITY['304'] + '</td></tr>');
    h.push('<tr><td>不含税系数</td><td class="ref-num">0.92</td></tr>');
    h.push('<tr><td>小珠光压花附加费</td><td class="ref-num">' + LINEN_FEE + ' 元/吨</td></tr>');
    h.push('<tr><td>亮光抗指纹 (AFP Bright)</td><td class="ref-num">' + AFP_BRIGHT_FEE + ' 元/㎡</td></tr>');
    h.push('<tr><td>哑光抗指纹 (AFP Matte)</td><td class="ref-num">' + AFP_MATTE_FEE + ' 元/㎡</td></tr>');
    h.push('<tr><td colspan="2" style="padding:4px"></td></tr>');
    h.push('<tr><th>销售加价</th><th class="ref-num">元/吨</th></tr>');
    Object.entries(SALES_MARKUP).forEach(([key, val]) => {
      const label = key === 'rough_coil' ? '毛边卷板' : key === 'trim_coil' ? '齐边卷板' : key === 'rough_sheet' ? '毛边平板' : key === 'trim_sheet' ? '齐边平板' : key;
      h.push(`<tr><td>${label}</td><td class="ref-num">+${val}</td></tr>`);
    });
    h.push('</table></div>');

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
    dataItems.push({ origin, material: mat, isYanYan: yan, surface: surf, thickness: thk, width: wid, length: len || 'C', film1: f1, film2: f2, basePrice: bp });
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
      if (bp && bp > 0) {
        p.basePrice = bp;
        dataItems.push(p);
        count++;
      }
    }
    if (count > 0) {
      results = []; renderOriginGrid();
      showToast(`解析 ${count} 条`, 'success');
      els.freeText.value = '';
      render();
    } else { showToast('未能解析（检查各产地基价是否已设置）', 'error'); }
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
        if (/^201/.test(item.material) && item.material !== '201J5' && PricingEngine.getWidthBand201(w) === null) {
          item._bpError = `宽度 ${isNaN(w) ? (item.width || '?') : w}mm 不在 201 基价档位（1219/1240、1250/1280、1500/1530），请检查宽度或补充对应档位基价`;
        } else {
          item._bpError = `${item.origin || '?'} ${item.material} 基价未设置${isNaN(w) ? '' : `（宽度 ${w}mm 对应档位）`}，请在基价面板填写`;
        }
      }
    });
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
    fetch(USD_RATE_URL + '?t=' + Date.now())
      .then(r => r.ok ? r.json() : Promise.reject(new Error('rate.json 不可用')))
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
      const sp = sr.map(r => finalPrice(r.detail.saleTax));
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
      const wgt = d && d.weight != null ? d.weight : (item.weight || null);
      h.push(`<td>${wgt != null ? wgt : '<span style="color:var(--text-muted)">-</span>'}</td>`);
      h.push(`<td>${item.film1 || '<span style="color:var(--text-muted)">-</span>'}</td>`);
      h.push(`<td>${item.film2 || '<span style="color:var(--text-muted)">-</span>'}</td>`);
      if (isOk) {
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

  function renderBreakdown(d, item) {
    const spec = `${fmtThk(d.thickness)} × ${d.width} × ${d.length}`;
    const mat = d.material + (d.isYanYan ? ' 压延料' : '');
    const bt = (d.edgeType === 'rough' ? '毛边' : '齐边') + (d.boardType === 'coil' ? '卷板' : '平板');
    const hd = `规格：${spec}　｜　产地：${item.origin||''}　｜　材质：${mat}　｜　表面：${d.surface}　｜　类型：${bt}`;

    let html = `<div style="margin-bottom:12px;font-size:12px;color:var(--text-secondary);font-weight:500;">${hd}</div><div class="calc-breakdown"><div class="calc-section"><div class="calc-section-title">含税成本计算过程</div>`;
    html += step('① 基价', d.basePrice, '元/吨', true);
    html += step(`② 厚度加价 (${fmtThk(d.thickness)}mm, ${d.thickTable})`, d.thickSurcharge, '元/吨', d.thickSurcharge > 0);
    if (d.widthSurcharge > 0) {
      html += step(`   宽度加价 (${fmtThk(d.width)}mm × ${fmtThk(d.width)}mm)`, d.widthSurcharge, '元/吨', true);
    }
    if (d.surfaceFeeSqm > 0) html += step(`③ 表面加工费 (${d.surface}, ${fmt(d.surfaceFeeSqm)}元/² × ${fmt(d.sqmPerTon)}²/吨)`, d.surfaceFeePerTon, '元/吨', true);
    else if (d.surfaceFeePerTon > 0) html += step(`③ 表面加工费 (${d.surface})`, d.surfaceFeePerTon, '元/吨', true);
    else html += step(`③ 表面加工费 (${d.surface})`, 0, '', false);
    if (d.linenFeePerTon) html += step(`④ 小珠光压花`, d.linenFeePerTon, '元/吨', true);
    let stepN = d.linenFeePerTon ? 5 : 4;
    if (d.afpPerTon) html += step(`④ 抗指纹${d.afpFeeSqm === 5 ? '(哑光)' : '(亮光)'}`, d.afpPerTon, '元/吨', true);
    if (d.film1PerTon > 0) html += step(`⑤ 保护膜1 (${d.film1}, ${d.film1FeeSqm}元/² × ${fmt(d.sqmPerTon)}²/吨)`, d.film1PerTon, '元/吨', true);
    else html += step(`⑤ 保护膜1`, 0, '', false);
    if (d.film2PerTon > 0) html += step(`⑥ 保护膜2 (${d.film2}, ${d.film2FeeSqm}元/² × ${fmt(d.sqmPerTon)}²/吨)`, d.film2PerTon, '元/吨', true);
    else if (d.film2?.trim()) html += step(`⑥ 保护膜2`, 0, '', false);
    html += total('含税成本小计', d.costRaw, 'tax');
    html += total('四舍五入 (十位)', d.costTax, 'tax');
    html += '</div><div class="calc-section"><div class="calc-section-title">不含税成本 & 销售价</div>';
    html += step(`不含税成本 (${fmtI(d.costRaw)} × 0.92)`, d.costNoTaxRaw, '元/吨', true);
    html += total('四舍五入 (十位)', d.costNoTax, 'notax');
    html += '<div style="height:8px;"></div>';
    html += step(`销售加价 (${bt})`, d.markup, '元/吨', d.markup > 0);
    html += total('含税售价', d.saleTax, 'sale');
    html += total('不含税售价', d.saleNoTax, 'sale');
    html += '</div><div class="calc-section"><div class="calc-section-title">贸易术语（含税售价；EXW 人民币+美元，FOB/CIF 仅美元）</div>';
    html += termRow('EXW', d.saleTax, 0);
    html += termRow('FOB', d.saleTax, termState.fobUsd || 0);
    html += termRow('CIF', d.saleTax, termState.cifUsd || 0);
    // 附加费用（勾选生效）
    html += '<div class="calc-section-title">附加费用（元/吨，勾选生效）</div>';
    html += extraRow('公司运营费', extrasState.opFee);
    html += extraRow('资金占用利息', extrasState.interest);
    html += extraRow('利润', extrasState.profit);
    const ex = extraTotal();
    html += `<div class="calc-step"><span class="calc-step-label">附加费用合计</span><span class="calc-step-value ${ex > 0 ? 'positive' : 'zero'}">${ex > 0 ? '+' + ex.toLocaleString() : '0'} 元/吨</span></div>`;
    // 最终售价（含附加费）
    const fTax = finalPrice(d.saleTax);
    html += `<div class="calc-step final-step"><span class="calc-step-label">最终含税售价（${termState.term}，含附加费）</span><span class="calc-step-value positive">¥${Math.round(fTax).toLocaleString()} / ${fmtUsd(usd(fTax))}</span></div>`;
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

  return { init, removeRow, toggleExpand };
})();

document.addEventListener('DOMContentLoaded', App.init);

