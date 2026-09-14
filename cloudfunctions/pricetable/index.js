// priceTable — 中央价格发布表（v1.0.119 基价 / v1.0.124 保护膜价）
// scope: origins=基价 / films=保护膜价（默认 origins）
// get: 任意登录用户拉取最新发布；save: 仅 admin 发布（每次保存留历史，取最新）；clear: 仅 admin 清空（按 scope）
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
    const r = await exec("SELECT v FROM tracking_lib WHERE k='schemaVer:pricetable' LIMIT 1");
    if (r.Rows && r.Rows.length) {
      let v = '';
      try { const row = JSON.parse(r.Rows[0]); v = String(JSON.parse(row[0] || '""')); } catch (e1) { v = ''; }
      if (v === SCHEMA_VER) { __schemaOK = true; return; }
    }
  } catch (e) { /* tracking_lib 尚不存在 → 走完整初始化 */ }
  await ensureTables();
  try {
    await exec("INSERT INTO tracking_lib (k, v, updated_at) VALUES ('schemaVer:pricetable', " + q(JSON.stringify(SCHEMA_VER)) + ", now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, updated_at=now()");
  } catch (e) { }
  __schemaOK = true;
}
async function ensureTables() {
  await exec('CREATE TABLE IF NOT EXISTS tokens (id SERIAL PRIMARY KEY, token TEXT UNIQUE NOT NULL, username TEXT NOT NULL, role TEXT NOT NULL, expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP DEFAULT now())');
  await exec("CREATE TABLE IF NOT EXISTS base_price_history (id SERIAL PRIMARY KEY, key TEXT DEFAULT 'origins', data TEXT NOT NULL, updated_by TEXT NOT NULL, created_at TIMESTAMP DEFAULT now())");
  await exec("ALTER TABLE base_price_history ADD COLUMN IF NOT EXISTS key TEXT DEFAULT 'origins'");
}

function parseEvt(ev) {
  if (ev && ev.body) {
    try { return JSON.parse(ev.body); } catch (e) {}
  }
  return ev || {};
}

// 校验 token，返回 {username, role, realName} 或 null
async function checkToken(token) {
  if (!token) return null;
  const res = await exec('SELECT t.token, t.username, t.role, t.expires_at, u.enabled, u.real_name FROM tokens t LEFT JOIN users u ON u.username = t.username WHERE t.token=' + q(token) + ' LIMIT 1');
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

exports.main = async (event) => {
  const evt = parseEvt(event);
  try {
    await ensureSchemaOnce();
    const action = String((evt && evt.action) || '').trim();

    if (action === 'save') {
      const user = await checkToken(String((evt && evt.token) || ''));
      if (!user) return { ok: false, msg: '未登录或登录已过期' };
      if (String(user.role) !== 'admin') return { ok: false, msg: '只有管理员可以发布价格' };
      const prices = evt.prices;
      if (!prices || typeof prices !== 'object') return { ok: false, msg: '价格数据无效' };
      const dataJson = JSON.stringify(prices);
      if (dataJson.length > 300000) return { ok: false, msg: '价格数据过大' };
      const scope = String((evt && evt.scope) || 'origins');
      await exec('INSERT INTO base_price_history (key, data, updated_by) VALUES (' + q(scope) + ', ' + q(dataJson) + ', ' + q(user.username) + ')');
      return { ok: true, updatedBy: user.username, updatedAt: new Date().toISOString() };
    }

    if (action === 'clear') {
      const user = await checkToken(String((evt && evt.token) || ''));
      if (!user) return { ok: false, msg: '未登录或登录已过期' };
      if (String(user.role) !== 'admin') return { ok: false, msg: '只有管理员可以清空价格' };
      const scope = String((evt && evt.scope) || 'origins');
      await exec('DELETE FROM base_price_history WHERE key=' + q(scope));
      return { ok: true };
    }

    // 默认 get：登录即可
    const user = await checkToken(String((evt && evt.token) || ''));
    if (!user) return { ok: false, msg: '未登录或登录已过期' };
    const scope = String((evt && evt.scope) || 'origins');
    const res = await exec('SELECT id, key, data, updated_by, created_at FROM base_price_history WHERE key=' + q(scope) + ' ORDER BY id DESC LIMIT 1');
    if (!res.Rows || !res.Rows.length) return { ok: true, data: null };
    const row = JSON.parse(res.Rows[0]);
    const item = {};
    res.Columns.forEach((c, i) => { item[c] = row[i]; });
    let prices = null;
    try { prices = JSON.parse(item.data); } catch (e) { prices = null; }
    return { ok: true, data: { prices: prices, updatedBy: item.updated_by, updatedAt: item.created_at } };
  } catch (e) {
    return { ok: false, msg: '服务器错误：' + (e.message || e) };
  }
};
