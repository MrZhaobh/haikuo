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
    find_rule: $.toString((LAZY_CODE, CAT_TABS, FULL_HEADERS_JSON, SITE_HOST) => {
        var d = [];
        (function () {
            var cookie = getItem('zys2_cookie', '');
            var indexExists = false;
            try { indexExists = !!(readFile('hiker://files/cache/zyshow2_index.json') || '').length; } catch (e) {}
            var kw = getVar('zys2_kw', '');

            // -------- 顶部全局搜索框 (本地索引搜索,onChange 触发刷新) --------
            d.push({
                title: '',
                desc: indexExists
                    ? '搜索节目名 / 主题 / 嘉宾 (清空恢复 tab)'
                    : '搜索 (需先构建索引)',
                col_type: 'input',
                extra: {
                    titleVisible: false,
                    onChange: 'if(input!==getVar("zys2_kw","")){putVar({key:"zys2_kw",value:input});refreshPage(false)}'
                }
            });

            // -------- 状态横条:Cookie / Index 健康 --------
            var cookieIcon = cookie ? '🟢' : '🔴';
            var indexIcon = indexExists ? '🟢' : '🔴';
            d.push({
                title: cookieIcon + ' Cookie',
                url: $('#noLoading#').lazyRule(() => {
                    return 'hiker://page/getCookie?rule=' + MY_RULE.title;
                }),
                col_type: 'scroll_button'
            });
            d.push({
                title: indexIcon + ' 索引',
                url: $('#noLoading#').lazyRule(() => {
                    return 'hiker://page/indexer?rule=' + MY_RULE.title;
                }),
                col_type: 'scroll_button'
            });
            d.push({
                title: '🔄 刷新',
                url: $('#noLoading#').lazyRule(() => {
                    putVar({key: 'zys2_kw', value: ''});
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

        if (!fatalErr && /Just a moment|cf-challenge/i.test(html)) {
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
    pages: [
        // ----- 子页 1: WebView 抓 cookie -----
        {
            name: '获取Cookie',
            path: 'getCookie',
            col_type: 'movie_3',
            rule: $.toString((SITE_HOST) => {
                var d = [];
                d.push({
                    title: '操作说明',
                    desc: '页面会自动加载,看到"Just a moment..."请稍候,几秒后真实页面出现就会自动回到小程序',
                    col_type: 'rich_text'
                });
                d.push({
                    col_type: 'x5_webview_single',
                    url: SITE_HOST + '/',
                    desc: 'float&&90%',
                    title: '',
                    extra: {
                        canBack: true,
                        ua: 'Mozilla/5.0 (Linux; Android 12; SM-A536U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
                        js: $.toString(() => {
                            // 注入 WebView 内 JS: 等真实页面出现(.dropdown-menu),抓 cookie 回填,自动返回
                            var tries = 0;
                            function check() {
                                tries++;
                                try {
                                    // .dropdown-menu / .dropdown 是 zyshow.co 真实首页菜单标志
                                    var ok = document.querySelector('.dropdown-menu') ||
                                             document.querySelector('li.dropdown');
                                    if (ok) {
                                        var c = fba.getCookie(location.href);
                                        if (c && c.length > 20) {
                                            fba.putVar('zys2_ck_from_wv', c);
                                            fba.toast('已抓取 cookie,返回小程序');
                                            fba.parseLazyRule($$$().lazyRule(() => { back(); }));
                                            return;
                                        }
                                    }
                                } catch (e) { fba.log('check err: ' + e.message); }
                                if (tries < 240) setTimeout(check, 500);   // 2 分钟内不断尝试
                                else fba.toast('60s 内未通过 CF,可能需要手动点击页面');
                            }
                            setTimeout(check, 1500);  // 先等 CF 自动 challenge 跑一会
                        })
                    }
                });
                setResult(d);
            }, SITE_HOST)
        },

        // ----- 子页 2: 索引构建器 -----
        {
            name: '构建索引',
            path: 'indexer',
            col_type: 'movie_3',
            rule: $.toString((CAT_TABS, FULL_HEADERS_JSON, SITE_HOST) => {
                var d = [];
                (function () {
                var cookie = getItem('zys2_cookie', '');
                if (!cookie) {
                    d.push({title: '⚠ 没有 cookie,请先回首页点 "🔴 Cookie" 过 CF', col_type: 'rich_text'});
                    return;
                }

                var hd = JSON.parse(FULL_HEADERS_JSON);
                hd['Cookie'] = cookie;

                if (typeof setPreResult !== 'undefined') {
                    setPreResult([
                        {title: '索引构建中...', col_type: 'rich_text'},
                        {col_type: 'pic_1_center', extra: {cls: 'loading_gif'},
                         pic_url: 'https://hikerfans.com/weisyr/img/Loading1.gif'}
                    ]);
                }

                // -------- Step 1: 抓首页, 解 dropdown 出全部节目 --------
                var homeHtml = '';
                try { homeHtml = fetch(SITE_HOST + '/', {headers: hd}) || ''; } catch (e) {}
                if (!homeHtml || /Just a moment|cf-challenge/i.test(homeHtml)) {
                    d.push({title: '首页加载失败或被 CF 拦截 — cookie 可能已失效,请重新过 CF', col_type: 'rich_text'});
                    return;
                }

                var dropdowns = homeHtml.match(/<li class="dropdown">[\s\S]*?<\/ul><\/li>/g) || [];
                var catNameToId = {};
                CAT_TABS.forEach(t => { catNameToId[t.name] = t.id; });

                var allShows = [];
                var seenSlug = {};
                dropdowns.forEach((seg) => {
                    var catM = seg.match(/<a[^>]*class="dropdown-toggle"[^>]*>\s*([^<\s][^<]*?)\s*<b/);
                    var catName = catM ? catM[1].trim() : '';
                    var catId = catNameToId[catName] || '';
                    if (!catId) return;   // 不在我们 7 大分类的略过
                    var liRe = /<li>\s*<a[^>]*href="\/([a-zA-Z0-9_]+)\/"[^>]*title="([^"]+)"/g;
                    var lm;
                    while ((lm = liRe.exec(seg)) !== null) {
                        if (seenSlug[lm[1]]) continue;
                        seenSlug[lm[1]] = 1;
                        allShows.push({slug: lm[1], name: lm[2], cat: catId, episodes: []});
                    }
                });

                if (allShows.length === 0) {
                    d.push({title: '首页未解出任何节目 (dropdown 结构变了?)', col_type: 'rich_text'});
                    return;
                }

                // -------- Step 2: 逐节目 fetch 集数 --------
                // 海阔规则同步执行,无法显进度条,直接跑完再 setResult
                // 105 节目 × ~1.5s = 2-3 分钟
                var failCount = 0;
                var totalEps = 0;
                for (var i = 0; i < allShows.length; i++) {
                    var s = allShows[i];
                    var url = SITE_HOST + '/' + s.slug + '/';
                    var html = '';
                    try { html = fetch(url, {headers: hd}) || ''; } catch (e) { failCount++; continue; }
                    if (/Just a moment|cf-challenge/i.test(html) || html.length < 200) {
                        failCount++;
                        if (failCount > 10) {
                            // 连续失败,基本 cookie 失效,停止
                            d.push({title: 'Cookie 中途失效 (失败 ' + failCount + '/' + (i+1) + ' 节目),已停止', col_type: 'rich_text'});
                            return;
                        }
                        continue;
                    }
                    failCount = 0;

                    var blocks = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
                    var seen = {};
                    blocks.forEach((tr) => {
                        var dM = tr.match(/\/v\/(\d{8})\.html/);
                        if (!dM) return;
                        var date = dM[1];
                        if (seen[date]) return;
                        seen[date] = 1;
                        var tM = tr.match(/<a[^>]*\btitle="([^"]+)"/);
                        var t = tM ? tM[1] : date;
                        var tds = tr.match(/<td[^>]*>[\s\S]*?<\/td>/g) || [];
                        var strip = function (x) { return (x || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); };
                        var subj = tds.length >= 2 ? strip(tds[1]) : '';
                        var guests = tds.length >= 3 ? strip(tds[2]) : '';
                        s.episodes.push({date: date, title: t, subj: subj, guests: guests});
                        totalEps++;
                    });
                }

                // -------- Step 3: 写入索引文件 --------
                var idx = {
                    version: 1,
                    builtAt: new Date().toISOString(),
                    shows: allShows
                };
                writeFile('hiker://files/cache/zyshow2_index.json', JSON.stringify(idx));

                d.push({
                    title: '✅ 索引构建完成',
                    desc: allShows.length + ' 个节目 / ' + totalEps + ' 集',
                    col_type: 'rich_text'
                });
                d.push({
                    title: '回到小程序首页',
                    url: $('#noLoading#').lazyRule(() => {
                        back();
                        refreshPage();
                        return 'hiker://empty';
                    }),
                    col_type: 'text_center_1'
                });
                })();
                setResult(d);
            }, CAT_TABS, FULL_HEADERS_JSON, SITE_HOST)
        }
    ]
};

$.exports = rule;
