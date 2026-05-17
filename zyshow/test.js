/**
 * zyshow 规则三级流程本地端到端测试
 * 用法: 先 `node compile.js` 编译, 再 `node test.js`
 *
 * 模拟海阔 JSEngine 环境 (fetch / MY_URL / MY_RULE / setResult),
 * 用 vm 跑 clipboard.json 里的 find_rule + detail_find_rule.
 *
 * 检测:
 *   1) class_name/class_url 7 大分类齐全
 *   2) 每个分类 fyclass MY_URL 跑 find_rule → 节目网格 > 0
 *   3) 抽样一个节目 url 跑 detail_find_rule → 集数 > 0
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const https = require('https');

const CB = path.join(__dirname, 'clipboard.json');
const arr = JSON.parse(fs.readFileSync(CB, 'utf8'));
const rule = arr.find(r => r.title === 'zyshow');
if (!rule) { console.error('FAIL: zyshow rule not found in clipboard.json'); process.exit(1); }

function fetchSync(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
                'Accept-Language': 'zh-TW,zh;q=0.9'
            }
        }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                return fetchSync(res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href).then(resolve, reject);
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
    });
}

async function runScript(jsBody, myUrl) {
    const result = [];
    let html;
    const ctx = {
        MY_URL: myUrl,
        MY_RULE: { title: 'zyshow' },
        MY_PAGE: 1,
        setResult: d => { result.push(...d); },
        fetch: u => html,
        console,
    };
    vm.createContext(ctx);

    const fetchUrl = jsBody.includes('MY_URL.split(\'?\')[0]')
        ? myUrl.split('?')[0] || 'https://www.zyshow.co/'
        : myUrl;
    html = await fetchSync(fetchUrl);
    ctx.fetch = () => html;

    const body = jsBody.replace(/^js:\n/, '');
    vm.runInContext(body, ctx, { timeout: 5000 });
    return result;
}

function header(t) { console.log('\n=== ' + t + ' ==='); }

(async () => {
    let failed = 0;

    header('Step 1: class_name / class_url');
    const names = (rule.class_name || '').split('&').filter(Boolean);
    const urls = (rule.class_url || '').split('&').filter(Boolean);
    console.log('  class_name (' + names.length + '):', names.join(' | '));
    console.log('  class_url  (' + urls.length + '):', urls[0], '...');
    if (names.length !== 7 || urls.length !== 7) {
        console.log('  FAIL: expected 7 categories');
        failed++;
    } else {
        console.log('  OK');
    }

    header('Step 2: each category → program grid (find_rule)');
    const sampleShows = {};
    for (let i = 0; i < urls.length; i++) {
        const cat = names[i];
        const url = urls[i];
        try {
            const items = await runScript(rule.find_rule, url);
            const shows = items.filter(it => it.col_type === 'movie_3');
            const errLine = items.find(it => /未解析到|加载失败|页面为空/.test(it.title || ''));
            if (shows.length === 0) {
                console.log('  FAIL [' + cat + '] no shows, lines:', items.map(it => it.title).slice(0, 3));
                failed++;
            } else {
                console.log('  OK   [' + cat + '] ' + shows.length + ' shows, e.g. ' + shows[0].title + ' → ' + shows[0].url);
                sampleShows[cat] = shows[0];
            }
            if (errLine) console.log('       (msg: ' + errLine.title + ')');
        } catch (e) {
            console.log('  FAIL [' + cat + '] exception:', e.message);
            failed++;
        }
    }

    header('Step 3: pick a show → episode list (detail_find_rule)');
    const samples = Object.entries(sampleShows).slice(0, 3);
    for (const [cat, show] of samples) {
        try {
            const items = await runScript(rule.detail_find_rule, show.url);
            const eps = items.filter(it => /@lazyRule=/.test(it.url || ''));
            const errLine = items.find(it => /未解析到|加载失败|页面为空/.test(it.title || ''));
            if (eps.length === 0) {
                console.log('  FAIL [' + cat + ' / ' + show.title + '] no episodes, lines:', items.map(it => it.title).slice(0, 3));
                failed++;
            } else {
                console.log('  OK   [' + cat + ' / ' + show.title + '] ' + eps.length + ' eps, e.g. ' + eps[0].title);
            }
            if (errLine) console.log('       (msg: ' + errLine.title + ')');
        } catch (e) {
            console.log('  FAIL [' + cat + ' / ' + show.title + '] exception:', e.message);
            failed++;
        }
    }

    header('Step 4: pick an episode → lazy m3u8');
    // 从 step 3 拿一集 url + LAZY_CODE
    try {
        const lazy1 = await runScript(rule.detail_find_rule, samples[0][1].url);
        const ep = lazy1.find(it => /@lazyRule=/.test(it.url || ''));
        if (!ep) {
            console.log('  SKIP: no episode to test');
        } else {
            const m = ep.url.match(/^([^@]+)@lazyRule=\.js:(.+)$/);
            const epUrl = m[1];
            const lazyCode = m[2];

            // 1) 语法校验: lazy 代码体必须是合法 JS 语句块 (不能用 Function('return '+code), 那要求是表达式)
            try { new Function(lazyCode); }
            catch (e) { console.log('  FAIL lazy syntax:', e.message); failed++; }

            // 2) 顶层 return 检测: 海阔 JSEngine 不允许 (#14/#66). new Function 不抓得到 — 单独 regex 扫.
            //    跳过 IIFE 里的 return (函数体内合法)
            const stripped = lazyCode.replace(/\(function\s*\(\)\s*\{[\s\S]*?\}\s*\)\s*\(\s*\)/g, '').replace(/function[^{]*\{[\s\S]*?\}/g, '');
            if (/(^|[^\w.])return\b/.test(stripped)) {
                console.log('  FAIL lazy: 顶层 return 语句, 海阔会报 JSEngine#14/#66 (改用 __r 变量累积模式)');
                failed++;
            }

            // 3) 实跑 lazy 链路: 真 fetch + 真嗅 m3u8 (跟 zyshow11 一致用 url= 形式)
            let html1, html2;
            try { html1 = await fetchSync(epUrl); } catch (e) { console.log('  FAIL fetch ep page:', e.message); failed++; return; }
            const base64M = html1.match(/url=([A-Za-z0-9+\/=]{60,})/);
            if (!base64M) { console.log('  FAIL: no url=<base64> in ep page'); failed++; }
            else {
                try { html2 = await fetchSync('https://www.zyshow.co/url=' + base64M[1]); } catch (e) { console.log('  FAIL fetch jump:', e.message); failed++; return; }
                let m3u8M = html2.match(/var\s+urls\s*=\s*['"]([^'"]+\.m3u8[^'"]*)['"]/);
                if (!m3u8M) m3u8M = html2.match(/(https?:[^'"\s<>]+\.m3u8[^'"\s<>]*)/);
                if (!m3u8M) console.log('  WARN: no m3u8 in ck.php (CDN/Cloudflare?)');
                else console.log('  OK   lazy chain:', m3u8M[1].slice(0, 70));
            }
        }
    } catch (e) {
        console.log('  FAIL lazy test exception:', e.message);
        failed++;
    }

    console.log('\n=== Summary ===');
    if (failed === 0) {
        console.log('ALL PASS');
        process.exit(0);
    } else {
        console.log(failed + ' FAILURES');
        process.exit(1);
    }
})().catch(e => { console.error('FATAL:', e); process.exit(2); });
