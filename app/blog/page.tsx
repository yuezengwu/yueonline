import type { Metadata } from "next";
import Link from "next/link";
import { getAllPostsMeta } from "@/lib/blog";

export const metadata: Metadata = {
  title: "blog",
  description: "YUE 的写作。",
};

export default function BlogIndex() {
  const posts = getAllPostsMeta();

  return (
    <div className="wrap">
      <div className="page">
        <div className="crumb" aria-hidden="true">
          <span>~</span>
          <span>/</span>
          <span>yue</span>
          <span>/</span>
          <span style={{ color: "var(--hi-dim)" }}>blog</span>
        </div>
        <h1 className="ptitle">写作</h1>
        <hr className="prule" />

        {posts.length === 0 ? (
          <p style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--ink-4)" }}>
            还没有文章。在 content/blog/ 里添加 .md 文件即可。
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
    </div>
  );
}
