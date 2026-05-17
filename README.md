# sugoideas 海阔视界规则

台灣偶像劇 + 綜藝節目 (sugoideas.com / segoideas.com / srgoideas.com)

## 订阅源 URL

复制以下 URL,海阔 → 设置 → 影视设置 → 规则订阅源 → 添加:

```
https://raw.githubusercontent.com/MrZhaobh/haikuo/main/clipboard.json
```

## 单口令导入

不想订阅时,可直接复制 `token-quick.txt` 内容粘贴到海阔 → 我的 → 长按"我的小程序"标题 → 添加小程序 → 粘贴板。

## 文件说明

- `sugoideas.js` — 规则源码
- `mini.js` — 小程序内嵌脚本
- `compile.js` — 编译入口 (输出 clipboard.json / 各类口令文件)
- `clipboard.json` — 订阅源 (规则数组)
- `single.json` — 单条规则 JSON
- `token-*.txt` — 各类 v2 口令 (视频/首页频道/搜索引擎/小程序)
- `share.txt` — 旧版分享文本
- `index.html` — 导入引导页 (GitHub Pages 友好)

## 重新编译

```
cd work/sugo
node compile.js
```
