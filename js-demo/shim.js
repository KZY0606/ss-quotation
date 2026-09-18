// KK 报价演示模板 - 静态托管适配层
// 背景：正式版通过云函数（POST 请求）获取实时汇率，而 GitHub Pages 等静态托管只接受 GET。
//       这里把「对 rate.json 的 POST 请求」自动改写为 GET，使其能正常读到静态汇率快照；
//       其它请求一律原样放行，不影响任何业务逻辑。
(function () {
  var origFetch = window.fetch;
  if (typeof origFetch !== 'function') return;

  window.fetch = function (input, init) {
    var url = (typeof input === 'string') ? input : (input && input.url) || '';
    var method = (init && init.method) || (input && input.method) || 'GET';
    if (url.indexOf('rate.json') >= 0 && String(method).toUpperCase() !== 'GET') {
      return origFetch.call(this, url, { method: 'GET', cache: 'no-store' });
    }
    return origFetch.apply(this, arguments);
  };
})();
