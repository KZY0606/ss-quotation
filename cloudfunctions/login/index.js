// login (PG版) — 账号密码登录
const crypto = require('crypto');
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
    const r = await exec("SELECT v FROM tracking_lib WHERE k='schemaVer:login' LIMIT 1");
    if (r.Rows && r.Rows.length) {
      let v = '';
      try { const row = JSON.parse(r.Rows[0]); v = String(JSON.parse(row[0] || '""')); } catch (e1) { v = ''; }
      if (v === SCHEMA_VER) { __schemaOK = true; return; }
    }
  } catch (e) { /* tracking_lib 尚不存在 → 走完整初始化 */ }
  await ensureTables();
  try {
    await exec("INSERT INTO tracking_lib (k, v, updated_at) VALUES ('schemaVer:login', " + q(JSON.stringify(SCHEMA_VER)) + ", now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, updated_at=now()");
  } catch (e) { }
  __schemaOK = true;
}
async function ensureTables() {
  await exec('CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, real_name TEXT NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL, role TEXT NOT NULL DEFAULT \'user\', enabled BOOLEAN NOT NULL DEFAULT true, failed_count INT NOT NULL DEFAULT 0, locked_until TIMESTAMP NULL, created_at TIMESTAMP DEFAULT now())');
  await exec('CREATE TABLE IF NOT EXISTS tokens (id SERIAL PRIMARY KEY, token TEXT UNIQUE NOT NULL, username TEXT NOT NULL, role TEXT NOT NULL, expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP DEFAULT now())');
  await exec('CREATE TABLE IF NOT EXISTS login_logs (id SERIAL PRIMARY KEY, username TEXT NOT NULL, ip TEXT, success BOOLEAN NOT NULL, reason TEXT, created_at TIMESTAMP DEFAULT now())');
  await exec('CREATE TABLE IF NOT EXISTS usage_logs (id SERIAL PRIMARY KEY, username TEXT NOT NULL, material TEXT, spec TEXT, surface TEXT, calc_mode TEXT, unit_price NUMERIC, created_at TIMESTAMP DEFAULT now())');
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
    const username = String((evt && evt.username) || '').trim();
    const password = String((evt && evt.password) || '');
    if (!username || !password || password.length < 4) return { ok: false, msg: '账号和密码（至少4位）必填' };

    const res = await exec('SELECT * FROM users WHERE username=' + q(username) + ' LIMIT 1');
    if (!res.Rows || !res.Rows.length) {
      await exec('INSERT INTO login_logs (username, ip, success, reason) VALUES (' + q(username) + ', ' + q(evt.ip || '') + ', false, ' + q('账号不存在') + ')');
      return { ok: false, msg: '账号或密码错误' };
    }
    const row = JSON.parse(res.Rows[0]);
    const user = {};
    res.Columns.forEach((c, i) => { user[c] = row[i]; });

    if (String(user.enabled) !== 'true') return { ok: false, msg: '账号已被停用，请联系管理员' };
    if (user.locked_until) {
      const lu = new Date(user.locked_until);
      if (lu > new Date()) return { ok: false, msg: '失败次数过多，账号已锁定，请15分钟后再试' };
    }
    const hash = crypto.scryptSync(password, user.salt, 64).toString('hex');
    if (hash !== user.password_hash) {
      const fail = (parseInt(user.failed_count) || 0) + 1;
      const lock = fail >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await exec('UPDATE users SET failed_count=' + fail + ', locked_until=' + (lock ? q(lock.toISOString()) : 'NULL') + ' WHERE id=' + user.id);
      await exec('INSERT INTO login_logs (username, ip, success, reason) VALUES (' + q(username) + ', ' + q(evt.ip || '') + ', false, ' + q('密码错误') + ')');
      return { ok: false, msg: fail >= 5 ? '失败次数过多，账号锁定15分钟' : '账号或密码错误' };
    }
    await exec('UPDATE users SET failed_count=0, locked_until=NULL WHERE id=' + user.id);
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 12 * 3600 * 1000);
    await exec('INSERT INTO tokens (token, username, role, expires_at) VALUES (' + q(token) + ', ' + q(username) + ', ' + q(user.role) + ', ' + q(expires.toISOString()) + ')');
    await exec('INSERT INTO login_logs (username, ip, success, reason) VALUES (' + q(username) + ', ' + q(evt.ip || '') + ', true, ' + q('') + ')');
    return { ok: true, token: token, username: username, realName: user.real_name, role: user.role, expiresAt: expires.toISOString() };
  } catch (e) {
    return { ok: false, msg: '服务器错误：' + (e.message || e) };
  }
};
