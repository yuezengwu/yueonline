# Visual artworks

这里保存个人站 Visuals 栏目的可维护源码。每件作品使用一个独立目录，并保持三层边界：

- `artworks/<slug>/`：源码、测试、说明与当前基准图；
- `public/visuals/<slug>/`：由构建命令生成的静态发布产物，不直接编辑；
- `lib/site.ts`：首页条目与公开 URL。

新增作品时沿用同一 slug，并把构建接入根目录 `package.json`。实验过程和废弃方案不放进本目录。
