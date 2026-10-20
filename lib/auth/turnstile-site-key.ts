/**
 * [1080] Turnstile 사이트 키 — 화면(클라이언트)·서버 공용. 값이 없으면 캡차 미도입(위젯을 그리지 않는다).
 * 켤 때는 NEXT_PUBLIC_TURNSTILE_SITE_KEY 와 TURNSTILE_SECRET_KEY 를 **함께** 넣는다(lib/auth/verify-turnstile 주석).
 */
export function turnstileSiteKey(): string | null {
  const k = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  return k ? k : null;
}

/** Turnstile 스크립트·챌린지 프레임 원점(CSP script-src · frame-src) */
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
