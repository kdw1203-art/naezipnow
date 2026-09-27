import Link from "next/link";
import { BrandSignature } from "@/app/components/BrandSignature";
import { PageShell } from "../components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { loadCoverage } from "@/lib/stats/coverage";

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

const PRINCIPLES: { title: string; body: string }[] = [
  {
    title: "사실이 최우선입니다",
    body: "모든 시세는 국토교통부에 신고된 실거래만 집계하고, 수치에는 기준 시점을 붙입니다. 매물 호가·추정치를 시세라고 부르지 않습니다.",
  },
  {
    title: "없는 데이터는 없다고 말합니다",
    body: "실거래가 없는 단지에 추정 시세를 만들지 않고, 데이터가 부족하면 화면에 그대로 '아직 없다'고 적습니다. AI 기능도 조회된 데이터에서만 답하며, 어떤 데이터를 읽었는지 답변과 함께 보여줍니다.",
  },
  {
    title: "계산 방식을 공개합니다",
    body: "해제거래 제외, 신고 지연 처리, 시장 온도 공식 등 집계 방식 전부를 데이터 방법론 페이지에 공개합니다. 방식이 바뀌면 문서를 갱신합니다.",
  },
  {
    title: "판단은 사용자의 것입니다",
    body: "내집나우는 매수·매도를 추천하지 않습니다. 데이터와 본인의 임장 기록을 나란히 두고, 판단의 근거를 쌓는 것을 돕습니다.",
  },
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
      {/* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄(실측 단지·지역 수) → 원칙 4개(구분선 행) → 링크 한 줄 → 브랜드 시그니처(맨 끝).
          지운 것: 슬로건형 긴 제목(→ "내집나우 소개" + 슬로건은 시그니처 안), 소개 문단(→ 사실 줄), 숫자 카드 2장(→ 사실 줄),
          원칙 카드 4장(→ 행), 칩 모양 링크(→ 한 줄). 시그니처는 첫 화면 → 맨 끝으로 옮겼다(없애지 않음). */}
      <div className="mx-auto flex max-w-[760px] flex-col gap-8">
        <header className="flex flex-col gap-0.5">
          <h1 className="rise-in t-title text-ink">내집나우 소개</h1>
          {/* 고도화 50 — 실적 숫자(실측). 로더 실패면 숫자 토막을 뺀다 — 낡은 숫자를 굳히지 않는다 */}
          <p className="t-sub text-text-3">
            임장노트 × 국토교통부 실거래
            {coverage.complexes !== null ? ` · 집계 단지 ${coverage.complexes.toLocaleString("ko-KR")}` : ""}
            {coverage.regions !== null ? ` · 지역 ${coverage.regions.toLocaleString("ko-KR")}` : ""}
          </p>
        </header>

        <section className="flex flex-col gap-2">
          <h2 className="flex items-baseline gap-1.5 t-section text-ink">
            운영 원칙 <span className="t-num text-text-3">{PRINCIPLES.length}</span>
          </h2>
          <dl className="card m-0 flex flex-col divide-y divide-line rounded-lg px-4">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="py-3">
                <dt className="t-body font-bold text-ink">{p.title}</dt>
                <dd className="m-0 mt-0.5 t-sub leading-[1.7] text-text-2">{p.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="t-sub text-text-3">
          <Link href="/methodology" className="tap-line font-bold text-primary no-underline">
            데이터 방법론
          </Link>
          {" · "}
          <Link href="/glossary" className="tap-line font-bold text-primary no-underline">
            용어사전
          </Link>
          {" · "}
          <Link href="/reports" className="tap-line font-bold text-primary no-underline">
            월간 실거래 리포트
          </Link>
          {" · "}
          <Link href="/support" className="tap-line font-bold text-primary no-underline">
            고객센터
          </Link>
        </p>

        {/* [961] 브랜드 시그니처 — 소개는 브랜드가 스스로를 말하는 자리. [v4] 첫 화면 → 맨 끝 */}
        <BrandSignature />
      </div>
    </PageShell>
  );
}
