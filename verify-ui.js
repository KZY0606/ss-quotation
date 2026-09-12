// verify-ui.js — 报价系统 UI 真实浏览器验证脚本
// 用法: node verify-ui.js [url]
//   默认验证线上 https://kk-quotation-d2gtggelpcd901498-1475503300.tcloudbaseapp.com/
//   可传本地路径: node verify-ui.js file:///C:/path/to/quotation/web/index_real.html
// 依赖: puppeteer-core（本机已装在 .openclaw/tmp/pptr/node_modules，自动探测）
// 检测项: 引擎可用性 / 梓烨201 产地价格行（J1-J4 四格）/ 旧名残留 / 参考面板厚度加价表 / 行重叠 / JS 报错
// 退出码: 0=全部通过 1=有失败
// 历史: 2026-08-20 因 .origin-rows max-height + flex 压缩导致行溢出被裁，node 单测无法发现，必须真实浏览器验证。
//       2026-09-12 v1.0.215：原断言基于 v1.0.10 的「201 面板 12+16 格」结构（选择器 .origin-row-201 /
//       .origin201-thick-input / [data-mat] 早已不存在），已重写为当前结构的检查项，并补齐登录流程。

let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e) {
  try { puppeteer = require('../../.openclaw/tmp/pptr/node_modules/puppeteer-core'); }
  catch (e2) {
    console.error('[verify-ui] 需要 puppeteer-core: 在 quotation/web 下执行 npm i puppeteer-core');
    process.exit(1);
  }
}

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];

const target = process.argv[2] || 'https://kk-quotation-d2gtggelpcd901498-1475503300.tcloudbaseapp.com/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const exe = EDGE_CANDIDATES.find(p => require('fs').existsSync(p));
  if (!exe) { console.error('[verify-ui] 未找到 Edge/Chrome'); process.exit(1); }
  const browser = await puppeteer.launch({
    executablePath: exe, headless: 'new', protocolTimeout: 900000,
    args: ['--no-first-run', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--proxy-bypass-list=*']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1400 });
  const errs = [];
  page.on('pageerror', e => { errs.push(e.message); console.log('[pageerror]', e.message); });
  page.on('dialog', d => { d.accept().catch(function () { }); });
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(function () { });

  // 登录（线上必须登录才渲染基价面板；本地 file:// 模式无登录页，直接进入等待）
  // 与 .openclaw/tmp/e2e_login_helper.js 同一套逻辑：处理 CloudBase「确定访问」风险页 + 登录重试
  const state = () => page.evaluate(() => ({
    hasRiskBtn: !!Array.prototype.slice.call(document.querySelectorAll('button')).find(b => (b.textContent || '').indexOf('确定访问') >= 0),
    hasUser: !!document.getElementById('username'),
    pe: typeof PricingEngine !== 'undefined'
  })).catch(function () { return {}; });
  const t0 = Date.now();
  let typed = false, ready = false;
  while (Date.now() - t0 < 180000) {
    const s = await state();
    if (s.hasRiskBtn) {
      await page.evaluate(() => Array.prototype.slice.call(document.querySelectorAll('button')).find(b => (b.textContent || '').indexOf('确定访问') >= 0).click()).catch(function () { });
    } else if (s.hasUser) {
      if (!typed) {
        await page.type('#username', 'KK').catch(function () { });
        await page.type('#password', 'kzybs1314').catch(function () { });
        await page.evaluate(() => (document.querySelector('#loginBtn') || Array.prototype.slice.call(document.querySelectorAll('button')).find(b => /登\s*录/.test(b.textContent || ''))).click()).catch(function () { });
        typed = true;
      } else if (Date.now() - t0 > 20000) {
        await page.evaluate(() => { const b = document.querySelector('#loginBtn') || Array.prototype.slice.call(document.querySelectorAll('button')).find(x => /登\s*录/.test(x.textContent || '')); if (b) b.click(); }).catch(function () { });
        typed = false;
      }
    } else if (s.pe) { ready = true; break; }
    await sleep(2000);
  }
  if (!ready) console.log('[verify-ui] 等待页面就绪超时（可能登录失败或页面未发布完成）');
  await sleep(2200);

  const res = await page.evaluate(() => {
    const panel = document.querySelector('#originRows201');
    const rows = panel ? Array.prototype.slice.call(panel.children) : [];
    const overlaps = [];
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i].getBoundingClientRect(), b = rows[j].getBoundingClientRect();
      if (a.height > 0 && b.height > 0 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps.push(i + '-' + j);
    }
    const ziyeRow = rows.filter(r => (r.textContent || '').indexOf('梓烨201') >= 0)[0] || null;
    const engineOk = typeof PricingEngine !== 'undefined' && typeof PricingEngine.calculate === 'function';
    return {
      engineOk: engineOk,
      panelRows: rows.length,
      ziyeRowFound: !!ziyeRow,
      ziyeBendiInputs: ziyeRow ? ziyeRow.querySelectorAll('[data-bendi]').length : 0,
      ziyeBendiKeys: ziyeRow ? Array.prototype.slice.call(ziyeRow.querySelectorAll('[data-bendi]')).map(x => x.getAttribute('data-bendi')).join(',') : '',
      overlaps: overlaps,
      yanyanTableGone: engineOk ? (typeof PricingEngine.YANYAN_THICKNESS_SURCHARGE === 'undefined') : null,
      ziyeTableExists: engineOk ? !!(PricingEngine.ORIGIN_THICKNESS_SURCHARGE && PricingEngine.ORIGIN_THICKNESS_SURCHARGE['梓烨201']) : null,
      oldNameInBody: (document.body.innerText || '').indexOf('本地201(压延)') >= 0,
      ziyeThick: engineOk ? PricingEngine.getThicknessSurcharge('0.25', false, '201J2', '梓烨201', '2B') : null,
      yanyanThick: engineOk ? PricingEngine.getThicknessSurcharge('0.25', true, '201J2', '宏旺', '2B') : null
    };
  });

  // 参考面板
  const refClicked = await page.evaluate(() => {
    const btns = Array.prototype.slice.call(document.querySelectorAll('button'));
    for (const b of btns) { if ((b.textContent || '').indexOf('厚度加价') >= 0) { b.click(); return true; } }
    return false;
  });
  await sleep(1000);
  const refText = await page.evaluate(() => { const s = document.querySelector('#ref-sec-1'); return s ? s.innerText : ''; });

  let fail = 0;
  const check = (ok, name) => { console.log((ok ? '[OK] ' : '[FAIL] ') + name); if (!ok) fail = 1; };

  check(res.engineOk, '报价引擎可用');
  check(res.panelRows > 0, '201 产地价格面板已渲染（' + res.panelRows + ' 行）');
  check(res.ziyeRowFound, '面板有「梓烨201」产地行');
  check(res.ziyeBendiInputs === 4, '梓烨201 行有 4 个基价格（J1-J4），实际 ' + res.ziyeBendiInputs + ' [' + res.ziyeBendiKeys + ']');
  check(res.overlaps.length === 0, '产地行无重叠（实际 ' + (res.overlaps.length ? res.overlaps.join(',') : '无') + '）');
  check(res.yanyanTableGone === true, '压延料厚度加价表已删除');
  check(res.ziyeTableExists === true, '梓烨201 专属厚度加价表存在');
  check(res.ziyeThick === 1400, '梓烨201 0.25mm 厚度加价=1400（实际 ' + res.ziyeThick + '）');
  check(res.yanyanThick === 0, '压延料 0.25mm 厚度加价=0（实际 ' + res.yanyanThick + '）');
  check(res.oldNameInBody === false, '页面不再出现旧名「本地201(压延)」');
  check(refClicked === true && refText.length > 0, '参考面板厚度加价总表可展开（' + refText.length + ' 字符）');
  check(refText.indexOf('梓烨201') >= 0, '参考面板有「梓烨201」段');
  check(refText.indexOf('压延料（轧硬料）') >= 0 && refText.indexOf('无厚度加价') >= 0, '参考面板写明压延料无厚度加价');
  check(errs.length === 0, '无 JS 报错' + (errs.length ? '：' + errs[0].slice(0, 80) : ''));

  await browser.close();
  console.log(fail ? '\n===== 验证失败 =====' : '\n===== 验证全部通过 =====');
  process.exit(fail);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
