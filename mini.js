// sugoideas 海阔小程序 — 单一口令包含搜索 + 分类 + 详情
// 状态用 putVar/getVar 管理, refreshPage 切换视图
// 编译时整个文件作为 quick_rule_v2 的 rule 字段写入

var CLASSES = [
    {name: '偶像劇2020', url: 'https://sugoideas.com/idol-dramas/2020drama/'},
    {name: '偶像劇2019', url: 'https://sugoideas.com/idol-dramas/2019drama/'},
    {name: '偶像劇2018', url: 'https://sugoideas.com/idol-dramas/2018drama/'},
    {name: '偶像劇2017', url: 'https://sugoideas.com/idol-dramas/2017drama/'},
    {name: '偶像劇2016', url: 'https://sugoideas.com/idol-dramas/2016drama/'},
    {name: '偶像劇2015', url: 'https://sugoideas.com/idol-dramas/2015drama/'},
    {name: '偶像劇2014', url: 'https://sugoideas.com/idol-dramas/2014drama/'},
    {name: '偶像劇2013', url: 'https://sugoideas.com/idol-dramas/2013drama/'},
    {name: '偶像劇2012', url: 'https://sugoideas.com/idol-dramas/2012drama/'},
    {name: '偶像劇2011', url: 'https://sugoideas.com/idol-dramas/2011drama/'},
    {name: '偶像劇2010', url: 'https://sugoideas.com/idol-dramas/2010drama/'},
    {name: '偶像劇2009', url: 'https://sugoideas.com/idol-dramas/2009drama/'},
    {name: '偶像劇2008', url: 'https://sugoideas.com/idol-dramas/2008drama/'},
    {name: '偶像劇2007', url: 'https://sugoideas.com/idol-dramas/2007drama/'},
    {name: '偶像劇2006', url: 'https://sugoideas.com/idol-dramas/2006drama/'},
    {name: '偶像劇2005', url: 'https://sugoideas.com/idol-dramas/2005drama/'},
    {name: '偶像劇2004', url: 'https://sugoideas.com/idol-dramas/2004drama/'},
    {name: '偶像劇2003', url: 'https://sugoideas.com/idol-dramas/2003drama/'},
    {name: '偶像劇2002', url: 'https://sugoideas.com/idol-dramas/2002drama/'},
    {name: '偶像劇2001', url: 'https://sugoideas.com/idol-dramas/2001drama/'},
    {name: '小姐不熙娣', url: 'https://sugoideas.com/variety-shows/小姐不熙娣/'},
    {name: '天才衝衝衝', url: 'https://sugoideas.com/variety-shows/tian-cai-chong-chong-chong/'},
    {name: '飢餓遊戲',   url: 'https://sugoideas.com/variety-shows/飢餓遊戲/'},
    {name: '寶島縱貫線', url: 'https://sugoideas.com/variety-shows/寶島縱貫線/'}
];

var LAZY = "var html=fetch(input,{headers:{'User-Agent':'MOBILE_UA'}});" +
    "var m=html.match(/<source[^>]+src=['\"]([^'\"]+\\.mp4[^'\"]*)['\"]/i);" +
    "m?m[1]:'hiker://empty##未抓到 mp4 直链, 該 Part 可能不存在'";

var view  = getVar('sgo_view',  'home');
var clsIx = parseInt(getVar('sgo_cls',  '0'));
var page  = parseInt(getVar('sgo_page', '1'));
var kw    = getVar('sgo_kw',    '');
var topic = getVar('sgo_topic', '');
var part  = parseInt(getVar('sgo_part', '1'));

var d = [];

if (view === 'detail' && topic) {
    renderDetail();
} else {
    renderHome();
}

setResult(d);

function renderHome() {
    // 搜索框
    d.push({
        desc: kw ? '当前: ' + kw : '搜尋 sugoideas (台灣偶像劇 / 綜藝)',
        col_type: 'input',
        extra: {
            titleVisible: false,
            defaultValue: kw,
            onChange: 'if(input!==getVar("sgo_kw","")){putVar({key:"sgo_kw",value:input});putVar({key:"sgo_page",value:"1"});refreshPage(false)}'
        }
    });

    if (kw) {
        d.push({
            title: '✕ 清除搜尋',
            url: $('').lazyRule(() => {
                putVar({key: 'sgo_kw', value: ''});
                refreshPage(false);
                return 'toast://已清除';
            }),
            col_type: 'scroll_button'
        });
        renderSearch();
    } else {
        // 分类 tab
        for (var i = 0; i < CLASSES.length; i++) {
            var lab = CLASSES[i].name;
            var idx = i;
            d.push({
                title: (clsIx === idx ? '〔' + lab + '〕' : lab),
                url: $('#noLoading#').lazyRule((idx) => {
                    putVar({key: 'sgo_cls',  value: '' + idx});
                    putVar({key: 'sgo_page', value: '1'});
                    refreshPage(false);
                    return 'toast://';
                }, idx),
                col_type: 'scroll_button'
            });
        }
        renderClassList();
    }
}

function renderClassList() {
    var cls = CLASSES[clsIx];
    if (!cls) {
        d.push({title: '分類錯誤', col_type: 'rich_text'});
        return;
    }
    var isVariety = cls.url.indexOf('/variety-shows/') !== -1;
    var pageUrl;
    if (isVariety) {
        pageUrl = cls.url + (page > 1 ? ('?lcp_page0=' + page + '#lcp_instance_0') : '');
    } else {
        pageUrl = page > 1 ? (cls.url + 'page/' + page + '/') : cls.url;
    }

    try {
        var html = fetch(pageUrl, {headers: {'User-Agent': 'MOBILE_UA'}});
        if (isVariety) {
            var lis = parseDomForArray(html, 'ul.lcp_catlist&&li');
            for (var i in lis) {
                var li = lis[i];
                var title = parseDomForHtml(li, 'a&&Text');
                var href  = parseDomForHtml(li, 'a&&href');
                if (!href) continue;
                d.push({
                    title: title,
                    url: href + '@lazyRule=.js:' + LAZY,
                    col_type: 'text_1'
                });
            }
        } else {
            var items = parseDomForArray(html, 'div.page-item-content');
            for (var i in items) {
                var it = items[i];
                var img = parseDomForHtml(it, 'img&&src') || '';
                var titleA = parseDomForHtml(it, 'img&&alt') ||
                             parseDomForHtml(it, 'a,1&&Text') ||
                             parseDomForHtml(it, 'a,0&&Text');
                var topicHref = parseDomForHtml(it, 'a,0&&href');
                var castInfo = parseDomForHtml(it, 'span.searchOne&&Text') || '';
                var dm = (it || '').match(/Release Date:[^<]*<\/strong>\s*([^<\n]+)/);
                var dateInfo = dm ? dm[1].trim() : '';
                if (!topicHref) continue;
                d.push({
                    title: titleA,
                    desc: (castInfo ? castInfo + ' ' : '') + dateInfo,
                    pic_url: img,
                    url: $('').lazyRule((u) => {
                        putVar({key: 'sgo_view',  value: 'detail'});
                        putVar({key: 'sgo_topic', value: u});
                        putVar({key: 'sgo_part',  value: '1'});
                        refreshPage(false);
                        return 'toast://加載詳情...';
                    }, topicHref),
                    col_type: 'movie_3'
                });
            }
        }

        // 翻页
        d.push({
            title: '← 上一頁',
            url: page > 1 ? $('#noLoading#').lazyRule(() => {
                putVar({key: 'sgo_page', value: '' + (parseInt(getVar('sgo_page','1'))-1)});
                refreshPage(false);
                return 'toast://';
            }) : 'hiker://empty',
            col_type: 'scroll_button'
        });
        d.push({
            title: '第 ' + page + ' 頁',
            url: 'hiker://empty',
            col_type: 'scroll_button'
        });
        d.push({
            title: '下一頁 →',
            url: $('#noLoading#').lazyRule(() => {
                putVar({key: 'sgo_page', value: '' + (parseInt(getVar('sgo_page','1'))+1)});
                refreshPage(false);
                return 'toast://';
            }),
            col_type: 'scroll_button'
        });
    } catch (e) {
        d.push({title: '加載失敗: ' + e.message, col_type: 'rich_text'});
    }
}

function renderSearch() {
    try {
        var url = 'https://sugoideas.com/page/' + page + '/?s=' + encodeURIComponent(kw);
        var html = fetch(url, {headers: {'User-Agent': 'MOBILE_UA'}});
        var arts = parseDomForArray(html, 'article.post');
        if (arts.length === 0) {
            d.push({title: '無搜尋結果', col_type: 'rich_text'});
            return;
        }
        for (var i in arts) {
            var a = arts[i];
            var title = parseDomForHtml(a, 'h2.post-title&&a&&Text');
            var href  = parseDomForHtml(a, 'h2.post-title&&a&&href');
            var img   = parseDomForHtml(a, 'div.post-thumbnail&&img&&data-src') ||
                        parseDomForHtml(a, 'div.post-thumbnail&&img&&src') || '';
            var date  = parseDomForHtml(a, 'p.post-date&&Text') || '';
            if (!href) continue;
            d.push({
                title: title,
                pic_url: img,
                desc: date,
                url: $('').lazyRule((u) => {
                    putVar({key: 'sgo_view',  value: 'detail'});
                    putVar({key: 'sgo_topic', value: u});
                    putVar({key: 'sgo_part',  value: '1'});
                    refreshPage(false);
                    return 'toast://';
                }, href),
                col_type: 'movie_3'
            });
        }
    } catch (e) {
        d.push({title: '搜尋失敗: ' + e.message, col_type: 'rich_text'});
    }
}

function renderDetail() {
    // 返回按钮
    d.push({
        title: '↩ 返回',
        url: $('#noLoading#').lazyRule(() => {
            putVar({key: 'sgo_view', value: 'home'});
            refreshPage(false);
            return 'toast://';
        }),
        col_type: 'scroll_button'
    });

    try {
        var html = fetch(topic, {headers: {'User-Agent': 'MOBILE_UA'}});
        var poster = parseDomForHtml(html, 'div.drama_img&&img&&src') ||
                     parseDomForHtml(html, 'div.featured img&&src') ||
                     parseDomForHtml(html, 'article img,0&&src') || '';
        var title = parseDomForHtml(html, 'div.page-title&&h2&&Text') ||
                    parseDomForHtml(html, 'h1.entry-title&&Text') ||
                    (parseDomForHtml(html, 'title&&Text') || '').replace(/ – Sugoideas.*/i, '');
        var castM  = (html.match(/Cast:[\s\S]*?<span class="searchOne">([^<]+)<\/span>/) || [])[1] || '';
        var genreM = (html.match(/Genre:[\s\S]*?<span class="searchOne">([^<]+)<\/span>/) || [])[1] || '';
        var yearM  = (html.match(/Year:<\/td>\s*<td[^>]*>([^<]+)</) || [])[1] || '';
        var epsM   = (html.match(/Episodes:<\/td>\s*<td[^>]*>([^<]+)</) || [])[1] || '';
        var meta = [
            castM  && '主演: ' + castM,
            genreM && '類型: ' + genreM,
            epsM   && '集數: ' + epsM.trim(),
            yearM  && '年份: ' + yearM.trim()
        ].filter(Boolean).join('\n');

        if (poster) {
            d.push({
                title: title,
                pic_url: poster,
                desc: meta || '',
                url: topic,
                col_type: 'movie_1_vertical_pic'
            });
        }
        if (meta) d.push({title: meta, col_type: 'rich_text'});

        // 收集选集 (第 1 页 + 翻页限制 6 页)
        var collect = function(h) {
            var lis = parseDomForArray(h, 'ul.lcp_catlist&&li');
            var out = [];
            for (var i in lis) {
                var li = lis[i];
                var t = parseDomForHtml(li, 'a&&Text');
                var hh = parseDomForHtml(li, 'a&&href');
                if (hh) out.push({t: t, h: hh});
            }
            return out;
        };
        var allEps = collect(html);
        var paginator = parseDomForArray(html, 'ul.lcp_paginator&&li') || [];
        var pageUrls = [];
        for (var p in paginator) {
            var ph = parseDomForHtml(paginator[p], 'a&&href');
            var pt = parseDomForHtml(paginator[p], 'a&&Text') || '';
            if (ph && ph.indexOf('lcp_page0') !== -1 && pt !== '>>' && pageUrls.indexOf(ph) === -1) {
                pageUrls.push(ph);
            }
        }
        var extra = pageUrls.slice(0, 6);
        for (var u in extra) {
            try {
                var h2 = fetch(extra[u], {headers: {'User-Agent': 'MOBILE_UA'}});
                var more = collect(h2);
                for (var k in more) allEps.push(more[k]);
            } catch (e) {}
        }

        // Part 切换
        for (var li2 = 1; li2 <= 3; li2++) {
            var lab = 'Part ' + li2;
            var idx = li2;
            d.push({
                title: (part === idx ? '〔' + lab + '〕' : lab),
                url: $('#noLoading#').lazyRule((idx) => {
                    putVar({key: 'sgo_part', value: '' + idx});
                    refreshPage(false);
                    return 'toast://已切換 Part ' + idx;
                }, idx),
                col_type: 'scroll_button'
            });
        }

        for (var i in allEps) {
            var ep = allEps[i];
            var partUrl = part === 1 ? ep.h : (ep.h.replace(/\/$/, '') + '/' + part + '/');
            d.push({
                title: ep.t,
                url: partUrl + '@lazyRule=.js:' + LAZY,
                col_type: 'text_3'
            });
        }
    } catch (e) {
        d.push({title: '詳情加載失敗: ' + e.message, col_type: 'rich_text'});
    }
}
