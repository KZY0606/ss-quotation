// tracking.js — KK 不锈钢跟单系统（v1.0.195）
// 依赖：auth.js（KKAuth）、js/vendor/xlsx.mini.min.js（SheetJS，导入用）
// v1.0.195：① 库存板块移除 合同号/备注/销售定价/负差/实卡厚（这几列归已接单或不显示），列定义与操作按钮分离
//           ② 操作按钮移到搜索栏（选中行 + 一键编辑整行，行内所有字段可改）
//           ③ 表头 Excel 式筛选（每列值多选 + 日期区间 + 数值区间 + 排序）
//           ④ 搜索支持重量等数字精确命中；⑤ 导入按 Excel 状态列自动归位到库存状态/订单状态
(function () {
  var API = 'trackingTable';
  var items = [];
  var board = 'inventory';
  var kw = '';
  var colF = {};            // 列筛选：{ k: { vals: [], min: '', max: '' } }
  var sortKey = '', sortDir = '';   // '' | 'asc' | 'desc'
  var selId = null;         // 选中行 id
  var editId = null;        // 行内编辑中的行 id
  var editingId = null;     // 弹窗编辑的记录 id（null = 新增）
  var editBoard = 'inventory';
  var impRows = null;

  // ---------- 状态枚举 ----------
  var ENUM_INV = ['在库', '已预订', '部分出库', '已售出'];
  var ENUM_ORD = ['采购下单', '原料到仓', '投入生产', '加工完成', '发货自提', '已交付'];

  // ---------- 列定义 ----------
  // 公共列（两板块都有，按入仓清单顺序）
  var COL_BASE = [
    { k: 'purchase_date', t: '采购日期', kind: 'date' },
    { k: 'warehouse_date', t: '进仓日期', kind: 'date' },
    { k: 'warehouse', t: '仓库/加工厂' },
    { k: 'grade', t: '钢种' },
    { k: 'surface', t: '表面' },
    { k: 'thickness', t: '厚度', num: 1, kind: 'num' },
    { k: 'width', t: '宽度', num: 1, kind: 'num' },
    { k: 'length', t: '长度' },
    { k: 'w_orig', t: '原重/KG', num: 1, kind: 'num' },
    { k: 'w_now', t: '现重/KG', num: 1, kind: 'num' },
    { k: 'w_gross', t: '毛重/KG', num: 1, kind: 'num' },
    { k: 'count', t: '卷数/张数', num: 1, kind: 'num' },
    { k: 'prod_status', t: '生产状态' },
    { k: 'code', t: '编号', bold: 1 },
    { k: 'type', t: '类型' },
    { k: 'origin', t: '产地' },
    { k: 'price_tax', t: '单价(含税)', num: 1, kind: 'num' },
    { k: 'price_notax', t: '单价(不含税)', num: 1, kind: 'num' },
    { k: 'amount_tax', t: '总金额(含税)', num: 1, kind: 'num' },
    { k: 'amount_notax', t: '总金额(不含税)', num: 1, kind: 'num' },
    { k: 'supplier', t: '供应商' }
  ];
  // 已接单板块专属（库存板块不显示这几列）
  var COL_ORD_ONLY = [
    { k: 'contract_no', t: '合同号' },
    { k: 'note', t: '备注', wide: 1 },
    { k: 'sale_price', t: '销售定价', num: 1, kind: 'num' }
  ];
  var COL_INV_ST = [{ k: 'inv_status', t: '库存状态', st: 1, enum: ENUM_INV }];
  var COL_ORD_ST = [{ k: 'ord_status', t: '订单状态', st: 1, enum: ENUM_ORD }];
  function colsOf(b) { return b === 'ordered' ? COL_BASE.concat(COL_ORD_ONLY, COL_ORD_ST) : COL_BASE.concat(COL_INV_ST); }
  function colsAll() { return COL_BASE.concat(COL_ORD_ONLY, COL_INV_ST, COL_ORD_ST); }
  function boardLabel(b) { return b === 'ordered' ? '🔥 已接单' : '📦 库存'; }
  function boardShort(b) { return b === 'ordered' ? '已接单' : '库存'; }

  // ---------- 工具 ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[,，\s]/g, '')); return isFinite(n) ? n : 0; }
  function fmtNum(n, d) { return n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: d == null ? 2 : d }); }
  function toast(msg, ok) {
    var d = document.createElement('div');
    d.className = 'toast ' + (ok === false ? 'err' : 'ok');
    d.textContent = msg;
    $('toasts').appendChild(d);
    setTimeout(function () { d.remove(); }, 2800);
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

  // ---------- 筛选 + 搜索 ----------
  function fActive(k) {
    var f = colF[k];
    return !!(f && ((f.vals && f.vals.length) || f.min !== '' || f.max !== ''));
  }
  function filterCount() { return Object.keys(colF).filter(fActive).length; }
  function passesFilter(it) {
    var keys = Object.keys(colF);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], f = colF[k];
      if (!f) continue;
      var raw = String(val(it, k));
      if (f.vals && f.vals.length) {
        var hit = f.vals.some(function (v) { return v === raw || (v === '（空白）' && raw === ''); });
        if (!hit) return false;
      }
      if (f.kind === 'date') {
        if (f.min && raw && raw < f.min) return false;
        if (f.max && raw && raw > f.max) return false;
      } else if (f.min !== '' || f.max !== '') {
        var n = num(raw);
        if (f.min !== '' && n < num(f.min)) return false;
        if (f.max !== '' && n > num(f.max)) return false;
      }
    }
    return true;
  }
  // 搜索：多关键词（空格分隔，全部命中）；数字比对时忽略千分位
  function hayOf(it) {
    var parts = colsAll().map(function (c) { return String(val(it, c.k)); });
    var s = parts.join(' ');
    return (s + ' ' + s.replace(/[,，\s]/g, '')).toLowerCase();
  }
  function passesKw(it) {
    if (!kw) return true;
    var hay = hayOf(it);
    var words = kw.split(/\s+/).filter(function (w) { return w; });
    return words.every(function (w) { return hay.indexOf(w) >= 0; });
  }
  function visibleRows() {
    var rows = items.filter(function (it) {
      return it.status === board && passesFilter(it) && passesKw(it);
    });
    if (sortKey && sortDir) {
      var desc = sortDir === 'desc';
      rows = rows.slice().sort(function (a, b) {
        var av = val(a, sortKey), bv = val(b, sortKey);
        var c = num(av) - num(bv);
        if (!num(av) && !num(bv)) c = String(av).localeCompare(String(bv), 'zh-CN');
        return desc ? -c : c;
      });
    }
    return rows;
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

  function renderStats() {
    var inv = items.filter(function (i) { return i.status === 'inventory'; });
    var ord = items.filter(function (i) { return i.status === 'ordered'; });
    $('nAll').textContent = items.length;
    $('nInv').textContent = inv.length;
    $('nOrd').textContent = ord.length;
    var rows = visibleRows();
    var sumCount = 0, sumKg = 0, sumAmt = 0;
    rows.forEach(function (it) {
      sumCount += num(val(it, 'count'));
      var kg = num(val(it, 'w_now')) || num(val(it, 'w_orig'));
      sumKg += kg;
      sumAmt += num(val(it, 'amount_notax'));
    });
    var boardRows = items.filter(function (i) { return i.status === board; });
    var extra = (rows.length !== boardRows.length || filterCount()) ? '（已筛选 ' + rows.length + '/' + boardRows.length + ' 条）' : '';
    $('sumLine').innerHTML = '<b>' + boardLabel(board) + '</b> 板块：共 <b>' + boardRows.length + '</b> 条记录' + extra +
      ' · <b>' + fmtNum(sumCount, 0) + '</b> 卷/张 · 合计 <b>' + fmtNum(sumKg / 1000, 3) + '</b> 吨（' + fmtNum(sumKg, 0) + ' KG） · 不含税金额合计 <b>' + fmtNum(sumAmt, 2) + '</b> 元';
  }

  function renderThead() {
    var cols = colsOf(board);
    $('thead').innerHTML = '<tr>' + cols.map(function (c) {
      var cls = c.st ? 'th-st' : (c.num ? 'num-r' : '');
      return '<th class="' + cls + '" data-k="' + c.k + '"><div class="th-in"><span>' + esc(c.t) + '</span>' +
        '<button class="fbtn' + (fActive(c.k) ? ' on' : '') + '" data-fk="' + c.k + '" title="筛选 / 排序">▼</button></div></th>';
    }).join('') + '</tr>';
    var t = document.querySelector('table.tk');
    if (t) t.style.minWidth = (cols.length * 108) + 'px';
  }

  function stSelect(it, c, inline) {
    var cur = String(it[c.k] || '');
    var lg = stLast(it, c.k);
    var opts = ['<option value="">—</option>'].concat(c.enum.map(function (v) {
      return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>';
    })).join('');
    var attr = inline ? ('data-k="' + c.k + '"') : ('data-act="setf" data-f="' + c.k + '" data-id="' + it.id + '"');
    return '<div class="st-cell">' +
      '<select class="stsel ' + (c.k === 'inv_status' ? 'inv' : 'ord') + '" ' + attr + '>' + opts + '</select>' +
      (lg ? '<div class="st-log" title="' + esc(stTitle(it, c.k)) + '">' + esc(lg) + '</div>' : '') +
      '</div>';
  }

  function cellHtml(it, c, inline) {
    if (c.st) return '<td>' + stSelect(it, c, inline) + '</td>';
    var v = val(it, c.k);
    if (inline) return '<td' + (c.num ? ' class="num-r"' : '') + '><input class="cellin" data-k="' + c.k + '" value="' + esc(v) + '"></td>';
    if (c.wide) return '<td class="wide" title="' + esc(v) + '">' + esc(v) + '</td>';
    if (c.bold) return '<td><b>' + esc(v) + '</b></td>';
    if (c.num) return '<td class="num-r">' + esc(v) + '</td>';
    return '<td>' + esc(v) + '</td>';
  }

  function render() {
    renderThead();
    renderStats();
    syncBar();
    var rows = visibleRows();
    var tb = $('tbody');
    var cols = colsOf(board);
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="' + cols.length + '" class="empty">' +
        (items.some(function (i) { return i.status === board; }) ? '当前筛选 / 搜索无匹配' : '该板块暂无数据，点「＋ 入仓」或「📥 导入 Excel/CSV」开始') + '</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(function (it) {
      var inline = String(it.id) === String(editId);
      var tds = cols.map(function (c) { return cellHtml(it, c, inline); }).join('');
      var cls = (String(it.id) === String(selId) ? 'sel ' : '') + (inline ? 'editing' : '');
      return '<tr data-id="' + it.id + '" class="' + cls.trim() + '">' + tds + '</tr>';
    }).join('');
  }

  // 工具栏按钮状态
  function syncBar() {
    var sel = selId != null ? items.find(function (x) { return String(x.id) === String(selId); }) : null;
    var editing = editId != null;
    $('rowEditBtn').style.display = editing ? 'none' : '';
    $('rowSaveBtn').style.display = editing ? '' : 'none';
    $('rowCancelBtn').style.display = editing ? '' : 'none';
    $('rowEditBtn').disabled = !sel || editing;
    $('rowAdvBtn').style.display = board === 'ordered' ? '' : 'none';
    $('rowAdvBtn').disabled = !sel || editing || !(sel && nextOrd(sel));
    $('rowBackBtn').disabled = !sel || editing;
    $('rowDelBtn').disabled = !sel || editing;
    $('rowBackBtn').textContent = board === 'ordered' ? '转库存' : '转已接单';
    var f = filterCount();
    $('selHint').textContent = editing ? ('正在编辑 #' + editId + '，改完整行后点保存')
      : sel ? ('已选中 #' + sel.id + (sel.code ? ' · ' + sel.code : ''))
        : (f ? ('筛选中：' + f + ' 列') : '未选中行');
  }
  function nextOrd(it) {
    var cur = String(it.ord_status || '');
    if (!cur) return ENUM_ORD[0];
    var i = ENUM_ORD.indexOf(cur);
    if (i < 0) return ENUM_ORD[0];
    return i < ENUM_ORD.length - 1 ? ENUM_ORD[i + 1] : '';
  }

  // ---------- 表头筛选面板 ----------
  function uniqueVals(k) {
    var s = [];
    items.filter(function (it) { return it.status === board; }).forEach(function (it) {
      var v = String(val(it, k));
      if (s.indexOf(v) < 0) s.push(v);
    });
    s.sort(function (a, b) { return String(a).localeCompare(String(b), 'zh-CN'); });
    return s;
  }
  function closeFPanel() { $('fPanel').classList.remove('show'); $('fPanel').innerHTML = ''; }
  function openFPanel(k, btn) {
    var c = colsAll().find(function (x) { return x.k === k; });
    if (!c) return;
    var cur = colF[k] || { vals: [], min: '', max: '', kind: c.kind };
    var vals = uniqueVals(k);
    var box = $('fPanel');
    var list = vals.map(function (v) {
      return '<label><input type="checkbox" value="' + esc(v) + '"' + (cur.vals && cur.vals.length && cur.vals.indexOf(v) >= 0 ? ' checked' : '') + '><span>' + (v === '' ? '（空白）' : esc(v)) + '</span></label>';
    }).join('');
    box.innerHTML = '<div class="fp-t"><span>' + esc(c.t) + '</span><span class="sp"></span><button data-fp="close">✕</button></div>' +
      '<input class="fp-s" id="fpSearch" placeholder="在值里搜索…">' +
      '<div class="fp-list" id="fpList">' + (list || '<div class="fp-empty">（本列暂无数据）</div>') + '</div>' +
      (c.kind === 'date' || c.kind === 'num' ?
        '<div class="fp-row"><span class="lbl">' + (c.kind === 'date' ? '起' : '最小') + '</span><input id="fpMin" value="' + esc(cur.min || '') + '" placeholder="' + (c.kind === 'date' ? '2026-01-01' : '') + '">' +
        '<span class="lbl">' + (c.kind === 'date' ? '止' : '最大') + '</span><input id="fpMax" value="' + esc(cur.max || '') + '" placeholder="' + (c.kind === 'date' ? '2026-12-31' : '') + '"></div>' : '') +
      '<div class="fp-f">' +
      '<button data-fp="all">全选</button><button data-fp="none">清空</button>' +
      '<button data-fp="asc">↑ 升序</button><button data-fp="desc">↓ 降序</button>' +
      '</div>' +
      '<div class="fp-f"><button data-fp="clear">清除此列</button><button class="pri" data-fp="apply">应用</button></div>';
    box.dataset.k = k;
    box.classList.add('show');
    // 定位到该表头下方
    var card = $('tblCard').getBoundingClientRect();
    var r = btn.getBoundingClientRect();
    var left = r.left - card.left + $('tblCard').scrollLeft;
    var top = r.bottom - card.top + $('tblCard').scrollTop + 4;
    box.style.left = Math.max(6, Math.min(left - 60, $('tblCard').clientWidth - 276)) + 'px';
    box.style.top = top + 'px';
  }
  function readFPanel() {
    var box = $('fPanel'), k = box.dataset.k;
    var c = colsAll().find(function (x) { return x.k === k; });
    var vals = Array.prototype.slice.call(box.querySelectorAll('#fpList input[type=checkbox]')).filter(function (cb) { return cb.checked; }).map(function (cb) { return cb.value; });
    var all = Array.prototype.slice.call(box.querySelectorAll('#fpList input[type=checkbox]')).map(function (cb) { return cb.value; });
    var min = $('fpMin') ? $('fpMin').value.trim() : '';
    var max = $('fpMax') ? $('fpMax').value.trim() : '';
    // 全选（或一个都没选）视为不筛选值
    if (vals.length === all.length) vals = [];
    if (!vals.length && min === '' && max === '') delete colF[k];
    else colF[k] = { vals: vals, min: min, max: max, kind: c ? c.kind : '' };
  }

  // ---------- 数据 ----------
  async function load() {
    try {
      var r = await api({ action: 'list' });
      items = r.items || [];
      if (selId != null && !items.some(function (x) { return String(x.id) === String(selId); })) selId = null;
      if (editId != null && !items.some(function (x) { return String(x.id) === String(editId); })) editId = null;
      refreshDatalists();
      render();
    } catch (e) {
      $('tbody').innerHTML = '<tr><td colspan="' + colsOf(board).length + '" class="empty">加载失败：' + esc(e.message) + '</td></tr>';
      toast(e.message, false);
    }
  }

  // ---------- 弹窗：入仓 / 编辑 ----------
  var FORM_FIELDS = ['purchaseDate', 'warehouseDate', 'warehouse', 'grade', 'surface', 'thickness', 'width', 'length',
    'wOrig', 'wNow', 'wGross', 'count', 'prodStatus', 'code', 'type', 'origin',
    'priceTax', 'priceNotax', 'amountTax', 'amountNotax', 'supplier',
    'contractNo', 'note', 'salePrice'];
  var F2DB = {
    purchaseDate: 'purchase_date', warehouseDate: 'warehouse_date', wOrig: 'weight_orig', wNow: 'weight_now',
    wGross: 'weight_gross', prodStatus: 'prod_status', contractNo: 'contract_no', priceTax: 'price_tax',
    priceNotax: 'price_notax', amountTax: 'amount_tax', amountNotax: 'amount_notax',
    salePrice: 'sale_price'
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
    var isOrd = editBoard === 'ordered';
    Array.prototype.forEach.call(document.querySelectorAll('#editMask .ord-only'), function (el) { el.style.display = isOrd ? '' : 'none'; });
    $('secOrdOnly').style.display = isOrd ? '' : 'none';
    $('fgInvSt').style.display = isOrd ? 'none' : '';
    $('fgOrdSt').style.display = isOrd ? '' : 'none';
    $('secStatus').textContent = isOrd
      ? '④ 订单状态（改动会记录时间与操作账号）'
      : '③ 库存状态（改动会记录时间与操作账号）';
    Array.prototype.forEach.call($('stPick').children, function (b) {
      b.className = b.dataset.v === editBoard ? (editBoard === 'ordered' ? 'on-ord' : 'on-inv') : '';
    });
    if (editingId === null) $('dlgTitle').textContent = '入仓 · 新增' + boardShort(editBoard) + '货物';
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
    if (editBoard === 'inventory') {
      it.invStatus = $('f_invStatus').value; it.ordStatus = '';
      it.contractNo = ''; it.note = ''; it.salePrice = '';   // 库存板块不使用这三项
    } else {
      it.ordStatus = $('f_ordStatus').value; it.invStatus = '';
    }
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

  // ---------- 行内编辑（一键编辑整行）----------
  function startRowEdit() {
    if (selId == null) { toast('请先在表格里点一行选中', false); return; }
    editId = selId;
    render();
    var tr = document.querySelector('#tbody tr[data-id="' + editId + '"]');
    if (tr) tr.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    toast('已进入整行编辑，改完点「保存」');
  }
  async function saveRowEdit() {
    var it = items.find(function (x) { return String(x.id) === String(editId); });
    if (!it) { toast('记录已被刷新，请重试', false); return; }
    var send = { id: it.id, status: it.status };
    // 以原记录为基底，保留未显示的字段（如负差/实卡厚等历史字段）
    Object.keys(it).forEach(function (k) {
      if (['id', 'status_log', 'created_at', 'updated_at', 'created_by'].indexOf(k) >= 0) return;
      if (k === 'status' || k === 'inv_status' || k === 'ord_status') return;
      send[k] = it[k];
    });
    if (it.status === 'inventory') { send.contractNo = ''; send.note = ''; send.salePrice = ''; }
    var changed = 0;
    // 列 key → 提交给云函数的字段名（重量三列需要映射）
    var K2DB = { w_orig: 'weight_orig', w_now: 'weight_now', w_gross: 'weight_gross' };
    Array.prototype.forEach.call(document.querySelectorAll('#tbody tr.editing .cellin'), function (el) {
      var k = el.dataset.k, v = el.value.trim();
      if (String(val(it, k)) !== v) changed++;
      send[K2DB[k] || k] = v;
    });
    Array.prototype.forEach.call(document.querySelectorAll('#tbody tr.editing select[data-k]'), function (el) {
      var k = el.dataset.k, v = el.value;
      if (String(it[k] || '') !== v) changed++;
      send[K2DB[k] || k] = v;
    });
    send.purchaseDate = normDate(send.purchase_date || '');
    send.warehouseDate = normDate(send.warehouse_date || '');
    if (!changed) { toast('没有改动'); editId = null; render(); return; }
    try {
      await api({ action: 'save', item: send });
      editId = null;
      toast('已保存');
      await load();
    } catch (e) { toast(e.message, false); }
  }
  function cancelRowEdit() { editId = null; render(); toast('已取消编辑'); }

  // ---------- 工具栏动作（作用于选中行）----------
  async function doAdvance() {
    var it = items.find(function (x) { return String(x.id) === String(selId); });
    var nx = it ? nextOrd(it) : '';
    if (!nx) { toast('已是最后阶段', false); return; }
    try {
      await api({ action: 'setfield', id: it.id, field: 'ord_status', value: nx });
      toast('已推进到「' + nx + '」');
      await load();
    } catch (e) { toast(e.message, false); }
  }
  async function doSwitchBoard() {
    var it = items.find(function (x) { return String(x.id) === String(selId); });
    if (!it) return;
    var to = it.status === 'ordered' ? 'inventory' : 'ordered';
    try {
      await api({ action: 'setfield', id: it.id, field: 'status', value: to });
      toast('已转为' + statusLabel(to));
      await load();
    } catch (e) { toast(e.message, false); }
  }
  async function doDelete() {
    var it = items.find(function (x) { return String(x.id) === String(selId); });
    if (!it) return;
    if (!confirm('确认删除该条记录？不可恢复。')) return;
    try {
      await api({ action: 'delete', id: it.id });
      selId = null;
      toast('已删除');
      await load();
    } catch (e) { toast(e.message, false); }
  }

  // ---------- 导入 ----------
  var IMP_COLS = ['purchaseDate', 'warehouseDate', 'warehouse', 'grade', 'surface', 'thickness', 'width', 'length',
    'wOrig', 'wNow', 'wGross', 'count', 'prodStatus', 'code', 'type', 'origin',
    'priceTax', 'priceNotax', 'amountTax', 'amountNotax', 'supplier',
    'contractNo', 'note', 'salePrice', 'invStatus', 'ordStatus', 'status'];
  var IMP_HEADERS = ['采购日期', '进仓日期', '仓库/加工厂', '仓库', '加工厂', '钢种', '材质', '表面', '厚度', '宽度', '长度',
    '原重/KG', '原重', '现重/KG', '现重', '重量', '毛重/KG', '毛重', '卷数/张数', '数量', '卷数', '生产状态',
    '编号', '合同号', '备注', '类型', '产地', '单价(含税)', '单价(不含税)', '单价', '总金额(含税)', '总金额(不含税)', '总金额',
    '供应商', '销售定价', '库存状态', '订单状态', '货物状态', '状态', '板块'];
  // 表头 → 字段（顺序敏感：具体的写在泛化的前面）
  var H2F = [
    [/采购日期|采购时间|进货日期|采购/, 'purchaseDate'],
    [/进仓日期|入仓日期|入库日期|仓库日期|进仓/, 'warehouseDate'],
    [/仓库|加工厂|存放/, 'warehouse'],
    [/钢种|材质|牌号/, 'grade'],
    [/表面|surface/i, 'surface'],
    [/厚度/, 'thickness'],
    [/宽度/, 'width'],
    [/长度/, 'length'],
    [/原重|原始重量|出厂重量/, 'wOrig'],
    [/现重|当前重量|实际重量/, 'wNow'],
    [/毛重/, 'wGross'],
    [/卷数|张数|数量|件数/, 'count'],
    [/生产状态|加工状态|生产/, 'prodStatus'],
    [/编号|货号|流水/, 'code'],
    [/合同号|合同/, 'contractNo'],
    [/备注|说明/, 'note'],
    [/类型|品名|品类/, 'type'],
    [/产地|厂家|钢厂/, 'origin'],
    [/含税.*单价|单价.*含税/, 'priceTax'],
    [/不含税.*单价|单价.*不含税/, 'priceNotax'],
    [/单价/, 'priceNotax'],
    [/含税.*(总金额|金额)|(总金额|金额).*含税/, 'amountTax'],
    [/不含税.*(总金额|金额)|(总金额|金额).*不含税/, 'amountNotax'],
    [/总金额|金额/, 'amountNotax'],
    [/供应商|供货商|卖家/, 'supplier'],
    [/销售定价|销售价|售价|定价/, 'salePrice'],
    [/库存状态/, 'invStatus'],
    [/订单状态/, 'ordStatus'],
    [/状态|入仓类型|板块|货物/, 'statusRaw']
  ];
  function fieldOfHeader(h) {
    h = String(h || '').trim();
    if (!h) return '';
    for (var i = 0; i < H2F.length; i++) if (H2F[i][0].test(h)) return H2F[i][1];
    return '';
  }
  function fuzzyIn(v, arr) {
    v = String(v == null ? '' : v).trim();
    if (!v) return '';
    if (arr.indexOf(v) >= 0) return v;
    for (var i = 0; i < arr.length; i++) if (v.indexOf(arr[i]) >= 0 || arr[i].indexOf(v) >= 0) return arr[i];
    return '';
  }
  // Excel 状态列 → 系统对应状态列 + 板块
  function mapStatusRaw(v) {
    v = String(v == null ? '' : v).trim();
    if (!v) return {};
    var i = fuzzyIn(v, ENUM_INV);
    if (i) return { invStatus: i, status: 'inventory' };
    var o = fuzzyIn(v, ENUM_ORD);
    if (o) return { ordStatus: o, status: 'ordered' };
    if (/已接单|接单|ordered/i.test(v)) return { status: 'ordered' };
    if (/库存|在库|inventory/i.test(v)) return { status: 'inventory' };
    return {};
  }
  function applyStatusMap(it) {
    var raw = it.statusRaw;
    var sr = mapStatusRaw(raw);
    var defBoard = $('impDefStatus').value || 'inventory';
    if (it.invStatus) it.invStatus = fuzzyIn(it.invStatus, ENUM_INV) || '';
    if (it.ordStatus) it.ordStatus = fuzzyIn(it.ordStatus, ENUM_ORD) || '';
    if (sr.invStatus) it.invStatus = it.invStatus || sr.invStatus;
    if (sr.ordStatus) it.ordStatus = it.ordStatus || sr.ordStatus;
    if (it.invStatus && it.ordStatus) it.ordStatus = '';
    if (it.ordStatus) it.status = 'ordered';
    else if (it.invStatus) it.status = 'inventory';
    else it.status = sr.status || defBoard;
    it.statusRaw = '';
    return it;
  }
  function buildRowsFromAoA(aoa, hasHeader) {
    if (!aoa || !aoa.length) return null;
    var start = hasHeader ? 1 : 0;
    var map = {};     // 列下标 → 字段名
    if (hasHeader) {
      var used = {};
      (aoa[0] || []).forEach(function (h, j) {
        var f = fieldOfHeader(h);
        if (f && !used[f]) { used[f] = 1; map[j] = f; }
      });
      if (Object.keys(map).length < 3) { map = {}; hasHeader = false; start = 0; }
    }
    if (!hasHeader) for (var j = 0; j < IMP_COLS.length; j++) map[j] = IMP_COLS[j];
    var out = [];
    for (var i = start; i < aoa.length; i++) {
      var row = aoa[i];
      if (!row || !row.length) continue;
      var allEmpty = row.every(function (c) { return c == null || String(c).trim() === ''; });
      if (allEmpty) continue;
      var it = {};
      for (var jj in map) { if (row[jj] !== undefined) it[map[jj]] = row[jj]; }
      applyStatusMap(it);
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
      return '<tr>' + showCols.map(function (c) { return '<td>' + esc(it[c]) + '</td>'; }).join('') +
        '<td>…</td><td>' + esc(boardLabel(it.status)) + '</td><td>' + esc(it.invStatus || '') + '</td><td>' + esc(it.ordStatus || '') + '</td></tr>';
    }).join('');
    prev.innerHTML = '<table><thead><tr>' + heads.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
      '<th>…</th><th>入仓类型</th><th>库存状态</th><th>订单状态</th></tr></thead><tbody>' + body + '</tbody></table>' +
      '<div style="padding:8px 10px;font-size:12px;color:#475569;background:#f8fafc">共解析 <b>' + rows.length + '</b> 条（预览前 5 条，日期自动规范为 YYYY-MM-DD，状态列已按清单归位）</div>';
    $('impGo').disabled = false;
  }
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
    (aoa[0] || []).forEach(function (c) { if (IMP_HEADERS.indexOf(String(c).trim()) >= 0 || fieldOfHeader(c)) hits++; });
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

  // ---------- 导出（按当前板块列序，含筛选结果）----------
  function doExport() {
    var rows = visibleRows();
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
        if (editId != null) { toast('请先保存或取消整行编辑', false); return; }
        board = el.dataset.st || 'inventory';
        selId = null;
        colF = {}; sortKey = ''; sortDir = '';
        closeFPanel();
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
    // 工具栏：整行编辑
    $('rowEditBtn').addEventListener('click', startRowEdit);
    $('rowSaveBtn').addEventListener('click', saveRowEdit);
    $('rowCancelBtn').addEventListener('click', cancelRowEdit);
    $('rowAdvBtn').addEventListener('click', doAdvance);
    $('rowBackBtn').addEventListener('click', doSwitchBoard);
    $('rowDelBtn').addEventListener('click', doDelete);
    // 行选中 / 双击进入编辑
    $('tbody').addEventListener('click', function (e) {
      if (editId != null) return;
      var tr = e.target.closest('tr');
      if (!tr || !tr.dataset.id) return;
      selId = parseInt(tr.dataset.id, 10);
      render();
    });
    $('tbody').addEventListener('dblclick', function (e) {
      var tr = e.target.closest('tr');
      if (!tr || !tr.dataset.id) return;
      if (editId != null) return;
      selId = parseInt(tr.dataset.id, 10);
      startRowEdit();
    });
    // 行内状态列（非编辑态）即时切换
    $('tbody').addEventListener('change', async function (e) {
      var sel = e.target.closest('select[data-act="setf"]');
      if (!sel) return;
      try {
        await api({ action: 'setfield', id: parseInt(sel.dataset.id, 10), field: sel.dataset.f, value: sel.value });
        toast(fieldLabel(sel.dataset.f) + '已更新为「' + (sel.value || '—') + '」');
        await load();
      } catch (err) { toast(err.message, false); await load(); }
    });
    // 行内编辑：回车保存
    $('tbody').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('cellin')) { e.preventDefault(); saveRowEdit(); }
      if (e.key === 'Escape' && e.target.classList && e.target.classList.contains('cellin')) { e.preventDefault(); cancelRowEdit(); }
    });
    // 表头筛选
    $('thead').addEventListener('click', function (e) {
      var b = e.target.closest('.fbtn');
      if (!b) return;
      var k = b.dataset.fk;
      if ($('fPanel').classList.contains('show') && $('fPanel').dataset.k === k) { closeFPanel(); return; }
      openFPanel(k, b);
    });
    $('fPanel').addEventListener('click', function (e) {
      var t = e.target.closest('[data-fp]');
      if (!t) return;
      var act = t.dataset.fp;
      var box = this;
      if (act === 'close') { closeFPanel(); return; }
      if (act === 'all') { Array.prototype.forEach.call(box.querySelectorAll('#fpList input[type=checkbox]'), function (cb) { cb.checked = true; }); return; }
      if (act === 'none') { Array.prototype.forEach.call(box.querySelectorAll('#fpList input[type=checkbox]'), function (cb) { cb.checked = false; }); return; }
      if (act === 'asc' || act === 'desc') { sortKey = box.dataset.k; sortDir = act; readFPanel(); closeFPanel(); render(); return; }
      if (act === 'apply') { readFPanel(); closeFPanel(); render(); return; }
      if (act === 'clear') { delete colF[box.dataset.k]; sortKey = ''; sortDir = ''; closeFPanel(); render(); return; }
    });
    $('fPanel').addEventListener('input', function (e) {
      if (e.target.id !== 'fpSearch') return;
      var q = e.target.value.trim().toLowerCase();
      Array.prototype.forEach.call(this.querySelectorAll('#fpList label'), function (l) {
        l.style.display = !q || l.textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
      });
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#fPanel') && !e.target.closest('.fbtn')) closeFPanel();
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
