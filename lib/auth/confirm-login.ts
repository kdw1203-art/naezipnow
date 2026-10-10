/**
 * [1053] 메일 인증 뒤 자동 로그인 — 순수 규칙(tests/unit/auth-1053.test.ts).
 *
 * 소유자 답(2026-10-10): "인증 뒤 자동 로그인" — 인증 메일은 그대로 두고, 링크를 누르면 바로 로그인.
 * 예전: 링크 → /login?verified=1 → 비밀번호를 한 번 더 입력 → /welcome (가입 9단계 중 2단계).
 * 지금: 링크 → Supabase 가 메일을 확인한 그 세션 토큰으로 사이트 로그인(Credentials "email-confirm") → /welcome.
 * 토큰은 "방금 인증한" 계정만 받는다 — 인증 시각이 CONFIRM_LOGIN_WINDOW_MS 안이어야 한다(오래된 Supabase 세션 토큰을
 * 들고 와 로그인하는 길이 되지 않게). 실패하면 예전 길(로그인 화면 · 인증 완료 안내)로 그대로 간다.
 */
export const CONFIRM_LOGIN_WINDOW_MS = 60 * 60_000;

export function isFreshConfirmation(confirmedAtMs: number, nowMs: number): boolean {
  if (!Number.isFinite(confirmedAtMs)) return false;
  const age = nowMs - confirmedAtMs;
  /* 시계 차이로 조금 미래일 수는 있다(2분) */
  return age >= -120_000 && age <= CONFIRM_LOGIN_WINDOW_MS;
}

/**
 * 인증 뒤 갈 곳 — 가입 화면이 실어 보낸 목적지(/login?verified=1&callbackUrl=/welcome…)에서 callbackUrl 을 꺼낸다.
 * 내부 경로만(열린 리다이렉트 금지). 없으면 /welcome(관심 지역 고르기 — 가입 3단계).
 */
export function afterConfirmDestination(next: string | null | undefined): string {
  const raw = String(next ?? "");
  const internal = (p: string | null) => (p && p.startsWith("/") && !p.startsWith("//") && !p.startsWith("/\\") ? p : null);
  if (raw.startsWith("/login")) {
    try {
      const u = new URL(raw, "https://x.invalid");
      const cb = internal(u.searchParams.get("callbackUrl"));
      if (cb && !cb.startsWith("/login")) return cb;
    } catch {
      /* 형식이 깨졌으면 기본 */
    }
    return "/welcome";
  }
  return internal(raw) ?? "/welcome";
}

/** JWT 의 sub(서명 검증 없음 — 속도 제한 키로만 쓴다). 형식이 아니면 null */
export function jwtSubject(token: string): string | null {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(
      typeof atob === "function" ? atob(b64 + "===".slice((b64.length + 3) % 4)) : Buffer.from(b64, "base64").toString("utf8"),
    ) as { sub?: unknown };
    return typeof json.sub === "string" && /^[0-9a-f-]{8,64}$/i.test(json.sub) ? json.sub : null;
  } catch {
    return null;
  }
}
