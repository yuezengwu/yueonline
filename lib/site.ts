/**
 * 站点级配置 —— 全站单一数据源。
 *
 * 改文案、加社交链接、换域名,都只动这个文件,不用碰任何组件。
 * 红线提醒:对外一律用「大厂」而非具体公司名;不要透露保密产品的任何信息。
 */

export type NavItem = { href: string; label: string };
export type SocialLink = { label: string; href: string; handle: string };

export const site = {
  /** 站点名称 —— 用于浏览器标题 / OG / metadata(topbar 已改纯导航,不再作左上字标) */
  name: "YUE",
  /** 中文名(首屏名片主名 + 开屏飞入落点) */
  nameZh: "岳增五",
  /** 浏览器标签与首页主标题 */
  title: "YUE",
  /** 一句话副标题(首页大标题下方);TODO(YUE): 内容待补充 */
  tagline: "一句话定位占位（稍后补充）",
  /** SEO 描述,建议 150 字以内;TODO(YUE): 内容待补充 */
  description: "YUE 的个人站点。",
  /** 线上地址。优先读环境变量,便于预览/生产切换;默认即自有域名 */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://yueonline.com",
  /** 语言地区 */
  locale: "zh-CN",

  author: {
    name: "YUE",
    // TODO(YUE): 一句话身份,内容待补充
    bio: "一句话身份占位（稍后补充）",
  },

  /** 顶部导航(居中三栏;main = 首页) */
  nav: [
    { href: "/", label: "main" },
    { href: "/blog", label: "blog" },
    { href: "/about", label: "about" },
  ] as NavItem[],

  /**
   * 社交 / 联系方式。handle 为展示文案,href 为跳转地址。
   * TODO(YUE): 补全小红书主页链接与邮箱后删除此注释。
   */
  social: [
    { label: "X", href: "https://x.com/ZengwuY", handle: "@ZengwuY" },
    {
      label: "小红书",
      href: "https://www.xiaohongshu.com/user/profile/REPLACE_ME",
      handle: "YUE | AI",
    },
    { label: "Email", href: "mailto:hi@yueonline.com", handle: "hi@yueonline.com" },
  ] as SocialLink[],
};
