/* [1043 · 성능] 점검 로봇 세션 표식 — 실사용 지표(web_vitals)에 우리 자신의 측정이 섞이지 않게.
 *
 * 2026-10-06 실측: 최근 7일 web_vitals 450행 중 126행(28%)이 운영 화면을 캡처·점검하던 자동 브라우저의 것이었다
 * (사람 브라우저 UA 를 쓰고, 지표 비콘을 막지 않은 예전 캡처 스크립트). 그 세션은 캐시가 비어 있고 요청을 가로채
 * 글꼴이 매번 늦게 바뀐다 — /my CLS 0.246 · /search CLS 0.816 · /town LCP 5.9초 · 결제 화면 LCP 6.4초가 전부 그 표본이었다
 * (같은 기간 사람 표본: /town LCP 0.17초 · /search CLS 0).
 * 점검 스크립트는 localStorage 에 nz_probe = "1" 을 심고 들어온다(scripts/review/*.mjs). 그 표식이 있으면 지표를 보내지 않는다.
 * UA 로는 가를 수 없다(사람 UA 를 쓴다) — 그래서 보내는 쪽이 스스로 밝힌다. */
export const PROBE_STORAGE_KEY = "nz_probe";

export function isProbeSession(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(PROBE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * 표식이 생기기 전(~2026-10-06)의 점검 로봇 표본 — 이 두 UA 는 캡처 스크립트의 고정 문자열이다
 * (크롬 141 은 2025-10 판이라 2026-10 의 사람 브라우저(153~154)와 겹치지 않는다 · iOS 18.0·18.5 사파리도 같다 — 사람 표본은 26·27 판이다).
 * 관리 › 성능이 이 기간의 이 UA 를 빼고 센다. 기한 뒤의 같은 UA 는 사람으로 본다(표식이 로봇을 가른다).
 */
export const LEGACY_PROBE_UAS: readonly string[] = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
];
export const LEGACY_PROBE_UNTIL = "2026-10-08T00:00:00Z";

export function isLegacyProbeSample(userAgent: string | null | undefined, createdAt: string | null | undefined): boolean {
  if (!userAgent || !LEGACY_PROBE_UAS.includes(userAgent)) return false;
  const t = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isFinite(t) && t < Date.parse(LEGACY_PROBE_UNTIL);
}
