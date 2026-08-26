// adminLogs (PG版) — 查询登录/使用日志（仅 admin）
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
  await exec('CREATE TABLE IF NOT EXISTS login_logs (id SERIAL PRIMARY KEY, username TEXT NOT NULL, ip TEXT, success BOOLEAN NOT NULL, reason TEXT, created_at TIMESTAMP DEFAULT now())');
  await exec('CREATE TABLE IF NOT EXISTS usage_logs (id SERIAL PRIMARY KEY, username TEXT NOT NULL, material TEXT, spec TEXT, surface TEXT, calc_mode TEXT, unit_price NUMERIC, created_at TIMESTAMP DEFAULT now())');
}

function parseEvt(ev) {
  if (ev && ev.body) {
    try { return JSON.parse(ev.body); } catch (e) {}
  }
  return ev || {};
}

async function checkAdmin(token) {
  if (!token) return null;
  const r = await exec('SELECT t.username, t.role, u.enabled FROM tokens t LEFT JOIN users u ON u.username = t.username WHERE t.token=' + q(token) + ' AND t.expires_at > now() LIMIT 1');
  if (!r.Rows || !r.Rows.length) return null;
  const row = JSON.parse(r.Rows[0]);
  const item = {};
  r.Columns.forEach((c, i) => { item[c] = row[i]; });
  if (String(item.enabled) !== 'true') return null;
  if (item.role !== 'admin') return null;
  return item;
}

function rowsToArray(r) {
  return (r.Rows || []).map(s => {
    const row = JSON.parse(s);
    const item = {};
    r.Columns.forEach((c, i) => { item[c] = row[i]; });
    return item;
  });
}

exports.main = async (event) => {
  const evt = parseEvt(event);
  try {
    await ensureTables();
    const token = String((evt && evt.token) || '').trim();
    const type = String((evt && evt.type) || 'login').trim();
    const days = parseInt((evt && evt.days) || 7, 10) || 7;
    const admin = await checkAdmin(token);
    if (!admin) return { ok: false, msg: '无权限或登录已过期' };

    if (type === 'login') {
      const r = await exec('SELECT l.username, u.real_name, l.ip, l.success, l.reason, l.created_at FROM login_logs l LEFT JOIN users u ON u.username = l.username WHERE l.created_at > now() - interval ' + q(days + ' days') + ' ORDER BY l.id DESC LIMIT 500');
      const list = rowsToArray(r).map(x => ({ username: x.username, realName: x.real_name, ip: x.ip, success: String(x.success) === 'true', reason: x.reason, createdAt: x.created_at }));
      return { ok: true, logs: list };
    }

    if (type === 'usage') {
      const r = await exec('SELECT l.username, u.real_name, l.material, l.spec, l.surface, l.calc_mode, l.unit_price, l.created_at FROM usage_logs l LEFT JOIN users u ON u.username = l.username WHERE l.created_at > now() - interval ' + q(days + ' days') + ' ORDER BY l.id DESC LIMIT 500');
      const list = rowsToArray(r).map(x => ({ username: x.username, realName: x.real_name, material: x.material, spec: x.spec, surface: x.surface, calcMode: x.calc_mode, unitPrice: x.unit_price === null ? null : Number(x.unit_price), createdAt: x.created_at }));
      return { ok: true, logs: list };
    }

    return { ok: false, msg: '未知日志类型: ' + type };
  } catch (e) {
    return { ok: false, msg: '服务器错误：' + (e.message || e) };
  }
};
