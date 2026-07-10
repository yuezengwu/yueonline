---
status: active
last_reviewed: 2026-07-10
source_of_truth_for: visual-and-interaction-rules
---

# YUE 个人站 · 设计原则(DESIGN.md)

> 改样式 / 加组件前先读这份。`globals.css` 是实现,本文件是依据;冲突以本文件为准。

## 〇、总原则:极简(2026-07-02 定调,参考 paco.me)

**先内容,后炫技。** 页面安静、克制、几乎无动效;身份靠文字与结构承载,不靠视觉表演。
炫技类实现(开屏打字动画、自绘光标等)已整体移出站点,归档在工作空间 [`archive/website/experiments/flourish/`](../../archive/website/experiments/flourish/),后续想做再取回,**不要在此之前重新引入**。

## 一、配色:暗色纯黑白灰,无彩色

- 全部 OKLCH、**chroma = 0**,只靠明度拉层级;**禁止引入任何彩色强调色**。
- 「强调」= 最高对比(白):当前导航项、链接 hover、日期、选区,全部白 / 灰。
- token 见 `globals.css :root`:背景三级(`--bg/--bg-raise/--bg-card`)、描边两级(`--line/--line-soft`)、墨色四级(`--ink`→`--ink-4`)、强调两级(`--hi/--hi-dim`)。
- `--bg` 渲染为 `#101010`,`theme-color` 同值。

## 二、字体:三套分工

| 字体 | 用途 | 加载 |
|---|---|---|
| IBM Plex Mono | UI / 导航 / 标签 / 代码 / 日期 | next/font 自托管 |
| IBM Plex Sans | 正文 | next/font 自托管 |
| Noto Serif SC 900 | 中文标题(`.lead` / `.ptitle` / 文章标题 / `.aside__name`) | Google Fonts CDN(CJK 子集) |

**标题字重硬性 = 900,禁止用 Sans 充当标题。**

## 三、版式

- 首页:`312px 名片左栏 + 流式右栏`,无外框卡;列分隔靠 `.aside` 的 1px 竖线。左栏内容与 `.wrap` 共用 28px 左母线,垂直间距走 4 的倍数。
- 单列页(blog / about / post):760px 居中。
- IDE 元素只用**语义真实**的:面包屑对应真实路由、写作列表是真实的 date · title · #tags、ISO 日期。**禁止伪造 chrome**(假 tab、假行号、假命令串、红绿灯圆点等)。

## 四、动效:默认没有

- 现存动效仅两类:hover / focus 过渡(120–240ms)、topbar 滚动淡入。新增动效默认拒绝。
- 只动 `transform` / `opacity`;禁止 `transition: all`;必须尊重 `prefers-reduced-motion`。

## 五、合规基线(Vercel web-interface-guidelines)

- 无障碍:icon 按钮 `aria-label`、图片 `alt`、装饰元素 `aria-hidden`、`skip` link、`scroll-padding-top: 72px`。
- Focus:全局 `:focus-visible` 轮廓,禁止裸 `outline:none`。
- 导航用真实 `<Link>` / `<a>`(支持 ⌘/中键新开标签);仅纯命令用 `<button>`。
- 排版:标题 `text-wrap: balance`,正文 `text-wrap: pretty`;文本容器 `overflow-wrap: anywhere`,flex 子项 `min-width: 0`。
- 暗色:`color-scheme: dark` + `themeColor: "#101010"`。
- i18n:标识符加 `translate="no"`;日期用 `<time dateTime={iso}>`。
- 触屏:`touch-action: manipulation` + 透明 tap highlight;贴边内边距 `max(28px, env(safe-area-inset-*))`。

## 六、有意取舍(审查时不当违规)

- 日期显原始 ISO `YYYY-MM-DD`,不做本地化展示(已包 `<time>`)。
- 重度 Mono 字体用于 UI —— 风格选择。

## 七、单一数据源

- 文案 / 社交 / 域名:`lib/site.ts`,只改这一个文件。
- 文章:`content/blog/*.md`(frontmatter:`title / date / summary / tags / draft`);`lib/blog.ts` 仅服务端(用到 `node:fs`)。

## 八、改动前自检

1. 是否符合极简总原则?(默认答案是「不加」)
2. 没引入彩色?标题用 Noto Serif SC 900?
3. 新交互元素:键盘可达 + `:focus-visible` + `aria-label`?
4. 新文本容器:溢出兜底?
5. 改完 `pnpm build` 与 `npx tsc --noEmit` 双绿?
