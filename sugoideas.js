/**
 * 海阔视界 影视类规则 — sugoideas.com
 * 台灣偶像劇 + 綜藝節目
 *
 * 跨域结构:
 *   sugoideas.com  — 首页 / 分类 / 节目主题页 / 搜索
 *   srgoideas.com  — 综艺单集播放页 (#playerdiv source mp4)
 *   segoideas.com  — 偶像剧单集播放页 (#playerdiv source mp4)
 *
 * 单集页 mp4 直链 ?st=SIG&e=EXPIRE 无 referer 校验, 但 e 字段会过期, 必须现抓
 * 多 Part 用路径后缀 /2/ /3/ 区分, 通过 "线路" 切换暴露
 */

// ===== 抽出的可复用 lazy 代码 (字符串形式, hikerView 会作为 input 上下文执行) =====
var LAZY_CODE = "var html = fetch(input, {headers:{'User-Agent':'MOBILE_UA'}}); " +
    "var m = html.match(/<source[^>]+src=['\"]([^'\"]+\\.mp4[^'\"]*)['\"]/i); " +
    "m ? m[1] : 'hiker://empty##\u672a\u6293\u5230 mp4 \u76f4\u94fe\uff0c\u8be5 Part \u53ef\u80fd\u4e0d\u5b58\u5728'";

var rule = {
    title: 'sugoideas',
    author: 'claude',
    desc: '台灣偶像劇 / 綜藝節目',
    host: 'https://sugoideas.com',
    homeUrl: 'https://sugoideas.com/',
    url: 'fyclass',
    detailUrl: '',
    searchUrl: 'https://sugoideas.com/page/fypage/?s=**',
    searchable: 1,
    quickSearch: 0,
    filterable: 0,
    headers: {
        'User-Agent': 'MOBILE_UA',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8'
    },
    timeout: 15000,
    class_name: '偶像劇2020&偶像劇2019&偶像劇2018&偶像劇2017&偶像劇2016&偶像劇2015&偶像劇2014&偶像劇2013&偶像劇2012&偶像劇2011&偶像劇2010&偶像劇2009&偶像劇2008&偶像劇2007&偶像劇2006&偶像劇2005&偶像劇2004&偶像劇2003&偶像劇2002&偶像劇2001&綜藝-小姐不熙娣&綜藝-天才衝衝衝&綜藝-飢餓遊戲&綜藝-綜藝玩很大',
    class_url: '/idol-dramas/2020drama/&/idol-dramas/2019drama/&/idol-dramas/2018drama/&/idol-dramas/2017drama/&/idol-dramas/2016drama/&/idol-dramas/2015drama/&/idol-dramas/2014drama/&/idol-dramas/2013drama/&/idol-dramas/2012drama/&/idol-dramas/2011drama/&/idol-dramas/2010drama/&/idol-dramas/2009drama/&/idol-dramas/2008drama/&/idol-dramas/2007drama/&/idol-dramas/2006drama/&/idol-dramas/2005drama/&/idol-dramas/2004drama/&/idol-dramas/2003drama/&/idol-dramas/2002drama/&/idol-dramas/2001drama/&/variety-shows/小姐不熙娣/&/variety-shows/tian-cai-chong-chong-chong/&/variety-shows/飢餓遊戲/&/variety-shows/寶島縱貫線/',

    // ============ 一级 (find_rule) ============
    // 偶像剧分年列表 → 主题卡 (走二级展示选集)
    // 综艺主题页 → 单集卡 (附 @lazyRule 直接播放)
    find_rule: $.toString((LAZY_CODE) => {
        var d = [];
        var kw = getVar('sgo_kw', '');

        // 顶部搜索框 (在每个分类顶部都显示)
        d.push({
            desc: kw ? '当前搜尋: ' + kw : '搜尋 sugoideas',
            col_type: 'input',
            extra: {
                titleVisible: false,
                defaultValue: kw,
                onChange: 'if(input!==getVar("sgo_kw","")){putVar({key:"sgo_kw",value:input});refreshPage(false)}'
            }
        });

        if (kw) {
            // 搜索模式: 显示搜索结果, 不显示分类列表
            d.push({
                title: '✕ 清除搜尋',
                url: $('#noLoading#').lazyRule(() => {
                    putVar({key: 'sgo_kw', value: ''});
                    refreshPage(false);
                    return 'toast://';
                }),
                col_type: 'scroll_button'
            });
            try {
                var sUrl = 'https://sugoideas.com/page/1/?s=' + encodeURIComponent(kw);
                var sHtml = fetch(sUrl, {headers: {'User-Agent': 'MOBILE_UA'}});
                var arts = parseDomForArray(sHtml, 'article.post');
                for (var si in arts) {
                    var sa = arts[si];
                    var st = parseDomForHtml(sa, 'h2.post-title&&a&&Text');
                    var sh = parseDomForHtml(sa, 'h2.post-title&&a&&href');
                    var sg = parseDomForHtml(sa, 'div.post-thumbnail&&img&&data-src') ||
                             parseDomForHtml(sa, 'div.post-thumbnail&&img&&src') || '';
                    var sd = parseDomForHtml(sa, 'p.post-date&&Text') || '';
                    if (!sh) continue;
                    d.push({title: st, pic_url: sg, desc: sd, url: sh, col_type: 'movie_3'});
                }
                if (arts && arts.length === 0) d.push({title: '無搜尋結果', col_type: 'rich_text'});
            } catch (e) {
                d.push({title: '搜尋失敗: ' + e.message, col_type: 'rich_text'});
            }
        } else {
            var raw = MY_URL.split('#');
            var classUrl = raw[0];
            var page = parseInt(raw[1] || (typeof MY_PAGE !== 'undefined' ? MY_PAGE : 1));
            var isVariety = /\/variety-shows\//.test(classUrl);

            if (isVariety) {
                var pageUrl = classUrl + (page > 1 ? ('?lcp_page0=' + page + '#lcp_instance_0') : '');
                var html = fetch(pageUrl, {});
                var lis = parseDomForArray(html, 'ul.lcp_catlist&&li');
                for (var i in lis) {
                    var li = lis[i];
                    var liTextV = (li + '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
                    var aTitleV = '';
                    try { aTitleV = parseDomForHtml(li, 'a&&title') || ''; } catch (e) {}
                    var aTextV = '';
                    try { aTextV = parseDomForHtml(li, 'a&&Text') || ''; } catch (e) {}
                    var titleV = liTextV || aTitleV || aTextV;
                    var href = parseDomForHtml(li, 'a&&href');
                    if (!href) continue;
                    d.push({
                        title: titleV,
                        desc: '',
                        pic_url: '',
                        url: href + '@lazyRule=.js:' + LAZY_CODE,
                        col_type: 'text_1'
                    });
                }
            } else {
                var pageUrl2 = page > 1 ? (classUrl + 'page/' + page + '/') : classUrl;
                var html2 = fetch(pageUrl2, {});
                var items = parseDomForArray(html2, 'div.page-item-content');
                for (var j in items) {
                    var it = items[j];
                    var img = parseDomForHtml(it, 'img&&src') || '';
                    var titleA = parseDomForHtml(it, 'img&&alt') ||
                                 parseDomForHtml(it, 'a,1&&Text') ||
                                 parseDomForHtml(it, 'a,0&&Text');
                    var topicHref = parseDomForHtml(it, 'a,0&&href');
                    var castInfo = parseDomForHtml(it, 'span.searchOne&&Text') || '';
                    var rawHtml = it || '';
                    var dm = rawHtml.match(/Release Date:[^<]*<\/strong>\s*([^<\n]+)/);
                    var dateInfo = dm ? dm[1].trim() : '';

                    if (!topicHref) continue;
                    d.push({
                        title: titleA,
                        desc: (castInfo ? castInfo + ' ' : '') + dateInfo,
                        pic_url: img,
                        url: topicHref,
                        col_type: 'movie_3'
                    });
                }
            }
        }
        setResult(d);
    }, LAZY_CODE),

    // ============ 二级 (detail_find_rule) ============
    detail_col_type: 'movie_1',
    detail_find_rule: $.toString((LAZY_CODE) => {
        var d = [];
        var html = '';
        var fatalErr = '';
        try {
            html = fetch(MY_URL, {headers: {'User-Agent': 'MOBILE_UA'}}) || '';
        } catch (e) {
            fatalErr = '加載失敗: ' + e.message;
        }
        if (!fatalErr && (!html || html.length < 100)) {
            fatalErr = '頁面為空或無法訪問: ' + MY_URL;
        }

        if (fatalErr) {
            d.push({title: fatalErr, col_type: 'rich_text'});
        } else {
            // 检测页面类型: 直接是剧集播放页 (有 <source ... .mp4>) 时显示"立即播放"
            var directMp4 = html.match(/<source[^>]+src=['"]([^'"]+\.mp4[^'"]*)['"]/i);
            if (directMp4) {
                d.push({
                    title: '▶ 立即播放',
                    url: MY_URL + '@lazyRule=.js:' + LAZY_CODE,
                    col_type: 'text_center_1'
                });
            }

            var poster = '';
            var title = '';
            try {
                poster = parseDomForHtml(html, 'div.drama_img&&img&&src') ||
                         parseDomForHtml(html, 'div.featured img&&src') ||
                         parseDomForHtml(html, 'article img,0&&src') || '';
            } catch (e) {}
            try {
                title = parseDomForHtml(html, 'div.page-title&&h2&&Text') ||
                        parseDomForHtml(html, 'h1.entry-title&&Text') ||
                        (parseDomForHtml(html, 'title&&Text') || '').replace(/ – Sugoideas.*/i, '');
            } catch (e) {}

            var castM = (html.match(/Cast:[\s\S]*?<span class="searchOne">([^<]+)<\/span>/) || [])[1] || '';
            var genreM = (html.match(/Genre:[\s\S]*?<span class="searchOne">([^<]+)<\/span>/) || [])[1] || '';
            var yearM = (html.match(/Year:<\/td>\s*<td[^>]*>([^<]+)</) || [])[1] || '';
            var epsM = (html.match(/Episodes:<\/td>\s*<td[^>]*>([^<]+)</) || [])[1] || '';
            var meta = [
                castM && '主演: ' + castM,
                genreM && '类型: ' + genreM,
                epsM && '集数: ' + epsM.trim(),
                yearM && '年份: ' + yearM.trim()
            ].filter(Boolean).join('\n');

            if (poster) {
                d.push({
                    title: title || MY_URL,
                    pic_url: poster,
                    desc: meta || '',
                    url: MY_URL,
                    col_type: 'movie_1_vertical_pic'
                });
            }
            if (meta) d.push({ title: meta, col_type: 'rich_text' });

            // 收集选集
            var collect = function(pageHtml) {
                if (!pageHtml) return [];
                var out = [];
                try {
                    var lis = parseDomForArray(pageHtml, 'ul.lcp_catlist&&li') || [];
                    for (var i in lis) {
                        var li = lis[i];
                        if (!li) continue;
                        try {
                            // li 整段去 HTML 后的纯文本最稳, 兼容日期在 a 内/外两种结构
                            var liText = (li + '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
                            var aTitle = '';
                            try { aTitle = parseDomForHtml(li, 'a&&title') || ''; } catch (e) {}
                            var aText = '';
                            try { aText = parseDomForHtml(li, 'a&&Text') || ''; } catch (e) {}
                            var t = liText || aTitle || aText;
                            var h = parseDomForHtml(li, 'a&&href');
                            if (h) out.push({ t: t, h: h });
                        } catch (e) {}
                    }
                } catch (e) {}
                return out;
            };
            var allEps = collect(html);

            // lcp_paginator 翻页 (限制 6 页避免阻塞)
            var pageUrls = [];
            try {
                var paginator = parseDomForArray(html, 'ul.lcp_paginator&&li') || [];
                for (var p in paginator) {
                    if (!paginator[p]) continue;
                    try {
                        var ph = parseDomForHtml(paginator[p], 'a&&href');
                        var pt = parseDomForHtml(paginator[p], 'a&&Text') || '';
                        if (ph && ph.indexOf('lcp_page0') !== -1 && pt !== '>>' && pageUrls.indexOf(ph) === -1) {
                            pageUrls.push(ph);
                        }
                    } catch (e) {}
                }
            } catch (e) {}
            var maxExtra = 6;
            var extra = pageUrls.slice(0, maxExtra);
            for (var u in extra) {
                try {
                    var h2 = fetch(extra[u], {headers: {'User-Agent': 'MOBILE_UA'}});
                    var more = collect(h2);
                    for (var k in more) allEps.push(more[k]);
                } catch (e) {}
            }

            if (allEps.length === 0 && !directMp4) {
                d.push({title: '此頁面非劇集主題頁,未發現選集列表。\n如需播放,請從首頁分類進入對應劇集。', col_type: 'rich_text'});
            }

            // 线路按钮: Part 1/2/3
            if (allEps.length > 0) {
                var curLine = parseInt(getVar('sugo_part') || '1');
                for (var li2 = 1; li2 <= 3; li2++) {
                    var lab = 'Part ' + li2;
                    var idx = li2;
                    d.push({
                        title: (curLine === idx ? '〔' + lab + '〕' : lab),
                        url: $('#noLoading#').lazyRule((idx) => {
                            putVar({ key: 'sugo_part', value: '' + idx });
                            refreshPage(false);
                            return 'toast://已切换至 Part ' + idx;
                        }, idx),
                        col_type: 'scroll_button'
                    });
                }

                for (var ei in allEps) {
                    var ep = allEps[ei];
                    var partUrl = curLine === 1 ? ep.h : (ep.h.replace(/\/$/, '') + '/' + curLine + '/');
                    // 长标题用 text_1 (一行一个) 避免截断, 短标题保持 text_3
                    var hasLong = allEps.some(function(e){return (e.t||'').length > 12;});
                    var epColType = hasLong ? 'text_1' : 'text_3';
                    d.push({
                        title: ep.t,
                        url: partUrl + '@lazyRule=.js:' + LAZY_CODE,
                        col_type: epColType
                    });
                }
            }
        }
        setResult(d);
    }, LAZY_CODE),
    sdetail_col_type: 'movie_1',

    // ============ 搜索 (search_find_rule) ============
    search_col_type: 'movie_3',
    search_find_rule: $.toString((LAZY_CODE) => {
        var d = [];
        var html = fetch(MY_URL, {});
        var arts = parseDomForArray(html, 'article.post');
        for (var i in arts) {
            var a = arts[i];
            var title = parseDomForHtml(a, 'h2.post-title&&a&&Text');
            var href = parseDomForHtml(a, 'h2.post-title&&a&&href');
            var img = parseDomForHtml(a, 'div.post-thumbnail&&img&&data-src') ||
                      parseDomForHtml(a, 'div.post-thumbnail&&img&&src') || '';
            var date = parseDomForHtml(a, 'p.post-date&&Text') || '';
            if (!href) continue;
            d.push({
                title: title,
                pic_url: img,
                desc: date,
                url: href + '@lazyRule=.js:' + LAZY_CODE,
                col_type: 'movie_3'
            });
        }
        setResult(d);
    }, LAZY_CODE),

    // ============ lazyRule (顶层) ============
    lazy: $.toString(() => {
        var html = fetch(input, { headers: { 'User-Agent': 'MOBILE_UA' } });
        var m = html.match(/<source[^>]+src=['"]([^'"]+\.mp4[^'"]*)['"]/i);
        if (m) return m[1];
        var m2 = html.match(/src:\s*['"]([^'"]+\.mp4[^'"]*)['"]/);
        if (m2) return m2[1];
        return 'hiker://empty##未抓到 mp4 直链, 该 Part 可能不存在';
    }),

    pages: [],
    preRule: ''
};

$.exports = rule;
