// trackingTable — 不锈钢跟单系统数据接口（v1.0.195）
// 表：tracking_items（PG）
// action: list / save(新增或按id更新) / delete / import(批量) / setfield(切换 status|inv_status|ord_status)  —— 均需登录
// v1.0.194：入仓字段按业务清单扩展（原重/现重/毛重 KG、单价含税/不含税、总金额含税/不含税、负差、实卡厚）
//           库存板块与已接单板块各自独立状态列（inv_status / ord_status），切换留痕（时间 + 操作账号）
// v1.0.195：save 更新时对 status / inv_status / ord_status 三个状态字段逐一比对留痕（支持整行编辑一次性提交）
//           import 状态列归位保底：带订单状态的行自动进「已接单」板块
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
  ord_status: ['ordStatus', 'ord_status']
};
const MAXLEN = { note: 1000 };

// 状态枚举
const ENUM_STATUS = ['inventory', 'ordered'];                  // 板块归属
const ENUM_INV = ['在库', '已预订', '部分出库', '已售出'];      // 库存板块状态列
const ENUM_ORD = ['采购下单', '原料到仓', '投入生产', '加工完成', '发货自提', '已交付']; // 已接单板块状态列
const STATUS_FIELDS = { status: ENUM_STATUS, inv_status: ENUM_INV, ord_status: ENUM_ORD };

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
  await exec('CREATE INDEX IF NOT EXISTS idx_tracking_status ON tracking_items (status)');
  await exec('CREATE INDEX IF NOT EXISTS idx_tracking_code ON tracking_items (code)');
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
        // v1.0.195：先读三个状态字段（板块 / 库存状态 / 订单状态），变更逐一留痕
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

    if (action === 'import') {
      const rows = evt.rows;
      if (!Array.isArray(rows) || !rows.length) return { ok: false, msg: '导入数据为空' };
      if (rows.length > 500) return { ok: false, msg: '单次最多导入 500 条' };
      let n = 0, errs = 0;
      for (const it of rows) {
        try {
          const row = buildRow(it);
          row.status = validStatus(it.status);
          // v1.0.195：Excel 状态列归位保底 —— 有订单状态即进「已接单」，只有库存状态则进「库存」
          if (row.ord_status && !row.inv_status) row.status = 'ordered';
          if (row.inv_status && !row.ord_status) row.status = 'inventory';
          const hasAny = [row.code, row.grade, row.supplier, row.warehouse, row.contract_no, row.warehouse_date].some(v => v !== '');
          if (!hasAny) { errs++; continue; }
          const initLog = JSON.stringify([logEntry('import', '', row.status, user.username, 'status')]);
          await exec(sqlInsert(row, user.username, initLog));
          n++;
        } catch (e) { errs++; }
      }
      return { ok: true, imported: n, skipped: errs };
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

    return { ok: false, msg: '未知 action: ' + action };
  } catch (e) {
    return { ok: false, msg: '服务器错误：' + (e.message || e) };
  }
};
