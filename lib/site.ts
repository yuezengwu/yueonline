/**
 * 站点级配置 —— 运行时数据源。
 *
 * 主页文案请先改 CONTENT.md，再同步到本文件。
 * 红线:原公司只说「大厂」。个人站例外(YUE 2026-07-13):可写 first-tree.ai 所属关系;
 * 仍不披露产品细节 / 未公开功能 / 客户。其它渠道不自动适用。
 */

export type SocialLink = { label: string; href: string; handle: string };
export type NowItem = { title: string; body: string };
export type Entry = {
  title: string;
  summary?: string;
  href?: string;
  external?: boolean;
};

export const site = {
  name: "YUE",
  nameZh: "岳增五",
  title: "YUE",
  description:
    "岳增五（YUE）——AI builder, engineer at first-tree.ai。解决 agents 在生产环境与应用场景中的工程问题，关注 AI 在真实生活中的能力边界。",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://yueonline.com",
  locale: "zh-CN",

  author: {
    name: "YUE",
    bio: "AI builder, engineer at first-tree.ai.",
  },

  /**
   * 开场单段:lead 用 Newsreader italic;其余普通正文。
   * first-tree.ai 在页面里链出去。
   */
  intro: {
    lead: "AI builder",
    rest: ", engineer at first-tree.ai 解决agents在生产环境和应用场景中的工程问题，关注AI在真实生活中的能力边界。",
  },

  /** 多列列表;文案以 CONTENT.md 为准 */
  building: [
    {
      title: "First-Tree",
      summary: "Run coding agents on shared team context.",
      href: "https://github.com/agent-team-foundation/first-tree",
      external: true,
    },
    {
      title: "dsh-explain",
      summary:
        "Turn DSH work sessions into a private, local-first learning thread.",
      href: "https://github.com/yuezengwu/dsh-explain",
      external: true,
    },
  ] as Entry[],
  visuals: [
    {
      title: "Gargantua",
      summary: "A real-time WebGL study of gravitational lensing.",
      href: "/visuals/gargantua",
      external: false,
    },
  ] as Entry[],
  /** Writing 空列表时的占位文案 */
  writingPlaceholder: "整理中...",

  now: [
    {
      title: "Autonomous agents",
      body: "授权agents接管固定且重复的任务，构建基础设施让agents离真实工作环境更近，减少重复和低效的信息传递，引导人类成员关注那些需要创造和灵感的核心工作。",
    },
    {
      title: "Token efficiency",
      body: "使用更多token来扩展人类能力边界的同时，仅仅机械地增加agents运行时间和扩大并发规模并非总能提高效率。通过harness engineering控制agents行为，从每次非预期的运行过程和产出中吸取教训并优化系统。",
    },
    {
      title: "Keep human taste",
      body: "在高强度依赖AI的工作环境中保持审美。包括但不限于公开文字内容不使用AI生成，全部手写或语音输入；积极参与社交媒体讨论和线下社交活动，同时也欢迎大家找我聊天；定期品鉴学习优秀作品等等。",
    },
  ] as NowItem[],

  location: "北京-海淀区-五道口",

  social: [
    { label: "X", href: "https://x.com/ZengwuY", handle: "@ZengwuY" },
    {
      label: "小红书",
      href: "https://xhslink.com/m/BUKCzQx1r9",
      handle: "YUE | AI",
    },
    {
      label: "GitHub",
      href: "https://github.com/yuezengwu",
      handle: "yuezengwu",
    },
    {
      label: "Email",
      href: "mailto:yzengwu@gmail.com",
      handle: "yzengwu@gmail.com",
    },
  ] as SocialLink[],
};
