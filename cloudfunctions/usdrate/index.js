// 实时美元汇率：抓取中国银行美元现汇买入价
// 复用 GitHub Actions scripts/fetch-boc-rate.js 的解析逻辑，改为云函数提供 HTTP 接口
const https = require('https');

function getHtml(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { d += c; });
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(new Error('timeout')); });
  });
}

exports.main = async (event) => {
  try {
    const html = await getHtml('https://www.boc.cn/sourcedb/whpj/');
    const rows = [...html.matchAll(/<tr data-currency='([^']+)'>(.*?)<\/tr>/gs)];
    const usd = rows.find(m => m[1] === '美元');
    if (!usd) return { ok: false, msg: '未找到美元行' };
    const cells = [...usd[2].matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map(m =>
      m[1].replace(/<[^>]+>/g, '').trim());
    // cells: [货币名, 现汇买入价, 现钞买入价, 现汇卖出价, 现钞卖出价, 折算价, 发布日期, 发布时间]
    const rate = parseFloat(cells[1]);
    if (!(rate > 0)) return { ok: false, msg: '现汇买入价解析失败' };
    return { ok: true, rate: rate, time: cells[6], source: '中国银行' };
  } catch (e) {
    return { ok: false, msg: '抓取失败: ' + (e.message || e) };
  }
};
