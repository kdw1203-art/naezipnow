import Link from "@/app/components/IntentLink";
import { CountUp } from "@/app/components/motion/CountUp";
import { BrandSignature } from "@/app/components/BrandSignature";
import { PageShell } from "../components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { loadCoverage } from "@/lib/stats/coverage";
import { FactTable } from "@/app/components/compact/FactTable";

/* 고도화 50 — 실적 숫자는 llms.txt 와 같은 로더에서 온다(1시간 재검증).
   손으로 적은 숫자는 낡는다 — 로더가 실패하면 숫자 문장을 통째로 생략한다. */
/* [1010] 3,600 → 86,400(1일). 조회가 하나도 없는 고정 문서다 — 내용은 배포로만 바뀌고
   배포는 캐시를 통째로 새로 만든다. 시간 눈금이 짧을 이유가 없다. */
export const revalidate = 86_400;

export const metadata = buildPageMetadata({
  title: "내집나우 소개 — 운영 원칙",
  description:
    "내집나우는 임장 기록을 부동산 판단 근거로 만드는 서비스입니다. 사실 우선 원칙과 데이터 처리 방식을 공개합니다.",
  path: "/about",
});

/* G22 — 소개·운영 원칙 페이지.
   브랜드 서사가 아니라 실제로 지키고 있는 원칙만 적는다 — 각 문장은
   서비스 어딘가에서 확인 가능한 동작이다(방법론 페이지가 그 증거다). */

/* [1062 · 글 줄이기] 원칙 한 줄 + 사실 낱말 칩 + 접힌 문단(▾).
   [1107] 소유자 2026-11-05 "글씨크기 글자수 디자인 표 … 통합 간결화"(소개 캡처) — 칩 14개 · 펼침 표시 4개 · 두 줄로 접히는 제목이
   카드 안 카드에 겹쳐 있었다. → 표 한 장(원칙 · 하는 일). 제목은 짧게, 하는 일은 사실 낱말만(문단에만 있던 사실 둘 —
   "읽은 데이터를 답과 함께" · "방식이 바뀌면 문서 갱신" — 은 낱말로 옮겼다). */
const PRINCIPLES: { title: string; facts: string[] }[] = [
  { title: "사실 우선", facts: ["신고된 실거래만 집계", "수치마다 기준 시점", "호가 · 추정치를 실거래라 부르지 않음"] },
  { title: "없으면 없음", facts: ["추정 가격 만들지 않음", "부족하면 '아직 없음'", "AI는 조회한 데이터로만 · 읽은 데이터를 답과 함께"] },
  { title: "계산 공개", facts: ["해제거래 제외", "신고 지연 처리", "시장 온도 공식", "방식이 바뀌면 문서 갱신"] },
  { title: "판단은 사용자", facts: ["매수 · 매도 추천하지 않음", "데이터와 임장 기록을 나란히"] },
];

export default async function AboutPage() {
  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "소개", url: "/about" },
  ]);
  const coverage = await loadCoverage();
  return (
    <PageShell breadcrumb="소개">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbs) }}
      />
      <div className="mx-auto max-w-[720px]">
        {/* [961] 브랜드 시그니처 — 소개는 브랜드가 스스로를 말하는 자리 */}
        <BrandSignature className="rise-in mb-6" />
        {/* [1015 · 규칙 D] 대시로 이은 슬로건 제목 → 명사 제목 + 슬로건 한 줄 */}
        <h1 className="rise-in t-title text-ink">내집나우 소개</h1>
        <p className="rise-in-1 mt-1 t-body font-bold text-ink">실거래는 누구나 봅니다. 현장은 가 본 사람만 압니다.</p>
        <p className="rise-in-1 mt-2 t-body leading-[1.7] text-text-2">
          내집나우(naezipnow.com)은 집을 보러 다니는 기록(임장노트)을 국토교통부 실거래
          데이터와 나란히 놓고, 부동산 판단의 근거를 쌓도록 돕는 서비스입니다.
        </p>

        {/* 고도화 50 — 실적 숫자(실측·1시간 재검증). 로더 실패면 이 블록 자체가
            사라진다 — 낡은 숫자를 소개 페이지에 굳히지 않는다. */}
        {/* [1107] 두 칸에 같은 꼬리("· 국토부 신고 기준")가 두 번 — 카드 하나 · 두 숫자 · 기준은 한 번 */}
        {coverage.complexes !== null && coverage.regions !== null && (
          <div className="rise-in-1 card mt-4 rounded-2xl px-5 py-4 max-md:mt-3 max-md:px-3.5 max-md:py-3">
            <dl className="grid grid-cols-2 divide-x divide-divider">
              <div className="pr-4">
                <dt className="t-sub text-text-3">실거래 집계 단지</dt>
                <dd className="t-num t-title text-ink">
                  <CountUp value={coverage.complexes} />
                </dd>
              </div>
              <div className="pl-4">
                {/* [1015] "시세 랜딩 지역 · 매시간 갱신" → 실거래 지역(재검증은 1일) */}
                <dt className="t-sub text-text-3">실거래 집계 지역</dt>
                <dd className="t-num t-title text-ink">
                  <CountUp value={coverage.regions} />
                </dd>
              </div>
            </dl>
            <p className="mt-2 t-caption text-text-3">국토교통부 신고 기준</p>
          </div>
        )}

        {/* [1107] 운영 원칙 = 표 한 장. 아래 링크 칩 넷(방법론 · 용어사전 · 월간 리포트 · 고객센터)은 바로 밑 푸터와 같은 링크라 걷고,
            원칙의 근거 문서(데이터 방법론) 하나만 제목 줄에 둔다. */}
        <section aria-labelledby="principles-title" className="rise-in-2 card mt-6 rounded-2xl px-5 py-4 max-md:mt-4 max-md:px-3.5 max-md:py-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="principles-title" className="t-section text-ink">
              운영 원칙
            </h2>
            <Link href="/methodology" className="tap-line shrink-0 t-sub font-bold text-primary no-underline">
              데이터 방법론 ›
            </Link>
          </div>
          {/* 사이트 공용 "항목 | 사실" 표(compact/FactTable) — 요금제 · 데이터 출처 화면과 같은 꼴 */}
          <FactTable dense className="mt-2" rows={PRINCIPLES.map((p) => ({ label: p.title, value: p.facts.join(" · ") }))} />
        </section>
      </div>
    </PageShell>
  );
}
