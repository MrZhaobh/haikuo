/**
 * 海阔视界 影视类规则 — zyshow.co (综艺巴士)
 * 台湾综艺节目大全 (单一站点, 无跨域)
 *
 * 列表页结构:
 *   table > tr[onmouseover] 每集一行
 *   tr 第 1 个 td 第 1 个 a:
 *     href="../<cat>/v/YYYYMMDD.html"
 *     title="<节目名><日期>"
 *   tr 后续 td 是 节目主题 / 嘉宾
 *
 * 单集播放抓取链路:
 *   单集页 (https://www.zyshow.co/<cat>/v/YYYYMMDD.html)
 *     → eval(packer) 字典含 'url|<base64>|target' 段
 *     → fetch('https://www.zyshow.co/url=<base64>') 302 跳到
 *     → sc.zyshow.net/ck1/ck.php?url=<m3u8> (HTML 内 var urls = "<m3u8>")
 *     → m3u8 直链给海阔 ExoPlayer
 */

// 嗅探 lazy: 输入是单集页 URL, 输出 m3u8 直链
var LAZY_CODE =
    "var html = fetch(input, {headers:{'User-Agent':'MOBILE_UA'}}); " +
    "var m = html.match(/url\\|([A-Za-z0-9+\\/=]{40,})\\|/); " +
    "if (!m) return 'hiker://empty##\u672a\u6293\u53d6\u5230 base64'; " +
    "var jumpUrl = 'https://www.zyshow.co/url=' + m[1]; " +
    "var ck = ''; try { ck = fetch(jumpUrl, {headers:{'User-Agent':'MOBILE_UA'}}); } catch (e) { return 'hiker://empty##\u8df3\u8f6c\u5931\u8d25 ' + e.message; } " +
    "var m2 = (ck||'').match(/urls\\s*=\\s*['\"]([^'\"]+)['\"]/); " +
    "m2 ? m2[1] + ';{Referer@https://sc.zyshow.net/}' : 'hiker://empty##\u672a\u6293\u53d6\u5230 m3u8'";

// 35 个常见台综分类 (从 zyshow.co 导航菜单精选)
var CLASS_NAME = [
    '11点热吵店','综艺大热门','小姐不熙娣','天才冲冲冲',
    '饥饿游戏','综艺玩很大','姐姐爱时尚','女人我最大',
    '医师好辣','医学大联盟','WTO姐妹会','女王大人',
    '同学来了','小明星大跟班','坐吧聊聊','黑白威廉Fighting',
    '6人行不行','阿姐万岁','大牌到你家','光荣岛转来PLUS',
    '恋爱熊天秤','菜鸟仔NICE PLAY','综艺大集合','哎营业中',
    '惊奇旅明星','恋爱重修中','全明星出发吧','宇宙啦啦队',
    '周末最强大','最强的身体','姊妹靓起来','小资女夯什么',
    '出去一下What A Trip','大陆寻奇','飞吧玩客'
].join('&');

var CLASS_URL = [
    'https://www.zyshow.co/11dianrechaodian/',
    'https://www.zyshow.co/daremen/',
    'https://www.zyshow.co/xiaojiebuxidi/',
    'https://www.zyshow.co/chongchongchong/',
    'https://www.zyshow.co/jieyouxi/',
    'https://www.zyshow.co/zongyiwanhenda/',
    'https://www.zyshow.co/jiejieaishishang/',
    'https://www.zyshow.co/wozuida/',
    'https://www.zyshow.co/yishihaola/',
    'https://www.zyshow.co/yixuedalianmeng/',
    'https://www.zyshow.co/jiemeihui/',
    'https://www.zyshow.co/nvwangdaren/',
    'https://www.zyshow.co/tongxuelaile/',
    'https://www.zyshow.co/xiaomingxingdagenban/',
    'https://www.zyshow.co/zuobaliaoliao/',
    'https://www.zyshow.co/heibaiweilian/',
    'https://www.zyshow.co/6renxingbux/',
    'https://www.zyshow.co/ajiewansui/',
    'https://www.zyshow.co/dapaidaonijia/',
    'https://www.zyshow.co/guangrongdaozhuanlaiPLUS/',
    'https://www.zyshow.co/lianaixiongtiancheng/',
    'https://www.zyshow.co/cainiaozainp/',
    'https://www.zyshow.co/daheji/',
    'https://www.zyshow.co/haiyingyezhong/',
    'https://www.zyshow.co/jingqilvmingxing/',
    'https://www.zyshow.co/lianaichongxiuzhong/',
    'https://www.zyshow.co/quanmingxingchufaba/',
    'https://www.zyshow.co/yuzhoulaladui/',
    'https://www.zyshow.co/zhoumozuiqiangda/',
    'https://www.zyshow.co/zuiqiangdeshenti/',
    'https://www.zyshow.co/jiemeiliangqilai/',
    'https://www.zyshow.co/xiaozinvhangshenme/',
    'https://www.zyshow.co/chuquyixia/',
    'https://www.zyshow.co/daluxunqi/',
    'https://www.zyshow.co/feibawanke/'
].join('&');

var rule = {
    title: 'zyshow',
    author: 'claude',
    desc: '台湾综艺节目 (zyshow.co)',
    host: 'https://www.zyshow.co',
    homeUrl: 'https://www.zyshow.co/',
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
    // 列表页 — 直接展示该分类所有集数, 标题=节目名+日期, 简介=主题/嘉宾
    // 点击直接进入详情页选集再播 (走 detail_find_rule 拿元数据)
    find_rule: $.toString((LAZY_CODE) => {
        var d = [];
        var kw = getVar('zys_kw', '');

        // 顶部搜索框 (输入立即触发列表页内搜索, 走 zyshow.co/search.asp POST)
        d.push({
            desc: kw ? '\u5f53\u524d\u641c\u5bfb: ' + kw : '\u641c\u5bfb zyshow (\u8f93\u5165\u8282\u76ee\u540d)',
            col_type: 'input',
            extra: {
                titleVisible: false,
                defaultValue: kw,
                onChange: 'if(input!==getVar("zys_kw","")){putVar({key:"zys_kw",value:input});refreshPage(false)}'
            }
        });

        if (kw) {
            d.push({
                title: '\u2715 \u6e05\u9664\u641c\u5bfb',
                url: $('#noLoading#').lazyRule(() => {
                    putVar({key: 'zys_kw', value: ''});
                    refreshPage(false);
                    return 'toast://';
                }),
                col_type: 'scroll_button'
            });
            try {
                var sUrl = 'https://www.zyshow.co/search.asp';
                var sHtml = post(sUrl, {
                    body: 'bh=' + encodeURIComponent(kw),
                    headers: {
                        'User-Agent': 'MOBILE_UA',
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': 'https://www.zyshow.co/'
                    }
                });
                if (!sHtml || sHtml.length < 100) {
                    d.push({title: '\u641c\u5bfb\u8fd4\u56de\u4e3a\u7a7a (\u53ef\u80fd Cloudflare \u62e6\u622a)', col_type: 'rich_text'});
                } else {
                    var sBlocks = sHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
                    var n = 0;
                    var sSeen = {};
                    for (var i = 0; i < sBlocks.length; i++) {
                        var tr = sBlocks[i];
                        var dM = tr.match(/\/v\/(\d{8})\.html/);
                        if (!dM) continue;
                        var key = dM[1];
                        if (sSeen[key]) continue;
                        sSeen[key] = 1;
                        var tM = tr.match(/<a[^>]*\btitle="([^"]+)"/);
                        var t = tM ? tM[1] : key;
                        var hM = tr.match(/href="([^"]*\/v\/\d{8}\.html)"/);
                        var href = hM ? hM[1] : '';
                        var tds = tr.match(/<td[^>]*>[\s\S]*?<\/td>/g) || [];
                        var stripTd2 = function (s) { return (s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); };
                        var subj = tds.length >= 2 ? stripTd2(tds[1]) : '';
                        var absHref = /^https?:/.test(href) ? href : ('https://www.zyshow.co' + href.replace(/^\.\.?\//, '/'));
                        d.push({
                            title: t,
                            desc: subj.substring(0, 60),
                            url: absHref + '@lazyRule=.js:' + LAZY_CODE,
                            col_type: 'text_1'
                        });
                        n++;
                    }
                    if (n === 0) d.push({title: '\u65e0\u641c\u5bfb\u7ed3\u679c', col_type: 'rich_text'});
                }
            } catch (e) {
                d.push({title: '\u641c\u5bfb\u5931\u8d25: ' + e.message, col_type: 'rich_text'});
            }
        } else {
            // 列表分类
            var classUrl = MY_URL;
            var html = '';
            var fatalErr = '';
            try {
                html = fetch(classUrl, {headers: {'User-Agent': 'MOBILE_UA'}}) || '';
            } catch (e) {
                fatalErr = '\u52a0\u8f09\u5931\u6557: ' + e.message;
            }
            if (!fatalErr && (!html || html.length < 100)) {
                fatalErr = '\u9801\u9762\u70ba\u7a7a: ' + classUrl;
            }
            if (fatalErr) {
                d.push({title: fatalErr, col_type: 'rich_text'});
            } else {
                // \u7ad9\u70b9\u6709 2 \u4e2a table (\u5bfc\u822a + \u6570\u636e), parseDomForArray('table&&tr') \u5728\u6d77\u9614 JSEngine \u4e0d\u7a33, \u7528\u6b63\u5219\u5207 tr
                var blocks = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
                var added = 0;
                var seen = {};
                for (var i = 0; i < blocks.length; i++) {
                    var tr = blocks[i];
                    var dM = tr.match(/\/v\/(\d{8})\.html/);
                    if (!dM) continue;
                    var date = dM[1];
                    if (seen[date]) continue;
                    seen[date] = 1;
                    var tM = tr.match(/<a[^>]*\btitle="([^"]+)"/);
                    var t = tM ? tM[1] : date;
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
                    d.push({title: '\u672c\u5206\u985e\u66ab\u7121\u8282\u76ee\u6216\u9801\u9762\u7d50\u69cb\u6539\u8b8a', col_type: 'rich_text'});
                }
            }
        }
        setResult(d);
    }, LAZY_CODE),

    // ============ 二级 (detail_find_rule) ============
    // 这个站点每集是一个独立 URL, 找不到"详情聚合页"
    // detail 页直接给一个"立即播放"按钮 + 节目主题文字 (从单集页解析)
    detail_col_type: 'movie_1',
    detail_find_rule: $.toString((LAZY_CODE) => {
        var d = [];
        var html = '';
        var fatalErr = '';
        try {
            html = fetch(MY_URL, {headers: {'User-Agent': 'MOBILE_UA'}}) || '';
        } catch (e) {
            fatalErr = '\u52a0\u8f09\u5931\u6557: ' + e.message;
        }
        if (!fatalErr && (!html || html.length < 100)) {
            fatalErr = '\u9801\u9762\u70ba\u7a7a: ' + MY_URL;
        }
        if (fatalErr) {
            d.push({title: fatalErr, col_type: 'rich_text'});
        } else {
            // 立即播放按钮 — 走 lazyRule 嗅 m3u8
            d.push({
                title: '\u25b6 \u7acb\u5373\u64ad\u653e',
                url: MY_URL + '@lazyRule=.js:' + LAZY_CODE,
                col_type: 'text_center_1'
            });

            // 海报 (各分类首页缩略图)
            var poster = '';
            try { poster = parseDomForHtml(html, 'div.event_info img&&src') || parseDomForHtml(html, 'img,0&&src') || ''; } catch (e) {}
            // 标题与主题
            var subj = '';
            try {
                subj = parseDomForHtml(html, 'h3&&Text') || '';
            } catch (e) {}
            // 嘉宾/主持
            var meta = '';
            try {
                var sp = parseDomForHtml(html, 'span&&Text') || '';
                meta = sp.replace(/\s+/g, ' ').substring(0, 200);
            } catch (e) {}

            if (poster) {
                d.push({
                    title: subj || MY_URL,
                    pic_url: poster,
                    desc: meta,
                    url: MY_URL,
                    col_type: 'movie_1_vertical_pic'
                });
            }
            if (subj) d.push({title: subj, col_type: 'rich_text'});
            if (meta) d.push({title: meta, col_type: 'rich_text'});
        }
        setResult(d);
    }, LAZY_CODE),
    sdetail_col_type: 'movie_1',
    sdetail_find_rule: '*',

    // ============ 搜索 (search_find_rule) ============
    // 站内搜索是 POST, 已在 find_rule 内嵌处理, 这里留空
    search_col_type: 'text_1',
    search_find_rule: '',

    // ============ lazyRule (顶层) ============
    lazy: $.toString(() => {
        var html = fetch(input, {headers: {'User-Agent': 'MOBILE_UA'}});
        var m = html.match(/url\|([A-Za-z0-9+\/=]{40,})\|/);
        if (!m) return 'hiker://empty##\u672a\u6293\u53d6\u5230 base64';
        var jumpUrl = 'https://www.zyshow.co/url=' + m[1];
        var ck = '';
        try { ck = fetch(jumpUrl, {headers: {'User-Agent': 'MOBILE_UA'}}); }
        catch (e) { return 'hiker://empty##\u8df3\u8f6c\u5931\u8d25 ' + e.message; }
        var m2 = (ck || '').match(/urls\s*=\s*['"]([^'"]+)['"]/);
        return m2 ? m2[1] + ';{Referer@https://sc.zyshow.net/}' : 'hiker://empty##\u672a\u6293\u53d6\u5230 m3u8';
    }),

    pages: [],
    preRule: ''
};

$.exports = rule;
