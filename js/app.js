/**
 * KK不锈钢报价系统 - 主应用逻辑
 */
const App = (() => {
  let dataItems = [];
  let results = [];
  let allExpanded = false;

  // 各产地 J2 基价
  let originPrices = {};
  let originOrder = [...ORIGIN_PRESETS];
  let lockedOrigins = {}; // { "宏旺": true, "青山": ... } 锁定状态
  let j5Price = 0;

  // 用户自定义价格覆盖（保护膜、表面加工费等）
  let priceOverrides = { filmFees: {}, surfaceFees: {}, filmLocked: {}, surfaceLocked: {} };

  // 共享配置
  const SHARED_CONFIG_URL = 'https://raw.githubusercontent.com/KZY0606/ss-quotation/main/data/shared-prices.json';
  const SHARED_CONFIG_API = 'https://api.github.com/repos/KZY0606/ss-quotation/contents/data/shared-prices.json';

  // ========== 基价计算 ==========
  function getMaterialPrice(origin, material) {
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
    loadLockedPrices(); // 恢复已锁定的价格
    loadPriceOverrides(); // 恢复保护膜/表面加工费覆盖
    PricingEngine.setUserOverrides(priceOverrides); // 注入引擎

    cacheDom();
    bindEvents();
    renderOriginGrid();
    renderFilmConfig();
    renderSurfaceConfig();
    updateAllDerived();
    render();

    // 异步加载共享配置
    setTimeout(() => {
      applySharedPrices().then(() => {
        renderOriginGrid();
        renderFilmConfig();
        renderSurfaceConfig();
      });
    }, 100);
  }
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
    dom('publishSharedBtn')?.addEventListener('click', publishSharedPrices);

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
      const div = document.createElement('div');
      div.className = 'origin-row';
      const price = originPrices[origin] || 0;
      const locked = !!lockedOrigins[origin];
      const j1 = price ? price + 900 : 0;
      const j3 = price ? price + 400 : 0;
      const j4 = price ? price + 1600 : 0;
      div.innerHTML = `
        <span class="oname">${origin}</span>
        <button class="o-lock ${locked ? 'locked' : ''}" data-origin="${origin}" title="${locked ? '点击解锁' : '点击锁定'}">
          ${locked ? '🔒' : '🔓'}
        </button>
        <div class="oj2"><label>J2</label><input type="number" class="origin-j2-input" data-origin="${origin}" value="${price || ''}" step="10" placeholder="0" ${locked ? 'readonly' : ''}></div>
        <span class="oarrow">→</span>
        <span class="oderived">
          ${price > 0 
            ? `J1: <b>${j1.toLocaleString()}</b>  J3: <b>${j3.toLocaleString()}</b>  J4: <b>${j4.toLocaleString()}</b>`
            : '<span class="oderived-hint">请填写 J2 基价</span>'}
        </span>
        ${originOrder.length > ORIGIN_PRESETS.length ? `<button class="o-remove" data-origin="${origin}" title="删除">✕</button>` : ''}
      `;
      els.originRows.appendChild(div);
    });
    // Bind origin J2 inputs - keyboard nav + paste support
    const originInputs = document.querySelectorAll('.origin-j2-input');
    originInputs.forEach((inp, i) => {
      inp.addEventListener('input', () => {
        const o = inp.dataset.origin;
        originPrices[o] = parseFloat(inp.value) || 0;
        updateDerivedDisplay(o);  // 只更新文本，不重建DOM
        updateAllDerived();
      });
      // Enter → 下一个产地
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (e.shiftKey && i > 0) originInputs[i - 1].focus();
          else if (!e.shiftKey && i < originInputs.length - 1) originInputs[i + 1].focus();
        }
      });
      // 批量粘贴：支持 "7800, 7900, 7700" 分布到多个产地
      inp.addEventListener('paste', (e) => {
        setTimeout(() => {
          const val = inp.value;
          const nums = val.split(/[,，\s]+/).filter(x => x && !isNaN(parseFloat(x))).map(x => parseFloat(x.trim()));
          if (nums.length > 1) {
            e.preventDefault();
            // 从当前产地开始，依次填入
            for (let j = 0; j < nums.length && i + j < originInputs.length; j++) {
              const target = originInputs[i + j];
              const o2 = target.dataset.origin;
              originPrices[o2] = nums[j];
              target.value = nums[j];
              updateDerivedDisplay(o2);  // 只更新文本
            }
            updateAllDerived();
            // 焦点移到下一个未填的
            const newInputs = document.querySelectorAll('.origin-j2-input');
            if (i + nums.length < newInputs.length) newInputs[i + nums.length].focus();
            showToast(`已填入 ${Math.min(nums.length, originInputs.length - i)} 个产地`, 'success');
            return;
          }
          // 单个数字粘贴：直接填入当前
          if (nums.length === 1) {
            const o = inp.dataset.origin;
            originPrices[o] = nums[0];
            updateDerivedDisplay(o);  // 只更新文本
            updateAllDerived();
            // 焦点移到下一个
            const newInputs = document.querySelectorAll('.origin-j2-input');
            if (i < newInputs.length - 1) newInputs[i + 1].focus();
          }
        }, 10);
      });
    });
    document.querySelectorAll('.o-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const o = btn.dataset.origin;
        originOrder = originOrder.filter(x => x !== o);
        delete originPrices[o];
        renderOriginGrid();
      });
    });
    // Lock toggle
    document.querySelectorAll('.o-lock').forEach(btn => {
      btn.addEventListener('click', () => {
        toggleLock(btn.dataset.origin);
      });
    });
    // Manual add dropdown
    const sel = dom('manualOrigin');
    if (sel) {
      sel.innerHTML = originOrder.map(o => `<option value="${o}">${o}</option>`).join('');
      syncManualPrices();
    }
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
    let html = '<table><thead><tr><th>表面名称</th><th>单价(元/平米)</th><th>默认(元/平米)</th><th></th></tr></thead><tbody>';
    for (const [name, cfg] of Object.entries(SURFACE_FEES)) {
      if (typeof cfg === 'object' && cfg.type === 'sqm') {
        const defaultPrice = cfg.price;
        const val = priceOverrides.surfaceFees[name] ?? defaultPrice;
        const locked = !!priceOverrides.surfaceLocked[name];
        html += `<tr>
          <td><span class="cfg-name">${name}</span></td>
          <td><input type="number" class="cfg-price-input surf-price-inp" data-name="${name}" value="${val}" step="0.5" ${locked ? 'readonly' : ''}></td>
          <td><span class="cfg-default">${defaultPrice}</span></td>
          <td><button class="cfg-lock-btn ${locked ? 'locked' : ''}" data-name="${name}" data-type="surf">${locked ? '🔒' : '🔓'}</button></td>
        </tr>`;
      }
    }
    html += '</tbody></table>';
    wrap.innerHTML = html;

    // 绑定输入事件
    wrap.querySelectorAll('.surf-price-inp').forEach(inp => {
      inp.addEventListener('input', () => {
        const name = inp.dataset.name;
        priceOverrides.surfaceFees[name] = parseFloat(inp.value) || 0;
        savePriceOverrides();
      });
    });
    // 绑定锁定事件
    wrap.querySelectorAll('.cfg-lock-btn[data-type="surf"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.name;
        priceOverrides.surfaceLocked[name] = !priceOverrides.surfaceLocked[name];
        savePriceOverrides();
        renderSurfaceConfig();
      });
    });
  }

  // ========== 共享配置 ==========
  async function fetchSharedPrices() {
    try {
      const res = await fetch(SHARED_CONFIG_URL + '?t=' + Date.now());
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  }

  async function applySharedPrices() {
    const shared = await fetchSharedPrices();
    const status = dom('sharedStatus');
    if (!shared) {
      if (status) status.textContent = '⚠️ 未读取到共享配置';
      return;
    }
    // 应用共享的基价
    if (shared.originPrices) {
      for (const [o, p] of Object.entries(shared.originPrices)) {
        if (originPrices.hasOwnProperty(o) && !lockedOrigins[o]) {
          originPrices[o] = p;
        }
      }
    }
    // 应用共享的膜价
    if (shared.filmFees) {
      for (const [name, p] of Object.entries(shared.filmFees)) {
        if (!priceOverrides.filmLocked[name]) {
          priceOverrides.filmFees[name] = p;
        }
      }
    }
    // 应用共享的表面加工费
    if (shared.surfaceFees) {
      for (const [name, p] of Object.entries(shared.surfaceFees)) {
        if (!priceOverrides.surfaceLocked[name]) {
          priceOverrides.surfaceFees[name] = p;
        }
      }
    }
    savePriceOverrides();
    if (status) status.textContent = `✅ 已读取共享配置 ${shared.updatedAt || ''}`;
  }

  async function publishSharedPrices() {
    const status = dom('sharedStatus');
    if (status) status.textContent = '⏳ 发布中...';
    
    const data = {
      originPrices: {},
      filmFees: {},
      surfaceFees: {},
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false })
    };
    // 只发布已锁定或被覆盖的数据
    for (const [o, p] of Object.entries(originPrices)) {
      if (p > 0) data.originPrices[o] = p;
    }
    for (const [name, p] of Object.entries(priceOverrides.filmFees)) {
      data.filmFees[name] = p;
    }
    for (const [name, p] of Object.entries(priceOverrides.surfaceFees)) {
      data.surfaceFees[name] = p;
    }

    // 获取 GitHub Token
    let token = localStorage.getItem('kk_github_token');
    if (!token) {
      token = prompt('请输入 GitHub Token（首次使用需要）');
      if (!token) { if (status) status.textContent = '❌ 已取消'; return; }
      localStorage.setItem('kk_github_token', token);
    }

    try {
      // 获取文件的 SHA（如果已存在）
      let sha = null;
      const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
      try {
        const existing = await fetch(SHARED_CONFIG_API, { headers });
        if (existing.ok) {
          const info = await existing.json();
          sha = info.sha;
        }
      } catch (e) { /* 文件可能不存在 */ }

      // 推送
      const jsonStr = JSON.stringify(data, null, 2);
      const body = {
        message: `更新共享配置 ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
        content: btoa(unescape(encodeURIComponent(jsonStr))),
        branch: 'main'
      };
      if (sha) body.sha = sha;

      const res = await fetch(SHARED_CONFIG_API, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        if (status) status.textContent = `✅ 已发布 ${new Date().toLocaleString('zh-CN', { hour12: false })}`;
        showToast('共享配置已发布！', 'success');
      } else {
        const errText = await res.text();
        if (res.status === 401) {
          localStorage.removeItem('kk_github_token');
          if (status) status.textContent = '❌ Token 无效，已清除请重试';
        } else {
          if (status) status.textContent = `❌ 发布失败 (${res.status})`;
        }
        showToast(`发布失败: ${res.status}`, 'error');
      }
    } catch (e) {
      if (status) status.textContent = '❌ 网络错误';
      showToast('网络错误', 'error');
    }
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
    if (d.film1PerTon > 0) html += step(`④ 保护膜1 (${d.film1}, ${d.film1FeeSqm}元/² × ${fmt(d.sqmPerTon)}²/吨)`, d.film1PerTon, '元/吨', true);
    else html += step('④ 保护膜1', 0, '', false);
    if (d.film2PerTon > 0) html += step(`⑤ 保护膜2 (${d.film2}, ${d.film2FeeSqm}元/² × ${fmt(d.sqmPerTon)}²/吨)`, d.film2PerTon, '元/吨', true);
    else if (d.film2?.trim()) html += step('⑤ 保护膜2', 0, '', false);
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
