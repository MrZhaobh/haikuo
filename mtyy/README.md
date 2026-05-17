# 麦田影院 海阔视界规则

麦田影院 (用户社区分享的海阔视界规则)。本目录通过 SQLite 备份导出 + v2 改写。

## 单口令导入(推荐)

复制 `token-quick.txt` 全文,海阔 → 我的 → 长按"我的小程序"标题 → 添加小程序 → 粘贴板。

或:
- `token-home.txt` — 首页频道
- `token-video.txt` — 视频规则
- `token-search.txt` — 搜索引擎

## 数据来源

用户原始 base64 口令在传输中被 GB18030↔UTF-8 mojibake 损坏(位置 11022 处大段 `\uFFFD`),不可逆。

改走 SQLite 备份导出:
```
hiker_54.db.articlelistrule (id=2) → rule-raw.json → decode.js → clipboard.json
```

## 关键改写

v2 订阅源 schema 不接受 `home_rule_v2` 特有的 `pages` 字段,否则海阔订阅解析器跳过整条。`decode.js` 把 `dt/er/lazy` 三个子页面代码塞进 `preRule` 用 `putVar` 暂存:

| 原引用 | 改写为 |
|---|---|
| `eval(JSON.parse(request('hiker://page/dt')).rule)` | `eval(getVar('__mtyy_dt'))` |
| `@rule=js:$.require("er")` | `@rule=js:eval(getVar('__mtyy_er'))` |
| `eval(JSON.parse(fetch('hiker://page/lazy',{})).rule)` | `eval(getVar('__mtyy_lazy'))` |

## 文件说明

- `rule-raw.json` — SQLite 导出的原始规则 JSON
- `decode.js` — 转换入口(改写 pages → preRule + v2 schema 包装)
- `clipboard.json` — 订阅源(规则数组)
- `single.json` — 单条规则
- `token-*.txt` — 各类 v2 口令

## 重新生成

```
cd work/sugo/mtyy
node decode.js
```
