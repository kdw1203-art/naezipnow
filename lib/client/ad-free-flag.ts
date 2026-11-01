/**
 * [1098 · 깜박임] 광고 제거 판정을 브라우저에 기억한다 — 소유자(2026-11-01) "광고판이 너무 깜박거려".
 *
 * 왜: 공유 캐시(ISR) 화면은 보는 사람을 몰라 광고 카드를 HTML 에 실어 보내고, 하이드레이션 뒤 세션을 읽어 유료 플랜이면
 * 숨긴다(AdFreeGate). 그 사이 광고 카드가 한 번 그려졌다 사라진다 — 유료 플랜(소유자 계정 포함)은 **화면마다** 광고판이 깜박였다.
 * 판정을 localStorage 에 두면 다음 화면부터는 그리기 전(app/layout.tsx AD_FREE_SCRIPT → html[data-ad-free="1"])에 숨긴다.
 *
 * 값: "1" 광고 없음(유료 플랜 · 관리자 제외) · "0" 광고 있음. 로그아웃 뒤 첫 화면이 세션을 읽어 "0" 으로 되돌린다.
 * 관리자는 광고 자리를 확인해야 하므로 유료 플랜이어도 광고를 본다(AdFreeGate 와 같은 규칙 · lib/ads/ad-free adFreeForViewer).
 */
export const AD_FREE_STORAGE_KEY = "nz_ad_free";
export const AD_FREE_ATTR = "data-ad-free";

export function rememberAdFree(adFree: boolean): void {
  try {
    localStorage.setItem(AD_FREE_STORAGE_KEY, adFree ? "1" : "0");
  } catch {
    /* 저장 공간이 막힌 브라우저 — 종전처럼 하이드레이션 뒤에만 숨긴다 */
  }
  try {
    if (adFree) document.documentElement.setAttribute(AD_FREE_ATTR, "1");
    else document.documentElement.removeAttribute(AD_FREE_ATTR);
  } catch {
    /* SSR 등 */
  }
}
