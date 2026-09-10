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
      // v1.0.191（2026-09-10 用户要求）：报价记录包含管理员（老板自己）的报价；同批次（batch_id）合并为一条，items 含明细
      // v1.0.192（2026-09-10 用户反馈「其他人的报价记录也没有了」）：老写法按**原始记录条数** LIMIT 500，
      // 而管理员账号常在一次批量报价里产生上百条记录 → 几个大批次就把 500 条额度占满，其他同事的批次被挤出窗口。
      // 改为**按批次聚合**：先取最近 200 个批次（无 batch_id 的老记录按单条算一个批次），每批最多带 10 条明细，
      // cnt 为该批真实条数（前端照旧显示「共 N 条报价」），hidden 为未展开的明细条数。
      const grp = "COALESCE(NULLIF(l.batch_id, ''), 'single-' || l.id)";
      const usageSql = 'SELECT t.username, u.real_name, u.role, t.material, t.spec, t.surface, t.calc_mode, t.unit_price, t.batch_id, t.cnt, to_char(t.created_at, \'YYYY-MM-DD HH24:MI:SS\') AS created_at FROM ('
        + 'SELECT l.*, ROW_NUMBER() OVER (PARTITION BY ' + grp + ' ORDER BY l.id DESC) AS rn, COUNT(*) OVER (PARTITION BY ' + grp + ') AS cnt, ' + grp + ' AS gkey FROM usage_logs l'
        + ' WHERE l.created_at > now() - interval ' + q(days + ' days')
        + ' AND ' + grp + ' IN (SELECT ' + grp + ' FROM usage_logs WHERE created_at > now() - interval ' + q(days + ' days') + ' GROUP BY ' + grp + ' ORDER BY MAX(id) DESC LIMIT 200)'
        + ') t LEFT JOIN users u ON u.username = t.username WHERE t.rn <= 10 ORDER BY t.id DESC';
      const r = await exec(usageSql);
      const rows = rowsToArray(r).map(x => ({ username: x.username, realName: x.real_name, role: x.role, material: x.material, spec: x.spec, surface: x.surface, calcMode: x.calc_mode, unitPrice: x.unit_price === null ? null : Number(x.unit_price), batchId: x.batch_id, cnt: x.cnt === null || x.cnt === undefined ? null : Number(x.cnt), createdAt: x.created_at }));
      const groups = [];
      const idx = {};
      for (let i = rows.length - 1; i >= 0; i--) { // 从旧到新，同批次合并
        const x = rows[i];
        const key = (x.batchId && String(x.batchId).trim()) ? String(x.batchId) : ('__single_' + i);
        if (idx[key] === undefined) {
          idx[key] = groups.length;
          groups.push({ batchId: (x.batchId && String(x.batchId).trim()) || null, username: x.username, realName: x.realName, role: x.role, count: 0, total: (x.cnt || 0), createdAt: x.createdAt, items: [] });
        }
        const g = groups[idx[key]];
        g.count++;
        g.items.push({ material: x.material, spec: x.spec, surface: x.surface, calcMode: x.calcMode, unitPrice: x.unitPrice, createdAt: x.createdAt });
      }
      groups.reverse(); // 新批次在前
      groups.forEach(g => { g.items.reverse(); }); // 批内旧→新
      // v1.0.192：count = 真实条数（来自窗口计数），shown = 实际返回的明细数，hidden = 未展开条数
      groups.forEach(g => { g.count = g.total || g.count; g.shown = g.items.length; g.hidden = Math.max(0, g.count - g.shown); });
      return { ok: true, groups: groups };
    }

    return { ok: false, msg: '未知日志类型: ' + type };
  } catch (e) {
    return { ok: false, msg: '服务器错误：' + (e.message || e) };
  }
};
