// logUsage (PG版) — 记录报价使用日志
const CloudBase = require('@cloudbase/manager-node');
const app = CloudBase.init({ envId: process.env.TCB_ENV_ID || 'kk-quotation-d2gtggelpcd901498' });
const database = app.database;

function q(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}

async function exec(Sql) {
  const r = await database.executePGSql({ Sql });
  return r;
}

// v1.0.222 性能：schema 就绪标记——每次请求先 1 次轻查询，版本一致就跳过全部建表 DDL（实测每次省 1~2 秒）
const SCHEMA_VER = '2026-09-14a';
let __schemaOK = false;
async function ensureSchemaOnce() {
  if (__schemaOK) return;
  try {
    const r = await exec("SELECT v FROM tracking_lib WHERE k='schemaVer:logusage' LIMIT 1");
    if (r.Rows && r.Rows.length) {
      let v = '';
      try { const row = JSON.parse(r.Rows[0]); v = String(JSON.parse(row[0] || '""')); } catch (e1) { v = ''; }
      if (v === SCHEMA_VER) { __schemaOK = true; return; }
    }
  } catch (e) { /* tracking_lib 尚不存在 → 走完整初始化 */ }
  await ensureTables();
  try {
    await exec("INSERT INTO tracking_lib (k, v, updated_at) VALUES ('schemaVer:logusage', " + q(JSON.stringify(SCHEMA_VER)) + ", now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, updated_at=now()");
  } catch (e) { }
  __schemaOK = true;
}
async function ensureTables() {
  await exec('CREATE TABLE IF NOT EXISTS usage_logs (id SERIAL PRIMARY KEY, username TEXT NOT NULL, material TEXT, spec TEXT, surface TEXT, calc_mode TEXT, unit_price NUMERIC, created_at TIMESTAMP DEFAULT now())');
  // v1.0.131: 批次号（同一次计算共用）
  await exec("ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS batch_id TEXT");
}

function parseEvt(ev) {
  if (ev && ev.body) {
    try { return JSON.parse(ev.body); } catch (e) {}
  }
  return ev || {};
}

exports.main = async (event) => {
  const evt = parseEvt(event);
  try {
    await ensureSchemaOnce();
    const token = String((evt && evt.token) || '').trim();
    const item = (evt && evt.item) || {};
    if (!token) return { ok: false, msg: '缺少令牌' };
    // 校验 token 并取 username
    const r = await exec('SELECT token, username FROM tokens WHERE token=' + q(token) + ' AND expires_at > now() LIMIT 1');
    if (!r.Rows || !r.Rows.length) return { ok: false, msg: '登录已过期' };
    const row = JSON.parse(r.Rows[0]);
    const tk = {};
    r.Columns.forEach((c, i) => { tk[c] = row[i]; });
    const material = String((item && item.material) || '').trim();
    const spec = String((item && item.spec) || '').trim();
    const surface = String((item && item.surface) || '').trim();
    const calcMode = String((item && item.calcMode) || '').trim();
    const unitPrice = (item && item.unitPrice !== null && item.unitPrice !== undefined) ? Number(item.unitPrice) : null;
    const batchId = String((item && item.batchId) || '').trim();
    await exec('INSERT INTO usage_logs (username, material, spec, surface, calc_mode, unit_price, batch_id) VALUES (' + q(tk.username) + ', ' + q(material) + ', ' + q(spec) + ', ' + q(surface) + ', ' + q(calcMode) + ', ' + (unitPrice === null ? 'NULL' : unitPrice) + ', ' + q(batchId) + ')');
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: '服务器错误：' + (e.message || e) };
  }
};
