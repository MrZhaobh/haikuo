const fs = require('fs');
const t = fs.readFileSync('token-quick.txt', 'utf8');
const m = t.match(/base64:\/\/@([^@]+)@(.+)$/);
const obj = JSON.parse(Buffer.from(m[2], 'base64').toString('utf8'));

function scan(name, code) {
    if (!code) return;
    const body = code.replace(/^js:\n?/, '');
    let depth = 0;
    let inStr = false, strCh = '';
    const returns = [];
    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (inStr) {
            if (c === '\\') { i++; continue; }
            if (c === strCh) inStr = false;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') { inStr = true; strCh = c; continue; }
        if (c === '/' && body[i+1] === '/') { while (i < body.length && body[i] !== '\n') i++; continue; }
        if (c === '/' && body[i+1] === '*') { i += 2; while (i < body.length-1 && !(body[i] === '*' && body[i+1] === '/')) i++; i++; continue; }
        if (c === '{') depth++;
        else if (c === '}') depth--;
        else if (c === 'r' && body.substr(i, 6) === 'return' && !/[\w.]/.test(body[i-1]||' ') && !/[\w]/.test(body[i+6]||' ')) {
            if (depth === 0) {
                const before = body.substring(0, i);
                const ln = before.split('\n').length;
                returns.push({line: ln, ctx: body.substring(Math.max(0,i-30), Math.min(body.length, i+60)).replace(/\n/g,'\\n')});
            }
        }
    }
    console.log('=== ' + name + ' top-level returns: ' + returns.length);
    returns.forEach(r => console.log('  L' + r.line + ': ' + r.ctx));
}

scan('find_rule', obj.find_rule);
scan('searchFind', obj.searchFind);
scan('detail_find_rule', obj.detail_find_rule);
const pages = JSON.parse(obj.pages);
pages.forEach((p,i) => scan('pages['+i+'] '+p.path, p.rule));
