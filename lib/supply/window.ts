/* [1028] 입주 물량 화면의 기간 창 — 순수 함수(클라이언트·테스트 공용).
   그래프 · 합계 · 가장 많은 달 · 단지 수 · 지역별 요약이 모두 같은 창("이번 달부터 24개월")에서 센다.
   창은 **달력 기준**이다 — "자료가 있는 달 24개"로 세면 물량이 드문 지역은 24개가 몇 년에 걸쳐 "24개월"이라는 말이 틀린다. */

export const SUPPLY_WINDOW_MONTHS = 24;

/** "YYYYMM" 이고 달이 1~12 인가 */
export function validYm(ym: string): boolean {
  if (!/^\d{6}$/.test(ym)) return false;
  const m = Number(ym.slice(4, 6));
  return m >= 1 && m <= 12;
}

/** "YYYYMM" 에 n개월을 더한다(음수 가능) */
export function addMonthsYm(ym: string, n: number): string {
  const total = Number(ym.slice(0, 4)) * 12 + (Number(ym.slice(4, 6)) - 1) + n;
  const y = Math.floor(total / 12);
  const m = total - y * 12;
  return `${y}${String(m + 1).padStart(2, "0")}`;
}

export type SupplyWindow = { fromYm: string; toYm: string };

/** 이번 달(nowYm)부터 24개월 — 끝 달 포함 */
export function supplyWindow(nowYm: string): SupplyWindow {
  return { fromYm: nowYm, toYm: addMonthsYm(nowYm, SUPPLY_WINDOW_MONTHS - 1) };
}

/** 입주월이 창 안인가 — 달이 없거나 잘못 적힌 값은 창 밖 */
export function inSupplyWindow(ym: string, w: SupplyWindow): boolean {
  return validYm(ym) && ym >= w.fromYm && ym <= w.toYm;
}

/**
 * 화면에 그릴 달 — 창 안의 달. 창 안에 자료가 하나도 없으면(그 지역 물량이 전부 창 밖) 가진 달의 마지막 24개를 보인다.
 * windowed 가 false 면 화면은 "24개월"이라 적지 않고 실제 범위만 적는다.
 */
export function shownMonths<T extends { ym: string }>(monthly: readonly T[], w: SupplyWindow): { months: T[]; windowed: boolean } {
  const inside = monthly.filter((m) => inSupplyWindow(m.ym, w));
  if (inside.length > 0) return { months: inside, windowed: true };
  return { months: monthly.slice(-SUPPLY_WINDOW_MONTHS), windowed: false };
}
