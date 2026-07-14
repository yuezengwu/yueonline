import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "about",
  description: site.author.bio,
};

export default function AboutPage() {
  return (
    <div className="shell">
      <Link className="back" href="/">
        ← {site.nameZh}
      </Link>
      <h1 className="page-title">关于</h1>
      <p className="page-meta">{site.author.bio}</p>
      <div className="prose-block">
        <p>关于页正文待补充。首页开场与 Now 已上线，完整故事稍后再写。</p>
      </div>
    </div>
  );
}
