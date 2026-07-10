---
title: "你好,世界"
date: "2026-06-20"
summary: "这是一篇示例文章 —— 删掉它,换成你自己的第一篇。"
tags: ["随笔"]
draft: false
---

这是正文。用标准 Markdown 写作即可,文件名(`hello-world`)就是这篇文章的网址。

## 支持的写法

**加粗**、*斜体*、[链接](https://yueonline.com)、列表:

- 第一点
- 第二点

> 引用块长这样。

代码高亮在构建期完成,客户端不加载任何 JS:

```ts
function greet(name: string) {
  return `Hello, ${name}`;
}
```

## 怎么发新文章

在 `content/blog/` 里新建一个 `.md` 文件,补好顶部的 frontmatter
(`title` / `date` / `summary` / `tags` / `draft`)就行。把 `draft` 设为 `true`
的文章只在本地可见,不会发布到线上。
