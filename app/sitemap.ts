import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { getAllPostsMeta } from "@/lib/blog";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticRoutes = ["", "/blog", "/about"].map((p) => ({
    url: `${site.url}${p}`,
    lastModified: now,
  }));

  const posts = getAllPostsMeta().map((p) => ({
    url: `${site.url}/blog/${p.slug}`,
    lastModified: p.date ? new Date(p.date) : now,
  }));

  return [...staticRoutes, ...posts];
}
