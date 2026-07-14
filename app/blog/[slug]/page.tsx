import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllSlugs, getPost } from "@/lib/blog";

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.summary,
    openGraph: { type: "article", title: post.title, description: post.summary },
  };
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) notFound();
  if (post.draft && process.env.NODE_ENV === "production") notFound();

  return (
    <div className="shell">
      <article>
        <Link className="back" href="/blog">
          ← Writing
        </Link>
        <h1 className="page-title">{post.title}</h1>
        <p className="page-meta">
          <time dateTime={post.date}>{post.date}</time>
          {post.tags.length > 0 ? " · " + post.tags.map((t) => "#" + t).join(" ") : ""}
        </p>
        <div
          className="prose max-w-none"
          dangerouslySetInnerHTML={{ __html: post.html }}
        />
      </article>
    </div>
  );
}
