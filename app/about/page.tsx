import type { Metadata } from "next";
import { IconBrandX, IconBook, IconMail, type Icon } from "@tabler/icons-react";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "about",
  description: site.author.bio,
};

const ICONS: Record<string, Icon> = {
  X: IconBrandX,
  小红书: IconBook,
  Email: IconMail,
};

export default function AboutPage() {
  return (
    <div className="wrap">
      <div className="page">
        <div className="crumb" aria-hidden="true">
          <span>~</span>
          <span>/</span>
          <span>yue</span>
          <span>/</span>
          <span style={{ color: "var(--hi-dim)" }}>about.md</span>
        </div>
        <h1 className="ptitle">关于</h1>
        <p className="pmeta">一句话身份占位（稍后补充）</p>
        <hr className="prule" />

        <div className="prose-intro">
          <p>
            关于页正文占位 —— 这一段之后替换成真实自我介绍，目前仅用于展示排版。占位、占位、占位、占位、占位、占位。
          </p>
          <p>
            第二段占位。<strong>加粗强调占位</strong>
            ，演示正文里的重点处理。其余内容稍后补上，占位、占位、占位。
          </p>
          <p>第三段占位文字，稍后替换。</p>
        </div>

        <p className="aside__h" style={{ marginTop: 36 }}>
          contact
        </p>
        <ul className="links" style={{ maxWidth: 360 }}>
          {site.social.map((s) => {
            const I = ICONS[s.label] ?? IconMail;
            return (
              <li key={s.label}>
                <a
                  href={s.href}
                  target={s.href.startsWith("http") ? "_blank" : undefined}
                  rel={s.href.startsWith("http") ? "noopener noreferrer" : undefined}
                >
                  <span className="ic" aria-hidden="true">
                    <I size={15} />
                  </span>
                  <span className="lbl" translate="no">{s.handle}</span>
                  <span className="ar" aria-hidden="true">
                    ↗
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
