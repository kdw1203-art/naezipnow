/**
 * [1009 · C] 실거래 한 건 표기 — 클라이언트에서도 쓰는 **가벼운** 순수 함수만(무거운 계산 모듈을 끌고 오지 않게).
 * 단지 허브 /complex/[id] 는 라우트 번들 예산이 빠듯하다(472/480KB) — 목록 부품(DealList)이 lib/ai/result-series 를
 * import 하면 그 모듈과 의존 모듈이 첫 로드에 실린다. 그래서 표기 규칙만 여기 둔다.
 */

/** 평형 키 — 전용면적의 정수 내림(84.99㎡ → 84). lib/ai/result-series 의 unitOf 와 같다(테스트가 잠근다) */
export function unitKeyOf(areaM2: number): number {
  return Math.floor(areaM2 + 1e-6);
}

/** "2026.08.15" · 일자 없으면 "2026.08" */
export function dealDateLabel(ym: string, day: number | null): string {
  const base = `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
  return day != null && day >= 1 && day <= 31 ? `${base}.${String(day).padStart(2, "0")}` : base;
}

/** "15층" · 지하 "지하 1층" · 모르면 "—" */
export function floorLabel(f: number | null): string {
  if (f == null || !Number.isFinite(f) || f === 0) return "—";
  return f < 0 ? `지하 ${Math.abs(f)}층` : `${f}층`;
}
