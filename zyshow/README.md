# zyshow 海阔视界规则

台湾综艺节目大全 (zyshow.co — 综艺巴士)

涵盖 35 个常见台综:11点热吵店、综艺大热门、小姐不熙娣、天才冲冲冲、饥饿游戏、综艺玩很大、女人我最大、医师好辣 等。

## 单口令导入(推荐)

复制 `token-quick.txt` 全文,海阔 → 我的 → 长按"我的小程序"标题 → 添加小程序 → 粘贴板。

或:
- `token-home.txt` — 首页频道(规则形式)
- `token-video.txt` — 视频规则
- `token-search.txt` — 搜索引擎(站内 POST 搜索可能被 Cloudflare 拦)

## 工作原理

单集页 (`zyshow.co/<cat>/v/YYYYMMDD.html`) 内嵌 packer 段,字典里含 `url|<base64>|target`。
lazy 函数:
1. 正则提 base64
2. fetch `zyshow.co/url=<base64>` 跟 302 跳到 `sc.zyshow.net/ck1/ck.php?url=<m3u8>`
3. 从 ck.php HTML 提取 `var urls = "<m3u8>"` 即真实播放地址
4. 附加 `;{Referer@https://sc.zyshow.net/}` 给海阔播放器

## 文件说明

- `zyshow.js` — 规则源码
- `compile.js` — 编译入口 (输出 clipboard.json / 各类口令)
- `test.js` — 端到端流程测试 (三级跳)
- `clipboard.json` — 订阅源 (规则数组)
- `single.json` — 单条规则
- `token-*.txt` — 各类 v2 口令
- `share.txt` — 旧版分享文本

## 重新编译 + 测试

每次改 `zyshow.js` 后:

```
cd work/sugo/zyshow
node compile.js     # 重新生成 clipboard.json / 口令
node test.js        # 三级流程测试: 7 分类 → 节目网格 → 集数列表
```

`test.js` 用 vm 模拟海阔 JSEngine, 真实 fetch zyshow.co 验证:
1. `class_name`/`class_url` 7 项齐全
2. 每个分类 `find_rule` 解析出节目网格 (各 15 个)
3. 抽样 3 个节目, `detail_find_rule` 解析出集数列表

任一级失败时返回非 0 退出码, 阻止推送坏规则。改完先跑 `test.js`, 通过再发订阅。

## 注意

- 站点采用 Cloudflare 防护,搜索接口 (POST `search.asp`) 在某些环境会被拦截
- m3u8 真实直链来自 `baofeng10.com` CDN,可能仅对中国大陆 IP 开放
- 若播放失败,可手动用 webview 打开单集页观看
