import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/visuals/first-thousand",
        destination: "/visuals/first-thousand/index.html",
      },
      {
        source: "/visuals/gargantua",
        destination: "/visuals/gargantua/index.html",
      },
    ];
  },
  // 基础安全响应头(在 Vercel/SSR 下生效)
  async headers() {
    return [
      {
        source: "/visuals/first-thousand/assets/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      // The manifest and non-hashed source assets must be revalidated. These
      // follow the immutable rule so Next applies the more specific policy.
      {
        source: "/visuals/first-thousand/assets/people.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
      {
        source: "/visuals/first-thousand/assets/yue.jpg",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
      {
        source: "/visuals/first-thousand/assets/THIRD_PARTY_LICENSES.txt",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
      {
        source: "/visuals/gargantua/assets/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
