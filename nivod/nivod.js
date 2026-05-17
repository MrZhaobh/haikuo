/**
 * 海阔视界 影视类规则 — nivod.cc (泥视频)
 * 海外华人在线影院, macCMS 风格站点
 *
 * 列表: filter.html?channel={movie|tv|show|anime}&page={N}
 *   每张卡片 li.qy-mod-li 含 a.qy-mod-link → /voddetail/<id>
 *
 * 详情: /voddetail/<id>
 *   元数据: #director #actors #show-desc #region #postYear #types-label
 *   选集链接: /vodplay/<id>/<slug>
 *
 * 播放接口: /xhr_playinfo/<id>(-<slug>) 返回 JSON
 *   { pdatas: [{playurl,from,name},...], more_eps: [...] }
 *
 * 搜索: 跨域到 e.kortw.cc 拿 sign 后回 search_x.html, sign 校验需浏览器指纹绕不过
 *      → 搜索功能暂关闭
 */

// 嗅探 lazy: 输入是 vodplay URL, 输出 m3u8 直链 (取第一路 pdata)
// 注意: 海阔 JSEngine 顶层 return 非法 → 用 var result 末尾求值
var LAZY_CODE =
    "var __r = ''; " +
    "var u = input; " +
    "var m = u.match(/\\/vodplay\\/(\\d+)(?:\\/([^?#]+))?/); " +
    "if (!m) { __r = 'hiker://empty##\u672a\u8b58\u5225 vodplay URL'; } " +
    "else { " +
    "  var api = 'https://www.nivod.cc/xhr_playinfo/' + m[1] + (m[2] && m[2] !== 'v' ? '-' + m[2] : ''); " +
    "  var html = ''; var err = ''; " +
    "  try { html = fetch(api, {headers:{'User-Agent':'MOBILE_UA','Referer':'https://www.nivod.cc/'}}); } catch(e){ err = e.message; } " +
    "  if (err) { __r = 'hiker://empty##\u63a5\u53e3\u5931\u8d25 ' + err; } " +
    "  else { " +
    "    var data = null; try { data = JSON.parse(html); } catch(e){} " +
    "    if (!data) { __r = 'hiker://empty##JSON \u89e3\u6790\u5931\u8d25'; } " +
    "    else { " +
    "      var ps = (data && data.pdatas) || []; " +
    "      if (!ps.length && data.more_eps && data.more_eps[0] && data.more_eps[0].plays) ps = data.more_eps[0].plays; " +
    "      if (!ps.length) { __r = 'hiker://empty##\u65e0\u53ef\u7528\u64ad\u653e\u7ebf\u8def'; } " +
    "      else { __r = ps[0].playurl; } " +
    "    } " +
    "  } " +
    "} " +
    "__r";

var CLASS_NAME = ['\u7535\u5f71','\u7535\u89c6\u5267','\u7efc\u827a','\u52a8\u6f2b'].join('&');
// 各分类 URL 内部不能含 &(海阔切分类是按 & 分),分页在 find_rule 里用 MY_PAGE 拼接
var CLASS_URL = [
    'https://www.nivod.cc/filter.html?channel=movie',
    'https://www.nivod.cc/filter.html?channel=tv',
    'https://www.nivod.cc/filter.html?channel=show',
    'https://www.nivod.cc/filter.html?channel=anime'
].join('&');

var rule = {
    title: 'nivod',
    author: 'claude',
    desc: '\u6ce5\u89c6\u9891 nivod.cc',
    host: 'https://www.nivod.cc',
    homeUrl: 'https://www.nivod.cc/',
    url: 'fyclass',
    detailUrl: '',
    searchUrl: '',
    searchable: 0,
    quickSearch: 0,
    filterable: 0,
    headers: {'User-Agent': 'MOBILE_UA'},
    timeout: 15000,
    class_name: CLASS_NAME,
    class_url: CLASS_URL,

    // ============ 一级 (find_rule) ============
    find_rule: $.toString((LAZY_CODE) => {
        var d = [];
        var page = (typeof MY_PAGE !== 'undefined' && MY_PAGE) ? MY_PAGE : 1;
        var classUrl = MY_URL || '';
        var url = classUrl + (page > 1 ? '&page=' + page : '');

        var html = '';
        var fatal = '';
        try {
            html = fetch(url, {headers: {'User-Agent': 'MOBILE_UA'}}) || '';
        } catch (e) { fatal = '\u52a0\u8f7d\u5931\u8d25: ' + e.message; }
        if (!fatal && (!html || html.length < 200)) fatal = '\u9875\u9762\u4e3a\u7a7a';

        if (fatal) {
            d.push({title: fatal, col_type: 'rich_text'});
        } else {
            // 优先用父 ul 收 li,失败 fallback 到正则全局抓 li 块
            var lis = [];
            try { lis = parseDomForArray(html, 'ul.qy-mod-ul&&li') || []; } catch (e) {}
            if (!lis.length) {
                try { lis = parseDomForArray(html, 'li.qy-mod-li') || []; } catch (e) {}
            }
            if (!lis.length) {
                // 最后兜底:整段 HTML 用正则切 li 块
                var blocks = html.match(/<li[^>]*class=["'][^"']*qy-mod-li[^"']*["'][^>]*>[\s\S]*?<\/li>/g) || [];
                lis = blocks;
            }

            var seen = {};
            for (var i in lis) {
                if (!lis[i]) continue;
                var liStr = lis[i] + '';
                var idM = liStr.match(/\/voddetail\/(\d+)/);
                if (!idM) continue;
                var vid = idM[1];
                if (seen[vid]) continue;
                seen[vid] = 1;

                // title: 优先 a 的 title 属性 → li 内 a.link-txt 的 title 属性 (顺序不定) → img alt
                var title = '';
                try { title = parseDomForHtml(lis[i], 'a.link-txt&&title') || ''; } catch (e) {}
                if (!title) {
                    // 顺序无关:只要标签内同时含 link-txt 和 title=
                    var aBlocks = liStr.match(/<a\b[^>]*>/g) || [];
                    for (var ai = 0; ai < aBlocks.length; ai++) {
                        if (aBlocks[ai].indexOf('link-txt') < 0) continue;
                        var tm = aBlocks[ai].match(/\btitle=["']([^"']+)["']/);
                        if (tm) { title = tm[1]; break; }
                    }
                }
                if (!title) {
                    var am = liStr.match(/<img[^>]+alt=["']([^"']+)["']/);
                    if (am) title = am[1];
                }

                // 副标题(主演/导演)
                var sub = '';
                try { sub = parseDomForHtml(lis[i], 'p.sub&&Text') || ''; } catch (e) {}
                if (!sub) {
                    var sm = liStr.match(/<p[^>]+class=["'][^"']*sub[^"']*["'][^>]*>([\s\S]*?)<\/p>/);
                    if (sm) sub = sm[1].replace(/<[^>]+>/g, ' ');
                }
                sub = (sub || '').replace(/\s+/g, ' ').trim();

                var pic = 'https://www.nivod.cc/imgs/small/' + vid + '.jpg';
                d.push({
                    title: title || ('\u4f5c\u54c1 ' + vid),
                    desc: sub.substring(0, 60),
                    pic_url: pic + '@Referer=https://www.nivod.cc/',
                    url: 'https://www.nivod.cc/voddetail/' + vid,
                    col_type: 'movie_3'
                });
            }

            if (d.length === 0) {
                d.push({title: '\u672c\u9875\u672a\u89e3\u6790\u51fa\u7247 (\u9875 ' + page + ')', col_type: 'rich_text'});
            }
        }
        setResult(d);
    }, LAZY_CODE),

    // ============ 二级 (detail_find_rule) ============
    detail_col_type: 'movie_1',
    detail_find_rule: $.toString((LAZY_CODE) => {
        var d = [];
        var html = '';
        var fatal = '';
        try { html = fetch(MY_URL, {headers: {'User-Agent': 'MOBILE_UA'}}) || ''; }
        catch (e) { fatal = '\u52a0\u8f7d\u5931\u8d25: ' + e.message; }
        if (!fatal && (!html || html.length < 200)) fatal = '\u9875\u9762\u4e3a\u7a7a';

        if (fatal) {
            d.push({title: fatal, col_type: 'rich_text'});
        } else {
            var idMatch = (MY_URL || '').match(/\/voddetail\/(\d+)/);
            var vid = idMatch ? idMatch[1] : '';

            // 头图卡片 (海报 + 标题 + 简要)
            var titleTxt = '';
            try { titleTxt = parseDomForHtml(html, 'h1&&Text') || ''; } catch (e) {}
            if (!titleTxt) {
                try { titleTxt = (parseDomForHtml(html, 'title&&Text') || '').replace(/_.*$/, ''); } catch (e) {}
            }
            var director = '', actors = '', desc = '', region = '', year = '', types = '', langn = '';
            try { director = parseDomForHtml(html, '#director&&Text') || ''; } catch (e) {}
            try { actors   = parseDomForHtml(html, '#actors&&Text') || ''; } catch (e) {}
            try { desc     = parseDomForHtml(html, '#show-desc&&Text') || ''; } catch (e) {}
            try { region   = parseDomForHtml(html, '#region&&Text') || ''; } catch (e) {}
            try { year     = parseDomForHtml(html, '#postYear&&Text') || ''; } catch (e) {}
            try { types    = parseDomForHtml(html, '#types-label&&Text') || ''; } catch (e) {}
            try { langn    = parseDomForHtml(html, '#langName&&Text') || ''; } catch (e) {}

            var meta = [];
            if (year)   meta.push(year);
            if (region) meta.push(region);
            if (types)  meta.push(types);
            if (langn)  meta.push(langn);
            var metaLine = meta.join(' | ');

            d.push({
                title: titleTxt,
                pic_url: vid ? ('https://www.nivod.cc/imgs/' + vid + '.jpg@Referer=https://www.nivod.cc/')
                             : '',
                desc: metaLine,
                url: MY_URL,
                col_type: 'movie_1_vertical_pic'
            });

            if (director) d.push({title: '\u5bfc\u6f14\uff1a' + director, col_type: 'rich_text'});
            if (actors)   d.push({title: '\u4e3b\u6f14\uff1a' + actors,   col_type: 'rich_text'});
            if (desc)     d.push({title: '\u7b80\u4ecb\uff1a' + desc,     col_type: 'rich_text'});

            // 选集
            d.push({col_type: 'line_blank'});
            var eps = [];
            var seenSlug = {};
            try {
                var matches = html.match(/\/vodplay\/\d+\/[^\s"'<>]+/g) || [];
                for (var k = 0; k < matches.length; k++) {
                    var m2 = matches[k].match(/\/vodplay\/(\d+)\/([^?#]+)/);
                    if (!m2) continue;
                    var slug = m2[2];
                    if (seenSlug[slug]) continue;
                    seenSlug[slug] = 1;
                    eps.push({vid: m2[1], slug: slug});
                }
            } catch (e) {}

            if (eps.length === 0) {
                d.push({title: '\u672a\u627e\u5230\u9009\u96c6', col_type: 'rich_text'});
            } else {
                // 集数标题:把 ep1, ep10, ep20 → 第01/10/20集; 其他 slug 原样
                function epLabel(slug) {
                    var m = slug.match(/^ep(\d+)$/);
                    if (m) {
                        var n = m[1];
                        return '\u7b2c' + (n.length < 2 ? '0' + n : n) + '\u96c6';
                    }
                    return slug;
                }
                // 选集太多 → text_3 短标题, 否则 text_1
                var hasLong = eps.some(function (e) { return epLabel(e.slug).length > 8; });
                var colT = hasLong ? 'text_1' : 'text_3';

                for (var j = 0; j < eps.length; j++) {
                    var ep = eps[j];
                    var playUrl = 'https://www.nivod.cc/vodplay/' + ep.vid + '/' + ep.slug;
                    d.push({
                        title: epLabel(ep.slug),
                        url: playUrl + '@lazyRule=.js:' + LAZY_CODE,
                        col_type: colT
                    });
                }
            }
        }
        setResult(d);
    }, LAZY_CODE),

    sdetail_col_type: 'movie_1',
    sdetail_find_rule: '*',

    search_col_type: 'text_1',
    search_find_rule: '',

    // ============ lazyRule (顶层) ============
    // 顶层 lazy 字段 $.toString 提取后变成顶层 js: 代码,return 非法
    lazy: $.toString(() => {
        var __r = '';
        var u = input;
        var m = u.match(/\/vodplay\/(\d+)(?:\/([^?#]+))?/);
        if (!m) {
            __r = 'hiker://empty##\u672a\u8bc6\u522b vodplay URL';
        } else {
            var api = 'https://www.nivod.cc/xhr_playinfo/' + m[1] + (m[2] && m[2] !== 'v' ? '-' + m[2] : '');
            var html = '';
            var err = '';
            try { html = fetch(api, {headers:{'User-Agent':'MOBILE_UA','Referer':'https://www.nivod.cc/'}}); }
            catch (e) { err = e.message; }
            if (err) {
                __r = 'hiker://empty##\u63a5\u53e3\u5931\u8d25 ' + err;
            } else {
                var data = null;
                try { data = JSON.parse(html); } catch (e) {}
                if (!data) {
                    __r = 'hiker://empty##JSON \u89e3\u6790\u5931\u8d25';
                } else {
                    var ps = (data.pdatas) || [];
                    if (!ps.length && data.more_eps && data.more_eps[0] && data.more_eps[0].plays) {
                        ps = data.more_eps[0].plays;
                    }
                    if (!ps.length) {
                        __r = 'hiker://empty##\u65e0\u53ef\u7528\u64ad\u653e\u7ebf\u8def';
                    } else {
                        __r = ps[0].playurl;
                    }
                }
            }
        }
        __r;
    }),

    pages: [],
    preRule: ''
};

$.exports = rule;
