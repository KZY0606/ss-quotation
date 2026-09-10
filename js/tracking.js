// tracking.js — KK 不锈钢跟单系统（v1.0.196）
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
  var editingId = null;     // 弹窗编辑的记录 id（null = 新增）
  var editBoard = 'inventory';
  var impRows = null;
  var myOnly = false;       // 只看我的单
  var myName = '';          // 当前用户姓名（跟单员比对用）
  var procLib = [];         // 工序库
  var procTargets = [];     // 工序弹窗作用的目标行 id
  var procChain = [];       // 工序弹窗里正在编辑的链
  var trackOpen = true;     // 追踪卡显示开关

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
  function dataBoard(b) { return b === 'progress' ? 'ordered' : b; }
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
    return b === 'progress' ? '📊 生产进度' : (b === 'ordered' ? '🏭 生产中' : '📦 库存');
  }
  function boardShort(b) {
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
    fill('dl_customer', uniq('customer'));
    fill('dl_follower', uniq('follower'));
  }

  function renderStats() {
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

  function renderThead() {
    var cols = colsOf(board);
    $('thead').innerHTML = '<tr>' + cols.map(function (c) {
      if (c.ck) return '<th class="th-ck"><div class="th-in"><input type="checkbox" class="ckb" id="ckAll" title="全选本页"></div></th>';
      var cls = c.st ? 'th-st' : (c.num ? 'num-r' : '');
      return '<th class="' + cls + '" data-k="' + c.k + '"><div class="th-in"><span>' + esc(c.t) + '</span>' +
        '<button class="fbtn' + (fActive(c.k) ? ' on' : '') + '" data-fk="' + c.k + '" title="筛选 / 排序">▼</button></div></th>';
    }).join('') + '</tr>';
    var t = document.querySelector('table.tk');
    if (t) t.style.minWidth = cols.length > 18 ? (cols.length * 108) + 'px' : '';
    var ca = $('ckAll');
    if (ca) ca.checked = false;
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

  function cellHtml(it, c, inline) {
    if (c.ck) return '<td class="ck"><input type="checkbox" class="ckb rowck" data-id="' + it.id + '"' + (picks[it.id] ? ' checked' : '') + '></td>';
    if (c.st) return '<td>' + stSelect(it, c, inline) + '</td>';
    if (c.sp === 'proc') return inline ? '<td>' + esc(procCur(it) || '—') + '</td>' : procCell(it);
    if (c.sp === 'bar') return '<td>' + (inline ? esc(String(procPct(it) == null ? '' : procPct(it) + '%')) : barCell(it).replace(/^<td>|<\/td>$/g, '')) + '</td>';
    if (c.sp === 'due') return inline ? '<td><input class="cellin" data-k="due_date" value="' + esc(it.due_date || '') + '"></td>' : dueCell(it);
    if (c.sp === 'spec') return '<td>' + esc(specOf(it)) + '</td>';
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
    renderTrack();
    var rows = visibleRows();
    var tb = $('tbody');
    var cols = colsOf(board);
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="' + cols.length + '" class="empty">' +
        (boardRowsOf(board).length ? '当前筛选 / 搜索无匹配' : (board === 'progress' ? '生产进度板块显示「生产中」的货，先到生产中板块录入或转过来' : '该板块暂无数据，点「＋ 入仓」或「📥 导入 Excel/CSV」开始')) + '</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(function (it) {
      var inline = String(it.id) === String(editId);
      var tds = cols.map(function (c) { return cellHtml(it, c, inline); }).join('');
      var cls = (String(it.id) === String(selId) ? 'sel ' : '') + (inline ? 'editing ' : '') + (picks[it.id] ? 'picked' : '');
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
    var editing = editId != null;
    $('rowEditBtn').style.display = editing ? 'none' : '';
    $('rowSaveBtn').style.display = editing ? '' : 'none';
    $('rowCancelBtn').style.display = editing ? '' : 'none';
    $('rowEditBtn').disabled = !sel || editing;
    $('rowAdvBtn').style.display = (board === 'ordered' && !editing) ? '' : 'none';
    $('rowAdvBtn').disabled = !sel || editing || !(sel && nextOrd(sel));
    $('rowProcBtn').style.display = ((board === 'ordered' || board === 'progress') && !editing) ? '' : 'none';
    $('rowProcBtn').disabled = !sel || editing;
    $('rowBackBtn').disabled = !sel || editing;
    $('rowDelBtn').disabled = !sel || editing;
    $('rowBackBtn').textContent = (board === 'inventory') ? '转生产中' : '转库存';
    $('myOnlyBtn').className = 'btn sm' + (myOnly ? ' on' : '');
    var f = filterCount();
    $('selHint').textContent = editing ? ('正在编辑 #' + editId + '，改完整行后点保存')
      : sel ? ('已选中 #' + sel.id + (sel.code ? ' · ' + sel.code : ''))
        : (f ? ('筛选中：' + f + ' 列') : '未选中行');
    // 批量条
    var pids = Object.keys(picks).filter(function (k) { return picks[k]; });
    $('batchCnt').textContent = '已选 ' + pids.length + ' 条';
    $('batchBar').className = 'batch' + (pids.length ? ' show' : '');
    $('batchOrdBtn').disabled = !pids.length;
    $('batchInvBtn').disabled = !pids.length;
    $('batchDelBtn').disabled = !pids.length;
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
  function uniqueVals(k) {
    var s = [];
    boardRowsOf(board).forEach(function (it) {
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
    Object.keys(it).forEach(function (k) {
      if (['id', 'status_log', 'created_at', 'updated_at', 'created_by'].indexOf(k) >= 0) return;
      if (k === 'status' || k === 'inv_status' || k === 'ord_status') return;
      send[k] = it[k];
    });
    if (it.status === 'inventory') { send.contractNo = ''; send.note = ''; send.salePrice = ''; }
    var changed = 0;
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
    send.dueDate = normDate(send.due_date || '');
    if (!changed) { toast('没有改动'); editId = null; render(); return; }
    try {
      await api({ action: 'save', item: send });
      editId = null;
      toast('已保存');
      await load();
    } catch (e) { toast(e.message, false); }
  }
  function cancelRowEdit() { editId = null; render(); toast('已取消编辑'); }

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
  var BATCH_FIELDS = [
    { c: 'customer', t: '客户名称' },
    { c: 'follower', t: '跟单员' },
    { c: 'due_date', t: '预期交期' },
    { c: 'contract_no', t: '合同编号' },
    { c: 'warehouse', t: '仓库/加工厂' },
    { c: 'prod_status', t: '生产状态' },
    { c: 'origin', t: '产地' },
    { c: 'supplier', t: '供应商' },
    { c: 'note', t: '备注' },
    { c: 'ord_status', t: '订单状态', opts: ENUM_ORD },
    { c: 'inv_status', t: '库存状态', opts: ENUM_INV },
    { c: 'status', t: '所属板块', opts: [{ v: 'inventory', t: '库存' }, { v: 'ordered', t: '生产中' }] }
  ];
  function openBatchEdit() {
    var ids = pickIds();
    if (!ids.length) return;
    $('batchNote').innerHTML = '正在批量编辑 <b>' + ids.length + '</b> 条记录。勾选要改的字段并填值，<b>未勾选的字段保持原值不变</b>。状态类字段（订单状态/库存状态/板块）的改动会记录时间与操作账号。';
    $('batchFields').innerHTML = BATCH_FIELDS.map(function (f, i) {
      var inp = f.opts
        ? '<select id="bf_' + f.c + '" disabled><option value="">（不修改）</option>' + f.opts.map(function (o) {
          var v = (typeof o === 'string') ? o : o.v, t = (typeof o === 'string') ? o : o.t;
          return '<option value="' + esc(v) + '">' + esc(t) + '</option>';
        }).join('') + '</select>'
        : '<input id="bf_' + f.c + '" disabled placeholder="填写新值">';
      return '<div class="bf"><input type="checkbox" class="ckb" data-bf="' + f.c + '"><label>' + esc(f.t) + '</label>' + inp + '</div>';
    }).join('');
    $('batchMask').classList.add('show');
  }
  async function saveBatchEdit() {
    var ids = pickIds();
    if (!ids.length) return;
    var fields = {};
    Array.prototype.forEach.call($('batchFields').querySelectorAll('input[data-bf]'), function (cb) {
      if (!cb.checked) return;
      var c = cb.dataset.bf;
      var el = $('bf_' + c);
      if (!el) return;
      var v = String(el.value || '').trim();
      if (v === '') return;
      fields[c] = (c === 'due_date') ? normDate(v) : v;
    });
    var cols = Object.keys(fields);
    if (!cols.length) { toast('请勾选要修改的字段并填写新值', false); return; }
    try {
      var r = await api({ action: 'batchset', ids: ids, fields: fields });
      $('batchMask').classList.remove('show');
      toast('已批量更新 ' + r.updated + ' 条（字段：' + cols.join('、') + '）');
      picks = {};
      await load();
    } catch (e) { toast(e.message, false); }
  }

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
          it.purchaseDate = normDate(it.purchaseDate);
          it.warehouseDate = normDate(it.warehouseDate);
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
      it.purchaseDate = normDate(it.purchaseDate);
      it.warehouseDate = normDate(it.warehouseDate);
      it.dueDate = normDate(it.dueDate);
    });
    showPrev(res);
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
        if (editId != null) { toast('请先保存或取消整行编辑', false); return; }
        board = el.dataset.st || 'inventory';
        selId = null;
        colF = {}; sortKey = ''; sortDir = '';
        closeFPanel();
        paintStats(el);
        render();
      });
    });
    $('kw').addEventListener('input', function () { kw = this.value.trim().toLowerCase(); renderTrack(); render(); });
    $('addBtn').addEventListener('click', function () { openEdit(null); });
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
    // 单行工具
    $('rowEditBtn').addEventListener('click', startRowEdit);
    $('rowSaveBtn').addEventListener('click', saveRowEdit);
    $('rowCancelBtn').addEventListener('click', cancelRowEdit);
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
    $('batchEditBtn').addEventListener('click', openBatchEdit);
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
      if (editId != null) return;
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
    $('tbody').addEventListener('dblclick', function (e) {
      var tr = e.target.closest('tr');
      if (!tr || !tr.dataset.id) return;
      if (editId != null) return;
      selId = parseInt(tr.dataset.id, 10);
      startRowEdit();
    });
    $('tbody').addEventListener('change', async function (e) {
      var sel = e.target.closest('select[data-act="setf"]');
      if (!sel) return;
      try {
        await api({ action: 'setfield', id: parseInt(sel.dataset.id, 10), field: sel.dataset.f, value: sel.value });
        toast(fieldLabel(sel.dataset.f) + '已更新为「' + (sel.value || '—') + '」');
        await load();
      } catch (err) { toast(err.message, false); await load(); }
    });
    $('tbody').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('cellin')) { e.preventDefault(); saveRowEdit(); }
      if (e.key === 'Escape' && e.target.classList && e.target.classList.contains('cellin')) { e.preventDefault(); cancelRowEdit(); }
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
    // 批量编辑
    $('batchClose').addEventListener('click', function () { $('batchMask').classList.remove('show'); });
    $('batchCancel').addEventListener('click', function () { $('batchMask').classList.remove('show'); });
    $('batchMask').addEventListener('click', function (e) { if (e.target === this) this.classList.remove('show'); });
    $('batchFields').addEventListener('change', function (e) {
      var cb = e.target.closest('input[data-bf]');
      if (!cb) return;
      var el = $('bf_' + cb.dataset.bf);
      if (el) el.disabled = !cb.checked;
    });
    $('batchSave').addEventListener('click', saveBatchEdit);
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
  function paintStats(active) {
    Array.prototype.forEach.call(document.querySelectorAll('.stat'), function (x) {
      var st = x.dataset.st;
      x.className = 'stat' + (x === active ? ' active' : '') + (st === 'inventory' ? ' st-inv' : st === 'ordered' ? ' st-ord' : st === 'progress' ? ' st-pg' : '');
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
    await load();
  })();
})();
