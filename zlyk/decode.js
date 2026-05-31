/**
 * zlyk (周六影库) 解码 + 编译入口 — 纯透传版
 *
 * 教训 (memory: feedback_haikuo_preserve_all_fields / no_title_rename):
 *   - 原版 token 字面 paste 海阔, 搜索 OK
 *   - 我们之前 v2 白名单丢了 type:"video" / last_chapter_rule, 又改 title /
 *     清空 search_url / 自实现搜索 — 全失败
 *   - 唯一可靠路径: 保留原 rule 全部字段, 不改 title, 不动 search_url
 *
 * 本脚本只做: 解 base64 → JSON → 原样输出 7 件套.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TOKEN_FILE = path.join(__dirname, 'token-quick-original.txt');
const raw = fs.readFileSync(TOKEN_FILE, 'utf8').trim();

const m = raw.match(/base64:\/\/@([^@]+)@(.+)$/);
if (!m) {
    console.error('FAIL: token-quick-original.txt 不是预期的 base64://@title@<b64> 格式');
    process.exit(1);
}
const titleFromToken = m[1];
const b64 = m[2];
console.log('token title:', titleFromToken);
console.log('base64 length:', b64.length);

let rule;
try {
    rule = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
} catch (e) {
    console.error('FAIL: base64 解码或 JSON 解析失败:', e.message);
    process.exit(1);
}

console.log('\n--- decoded rule fields (', Object.keys(rule).length, 'keys) ---');
Object.keys(rule).forEach(k => {
    const v = rule[k];
    if (typeof v === 'string' && v.length > 80) {
        console.log('  ', k, ':', v.substr(0, 60).replace(/\n/g, '\\n'), '... (', v.length, 'chars)');
    } else {
        console.log('  ', k, ':', JSON.stringify(v));
    }
});

// JS 段语法校验 (vm.Script 脚本模式, 与 HikerView JSEngine 行为一致)
function checkJs(name, code) {
    if (!code || code === '*' || code === '') {
        console.log('  ', name, '(empty, skip)');
        return true;
    }
    const stripped = String(code).replace(/^js:\n?/, '');
    try {
        new vm.Script(stripped, { filename: name });
        console.log('  ', name, 'OK');
        return true;
    } catch (e) {
        console.error('  ', name, 'SYNTAX FAIL:', e.message);
        return false;
    }
}

console.log('\n--- JS syntax check (vm.Script, script mode) ---');
checkJs('find_rule', rule.find_rule);
checkJs('searchFind', rule.searchFind);
checkJs('preRule', rule.preRule);
if (rule.pages) {
    try {
        JSON.parse(rule.pages).forEach((p, i) => {
            checkJs(`pages[${i}] ${p.path || p.name}`, p.rule);
        });
    } catch (e) {
        console.error('  pages JSON.parse FAIL:', e.message);
    }
}

// ============================
// 纯透传: 用 Object.assign 保留所有原字段, 不做任何字段裁剪
// ============================
const v2 = Object.assign({}, rule);
const title = v2.title || titleFromToken;

// ============================
// 输出 7 件套
// ============================
const OUT = __dirname;

fs.writeFileSync(path.join(OUT, 'clipboard.json'),
    JSON.stringify([v2], null, 2), 'utf8');

fs.writeFileSync(path.join(OUT, 'single.json'),
    JSON.stringify(v2, null, 2), 'utf8');

fs.writeFileSync(path.join(OUT, 'share.txt'),
    '海阔视界·我的视频·' + title + '·' + JSON.stringify(v2), 'utf8');

fs.writeFileSync(path.join(OUT, 'token-video.txt'),
    '海阔视界规则分享，当前分享的是：视频￥video_rule_v2￥' + JSON.stringify(v2), 'utf8');

fs.writeFileSync(path.join(OUT, 'token-home.txt'),
    '海阔视界规则分享，当前分享的是：首页频道￥home_rule_v2￥' + JSON.stringify(v2), 'utf8');

// 搜索引擎子集: 字段也用 Object.assign 从原 rule 取, 不硬编码 v2 白名单
const searchKeys = ['title', 'author', 'version', 'search_url', 'searchFind',
    'detail_col_type', 'detail_find_rule', 'sdetail_col_type', 'sdetail_find_rule',
    'ua', 'preRule', 'pages', 'type', 'last_chapter_rule'];
const searchOnly = {};
searchKeys.forEach(k => { if (k in v2) searchOnly[k] = v2[k]; });
fs.writeFileSync(path.join(OUT, 'token-search.txt'),
    '海阔视界规则分享，当前分享的是：搜索引擎￥search_rule_v2￥' + JSON.stringify(searchOnly), 'utf8');

// token-quick.txt: 直接复用 token-quick-original.txt 内容, 保证字节级一致
fs.writeFileSync(path.join(OUT, 'token-quick.txt'), raw, 'utf8');

console.log('\n--- output (7 files) ---');
['clipboard.json', 'single.json', 'share.txt',
 'token-video.txt', 'token-home.txt', 'token-search.txt', 'token-quick.txt'].forEach(f => {
    const sz = fs.statSync(path.join(OUT, f)).size;
    console.log('  ', f, sz, 'B');
});

console.log('\nrule.title :', title);
console.log('rule.url   :', v2.url);
console.log('rule.search:', v2.search_url);
console.log('rule.type  :', v2.type);
console.log('rule.pages :', v2.pages ? JSON.parse(v2.pages).length + ' subpages' : '(none)');
