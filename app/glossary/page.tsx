import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { AdZone } from "@/app/components/ads/AdZone";
import { jsonLdScript } from "@/lib/seo/jsonld";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { GLOSSARY_TERMS, glossaryTermsByCategory } from "@/lib/seo/glossary-terms";
import { GlossarySearch } from "./GlossarySearch";

export const metadata = buildPageMetadata({
  title: "부동산 용어사전 — 실거래·대출·경매 용어 풀이",
  description:
    "실거래가, 전세가율, 평당가, 전용면적, LTV, DSR, 대항력, 우선변제권 등 부동산 거래에 필요한 용어를 한 문단씩 풀이합니다. 용어마다 개별 페이지가 있습니다.",
  path: "/glossary",
});

/* S14 → N14 — 정의형 용어사전 허브.

   여기는 이제 '목록'이다. 정의 본문의 주 무대는 /glossary/{slug} 개별 페이지로
   옮겼다(정의형 롱테일은 URL 단위로 수확된다). 허브는 분류별 색인 + 요약을 주고,
   DefinedTermSet 이 개별 DefinedTerm 페이지들을 하나로 묶는 역할을 한다.

   용어 데이터는 lib/seo/glossary-terms.ts 한 곳에만 있다 — 허브와 개별 페이지가
   각자 배열을 들고 있으면 반드시 어긋난다.

   [1015] 데스크톱은 본문 + 340px 레일(분류 목차 · 관련 화면 · 광고 1). 폰은 한 열(분류 칩은 검색 칸 아래 그대로), 광고 없음. */

function definedTermSetJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    "@id": "https://naezipnow.com/glossary",
    name: "내집나우 부동산 용어사전",
    description:
      "부동산 실거래·임대차·대출·세금·청약·경매 용어를 한 문단 정의로 정리한 사전입니다.",
    inLanguage: "ko-KR",
    url: "https://naezipnow.com/glossary",
    hasDefinedTerm: GLOSSARY_TERMS.map((t) => ({
      "@type": "DefinedTerm",
      "@id": `https://naezipnow.com/glossary/${t.slug}`,
      name: t.term,
      description: t.def,
      termCode: t.slug,
      url: `https://naezipnow.com/glossary/${t.slug}`,
    })),
  };
}

const railLinkCls = "flex min-h-[40px] items-center justify-between gap-2 py-2 t-sub font-bold text-ink no-underline";

export default function GlossaryPage() {
  const groups = glossaryTermsByCategory();

  return (
    <PageShell breadcrumb="부동산 용어사전">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(definedTermSetJsonLd()) }}
      />
      <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-4 max-md:gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
        <div className="min-w-0">
          <h1 className="rise-in t-title text-ink">부동산 용어사전</h1>
          {/* [1015 · 규칙 B] 소개 문단 → 사실 한 줄(용어 수·분류 수는 카탈로그 길이) */}
          <p className="rise-in-1 mt-1 t-sub text-text-2">
            용어 {GLOSSARY_TERMS.length}개 · {groups.length}개 분류
          </p>

          {/* 제안 웹6 — 검색 + 분류 바로가기 + 목록 (클라이언트 필터, 데이터는
              서버 단일 출처 그대로 직렬화해 넘긴다) */}
          <GlossarySearch
            groups={groups.map((g) => ({
              category: g.category,
              terms: g.terms.map((t) => ({ slug: t.slug, term: t.term, short: t.short })),
            }))}
          />

          <p className="mt-6 t-caption leading-[1.7] text-text-3 max-md:mt-4">
            일반적인 이해를 돕는 풀이. 대출 한도·세율·규제 지역 지정 같은 제도 수치는 시점에 따라 달라져 정의에 적지 않음.
            집계 방식은{" "}
            <Link href="/methodology" className="inline-flex min-h-[24px] items-center font-bold text-primary">
              데이터 방법론
            </Link>
          </p>
        </div>

        {/* [1015 · 규칙 F] 데스크톱 레일 — 분류 목차 · 관련 화면 · 광고 1 */}
        <aside className="hidden flex-col gap-3 lg:sticky lg:top-[76px] lg:flex lg:self-start">
          <nav aria-label="분류" className="card rounded-2xl px-4 py-3">
            <div className="t-caption font-bold text-text-3">분류</div>
            <ol className="m-0 mt-1.5 flex list-none flex-col p-0">
              {groups.map((g) => (
                <li key={g.category}>
                  <a
                    href={`#${encodeURIComponent(g.category)}`}
                    className="flex min-h-[36px] items-center justify-between t-sub font-bold text-ink no-underline"
                  >
                    {g.category} <span className="t-num t-caption text-text-3">{g.terms.length}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <nav aria-label="관련 화면" data-tone="blue" className="lq-panel flex flex-col divide-y">
            <Link href="/calculator" className={railLinkCls}>
              대출·비용 계산기 <span aria-hidden="true" className="text-text-3">›</span>
            </Link>
            <Link href="/guides" className={railLinkCls}>
              부동산 실전 가이드 <span aria-hidden="true" className="text-text-3">›</span>
            </Link>
            <Link href="/methodology" className={railLinkCls}>
              데이터 방법론 <span aria-hidden="true" className="text-text-3">›</span>
            </Link>
          </nav>
          <AdZone placement="sidebar" seed={3} plan={null} />
        </aside>
      </div>
    </PageShell>
  );
}
