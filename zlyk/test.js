/**
 * zlyk 回归测试: 6 个累积 bug 的 assert
 * 改 decode.js 后必跑, 全绿才 commit.
 *
 * 用法: cd zlyk && node decode.js && node test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const single = JSON.parse(fs.readFileSync(path.join(__dirname, 'single.json'), 'utf8'));
const pages = JSON.parse(single.pages);
const dt = pages.find(p => p.path === 'dt' || p.name === 'dt');
const lazy = pages.find(p => p.path === 'lazy' || p.name === 'lazy');
const er = pages.find(p => p.path === 'er' || p.name === 'er');

let fails = 0;
function assert(cond, msg) {
    if (cond) {
        console.log('  ✓', msg);
    } else {
        console.error('  ✗', msg);
        fails++;
    }
}

console.log('--- zlyk regression tests (memory: project_zlyk_known_bugs.md) ---');

// bug #1: 字段不能丢 (preserve_all_fields)
assert(single.type === 'video', 'bug#1: type:"video" 字段透传保留');
assert('last_chapter_rule' in single, 'bug#1: last_chapter_rule 字段透传保留');
assert(single.title === '周六影库 1', 'bug#1: title 不改名 (保留原作者 "周六影库 1")');

// bug #2: find_rule typo
assert(!/分类标领/.test(single.find_rule), 'bug#2: find_rule typo (分类标领→分类标题) 已修');
assert(/分类标题/.test(single.find_rule), 'bug#2: 分类标题 存在');

// bug #3: find_rule const 中文变量 → var (Rhino eval 跨子页作用域)
assert(!/const\s+(分类颜色|大类定位|小类定位|大类过滤|分类标题|分类链接|排除)\s*=/.test(single.find_rule),
    'bug#3: find_rule const 中文变量 → var 已替换');

// bug #4: dt 子页 hiker://search input 删除 + search_url 清空
assert(!/hiker:\/\/search\?rule=/.test(dt.rule), 'bug#4: dt 子页 hiker://search input 已删');
assert(single.search_url === '', 'bug#4: search_url 已清空 (绕 v2 ArticleListModel)');
assert(single.searchFind === '', 'bug#4: searchFind 已清空');
assert(/周六影库_kw/.test(single.find_rule), 'bug#4: find_rule 已注入自实现搜索块');
assert(/vodsearch.*encodeURIComponent/.test(single.find_rule),
    'bug#4: 自实现搜索用 path 形式 + encodeURIComponent');

// bug #5: er 子页 模板·Q 内联替换
assert(!/模板·Q/.test(er.rule), 'bug#5: er 子页 模板·Q eval 已替换为内联');
assert(/__lineKey/.test(er.rule), 'bug#5: er 内联 INLINE_ERJI 生效 (含 __lineKey)');
assert(/pdfa\(html,\s*['"]body&&\.stui-pannel__head['"]\)/.test(er.rule),
    'bug#5: 线路用二段 selector (pdfa 三段在海阔只返 1 条)');

// bug #6: 选集 url 用 inline lazy, 不能用 $.require("lazy")
assert(!/\$\.require\(['"]lazy['"]\)/.test(er.rule),
    'bug#6: er 选集 url 不用 $.require("lazy") (魔法串不可链, Empty JSON string)');
assert(/@lazyRule=\.js:'\s*\+\s*__lazyCode/.test(er.rule),
    'bug#6: er 选集 url 用 inline __lazyCode');
assert(/JSON\.parse/.test(er.rule) && /base64Decode/.test(er.rule) && /unescape/.test(er.rule),
    'bug#6: ERJI_LAZY_CODE 含 JSON.parse / base64Decode / unescape');

// 通用语法校验 (vm.Script, 脚本模式, 与 HikerView 行为一致)
function checkJs(name, code) {
    if (!code || code === '*') return;
    try { new vm.Script(String(code).replace(/^js:\n?/, '')); assert(true, 'syntax: ' + name); }
    catch (e) { assert(false, 'syntax: ' + name + ' — ' + e.message); }
}
checkJs('find_rule', single.find_rule);
checkJs('searchFind', single.searchFind);
checkJs('preRule', single.preRule);
pages.forEach(p => checkJs('pages.' + (p.path || p.name), p.rule));

console.log('---');
if (fails === 0) {
    console.log('ALL PASS (', 'fails=0)');
    process.exit(0);
} else {
    console.error('FAILED:', fails, '/ tests');
    process.exit(1);
}
