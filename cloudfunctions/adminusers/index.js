// adminUsers (PG版) — 账号管理（仅 admin）
// 角色模型：admin=管理员(全权限)；其余任意角色(业务员salesman/业务主管sales_supervisor/自定义)=报价权限
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

async function ensureTables() {
  await exec('CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, real_name TEXT NOT NULL, department TEXT DEFAULT \'\', password_hash TEXT NOT NULL, salt TEXT NOT NULL, role TEXT NOT NULL DEFAULT \'salesman\', enabled BOOLEAN NOT NULL DEFAULT true, failed_count INT NOT NULL DEFAULT 0, locked_until TIMESTAMP NULL, created_at TIMESTAMP DEFAULT now())');
  await exec('CREATE TABLE IF NOT EXISTS login_logs (id SERIAL PRIMARY KEY, username TEXT NOT NULL, ip TEXT, success BOOLEAN NOT NULL, reason TEXT, created_at TIMESTAMP DEFAULT now())');
  // 旧表补列（幂等）
  await exec('ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT DEFAULT \'\'');
}

function parseEvt(ev) {
  if (ev && ev.body) {
    try { return JSON.parse(ev.body); } catch (e) {}
  }
  return ev || {};
}

// 校验 admin token
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
    const action = String((evt && evt.action) || '').trim();
    const data = (evt && evt.data) || {};
    const admin = await checkAdmin(token);
    if (!admin) return { ok: false, msg: '无权限或登录已过期' };

    if (action === 'list') {
      const r = await exec('SELECT u.id, u.username, u.real_name, u.department, u.role, u.enabled, u.failed_count, u.locked_until, to_char(u.created_at, \'YYYY-MM-DD HH24:MI:SS\') AS created_at, to_char((SELECT MAX(l.created_at) FROM login_logs l WHERE l.username = u.username), \'YYYY-MM-DD HH24:MI:SS\') AS last_login FROM users u ORDER BY u.id');
      const list = rowsToArray(r).map(x => ({
        id: x.id, username: x.username, realName: x.real_name, department: x.department || '',
        role: x.role, enabled: String(x.enabled) === 'true', failedCount: x.failed_count,
        lockedUntil: x.locked_until, createdAt: x.created_at, lastLogin: x.last_login
      }));
      return { ok: true, users: list };
    }

    if (action === 'add') {
      const username = String((data && data.username) || '').trim();
      const realName = String((data && data.realName) || '').trim();
      const department = String((data && data.department) || '').trim();
      const password = String((data && data.password) || '');
      let role = String((data && data.role) || 'salesman').trim() || 'salesman';
      if (!username || !realName || password.length < 4) return { ok: false, msg: '账号/姓名/密码（至少4位）必填' };
      if (!/^[A-Za-z0-9_\-]{2,20}$/.test(username)) return { ok: false, msg: '账号限字母/数字/下划线/短横线，2-20位' };
      const chk = await exec('SELECT username FROM users WHERE username=' + q(username) + ' LIMIT 1');
      if (chk.Rows && chk.Rows.length) return { ok: false, msg: '账号 ' + username + ' 已存在' };
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(password, salt, 64).toString('hex');
      await exec('INSERT INTO users (username, real_name, department, password_hash, salt, role, enabled) VALUES (' + q(username) + ', ' + q(realName) + ', ' + q(department) + ', ' + q(hash) + ', ' + q(salt) + ', ' + q(role) + ', true)');
      return { ok: true, msg: '账号 ' + username + ' 创建成功' };
    }

    if (action === 'update') {
      const username = String((data && data.username) || '').trim();
      if (!username) return { ok: false, msg: '缺少账号' };
      const isSelf = username === admin.username;
      // 目标账号存在性
      const t = await exec('SELECT username, role FROM users WHERE username=' + q(username) + ' LIMIT 1');
      if (!t.Rows || !t.Rows.length) return { ok: false, msg: '账号不存在' };

      const newUsername = String((data && data.newUsername) || '').trim() || username;
      const realName = String((data && data.realName) || '').trim();
      const department = String((data && data.department) || '').trim();
      const role = String((data && data.role) || '').trim();

      // 保护当前登录账号：不能改账号名、不能降级为非管理员（防止锁死自己）；姓名/部门可改
      if (isSelf) {
        if (newUsername !== username) return { ok: false, msg: '不能修改当前登录账号的账号名' };
        if (role && role !== 'admin') return { ok: false, msg: '不能降级当前登录的管理员' };
      }

      if (newUsername !== username) {
        if (!/^[A-Za-z0-9_\-]{2,20}$/.test(newUsername)) return { ok: false, msg: '账号限字母/数字/下划线/短横线，2-20位' };
        const chk = await exec('SELECT username FROM users WHERE username=' + q(newUsername) + ' LIMIT 1');
        if (chk.Rows && chk.Rows.length) return { ok: false, msg: '账号 ' + newUsername + ' 已存在' };
        await exec('UPDATE users SET username=' + q(newUsername) + ' WHERE username=' + q(username));
        await exec('UPDATE login_logs SET username=' + q(newUsername) + ' WHERE username=' + q(username));
        await exec('UPDATE usage_logs SET username=' + q(newUsername) + ' WHERE username=' + q(username));
        await exec('DELETE FROM tokens WHERE username=' + q(username));
      }
      if (realName) await exec('UPDATE users SET real_name=' + q(realName) + ' WHERE username=' + q(newUsername));
      if (department !== undefined && department !== null) await exec('UPDATE users SET department=' + q(department) + ' WHERE username=' + q(newUsername));
      if (role) {
        await exec('UPDATE users SET role=' + q(role) + ' WHERE username=' + q(newUsername));
        await exec('UPDATE tokens SET role=' + q(role) + ' WHERE username=' + q(newUsername));
      }
      return { ok: true, msg: '账号 ' + newUsername + ' 已更新' };
    }

    if (action === 'resetPwd') {
      const username = String((data && data.username) || '').trim();
      const password = String((data && data.password) || '');
      if (!username || password.length < 4) return { ok: false, msg: '账号/密码（至少4位）必填' };
      if (username === admin.username) return { ok: false, msg: '当前登录的管理员密码不可在此重置' };
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(password, salt, 64).toString('hex');
      await exec('UPDATE users SET password_hash=' + q(hash) + ', salt=' + q(salt) + ', failed_count=0, locked_until=NULL WHERE username=' + q(username));
      await exec('DELETE FROM tokens WHERE username=' + q(username));
      return { ok: true, msg: '密码已重置' };
    }

    if (action === 'toggle') {
      const username = String((data && data.username) || '').trim();
      const enabled = data && data.enabled ? true : false;
      if (username === admin.username) return { ok: false, msg: '不能停用当前登录的管理员' };
      await exec('UPDATE users SET enabled=' + (enabled ? 'true' : 'false') + ' WHERE username=' + q(username));
      if (!enabled) await exec('DELETE FROM tokens WHERE username=' + q(username));
      return { ok: true, msg: (enabled ? '已启用' : '已停用') + '账号 ' + username };
    }

    if (action === 'remove') {
      const username = String((data && data.username) || '').trim();
      if (!username) return { ok: false, msg: '缺少账号' };
      if (username === admin.username) return { ok: false, msg: '不能删除当前登录的管理员' };
      await exec('DELETE FROM tokens WHERE username=' + q(username));
      await exec('DELETE FROM users WHERE username=' + q(username));
      return { ok: true, msg: '账号 ' + username + ' 已删除' };
    }

    return { ok: false, msg: '未知操作: ' + action };
  } catch (e) {
    return { ok: false, msg: '服务器错误：' + (e.message || e) };
  }
};
