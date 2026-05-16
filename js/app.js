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
  let j5Price = 0;

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

    cacheDom();
    bindEvents();
    renderOriginGrid();
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

    dom('manualOrigin')?.addEventListener('change', syncManualPrices);

    document.querySelectorAll('#tab-manual input[type="text"]').forEach(inp => {
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') addManual(); });
    });
  }

  // ========== 产地价格管理 ==========
  function renderOriginGrid() {
    els.originRows.innerHTML = '';
    originOrder.forEach(origin => {
      const div = document.createElement('div');
      div.className = 'origin-row';
      const price = originPrices[origin] || 0;
      const j1 = price ? price + 900 : 0;
      const j3 = price ? price + 400 : 0;
      const j4 = price ? price + 1600 : 0;
      div.innerHTML = `
        <span class="oname">${origin}</span>
        <div class="oj2"><label>J2</label><input type="number" class="origin-j2-input" data-origin="${origin}" value="${price || ''}" step="10" placeholder="0"></div>
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
    // Bind origin J2 inputs
    document.querySelectorAll('.origin-j2-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const o = inp.dataset.origin;
        originPrices[o] = parseFloat(inp.value) || 0;
        renderOriginGrid();
        updateAllDerived();
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
    // Manual add dropdown
    const sel = dom('manualOrigin');
    if (sel) {
      sel.innerHTML = originOrder.map(o => `<option value="${o}">${o}</option>`).join('');
      syncManualPrices();
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
    // Update J5 display
    const j5Show = dom('j5PriceShow');
    if (j5Show) j5Show.textContent = j5Price ? j5Price.toLocaleString() : '未设置';
    // J5 input sync
    const j5Inp = dom('j5BasePrice');
    if (j5Inp) {
      j5Inp.addEventListener('input', () => {
        j5Price = parseFloat(j5Inp.value) || 0;
        if (j5Show) j5Show.textContent = j5Price ? j5Price.toLocaleString() : '未设置';
      });
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
