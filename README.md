# yueonline.com

[yueonline.com](https://yueonline.com) 的公开源码：一个以文字为主、克制且无多余 chrome 的个人站、写作站与视觉作品入口。

站点使用 Next.js App Router 构建，首页内容由一个显式的数据文件驱动，文章在构建时从 Markdown 生成。

## 技术栈

- Next.js 16（App Router）
- React 19 + TypeScript
- Tailwind CSS v4
- Markdown：unified / remark / rehype
- pnpm
- Vercel

## 本地运行

需要 Node.js 20.9 或更高版本，以及 pnpm 10。

```bash
git clone https://github.com/yuezengwu/yueonline.git
cd yueonline
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

站点 URL 默认为 `https://yueonline.com`。如需在本地覆盖：

```bash
cp .env.example .env.local
```

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 启动本地开发服务器 |
| `pnpm dev:visuals` | 单独开发视觉作品 |
| `pnpm lint` | 运行 ESLint |
| `pnpm typecheck` | 运行 TypeScript 类型检查 |
| `pnpm typecheck:visuals` | 检查视觉作品源码 |
| `pnpm build` | 创建生产构建 |
| `pnpm build:visuals` | 重新生成视觉作品发布资源 |
| `pnpm test:visuals` | 运行视觉作品回归测试 |
| `pnpm check` | 依次运行 lint、类型检查和生产构建 |

## 内容结构

```text
app/                  页面、metadata、图标与全局样式
artworks/             视觉作品源码、测试与当前基准图
components/           可复用组件
content/blog/         Markdown 文章，文件名即 URL slug
lib/site.ts           站点运行时数据
lib/blog.ts           服务端 Markdown 内容层
public/visuals/        自动生成的视觉作品发布构建（不手改）
CONTENT.md            首页文案编辑源
DESIGN.md             视觉与交互规则
PRODUCT.md            产品原则
```

- 修改首页：先编辑 `CONTENT.md`，再同步到 `lib/site.ts`。
- 发布文章：在 `content/blog/` 新建 Markdown；frontmatter 支持 `title`、`date`、`summary` 和 `draft`。
- 主页 Writing：自动展示日期最近的 3 篇非草稿文章，不需要维护单独列表。
- 主页 Visuals：由 `lib/site.ts` 维护；源码位于 `artworks/`，`pnpm dev` 与 `pnpm build` 会自动生成 `public/visuals/`，不要直接编辑发布产物。
- 修改样式或组件：先读 `DESIGN.md`。

## 部署

Vercel 项目不连接 Git，发布统一使用手动部署。`vercel.json` 将函数区域固定为香港 `hkg1`。

内容更新必须先通过检查、commit 并 push 到 GitHub，确认远端成功后才能执行生产部署：

```bash
pnpm check
git push origin main
vercel deploy --prod --yes --regions hkg1
```

生产环境可选配置：

```text
NEXT_PUBLIC_SITE_URL=https://yueonline.com
```

## 贡献

欢迎针对代码质量、可访问性、性能和文档提出 issue 或 pull request。个人经历、站点文案与品牌方向由站点作者决定，相关修改通常不作为外部贡献接受。

## 许可证

源代码采用 [MIT License](LICENSE)。

以下个人内容与品牌资产不包含在 MIT 授权中，除非对应文件另有说明：

- `CONTENT.md` 与 `content/blog/` 中的文字作品
- `public/avatar.jpg`
- `app/icon.svg`、`app/favicon.ico`、`app/apple-icon.png`
- 姓名、个人简介、社交账号以及其他个人品牌元素

这些内容保留全部权利；你可以 fork 本项目学习或改造成自己的站点，但请替换为自己的内容与品牌资产。
