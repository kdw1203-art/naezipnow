import type { Metadata } from "next";
import { AdZone } from "@/app/components/ads/AdZone";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import {
  GLOSSARY_TERMS,
  findGlossaryTerm,
  type GlossaryTerm,
} from "@/lib/seo/glossary-terms";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";

/* ============================================================
   N14 — 용어 개별 페이지 (/glossary/{slug}).

   왜 개별 URL 인가: "전세가율 뜻", "전용면적이란" 같은 정의형 질의는 검색량이
   낮고 종류가 많은 전형적 롱테일이다. 이런 건 한 페이지 안의 앵커(#jeonse-ratio)
   로는 수확되지 않는다 — 검색 결과에서 앵커는 독립 문서로 취급되지 않고,
   AI 인용에서도 "그 페이지의 일부"로 뭉뚱그려진다. URL 단위로 쪼개야 각 정의가
   제목·설명·구조화 데이터를 자기 것으로 갖는다.

   전부 빌드 시 생성한다(dynamicParams = false). 용어 목록은 코드 상수라서
   런타임에 늘어날 일이 없고, 정적으로 굳혀 두면 없는 슬러그가 404 로 떨어진다 —
   사이트맵에 없는 URL 이 200 으로 응답하는 상황(얇은 페이지 양산)을 원천 차단한다.
   ============================================================ */

export const dynamicParams = false;

export function generateStaticParams(): Array<{ term: string }> {
  return GLOSSARY_TERMS.map((t) => ({ term: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ term: string }>;
}): Promise<Metadata> {
  const { term: slug } = await params;
  const t = findGlossaryTerm(slug);
  if (!t) {
    return { title: "부동산 용어사전 | 내집나우", robots: { index: false, follow: false } };
  }
  const title = `${t.term} 뜻 — 부동산 용어사전 | 내집나우`;
  const path = `/glossary/${t.slug}`;
  return {
    title,
    description: t.short,
    alternates: seoAlternates(path),
    openGraph: {
      title,
      description: t.short,
      url: `https://naezipnow.com${path}`,
      type: "article",
      siteName: "내집나우",
      locale: "ko_KR",
      images: [{ url: "/og-image", width: 1200, height: 630, alt: t.term }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: t.short,
      images: ["/og-image"],
    },
  };
}

/** DefinedTerm — 허브의 DefinedTermSet 에 소속시켜 둘을 한 묶음으로 인식시킨다. */
function definedTermJsonLd(t: GlossaryTerm) {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    "@id": `https://naezipnow.com/glossary/${t.slug}`,
    name: t.term,
    description: t.def,
    termCode: t.slug,
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      "@id": "https://naezipnow.com/glossary",
      name: "내집나우 부동산 용어사전",
    },
    inLanguage: "ko-KR",
    url: `https://naezipnow.com/glossary/${t.slug}`,
  };
}

export default async function GlossaryTermPage({
  params,
}: {
  params: Promise<{ term: string }>;
}) {
  const { term: slug } = await params;
  const t = findGlossaryTerm(slug);
  if (!t) notFound();

  const related = (t.related ?? [])
    .map((s) => findGlossaryTerm(s))
    .filter((x): x is GlossaryTerm => x !== null);

  // 같은 분류의 다른 용어 — 관련 용어와 겹치지 않게, 최대 6개.
  const excluded = new Set([t.slug, ...related.map((r) => r.slug)]);
  const siblings = GLOSSARY_TERMS.filter(
    (x) => x.category === t.category && !excluded.has(x.slug),
  ).slice(0, 6);

  return (
    <PageShell breadcrumb={`부동산 용어사전 · ${t.category}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(definedTermJsonLd(t)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbJsonLd([
              { name: "홈", url: "https://naezipnow.com/" },
              { name: "부동산 용어사전", url: "https://naezipnow.com/glossary" },
              { name: t.term, url: `https://naezipnow.com/glossary/${t.slug}` },
            ]),
          ),
        }}
      />

      {/* [1015 · 규칙 F·G] 데스크톱 2단 — 본문 + 340px 레일(관련 화면 · 광고 1). 폰은 한 열, 광고는 글 끝 1. */}
      <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-4 max-md:gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
      <div className="min-w-0 lg:max-w-[720px]">
        <nav className="rise-in t-sub text-text-3">
          <Link href="/glossary" className="font-bold text-primary">
            부동산 용어사전
          </Link>
          <span className="mx-1">›</span>
          <span>{t.category}</span>
        </nav>

        <h1 className="rise-in mt-2 t-title leading-[1.3] text-ink">
          {t.term}
        </h1>

        {/* 발췌 대비 — 첫 문단만 떼어 가도 무엇에 대한 설명인지 문단 안에서 완결된다. */}
        <article className="rise-in-1 mt-4 card rounded-3xl p-6 max-md:mt-3 max-md:p-4">
          <p className="text-[15px] leading-[1.85] text-text-1">{t.def}</p>
          {t.extra && (
            <p className="mt-3 t-body leading-[1.8] text-text-2">{t.extra}</p>
          )}
          {t.href && (
            <Link
              href={t.href}
              className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 t-body font-bold text-white"
            >
              {t.hrefLabel ?? "내집나우에서 보기"} ›
            </Link>
          )}
        </article>

        {/* [1015 · 규칙 I] 관련 용어 — 카드 묶음 → 리퀴드 행 목록(blue) */}
        {related.length > 0 && (
          <section className="rise-in-2 mt-5 max-md:mt-4">
            <h2 className="mb-2 t-section text-ink">관련 용어</h2>
            <div data-tone="blue" className="lq-panel flex flex-col divide-y">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/glossary/${r.slug}`}
                  className="flex min-h-[44px] items-center justify-between gap-3 py-2 no-underline"
                >
                  <span className="min-w-0">
                    <span className="block t-body font-bold text-ink">{r.term}</span>
                    <span className="mt-0.5 block t-sub leading-[1.5] text-text-2">{r.short}</span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 t-body font-bold text-text-3">›</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {siblings.length > 0 && (
          <section className="rise-in-3 mt-5 max-md:mt-4">
            <h2 className="t-section text-ink">{t.category} 용어</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {siblings.map((s) => (
                <Link
                  key={s.slug}
                  href={`/glossary/${s.slug}`}
                  className="rounded-full border border-line bg-surface px-3 py-1.5 t-sub font-bold text-text-1"
                >
                  {s.term}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* [961] 광고 공간 — 용어 풀이 끝 */}
        <AdZone placement="article_end" seed={2} plan={null} className="mt-6 max-md:mt-4" />
        <p className="mt-6 t-caption leading-[1.7] text-text-3 max-md:mt-4">
          일반적인 이해를 돕는 풀이. 대출 한도·세율·규제 지역 지정 같은 제도 수치는 시점마다 바뀌므로 실제 적용 기준은
          금융기관·관할 관청 확인. 집계 방식은{" "}
          <Link href="/methodology" className="inline-flex min-h-[24px] items-center font-bold text-primary">
            데이터 방법론
          </Link>
        </p>
      </div>

      {/* [1015 · 규칙 F] 데스크톱 레일 — 관련 화면 · 광고 1 */}
      <aside className="hidden flex-col gap-3 lg:sticky lg:top-[76px] lg:flex lg:self-start">
        <nav aria-label="관련 화면" data-tone="hanji" className="lq-panel flex flex-col divide-y">
          <Link href="/glossary" className="flex min-h-[40px] items-center justify-between gap-2 py-2 t-sub font-bold text-ink no-underline">
            용어사전 전체 <span aria-hidden="true" className="text-text-3">›</span>
          </Link>
          <Link href="/guides" className="flex min-h-[40px] items-center justify-between gap-2 py-2 t-sub font-bold text-ink no-underline">
            부동산 실전 가이드 <span aria-hidden="true" className="text-text-3">›</span>
          </Link>
          <Link href="/calculator" className="flex min-h-[40px] items-center justify-between gap-2 py-2 t-sub font-bold text-ink no-underline">
            대출·비용 계산기 <span aria-hidden="true" className="text-text-3">›</span>
          </Link>
        </nav>
        <AdZone placement="sidebar" seed={3} plan={null} />
      </aside>
      </div>
    </PageShell>
  );
}
