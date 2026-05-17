# 海阔视界 多站点规则订阅

## 订阅源 URL

```
https://raw.githubusercontent.com/MrZhaobh/haikuo/main/clipboard.json
```

海阔 → 设置 → 影视设置 → 规则订阅源 → 添加。

## 当前包含的规则

| 站点 | 目录 | 说明 |
|---|---|---|
| sugoideas | [sugoideas/](sugoideas/) | 台湾偶像剧 + 综艺 (sugoideas.com / segoideas.com / srgoideas.com) |
| nivod | [nivod/](nivod/) | 泥视频 nivod.cc — 海外华人在线影院 |
| mtyy | [mtyy/](mtyy/) | 麦田影院 (SQLite 备份导出) |
| zyshow11 | [zyshow11/](zyshow11/) | 11点热炒店 (zyshow.co) — 台湾 TVBS 综艺 |

每个站点目录下都有自己的 `README.md`、`compile.js`、`clipboard.json` 与口令文件。

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
└── zyshow11/
```

## 添加新站点

1. 新建目录 `<site>/` 并放入规则源 + `compile.js`
2. 在站点目录运行 `node compile.js` → 产出 `clipboard.json` + 各类口令
3. 编辑根 `build-all.js` 的 `SITES` 数组追加 `{ name, file: '<site>/clipboard.json' }`
4. 在仓库根运行 `node build-all.js` 聚合
5. `git add . && git commit && git push` 即可更新订阅

## 全量编译流水线

```
# 各站点单独编译
node sugoideas/compile.js
node nivod/compile.js
node zyshow11/compile.js
# (mtyy 由 SQLite 备份脚本生成,见 mtyy/README.md)

# 聚合到根 clipboard.json
node build-all.js
```
