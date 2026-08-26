// init 云函数：初始化系统 —— 仅在 users 集合为空时创建第一个管理员账号
// 部署完成后调用一次（如通过控制台"云端测试"），之后可删除该函数
const crypto = require('crypto');
const cloud = require('@cloudbase/node-sdk');
const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();

function hashPwd(salt, pwd) {
  return crypto.scryptSync(String(pwd), String(salt), 64).toString('hex');
}

exports.main = async (event) => {
  const username = String((event && event.username) || '').trim();
  const realName = String((event && event.realName) || '').trim();
  const password = String((event && event.password) || '');
  if (!username || !realName || password.length < 4) return { ok: false, msg: '账号/姓名/密码（至少4位）必填' };
  try {
    const existing = await db.collection('users').limit(1).get();
    if (existing.data.length > 0) return { ok: false, msg: '系统已初始化，禁止重复创建管理员' };
    const salt = crypto.randomBytes(8).toString('hex');
    const passwordHash = hashPwd(salt, password);
    await db.collection('users').add({
      username, realName, role: 'admin', salt, passwordHash,
      enabled: true, failCount: 0, lockUntil: null, createdAt: Date.now(), lastLogin: null
    });
    return { ok: true, msg: '管理员 ' + username + ' 创建成功' };
  } catch (e) {
    return { ok: false, msg: '服务器错误：' + e.message };
  }
};
