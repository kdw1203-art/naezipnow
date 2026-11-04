/* [1105 · 속도] AreaTextLazy 가 경계 없이 바로 그리는 ㎡ 글자 · "평" 쿠키 판정 — 순수 함수로 따로 둔다(유닛 테스트가 .tsx 를 못 불러온다).
   lib/prefs/area-unit · lib/complex/area-band-label 을 불러오지 않는 이유: 그 둘을 허브 라우트 번들에 싣지 않으려고 AreaText 를
   따로 받는 청크로 뗐다(AreaTextLazy 머리 주석). 같은 결과인지는 tests/unit/perf-1105 가 두 lib 함수와 맞춰 본다. */

/** AreaText 가 ㎡ 일 때 그리는 글자 — 면적대는 areaBandDisplayLabel(열린 구간 이름), 평형 키는 formatAreaByUnit(x, "m2") 와 같다 */
export function areaTextM2(unitM2?: number | null, band?: string | null): string {
  if (band) return band === "~59㎡" ? "60㎡ 미만" : band === "135㎡~" ? "135㎡ 이상" : band;
  if (unitM2 == null) return "";
  if (!Number.isFinite(unitM2)) return "—";
  return `${Math.round(unitM2).toLocaleString("ko-KR")}㎡`;
}

/** readAreaUnitCookie() === "pyeong" 과 같은 판정(같은 정규식) */
export function cookieSaysPyeong(): boolean {
  if (typeof document === "undefined") return false;
  try {
    return document.cookie.match(/(?:^|;\s*)nz_area_unit=([a-z0-9]+)/)?.[1] === "pyeong";
  } catch {
    return false;
  }
}
