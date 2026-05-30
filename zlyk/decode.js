/**
 * zlyk (周六影库) 解码 + 编译入口
 *
 * 原始口令: token-quick-original.txt 是用户从 HikerView 解云口令后导出的明文
 * 本脚本: 解 base64 → JSON → 输出 7 件套 (clipboard.json, single.json, share.txt, token-*.txt)
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
const title = m[1];
const b64 = m[2];
console.log('title:', title);
console.log('base64 length:', b64.length);

let rule;
try {
    const jsonStr = Buffer.from(b64, 'base64').toString('utf8');
    rule = JSON.parse(jsonStr);
} catch (e) {
    console.error('FAIL: base64 解码或 JSON 解析失败:', e.message);
    process.exit(1);
}

// ============================
// 原作者 typo 修正: find_rule 里定义的是 `分类标领`,
// 但 dt 子页用的是 `分类标题`, 跑起来报 ReferenceError(JSEngine#36 行 35)
// ============================
if (rule.find_rule && /分类标领/.test(rule.find_rule)) {
    rule.find_rule = rule.find_rule.replace(/分类标领/g, '分类标题');
    console.log('  ✓ find_rule typo: 分类标领 → 分类标题');
}

// ============================
// 硬化: find_rule 里那些 `const 中文名 = ...` 改成 `var`,
// 因为 dt 子页是 `eval(JSON.parse(request('hiker://page/dt')).rule)` 注入进来的,
// 海阔 JSEngine (Rhino 派) 对 ES6 `const`/`let` 在 eval 跨边界时有时
// 作用域可见性不对, 用 `var` (function-scoped) 最稳。
// ============================
if (rule.find_rule) {
    const before = rule.find_rule;
    // 注意: \b 在中文字符前不算 word boundary, 必须显式锚定行首或前置空白
    rule.find_rule = rule.find_rule.replace(
        /(^|[\s;])const(\s+)(分类颜色|大类定位|小类定位|大类过滤|分类标题|分类链接|排除|page)/g,
        '$1var$2$3'
    );
    if (rule.find_rule !== before) {
        console.log('  ✓ find_rule: const 中文变量 → var (Rhino eval 作用域硬化)');
    } else {
        console.warn('  ⚠️ const → var 替换没命中, 检查 decode.js 正则');
    }
}

// ============================
// 后处理: 把 er 子页里 eval('hiker://page/erji?rule=模板·Q') 这一行
// 替换成内联的"二级播放页"实现, 去掉对海阔内置 模板·Q 的依赖
//
// 模板·Q 干的事 (用上面定义的 线路 / 选集 / 线路名 / 选集列表 4 个 selector):
//   1. pdfa(html, 线路) 抽多条线路标题
//   2. pdfa(html, 选集) 抽多条线路的选集容器 (与线路一一对应)
//   3. 渲染线路切换按钮 (scroll_button), 当前选中标 🔥
//   4. 用当前选中线路的选集容器 pdfa(., 选集列表) 抽集数 li
//   5. 集数渲染成卡片, 点击 → @lazyRule 调 lazy 子页解 m3u8/mp4
//   6. 集数标题长 (>10字) 用 text_1, 短的用 text_3 (避免截断, 见 skill cookbook)
// ============================
const INLINE_ERJI_TEMPLATE = [
    "var __lineKey = MY_RULE.title + '_line';",
    "var __lineIdx = parseInt(getVar(__lineKey, '0')) || 0;",
    "var __lines = pdfa(html, 线路) || [];",
    "var __groups = pdfa(html, 选集) || [];",
    "if (__lineIdx >= __lines.length) __lineIdx = 0;",
    "if (__lines.length > 1) {",
    "  __lines.forEach(function (ln, i) {",
    "    var tn = pdfh(ln, 线路名) || ('线路' + (i + 1));",
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
    "    url: hh + '#immersiveTheme##autoCache#@lazyRule=.js:$.require(\"lazy\")',",
    "    col_type: __epCol",
    "  });",
    "});",
].join('\n');

if (rule.pages) {
    let pagesArr;
    try { pagesArr = JSON.parse(rule.pages); } catch (e) { pagesArr = null; }
    if (Array.isArray(pagesArr)) {
        const er = pagesArr.find(p => p.path === 'er' || p.name === 'er');
        if (er && /模板·Q/.test(er.rule)) {
            const before = er.rule;
            er.rule = before.replace(
                /eval\(JSON\.parse\(request\('hiker:\/\/page\/erji\?rule=模板·Q'\)\)\.rule\)/,
                INLINE_ERJI_TEMPLATE
            );
            if (er.rule === before) {
                console.warn('  ⚠️ er 子页 模板·Q 替换 regex 没命中, 检查 decode.js INLINE_ERJI_TEMPLATE 的 anchor');
            } else {
                console.log('  ✓ er 子页 模板·Q → 内联实现 (去掉海阔内置模板依赖)');
            }
            rule.pages = JSON.stringify(pagesArr);
        }
    }
}

console.log('\n--- decoded rule fields ---');
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
let allOk = true;
allOk = checkJs('find_rule', rule.find_rule) && allOk;
allOk = checkJs('searchFind', rule.searchFind) && allOk;
allOk = checkJs('detail_find_rule', rule.detail_find_rule) && allOk;
allOk = checkJs('preRule', rule.preRule) && allOk;

if (rule.pages) {
    try {
        const pages = JSON.parse(rule.pages);
        pages.forEach((p, i) => {
            allOk = checkJs(`pages[${i}] ${p.path || p.name}`, p.rule) && allOk;
        });
    } catch (e) {
        console.error('  pages JSON.parse FAIL:', e.message);
        allOk = false;
    }
}

if (!allOk) {
    console.error('\n⚠️ 语法校验有失败项, 但仍继续输出 (可能需要手工修)');
}

// ============================
// 生成 v2 兼容的规则对象
// ============================
const v2 = {
    title: rule.title || '周六影库',
    author: rule.author || '',
    version: rule.version || 0,
    group: rule.group || '',
    titleColor: rule.titleColor || '',
    url: rule.url || '',
    col_type: rule.col_type || 'movie_3',
    class_name: rule.class_name || '',
    class_url: rule.class_url || '',
    area_name: rule.area_name || '',
    area_url: rule.area_url || '',
    year_name: rule.year_name || '',
    year_url: rule.year_url || '',
    sort_name: rule.sort_name || '',
    sort_url: rule.sort_url || '',
    find_rule: rule.find_rule || '',
    search_url: rule.search_url || rule.searchUrl || '',
    searchFind: rule.searchFind || '',
    detail_col_type: rule.detail_col_type || 'movie_1',
    detail_find_rule: rule.detail_find_rule || '*',
    sdetail_col_type: rule.sdetail_col_type || 'movie_1',
    sdetail_find_rule: rule.sdetail_find_rule || '*',
    ua: rule.ua || 'mobile',
    preRule: rule.preRule || '',
    pages: rule.pages || '',
    icon: rule.icon || '',
    proxy: rule.proxy || '',
};

// ============================
// 输出 7 件套
// ============================
const OUT = __dirname;

// 1. clipboard.json (订阅源数组)
fs.writeFileSync(
    path.join(OUT, 'clipboard.json'),
    JSON.stringify([v2], null, 2),
    'utf8'
);

// 2. single.json (单条对象)
fs.writeFileSync(
    path.join(OUT, 'single.json'),
    JSON.stringify(v2, null, 2),
    'utf8'
);

// 3. share.txt (旧版分享文本)
fs.writeFileSync(
    path.join(OUT, 'share.txt'),
    '海阔视界·我的视频·' + v2.title + '·' + JSON.stringify(v2),
    'utf8'
);

// 4. token-video.txt
fs.writeFileSync(
    path.join(OUT, 'token-video.txt'),
    '海阔视界规则分享，当前分享的是：视频￥video_rule_v2￥' + JSON.stringify(v2),
    'utf8'
);

// 5. token-home.txt
fs.writeFileSync(
    path.join(OUT, 'token-home.txt'),
    '海阔视界规则分享，当前分享的是：首页频道￥home_rule_v2￥' + JSON.stringify(v2),
    'utf8'
);

// 6. token-search.txt (搜索引擎子集)
const searchOnly = {
    title: v2.title,
    author: v2.author,
    version: v2.version,
    search_url: v2.search_url,
    searchFind: v2.searchFind,
    detail_col_type: v2.detail_col_type,
    detail_find_rule: v2.detail_find_rule,
    sdetail_col_type: v2.sdetail_col_type,
    sdetail_find_rule: v2.sdetail_find_rule,
    ua: v2.ua,
    preRule: v2.preRule,
    pages: v2.pages,
};
fs.writeFileSync(
    path.join(OUT, 'token-search.txt'),
    '海阔视界规则分享，当前分享的是：搜索引擎￥search_rule_v2￥' + JSON.stringify(searchOnly),
    'utf8'
);

// 7. token-quick.txt (小程序口令: home_rule_v2 base64 包装)
const miniJson = JSON.stringify(v2);
const miniB64 = Buffer.from(miniJson, 'utf8').toString('base64');
fs.writeFileSync(
    path.join(OUT, 'token-quick.txt'),
    '海阔视界规则分享，当前分享的是：小程序￥home_rule_v2￥base64://@' + v2.title + '@' + miniB64,
    'utf8'
);

console.log('\n--- output (7 files) ---');
['clipboard.json', 'single.json', 'share.txt',
 'token-video.txt', 'token-home.txt', 'token-search.txt', 'token-quick.txt'].forEach(f => {
    const sz = fs.statSync(path.join(OUT, f)).size;
    console.log('  ', f, sz, 'B');
});

console.log('\nrule.title :', v2.title);
console.log('rule.url   :', v2.url);
console.log('rule.search:', v2.search_url);
console.log('rule.pages :', v2.pages ? JSON.parse(v2.pages).length + ' subpages' : '(none)');
