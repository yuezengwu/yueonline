---
status: editable
owner: YUE
sync_to: lib/site.ts
last_reviewed: 2026-07-16
---

# yueonline.com · 首页文案

> **改主页文案改这里。** 改完后同步到 `lib/site.ts` 才会上线页面。  
> 视觉 / 排版见 `DESIGN.md`，不要在本文件写样式。

## 骨架

```
名字
开场 (斜体 lead + 正文)
Building | Writing
Now
Connect  ← 图标 · email · location
```

---

## 名字

```
岳增五
```

## 开场

- **lead**（Newsreader 斜体）:

```
AI builder
```

- **rest**（普通正文；其中 `first-tree.ai` 在页面里做成链接）:

```
, engineer at first-tree.ai 解决agents在生产环境和应用场景中的工程问题，关注AI在真实生活中的能力边界。
```

## Building

```
- title: First-Tree
  summary: Run coding agents on shared team context.
  href: https://github.com/agent-team-foundation/first-tree
  external: true
```

> 说明句与官网首页主标一致；链接指向公开 GitHub 仓库。

## Writing

```
- title: 不要把写作和思考都交给 AI
  summary: 在高强度使用 AI 之后，我开始审视自己的文字作品。
  href: /blog/dont-outsource-writing-and-thinking-to-ai
  external: false
```

## Now

每条 = **斜体 title** + 同行 **body**。

### Autonomous agents

```
授权agents接管固定且重复的任务，构建基础设施让agents离真实工作环境更近，减少重复和低效的信息传递，引导人类成员关注那些需要创造和灵感的核心工作。
```

### Token efficiency

```
使用更多token来扩展人类能力边界的同时，仅仅机械地增加agents运行时间和扩大并发规模并非总能提高效率。通过harness engineering控制agents行为，从每次非预期的运行过程和产出中吸取教训并优化系统。
```

### Keep human taste

```
在高强度依赖AI的工作环境中保持审美。包括但不限于公开文字内容不使用AI生成，全部手写或语音输入；积极参与社交媒体讨论和线下社交活动，同时也欢迎大家找我聊天；定期品鉴学习优秀作品等等。
```

## Connect

页面展示：`图标 · email · location`（无冒号、无动词）。

| 项 | 展示 / handle | 链接 |
| --- | --- | --- |
| X | @ZengwuY | https://x.com/ZengwuY |
| 小红书 | YUE \| AI | https://xhslink.com/m/BUKCzQx1r9 |
| GitHub | yuezengwu | https://github.com/yuezengwu |
| Email | yzengwu@gmail.com | mailto:yzengwu@gmail.com |
| Location | 北京-海淀区-五道口 | — |

---

## 同步说明

1. YUE 在本文件改文案。
2. Agent / 实现时把对应字段写入 `lib/site.ts`（`intro` / `now` / `building` / `writing` / `writingPlaceholder` / `social` / `location` / `nameZh`）。
3. 未同步前，线上与本地预览仍以 `lib/site.ts` 为准。
