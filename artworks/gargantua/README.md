# Gargantua

个人站的实时 WebGL 黑洞视觉作品。页面模拟 Schwarzschild 黑洞的引力透镜、吸积盘与深空背景，默认持续播放，支持鼠标拖拽和滚轮或触控缩放。

## 目录

```text
index.html        独立作品文档
src/              TypeScript、GLSL 与样式源码
tests/            画面、交互、性能与 WebGL 回归
artwork/current/  当前三个定稿机位的基准图
public/           随作品分发的许可证等静态文件
```

站点构建把本目录编译到 `public/visuals/gargantua/`。发布目录是生成物，所有修改都应从这里开始。

个人站地址 `/visuals/gargantua` 会显示与全站一致的 `← 岳增五` 返回链接。它直接复用网站根目录 `styles/back-link.css` 的 `.back` 规则与原始文字标记，并沿用原站实际承载箭头和中文的系统字体回退链。独立开发入口与 `shot=1` 定稿模式隐藏该链接，避免改变作品和截图。

常用命令统一从网站根目录执行：

```bash
pnpm dev:visuals
pnpm build:visuals
pnpm typecheck:visuals
pnpm test:visuals
```
