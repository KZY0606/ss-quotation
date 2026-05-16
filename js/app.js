/**
 * KK不锈钢报价系统 - 主应用逻辑
 */
const App = (() => {
  let dataItems = [];
  let results = [];
  let j2BasePrice = 7800;
  let j5BasePrice = 0;
  let allExpanded = false;

  // 基价映射表（根据 J2 基价自动推导）
  function getBasePriceMap() {
    return {
      '201J2': j2BasePrice,
      '201J1': j2BasePrice + 900,
      '201J3': j2BasePrice + 400,
      '201J4': j2BasePrice + 1600,
      '201J5': j5BasePrice,
      '201J2压延': j2BasePrice,
      '201J1压延': j2BasePrice + 900,
      '201J3压延': j2BasePrice + 400,
      '201J4压延': j2BasePrice + 1600,
      '201J5压延': j5BasePrice,
    };
  }

  const els = {};

  function init() {
    cacheDom();
    bindEvents();
    updateDerivedPrices();
    render();
  }

  function cacheDom() {
    els.j2BaseInput = document.getElementById('j2BasePrice');
    els.j5BaseInput = document.getElementById('j5BasePrice');
    els.calculateBtn = document.getElementById('calculateBtn');
    els.exportBtn = document.getElementById('exportBtn');
    els.exportBtn2 = document.getElementById('exportBtn2');
    els.clearBtn = document.getElementById('clearBtn');
    els.addManualBtn = document.getElementById('addManualBtn');
    els.expandAllBtn = document.getElementById('expandAllBtn');
    els.fileInput = document.getElementById('fileInput');
    els.tableBody = document.getElementById('resultBody');
    els.emptyState = document.getElementById('emptyState');
    els.resultCard = document.getElementById('resultCard');
    els.totalCount = document.getElementById('totalCount');
    els.successCount = document.getElementById('successCount');
    els.errorCount = document.getElementById('errorCount');
    els.minSaleTax = document.getElementById('minSaleTax');
    els.maxSaleTax = document.getElementById('maxSaleTax');
    els.freeText = document.getElementById('freeText');
    els.parseTextBtn = document.getElementById('parseTextBtn');
    // derived prices
    els.j1Price = document.getElementById('j1Price');
    els.j3Price = document.getElementById('j3Price');
    els.j4Price = document.getElementById('j4Price');
    els.j2NoTax = document.getElementById('j2NoTax');
  }

  function bindEvents() {
    els.j2BaseInput.addEventListener('input', () => {
      j2BasePrice = parseFloat(els.j2BaseInput.value) || 0;
      updateDerivedPrices();
    });
    els.j5BaseInput.addEventListener('input', () => {
      j5BasePrice = parseFloat(els.j5BaseInput.value) || 0;
    });
    els.calculateBtn.addEventListener('click', runCalculation);
    els.exportBtn.addEventListener('click', exportResults);
    els.exportBtn2.addEventListener('click', exportResults);
    els.clearBtn.addEventListener('click', clearAll);
    els.addManualBtn.addEventListener('click', addManualRow);
    els.expandAllBtn.addEventListener('click', toggleAllExpand);
    els.fileInput.addEventListener('change', handleFileUpload);
    els.parseTextBtn.addEventListener('click', parseFreeText);

    document.querySelectorAll('#tab-manual input[type="text"]').forEach(input => {
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addManualRow(); });
    });
  }

  function updateDerivedPrices() {
    const j1 = j2BasePrice + 900;
    const j3 = j2BasePrice + 400;
    const j4 = j2BasePrice + 1600;
    if (els.j1Price) els.j1Price.textContent = j1.toLocaleString();
    if (els.j3Price) els.j3Price.textContent = j3.toLocaleString();
    if (els.j4Price) els.j4Price.textContent = j4.toLocaleString();
    if (els.j2NoTax) els.j2NoTax.textContent = Math.round(j2BasePrice * 0.92).toLocaleString();
  }

  // ========== Data Operations ==========

  function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    showToast('正在解析文件...', 'info');
    const map = getBasePriceMap();
    ExcelParser.parseExcel(file, 0) // basePrice will be overridden
      .then(items => {
        if (items.length === 0) { showToast('未能解析出数据', 'error'); return; }
        // Apply base price map to each item
        items.forEach(item => {
          const key = item.isYanYan ? item.material + '压延' : item.material;
          item.basePrice = map[key] || map[item.material] || j2BasePrice;
        });
        dataItems = dataItems.concat(items);
        results = [];
        showToast(`导入 ${items.length} 条`, 'success');
        render();
      })
      .catch(err => showToast('解析失败: ' + err.message, 'error'));
    e.target.value = '';
  }

  function addManualRow() {
    const material = document.getElementById('manualMaterial').value;
    const isYanYan = document.getElementById('manualYanYan').checked;
    const thickness = document.getElementById('manualThickness').value.trim();
    const width = document.getElementById('manualWidth').value.trim();
    const length = document.getElementById('manualLength').value.trim();
    const surface = document.getElementById('manualSurface').value.trim();
    const film1 = document.getElementById('manualFilm1').value.trim();
    const film2 = document.getElementById('manualFilm2').value.trim();
    if (!thickness || !width) { showToast('请填写厚度和宽度', 'error'); return; }

    const map = getBasePriceMap();
    const key = isYanYan ? material + '压延' : material;
    const bp = map[key] || map[material] || j2BasePrice;

    dataItems.push({ material, isYanYan, surface, thickness, width, length: length || 'C', film1, film2, basePrice: bp });
    results = [];
    showToast('已添加', 'success');
    render();
    ['manualThickness','manualWidth','manualLength','manualSurface','manualFilm1','manualFilm2'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('manualThickness').focus();
  }

  function parseFreeText() {
    const text = els.freeText.value.trim();
    if (!text) { showToast('请输入数据', 'error'); return; }
    const map = getBasePriceMap();
    const lines = text.split('\n').filter(l => l.trim());
    let count = 0;
    for (const line of lines) {
      const parsed = PricingEngine.parseFreeText(line.trim(), map);
      if (parsed && parsed.thickness && parsed.width) {
        if (!parsed.basePrice || parsed.basePrice === 0) {
          const key = parsed.isYanYan ? parsed.material + '压延' : parsed.material;
          parsed.basePrice = map[key] || map[parsed.material] || j2BasePrice;
        }
        dataItems.push(parsed);
        count++;
      }
    }
    if (count > 0) {
      results = [];
      showToast(`解析 ${count} / ${lines.length} 条`, 'success');
      els.freeText.value = '';
      render();
    } else {
      showToast('未能解析', 'error');
    }
  }

  function runCalculation() {
    if (dataItems.length === 0) { showToast('请先添加数据', 'error'); return; }
    j2BasePrice = parseFloat(els.j2BaseInput.value) || 0;
    j5BasePrice = parseFloat(els.j5BaseInput.value) || 0;
    if (j2BasePrice <= 0) { showToast('请输入 J2 基价', 'error'); return; }
    const map = getBasePriceMap();
    dataItems.forEach(item => {
      const key = item.isYanYan ? item.material + '压延' : item.material;
      item.basePrice = map[key] || map[item.material] || j2BasePrice;
    });
    results = PricingEngine.calculateBatch(dataItems);
    const ok = results.filter(r => r.success).length;
    const fail = results.filter(r => !r.success).length;
    showToast(`完成：${ok} 成功，${fail} 失败`, ok > 0 ? 'success' : 'error');
    renderResults();
  }

  function clearAll() {
    dataItems = []; results = []; allExpanded = false; render(); showToast('已清空', 'info');
  }

  function removeRow(index) {
    dataItems.splice(index - 1, 1); results = []; render();
  }

  function exportResults() {
    if (results.length === 0) { showToast('请先计算', 'error'); return; }
    const now = new Date();
    const ds = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    ExcelParser.exportToExcel(results, `KK报价结果_${ds}.xlsx`);
    showToast('导出成功', 'success');
  }

  function toggleExpand(index) {
    const row = document.getElementById(`detail-${index}`);
    const btn = document.getElementById(`expand-btn-${index}`);
    if (row) row.classList.toggle('open');
    if (btn) btn.classList.toggle('open');
  }

  function toggleAllExpand() {
    allExpanded = !allExpanded;
    results.forEach((r, i) => {
      if (r.success) {
        const idx = i + 1;
        const row = document.getElementById(`detail-${idx}`);
        const btn = document.getElementById(`expand-btn-${idx}`);
        if (row) { if (allExpanded) row.classList.add('open'); else row.classList.remove('open'); }
        if (btn) { if (allExpanded) btn.classList.add('open'); else btn.classList.remove('open'); }
      }
    });
    els.expandAllBtn.textContent = allExpanded ? '📋 收起明细' : '📋 全部明细';
  }

  // ========== Rendering ==========

  function render() { renderStats(); renderTable(); }
  function renderStats() {
    const sr = results.filter(r => r.success);
    els.totalCount.textContent = dataItems.length;
    els.successCount.textContent = sr.length;
    els.errorCount.textContent = results.filter(r => !r.success).length;
    if (sr.length > 0) {
      const sp = sr.map(r => r.detail.saleTax);
      els.minSaleTax.textContent = Math.min(...sp).toLocaleString();
      els.maxSaleTax.textContent = Math.max(...sp).toLocaleString();
    } else { els.minSaleTax.textContent = '-'; els.maxSaleTax.textContent = '-'; }
    els.exportBtn.disabled = sr.length === 0;
    els.exportBtn2.disabled = sr.length === 0;
    els.calculateBtn.disabled = dataItems.length === 0;
    if (dataItems.length > 0) {
      els.emptyState.style.display = 'none';
      els.resultCard.style.display = 'block';
    } else {
      els.emptyState.style.display = 'block';
      els.resultCard.style.display = 'none';
    }
  }

  function renderTable() {
    const html = [];
    dataItems.forEach((item, i) => {
      const idx = i + 1;
      const r = results[i];
      const isError = r && !r.success;
      const isSuccess = r && r.success;
      const d = r?.detail;

      html.push(`<tr class="${isError ? 'error-row' : 'main-row'}">`);
      if (isSuccess) {
        html.push(`<td><button class="expand-btn" id="expand-btn-${idx}" onclick="App.toggleExpand(${idx})">▶</button></td>`);
      } else { html.push('<td></td>'); }

      html.push(`<td><div class="index-cell"><span class="index-num">${idx}</span></div></td>`);
      html.push(`<td>${item.origin || '<span style="color:var(--text-muted)">-</span>'}</td>`);

      // 材质 + 压延标签
      let matHtml = item.material || '';
      if (item.isYanYan) matHtml += ' <span class="tag tag-yanyan">压延</span>';
      html.push(`<td>${matHtml}</td>`);
      html.push(`<td>${item.surface || '<span style="color:var(--text-muted)">2B</span>'}</td>`);
      html.push(`<td>${item.thickness}</td>`);
      html.push(`<td>${item.width}</td>`);
      html.push(`<td>${(item.length || 'C') === 'C' ? '<span style="color:#5b21b6;font-weight:600">C</span>' : item.length}</td>`);
      html.push(`<td>${item.film1 || '<span style="color:var(--text-muted)">-</span>'}</td>`);
      html.push(`<td>${item.film2 || '<span style="color:var(--text-muted)">-</span>'}</td>`);

      if (isSuccess) {
        html.push(`<td class="price-cell price-cost">${d.costTax.toLocaleString()}</td>`);
        html.push(`<td class="price-cell price-subtle">${d.costNoTax.toLocaleString()}</td>`);
        html.push(`<td><span class="tag tag-${d.edgeType}">${d.edgeType === 'rough' ? '毛边' : '齐边'}</span> <span class="tag tag-${d.boardType}">${d.boardType === 'coil' ? '卷' : '板'}</span></td>`);
        html.push(`<td class="price-cell price-sale">${d.saleTax.toLocaleString()}</td>`);
        html.push(`<td class="price-cell price-subtle">${d.saleNoTax.toLocaleString()}</td>`);
      } else if (isError) {
        html.push(`<td colspan="6" class="error-text">⚠️ ${r.errors.join('；')}</td>`);
      } else {
        html.push(`<td colspan="6" style="color:var(--text-muted);font-size:12px">待计算</td>`);
      }
      html.push(`<td><button class="btn-icon btn-ghost delete-btn" onclick="App.removeRow(${idx})">✕</button></td>`);
      html.push('</tr>');

      if (isSuccess) {
        html.push(`<tr class="detail-row" id="detail-${idx}"><td colspan="16"><div class="detail-content">`);
        html.push(renderBreakdown(d, item));
        html.push('</div></td></tr>');
      }
    });
    els.tableBody.innerHTML = html.join('');
  }

  function renderResults() { renderStats(); renderTable(); }

  function fmt(v) { return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtInt(v) { return v.toLocaleString(); }

  function renderBreakdown(d, item) {
    const specStr = `${d.thickness} × ${d.width} × ${d.length}`;
    const matLabel = d.material + (d.isYanYan ? ' 压延料' : '');
    const boardLabel = (d.edgeType === 'rough' ? '毛边' : '齐边') + (d.boardType === 'coil' ? '卷板' : '平板');
    const header = `规格：${specStr}　｜　材质：${matLabel}　｜　表面：${d.surface}　｜　类型：${boardLabel}`;

    let h = `<div style="margin-bottom:12px;font-size:12px;color:var(--text-secondary);font-weight:500;">${header}</div>`;
    h += '<div class="calc-breakdown"><div class="calc-section"><div class="calc-section-title">含税成本计算过程</div>';
    h += calcStep('① 基价', d.basePrice, '元/吨', true);
    h += calcStep(`② 厚度加价 (${d.thickness}mm, ${d.thickTable})`, d.thickSurcharge, '元/吨', d.thickSurcharge > 0);
    if (d.surfaceFeeSqm > 0) {
      h += calcStep(`③ 表面加工费 (${d.surface}, ${fmt(d.surfaceFeeSqm)}元/² × ${fmt(d.sqmPerTon)}²/吨)`, d.surfaceFeePerTon, '元/吨', true);
    } else if (d.surfaceFeePerTon > 0) {
      h += calcStep(`③ 表面加工费 (${d.surface})`, d.surfaceFeePerTon, '元/吨', true);
    } else {
      h += calcStep(`③ 表面加工费 (${d.surface})`, 0, '', false);
    }
    if (d.film1PerTon > 0) {
      h += calcStep(`④ 保护膜1 (${d.film1}, ${d.film1FeeSqm}元/² × ${fmt(d.sqmPerTon)}²/吨)`, d.film1PerTon, '元/吨', true);
    } else { h += calcStep('④ 保护膜1', 0, '', false); }
    if (d.film2PerTon > 0) {
      h += calcStep(`⑤ 保护膜2 (${d.film2}, ${d.film2FeeSqm}元/² × ${fmt(d.sqmPerTon)}²/吨)`, d.film2PerTon, '元/吨', true);
    } else if (d.film2 && d.film2.trim()) { h += calcStep('⑤ 保护膜2', 0, '', false); }
    h += calcTotal('含税成本小计', d.costRaw, 'tax');
    h += calcTotal('四舍五入 (十位)', d.costTax, 'tax');
    h += '</div><div class="calc-section"><div class="calc-section-title">不含税成本 & 销售价</div>';
    h += calcStep(`不含税成本 (${fmtInt(d.costTax)} × 0.92)`, d.costNoTaxRaw, '元/吨', true);
    h += calcTotal('四舍五入 (十位)', d.costNoTax, 'notax');
    h += '<div style="height:8px;"></div>';
    h += calcStep(`销售加价 (${boardLabel})`, d.markup, '元/吨', d.markup > 0);
    h += calcTotal('含税售价', d.saleTax, 'sale');
    h += calcTotal('不含税售价', d.saleNoTax, 'sale');
    h += '</div></div>';
    return h;
  }

  function calcStep(label, value, unit, positive) {
    return `<div class="calc-step"><span class="calc-step-label">${label}</span><span class="calc-step-value ${positive ? 'positive' : 'zero'}">${positive ? '+'+fmt(value) : '0'} ${unit}</span></div>`;
  }
  function calcTotal(label, value, type) {
    return `<div class="calc-total"><span class="calc-total-label">${label}</span><span class="calc-total-value ${type}">${fmtInt(value)} 元/吨</span></div>`;
  }

  function showToast(message, type = 'info') {
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    t.innerHTML = `<span>${icons[type]||''}</span> ${message}`;
    c.appendChild(t);
    setTimeout(() => { t.style.animation = 'toastIn 0.3s ease reverse'; setTimeout(() => t.remove(), 300); }, 3000);
  }

  return { init, removeRow, toggleExpand };
})();

document.addEventListener('DOMContentLoaded', App.init);
