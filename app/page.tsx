import type { ComponentType, CSSProperties } from "react";
import { IconGitHub, IconX, IconXiaohongshu } from "@/components/social-icons";
import { getPublishedPostsMeta } from "@/lib/blog";
import { site, type Entry } from "@/lib/site";

function stagger(n: number): CSSProperties {
  return { ["--stagger" as string]: n };
}

type IconComp = ComponentType<{ size?: number }>;
const SOCIAL_ICONS: Record<string, IconComp> = {
  X: IconX,
  小红书: IconXiaohongshu,
  GitHub: IconGitHub,
};

function EntryList({ items }: { items: Entry[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      {items.map((item) => {
        const title = item.href ? (
          <div className="entry__head">
            <a
              className="entry__title"
              href={item.href}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noopener noreferrer" : undefined}
              translate="no"
            >
              {item.title}
            </a>
            {item.external ? (
              <span className="ext" aria-hidden="true">
                ↗
              </span>
            ) : null}
          </div>
        ) : (
          <span className="entry__title" translate="no">
            {item.title}
          </span>
        );
        return (
          <div className="entry" key={item.title}>
            {title}
            {item.summary ? <p className="entry__summary">{item.summary}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export default function Home() {
  const { intro } = site;
  const email = site.social.find((s) => s.label === "Email");
  const writing = getPublishedPostsMeta(2).map(
    (post): Entry => ({
      title: post.title,
      summary: post.summary,
      href: `/blog/${post.slug}`,
      external: false,
    }),
  );

  return (
    <div className="shell">
      <article>
        <h1 className="heading name" data-animate translate="no">
          {site.nameZh}
        </h1>

        <div className="prose-block">
          <p data-animate style={stagger(1)}>
            <em className="lead" translate="no">
              {intro.lead}
            </em>
            <span>
              {intro.rest.split("first-tree.ai").map((part, i, arr) =>
                i < arr.length - 1 ? (
                  <span key={i}>
                    <span translate="no">{part}</span>
                    <a
                      className="inline-link"
                      href="https://first-tree.ai"
                      target="_blank"
                      rel="noopener noreferrer"
                      translate="no"
                    >
                      first-tree.ai
                    </a>
                  </span>
                ) : (
                  <span key={i}>{part}</span>
                ),
              )}
            </span>
          </p>
        </div>

        <div
          className="cols"
          role="presentation"
          data-animate
          style={stagger(2)}
        >
          <section className="col" aria-labelledby="building-h">
            <h2 id="building-h" className="col__title" translate="no">
              Building
            </h2>
            <EntryList items={site.building} />
          </section>
          <section className="col" aria-labelledby="visuals-h">
            <h2 id="visuals-h" className="col__title" translate="no">
              Visuals
            </h2>
            <EntryList items={site.visuals} />
          </section>
          <section className="col" aria-labelledby="writing-h">
            <h2 id="writing-h" className="col__title" translate="no">
              Writing
            </h2>
            {writing.length > 0 ? (
              <EntryList items={writing} />
            ) : (
              <p className="col__placeholder">{site.writingPlaceholder}</p>
            )}
          </section>
        </div>

        <section
          className="section"
          aria-labelledby="now-h"
          data-animate
          style={stagger(3)}
        >
          <h2 id="now-h" className="heading" translate="no">
            Now
          </h2>
          <div className="prose-block">
            {site.now.map((item) => (
              <p key={item.title}>
                <em className="lead" translate="no">
                  {item.title}
                </em>{" "}
                {item.body}
              </p>
            ))}
          </div>
        </section>

        <section
          className="section"
          aria-labelledby="connect-h"
          data-animate
          style={stagger(4)}
        >
          <h2 id="connect-h" className="heading" translate="no">
            Connect
          </h2>
          <div className="connect">
            <span className="connect__icons">
              {site.social
                .filter((s) => SOCIAL_ICONS[s.label])
                .map((s) => {
                  const Icon = SOCIAL_ICONS[s.label];
                  return (
                    <a
                      key={s.label}
                      className={
                        s.label === "小红书"
                          ? "connect__icon connect__icon--wordmark"
                          : "connect__icon"
                      }
                      href={s.href}
                      aria-label={s.label}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Icon />
                    </a>
                );
              })}
            </span>
            {email ? (
              <>
                <span className="connect__sep" aria-hidden="true">
                  ·
                </span>
                <a
                  className="inline-link email"
                  href={email.href}
                  data-email={email.handle}
                  aria-label={email.handle}
                  translate="no"
                />
              </>
            ) : null}
            <span className="connect__sep" aria-hidden="true">
              ·
            </span>
            <span>{site.location}</span>
          </div>
        </section>
      </article>
    </div>
  );
}
