// deploy_web.js — 发版部署到腾讯云静态托管
// 用法: node deploy_web.js
// 说明: 仓库根 index.html 已是"网址已更新"提示页（GitHub Pages 用），
//       真实主页在 index_real.html。本脚本用真实主页打包部署目录并上传腾讯云。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const webDir = __dirname;
const distDir = path.join(webDir, '..', '..', '.openclaw', 'tmp', 'hosting_dist_v' + Date.now());
const ENV = 'kk-quotation-d2gtggelpcd901498';
const TCB_BIN = path.join(process.env.APPDATA, 'npm', 'node_modules', '@cloudbase', 'cli', 'bin', 'tcb');

// 递归复制目录（fs.cpSync 在本机 node 上会崩溃 0xC0000409，改用 copyFileSync）
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// 1 新建部署目录
fs.mkdirSync(distDir, { recursive: true });

// 2 复制部署文件（index.html 用真实主页）
fs.copyFileSync(path.join(webDir, 'index_real.html'), path.join(distDir, 'index.html'));
['login.html', 'admin.html'].forEach(f => fs.copyFileSync(path.join(webDir, f), path.join(distDir, f)));
['css', 'js'].forEach(d => copyDir(path.join(webDir, d), path.join(distDir, d)));

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else files.push(p);
  }
})(distDir);
console.log('部署目录就绪:', distDir, files.length, '个文件');

// 3 上传（node 直接跑 tcb CLI 的 JS 入口，绕开 .ps1 包装）
console.log('上传腾讯云静态托管...');
try {
  const out = execFileSync('node', [TCB_BIN, 'hosting', 'deploy', distDir, '-e', ENV], { encoding: 'utf8', timeout: 600000 });
  console.log(out.slice(-400));
} catch (e) {
  console.error('DEPLOY FAIL');
  if (e.stdout) console.error('STDOUT:', String(e.stdout).slice(-800));
  if (e.stderr) console.error('STDERR:', String(e.stderr).slice(-800));
  console.error('ERRMSG:', e.message);
  process.exit(1);
}
console.log('===== 部署完成 =====');
