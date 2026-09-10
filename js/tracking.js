// tracking.js — KK 不锈钢跟单系统（v1.0.194）
// 依赖：auth.js（KKAuth）、js/vendor/xlsx.mini.min.js（SheetJS，导入用）
// v1.0.194：① 板块化（库存 / 已接单两套列与两套状态列）② 入仓字段按业务清单（KG 三重量、含税/不含税价、负差、实卡厚）
//           ③ 状态列可就地切换并留痕（时间 + 操作账号）④ 顶部汇总（条数 / 卷数 / 吨数 / 金额）
(function () {
  var API = 'trackingTable';
  var items = [];          // 云端全部数据
  var board = 'inventory'; // 当前板块：inventory | ordered
  var kw = '';
  var editingId = null;
  var editBoard = 'inventory';
  var impRows = null;

  // ---------- 状态枚举 ----------
  var ENUM_INV = ['在库', '已预订', '部分出库', '已售出'];
  var ENUM_ORD = ['采购下单', '原料到仓', '投入生产', '加工完成', '发货自提', '已交付'];

  // ---------- 列定义（主体按业务清单顺序）----------
  var BASE_COLS = [
    { k: 'purchase_date', t: '采购日期' },
    { k: 'warehouse_date', t: '进仓日期' },
    { k: 'warehouse', t: '仓库/加工厂' },
    { k: 'grade', t: '钢种' },
    { k: 'surface', t: '表面' },
    { k: 'thickness', t: '厚度' },
    { k: 'width', t: '宽度' },
    { k: 'length', t: '长度' },
    { k: 'w_orig', t: '原重/KG', num: 1 },
    { k: 'w_now', t: '现重/KG', num: 1 },
    { k: 'w_gross', t: '毛重/KG', num: 1 },
    { k: 'count', t: '卷数/张数', num: 1 },
    { k: 'prod_status', t: '生产状态' },
    { k: 'code', t: '编号', bold: 1 },
    { k: 'contract_no', t: '合同号' },
    { k: 'note', t: '备注', wide: 1 },
    { k: 'type', t: '类型' },
    { k: 'origin', t: '产地' },
    { k: 'price_tax', t: '单价(含税)', num: 1 },
    { k: 'price_notax', t: '单价(不含税)', num: 1 },
    { k: 'amount_tax', t: '总金额(含税)', num: 1 },
    { k: 'amount_notax', t: '总金额(不含税)', num: 1 },
    { k: 'supplier', t: '供应商' },
    { k: 'sale_price', t: '销售定价', num: 1 }
  ];
  var INV_ONLY = [
    { k: 'negative_diff', t: '负差' },
    { k: 'real_thickness', t: '实卡厚' },
    { k: 'inv_status', t: '库存状态', st: 1, enum: ENUM_INV }
  ];
  var ORD_ONLY = [
    { k: 'ord_status', t: '订单状态', st: 1, enum: ENUM_ORD }
  ];
  function colsOf(b) { return b === 'ordered' ? BASE_COLS.concat(ORD_ONLY) : BASE_COLS.concat(INV_ONLY); }
  function boardLabel(b) { return b === 'ordered' ? '🔥 已接单' : '📦 库存'; }
  function boardShort(b) { return b === 'ordered' ? '已接单' : '库存'; }

  // ---------- 工具 ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[,\s]/g, '')); return isFinite(n) ? n : 0; }
  function fmtNum(n, d) { return n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: d == null ? 2 : d }); }
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
  // 取值（新字段为空时回退到老字段，兼容 v1.0.193 之前的数据）
  function val(it, k) {
    if (!it) return '';
    var v;
    if (k === 'w_orig' || k === 'weight_orig') v = it.weight_orig || it.orig_weight;
    else if (k === 'w_now' || k === 'weight_now') v = it.weight_now || it.weight;
    else if (k === 'w_gross' || k === 'weight_gross') v = it.weight_gross;
    else if (k === 'amount_notax') v = it.amount_notax || it.total_amount;
    else if (k === 'price_notax') v = it.price_notax || it.unit_price;
    else v = it[k];
    return v == null ? '' : v;
  }

  // ---------- 变更轨迹 ----------
  function stLogArr(it, field) {
    var a = [];
    try { a = JSON.parse((it && it.status_log) || '[]'); } catch (e) { a = []; }
    if (!Array.isArray(a)) a = [];
    if (!field) return a;
    return a.filter(function (l) { return (l.field || 'status') === field; });
  }
  function stLogText(l) {
    var f = l.field || 'status';
    if (l.action === 'created') return '新建 → ' + (f === 'status' ? statusLabel(l.to) : (l.to || '—'));
    if (l.action === 'import') return '导入 → ' + (f === 'status' ? statusLabel(l.to) : (l.to || '—'));
    if (f === 'status') return statusLabel(l.from) + ' → ' + statusLabel(l.to);
    return (l.from || '未设置') + ' → ' + (l.to || '—');
  }
  function fieldLabel(f) { return f === 'inv_status' ? '库存状态' : (f === 'ord_status' ? '订单状态' : '板块'); }
  function stLast(it, field) {
    var a = stLogArr(it, field);
    if (!a.length) return '';
    var l = a[a.length - 1];
    return String(l.at || '').slice(5, 16) + ' · ' + (l.by || '—');
  }
  function stTitle(it, field) {
    var a = stLogArr(it, field);
    if (!a.length) return '';
    return a.map(function (l) { return String(l.at || '') + '  ' + stLogText(l) + '  ｜ ' + (l.by || '—'); }).join('\n');
  }

  // ---------- 渲染 ----------
  function refreshDatalists() {
    var uniq = function (key) {
      var s = new Set();
      items.forEach(function (it) { var v = String(val(it, key) || '').trim(); if (v) s.add(v); });
      return Array.from(s).sort();
    };
    var fill = function (id, arr) { var el = $(id); if (el) el.innerHTML = arr.map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join(''); };
    fill('dl_warehouse', uniq('warehouse'));
    fill('dl_grade', uniq('grade'));
    fill('dl_surface', uniq('surface'));
    fill('dl_type', uniq('type'));
    fill('dl_origin', uniq('origin'));
    fill('dl_supplier', uniq('supplier'));
    fill('dl_prod', uniq('prod_status'));
  }

  function visibleRows() {
    return items.filter(function (it) {
      if (it.status !== board) return false;
      if (kw) {
        var hay = [val(it, 'code'), it.contract_no, it.supplier, it.grade, it.warehouse, it.origin, it.prod_status, it.note, it.type, it.surface].join(' ').toLowerCase();
        if (hay.indexOf(kw) < 0) return false;
      }
      return true;
    });
  }

  function renderStats() {
    var inv = items.filter(function (i) { return i.status === 'inventory'; });
    var ord = items.filter(function (i) { return i.status === 'ordered'; });
    $('nAll').textContent = items.length;
    $('nInv').textContent = inv.length;
    $('nOrd').textContent = ord.length;
    var rows = items.filter(function (i) { return i.status === board; });
    var sumCount = 0, sumKg = 0, sumAmt = 0;
    rows.forEach(function (it) {
      sumCount += num(val(it, 'count'));
      var kg = num(val(it, 'w_now')) || num(val(it, 'w_orig'));
      sumKg += kg;
      sumAmt += num(val(it, 'amount_notax'));
    });
    $('sumLine').innerHTML = '<b>' + boardLabel(board) + '</b> 板块：共 <b>' + rows.length + '</b> 条记录 · <b>' + fmtNum(sumCount, 0) + '</b> 卷/张 · 合计 <b>' + fmtNum(sumKg / 1000, 3) + '</b> 吨（' + fmtNum(sumKg, 0) + ' KG） · 不含税金额合计 <b>' + fmtNum(sumAmt, 2) + '</b> 元';
  }

  function renderThead() {
    var cols = colsOf(board);
    $('thead').innerHTML = '<tr>' + cols.map(function (c) {
      return '<th' + (c.st ? ' class="th-st"' : (c.num ? ' class="num-r"' : '')) + '>' + esc(c.t) + '</th>';
    }).join('') + '<th class="th-op">操作</th></tr>';
    var t = document.querySelector('table.tk');
    if (t) t.style.minWidth = (cols.length * 108 + 260) + 'px';
  }

  function stSelect(it, c) {
    var cur = String(it[c.k] || '');
    var lg = stLast(it, c.k);
    var opts = ['<option value="">—</option>'].concat(c.enum.map(function (v) {
      return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>';
    })).join('');
    return '<div class="st-cell">' +
      '<select class="stsel ' + (c.k === 'inv_status' ? 'inv' : 'ord') + '" data-act="setf" data-f="' + c.k + '" data-id="' + it.id + '">' + opts + '</select>' +
      (lg ? '<div class="st-log" title="' + esc(stTitle(it, c.k)) + '">' + esc(lg) + '</div>' : '') +
      '</div>';
  }

  function render() {
    renderThead();
    renderStats();
    var rows = visibleRows();
    var tb = $('tbody');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="' + (colsOf(board).length + 1) + '" class="empty">' +
        (items.some(function (i) { return i.status === board; }) ? '当前筛选无匹配' : '该板块暂无数据，点右上「＋ 入仓」或「📥 导入 Excel/CSV」开始') + '</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(function (it) {
      var tds = colsOf(board).map(function (c) {
        if (c.st) return '<td>' + stSelect(it, c) + '</td>';
        var v = val(it, c.k);
        if (c.wide) return '<td class="wide" title="' + esc(v) + '">' + esc(v) + '</td>';
        if (c.bold) return '<td><b>' + esc(v) + '</b></td>';
        if (c.num) return '<td class="num-r">' + esc(v) + '</td>';
        return '<td>' + esc(v) + '</td>';
      }).join('');
      var op = '<td class="op">' +
        '<button class="mini" data-act="edit" data-id="' + it.id + '">编辑</button>' +
        (board === 'ordered'
          ? (nextOrd(it) ? '<button class="mini go" data-act="adv" data-id="' + it.id + '">推进</button>' : '') +
            '<button class="mini back" data-act="st" data-id="' + it.id + '" data-v="inventory">转库存</button>'
          : '<button class="mini go" data-act="st" data-id="' + it.id + '" data-v="ordered">转已接单</button>') +
        '<button class="mini del" data-act="del" data-id="' + it.id + '">删除</button>' +
        '</td>';
      return '<tr>' + tds + op + '</tr>';
    }).join('');
  }
  function nextOrd(it) {
    var cur = String(it.ord_status || '');
    if (!cur) return ENUM_ORD[0];
    var i = ENUM_ORD.indexOf(cur);
    if (i < 0) return ENUM_ORD[0];
    return i < ENUM_ORD.length - 1 ? ENUM_ORD[i + 1] : '';
  }

  // ---------- 数据 ----------
  async function load() {
    try {
      var r = await api({ action: 'list' });
      items = r.items || [];
      refreshDatalists();
      render();
    } catch (e) {
      $('tbody').innerHTML = '<tr><td colspan="' + (colsOf(board).length + 1) + '" class="empty">加载失败：' + esc(e.message) + '</td></tr>';
      toast(e.message, false);
    }
  }

  // ---------- 弹窗：入仓 / 编辑 ----------
  var FORM_FIELDS = ['purchaseDate', 'warehouseDate', 'warehouse', 'grade', 'surface', 'thickness', 'width', 'length',
    'wOrig', 'wNow', 'wGross', 'count', 'prodStatus', 'code', 'contractNo', 'note', 'type', 'origin',
    'priceTax', 'priceNotax', 'amountTax', 'amountNotax', 'supplier', 'salePrice', 'negativeDiff', 'realThickness'];
  var F2DB = {
    purchaseDate: 'purchase_date', warehouseDate: 'warehouse_date', wOrig: 'weight_orig', wNow: 'weight_now',
    wGross: 'weight_gross', prodStatus: 'prod_status', contractNo: 'contract_no', priceTax: 'price_tax',
    priceNotax: 'price_notax', amountTax: 'amount_tax', amountNotax: 'amount_notax',
    negativeDiff: 'negative_diff', realThickness: 'real_thickness', salePrice: 'sale_price'
  };
  function openEdit(it) {
    editingId = it ? it.id : null;
    editBoard = it ? it.status : board;
    $('dlgTitle').textContent = it ? ('编辑记录 #' + it.id + (it.code ? ' · ' + it.code : '')) : ('入仓 · 新增' + boardShort(editBoard) + '货物');
    FORM_FIELDS.forEach(function (f) {
      var el = $('f_' + f);
      if (!el) return;
      var v = it ? val(it, F2DB[f] || f) : '';
      el.value = v == null ? '' : String(v);
    });
    $('f_invStatus').value = (it && it.inv_status) || '在库';
    $('f_ordStatus').value = (it && it.ord_status) || '采购下单';
    renderStPick();
    renderStHistory(it);
    $('editMask').classList.add('show');
  }
  function renderStPick() {
    Array.prototype.forEach.call($('stPick').children, function (b) {
      b.className = '';
      if (b.dataset.v === editBoard) b.className = editBoard === 'ordered' ? 'on-ord' : 'on-inv';
    });
    $('fgInvSt').style.display = editBoard === 'inventory' ? '' : 'none';
    $('fgOrdSt').style.display = editBoard === 'ordered' ? '' : 'none';
    $('fgInvExtra').style.display = editBoard === 'inventory' ? 'contents' : 'none';
    if ($('dlgTitle') && editingId === null) $('dlgTitle').textContent = '入仓 · 新增' + boardShort(editBoard) + '货物';
  }
  function renderStHistory(it) {
    var box = $('stHistory');
    if (!box) return;
    var a = it ? stLogArr(it) : [];
    if (!a.length) { box.innerHTML = '<div class="sh-t">状态变更记录</div><div class="sh-i sh-none">暂无记录（保存后开始记录）</div>'; return; }
    box.innerHTML = '<div class="sh-t">状态变更记录</div>' + a.slice().reverse().map(function (l) {
      return '<div class="sh-i"><span class="sh-at">' + esc(String(l.at || '')) + '</span>' +
        '<span class="sh-tag">' + esc(fieldLabel(l.field || 'status')) + '</span>' +
        '<span class="sh-w">' + esc(stLogText(l)) + '</span>' +
        '<span class="sh-by">' + esc(l.by || '—') + '</span></div>';
    }).join('');
  }
  async function saveEdit() {
    if (!$('editMask').classList.contains('show')) return;
    var it = { status: editBoard };
    FORM_FIELDS.forEach(function (f) { var el = $('f_' + f); it[f] = el ? el.value.trim() : ''; });
    it.purchaseDate = normDate(it.purchaseDate);
    it.warehouseDate = normDate(it.warehouseDate);
    if (editBoard === 'inventory') { it.invStatus = $('f_invStatus').value; it.ordStatus = ''; }
    else { it.ordStatus = $('f_ordStatus').value; it.invStatus = ''; }
    if (!(it.code || it.grade || it.supplier || it.warehouse || it.contractNo || it.warehouseDate)) {
      toast('至少填写 编号/钢种/供应商/仓库/合同号/进仓日期 之一', false);
      return;
    }
    if (editingId > 0) it.id = editingId;
    try {
      await api({ action: 'save', item: it });
      $('editMask').classList.remove('show');
      toast(editingId > 0 ? '已保存' : '已入仓');
      await load();
    } catch (e) { toast(e.message, false); }
  }
  // 自动算金额：不含税总金额 = 不含税单价 × 现重(KG)/1000（仅在空值时填，不覆盖手填）
  function autoAmount() {
    var amountEl = $('f_amountNotax');
    if (!amountEl || amountEl.value.trim()) return;
    var p = num($('f_priceNotax').value);
    var kg = num($('f_wNow').value) || num($('f_wOrig').value);
    if (p > 0 && kg > 0) amountEl.value = (p * kg / 1000).toFixed(2);
  }

  // ---------- 导入 ----------
  var IMP_COLS = ['purchaseDate', 'warehouseDate', 'warehouse', 'grade', 'surface', 'thickness', 'width', 'length',
    'wOrig', 'wNow', 'wGross', 'count', 'prodStatus', 'code', 'contractNo', 'note', 'type', 'origin',
    'priceTax', 'priceNotax', 'amountTax', 'amountNotax', 'supplier', 'salePrice', 'negativeDiff', 'realThickness', 'status'];
  var IMP_HEADERS = ['采购日期', '进仓日期', '仓库/加工厂', '仓库', '加工厂', '钢种', '材质', '表面', '厚度', '宽度', '长度',
    '原重/KG', '原重', '现重/KG', '现重', '重量', '毛重/KG', '毛重', '卷数/张数', '数量', '卷数', '生产状态',
    '编号', '合同号', '备注', '类型', '产地', '单价(含税)', '单价(不含税)', '单价', '总金额(含税)', '总金额(不含税)', '总金额',
    '供应商', '销售定价', '负差', '实卡厚', '货物状态', '状态', '板块'];
  function openImp() {
    impRows = null;
    $('impFile').value = '';
    $('impPaste').value = '';
    $('impPrev').style.display = 'none';
    $('impPrev').innerHTML = '';
    $('impGo').disabled = true;
    $('impZone').className = 'imp-zone';
    $('impZone').innerHTML = $('impZone').getAttribute('data-html') || $('impZone').innerHTML;
    $('impDefStatus').value = board;
    $('impMask').classList.add('show');
  }
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
    var showCols = ['purchaseDate', 'warehouseDate', 'warehouse', 'grade', 'surface', 'thickness', 'width', 'length', 'wOrig', 'wNow', 'wGross', 'count'];
    var heads = ['采购日期', '进仓日期', '仓库/加工厂', '钢种', '表面', '厚度', '宽度', '长度', '原重/KG', '现重/KG', '毛重/KG', '卷数/张数'];
    var body = rows.slice(0, 5).map(function (it) {
      return '<tr>' + showCols.map(function (c) { return '<td>' + esc(it[c]) + '</td>'; }).join('') + '<td>…</td><td>' + esc(boardLabel(it.status)) + '</td></tr>';
    }).join('');
    prev.innerHTML = '<table><thead><tr>' + heads.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '<th>…</th><th>入仓类型</th></tr></thead><tbody>' + body + '</tbody></table>' +
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
        if (aoa.length && !hasHeader) {
          var hits = 0;
          (aoa[0] || []).forEach(function (c) { if (IMP_HEADERS.indexOf(String(c).trim()) >= 0) hits++; });
          if (hits >= 3) hasHeader = true;
        }
        var rows = buildRowsFromAoA(aoa, hasHeader);
        if (!rows) { toast('未解析到有效数据行', false); return; }
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
    var hits = 0;
    (aoa[0] || []).forEach(function (c) { if (IMP_HEADERS.indexOf(String(c).trim()) >= 0) hits++; });
    var rows = buildRowsFromAoA(aoa, hits >= 3);
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
      toast('导入成功 ' + (r.imported || 0) + ' 条' + (r.skipped ? '，跳过 ' + r.skipped + ' 条' : ''));
      await load();
    } catch (e) {
      toast(e.message, false);
    }
    $('impGo').disabled = false;
    $('impGo').textContent = '确认导入';
  }

  // ---------- 导出（按当前板块列序）----------
  function doExport() {
    var rows = items.filter(function (it) { return it.status === board; });
    var cols = colsOf(board);
    var head = cols.map(function (c) { return c.t; }).concat(['入仓类型']).map(function (h) { return '"' + h + '"'; });
    var lines = [head.join(',')];
    rows.forEach(function (it) {
      var arr = cols.map(function (c) { return val(it, c.k); }).concat([boardShort(it.status)]);
      lines.push(arr.map(function (c) {
        var s = c == null ? '' : String(c);
        return '"' + s.replace(/"/g, '""') + '"';
      }).join(','));
    });
    var blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '跟单_' + boardShort(board) + '_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
  }

  // ---------- 事件 ----------
  function bind() {
    $('logoutBtn').addEventListener('click', function () { KKAuth.logout(); });
    Array.prototype.forEach.call(document.querySelectorAll('.stat'), function (el) {
      el.addEventListener('click', function () {
        board = el.dataset.st || 'inventory';
        Array.prototype.forEach.call(document.querySelectorAll('.stat'), function (x) { x.className = 'stat' + (x === el ? ' active' : '') + (x.dataset.st === 'inventory' ? ' st-inv' : x.dataset.st === 'ordered' ? ' st-ord' : ''); });
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
      b.addEventListener('click', function () { editBoard = b.dataset.v; renderStPick(); });
    });
    ['f_priceNotax', 'f_wNow', 'f_wOrig'].forEach(function (id) {
      var el = $(id); if (el) el.addEventListener('blur', autoAmount);
    });
    // 表格内交互：状态列切换 / 按钮
    $('tbody').addEventListener('change', async function (e) {
      var sel = e.target.closest('select[data-act="setf"]');
      if (!sel) return;
      try {
        await api({ action: 'setfield', id: parseInt(sel.dataset.id, 10), field: sel.dataset.f, value: sel.value });
        toast(fieldLabel(sel.dataset.f) + '已更新为「' + (sel.value || '—') + '」');
        await load();
      } catch (err) { toast(err.message, false); await load(); }
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
          await api({ action: 'setfield', id: id, field: 'status', value: btn.dataset.v });
          toast('已转为' + statusLabel(btn.dataset.v));
          await load();
        } catch (err) { toast(err.message, false); }
      } else if (act === 'adv') {
        var it2 = items.find(function (x) { return String(x.id) === String(id); });
        var nx = it2 ? nextOrd(it2) : '';
        if (!nx) { toast('已是最后阶段', false); return; }
        try {
          await api({ action: 'setfield', id: id, field: 'ord_status', value: nx });
          toast('已推进到「' + nx + '」');
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
