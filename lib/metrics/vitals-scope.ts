/* [979 → 1106 공용] 웹 바이탈 지표마다 읽을 단위 줄 — CLS·INP 는 화면(route), LCP·FCP·TTFB 는 문서(doc, 첫 화면).
 * 관리 › 성능(app/admin/perf)에만 있던 표를 꺼냈다: 관리 › 트래픽의 웹 바이탈 카드(lib/admin/stats loadVitalsLast7d)는
 * 단위도 점검 로봇 표본도 거르지 않아 같은 7일인데 CLS 표본 82 대 50 · INP p75 120ms 대 64ms 로 두 화면이 달랐다(1106 실측). */
export const VITAL_SCOPE_FOR: Readonly<Record<string, "route" | "doc">> = {
  CLS: "route",
  INP: "route",
  LCP: "doc",
  FCP: "doc",
  TTFB: "doc",
};

/** 이 줄을 지표 집계에 써도 되는가 — 옛 표본(scope 없음)과 단위가 맞지 않는 줄은 뺀다 */
export function vitalRowUsable(metric: string, scope: string | null | undefined): boolean {
  return scope != null && scope === VITAL_SCOPE_FOR[metric];
}
