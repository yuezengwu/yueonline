import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllSlugs, getPost } from "@/lib/blog";

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

// Next.js 16:params 是 Promise,必须 await。
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
    <div className="wrap">
      <article className="page">
        <div className="crumb">
          <Link href="/blog">← blog</Link>
        </div>
        <h1 className="ptitle">{post.title}</h1>
        <p className="pmeta">
          <time dateTime={post.date}>{post.date}</time>
          {post.tags.length > 0 && " · " + post.tags.map((t) => "#" + t).join(" ")}
        </p>
        <hr className="prule" />
        <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: post.html }} />
      </article>
    </div>
  );
}
