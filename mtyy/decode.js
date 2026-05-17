/**
 * 麦田影院规则 — 由海阔 SQLite 备份导出 (rule-raw.json) 后转 v2 schema
 *
 * 用户原始 base64 口令在传输中被 GB18030↔UTF-8 mojibake 损坏 (位置 11022 处大段 \uFFFD),
 * 不可逆。改走 SQLite 备份导出: hiker_54.db.articlelistrule (id=2) → rule-raw.json → 本脚本
 *
 * 关键: v2 订阅源 schema 不接受 home_rule_v2 特有的 pages 字段, 否则海阔订阅解析器
 * 会跳过整条 (用户报告订阅显示规则数=2 而非 3)。本脚本把 dt/er/lazy 三个子页面的代码
 * 塞进 preRule 用 putVar 暂存,find_rule / 详情 url / searchFind 里的:
 *   - eval(JSON.parse(request('hiker://page/dt')).rule)        → eval(getVar('__mtyy_dt'))
 *   - @rule=js:$.require("er")                                  → @rule=js:eval(getVar('__mtyy_er'))
 *   - eval(JSON.parse(fetch('hiker://page/lazy',{})).rule)      → eval(getVar('__mtyy_lazy'))
 *
 * 输出:
 *   clipboard.json    [v2]  供 build-all.js 聚合
 *   single.json       v2 单条
 *   token-video.txt   视频￥video_rule_v2
 *   token-home.txt    首页频道￥home_rule_v2
 *   token-search.txt  搜索引擎￥search_rule_v2
 *   token-quick.txt   小程序￥home_rule_v2￥base64://@title@...
 */
const fs = require('fs');
const path = require('path');

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'rule-raw.json'), 'utf8'));

// === 把 pages 子页面拆出来,内联到 preRule + 改写引用点 ===
const pageList = JSON.parse(raw.pages || '[]');
const pageMap = {};
pageList.forEach(p => { pageMap[p.path] = p.rule; });

// er 子页面里也引用了 lazy 子页面 → 同样改写
const erRule = (pageMap.er || '').replace(
    /eval\(JSON\.parse\(fetch\(['"]hiker:\/\/page\/lazy['"][^)]*\)\)\.rule\);?/,
    "eval(getVar('__mtyy_lazy'));"
);

// find_rule 里引用 dt 子页面
let findRule = (raw.find_rule || '').replace(
    /eval\(JSON\.parse\(request\(['"]hiker:\/\/page\/dt['"]\)\)\.rule\)/,
    "eval(getVar('__mtyy_dt'))"
);
// find_rule 里详情页 url 用 $.require("er") — 改为 eval(getVar)
findRule = findRule.replace(
    /@rule=js:\$\.require\(\\?["']er\\?["']\)/g,
    "@rule=js:eval(getVar(\\\"__mtyy_er\\\"))"
);

// searchFind 里也用 $.require("er")
let searchFind = (raw.searchfind || '').replace(
    /@rule=js:\$\.require\(\\?["']er\\?["']\)/g,
    "@rule=js:eval(getVar(\\\"__mtyy_er\\\"))"
);

// preRule: 启动规则时把三段代码 putVar 暂存
const preRule = [
    "putVar({key:'__mtyy_dt',   value:" + JSON.stringify(pageMap.dt   || '') + "});",
    "putVar({key:'__mtyy_er',   value:" + JSON.stringify(erRule)              + "});",
    "putVar({key:'__mtyy_lazy', value:" + JSON.stringify(pageMap.lazy || '') + "});"
].join('\n');

const v2 = {
    title: raw.title || '',
    author: raw.author || '',
    version: 0,
    group: raw.group_lpcolumn || '',
    titleColor: raw.titlecolor || '',
    url: raw.url || '',
    col_type: raw.col_type || 'movie_3',
    class_name: raw.class_name || '',
    class_url: raw.class_url || '',
    area_name: raw.area_name || '',
    area_url: raw.area_url || '',
    year_name: raw.year_name || '',
    year_url: raw.year_url || '',
    sort_name: raw.sort_name || '',
    sort_url: raw.sort_url || '',
    find_rule: findRule,
    search_url: raw.search_url || '',
    searchFind: searchFind,
    detail_col_type: raw.detail_col_type || '',
    detail_find_rule: raw.detail_find_rule || '',
    sdetail_col_type: raw.sdetail_col_type || '',
    sdetail_find_rule: raw.sdetail_find_rule || '',
    ua: raw.ua || 'mobile',
    preRule: preRule
    // 注意: 不带 pages 字段, 否则订阅源解析器会丢弃
};

fs.writeFileSync(path.join(__dirname, 'clipboard.json'), JSON.stringify([v2], null, 2), 'utf8');
fs.writeFileSync(path.join(__dirname, 'single.json'), JSON.stringify(v2, null, 2), 'utf8');

const v2Json = JSON.stringify(v2);
fs.writeFileSync(path.join(__dirname, 'token-video.txt'),
    '海阔视界规则分享，当前分享的是：视频￥video_rule_v2￥' + v2Json, 'utf8');
fs.writeFileSync(path.join(__dirname, 'token-home.txt'),
    '海阔视界规则分享，当前分享的是：首页频道￥home_rule_v2￥' + v2Json, 'utf8');

const searchRule = {
    title: v2.title, author: v2.author, version: 0,
    search_url: v2.search_url,
    searchFind: v2.searchFind,
    detail_col_type: v2.detail_col_type,
    detail_find_rule: v2.detail_find_rule,
    sdetail_col_type: v2.sdetail_col_type,
    sdetail_find_rule: v2.sdetail_find_rule,
    ua: v2.ua,
    preRule: v2.preRule
};
fs.writeFileSync(path.join(__dirname, 'token-search.txt'),
    '海阔视界规则分享，当前分享的是：搜索引擎￥search_rule_v2￥' + JSON.stringify(searchRule), 'utf8');

const miniRule = Object.assign({}, v2, { icon: raw.icon || '', proxy: raw.proxy || '' });
const miniB64 = Buffer.from(JSON.stringify(miniRule), 'utf8').toString('base64');
fs.writeFileSync(path.join(__dirname, 'token-quick.txt'),
    '海阔视界规则分享，当前分享的是：小程序￥home_rule_v2￥base64://@' + miniRule.title + '@' + miniB64, 'utf8');

console.log('已生成: ' + v2.title + ' (' + v2.author + ')');
console.log('  url:        ', v2.url);
console.log('  search_url: ', v2.search_url);
console.log('  pages 内联到 preRule:', pageList.length, '个 (', Buffer.byteLength(preRule), 'B)');
console.log('  v2 JSON     :', Buffer.byteLength(v2Json), 'B');
console.log('  base64 quick:', Buffer.byteLength(miniB64), 'B');
