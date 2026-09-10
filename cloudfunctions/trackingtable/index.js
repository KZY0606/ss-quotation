// trackingTable — 不锈钢跟单系统数据接口（v1.0.196）
// 表：tracking_items（PG）/ tracking_lib（工序库等字典）
// action: list / save / delete / import / setfield / batchset / batchdel / libget / libset —— 均需登录
// v1.0.194：入仓字段按业务清单扩展（原重/现重/毛重 KG、单价含税/不含税、总金额含税/不含税、负差、实卡厚）
// v1.0.195：save 更新时对 status / inv_status / ord_status 逐一比对留痕；import 状态列归位保底
// v1.0.196：① 新增 客户名称 customer / 跟单员 follower / 预期交期 due_date / 工序链 process_flow / 当前工序 process_step
//           ② 「已接单」改名「生产中」（status 值仍为 ordered）；新增「生产进度」视图（同一批数据的精简列）
//           ③ 批量接口 batchset / batchdel；工序库字典接口 libget / libset（存 tracking_lib）
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
  customer: ['customer', 'custName'],
  follower: ['follower', 'salesman', 'owner'],
  due_date: ['dueDate', 'due_date'],
  process_flow: ['processFlow', 'process_flow'],
  process_step: ['processStep', 'process_step']
};
const MAXLEN = { note: 1000, process_flow: 4000, customer: 200, follower: 100, due_date: 40 };

// 状态枚举
const ENUM_STATUS = ['inventory', 'ordered'];                  // 板块归属（ordered = 生产中 / 生产进度）
const ENUM_INV = ['在库', '已预订', '部分出库', '已售出'];      // 库存板块状态列
const ENUM_ORD = ['采购下单', '原料到仓', '投入生产', '加工完成', '发货自提', '已交付']; // 订单状态列
const STATUS_FIELDS = { status: ENUM_STATUS, inv_status: ENUM_INV, ord_status: ENUM_ORD };
// batchset 允许的额外列（不在 ALIAS 映射里的系统列）
const EXTRA_COLS = ['status'];

// 默认工序库（图1 清单，可在界面增删）
const DEFAULT_PROCESS = ['开平', '飞剪', '纵剪/分条', '修边', '整平/矫平', '剪板', '激光切割', '冲孔', '折弯', '焊接',
  '酸洗', '退火酸洗', '普通磨砂', '雪花砂', '短丝', '长丝', '拉丝', '油磨', '干磨', '水磨', '缎纹', '乱纹/和纹',
  '8K镜面', '喷砂', '压花', '蚀刻', 'PVD镀色', '仿古铜', '做旧', '抗指纹', '覆膜', '贴膜', '撕膜',
  '检验', '包装', '装车', '运输', '客户签收', '返工'];

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

function validStatus(v) { return v === 'ordered' ? 'ordered' : 'inventory'; }

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
      const where = (status === 'inventory' || status === 'ordered') ? ' WHERE status=' + q(status) : '';
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
          ord_status: await readField(id, 'ord_status')
        };
        if (olds.status === null) return { ok: false, msg: '记录不存在或已被删除' };
        await exec(sqlUpdate(id, row));
        const news = { status: row.status, inv_status: row.inv_status || '', ord_status: row.ord_status || '' };
        for (const fl of ['status', 'inv_status', 'ord_status']) {
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
      const val = Array.isArray(evt.value) ? evt.value.map(x => String(x).trim()).filter(x => x) : null;
      if (!val) return { ok: false, msg: '字典值必须是数组' };
      await exec('INSERT INTO tracking_lib (k, v, updated_at) VALUES (' + q(key) + ', ' + q(JSON.stringify(val)) + ', now()) ' +
        'ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, updated_at=now()');
      return { ok: true, key: key, count: val.length };
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
          if (!hasAny) { errs++; continue; }
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
