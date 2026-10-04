import { logger } from "@/lib/log";
import { listUpisGuSummary, listUpisRecords, totalsOf } from "@/lib/seoul/upis-store";
import { UPIS_SOURCE_URL } from "@/lib/seoul/upis";
import { SeoulPlanBrowser } from "./SeoulPlanBrowser";

/* [1029] 서울시 도시계획 결정 조서 — /redevelopment 의 한 칸. 서버 조각: 구별 건수(뷰)와 최근 조서 20건을 읽어 넘긴다.
   표가 아직 비어 있으면(크론이 한 번도 돌기 전) 칸을 그리지 않는다 — 빈 표를 "조서 없음"으로 보이지 않게.
   조회 실패는 실패라고 적는다. 좌표·세대수·진행단계는 원문에 없다 — 그래서 지도 마커가 아니라 표다. */

export async function SeoulPlanSection() {
  let summary;
  let items;
  try {
    [summary, items] = await Promise.all([listUpisGuSummary(), listUpisRecords({ limit: 20 })]);
  } catch (e) {
    logger.error("[/redevelopment] 서울 UPIS 조서 조회 실패", e);
    return (
      <section id="seoul-plan" className="rise-in-1 card scroll-mt-24 rounded-2xl px-5 py-4 max-md:px-3.5 max-md:py-3">
        <h2 className="t-section text-ink">서울시 도시계획 결정 조서</h2>
        <div className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-center t-sub text-ink">조서 불러오기 실패 · 잠시 후 다시</div>
      </section>
    );
  }
  const totals = totalsOf(summary);
  if (totals.total === 0) return null;

  return (
    <section id="seoul-plan" className="rise-in-1 card scroll-mt-24 rounded-2xl px-5 py-4 max-md:px-3.5 max-md:py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="t-section text-ink">서울시 도시계획 결정 조서</h2>
        <span className="t-caption text-text-3 tabular-nums">
          정비 {totals.rebuild.toLocaleString("ko-KR")} · 도시개발 {totals.urbanDev.toLocaleString("ko-KR")} · 지구단위 {totals.distUnitPlan.toLocaleString("ko-KR")} · 자치구 {totals.guCount}
        </span>
      </div>
      <SeoulPlanBrowser initialItems={items} summary={summary} />
      <p className="mt-3 t-caption text-text-3">
        출처{" "}
        <a href={UPIS_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[24px] items-center font-bold text-primary">
          서울 열린데이터광장 · 도시계획 결정 조서
        </a>{" "}
        · 매일 갱신 · 원문 그대로 · 참고용(법적 효력 없음) · 결정일 = 고시 코드 기준
      </p>
    </section>
  );
}
