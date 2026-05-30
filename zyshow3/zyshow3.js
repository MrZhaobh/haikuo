/**
 * 海阔视界 小程序 — zyshow3 (台湾综艺, 麦田式搜索)
 *
 * 与 zyshow2 关系: 完整复刻 zyshow2 的分类浏览 / Cookie / LAZY_CODE / 解集数逻辑,
 * 仅把"搜索"重构成麦田影院 (mtyy) 模式:
 *   1. 主页 input + 搜索按钮 → 走海阔标准搜索路径 hiker://search?rule=zyshow3&s=<kw>
 *   2. 搜索结果页 (search_find_rule) 直接 OkHttp fetch /search.asp
 *      - 命中 CF/Just a moment/人机验证 → 显示"点击人机验证"卡片, 跳 x5_webview 让用户过验证
 *      - 正常返回 → pdfa/正则解析渲染搜索结果
 *
 * 数据流:
 *   首次 → 没 cookie 引导过 CF → 没分类引导抓分类 → 都齐显 tab + 节目
 *   搜索 → 输入 kw 点 🔍 → 海阔搜索页 → 直 fetch / 或过验证再 fetch → 渲染结果
 *   播放 → 节目页 → 集数 url + lazyRule
 */

// ========== 站点常量 ==========
var SITE_HOST = 'https://www.zyshow.co';
var CATS_FILE = 'hiker://files/cache/zyshow3_cats.json';
var COOKIE_KEY = 'zys3_cookie';
var COOKIE_VAR = 'zys3_ck_from_wv';

// 7 大分类
var CAT_TABS = [
    {id: 'th', name: '谈话综艺'},
    {id: 'zm', name: '周末综艺'},
    {id: 'jx', name: '行脚旅游'},
    {id: 'ss', name: '时尚女人'},
    {id: 'ms', name: '美食料理'},
    {id: 'yx', name: '综合节目'},
    {id: 'yl', name: '音乐选秀'}
];

// 完整浏览器 header (OkHttp fetch 模拟 Chrome 头)
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

// m3u8 嗅探 lazy — 双线路 + GET 探活 (HEAD 在小厂 CDN 返 502 不可靠)
var LAZY_CODE =
    "var __r = ''; " +
    "var ck = getItem('" + COOKIE_KEY + "', ''); " +
    "var hd = " + FULL_HEADERS_JSON + "; " +
    "if (ck) hd['Cookie'] = ck; " +
    "var html = ''; try { html = fetch(input, {headers: hd}); } catch(e) { __r = 'hiker://empty##单集页加载失败 ' + e.message; } " +
    "if (!__r) { " +
    "  var h1m = html.match(/url\\|([A-Za-z0-9+\\/=]{40,})\\|/); " +
    "  var h2m = html.match(/href=\"[^\"]*url=([A-Za-z0-9+\\/=]{40,})\"/); " +
    "  var hashes = []; " +
    "  if (h1m) hashes.push(h1m[1]); " +
    "  if (h2m && (!h1m || h2m[1] !== h1m[1])) hashes.push(h2m[1]); " +
    "  if (hashes.length === 0) __r = 'hiker://empty##单集页未抓到 base64 hash (可能 cookie 失效)'; " +
    "  else { " +
    "    var resolve = function (h) { " +
    "      try { var ck2 = fetch('" + SITE_HOST + "/url=' + h, {headers: hd}); " +
    "        var m2 = (ck2 || '').match(/urls\\s*=\\s*[\\'\"]([^\\'\"]+)[\\'\"]/); " +
    "        return m2 ? m2[1] : ''; } catch (e) { return ''; } " +
    "    }; " +
    "    var isAlive = function (u) { " +
    "      try { var p = fetch(u, {headers: hd, timeout: 5000}); " +
    "        return p && /^[\\s\\ufeff]*#EXT/.test(p); } catch (e) { return false; } " +
    "    }; " +
    "    var urls = []; " +
    "    for (var i = 0; i < hashes.length; i++) { var u = resolve(hashes[i]); if (u) urls.push(u); } " +
    "    if (urls.length === 0) __r = 'hiker://empty##线路 hash 都跳转失败'; " +
    "    else { " +
    "      var pick = ''; " +
    "      for (var j = 0; j < urls.length; j++) { if (isAlive(urls[j])) { pick = urls[j]; break; } } " +
    "      if (!pick) pick = urls[0]; " +
    "      __r = pick + ';{Referer@https://sc.zyshow.net/}'; " +
    "    } " +
    "  } " +
    "} " +
    "__r";


var rule = {
    title: 'zyshow3',
    author: 'claude',
    desc: '台湾综艺 (zyshow.co) — 麦田式搜索 + 分类浏览',
    host: SITE_HOST,
    url: 'hiker://empty',
    col_type: 'movie_3',
    class_name: '',
    class_url: '',
    // searchUrl 故意指 hiker://empty: 海阔标准搜索路径会自动 fetch search_url,
    // 但 zyshow.co 的 /search.asp 即使带 cf_clearance OkHttp 也拦死(返 5.9KB Just a moment),
    // 所以不能让海阔走 OkHttp; search_find_rule 内部用 x5 WebView 抽 DOM 替代。
    // 关键字通过 MY_URL.split('key=') 提取。
    searchUrl: 'hiker://empty?key=**',
    timeout: 20000,
    detail_col_type: 'movie_1',
    sdetail_col_type: 'movie_1',
    sdetail_find_rule: '*',

    // ============ preRule: 回填 WebView cookie ============
    preRule: $.toString(() => {
        var c = getVar('zys3_ck_from_wv', '');
        if (c) {
            setItem('zys3_cookie', c);
            putVar({key: 'zys3_ck_from_wv', value: ''});
        }
    }),

    // ============ find_rule: 主页面 ============
    find_rule: $.toString((LAZY_CODE, CAT_TABS, SITE_HOST) => {
        var d = [];
        (function () {
            var cookie = getItem('zys3_cookie', '');
            var cats = null;
            try { cats = JSON.parse(readFile('hiker://files/cache/zyshow3_cats.json') || 'null'); } catch (e) {}
            var hasCats = !!(cats && cats.shows && cats.shows.length > 0);

            // -------- 顶部搜索框 (麦田式: 直走海阔标准搜索) --------
            d.push({
                title: '',
                desc: '输入关键字 → 点 "🔍 搜索" 进搜索页',
                col_type: 'input',
                extra: {
                    titleVisible: false,
                    onChange: 'putVar({key:"zys3_kw_pending",value:input})',
                    titleVisible: false
                }
            });
            d.push({
                title: '🔍 搜索',
                url: $('#noLoading#').lazyRule(() => {
                    var p = getVar('zys3_kw_pending', '');
                    if (!p) return 'toast://请先输入关键字';
                    return 'hiker://search?rule=' + MY_RULE.title + '&s=' + encodeURIComponent(p);
                }),
                col_type: 'scroll_button'
            });

            // Cookie 状态 / 分类刷新
            d.push({
                title: (cookie ? '🟢' : '🔴') + ' Cookie',
                url: $('#noLoading#').lazyRule(() => {
                    return 'hiker://page/getCookie?rule=' + MY_RULE.title;
                }),
                col_type: 'scroll_button'
            });
            d.push({
                title: (hasCats ? '🔄' : '🔴') + ' 分类' + (hasCats ? '' : ' (未抓)'),
                url: $('#noLoading#').lazyRule(() => {
                    return 'hiker://page/catRefresh?rule=' + MY_RULE.title;
                }),
                col_type: 'scroll_button'
            });
            d.push({col_type: 'blank_block'});

            // -------- Cookie 缺失提示 --------
            if (!cookie) {
                d.push({
                    title: '⚠ 未拿到 Cloudflare cookie',
                    desc: '点击上方 "🔴 Cookie" 进入 WebView 过 CF',
                    col_type: 'rich_text'
                });
                return;
            }

            // -------- 分类缺失提示 --------
            if (!hasCats) {
                d.push({
                    title: '⚠ 未抓分类列表',
                    desc: '点击上方 "🔴 分类" 抓首页 (一次性, ~3s)',
                    col_type: 'rich_text'
                });
                return;
            }

            // -------- 分类 tab --------
            var curCat = getVar('zys3_cat', CAT_TABS[0].id);
            CAT_TABS.forEach((tab) => {
                var sel = curCat === tab.id;
                d.push({
                    title: sel ? '‘‘’’' + tab.name.fontcolor('#19B89D').bold() : tab.name,
                    url: sel ? 'hiker://empty' : $('#noLoading#').lazyRule((cid) => {
                        putVar({key: 'zys3_cat', value: cid});
                        refreshPage(false);
                        return 'hiker://empty';
                    }, tab.id),
                    col_type: 'scroll_button'
                });
            });
            d.push({col_type: 'blank_block'});

            // -------- 当前 tab 的节目卡片 --------
            var shows = (cats.shows || []).filter(s => s.cat === curCat);
            if (shows.length === 0) {
                d.push({title: '本分类无节目, 试试刷新分类', col_type: 'rich_text'});
            } else {
                d.push({title: shows.length + ' 个节目', col_type: 'rich_text'});
                shows.forEach((s) => {
                    d.push({
                        title: s.name,
                        desc: '',
                        pic_url: SITE_HOST + '/img/' + s.slug + '.jpg@Referer=' + SITE_HOST + '/',
                        url: SITE_HOST + '/' + s.slug + '/',
                        col_type: 'movie_3'
                    });
                });
            }
        })();
        setResult(d);
    }, LAZY_CODE, CAT_TABS, SITE_HOST),

    // ============ detail_find_rule: 节目集数页 ============
    detail_find_rule: $.toString((LAZY_CODE, FULL_HEADERS_JSON) => {
        var d = [];
        (function () {
            var cookie = getItem('zys3_cookie', '');
            var hd = JSON.parse(FULL_HEADERS_JSON);
            if (cookie) hd['Cookie'] = cookie;

            var html = '';
            var fatalErr = '';
            try { html = fetch(MY_URL, {headers: hd}) || ''; }
            catch (e) { fatalErr = '加载失败: ' + e.message; }

            if (!fatalErr && /<title[^>]*>\s*Just a moment|Checking your browser before accessing|cf-browser-verification|id=["']cf-error-details["']/i.test(html)) {
                fatalErr = 'Cookie 已失效, 请回首页重过 CF';
            }
            if (!fatalErr && (!html || html.length < 200)) {
                fatalErr = '页面为空: ' + MY_URL;
            }

            if (fatalErr) {
                d.push({title: fatalErr, col_type: 'rich_text'});
                return;
            }

            // 海报 + 标题
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

    // ============ search_find_rule: WebView 抽 DOM 模式 ============
    // 历史教训(memory: zyshow.co CF 按路径细粒度): /search.asp 用 OkHttp 即使带 cf_clearance
    // 也拦死 → 不能再 fetch /search.asp。改用 x5 WebView 跑真浏览器栈, JS 抽 DOM 后 putVar,
    // refreshPage 让 search_find_rule 再跑一次时从缓存渲染卡片。
    //
    // 流程: hiker://search?rule=zyshow3&s=<kw> 进入 → MY_URL.split('key=') 取 kw →
    //   缓存命中 → 渲染结果列表
    //   缓存未命中 → push 一个 x5_webview_single, JS 在 webview 内
    //     ① wait 真页面 (title 非 challenge && body > 3000)
    //     ② 抽 a[href*="/v/"] 集数命中 + a[href^="/.../"] 节目命中
    //     ③ fba.putVar('zys3_wv_results', JSON) + fba.putVar('zys3_wv_results_kw', kw)
    //     ④ fba.parseLazyRule(refreshPage) — search_find_rule 再跑, 命中缓存渲染
    search_find_rule: $.toString((LAZY_CODE, SITE_HOST) => {
        var d = [];
        (function () {
            var escapeHtml = function (s) {
                return ('' + (s || '')).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            };

            var kw = '';
            try { kw = decodeURIComponent((MY_URL.split('key=')[1] || '').split('&')[0]); } catch (e) {}
            if (!kw) {
                d.push({title: '请输入关键字', col_type: 'rich_text'});
                return;
            }

            var resJson = getVar('zys3_wv_results', '');
            var resKw = getVar('zys3_wv_results_kw', '');
            var hasResults = resJson && resKw === kw;

            d.push({title: '🔍 搜索: <b>' + escapeHtml(kw) + '</b>', col_type: 'rich_text'});

            if (hasResults) {
                var results = [];
                try { results = JSON.parse(resJson) || []; } catch (e) {}
                var dump = getVar('zys3_wv_dump', '');

                if (results.length === 0) {
                    d.push({title: '&nbsp;&nbsp;⚠ 未抽到结果', col_type: 'rich_text'});
                    if (dump) {
                        d.push({col_type: 'blank_block'});
                        d.push({title: 'DOM 预览', col_type: 'rich_text'});
                        d.push({
                            title: '<font color="#666">' + escapeHtml(dump.substring(0, 1500)) + '</font>',
                            col_type: 'rich_text'
                        });
                    }
                } else {
                    d.push({title: '&nbsp;&nbsp;✅ ' + results.length + ' 条结果', col_type: 'rich_text'});
                    results.forEach((r) => {
                        var abs = /^https?:/.test(r.href) ? r.href : (SITE_HOST + r.href);
                        var url = /\/v\/\d{8}\.html/.test(r.href)
                            ? abs + '@lazyRule=.js:' + LAZY_CODE
                            : abs;
                        d.push({
                            title: r.title,
                            desc: r.desc || '',
                            url: url,
                            col_type: 'text_1'
                        });
                    });
                }

                d.push({col_type: 'blank_block'});
                d.push({
                    title: '🔁 重搜 (清缓存)',
                    url: $('#noLoading#').lazyRule(() => {
                        putVar({key: 'zys3_wv_results', value: ''});
                        putVar({key: 'zys3_wv_results_kw', value: ''});
                        putVar({key: 'zys3_wv_dump', value: ''});
                        refreshPage();
                        return 'hiker://empty';
                    }),
                    col_type: 'text_center_1'
                });
                return;
            }

            // 未命中缓存 — 放 WebView 抽 DOM, 抽完 refreshPage 自己跑一次
            d.push({
                title: '&nbsp;&nbsp;⏳ WebView 加载 /search.asp, 抽完自动刷新...',
                desc: '若出现 Cloudflare Turnstile, 请点击"我是真人"',
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
                                if (/Just a moment|Attention Required/i.test(titleStr) || bodyLen < 3000) {
                                    if (tries < maxTries) { setTimeout(extract, 800); return; }
                                    fba.toast('45s 内未通过 CF / 未加载完成');
                                    return;
                                }

                                // 同步保存 webview 的 cookie 顺便给 detail/lazy 用
                                try {
                                    var ck = fba.getCookie(location.href) || document.cookie || '';
                                    if (ck && ck.indexOf('cf_clearance') >= 0) {
                                        fba.putVar('zys3_ck_from_wv', ck);
                                    }
                                } catch (e) {}

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
                                    fba.putVar('zys3_wv_dump', dump);
                                    fba.putVar('zys3_wv_results', '[]');
                                    fba.putVar('zys3_wv_results_kw', kw);
                                    fba.toast('⚠ 未抽到结果, 见 DOM 预览');
                                    fba.parseLazyRule($$$().lazyRule(() => { refreshPage(); }));
                                    return;
                                }

                                fba.putVar('zys3_wv_results', JSON.stringify(results));
                                fba.putVar('zys3_wv_results_kw', kw);
                                fba.toast('✅ 抓到 ' + results.length + ' 条, 刷新页面');
                                fba.parseLazyRule($$$().lazyRule(() => { refreshPage(); }));
                            } catch (e) {
                                try { fba.log('zys3 wv search err: ' + e.message); } catch (ee) {}
                                if (tries < maxTries) setTimeout(extract, 1000);
                            }
                        }
                        setTimeout(extract, 1800);
                    })
                }
            });
        })();
        setResult(d);
    }, LAZY_CODE, SITE_HOST),

    // ============ pages: 子页面 ============
    pages: (function () {
        // ----- 子页 1: 过 CF 拿 cookie -----
        var getCookiePage = {
            name: '获取Cookie',
            path: 'getCookie',
            col_type: 'movie_3',
            rule: $.toString((SITE_HOST) => {
                var d = [];
                d.push({
                    title: '🔑 过 Cloudflare 验证',
                    desc: 'WebView 加载 /search.asp 触发 CF Turnstile, 出现"我是真人"请点击。通过后 cf_clearance 自动保存, 自动返回小程序首页。\n\nWebView UA 留空(用 x5 内核默认)是 Turnstile 一次过的关键, 不要设假 Chrome UA。',
                    col_type: 'rich_text'
                });
                d.push({
                    col_type: 'x5_webview_single',
                    url: SITE_HOST + '/search.asp',
                    desc: 'float&&90%',
                    title: '',
                    extra: {
                        canBack: true,
                        js: $.toString(() => {
                            var tries = 0;
                            function check() {
                                tries++;
                                try {
                                    var ck = '';
                                    try { ck = (fba.getCookie(location.href) || document.cookie || ''); } catch (e) {}
                                    if (ck.indexOf('cf_clearance') >= 0) {
                                        fba.putVar('zys3_ck_from_wv', ck);
                                        fba.toast('✅ 已过 CF, 保存 cookie 中');
                                        fba.parseLazyRule($$$().lazyRule(() => {
                                            var c = getVar('zys3_ck_from_wv', '');
                                            if (c) setItem('zys3_cookie', c);
                                            back();
                                            refreshPage();
                                        }));
                                        return;
                                    }
                                } catch (e) { try { fba.log('zys3 ck err: ' + e.message); } catch (ee) {} }
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

        // ----- 子页 2: 抓 / 刷新分类节目列表 -----
        var catRefreshPage = {
            name: '刷新分类',
            path: 'catRefresh',
            col_type: 'movie_3',
            rule: $.toString((CAT_TABS, FULL_HEADERS_JSON, SITE_HOST) => {
                var d = [];
                (function () {
                    var cookie = getItem('zys3_cookie', '');
                    if (!cookie) {
                        d.push({title: '⚠ 没有 cookie, 请先回首页过 CF', col_type: 'rich_text'});
                        d.push({
                            title: '◀ 返回',
                            url: $('#noLoading#').lazyRule(() => { back(); return 'hiker://empty'; }),
                            col_type: 'text_center_1'
                        });
                        return;
                    }
                    var hd = JSON.parse(FULL_HEADERS_JSON);
                    hd['Cookie'] = cookie;

                    d.push({title: '🔄 抓取分类节目列表', col_type: 'rich_text'});
                    d.push({title: '&nbsp;&nbsp;来源: ' + SITE_HOST + '/ (解 dropdown 菜单)', col_type: 'rich_text'});
                    d.push({col_type: 'blank_block'});

                    var t0 = new Date().getTime();
                    var html = '', err = '';
                    try { html = fetch(SITE_HOST + '/', {headers: hd, timeout: 15000}) || ''; }
                    catch (e) { err = e.message || ('' + e); }
                    var t1 = new Date().getTime();
                    var len = (html || '').length;
                    var CF_RE = /<title[^>]*>\s*Just a moment|Checking your browser before accessing|cf-browser-verification|id=["']cf-error-details["']|Attention Required.*Cloudflare/i;
                    var cfHit = CF_RE.test(html);

                    d.push({title: '&nbsp;&nbsp;耗时: ' + (t1 - t0) + 'ms · 长度: <b>' + len + '</b>', col_type: 'rich_text'});

                    if (err || cfHit || len < 1000) {
                        d.push({
                            title: '❌ 抓取失败: ' + (err ? err : (cfHit ? 'CF 拦截' : '长度过短')),
                            col_type: 'rich_text'
                        });
                        d.push({title: '请检查 cookie 是否有效, 或回首页重过 CF', col_type: 'rich_text'});
                        d.push({col_type: 'blank_block'});
                        d.push({
                            title: '◀ 返回',
                            url: $('#noLoading#').lazyRule(() => { back(); return 'hiker://empty'; }),
                            col_type: 'text_center_1'
                        });
                        return;
                    }

                    // 解 dropdown
                    var dropdowns = html.match(/<li class="dropdown">[\s\S]*?<\/ul><\/li>/g) || [];
                    var catNameToId = {};
                    CAT_TABS.forEach(t => { catNameToId[t.name] = t.id; });
                    var shows = [];
                    var seen = {};
                    dropdowns.forEach((seg) => {
                        var catM = seg.match(/<a[^>]*class="dropdown-toggle"[^>]*>\s*([^<\s][^<]*?)\s*<b/);
                        var catName = catM ? catM[1].trim() : '';
                        var catId = catNameToId[catName] || '';
                        if (!catId) return;
                        var liRe = /<li>\s*<a[^>]*href="\/([a-zA-Z0-9_]+)\/"[^>]*title="([^"]+)"/g;
                        var lm;
                        while ((lm = liRe.exec(seg)) !== null) {
                            if (seen[lm[1]]) continue;
                            seen[lm[1]] = 1;
                            shows.push({slug: lm[1], name: lm[2], cat: catId});
                        }
                    });

                    if (shows.length === 0) {
                        d.push({title: '❌ 解析失败 — dropdown 块: ' + dropdowns.length + ', 节目: 0', col_type: 'rich_text'});
                        d.push({title: '站结构可能变了', col_type: 'rich_text'});
                        d.push({col_type: 'blank_block'});
                        d.push({
                            title: '◀ 返回',
                            url: $('#noLoading#').lazyRule(() => { back(); return 'hiker://empty'; }),
                            col_type: 'text_center_1'
                        });
                        return;
                    }

                    var writeErr = '';
                    try {
                        writeFile('hiker://files/cache/zyshow3_cats.json', JSON.stringify({
                            version: 1,
                            builtAt: new Date().toISOString(),
                            shows: shows
                        }));
                    } catch (e) { writeErr = e.message; }

                    var catCount = {};
                    shows.forEach(s => { catCount[s.cat] = (catCount[s.cat] || 0) + 1; });
                    d.push({title: '✅ 抓到 <b>' + shows.length + '</b> 个节目', col_type: 'rich_text'});
                    CAT_TABS.forEach(t => {
                        d.push({title: '&nbsp;&nbsp;' + t.name + ': ' + (catCount[t.id] || 0) + ' 个', col_type: 'rich_text'});
                    });
                    if (writeErr) d.push({title: '⚠ 写文件失败: ' + writeErr, col_type: 'rich_text'});
                    d.push({col_type: 'blank_block'});
                    d.push({
                        title: '◀ 返回小程序首页',
                        url: $('#noLoading#').lazyRule(() => { back(); refreshPage(); return 'hiker://empty'; }),
                        col_type: 'text_center_1'
                    });
                })();
                setResult(d);
            }, CAT_TABS, FULL_HEADERS_JSON, SITE_HOST)
        };

        return [getCookiePage, catRefreshPage];
    })()
};

$.exports = rule;
