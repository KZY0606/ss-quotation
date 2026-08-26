// 登录云函数：校验账号密码、限流、签发 token、记登录日志
const crypto = require('crypto');
const cloud = require('@cloudbase/node-sdk');
const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();

const TOKEN_TTL = 12 * 3600 * 1000; // token 有效期 12 小时
const MAX_FAIL = 5;                  // 连续失败 5 次
const LOCK_MS = 15 * 60 * 1000;      // 锁 15 分钟

function hashPwd(salt, pwd) {
  return crypto.scryptSync(String(pwd), String(salt), 64).toString('hex');
}

exports.main = async (event) => {
  const username = String((event && event.username) || '').trim();
  const password = String((event && event.password) || '');
  if (!username || !password) return { ok: false, msg: '请输入账号和密码' };
  try {
    const res = await db.collection('users').where({ username }).limit(1).get();
    const user = res.data[0];
    const log = async (success, msg) => {
      try {
        await db.collection('login_logs').add({
          username, realName: user ? user.realName : '', time: Date.now(), success, msg
        });
      } catch (e) { /* 日志失败不影响登录 */ }
    };
    if (!user) { await log(false, '账号不存在'); return { ok: false, msg: '账号或密码错误' }; }
    if (!user.enabled) { await log(false, '账号已停用'); return { ok: false, msg: '账号已停用，请联系管理员' }; }

    const now = Date.now();
    if (user.lockUntil && user.lockUntil > now) {
      const left = Math.ceil((user.lockUntil - now) / 60000);
      await log(false, '锁定中');
      return { ok: false, msg: '失败次数过多，请 ' + left + ' 分钟后重试' };
    }

    const hash = hashPwd(user.salt, password);
    if (hash !== user.passwordHash) {
      const failCount = (user.failCount || 0) + 1;
      let lockUntil = null;
      let msg = '密码错误，还可尝试 ' + (MAX_FAIL - failCount) + ' 次';
      if (failCount >= MAX_FAIL) { lockUntil = now + LOCK_MS; msg = '密码错误次数过多，账号已锁定 15 分钟'; }
      await db.collection('users').doc(user._id).update({ failCount, lockUntil });
      await log(false, msg);
      return { ok: false, msg };
    }

    // 登录成功
    const token = crypto.randomBytes(24).toString('hex');
    const expireAt = now + TOKEN_TTL;
    await db.collection('tokens').add({ token, username, expireAt, createdAt: now });
    await db.collection('users').doc(user._id).update({ failCount: 0, lockUntil: null, lastLogin: now });
    await log(true, '登录成功');
    return { ok: true, token, username, realName: user.realName, role: user.role, expireAt };
  } catch (e) {
    return { ok: false, msg: '服务器错误：' + e.message };
  }
};
