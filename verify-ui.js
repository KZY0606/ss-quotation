// verify-ui.js — 报价系统 UI 真实浏览器验证脚本
// 用法: node verify-ui.js [url]
//   默认验证线上 https://kzy0606.github.io/ss-quotation/
//   可传本地路径: node verify-ui.js file:///C:/path/to/quotation/web/index.html
// 依赖: puppeteer-core (本机已装在 .openclaw/tmp/pptr/node_modules，自动探测)
// 检测项: 201 面板 12+16 格结构、行重叠、块高度压缩、版本号
// 退出码: 0=全部通过 1=有失败
// 历史: 2026-08-20 因 .origin-rows max-height:320px + flex-shrink 压缩导致
//       J4/宽板J3 行溢出被裁，node 单测无法发现，必须真实浏览器验证。

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

const target = process.argv[2] || 'https://kzy0606.github.io/ss-quotation/';

(async () => {
  let exe = EDGE_CANDIDATES.find(p => require('fs').existsSync(p));
  if (!exe) { console.error('[verify-ui] 未找到 Edge/Chrome'); process.exit(1); }
  const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-first-run', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 2200 });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(target, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));

  const res = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#originRows201 .origin-row-201')];
    const blocks = [...document.querySelectorAll('#originRows201 > div')];
    const overlaps = [];
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i].getBoundingClientRect(), b = rows[j].getBoundingClientRect();
      if (a.top < b.bottom && b.top < a.bottom) overlaps.push(i + '-' + j);
    }
    return {
      j4: document.querySelectorAll('[data-mat="201J4"]').length,
      thickTotal: document.querySelectorAll('.origin201-thick-input').length,
      thickJ1: document.querySelectorAll('.origin201-thick-input[data-mat="201J1"]').length,
      thickJ2: document.querySelectorAll('.origin201-thick-input[data-mat="201J2"]').length,
      thickJ3: document.querySelectorAll('.origin201-thick-input[data-mat="201J3"]').length,
      rows: rows.map(r => (r.querySelector('.omat201') || {}).textContent.trim() + ':' + r.querySelectorAll('input').length).join(' | '),
      overlaps,
      blockHeights: blocks.map(b => Math.round(b.getBoundingClientRect().height) + 'px').join(' / ')
    };
  });

  let fail = 0;
  const check = (ok, name) => { console.log((ok ? '✅' : '❌') + ' ' + name); if (!ok) fail = 1; };

  check(res.j4 === 2, `常规区 J4 行 2 格 (实际 ${res.j4})`);
  check(res.thickJ1 === 6, `宽板 J1 六档 (实际 ${res.thickJ1})`);
  check(res.thickJ2 === 4, `宽板 J2 四档 (实际 ${res.thickJ2})`);
  check(res.thickJ3 === 6, `宽板 J3 六档 (实际 ${res.thickJ3})`);
  check(res.thickTotal === 16, `宽板合计 16 格 (实际 ${res.thickTotal})`);
  check(res.rows.includes('J4:2'), `行结构含 J4:2 (实际: ${res.rows})`);
  check(res.rows.includes('J3:6'), `行结构含宽板 J3:6 (实际: ${res.rows})`);
  check(res.overlaps.length === 0, `无行重叠 (实际: ${res.overlaps.length ? res.overlaps.join(',') : '无'})`);
  const hs = res.blockHeights.split(' / ').map(s => parseInt(s, 10));
  check(hs[0] >= 170, `矩阵块高度完整 >=170px (实际 ${res.blockHeights})`);

  console.log('\n行结构: ' + res.rows);
  console.log('块高度: ' + res.blockHeights);
  await browser.close();
  console.log(fail ? '\n===== 验证失败 =====' : '\n===== 验证全部通过 =====');
  process.exit(fail);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
