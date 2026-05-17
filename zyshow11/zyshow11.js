/**
 * 海阔视界 影视类规则 — zyshow.co/11dianrechaodian (11点热炒店)
 * 台湾 TVBS 台综, 单节目 30 集滚动归档
 *
 * 列表: /11dianrechaodian/  → table 行,每行一集
 *   <a href="../11dianrechaodian/v/YYYYMMDD.html" title="11点热炒店YYYYMMDD">
 *
 * 详情(集): /11dianrechaodian/v/YYYYMMDD.html
 *   js_videoCon_2 内 <a href="https://www.zyshow.co/url=BASE64">  ← 取这串 BASE64
 *
 * 播放: GET /url=BASE64 → 302 → sc.zyshow.net/ck1/ck.php?url=<m3u8>
 *   sc.zyshow.net 返回 player HTML, 内含 `var urls = "<m3u8>"`
 */

// 嗅探 lazy: 输入是集 URL → 输出 m3u8 直链
// 顶层 return 在海阔 JSEngine 非法 → 用 var __r 末尾求值
var LAZY_CODE =
    "var __r = ''; " +
    "var u = input; " +
    "var html = ''; var err = ''; " +
    "try { html = fetch(u, {headers:{'User-Agent':'MOBILE_UA','Referer':'https://www.zyshow.co/'}}); } catch(e){ err = e.message; } " +
    "if (err) { __r = 'hiker://empty##\u52a0\u8f7d\u5931\u8d25 ' + err; } " +
    "else if (!html || html.length < 200) { __r = 'hiker://empty##\u9875\u9762\u4e3a\u7a7a'; } " +
    "else { " +
    "  var hash = ''; " +
    "  var hm = html.match(/url=([A-Za-z0-9+\\/=]{60,})/); " +
    "  if (hm) hash = hm[1]; " +
    "  if (!hash) { __r = 'hiker://empty##\u672a\u627e\u5230\u64ad\u653e\u5730\u5740'; } " +
    "  else { " +
    "    var pUrl = 'https://www.zyshow.co/url=' + hash; " +
    "    var pHtml = ''; try { pHtml = fetch(pUrl, {headers:{'User-Agent':'MOBILE_UA','Referer':'https://www.zyshow.co/'}}); } catch(e){} " +
    "    var m = pHtml.match(/var\\s+urls\\s*=\\s*['\\\"]([^'\\\"]+\\.m3u8[^'\\\"]*)['\\\"]/); " +
    "    if (!m) m = pHtml.match(/(https?:[^'\\\"\\s<>]+\\.m3u8[^'\\\"\\s<>]*)/); " +
    "    if (m) { __r = m[1] + ';{Referer@https://sc.zyshow.net/}'; } " +
    "    else { __r = 'hiker://empty##\u672a\u6293\u5230 m3u8'; } " +
    "  } " +
    "} " +
    "__r";

var rule = {
    title: '11\u70b9\u70ed\u7092\u5e97',
    author: 'claude',
    desc: 'zyshow \u53f0\u7efc 11\u70b9\u70ed\u7092\u5e97',
    host: 'https://www.zyshow.co',
    homeUrl: 'https://www.zyshow.co/11dianrechaodian/',
    url: 'fyclass',
    detailUrl: '',
    searchUrl: '',
    searchable: 0,
    quickSearch: 0,
    filterable: 0,
    headers: {'User-Agent': 'MOBILE_UA'},
    timeout: 15000,
    class_name: '\u5168\u90e8',
    class_url: 'https://www.zyshow.co/11dianrechaodian/',

    // ============ 一级 (find_rule) ============
    find_rule: $.toString((LAZY_CODE) => {
        var d = [];

        var html = '';
        var fatal = '';
        try {
            html = fetch('https://www.zyshow.co/11dianrechaodian/', {headers: {'User-Agent': 'MOBILE_UA'}}) || '';
        } catch (e) { fatal = '\u52a0\u8f7d\u5931\u8d25: ' + e.message; }
        if (!fatal && (!html || html.length < 500)) fatal = '\u9875\u9762\u4e3a\u7a7a';

        if (fatal) {
            d.push({title: fatal, col_type: 'rich_text'});
        } else {
            // 节目头卡:海报 + 简介
            d.push({
                title: '11\u70b9\u70ed\u7092\u5e97',
                desc: '\u53f0\u6e7e TVBS \u7efc\u827a \u00b7 \u4e3b\u6301\uff1a\u5434\u5b97\u5baa\u3001Melody \u00b7 \u6bcf\u5468\u4e00~\u4e94 23:00',
                pic_url: 'https://www.zyshow.co/img/11dianrechaodian.jpg@Referer=https://www.zyshow.co/',
                url: 'hiker://empty##11\u70b9\u70ed\u7092\u5e97',
                col_type: 'movie_1_vertical_pic'
            });
            d.push({col_type: 'line_blank'});

            // 表格行 → 每行一集
            var blocks = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
            var seen = {};
            var epCount = 0;
            for (var i = 0; i < blocks.length; i++) {
                var tr = blocks[i];
                var dM = tr.match(/11dianrechaodian\/v\/(\d{8})\.html/);
                if (!dM) continue;
                var date = dM[1];
                if (seen[date]) continue;
                seen[date] = 1;
                epCount++;

                // 第二个 td 通常是节目内容简介
                var summary = '';
                var tds = tr.match(/<td[^>]*>[\s\S]*?<\/td>/g) || [];
                if (tds.length >= 2) {
                    summary = (tds[1] + '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
                }
                var guests = '';
                if (tds.length >= 3) {
                    guests = (tds[2] + '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
                }

                var nice = date.substring(0, 4) + '-' + date.substring(4, 6) + '-' + date.substring(6, 8);
                var epUrl = 'https://www.zyshow.co/11dianrechaodian/v/' + date + '.html';

                var desc = summary;
                if (guests) desc = (desc ? desc + ' \u00b7 ' : '') + '\u5609\u5bbe: ' + guests;

                d.push({
                    title: nice,
                    desc: (desc || '').substring(0, 100),
                    pic_url: 'https://www.zyshow.co/img/11dianrechaodian.jpg@Referer=https://www.zyshow.co/',
                    url: epUrl + '@lazyRule=.js:' + LAZY_CODE,
                    col_type: 'movie_1'
                });
            }

            if (epCount === 0) {
                d.push({title: '\u672a\u89e3\u6790\u51fa\u8282\u76ee\u5217\u8868', col_type: 'rich_text'});
            } else {
                d.push({col_type: 'line_blank'});
                d.push({title: '\u5171 ' + epCount + ' \u96c6 \u00b7 \u53ea\u663e\u793a\u6700\u8fd1 30 \u671f', col_type: 'rich_text'});
            }
        }
        setResult(d);
    }, LAZY_CODE),

    // ============ 二级 (detail) — 直接 lazy 不需要二级 ============
    detail_col_type: 'movie_1',
    detail_find_rule: '*',

    sdetail_col_type: 'movie_1',
    sdetail_find_rule: '*',

    search_col_type: 'text_1',
    search_find_rule: '',

    pages: [],
    preRule: ''
};

$.exports = rule;
