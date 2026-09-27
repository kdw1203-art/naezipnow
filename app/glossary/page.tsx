/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { jsonLdScript } from "@/lib/seo/jsonld";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { GLOSSARY_TERMS, glossaryTermsByCategory } from "@/lib/seo/glossary-terms";
import { GlossarySearch } from "./GlossarySearch";

export const metadata = buildPageMetadata({
  title: "부동산 용어사전 — 실거래·시세·대출·경매 용어 풀이",
  description:
    "실거래가, 전세가율, 평당가, 전용면적, LTV, DSR, 대항력, 우선변제권 등 부동산 거래에 필요한 용어를 한 문단씩 풀이합니다. 용어마다 개별 페이지가 있습니다.",
  path: "/glossary",
});

/* S14 → N14 — 정의형 용어사전 허브.

   여기는 이제 '목록'이다. 정의 본문의 주 무대는 /glossary/{slug} 개별 페이지로
   옮겼다(정의형 롱테일은 URL 단위로 수확된다). 허브는 분류별 색인 + 요약을 주고,
   DefinedTermSet 이 개별 DefinedTerm 페이지들을 하나로 묶는 역할을 한다.

   용어 데이터는 lib/seo/glossary-terms.ts 한 곳에만 있다 — 허브와 개별 페이지가
   각자 배열을 들고 있으면 반드시 어긋난다. */

function definedTermSetJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    "@id": "https://naezipnow.com/glossary",
    name: "내집나우 부동산 용어사전",
    description:
      "부동산 실거래·시세·임대차·대출·세금·청약·경매 용어를 한 문단 정의로 정리한 사전입니다.",
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

export default function GlossaryPage() {
  const groups = glossaryTermsByCategory();

  return (
    <PageShell breadcrumb="부동산 용어사전">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(definedTermSetJsonLd()) }}
      />
      {/* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄 → 주인공(검색창) → 분류 칩 한 줄 → 분류별 구분선 행 → 안내 캡션 한 줄.
          지운 것: 소개 문단(→ 사실 줄), 2열 카드(→ 행), 회색 안내 상자(→ 캡션 한 줄). */}
      <div className="mx-auto flex max-w-[760px] flex-col">
        <header className="mb-4 flex flex-col gap-0.5">
          <h1 className="rise-in t-title text-ink">부동산 용어사전</h1>
          <p className="t-sub text-text-3">
            용어 {GLOSSARY_TERMS.length}개 · 분류 {groups.length}개 · 용어마다 정의·관련 용어
          </p>
        </header>

        {/* 제안 웹6 — 검색 + 분류 바로가기 + 목록 (클라이언트 필터, 데이터는
            서버 단일 출처 그대로 직렬화해 넘긴다) */}
        <GlossarySearch
          groups={groups.map((g) => ({
            category: g.category,
            terms: g.terms.map((t) => ({ slug: t.slug, term: t.term, short: t.short })),
          }))}
        />

        <p className="mt-8 t-caption text-text-3">
          일반 풀이 · 대출 한도·세율·규제 지역 등 제도 수치는 시점마다 달라 정의에 적지 않음 ·{" "}
          <Link href="/methodology" className="tap-line font-bold text-primary no-underline">
            데이터 방법론 보기
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
