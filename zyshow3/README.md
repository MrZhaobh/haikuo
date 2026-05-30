# zyshow3 海阔视界规则 (麦田式搜索版)

zyshow.co 综艺巴士 — 复刻 `zyshow2/` 的分类浏览与 cookie/lazy 框架,**仅把搜索流程换成麦田影院 (mtyy) 风格**。与 `zyshow/`、`zyshow2/` **并行存在**,不替换。

## 与 zyshow2 的差异

| 维度 | zyshow2 | zyshow3 (本目录) |
|---|---|---|
| 搜索入口 | 主页 input + 按钮 → 直接跳 `wvSearch` 子页强制 WebView | 主页 input + 按钮 → `hiker://search?rule=zyshow3&s=<kw>` → 标准搜索页 |
| 搜索 fetch | 子页内 x5 WebView 抽 DOM 后回填主页卡片 | search_find_rule 先 OkHttp fetch /search.asp,**命中 CF/验证特征**才跳 x5 WebView,**正常返回**直接解析 |
| 全局搜索 | 海阔全局搜索条目只是个"跳 WebView"的快捷入口 | 海阔全局搜索就是 search_find_rule 本身 |
| 索引缓存 | `zyshow2_cats.json` | `zyshow3_cats.json` |
| 变量名空间 | `zys2_*` | `zys3_*` |

## 麦田式搜索流程

`search_find_rule` 完全照抄 mtyy 的逻辑:

```
fetch MY_URL with cookie+headers
  ↓
正则匹配 /Just a moment|cf-browser-verification|人机验证|长亭|雷池|检查/
  ↓                                           ↓
命中 → push 一个 "点击人机验证" text_center_1   未命中 → 直接 pdfa/正则抽结果
  ↓                                                   ↓
点击进 x5_webview_single (MY_URL)                pdfa 抓 /v/<date>.html 集数行
JS 轮询: DOM 出现节目卡片 + 拿到 cookie         + /<slug>/ 节目主页
  ↓                                                   ↓
putVar zys3_ck_from_wv → preRule setItem           render text_1 卡片
back() → 用户下拉刷新, 自动走正常分支
```

## 使用流程

1. 导入 `token-quick.txt`
2. 点顶部 **🔴 Cookie** → WebView 过 CF → 变 🟢
3. 点顶部 **🔴 分类** → 一次性抓节目列表 (~3s)
4. 主页输入关键字 → 点 **🔍 搜索** → 进搜索页
   - 若 zyshow.co 把 /search.asp 解封,看到的就是直接渲染的结果
   - 若 CF 拦了,点"点击人机验证",过完返回下拉刷新

## 文件

- `zyshow3.js` — 规则源码
- `compile.js` — 编译入口
- `validate.js` — 顶层 return / 语法校验 (用 vm.Script 脚本模式)
- `clipboard.json` / `single.json` / `share.txt` / `token-*.txt` — 编译产物

## 重新编译

```
cd work/sugo/zyshow3
node compile.js
node validate.js
```

仓库根再 `node build-all.js` 聚合到订阅源。
