// init (PG版) — 首次创建管理员
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
    const r = await exec("SELECT v FROM tracking_lib WHERE k='schemaVer:init' LIMIT 1");
    if (r.Rows && r.Rows.length) {
      let v = '';
      try { const row = JSON.parse(r.Rows[0]); v = String(JSON.parse(row[0] || '""')); } catch (e1) { v = ''; }
      if (v === SCHEMA_VER) { __schemaOK = true; return; }
    }
  } catch (e) { /* tracking_lib 尚不存在 → 走完整初始化 */ }
  await ensureTables();
  try {
    await exec("INSERT INTO tracking_lib (k, v, updated_at) VALUES ('schemaVer:init', " + q(JSON.stringify(SCHEMA_VER)) + ", now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, updated_at=now()");
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
    const realName = String((evt && evt.realName) || '').trim();
    const password = String((evt && evt.password) || '');
    if (!username || !realName || password.length < 4) return { ok: false, msg: '账号/姓名/密码（至少4位）必填' };

    const res = await exec('SELECT COUNT(*) AS cnt FROM users');
    const row = JSON.parse(res.Rows[0]);
    if (parseInt(row[0], 10) > 0) return { ok: false, msg: '已存在管理员，初始化跳过' };

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    await exec('INSERT INTO users (username, real_name, password_hash, salt, role, enabled) VALUES (' + q(username) + ', ' + q(realName) + ', ' + q(hash) + ', ' + q(salt) + ', ' + q('admin') + ', true)');
    return { ok: true, msg: '管理员 ' + username + ' 创建成功' };
  } catch (e) {
    return { ok: false, msg: '服务器错误：' + (e.message || e) };
  }
};
