# 1000 Followers

纪念人生第一次一千粉丝的无限头像合影。独立全屏作品，首页入口由 `CONTENT.md` 与 `lib/site.ts` 维护。

- 状态：2026-09-13 已获 YUE 授权并正式发布，首页 Visuals 已加入入口：[1000 Followers](https://yueonline.com/visuals/first-thousand)。
- 发布核验：Vercel 生产部署 `dpl_9SeCdZfndrvgRuywRwU3ph2F9jrF` 已就绪并绑定 `yueonline.com`，应用提交 `f4a179d2b49d8cf2b77b257fefc20edbbc7268fa`。线上 JS、CSS、头像、图集、名单均返回 200，内容哈希与本地验收构建一致；首页入口、搜索定位、真实简介与当前头像已实测。Vercel Git 集成保持断开。
- 本地预览：开发模式 `http://127.0.0.1:4174/`；整站生产模式 `http://127.0.0.1:4175/visuals/first-thousand`；站内作品路径：`/visuals/first-thousand`。
- 核心：YUE 当前头像、「1000 Followers」标题、柔和侧光与边缘高光。文案按 YUE 原话：「为了感谢我人生中的前1000粉丝，我要让你们在互联网上留下存档！」桌面横向排版，手机竖向排版。
- 中心头像：2026-09-13 同步 [X 当前头像](https://pbs.twimg.com/profile_images/2098700520139653120/CIZqqZD2_400x400.jpg)，本地保存为 `public/yue.jpg`。保留 X 调整后的 400 × 400 构图，未重新裁切或生成。
- 交互：圆形头像采用六角密排，支持任意方向拖动和滚动；双指或 Control + 滚轮缩放。按 YUE 最新要求，单击选中后在头像旁显示简介气泡，双击直接打开对应 X 主页。方向键移动，`+` / `-` 缩放，`0` 查看全景，Enter 打开选中账号，Escape 回到中心。
- 搜索：右上角支持 X 用户名、`@用户名` 和昵称，忽略大小写，精确匹配优先。点击结果或用方向键、Enter 选择后，自动定位并高亮本人，同时打开简介气泡。无结果时提示尝试完整用户名；搜索内的 Escape 只关闭结果，不移动照片墙。
- 简介：995 位均已核对，839 位有公开简介、156 位未填写。公开简介来自 X 粉丝列表，未匹配的 2 位另以公开主页核对；未填写时明确提示，不生成介绍。内容作为纯文本展示，气泡跟随选中头像，手机自动放到头像下方或上方。简介与头像使用本地快照，采集时间见 `people.json` 的 `biographiesCapturedAt`。
- 全景：桌面 40 × 26、手机 20 × 52 的排布，各留 40 格给纪念区，可容纳 1,000 人；「看见所有人」一次展示所有有效头像。失效空位跳过，不重复账号补齐。
- 素材：按 YUE 授权，从当前 X 粉丝列表采集；这是当前名单快照，**不是历史最早关注的 1,000 人**。本轮移除原名单的 36 个 X 通用默认头像，补入同一粉丝列表的 31 个可用账号，保留 **995 张有效头像**。
- 重试：再次检查 X 默认图源，确认仍是通用默认图，故移除；`search_ai` 的当前头像源重新尝试两次仍返回 404，已排除。不会用默认头像填补失败项。采集及重试记录在 `/tmp/yue-1000-followers-assets-20260912/clean/`。
- 图像：优先使用同一原图的较高分辨率版本，生成本地 4096 × 4096 WebP 图集。运行时只加载本站图集，不请求 X、图片代理或账号接口。图集加载失败自动重试一次，再失败显示重试入口。
- 核验：桌面浏览器与手机尺寸预览、单击选中、双击实际打开对应 X 主页、长距离横纵滚动已检查；7 种屏幕尺寸验证全部账号唯一映射、全景安全边界及曲面坐标。搜索核对中文、大小写、键盘选择、无结果、空简介和手机定位；小屏长简介可滚动且不遮住所选头像。图集两次失败后显示错误、手动重试恢复已实测。最终 `pnpm check` 和 `git diff --check` 通过；未做 iOS / Android 真机触控验收。
- 验收修复：隔离分支同步到主页 `93be514`，保留最新 OpenTag 与两篇文章；中心头像改用构建基础路径，避免正式路径加载失败；手机全景增加底部留白，统一 600px 切换边界，修复窄屏按钮换行与气泡遮挡。
- 动效：拖动惯性按时间计算，停住再松手不会继续甩动；静止时停止绘制，后台暂停；尊重 reduced-motion。

## 开源参考与改编

采用 [ol-ivier / WebGL Concave Gallery](https://codepen.io/ol-ivier/pen/emdjmBQ) 的曲面网格与惯性拖动方向。CodePen 的[公开 Pen 采用 MIT 授权](https://blog.codepen.io/documentation/licensing/)。实现改成本站已使用的 Three.js，单一图集、实例化网格，保留清晰的人脸并加入触摸、键盘、错误恢复与个人主页链接。保留授权于 `public/THIRD_PARTY_LICENSES.txt`。

对比过的候选：

| 项目 | 适用点 | 本次取舍 |
| --- | --- | --- |
| [Infinite Canvas](https://github.com/edoardolunardi/infinite-canvas) · [演示](https://tympanus.net/Tutorials/InfiniteCanvas/) | MIT；React Three Fiber；空间漫游、分块渲染、渐进纹理加载 | 适合疏朗展厅，随机叠层需要调整才能清楚看每个头像。本次只作参考。 |
| [Infinite Layers Grid](https://github.com/JorgeCapillo/infinite-layers-grid) · [演示](https://tympanus.net/Tutorials/InfiniteLayersGrid/) | MIT；层次丰富的循环图片网格 | 适合空间视觉实验，本次优先头像的可辨识性。 |
| [Infinite WebGL Images](https://github.com/bizarro/infinite-webl-gallery) | MIT；OGL + GLSL 的无限自动滚动画廊 | 仓库最后更新较早，README 演示链接为占位地址，本次不作为主实现。 |
| [Twitter interaction circles](https://github.com/duiker101/twitter-interaction-circles) | MIT；将互动用户头像合成图 | 输出方向与无限照片墙不同，且互动名单不是粉丝名单。 |

上述源码许可不涵盖 X 用户头像的独立权利；本目录头像素材不属于本站 MIT 源码授权。来源说明仅记录公开账号，不给头像人物添加身份判断或圈层标签。

## 开发

`pnpm dev:first-thousand` 启动该作品。`pnpm check` 会检查网站、两个视觉作品并构建。构建会核对真实账号数量、唯一性、全景容量和缺失位置，禁止用重复账号补数。

`tools/prepare-portraits.py` 从本地已核对的 `manifest.json`、`downloads.json` 和头像生成素材；依赖 Pillow。准备时明确排除 X 通用默认图，只输出可解码的真实头像。
