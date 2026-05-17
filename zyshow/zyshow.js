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

// 嗅探 lazy: 输入是单集页 URL, 输出 m3u8 直链. 跟 zyshow11 完全对齐:
// 1) 单集页含两组 base64 — `url|XXX|` 和 `url=XXX`, 内容不同
// 2) **必须用 url=XXX 形式**, url|XXX| 的源海阔拉不到 (CDN 限制)
// 3) 海阔 @lazyRule=.js:<code> 不允许任何 return 语句, 用 __r 累积 + 最后一行裸表达式
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

// 8 个 tab: 搜索 + 7 大分类 (映射到首页 dropdown-toggle 标题文本)
// search 分支不 fetch 首页, 走 fetchCodeByWebView 过 Cloudflare Managed Challenge
var CAT_SLUGS  = ['search', 'th', 'zm', 'jx', 'ss', 'ms', 'yx', 'yl'];
var CAT_LABELS = {
    search: '🔍 搜索',
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
        var cat = catM ? catM[1] : '';
        var isSearch = (cat === 'search');
        var isCategoryView = !!catM && !isSearch;

        // === 搜索分支: WebView 加载首页过 CF, 注入 form.submit() POST 搜索 ===
        if (isSearch) {
            var kw = getVar('zys_kw', '');
            d.push({
                title: '搜索',  // 右侧按钮文字
                desc: '输入关键词后点 "搜索" 按钮 (CF 防护, 首次过盾约 5-15 秒)',
                col_type: 'input',
                url: "(putVar({key:'zys_kw',value:input}), refreshPage(false), 'hiker://empty')",
                extra: {
                    defaultValue: kw,
                    titleVisible: true
                }
            });
            if (!kw) {
                d.push({title: '请输入关键词后点右侧 "搜索"', col_type: 'rich_text'});
            } else {
                d.push({title: '搜索中: ' + kw + ' …', col_type: 'rich_text'});
                // 直接 GET search.asp — ASP 的 Request("bh") 同时收 form 和 querystring,
                // 且 WebView 加载会让 CF 自动通关后 redirect 到目标 URL
                // GBK 编码用海阔 decodeStr(str, 'GBK') (尽管名字叫 decode, 实际是 encode + percent)
                var encoded;
                try { encoded = decodeStr(kw, 'GBK'); }
                catch (e) { encoded = encodeURIComponent(kw); }
                var sUrl = 'https://www.zyshow.co/search.asp?bh=' + encoded;

                // checkJs: 等到 tr 表里出现 /v/YYYYMMDD.html 即认为是结果页
                var checkJs = 'try {' +
                    ' var trs = document.querySelectorAll("tr");' +
                    ' for (var i = 0; i < trs.length; i++) {' +
                    '  if (/\\/v\\/\\d{8}\\.html/.test(trs[i].innerHTML)) return "1";' +
                    ' }' +
                    ' return null;' +
                    '} catch(e) { return null; }';
                var sHtml = '';
                try {
                    sHtml = fetchCodeByWebView(sUrl, {
                        timeout: 60000,
                        headers: {'User-Agent': 'MOBILE_UA', 'Referer': 'https://www.zyshow.co/'},
                        checkJs: checkJs
                    }) || '';
                } catch (e) {
                    d.push({title: 'WebView 加载失败: ' + e.message, col_type: 'rich_text'});
                }
                if (sHtml && sHtml.length >= 200) {
                    var sBlocks = sHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
                    var hitCount = 0;
                    var sSeen = {};
                    for (var si = 0; si < sBlocks.length; si++) {
                        var sTr = sBlocks[si];
                        var sDM = sTr.match(/\/v\/(\d{8})\.html/);
                        if (!sDM) continue;
                        var sDate = sDM[1];
                        var sHM = sTr.match(/href="([^"]*\/v\/\d{8}\.html)"/);
                        var sHref = sHM ? sHM[1] : '';
                        if (sSeen[sHref]) continue;
                        sSeen[sHref] = 1;
                        var sTM = sTr.match(/<a[^>]*\btitle="([^"]+)"/);
                        var sT = sTM ? sTM[1] : sDate;
                        var sTds = sTr.match(/<td[^>]*>[\s\S]*?<\/td>/g) || [];
                        var sStripTd = function (s) { return (s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); };
                        var sSubj = sTds.length >= 2 ? sStripTd(sTds[1]) : '';
                        var sGuests = sTds.length >= 3 ? sStripTd(sTds[2]) : '';
                        var sAbsHref = /^https?:/.test(sHref) ? sHref : ('https://www.zyshow.co' + sHref.replace(/^\.\.?\//, '/'));
                        var sDesc = (sSubj ? sSubj.substring(0, 50) : '') + (sGuests ? '\n' + sGuests.substring(0, 40) : '');
                        d.push({
                            title: sT,
                            desc: sDesc,
                            url: sAbsHref + '@lazyRule=.js:' + LAZY_CODE,
                            col_type: 'text_1'
                        });
                        hitCount++;
                    }
                    if (hitCount === 0) {
                        // 显示 title + 长度作 debug
                        var titleM = sHtml.match(/<title[^>]*>([^<]*)<\/title>/i);
                        var pgTitle = titleM ? titleM[1].trim() : '(no title)';
                        d.push({title: '未搜到 "' + kw + '"', col_type: 'rich_text'});
                        d.push({title: '[debug] page title: ' + pgTitle + ' | len: ' + sHtml.length, col_type: 'rich_text'});
                    }
                } else if (!sHtml) {
                    d.push({title: 'WebView 超时或被 CF 拦截 (timeout 60s)', col_type: 'rich_text'});
                    d.push({title: '[debug] checkJs 未匹配到 /v/YYYYMMDD.html 模式, 看不到结果页 tr 表', col_type: 'rich_text'});
                } else {
                    // sHtml 太短 (< 200 字节)
                    d.push({title: '[debug] WebView 返回过短: ' + sHtml.length + ' 字节, 内容: ' + sHtml.substring(0, 150), col_type: 'rich_text'});
                }
            }
            setResult(d);
        } else {

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
                        pic_url: 'https://www.zyshow.co/img/' + s.slug + '.jpg@Referer=https://www.zyshow.co/',
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
        }  // end of else (非 search 分支)
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
