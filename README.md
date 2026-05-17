# 海阔视界 多站点规则订阅

## 订阅源 URL

```
https://raw.githubusercontent.com/MrZhaobh/haikuo/main/clipboard.json
```

海阔 → 设置 → 影视设置 → 规则订阅源 → 添加。

## 当前包含的规则

> ⚠️ **每次新增 / 删除 / 重命名站点都必须同步更新下表 + `build-all.js` 的 `SITES`**。本表是仓库的唯一权威清单。

| 站点 | 目录 | 站点 URL | 类型 / 说明 |
|---|---|---|---|
| sugoideas | [sugoideas/](sugoideas/) | https://sugoideas.com (亦 segoideas/srgoideas) | 台湾偶像剧 + 综艺 |
| nivod | [nivod/](nivod/) | https://www.nivod.cc | 海外华人在线影院 (电影/电视剧/综艺/动漫) |
| mtyy | [mtyy/](mtyy/) | (社区分享口令) | 麦田影院 — 由 SQLite 备份导出 |
| zyshow11 | [zyshow11/](zyshow11/) | https://www.zyshow.co/11dianrechaodian/ | 台湾 TVBS 综艺《11点热炒店》单节目滚动归档 |
| zyshow | [zyshow/](zyshow/) | https://www.zyshow.co | 综艺巴士 — 台湾综艺 35 节目全站(11点热炒店 / 综艺大热门 / 小姐不熙娣 …) |
| zyshow2 | [zyshow2/](zyshow2/) | https://www.zyshow.co | 综艺巴士 深搜索测试版 — WebView 抓 CF cookie + 全节目索引,可搜嘉宾/主题(与 zyshow 并行) |

每个站点目录下都有自己的 `README.md`、`compile.js` (或 `decode.js`)、`clipboard.json` 与各类口令文件。

## 仓库结构

```
sugo/
├── clipboard.json          # 聚合后的订阅源 (build-all.js 输出)
├── build-all.js            # 聚合脚本: 把各站 clipboard.json 合并到根
├── index.html              # sugoideas 导入引导页 (GitHub Pages)
├── README.md               # 本文件
├── sugoideas/              # 各站子目录,均含独立 compile.js + 口令
├── nivod/
├── mtyy/
├── zyshow11/
├── zyshow/
└── zyshow2/
```

## 添加新站点

1. 新建目录 `<site>/` 并放入规则源 + `compile.js`
2. 在站点目录运行 `node compile.js` → 产出 `clipboard.json` + 各类口令
3. 编辑根 `build-all.js` 的 `SITES` 数组追加 `{ name, file: '<site>/clipboard.json' }`
4. **更新本 README 顶部「当前包含的规则」表格**(强制项,别漏)
5. 在仓库根运行 `node build-all.js` 聚合
6. `git add . && git commit && git push` 即可更新订阅

## 删除 / 重命名站点

同步操作三处:
1. 本 README「当前包含的规则」表格
2. `build-all.js` 的 `SITES`
3. 站点目录(`git rm -r <site>/` 或 `git mv`)
然后 `node build-all.js` 重新聚合 → commit。

## 全量编译流水线

```
# 各站点单独编译
node sugoideas/compile.js
node nivod/compile.js
node zyshow11/compile.js
node zyshow/compile.js
node zyshow2/compile.js
# (mtyy 由 SQLite 备份脚本生成,见 mtyy/README.md)

# 聚合到根 clipboard.json
node build-all.js
```
