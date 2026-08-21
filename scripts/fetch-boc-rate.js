// 抓取中国银行美元现汇买入价，写入 rate.json（GitHub Actions 定时执行）
// 页面 https://www.boc.cn/sourcedb/whpj/ 为 UTF-8 表格，行结构 <tr data-currency='美元'>…</tr>
const fs = require('fs');
const path = require('path');

const URL = 'https://www.boc.cn/sourcedb/whpj/';
const OUT = path.join(__dirname, '..', 'rate.json');

async function main() {
  const res = await fetch(URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = await res.text();
  const rows = [...html.matchAll(/<tr data-currency='([^']+)'>(.*?)<\/tr>/gs)];
  const usd = rows.find(m => m[1] === '美元');
  if (!usd) throw new Error('未找到美元行');
  const cells = [...usd[2].matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map(m =>
    m[1].replace(/<[^>]+>/g, '').trim());
  // cells: [货币名, 现汇买入价, 现钞买入价, 现汇卖出价, 现钞卖出价, 折算价, 发布日期, 发布时间]
  const rate = parseFloat(cells[1]); // 现汇买入价
  if (!(rate > 0)) throw new Error('现汇买入价解析失败: ' + JSON.stringify(cells));
  const time = cells[6]; // 发布日期已含时分秒
  const out = { rate, time, source: '中国银行' };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log('USD buy rate =', rate, '@', time);
}

main().catch(e => { console.error('fetch-boc-rate 失败:', e.message); process.exit(1); });
