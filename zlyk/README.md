# 周六影库 1 (zlykw.com)

来源: 海阔视界群组 05-18 回复, 评论区复制侠分享的小程序 `云6oooole/xxxxxx/jcxgrj362a2fjrqn`。
本目录为该口令解出的明文规则 + 7 件套, 接入到仓库根 `clipboard.json` 聚合订阅。

## 站点

- 域名: https://www.zlykw.com
- 类型: 综合影视聚合 (按 url=/vodshow/1-...-fypage---.html, 第一段 1 表示分类 id, fypage 翻页)
- 搜索: `/vodsearch/-------------.html?wd=**`

## 规则结构

由 3 个 page 模块组成 (`pages` 字段, JSON 数组):

| path | 用途 |
|---|---|
| `dt` | 分类导航 (大类 + 小类 + 折叠展开 + 搜索框) |
| `lazy` | 单集播放地址抽取 (匹配 `r player_xxx={...}` JSON, encrypt 1/2 分支处理 url) |
| `er` | 二级详情页 (标题/封面/简介/选集列表, 依赖海阔内置模板 `模板·Q`) |

## 注意事项 / 已知坑

1. **二级页用 `eval('hiker://page/erji?rule=模板·Q')`** — 必须 HikerView 里装了同名内置模板才能工作。如果没装会渲染失败。
2. **search_url 含 `&amp;` HTML entity** — 原作者写的 `?wd=**&amp;submit=`, 海阔 fetch 时通常自动转义, 但若搜索失败可改成 `&submit=`。
3. **作者 url 模式带 `fypage`** — 老版 v2 字符串模板, 不依赖 MY_PAGE; 翻页改用 `replace(/(-+)\d+(-+\.html)/, ...)` 注入页码。
4. **find_rule 顶层无 return** — 已通过 vm.Script 校验。

## 编译

```bash
node decode.js
```

输入: `token-quick-original.txt` (原始云口令明文)
输出: 7 件套 (clipboard.json / single.json / share.txt / token-*.txt)

回到仓库根聚合:
```bash
cd ..
node build-all.js
```
