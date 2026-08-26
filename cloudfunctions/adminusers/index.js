// adminUsers (PG版) — 账号管理（仅 admin）
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
  await exec('CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, real_name TEXT NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL, role TEXT NOT NULL DEFAULT \'user\', enabled BOOLEAN NOT NULL DEFAULT true, failed_count INT NOT NULL DEFAULT 0, locked_until TIMESTAMP NULL, created_at TIMESTAMP DEFAULT now())');
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
      const r = await exec('SELECT id, username, real_name, role, enabled, failed_count, locked_until, created_at FROM users ORDER BY id');
      const list = (r.Rows || []).map(s => {
        const row = JSON.parse(s);
        const item = {};
        r.Columns.forEach((c, i) => { item[c] = row[i]; });
        return { id: item.id, username: item.username, realName: item.real_name, role: item.role, enabled: String(item.enabled) === 'true', failedCount: item.failed_count, lockedUntil: item.locked_until, createdAt: item.created_at };
      });
      return { ok: true, users: list };
    }

    if (action === 'add') {
      const username = String((data && data.username) || '').trim();
      const realName = String((data && data.realName) || '').trim();
      const password = String((data && data.password) || '');
      if (!username || !realName || password.length < 4) return { ok: false, msg: '账号/姓名/密码（至少4位）必填' };
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(password, salt, 64).toString('hex');
      await exec('INSERT INTO users (username, real_name, password_hash, salt, role, enabled) VALUES (' + q(username) + ', ' + q(realName) + ', ' + q(hash) + ', ' + q(salt) + ', ' + q('user') + ', true)');
      return { ok: true, msg: '账号 ' + username + ' 创建成功' };
    }

    if (action === 'resetPwd') {
      const username = String((data && data.username) || '').trim();
      const password = String((data && data.password) || '');
      if (!username || password.length < 4) return { ok: false, msg: '账号/密码（至少4位）必填' };
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(password, salt, 64).toString('hex');
      await exec('UPDATE users SET password_hash=' + q(hash) + ', salt=' + q(salt) + ', failed_count=0, locked_until=NULL WHERE username=' + q(username));
      await exec('DELETE FROM tokens WHERE username=' + q(username));
      return { ok: true, msg: '密码已重置' };
    }

    if (action === 'rename') {
      const oldName = String((data && data.oldUsername) || '').trim();
      const newName = String((data && data.newUsername) || '').trim();
      if (!oldName || !newName) return { ok: false, msg: '旧账号/新账号必填' };
      const chk = await exec('SELECT username FROM users WHERE username=' + q(newName) + ' LIMIT 1');
      if (chk.Rows && chk.Rows.length) return { ok: false, msg: '账号 ' + newName + ' 已存在' };
      await exec('UPDATE users SET username=' + q(newName) + ' WHERE username=' + q(oldName));
      await exec('DELETE FROM tokens WHERE username=' + q(oldName));
      await exec('UPDATE login_logs SET username=' + q(newName) + ' WHERE username=' + q(oldName));
      await exec('UPDATE usage_logs SET username=' + q(newName) + ' WHERE username=' + q(oldName));
      return { ok: true, msg: '账号已重命名为 ' + newName };
    }

    if (action === 'toggle') {
      const username = String((data && data.username) || '').trim();
      const enabled = data && data.enabled ? true : false;
      await exec('UPDATE users SET enabled=' + (enabled ? 'true' : 'false') + ' WHERE username=' + q(username));
      return { ok: true, msg: (enabled ? '已启用' : '已停用') + '账号 ' + username };
    }

    if (action === 'update') {
      const username = String((data && data.username) || '').trim();
      const realName = String((data && data.realName) || '').trim();
      if (!username || !realName) return { ok: false, msg: '账号/姓名必填' };
      await exec('UPDATE users SET real_name=' + q(realName) + ' WHERE username=' + q(username));
      return { ok: true, msg: '姓名已更新' };
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
