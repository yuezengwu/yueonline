"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { site } from "@/lib/site";

export function SiteHeader() {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);

  // 滚动感知:顶部(hero)处通透,下滚后上浮出 bg + blur + 底边。
  // 只在阈值跨越时写 DOM(非每帧),过渡走 .bar::before 的 opacity。
  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    let stuck = false;
    const onScroll = () => {
      const next = window.scrollY > 8;
      if (next !== stuck) {
        stuck = next;
        bar.dataset.stuck = String(next);
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="bar" ref={ref}>
      <div className="bar__in">
        <nav className="nav" aria-label="主导航">
          {site.nav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                translate="no"
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
