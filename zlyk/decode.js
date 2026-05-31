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
// 纯透传: 用 Object.assign 保留所有原字段 (memory: preserve_all_fields)
// ============================
const v2 = Object.assign({}, rule);
const title = v2.title || titleFromToken;

// ============================
// 但 v2 search_url 路径必须绕开 (memory: ArticleListModel error scheme)
// 触发链: dt 子页 hiker://search input → 海阔走 v2 search_url 模板 →
// 内部产生 error:// 占位 URL → ArticleListModel HttpRequestError
//
// 修法 3 步 (字段值改, 字段不删):
//   a. search_url 清空 → 海阔不暴露 v2 搜索框
//   b. dt 子页 hiker://search input 删 → 不再触发 v2 search 调度
//   c. find_rule 顶部加自实现搜索块 → 自 fetch + 自渲染 (绕过 ArticleListModel)
// ============================

// ============================
// 原作者 find_rule 本身有 2 个 bug, 不修就报 ReferenceError:
//   1. typo: const 分类标领 = 'a&&Text' (lead), 但 dt 子页用的是 分类标题 (title)
//   2. const 中文变量在 eval('hiker://page/dt') 内不可见 (Rhino 作用域怪异),
//      改为 var (function-scoped) 才稳 (memory: commit 0d78165 教训)
// ============================
if (v2.find_rule) {
    v2.find_rule = v2.find_rule.replace(/分类标领/g, '分类标题');
    v2.find_rule = v2.find_rule.replace(
        /(^|[\s;])const(\s+)(分类颜色|大类定位|小类定位|大类过滤|分类标题|分类链接|排除|page)/g,
        '$1var$2$3'
    );
    console.log('  ✓ find_rule: typo (分类标领→分类标题) + const 中文变量→var');
}

v2.search_url = '';
v2.searchFind = '';

const SEARCH_HEAD = [
    'd.push({title: "🏷️ v2026-05-31-h (passthrough+自实现搜索)", col_type: "rich_text"});',
    'var __kwKey = "周六影库_kw";',
    'var __kwTmpKey = "周六影库_kw_tmp";',
    'var __kw = getVar(__kwKey, "");',
    'var __kwTmp = getVar(__kwTmpKey, __kw);',
    'd.push({',
    '  desc: __kw ? "当前: " + __kw : "🔍 输入关键词后点搜索...",',
    '  col_type: "input",',
    '  extra: {',
    '    defaultValue: __kwTmp,',
    '    titleVisible: false,',
    '    onChange: \'putVar({key:"周六影库_kw_tmp",value:input})\'',
    '  }',
    '});',
    'd.push({',
    '  title: "🔍 搜索",',
    '  url: $("#noLoading#").lazyRule(function(){',
    '    var t = getVar("周六影库_kw_tmp", "");',
    '    if (t && t !== getVar("周六影库_kw","")) { putVar({key:"周六影库_kw", value:t}); refreshPage(false); }',
    '    return "hiker://empty";',
    '  }),',
    '  col_type: "scroll_button"',
    '});',
    'if (__kw) {',
    '  d.push({',
    '    title: "✖ 清空",',
    '    url: $("#noLoading#").lazyRule(function(){ putVar({key:"周六影库_kw",value:""}); putVar({key:"周六影库_kw_tmp",value:""}); refreshPage(false); return "hiker://empty"; }),',
    '    col_type: "scroll_button"',
    '  });',
    '  var __sUrl = "https://www.zlykw.com/vodsearch/" + encodeURIComponent(__kw) + "----------1---.html";',
    '  var __sHtml = ""; try { __sHtml = request(__sUrl) || ""; } catch (e) { __sHtml = ""; }',
    '  if (!__sHtml) {',
    '    d.push({title: "⚠️ 搜索请求失败 (网络 / CF)", col_type: "rich_text"});',
    '  } else {',
    '    var __sList = []; try { __sList = pdfa(__sHtml, ".stui-vodlist&&li") || []; } catch (e) {}',
    '    var __pushed = 0;',
    '    for (var __sj = 0; __sj < __sList.length; __sj++) {',
    '      var __sli = __sList[__sj]; if (!__sli) continue;',
    '      var __slink = ""; try { __slink = pd(__sli, "a&&href") || ""; } catch (e) {}',
    '      if (!__slink || __slink === "#" || __slink.charAt(__slink.length-1) === "#" || __slink.indexOf("javascript") === 0) continue;',
    '      if (__slink.indexOf("http") !== 0 && __slink.charAt(0) === "/") __slink = "https://www.zlykw.com" + __slink;',
    '      if (__slink.indexOf("http") !== 0) continue;',
    '      var __st = ""; try { __st = pdfh(__sli, "a&&title") || ""; } catch (e) {}',
    '      var __sdesc = ""; try { __sdesc = pdfh(__sli, ".pic-text&&Text") || ""; } catch (e) {}',
    '      var __simg = ""; try { __simg = pd(__sli, "a&&data-original") || ""; } catch (e) {}',
    '      d.push({',
    '        title: __st || __slink,',
    '        desc: __sdesc,',
    '        pic_url: __simg ? (__simg + "@Referer=https://www.zlykw.com/") : "",',
    '        url: __slink + "#immersiveTheme##autoCache#@rule=js:$.require(\\"er\\")"',
    '      });',
    '      __pushed++;',
    '    }',
    '    if (__pushed === 0) d.push({title: "未搜到 " + __kw + " (html.len=" + __sHtml.length + ")", col_type: "rich_text"});',
    '  }',
    '  setResult(d);',
    '} else {'
].join('\n');

if (v2.find_rule) {
    const origBody = v2.find_rule
        .replace(/^js:\n?/, '')
        .replace(/^var d = \[\];\n?/, '');
    v2.find_rule = 'js:\nvar d = [];\n' + SEARCH_HEAD + '\n' + origBody + '\n}';
    console.log('  ✓ find_rule: 注入自实现搜索块 (v2026-05-31-h)');
}

// ============================
// 内联 er 子页的"模板·Q" 实现 (原作者依赖海阔内置模板, 没装就不渲染线路/选集).
// pdfa 三段 selector 在海阔会只返 1 条, 拆成二段 + pdfh 内层 (memory: 74ffd3f).
// 选集 url 用 @lazyRule=.js:<inline> 而不是 $.require("lazy") —
// $.require 返 lazyRule 魔法串, 在 @lazyRule=.js:<expr> 上下文不可用,
// HikerView 会当 JSON parse → "Empty JSON string" (memory: f09a9e3).
// ============================
const ERJI_LAZY_CODE = (
    "var __r = ''; " +
    "try { " +
    "var __m = request(input).match(/r player_.*?=(.*?)</); " +
    "if (!__m) __r = 'video://' + input; " +
    "else { " +
    "var __h = JSON.parse(__m[1]); " +
    "var __u = __h.url; " +
    "if (__h.encrypt == '1') __u = unescape(__u); " +
    "else if (__h.encrypt == '2') __u = unescape(base64Decode(__u)); " +
    "if (/m3u8|mp4/.test(__u)) __r = __u; else __r = 'video://' + input; " +
    "} " +
    "} catch (e) { __r = 'video://' + input; } " +
    "__r"
);
const INLINE_ERJI = [
    "var __lazyCode = " + JSON.stringify(ERJI_LAZY_CODE) + ";",
    "var __lineKey = MY_RULE.title + '_line';",
    "var __lines = pdfa(html, 'body&&.stui-pannel__head') || [];",
    "var __groups = pdfa(html, 选集) || [];",
    "if (__lines.length > __groups.length) __lines = __lines.slice(0, __groups.length);",
    "var __lineIdx = parseInt(getVar(__lineKey, '0')) || 0;",
    "if (__lineIdx >= __groups.length) __lineIdx = 0;",
    "if (__lines.length >= 1) {",
    "  __lines.forEach(function (ln, i) {",
    "    var tn = ''; try { tn = pdfh(ln, 'h3.title&&Text') || ''; } catch (e) {}",
    "    if (!tn) tn = '线路' + (i + 1);",
    "    d.push({",
    "      title: (i === __lineIdx ? '🔥 ' : '') + tn,",
    "      url: $('#noLoading#').lazyRule(function (idx, key) {",
    "        putVar({key: key, value: idx + ''});",
    "        refreshPage(false);",
    "        return 'hiker://empty';",
    "      }, i, __lineKey),",
    "      col_type: 'scroll_button'",
    "    });",
    "  });",
    "}",
    "var __epHtml = __groups[__lineIdx] || '';",
    "var __eps = pdfa(__epHtml, 选集列表) || [];",
    "var __longTitle = __eps.some(function (ep) {",
    "  var tt = ''; try { tt = pdfh(ep, 'a&&Text') || ''; } catch (e) {}",
    "  return tt.length > 10;",
    "});",
    "var __epCol = __longTitle ? 'text_1' : 'text_3';",
    "__eps.forEach(function (ep) {",
    "  var tt = ''; try { tt = pdfh(ep, 'a&&Text') || ''; } catch (e) {}",
    "  var hh = ''; try { hh = pd(ep, 'a&&href') || ''; } catch (e) {}",
    "  if (!hh) return;",
    "  d.push({",
    "    title: tt,",
    "    url: hh + '#immersiveTheme##autoCache#@lazyRule=.js:' + __lazyCode,",
    "    col_type: __epCol",
    "  });",
    "});"
].join('\n');

if (v2.pages) {
    try {
        const pagesArr = JSON.parse(v2.pages);

        // dt 子页: 删原作者 hiker://search input (触发 v2 search_url 报 error scheme)
        const dt = pagesArr.find(p => p.path === 'dt' || p.name === 'dt');
        if (dt && /hiker:\/\/search\?rule=/.test(dt.rule)) {
            const before = dt.rule;
            dt.rule = dt.rule.replace(
                /s\.push\(\{\s*\n?\s*title:\s*"搜索"[\s\S]*?col_type:\s*"input"[\s\S]*?\}\);/,
                '/* 原作者 hiker://search input 删除 — 触发 v2 search_url 报 error scheme */'
            );
            if (dt.rule !== before) {
                console.log('  ✓ dt 子页: 删 hiker://search input');
            } else {
                console.warn('  ⚠️ dt 子页 hiker://search input 替换 regex 没命中');
            }
        }

        // lazy 子页: 去 `var lazy = ` 让 lazyRule 字符串作 completion value
        // (memory 7b41e54, $.require("lazy") 拿 undefined → "未知链接:0")
        const lazy = pagesArr.find(p => p.path === 'lazy' || p.name === 'lazy');
        if (lazy && /^\s*var\s+lazy\s*=\s*\$/.test(lazy.rule)) {
            lazy.rule = lazy.rule.replace(/^\s*var\s+lazy\s*=\s*/, '');
            console.log('  ✓ lazy 子页: 去 "var lazy = " 前缀');
        }

        // er 子页: 替换 模板·Q eval 为内联线路/选集实现
        const er = pagesArr.find(p => p.path === 'er' || p.name === 'er');
        if (er && /模板·Q/.test(er.rule)) {
            const before = er.rule;
            er.rule = before.replace(
                /eval\(JSON\.parse\(request\('hiker:\/\/page\/erji\?rule=模板·Q'\)\)\.rule\)/,
                INLINE_ERJI
            );
            if (er.rule !== before) {
                console.log('  ✓ er 子页: 内联 模板·Q (去海阔内置模板依赖)');
            } else {
                console.warn('  ⚠️ er 子页 模板·Q 替换 regex 没命中');
            }
        }

        v2.pages = JSON.stringify(pagesArr);
    } catch (e) {
        console.error('  pages 处理 FAIL:', e.message);
    }
}

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

// token-quick.txt: 修改后的 rule re-encode (字段修改 + base64 重新打包)
const miniB64 = Buffer.from(JSON.stringify(v2), 'utf8').toString('base64');
fs.writeFileSync(path.join(OUT, 'token-quick.txt'),
    '海阔视界规则分享，当前分享的是：小程序￥home_rule_v2￥base64://@' + title + '@' + miniB64,
    'utf8');

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
