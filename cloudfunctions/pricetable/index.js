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
    await ensureTables();
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
