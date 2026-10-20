import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllSlugs, getPost } from "@/lib/blog";
import "katex/dist/katex.min.css";

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};
  const image = post.html.match(/<img\s[^>]*src="([^"]+)"/)?.[1];
  return {
    title: post.title,
    description: post.summary,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.summary,
      url: `/blog/${slug}`,
      publishedTime: post.date,
      ...(image ? { images: [{ url: image, alt: post.title }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.summary,
      ...(image ? { images: [image] } : {}),
    },
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
        </p>
        <div
          className="prose max-w-none"
          dangerouslySetInnerHTML={{ __html: post.html }}
        />
      </article>
    </div>
  );
}
