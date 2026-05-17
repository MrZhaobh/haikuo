// 用 vm.Script (脚本模式,等价海阔 JSEngine) 检测顶层 return / 语法错误
const fs = require('fs');
const vm = require('vm');
const t = fs.readFileSync('token-quick.txt', 'utf8');
const m = t.match(/base64:\/\/@([^@]+)@(.+)$/);
const obj = JSON.parse(Buffer.from(m[2], 'base64').toString('utf8'));

function check(name, code) {
    if (!code) { console.log(name, 'EMPTY'); return; }
    const body = code.replace(/^js:\n?/, '');
    try {
        new vm.Script(body, { filename: name });
        console.log(name, 'OK (' + body.length + 'B)');
    } catch (e) {
        console.log(name, 'FAIL:', e.message);
        const ln = (e.stack || '').match(/:(\d+)\n/);
        if (ln) {
            const lines = body.split('\n');
            const i = parseInt(ln[1], 10) - 1;
            for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 2); j++) {
                console.log('  ' + (j === i ? '> ' : '  ') + (j + 1) + ' | ' + lines[j].slice(0, 200));
            }
        }
    }
}

check('find_rule', obj.find_rule);
check('searchFind', obj.searchFind);
check('detail_find_rule', obj.detail_find_rule);
check('preRule', obj.preRule);
const pages = JSON.parse(obj.pages);
pages.forEach((p, i) => check('pages[' + i + '] ' + p.path, p.rule));
