/**
 * [1006] 면적 단위(㎡/평) — 클라이언트 안전 순수 헬퍼.
 *
 * 설정 화면이 서버(user_preferences.ui_prefs)에 저장하면서 같은 값을 쿠키에도 적는다.
 * 소비처(지도 단지 패널·노트 작성기/상세·마이)는 클라이언트에서 쿠키를 읽어 표시만 바꾼다 —
 * 서버 렌더(ISR 캐시)를 개인화하지 않기 위해서다. 서버 컴포넌트는 이 쿠키를 읽지 않는다.
 */
import type { AreaUnit } from "./ui-prefs";

export const AREA_UNIT_COOKIE = "nz_area_unit";
const PYEONG_M2 = 3.3058;

export function isAreaUnit(v: unknown): v is AreaUnit {
  return v === "m2" || v === "pyeong";
}

/** document.cookie 에서 읽는다. 브라우저 밖·없음·틀림 → "m2" */
export function readAreaUnitCookie(): AreaUnit {
  if (typeof document === "undefined") return "m2";
  try {
    const m = document.cookie.match(/(?:^|;\s*)nz_area_unit=([a-z0-9]+)/);
    const v = m?.[1];
    return isAreaUnit(v) ? v : "m2";
  } catch {
    return "m2";
  }
}

/** 1년, SameSite=Lax, 경로 전체. 비밀이 아니라 HttpOnly 를 걸지 않는다(클라이언트가 읽는다). */
export function writeAreaUnitCookie(unit: AreaUnit): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${AREA_UNIT_COOKIE}=${unit}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {
    /* 쿠키 차단 환경 — 표시만 기본으로 남는다 */
  }
}

export function m2ToPyeong(m2: number): number {
  return m2 / PYEONG_M2;
}

/**
 * 면적 한 값을 단위에 맞춰 문자열로. 평은 소수 첫째 자리, ㎡ 는 정수(.5 이상 반올림).
 *   formatAreaByUnit(84.97, "m2")     → "85㎡"
 *   formatAreaByUnit(84.97, "pyeong") → "25.7평"
 * null·NaN → "—"
 */
export function formatAreaByUnit(m2: number | null | undefined, unit: AreaUnit): string {
  if (m2 == null || !Number.isFinite(m2)) return "—";
  if (unit === "pyeong") {
    const p = m2ToPyeong(m2);
    return `${(Math.round(p * 10) / 10).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}평`;
  }
  return `${Math.round(m2).toLocaleString("ko-KR")}㎡`;
}

/** 두 단위를 나란히 — "85㎡ · 25.7평" (표에서 한 번은 두 단위를 같이 보여 줄 때) */
export function formatAreaBoth(m2: number | null | undefined): string {
  if (m2 == null || !Number.isFinite(m2)) return "—";
  return `${formatAreaByUnit(m2, "m2")} · ${formatAreaByUnit(m2, "pyeong")}`;
}
