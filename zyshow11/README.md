# 11点热炒店 (zyshow.co) 海阔视界规则

台湾 TVBS 综艺节目「11点热炒店」 — 单节目滚动归档,网站只保留最近 30 期。

## 单口令导入(推荐)

复制 `token-quick.txt` 全文,海阔 → 我的 → 长按"我的小程序"标题 → 添加小程序 → 粘贴板。

或:
- `token-home.txt` — 首页频道
- `token-video.txt` — 视频规则

## 工作原理

1. 列表页 `https://www.zyshow.co/11dianrechaodian/` — table 行,每行一集
2. 集 URL `https://www.zyshow.co/11dianrechaodian/v/YYYYMMDD.html` — 含 `<a href="https://www.zyshow.co/url=BASE64">` 跳播放
3. `https://www.zyshow.co/url=BASE64` → 302 → `https://sc.zyshow.net/ck1/ck.php?url=<m3u8>`
4. sc.zyshow.net 返回的 player HTML 含 `var urls = "<m3u8>"`,海阔提到这串 m3u8

## 文件说明

- `zyshow11.js` — 规则源码
- `compile.js` — 编译入口
- `clipboard.json` — 订阅源(规则数组)
- `single.json` — 单条规则
- `token-*.txt` — 各类 v2 口令
- `share.txt` — 旧版分享文本

## 重新编译

```
cd work/sugo/zyshow11
node compile.js
```

## 注意

- m3u8 走 `vod.feifei-video.com`,带 `Referer: https://sc.zyshow.net/`,海阔 ExoPlayer 可直接播放 hls。
- 站点用 Cloudflare,新加坡 IP 段会 403,部分代理可能走不通,海阔本地直连应没问题。
- 仅最近 30 期,无翻页。
