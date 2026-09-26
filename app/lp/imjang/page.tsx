import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { IMJANG_CHECKPOINTS } from "@/lib/imjang/checkpoints";
/* 노트 폼이 실제로 쓰는 체크리스트(lib/inspection/checklist) — 개수만 읽는다(수정 없음) */
import { CHECKLIST_GROUPS } from "@/lib/inspection/checklist";
import { loadCoverage } from "@/lib/stats/coverage";
import { LpCta } from "./LpCta";

/* ============================================================
   [1006 · E] 유료 광고 랜딩 — /lp/imjang

   목적: 검색·소셜 광고에서 들어온 사람에게 행동 하나만 보여 준다("임장노트 무료로 시작").
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

const CTA_LABEL = "임장노트 무료로 시작";

export const metadata: Metadata = {
  title: "임장노트 무료로 시작 | 내집나우",
  description:
    "임장(현장 방문) 기록을 국토교통부 실거래가와 나란히 남기는 무료 임장노트. 로그인 없이 바로 쓰기 시작할 수 있습니다.",
  robots: { index: false, follow: true },
};

export default async function ImjangLandingPage() {
  const coverage = await loadCoverage();
  const checkpoints = IMJANG_CHECKPOINTS.slice(0, 4);
  const checklistItemCount = CHECKLIST_GROUPS.reduce((n, g) => n + g.items.length, 0);

  return (
    <PageShell>
      {/* 히어로 — 한 문장의 약속, 한 개의 행동 */}
      <section className="rise-in mx-auto max-w-[760px] pt-4 text-center md:pt-10">
        <p className="t-sub font-bold text-primary">부동산 임장 관리 · 내집나우</p>
        <h1 className="mt-2 t-display text-ink">
          실거래가는 누구나 봅니다.
          <br />
          현장은 가 본 사람만 압니다.
        </h1>
        <p className="mx-auto mt-4 max-w-[560px] t-body text-text-2">
          임장노트는 무료입니다. 로그인 없이 바로 쓰기 시작하고, 저장할 때 로그인하면 사진과 AI
          초안이 함께 올라갑니다. 기록 옆에는 국토교통부 실거래가가 나란히 붙습니다.
        </p>
        <div className="mt-6 flex justify-center">
          <LpCta label={CTA_LABEL} />
        </div>
        <p className="mt-2 t-caption text-text-3">가입·카드 정보 없이 시작 · 광고 아닌 실거래 신고분 기준</p>
      </section>

      {/* 사실 3칸 — 실측·코드에 근거한 문장만 */}
      <section className="rise-in-1 mx-auto mt-10 grid max-w-[960px] grid-cols-1 gap-3 md:grid-cols-3">
        <div className="card p-[var(--pad-card)]">
          <div className="t-section text-ink">실거래가 옆에 기록</div>
          <p className="mt-1.5 t-sub text-text-2">
            국토교통부 실거래가 공개시스템 신고분을 기준으로 단지·지역 실거래가를 보여 줍니다. 매물
            호가는 실거래에 섞지 않고, 해제 신고분은 뺍니다.
          </p>
          {(coverage.complexes !== null || coverage.regions !== null) && (
            <p className="mt-2 t-caption text-text-3">
              {coverage.complexes !== null
                ? `실거래 1건 이상 단지 ${coverage.complexes.toLocaleString("ko-KR")}곳`
                : ""}
              {coverage.complexes !== null && coverage.regions !== null ? " · " : ""}
              {coverage.regions !== null ? `지역 통계 ${coverage.regions.toLocaleString("ko-KR")}개 지역` : ""}
              {" (지금 집계 기준)"}
            </p>
          )}
        </div>
        <div className="card p-[var(--pad-card)]">
          <div className="t-section text-ink">
            체크리스트 {CHECKLIST_GROUPS.length}개 영역 · {checklistItemCount}개 항목
          </div>
          <p className="mt-1.5 t-sub text-text-2">
            입지·단지·내부·학군·편의·미래가치 항목을 노트에서 바로 체크합니다. 현장에서만 보이는
            것은 임장 가이드의 체크포인트 {IMJANG_CHECKPOINTS.length}가지가 따로 알려 줍니다.
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {checkpoints.map((c) => (
              <li key={c.title} className="flex gap-1.5 t-caption text-text-2">
                <span aria-hidden="true" className="text-primary">
                  ✓
                </span>
                <span className="break-words">{c.title}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-[var(--pad-card)]">
          <div className="t-section text-ink">사실 우선</div>
          <p className="mt-1.5 t-sub text-text-2">
            모든 수치에 기준 시점과 출처를 붙이고, 없는 데이터는 없다고 표시합니다. 조회에 실패한
            자리는 "조회 실패"라고 적지 "없음"이라고 적지 않습니다.
          </p>
          <p className="mt-2 t-caption text-text-3">집계 방법론은 사이트의 /methodology 에 공개돼 있습니다.</p>
        </div>
      </section>

      {/* 어떻게 되나 — 실제 동선 3단계 */}
      <section className="rise-in-2 mx-auto mt-10 max-w-[760px]">
        <h2 className="t-section text-ink">시작하면 이렇게 됩니다</h2>
        <ol className="mt-3 flex flex-col gap-2">
          {[
            "단지나 동네를 고르면 그 지역의 실거래 요약 한 줄이 노트 위에 붙습니다.",
            "체크리스트에 답하고 사진·메모를 남깁니다. 로그인 없이도 이 기기에 임시저장됩니다.",
            "저장할 때 로그인하면 사진이 올라가고, 내 노트 목록과 지도에서 다시 볼 수 있습니다.",
          ].map((t, i) => (
            <li key={t} className="card flex gap-3 p-4">
              <span className="t-num shrink-0 text-primary">{i + 1}</span>
              <span className="t-body text-text-1">{t}</span>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex justify-center">
          <LpCta label={CTA_LABEL} />
        </div>
        <p className="mt-4 text-center t-caption text-text-3">
          실거래 수치는 국토교통부 신고 기반의 참고 자료이며 투자 권유가 아닙니다. 판단과 책임은
          이용자에게 있습니다.
        </p>
      </section>
    </PageShell>
  );
}
