/**
 * [969 · 22] Supabase 세션 쿠키 판독 — 미들웨어가 `auth.getUser()` 를 부를지 결정한다.
 *
 * 왜: `utils/supabase/middleware.ts` 는 매칭되는 모든 요청에서 `supabase.auth.getUser()` 를
 * 불렀다. Supabase 쿠키가 있는 사용자는 캐시된 ISR 페이지를 열 때도 첫 바이트 앞에
 * Supabase Auth 서버 왕복이 붙었다(모바일 TTFB 에 수십~수백 ms). 토큰이 아직 한참
 * 유효하면 갱신할 게 없다 — 만료가 가까울 때만 부르면 같은 보안 수준에서 왕복이 사라진다.
 *
 * 쿠키 형식(@supabase/ssr 0.5+): `sb-<ref>-auth-token` 값은 `base64-` 접두 + base64url 로
 * 인코딩한 세션 JSON(`{access_token, expires_at, ...}`) 이고, 길면 `.0`, `.1` … 로 쪼개진다.
 * 구형 클라이언트는 URL 인코딩된 JSON 을 그대로 넣기도 한다. 둘 다 읽고, 못 읽으면
 * **갱신 쪽(안전한 기본값)** 으로 기운다 — 판독 실패로 로그아웃되는 일은 없어야 한다.
 *
 * 순수 함수만 둔다(Edge 런타임·단위테스트 공용).
 */

export type CookiePair = { name: string; value: string };

const AUTH_COOKIE_RE = /^sb-[a-z0-9-]+-auth-token(?:\.(\d+))?$/;
const BASE64_PREFIX = "base64-";
/** 만료까지 이 초 이하로 남았으면 갱신한다(Supabase 기본 access token 1시간 기준 여유). */
export const REFRESH_SKEW_SEC = 120;

/** `sb-*-auth-token` (+ 청크) 을 이어 붙인 원문. 없으면 null. */
export function joinSupabaseAuthCookie(cookies: readonly CookiePair[]): string | null {
  const chunks: { idx: number; value: string }[] = [];
  for (const c of cookies) {
    const m = AUTH_COOKIE_RE.exec(c.name);
    if (!m) continue;
    chunks.push({ idx: m[1] === undefined ? 0 : Number(m[1]), value: c.value });
  }
  if (chunks.length === 0) return null;
  chunks.sort((a, b) => a.idx - b.idx);
  return chunks.map((c) => c.value).join("");
}

function base64UrlDecode(s: string): string | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    if (typeof atob === "function") {
      const bin = atob(b64 + pad);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }
    return Buffer.from(b64 + pad, "base64").toString("utf8");
  } catch {
    return null;
  }
}

/** 세션 JSON 의 `expires_at`(초). 판독 불가면 null. */
export function readSupabaseSessionExpiry(raw: string): number | null {
  let json: string | null = null;
  if (raw.startsWith(BASE64_PREFIX)) {
    json = base64UrlDecode(raw.slice(BASE64_PREFIX.length));
  } else {
    try {
      json = decodeURIComponent(raw);
    } catch {
      json = raw;
    }
  }
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    const obj = Array.isArray(parsed) ? null : (parsed as Record<string, unknown> | null);
    const exp = obj?.expires_at;
    if (typeof exp === "number" && Number.isFinite(exp)) return exp;
    if (typeof exp === "string" && /^\d+$/.test(exp)) return Number(exp);
    return null;
  } catch {
    return null;
  }
}

export type SessionRefreshDecision =
  | { present: false; refresh: false; reason: "no-cookie" }
  | { present: true; refresh: true; reason: "unreadable" | "expiring" | "expired" }
  | { present: true; refresh: false; reason: "fresh"; secondsLeft: number };

/**
 * 미들웨어가 `getUser()` 를 불러야 하는가.
 *  - 쿠키 없음 → 부르지 않는다(게스트: 왕복 0).
 *  - 판독 불가 → 부른다(안전한 기본값).
 *  - 만료까지 REFRESH_SKEW_SEC 이하 → 부른다(토큰 갱신·쿠키 재발급).
 *  - 그 외 → 부르지 않는다(토큰은 그대로 유효, 서버 컴포넌트/라우트가 쿠키를 읽는다).
 */
export function decideSessionRefresh(
  cookies: readonly CookiePair[],
  nowMs: number = Date.now(),
  skewSec: number = REFRESH_SKEW_SEC,
): SessionRefreshDecision {
  const raw = joinSupabaseAuthCookie(cookies);
  if (raw === null) return { present: false, refresh: false, reason: "no-cookie" };
  const exp = readSupabaseSessionExpiry(raw);
  if (exp === null) return { present: true, refresh: true, reason: "unreadable" };
  const secondsLeft = exp - Math.floor(nowMs / 1000);
  if (secondsLeft <= 0) return { present: true, refresh: true, reason: "expired" };
  if (secondsLeft <= skewSec) return { present: true, refresh: true, reason: "expiring" };
  return { present: true, refresh: false, reason: "fresh", secondsLeft };
}
