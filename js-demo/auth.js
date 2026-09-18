// KK 报价演示模板 - 演示模式鉴权（免登录 / 无后端）
// 说明：本文件仅供 GitHub Pages 演示站使用，源码中的 js/auth.js（正式版，接腾讯云后端）不受影响。
//       演示站不连接任何后端服务：所有云端调用一律返回失败，业务层对同步类调用已有容错，
//       基价 / 保护膜 / 价格设置均使用页面内置默认值，报价计算完全在浏览器本地完成。
(function () {
  var DEMO_USER = {
    token: 'demo-token',
    username: 'demo',
    realName: '演示用户',
    department: '演示环境',
    role: 'user',
    expireAt: ''
  };
  var isHttp = location.protocol === 'http:' || location.protocol === 'https:';

  async function kkCall() {
    return { ok: false, demo: true, msg: '演示站未连接后端（数据不会上传）' };
  }

  function kkGetAuth() { return DEMO_USER; }
  function kkSetAuth() { }
  function kkClearAuth() { }
  async function kkVerify() { return DEMO_USER; }
  async function kkRequireLogin() { return DEMO_USER; }   // 关键：不跳转登录页
  async function kkLogin() { return { ok: false, msg: '演示站无需登录' }; }
  function kkLogout() { }
  async function kkReportUsage() { }

  // 按需加载重型组件（保留原实现：Excel 导入导出等用到）
  var KK_LIB_P = {};
  function kkLoadLib(url, ready) {
    if (typeof ready === "function" && ready()) return Promise.resolve(true);
    if (KK_LIB_P[url]) return KK_LIB_P[url];
    KK_LIB_P[url] = new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = url;
      s.async = true;
      s.onload = function () { res(true); };
      s.onerror = function () { KK_LIB_P[url] = null; rej(new Error("组件加载失败，请检查网络后重试")); };
      document.head.appendChild(s);
    });
    return KK_LIB_P[url];
  }

  window.KKAuth = {
    call: kkCall, isHttp: isHttp, loadLib: kkLoadLib,
    getAuth: kkGetAuth, setAuth: kkSetAuth, clearAuth: kkClearAuth,
    verify: kkVerify, requireLogin: kkRequireLogin,
    login: kkLogin, logout: kkLogout, reportUsage: kkReportUsage
  };
})();
