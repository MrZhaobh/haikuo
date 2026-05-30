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
    { name: 'sugoideas', file: 'sugoideas/clipboard.json' }, // sugo (compile.js 输出)
    { name: 'nivod',     file: 'nivod/clipboard.json' },
    { name: 'mtyy',      file: 'mtyy/clipboard.json' },    // 麦田影院 (decode.js 由 SQLite 备份导出)
    { name: 'zyshow11',  file: 'zyshow11/clipboard.json' }, // 11点热炒店 单节目 (zyshow.co)
    { name: 'zyshow',    file: 'zyshow/clipboard.json' },   // 综艺巴士 全站台综 35 节目 (zyshow.co)
    { name: 'zyshow2',   file: 'zyshow2/clipboard.json' },  // 综艺巴士 深搜索版 (WebView 抓 CF cookie + 全节目索引缓存)
    { name: 'zlyk',      file: 'zlyk/clipboard.json' },     // 周六影库 1 (zlykw.com) — 评论区复制侠分享的云口令解码
];

// 订阅源里所有规则统一分组 (各站源数据 group 不变, 仅在聚合输出里覆盖)
const FORCE_GROUP = '#️⃣影视规则⬆️';

const ruleArr = [];
for (const site of SITES) {
    const cb = path.join(__dirname, site.file);
    if (!fs.existsSync(cb)) {
        console.warn('  skip', site.name, '- missing', site.file, '(run compile.js?)');
        continue;
    }
    const arr = JSON.parse(fs.readFileSync(cb, 'utf8'));
    if (!Array.isArray(arr)) { console.warn('  skip', site.name, '- not array'); continue; }
    for (const r of arr) {
        r.group = FORCE_GROUP;
        ruleArr.push(r);
    }
    console.log('  +', site.name, '(' + arr.length + ' rule)');
}

const out = path.join(__dirname, 'clipboard.json');
fs.writeFileSync(out, JSON.stringify(ruleArr, null, 2), 'utf8');
console.log('\nWrote', out, '-', ruleArr.length, 'rules,', Buffer.byteLength(JSON.stringify(ruleArr)), 'B');
