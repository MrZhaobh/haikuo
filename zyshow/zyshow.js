/**
 * 海阔视界 影视类规则 — zyshow.co (综艺巴士)
 * 台湾综艺节目大全, 两级结构:
 *   顶层 class tab: 7 个大分类 (谈话/周末/行脚旅游/时尚女人/美食料理/综合/音乐选秀)
 *     ↓ 点分类
 *   节目网格: 从首页 dropdown-menu 解析出该分类下的全部节目
 *     ↓ 点节目 (海阔会用同规则再 fetch 节目页, find_rule 检测 URL 进入"集数列表"分支)
 *   集数列表: tr 表格,每行一集
 *     ↓ 点集数
 *   lazy 嗅 m3u8 直链
 *
 * class_url 用 query (?cat=th) 区分顶层分类, 站点不识别 query 故返回同一首页 HTML
 */

// 嗅探 lazy: 输入是单集页 URL, 输出 m3u8 直链
var LAZY_CODE =
    "var html = fetch(input, {headers:{'User-Agent':'MOBILE_UA'}}); " +
    "var m = html.match(/url\\|([A-Za-z0-9+\\/=]{40,})\\|/); " +
    "if (!m) return 'hiker://empty##未抓取到 base64'; " +
    "var jumpUrl = 'https://www.zyshow.co/url=' + m[1]; " +
    "var ck = ''; try { ck = fetch(jumpUrl, {headers:{'User-Agent':'MOBILE_UA'}}); } catch (e) { return 'hiker://empty##跳转失败 ' + e.message; } " +
    "var m2 = (ck||'').match(/urls\\s*=\\s*['\"]([^'\"]+)['\"]/); " +
    "m2 ? m2[1] + ';{Referer@https://sc.zyshow.net/}' : 'hiker://empty##未抓取到 m3u8'";

// 7 个大分类 (映射到首页 dropdown-toggle 标题文本)
var CAT_SLUGS  = ['th', 'zm', 'jx', 'ss', 'ms', 'yx', 'yl'];
var CAT_LABELS = {
    th: '谈话综艺',
    zm: '周末综艺',
    jx: '行脚旅游',
    ss: '时尚女人',
    ms: '美食料理',
    yx: '综合节目',
    yl: '音乐选秀'
};

var CLASS_NAME = CAT_SLUGS.map(function (s) { return CAT_LABELS[s]; }).join('&');
var CLASS_URL  = CAT_SLUGS.map(function (s) { return 'https://www.zyshow.co/?cat=' + s; }).join('&');

var rule = {
    title: 'zyshow',
    author: 'claude',
    desc: '台湾综艺节目 (zyshow.co)',
    host: 'https://www.zyshow.co',
    homeUrl: 'https://www.zyshow.co/?cat=th',
    url: 'fyclass',
    detailUrl: '',
    searchUrl: '',
    searchable: 0,
    quickSearch: 0,
    filterable: 0,
    headers: {
        'User-Agent': 'MOBILE_UA',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8'
    },
    timeout: 15000,
    class_name: CLASS_NAME,
    class_url: CLASS_URL,

    // ============ 一级 (find_rule) ============
    // 根据 MY_URL 二选一:
    //   MY_URL 含 ?cat=XX  → 分类节目网格 (解析首页 dropdown-menu)
    //   MY_URL 形如 host/<slug>/  → 节目集数列表 (解析 tr 表)
    find_rule: $.toString((LAZY_CODE, CAT_LABELS) => {
        var d = [];

        var catM = MY_URL.match(/[?&]cat=([a-z0-9]+)/);
        var isCategoryView = !!catM;

        var html = '';
        var fatalErr = '';
        try {
            html = fetch(MY_URL.split('?')[0] || 'https://www.zyshow.co/', {headers: {'User-Agent': 'MOBILE_UA'}}) || '';
        } catch (e) {
            fatalErr = '加载失败: ' + e.message;
        }
        if (!fatalErr && (!html || html.length < 200)) {
            fatalErr = '页面为空: ' + MY_URL;
        }
        if (fatalErr) {
            d.push({title: fatalErr, col_type: 'rich_text'});
        } else if (isCategoryView) {
            // === 分类视图: 解析首页 dropdown-menu, 取当前 cat 对应的节目列表 ===
            var cat = catM[1];
            var targetTitle = CAT_LABELS[cat] || '';

            var dropdowns = html.match(/<li class="dropdown">[\s\S]*?<\/ul><\/li>/g) || [];
            var shows = [];
            for (var i = 0; i < dropdowns.length; i++) {
                var seg = dropdowns[i];
                var tM = seg.match(/<a[^>]*class="dropdown-toggle"[^>]*>\s*([^<\s][^<]*?)\s*<b/);
                var title = tM ? tM[1].trim() : '';
                if (title !== targetTitle) continue;
                var liRe = /<li>\s*<a[^>]*href="\/([a-zA-Z0-9_]+)\/"[^>]*title="([^"]+)"/g;
                var lm;
                while ((lm = liRe.exec(seg)) !== null) {
                    shows.push({slug: lm[1], name: lm[2]});
                }
                break;
            }

            if (shows.length === 0) {
                d.push({title: '分类 "' + targetTitle + '" 未解析到节目', col_type: 'rich_text'});
            } else {
                d.push({
                    title: targetTitle + '  ·  ' + shows.length + ' 个节目',
                    col_type: 'rich_text'
                });
                for (var j = 0; j < shows.length; j++) {
                    var s = shows[j];
                    d.push({
                        title: s.name,
                        desc: 'zyshow.co/' + s.slug,
                        url: 'https://www.zyshow.co/' + s.slug + '/',
                        col_type: 'movie_3'
                    });
                }
            }
        } else {
            // === 节目集数视图: tr 表 ===
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
            if (added === 0) {
                d.push({title: '本节目未解析到集数', col_type: 'rich_text'});
            }
        }
        setResult(d);
    }, LAZY_CODE, CAT_LABELS),

    // ============ 二级 (detail_find_rule) ============
    // 节目页 → 集数列表 (tr 表). 单集卡片走 lazy 嗅 m3u8.
    detail_col_type: 'text_1',
    detail_find_rule: $.toString((LAZY_CODE) => {
        var d = [];
        var html = '';
        try {
            html = fetch(MY_URL, {headers: {'User-Agent': 'MOBILE_UA'}}) || '';
        } catch (e) {
            d.push({title: '加载失败: ' + e.message, col_type: 'rich_text'});
        }
        if (html && html.length >= 200) {
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
            if (added === 0) {
                d.push({title: '本节目未解析到集数', col_type: 'rich_text'});
            }
        } else if (html !== undefined) {
            d.push({title: '页面为空: ' + MY_URL, col_type: 'rich_text'});
        }
        setResult(d);
    }, LAZY_CODE),
    sdetail_col_type: 'movie_1',
    sdetail_find_rule: '*',

    search_col_type: 'text_1',
    search_find_rule: '',

    pages: [],
    preRule: ''
};

$.exports = rule;
