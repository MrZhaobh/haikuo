/**
 * 把 zyshow3.js 编译成海阔视界 v2 规则 + 各类口令
 * 支持 pages 字段 (多页脚本)
 */
const fs = require('fs');
const path = require('path');

const ruleFile = path.join(__dirname, 'zyshow3.js');
const src = fs.readFileSync(ruleFile, 'utf8');

function fnToHikerJsString(fn, ...args) {
    let body = fn.toString();
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
    let prefix = '';
    paramNames.forEach((p, i) => {
        prefix += `var ${p} = ${JSON.stringify(args[i])};\n`;
    });
    return 'js:\n' + prefix + code;
}

const $ = { toString: fnToHikerJsString, exports: null };

const vm = require('vm');
(function () {
    const ctx = { $, console };
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    const rule = ctx.$.exports;

    if (rule.headers && typeof rule.headers === 'object') {
        rule.headers = JSON.stringify(rule.headers);
    }
    fs.writeFileSync(path.join(__dirname, 'single.json'), JSON.stringify(rule, null, 2), 'utf8');

    const HOST = 'https://www.zyshow.co';
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
        col_type: rule.col_type || 'text_1',
        class_name: rule.class_name || '',
        class_url: absClassUrl,
        area_name: '', area_url: '', year_name: '', year_url: '', sort_name: '', sort_url: '',
        find_rule: rule.find_rule || '',
        search_url: rule.searchUrl || '',
        searchFind: rule.search_find_rule || '',
        detail_col_type: rule.detail_col_type || '',
        detail_find_rule: rule.detail_find_rule || '',
        sdetail_col_type: rule.sdetail_col_type || '',
        sdetail_find_rule: rule.sdetail_find_rule || '',
        ua: 'mobile',
        preRule: rule.preRule || '',
        pages: rule.pages ? JSON.stringify(rule.pages) : ''
    };
    const v2Json = JSON.stringify(v2);

    fs.writeFileSync(path.join(__dirname, 'clipboard.json'), JSON.stringify([v2], null, 2), 'utf8');

    const shareText = '\u6d77\u9614\u89c6\u754c\u00b7\u6211\u7684\u89c6\u9891\u00b7' + rule.title + '\u00b7' + JSON.stringify([v2]);
    fs.writeFileSync(path.join(__dirname, 'share.txt'), shareText, 'utf8');

    const tokenVideo = '\u6d77\u9614\u89c6\u754c\u89c4\u5219\u5206\u4eab\uff0c\u5f53\u524d\u5206\u4eab\u7684\u662f\uff1a\u89c6\u9891\uffe5video_rule_v2\uffe5' + v2Json;
    fs.writeFileSync(path.join(__dirname, 'token-video.txt'), tokenVideo, 'utf8');

    const tokenHome = '\u6d77\u9614\u89c6\u754c\u89c4\u5219\u5206\u4eab\uff0c\u5f53\u524d\u5206\u4eab\u7684\u662f\uff1a\u9996\u9875\u9891\u9053\uffe5home_rule_v2\uffe5' + v2Json;
    fs.writeFileSync(path.join(__dirname, 'token-home.txt'), tokenHome, 'utf8');

    const searchRule = {
        title: rule.title || '', author: rule.author || '', version: 0,
        search_url: rule.searchUrl || '', searchFind: rule.search_find_rule || '',
        detail_col_type: rule.detail_col_type || '', detail_find_rule: rule.detail_find_rule || '',
        sdetail_col_type: rule.sdetail_col_type || '', sdetail_find_rule: rule.sdetail_find_rule || '',
        ua: 'mobile', preRule: rule.preRule || ''
    };
    const tokenSearch = '\u6d77\u9614\u89c6\u754c\u89c4\u5219\u5206\u4eab\uff0c\u5f53\u524d\u5206\u4eab\u7684\u662f\uff1a\u641c\u7d22\u5f15\u64ce\uffe5search_rule_v2\uffe5' + JSON.stringify(searchRule);
    fs.writeFileSync(path.join(__dirname, 'token-search.txt'), tokenSearch, 'utf8');

    const miniRule = Object.assign({}, v2, {
        title: 'zyshow3', author: 'claude', version: 0, icon: '', proxy: ''
    });
    const miniJson = JSON.stringify(miniRule);
    const miniB64 = Buffer.from(miniJson, 'utf8').toString('base64');
    const tokenQuick = '\u6d77\u9614\u89c6\u754c\u89c4\u5219\u5206\u4eab\uff0c\u5f53\u524d\u5206\u4eab\u7684\u662f\uff1a\u5c0f\u7a0b\u5e8f\uffe5home_rule_v2\uffe5base64://@'
        + miniRule.title + '@' + miniB64;
    fs.writeFileSync(path.join(__dirname, 'token-quick.txt'), tokenQuick, 'utf8');

    console.log('Generated:');
    console.log('  clipboard.json   ', Buffer.byteLength(JSON.stringify([v2])), 'B');
    console.log('  single.json');
    console.log('  share.txt');
    console.log('  token-video.txt  ', Buffer.byteLength(tokenVideo), 'B');
    console.log('  token-home.txt   ', Buffer.byteLength(tokenHome), 'B');
    console.log('  token-search.txt ', Buffer.byteLength(tokenSearch), 'B');
    console.log('  token-quick.txt  ', Buffer.byteLength(tokenQuick), 'B');
})();
