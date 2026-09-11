// tracking.js — KK 不锈钢跟单系统（v1.0.199）
// v1.0.199：① 新增「入仓」板块（排在库存前）：Excel 式录入表格，可直接输入 / 从 Excel 粘贴
//           ② 入仓板块支持表头筛选 + 搜索（只筛显示，不影响提交范围）
//           ③ 「一键入仓」把已填行一次性写入库存（action: import，status=inventory）
// 依赖：auth.js（KKAuth）、js/vendor/xlsx.mini.min.js（SheetJS，导入用）
// v1.0.195：① 库存板块移除 合同号/备注/销售定价/负差/实卡厚 ② 操作按钮移到搜索栏（一键整行编辑）
//           ③ 表头 Excel 式筛选 ④ 搜索支持数字精确命中 ⑤ 导入按 Excel 状态列自动归位
// v1.0.196：① 「已接单」改名「生产中」；新增第三板块「生产进度」（同一批数据的精简视图）
//           ② 新增 客户名称 / 跟单员 / 预期交期 / 工序链 / 当前工序（工序库可维护，逐道跟踪）
//           ③ 批量操作（多选 + 批量编辑 / 批量设工序 / 批量转板块 / 批量删除）
//           ④ 关键词追踪（跟单员 → 客户 → 合同）+ 只看我的单 + 交期预警
(function () {
  var API = 'trackingTable';
  var items = [];
  var board = 'inventory';
  var kw = '';
  var colF = {};            // 列筛选：{ k: { vals: [], min: '', max: '' } }
  var sortKey = '', sortDir = '';   // '' | 'asc' | 'desc'
  var selId = null;         // 选中行 id
  var picks = {};           // 勾选的行：{ id: true }
  var editId = null;        // 行内编辑中的行 id
  var editMode = false;     // 整表编辑模式：所有行可逐格编辑
  var mods = {};            // 未保存改动 { 记录id: { 列key: 新值 } }
  var editingId = null;     // 弹窗编辑的记录 id（null = 新增）
  var editBoard = 'inventory';
  var impRows = null;
  var myOnly = false;       // 只看我的单
  var myName = '';          // 当前用户姓名（跟单员比对用）
  var procLib = [];         // 工序库
  var procTargets = [];     // 工序弹窗作用的目标行 id
  var procChain = [];       // 工序弹窗里正在编辑的链
  var trackOpen = true;     // 追踪卡显示开关

  // ---------- v1.0.199 入仓板块 ----------
  var inRows = [];          // 入仓录入行：[{ _r: 1, grade: '201', ... }]
  var inSeq = 0;            // 行号自增
  var IN_MIN = 20;          // 最少显示行数
  var IN_GO_LABEL = '📥 一键入仓';
  var IN_KEYS = ['purchase_date', 'warehouse_date', 'warehouse', 'grade', 'surface', 'thickness', 'width', 'length',
    'w_orig', 'w_now', 'w_gross', 'count', 'prod_status', 'code', 'type', 'origin', 'price_tax', 'price_notax',
    'amount_tax', 'amount_notax', 'supplier', 'customer', 'follower', 'due_date', 'contract_no', 'note'];
  var IN_MAP = [['purchase_date', 'purchaseDate'], ['warehouse_date', 'warehouseDate'], ['warehouse', 'warehouse'],
    ['grade', 'grade'], ['surface', 'surface'], ['thickness', 'thickness'], ['width', 'width'], ['length', 'length'],
    ['w_orig', 'wOrig'], ['w_now', 'wNow'], ['w_gross', 'wGross'], ['count', 'count'], ['prod_status', 'prodStatus'],
    ['code', 'code'], ['type', 'type'], ['origin', 'origin'], ['price_tax', 'priceTax'], ['price_notax', 'priceNotax'],
    ['amount_tax', 'amountTax'], ['amount_notax', 'amountNotax'], ['supplier', 'supplier'], ['customer', 'customer'],
    ['follower', 'follower'], ['due_date', 'dueDate'], ['contract_no', 'contractNo'], ['note', 'note']];
  var COL_IN = [
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
    { k: 'supplier', t: '供应商' },
    { k: 'customer', t: '客户名称' },
    { k: 'follower', t: '跟单员' },
    { k: 'due_date', t: '预期交期', kind: 'date' },
    { k: 'contract_no', t: '合同编号' },
    { k: 'note', t: '备注', wide: 1 }
  ];

  // ---------- 状态枚举 ----------
  var ENUM_INV = ['在库', '已预订', '部分出库', '已售出'];
  var ENUM_ORD = ['采购下单', '原料到仓', '投入生产', '加工完成', '发货自提', '已交付'];
  var DEF_PROC = ['开平', '飞剪', '纵剪/分条', '修边', '整平/矫平', '剪板', '激光切割', '冲孔', '折弯', '焊接',
    '酸洗', '退火酸洗', '普通磨砂', '雪花砂', '短丝', '长丝', '拉丝', '油磨', '干磨', '水磨', '缎纹', '乱纹/和纹',
    '8K镜面', '喷砂', '压花', '蚀刻', 'PVD镀色', '仿古铜', '做旧', '抗指纹', '覆膜', '贴膜', '撕膜',
    '检验', '包装', '装车', '运输', '客户签收', '返工'];

  // ---------- 列定义 ----------
  var COL_CHK = [{ k: '_chk', t: '', ck: 1 }];
  // 公共列（入仓清单 21 项）
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
  // 生产相关列（库存板块不显示）
  var COL_PROD = [
    { k: 'contract_no', t: '合同编号' },
    { k: 'customer', t: '客户名称' },
    { k: 'follower', t: '跟单员' },
    { k: 'due_date', t: '预期交期', kind: 'date', sp: 'due' },
    { k: 'note', t: '备注', wide: 1 },
    { k: 'sale_price', t: '销售定价', num: 1, kind: 'num' }
  ];
  var COL_INV_ST = [{ k: 'inv_status', t: '库存状态', st: 1, enum: ENUM_INV }];
  var COL_ORD_ST = [{ k: 'ord_status', t: '订单状态', st: 1, enum: ENUM_ORD }];
  // 生产进度板块（数据少，聚焦"加工到哪一步"）
  var COL_PG = [
    { k: 'contract_no', t: '合同编号', bold: 1 },
    { k: 'customer', t: '客户名称' },
    { k: 'follower', t: '跟单员' },
    { k: 'grade', t: '钢种' },
    { k: 'spec', t: '规格', sp: 'spec' },
    { k: 'count', t: '卷数/张数', num: 1, kind: 'num' },
    { k: 'w_now', t: '现重/KG', num: 1, kind: 'num' },
    { k: 'warehouse', t: '所在仓库' },
    { k: 'proc', t: '当前工序', sp: 'proc' },
    { k: 'bar', t: '生产进度', sp: 'bar' },
    { k: 'due_date', t: '预期交期', kind: 'date', sp: 'due' },
    { k: 'ord_status', t: '订单状态', st: 1, enum: ENUM_ORD }
  ];
  function dataBoard(b) { return b === 'progress' ? 'ordered' : (b === 'intake' ? 'inventory' : b); }
  function colsCore(b) {
    if (b === 'progress') return COL_PG.slice();
    if (b === 'ordered') return COL_BASE.concat(COL_PROD, COL_ORD_ST);
    return COL_BASE.concat(COL_INV_ST);
  }
  function colsOf(b) { return COL_CHK.concat(colsCore(b)); }
  function colsAll() {
    var out = COL_BASE.concat(COL_PROD, COL_INV_ST, COL_ORD_ST);
    // 补上仅生产进度板块使用的虚拟列（筛选/搜索时按需取值）
    return out.concat([{ k: 'proc', t: '当前工序' }, { k: 'spec', t: '规格' }]);
  }
  function boardLabel(b) {
    if (b === 'intake') return '📥 入仓';
    return b === 'progress' ? '🏭 生产进度' : (b === 'ordered' ? '⚙️ 生产中' : '📦 库存');
  }
  function boardShort(b) {
    if (b === 'intake') return '入仓';
    return b === 'progress' ? '生产进度' : (b === 'ordered' ? '生产中' : '库存');
  }
  function boardRowsOf(b) {
    var st = dataBoard(b);
    return items.filter(function (i) { return i.status === st; });
  }

  // ---------- 工具 ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[,，\s]/g, '')); return isFinite(n) ? n : 0; }
  function fmtNum(n, d) { return n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: d == null ? 2 : d }); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
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
    if (!s) return '';
    if (/^\d{5}(\.\d+)?$/.test(s)) {
      var d = new Date(1899, 11, 30);
      d.setDate(d.getDate() + Math.floor(parseFloat(s)));
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }
    var m = s.match(/^(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
    if (m) return m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]);
    return s;
  }
  function statusLabel(st) { return st === 'ordered' ? '生产中' : '库存'; }
  function val(it, k) {
    if (!it) return '';
    var v;
    if (k === 'w_orig' || k === 'weight_orig') v = it.weight_orig || it.orig_weight;
    else if (k === 'w_now' || k === 'weight_now') v = it.weight_now || it.weight;
    else if (k === 'w_gross' || k === 'weight_gross') v = it.weight_gross;
    else if (k === 'amount_notax') v = it.amount_notax || it.total_amount;
    else if (k === 'price_notax') v = it.price_notax || it.unit_price;
    else if (k === 'spec') v = specOf(it);
    else if (k === 'proc') v = procCur(it);
    else if (k === 'bar') v = (procPct(it) == null ? '' : procPct(it) + '%');
    else v = it[k];
    return v == null ? '' : v;
  }
  // 规格：厚 × 宽 × 长
  function specOf(it) {
    var a = [String(it.thickness || '').trim(), String(it.width || '').trim(), String(it.length || '').trim()];
    return a.filter(function (x) { return x; }).join(' × ');
  }

  // ---------- 工序（链 + 当前进行到第几道）----------
  function flowOf(it) {
    var a = [];
    try { a = JSON.parse((it && it.process_flow) || '[]'); } catch (e) { a = []; }
    if (!Array.isArray(a)) a = [];
    return a.map(function (x) { return String(x).trim(); }).filter(function (x) { return x; });
  }
  function stepOf(it) { var n = parseInt((it && it.process_step) || '0', 10); return (isFinite(n) && n > 0) ? n : 0; }
  function procCur(it) { var f = flowOf(it), s = stepOf(it); return (s > 0 && s <= f.length) ? f[s - 1] : ''; }
  function procPct(it) {
    var f = flowOf(it);
    if (!f.length) return null;
    var s = stepOf(it);
    if (s <= 0) return 0;
    return Math.min(100, Math.round(s / f.length * 100));
  }
  function flowText(it) { var f = flowOf(it); return f.length ? f.join(' → ') : ''; }

  // ---------- 交期预警 ----------
  function dueInfo(it) {
    var d = String((it && it.due_date) || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { cls: '', txt: '', dot: '', tag: '' };
    if (String(it.ord_status || '') === '已交付') return { cls: 'due-ok', txt: d, dot: 'g', tag: '' };
    var t = todayStr();
    if (d < t) return { cls: 'due-over', txt: d, dot: 'r', tag: '已超期' };
    var diff = (new Date(d + 'T00:00:00') - new Date(t + 'T00:00:00')) / 86400000;
    if (diff <= 3) return { cls: 'due-soon', txt: d, dot: 'y', tag: diff <= 0 ? '今天到期' : (diff + ' 天内') };
    return { cls: 'due-ok', txt: d, dot: '', tag: '' };
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
  function lastUpdate(it) {
    var a = stLogArr(it);
    if (!a.length) return '';
    var l = a[a.length - 1];
    return String(l.at || '').slice(5, 16) + ' · ' + (l.by || '—');
  }

  // ---------- 筛选 + 搜索 ----------
  function fActive(k) {
    var f = colF[k];
    return !!(f && ((f.vals && f.vals.length) || f.min !== '' || f.max !== ''));
  }
  function filterCount() { return Object.keys(colF).filter(fActive).length; }
  function fval(it, k) { return board === 'intake' ? (it[k] == null ? '' : String(it[k])) : val(it, k); }
  function passesFilter(it) {
    var keys = Object.keys(colF);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], f = colF[k];
      if (!f) continue;
      var raw = String(fval(it, k));
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
  function passesMy(it) {
    if (!myOnly) return true;
    return String(it.follower || '').trim() === myName;
  }
  function visibleRows() {
    var rows = boardRowsOf(board).filter(function (it) { return passesFilter(it) && passesKw(it) && passesMy(it); });
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
  // ---------- v1.0.198 基础数据词典 ----------
  function hasDictCol(k) { return !!(dictAll.cols && Object.prototype.hasOwnProperty.call(dictAll.cols, k)); }
  function dictCols(k) { return (dictAll.cols && Array.isArray(dictAll.cols[k])) ? dictAll.cols[k] : []; }
  function dictExtra(k) { return (dictAll.extra && Array.isArray(dictAll.extra[k])) ? dictAll.extra[k] : []; }
  function dataVals(k) {
    var out = [];
    items.forEach(function (it) { var v = String(val(it, k) || '').trim(); if (v && out.indexOf(v) < 0) out.push(v); });
    return out;
  }
  // 候选 = 词典值（按词典顺序在前）+ 表格里已出现过的值
  function combinedVals(k) {
    var out = dictCols(k).slice();
    dataVals(k).forEach(function (v) { if (out.indexOf(v) < 0) out.push(v); });
    return out;
  }
  async function loadDict() {
    try {
      var r = await api({ action: 'dictget' });
      if (r && r.dict) { dictAll = r.dict; if (!dictAll.cols) dictAll.cols = {}; if (!dictAll.extra) dictAll.extra = {}; }
      if (r && r.label) dictLabel = r.label;
      if (r && r.defaults) dictDef = r.defaults;
    } catch (e) { /* 词典拉取失败不影响主流程 */ }
    refreshDatalists();
    fillStatusSelects();
  }
  function fillStatusSelects() {
    [['f_invStatus', 'inv_status'], ['f_ordStatus', 'ord_status']].forEach(function (p) {
      var el = $(p[0]);
      if (!el) return;
      var cur = el.value;
      var vals = combinedVals(p[1]);
      el.innerHTML = '<option value="">\u2014</option>' + vals.map(function (v) {
        return '<option value="' + esc(v) + '">' + esc(v) + '</option>';
      }).join('');
      if (cur) el.value = cur;
    });
  }
  function refreshDatalists() {
    var fill = function (id, arr) { var el = $(id); if (el) el.innerHTML = arr.map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join(''); };
    fill('dl_warehouse', combinedVals('warehouse'));
    fill('dl_grade', combinedVals('grade'));
    fill('dl_surface', combinedVals('surface'));
    fill('dl_type', combinedVals('type'));
    fill('dl_origin', combinedVals('origin'));
    fill('dl_supplier', combinedVals('supplier'));
    fill('dl_prod', combinedVals('prod_status'));
    fill('dl_customer', combinedVals('customer'));
    fill('dl_follower', combinedVals('follower'));
  }
  // 单元格下拉面板（Excel 手感：点右下角箭头选值，也能手输/搜索）
  function closeDD() {
    var p = $('ddPanel');
    if (p) { p.classList.remove('show'); p.innerHTML = ''; }
    ddTarget = null; ddKey = ''; ddHit = []; ddIdx = -1;
  }
  function ddMark() {
    var box = $('ddPanel');
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('.dditem'), function (el, i) { if (el.dataset.v !== undefined && i === ddIdx) el.classList.add('cur'); else el.classList.remove('cur'); });
    var c = box.querySelector('.dditem.cur');
    if (c && c.scrollIntoView) c.scrollIntoView({ block: 'nearest' });
  }
  function ddRenderList(q) {
    var vals = combinedVals(ddKey);
    var cur = ddTarget ? String(ddTarget.value || '') : '';
    var ql = String(q || '').trim().toLowerCase();
    ddHit = vals.filter(function (v) { return !ql || v.toLowerCase().indexOf(ql) >= 0; });
    ddIdx = ddHit.indexOf(cur);
    var list = $('ddList');
    if (list) {
      list.innerHTML = ddHit.length
        ? ddHit.map(function (v) { return '<div class="dditem' + (v === cur ? ' on' : '') + '" data-v="' + esc(v) + '">' + esc(v) + '</div>'; }).join('')
        : '<div class="dditem ddempty">词典里没有匹配值（可直接手输）</div>';
    }
    ddMark();
  }
  function ddApply(v) {
    if (!ddTarget) return;
    ddTarget.value = v;
    ddTarget.dispatchEvent(new Event('input', { bubbles: true }));
    closeDD();
  }
  function ddKeyNav(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (ddIdx < ddHit.length - 1) ddIdx++; ddMark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (ddIdx > 0) ddIdx--; ddMark(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (ddIdx >= 0 && ddHit[ddIdx] != null) ddApply(ddHit[ddIdx]); }
    else if (e.key === 'Escape') { e.preventDefault(); closeDD(); }
  }
  function openDD(btn) {
    var wrap = btn.closest ? btn.closest('.cell-dd') : null;
    var inp = wrap ? wrap.querySelector('input.cellin') : null;
    if (!inp) return;
    var k = inp.dataset.k;
    if (!combinedVals(k).length) { toast('「' + (dictLabel[k] || k) + '」还没有候选值，可点「📚 数据词典」添加', false); return; }
    var box = $('ddPanel');
    box.dataset.k = k;
    box.innerHTML = '<div class="dds"><input id="ddSearch" placeholder="在词典里搜索…" autocomplete="off"></div>' +
      '<div class="ddlist" id="ddList"></div>' +
      '<div class="ddfoot"><span id="ddCnt"></span><span style="flex:1"></span>' +
      '<button data-dd-act="clear">清空</button><button data-dd-act="dict">📚 词典</button></div>';
    ddTarget = inp; ddKey = k;
    ddRenderList('');
    var cnt = $('ddCnt');
    if (cnt) cnt.textContent = combinedVals(k).length + ' 个候选';
    var card = $('tblCard').getBoundingClientRect();
    var r = inp.getBoundingClientRect();
    var left = r.left - card.left + $('tblCard').scrollLeft;
    var top = r.bottom - card.top + $('tblCard').scrollTop + 2;
    box.style.left = Math.max(6, Math.min(left, Math.max(6, $('tblCard').clientWidth - 262))) + 'px';
    box.style.top = top + 'px';
    box.classList.add('show');
    var si = $('ddSearch');
    if (si) {
      si.addEventListener('input', function () { ddRenderList(this.value); });
      si.addEventListener('keydown', ddKeyNav);
      si.focus();
    }
  }
  // 词典维护弹窗
  function dictCatList() {
    var out = [];
    Object.keys(dictAll.cols || {}).forEach(function (k) { out.push({ key: k, label: dictLabel[k] || k, kind: 'col' }); });
    Object.keys(dictAll.extra || {}).forEach(function (k) { out.push({ key: k, label: k, kind: 'extra' }); });
    return out;
  }
  function curDictArr() { return dictCatKind === 'col' ? dictCols(dictCat) : dictExtra(dictCat); }
  function renderDictSide() {
    var cats = dictCatList();
    var row = function (c) {
      var n = (c.kind === 'col' ? dictCols(c.key) : dictExtra(c.key)).length;
      return '<div class="dict-cat' + (c.key === dictCat && c.kind === dictCatKind ? ' on' : '') + '" data-cat="' + esc(c.key) + '" data-kind="' + c.kind + '">' + esc(c.label) + '<span class="cn">' + n + ' 项</span></div>';
    };
    $('dictSide').innerHTML = '<div class="dict-cat-head">表格列（单元格可下拉）</div>' +
      cats.filter(function (c) { return c.kind === 'col'; }).map(row).join('') +
      '<div class="dict-cat-head">预留类别（系统暂无对应列）</div>' +
      cats.filter(function (c) { return c.kind === 'extra'; }).map(row).join('');
  }
  function fillDictText() {
    var label = dictCatKind === 'col' ? (dictLabel[dictCat] || dictCat) : dictCat;
    $('dictTitle').textContent = label + (dictCatKind === 'extra' ? '（预留类别）' : '');
    var arr = curDictArr();
    $('dictText').value = arr.join('\n');
    $('dictCount').textContent = arr.length + ' 个候选值（一行一个）';
  }
  function readDictText() {
    var arr = $('dictText').value.split('\n').map(function (x) { return x.trim(); }).filter(function (x) { return x; });
    var uniq = [];
    arr.forEach(function (v) { if (uniq.indexOf(v) < 0) uniq.push(v); });
    if (dictCatKind === 'col') dictAll.cols[dictCat] = uniq; else dictAll.extra[dictCat] = uniq;
    return uniq;
  }
  function openDict() {
    if (!dictCat) { var first = dictCatList()[0]; dictCat = first ? first.key : ''; dictCatKind = first ? first.kind : 'col'; }
    $('dictMask').classList.add('show');
    renderDictSide();
    fillDictText();
  }
  async function saveDict() {
    readDictText();
    try {
      var r = await api({ action: 'dictset', dict: dictAll });
      $('dictMask').classList.remove('show');
      toast('词典已保存（列词典 ' + r.colItems + ' 项 / 预留类别 ' + r.extraItems + ' 项）');
      await loadDict();
      render();
    } catch (e) { toast(e.message, false); }
  }

  function renderStats() {
    if (board === 'intake') {
      var s0 = inSum();
      if ($('nIn')) $('nIn').textContent = s0.n;
      var n1 = items.filter(function (i) { return i.status === 'inventory'; }).length;
      var n2 = items.filter(function (i) { return i.status === 'ordered'; }).length;
      $('nInv').textContent = n1;
      $('nOrd').textContent = n2;
      $('nPg').textContent = n2;
      $('nAll').textContent = items.length;
      $('sumLine').innerHTML = '<b>📥 入仓录入</b>：已填 <b>' + s0.n + '</b> 行 · <b>' + fmtNum(s0.cnt, 0) + '</b> 卷/张 · 合计 <b>' +
        fmtNum(s0.kg / 1000, 3) + '</b> 吨（' + fmtNum(s0.kg, 0) + ' KG） · 不含税金额 <b>' + fmtNum(s0.amt, 2) + '</b> 元' +
        '<span style="color:#64748b">　（筛选只影响显示，一键入仓提交全部已填行）</span>';
      return;
    }
    var inv = items.filter(function (i) { return i.status === 'inventory'; });
    var ord = items.filter(function (i) { return i.status === 'ordered'; });
    $('nInv').textContent = inv.length;
    $('nOrd').textContent = ord.length;
    $('nPg').textContent = ord.length;
    $('nAll').textContent = items.length;
    var rows = visibleRows();
    var sumCount = 0, sumKg = 0, sumAmt = 0;
    rows.forEach(function (it) {
      sumCount += num(val(it, 'count'));
      sumKg += num(val(it, 'w_now')) || num(val(it, 'w_orig'));
      sumAmt += num(val(it, 'amount_notax'));
    });
    var all = boardRowsOf(board);
    var extra = (rows.length !== all.length || filterCount() || myOnly) ? '（已筛选 ' + rows.length + '/' + all.length + ' 条）' : '';
    var due = ord.filter(function (i) {
      var d = dueInfo(i);
      return d.tag === '已超期';
    }).length;
    var soon = ord.filter(function (i) { return dueInfo(i).dot === 'y'; }).length;
    var warn = (board !== 'inventory') && (due || soon)
      ? ' · 交期预警：<b style="color:#b91c1c">' + due + '</b> 条已超期 / <b style="color:#b45309">' + soon + '</b> 条临近'
      : '';
    $('sumLine').innerHTML = '<b>' + boardLabel(board) + '</b> 板块：共 <b>' + all.length + '</b> 条记录' + extra +
      ' · <b>' + fmtNum(sumCount, 0) + '</b> 卷/张 · 合计 <b>' + fmtNum(sumKg / 1000, 3) + '</b> 吨（' + fmtNum(sumKg, 0) + ' KG） · 不含税金额合计 <b>' + fmtNum(sumAmt, 2) + '</b> 元' + warn;
  }

  // ---------- v1.0.199 入仓录入 ----------
  // v1.0.203 日期列有默认值（当天），判定「这一行是否已填」时忽略日期，避免空行被当成数据
  var IN_KEYS_DATA = IN_KEYS.filter(function (k) { return k !== 'purchase_date' && k !== 'warehouse_date'; });
  function inHas(r) {
    for (var i = 0; i < IN_KEYS_DATA.length; i++) { var v = String(r[IN_KEYS_DATA[i]] == null ? '' : r[IN_KEYS_DATA[i]]).trim(); if (v) return true; }
    return false;
  }
  function inValid(r) {
    return ['code', 'grade', 'supplier', 'warehouse', 'contract_no', 'warehouse_date', 'customer'].some(function (k) {
      return String(r[k] == null ? '' : r[k]).trim();
    });
  }
  // v1.0.203 空白行的采购日期 / 进仓日期默认当天，省掉手输
  function inBlank() { return { _r: ++inSeq, purchase_date: todayStr(), warehouse_date: todayStr() }; }
  function initInRows(n) {
    if (inRows.length) return;
    for (var i = 0; i < (n || IN_MIN); i++) inRows.push(inBlank());
  }
  function inRowHtml(r) {
    return '<tr data-r="' + r._r + '" class="inrow">' + '<td class="in-no">' + r._r + '</td>' +
      COL_IN.map(function (c) { return '<td' + (c.num ? ' class="num-r"' : '') + '>' + inCellHtml(r, c) + '</td>'; }).join('') + '</tr>';
  }
  function inPh(c) {
    if (c.kind === 'date') return todayStr();
    if (c.k === 'thickness') return '0.63';
    if (c.k === 'width') return '1219';
    if (c.k === 'length') return '如 C';
    if (c.k === 'count') return '1';
    return '';
  }
  // 录入表列宽（按字段给最小宽度，避免编号/日期被截断）
  function inW(c) {
    if (c.k === 'note') return 150;
    if (c.k === 'code' || c.k === 'contract_no') return 96;
    if (c.kind === 'date') return 92;
    if (c.k === 'warehouse' || c.k === 'customer' || c.k === 'supplier') return 96;
    if (c.k === 'grade' || c.k === 'surface' || c.k === 'origin') return 82;
    if (c.k === 'prod_status' || c.k === 'type') return 70;
    if (c.k === 'length') return 62;
    if (c.kind === 'num') return 74;
    return 0;
  }
  function inCellHtml(r, c) {
    var v = r[c.k] == null ? '' : r[c.k];
    var w = inW(c);
    var inp = '<input class="cellin" data-r="' + r._r + '" data-k="' + c.k + '" value="' + esc(v) + '" placeholder="' + esc(inPh(c)) + '"' + (w ? ' style="min-width:' + w + 'px"' : '') + '>';
    if (hasDictCol(c.k) && combinedVals(c.k).length) return '<div class="cell-dd">' + inp + '<button class="ddbtn" data-dd="' + c.k + '" tabindex="-1" title="从词典选择">▼</button></div>';
    return inp;
  }
  function inAdd(n) {
    var added = [];
    for (var i = 0; i < (n || 10); i++) { var r = inBlank(); inRows.push(r); added.push(r); }
    if (board !== 'intake' || filterCount()) { renderStats(); return; }
    var tb = $('tbody');
    if (!tb || tb.querySelector('td.empty')) { render(); return; }
    added.forEach(function (r) { tb.insertAdjacentHTML('beforeend', inRowHtml(r)); });
    renderStats();
  }
  function inVisible() {
    var rows = inRows.filter(function (r) { return !filterCount() || passesFilter(r); });
    if (sortKey && sortDir) {
      var desc = sortDir === 'desc';
      rows = rows.slice().sort(function (a, b) {
        var av = a[sortKey] == null ? '' : a[sortKey], bv = b[sortKey] == null ? '' : b[sortKey];
        var c = num(av) - num(bv);
        if (!num(av) && !num(bv)) c = String(av).localeCompare(String(bv), 'zh-CN');
        return desc ? -c : c;
      });
    }
    return rows;
  }
  // v1.0.203 录入表行号重排（导入/追加后保持 1..n 连续，粘贴定位才准）
  function inRenumber() {
    inRows.forEach(function (r, i) { r._r = i + 1; });
    inSeq = inRows.length;
  }
  // v1.0.203 把导入解析出来的行灌进入仓录入表格（不写库）—— 用户补充数据后再点「一键入仓」
  function impToIntake() {
    var filled = inRows.filter(inHas);
    var add = impRows.map(function (it) {
      var r = { _r: 0 };
      IN_MAP.forEach(function (p) { r[p[0]] = String(it[p[1]] == null ? '' : it[p[1]]).trim(); });
      r.purchase_date = normDate(r.purchase_date) || todayStr();
      r.warehouse_date = normDate(r.warehouse_date) || todayStr();
      r.due_date = normDate(r.due_date);
      return r;
    });
    inRows = filled.concat(add);
    notaxApply(inRows);
    for (var i = 0; i < IN_MIN; i++) inRows.push(inBlank());
    inRenumber();
    colF = {}; sortKey = ''; sortDir = ''; closeFPanel();
    if (board !== 'intake') board = 'intake';
    render();
    toast('已把 ' + add.length + ' 条放进入仓表格 —— 核对/补充后点「📥 一键入仓」再进库存');
  }
  function inSum() {
    var o = { n: 0, cnt: 0, kg: 0, amt: 0 };
    inRows.forEach(function (r) {
      if (!inHas(r)) return;
      o.n++;
      o.cnt += num(r.count);
      o.kg += num(r.w_now) || num(r.w_orig);
      o.amt += num(r.amount_notax);
    });
    return o;
  }
  function renderIntake() {
    renderThead();
    renderStats();
    syncBar();
    var t = document.querySelector('table.tk');
    if (t) { t.className = 'tk inin'; t.style.minWidth = (COL_IN.length * 92 + 46) + 'px'; }
    if ($('trackCard')) { $('trackCard').className = 'track'; $('trackCard').innerHTML = ''; }
    var rows = inVisible();
    if (!rows.length) {
      $('tbody').innerHTML = '<tr><td colspan="' + (COL_IN.length + 1) + '" class="empty">' +
        (filterCount() ? '当前筛选没有匹配的行 —— 点列头 ▼ 可以清除筛选' : '点「＋ 加 10 行」开始录入，或直接从 Excel 复制后粘贴进来') + '</td></tr>';
      return;
    }
    $('tbody').innerHTML = rows.map(inRowHtml).join('');
  }
  function inPaste(e) {
    if (board !== 'intake') return;
    var cd = e.clipboardData || window.clipboardData;
    if (!cd) return;
    var txt = cd.getData('text') || '';
    if (!txt || (txt.indexOf('\t') < 0 && txt.indexOf('\n') < 0)) return;
    e.preventDefault();
    var aoa = txt.replace(/\r/g, '').split('\n').filter(function (l) { return l.trim() !== ''; })
      .map(function (l) { return l.split('\t').map(function (x) { return x.trim(); }); });
    var el = e.target;
    var c0 = (el && el.dataset && el.dataset.k) ? IN_KEYS.indexOf(el.dataset.k) : 0;
    if (c0 < 0) c0 = 0;
    var r0 = (el && el.dataset && el.dataset.r) ? (parseInt(el.dataset.r, 10) - 1) : 0;
    if (!(r0 >= 0)) r0 = 0;
    while (inRows.length < r0 + aoa.length) inRows.push(inBlank());
    var cells = 0;
    aoa.forEach(function (arr, ri) {
      var row = inRows[r0 + ri];
      if (!row) return;
      arr.forEach(function (v, ci) {
        var k = IN_KEYS[c0 + ci];
        if (!k) return;
        row[k] = v;
        cells++;
      });
    });
    notaxApply(inRows);
    render();
    toast('已粘贴 ' + aoa.length + ' 行 · ' + cells + ' 格' + (filterCount() ? '（筛选中，部分行可能不显示）' : ''));
  }
  async function doIntake() {
    var rows = inRows.filter(inHas);
    if (!rows.length) { toast('还没有填任何数据 —— 直接在表格里输入，或从 Excel 复制后粘贴', false); return; }
    var bad = [];
    rows.forEach(function (r) { if (!inValid(r)) bad.push(r._r); });
    if (bad.length) {
      toast('第 ' + bad.slice(0, 6).join('、') + (bad.length > 6 ? ' 等 ' + bad.length + ' 行' : ' 行') + ' 缺少关键字段：编号 / 钢种 / 供应商 / 仓库 / 合同号 / 进仓日期 / 客户名称 至少填一个', false);
      return;
    }
    var payload = rows.map(function (r) {
      var o = { status: 'inventory' };
      IN_MAP.forEach(function (p) { o[p[1]] = String(r[p[0]] == null ? '' : r[p[0]]).trim(); });
      o.purchaseDate = normDate(o.purchaseDate);
      o.warehouseDate = normDate(o.warehouseDate);
      o.dueDate = normDate(o.dueDate);
      return o;
    });
    notaxApply(payload);
    var btn = $('inGoBtn');
    if (btn) { btn.disabled = true; btn.textContent = '入仓中…'; }
    try {
      var r2 = await api({ action: 'import', rows: payload });
      toast('已入仓 ' + (r2.imported || 0) + ' 条' + (r2.skipped ? '，跳过 ' + r2.skipped + ' 条' : '') + ' → 已进库存板块');
      inRows = []; inSeq = 0;
      initInRows(IN_MIN);
      colF = {}; sortKey = ''; sortDir = ''; closeFPanel();
      await load();
      board = 'inventory';
      var st = Array.prototype.slice.call(document.querySelectorAll('.stat')).filter(function (x) { return x.dataset.st === 'inventory'; })[0];
      paintStats(st || null);
      render();
    } catch (e) { toast(e.message, false); }
    if (btn) { btn.disabled = false; btn.textContent = IN_GO_LABEL; }
  }

  function renderThead() {
    var cols = board === 'intake' ? COL_IN : colsOf(board);
    $('thead').innerHTML = '<tr>' + (board === 'intake' ? '<th class="th-no" title="行号"></th>' : '') + cols.map(function (c) {
      if (c.ck) return '<th class="th-ck"><div class="th-in"><input type="checkbox" class="ckb" id="ckAll" title="全选本页"></div></th>';
      var cls = c.st ? 'th-st' : (c.num ? 'num-r' : '');
      return '<th class="' + cls + '" data-k="' + c.k + '"><div class="th-in"><span>' + esc(c.t) + '</span>' +
        '<button class="fbtn' + (fActive(c.k) ? ' on' : '') + '" data-fk="' + c.k + '" title="筛选 / 排序">▼</button></div></th>';
    }).join('') + '</tr>';
    var t = document.querySelector('table.tk');
    if (t) {
      if (board !== 'intake') t.className = 'tk';
      t.style.minWidth = cols.length > 18 ? (cols.length * 108) + 'px' : '';
    }
    var ca = $('ckAll');
    if (ca) ca.checked = false;
  }

  function stSelect(it, c, inline) {
    var m = inline ? (mods[it.id] || {}) : {};
    var dirty = m[c.k] != null;
    var cur = dirty ? String(m[c.k]) : String(it[c.k] || '');
    var lg = stLast(it, c.k);
    var svals = combinedVals(c.k);
    if (!svals.length) svals = c.enum || [];
    var opts = ['<option value="">\u2014</option>'].concat(svals.map(function (v) {
      return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>';
    })).join('');
    var attr = inline ? ('data-k="' + c.k + '"') : ('data-act="setf" data-f="' + c.k + '" data-id="' + it.id + '"');
    return '<div class="st-cell">' +
      '<select class="stsel ' + (c.k === 'inv_status' ? 'inv' : 'ord') + (dirty ? ' dirty' : '') + '" ' + attr + '>' + opts + '</select>' +
      (lg ? '<div class="st-log" title="' + esc(stTitle(it, c.k)) + '">' + esc(lg) + '</div>' : '') +
      '</div>';
  }

  // 工序单元：当前工序 + 「下一道」按钮 + 设工序按钮
  function procCell(it) {
    var f = flowOf(it), s = stepOf(it);
    if (!f.length) return '<td><span class="proc-none">未设工序</span> <button class="proc-edit" data-act="proc" data-id="' + it.id + '">设工序</button></td>';
    var cur = procCur(it);
    var next = s + 1 <= f.length ? f[s] : '';
    return '<td><div class="proc-cell">' +
      (cur ? '<span class="proc-cur" title="' + esc(f.join(' → ')) + '">' + esc(cur) + '</span>'
        : '<span class="proc-none">未开始</span>') +
      (next ? '<button class="proc-next" data-act="nextproc" data-id="' + it.id + '" title="推进到「' + esc(next) + '」">下一道 →</button>'
        : '<span class="proc-none">已完成</span>') +
      '<button class="proc-edit" data-act="proc" data-id="' + it.id + '">改</button>' +
      '</div></td>';
  }
  function barCell(it) {
    var p = procPct(it), f = flowOf(it), s = stepOf(it);
    if (p == null) return '<td><span class="proc-none">—</span></td>';
    var done = p >= 100;
    return '<td><div class="pbar' + (done ? ' done' : '') + '"><i style="width:' + p + '%"></i></div>' +
      '<div class="ptxt">第 ' + Math.min(s, f.length) + '/' + f.length + ' 道<span class="ppct">' + p + '%</span></div></td>';
  }
  function dueCell(it) {
    var d = dueInfo(it);
    if (!d.txt) return '<td><span class="proc-none">—</span></td>';
    return '<td><span class="' + d.cls + '">' + (d.dot ? '<span class="dot ' + d.dot + '"></span>' : '') + esc(d.txt) +
      (d.tag ? ' <span style="font-size:11px">(' + esc(d.tag) + ')</span>' : '') + '</span></td>';
  }

  function inputHtml(it, k, v) {
    var m = mods[it.id] || {};
    var dirty = m[k] != null;
    var inp = '<input class="cellin' + (dirty ? ' dirty' : '') + '" data-k="' + k + '" value="' + esc(dirty ? m[k] : v) + '">';
    if (hasDictCol(k) && combinedVals(k).length) return '<div class="cell-dd">' + inp + '<button class="ddbtn" data-dd="' + k + '" tabindex="-1" title="从词典选择">\u25bc</button></div>';
    return inp;
  }
  function specEditCell(it) {
    var m = mods[it.id] || {};
    function one(k, w) {
      var d = m[k] != null;
      return '<input class="cellin' + (d ? ' dirty' : '') + '" data-k="' + k + '" value="' + esc(d ? m[k] : (it[k] || '')) + '" style="width:' + w + 'px">';
    }
    return '<div class="spec-edit">' + one('thickness', 46) + '<span>\u00d7</span>' + one('width', 52) + '<span>\u00d7</span>' + one('length', 52) + '</div>';
  }
  function cellHtml(it, c, inline) {
    var m = mods[it.id] || {};
    if (c.ck) return '<td class="ck"><input type="checkbox" class="ckb rowck" data-id="' + it.id + '"' + (picks[it.id] ? ' checked' : '') + '></td>';
    if (c.st) return '<td>' + stSelect(it, c, inline) + '</td>';
    if (c.sp === 'proc') {
      if (!inline) return procCell(it);
      var f = flowOf(it);
      return '<td><div class="proc-edit-inline">' +
        (procCur(it) ? '<span class="proc-cur">' + esc(procCur(it)) + '</span>' : '<span class="proc-none">未设工序</span>') +
        '<button class="proc-edit" data-act="proc" data-id="' + it.id + '">' + (f.length ? '改' : '设工序') + '</button></div></td>';
    }
    if (c.sp === 'bar') return '<td class="ro">' + (inline ? esc(procPct(it) == null ? '\u2014' : procPct(it) + '%') : barCell(it).replace(/^<td>|<\/td>$/g, '')) + '</td>';
    if (c.sp === 'due') {
      if (!inline) return dueCell(it);
      var dd = m.due_date != null;
      return '<td><input type="date" class="cellin' + (dd ? ' dirty' : '') + '" data-k="due_date" value="' + esc(dd ? m.due_date : (it.due_date || '')) + '"></td>';
    }
    if (c.sp === 'spec') return inline ? ('<td>' + specEditCell(it) + '</td>') : ('<td>' + esc(specOf(it)) + '</td>');
    var v = val(it, c.k);
    if (inline) return '<td' + (c.num ? ' class="num-r"' : '') + '>' + inputHtml(it, c.k, v) + '</td>';
    if (c.wide) return '<td class="wide" title="' + esc(v) + '">' + esc(v) + '</td>';
    if (c.bold) return '<td><b>' + esc(v) + '</b></td>';
    if (c.num) return '<td class="num-r">' + esc(v) + '</td>';
    return '<td>' + esc(v) + '</td>';
  }

  function render() {
    if (board === 'intake') { renderIntake(); return; }
    renderThead();
    renderStats();
    syncBar();
    renderTrack();
    var rows = visibleRows();
    var tb = $('tbody');
    var cardEl = $('tblCard');
    if (cardEl) cardEl.classList[rows.length ? 'remove' : 'add']('tf-empty');
    var cols = colsOf(board);
    if (!rows.length) {
      tb.innerHTML = '';
      var et = $('emptyText');
      if (et) et.textContent = (boardRowsOf(board).length ? '当前筛选 / 搜索无匹配' : (board === 'progress' ? '生产进度板块显示「生产中」的货，先到生产中板块录入或转过来' : '该板块暂无数据，点「＋ 入仓」或「📥 导入 Excel/CSV」开始'));
      return;
    }
    tb.innerHTML = rows.map(function (it) {
      var inline = editMode;
      var tds = cols.map(function (c) { return cellHtml(it, c, inline); }).join('');
      var cls = (String(it.id) === String(selId) ? 'sel ' : '') + (editMode ? 'editing ' : '') + (picks[it.id] ? 'picked' : '');
      return '<tr data-id="' + it.id + '" class="' + cls.trim() + '">' + tds + '</tr>';
    }).join('');
    var ca = $('ckAll');
    if (ca) {
      var ids = rows.map(function (r) { return r.id; });
      ca.checked = ids.length > 0 && ids.every(function (i) { return !!picks[i]; });
    }
  }

  function syncBar() {
    var sel = selId != null ? items.find(function (x) { return String(x.id) === String(selId); }) : null;
    var editing = editMode;
    var nMod = modCount();
    $('rowEditBtn').style.display = editing ? 'none' : '';
    $('rowSaveBtn').style.display = editing ? '' : 'none';
    $('rowCancelBtn').style.display = editing ? '' : 'none';
    $('rowEditBtn').disabled = editing;
    $('rowSaveBtn').disabled = !nMod;
    $('rowSaveBtn').textContent = nMod ? ('\ud83d\udcbe 保存全部（' + nMod + '）') : '\ud83d\udcbe 保存全部';
    $('rowCancelBtn').textContent = nMod ? ('取消编辑（' + nMod + '）') : '取消编辑';
    $('rowAdvBtn').style.display = (board === 'ordered' && !editing) ? '' : 'none';
    $('rowAdvBtn').disabled = !sel || editing || !(sel && nextOrd(sel));
    $('rowProcBtn').style.display = ((board === 'ordered' || board === 'progress') && !editing) ? '' : 'none';
    $('rowProcBtn').disabled = !sel || editing;
    $('rowBackBtn').disabled = !sel || editing;
    $('rowDelBtn').disabled = !sel || editing;
    $('rowBackBtn').textContent = (board === 'inventory') ? '转生产中' : '转库存';
    $('myOnlyBtn').className = 'btn sm' + (myOnly ? ' on' : '');
    var f = filterCount();
    $('selHint').className = 'hint' + (editing ? ' hot' : '');
    $('selHint').textContent = editing
      ? ('编辑中 · 改动 ' + nMod + ' 处 / ' + modRowCount() + ' 条 · 回车跳下行 · Ctrl+Enter 保存')
      : sel ? ('已选中 #' + sel.id + (sel.code ? ' · ' + sel.code : ''))
        : (f ? ('筛选中：' + f + ' 列') : '未选中行');
    var pids = Object.keys(picks).filter(function (k) { return picks[k]; });
    $('batchCnt').textContent = '已选 ' + pids.length + ' 条';
    $('batchBar').className = 'batch' + (!editing && pids.length ? ' show' : '');
    $('batchOrdBtn').disabled = !pids.length;
    $('batchInvBtn').disabled = !pids.length;
    $('batchDelBtn').disabled = !pids.length;
    // v1.0.199 入仓板块：只留录入相关的按钮
    var isIn = board === 'intake';
    if ($('inGrp')) $('inGrp').style.display = isIn ? '' : 'none';
    if ($('addBtn')) $('addBtn').style.display = isIn ? 'none' : '';
    if ($('myOnlyBtn')) $('myOnlyBtn').style.display = isIn ? 'none' : '';
    if (isIn) {
      $('rowEditBtn').style.display = 'none';
      $('rowProcBtn').style.display = 'none';
      $('rowAdvBtn').style.display = 'none';
      $('rowBackBtn').style.display = 'none';
      $('rowDelBtn').style.display = 'none';
      $('selHint').className = 'hint hot';
      $('selHint').textContent = '入仓录入 · 已填 ' + inSum().n + ' 行（可直接输入，或从 Excel 粘贴）';
      $('batchBar').className = 'batch';
    }
  }
  function nextOrd(it) {
    var cur = String(it.ord_status || '');
    if (!cur) return ENUM_ORD[0];
    var i = ENUM_ORD.indexOf(cur);
    if (i < 0) return ENUM_ORD[0];
    return i < ENUM_ORD.length - 1 ? ENUM_ORD[i + 1] : '';
  }

  // ---------- 追踪卡（跟单员 → 客户 → 合同）----------
  function groupBy(arr, key) {
    var m = {};
    arr.forEach(function (it) {
      var k = String(it[key] || '').trim() || '（未填）';
      (m[k] = m[k] || []).push(it);
    });
    return m;
  }
  function statsOf(arr) {
    var cnt = 0, kg = 0, contracts = {}, custs = {};
    arr.forEach(function (it) {
      cnt += num(val(it, 'count')) || 0;
      kg += num(val(it, 'w_now')) || num(val(it, 'w_orig'));
      var c = String(it.contract_no || '').trim(); if (c) contracts[c] = 1;
      var cu = String(it.customer || '').trim(); if (cu) custs[cu] = 1;
    });
    return { n: arr.length, cnt: cnt, ton: (kg / 1000), contracts: Object.keys(contracts), custs: Object.keys(custs) };
  }
  function renderTrack() {
    var box = $('trackCard');
    if (!kw || !trackOpen) { box.className = 'track'; box.innerHTML = ''; return; }
    var all = items;
    var q = kw;
    var hitF = [], hitC = [], hitK = [];
    var folMap = groupBy(all, 'follower');
    Object.keys(folMap).forEach(function (k) { if (k !== '（未填）' && k.toLowerCase().indexOf(q) >= 0) hitF.push(k); });
    var cusMap = groupBy(all, 'customer');
    Object.keys(cusMap).forEach(function (k) { if (k !== '（未填）' && k.toLowerCase().indexOf(q) >= 0) hitC.push(k); });
    var conMap = groupBy(all, 'contract_no');
    Object.keys(conMap).forEach(function (k) { if (k && k.toLowerCase().indexOf(q) >= 0) hitK.push(k); });
    if (!hitF.length && !hitC.length && !hitK.length) { box.className = 'track'; box.innerHTML = ''; return; }

    var html = '<div class="tk-h"><b>🔎 追踪「' + esc(kw) + '」</b><span class="sp"></span>' +
      '<button data-tk="close">收起</button></div>';

    hitF.slice(0, 6).forEach(function (name) {
      var rows = folMap[name] || [];
      var st = statsOf(rows);
      html += '<div class="grp-row"><div class="grp-head"><span class="gname">👤 ' + esc(name) + '</span>' +
        '<span class="gmeta">负责 ' + st.custs.length + ' 个客户 · ' + st.contracts.length + ' 个合同 · ' + st.n + ' 条货 · 合计 ' + fmtNum(st.ton, 3) + ' 吨</span>' +
        '<button class="go" data-tk="only" data-by="follower" data-v="' + esc(name) + '">只看他的单</button></div>';
      // 客户 → 合同
      var byCust = groupBy(rows, 'customer');
      html += '<div class="grp-sub">';
      Object.keys(byCust).forEach(function (cn) {
        var cr = byCust[cn], cst = statsOf(cr);
        html += '<div class="sub-row"><span class="sname">🏢 ' + esc(cn) + '</span>' +
          '<span class="smeta">' + cst.contracts.length + ' 个合同 · ' + cr.length + ' 条 · ' + fmtNum(cst.ton, 3) + ' 吨</span>' +
          '<button class="go" data-tk="only" data-by="customer" data-v="' + esc(cn) + '">只看</button>' +
          '<span class="smeta">合同：' + (cst.contracts.length ? cst.contracts.map(function (c) {
            var kr = cr.filter(function (x) { return String(x.contract_no || '').trim() === c; });
            var ks = statsOf(kr);
            return '<button class="go" data-tk="only" data-by="contract_no" data-v="' + esc(c) + '">' + esc(c) + '</button>(' + kr.length + '条/' + fmtNum(ks.ton, 3) + '吨)';
          }).join(' ') : '—') + '</span></div>';
      });
      html += '</div></div>';
    });

    hitC.slice(0, 6).forEach(function (cn) {
      var rows = cusMap[cn], st = statsOf(rows);
      html += '<div class="grp-row"><div class="grp-head"><span class="gname">🏢 ' + esc(cn) + '</span>' +
        '<span class="gmeta">' + st.contracts.length + ' 个合同 · ' + rows.length + ' 条货 · 合计 ' + fmtNum(st.ton, 3) + ' 吨</span>' +
        '<button class="go" data-tk="only" data-by="customer" data-v="' + esc(cn) + '">只看该客户</button></div>' +
        '<div class="grp-sub"><div class="sub-row"><span class="smeta">合同：' + (st.contracts.length ? st.contracts.map(function (c) {
          var kr = rows.filter(function (x) { return String(x.contract_no || '').trim() === c; });
          var ks = statsOf(kr);
          return '<button class="go" data-tk="only" data-by="contract_no" data-v="' + esc(c) + '">' + esc(c) + '</button>(' + kr.length + '条/' + fmtNum(ks.ton, 3) + '吨)';
        }).join(' ') : '—') + '</span>' +
          '<span class="smeta">跟单员：' + (function () {
            var fm = groupBy(rows, 'follower');
            return Object.keys(fm).map(function (f) { return esc(f) + '(' + fm[f].length + ')'; }).join('、') || '—';
          })() + '</span></div></div></div>';
    });

    hitK.slice(0, 6).forEach(function (ck) {
      var rows = conMap[ck], st = statsOf(rows);
      var procs = {};
      rows.forEach(function (r) { var p = procCur(r) || '未设工序'; procs[p] = (procs[p] || 0) + 1; });
      html += '<div class="grp-row"><div class="grp-head"><span class="gname">📄 ' + esc(ck) + '</span>' +
        '<span class="gmeta">' + esc(st.custs.join('、') || '—') + ' · ' + rows.length + ' 条货 · 合计 ' + fmtNum(st.ton, 3) + ' 吨</span>' +
        '<button class="go" data-tk="only" data-by="contract_no" data-v="' + esc(ck) + '">只看该合同</button></div>' +
        '<div class="grp-sub"><div class="sub-row"><span class="smeta">工序分布：' + Object.keys(procs).map(function (p) { return esc(p) + '(' + procs[p] + ')'; }).join('、') + '</span>' +
        '<span class="smeta">跟单员：' + (function () {
          var fm = groupBy(rows, 'follower');
          return Object.keys(fm).map(function (f) { return esc(f) + '(' + fm[f].length + ')'; }).join('、') || '—';
        })() + '</span></div></div></div>';
    });

    box.innerHTML = html;
    box.className = 'track show';
  }

  // ---------- 表头筛选面板 ----------
  // 筛选/搜索的取值来源：入仓板块看录入行，其它板块看当前板块记录
  function srcRows() { return board === 'intake' ? inRows : boardRowsOf(board); }
  function uniqueVals(k) {
    var d = dictCols(k);
    var s = [];
    if (d.length) {
      // 有词典：词典全部值在前（这就是「对应标题可以筛选词典中的所有品种」），再补表格里出现过的其它值
      d.forEach(function (v) { if (s.indexOf(v) < 0) s.push(v); });
      srcRows().forEach(function (it) {
        var v = String(val(it, k) || '').trim();
        if (v && s.indexOf(v) < 0) s.push(v);
      });
      if (s.indexOf('') < 0) s.push('');
      return s;
    }
    srcRows().forEach(function (it) {
      var v = String(val(it, k) || '').trim();
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
      var txt = v === '' ? '（空白）' : String(v);
      return '<label title="' + esc(txt) + '"><input type="checkbox" value="' + esc(v) + '"' + (cur.vals && cur.vals.length && cur.vals.indexOf(v) >= 0 ? ' checked' : '') + '><span>' + esc(txt) + '</span></label>';
    }).join('');
    var emptyTip = hasDictCol(k)
      ? '在表格里填一次，或在「📚 数据词典」里给这一列加点值'
      : '该列没有候选值，用下面的最小 / 最大范围来筛';
    // 一个真实候选值都没有（只剩「（空白）」）时，不给空瘪小框，直接走空态说明
    var realN = vals.filter(function (v) { return v !== ''; }).length;
    if (!realN) list = '';
    box.innerHTML = '<div class="fp-t"><span>' + esc(c.t) + '</span><span class="sp"></span><button data-fp="close">✕</button></div>' +
      '<input class="fp-s" id="fpSearch" placeholder="在值里搜索…">' +
      '<div class="fp-list" id="fpList">' + (list || '<div class="fp-empty"><b>该列暂无可选值</b><i>' + emptyTip + '</i></div>') + '</div>' +
      (c.kind === 'date' || c.kind === 'num' ?
        '<div class="fp-row"><span class="lbl">' + (c.kind === 'date' ? '起' : '最小') + '</span><input id="fpMin" value="' + esc(cur.min || '') + '" placeholder="' + (c.kind === 'date' ? '2026-01-01' : '') + '">' +
        '<span class="lbl">' + (c.kind === 'date' ? '止' : '最大') + '</span><input id="fpMax" value="' + esc(cur.max || '') + '" placeholder="' + (c.kind === 'date' ? '2026-12-31' : '') + '"></div>' : '') +
      '<div class="fp-f">' +
      '<button data-fp="all"' + (realN ? '' : ' disabled') + '>全选</button><button data-fp="none"' + (realN ? '' : ' disabled') + '>清空</button>' +
      '<button data-fp="asc">↑ 升序</button><button data-fp="desc">↓ 降序</button>' +
      '</div>' +
      '<div class="fp-f"><button data-fp="clear">清除此列</button><button class="pri" data-fp="apply">应用</button></div>';
    box.dataset.k = k;
    box.classList.add('show');
    var tw = $('tblCard');
    var card = tw.getBoundingClientRect();
    var r = btn.getBoundingClientRect();
    var pw = box.offsetWidth || 340;
    var left = r.left - card.left + tw.scrollLeft;
    var top = r.bottom - card.top + tw.scrollTop + 4;
    var lx = Math.max(4, Math.min(left - 60, tw.clientWidth - pw - 8));
    box.style.left = lx + 'px';
    box.style.top = top + 'px';
    // 面板可能越过窗口右边界 → 左移
    var rect = box.getBoundingClientRect();
    var over = rect.right - (window.innerWidth - 8);
    if (over > 0) box.style.left = Math.max(4, lx - over) + 'px';
  }
  function readFPanel() {
    var box = $('fPanel'), k = box.dataset.k;
    var c = colsAll().find(function (x) { return x.k === k; });
    var vals = Array.prototype.slice.call(box.querySelectorAll('#fpList input[type=checkbox]')).filter(function (cb) { return cb.checked; }).map(function (cb) { return cb.value; });
    var all = Array.prototype.slice.call(box.querySelectorAll('#fpList input[type=checkbox]')).map(function (cb) { return cb.value; });
    var min = $('fpMin') ? $('fpMin').value.trim() : '';
    var max = $('fpMax') ? $('fpMax').value.trim() : '';
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
    if (!editMode) mods = {};
      Object.keys(picks).forEach(function (k) { if (!items.some(function (x) { return String(x.id) === String(k); })) delete picks[k]; });
      refreshDatalists();
      render();
    } catch (e) {
      $('tbody').innerHTML = '<tr><td colspan="' + colsOf(board).length + '" class="empty">加载失败：' + esc(e.message) + '</td></tr>';
      toast(e.message, false);
    }
  }
  async function loadLib() {
    try {
      var r = await api({ action: 'libget', key: 'processLib' });
      procLib = Array.isArray(r.value) && r.value.length ? r.value : DEF_PROC.slice();
    } catch (e) { procLib = DEF_PROC.slice(); }
  }

  // ---------- 弹窗：入仓 / 编辑 ----------
  var FORM_FIELDS = ['purchaseDate', 'warehouseDate', 'warehouse', 'grade', 'surface', 'thickness', 'width', 'length',
    'wOrig', 'wNow', 'wGross', 'count', 'prodStatus', 'code', 'type', 'origin',
    'priceTax', 'priceNotax', 'amountTax', 'amountNotax', 'supplier',
    'contractNo', 'customer', 'follower', 'dueDate', 'note', 'salePrice'];
  var F2DB = {
    purchaseDate: 'purchase_date', warehouseDate: 'warehouse_date', wOrig: 'weight_orig', wNow: 'weight_now',
    wGross: 'weight_gross', prodStatus: 'prod_status', contractNo: 'contract_no', priceTax: 'price_tax',
    priceNotax: 'price_notax', amountTax: 'amount_tax', amountNotax: 'amount_notax',
    salePrice: 'sale_price', customer: 'customer', follower: 'follower', dueDate: 'due_date'
  };
  var dlgBase = null;   // 弹窗编辑时的原记录（保留未显示字段）
  function openEdit(it) {
    editingId = it ? it.id : null;
    dlgBase = it || null;
    editBoard = it ? it.status : (board === 'progress' ? 'ordered' : board);
    $('dlgTitle').textContent = it ? ('编辑记录 #' + it.id + (it.code ? ' · ' + it.code : '')) : ('入仓 · 新增' + boardShort(editBoard) + '货物');
    FORM_FIELDS.forEach(function (f) {
      var el = $('f_' + f);
      if (!el) return;
      var v = it ? val(it, F2DB[f] || f) : '';
      if (!it) {
        if (f === 'follower') v = myName;
        if (f === 'warehouseDate') v = todayStr();
        if (f === 'purchaseDate') v = todayStr();
      }
      el.value = v == null ? '' : String(v);
    });
    $('f_invStatus').value = (it && it.inv_status) || '在库';
    $('f_ordStatus').value = (it && it.ord_status) || '采购下单';
    $('f_flowText').value = flowText(it || {}) || '';
    fillCurProcSelect(it);
    renderStPick();
    renderStHistory(it);
    $('editMask').classList.add('show');
  }
  function fillCurProcSelect(it) {
    var sel = $('f_curProc');
    if (!sel) return;
    var f = flowOf(it || {});
    var s = stepOf(it || {});
    sel.innerHTML = '<option value="0">—（未开始）</option>' + f.map(function (p, i) {
      return '<option value="' + (i + 1) + '"' + ((i + 1) === s ? ' selected' : '') + '>' + esc(p) + '</option>';
    }).join('');
    sel.value = String(s || 0);
  }
  function renderStPick() {
    var isOrd = editBoard === 'ordered';
    Array.prototype.forEach.call(document.querySelectorAll('#editMask .ord-only'), function (el) { el.style.display = isOrd ? '' : 'none'; });
    $('secOrdOnly').style.display = isOrd ? '' : 'none';
    $('secProgress').style.display = isOrd ? '' : 'none';
    $('fgInvSt').style.display = isOrd ? 'none' : '';
    $('fgOrdSt').style.display = isOrd ? '' : 'none';
    $('secStatus').textContent = isOrd
      ? '⑤ 状态（改动会记录时间与操作账号）'
      : '③ 状态（改动会记录时间与操作账号）';
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
    // 以原记录为基底（保留工序链/负差等未在表单里的字段）
    if (dlgBase) {
      Object.keys(dlgBase).forEach(function (k) {
        if (['id', 'status_log', 'created_at', 'updated_at', 'created_by', 'status'].indexOf(k) >= 0) return;
        it[k] = dlgBase[k];
      });
      it.status_log = dlgBase.status_log;
    }
    FORM_FIELDS.forEach(function (f) { var el = $('f_' + f); it[f] = el ? el.value.trim() : ''; });
    it.purchaseDate = normDate(it.purchaseDate);
    it.warehouseDate = normDate(it.warehouseDate);
    it.dueDate = normDate(it.dueDate);
    if (editBoard === 'inventory') {
      it.invStatus = $('f_invStatus').value; it.ordStatus = '';
      it.contractNo = ''; it.customer = ''; it.follower = ''; it.note = ''; it.salePrice = ''; it.dueDate = '';
    } else {
      it.ordStatus = $('f_ordStatus').value; it.invStatus = '';
      it.processStep = String($('f_curProc').value || '0');
    }
    if (!(it.code || it.grade || it.supplier || it.warehouse || it.contractNo || it.warehouseDate)) {
      toast('至少填写 编号/钢种/供应商/仓库/合同编号/进仓日期 之一', false);
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
  // v1.0.203 弹窗里填含税 → 自动带出不含税（用户自己填过的不覆盖）
  function autoTaxFill() {
    var pt = $('f_priceTax'), pn = $('f_priceNotax');
    if (pt && pn && String(pt.value).trim()) {
      if (!String(pn.value).trim() || pn.dataset.auto === '1') {
        var nv = notaxOf(String(pt.value).trim());
        if (isFinite(nv)) { pn.value = nv; pn.dataset.auto = '1'; }
      }
    }
    var at = $('f_amountTax'), an = $('f_amountNotax');
    if (at && an && String(at.value).trim()) {
      if (!String(an.value).trim() || an.dataset.auto === '1') {
        var nv2 = notaxOf(String(at.value).trim());
        if (isFinite(nv2)) { an.value = nv2; an.dataset.auto = '1'; }
      }
    }
  }
  function autoAmount() {
    var amountEl = $('f_amountNotax');
    if (!amountEl || amountEl.value.trim()) return;
    var p = num($('f_priceNotax').value);
    var kg = num($('f_wNow').value) || num($('f_wOrig').value);
    if (p > 0 && kg > 0) amountEl.value = (p * kg / 1000).toFixed(2);
  }

  // ---------- 编辑模式（整表逐格编辑，最后统一保存）----------
  var K2DB = { w_orig: 'weight_orig', w_now: 'weight_now', w_gross: 'weight_gross' };

  // v1.0.198 基础数据词典：列 -> 候选值；单元格点右下角箭头从这里选
  var dictAll = { cols: {}, extra: {} };
  var dictLabel = {};
  var dictDef = null;
  var dictCat = '';
  var dictCatKind = 'col';
  var ddTarget = null, ddKey = '', ddHit = [], ddIdx = -1;
  function modCount() {
    var n = 0;
    Object.keys(mods).forEach(function (id) { n += Object.keys(mods[id]).length; });
    return n;
  }
  function modRowCount() {
    return Object.keys(mods).filter(function (id) { return Object.keys(mods[id]).length; }).length;
  }
  function startRowEdit() {
    if (editMode) return;
    editMode = true;
    mods = {};
    render();
    toast('编辑模式：点任意格子直接改，回车跳同列下一行（Shift+Enter 上一行 / Ctrl+Enter 保存 / Esc 取消）');
  }
  // ---------- v1.0.203 税点（%）：不含税 = 含税 × (1 - 税点) ----------
  var taxRate = '13';       // 默认 13%，改了会记住
  function round2v(n) { return Math.round((n + 1e-9) * 100) / 100; }
  function taxPct() { var t = num(taxRate); return isFinite(t) ? t : 0; }
  function notaxOf(v) { var n = num(v); return isFinite(n) ? round2v(n * (1 - taxPct() / 100)) : NaN; }
  // v1.0.204 batch entries (import / paste / one-click intake) also fill notax from tax-included values
  var NOTAX_PAIRS = [['price_tax', 'price_notax'], ['amount_tax', 'amount_notax'], ['priceTax', 'priceNotax'], ['amountTax', 'amountNotax']];
  function notaxFillRow(o, force) {
    var n = 0;
    if (!o) return 0;
    NOTAX_PAIRS.forEach(function (p) {
      var t = String(o[p[0]] == null ? '' : o[p[0]]).trim();
      if (!t) return;
      var c = String(o[p[1]] == null ? '' : o[p[1]]).trim();
      if (c && !force) return;
      var v = notaxOf(t);
      if (!isFinite(v)) return;
      if (String(v) === c) return;
      o[p[1]] = String(v);
      n++;
    });
    return n;
  }
  function notaxFillRows(rows, force) {
    var n = 0;
    (rows || []).forEach(function (r) { n += notaxFillRow(r, force); });
    return n;
  }
  function notaxApply(rows) {
    var n = notaxFillRows(rows);
    if (n) toast('已按税点 ' + (String(taxRate).trim() === '' ? '0' : taxRate) + '% 自动算出不含税 ' + n + ' 处');
    return n;
  }
  function initTax() {
    var el = $('taxRate');
    var saved = null;
    try { saved = localStorage.getItem('kk_tax_rate'); } catch (e) { }
    if (saved != null && String(saved).trim() !== '') taxRate = String(saved).trim();
    if (!el) return;
    el.value = taxRate;
    el.addEventListener('input', function () {
      taxRate = el.value;
      try { localStorage.setItem('kk_tax_rate', taxRate); } catch (e) { }
    });
    el.addEventListener('change', function () {
      taxRate = el.value;
      try { localStorage.setItem('kk_tax_rate', taxRate); } catch (e) { }
      toast('税点已设为 ' + (taxRate === '' ? '0' : taxRate) + '% —— 以后填含税单价 / 总金额会自动算出不含税');
    });
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
  }
  // 编辑模式：把不含税结果写进 mods（与原值相同则清理该改动）
  function autoNotaxMod(it, id, pair, rawVal) {
    var s = String(rawVal == null ? '' : rawVal).trim();
    if (!s) return null;
    var nv = notaxOf(s);
    if (!isFinite(nv)) return null;
    var ov = String(val(it, pair) == null ? '' : val(it, pair)).trim();
    mods[id] = mods[id] || {};
    if (String(nv) === ov) delete mods[id][pair]; else mods[id][pair] = String(nv);
    if (!Object.keys(mods[id]).length) delete mods[id];
    return nv;
  }
  // 录入表：直接写行数据
  function autoNotaxRow(row, pair, rawVal) {
    var s = String(rawVal == null ? '' : rawVal).trim();
    if (!s) return null;
    var nv = notaxOf(s);
    if (!isFinite(nv)) return null;
    row[pair] = String(nv);
    return nv;
  }
  function fillPairInput(tr, pair, pv) {
    if (!tr || pv === null || !tr.querySelector) return;
    var pi = tr.querySelector('input.cellin[data-k="' + pair + '"]');
    if (!pi) return;
    pi.value = pv;
    if (pi.classList) pi.classList.add('dirty');
    var ptd = pi.closest ? pi.closest('td') : null;
    if (ptd) ptd.classList.add('dirty-td');
  }
  // v1.0.203 回车跳到同列下一行（Excel 手感）：在 tbody 里按「列的位置」往下找可编辑格
  function cellEditableIn(td) {
    if (!td) return null;
    return td.querySelector('input.cellin, select.stsel[data-k]');
  }
  function moveCellVert(el, dir) {
    var tr = el.closest ? el.closest('tr') : null;
    if (!tr || !tr.parentNode) return false;
    var rows = Array.prototype.slice.call(tr.parentNode.children);
    var ri = rows.indexOf(tr);
    var td = el.closest ? el.closest('td') : null;
    if (ri < 0 || !td) return false;
    var ci = Array.prototype.slice.call(tr.children).indexOf(td);
    if (ci < 0) return false;
    for (var r = ri + dir; r >= 0 && r < rows.length; r += dir) {
      var tds = rows[r].children;
      if (!tds || ci >= tds.length) continue;
      var t = cellEditableIn(tds[ci]);
      if (t) {
        t.focus();
        try { if (t.select) t.select(); } catch (e) { }
        return true;
      }
    }
    return false;
  }

  // 逐格改动记入 mods（未保存），并高亮该格
  function onCellEdit(e) {
    var el = e.target;
    if (!editMode || !el || !el.dataset) return;
    var isIn = !!(el.classList && el.classList.contains('cellin'));
    var isSel = !!(el.classList && el.classList.contains('stsel') && el.dataset.k);
    if (!isIn && !isSel) return;
    var tr = el.closest ? el.closest('tr') : null;
    if (!tr || !tr.dataset.id) return;
    var id = tr.dataset.id, k = el.dataset.k;
    if (!k) return;
    var it = items.find(function (x) { return String(x.id) === String(id); });
    var ov = it ? val(it, k) : '';
    var orig = String(ov == null ? '' : ov).trim();
    var v = String(el.value == null ? '' : el.value).trim();
    mods[id] = mods[id] || {};
    if (v === orig) delete mods[id][k]; else mods[id][k] = v;
    if (!Object.keys(mods[id]).length) delete mods[id];
    var dirty = !!(mods[id] && mods[id][k] != null);
    if (el.classList) { if (dirty) el.classList.add('dirty'); else el.classList.remove('dirty'); }
    var td = el.closest ? el.closest('td') : null;
    if (td) { if (dirty) td.classList.add('dirty-td'); else td.classList.remove('dirty-td'); }
    // v1.0.203 填了含税单价 / 总金额 → 按税点自动算出不含税
    if (dirty && (k === 'price_tax' || k === 'amount_tax')) {
      var pair = k === 'price_tax' ? 'price_notax' : 'amount_notax';
      var pv = autoNotaxMod(it, id, pair, v);
      fillPairInput(tr, pair, pv);
    }
    syncBar();
  }
  // 统一保存：每条记录只提交自己改动过的字段（各条可以不同）
  async function saveAllEdits() {
    var ids = Object.keys(mods).filter(function (id) { return Object.keys(mods[id]).length; });
    if (!ids.length) { toast('没有改动'); return; }
    var payload = ids.map(function (id) {
      var f = {};
      Object.keys(mods[id]).forEach(function (k) {
        var v = mods[id][k];
        if (k === 'purchase_date' || k === 'warehouse_date' || k === 'due_date') v = normDate(v);
        f[K2DB[k] || k] = v;
      });
      return { id: parseInt(id, 10), fields: f };
    });
    var n = modCount();
    $('rowSaveBtn').disabled = true;
    try {
      var r = await api({ action: 'batchsave', items: payload });
      mods = {}; editMode = false; selId = null;
      toast('已保存 ' + r.updated + ' 条记录、共 ' + (r.cells || n) + ' 处改动');
      await load();
    } catch (e) { toast(e.message, false); $('rowSaveBtn').disabled = false; }
  }
  function cancelEditMode() {
    var n = modCount();
    if (n && !confirm('放弃 ' + n + ' 处未保存的改动？')) return;
    mods = {}; editMode = false;
    render();
    toast(n ? ('已放弃 ' + n + ' 处改动') : '已退出编辑');
  }

  // ---------- 单行动作 ----------
  async function doAdvance() {
    var it = items.find(function (x) { return String(x.id) === String(selId); });
    var nx = it ? nextOrd(it) : '';
    if (!nx) { toast('已是最后阶段', false); return; }
    try {
      await api({ action: 'setfield', id: it.id, field: 'ord_status', value: nx });
      toast('订单状态已推进到「' + nx + '」');
      await load();
    } catch (e) { toast(e.message, false); }
  }
  async function doNextProc(id) {
    var it = items.find(function (x) { return String(x.id) === String(id); });
    if (!it) return;
    var f = flowOf(it), s = stepOf(it);
    if (!f.length) { openProc([it.id]); return; }
    if (s >= f.length) { toast('工序已全部完成', false); return; }
    try {
      await api({ action: 'batchset', ids: [it.id], fields: { process_step: String(s + 1) } });
      toast('工序已推进到「' + f[s] + '」');
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

  // ---------- 批量操作 ----------
  function pickIds() { return Object.keys(picks).filter(function (k) { return picks[k]; }).map(function (k) { return parseInt(k, 10); }); }
  async function batchBoard(to) {
    var ids = pickIds();
    if (!ids.length) return;
    var label = to === 'ordered' ? '生产中' : '库存';
    if (!confirm('把选中的 ' + ids.length + ' 条转为「' + label + '」？')) return;
    try {
      var r = await api({ action: 'batchset', ids: ids, fields: { status: to } });
      toast('已转 ' + r.updated + ' 条到「' + label + '」');
      picks = {};
      await load();
    } catch (e) { toast(e.message, false); }
  }
  async function batchDelete() {
    var ids = pickIds();
    if (!ids.length) return;
    if (!confirm('确认删除选中的 ' + ids.length + ' 条记录？不可恢复。')) return;
    try {
      var r = await api({ action: 'batchdel', ids: ids });
      toast('已删除 ' + r.deleted + ' 条');
      picks = {}; selId = null;
      await load();
    } catch (e) { toast(e.message, false); }
  }
  // （v1.0.197 起批量改值弹窗取消，改为整表逐格编辑）

  // ---------- 工序编辑 ----------
  function openProc(ids) {
    procTargets = ids && ids.length ? ids : pickIds();
    if (!procTargets.length && selId != null) procTargets = [selId];
    if (!procTargets.length) { toast('请先选中要设工序的行', false); return; }
    var first = items.find(function (x) { return String(x.id) === String(procTargets[0]); });
    procChain = first ? flowOf(first).slice() : [];
    $('procTitle').textContent = procTargets.length > 1
      ? ('设置工序链（应用到 ' + procTargets.length + ' 条）')
      : ('设置工序链 · ' + (first && first.code ? first.code : ('#' + procTargets[0])));
    $('procSearch').value = '';
    renderProcLib();
    renderProcChain(first);
    $('procMask').classList.add('show');
  }
  function renderProcLib() {
    var q = String($('procSearch').value || '').trim().toLowerCase();
    $('procLib').innerHTML = procLib.filter(function (p) { return !q || p.toLowerCase().indexOf(q) >= 0; })
      .map(function (p) {
        var on = procChain.indexOf(p) >= 0;
        return '<span data-p="' + esc(p) + '" class="' + (on ? 'on' : '') + '">' + esc(p) + '</span>';
      }).join('') || '<span style="border:none;color:#94a3b8">无匹配工序</span>';
  }
  function renderProcChain(first) {
    $('procChain').innerHTML = procChain.length ? procChain.map(function (p, i) {
      var s = first ? stepOf(first) : 0;
      var isCur = (i + 1) === s;
      return '<div class="ci' + (isCur ? ' cur' : '') + '"><span class="no">' + (i + 1) + '</span><span class="nm">' + esc(p) + (isCur ? ' <span style="color:#1d4ed8;font-size:11px">进行中</span>' : '') + '</span>' +
        '<button data-pc="up" data-i="' + i + '" title="上移">↑</button>' +
        '<button data-pc="down" data-i="' + i + '" title="下移">↓</button>' +
        '<button data-pc="del" data-i="' + i + '" title="移除">✕</button></div>';
    }).join('') : '<div class="none">还没有选工序 —— 从左侧点选，按加工先后顺序排列</div>';
    var sel = $('procCur');
    var cur = first ? stepOf(first) : 0;
    sel.innerHTML = '<option value="0">—（未开始）</option>' + procChain.map(function (p, i) {
      return '<option value="' + (i + 1) + '">' + esc('第' + (i + 1) + '道：' + p) + '</option>';
    }).join('');
    sel.value = String(Math.min(cur, procChain.length) || 0);
    $('procHint').textContent = procChain.length ? ('共 ' + procChain.length + ' 道工序，当前进度 ' + Math.round(Math.min(cur, procChain.length) / procChain.length * 100) + '%') : '';
  }
  async function saveProc(sameContract) {
    if (!procChain.length) { toast('请至少选择一道工序', false); return; }
    var step = parseInt($('procCur').value, 10) || 0;
    if (step < 1) step = 1;
    var ids = procTargets.slice();
    var first = items.find(function (x) { return String(x.id) === String(ids[0]); });
    if (sameContract && first && String(first.contract_no || '').trim()) {
      var ck = String(first.contract_no).trim();
      ids = items.filter(function (x) { return String(x.contract_no || '').trim() === ck; }).map(function (x) { return x.id; });
    }
    try {
      var r = await api({ action: 'batchset', ids: ids, fields: { process_flow: JSON.stringify(procChain), process_step: String(step) } });
      $('procMask').classList.remove('show');
      toast('工序已保存（' + r.updated + ' 条 · ' + procChain.length + ' 道 · 进行到第 ' + step + ' 道）');
      picks = {};
      await load();
    } catch (e) { toast(e.message, false); }
  }
  async function openLib() {
    await loadLib();
    $('libText').value = procLib.join('\n');
    $('libMask').classList.add('show');
  }
  async function saveLib() {
    var arr = $('libText').value.split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
    if (!arr.length) { toast('工序库不能为空', false); return; }
    try {
      await api({ action: 'libset', key: 'processLib', value: arr });
      procLib = arr;
      $('libMask').classList.remove('show');
      toast('工序库已保存（' + arr.length + ' 项）');
    } catch (e) { toast(e.message, false); }
  }

  // ---------- 导入 ----------
  var IMP_COLS = ['purchaseDate', 'warehouseDate', 'warehouse', 'grade', 'surface', 'thickness', 'width', 'length',
    'wOrig', 'wNow', 'wGross', 'count', 'prodStatus', 'code', 'type', 'origin',
    'priceTax', 'priceNotax', 'amountTax', 'amountNotax', 'supplier',
    'contractNo', 'customer', 'follower', 'dueDate', 'note', 'salePrice',
    'processFlow', 'processStep', 'invStatus', 'ordStatus', 'status'];
  var H2F = [
    [/客户名称|客户单位|客户/, 'customer'],
    [/跟单员|跟单人|业务员|负责人/, 'follower'],
    [/预期交期|交货日期|交期|交货期/, 'dueDate'],
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
    [/工序链|工序流程|加工工序/, 'processFlow'],
    [/当前工序|工序进度|加工进度/, 'processStep'],
    [/生产状态|加工状态|生产/, 'prodStatus'],
    [/编号|货号|卷号|流水/, 'code'],
    [/合同号|合同编号|合同/, 'contractNo'],
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
  function mapStatusRaw(v) {
    v = String(v == null ? '' : v).trim();
    if (!v) return {};
    var i = fuzzyIn(v, ENUM_INV);
    if (i) return { invStatus: i, status: 'inventory' };
    var o = fuzzyIn(v, ENUM_ORD);
    if (o) return { ordStatus: o, status: 'ordered' };
    if (v.indexOf('生产') >= 0 || v.indexOf('接单') >= 0 || /ordered/i.test(v)) return { status: 'ordered' };
    if (v.indexOf('库存') >= 0 || /inventory/i.test(v)) return { status: 'inventory' };
    return {};
  }
  function applyStatusMap(it) {
    var sr = mapStatusRaw(it.statusRaw);
    var defBoard = $('impDefStatus').value || 'inventory';
    if (it.invStatus) it.invStatus = fuzzyIn(it.invStatus, ENUM_INV) || '';
    if (it.ordStatus) it.ordStatus = fuzzyIn(it.ordStatus, ENUM_ORD) || '';
    if (sr.invStatus) it.invStatus = it.invStatus || sr.invStatus;
    if (sr.ordStatus) it.ordStatus = it.ordStatus || sr.ordStatus;
    if (it.invStatus && it.ordStatus) it.ordStatus = '';
    if (it.ordStatus) it.status = 'ordered';
    else if (it.invStatus) it.status = 'inventory';
    else it.status = sr.status || defBoard;
    // 工序链：文本 "开平/飞剪" → JSON 数组
    if (it.processFlow && typeof it.processFlow === 'string') {
      var arr = it.processFlow.split(/[→>\-,\/，、|]+/).map(function (s) { return s.trim(); }).filter(function (s) { return s; });
      it.processFlow = arr.length ? JSON.stringify(arr) : '';
      if (!it.processStep && arr.length) it.processStep = '0';
    }
    it.statusRaw = '';
    return it;
  }
  function buildRowsFromAoA(aoa, hasHeader) {
    if (!aoa || !aoa.length) return null;
    var start = hasHeader ? 1 : 0;
    var warn = '';
    var map = {};
    if (hasHeader) {
      var used = {};
      (aoa[0] || []).forEach(function (h, j) {
        var f = fieldOfHeader(h);
        if (f && !used[f]) { used[f] = 1; map[j] = f; }
      });
      if (Object.keys(map).length < 3) { map = {}; hasHeader = false; start = 0; }
    }
    if (!hasHeader) {
      var n = (aoa[0] || []).length;
      if (n > IMP_COLS.length) warn = '检测到 ' + n + ' 列，模板是 ' + IMP_COLS.length + ' 列：多出的列会被忽略。';
      else if (n < IMP_COLS.length) warn = '⚠️ 没有识别到表头，已按「列顺序」导入。当前表只有 ' + n + ' 列，模板是 ' + IMP_COLS.length + ' 列 —— 列数不一致时字段会错位（例如把「类型」的值填进「合同编号」）。建议：勾选「第一行是表头」让系统按列名对应，或先把列补齐。';
      for (var j2 = 0; j2 < IMP_COLS.length; j2++) map[j2] = IMP_COLS[j2];
    }
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
    return out.length ? { rows: out, warn: warn } : null;
  }
  function showPrev(res) {
    impRows = res.rows;
    var rows = res.rows;
    var _notaxN = notaxApply(rows);
    var prev = $('impPrev');
    prev.style.display = 'block';
    var showCols = ['purchaseDate', 'warehouseDate', 'warehouse', 'grade', 'surface', 'thickness', 'width', 'length', 'wOrig', 'wNow', 'count', 'contractNo', 'customer', 'follower', 'dueDate'];
    var heads = ['采购日期', '进仓日期', '仓库/加工厂', '钢种', '表面', '厚度', '宽度', '长度', '原重/KG', '现重/KG', '卷数/张数', '合同编号', '客户名称', '跟单员', '预期交期'];
    var body = rows.slice(0, 5).map(function (it) {
      return '<tr>' + showCols.map(function (c) { return '<td>' + esc(it[c]) + '</td>'; }).join('') +
        '<td>…</td><td>' + esc(boardLabel(it.status)) + '</td><td>' + esc(it.invStatus || '') + '</td><td>' + esc(it.ordStatus || '') + '</td></tr>';
    }).join('');
    prev.innerHTML = '<table><thead><tr>' + heads.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
      '<th>…</th><th>入仓类型</th><th>库存状态</th><th>订单状态</th></tr></thead><tbody>' + body + '</tbody></table>' +
      '<div style="padding:8px 10px;font-size:12px;color:#475569;background:#f8fafc">共解析 <b>' + rows.length + '</b> 条（预览前 5 条，日期自动规范为 YYYY-MM-DD，状态列已按清单归位）</div>';
    var _tip = prev.querySelector('div');
    if (_tip && typeof _notaxN === 'number' && _notaxN > 0) _tip.textContent += ' · 含税价已按 ' + (String(taxRate).trim() === '' ? '0' : taxRate) + '% 税点自动算出不含税 ' + _notaxN + ' 处';
    var w = $('impWarn');
    if (res.warn) { w.innerHTML = res.warn; w.className = 'imp-warn show'; }
    else { w.innerHTML = ''; w.className = 'imp-warn'; }
    $('impGo').disabled = false;
  }
  function openImp() {
    impRows = null;
    $('impFile').value = '';
    $('impPaste').value = '';
    $('impPrev').style.display = 'none';
    $('impPrev').innerHTML = '';
    $('impWarn').className = 'imp-warn';
    $('impGo').disabled = true;
    $('impZone').className = 'imp-zone';
    $('impZone').innerHTML = $('impZone').getAttribute('data-html') || $('impZone').innerHTML;
    $('impDefStatus').value = dataBoard(board);
    var _isIn = board === 'intake';
    if ($('impIntakeTip')) $('impIntakeTip').style.display = _isIn ? '' : 'none';
    if ($('impDefStatus') && $('impDefStatus').closest) {
      var _lb = $('impDefStatus').closest('label');
      if (_lb) _lb.style.display = _isIn ? 'none' : '';
    }
    if ($('impGo')) $('impGo').textContent = _isIn ? '导入到入仓表格' : '确认导入';
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
          (aoa[0] || []).forEach(function (c) { if (fieldOfHeader(c)) hits++; });
          if (hits >= 3) hasHeader = true;
        }
        var res = buildRowsFromAoA(aoa, hasHeader);
        if (!res) { toast('未解析到有效数据行', false); return; }
        res.rows.forEach(function (it) {
          it.purchaseDate = normDate(it.purchaseDate) || todayStr();
          it.warehouseDate = normDate(it.warehouseDate) || todayStr();
          it.dueDate = normDate(it.dueDate);
        });
        $('impZone').className = 'imp-zone has';
        $('impZone').innerHTML = '✅ ' + esc(file.name) + ' · ' + res.rows.length + ' 条';
        showPrev(res);
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
    (aoa[0] || []).forEach(function (c) { if (fieldOfHeader(c)) hits++; });
    var res = buildRowsFromAoA(aoa, hits >= 3);
    if (!res) { toast('未解析到有效数据行', false); return; }
    res.rows.forEach(function (it) {
      it.purchaseDate = normDate(it.purchaseDate) || todayStr();
      it.warehouseDate = normDate(it.warehouseDate) || todayStr();
      it.dueDate = normDate(it.dueDate);
    });
    showPrev(res);
  }
  async function doImport() {
    if (!impRows || !impRows.length) return;
    // v1.0.203 入仓板块：数据先进录入表格（还能补/改），点「一键入仓」才写进库存
    if (board === 'intake') { impToIntake(); $('impMask').classList.remove('show'); return; }
    $('impGo').disabled = true;
    $('impGo').textContent = '导入中…';
    try {
      var payload = impRows.map(function (it) {
        var o = {};
        IMP_COLS.forEach(function (c) { o[c] = it[c]; });
        return o;
      });
      notaxApply(payload);
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

  // ---------- 导出 ----------
  function doExport() {
    var rows = visibleRows();
    var cols = colsCore(board).filter(function (c) { return ['proc', 'bar'].indexOf(c.sp) < 0; });
    var head = cols.map(function (c) { return c.t; }).concat(['入仓类型']).map(function (h) { return '"' + h + '"'; });
    var lines = [head.join(',')];
    rows.forEach(function (it) {
      var arr = cols.map(function (c) {
        if (c.k === 'proc') return procCur(it);
        if (c.k === 'spec') return specOf(it);
        return val(it, c.k);
      }).concat([boardShort(it.status)]);
      lines.push(arr.map(function (c) {
        var s = c == null ? '' : String(c);
        return '"' + s.replace(/"/g, '""') + '"';
      }).join(','));
    });
    var blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '跟单_' + boardShort(board) + '_' + todayStr() + '.csv';
    a.click();
  }

  // ---------- 事件 ----------
  function bind() {
    $('logoutBtn').addEventListener('click', function () { KKAuth.logout(); });
    Array.prototype.forEach.call(document.querySelectorAll('.stat'), function (el) {
      if (!el.dataset.st) return;
      el.addEventListener('click', function () {
        if (editMode) { toast('请先点「保存全部」或「取消编辑」', false); return; }
        board = el.dataset.st || 'inventory';
        if (board === 'intake') initInRows(IN_MIN);
        selId = null;
        colF = {}; sortKey = ''; sortDir = '';
        closeFPanel();
        paintStats(el);
        render();
      });
    });
    $('kw').addEventListener('input', function () { kw = this.value.trim().toLowerCase(); renderTrack(); render(); });
    $('addBtn').addEventListener('click', function () { openEdit(null); });
    // v1.0.199 入仓板块
    if ($('inAddBtn')) $('inAddBtn').addEventListener('click', function () { inAdd(10); });
    if ($('inClearBtn')) $('inClearBtn').addEventListener('click', function () {
      if (!inRows.some(inHas)) { toast('表格本来就是空的'); return; }
      if (!confirm('清空入仓表格里已填的内容？（不会影响库存里的数据）')) return;
      inRows = []; inSeq = 0;
      initInRows(IN_MIN);
      render();
      toast('已清空');
    });
    if ($('inGoBtn')) { $('inGoBtn').textContent = IN_GO_LABEL; $('inGoBtn').addEventListener('click', doIntake); }
    $('tbody').addEventListener('paste', inPaste, true);
    $('tbody').addEventListener('input', function (e) {
      var el = e.target;
      if (!el || !el.dataset || !el.dataset.r || el.dataset.id) return;
      var k = el.dataset.k;
      if (!k) return;
      var row = inRows.filter(function (x) { return String(x._r) === String(el.dataset.r); })[0];
      if (!row) return;
      row[k] = el.value;
      // v1.0.203 含税 → 不含税自动填
      if (k === 'price_tax' || k === 'amount_tax') {
        var _pair = k === 'price_tax' ? 'price_notax' : 'amount_notax';
        var _pv = autoNotaxRow(row, _pair, el.value);
        fillPairInput(el.closest ? el.closest('tr') : null, _pair, _pv);
      }
      var last = inRows[inRows.length - 1];
      if (last && inHas(last) && !filterCount()) inAdd(10);
      renderStats();
      syncBar();
    });
    $('dlgClose').addEventListener('click', function () { $('editMask').classList.remove('show'); });
    $('dlgCancel').addEventListener('click', function () { $('editMask').classList.remove('show'); });
    $('editMask').addEventListener('click', function (e) { if (e.target === this) this.classList.remove('show'); });
    $('dlgSave').addEventListener('click', saveEdit);
    $('dlgProcBtn').addEventListener('click', function () {
      var id = editingId;
      if (!id) { toast('请先保存该记录，再设置工序链', false); return; }
      openProc([id]);
    });
    Array.prototype.forEach.call($('stPick').children, function (b) {
      b.addEventListener('click', function () { editBoard = b.dataset.v; renderStPick(); });
    });
    ['f_priceNotax', 'f_wNow', 'f_wOrig'].forEach(function (id) {
      var el = $(id); if (el) el.addEventListener('blur', autoAmount);
    });
    ['f_priceTax', 'f_amountTax'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('input', autoTaxFill);
      el.addEventListener('blur', autoTaxFill);
    });
    // 单行工具
    $('rowEditBtn').addEventListener('click', startRowEdit);
    $('rowSaveBtn').addEventListener('click', saveAllEdits);
    $('rowCancelBtn').addEventListener('click', cancelEditMode);
    $('rowAdvBtn').addEventListener('click', doAdvance);
    $('rowProcBtn').addEventListener('click', function () { if (selId != null) openProc([selId]); });
    $('rowBackBtn').addEventListener('click', doSwitchBoard);
    $('rowDelBtn').addEventListener('click', doDelete);
    // 我的单 / 工序库
    $('myOnlyBtn').addEventListener('click', function () {
      myOnly = !myOnly;
      if (myOnly && !myName) { toast('没取到你的姓名，请先在用户管理里设置姓名', false); myOnly = false; }
      else toast(myOnly ? ('只看我的单（跟单员 = ' + myName + '）') : '已取消「只看我的单」');
      render();
    });
    $('procLibBtn').addEventListener('click', openLib);
    // 批量
    $('batchProcBtn').addEventListener('click', function () { openProc(pickIds()); });
    $('batchOrdBtn').addEventListener('click', function () { batchBoard('ordered'); });
    $('batchInvBtn').addEventListener('click', function () { batchBoard('inventory'); });
    $('batchDelBtn').addEventListener('click', batchDelete);
    $('batchClearBtn').addEventListener('click', function () { picks = {}; render(); });
    $('batchAllBtn').addEventListener('click', function () {
      visibleRows().forEach(function (r) { picks[r.id] = true; });
      render();
    });
    // 追踪卡
    $('trackCard').addEventListener('click', function (e) {
      var t = e.target.closest('[data-tk]');
      if (!t) return;
      var act = t.dataset.tk;
      if (act === 'close') { trackOpen = false; renderTrack(); return; }
      if (act === 'only') {
        var by = t.dataset.by, v = t.dataset.v;
        colF = {}; colF[by] = { vals: [v], min: '', max: '' };
        render();
        toast('已筛选：' + by + ' = ' + v);
      }
    });
    // 表格：勾选 / 选中 / 工序按钮 / 双击
    $('tbody').addEventListener('click', function (e) {
      var db = e.target.closest('.ddbtn');
      if (db) { e.preventDefault(); e.stopPropagation(); openDD(db); return; }
      var ck = e.target.closest('.rowck');
      if (ck) {
        var id = parseInt(ck.dataset.id, 10);
        if (ck.checked) picks[id] = true; else delete picks[id];
        selId = id;
        render();
        return;
      }
      var pb = e.target.closest('[data-act]');
      if (pb) {
        var act = pb.dataset.act, pid = parseInt(pb.dataset.id, 10);
        if (act === 'nextproc') { doNextProc(pid); return; }
        if (act === 'proc') { selId = pid; openProc([pid]); return; }
      }
      if (editMode) return;
      var tr = e.target.closest('tr');
      if (!tr || !tr.dataset.id) return;
      selId = parseInt(tr.dataset.id, 10);
      render();
    });
    $('thead').addEventListener('click', function (e) {
      if (e.target.id === 'ckAll') return;
      var b = e.target.closest('.fbtn');
      if (!b) return;
      var k = b.dataset.fk;
      if ($('fPanel').classList.contains('show') && $('fPanel').dataset.k === k) { closeFPanel(); return; }
      openFPanel(k, b);
    });
    $('thead').addEventListener('change', function (e) {
      if (e.target.id !== 'ckAll') return;
      var on = e.target.checked;
      visibleRows().forEach(function (r) { if (on) picks[r.id] = true; else delete picks[r.id]; });
      render();
    });
    $('tbody').addEventListener('input', onCellEdit);
    $('tbody').addEventListener('dblclick', function (e) {
      var tr = e.target.closest('tr');
      if (!tr || !tr.dataset.id) return;
      if (editMode) return;
      selId = parseInt(tr.dataset.id, 10);
      startRowEdit();
    });
    $('tbody').addEventListener('change', async function (e) {
      if (editMode && e.target.closest && e.target.closest('select.stsel[data-k]')) { onCellEdit(e); return; }
      var sel = e.target.closest('select[data-act="setf"]');
      if (!sel) return;
      try {
        await api({ action: 'setfield', id: parseInt(sel.dataset.id, 10), field: sel.dataset.f, value: sel.value });
        toast(fieldLabel(sel.dataset.f) + '已更新为「' + (sel.value || '—') + '」');
        await load();
      } catch (err) { toast(err.message, false); await load(); }
    });
    $('tbody').addEventListener('keydown', function (e) {
      var t = e.target;
      var tcls = (t && t.classList) ? t.classList : null;
      var editable = !!tcls && (tcls.contains('cellin') || (tcls.contains('stsel') && t.dataset && t.dataset.k));
      if (e.key === 'Enter' && editable) {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) { saveAllEdits(); return; }
        var dir = e.shiftKey ? -1 : 1;
        if (!moveCellVert(t, dir)) toast(e.shiftKey ? '已经是本列第一行' : '已经是本列最后一行');
        return;
      }
      if (e.key === 'Escape' && editMode) { e.preventDefault(); cancelEditMode(); }
    });
    // 筛选面板
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
    // 工序弹窗
    $('procClose').addEventListener('click', function () { $('procMask').classList.remove('show'); });
    $('procCancel').addEventListener('click', function () { $('procMask').classList.remove('show'); });
    $('procMask').addEventListener('click', function (e) { if (e.target === this) this.classList.remove('show'); });
    $('procSearch').addEventListener('input', renderProcLib);
    $('procLib').addEventListener('click', function (e) {
      var s = e.target.closest('[data-p]');
      if (!s) return;
      var p = s.dataset.p;
      var i = procChain.indexOf(p);
      if (i >= 0) procChain.splice(i, 1);
      else procChain = procChain.concat([p]);
      renderProcLib();
      renderProcChain(items.find(function (x) { return String(x.id) === String(procTargets[0]); }));
    });
    $('procChain').addEventListener('click', function (e) {
      var b = e.target.closest('[data-pc]');
      if (!b) return;
      var i = parseInt(b.dataset.i, 10);
      var act = b.dataset.pc;
      if (act === 'up' && i > 0) { var t = procChain[i - 1]; procChain[i - 1] = procChain[i]; procChain[i] = t; }
      if (act === 'down' && i < procChain.length - 1) { var t2 = procChain[i + 1]; procChain[i + 1] = procChain[i]; procChain[i] = t2; }
      if (act === 'del') procChain.splice(i, 1);
      renderProcChain(items.find(function (x) { return String(x.id) === String(procTargets[0]); }));
    });
    $('procSave').addEventListener('click', function () { saveProc(false); });
    $('procSameBtn').addEventListener('click', function () { saveProc(true); });
    $('procClear').addEventListener('click', function () {
      procChain = [];
      renderProcLib();
      renderProcChain(items.find(function (x) { return String(x.id) === String(procTargets[0]); }));
      toast('已清空工序链，重新从左侧点选');
    });
    // 工序库
    $('libClose').addEventListener('click', function () { $('libMask').classList.remove('show'); });
    $('libCancel').addEventListener('click', function () { $('libMask').classList.remove('show'); });
    $('libMask').addEventListener('click', function (e) { if (e.target === this) this.classList.remove('show'); });
    $('libSave').addEventListener('click', saveLib);
    // v1.0.198 下拉面板
    $('ddPanel').addEventListener('click', function (e) {
      var it = e.target.closest('.dditem');
      if (it && it.dataset.v !== undefined && !it.classList.contains('ddempty')) { ddApply(it.dataset.v); return; }
      var a = e.target.closest('[data-dd-act]');
      if (!a) return;
      if (a.dataset.ddAct === 'clear') { if (ddTarget) { ddTarget.value = ''; ddTarget.dispatchEvent(new Event('input', { bubbles: true })); } closeDD(); }
      if (a.dataset.ddAct === 'dict') { closeDD(); openDict(); }
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#ddPanel') && !e.target.closest('.ddbtn')) closeDD();
    });
    // v1.0.198 词典弹窗
    $('dictBtn').addEventListener('click', openDict);
    $('dictClose').addEventListener('click', function () { $('dictMask').classList.remove('show'); });
    $('dictCancel').addEventListener('click', function () { $('dictMask').classList.remove('show'); });
    $('dictMask').addEventListener('click', function (e) { if (e.target === this) this.classList.remove('show'); });
    $('dictSide').addEventListener('click', function (e) {
      var c = e.target.closest('.dict-cat');
      if (!c) return;
      readDictText();
      dictCat = c.dataset.cat;
      dictCatKind = c.dataset.kind;
      renderDictSide();
      fillDictText();
    });
    $('dictText').addEventListener('input', function () {
      var n = this.value.split('\n').map(function (x) { return x.trim(); }).filter(function (x) { return x; }).length;
      $('dictCount').textContent = n + ' 个候选值（一行一个）';
    });
    $('dictDedup').addEventListener('click', function () {
      var arr = readDictText();
      var uniq = [];
      arr.forEach(function (v) { if (uniq.indexOf(v) < 0) uniq.push(v); });
      if (dictCatKind === 'col') dictAll.cols[dictCat] = uniq; else dictAll.extra[dictCat] = uniq;
      fillDictText();
      toast('已去重：' + arr.length + ' → ' + uniq.length);
    });
    $('dictSort').addEventListener('click', function () {
      var arr = readDictText().slice().sort(function (a, b) { return String(a).localeCompare(String(b), 'zh-CN'); });
      if (dictCatKind === 'col') dictAll.cols[dictCat] = arr; else dictAll.extra[dictCat] = arr;
      fillDictText();
    });
    $('dictRestore').addEventListener('click', function () {
      if (!dictDef) { toast('默认词典未加载', false); return; }
      if (!confirm('把「' + (dictCatKind === 'col' ? (dictLabel[dictCat] || dictCat) : dictCat) + '」恢复成系统默认值？')) return;
      var d = dictCatKind === 'col' ? dictDef.cols[dictCat] : dictDef.extra[dictCat];
      $('dictText').value = (d || []).join('\n');
      $('dictCount').textContent = (d || []).length + ' 个候选值（一行一个）';
      toast('已填入默认值，点「保存词典」生效');
    });
    $('dictResetAll').addEventListener('click', function () {
      if (!dictDef) { toast('默认词典未加载', false); return; }
      if (!confirm('把整个词典恢复成系统默认（含你自己加的值会丢）？')) return;
      dictAll = { cols: JSON.parse(JSON.stringify(dictDef.cols)), extra: JSON.parse(JSON.stringify(dictDef.extra)) };
      renderDictSide();
      fillDictText();
      toast('已填入全部默认值，点「保存词典」生效');
    });
    $('dictSave').addEventListener('click', saveDict);
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
    initTax();
  }
  function paintStats(active) {
    Array.prototype.forEach.call(document.querySelectorAll('.stat'), function (x) {
      var st = x.dataset.st;
      x.className = 'stat' + (x === active ? ' active' : '') + (st === 'intake' ? ' st-intake' : st === 'inventory' ? ' st-inv' : st === 'ordered' ? ' st-ord' : st === 'progress' ? ' st-pg' : '');
    });
  }

  // ---------- 启动 ----------
  (async function init() {
    bind();
    var auth = await KKAuth.requireLogin();
    if (!auth) return;
    myName = String(auth.realName || auth.username || '').trim();
    $('curUser').textContent = '当前：' + myName + (auth.realName ? '' : '（未设姓名，跟单员请填真实姓名）');
    await loadLib();
    await loadDict();
    await load();
  })();
})();
