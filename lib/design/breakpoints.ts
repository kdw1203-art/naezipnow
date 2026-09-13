/**
 * 반응형 브레이크포인트 — Tailwind 기본 스케일과 동기화.
 *
 * [992 주석 교정] globals.css 에도 폭 기반 미디어쿼리가 있다 — `min-width: 768px`(토큰
 * 값 승격)·`max-width: 767px`(모바일 캡션·입력 확대 방지) 십여 곳. 전부 md 경계 하나라
 * 여기 숫자와 어긋나지 않지만, "하나도 없다" 는 예전 서술은 틀렸다.
 * 레이아웃 분기의 대부분은 Tailwind 유틸리티(`md:` `lg:` `xl:`)로 처리한다.
 * 여기 숫자는 Tailwind v4 기본값과 맞춘 것이다 — md=768, xl=1280.
 * globals.css 의 @theme 에서 --breakpoint-* 를 재정의하면 이 값과 갈라지므로,
 * scripts/check-responsive-qa.mjs 가 그 재정의 여부를 감시한다.
 */

export type Breakpoint = "mobile" | "tablet" | "desktop";

export const BREAKPOINT_PX = {
  mobileMax: 767,
  tabletMin: 768,
  tabletMax: 1279,
  desktopMin: 1280,
} as const;

export const BREAKPOINT_MEDIA = {
  mobile: `(max-width: ${BREAKPOINT_PX.mobileMax}px)`,
  tablet: `(min-width: ${BREAKPOINT_PX.tabletMin}px) and (max-width: ${BREAKPOINT_PX.tabletMax}px)`,
  desktop: `(min-width: ${BREAKPOINT_PX.desktopMin}px)`,
} as const;

/** App Router — headers().get("user-agent") SSR 초기값 힌트 */
export function inferInitialDevice(userAgent: string | null | undefined): "mobile" | "desktop" {
  const ua = userAgent ?? "";
  return /Mobi|Android|iPhone/i.test(ua) ? "mobile" : "desktop";
}

/** SSR 힌트 → breakpoint (tablet은 UA만으로 구분 불가 → mobile 취급) */
export function inferInitialBreakpoint(userAgent: string | null | undefined): Breakpoint {
  return inferInitialDevice(userAgent) === "mobile" ? "mobile" : "desktop";
}
