import Link from "next/link";
import type { Guide } from "@/lib/guides/catalog";
import { guideRelatedLinks } from "@/lib/guides/related-links";

/* [1081 · #16] 가이드 글 끝 "관련 용어 · 도구 · 지역" — 서버 렌더(크롤 경로). 목록은 lib/guides/related-links 한 곳. */
export function GuideRelatedLinks({ category }: { category: Guide["category"] }) {
  const { terms, tools, regions } = guideRelatedLinks(category);
  const row = (title: string, items: Array<{ label: string; href: string }>) =>
    items.length === 0 ? null : (
      <div className="flex flex-col gap-1">
        <p className="m-0 t-caption text-text-3">{title}</p>
        <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0">
          {items.map((it) => (
            <li key={it.href}>
              <Link href={it.href} className="tap-line t-sub font-bold text-primary no-underline">
                {it.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <section aria-labelledby="guide-related-links" className="card mt-8 flex flex-col gap-3 rounded-2xl p-4 max-md:mt-5">
      <h2 id="guide-related-links" className="t-section text-ink">
        관련
      </h2>
      {row("용어", terms)}
      {row("도구", tools)}
      {row("지역", regions)}
    </section>
  );
}
