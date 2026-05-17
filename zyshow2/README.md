# zyshow2 海阔视界规则 (深搜索测试版)

zyshow.co 综艺巴士的"深搜索"实验版本。与 `zyshow/` (基础版)**并行存在**,不替换。

## 与 zyshow 的差异

| 维度 | zyshow (基础版) | zyshow2 (本目录) |
|---|---|---|
| 节目导航 | class_url 7 分类 tab (海阔内置) | 单页 + scroll_button tab (UI 自定) |
| 搜索能力 | 只搜节目名 (首页 dropdown 列表) | 节目名 + 集数标题 + 主题 + 嘉宾 (全站索引) |
| Cloudflare | 直走首页 (CF 没拦) | WebView 抓 cookie 回填,所有 fetch 携带 |
| 索引 | 无 | 一次性爬全部 105 节目页 → 写本地 JSON,后续秒回 |
| 首次使用 | 即开即用 | 需点 🔴 Cookie → 🔴 索引,等 2-3 分钟 |

## 使用流程

1. 导入 `token-quick.txt`(海阔 → 我的 → 长按"我的小程序" → 添加 → 粘贴板)
2. 进入小程序 → 点顶部 **🔴 Cookie** → WebView 自动过 CF 5 秒挑战 → 回退后变 🟢
3. 点顶部 **🔴 索引** → 骨架屏滚 2-3 分钟 (爬 105 节目页) → 变 🟢
4. 之后:
   - 7 个 tab(谈话/周末/行脚/时尚/美食/综合/音乐)切分类
   - 顶部搜索框输入 **嘉宾名 / 主题 / 节目名** → 秒回
5. cookie 失效 → 重点 🔴 Cookie 即可;节目改版 → 点 🔄 刷新重建索引

## 设计要点

- **UI 重构**:抛弃 class_url 内置 tab,改 find_rule 单页布局:
  ```
  [全局搜索 input]
  [🟢/🔴 Cookie] [🟢/🔴 索引] [🔄 刷新]    ← scroll_button 状态条
  [谈话][周末][行脚][时尚][美食][综合][音乐] ← scroll_button tabs
  <movie_3 节目卡片网格>
  ```
  搜索通过 `hiker://search?rule=zyshow2&s=<input>` 路由到 searchFind
- **CF 绕过**:`x5_webview_single` + `fba.getCookie/putVar/parseLazyRule` 在 dropdown-menu 渲染后自动回填到 `setItem('zys2_cookie')`,LAZY_CODE 全程附带
- **深搜索**:索引文件结构
  ```json
  [{ "slug":"11dianrechaodian", "name":"11点热吵店", "cat":"谈话",
     "eps":[{"t":"...", "subj":"...", "guests":"...", "url":"..."}] }]
  ```
  searchFind 多维模糊匹配,分两栏返回:节目命中 / 单集命中

## 文件说明

- `zyshow2.js` — 规则源码 (含 pages.getCookie + pages.indexer)
- `compile.js` — 编译入口(支持 pages 字段)
- `validate.js` — 顶层 return 扫描器(JSEngine#66 防护)
- `clipboard.json` / `single.json` / `share.txt` / `token-*.txt` — 编译输出

## 重新编译

```
cd work/sugo/zyshow2
node compile.js     # 重新生成
node validate.js    # 顶层 return 校验
```

仓库根再跑 `node build-all.js` 把 zyshow2 聚合到订阅源 `clipboard.json`。
