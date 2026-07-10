import Image from "next/image";
import Link from "next/link";
import { IconBrandX, IconBook, IconMail, type Icon } from "@tabler/icons-react";
import { site } from "@/lib/site";
import { getAllPostsMeta } from "@/lib/blog";

const ICONS: Record<string, Icon> = {
  X: IconBrandX,
  小红书: IconBook,
  Email: IconMail,
};

export default function Home() {
  const posts = getAllPostsMeta().slice(0, 4);

  return (
    <div className="wrap">
      <div className="shell">
        {/* 左栏:名片 */}
        <aside className="aside" aria-label="个人名片">
          <div className="avatar">
            <Image src="/avatar.jpg" alt="YUE 的头像" width={64} height={64} priority />
          </div>
          <h1 className="aside__name" translate="no">{site.nameZh}</h1>
          <p className="aside__title">{site.author.bio}</p>

          <p className="aside__h">contact</p>
          <ul className="links">
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
        </aside>

        {/* 中栏:介绍 */}
        <section className="main" aria-label="自我介绍">
          <p className="lead">
            主标题占位行一，
            <br />
            主标题占位行二，
            <br />
            <span className="accent">一句话定位（待补充）。</span>
          </p>
          <div className="prose-intro">
            <p>
              正文占位段落 —— 这一块之后替换成真实内容，用来展示正文的字号、行距与字体表现。占位、占位、占位、占位、占位。
            </p>
            <p>
              第二段占位。<strong>加粗强调占位</strong>
              ，演示正文里的重点处理，其余文字稍后补上。占位、占位、占位。
            </p>
            <p>第三段占位文字，稍后替换。</p>
          </div>

          {/* 最新写作:真实文章数据 */}
          <div className="gitlog">
            <div className="gitlog__head">
              <span>最新写作</span>
              <span className="grow" />
              <Link href="/blog">
                全部 →
              </Link>
            </div>
            {posts.length === 0 ? (
              <p style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--ink-4)", marginTop: 14 }}>
                还没有文章。
              </p>
            ) : (
              <ul className="gitlog__list">
                {posts.map((p) => (
                  <li key={p.slug}>
                    <Link className="gitlog__row" href={`/blog/${p.slug}`}>
                      <time className="gitlog__date" dateTime={p.date}>
                        {p.date}
                      </time>
                      <span className="gitlog__msg">
                        {p.title}
                        {p.summary && <span className="gitlog__sum">{p.summary}</span>}
                      </span>
                      <span className="gitlog__tags">
                        {p.tags.map((t) => (
                          <span key={t} className="t">
                            #{t}{" "}
                          </span>
                        ))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
