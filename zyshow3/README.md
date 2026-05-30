# zyshow3 海阔视界规则 (海阔标准搜索 + WebView 抽 DOM)

zyshow.co 综艺巴士 — 复刻 `zyshow2/` 的分类浏览与 cookie/lazy 框架,**搜索流程走海阔标准搜索路径 `hiker://search` 但内部仍用 WebView 抽 DOM**。与 `zyshow/`、`zyshow2/` **并行存在**,不替换。

## 历史教训:为什么不能 OkHttp fetch /search.asp

最早 zyshow3 想抄"麦田式 fetch-first":OkHttp 带 cf_clearance fetch `/search.asp`,命中 CF 才开 WebView。**这个设计被 zyshow.co 的 CF 策略证伪** — `/search.asp` 路径即使带 cf_clearance OkHttp 也拦死返 5.9KB Just a moment(2026-05-18 在 zyshow2 testSearch 子页实测,4 种 query 参数全拦)。所以即使过了 CF 拿到 cookie,下一次搜索 fetch 还是会被拦,死循环。

## 与 zyshow2 的差异

| 维度 | zyshow2 | zyshow3 (本目录) |
|---|---|---|
| 搜索入口 | 主页 input + 按钮 → 直接跳 `wvSearch` 子页 | 主页 input + 按钮 → `hiker://search?rule=zyshow3&s=<kw>` → search_find_rule |
| searchUrl | `hiker://empty?key=**` | `hiker://empty?key=**`(相同,避开海阔自动 fetch CF 保护的真 URL) |
| 搜索 WebView 位置 | 子页 wvSearch | search_find_rule 内直接 push x5_webview_single |
| 全局搜索 | 海阔全局搜索 → 显示个跳 WebView 子页的卡片 | 海阔全局搜索 = search_find_rule 本身, 体验更原生 |
| 索引缓存 | `zyshow2_cats.json` | `zyshow3_cats.json` |
| 变量名空间 | `zys2_*` | `zys3_*` |

## 搜索流程

```
hiker://search?rule=zyshow3&s=<kw>
  ↓ (海阔替换 ** 为 kw)
MY_URL = hiker://empty?key=<kw>
  ↓
search_find_rule:
  MY_URL.split('key=') 取 kw
  ↓
  检查 getVar('zys3_wv_results') + getVar('zys3_wv_results_kw') 是否匹配
  ↓                                   ↓
  命中缓存 → 渲染结果卡片           未命中 → push x5_webview_single
                                       ↓
                                       webview 加载 /search.asp?keyword=<kw>
                                       (CF 验证由 webview 用户/cookie 共同处理)
                                       ↓
                                       JS 轮询:
                                         - title 非 challenge && body > 3000
                                         - 抽 a[href*="/v/"] 集数 + a[href^="/.../"] 节目
                                         - 顺手抢 cf_clearance cookie 给 detail/lazy 用
                                       ↓
                                       fba.putVar zys3_wv_results / kw
                                       fba.parseLazyRule(refreshPage)
                                       ↓
                                       search_find_rule 再跑 → 命中缓存 → 渲染卡片
```

## 使用流程

1. 导入 `token-quick.txt`
2. 点顶部 **🔴 Cookie** → WebView 过 CF → 变 🟢(此 cookie 用于节目页 + lazy)
3. 点顶部 **🔴 分类** → 一次性抓节目列表 (~3s)
4. 主页输入关键字 → 点 **🔍 搜索** → 进海阔搜索页
   - 自动在搜索页里加载 WebView /search.asp,抽完 DOM 自动 refresh 渲染卡片
   - 若 WebView 内出现 CF Turnstile,点"我是真人"过完会自动继续
5. 点 **🔁 重搜** 清缓存重抽

## 文件

- `zyshow3.js` — 规则源码
- `compile.js` — 编译入口
- `validate.js` — 顶层 return / 语法校验 (用 vm.Script 脚本模式)
- `clipboard.json` / `single.json` / `share.txt` / `token-*.txt` — 编译产物

## 重新编译

```
cd work/sugo/zyshow3
node validate.js
node compile.js
```

仓库根再 `node build-all.js` 聚合到订阅源。
