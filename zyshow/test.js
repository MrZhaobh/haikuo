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

    console.log('\n=== Summary ===');
    if (failed === 0) {
        console.log('ALL PASS');
        process.exit(0);
    } else {
        console.log(failed + ' FAILURES');
        process.exit(1);
    }
})().catch(e => { console.error('FATAL:', e); process.exit(2); });
