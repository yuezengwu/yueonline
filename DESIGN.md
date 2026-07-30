---
status: active
last_reviewed: 2026-07-13
source_of_truth_for: visual-and-interaction-rules
---

# YUE 个人站 · 设计原则(DESIGN.md)

> 改样式 / 加组件前先读这份。`globals.css` 是实现,本文件是依据;冲突以本文件为准。
> 首页固定文案以 `CONTENT.md` 为准（YUE 随时改）；落地到 `lib/site.ts` 后页面才会更新。Writing 条目例外：直接读取最近 3 篇已发布文章的 frontmatter。
> **视觉参考: [paco.me](https://paco.me)**(2026-07-13 实测度量落地)。

## 〇、总原则

**文档感、极简、无 chrome。** 身份靠排版与留白,不靠顶栏、图标列表、巨型标题或 IDE cosplay。
早期炫技实验不属于当前公开实现，不要重新引入。

## 一、配色(对齐 paco token)

| Token | 值 | 用途 |
|---|---|---|
| `--bg` | `#1a1a1a` | 页面底 |
| `--fg` | `#f2f2f2` | 最亮(em / 强调) |
| `--text` | `#e5e5e5` | 正文、名字、链接字色 |
| `--dim` | `#a0a0a0` | 小节标题、说明文 |
| `--muted` | `#707070` | 外链箭头等次要图标 |
| `--underline` | `#505050` | 链接默认下划线 |

禁止彩色强调色。`theme-color` = `#1a1a1a`。

## 一点五、Logo(三分区倒三角 mark)

本节是公开仓库中的定稿约束；品牌源文件保留在作者的私有品牌工作区。

- **形态**:倒等边三角，自交点三分区，透明缝隙；网站运行资产试用方形 `#1a1a1a` 底版，以改善标签页小尺寸辨识度。该试验不反向修改私有品牌母版。
- **页内**:不放 logo;身份仍靠姓名排版。
- **运行资产**(`app/`):
  - `icon.svg` ← 方形深底浅标(≥32px)
  - `favicon.ico` ← 含 16px 光学校正的方形底版本等尺寸
  - `apple-icon.png` ← 180×180
- **变体**:深色 UI 用 `mark-white.svg`;浅色 UI 用 `mark-dark.svg`。
- **禁止**:页内 chrome logo、彩色版、闭合缝隙、以 PNG 反推几何。

## 二、字体(对齐 paco 分工)

| 字体 | 用途 | 加载 |
|---|---|---|
| **Inter** | 名字、正文、区块标题、链接 | next/font |
| **Newsreader** italic | 开场首句 `<em>`(仅拉丁) | next/font |
| 系统中文栈 | CJK 正文 fallback(`PingFang SC` 等) | 系统 |

- 首页 **H1 名字 = 18px / weight 500**(`.heading.name`);非巨标题,无额外字距。
- Building / Writing 列标题:**14px / weight 400 / `--dim`**。
- Now / Connect 标题:**16px / 500 / `--text`**。
- **禁止** Noto Serif SC 900 巨标题、IBM Plex Mono 主导航气质。

## 三、版式(对齐 paco 结构)

```
[居中主栏 640px, 上下 padding ≈ 128px]

名字 (h1)
intro 段落(首句可 em)
——
Building | Writing     ← 两栏均分原三栏总宽(~640px),列距 32px;可空
——
Now                    ← 全宽;每段「斜体引导 + 正文」同行(对齐 paco),字色均为 `--text`
Connect                ← 单行:图标 · Email · Location(无动词、无冒号)
```

- **无全局 sticky 顶栏。** 子页用一行文字返回链即可。
- 主栏在大屏水平居中;小屏 Building/Writing 改为纵向堆叠。
- 列表项模式(有条目时):亮色标题(+ 外链 ↗) + 下方 dim 一行说明。空列表只保留列标题。

## 四、链接与动效

- **顶栏半透明遮罩(对齐 paco `.blur`,类名用 `.top-fade` 避免撞 Tailwind `.blur`)**:`position: sticky; top: 0`;高 `min(96px, --page-top)`;`backdrop-filter: blur(5px)` + `opacity: 0.95`;`mask-image` 自上而下 25% 实→透明;`::after` 叠 `linear-gradient(--bg → transparent)`;`margin-bottom: -height` 不占流。`pointer-events: none`。
- 行内链接:字色 `--text`,下划线 `--underline`(`#505050`);hover 下划线改为 `--dim`(`#a0a0a0`),**不是**最亮白。`text-underline-offset: 2.5px`;过渡约 240ms。
- 选区:`background: #ffffff14`,文字保持浅色(不对调黑白)。
- `overflow-y: scroll` 常驻滚动条; `scroll-padding-top: 96px` 配合顶遮罩。
- 条目(有内容时) `min-height: 84px`;外链旁 ↗ 用 `--muted`。
- 邮箱链接可用 `.email` + `::before`/`data-email` 显示(对齐 paco 反爬)。
- **入场动画(对齐 paco.me,唯一允许的页面动效)**:`[data-animate]` + `@keyframes enter`(opacity 0→1, `translateY(10px)`→0),时长 0.6s ease,`animation-fill-mode: both`;延迟 `calc(var(--stagger) * 0.12s)`。仅在 `prefers-reduced-motion: no-preference` 下启用。
- 其它动效默认拒绝;只动 `transform` / `opacity`。

## 五、合规基线

- skip link、`:focus-visible`、真实 `<a>`/`<Link>`、`overflow-wrap`、safe-area 内边距。
- 对外只说“离开大厂”或“前大厂工程师”，不写原公司名。
- `first-tree.ai` 可写（YUE 2026-07-13 对个人站的明确例外）；仍不披露产品细节、未公开功能或客户。

## 六、单一数据源

- 固定文案 / 社交 / 地址:先改 `CONTENT.md`，再同步 `lib/site.ts`
- 首页 Writing:从 `content/blog/*.md` 自动读取最近 3 篇 `draft: false` 的文章，不在主页配置中重复维护
- 文章:`content/blog/*.md` + `lib/blog.ts`(仅服务端)

## 七、改动前自检

1. 是否仍像「文档」而不是产品落地页/IDE?
2. 名字是否为 18px / 500(无额外字距),分区标题是否仍为 16px?
3. Connect 是否为单行「图标 · Email · Location」?
4. `pnpm build` + `npx tsc --noEmit` 双绿?
