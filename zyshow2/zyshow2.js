/**
 * 海阔视界 小程序 — zyshow2 (台湾综艺,深度搜索版)
 *
 * 与原 zyshow 的差异:
 *   1. UI 重构: 顶部全局搜索框 + 横向分类 tab + 内容网格,搜索框跨 tab 始终可见
 *   2. 搜索完全分离: 走 searchFind / search_url, 不再混在 find_rule 里
 *   3. 突破 CF Managed Challenge: WebView 抓 cf_clearance cookie → setItem 持久化
 *      后续 fetch 自带 cookie + 完整浏览器 header
 *   4. 全节目索引缓存: 索引 105 节目 × 每节目 ~10 集到 hiker://files/cache/zyshow2_index.json
 *      搜索时在索引上做 (节目名 | 集数标题 | 主题 | 嘉宾) 多维模糊匹配
 *
 * 数据流:
 *   首次使用 → 检测 cookie/index 状态
 *     无 cookie → 引导跳 pages/getCookie (WebView)
 *     有 cookie 无 index → 引导跳 pages/indexer (后台构建, 显进度)
 *     都齐 → 正常显示 tab + 内容
 *   后续搜索 → searchFind 读 index → 子串匹配 → 列出命中集数
 */

// ========== 站点常量 ==========
var SITE_HOST = 'https://www.zyshow.co';
var INDEX_FILE = 'hiker://files/cache/zyshow2_index.json';
var COOKIE_KEY = 'zys2_cookie';       // setItem 键
var COOKIE_VAR = 'zys2_ck_from_wv';   // WebView 回填用的 getVar 中转键
var INDEX_VAR = 'zys2_idx_progress';  // indexer 进度中转

// 7 大分类 (用户希望的分类 tab)
var CAT_TABS = [
    {id: 'th', name: '谈话综艺'},
    {id: 'zm', name: '周末综艺'},
    {id: 'jx', name: '行脚旅游'},
    {id: 'ss', name: '时尚女人'},
    {id: 'ms', name: '美食料理'},
    {id: 'yx', name: '综合节目'},
    {id: 'yl', name: '音乐选秀'}
];

// 完整浏览器 header (尽量让 fetch 不被 CF 重新拦)
// 注意: 海阔 fetch 用 OkHttp, TLS 指纹和 Chrome 不同,即便 cookie 对也可能拦
// 这里尽力补齐应用层 header, 实测不行再 fallback
var FULL_HEADERS_JSON = JSON.stringify({
    'User-Agent': 'Mozilla/5.0 (Linux; Android 12; SM-A536U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'Upgrade-Insecure-Requests': '1',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'Referer': 'https://www.zyshow.co/'
});

// m3u8 嗅探 lazy (从原 zyshow 沿用,自带 cookie + 完整 header)
var LAZY_CODE =
    "var __r = ''; " +
    "var ck = getItem('" + COOKIE_KEY + "', ''); " +
    "var hd = " + FULL_HEADERS_JSON + "; " +
    "if (ck) hd['Cookie'] = ck; " +
    "var html = ''; try { html = fetch(input, {headers: hd}); } catch(e) { __r = 'hiker://empty##单集页加载失败 ' + e.message; } " +
    "if (!__r) { " +
    "  var m = html.match(/url\\|([A-Za-z0-9+\\/=]{40,})\\|/); " +
    "  if (!m) __r = 'hiker://empty##单集页未抓到 base64 hash (可能 cookie 失效)'; " +
    "  else { " +
    "    var jumpUrl = '" + SITE_HOST + "/url=' + m[1]; " +
    "    var ck2 = ''; try { ck2 = fetch(jumpUrl, {headers: hd}); } catch(e) { __r = 'hiker://empty##跳转失败 ' + e.message; } " +
    "    if (!__r) { " +
    "      var m2 = (ck2 || '').match(/urls\\s*=\\s*[\\'\"]([^\\'\"]+)[\\'\"]/); " +
    "      __r = m2 ? m2[1] + ';{Referer@https://sc.zyshow.net/}' : 'hiker://empty##未抓到 m3u8'; " +
    "    } " +
    "  } " +
    "} " +
    "__r";


var rule = {
    title: 'zyshow2',
    author: 'claude',
    desc: '台湾综艺 (zyshow.co) — 深度搜索版,带 CF 突破',
    host: SITE_HOST,
    url: 'hiker://empty',          // ★ 单页设计: tab 不靠 class_url
    col_type: 'movie_3',
    class_name: '',                // 不用海阔的 class tab,自己渲染
    class_url: '',
    searchUrl: 'hiker://empty?key=**',  // searchFind 用 MY_URL.split('key=')[1] 拿关键字
    timeout: 20000,
    detail_col_type: 'movie_1',
    sdetail_col_type: 'movie_1',
    sdetail_find_rule: '*',

    // ============ preRule: 回填 WebView cookie ============
    preRule: $.toString(() => {
        // WebView 在子页面把 cookie 写到 getVar(COOKIE_VAR),preRule 转入 setItem 持久化
        var c = getVar('zys2_ck_from_wv', '');
        if (c) {
            setItem('zys2_cookie', c);
            putVar({key: 'zys2_ck_from_wv', value: ''});
        }
        // indexer 把进度写在 getVar, preRule 不动它,只是别让脏数据残留
    }),

    // ============ find_rule: 主页面 ============
    // ⚠ 架构说明 — 为什么用"本地索引"而非"直调真接口":
    //   zyshow.co 的 CF 按路径细粒度配置:
    //     / 首页              → ✅ cookie+OkHttp 能拉 (实测 72KB 真 HTML)
    //     /<slug>/ 节目页      → ✅ 放行
    //     /search.asp[?...]   → ❌ 单独拦死, 即便带 cf_clearance 也返 5.9KB Just a moment
    //   实测日期 2026-05-18, 试了 keyword/key/wd/无参四种全部被拦。
    //   所以"过 cookie + 直调搜索"路径死路, 索引方案是被迫的工程妥协。
    //   如未来 CF 策略变松, 可访问 hiker://page/testSearch 复测。
    find_rule: $.toString((LAZY_CODE, CAT_TABS, FULL_HEADERS_JSON, SITE_HOST) => {
        var d = [];
        (function () {
            var cookie = getItem('zys2_cookie', '');
            var indexExists = false;
            var indexPartial = false;
            var indexProgress = '';
            try {
                var rawIdx = readFile('hiker://files/cache/zyshow2_index.json') || '';
                if (rawIdx.length > 10) {
                    indexExists = true;
                    var idxMeta = JSON.parse(rawIdx);
                    if (idxMeta && idxMeta.partial) {
                        indexPartial = true;
                        indexProgress = idxMeta.progress || '';
                    }
                }
            } catch (e) {}
            var kw = getVar('zys2_kw', '');

            // -------- 顶部全局搜索框 (输入只暂存, 点搜索/回车才触发) --------
            // 输入框 input 变量是当前框内值; onChange 只 putVar 到临时 key, 不刷页
            // 搜索按钮读取临时 key, 同步到 zys2_kw 后 refreshPage
            d.push({
                title: '',
                desc: indexExists
                    ? '输入关键字后点 "🔍 搜索" (清空恢复 tab)'
                    : '输入关键字后点 "🔍 搜索" (需先构建索引)',
                col_type: 'input',
                extra: {
                    titleVisible: false,
                    defaultValue: kw,
                    onChange: 'putVar({key:"zys2_kw_pending",value:input})'
                }
            });
            d.push({
                title: '🔍 搜索',
                url: $('#noLoading#').lazyRule(() => {
                    var p = getVar('zys2_kw_pending', '');
                    putVar({key: 'zys2_kw', value: p});
                    // 切到本地搜索时清掉实时结果, 否则同 kw 总命中实时分支
                    putVar({key: 'zys2_wv_results', value: ''});
                    putVar({key: 'zys2_wv_results_kw', value: ''});
                    refreshPage(false);
                    return 'hiker://empty';
                }),
                col_type: 'scroll_button'
            });
            d.push({
                title: '🌐 实时',
                url: $('#noLoading#').lazyRule(() => {
                    var p = getVar('zys2_kw_pending', '') || getVar('zys2_kw', '');
                    if (!p) return 'toast://请先在输入框输入关键字';
                    putVar({key: 'zys2_kw', value: p});
                    putVar({key: 'zys2_wv_results', value: ''});
                    putVar({key: 'zys2_wv_results_kw', value: ''});
                    putVar({key: 'zys2_wv_dump', value: ''});
                    return 'hiker://page/wvSearch?rule=' + MY_RULE.title + '&kw=' + encodeURIComponent(p);
                }),
                col_type: 'scroll_button'
            });
            if (kw) {
                d.push({
                    title: '✖ 清空',
                    url: $('#noLoading#').lazyRule(() => {
                        putVar({key: 'zys2_kw', value: ''});
                        putVar({key: 'zys2_kw_pending', value: ''});
                        putVar({key: 'zys2_wv_results', value: ''});
                        putVar({key: 'zys2_wv_results_kw', value: ''});
                        refreshPage(false);
                        return 'hiker://empty';
                    }),
                    col_type: 'scroll_button'
                });
            }

            // -------- 状态横条:Cookie / Index 健康 --------
            var cookieIcon = cookie ? '🟢' : '🔴';
            var indexIcon = indexExists ? (indexPartial ? '🟡' : '🟢') : '🔴';
            d.push({
                title: cookieIcon + ' Cookie',
                url: $('#noLoading#').lazyRule(() => {
                    return 'hiker://page/getCookie?rule=' + MY_RULE.title;
                }),
                col_type: 'scroll_button'
            });
            d.push({
                title: indexIcon + ' 索引' + (indexPartial ? ' ' + indexProgress : ''),
                url: $('#noLoading#').lazyRule(() => {
                    return 'hiker://page/indexer?rule=' + MY_RULE.title;
                }),
                col_type: 'scroll_button'
            });
            d.push({
                title: '🔄 刷新',
                url: $('#noLoading#').lazyRule(() => {
                    putVar({key: 'zys2_kw', value: ''});
                    putVar({key: 'zys2_kw_pending', value: ''});
                    refreshPage();
                    return 'toast://刷新中';
                }),
                col_type: 'scroll_button'
            });
            d.push({col_type: 'blank_block'});

            // -------- Cookie 缺失提示 --------
            if (!cookie) {
                d.push({
                    title: '⚠ 未拿到 Cloudflare cookie',
                    desc: '点击上方 "🔴 Cookie" 进入 WebView 过 CF (页面菜单出现即自动返回)',
                    col_type: 'rich_text'
                });
                return;
            }

            // -------- 索引缺失提示 --------
            if (!indexExists) {
                d.push({
                    title: '⚠ 未构建节目索引',
                    desc: '点击上方 "🔴 索引" 开始抓取 105 节目 (约 2-3 分钟,只跑一次)',
                    col_type: 'rich_text'
                });
                return;
            }

            // -------- 加载索引 --------
            var idx = null;
            try { idx = JSON.parse(readFile('hiker://files/cache/zyshow2_index.json') || '{"shows":[]}'); }
            catch (e) {
                d.push({title: '索引文件损坏: ' + e.message, col_type: 'rich_text'});
                return;
            }

            // -------- 关键字搜索模式 (覆盖 tab 网格) --------
            if (kw) {
                // 优先看实时(WebView)结果, 没有再走本地索引
                var wvJson = getVar('zys2_wv_results', '');
                var wvKw = getVar('zys2_wv_results_kw', '');
                var wvResults = [];
                if (wvJson && wvKw === kw) {
                    try { wvResults = JSON.parse(wvJson) || []; } catch (e) {}
                }
                if (wvResults.length > 0) {
                    d.push({title: '🌐 "' + kw + '" · 实时搜索 · ' + wvResults.length + ' 条', col_type: 'rich_text'});
                    d.push({title: '&nbsp;&nbsp;<font color="#888">来源: WebView 走真接口 /search.asp. 点 "🔍 搜索" 切回本地索引</font>', col_type: 'rich_text'});
                    d.push({col_type: 'blank_block'});
                    wvResults.forEach((r) => {
                        var href = r.href || '';
                        if (!href || href === '#') {
                            d.push({title: r.title || '(信息)', desc: r.desc || '', col_type: 'rich_text'});
                            return;
                        }
                        var url = href;
                        if (!/^https?:/.test(url)) url = SITE_HOST + (url.indexOf('/') === 0 ? url : '/' + url);
                        var isEp = /\/v\/\d{8}\.html/.test(url);
                        d.push({
                            title: r.title || url,
                            desc: r.desc || '',
                            url: isEp ? (url + '@lazyRule=.js:' + LAZY_CODE) : url,
                            col_type: 'text_1'
                        });
                    });
                    return;
                }

                var kwLower = kw.toLowerCase();
                var nameHits = [], epHits = [];
                (idx.shows || []).forEach((s) => {
                    if ((s.name || '').toLowerCase().indexOf(kwLower) >= 0) nameHits.push(s);
                    (s.episodes || []).forEach((ep) => {
                        var hay = ((ep.title || '') + ' ' + (ep.subj || '') + ' ' + (ep.guests || '')).toLowerCase();
                        if (hay.indexOf(kwLower) >= 0) epHits.push({show: s, ep: ep});
                    });
                });
                d.push({title: '"' + kw + '"  ·  ' + nameHits.length + ' 节目, ' + epHits.length + ' 集', col_type: 'rich_text'});
                if (nameHits.length > 0) {
                    d.push({title: '━━ 节目 ━━', col_type: 'rich_text'});
                    nameHits.forEach((s) => {
                        d.push({
                            title: s.name,
                            desc: (s.episodes || []).length + ' 集',
                            pic_url: SITE_HOST + '/img/' + s.slug + '.jpg@Referer=' + SITE_HOST + '/',
                            url: SITE_HOST + '/' + s.slug + '/',
                            col_type: 'movie_3'
                        });
                    });
                }
                if (epHits.length > 0) {
                    d.push({title: '━━ 集数 ━━', col_type: 'rich_text'});
                    var slice = epHits.slice(0, 80);
                    slice.forEach((h) => {
                        var ep = h.ep, s = h.show;
                        var title = '[' + s.name + '] ' + (ep.title || ep.date || '');
                        var sub = (ep.subj || '').substring(0, 50);
                        var gst = (ep.guests || '').substring(0, 40);
                        var desc = sub + (gst ? '\n' + gst : '');
                        d.push({
                            title: title,
                            desc: desc,
                            url: SITE_HOST + '/' + s.slug + '/v/' + ep.date + '.html@lazyRule=.js:' + LAZY_CODE,
                            col_type: 'text_1'
                        });
                    });
                    if (epHits.length > slice.length) {
                        d.push({title: '(还有 ' + (epHits.length - slice.length) + ' 集未显示,请细化关键字)', col_type: 'rich_text'});
                    }
                }
                if (nameHits.length === 0 && epHits.length === 0) {
                    d.push({title: '无匹配 — 试试更短的关键词', col_type: 'rich_text'});
                }
                return;
            }

            // -------- 分类 tab --------
            var curCat = getVar('zys2_cat', CAT_TABS[0].id);
            CAT_TABS.forEach((tab) => {
                var sel = curCat === tab.id;
                d.push({
                    title: sel ? '‘‘’’' + tab.name.fontcolor('#19B89D').bold() : tab.name,
                    url: sel ? 'hiker://empty' : $('#noLoading#').lazyRule((cid) => {
                        putVar({key: 'zys2_cat', value: cid});
                        refreshPage(false);
                        return 'hiker://empty';
                    }, tab.id),
                    col_type: 'scroll_button'
                });
            });
            d.push({col_type: 'blank_block'});

            // -------- 当前 tab 的节目卡片 --------
            var shows = (idx.shows || []).filter(s => s.cat === curCat);
            if (shows.length === 0) {
                d.push({title: '本分类无节目,试试重建索引', col_type: 'rich_text'});
            } else {
                d.push({title: shows.length + ' 个节目', col_type: 'rich_text'});
                shows.forEach((s) => {
                    d.push({
                        title: s.name,
                        desc: (s.episodes || []).length + ' 集',
                        pic_url: SITE_HOST + '/img/' + s.slug + '.jpg@Referer=' + SITE_HOST + '/',
                        url: SITE_HOST + '/' + s.slug + '/',
                        col_type: 'movie_3'
                    });
                });
            }
        })();
        setResult(d);
    }, LAZY_CODE, CAT_TABS, FULL_HEADERS_JSON, SITE_HOST),

    // ============ detail_find_rule: 节目集数页 ============
    // 节目页 = SITE_HOST/<slug>/, 解 tr 表拿集数
    detail_find_rule: $.toString((LAZY_CODE, FULL_HEADERS_JSON) => {
        var d = [];
        (function () {
        var cookie = getItem('zys2_cookie', '');
        var hd = JSON.parse(FULL_HEADERS_JSON);
        if (cookie) hd['Cookie'] = cookie;

        var html = '';
        var fatalErr = '';
        try { html = fetch(MY_URL, {headers: hd}) || ''; }
        catch (e) { fatalErr = '加载失败: ' + e.message; }

        if (!fatalErr && /<title[^>]*>\s*Just a moment|Checking your browser before accessing|cf-browser-verification|id=["']cf-error-details["']/i.test(html)) {
            fatalErr = 'Cookie 已失效,请回首页重过 CF';
        }
        if (!fatalErr && (!html || html.length < 200)) {
            fatalErr = '页面为空: ' + MY_URL;
        }

        if (fatalErr) {
            d.push({title: fatalErr, col_type: 'rich_text'});
            return;
        }

        // 海报 + 标题 (zyshow.co 节目页结构: img / h3)
        var poster = '';
        try { poster = parseDomForHtml(html, 'img,0&&src') || ''; } catch (e) {}
        var pageTitle = '';
        try {
            pageTitle = (parseDomForHtml(html, 'title&&Text') || '').replace(/\s*[-|–]\s*.*$/, '').trim();
        } catch (e) {}
        if (poster && pageTitle) {
            d.push({
                title: pageTitle,
                pic_url: poster,
                desc: '',
                url: MY_URL,
                col_type: 'movie_1_vertical_pic'
            });
        }

        // tr 解集数
        var blocks = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
        var added = 0;
        var seen = {};
        for (var k = 0; k < blocks.length; k++) {
            var tr = blocks[k];
            var dM = tr.match(/\/v\/(\d{8})\.html/);
            if (!dM) continue;
            var date = dM[1];
            if (seen[date]) continue;
            seen[date] = 1;
            var tM2 = tr.match(/<a[^>]*\btitle="([^"]+)"/);
            var t = tM2 ? tM2[1] : date;
            var hM = tr.match(/href="([^"]*\/v\/\d{8}\.html)"/);
            var href = hM ? hM[1] : '';
            var tds = tr.match(/<td[^>]*>[\s\S]*?<\/td>/g) || [];
            var stripTd = function (s) { return (s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); };
            var subj = tds.length >= 2 ? stripTd(tds[1]) : '';
            var guests = tds.length >= 3 ? stripTd(tds[2]) : '';
            var absHref = /^https?:/.test(href) ? href : ('https://www.zyshow.co' + href.replace(/^\.\.?\//, '/'));
            var desc = (subj ? subj.substring(0, 50) : '') + (guests ? '\n' + guests.substring(0, 40) : '');
            d.push({
                title: t,
                desc: desc,
                url: absHref + '@lazyRule=.js:' + LAZY_CODE,
                col_type: 'text_1'
            });
            added++;
        }
        if (added === 0) d.push({title: '本节目未解析到集数', col_type: 'rich_text'});
        })();
        setResult(d);
    }, LAZY_CODE, FULL_HEADERS_JSON),

    // ============ searchFind: 全局搜索 (在索引上跑) ============
    // search_url = 'hiker://empty?key=**', 关键字从 MY_URL 提取
    search_find_rule: $.toString((LAZY_CODE, SITE_HOST) => {
        var d = [];
        (function () {
        var kw = '';
        try { kw = decodeURIComponent((MY_URL.split('key=')[1] || '').split('&')[0]); } catch (e) {}
        if (!kw) {
            d.push({title: '请输入关键字', col_type: 'rich_text'});
            return;
        }

        var idx = null;
        try { idx = JSON.parse(readFile('hiker://files/cache/zyshow2_index.json') || '{"shows":[]}'); }
        catch (e) {
            d.push({title: '索引未构建或损坏,请回小程序首页点击 "🔴 索引"', col_type: 'rich_text'});
            return;
        }

        var kwLower = kw.toLowerCase();
        var nameHits = [];
        var epHits = [];

        (idx.shows || []).forEach((s) => {
            // 节目名匹配
            if ((s.name || '').toLowerCase().indexOf(kwLower) >= 0) {
                nameHits.push(s);
            }
            // 集数标题/主题/嘉宾匹配
            (s.episodes || []).forEach((ep) => {
                var hay = ((ep.title || '') + ' ' + (ep.subj || '') + ' ' + (ep.guests || '')).toLowerCase();
                if (hay.indexOf(kwLower) >= 0) {
                    epHits.push({show: s, ep: ep});
                }
            });
        });

        d.push({
            title: '"' + kw + '"  ·  ' + nameHits.length + ' 个节目, ' + epHits.length + ' 集匹配',
            col_type: 'rich_text'
        });

        // 节目名命中(直接列卡片,进详情看全部集数)
        if (nameHits.length > 0) {
            d.push({title: '━━ 节目 ━━', col_type: 'rich_text'});
            nameHits.forEach((s) => {
                d.push({
                    title: s.name,
                    desc: (s.episodes || []).length + ' 集',
                    pic_url: SITE_HOST + '/img/' + s.slug + '.jpg@Referer=' + SITE_HOST + '/',
                    url: SITE_HOST + '/' + s.slug + '/',
                    col_type: 'movie_3'
                });
            });
        }

        // 集数命中(直接给可点播放的链接 + lazy)
        if (epHits.length > 0) {
            d.push({title: '━━ 集数 ━━', col_type: 'rich_text'});
            // 最多展示 80 条避免太长
            var slice = epHits.slice(0, 80);
            slice.forEach((h) => {
                var ep = h.ep, s = h.show;
                var title = '[' + s.name + '] ' + (ep.title || ep.date || '');
                var sub = (ep.subj || '').substring(0, 50);
                var gst = (ep.guests || '').substring(0, 40);
                var desc = sub + (gst ? '\n' + gst : '');
                var absHref = SITE_HOST + '/' + s.slug + '/v/' + ep.date + '.html';
                d.push({
                    title: title,
                    desc: desc,
                    url: absHref + '@lazyRule=.js:' + LAZY_CODE,
                    col_type: 'text_1'
                });
            });
            if (epHits.length > slice.length) {
                d.push({title: '(还有 ' + (epHits.length - slice.length) + ' 集未显示,请细化关键字)', col_type: 'rich_text'});
            }
        }

        if (nameHits.length === 0 && epHits.length === 0) {
            d.push({title: '无匹配 — 试试更短的关键词,或回首页重建索引', col_type: 'rich_text'});
        }
        })();
        setResult(d);
    }, LAZY_CODE, SITE_HOST),

    // ============ pages: 子页面 ============
    // ⚠ CF Turnstile 解法(2026-05 经实验矩阵 6 种组合验证):
    //   关键是 extra.ua **留空** —— 让 x5 WebView 用自己的内核 UA, HTTP 头和 JS
    //   指纹完全一致, Turnstile 一次点过, cf_clearance cookie 自动签发。
    //   *不要*强行设 ua: 'Mozilla/5.0 ... Chrome/120 ...' —— HTTP UA 假装 Chrome
    //   但 navigator.userAgent / userAgentData 仍是 x5 内核, CF 立刻识破造假,
    //   反复 challenge 死循环。 (git log: feat zyshow2: CF Turnstile 实验矩阵)
    pages: (function () {
        // 子页 1: 一键过 CF —— 加载 /search.asp 触发 challenge, Turnstile 出现后用户点
        // "我是真人", JS 轮询到 cf_clearance 即 setItem 持久化并返回
        var getCookiePage = {
            name: '获取Cookie',
            path: 'getCookie',
            col_type: 'movie_3',
            rule: $.toString((SITE_HOST) => {
                var d = [];
                d.push({
                    title: '🔑 过 Cloudflare 验证',
                    desc: 'WebView 会自动加载 /search.asp 触发 CF Turnstile。出现"我是真人"复选框请点它,通过后 cf_clearance cookie 自动保存,返回小程序首页即可正常搜索。\n\n注意:WebView UA 留空(用 x5 内核默认),这是 Turnstile 一次过的关键。',
                    col_type: 'rich_text'
                });
                d.push({
                    col_type: 'x5_webview_single',
                    url: SITE_HOST + '/search.asp',
                    desc: 'float&&90%',
                    title: '',
                    extra: {
                        canBack: true,
                        // ⚠ 不设 ua —— 让 x5 用自己内核默认 UA, HTTP/JS 指纹一致 CF 才放行
                        js: $.toString(() => {
                            var tries = 0;
                            function check() {
                                tries++;
                                try {
                                    var ck = '';
                                    try { ck = (fba.getCookie(location.href) || document.cookie || ''); } catch (e) {}
                                    if (ck.indexOf('cf_clearance') >= 0) {
                                        fba.putVar('zys2_ck_from_wv', ck);
                                        fba.toast('✅ 已过 CF, 保存 cookie 中');
                                        fba.parseLazyRule($$$().lazyRule(() => {
                                            var c = getVar('zys2_ck_from_wv', '');
                                            if (c) setItem('zys2_cookie', c);
                                            back();
                                            refreshPage();
                                        }));
                                        return;
                                    }
                                } catch (e) { try { fba.log('zys2 ck err: ' + e.message); } catch (ee) {} }
                                if (tries < 240) setTimeout(check, 500);
                                else { try { fba.toast('120s 内未过 CF, 请手动重试'); } catch (e) {} }
                            }
                            setTimeout(check, 1500);
                        })
                    }
                });
                setResult(d);
            }, SITE_HOST)
        };


        // ----- 子页 N: 索引构建器 (诊断 + 分批) -----
        // 设计:状态机存 getVar('zys2_idx_state'),phase:
        //   '' / null  → 入口页 (检测现有索引 + "开始" 按钮)
        //   'diag'     → 单次诊断 (抓首页 + 1 节目,验证 cookie/header 能过 CF)
        //   'batch'    → 分批抓集数 (每批 BATCH 个节目,显进度,用户点继续)
        // 每批走完写一次 partial 索引文件,中途意外退出也保留进度
        var indexerPage = {
            name: '构建索引',
            path: 'indexer',
            col_type: 'movie_3',
            rule: $.toString((CAT_TABS, FULL_HEADERS_JSON, SITE_HOST) => {
                var BATCH = 5;
                var FETCH_TIMEOUT = 10000;
                // 收紧 — 只匹配真 challenge 页特征 (title/body 文案/error id)
                // 旧版误把 CF 全站注入的 cdn-cgi/challenge-platform 脚本路径判为被拦
                var CF_RE = /<title[^>]*>\s*Just a moment|Checking your browser before accessing|cf-browser-verification|id=["']cf-error-details["']|Attention Required.*Cloudflare/i;
                var IDX_FILE = 'hiker://files/cache/zyshow2_index.json';

                var d = [];
                (function () {
                    var cookie = getItem('zys2_cookie', '');
                    if (!cookie) {
                        d.push({title: '⚠ 没有 cookie,请先回首页点 "🔴 Cookie" 过 CF', col_type: 'rich_text'});
                        return;
                    }
                    var hd = JSON.parse(FULL_HEADERS_JSON);
                    hd['Cookie'] = cookie;

                    var state = null;
                    try { state = JSON.parse(getVar('zys2_idx_state', '') || 'null'); } catch (e) {}

                    var resetBtn = function () {
                        d.push({col_type: 'blank_block'});
                        d.push({
                            title: '⟲ 重置进度',
                            url: $('#noLoading#').lazyRule(() => {
                                putVar({key: 'zys2_idx_state', value: ''});
                                refreshPage();
                                return 'hiker://empty';
                            }),
                            col_type: 'text_center_1'
                        });
                    };

                    // ========== 入口页 ==========
                    if (!state || !state.phase) {
                        var hasIdx = false, idxInfo = '', existingShows = [];
                        try {
                            var raw = readFile(IDX_FILE) || '';
                            if (raw.length > 10) {
                                hasIdx = true;
                                var j = JSON.parse(raw);
                                existingShows = j.shows || [];
                                var ep = 0;
                                existingShows.forEach(s => { ep += (s.episodes || []).length; });
                                idxInfo = existingShows.length + ' 节目 / ' + ep + ' 集, 构建于 ' + (j.builtAt || '?');
                            }
                        } catch (e) {}

                        d.push({title: '📋 索引构建器', col_type: 'rich_text'});
                        d.push({title: '&nbsp;&nbsp;现有索引: <b>' + (hasIdx ? idxInfo : '无') + '</b>', col_type: 'rich_text'});

                        if (hasIdx) {
                            // 有索引 → 推荐"刷新集数",跳过首页 fetch (CF 对 / 入口严, /<slug>/ 路径松)
                            d.push({col_type: 'blank_block'});
                            d.push({title: '✨ 推荐: 仅刷新集数 (不抓首页, 绕开 CF 对 / 入口的拦)', col_type: 'rich_text'});
                            d.push({
                                title: '🔄 刷新集数 (基于现有索引)',
                                url: $('#noLoading#').lazyRule(() => {
                                    var raw = readFile('hiker://files/cache/zyshow2_index.json') || '';
                                    var j = {};
                                    try { j = JSON.parse(raw); } catch (e) {}
                                    var shows = (j.shows || []).map(s => ({
                                        slug: s.slug, name: s.name, cat: s.cat, episodes: []
                                    }));
                                    putVar({key: 'zys2_idx_state', value: JSON.stringify({
                                        phase: 'batch',
                                        shows: shows,
                                        cursor: 0,
                                        fail: 0,
                                        failed: [],
                                        totalEps: 0,
                                        startedAt: new Date().getTime(),
                                        mode: 'refresh'
                                    })});
                                    refreshPage();
                                    return 'hiker://empty';
                                }),
                                col_type: 'text_center_1'
                            });
                            d.push({col_type: 'blank_block'});
                            d.push({title: '⚠ 完全重建会先抓首页解节目列表, CF 经常对 / 触发 challenge 而失败', col_type: 'rich_text'});
                            d.push({
                                title: '🔁 完全重建 (诊断 + 全抓)',
                                url: $('#noLoading#').lazyRule(() => {
                                    putVar({key: 'zys2_idx_state', value: JSON.stringify({phase: 'diag'})});
                                    refreshPage();
                                    return 'hiker://empty';
                                }),
                                col_type: 'text_center_1'
                            });
                        } else {
                            // 无索引 → 必须走 diag (拿 dropdown)
                            d.push({title: '&nbsp;&nbsp;首次构建 → 先诊断 (抓首页+1节目), 再分批每 ' + BATCH + ' 节目', col_type: 'rich_text'});
                            d.push({
                                title: '▶ 开始构建',
                                url: $('#noLoading#').lazyRule(() => {
                                    putVar({key: 'zys2_idx_state', value: JSON.stringify({phase: 'diag'})});
                                    refreshPage();
                                    return 'hiker://empty';
                                }),
                                col_type: 'text_center_1'
                            });
                        }
                        return;
                    }

                    // ========== 诊断 phase ==========
                    if (state.phase === 'diag') {
                        if (typeof setPreResult !== 'undefined') {
                            setPreResult([
                                {title: '🔍 诊断中... (抓首页 + 首个节目, ~5s)', col_type: 'rich_text'}
                            ]);
                        }
                        // Step 1: 抓首页
                        var t0 = new Date().getTime();
                        var homeHtml = '', homeErr = '';
                        try { homeHtml = fetch(SITE_HOST + '/', {headers: hd, timeout: FETCH_TIMEOUT}) || ''; }
                        catch (e) { homeErr = e.message || ('' + e); }
                        var t1 = new Date().getTime();
                        var homeLen = (homeHtml || '').length;
                        var homeCF = CF_RE.test(homeHtml);
                        var step1ok = !homeErr && homeLen > 1000 && !homeCF;
                        var escapeHtml = function (s) {
                            return ('' + (s || '')).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        };
                        var preview = function (s) {
                            return escapeHtml(('' + (s || '')).substring(0, 300).replace(/\s+/g, ' '));
                        };

                        d.push({title: (step1ok ? '✅' : '❌') + ' Step 1 抓首页', col_type: 'rich_text'});
                        d.push({title: '&nbsp;&nbsp;耗时: ' + (t1 - t0) + 'ms', col_type: 'rich_text'});
                        d.push({title: '&nbsp;&nbsp;HTML 长度: <b>' + homeLen + '</b>', col_type: 'rich_text'});
                        if (homeErr) d.push({title: '&nbsp;&nbsp;错误: <font color="#d00">' + escapeHtml(homeErr) + '</font>', col_type: 'rich_text'});
                        if (homeCF) d.push({title: '&nbsp;&nbsp;⚠ <font color="#d00">命中 CF 拦截标记</font>', col_type: 'rich_text'});
                        d.push({title: '&nbsp;&nbsp;预览(前 300 字): <font color="#666">' + (preview(homeHtml) || '<i>(空)</i>') + '</font>', col_type: 'rich_text'});
                        if (!step1ok) {
                            d.push({title: '❌ 诊断失败 — 首页拉不到', col_type: 'rich_text'});
                            d.push({title: '&nbsp;&nbsp;可能原因:', col_type: 'rich_text'});
                            d.push({title: '&nbsp;&nbsp;• cookie 已过期 → 回首页重过 CF', col_type: 'rich_text'});
                            d.push({title: '&nbsp;&nbsp;• OkHttp TLS 指纹被 CF 拦(不带 cookie 也会发生)', col_type: 'rich_text'});
                            d.push({title: '&nbsp;&nbsp;• 网络/超时 (' + FETCH_TIMEOUT + 'ms)', col_type: 'rich_text'});
                            resetBtn();
                            return;
                        }

                        // Step 2: 解 dropdown
                        var dropdowns = homeHtml.match(/<li class="dropdown">[\s\S]*?<\/ul><\/li>/g) || [];
                        var catNameToId = {};
                        CAT_TABS.forEach(t => { catNameToId[t.name] = t.id; });
                        var allShows = [];
                        var seenSlug = {};
                        dropdowns.forEach((seg) => {
                            var catM = seg.match(/<a[^>]*class="dropdown-toggle"[^>]*>\s*([^<\s][^<]*?)\s*<b/);
                            var catName = catM ? catM[1].trim() : '';
                            var catId = catNameToId[catName] || '';
                            if (!catId) return;
                            var liRe = /<li>\s*<a[^>]*href="\/([a-zA-Z0-9_]+)\/"[^>]*title="([^"]+)"/g;
                            var lm;
                            while ((lm = liRe.exec(seg)) !== null) {
                                if (seenSlug[lm[1]]) continue;
                                seenSlug[lm[1]] = 1;
                                allShows.push({slug: lm[1], name: lm[2], cat: catId, episodes: []});
                            }
                        });
                        var step2ok = allShows.length > 0;
                        d.push({title: (step2ok ? '✅' : '❌') + ' Step 2 解析节目列表', col_type: 'rich_text'});
                        d.push({title: '&nbsp;&nbsp;dropdown 块: ' + dropdowns.length, col_type: 'rich_text'});
                        d.push({title: '&nbsp;&nbsp;匹配 7 大分类的节目: <b>' + allShows.length + '</b>', col_type: 'rich_text'});
                        if (step2ok) d.push({title: '&nbsp;&nbsp;首个: ' + allShows[0].slug + ' (' + escapeHtml(allShows[0].name) + ')', col_type: 'rich_text'});
                        if (!step2ok) {
                            d.push({title: '❌ 诊断失败 — 节目列表解析为空,站结构可能变了', col_type: 'rich_text'});
                            resetBtn();
                            return;
                        }

                        // Step 3: 抓首个节目
                        var s0 = allShows[0];
                        var t2 = new Date().getTime();
                        var showHtml = '', showErr = '';
                        try { showHtml = fetch(SITE_HOST + '/' + s0.slug + '/', {headers: hd, timeout: FETCH_TIMEOUT}) || ''; }
                        catch (e) { showErr = e.message || ('' + e); }
                        var t3 = new Date().getTime();
                        var showLen = (showHtml || '').length;
                        var showCF = CF_RE.test(showHtml);
                        var trCount = (showHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || []).length;
                        var epLinks = showHtml.match(/\/v\/(\d{8})\.html/g) || [];
                        var step3ok = !showErr && !showCF && epLinks.length > 0;

                        d.push({title: (step3ok ? '✅' : '❌') + ' Step 3 抓节目 ' + s0.slug, col_type: 'rich_text'});
                        d.push({title: '&nbsp;&nbsp;耗时: ' + (t3 - t2) + 'ms', col_type: 'rich_text'});
                        d.push({title: '&nbsp;&nbsp;HTML 长度: <b>' + showLen + '</b>', col_type: 'rich_text'});
                        d.push({title: '&nbsp;&nbsp;&lt;tr&gt; 数: ' + trCount, col_type: 'rich_text'});
                        d.push({title: '&nbsp;&nbsp;集数链接(/v/xxxxxxxx.html): <b>' + epLinks.length + '</b>', col_type: 'rich_text'});
                        if (showErr) d.push({title: '&nbsp;&nbsp;错误: <font color="#d00">' + escapeHtml(showErr) + '</font>', col_type: 'rich_text'});
                        if (showCF) d.push({title: '&nbsp;&nbsp;⚠ <font color="#d00">命中 CF 拦截</font>', col_type: 'rich_text'});
                        if (showLen > 0 && showLen < 2000) {
                            d.push({title: '&nbsp;&nbsp;预览: <font color="#666">' + preview(showHtml) + '</font>', col_type: 'rich_text'});
                        }

                        if (!step3ok) {
                            d.push({title: '❌ 诊断失败 — 节目页拉不到', col_type: 'rich_text'});
                            d.push({
                                title: '&nbsp;&nbsp;' + (epLinks.length === 0 && showLen > 500
                                    ? '页面拿到了但解不出集数,可能正则要更新'
                                    : '与首页结果不一致,可能是节目页有额外校验'),
                                col_type: 'rich_text'
                            });
                            resetBtn();
                            return;
                        }

                        // 诊断 OK → 写 batch state
                        putVar({key: 'zys2_idx_state', value: JSON.stringify({
                            phase: 'batch',
                            shows: allShows,
                            cursor: 0,
                            fail: 0,
                            failed: [],
                            totalEps: 0,
                            startedAt: new Date().getTime()
                        })});
                        d.push({
                            title: '✅ 诊断通过',
                            desc: '共 ' + allShows.length + ' 个节目待抓,每批 ' + BATCH +
                                  ' 个,预计 ' + Math.ceil(allShows.length / BATCH) + ' 次点击',
                            col_type: 'rich_text'
                        });
                        d.push({
                            title: '▶ 开始批量抓取',
                            url: $('#noLoading#').lazyRule(() => {
                                refreshPage();
                                return 'hiker://empty';
                            }),
                            col_type: 'text_center_1'
                        });
                        resetBtn();
                        return;
                    }

                    // ========== 分批 phase ==========
                    if (state.phase === 'batch') {
                        if (typeof setPreResult !== 'undefined') {
                            setPreResult([
                                {title: '⏳ 抓取中... 本批 ' + state.cursor + '-' +
                                    Math.min(state.cursor + BATCH - 1, state.shows.length - 1) +
                                    ' / ' + state.shows.length, col_type: 'rich_text'}
                            ]);
                        }

                        var shows = state.shows;
                        var batchStart = state.cursor;
                        var batchEnd = Math.min(batchStart + BATCH, shows.length);
                        var batchLog = [];
                        var batchT0 = new Date().getTime();

                        for (var i = batchStart; i < batchEnd; i++) {
                            var s = shows[i];
                            var url = SITE_HOST + '/' + s.slug + '/';
                            var html = '', err = '';
                            var fT0 = new Date().getTime();
                            try { html = fetch(url, {headers: hd, timeout: FETCH_TIMEOUT}) || ''; }
                            catch (e) { err = e.message || ('' + e); }
                            var fT1 = new Date().getTime();
                            var len = (html || '').length;
                            var cfHit = CF_RE.test(html);

                            if (err || cfHit || len < 200) {
                                state.fail++;
                                state.failed.push(s.slug);
                                batchLog.push('❌ ' + s.slug + ' (' + (fT1 - fT0) + 'ms) ' +
                                    (err ? err : (cfHit ? 'CF blocked' : 'len=' + len)));
                                continue;
                            }

                            var blocks = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
                            var seen = {};
                            var epAdded = 0;
                            blocks.forEach((tr) => {
                                var dM = tr.match(/\/v\/(\d{8})\.html/);
                                if (!dM) return;
                                var date = dM[1];
                                if (seen[date]) return;
                                seen[date] = 1;
                                var tM = tr.match(/<a[^>]*\btitle="([^"]+)"/);
                                var t = tM ? tM[1] : date;
                                var tds = tr.match(/<td[^>]*>[\s\S]*?<\/td>/g) || [];
                                var strip = function (x) {
                                    return (x || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
                                };
                                var subj = tds.length >= 2 ? strip(tds[1]) : '';
                                var guests = tds.length >= 3 ? strip(tds[2]) : '';
                                s.episodes.push({date: date, title: t, subj: subj, guests: guests});
                                state.totalEps++;
                                epAdded++;
                            });
                            batchLog.push('✅ ' + s.slug + ' (' + (fT1 - fT0) + 'ms) ' + epAdded + '集');
                        }
                        var batchT1 = new Date().getTime();

                        state.cursor = batchEnd;
                        var done = state.cursor >= shows.length;

                        // 每批写一次 partial 索引,防意外丢
                        try {
                            writeFile(IDX_FILE, JSON.stringify({
                                version: 1,
                                builtAt: new Date().toISOString(),
                                partial: !done,
                                progress: state.cursor + '/' + shows.length,
                                shows: shows
                            }));
                        } catch (e) {}

                        if (done) {
                            putVar({key: 'zys2_idx_state', value: ''});
                        } else {
                            putVar({key: 'zys2_idx_state', value: JSON.stringify(state)});
                        }

                        var elapsedMs = batchT1 - state.startedAt;
                        var elapsedS = Math.round(elapsedMs / 1000);
                        var avgPerShow = state.cursor > 0 ? Math.round(elapsedMs / state.cursor) : 0;
                        var etaS = done ? 0 : Math.round((shows.length - state.cursor) * avgPerShow / 1000);

                        d.push({
                            title: done
                                ? '✅ 索引构建完成'
                                : '⏳ 进度 <b>' + state.cursor + ' / ' + shows.length + '</b> (' + Math.round(state.cursor * 100 / shows.length) + '%)',
                            col_type: 'rich_text'
                        });
                        d.push({title: '&nbsp;&nbsp;累计集数: <b>' + state.totalEps + '</b>', col_type: 'rich_text'});
                        d.push({
                            title: '&nbsp;&nbsp;失败节目: ' + state.fail +
                                (state.fail > 0 ? ' <font color="#d00">(' + state.failed.slice(-5).join(', ') + (state.failed.length > 5 ? '...' : '') + ')</font>' : ''),
                            col_type: 'rich_text'
                        });
                        d.push({
                            title: '&nbsp;&nbsp;已耗时: ' + elapsedS + 's' + (done ? '' : ' / 剩约 ' + etaS + 's') + ' / 本批 ' + (batchT1 - batchT0) + 'ms',
                            col_type: 'rich_text'
                        });
                        d.push({title: '─── 本批 (#' + batchStart + '-' + (batchEnd - 1) + ') ───', col_type: 'rich_text'});
                        if (batchLog.length === 0) {
                            d.push({title: '&nbsp;&nbsp;(本批无节目)', col_type: 'rich_text'});
                        } else {
                            batchLog.forEach((l) => {
                                d.push({title: '&nbsp;&nbsp;' + l, col_type: 'rich_text'});
                            });
                        }

                        if (!done) {
                            d.push({
                                title: '▶ 继续下一批 (剩 ' + (shows.length - state.cursor) + ' 节目)',
                                url: $('#noLoading#').lazyRule(() => {
                                    refreshPage();
                                    return 'hiker://empty';
                                }),
                                col_type: 'text_center_1'
                            });
                            d.push({
                                title: '⏸ 暂停 (返回, 进度保留可继续)',
                                url: $('#noLoading#').lazyRule(() => {
                                    back();
                                    return 'hiker://empty';
                                }),
                                col_type: 'text_center_1'
                            });
                        } else {
                            d.push({
                                title: '◀ 回到小程序首页',
                                url: $('#noLoading#').lazyRule(() => {
                                    back();
                                    refreshPage();
                                    return 'hiker://empty';
                                }),
                                col_type: 'text_center_1'
                            });
                        }
                        resetBtn();
                        return;
                    }
                })();
                setResult(d);
            }, CAT_TABS, FULL_HEADERS_JSON, SITE_HOST)
        };

        // 子页 3: 测真搜索 — fetch /search.asp 三种参数试通, 显 HTTP 长度/CF/预览
        var testSearchPage = {
            name: '测真搜索',
            path: 'testSearch',
            col_type: 'movie_3',
            rule: $.toString((FULL_HEADERS_JSON, SITE_HOST) => {
                var d = [];
                (function () {
                    var cookie = getItem('zys2_cookie', '');
                    if (!cookie) {
                        d.push({title: '⚠ 没有 cookie, 请先回首页过 CF', col_type: 'rich_text'});
                        setResult(d);
                        return;
                    }
                    var hd = JSON.parse(FULL_HEADERS_JSON);
                    hd['Cookie'] = cookie;
                    hd['Referer'] = SITE_HOST + '/';

                    var kw = getVar('zys2_kw_pending', '') || getVar('zys2_kw', '') || '蔡康永';
                    var CF_RE = /<title[^>]*>\s*Just a moment|Checking your browser before accessing|cf-browser-verification|id=["']cf-error-details["']|Attention Required.*Cloudflare/i;
                    var escapeHtml = function (s) {
                        return ('' + (s || '')).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    };
                    var preview = function (s, n) {
                        return escapeHtml(('' + (s || '')).substring(0, n || 500).replace(/\s+/g, ' '));
                    };

                    d.push({title: '🧪 测 zyshow.co 真搜索接口', col_type: 'rich_text'});
                    d.push({title: '&nbsp;&nbsp;关键字: <b>' + escapeHtml(kw) + '</b> (取自上方输入框或最近搜索)', col_type: 'rich_text'});
                    d.push({title: '&nbsp;&nbsp;Cookie 长度: ' + cookie.length, col_type: 'rich_text'});
                    d.push({col_type: 'blank_block'});

                    // 试 4 种 URL/方法
                    var candidates = [
                        {label: 'GET /search.asp?keyword=', url: SITE_HOST + '/search.asp?keyword=' + encodeURIComponent(kw)},
                        {label: 'GET /search.asp?key=',     url: SITE_HOST + '/search.asp?key='     + encodeURIComponent(kw)},
                        {label: 'GET /search.asp?wd=',      url: SITE_HOST + '/search.asp?wd='      + encodeURIComponent(kw)},
                        {label: 'GET /search.asp (无参)',   url: SITE_HOST + '/search.asp'}
                    ];

                    candidates.forEach((c) => {
                        var t0 = new Date().getTime();
                        var html = '', err = '';
                        try { html = fetch(c.url, {headers: hd, timeout: 10000}) || ''; }
                        catch (e) { err = e.message || ('' + e); }
                        var t1 = new Date().getTime();
                        var len = (html || '').length;
                        var cfHit = CF_RE.test(html);
                        var hasHits = /\/v\/\d{8}\.html|\/[a-zA-Z0-9_]+\/['"]?\s*[^>]*title=/i.test(html);
                        var status = err ? '❌ 错误' : (cfHit ? '⚠ CF 拦截' : (len < 500 ? '⚠ 内容太短' : (hasHits ? '✅ 看到结果链接' : '🟡 200 但无明显结果')));

                        d.push({title: status + ' ' + c.label, col_type: 'rich_text'});
                        d.push({title: '&nbsp;&nbsp;URL: ' + escapeHtml(c.url), col_type: 'rich_text'});
                        d.push({title: '&nbsp;&nbsp;耗时: ' + (t1 - t0) + 'ms / 长度: <b>' + len + '</b>', col_type: 'rich_text'});
                        if (err) d.push({title: '&nbsp;&nbsp;错误: <font color="#d00">' + escapeHtml(err) + '</font>', col_type: 'rich_text'});
                        if (cfHit) d.push({title: '&nbsp;&nbsp;<font color="#d00">命中 CF challenge 标记</font>', col_type: 'rich_text'});
                        d.push({title: '&nbsp;&nbsp;预览: <font color="#666">' + (preview(html, 500) || '<i>(空)</i>') + '</font>', col_type: 'rich_text'});
                        d.push({col_type: 'blank_block'});
                    });

                    d.push({
                        title: '◀ 返回小程序首页',
                        url: $('#noLoading#').lazyRule(() => {
                            back();
                            return 'hiker://empty';
                        }),
                        col_type: 'text_center_1'
                    });
                })();
                setResult(d);
            }, FULL_HEADERS_JSON, SITE_HOST)
        };

        // 子页 4: WebView 实时搜索 — 真接口 /search.asp 在 OkHttp 上拦死,
        // 但 x5 WebView 用真浏览器栈, TLS/H2/Client Hints 指纹和 cookie 颁发时一致,
        // 可以过 CF. JS 轮询 DOM 抽 /v/xxxxxxxx.html 集数链接 + tr 行文本,
        // putVar 回主页面 + 自身 refreshPage 切到结果展示态.
        var wvSearchPage = {
            name: '实时搜索',
            path: 'wvSearch',
            col_type: 'movie_3',
            rule: $.toString((LAZY_CODE, SITE_HOST) => {
                var d = [];
                (function () {
                    var kw = '';
                    try {
                        var m = MY_URL.match(/[?&]kw=([^&]*)/);
                        if (m) kw = decodeURIComponent(m[1]);
                    } catch (e) {}
                    if (!kw) kw = getVar('zys2_kw', '');
                    if (!kw) {
                        d.push({title: '⚠ 未提供关键字', col_type: 'rich_text'});
                        d.push({
                            title: '◀ 返回',
                            url: $('#noLoading#').lazyRule(() => { back(); return 'hiker://empty'; }),
                            col_type: 'text_center_1'
                        });
                        return;
                    }

                    var escapeHtml = function (s) {
                        return ('' + (s || '')).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    };

                    var resJson = getVar('zys2_wv_results', '');
                    var resKw = getVar('zys2_wv_results_kw', '');
                    var hasResults = resJson && resKw === kw;

                    d.push({title: '🌐 实时搜索: <b>' + escapeHtml(kw) + '</b>', col_type: 'rich_text'});

                    // ========== 结果态 ==========
                    if (hasResults) {
                        var results = [];
                        try { results = JSON.parse(resJson) || []; } catch (e) {}
                        var dump = getVar('zys2_wv_dump', '');

                        d.push({
                            title: '&nbsp;&nbsp;✅ 命中 <b>' + results.length + '</b> 条 (来自真接口 /search.asp,经 x5 WebView)',
                            col_type: 'rich_text'
                        });
                        d.push({col_type: 'blank_block'});

                        results.forEach((r) => {
                            var href = r.href || '';
                            var isInfo = !href || href === '#';
                            if (isInfo) {
                                d.push({title: r.title || '(信息)', desc: r.desc || '', col_type: 'rich_text'});
                                return;
                            }
                            var url = href;
                            if (!/^https?:/.test(url)) url = SITE_HOST + (url.indexOf('/') === 0 ? url : '/' + url);
                            var isEp = /\/v\/\d{8}\.html/.test(url);
                            d.push({
                                title: r.title || url,
                                desc: r.desc || '',
                                url: isEp ? (url + '@lazyRule=.js:' + LAZY_CODE) : url,
                                col_type: 'text_1'
                            });
                        });

                        if (dump && results.length <= 1) {
                            d.push({col_type: 'blank_block'});
                            d.push({title: '🐛 DOM 内容预览 (用于排查没抽到结果的原因):', col_type: 'rich_text'});
                            d.push({
                                title: '<font color="#666">' + escapeHtml(dump.substring(0, 1500)) + '</font>',
                                col_type: 'rich_text'
                            });
                        }

                        d.push({col_type: 'blank_block'});
                        d.push({
                            title: '🔁 重搜 (重新加载 WebView)',
                            url: $('#noLoading#').lazyRule(() => {
                                putVar({key: 'zys2_wv_results', value: ''});
                                putVar({key: 'zys2_wv_results_kw', value: ''});
                                putVar({key: 'zys2_wv_dump', value: ''});
                                refreshPage();
                                return 'hiker://empty';
                            }),
                            col_type: 'text_center_1'
                        });
                        d.push({
                            title: '◀ 返回小程序首页',
                            url: $('#noLoading#').lazyRule(() => { back(); return 'hiker://empty'; }),
                            col_type: 'text_center_1'
                        });
                        return;
                    }

                    // ========== 加载态 ==========
                    d.push({
                        title: '&nbsp;&nbsp;⏳ WebView 加载 /search.asp 中,自动提取结果...',
                        col_type: 'rich_text'
                    });
                    d.push({
                        title: '&nbsp;&nbsp;<font color="#666">原理: OkHttp 调 /search.asp 必被 CF 拦, 但 x5 WebView 走真浏览器栈, TLS/HTTP2 指纹与 cookie 颁发时一致, 可放行.</font>',
                        col_type: 'rich_text'
                    });

                    d.push({
                        col_type: 'x5_webview_single',
                        url: SITE_HOST + '/search.asp?keyword=' + encodeURIComponent(kw),
                        desc: 'float&&80%',
                        title: '',
                        extra: {
                            canBack: true,
                            js: $.toString(() => {
                                var tries = 0;
                                var maxTries = 60;
                                function extract() {
                                    tries++;
                                    try {
                                        var bodyLen = ((document.body && document.body.innerHTML) || '').length;
                                        var titleStr = document.title || '';
                                        if (/Just a moment/i.test(titleStr) || bodyLen < 3000) {
                                            if (tries < maxTries) { setTimeout(extract, 800); return; }
                                            fba.toast('45s 内未通过 CF / 未加载完成');
                                            return;
                                        }

                                        var kw = '';
                                        try {
                                            var mm = location.search.match(/[?&]keyword=([^&]*)/);
                                            if (mm) kw = decodeURIComponent(mm[1].replace(/\+/g, ' '));
                                        } catch (e) {}

                                        var results = [];
                                        var seen = {};

                                        var anchors = document.querySelectorAll('a[href]');
                                        for (var i = 0; i < anchors.length; i++) {
                                            var a = anchors[i];
                                            var href = a.getAttribute('href') || '';
                                            if (!/\/v\/\d{8}\.html/.test(href)) continue;
                                            if (seen[href]) continue;
                                            seen[href] = 1;
                                            var title = (a.getAttribute('title') || a.textContent || '').replace(/\s+/g, ' ').trim();
                                            var tr = null;
                                            try { tr = a.closest ? a.closest('tr') : null; } catch (e) {}
                                            if (!tr) {
                                                var p = a.parentNode;
                                                for (var k = 0; k < 5 && p; k++) {
                                                    if (p.tagName && p.tagName.toLowerCase() === 'tr') { tr = p; break; }
                                                    p = p.parentNode;
                                                }
                                            }
                                            var desc = '';
                                            if (tr) {
                                                var tds = tr.querySelectorAll('td');
                                                var parts = [];
                                                for (var j = 0; j < tds.length; j++) {
                                                    var s = (tds[j].textContent || '').replace(/\s+/g, ' ').trim();
                                                    if (s && s !== title) parts.push(s);
                                                }
                                                desc = parts.slice(0, 3).join(' / ').substring(0, 120);
                                            }
                                            results.push({href: href, title: title || href, desc: desc});
                                        }

                                        for (var n = 0; n < anchors.length; n++) {
                                            var sa = anchors[n];
                                            var sh = sa.getAttribute('href') || '';
                                            var sm = sh.match(/^\/([a-zA-Z0-9_]+)\/?$/);
                                            if (!sm) continue;
                                            var slug = sm[1];
                                            if (/^(search|index|admin|api|v|img|css|js|static|home|about|contact)$/i.test(slug)) continue;
                                            var skey = 'show:' + slug;
                                            if (seen[skey]) continue;
                                            var st = (sa.getAttribute('title') || sa.textContent || '').replace(/\s+/g, ' ').trim();
                                            if (!st || st.length > 30) continue;
                                            seen[skey] = 1;
                                            results.push({href: '/' + slug + '/', title: '[节目] ' + st, desc: 'slug=' + slug});
                                        }

                                        if (results.length === 0) {
                                            if (tries < maxTries) { setTimeout(extract, 1000); return; }
                                            var dump = ((document.body.innerText || document.body.textContent) || '').replace(/\s+/g, ' ').substring(0, 2000);
                                            fba.putVar('zys2_wv_dump', dump);
                                            // 失败 → 写空数组, 留在子页让用户看 dump 排查
                                            fba.putVar('zys2_wv_results', '[]');
                                            fba.putVar('zys2_wv_results_kw', kw);
                                            fba.toast('⚠ 未抽到结果, 见 DOM 预览');
                                            fba.parseLazyRule($$$().lazyRule(() => { refreshPage(); }));
                                            return;
                                        }

                                        fba.putVar('zys2_wv_results', JSON.stringify(results));
                                        fba.putVar('zys2_wv_results_kw', kw);
                                        fba.toast('✅ 抓到 ' + results.length + ' 条, 返回主页');
                                        // 成功 → back 到 find_rule + refresh, 主页直接渲染卡片
                                        fba.parseLazyRule($$$().lazyRule(() => { back(); refreshPage(); }));
                                    } catch (e) {
                                        try { fba.log('wv search err: ' + e.message); } catch (ee) {}
                                        if (tries < maxTries) setTimeout(extract, 1000);
                                    }
                                }
                                setTimeout(extract, 1800);
                            })
                        }
                    });

                    d.push({
                        title: '◀ 取消, 返回',
                        url: $('#noLoading#').lazyRule(() => { back(); return 'hiker://empty'; }),
                        col_type: 'text_center_1'
                    });
                })();
                setResult(d);
            }, LAZY_CODE, SITE_HOST)
        };

        return [getCookiePage, indexerPage, testSearchPage, wvSearchPage];
    })()
};

$.exports = rule;
