// adminUsers 云函数：账号管理（仅 admin 角色可调）
// actions: list / add / resetPwd / toggle / remove
const crypto = require('crypto');
const cloud = require('@cloudbase/node-sdk');
const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();

function hashPwd(salt, pwd) {
  return crypto.scryptSync(String(pwd), String(salt), 64).toString('hex');
}

// 校验调用者必须是启用中的 admin
async function requireAdmin(token) {
  if (!token) return { error: '未登录' };
  const tres = await db.collection('tokens').where({ token }).limit(1).get();
  const t = tres.data[0];
  if (!t || t.expireAt < Date.now()) return { error: '登录已失效' };
  const ures = await db.collection('users').where({ username: t.username }).limit(1).get();
  const user = ures.data[0];
  if (!user || !user.enabled) return { error: '账号已停用' };
  if (user.role !== 'admin') return { error: '无权限，仅管理员可操作' };
  return { user };
}

exports.main = async (event) => {
  const token = String((event && event.token) || '');
  const action = String((event && event.action) || '');
  const data = (event && event.data) || {};
  try {
    const auth = await requireAdmin(token);
    if (auth.error) return { ok: false, msg: auth.error };

    switch (action) {
      case 'list': {
        const res = await db.collection('users').orderBy('createdAt', 'desc').limit(100).get();
        const list = res.data.map(u => ({
          username: u.username, realName: u.realName, role: u.role,
          enabled: !!u.enabled, lastLogin: u.lastLogin || null, createdAt: u.createdAt || null
        }));
        return { ok: true, list };
      }
      case 'add': {
        const username = String(data.username || '').trim();
        const realName = String(data.realName || '').trim();
        const role = data.role === 'admin' ? 'admin' : 'user';
        const password = String(data.password || '');
        if (!username || !password || !realName) return { ok: false, msg: '账号/姓名/密码不能为空' };
        if (!/^[a-zA-Z0-9_]{2,20}$/.test(username)) return { ok: false, msg: '账号只能由字母/数字/下划线组成，2-20 位' };
        if (password.length < 4) return { ok: false, msg: '密码至少 4 位' };
        const dup = await db.collection('users').where({ username }).limit(1).get();
        if (dup.data.length > 0) return { ok: false, msg: '账号已存在' };
        const salt = crypto.randomBytes(8).toString('hex');
        const passwordHash = hashPwd(salt, password);
        await db.collection('users').add({
          username, realName, role, salt, passwordHash,
          enabled: true, failCount: 0, lockUntil: null, createdAt: Date.now(), lastLogin: null
        });
        return { ok: true, msg: '已创建账号 ' + username };
      }
      case 'resetPwd': {
        const username = String(data.username || '').trim();
        const password = String(data.password || '');
        if (!username || password.length < 4) return { ok: false, msg: '账号和不少于 4 位的新密码必填' };
        const res = await db.collection('users').where({ username }).limit(1).get();
        const user = res.data[0];
        if (!user) return { ok: false, msg: '账号不存在' };
        const salt = crypto.randomBytes(8).toString('hex');
        const passwordHash = hashPwd(salt, password);
        await db.collection('users').doc(user._id).update({ salt, passwordHash, failCount: 0, lockUntil: null });
        return { ok: true, msg: '已重置 ' + username + ' 的密码' };
      }
      case 'toggle': {
        const username = String(data.username || '').trim();
        const enabled = !!data.enabled;
        if (!username) return { ok: false, msg: '账号必填' };
        const res = await db.collection('users').where({ username }).limit(1).get();
        const user = res.data[0];
        if (!user) return { ok: false, msg: '账号不存在' };
        if (user.role === 'admin' && !enabled) return { ok: false, msg: '不能停用管理员账号' };
        await db.collection('users').doc(user._id).update({ enabled });
        return { ok: true, msg: enabled ? '已启用 ' + username : '已停用 ' + username };
      }
      case 'remove': {
        const username = String(data.username || '').trim();
        if (!username) return { ok: false, msg: '账号必填' };
        const res = await db.collection('users').where({ username }).limit(1).get();
        const user = res.data[0];
        if (!user) return { ok: false, msg: '账号不存在' };
        if (user.role === 'admin') return { ok: false, msg: '不能删除管理员账号' };
        await db.collection('users').doc(user._id).remove();
        // 清理该用户的 token
        const tokens = await db.collection('tokens').where({ username }).limit(100).get();
        for (const t of tokens.data) { await db.collection('tokens').doc(t._id).remove().catch(() => {}); }
        return { ok: true, msg: '已删除账号 ' + username };
      }
      default:
        return { ok: false, msg: '未知操作' };
    }
  } catch (e) {
    return { ok: false, msg: '服务器错误：' + e.message };
  }
};
