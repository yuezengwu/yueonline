/**
 * 博客内容层。
 *
 * 文章是 content/blog/ 下的 Markdown 文件,文件名即 URL(slug)。
 * frontmatter 字段:title / date / summary / tags / draft。
 * 仅在服务端运行(用到 node:fs);在客户端组件里 import 会构建报错,属预期。
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

export type PostMeta = {
  slug: string;
  title: string;
  /** ISO 日期,如 2026-06-20 */
  date: string;
  summary: string;
  tags: string[];
  draft: boolean;
};

export type Post = PostMeta & { html: string };

function toISODate(value: unknown): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
}

function parseFile(slug: string): { meta: PostMeta; content: string } {
  const raw = fs.readFileSync(path.join(BLOG_DIR, `${slug}.md`), "utf8");
  const { data, content } = matter(raw);
  const meta: PostMeta = {
    slug,
    title: typeof data.title === "string" ? data.title : slug,
    date: toISODate(data.date),
    summary: typeof data.summary === "string" ? data.summary : "",
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    draft: Boolean(data.draft),
  };
  return { meta, content };
}

/** 列出所有文章元信息;生产环境隐藏 draft,按日期倒序。 */
export function getAllPostsMeta(): PostMeta[] {
  if (!fs.existsSync(BLOG_DIR)) return [];
  const includeDrafts = process.env.NODE_ENV !== "production";
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parseFile(f.replace(/\.md$/, "")).meta)
    .filter((m) => includeDrafts || !m.draft)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getAllSlugs(): string[] {
  return getAllPostsMeta().map((m) => m.slug);
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeHighlight)
  .use(rehypeStringify);

/** 读取单篇并把 Markdown 渲染为 HTML;不存在返回 null。 */
export async function getPost(slug: string): Promise<Post | null> {
  try {
    const { meta, content } = parseFile(slug);
    const html = String(await processor.process(content));
    return { ...meta, html };
  } catch {
    return null;
  }
}
