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

    // v1.0.131: 清理测试数据（username 以 test 开头的登录/使用记录）——必须先于 type 分支判断
    if (evt.action === 'clearTest') {
      await exec("DELETE FROM usage_logs WHERE username LIKE 'test%'");
      await exec("DELETE FROM login_logs WHERE username LIKE 'test%'");
      return { ok: true, msg: '测试数据已清理' };
    }

    if (type === 'login') {
      // v1.0.131: 排除 admin（老板自己）的登录记录
      const r = await exec('SELECT l.username, u.real_name, l.ip, l.success, l.reason, to_char(l.created_at, \'YYYY-MM-DD HH24:MI:SS\') AS created_at FROM login_logs l LEFT JOIN users u ON u.username = l.username WHERE l.created_at > now() - interval ' + q(days + ' days') + ' AND (u.role IS NULL OR u.role != \'admin\') ORDER BY l.id DESC LIMIT 500');
      const list = rowsToArray(r).map(x => ({ username: x.username, realName: x.real_name, ip: x.ip, success: String(x.success) === 'true', reason: x.reason, createdAt: x.created_at }));
      return { ok: true, logs: list };
    }

    if (type === 'usage') {
      // v1.0.131: 排除 admin 记录；同批次（batch_id）合并为一条，items 含明细
      const r = await exec('SELECT l.username, u.real_name, l.material, l.spec, l.surface, l.calc_mode, l.unit_price, l.batch_id, to_char(l.created_at, \'YYYY-MM-DD HH24:MI:SS\') AS created_at FROM usage_logs l LEFT JOIN users u ON u.username = l.username WHERE l.created_at > now() - interval ' + q(days + ' days') + ' AND (u.role IS NULL OR u.role != \'admin\') ORDER BY l.id DESC LIMIT 500');
      const rows = rowsToArray(r).map(x => ({ username: x.username, realName: x.real_name, material: x.material, spec: x.spec, surface: x.surface, calcMode: x.calc_mode, unitPrice: x.unit_price === null ? null : Number(x.unit_price), batchId: x.batch_id, createdAt: x.created_at }));
      const groups = [];
      const idx = {};
      for (let i = rows.length - 1; i >= 0; i--) { // 从旧到新，同批次合并
        const x = rows[i];
        const key = (x.batchId && String(x.batchId).trim()) ? String(x.batchId) : ('__single_' + i);
        if (idx[key] === undefined) {
          idx[key] = groups.length;
          groups.push({ batchId: (x.batchId && String(x.batchId).trim()) || null, username: x.username, realName: x.realName, count: 0, createdAt: x.createdAt, items: [] });
        }
        const g = groups[idx[key]];
        g.count++;
        g.items.push({ material: x.material, spec: x.spec, surface: x.surface, calcMode: x.calcMode, unitPrice: x.unitPrice, createdAt: x.createdAt });
      }
      groups.reverse(); // 新批次在前
      groups.forEach(g => { g.items.reverse(); }); // 批内旧→新
      return { ok: true, groups: groups };
    }

    return { ok: false, msg: '未知日志类型: ' + type };
  } catch (e) {
    return { ok: false, msg: '服务器错误：' + (e.message || e) };
  }
};
