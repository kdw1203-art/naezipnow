/**
 * [1007 · V2a-1] 로그인 힌트 쿠키 — "세션이 있는가"를 클라이언트 JS 가 **요청 없이** 아는 장치.
 *
 * ── 왜 필요한가(실측 2026-09-19, 24h) ────────────────────────────────────────
 * Auth.js 세션 쿠키(authjs.session-token)는 HttpOnly 라 스크립트에서 보이지 않는다.
 * 그래서 헤더 아바타·알림 벨·최근 본 단지 같은 클라이언트 섬이 "로그인했는지"를 알려면
 * 마운트 즉시 서버를 불러야 했고, 그 호출은 **비회원·봇에게도** 나갔다:
 *   /api/auth/session 1,299 · /api/notifications/unread-count 982 · /api/me/recent-complexes 203 (회/일)
 * 사람 페이지뷰는 하루 ~17 이니 99% 가 JS 를 실행하는 크롤러의 요청이다.
 *
 * ── 어떻게 ───────────────────────────────────────────────────────────────────
 * 미들웨어가 세션 쿠키의 **유무**(검증이 아니라 존재)만 보고 `nz_authed=1` 을 심거나 지운다.
 * 단, 힌트와 세션 유무가 **다를 때만** Set-Cookie 한다 — 미들웨어가 Set-Cookie 를 하면 그
 * 응답은 no-store 가 되어 CDN 공유 캐시가 죽기 때문에(middleware.ts applySecurityHeaders),
 * 전이 순간(로그인 직후 첫 문서 · 로그아웃 직후 첫 문서) 한 번만 붙인다.
 *
 * 클라이언트는 힌트가 없으면 "비회원 확정" 으로 보고 세션·개인화 API 를 부르지 않는다.
 * 힌트가 있으면 지금처럼 조회한다(힌트는 "쿠키가 있다" 는 뜻이지 "유효하다" 는 뜻이 아니다 —
 * 만료된 토큰이면 /api/auth/session 이 null 을 주고 화면은 종전처럼 게스트가 된다).
 *
 * 이 파일은 의존성이 없다 — 엣지 미들웨어·클라이언트·node 테스트가 같은 판정을 쓴다.
 */

export const AUTHED_HINT_COOKIE = "nz_authed";
export const AUTHED_HINT_VALUE = "1";
/** 1년 — 세션 쿠키(30일)보다 길어도 된다. 세션이 사라지면 미들웨어가 지운다. */
export const AUTHED_HINT_MAX_AGE_SEC = 60 * 60 * 24 * 365;

/**
 * Auth.js v5 기본 쿠키 이름(secure 접두 포함) + 레거시 next-auth 이름.
 * lib/site-private-edge.ts 의 목록과 같다(그쪽은 검증까지, 여기는 유무만).
 */
export const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
] as const;

/** 미들웨어가 내릴 결정 — set(심는다) · clear(지운다) · null(아무것도 하지 않는다) */
export type AuthedHintDecision = "set" | "clear" | null;

/**
 * 힌트를 어떻게 할지 — 순수 판정.
 * 세션 있음 + 힌트 없음 → set · 세션 없음 + 힌트 있음 → clear · 같으면 null.
 */
export function decideAuthedHint(input: { hasSession: boolean; hasHint: boolean }): AuthedHintDecision {
  if (input.hasSession && !input.hasHint) return "set";
  if (!input.hasSession && input.hasHint) return "clear";
  return null;
}

/**
 * 요청 쿠키 이름 목록에 세션 쿠키가 있는가.
 * Auth.js 는 4KB 를 넘는 토큰을 `이름.0`, `이름.1` 로 쪼갠다 — 그 조각도 "있음" 이다.
 */
export function hasSessionCookieName(cookieNames: Iterable<string>): boolean {
  for (const name of cookieNames) {
    for (const base of SESSION_COOKIE_NAMES) {
      if (name === base) return true;
      if (name.startsWith(`${base}.`) && /^\d+$/.test(name.slice(base.length + 1))) return true;
    }
  }
  return false;
}

/**
 * Auth.js 응답의 Set-Cookie 목록에서 힌트 결정을 읽는다 — 로그인·로그아웃 **그 응답**에 힌트를 같이 싣기 위해.
 *
 * 왜 미들웨어 전이만으로 부족한가: 비밀번호 로그인은 `signIn(…, { redirect: false })` 뒤 `router.push`
 * (소프트 내비게이션)로 옮긴다. 목적지 RSC 가 라우터 캐시(프리페치)에 있으면 네트워크 요청이 없어
 * 미들웨어가 힌트를 심을 기회가 없고, 헤더는 다음 문서 로드까지 게스트로 남는다. 세션 쿠키를
 * 심거나 지우는 응답은 /api/auth/* 하나뿐이므로 그 자리에서 같이 심는다(미들웨어는 예비).
 *  - 세션 쿠키를 비지 않은 값으로 심는 줄이 있으면 "set"
 *  - 세션 쿠키를 빈 값·Max-Age≤0 으로 지우는 줄만 있으면 "clear"
 *  - 세션 쿠키 줄이 없으면 null
 */
export function authedHintFromSetCookies(setCookies: readonly string[]): AuthedHintDecision {
  let decision: AuthedHintDecision = null;
  for (const raw of setCookies) {
    const [pair, ...attrs] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    if (!hasSessionCookieName([name])) continue;
    const value = pair.slice(eq + 1).trim();
    const maxAgeAttr = attrs.map((a) => /^\s*max-age\s*=\s*(-?\d+)\s*$/i.exec(a)).find(Boolean);
    const cleared = value === "" || (maxAgeAttr !== undefined && Number(maxAgeAttr![1]) <= 0);
    if (!cleared) return "set";
    decision = "clear";
  }
  return decision;
}

/** 라우트 핸들러가 응답에 덧붙일 Set-Cookie 한 줄 — 미들웨어의 response.cookies.set 과 같은 속성. */
export function authedHintSetCookieHeader(decision: "set" | "clear", secure: boolean): string {
  const base = decision === "set" ? `${AUTHED_HINT_COOKIE}=${AUTHED_HINT_VALUE}; Max-Age=${AUTHED_HINT_MAX_AGE_SEC}` : `${AUTHED_HINT_COOKIE}=; Max-Age=0`;
  return `${base}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** `document.cookie` 꼴 문자열("a=1; b=2")에 힌트가 켜져 있는가 — 순수. */
export function hasAuthedHint(cookieString: string | null | undefined): boolean {
  if (!cookieString) return false;
  for (const part of cookieString.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name !== AUTHED_HINT_COOKIE) continue;
    return part.slice(eq + 1).trim() === AUTHED_HINT_VALUE;
  }
  return false;
}

/**
 * 클라이언트 — 지금 이 브라우저에 로그인 힌트가 있는가.
 * 서버 렌더·문서 없음·쿠키 접근 예외(일부 프라이버시 모드)는 전부 false(= 조회하지 않는다).
 */
export function readAuthedHint(): boolean {
  if (typeof document === "undefined") return false;
  try {
    return hasAuthedHint(document.cookie);
  } catch {
    return false;
  }
}
