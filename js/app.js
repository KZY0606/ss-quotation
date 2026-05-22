/**
 * KK不锈钢报价系统 - 主应用逻辑
 */
const App = (() => {
  let dataItems = [];
  let results = [];
  let allExpanded = false;

  // 各产地 J2 基价 (201)
  let originPrices = {};
  let originOrder = [...ORIGIN_PRESETS];
  let lockedOrigins = {};
  // 各产地 J2 基价 (304)
  let originPrices304 = {};
  let lockedOrigins304 = {};
  let j5Price = 0;

  // 用户自定义价格覆盖（保护膜、表面加工费等）
  let priceOverrides = { filmFees: {}, surfaceFees: {}, filmLocked: {}, surfaceLocked: {} };

  // ========== 基价计算 ==========
  function getMaterialPrice(origin, material) {
    if (material === '304' || material.startsWith('304')) {
      const p = originPrices304[origin];
      return (p && p > 0) ? p : null;
    }
    const j2 = originPrices[origin];
    if (!j2 || j2 <= 0) return null;
    if (material === '201J5') return j5Price;
    const offset = MATERIAL_OFFSETS[material];
    if (offset === undefined) return j2;
    return j2 + (offset || 0);
  }

  // ========== DOM Cache ==========
  const els = {};
  function dom(id) { return document.getElementById(id); }

  function init() {
    // Initialize origin prices
    originOrder.forEach(o => { originPrices[o] = 0; });
    originPrices['宏旺'] = 7800; // default
    originOrder.forEach(o => { originPrices304[o] = 0; });
    loadLockedPrices(); // 恢复已锁定的价格（201 + 304）
    loadPriceOverrides(); // 恢复保护膜/表面加工费覆盖
    PricingEngine.setUserOverrides(priceOverrides); // 注入引擎

    cacheDom();
    bindEvents();
    renderOriginGrid();
    renderFilmConfig();
    renderSurfaceConfig();
    renderPriceReference();
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
    els.originRows = dom('originRows'); els.newOriginInput = dom('newOriginInput');
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
      syncManualPrices();
      dom('manualMaterial')?.focus();
    });

    // J5 基价输入
    const j5Inp = dom('j5BasePrice');
    if (j5Inp) {
      j5Inp.addEventListener('input', () => {
        j5Price = parseFloat(j5Inp.value) || 0;
        const j5Show = dom('j5PriceShow');
        if (j5Show) j5Show.textContent = j5Price ? j5Price.toLocaleString() : '未设置';
      });
    }

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
    els.originRows.innerHTML = '';
    originOrder.forEach(origin => {
      const price = originPrices[origin] || 0;
      const locked = !!lockedOrigins[origin];
      const j1 = price ? price + 900 : 0;
      const j3 = price ? price + 400 : 0;
      const j4 = price ? price + 1600 : 0;
      const price304 = originPrices304[origin] || 0;
      const locked304 = !!lockedOrigins304[origin];
      const div = document.createElement('div');
      div.className = 'origin-row';
      div.innerHTML = `
        <span class="oname" style="min-width:56px">${origin}</span>
        <div class="oj2"><label>J2</label><input type="number" class="origin-j2-input" data-origin="${origin}" value="${price || ''}" step="10" placeholder="0" ${locked ? 'readonly' : ''}></div>
        <button class="o-lock ${locked ? 'locked' : ''}" data-origin="${origin}" data-mat="201" title="${locked ? '点击解锁' : '点击锁定'}">${locked ? '🔒' : '🔓'}</button>
        <span class="oarrow">→</span>
        <span class="oderived">
          ${price > 0 
            ? `J1: <b>${j1.toLocaleString()}</b>  J3: <b>${j3.toLocaleString()}</b>  J4: <b>${j4.toLocaleString()}</b>`
            : '<span class="oderived-hint">请填写 J2 基价</span>'}
        </span>
        <span class="o304sep" style="margin:0 6px;color:var(--border);font-weight:200">|</span>
        <div class="oj2" style="width:80px"><label style="font-size:10px">304</label><input type="number" class="origin-304-input" data-origin="${origin}" value="${price304 || ''}" step="10" placeholder="0" style="width:60px;font-size:12px;padding:4px 6px;" ${locked304 ? 'readonly' : ''}></div>
        <button class="o-lock ${locked304 ? 'locked' : ''}" style="padding:0 2px;font-size:11px" data-origin="${origin}" data-mat="304" title="${locked304 ? '点击解锁' : '点击锁定'}">${locked304 ? '🔒' : '🔓'}</button>
        ${originOrder.length > ORIGIN_PRESETS.length ? `<button class="o-remove" data-origin="${origin}" title="删除">✕</button>` : ''}
      `;
      els.originRows.appendChild(div);
    });
    // Bind 201 inputs
    bindOriginInputs('.origin-j2-input', originPrices, '201');
    // Bind 304 inputs
    bindOriginInputs('.origin-304-input', originPrices304, '304');

    // Lock toggle
    document.querySelectorAll('.o-lock').forEach(btn => {
      btn.addEventListener('click', () => {
        const mat = btn.dataset.mat;
        if (mat === '304') {
          lockedOrigins304[btn.dataset.origin] = !lockedOrigins304[btn.dataset.origin];
          saveLockedPrices();
          renderOriginGrid();
        } else {
          toggleLock(btn.dataset.origin);
        }
      });
    });
    // Manual add dropdown
    const sel = dom('manualOrigin');
    if (sel) {
      sel.innerHTML = originOrder.map(o => `<option value="${o}">${o}</option>`).join('');
      syncManualPrices();
    }
  }

  function bindOriginInputs(selector, priceMap) {
    const inputs = document.querySelectorAll(selector);
    inputs.forEach((inp, i) => {
      inp.addEventListener('input', () => {
        const o = inp.dataset.origin;
        priceMap[o] = parseFloat(inp.value) || 0;
        updateAllDerived();
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const all = document.querySelectorAll(selector);
          if (e.shiftKey && i > 0) all[i - 1].focus();
          else if (!e.shiftKey && i < all.length - 1) all[i + 1].focus();
        }
      });
      inp.addEventListener('blur', () => {
        const o = inp.dataset.origin;
        priceMap[o] = parseFloat(inp.value) || 0;
        if (selector === '.origin-j2-input') updateDerivedDisplay(o);
        saveLockedPrices();
      });
    });
  }

  function updateDerivedDisplay(origin) {
    const rows = document.querySelectorAll('.origin-row');
    for (const row of rows) {
      if (row.querySelector('.oname')?.textContent === origin) {
        const derived = row.querySelector('.oderived');
        const p = originPrices[origin] || 0;
        derived.innerHTML = p > 0
          ? `J1: <b>${(p+900).toLocaleString()}</b>  J3: <b>${(p+400).toLocaleString()}</b>  J4: <b>${(p+1600).toLocaleString()}</b>`
          : '<span class="oderived-hint">请填写 J2 基价</span>';
        break;
      }
    }
  }

  function syncManualPrices() {
    const sel = dom('manualOrigin');
    const display = dom('manualPriceDisplay');
    if (!sel || !display) return;
    const o = sel.value;
    const j2 = originPrices[o] || 0;
    if (j2 > 0) {
      const j1 = j2 + 900, j3 = j2 + 400, j4 = j2 + 1600;
      display.innerHTML = `J2 <b>${j2.toLocaleString()}</b> → J1 <b>${j1.toLocaleString()}</b>  J3 <b>${j3.toLocaleString()}</b>  J4 <b>${j4.toLocaleString()}</b>`;
      display.style.color = 'var(--text-secondary)';
    } else {
      display.textContent = '⚠️ 该产地未设置基价';
      display.style.color = 'var(--danger)';
    }
  }

  function addOrigin() {
    const name = els.newOriginInput.value.trim();
    if (!name) { showToast('请输入产地名称', 'error'); return; }
    if (originOrder.includes(name)) { showToast('该产地已存在', 'error'); return; }
    originOrder.push(name);
    originPrices[name] = 0;
    originPrices304[name] = 0;
    els.newOriginInput.value = '';
    renderOriginGrid();
    showToast(`已添加产地: ${name}`, 'success');
  }

  function updateAllDerived() {
    const j5Show = dom('j5PriceShow');
    if (j5Show) j5Show.textContent = j5Price ? j5Price.toLocaleString() : '未设置';
  }

  // ========== 锁定价格持久化 ==========
  function saveLockedPrices() {
    try {
      const data = {};
      for (const [o, p] of Object.entries(originPrices)) {
        if (lockedOrigins[o]) data[o] = p;
      }
      localStorage.setItem('kk_locked_prices', JSON.stringify(data));
      // 304 locked prices
      const data304 = {};
      for (const [o, p] of Object.entries(originPrices304)) {
        if (lockedOrigins304[o]) data304[o] = p;
      }
      localStorage.setItem('kk_locked_prices_304', JSON.stringify(data304));
    } catch (e) { /* ignore */ }
  }

  function loadLockedPrices() {
    try {
      const raw = localStorage.getItem('kk_locked_prices');
      if (!raw) return;
      const data = JSON.parse(raw);
      for (const [o, p] of Object.entries(data)) {
        if (originPrices.hasOwnProperty(o) || originOrder.includes(o)) {
          originPrices[o] = p;
          lockedOrigins[o] = true;
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
  }

  function toggleLock(origin) {
    lockedOrigins[origin] = !lockedOrigins[origin];
    if (!lockedOrigins[origin] && originPrices[origin] === 0) {
      // 解锁且价格为 0 → 恢复默认提示
    }
    saveLockedPrices();
    renderOriginGrid();
    updateAllDerived();
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
      { display: '8K黄钛金', key: '8K黄钛金' },
      { display: '8K玫瑰金', key: '8K玫瑰金' },
      { display: '8K香槟金', key: '8K香槟金' },
      { display: '8K黑钛金', key: '8K黑钛金' },
      { display: '8K宝石蓝', key: '8K宝石蓝' },
      { display: '8K紫罗兰', key: '8K紫罗兰' },
      { display: '8K翡翠绿', key: '8K翡翠绿' },
      { display: '8K紫红', key: '8K紫红' },
      { display: '8K中国红', key: '8K中国红' },
      { display: '8K古铜', key: '8K古铜' },
      // 砂面/拉丝 合并
      { display: '砂面/拉丝(NO.4/HL)黄钛金', keys: ['拉丝黄钛金','磨砂黄钛金'] },
      { display: '砂面/拉丝(NO.4/HL)玫瑰金', keys: ['拉丝玫瑰金','磨砂玫瑰金'] },
      { display: '砂面/拉丝(NO.4/HL)香槟金', keys: ['拉丝香槟金','磨砂香槟金'] },
      { display: '砂面/拉丝(NO.4/HL)黑钛金', keys: ['拉丝黑钛金','磨砂黑钛金'] },
      { display: '砂面/拉丝(NO.4/HL)古铜', keys: ['拉丝古铜','磨砂古铜'] },
      { display: '砂面/拉丝(NO.4/HL)古铜哑光抗指纹', key: '拉丝古铜哑光抗指纹' },
      { display: '砂面/拉丝(NO.4/HL)古铜亮光抗指纹', key: '拉丝古铜亮光抗指纹' }
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

    // 压延料表
    h.push('<h4 class="ref-subtitle">本地201(压延）</h4>');
    h.push('<table class="ref-table"><tr><th>厚度 (mm)</th><th>加价 (元/吨)</th></tr>');
    YANYAN_THICKNESS_SURCHARGE.forEach(t => {
      h.push(`<tr><td>${t.min}～${t.max}</td><td class="ref-num">+${t.price}</td></tr>`);
    });
    h.push('</table>');

    // 304 表
    h.push('<h4 class="ref-subtitle">宏旺304/德龙304</h4>');
    h.push('<table class="ref-table"><tr><th>厚度 (mm)</th><th>加价 (元/吨)</th></tr>');
    THICKNESS_SURCHARGE_304.forEach(t => {
      h.push(`<tr><td>${t.min}～${t.max}</td><td class="ref-num">+${t.price}</td></tr>`);
    });
    h.push('</table>');

    // 产地特异性表
    Object.entries(ORIGIN_THICKNESS_SURCHARGE).forEach(([origin, table]) => {
      h.push(`<h4 class="ref-subtitle">${origin} (304正材)</h4>`);
      h.push('<table class="ref-table"><tr><th>厚度 (mm)</th><th>加价 (元/吨)</th></tr>');
      table.forEach(t => {
        h.push(`<tr><td>${t.min}～${t.max}</td><td class="ref-num">+${t.price}</td></tr>`);
      });
      h.push('</table>');
    });
    h.push('</div>');

    // ===== 2. 表面加工费总表 =====
    h.push('<div class="ref-section"><h3 class="ref-title">✨ 表面加工费总表</h3>');
    h.push('<h4 class="ref-subtitle">201 表面加工费</h4>');
    h.push('<table class="ref-table"><tr><th>表面</th><th>厚度范围 (mm)</th><th>宽度范围 (mm)</th><th>单价</th></tr>');

    // 自定义排列顺序：8K彩色 → 砂面/拉丝 → 其他标准表面
    const coloredDisplay = [
      { display: '8K黄钛金', key: '8K黄钛金' },
      { display: '8K玫瑰金', key: '8K玫瑰金' },
      { display: '8K香槟金', key: '8K香槟金' },
      { display: '8K黑钛金', key: '8K黑钛金' },
      { display: '8K宝石蓝', key: '8K宝石蓝' },
      { display: '8K紫罗兰', key: '8K紫罗兰' },
      { display: '8K翡翠绿', key: '8K翡翠绿' },
      { display: '8K紫红', key: '8K紫红' },
      { display: '8K中国红', key: '8K中国红' },
      { display: '8K古铜', key: '8K古铜' },
      { display: '砂面/拉丝(NO.4/HL)黄钛金', keys: ['拉丝黄钛金','磨砂黄钛金'] },
      { display: '砂面/拉丝(NO.4/HL)玫瑰金', keys: ['拉丝玫瑰金','磨砂玫瑰金'] },
      { display: '砂面/拉丝(NO.4/HL)香槟金', keys: ['拉丝香槟金','磨砂香槟金'] },
      { display: '砂面/拉丝(NO.4/HL)黑钛金', keys: ['拉丝黑钛金','磨砂黑钛金'] },
      { display: '砂面/拉丝(NO.4/HL)古铜', keys: ['拉丝古铜','磨砂古铜'] },
      { display: '砂面/拉丝(NO.4/HL)古铜哑光抗指纹', key: '拉丝古铜哑光抗指纹' },
      { display: '砂面/拉丝(NO.4/HL)古铜亮光抗指纹', key: '拉丝古铜亮光抗指纹' }
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

    // 304 特例表面
    if (Object.keys(SURFACE_FEES_304).length > 0) {
      h.push('<h4 class="ref-subtitle">304 特例表面加工费 (与 201 不同的)</h4>');
      h.push('<table class="ref-table"><tr><th>表面</th><th>厚度范围 (mm)</th><th>宽度范围 (mm)</th><th>单价</th></tr>');
      // 8K黑钛金 单独显示；拉丝+磨砂黑钛金合并
      const cfg8k = SURFACE_FEES_304['8K黑钛金'];
      if (cfg8k) renderSurfaceRows('8K黑钛金', cfg8k);
      const cfgWire = SURFACE_FEES_304['拉丝黑钛金'];
      if (cfgWire) renderSurfaceRows('砂面/拉丝(NO.4/HL)黑钛金', cfgWire);
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
        item.basePrice = getMaterialPrice(item.origin || '宏旺', item.material) || 0;
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
    const f1 = dom('manualFilm1').value.trim();
    const f2 = dom('manualFilm2').value.trim();
    const bp = getMaterialPrice(origin, mat);
    if (!bp || bp <= 0) { showToast(`${origin} ${mat} 基价未设置`, 'error'); return; }
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
    const lines = text.split('\n').filter(l => l.trim());
    let count = 0;
    for (const line of lines) {
      const p = PricingEngine.parseFreeText(line.trim(), {});
      if (p && p.thickness && p.width) {
        // Detect new origins
        if (p.origin && !originOrder.includes(p.origin)) {
          originOrder.push(p.origin);
          originPrices[p.origin] = 0;
        }
        const bp = getMaterialPrice(p.origin || '宏旺', p.material);
        if (bp && bp > 0) {
          p.basePrice = bp;
          dataItems.push(p);
          count++;
        }
      }
    }
    if (count > 0) {
      results = []; renderOriginGrid();
      showToast(`解析 ${count} / ${lines.length} 条`, 'success');
      els.freeText.value = '';
      render();
    } else { showToast('未能解析（检查各产地基价是否已设置）', 'error'); }
  }

  function runCalc() {
    if (!dataItems.length) { showToast('请先添加数据', 'error'); return; }
    // Sync J5
    const j5Inp = dom('j5BasePrice');
    if (j5Inp) j5Price = parseFloat(j5Inp.value) || 0;
    // Inject user price overrides
    PricingEngine.setUserOverrides(priceOverrides);
    // Update base prices
    let missing = [];
    dataItems.forEach(item => {
      const bp = getMaterialPrice(item.origin || '宏旺', item.material);
      if (!bp || bp <= 0) missing.push(`[${item.origin||'?'}] ${item.material}`);
      item.basePrice = bp || 0;
    });
    if (missing.length > 0) {
      showToast(`以下产地/材质基价未设置：\n${missing.slice(0,3).join(', ')}${missing.length > 3 ? '...' : ''}`, 'error');
      return;
    }
    results = PricingEngine.calculateBatch(dataItems);
    const ok = results.filter(r => r.success).length;
    const fail = results.filter(r => !r.success).length;
    showToast(`完成：${ok} 成功，${fail} 失败`, ok > 0 ? 'success' : 'error');
    renderResults();
  }

  function clearAll() { dataItems = []; results = []; allExpanded = false; render(); showToast('已清空', 'info'); }
  function removeRow(idx) { dataItems.splice(idx - 1, 1); results = []; render(); }

  function exportResults() {
    if (!results.length) { showToast('请先计算', 'error'); return; }
    const d = new Date(); const ds = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    ExcelParser.exportToExcel(results, `KK报价_${ds}.xlsx`);
    showToast('导出成功', 'success');
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
  function render() { renderStats(); renderTable(); }
  function renderResults() { renderStats(); renderTable(); }

  function renderStats() {
    const sr = results.filter(r => r.success);
    els.totalC.textContent = dataItems.length;
    els.okC.textContent = sr.length;
    els.errC.textContent = results.filter(r => !r.success).length;
    if (sr.length > 0) {
      const sp = sr.map(r => r.detail.saleTax);
      els.minP.textContent = Math.min(...sp).toLocaleString();
      els.maxP.textContent = Math.max(...sp).toLocaleString();
    } else { els.minP.textContent = '-'; els.maxP.textContent = '-'; }
    els.expBtn.disabled = els.expBtn2.disabled = sr.length === 0;
    els.calcBtn.disabled = dataItems.length === 0;
    if (dataItems.length > 0) { els.emptyState.style.display = 'none'; els.resultCard.style.display = 'block'; }
    else { els.emptyState.style.display = 'block'; els.resultCard.style.display = 'none'; }
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
      h.push(`<td>${item.thickness}</td><td>${item.width}</td>`);
      h.push(`<td>${(item.length||'C') === 'C' ? '<span style="color:#5b21b6;font-weight:600">C</span>' : item.length}</td>`);
      h.push(`<td>${item.film1 || '<span style="color:var(--text-muted)">-</span>'}</td>`);
      h.push(`<td>${item.film2 || '<span style="color:var(--text-muted)">-</span>'}</td>`);
      if (isOk) {
        h.push(`<td class="price-cell price-cost">${d.costTax.toLocaleString()}</td>`);
        h.push(`<td class="price-cell price-subtle">${d.costNoTax.toLocaleString()}</td>`);
        h.push(`<td><span class="tag tag-${d.edgeType}">${d.edgeType === 'rough' ? '毛边' : '齐边'}</span> <span class="tag tag-${d.boardType}">${d.boardType === 'coil' ? '卷' : '板'}</span></td>`);
        h.push(`<td class="price-cell price-sale">${d.saleTax.toLocaleString()}</td>`);
        h.push(`<td class="price-cell price-subtle">${d.saleNoTax.toLocaleString()}</td>`);
      } else if (isErr) { h.push(`<td colspan="6" class="error-text">⚠️ ${r.errors.join('；')}</td>`); }
      else { h.push(`<td colspan="6" style="color:var(--text-muted);font-size:12px">待计算</td>`); }
      h.push(`<td><button class="btn-icon btn-ghost delete-btn" onclick="App.removeRow(${idx})">✕</button></td></tr>`);

      if (isOk) {
        h.push(`<tr class="detail-row" id="detail-${idx}"><td colspan="16"><div class="detail-content">`);
        h.push(renderBreakdown(d, item));
        h.push('</div></td></tr>');
      }
    });
    els.tBody.innerHTML = h.join('');
  }

  const fmt = (v) => v.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmtI = (v) => v.toLocaleString();

  function renderBreakdown(d, item) {
    const spec = `${d.thickness} × ${d.width} × ${d.length}`;
    const mat = d.material + (d.isYanYan ? ' 压延料' : '');
    const bt = (d.edgeType === 'rough' ? '毛边' : '齐边') + (d.boardType === 'coil' ? '卷板' : '平板');
    const hd = `规格：${spec}　｜　产地：${item.origin||''}　｜　材质：${mat}　｜　表面：${d.surface}　｜　类型：${bt}`;

    let html = `<div style="margin-bottom:12px;font-size:12px;color:var(--text-secondary);font-weight:500;">${hd}</div><div class="calc-breakdown"><div class="calc-section"><div class="calc-section-title">含税成本计算过程</div>`;
    html += step('① 基价', d.basePrice, '元/吨', true);
    html += step(`② 厚度加价 (${d.thickness}mm, ${d.thickTable})`, d.thickSurcharge, '元/吨', d.thickSurcharge > 0);
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
    html += step(`不含税成本 (${fmtI(d.costTax)} × 0.92)`, d.costNoTaxRaw, '元/吨', true);
    html += total('四舍五入 (十位)', d.costNoTax, 'notax');
    html += '<div style="height:8px;"></div>';
    html += step(`销售加价 (${bt})`, d.markup, '元/吨', d.markup > 0);
    html += total('含税售价', d.saleTax, 'sale');
    html += total('不含税售价', d.saleNoTax, 'sale');
    html += '</div></div>';
    return html;
  }

  const step = (l, v, u, p) => `<div class="calc-step"><span class="calc-step-label">${l}</span><span class="calc-step-value ${p?'positive':'zero'}">${p?'+'+fmt(v):'0'} ${u}</span></div>`;
  const total = (l, v, t) => `<div class="calc-total"><span class="calc-total-label">${l}</span><span class="calc-total-value ${t}">${fmtI(v)} 元/吨</span></div>`;

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

