/**
 * 不锈钢批量报价系统 - 主应用逻辑
 */
const App = (() => {
  let dataItems = [];
  let results = [];
  let basePrice = 7800;
  let allExpanded = false;

  const els = {};

  function init() {
    cacheDom();
    bindEvents();
    render();
  }

  function cacheDom() {
    els.basePriceInput = document.getElementById('basePrice');
    els.calculateBtn = document.getElementById('calculateBtn');
    els.exportBtn = document.getElementById('exportBtn');
    els.exportBtn2 = document.getElementById('exportBtn2');
    els.clearBtn = document.getElementById('clearBtn');
    els.addManualBtn = document.getElementById('addManualBtn');
    els.expandAllBtn = document.getElementById('expandAllBtn');
    els.fileInput = document.getElementById('fileInput');
    els.tableBody = document.getElementById('resultBody');
    els.emptyState = document.getElementById('emptyState');
    els.statsBar = document.getElementById('statsBar');
    els.resultCard = document.getElementById('resultCard');
    els.totalCount = document.getElementById('totalCount');
    els.successCount = document.getElementById('successCount');
    els.errorCount = document.getElementById('errorCount');
    els.minSaleTax = document.getElementById('minSaleTax');
    els.maxSaleTax = document.getElementById('maxSaleTax');
    els.freeText = document.getElementById('freeText');
    els.parseTextBtn = document.getElementById('parseTextBtn');
  }

  function bindEvents() {
    els.basePriceInput.addEventListener('change', (e) => {
      basePrice = parseFloat(e.target.value) || 0;
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
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addManualRow();
      });
    });
  }

  // ========== 数据操作 ==========

  function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    showToast('正在解析文件...', 'info');
    ExcelParser.parseExcel(file, basePrice)
      .then(items => {
        if (items.length === 0) {
          showToast('未能从文件中解析出有效数据', 'error');
          return;
        }
        dataItems = dataItems.concat(items);
        results = [];
        showToast(`成功导入 ${items.length} 条数据`, 'success');
        render();
      })
      .catch(err => {
        showToast('文件解析失败: ' + err.message, 'error');
      });
    e.target.value = '';
  }

  function addManualRow() {
    const thickness = document.getElementById('manualThickness').value.trim();
    const width = document.getElementById('manualWidth').value.trim();
    const length = document.getElementById('manualLength').value.trim();
    const surface = document.getElementById('manualSurface').value.trim();
    const film1 = document.getElementById('manualFilm1').value.trim();
    const film2 = document.getElementById('manualFilm2').value.trim();
    if (!thickness || !width) {
      showToast('请至少填写厚度和宽度', 'error');
      return;
    }
    dataItems.push({
      material: document.getElementById('manualMaterial').value.trim() || '201',
      surface, thickness, width,
      length: length || 'C',
      film1, film2, basePrice
    });
    results = [];
    showToast('已添加 1 条', 'success');
    render();
    ['manualThickness','manualWidth','manualLength','manualSurface','manualFilm1','manualFilm2'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('manualThickness').focus();
  }

  function parseFreeText() {
    const text = els.freeText.value.trim();
    if (!text) { showToast('请输入数据', 'error'); return; }
    const lines = text.split('\n').filter(l => l.trim());
    let count = 0;
    for (const line of lines) {
      const parsed = PricingEngine.parseFreeText(line.trim(), basePrice);
      if (parsed && parsed.thickness && parsed.width) {
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
      showToast('未能解析出有效数据', 'error');
    }
  }

  function runCalculation() {
    if (dataItems.length === 0) { showToast('请先添加数据', 'error'); return; }
    basePrice = parseFloat(els.basePriceInput.value) || 0;
    if (basePrice <= 0) { showToast('请输入有效的基价', 'error'); return; }
    dataItems.forEach(item => { item.basePrice = basePrice; });
    results = PricingEngine.calculateBatch(dataItems);
    const ok = results.filter(r => r.success).length;
    const fail = results.filter(r => !r.success).length;
    showToast(`计算完成：${ok} 成功，${fail} 失败`, ok > 0 ? 'success' : 'error');
    renderResults();
  }

  function clearAll() {
    dataItems = [];
    results = [];
    allExpanded = false;
    render();
    showToast('已清空', 'info');
  }

  function removeRow(index) {
    dataItems.splice(index - 1, 1);
    results = [];
    render();
  }

  function exportResults() {
    if (results.length === 0) { showToast('请先计算', 'error'); return; }
    const now = new Date();
    const ds = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    ExcelParser.exportToExcel(results, `报价结果_${ds}.xlsx`);
    showToast('导出成功', 'success');
  }

  function toggleExpand(index) {
    const detailRow = document.getElementById(`detail-${index}`);
    const expandBtn = document.getElementById(`expand-btn-${index}`);
    if (detailRow) {
      detailRow.classList.toggle('open');
      if (expandBtn) expandBtn.classList.toggle('open');
    }
  }

  function toggleAllExpand() {
    allExpanded = !allExpanded;
    results.forEach((r, i) => {
      if (r.success) {
        const idx = i + 1;
        const detailRow = document.getElementById(`detail-${idx}`);
        const expandBtn = document.getElementById(`expand-btn-${idx}`);
        if (detailRow) {
          if (allExpanded) {
            detailRow.classList.add('open');
            if (expandBtn) expandBtn.classList.add('open');
          } else {
            detailRow.classList.remove('open');
            if (expandBtn) expandBtn.classList.remove('open');
          }
        }
      }
    });
    els.expandAllBtn.textContent = allExpanded ? '📋 收起明细' : '📋 全部明细';
  }

  // ========== 渲染 ==========

  function render() {
    renderStats();
    renderTable();
  }

  function renderStats() {
    const successResults = results.filter(r => r.success);
    els.totalCount.textContent = dataItems.length;
    els.successCount.textContent = successResults.length;
    els.errorCount.textContent = results.filter(r => !r.success).length;

    if (successResults.length > 0) {
      const salePrices = successResults.map(r => r.detail.saleTax);
      els.minSaleTax.textContent = Math.min(...salePrices).toLocaleString();
      els.maxSaleTax.textContent = Math.max(...salePrices).toLocaleString();
    } else {
      els.minSaleTax.textContent = '-';
      els.maxSaleTax.textContent = '-';
    }

    els.exportBtn.disabled = successResults.length === 0;
    els.exportBtn2.disabled = successResults.length === 0;
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

      // Main row
      html.push(`<tr class="${isError ? 'error-row' : 'main-row'}">`);

      // Expand button
      if (isSuccess) {
        html.push(`<td><button class="expand-btn" id="expand-btn-${idx}" onclick="App.toggleExpand(${idx})" title="查看计算明细">▶</button></td>`);
      } else {
        html.push('<td></td>');
      }

      html.push(`<td><div class="index-cell"><span class="index-num">${idx}</span></div></td>`);
      html.push(`<td>${item.origin || '<span style="color:var(--text-muted)">-</span>'}</td>`);
      html.push(`<td>${item.material || ''}</td>`);
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

      html.push(`<td><button class="btn-icon btn-ghost delete-btn" onclick="App.removeRow(${idx})" title="删除">✕</button></td>`);
      html.push('</tr>');

      // Detail row (only for successful calculations)
      if (isSuccess) {
        html.push(`<tr class="detail-row" id="detail-${idx}"><td colspan="16"><div class="detail-content">`);
        html.push(renderBreakdown(d, item));
        html.push('</div></td></tr>');
      }
    });

    els.tableBody.innerHTML = html.join('');
  }

  function renderResults() {
    renderStats();
    renderTable();
  }

  function fmt(v) {
    return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtInt(v) {
    return v.toLocaleString();
  }

  function renderBreakdown(d, item) {
    const specStr = `${d.thickness} × ${d.width} × ${d.length}`;
    const boardLabel = (d.edgeType === 'rough' ? '毛边' : '齐边') + (d.boardType === 'coil' ? '卷板' : '平板');
    const specFull = `规格：${specStr}　｜　材质：${d.material}　｜　表面：${d.surface}　｜　类型：${boardLabel}`;

    let html = `<div style="margin-bottom:12px;font-size:12px;color:var(--text-secondary);font-weight:500;">${specFull}</div>`;
    html += '<div class="calc-breakdown">';

    // Left: 成本计算过程
    html += '<div class="calc-section">';
    html += '<div class="calc-section-title">含税成本计算过程</div>';
    html += calcStep('① 基价', d.basePrice, '元/吨', true);
    html += calcStep(`② 厚度加价 (${d.thickness}mm)`, d.thickSurcharge, '元/吨', d.thickSurcharge > 0);

    // Surface fee detail
    if (d.surfaceFeeSqm > 0) {
      html += calcStep(`③ 表面加工费 (${d.surface}, ${fmt(d.surfaceFeeSqm)}元/² × ${fmt(d.sqmPerTon)}²/吨)`, d.surfaceFeePerTon, '元/吨', true);
    } else if (d.surfaceFeePerTon > 0) {
      html += calcStep(`③ 表面加工费 (${d.surface})`, d.surfaceFeePerTon, '元/吨', true);
    } else {
      html += calcStep(`③ 表面加工费 (${d.surface})`, 0, '元/吨', false);
    }

    // Film 1
    if (d.film1PerTon > 0) {
      html += calcStep(`④ 保护膜1 (${d.film1}, ${d.film1FeeSqm}元/² × ${fmt(d.sqmPerTon)}²/吨)`, d.film1PerTon, '元/吨', true);
    } else {
      html += calcStep('④ 保护膜1', 0, '', false);
    }

    // Film 2
    if (d.film2PerTon > 0) {
      html += calcStep(`⑤ 保护膜2 (${d.film2}, ${d.film2FeeSqm}元/² × ${fmt(d.sqmPerTon)}²/吨)`, d.film2PerTon, '元/吨', true);
    } else if (d.film2 && d.film2.trim()) {
      html += calcStep('⑤ 保护膜2', 0, '', false);
    }

    // Subtotal
    html += calcTotal('含税成本小计', d.costRaw, 'tax');
    html += calcTotal('四舍五入 (十位)', d.costTax, 'tax');
    html += '</div>';

    // Right: 不含税 & 售价
    html += '<div class="calc-section">';
    html += '<div class="calc-section-title">不含税成本 & 销售价</div>';

    html += calcStep(`不含税成本 (${fmtInt(d.costTax)} × 0.92)`, d.costNoTaxRaw, '元/吨', true);
    html += calcTotal('四舍五入 (十位)', d.costNoTax, 'notax');

    html += '<div style="height:8px;"></div>';
    html += calcStep(`销售加价 (${boardLabel})`, d.markup, '元/吨', d.markup > 0);

    html += calcTotal('含税售价', d.saleTax, 'sale');
    html += calcTotal('不含税售价', d.saleNoTax, 'sale');

    html += '</div>';

    html += '</div>'; // calc-breakdown
    return html;
  }

  function calcStep(label, value, unit, positive) {
    const cls = positive ? 'positive' : 'zero';
    const display = positive ? `+${fmt(value)}` : '0';
    return `<div class="calc-step">
      <span class="calc-step-label">${label}</span>
      <span class="calc-step-value ${cls}">${display} ${unit}</span>
    </div>`;
  }

  function calcTotal(label, value, type) {
    return `<div class="calc-total">
      <span class="calc-total-label">${label}</span>
      <span class="calc-total-value ${type}">${fmtInt(value)} 元/吨</span>
    </div>`;
  }

  // ========== Toast ==========

  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || ''}</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastIn 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  return { init, removeRow, toggleExpand };
})();

document.addEventListener('DOMContentLoaded', App.init);
