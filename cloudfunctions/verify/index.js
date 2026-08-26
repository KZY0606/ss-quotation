// verify 云函数：校验 token 是否有效、账号是否仍启用
const cloud = require('@cloudbase/node-sdk');
const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();

exports.main = async (event) => {
  const token = String((event && event.token) || '');
  if (!token) return { ok: false, valid: false, msg: '未登录' };
  try {
    const res = await db.collection('tokens').where({ token }).limit(1).get();
    const t = res.data[0];
    if (!t) return { ok: false, valid: false, msg: '登录已失效，请重新登录' };
    if (t.expireAt < Date.now()) {
      await db.collection('tokens').doc(t._id).remove().catch(() => {});
      return { ok: false, valid: false, msg: '登录已过期，请重新登录' };
    }
    const ures = await db.collection('users').where({ username: t.username }).limit(1).get();
    const user = ures.data[0];
    if (!user || !user.enabled) return { ok: false, valid: false, msg: '账号已停用' };
    return { ok: true, valid: true, username: user.username, realName: user.realName, role: user.role };
  } catch (e) {
    return { ok: false, valid: false, msg: '服务器错误：' + e.message };
  }
};
