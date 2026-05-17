/**
 * 聚合所有站点的 v2 规则到仓库根 clipboard.json
 * 订阅 URL: https://raw.githubusercontent.com/MrZhaobh/haikuo/main/clipboard.json
 *
 * 工作流:
 *   1. 各站点目录自行 `node compile.js` 生成 single.json + 各 token
 *   2. 在仓库根运行 `node build-all.js` 聚合
 *   3. git commit && push 即可更新订阅
 *
 * 添加新站点: 在 SITES 数组里追加站点目录名
 */
const fs = require('fs');
const path = require('path');

const SITES = [
    { name: 'sugoideas', file: 'sugoideas-rules.json' },   // sugo (compile.js 输出)
    { name: 'nivod',     file: 'nivod/clipboard.json' },
];

const ruleArr = [];
for (const site of SITES) {
    const cb = path.join(__dirname, site.file);
    if (!fs.existsSync(cb)) {
        console.warn('  skip', site.name, '- missing', site.file, '(run compile.js?)');
        continue;
    }
    const arr = JSON.parse(fs.readFileSync(cb, 'utf8'));
    if (!Array.isArray(arr)) { console.warn('  skip', site.name, '- not array'); continue; }
    for (const r of arr) ruleArr.push(r);
    console.log('  +', site.name, '(' + arr.length + ' rule)');
}

const out = path.join(__dirname, 'clipboard.json');
fs.writeFileSync(out, JSON.stringify(ruleArr, null, 2), 'utf8');
console.log('\nWrote', out, '-', ruleArr.length, 'rules,', Buffer.byteLength(JSON.stringify(ruleArr)), 'B');
