/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
import type { Metadata } from "next";
import Link from "next/link";
import { SummaryRow } from "@/app/complex/[id]/SummaryRow";
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

      {/* [v4 · 한 화면 한 가지] 분류 한 줄 + 제목 → 정의 본문(카드 테두리 없이) + 채움 파랑 1개 → 관련 용어 구분선 행 →
          같은 분류 칩 한 줄 → 안내 캡션 한 줄. 지운 것: 정의 카드 테두리, 관련 용어 카드(→ 행), 여러 줄 칩(→ 한 줄),
          하우스 광고(AdZone), 회색 안내 상자(세 문장 → 캡션 한 줄). */}
      <div className="mx-auto flex max-w-[760px] flex-col gap-8">
        <header className="flex flex-col gap-0.5">
          <nav aria-label="분류" className="rise-in t-sub text-text-3">
            <Link href="/glossary" className="tap-line font-bold text-text-2 no-underline">
              부동산 용어사전
            </Link>
            <span className="mx-1">›</span>
            <span>{t.category}</span>
          </nav>
          <h1 className="rise-in t-title text-ink">{t.term}</h1>
        </header>

        {/* 발췌 대비 — 첫 문단만 떼어 가도 무엇에 대한 설명인지 문단 안에서 완결된다. */}
        <article className="rise-in-1 flex flex-col gap-3">
          <p className="text-[15px] leading-[1.85] text-text-1">{t.def}</p>
          {t.extra && <p className="t-body leading-[1.8] text-text-2">{t.extra}</p>}
          {t.href && (
            <Link href={t.href} className="btn-primary flex min-h-12 items-center justify-center rounded-lg px-4 t-body no-underline">
              {t.hrefLabel ?? "내집나우에서 보기"}
            </Link>
          )}
        </article>

        {related.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="t-section text-ink">함께 보면 좋은 용어</h2>
            <ul data-tone="hanji" className="card flex flex-col divide-y divide-line rounded-lg px-4">
              {related.map((r) => (
                <SummaryRow key={r.slug} label={r.term} sub={r.short} href={`/glossary/${r.slug}`} />
              ))}
            </ul>
          </section>
        )}

        {siblings.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="t-section text-ink">{t.category} 용어</h2>
            <div className="-mx-3.5 flex gap-2 overflow-x-auto px-3.5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
              {siblings.map((s) => (
                <Link
                  key={s.slug}
                  href={`/glossary/${s.slug}`}
                  className="chip inline-flex min-h-[32px] shrink-0 items-center border border-line bg-surface px-3 t-sub font-bold text-text-1 no-underline"
                >
                  {s.term}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* [1012 · 규칙 6] 사실 서술. [v4 · 규칙 3] 세 문장 → 캡션 한 줄 */}
        <p className="t-caption text-text-3">
          일반 풀이 · 제도 수치(대출 한도·세율·규제 지역)는 시점마다 바뀌고 실제 기준은 금융기관·관할 관청 ·{" "}
          <Link href="/methodology" className="tap-line font-bold text-primary no-underline">
            데이터 방법론
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
