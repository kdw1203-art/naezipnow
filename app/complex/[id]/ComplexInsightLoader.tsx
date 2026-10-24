"use client";

/* [1089 · 비용] 단지 화면 "이 단지 결과 요약 · 다요인 분석"을 사람이 볼 때 받는 몫(지연 조각 — ComplexInsightPanels 가 부른다).
   규칙:
   - 크롤러(UA 표식 · navigator.webdriver)는 부르지 않는다(useHumanGate) — 화면 HTML 에는 이 단지의 실거래 · 사실만 남는다.
   - 사람이면 이 자리가 화면 근처(600px)에 오거나 첫 입력 뒤 한 번 받는다(/api/complex/insight · CDN 6시간).
   - 값은 화면이 이미 가진 것만 넘긴다(단지 id · 지역 · 월별 건수 · 주력 평형 월 중위) — 새 조회 0.
   - 못 받거나 두 판 다 비면 아무것도 그리지 않는다(예전 섹션 생략과 같다).
   판정(봇 · 화면 근처) · 조회 · 그리기 코드가 모두 이 조각에 있어 단지 화면 첫 로드 JS 는 늘지 않는다. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useHumanGate } from "@/lib/client/human-gate";
import { INSIGHT_PATH, insightQueryString, type InsightSeries } from "@/lib/complex/insight-query";
import type { ComplexInsight } from "@/lib/complex/insight";
import ComplexInsightView from "./ComplexInsightView";

export default function ComplexInsightLoader({
  complexId,
  regionName,
  series,
}: {
  complexId: string;
  regionName: string;
  series: InsightSeries | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const armed = useHumanGate(ref, { rootMargin: "600px 0px" });
  const [data, setData] = useState<ComplexInsight | null>(null);
  const url = useMemo(
    () => (regionName ? `${INSIGHT_PATH}?${insightQueryString({ complexId, regionName, series })}` : null),
    [complexId, regionName, series],
  );

  useEffect(() => {
    if (!armed || !url) return;
    let alive = true;
    fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<ComplexInsight>) : null))
      .then((d) => {
        if (alive && d && (d.summary || d.signals)) setData(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [armed, url]);

  return <div ref={ref}>{data && <ComplexInsightView data={data} complexId={complexId} />}</div>;
}
