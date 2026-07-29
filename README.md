# yueonline.com — 个人站

YUE 的个人 landing page + 写作站。首页按 [paco.me](https://paco.me) 文档感落地(见 `DESIGN.md`)。

> **主页文案改 [`CONTENT.md`](CONTENT.md)**；落地实现在 `lib/site.ts`。
> 原则:极简、无顶栏 chrome、16px 级标题、Building/Writing 多列、Connect 单行图标链。

## 技术栈

Next.js 16(App Router)+ TypeScript + Tailwind CSS v4;文章为 Markdown(gray-matter + remark/rehype,构建期高亮);pnpm;部署 Vercel(`vercel.json` 固定香港 `hkg1`),域名 yueonline.com。Node ≥ 20.9。

## 目录结构

```
apps/website/
├── app/
│   ├── layout.tsx          站点外壳(字体、metadata、topbar)
│   ├── page.tsx            首页(paco 结构:名字 → intro → 多列 → Now → Connect)
│   ├── about/page.tsx      关于
│   ├── blog/page.tsx       文章列表
│   ├── blog/[slug]/page.tsx 文章详情
│   ├── sitemap.ts / robots.ts
│   ├── favicon.ico / icon.svg / apple-icon.png
│   └── globals.css         全部样式(token 见 :root)
├── content/blog/           ⭐ 文章 Markdown(文件名 = 网址)
├── lib/
│   ├── site.ts             运行时数据(由 CONTENT.md 同步)
│   └── blog.ts             博客读取(仅服务端)
└── public/                 静态资源(头像、OG 图)
```

## 本地开发

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # 部署前自检
```

## 怎么补内容(给 YUE)

- **主页文案** → [`CONTENT.md`](CONTENT.md)（改完后同步到 `lib/site.ts`）
- 关于页 → `app/about/page.tsx`
- 发文章 → `content/blog/` 新建 `.md`,frontmatter:`title / date / summary / tags / draft`(`draft: true` 只在本地可见)
- favicon / app icon → `app/`；OG 图 → `public/`

> 红线:原公司说「大厂」;个人站可写 first-tree.ai 所属关系(见 voice-and-redlines)。

## 部署

```bash
vercel --prod     # 或推 GitHub 后在 Vercel Import(Root Directory = apps/website)
```

域名:Vercel → Settings → Domains 添加 `yueonline.com`,DNS 按提示配置。站点以 SSG 为主,走全球 CDN;`hkg1` 只影响 SSR 函数位置。

## 待补充清单

- [x] 首页单栏 + intro / Now / Connect(含地址)
- [ ] `app/about/page.tsx`:完整关于正文
- [x] `content/blog/`:第一篇文章已加入并删除示例文章
- [x] `app/`:替换 favicon / app icon
- [ ] `public/`:补 OG 分享图
- [x] Building / Writing:有条目后先写 `CONTENT.md`，再同步 `lib/site.ts`
