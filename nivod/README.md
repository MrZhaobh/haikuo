# nivod 海阔视界规则

泥视频 (nivod.cc) — 海外华人在线影院。

## 单口令导入(推荐)

复制 `token-quick.txt` 全文,海阔 → 我的 → 长按"我的小程序"标题 → 添加小程序 → 粘贴板。

或:
- `token-home.txt` — 首页频道(规则形式)
- `token-video.txt` — 视频规则
- `token-search.txt` — 搜索引擎(站内搜索 sign 反爬,目前不可用)

## 工作原理

1. 列表 `filter.html?channel={movie|tv|show|anime}&page=N` — 解析 `li.qy-mod-li`
2. 详情 `voddetail/<id>` — id 抽 `#director #actors #show-desc` 等
3. 选集页面里有 `vodplay/<id>/<slug>` 链接(电影 slug=`v`, TV `ep1`/`ep2`...)
4. 播放接口 `xhr_playinfo/<id>` 或 `xhr_playinfo/<id>-<slug>` 返回 JSON
5. 取 `pdatas[0].playurl` 即 m3u8 直链

## 文件说明

- `nivod.js` — 规则源码
- `compile.js` — 编译入口
- `clipboard.json` — 订阅源 (规则数组)
- `single.json` — 单条规则
- `token-*.txt` — 各类 v2 口令
- `share.txt` — 旧版分享文本

## 重新编译

```
cd work/sugo/nivod
node compile.js
```

## 注意

- 站内搜索 (`e.kortw.cc/vodsearch/...`) 跨域生成 sign 后回 `nivod.cc/search_x.html` 校验,海阔 fetch 链路被识别为非浏览器,返回"sign error"。规则保持搜索关闭。
- 部分电影只有"预告片"片段(`pdatas` 第一路即预告),完整内容需登录站点;选集列表中 TV 剧每集独立 m3u8 直链可正常播放。
- m3u8 走 `bfikuncdn.com` / `hd.ijycnd.com` / `bfvvs.com` 等多 CDN,海阔 ExoPlayer 直接支持 hls 协议。
