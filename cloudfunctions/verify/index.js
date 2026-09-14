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

// v1.0.222 性能：schema 就绪标记——每次请求先 1 次轻查询，版本一致就跳过全部建表 DDL（实测每次省 1~2 秒）
const SCHEMA_VER = '2026-09-14a';
let __schemaOK = false;
async function ensureSchemaOnce() {
  if (__schemaOK) return;
  try {
    const r = await exec("SELECT v FROM tracking_lib WHERE k='schemaVer:verify' LIMIT 1");
    if (r.Rows && r.Rows.length) {
      let v = '';
      try { const row = JSON.parse(r.Rows[0]); v = String(JSON.parse(row[0] || '""')); } catch (e1) { v = ''; }
      if (v === SCHEMA_VER) { __schemaOK = true; return; }
    }
  } catch (e) { /* tracking_lib 尚不存在 → 走完整初始化 */ }
  await ensureTables();
  try {
    await exec("INSERT INTO tracking_lib (k, v, updated_at) VALUES ('schemaVer:verify', " + q(JSON.stringify(SCHEMA_VER)) + ", now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, updated_at=now()");
  } catch (e) { }
  __schemaOK = true;
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
    await ensureSchemaOnce();
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
