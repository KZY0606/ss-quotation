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

async function ensureTables() {
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
    await ensureTables();
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
    await exec('INSERT INTO usage_logs (username, material, spec, surface, calc_mode, unit_price) VALUES (' + q(tk.username) + ', ' + q(material) + ', ' + q(spec) + ', ' + q(surface) + ', ' + q(calcMode) + ', ' + (unitPrice === null ? 'NULL' : unitPrice) + ')');
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: '服务器错误：' + (e.message || e) };
  }
};
