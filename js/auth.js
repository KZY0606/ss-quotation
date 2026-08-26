// KK 报价系统 - 登录鉴权模块 (v1.0.116)
// 依赖：后端云函数 HTTP 触发器（login/verify/logUsage/adminUsers/adminLogs）
(function () {
  var KK_API = 'https://kk-quotation-d2gtggelpcd901498.service.tcloudbase.com';
  var KK_AUTH_KEY = 'kk_auth';
  var isHttp = location.protocol === 'http:' || location.protocol === 'https:';

  async function kkCall(fn, data) {
    var r = await fetch(KK_API + '/' + fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {})
    });
    if (!r.ok) throw new Error('网络错误 ' + r.status);
    return r.json();
  }

  function kkGetAuth() {
    try { return JSON.parse(localStorage.getItem(KK_AUTH_KEY)); } catch (e) { return null; }
  }
  function kkSetAuth(a) { localStorage.setItem(KK_AUTH_KEY, JSON.stringify(a)); }
  function kkClearAuth() { localStorage.removeItem(KK_AUTH_KEY); }

  // 校验本地 token 是否仍有效（后端同时校验账号是否被停用）
  async function kkVerify() {
    var a = kkGetAuth();
    if (!a || !a.token) return null;
    try {
      var r = await kkCall('verify', { token: a.token });
      if (r && r.ok) return a;
    } catch (e) {}
    kkClearAuth();
    return null;
  }

  // 登录拦截：未登录/失效跳登录页；本地 file:// 开发模式跳过
  async function kkRequireLogin() {
    if (!isHttp) return null;
    var a = await kkVerify();
    if (!a) {
      var rd = encodeURIComponent(location.pathname + location.search);
      location.href = 'login.html?redirect=' + rd;
      return null;
    }
    return a;
  }

  async function kkLogin(username, password) {
    var r = await kkCall('login', { username: username, password: password });
    if (r && r.ok) {
      kkSetAuth({ token: r.token, username: r.username, realName: r.realName, role: r.role, expireAt: r.expireAt });
    }
    return r;
  }

  function kkLogout() { kkClearAuth(); location.href = 'login.html'; }

  // 报价使用上报（异步，失败不影响报价）
  async function kkReportUsage(item) {
    if (!isHttp) return;
    var a = kkGetAuth();
    if (!a || !a.token) return;
    try { await kkCall('logUsage', { token: a.token, item: item }); } catch (e) {}
  }

  window.KKAuth = {
    call: kkCall, isHttp: isHttp,
    getAuth: kkGetAuth, setAuth: kkSetAuth, clearAuth: kkClearAuth,
    verify: kkVerify, requireLogin: kkRequireLogin,
    login: kkLogin, logout: kkLogout, reportUsage: kkReportUsage
  };
})();
