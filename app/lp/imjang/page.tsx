import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { IMJANG_CHECKPOINTS } from "@/lib/imjang/checkpoints";
/* 노트 폼이 실제로 쓰는 체크리스트(lib/inspection/checklist) — 개수만 읽는다(수정 없음) */
import { CHECKLIST_GROUPS } from "@/lib/inspection/checklist";
import { loadCoverage } from "@/lib/stats/coverage";
import { LpCta } from "./LpCta";

/* ============================================================
   [1006 · E] 유료 광고 랜딩 — /lp/imjang

   목적: 검색·소셜 광고에서 들어온 사람에게 행동 하나만 보여 준다("첫 임장노트 쓰기(무료)").
   [1012 · 규칙 5·9] CTA "임장노트 무료로 시작"(금지 문구 "무료로 시작") → "첫 임장노트 쓰기(무료)" — 동사 + 대상.
   채움 파랑 버튼은 화면당 1개: 위 CTA 만 채움, 아래 두 번째는 테두리(outline).
   규칙:
   - noindex. 광고용 페이지가 자연 검색에 잡히면 같은 내용의 페이지가 둘이 된다(홈·/imjang).
     robots.txt 로 막지 않는다 — 크롤러가 noindex 메타를 읽으려면 접근은 열려 있어야 한다.
   - 지어낸 후기·숫자 금지. 여기 적힌 숫자는 lib/stats/coverage 실측(못 읽으면 문장 생략)과
     lib/imjang/checkpoints 배열 길이뿐이다. "무료"는 lib/subscriptions/access 의
     inspection_create(minTier basic) 가 근거이고, "로그인 없이 시작"은 /notes/new 의
     실제 동작(비회원 작성 가능, 저장 때 로그인)이다.
   - 계측: CTA 클릭 = GA4 generate_lead(LpCta), 가입 완료 = /welcome 의 sign_up(기존 로더).
   - 캐시: 개인화 없음. 정적 프리렌더(revalidate 1시간 — 커버리지 숫자만 갱신).
   ============================================================ */

/* [1010] 3,600 → 86,400(1일). 서버가 읽는 것은 lib/stats/coverage 커버리지 숫자뿐이고
   그 값은 실거래 적재로 하루 단위로만 움직인다(못 읽으면 문장을 생략한다). 랜딩이라
   내용이 하루 늦어도 잃을 것이 없다. */
export const revalidate = 86_400;

const CTA_LABEL = "첫 임장노트 쓰기(무료)";

export const metadata: Metadata = {
  title: "첫 임장노트 쓰기(무료) | 내집나우",
  description:
    "임장(현장 방문) 기록을 국토교통부 실거래가와 나란히 남기는 무료 임장노트. 로그인 없이 쓰고, 저장할 때만 로그인합니다.",
  robots: { index: false, follow: true },
};

/* [v4 · 한 화면 한 가지] 제목 한 줄 + 사실 한 줄 → 주인공 CTA 1개(채움) → 사실 3행(1px 선) → 동선 3행 → 두 번째 CTA(테두리) →
   끝 캡션(면책·방법론). 지운 것: 머리 위 꼬리표("부동산 임장 관리 · 내집나우") · 두 줄 슬로건 제목 · 가운데 정렬 ·
   설명 문단 · 높이가 다른 사실 카드 3장(엇갈림) · 체크포인트 4줄 목록(개수만 행에) · 동선 카드 3장. */
export default async function ImjangLandingPage() {
  const coverage = await loadCoverage();
  const checklistItemCount = CHECKLIST_GROUPS.reduce((n, g) => n + g.items.length, 0);
  const coverageLine = [
    coverage.complexes !== null ? `실거래 1건 이상 단지 ${coverage.complexes.toLocaleString("ko-KR")}곳` : null,
    coverage.regions !== null ? `지역 통계 ${coverage.regions.toLocaleString("ko-KR")}개 지역` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        {/* 머리 + 주인공(CTA 하나) */}
        <section className="rise-in flex flex-col gap-4 pt-2 md:pt-6">
          <header className="flex flex-col gap-0.5">
            <h1 className="t-title text-ink">실거래가 옆에 쓰는 임장노트</h1>
            <p className="t-sub text-text-3">무료 · 로그인 없이 쓰고 저장할 때만 로그인 · 국토교통부 실거래가 나란히</p>
          </header>
          <div>
            <LpCta label={CTA_LABEL} />
          </div>
          <p className="t-caption text-text-3">가입·카드 정보 없이 쓰기 · 광고 아닌 실거래 신고분 기준</p>
        </section>

        {/* 사실 3행 — 실측·코드에 근거한 것만([v4 · 규칙 5·10] 높이가 다른 카드 3장 → 같은 높이 행) */}
        <section aria-labelledby="lp-facts-h" className="rise-in-1 flex flex-col">
          <h2 id="lp-facts-h" className="t-section text-ink">
            임장노트에 붙는 것
          </h2>
          <ul className="divide-y divide-line">
            <li className="flex min-h-14 flex-col justify-center gap-0.5 py-3">
              <span className="t-body font-bold text-ink">실거래가 옆에 기록</span>
              <p className="t-sub text-text-3">
                {coverageLine ? `${coverageLine}(지금 집계 기준)` : "국토교통부 신고분 · 호가·해제 신고분 제외"}
              </p>
            </li>
            <li className="flex min-h-14 flex-col justify-center gap-0.5 py-3">
              <span className="t-body font-bold text-ink">
                체크리스트 {CHECKLIST_GROUPS.length}개 영역 · {checklistItemCount}개 항목
              </span>
              <p className="t-sub text-text-3">
                입지·단지·내부·학군·편의·미래가치 · 현장 체크포인트 {IMJANG_CHECKPOINTS.length}가지
              </p>
            </li>
            <li className="flex min-h-14 flex-col justify-center gap-0.5 py-3">
              <span className="t-body font-bold text-ink">사실 우선</span>
              <p className="t-sub text-text-3">모든 수치에 출처·시점 · 조회 실패는 &ldquo;조회 실패&rdquo;로 표시</p>
            </li>
          </ul>
        </section>

        {/* 어떻게 되나 — 실제 동선 3단계([v4] 카드 3장 → 번호 행) */}
        <section aria-labelledby="lp-flow-h" className="rise-in-2 flex flex-col">
          <h2 id="lp-flow-h" className="t-section text-ink">
            첫 노트 동선
          </h2>
          <ol className="divide-y divide-line">
            {[
              "단지·동네 고르기 → 그 지역 실거래 요약 한 줄이 노트 위에",
              `체크리스트 ${checklistItemCount}개 항목 · 사진·메모 → 로그인 없이 이 기기에 임시저장`,
              "저장할 때 로그인 → 사진 업로드 · 내 노트 목록·지도에서 다시 보기",
            ].map((t, i) => (
              <li key={t} className="flex min-h-12 items-center gap-3 py-2.5">
                <span className="t-num w-4 shrink-0 text-primary">{i + 1}</span>
                <span className="min-w-0 t-body text-text-1">{t}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4">
            <LpCta label={CTA_LABEL} variant="outline" />
          </div>
        </section>

        <p className="t-caption text-text-3">
          실거래 수치는 국토교통부 신고 기반의 참고 자료이며 투자 권유가 아닙니다. 판단과 책임은 이용자에게 있습니다 ·
          집계 방법론은 /methodology 에 공개
        </p>
      </div>
    </PageShell>
  );
}
