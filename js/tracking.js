// tracking.js — KK 不锈钢跟单系统（v1.0.186）
// 依赖：auth.js（KKAuth）、js/vendor/xlsx.mini.min.js（SheetJS，导入用）
(function () {
  var API = 'trackingTable';
  var items = [];          // 当前云端全部数据
  var curFilter = '';      // '' | inventory | ordered
  var kw = '';
  var editingId = null;    // null=新增
  var editStatus = 'inventory';
  var impRows = null;      // 待导入行（对象数组）

  // ---------- 工具 ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(msg, ok) {
    var d = document.createElement('div');
    d.className = 'toast ' + (ok === false ? 'err' : 'ok');
    d.textContent = msg;
    $('toasts').appendChild(d);
    setTimeout(function () { d.remove(); }, 2600);
  }
  async function api(data) {
    var auth = KKAuth.getAuth();
    if (!auth || !auth.token) throw new Error('未登录');
    var r = await KKAuth.call(API, Object.assign({ token: auth.token }, data || {}));
    if (!r || !r.ok) throw new Error((r && r.msg) || '请求失败');
    return r;
  }
  function normDate(s) {
    // Excel 序列号 → 日期
    s = String(s == null ? '' : s).trim();
    if (/^\d{5}(\.\d+)?$/.test(s)) {
      var d = new Date(1899, 11, 30);
      d.setDate(d.getDate() + Math.floor(parseFloat(s)));
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    var m = s.match(/^(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    return s;
  }
  function statusLabel(st) { return st === 'ordered' ? '已接单' : '库存'; }
  function parseStatusVal(v) {
    v = String(v == null ? '' : v).trim();
    if (/已接单|接单|ordered/i.test(v)) return 'ordered';
    if (/库存|inventory/i.test(v)) return 'inventory';
    return '';
  }
  // v1.0.193：货物状态变更轨迹（云函数记录 {at, by, action, from, to}）
  function stLogArr(it) {
    try { var a = JSON.parse((it && it.status_log) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function stLogText(l) {
    if (l.action === 'created') return '新建 → ' + statusLabel(l.to);
    if (l.action === 'import') return '导入 → ' + statusLabel(l.to);
    return statusLabel(l.from) + ' → ' + statusLabel(l.to);
  }
  function stLast(it) {
    var a = stLogArr(it);
    if (!a.length) return '';
    var l = a[a.length - 1];
    return String(l.at || '').slice(5, 16) + ' · ' + (l.by || '—');
  }
  function stTitle(it) {
    var a = stLogArr(it);
    if (!a.length) return '';
    return a.map(function (l) { return String(l.at || '') + '  ' + stLogText(l) + '  ｜ ' + (l.by || '—'); }).join('\n');
  }

  // ---------- 渲染 ----------
  function refreshDatalists() {
    var uniq = function (key) {
      var s = new Set();
      items.forEach(function (it) { var v = String(it[key] || '').trim(); if (v) s.add(v); });
      return Array.from(s);
    };
    var fill = function (id, arr) { $(id).innerHTML = arr.map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join(''); };
    fill('dl_warehouse', uniq('warehouse'));
    fill('dl_grade', uniq('grade'));
    fill('dl_surface', uniq('surface'));
  }

  function render() {
    var rows = items.filter(function (it) {
      if (curFilter && it.status !== curFilter) return false;
      if (kw) {
        var hay = [it.code, it.contract_no, it.supplier, it.grade, it.warehouse, it.origin, it.prod_status, it.note].join(' ').toLowerCase();
        if (hay.indexOf(kw) < 0) return false;
      }
      return true;
    });
    $('nAll').textContent = items.length;
    $('nInv').textContent = items.filter(function (i) { return i.status === 'inventory'; }).length;
    $('nOrd').textContent = items.filter(function (i) { return i.status === 'ordered'; }).length;
    var tb = $('tbody');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="23" class="empty">暂无数据' + (items.length ? '（当前筛选无匹配）' : '，点击右上「＋ 新增记录」或「导入 Excel/CSV」开始') + '</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(function (it) {
      var ord = it.status === 'ordered';
      var lg = stLast(it);
      return '<tr>' +
        '<td>' + esc(it.purchase_date) + '</td>' +
        '<td>' + esc(it.warehouse_date) + '</td>' +
        '<td>' + esc(it.warehouse) + '</td>' +
        '<td>' + esc(it.grade) + '</td>' +
        '<td>' + esc(it.surface) + '</td>' +
        '<td>' + esc(it.thickness) + '</td>' +
        '<td>' + esc(it.width) + '</td>' +
        '<td>' + esc(it.length) + '</td>' +
        '<td>' + esc(it.weight) + '</td>' +
        '<td>' + esc(it.count) + '</td>' +
        '<td>' + esc(it.orig_weight) + '</td>' +
        '<td>' + esc(it.prod_status) + '</td>' +
        '<td><b>' + esc(it.code) + '</b></td>' +
        '<td>' + esc(it.contract_no) + '</td>' +
        '<td style="max-width:220px;overflow:hidden;text-overflow:ellipsis" title="' + esc(it.note) + '">' + esc(it.note) + '</td>' +
        '<td>' + esc(it.type) + '</td>' +
        '<td>' + esc(it.origin) + '</td>' +
        '<td class="num-r">' + esc(it.total_amount) + '</td>' +
        '<td class="num-r">' + esc(it.unit_price) + '</td>' +
        '<td>' + esc(it.supplier) + '</td>' +
        '<td class="num-r">' + esc(it.sale_price) + '</td>' +
        '<td class="st-cell"><span class="st ' + (ord ? 'ord' : 'inv') + '">' + (ord ? '🔥 已接单' : '📦 库存') + '</span>' +
        (lg ? '<div class="st-log" title="' + esc(stTitle(it)) + '">' + esc(lg) + '</div>' : '') +
        '</td>' +
        '<td class="op">' +
          '<button class="mini" data-act="edit" data-id="' + it.id + '">编辑</button>' +
          (ord
            ? '<button class="mini back" data-act="st" data-id="' + it.id + '" data-v="inventory">转库存</button>'
            : '<button class="mini go" data-act="st" data-id="' + it.id + '" data-v="ordered">转已接单</button>') +
          '<button class="mini del" data-act="del" data-id="' + it.id + '">删除</button>' +
        '</td>' +
        '</tr>';
    }).join('');
  }

  // ---------- 数据 ----------
  async function load() {
    try {
      var r = await api({ action: 'list' });
      items = r.items || [];
      refreshDatalists();
      render();
    } catch (e) {
      $('tbody').innerHTML = '<tr><td colspan="23" class="empty">加载失败：' + esc(e.message) + '</td></tr>';
      toast(e.message, false);
    }
  }

  // ---------- 弹窗：新增/编辑 ----------
  var F = ['code','contractNo','purchaseDate','warehouseDate','warehouse','grade','surface','thickness','width','length','weight','count','origWeight','prodStatus','type','origin','supplier','unitPrice','totalAmount','salePrice','note'];
  var F2DB = { contractNo: 'contract_no', purchaseDate: 'purchase_date', warehouseDate: 'warehouse_date', origWeight: 'orig_weight', prodStatus: 'prod_status', totalAmount: 'total_amount', unitPrice: 'unit_price', salePrice: 'sale_price' };
  function openEdit(it) {
    editingId = it ? it.id : null;
    editStatus = it ? it.status : 'inventory';
    $('dlgTitle').textContent = it ? ('编辑记录 #' + it.id + (it.code ? ' · ' + it.code : '')) : '新增记录';
    F.forEach(function (f) {
      var db = F2DB[f] || f;
      $( 'f_' + f).value = it ? (it[db] == null ? '' : String(it[db])) : '';
    });
    if (it && it.purchase_date) $('f_purchaseDate').value = it.purchase_date;
    if (it && it.warehouse_date) $('f_warehouseDate').value = it.warehouse_date;
    renderStPick();
    renderStHistory(it);
    $('editMask').classList.add('show');
  }
  // v1.0.193：编辑弹窗底部展示该条记录的状态变更轨迹（时间 + 操作账号）
  function renderStHistory(it) {
    var box = $('stHistory');
    if (!box) return;
    var a = it ? stLogArr(it) : [];
    if (!a.length) { box.innerHTML = '<div class="sh-t">状态变更记录</div><div class="sh-i sh-none">暂无记录（保存后开始记录）</div>'; return; }
    box.innerHTML = '<div class="sh-t">状态变更记录</div>' + a.slice().reverse().map(function (l) {
      return '<div class="sh-i"><span class="sh-at">' + esc(String(l.at || '')) + '</span>' +
        '<span class="sh-w">' + esc(stLogText(l)) + '</span>' +
        '<span class="sh-by">' + esc(l.by || '—') + '</span></div>';
    }).join('');
  }
  function renderStPick() {
    Array.prototype.forEach.call($('stPick').children, function (b) {
      b.className = '';
      if (b.dataset.v === editStatus) b.className = editStatus === 'ordered' ? 'on-ord' : 'on-inv';
    });
  }
  async function saveEdit() {
    if (!$('editMask').classList.contains('show')) return; // 防隐藏弹窗误触发
    var it = { status: editStatus };
    F.forEach(function (f) { it[f] = $('f_' + f).value.trim(); });
    it.purchaseDate = normDate(it.purchaseDate);
    it.warehouseDate = normDate(it.warehouseDate);
    if (!(it.code || it.grade || it.supplier || it.warehouse || it.contractNo)) {
      toast('至少填写 编号/钢种/供应商/仓库/合同号 之一', false);
      return;
    }
    if (editingId > 0) it.id = editingId;
    try {
      await api({ action: 'save', item: it });
      $('editMask').classList.remove('show');
      toast(editingId > 0 ? '已保存' : '已新增');
      await load();
    } catch (e) { toast(e.message, false); }
  }

  // ---------- 导入 ----------
  function openImp() {
    impRows = null;
    $('impFile').value = '';
    $('impPaste').value = '';
    $('impPrev').style.display = 'none';
    $('impPrev').innerHTML = '';
    $('impGo').disabled = true;
    $('impZone').className = 'imp-zone';
    $('impZone').innerHTML = $('impZone').getAttribute('data-html') || $('impZone').innerHTML;
    $('impMask').classList.add('show');
  }
  // 列模板（与后端/表单一致；首列编号 … 尾列货物状态）
  var IMP_COLS = ['code','contractNo','purchaseDate','warehouseDate','warehouse','grade','surface','thickness','width','length','weight','count','origWeight','prodStatus','type','origin','supplier','unitPrice','totalAmount','salePrice','note','status'];
  var IMP_HEADERS = ['编号','合同号','采购日期','进仓日期','仓库/加工厂','仓库','加工厂','钢种','材质','表面','厚度','宽度','长度','重量','卷数/张数','数量','原重','生产状态','类型','产地','供应商','单价','总金额','销售定价','备注','货物状态','状态'];
  function buildRowsFromAoA(aoa, hasHeader) {
    if (!aoa || !aoa.length) return null;
    var start = hasHeader ? 1 : 0;
    var out = [];
    for (var i = start; i < aoa.length; i++) {
      var row = aoa[i];
      if (!row || !row.length) continue;
      var allEmpty = row.every(function (c) { return c == null || String(c).trim() === ''; });
      if (allEmpty) continue;
      var it = {};
      for (var j = 0; j < IMP_COLS.length && j < row.length; j++) it[IMP_COLS[j]] = row[j];
      // 状态列：值可空/库存/已接单
      var st = parseStatusVal(it.status);
      it.status = st || $('impDefStatus').value || 'inventory';
      out.push(it);
    }
    return out.length ? out : null;
  }
  function showPrev(rows) {
    impRows = rows;
    var prev = $('impPrev');
    prev.style.display = 'block';
    var head = IMP_COLS.slice(0, Math.min(IMP_COLS.length, 12)).concat(['…', '货物状态']);
    var body = rows.slice(0, 5).map(function (it) {
      return '<tr>' + IMP_COLS.slice(0, 12).map(function (c) { return '<td>' + esc(it[c]) + '</td>'; }).join('') + '<td>…</td><td>' + esc(statusLabel(it.status)) + '</td></tr>';
    }).join('');
    prev.innerHTML = '<table><thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + body + '</tbody></table>' +
      '<div style="padding:8px 10px;font-size:12px;color:#475569;background:#f8fafc">共解析 <b>' + rows.length + '</b> 条（预览前 5 条，日期将自动规范为 YYYY-MM-DD）</div>';
    $('impGo').disabled = false;
  }
  function handleFile(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var wb = XLSX.read(e.target.result, { type: 'array' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
        var hasHeader = $('impHasHeader').checked;
        // 智能识别：若首行大部分命中表头词，则视为表头
        if (aoa.length && !hasHeader) {
          var hits = 0;
          (aoa[0] || []).forEach(function (c) { if (IMP_HEADERS.indexOf(String(c).trim()) >= 0) hits++; });
          if (hits >= 3) hasHeader = true;
        } else if (aoa.length && hasHeader) {
          var hits2 = 0;
          (aoa[0] || []).forEach(function (c) { if (IMP_HEADERS.indexOf(String(c).trim()) >= 0) hits2++; });
          if (hits2 < 2) hasHeader = false; // 勾了表头但首行不像表头 → 不跳过
        }
        var rows = buildRowsFromAoA(aoa, hasHeader);
        if (!rows) { toast('未解析到有效数据行', false); return; }
        // 规范日期
        rows.forEach(function (it) { it.purchaseDate = normDate(it.purchaseDate); it.warehouseDate = normDate(it.warehouseDate); });
        $('impZone').className = 'imp-zone has';
        $('impZone').innerHTML = '✅ ' + esc(file.name) + ' · ' + rows.length + ' 条';
        showPrev(rows);
      } catch (err) {
        toast('解析失败：' + err.message, false);
      }
    };
    reader.readAsArrayBuffer(file);
  }
  function handlePaste() {
    var txt = $('impPaste').value;
    if (!txt.trim()) { toast('请先粘贴表格内容', false); return; }
    var lines = txt.replace(/\r/g, '').split('\n').filter(function (l) { return l.trim() !== ''; });
    var aoa = lines.map(function (l) {
      return (l.indexOf('\t') >= 0 ? l.split('\t') : l.split(',')).map(function (c) { return c.replace(/^"|"$/g, '').trim(); });
    });
    var hasHeader = $('impHasHeader').checked;
    var hits = 0;
    (aoa[0] || []).forEach(function (c) { if (IMP_HEADERS.indexOf(String(c).trim()) >= 0) hits++; });
    if (hits >= 3) hasHeader = true;
    else if (aoa.length && !hasHeader && false) {}
    var rows = buildRowsFromAoA(aoa, hasHeader && hits >= 3);
    if (!rows) { toast('未解析到有效数据行', false); return; }
    rows.forEach(function (it) { it.purchaseDate = normDate(it.purchaseDate); it.warehouseDate = normDate(it.warehouseDate); });
    showPrev(rows);
  }
  async function doImport() {
    if (!impRows || !impRows.length) return;
    $('impGo').disabled = true;
    $('impGo').textContent = '导入中…';
    try {
      var payload = impRows.map(function (it) {
        var o = {};
        IMP_COLS.forEach(function (c) { o[c] = it[c]; });
        return o;
      });
      var r = await api({ action: 'import', rows: payload });
      $('impMask').classList.remove('show');
      toast('导入成功 ' + (r.imported || 0) + ' 条' + (r.skipped ? '，跳过 ' + r.skipped + ' 条空行' : ''));
      await load();
    } catch (e) {
      toast(e.message, false);
    }
    $('impGo').disabled = false;
    $('impGo').textContent = '确认导入';
  }

  // ---------- 导出 ----------
  function doExport() {
    var rows = items.filter(function (it) { return !curFilter || it.status === curFilter; });
    var head = ['采购日期','进仓日期','仓库/加工厂','钢种','表面','厚度','宽度','长度','重量','卷数/张数','原重','生产状态','编号','合同号','备注','类型','产地','总金额','单价','供应商','销售定价','货物状态'];
    var lines = [head.join(',')];
    rows.forEach(function (it) {
      lines.push([it.purchase_date, it.warehouse_date, it.warehouse, it.grade, it.surface, it.thickness, it.width, it.length, it.weight, it.count, it.orig_weight, it.prod_status, it.code, it.contract_no, '"' + String(it.note || '').replace(/"/g, '""') + '"', it.type, it.origin, it.total_amount, it.unit_price, it.supplier, it.sale_price, '"' + statusLabel(it.status) + '"']
        .map(function (c) { return c == null ? '' : String(c); }).join(','));
    });
    var blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '跟单数据_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
  }

  // ---------- 事件绑定 ----------
  function bind() {
    $('logoutBtn').addEventListener('click', function () { KKAuth.logout(); });
    Array.prototype.forEach.call(document.querySelectorAll('.stat'), function (el) {
      el.addEventListener('click', function () {
        document.querySelectorAll('.stat').forEach(function (x) { x.classList.remove('active'); });
        el.classList.add('active');
        curFilter = el.dataset.st || '';
        Array.prototype.forEach.call($('stTabs').children, function (b) { b.className = (b.dataset.st === curFilter) ? 'active' : ''; });
        render();
      });
    });
    Array.prototype.forEach.call($('stTabs').children, function (b) {
      b.addEventListener('click', function () {
        curFilter = b.dataset.st || '';
        Array.prototype.forEach.call($('stTabs').children, function (x) { x.className = (x === b) ? 'active' : ''; });
        render();
      });
    });
    $('kw').addEventListener('input', function () { kw = this.value.trim().toLowerCase(); render(); });
    $('addBtn').addEventListener('click', function () { openEdit(null); });
    $('dlgClose').addEventListener('click', function () { $('editMask').classList.remove('show'); });
    $('dlgCancel').addEventListener('click', function () { $('editMask').classList.remove('show'); });
    $('editMask').addEventListener('click', function (e) { if (e.target === this) this.classList.remove('show'); });
    $('dlgSave').addEventListener('click', saveEdit);
    Array.prototype.forEach.call($('stPick').children, function (b) {
      b.addEventListener('click', function () { editStatus = b.dataset.v; renderStPick(); });
    });
    $('tbody').addEventListener('click', async function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var id = parseInt(btn.dataset.id, 10);
      var act = btn.dataset.act;
      if (act === 'edit') {
        var it = items.find(function (x) { return String(x.id) === String(id); });
        if (it) openEdit(it); else toast('记录已被刷新，请重试', false);
      } else if (act === 'st') {
        try {
          await api({ action: 'status', id: id, status: btn.dataset.v });
          toast('已转为' + statusLabel(btn.dataset.v));
          await load();
        } catch (err) { toast(err.message, false); }
      } else if (act === 'del') {
        if (!confirm('确认删除该条记录？不可恢复。')) return;
        try {
          await api({ action: 'delete', id: id });
          toast('已删除');
          await load();
        } catch (err) { toast(err.message, false); }
      }
    });
    // 导入
    $('impBtn').addEventListener('click', openImp);
    $('impClose').addEventListener('click', function () { $('impMask').classList.remove('show'); });
    $('impCancel').addEventListener('click', function () { $('impMask').classList.remove('show'); });
    $('impMask').addEventListener('click', function (e) { if (e.target === this) this.classList.remove('show'); });
    $('impZone').addEventListener('click', function () { $('impFile').click(); });
    $('impZone').setAttribute('data-html', $('impZone').innerHTML);
    $('impZone').addEventListener('dragover', function (e) { e.preventDefault(); this.style.borderColor = '#2c5282'; });
    $('impZone').addEventListener('dragleave', function () { this.style.borderColor = ''; });
    $('impZone').addEventListener('drop', function (e) {
      e.preventDefault(); this.style.borderColor = '';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    $('impFile').addEventListener('change', function () { if (this.files && this.files[0]) handleFile(this.files[0]); });
    $('impPaste').addEventListener('input', handlePaste);
    $('impGo').addEventListener('click', doImport);
    $('expBtn').addEventListener('click', doExport);
  }

  // ---------- 启动 ----------
  (async function init() {
    bind();
    var auth = await KKAuth.requireLogin();
    if (!auth) return;
    $('curUser').textContent = '当前：' + (auth.realName || auth.username);
    await load();
  })();
})();
