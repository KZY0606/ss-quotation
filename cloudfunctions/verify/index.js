// verify (PG版) — token 校验
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
    await ensureTables();
    const token = String((evt && evt.token) || '').trim();
    if (!token) return { ok: false, msg: '缺少令牌' };
    const res = await exec('SELECT t.token, t.username, t.role, t.expires_at, u.enabled, u.real_name, u.department FROM tokens t LEFT JOIN users u ON u.username = t.username WHERE t.token=' + q(token) + ' LIMIT 1');
    if (!res.Rows || !res.Rows.length) return { ok: false, msg: '未登录或登录已过期' };
    const row = JSON.parse(res.Rows[0]);
    const item = {};
    res.Columns.forEach((c, i) => { item[c] = row[i]; });
    if (new Date(item.expires_at) < new Date()) {
      await exec('DELETE FROM tokens WHERE token=' + q(token));
      return { ok: false, msg: '登录已过期，请重新登录' };
    }
    if (String(item.enabled) !== 'true') return { ok: false, msg: '账号已被停用，请联系管理员' };
    return { ok: true, username: item.username, realName: item.real_name, department: item.department || '', role: item.role };
  } catch (e) {
    return { ok: false, msg: '服务器错误：' + (e.message || e) };
  }
};
