// adminLogs 云函数：日志查询（仅 admin 角色可调）
// type: 'login' | 'usage' | 'users'；days: 最近 N 天（默认 7）
const cloud = require('@cloudbase/node-sdk');
const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();

exports.main = async (event) => {
  const token = String((event && event.token) || '');
  const type = String((event && event.type) || 'login');
  const days = Math.min(parseInt((event && event.days) || 7, 10) || 7, 90);
  try {
    const tres = await db.collection('tokens').where({ token }).limit(1).get();
    const t = tres.data[0];
    if (!t || t.expireAt < Date.now()) return { ok: false, msg: '登录已失效' };
    const ures = await db.collection('users').where({ username: t.username }).limit(1).get();
    const user = ures.data[0];
    if (!user || !user.enabled) return { ok: false, msg: '账号已停用' };
    if (user.role !== 'admin') return { ok: false, msg: '无权限，仅管理员可查看' };

    const since = Date.now() - days * 24 * 3600 * 1000;
    const coll = type === 'usage' ? 'usage_logs' : 'login_logs';
    const res = await db.collection(coll).where({ time: db.command.gte(since) }).orderBy('time', 'desc').limit(200).get();
    return { ok: true, list: res.data };
  } catch (e) {
    return { ok: false, msg: '服务器错误：' + e.message };
  }
};
