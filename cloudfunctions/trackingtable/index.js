// trackingTable — 不锈钢跟单系统数据接口（v1.0.186）
// 表：tracking_items（PG）
// action: list(登录) / save(登录,新增或按id更新) / delete(登录) / import(登录,批量)
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

const COLS = ['status'];

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
  // v1.0.193：货物状态变更轨迹（JSON 数组：[{at, action, from, to, by}]，by = 操作账号）
  await exec("ALTER TABLE tracking_items ADD COLUMN IF NOT EXISTS status_log TEXT DEFAULT '[]'");
  await exec('CREATE INDEX IF NOT EXISTS idx_tracking_status ON tracking_items (status)');
  await exec('CREATE INDEX IF NOT EXISTS idx_tracking_code ON tracking_items (code)');
}

function parseEvt(ev) {
  if (ev && ev.body) { try { return JSON.parse(ev.body); } catch (e) {} }
  return ev || {};
}

async function checkToken(token) {
  if (!token) return null;
  const res = await exec('SELECT t.token, t.username, t.role, t.expires_at, u.enabled, u.real_name FROM tokens t LEFT JOIN users u ON t.username = t.username WHERE t.token=' + q(token) + ' LIMIT 1');
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

// ---------- v1.0.193：货物状态变更轨迹 ----------
// 时间取北京时间（云函数运行时时区不定，统一手动 +8）
function beijingNow() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
function logEntry(action, from, to, by) {
  return { at: beijingNow(), action: action, from: from || '', to: to, by: by || '' };
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
async function readStatus(id) {
  try {
    const o = await exec('SELECT status FROM tracking_items WHERE id=' + q(id));
    if (o.Rows && o.Rows.length) { const r0 = JSON.parse(o.Rows[0]); return String(r0[0] || ''); }
  } catch (e) {}
  return '';
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
      // 兼容前端驼峰/下划线
      const pick = (...names) => { for (const nm of names) { if (it[nm] !== undefined && it[nm] !== null && String(it[nm]).trim() !== '') return it[nm]; } return ''; };
      const row = {
        status: validStatus(pick('status')),
        purchase_date: cleanStr(pick('purchaseDate', 'purchase_date')), warehouse_date: cleanStr(pick('warehouseDate', 'warehouse_date')),
        warehouse: cleanStr(pick('warehouse')), grade: cleanStr(pick('grade')), surface: cleanStr(pick('surface')),
        thickness: cleanStr(pick('thickness')), width: cleanStr(pick('width')), length: cleanStr(pick('length')),
        weight: cleanStr(pick('weight')), count: cleanStr(pick('count')), orig_weight: cleanStr(pick('origWeight', 'orig_weight')),
        prod_status: cleanStr(pick('prodStatus', 'prod_status')), code: cleanStr(pick('code')), contract_no: cleanStr(pick('contractNo', 'contract_no')),
        note: cleanStr(pick('note'), 1000), type: cleanStr(pick('type')), origin: cleanStr(pick('origin')),
        total_amount: cleanStr(pick('totalAmount', 'total_amount')), unit_price: cleanStr(pick('unitPrice', 'unit_price')),
        supplier: cleanStr(pick('supplier')), sale_price: cleanStr(pick('salePrice', 'sale_price'))
      };
      const id = parseInt(it.id, 10);
      if (id > 0) {
        const oldStatus = await readStatus(id); // v1.0.193：先取原状态，变化则写轨迹
        await exec(`UPDATE tracking_items SET status=${q(row.status)}, purchase_date=${q(row.purchase_date)}, warehouse_date=${q(row.warehouse_date)}, warehouse=${q(row.warehouse)}, grade=${q(row.grade)}, surface=${q(row.surface)}, thickness=${q(row.thickness)}, width=${q(row.width)}, length=${q(row.length)}, weight=${q(row.weight)}, count=${q(row.count)}, orig_weight=${q(row.orig_weight)}, prod_status=${q(row.prod_status)}, code=${q(row.code)}, contract_no=${q(row.contract_no)}, note=${q(row.note)}, type=${q(row.type)}, origin=${q(row.origin)}, total_amount=${q(row.total_amount)}, unit_price=${q(row.unit_price)}, supplier=${q(row.supplier)}, sale_price=${q(row.sale_price)}, updated_at=now() WHERE id=${q(id)}`);
        if (oldStatus && oldStatus !== row.status) await pushLog(id, logEntry('change', oldStatus, row.status, user.username));
        return { ok: true, id: id };
      }
      const initLog = JSON.stringify([logEntry('created', '', row.status, user.username)]);
      await exec(`INSERT INTO tracking_items (status, purchase_date, warehouse_date, warehouse, grade, surface, thickness, width, length, weight, count, orig_weight, prod_status, code, contract_no, note, type, origin, total_amount, unit_price, supplier, sale_price, created_by, status_log) VALUES (${q(row.status)}, ${q(row.purchase_date)}, ${q(row.warehouse_date)}, ${q(row.warehouse)}, ${q(row.grade)}, ${q(row.surface)}, ${q(row.thickness)}, ${q(row.width)}, ${q(row.length)}, ${q(row.weight)}, ${q(row.count)}, ${q(row.orig_weight)}, ${q(row.prod_status)}, ${q(row.code)}, ${q(row.contract_no)}, ${q(row.note)}, ${q(row.type)}, ${q(row.origin)}, ${q(row.total_amount)}, ${q(row.unit_price)}, ${q(row.supplier)}, ${q(row.sale_price)}, ${q(user.username)}, ${q(initLog)})`);
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
          const pick = (...names) => { for (const nm of names) { if (it[nm] !== undefined && it[nm] !== null && String(it[nm]).trim() !== '') return it[nm]; } return ''; };
          const row = {
            status: validStatus(pick('status')), purchase_date: cleanStr(pick('purchaseDate', 'purchase_date')), warehouse_date: cleanStr(pick('warehouseDate', 'warehouse_date')),
            warehouse: cleanStr(pick('warehouse')), grade: cleanStr(pick('grade')), surface: cleanStr(pick('surface')),
            thickness: cleanStr(pick('thickness')), width: cleanStr(pick('width')), length: cleanStr(pick('length')),
            weight: cleanStr(pick('weight')), count: cleanStr(pick('count')), orig_weight: cleanStr(pick('origWeight', 'orig_weight')),
            prod_status: cleanStr(pick('prodStatus', 'prod_status')), code: cleanStr(pick('code')), contract_no: cleanStr(pick('contractNo', 'contract_no')),
            note: cleanStr(pick('note'), 1000), type: cleanStr(pick('type')), origin: cleanStr(pick('origin')),
            total_amount: cleanStr(pick('totalAmount', 'total_amount')), unit_price: cleanStr(pick('unitPrice', 'unit_price')),
            supplier: cleanStr(pick('supplier')), sale_price: cleanStr(pick('salePrice', 'sale_price'))
          };
          // 至少有一个业务字段非空才导入
          const hasAny = [row.code, row.grade, row.supplier, row.warehouse, row.contract_no].some(v => v !== '');
          if (!hasAny) { errs++; continue; }
          const initLog = JSON.stringify([logEntry('import', '', row.status, user.username)]);
          await exec(`INSERT INTO tracking_items (status, purchase_date, warehouse_date, warehouse, grade, surface, thickness, width, length, weight, count, orig_weight, prod_status, code, contract_no, note, type, origin, total_amount, unit_price, supplier, sale_price, created_by, status_log) VALUES (${q(row.status)}, ${q(row.purchase_date)}, ${q(row.warehouse_date)}, ${q(row.warehouse)}, ${q(row.grade)}, ${q(row.surface)}, ${q(row.thickness)}, ${q(row.width)}, ${q(row.length)}, ${q(row.weight)}, ${q(row.count)}, ${q(row.orig_weight)}, ${q(row.prod_status)}, ${q(row.code)}, ${q(row.contract_no)}, ${q(row.note)}, ${q(row.type)}, ${q(row.origin)}, ${q(row.total_amount)}, ${q(row.unit_price)}, ${q(row.supplier)}, ${q(row.sale_price)}, ${q(user.username)}, ${q(initLog)})`);
          n++;
        } catch (e) { errs++; }
      }
      return { ok: true, imported: n, skipped: errs };
    }

    if (action === 'status') {
      // 单独切换状态（库存↔已接单；两个方向都允许——已接单退回库存属特殊情况，可回退）
      const id = parseInt(evt.id, 10);
      if (!(id > 0)) return { ok: false, msg: 'id 无效' };
      const st = validStatus(evt.status);
      const oldStatus = await readStatus(id);
      if (!oldStatus) return { ok: false, msg: '记录不存在或已被删除' };
      await exec('UPDATE tracking_items SET status=' + q(st) + ', updated_at=now() WHERE id=' + q(id));
      if (oldStatus !== st) await pushLog(id, logEntry('change', oldStatus, st, user.username));
      return { ok: true, status: st, from: oldStatus, changed: oldStatus !== st };
    }

    return { ok: false, msg: '未知 action: ' + action };
  } catch (e) {
    return { ok: false, msg: '服务器错误：' + (e.message || e) };
  }
};
