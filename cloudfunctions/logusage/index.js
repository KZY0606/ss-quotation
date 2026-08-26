// logUsage 云函数：记录报价使用行为（谁、何时、报了什么摘要）
const cloud = require('@cloudbase/node-sdk');
const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();

exports.main = async (event) => {
  const token = String((event && event.token) || '');
  const item = (event && event.item) || {};
  if (!token) return { ok: false, msg: '未登录' };
  try {
    // 校验 token + 账号启用
    const tres = await db.collection('tokens').where({ token }).limit(1).get();
    const t = tres.data[0];
    if (!t || t.expireAt < Date.now()) return { ok: false, msg: '登录已失效' };
    const ures = await db.collection('users').where({ username: t.username }).limit(1).get();
    const user = ures.data[0];
    if (!user || !user.enabled) return { ok: false, msg: '账号已停用' };

    // 记录摘要（不含基价/成本等敏感项，可按需调整）
    await db.collection('usage_logs').add({
      username: user.username,
      realName: user.realName,
      time: Date.now(),
      material: item.material || '',
      spec: item.spec || '',        // 如 "1.80*1240*C"
      surface: item.surface || '',
      calcMode: item.calcMode || '',
      unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : null, // 报出的单价（含税成本价）
      quantity: item.quantity || null
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: '服务器错误：' + e.message };
  }
};
