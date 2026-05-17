/**
 * 把 sugoideas.js 编译成海阔视界剪贴板可粘贴的单规则 JSON
 * 核心: 把 $.toString((arg)=>{CODE}, val) 转换成 "js:\n var arg = JSON.stringify(val); CODE"
 * 输出: clipboard.json
 */
const fs = require('fs');
const path = require('path');

const ruleFile = path.join(__dirname, 'sugoideas.js');
const src = fs.readFileSync(ruleFile, 'utf8');

// 模拟 $.toString
function fnToHikerJsString(fn, ...args) {
    let body = fn.toString();
    // 抽取参数名 + 函数体
    const arrowMatch = body.match(/^\s*\(?([^)]*?)\)?\s*=>\s*{([\s\S]*)}\s*$/);
    let paramNames = [], code;
    if (arrowMatch) {
        paramNames = arrowMatch[1].split(',').map(s => s.trim()).filter(Boolean);
        code = arrowMatch[2];
    } else {
        const fnMatch = body.match(/^function\s*\w*\s*\(([^)]*)\)\s*{([\s\S]*)}\s*$/);
        paramNames = fnMatch[1].split(',').map(s => s.trim()).filter(Boolean);
        code = fnMatch[2];
    }
    // 把参数转成顶部 var 声明
    let prefix = '';
    paramNames.forEach((p, i) => {
        prefix += `var ${p} = ${JSON.stringify(args[i])};\n`;
    });
    return 'js:\n' + prefix + code;
}

const $ = {
    toString: fnToHikerJsString,
    exports: null
};

// eval rule (vm context 避免变量冲突)
const vm = require('vm');
(function() {
    const ctx = { $, console };
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    const rule = ctx.$.exports;
    // 海阔旧版字段兼容: headers 必须是字符串
    if (rule.headers && typeof rule.headers === 'object') {
        rule.headers = JSON.stringify(rule.headers);
    }
    // 单规则 JSON (非数组), 部分版本只接受这种
    fs.writeFileSync(path.join(__dirname, 'single.json'), JSON.stringify(rule, null, 2), 'utf8');

    // === 新版海阔视界 v2 字段格式 ===
    // 字段名变化: searchUrl->search_url, search_find_rule->searchFind, headers->ua, 删除非 v2 字段
    // class_url 必须是绝对 URL — v2 schema 没有 host 字段, ArticleListModel 不会自动拼接
    const HOST = rule.host || 'https://sugoideas.com';
    const absClassUrl = (rule.class_url || '').split('&').map(u => {
        if (!u) return u;
        if (/^https?:\/\//i.test(u)) return u;
        return HOST.replace(/\/$/, '') + (u.startsWith('/') ? u : '/' + u);
    }).join('&');

    const v2 = {
        title: rule.title || '',
        author: rule.author || '',
        version: 0,
        group: '',
        titleColor: '',
        url: rule.url || '',
        col_type: rule.col_type || 'movie_3',
        class_name: rule.class_name || '',
        class_url: absClassUrl,
        area_name: '',
        area_url: '',
        year_name: '',
        year_url: '',
        sort_name: '',
        sort_url: '',
        find_rule: rule.find_rule || '',
        search_url: rule.searchUrl || '',
        searchFind: rule.search_find_rule || '',
        detail_col_type: rule.detail_col_type || '',
        detail_find_rule: rule.detail_find_rule || '',
        sdetail_col_type: rule.sdetail_col_type || '',
        sdetail_find_rule: rule.sdetail_find_rule || '',
        ua: 'mobile',
        preRule: rule.preRule || ''
    };
    const v2Json = JSON.stringify(v2);

    // 订阅源: v2 数组 (class_url 已是绝对 URL)
    // 注: 仓库根 clipboard.json 由 build-all.js 聚合写入,所以这里写到站点专属文件
    const clip = JSON.stringify([v2], null, 2);
    fs.writeFileSync(path.join(__dirname, 'clipboard.json'), clip, 'utf8');

    // 旧版分享文本也用 v2 数组
    const shareText = '海阔视界·我的视频·' + rule.title + '·' + JSON.stringify([v2]);
    fs.writeFileSync(path.join(__dirname, 'share.txt'), shareText, 'utf8');

    // 新版口令: 视频规则
    const tokenVideo = '海阔视界规则分享，当前分享的是：视频￥video_rule_v2￥' + v2Json;
    fs.writeFileSync(path.join(__dirname, 'token-video.txt'), tokenVideo, 'utf8');

    // 新版口令: 首页频道 (用户给的示例就是这种)
    const tokenHome = '海阔视界规则分享，当前分享的是：首页频道￥home_rule_v2￥' + v2Json;
    fs.writeFileSync(path.join(__dirname, 'token-home.txt'), tokenHome, 'utf8');

    // 新版口令: 搜索引擎 (search_rule_v2 独立规则, 配合首页频道使用)
    const searchRule = {
        title: rule.title || '',
        author: rule.author || '',
        version: 0,
        search_url: rule.searchUrl || '',
        searchFind: rule.search_find_rule || '',
        detail_col_type: rule.detail_col_type || '',
        detail_find_rule: rule.detail_find_rule || '',
        sdetail_col_type: rule.sdetail_col_type || '',
        sdetail_find_rule: rule.sdetail_find_rule || '',
        ua: 'mobile',
        preRule: rule.preRule || ''
    };
    const tokenSearch = '海阔视界规则分享，当前分享的是：搜索引擎￥search_rule_v2￥' + JSON.stringify(searchRule);
    fs.writeFileSync(path.join(__dirname, 'token-search.txt'), tokenSearch, 'utf8');

    // 新版口令: 小程序 (小程序￥home_rule_v2￥base64://@title@base64(JSON))
    // 这是 "麦田影院" 那种格式 — 用 home_rule_v2 schema 包装, base64 编码后再带前缀
    // find_rule 已经内嵌搜索框 + 分类 tab, 直接复用 ② 那份的 v2 即可
    const miniRule = Object.assign({}, v2, {
        title: 'sugoideas',
        author: 'claude',
        version: 0,
        icon: '',
        proxy: ''
    });
    const miniJson = JSON.stringify(miniRule);
    const miniB64 = Buffer.from(miniJson, 'utf8').toString('base64');
    const tokenQuick = '海阔视界规则分享，当前分享的是：小程序￥home_rule_v2￥base64://@' + miniRule.title + '@' + miniB64;
    fs.writeFileSync(path.join(__dirname, 'token-quick.txt'), tokenQuick, 'utf8');

    console.log('已生成:');
    console.log('  clipboard.json   (订阅源片段, 由 build-all.js 聚合到根 clipboard.json)', Buffer.byteLength(clip), 'B');
    console.log('  single.json      (单条规则, 旧版字段, 仅备用)');
    console.log('  share.txt        (分享文本, v2 数组)');
    console.log('  token-video.txt  (新版口令: 视频￥video_rule_v2)');
    console.log('  token-home.txt   (新版口令: 首页频道￥home_rule_v2)');
    console.log('  token-search.txt (新版口令: 搜索引擎￥search_rule_v2)');
    console.log('  token-quick.txt  (新版口令: 小程序￥home_rule_v2￥base64:// — 单口令带搜索)');
})();
