// trackingTable — 不锈钢跟单系统数据接口（v1.0.196）
// 表：tracking_items（PG）/ tracking_lib（工序库等字典）
// action: list / save / delete / import / setfield / batchset / batchsave / batchdel / libget / libset / dictget / dictset —— 均需登录
// v1.0.194：入仓字段按业务清单扩展（原重/现重/毛重 KG、单价含税/不含税、总金额含税/不含税、负差、实卡厚）
// v1.0.195：save 更新时对 status / inv_status / ord_status 逐一比对留痕；import 状态列归位保底
// v1.0.196：① 新增 客户名称 customer / 跟单员 follower / 预期交期 due_date / 工序链 process_flow / 当前工序 process_step
//           ② 「已接单」改名「生产中」（status 值仍为 ordered）；新增「生产进度」视图（同一批数据的精简列）
//           ③ 批量接口 batchset / batchdel；工序库字典接口 libget / libset（存 tracking_lib）
// v1.0.217：① 新增「采购清单」板块（status = purchase，排在入仓前：Sheet1 需求录入 / Sheet2 采购清单）
//           ② 新增采购字段 pur_status(未买/已买) / pur_buyer(采购员) / pur_date(采购完成日期)，pur_status 变更留痕
//           ③ list 支持 status=purchase 过滤；layoutsave 宽表白名单加 purchase
// v1.0.221：税点全公司统一——libset 支持非数组值（tracking_lib ▸ taxRate 存数字），前端读写同一份统一税点
const CloudBase = require('@cloudbase/manager-node');
const app = CloudBase.init({ envId: process.env.TCB_ENV_ID || 'kk-quotation-d2gtggelpcd901498' });
const database = app.database;

function q(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}

async function exec(Sql) {
  return await database.executePGSql({ Sql });
}

// 业务字段（DB 列名）+ 允许的入参别名（兼容驼峰/下划线/短名）
const ALIAS = {
  purchase_date: ['purchaseDate', 'purchase_date'],
  warehouse_date: ['warehouseDate', 'warehouse_date'],
  warehouse: ['warehouse'],
  grade: ['grade'],
  surface: ['surface'],
  film_status: ['filmStatus', 'film_status'],
  thickness: ['thickness'],
  width: ['width'],
  length: ['length'],
  count: ['count'],
  prod_status: ['prodStatus', 'prod_status'],
  code: ['code'],
  contract_no: ['contractNo', 'contract_no'],
  note: ['note'],
  type: ['type'],
  origin: ['origin'],
  supplier: ['supplier'],
  weight: ['weight'],
  orig_weight: ['origWeight', 'orig_weight'],
  weight_orig: ['wOrig', 'w_orig', 'weightOrig', 'weight_orig'],
  weight_now: ['wNow', 'w_now', 'weightNow', 'weight_now'],
  weight_gross: ['wGross', 'w_gross', 'weightGross', 'weight_gross'],
  unit_price: ['unitPrice', 'unit_price'],
  total_amount: ['totalAmount', 'total_amount'],
  price_tax: ['priceTax', 'price_tax'],
  price_notax: ['priceNotax', 'price_notax'],
  amount_tax: ['amountTax', 'amount_tax'],
  amount_notax: ['amountNotax', 'amount_notax'],
  negative_diff: ['negativeDiff', 'negative_diff'],
  real_thickness: ['realThickness', 'real_thickness'],
  sale_price: ['salePrice', 'sale_price'],
  inv_status: ['invStatus', 'inv_status'],
  ord_status: ['ordStatus', 'ord_status'],
  // v1.0.196 生产进度相关
  // v1.0.217 采购清单
  pur_status: ['purStatus', 'pur_status'],
  pur_buyer: ['purBuyer', 'pur_buyer'],
  pur_date: ['purDate', 'pur_date'],
  customer: ['customer', 'custName'],
  follower: ['follower', 'salesman', 'owner'],
  due_date: ['dueDate', 'due_date'],
  process_flow: ['processFlow', 'process_flow'],
  process_step: ['processStep', 'process_step'],
  // v1.0.208 custom columns (user-defined; up to 12 slots)
  c1: ['c1'], c2: ['c2'], c3: ['c3'], c4: ['c4'], c5: ['c5'], c6: ['c6'],
  c7: ['c7'], c8: ['c8'], c9: ['c9'], c10: ['c10'], c11: ['c11'], c12: ['c12']
};
const MAXLEN = { note: 1000, process_flow: 4000, customer: 200, follower: 100, due_date: 40, film_status: 100,
  c1: 500, c2: 500, c3: 500, c4: 500, c5: 500, c6: 500, c7: 500, c8: 500, c9: 500, c10: 500, c11: 500, c12: 500 };

// 状态枚举
const ENUM_STATUS = ['inventory', 'ordered', 'purchase'];      // 板块归属（ordered = 生产中 / 生产进度；purchase = 采购清单）
const ENUM_INV = ['在库', '已预订', '部分出库', '已售出'];      // 库存板块状态列
const ENUM_ORD = ['采购下单', '原料到仓', '投入生产', '加工完成', '发货自提', '已交付']; // 订单状态列
// v1.0.217 采购状态：一目了然的二元状态
const ENUM_PUR = ['未买', '已买'];
const STATUS_FIELDS = { status: ENUM_STATUS, inv_status: ENUM_INV, ord_status: ENUM_ORD, pur_status: ENUM_PUR };
// batchset 允许的额外列（不在 ALIAS 映射里的系统列）
const EXTRA_COLS = ['status'];

// 默认工序库（图1 清单，可在界面增删）
const DEFAULT_PROCESS = ['开平', '飞剪', '纵剪/分条', '修边', '整平/矫平', '剪板', '激光切割', '冲孔', '折弯', '焊接',
  '酸洗', '退火酸洗', '普通磨砂', '雪花砂', '短丝', '长丝', '拉丝', '油磨', '干磨', '水磨', '缎纹', '乱纹/和纹',
  '8K镜面', '喷砂', '压花', '蚀刻', 'PVD镀色', '仿古铜', '做旧', '抗指纹', '覆膜', '贴膜', '撕膜',
  '检验', '包装', '装车', '运输', '客户签收', '返工'];

// v1.0.198 基础数据词典（单元格下拉筛选值；来源：用户《订单加工流转管理表》⑤基础数据字典）
const DEFAULT_DICT = {
  cols: {
    grade: ["201","201 J1","201 J2","201 J3","201 J4","201 J5","202","301","304","304L","304H","316","316L","309S","310S","321","409L","410","410S","420","430","430J1L","439","441","444","2205双相钢","2507双相钢"],
    surface: ["NO.1/热轧","2D","2B","BA","2BA","NO.3","NO.4","HL拉丝","短丝","长丝","普通砂","雪花砂","油磨","干磨","水磨","缎纹","乱纹/和纹","8K镜面","超精磨镜面","喷砂","珠光砂","蚀刻","压花","水波纹","亚麻纹","丝绸纹","锤纹","菱形纹","方格纹","木纹","PVD钛金","玫瑰金","黑钛","香槟金","青铜","红铜","仿古铜","做旧铜","彩色镀钛","纳米色油","抗指纹","无指纹","覆膜","褪色板","防滑面","客户定制","BA+PAPER+PRINT","2B+PAPER","压延表面"],
    origin: ["宏旺","北港新材料","诚德","青山","德龙","甬金","张浦","太钢","宝钢德盛","酒钢","东方特钢","广青","瑞钢","上克","联众","鞍钢联众","鼎信","鑫峰","金汇","华乐","江苏甬金","福建甬金","广东甬金","甘肃甬金","海外进口","客户指定","其他"],
    warehouse: ["自有仓库","供应商仓","开平厂","分条厂","磨砂厂","表面厂","物流仓","客户寄存","在途","其他"],
    follower: ["本人","业务员A","业务员B","业务员C"],
    type: ["正品","次品","混包","其他"],
    prod_status: ["库存","生产中"],
    pur_status: ["未买","已买"],
    pur_buyer: [],
    inv_status: ["在库","已预订","部分出库","已售出","可销售","已锁货","加工中","在途","待检验","待处理","不可售","已出库"],
    ord_status: ["采购下单","原料到仓","投入生产","加工完成","发货自提","已交付","待确认","已确认","备料中","加工中","待交货","部分交货","已完成","已取消","暂停","异常"],
    film_status: ["不贴膜","普通蓝膜","普通黑白膜","激光膜","激光双层膜","透明膜","PVC膜","PE膜","进口膜","客户指定","5C膜","7C膜","鱼头膜","Novacel","5C激光膜","7C激光膜","深冲膜","低粘膜","中粘膜","高粘膜"],
    customer: [],
    supplier: [],
  },
  extra: {
    "货物形态": ["整卷","分卷","窄带卷","毛边卷","切边卷","平板","定尺板","花纹板","中厚板","管材","型材","余料","边料"],
    "保护膜": ["不贴膜","普通蓝膜","普通黑白膜","激光膜","激光双层膜","透明膜","PVC膜","PE膜","进口膜","客户指定","5C膜","7C膜","鱼头膜","Novacel","5C激光膜","7C激光膜","深冲膜","低粘膜","中粘膜","高粘膜"],
    "边部": ["毛边","切边","修边","圆边","倒角","去毛刺"],
    "单位": ["吨","kg","卷","张","条","件","平方米","米"],
    "当前环节": ["待采购","采购中","待提货","运输中","到仓","待开平","开平中","待分条","分条中","待表面加工","表面加工中","待贴膜","贴膜中","待包装","包装中","待质检","待发货","配送中","已交货","异常处理","暂停"],
    "交货状态": ["未交货","部分交货","已交货","退货中","已退货"],
    "回款状态": ["未收款","已收定金","部分回款","已结清","逾期","坏账风险"],
    "开票状态": ["未开票","待开票","部分开票","已开票","不开票","红冲中"],
    "加工工序": ["采购","提货","入仓","开平","飞剪","纵剪","分条","修边","整平","矫平","剪板","激光切割","冲孔","折弯","焊接","酸洗","退火酸洗","普通磨砂","雪花砂","短丝","长丝","拉丝","油磨","干磨","水磨","缎纹","乱纹/和纹","8K镜面","喷砂","压花","蚀刻","PVD镀色","仿古铜","做旧","抗指纹","覆膜","贴膜","撕膜","检验","包装","装车","运输","客户签收","返工","其他"],
    "流程状态": ["待安排","待提货","已送厂","排队中","加工中","待检验","待转厂","已完成","暂停","异常","返工中","已取消"],
    "质量结果": ["未检验","合格","让步接收","待确认","轻微异常","不合格","返工合格","报废"],
    "物流方式": ["自提","本公司车","厂家送货","外请货车","物流专线","客户车","快递","其他"],
    "库存类型": ["原料整卷","分卷","窄带","成品平板","半成品","余料","边料","头尾料","待处理料","客户寄存料"],
    "流转方向": ["入库","出库","转厂","调拨","退回","盘盈","盘亏","报废"],
    "是否": ["是","否"],
    "厂家类型": ["钢厂/代理","仓库","开平厂","分条厂","磨砂厂","表面加工厂","镀色厂","压花厂","蚀刻厂","激光厂","剪折弯厂","贴膜厂","包装厂","物流公司","综合加工厂","其他"],
    "计价方式": ["元/吨","元/kg","元/张","元/条","元/件","元/平方米","元/米","一口价"],
    "结算方式": ["现款现货","月结","周结","到付","预付","货到付款","定金+尾款","其他"],
    "合作状态": ["长期合作","正常合作","试单","暂停合作","黑名单","待考察"],
    "质量评级": ["A优秀","B良好","C一般","D需改善","未评级"],
    "报价含税口径": ["含税","不含税"],
    "常用税点": ["0","0.01","0.03","0.06","0.08","0.09","0.13"],
    "约定账期天数": ["0","7","15","30","45","60","90","120"],
    "剩余款回款节点": ["定金","货到付款","月结尾款","其他约定"],
    "账期起算方式": ["基准日后N天","基准日月末后N天"],
    "提前提醒天数": ["7","打开表格重算时更新"],
    "金额核对容差": ["0.01","元，避免分币误差"],
  }
};
const DICT_LABEL = { grade: '钢种', surface: '表面', film_status: '保护膜', origin: '产地', warehouse: '仓库/加工厂', follower: '跟单员', type: '类型', prod_status: '生产状态', inv_status: '库存状态', ord_status: '订单状态', pur_status: '采购状态', pur_buyer: '采购员', customer: '客户名称', supplier: '供应商' };

async function ensureTables() {
  await exec(`CREATE TABLE IF NOT EXISTS tracking_items (
    id SERIAL PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'inventory',
    purchase_date TEXT DEFAULT '', warehouse_date TEXT DEFAULT '', warehouse TEXT DEFAULT '',
    grade TEXT DEFAULT '', surface TEXT DEFAULT '', thickness TEXT DEFAULT '', width TEXT DEFAULT '', length TEXT DEFAULT '',
    weight TEXT DEFAULT '', count TEXT DEFAULT '', orig_weight TEXT DEFAULT '',
    prod_status TEXT DEFAULT '', code TEXT DEFAULT '', contract_no TEXT DEFAULT '', note TEXT DEFAULT '',
    type TEXT DEFAULT '', origin TEXT DEFAULT '',
    total_amount TEXT DEFAULT '', unit_price TEXT DEFAULT '', supplier TEXT DEFAULT '', sale_price TEXT DEFAULT '',
    created_by TEXT DEFAULT '', created_at TIMESTAMP DEFAULT now(), updated_at TIMESTAMP DEFAULT now()
  )`);
  // v1.0.193 货物状态变更轨迹：[{at, action, field, from, to, by}]
  await exec("ALTER TABLE tracking_items ADD COLUMN IF NOT EXISTS status_log TEXT DEFAULT '[]'");
  // v1.0.194 入仓扩展字段（KG 三重量 / 含税不含税价 / 负差 / 实卡厚 / 两板块状态列）
  for (const c of ['weight_orig', 'weight_now', 'weight_gross', 'price_tax', 'price_notax',
    'amount_tax', 'amount_notax', 'negative_diff', 'real_thickness', 'inv_status', 'ord_status']) {
    await exec(`ALTER TABLE tracking_items ADD COLUMN IF NOT EXISTS ${c} TEXT DEFAULT ''`);
  }
  // v1.0.196 生产进度字段（客户 / 跟单员 / 预期交期 / 工序链 / 当前工序）
  for (const c of ['customer', 'follower', 'due_date', 'process_flow', 'process_step']) {
    await exec(`ALTER TABLE tracking_items ADD COLUMN IF NOT EXISTS ${c} TEXT DEFAULT ''`);
  }
  // v1.0.206 保护膜列
  await exec("ALTER TABLE tracking_items ADD COLUMN IF NOT EXISTS film_status TEXT DEFAULT ''");
  // v1.0.217 采购清单（采购状态 / 采购员 / 采购完成日期）
  for (const c of ['pur_status', 'pur_buyer', 'pur_date']) {
    await exec(`ALTER TABLE tracking_items ADD COLUMN IF NOT EXISTS ${c} TEXT DEFAULT ''`);
  }
  // v1.0.208 custom column slots (c1..c12) - created up front so adding a column needs no schema change
  for (let i = 1; i <= 12; i++) {
    await exec(`ALTER TABLE tracking_items ADD COLUMN IF NOT EXISTS c${i} TEXT DEFAULT ''`);
  }
  await exec('CREATE INDEX IF NOT EXISTS idx_tracking_status ON tracking_items (status)');
  await exec('CREATE INDEX IF NOT EXISTS idx_tracking_code ON tracking_items (code)');
  await exec('CREATE INDEX IF NOT EXISTS idx_tracking_contract ON tracking_items (contract_no)');
  await exec('CREATE INDEX IF NOT EXISTS idx_tracking_follower ON tracking_items (follower)');
  // 字典表（工序库等）：k = 字典键，v = JSON 字符串
  await exec("CREATE TABLE IF NOT EXISTS tracking_lib (k TEXT PRIMARY KEY, v TEXT DEFAULT '', updated_at TIMESTAMP DEFAULT now())");
}

function parseEvt(ev) {
  if (ev && ev.body) { try { return JSON.parse(ev.body); } catch (e) {} }
  return ev || {};
}

async function checkToken(token) {
  if (!token) return null;
  const res = await exec('SELECT t.token, t.username, t.role, t.expires_at, u.enabled, u.real_name FROM tokens t LEFT JOIN users u ON t.username = u.username WHERE t.token=' + q(token) + ' LIMIT 1');
  if (!res.Rows || !res.Rows.length) return null;
  const row = JSON.parse(res.Rows[0]);
  const item = {};
  res.Columns.forEach((c, i) => { item[c] = row[i]; });
  if (new Date(item.expires_at) < new Date()) {
    await exec('DELETE FROM tokens WHERE token=' + q(token));
    return null;
  }
  if (String(item.enabled) !== 'true') return null;
  return item;
}

function rowToItem(res, i) {
  const row = JSON.parse(res.Rows[i]);
  const item = {};
  res.Columns.forEach((c, j) => { item[c] = row[j]; });
  return item;
}

function cleanStr(v, maxLen) {
  let s = (v === null || v === undefined) ? '' : String(v).trim();
  if (maxLen && s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

function validStatus(v) { return (v === 'ordered' || v === 'purchase') ? v : 'inventory'; }

// 把前端传入的 item 归一化成 DB 行（未传字段 → 空串）
function buildRow(it) {
  const row = {};
  const pick = (names) => {
    for (const nm of names) { if (it[nm] !== undefined && it[nm] !== null && String(it[nm]).trim() !== '') return it[nm]; }
    return '';
  };
  for (const col of Object.keys(ALIAS)) {
    if (col === 'inv_status' || col === 'ord_status') { row[col] = cleanStr(pick(ALIAS[col])); continue; }
    row[col] = cleanStr(pick(ALIAS[col]), MAXLEN[col]);
  }
  // 状态列只在值合法时保留，避免脏值
  if (row.inv_status && ENUM_INV.indexOf(row.inv_status) < 0) row.inv_status = '';
  if (row.ord_status && ENUM_ORD.indexOf(row.ord_status) < 0) row.ord_status = '';
  // v1.0.217 采购状态：空 → 未买（采购清单默认就是"还没买"）
  if (row.pur_status && ENUM_PUR.indexOf(row.pur_status) < 0) row.pur_status = '';
  if (row.status === 'purchase' && !row.pur_status) row.pur_status = '未买';
  return row;
}

function sqlInsert(row, username, initLog) {
  const cols = Object.keys(row), vals = cols.map(c => q(row[c]));
  cols.push('created_by'); vals.push(q(username));
  cols.push('status_log'); vals.push(q(initLog));
  return `INSERT INTO tracking_items (${cols.join(', ')}) VALUES (${vals.join(', ')})`;
}
function sqlUpdate(id, row) {
  const sets = Object.keys(row).map(c => `${c}=${q(row[c])}`);
  sets.push('updated_at=now()');
  return `UPDATE tracking_items SET ${sets.join(', ')} WHERE id=${q(id)}`;
}

// ---------- 变更留痕（时间按北京时间；云函数时区不定，统一手动 +8）----------
function beijingNow() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
function logEntry(action, from, to, by, field) {
  return { at: beijingNow(), action: action, field: field || 'status', from: from || '', to: to || '', by: by || '' };
}
async function readStatusLog(id) {
  try {
    const res = await exec('SELECT status_log FROM tracking_items WHERE id=' + q(id));
    if (res.Rows && res.Rows.length) {
      const row = JSON.parse(res.Rows[0]);
      const arr = JSON.parse(row[0] || '[]');
      if (Array.isArray(arr)) return arr;
    }
  } catch (e) {}
  return [];
}
async function pushLog(id, entry) {
  const arr = await readStatusLog(id);
  arr.push(entry);
  await exec('UPDATE tracking_items SET status_log=' + q(JSON.stringify(arr)) + ' WHERE id=' + q(id));
  return arr;
}
// 只允许白名单字段（防注入）
async function readField(id, field) {
  if (!STATUS_FIELDS[field]) return null;
  try {
    const o = await exec('SELECT ' + field + ' FROM tracking_items WHERE id=' + q(id));
    if (o.Rows && o.Rows.length) { const r0 = JSON.parse(o.Rows[0]); return String(r0[0] || ''); }
  } catch (e) {}
  return null;
}
// 通用字段读取（仅白名单列）
async function readCol(id, col) {
  if (!ALIAS[col] && EXTRA_COLS.indexOf(col) < 0) return null;
  try {
    const o = await exec('SELECT ' + col + ' FROM tracking_items WHERE id=' + q(id));
    if (o.Rows && o.Rows.length) { const r0 = JSON.parse(o.Rows[0]); return String(r0[0] || ''); }
  } catch (e) {}
  return null;
}

function parseIds(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  arr.forEach(x => { const n = parseInt(x, 10); if (n > 0 && out.indexOf(n) < 0) out.push(n); });
  return out;
}

// v1.0.197 单条多字段写入（batchset / batchsave 共用）：只写传入的字段，其余字段不动；三个状态字段变更留痕
async function applyFields(id, fields, user) {
  const cols = Object.keys(fields).filter(c => ALIAS[c] || EXTRA_COLS.indexOf(c) >= 0);
  if (!cols.length) return { ok: false, cols: [] };
  for (const fl of ['status', 'inv_status', 'ord_status']) {
    if (cols.indexOf(fl) < 0) continue;
    let nv = String(fields[fl] == null ? '' : fields[fl]).trim();
    if (fl === 'status') nv = validStatus(nv);
    else if (STATUS_FIELDS[fl].indexOf(nv) < 0) nv = '';
    const ov = await readField(id, fl);
    if (ov === null) continue;
    if (String(ov) !== nv) await pushLog(id, logEntry('change', String(ov), nv, user.username, fl));
  }
  const sets = cols.map(c => {
    let v = (fields[c] == null) ? '' : String(fields[c]);
    if (c === 'status') v = validStatus(v);
    if (c === 'inv_status' || c === 'ord_status') { if (STATUS_FIELDS[c].indexOf(v.trim()) < 0) v = ''; v = v.trim(); }
    return c + '=' + q(cleanStr(v, MAXLEN[c]));
  });
  await exec('UPDATE tracking_items SET ' + sets.join(', ') + ', updated_at=now() WHERE id=' + q(id));
  return { ok: true, cols: cols };
}

exports.main = async (event) => {
  const evt = parseEvt(event);
  try {
    await ensureTables();
    const action = String((evt && evt.action) || 'list');
    const user = await checkToken(String((evt && evt.token) || ''));
    if (!user) return { ok: false, msg: '未登录或登录已过期' };

    if (action === 'list') {
      const status = String((evt && evt.status) || '').trim();
      const where = (status === 'inventory' || status === 'ordered' || status === 'purchase') ? ' WHERE status=' + q(status) : '';
      const res = await exec('SELECT * FROM tracking_items' + where + ' ORDER BY id DESC LIMIT 2000');
      const items = [];
      for (let i = 0; i < (res.Rows || []).length; i++) items.push(rowToItem(res, i));
      return { ok: true, items: items };
    }

    if (action === 'save') {
      const it = evt.item;
      if (!it || typeof it !== 'object') return { ok: false, msg: '数据无效' };
      const row = buildRow(it);
      row.status = validStatus(it.status);
      const id = parseInt(it.id, 10);
      if (id > 0) {
        // 先读三个状态字段（板块 / 库存状态 / 订单状态），变更逐一留痕
        const olds = {
          status: await readField(id, 'status'),
          inv_status: await readField(id, 'inv_status'),
          ord_status: await readField(id, 'ord_status'),
          pur_status: await readField(id, 'pur_status')
        };
        if (olds.status === null) return { ok: false, msg: '记录不存在或已被删除' };
        await exec(sqlUpdate(id, row));
        const news = { status: row.status, inv_status: row.inv_status || '', ord_status: row.ord_status || '', pur_status: row.pur_status || '' };
        for (const fl of ['status', 'inv_status', 'ord_status', 'pur_status']) {
          const a = olds[fl] === null ? '' : String(olds[fl]);
          const b = String(news[fl] || '');
          if (a === b) continue;
          if (fl === 'status' && !a) continue;            // 板块原值缺失时不记（避免脏轨迹）
          await pushLog(id, logEntry('change', a, b, user.username, fl));
        }
        return { ok: true, id: id };
      }
      const initLog = JSON.stringify([logEntry('created', '', row.status, user.username, 'status')]);
      await exec(sqlInsert(row, user.username, initLog));
      return { ok: true };
    }

    if (action === 'delete') {
      const id = parseInt(evt.id, 10);
      if (!(id > 0)) return { ok: false, msg: 'id 无效' };
      await exec('DELETE FROM tracking_items WHERE id=' + q(id));
      return { ok: true };
    }

    // v1.0.196 批量更新指定字段（未列出的字段不动；三个状态字段变更留痕）
    if (action === 'batchset') {
      const ids = parseIds(evt.ids);
      if (!ids.length) return { ok: false, msg: '未选择记录' };
      const fields = evt.fields && typeof evt.fields === 'object' ? evt.fields : {};
      const cols = Object.keys(fields).filter(c => ALIAS[c] || EXTRA_COLS.indexOf(c) >= 0);
      if (!cols.length) return { ok: false, msg: '没有可更新的字段' };
      let n = 0, miss = 0;
      for (const id of ids) {
        const exist = await readField(id, 'status');
        if (exist === null) { miss++; continue; }
        const r = await applyFields(id, fields, user);
        if (r.ok) n++;
      }
      return { ok: true, updated: n, missing: miss };
    }

    // v1.0.197 逐格编辑保存：每条记录带自己改动过的字段（各自不同）
    if (action === 'batchsave') {
      const list = Array.isArray(evt.items) ? evt.items : [];
      if (!list.length) return { ok: false, msg: '没有要保存的改动' };
      let updated = 0, cells = 0, miss = 0, skipped = 0;
      for (const it of list) {
        const id = parseInt(it && it.id, 10);
        if (!(id > 0)) { miss++; continue; }
        const fields = (it && it.fields && typeof it.fields === 'object') ? it.fields : {};
        const exist = await readField(id, 'status');
        if (exist === null) { miss++; continue; }
        const r = await applyFields(id, fields, user);
        if (r.ok) { updated++; cells += r.cols.length; } else skipped++;
      }
      return { ok: true, updated: updated, cells: cells, missing: miss, skipped: skipped };
    }

    // v1.0.196 批量删除
    if (action === 'batchdel') {
      const ids = parseIds(evt.ids);
      if (!ids.length) return { ok: false, msg: '未选择记录' };
      // 逐条读日志不需要，直接删
      await exec('DELETE FROM tracking_items WHERE id IN (' + ids.map(x => q(x)).join(',') + ')');
      return { ok: true, deleted: ids.length };
    }

    // v1.0.196 字典：工序库（processLib）
    if (action === 'libget') {
      const key = String(evt.key || 'processLib');
      const res = await exec('SELECT v FROM tracking_lib WHERE k=' + q(key) + ' LIMIT 1');
      let val = null;
      if (res.Rows && res.Rows.length) { try { val = JSON.parse(JSON.parse(res.Rows[0])[0] || 'null'); } catch (e) { val = null; } }
      if (val === null && key === 'processLib') val = DEFAULT_PROCESS.slice();
      return { ok: true, key: key, value: val };
    }
    if (action === 'libset') {
      const key = String(evt.key || 'processLib');
      // v1.0.221：数组 = 字典列表（工序库等，老行为不变）；非数组（数字 / 对象）= 应用级统一设置（如税点 taxRate）
      let val;
      if (Array.isArray(evt.value)) val = evt.value.map(x => String(x).trim()).filter(x => x);
      else if (evt.value === null || evt.value === undefined || evt.value === '') return { ok: false, msg: '值不能为空' };
      else val = evt.value;
      await exec('INSERT INTO tracking_lib (k, v, updated_at) VALUES (' + q(key) + ', ' + q(JSON.stringify(val)) + ', now()) ' +
        'ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, updated_at=now()');
      return { ok: true, key: key, count: Array.isArray(val) ? val.length : 1, value: val };
    }

    // v1.0.198 基础数据词典：dictget 取全部（列词典 + 预留类别）/ dictset 覆盖保存
    if (action === 'dictget') {
      const res = await exec("SELECT v FROM tracking_lib WHERE k='fieldDict' LIMIT 1");
      let val = null;
      if (res.Rows && res.Rows.length) { try { val = JSON.parse(JSON.parse(res.Rows[0])[0] || 'null'); } catch (e) { val = null; } }
      if (!val || !val.cols) val = { cols: DEFAULT_DICT.cols, extra: DEFAULT_DICT.extra };
      if (!val.extra) val.extra = DEFAULT_DICT.extra;
      // v1.0.206：已保存的词典里缺少新增类别时，用默认值补齐
      Object.keys(DEFAULT_DICT.cols).forEach(k => { if (!Array.isArray(val.cols[k])) val.cols[k] = DEFAULT_DICT.cols[k].slice(); });
      Object.keys(DEFAULT_DICT.extra).forEach(k => { if (!Array.isArray(val.extra[k])) val.extra[k] = DEFAULT_DICT.extra[k].slice(); });
      return { ok: true, dict: val, label: DICT_LABEL, defaults: DEFAULT_DICT, global: true };
    }
    if (action === 'dictset') {
      const d = evt.dict || {};
      const norm = arr => (Array.isArray(arr) ? arr.map(x => String(x).trim()).filter(x => x) : []);
      const uniq2 = a => { const s = []; a.forEach(x => { if (s.indexOf(x) < 0) s.push(x); }); return s; };
      const out = { cols: {}, extra: {} };
      Object.keys(DEFAULT_DICT.cols).forEach(k => { out.cols[k] = uniq2(norm((d.cols || {})[k])); });
      Object.keys(DEFAULT_DICT.extra).forEach(k => { out.extra[k] = uniq2(norm((d.extra || {})[k])); });
      Object.keys((d.extra || {})).forEach(k => { if (!out.extra[k]) out.extra[k] = uniq2(norm(d.extra[k])); });
      await exec('INSERT INTO tracking_lib (k, v, updated_at) VALUES (' + q('fieldDict') + ', ' + q(JSON.stringify(out)) + ', now()) ' +
        'ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, updated_at=now()');
      const nc = Object.keys(out.cols).reduce((a, k) => a + out.cols[k].length, 0);
      const ne = Object.keys(out.extra).reduce((a, k) => a + out.extra[k].length, 0);
      return { ok: true, colItems: nc, extraItems: ne, cols: Object.keys(out.cols).length, extra: Object.keys(out.extra).length };
    }

    // v1.0.208 column layout (order / hidden / custom columns / renamed titles), shared by all users
    if (action === 'layoutget') {
      const res = await exec("SELECT v FROM tracking_lib WHERE k='trackingLayout' LIMIT 1");
      let val = null;
      if (res.Rows && res.Rows.length) { try { val = JSON.parse(JSON.parse(res.Rows[0])[0] || 'null'); } catch (e) { val = null; } }
      if (!val || typeof val !== 'object') val = { order: [], hidden: [], custom: [], rename: {} };
      if (!Array.isArray(val.order)) val.order = [];
      if (!Array.isArray(val.hidden)) val.hidden = [];
      if (!Array.isArray(val.custom)) val.custom = [];
      if (!val.rename || typeof val.rename !== 'object') val.rename = {};
      if (!val.width || typeof val.width !== 'object') val.width = {};
      return { ok: true, layout: val };
    }
    if (action === 'layoutsave') {
      const L = evt.layout || {};
      const okK = k => /^[a-z_][a-z0-9_]{0,39}$/.test(String(k)) || /^c([1-9]|1[0-2])$/.test(String(k));
      const arr = a => (Array.isArray(a) ? a.map(x => String(x)).filter(x => okK(x)) : []);
      const cut = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
      const out = { order: arr(L.order).slice(0, 200), hidden: arr(L.hidden).slice(0, 200), custom: [], rename: {}, width: {} };
      const okB = b => ['inventory', 'ordered', 'progress', 'intake', 'purchase'].indexOf(String(b)) >= 0;
      Object.keys(L.width || {}).forEach(b => {
        if (!okB(b)) return;
        const src = (L.width || {})[b] || {}, o = {};
        Object.keys(src).forEach(k => {
          if (!okK(k)) return;
          const v = Math.round(Number(src[k]) || 0);
          if (v >= 36 && v <= 800) o[k] = v;
        });
        if (Object.keys(o).length) out.width[b] = o;
      });
      const used = {};
      (Array.isArray(L.custom) ? L.custom : []).forEach(c => {
        const k = String((c || {}).k || '');
        if (!/^c([1-9]|1[0-2])$/.test(k) || used[k]) return;
        const t = cut((c || {}).t, 20);
        if (!t) return;
        used[k] = 1;
        out.custom.push({ k: k, t: t, num: (c || {}).num ? 1 : 0, kind: cut((c || {}).kind, 10) });
      });
      Object.keys(L.rename || {}).forEach(k => {
        if (!okK(k)) return;
        const t = cut((L.rename || {})[k], 20);
        if (t) out.rename[k] = t;
      });
      await exec('INSERT INTO tracking_lib (k, v, updated_at) VALUES (' + q('trackingLayout') + ', ' + q(JSON.stringify(out)) + ', now()) ' +
        'ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, updated_at=now()');
      return { ok: true, layout: out, order: out.order.length, hidden: out.hidden.length, custom: out.custom.length };
    }

    // 状态列切换：status(板块) / inv_status(库存状态) / ord_status(订单状态)
    if (action === 'setfield') {
      const id = parseInt(evt.id, 10);
      if (!(id > 0)) return { ok: false, msg: 'id 无效' };
      const field = String(evt.field || '');
      if (!STATUS_FIELDS[field]) return { ok: false, msg: '不支持的状态字段：' + field };
      let value = String(evt.value == null ? '' : evt.value).trim();
      if (field === 'status') value = validStatus(value);
      if (STATUS_FIELDS[field].indexOf(value) < 0) return { ok: false, msg: '状态值不合法：' + value };
      const oldVal = await readField(id, field);
      if (oldVal === null) return { ok: false, msg: '记录不存在或已被删除' };
      await exec('UPDATE tracking_items SET ' + field + '=' + q(value) + ', updated_at=now() WHERE id=' + q(id));
      if (oldVal !== value) await pushLog(id, logEntry('change', oldVal, value, user.username, field));
      return { ok: true, field: field, from: oldVal, to: value, changed: oldVal !== value };
    }

    // 兼容旧接口名 status（等价于 setfield field=status）
    if (action === 'status') {
      const id = parseInt(evt.id, 10);
      if (!(id > 0)) return { ok: false, msg: 'id 无效' };
      const st = validStatus(evt.status);
      const oldStatus = await readField(id, 'status');
      if (oldStatus === null) return { ok: false, msg: '记录不存在或已被删除' };
      await exec('UPDATE tracking_items SET status=' + q(st) + ', updated_at=now() WHERE id=' + q(id));
      if (oldStatus !== st) await pushLog(id, logEntry('change', oldStatus, st, user.username, 'status'));
      return { ok: true, status: st, from: oldStatus, changed: oldStatus !== st };
    }

    // import 放在最后（逻辑较长）
    if (action === 'import') {
      const rows = evt.rows;
      if (!Array.isArray(rows) || !rows.length) return { ok: false, msg: '导入数据为空' };
      if (rows.length > 500) return { ok: false, msg: '单次最多导入 500 条' };
      let n = 0, errs = 0;
      for (const it of rows) {
        try {
          const row = buildRow(it);
          row.status = validStatus(it.status);
          if (row.ord_status && !row.inv_status) row.status = 'ordered';
          if (row.inv_status && !row.ord_status) row.status = 'inventory';
          const hasAny = [row.code, row.grade, row.supplier, row.warehouse, row.contract_no, row.warehouse_date, row.customer].some(v => v !== '');
          // v1.0.217 采购需求不要求以上字段全（只写了钢种/规格/备注也算一条要买的东西）
          const hasAnyPur = row.status === 'purchase' &&
            [row.grade, row.surface, row.thickness, row.width, row.count, row.supplier, row.origin, row.code, row.customer, row.note].some(v => v !== '');
          if (!hasAny && !hasAnyPur) { errs++; continue; }
          const initLog = JSON.stringify([logEntry('import', '', row.status, user.username, 'status')]);
          await exec(sqlInsert(row, user.username, initLog));
          n++;
        } catch (e) { errs++; }
      }
      return { ok: true, imported: n, skipped: errs };
    }

    return { ok: false, msg: '未知 action: ' + action };
  } catch (e) {
    return { ok: false, msg: '服务器错误：' + (e.message || e) };
  }
};
