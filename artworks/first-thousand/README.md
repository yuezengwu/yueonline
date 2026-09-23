# 3000 Followers

作品入口保持 `/visuals/first-thousand`。当前版本（2026-09-23）将空间与原版照片墙整合进网站正式构建；65 项自动测试与本地成品浏览器复验通过。真机触控、低端 GPU 等仍需设备验收。本地验收记录位于任务工作区 `.runtime/release-fixes-validation.md`；部署与线上复验另行记录，不沿用先前版本的通过结论。

## 名单与两种模式

当前累计存档 **3,473 位朋友**：保留旧版 2,027 位账号的资料、顺序及头像来源，新增 1,446 位。照片墙保留旧账号的世界坐标，容量扩为 4,280；作者单独位于中央纪念区。空间运行时追加作者，共 3,474 个节点。

本次 X 可见 Followers 列表读取到 2,480 个唯一账号，主页当时显示 3,345 位粉丝，后续分页因错误未能完成，名单来源明确标为 **partial**。3,473 是历次累积存档数，不是当前粉丝数，也不证明完整名单或最早关注顺序；原始核对信息保留在 `public/assets/people.json` 的 `source` / `provenance` 中。

- 顶部显式切换「空间 / 照片墙」，各自保留镜头，共用 renderer、canvas、名单、搜索、右下个人介绍和唯一选中状态。
- 照片墙保留曲面圆头像、中央纪念区、无限拖动与惯性、滚动、捏合缩放、唯一全景与回中心。搜索才居中定位；点击只选中。支持方向键、+/−、0、Home、Escape、双击与 Enter 打开 X 主页。
- 空间保留移动节点、头像沿连接亮起和漫游；作者自由移动并连接所有朋友。朋友之间的连线是空间近邻演示，**不是已采集的互关关系**。
- 两种模式共用精简合影：朋友左、作者右，浏览器本地生成 1200 × 900 PNG；支持保存、重试，关闭后保留原选择和视角。作者本人不显示双人合影入口。

## 资源与加载

正式资源是独立物理目录 `public/assets/`，不链接实验目录。线上图集使用 64 列、55 行的 16 / 32 / 64px 单元：约 0.47 / 1.50 / 4.54 MiB。首屏先加载 32px，失败可退到 16px；需要细节且设备能力允许时渐进到 64px，节省流量模式不升级。两种视图共用当前纹理，替换后释放旧纹理。

选中头像和合影按需读取对应的 **128 × 128 无损单图**，保持源图集的像素；仅缓存最近 8 张（LRU），失败回退当前已校验图集，不加载全量 128px 大纹理。3,473 个索引对应 3,469 个内容去重文件，单图最大约 31 KiB。在线拼接图采用有损压缩，人物索引保持不变。

名单、图集和单图在构建及运行时校验；图片检查字节数、SHA-256、尺寸，发布检查覆盖所有资源与 Worker。内容哈希文件长缓存；`people.json`、`yue.jpg` 与许可证使用 `must-revalidate`。资源路径使用作品基址，支持无尾斜线公开入口。WebGL 上下文丢失时停绘并提供重载恢复。

## 开发与检查

```sh
pnpm dev:first-thousand             # 单独开发作品
pnpm check                         # lint、类型检查、JS测试、整站生产构建
pnpm test:first-thousand:delivery   # 离线资源管线测试，需要 Python 3 + Pillow
pnpm build:first-thousand           # JS类型检查、资源核验、Vite构建、成品HTTP验证
pnpm verify:first-thousand:release  # 重新核验已有成品
```

源码只有 `src/*.js` 一套实现，启用 ESLint 与 TypeScript `checkJs`。Vite 输出到 `../../public/visuals/first-thousand`，由网站构建和 CI 自动生成，不手改产物。可用 `node artworks/first-thousand/tools/verify-release.mjs --origin http://127.0.0.1:端口` 核验实际 Next 服务；这不替代浏览器交互验收。

`tools/prepare-delivery.py --source <已核验存档目录> --output <独立输出目录>` 从已有无损存档生成交付资源，检查像素、去重、体积预算及来源哈希，最后原子写入名单；拒绝覆盖来源或符号链接输出。历史 `prepare-portraits.py` 属于旧存档生成流程，不是当前发布资源生成入口。部署仍遵循仓库根目录规则：完成检查、提交并推送后，另行手动发布。

## 来源与许可

曲面画廊与惯性方向改编自 [ol-ivier / WebGL Concave Gallery](https://codepen.io/ol-ivier/pen/emdjmBQ)，采用 Three.js 实例化绘制。保留 ol-ivier 与 Three.js 的 MIT 授权于 [THIRD_PARTY_LICENSES.txt](./public/assets/THIRD_PARTY_LICENSES.txt)。账号头像、姓名及个人品牌内容不属于本站源码 MIT 授权，不推断人物身份或圈层。

旧两千人版本的发布记录见 [PR #1](https://github.com/yuezengwu/yueonline/pull/1)，仅作为历史记录。
