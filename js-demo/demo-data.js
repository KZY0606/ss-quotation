// KK 报价演示模板 - 演示数据预置
// 目的：演示站对外展示时一律使用假数据——所有基价统一为 10000，避免暴露真实价格体系。
// 做法：页面渲染完成后，把页面上所有基价输入框填为演示值，并派发 input/change 事件，
//       让系统内部状态与界面同步（这样直接点「计算」就能出演示结果）。
//       面板展开或重新渲染后新出现的基价框，由 MutationObserver 自动补齐。
(function () {
  var DEMO_BASE = 10000;
  var SELECTOR = [
    '.origin201-input',        // 冷轧 201 各产地基价
    '.origin201-thick-input',  // 201 按厚度分档基价
    '.origin-304-input',       // 304 基价（四尺）
    '.origin-304-ff-input',    // 304 基价（五尺）
    '.origin-316L-input',      // 316L 基价（四尺）
    '.origin-316L-ff-input',   // 316L 基价（五尺）
    '.origin-j2-input',        // 北港 / 梓烨（本地 201）
    '.p400-input',             // 400 系基价
    '.p400-ff-input',          // 400 系基价（五尺）
    '.hot201-input',           // 201 热轧基价
    '#beigangJ1Price',         // 北港 J1
    '#beigangJ5Price'          // 北港 J5
  ].join(',');

  function setVal(el) {
    if (String(el.value) === String(DEMO_BASE)) return false;
    el.value = String(DEMO_BASE);
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {
      if (typeof el.oninput === 'function') el.oninput();
      if (typeof el.onchange === 'function') el.onchange();
    }
    return true;
  }

  function fill(root) {
    var els = (root || document).querySelectorAll(SELECTOR);
    var n = 0;
    for (var i = 0; i < els.length; i++) { if (setVal(els[i])) n++; }
    return n;
  }

  function run(label) {
    var n = fill(document);
    if (n) {
      try { console.log('[演示数据] 基价统一为 ' + DEMO_BASE + '（' + n + ' 处' + (label || '') + '）'); } catch (e) { }
    }
    return n;
  }

  window.addEventListener('load', function () {
    run('');
    setTimeout(function () { run(' · 补1'); }, 600);
    setTimeout(function () { run(' · 补2'); }, 1800);
    setTimeout(function () { run(' · 补3'); }, 3500);

    // 面板展开/重渲染后新出现的基价框，自动补齐
    try {
      var timer = null;
      new MutationObserver(function (muts) {
        if (timer) return;
        timer = setTimeout(function () {
          timer = null;
          run(' · 动态');
        }, 120);
      }).observe(document.body, { childList: true, subtree: true });
    } catch (e) { }
  });
})();
