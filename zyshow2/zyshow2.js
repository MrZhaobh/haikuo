/**
 * 海阔视界 小程序 — zyshow2 (台湾综艺,深度搜索版)
 *
 * v3: 放弃 WebView 抓 cookie (CF Turnstile 死循环, x5 内核被识别),
 *     全部沿用老 zyshow 的极简 MOBILE_UA fetch 模式 (经验证不被 CF 拦)
 *
 * 与原 zyshow 的差异:
 *   1. UI 重构: 顶部全局搜索框 + 横向分类 tab + 内容网格,搜索框跨 tab 始终可见
 *   2. 全节目索引缓存: 索引 105 节目 × 每节目 ~10 集到 hiker://files/cache/zyshow2_index.json
 *      搜索时在索引上做 (节目名 | 集数标题 | 主题 | 嘉宾) 多维模糊匹配,可搜嘉宾/主题
 *   3. 首次需点 "构建索引" 跑 2-3 分钟,之后秒回
 */

var SITE_HOST = 'https://www.zyshow.co';
var INDEX_FILE = 'hiker://files/cache/zyshow2_index.json';

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

// m3u8 嗅探 lazy — 沿用老 zyshow,无 cookie,极简 header
var LAZY_CODE =
    "var __r = ''; var u = input; var html = ''; var err = ''; " +
    "try { html = fetch(u, {headers:{'User-Agent':'MOBILE_UA','Referer':'https://www.zyshow.co/'}}); } catch(e){ err = e.message; } " +
    "if (err) { __r = 'hiker://empty##加载失败 ' + err; } " +
    "else if (!html || html.length < 200) { __r = 'hiker://empty##页面为空'; } " +
    "else { " +
    "  var hash = ''; " +
    "  var hm = html.match(/url=([A-Za-z0-9+\\/=]{60,})/); " +
    "  if (hm) hash = hm[1]; " +
    "  if (!hash) { __r = 'hiker://empty##未找到播放地址'; } " +
    "  else { " +
    "    var pUrl = 'https://www.zyshow.co/url=' + hash; " +
    "    var pHtml = ''; try { pHtml = fetch(pUrl, {headers:{'User-Agent':'MOBILE_UA','Referer':'https://www.zyshow.co/'}}); } catch(e){} " +
    "    var m = pHtml.match(/var\\s+urls\\s*=\\s*['\"]([^'\"]+\\.m3u8[^'\"]*)['\"]/); " +
    "    if (!m) m = pHtml.match(/(https?:[^'\"\\s<>]+\\.m3u8[^'\"\\s<>]*)/); " +
    "    if (m) { __r = m[1] + ';{Referer@https://sc.zyshow.net/}'; } " +
    "    else { __r = 'hiker://empty##未抓到 m3u8'; } " +
    "  } " +
    "} " +
    "__r";

var rule = {
    title: 'zyshow2',
    author: 'claude',
    desc: '台湾综艺 (zyshow.co) — 全节目索引深度搜索',
    host: SITE_HOST,
    url: 'hiker://empty',
    col_type: 'movie_3',
    class_name: '',
    class_url: '',
    searchUrl: 'hiker://empty?key=**',
    timeout: 20000,
    detail_col_type: 'movie_1',
    sdetail_col_type: 'movie_1',
    sdetail_find_rule: '*',

    preRule: '',

    // ============ find_rule: 主页面 ============
    find_rule: $.toString((LAZY_CODE, CAT_TABS, SITE_HOST) => {
        var d = [];
        (function () {
            var indexExists = false;
            try { indexExists = !!(readFile('hiker://files/cache/zyshow2_index.json') || '').length; } catch (e) {}
            var kw = getVar('zys2_kw', '');

            // -------- 顶部全局搜索框 --------
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

            // -------- 状态横条 --------
            var indexIcon = indexExists ? '🟢' : '🔴';
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

            // -------- 索引缺失提示 --------
            if (!indexExists) {
                d.push({
                    title: '⚠ 未构建节目索引',
                    desc: '点击上方 "🔴 索引" 开始抓取 105 节目 (约 2-3 分钟,只跑一次)。\n构建完成后即可搜节目名/嘉宾/主题。',
                    col_type: 'rich_text'
                });
                return;
            }

            // -------- 加载索引 --------
            var idx = null;
            try { idx = JSON.parse(readFile('hiker://files/cache/zyshow2_index.json') || '{"shows":[]}'); }
            catch (e) {
                d.push({title: '索引文件损坏: ' + e.message + ',请重建索引', col_type: 'rich_text'});
                return;
            }

            // -------- 关键字搜索模式 --------
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
    }, LAZY_CODE, CAT_TABS, SITE_HOST),

    // ============ detail_find_rule: 节目集数页 ============
    detail_find_rule: $.toString((LAZY_CODE) => {
        var d = [];
        (function () {
            var html = '';
            var fatalErr = '';
            try { html = fetch(MY_URL, {headers: {'User-Agent': 'MOBILE_UA', 'Referer': 'https://www.zyshow.co/'}}) || ''; }
            catch (e) { fatalErr = '加载失败: ' + e.message; }
            if (!fatalErr && /Just a moment|cf-challenge/i.test(html)) {
                fatalErr = '本页被 Cloudflare 拦截 (老 zyshow 一般不出现,如频发请反馈)';
            }
            if (!fatalErr && (!html || html.length < 200)) fatalErr = '页面为空: ' + MY_URL;

            if (fatalErr) {
                d.push({title: fatalErr, col_type: 'rich_text'});
                return;
            }

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
    }, LAZY_CODE),

    // ============ searchFind: 全局搜索 (跨规则借调用) ============
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
            var nameHits = [], epHits = [];
            (idx.shows || []).forEach((s) => {
                if ((s.name || '').toLowerCase().indexOf(kwLower) >= 0) nameHits.push(s);
                (s.episodes || []).forEach((ep) => {
                    var hay = ((ep.title || '') + ' ' + (ep.subj || '') + ' ' + (ep.guests || '')).toLowerCase();
                    if (hay.indexOf(kwLower) >= 0) epHits.push({show: s, ep: ep});
                });
            });

            d.push({
                title: '"' + kw + '"  ·  ' + nameHits.length + ' 个节目, ' + epHits.length + ' 集匹配',
                col_type: 'rich_text'
            });
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
                    d.push({title: '(还有 ' + (epHits.length - slice.length) + ' 集未显示)', col_type: 'rich_text'});
                }
            }
            if (nameHits.length === 0 && epHits.length === 0) {
                d.push({title: '无匹配 — 试试更短的关键词', col_type: 'rich_text'});
            }
        })();
        setResult(d);
    }, LAZY_CODE, SITE_HOST),

    // ============ pages: 索引构建子页 ============
    pages: [
        {
            name: '构建索引',
            path: 'indexer',
            col_type: 'movie_3',
            rule: $.toString((CAT_TABS, SITE_HOST) => {
                var d = [];
                (function () {
                    if (typeof setPreResult !== 'undefined') {
                        setPreResult([
                            {title: '索引构建中...', col_type: 'rich_text'},
                            {col_type: 'pic_1_center', extra: {cls: 'loading_gif'},
                             pic_url: 'https://hikerfans.com/weisyr/img/Loading1.gif'}
                        ]);
                    }

                    // Step 1: 抓首页, 解 dropdown 出全部节目
                    var homeHtml = '';
                    try { homeHtml = fetch(SITE_HOST + '/', {headers: {'User-Agent': 'MOBILE_UA'}}) || ''; } catch (e) {}
                    if (!homeHtml || /Just a moment|cf-challenge/i.test(homeHtml)) {
                        d.push({title: '首页加载失败或被 CF 拦截 (老 zyshow 一般 OK,如频发请反馈)', col_type: 'rich_text'});
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
                        if (!catId) return;
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

                    // Step 2: 逐节目 fetch 集数
                    var failCount = 0;
                    var totalEps = 0;
                    for (var i = 0; i < allShows.length; i++) {
                        var s = allShows[i];
                        var url = SITE_HOST + '/' + s.slug + '/';
                        var html = '';
                        try { html = fetch(url, {headers: {'User-Agent': 'MOBILE_UA', 'Referer': SITE_HOST + '/'}}) || ''; } catch (e) { failCount++; continue; }
                        if (/Just a moment|cf-challenge/i.test(html) || html.length < 200) {
                            failCount++;
                            if (failCount > 15) {
                                d.push({title: '连续失败 ' + failCount + '/' + (i+1) + ' 节目,已停止 (可能 CF 临时抽风,稍后重试)', col_type: 'rich_text'});
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

                    // Step 3: 写入索引文件
                    var idx = {
                        version: 2,
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
            }, CAT_TABS, SITE_HOST)
        }
    ]
};

$.exports = rule;
