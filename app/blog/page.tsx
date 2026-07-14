import type { Metadata } from "next";
import Link from "next/link";
import { getAllPostsMeta } from "@/lib/blog";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "writing",
  description: "YUE 的写作。",
};

export default function BlogIndex() {
  const posts = getAllPostsMeta();

  return (
    <div className="shell">
      <Link className="back" href="/">
        ← {site.nameZh}
      </Link>
      <h1 className="page-title" translate="no">
        Writing
      </h1>

      {posts.length === 0 ? (
        <p className="col__placeholder">还没有文章。</p>
      ) : (
        <ul className="post-list">
          {posts.map((p) => (
            <li key={p.slug}>
              <Link href={`/blog/${p.slug}`}>{p.title}</Link>
              {p.summary ? <span className="sum">{p.summary}</span> : null}
              <div>
                <time dateTime={p.date}>{p.date}</time>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
