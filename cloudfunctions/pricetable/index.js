// priceTable — 中央基价表（v1.0.119）
// get: 任意登录用户拉取最新发布基价；save: 仅 admin 发布（每次保存留历史，取最新）
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
  await exec('CREATE TABLE IF NOT EXISTS base_price_history (id SERIAL PRIMARY KEY, data TEXT NOT NULL, updated_by TEXT NOT NULL, created_at TIMESTAMP DEFAULT now())');
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
      if (String(user.role) !== 'admin') return { ok: false, msg: '只有管理员可以发布基价' };
      const prices = evt.prices;
      if (!prices || typeof prices !== 'object') return { ok: false, msg: '基价数据无效' };
      const dataJson = JSON.stringify(prices);
      if (dataJson.length > 300000) return { ok: false, msg: '基价数据过大' };
      await exec('INSERT INTO base_price_history (data, updated_by) VALUES (' + q(dataJson) + ', ' + q(user.username) + ')');
      return { ok: true, updatedBy: user.username, updatedAt: new Date().toISOString() };
    }

    if (action === 'clear') {
      const user = await checkToken(String((evt && evt.token) || ''));
      if (!user) return { ok: false, msg: '未登录或登录已过期' };
      if (String(user.role) !== 'admin') return { ok: false, msg: '只有管理员可以清空基价' };
      await exec('DELETE FROM base_price_history');
      return { ok: true };
    }

    // 默认 get：登录即可
    const user = await checkToken(String((evt && evt.token) || ''));
    if (!user) return { ok: false, msg: '未登录或登录已过期' };
    const res = await exec('SELECT id, data, updated_by, created_at FROM base_price_history ORDER BY id DESC LIMIT 1');
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
