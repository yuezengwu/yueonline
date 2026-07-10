# yueonline.com — 个人站

YUE 的个人 landing page + 写作站。骨架已搭好,**首页/关于页文案仍是占位符**(见 `lib/site.ts` 的 TODO)。

> 视觉与交互原则见 `DESIGN.md`(总原则:极简);产品定位见 `PRODUCT.md`。

## 技术栈

Next.js 16(App Router)+ TypeScript + Tailwind CSS v4;文章为 Markdown(gray-matter + remark/rehype,构建期高亮);pnpm;部署 Vercel(`vercel.json` 固定香港 `hkg1`),域名 yueonline.com。Node ≥ 20.9。

## 目录结构

```
apps/website/
├── app/
│   ├── layout.tsx          站点外壳(字体、metadata、topbar)
│   ├── page.tsx            首页(名片左栏 + 介绍/最新写作右栏)
│   ├── about/page.tsx      关于
│   ├── blog/page.tsx       文章列表
│   ├── blog/[slug]/page.tsx 文章详情
│   ├── sitemap.ts / robots.ts
│   └── globals.css         全部样式(token 见 :root)
├── components/site-header.tsx  顶栏(纯导航居中)
├── content/blog/           ⭐ 文章 Markdown(文件名 = 网址)
├── lib/
│   ├── site.ts             ⭐ 全站单一数据源(名字/文案/社交/域名)
│   └── blog.ts             博客读取(仅服务端)
└── public/                 静态资源(头像、favicon、OG 图)
```

## 本地开发

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # 部署前自检
```

## 怎么补内容(给 YUE)

- 名字 / 文案 / 社交链接 / 邮箱 → `lib/site.ts`
- 关于页 → `app/about/page.tsx`
- 发文章 → `content/blog/` 新建 `.md`,frontmatter:`title / date / summary / tags / draft`(`draft: true` 只在本地可见)
- favicon / OG 图 → `public/`

> 红线:对外一律「大厂」,不透露具体产品/公司名。

## 部署

```bash
vercel --prod     # 或推 GitHub 后在 Vercel Import(Root Directory = apps/website)
```

域名:Vercel → Settings → Domains 添加 `yueonline.com`,DNS 按提示配置。站点以 SSG 为主,走全球 CDN;`hkg1` 只影响 SSR 函数位置。

## 待补充清单

- [ ] `lib/site.ts`:tagline / bio / 小红书主页链接 / 邮箱
- [ ] `app/about/page.tsx` 与首页 `page.tsx`:替换占位文案
- [ ] `content/blog/`:第一篇文章(删掉 `hello-world.md`)
- [ ] `public/`:替换 favicon、补 OG 分享图
