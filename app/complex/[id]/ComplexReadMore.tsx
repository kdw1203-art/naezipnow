import Link from "next/link";
import { GUIDE_BY_SLUG } from "@/lib/guides/catalog";
import { findGlossaryTerm } from "@/lib/seo/glossary-terms";

/* [1083 · 콘텐츠] 단지 상세 끝 "읽을거리 · 용어" — 유입의 46% 가 착지하는 단지 23,809쪽에서 가이드·용어(1083 에서 27편·108개)로 가는 길.
   서버 조각(JS 0) · 목록에 **있는 슬러그만**(없으면 그 줄이 빠진다). 같은 네 편·네 용어를 전 단지에 두는 것은 안내 링크라 괜찮다 —
   본문 중복이 아니라 탐색이다. */
const GUIDE_SLUGS = ["real-price-reading", "imjang-checklist", "jeonse-safety", "gyeyakgeum-jangeum"];
const TERM_SLUGS = ["silgeoraega", "pyeongdanga", "jeonse-garyul", "haejegeorae"];

export function ComplexReadMore() {
  const guides = GUIDE_SLUGS.map((s) => GUIDE_BY_SLUG.get(s)).filter((g): g is NonNullable<typeof g> => Boolean(g));
  const terms = TERM_SLUGS.map((s) => findGlossaryTerm(s)).filter((t): t is NonNullable<typeof t> => t !== null);
  if (guides.length === 0 && terms.length === 0) return null;
  return (
    <section aria-labelledby="complex-read-more" className="cv-auto rise-in-5 card mt-6 flex flex-col gap-2 rounded-2xl p-4 max-md:mt-3">
      <h2 id="complex-read-more" className="t-body font-bold text-ink">
        읽을거리 · 용어
      </h2>
      {guides.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {guides.map((g) => (
            <li key={g.slug}>
              <Link href={`/guides/${g.slug}`} className="tap-line t-sub font-bold text-primary no-underline">
                {g.title} ›
              </Link>
            </li>
          ))}
        </ul>
      )}
      {terms.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0">
          {terms.map((t) => (
            <li key={t.slug}>
              <Link href={`/glossary/${t.slug}`} className="tap-line t-sub text-text-2 no-underline">
                {t.term}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
