/**
 * [1076] 자동 로그인(로그인 유지) — 소유자 2026-10-18 "회원가입이 잘 보이도록 · 자동 로그인도 할 수 있도록".
 *
 * ── 사실 ─────────────────────────────────────────────────────────────────────
 * Auth.js 세션 쿠키(authjs.session-token)는 기본 30일(Expires 가 붙는 영구 쿠키 · 하루마다 연장)이라
 * 브라우저를 닫았다 열어도 로그인은 **이미** 유지된다(로컬 실측 2026-10-18: Expires = 로그인 + 30일).
 * 그래서 "자동 로그인"은 새 기능이 아니라 **켜고 끌 수 있게** 하는 일이다 — 공용 PC 에서는 끄고 싶다.
 *
 * ── 어떻게(끈 경우) ──────────────────────────────────────────────────────────
 * Auth.js 는 로그인마다 쿠키 수명을 달리 줄 수 없다(session.maxAge 는 전역). 대신 두 쿠키로 "브라우저를
 * 닫았다"를 안다:
 *   nz_keep=0  — 영구(30일). "끄기"를 골랐다는 뜻. 로그인 화면이 다음에 이 값을 읽어 체크를 비워 둔다.
 *   nz_sess=1  — 브라우저 세션 쿠키(Max-Age 없음). 브라우저를 닫으면 사라진다.
 * 미들웨어는 문서 요청에서 [세션 쿠키 있음 · nz_keep=0 · nz_sess 없음] 이면 "닫았다 열었다"로 보고
 * 세션 쿠키(조각 포함)·nz_keep·nz_authed 를 지운 뒤 같은 주소로 302 — 두 번째 요청은 비회원이다.
 * nz_keep 을 같이 지우므로 세션 쿠키 삭제가 어떤 이유로 안 먹어도 되돌이표(redirect loop)는 없다.
 * 켠 경우(기본)는 쿠키를 심지 않는다 — 30일 유지 그대로.
 *
 * 이 파일은 의존성이 없다 — 엣지 미들웨어·클라이언트·node 테스트가 같은 판정을 쓴다.
 */
import { SESSION_COOKIE_NAMES } from "@/lib/auth/authed-hint";

export const KEEP_LOGIN_COOKIE = "nz_keep";
export const KEEP_LOGIN_OFF = "0";
export const SESSION_MARK_COOKIE = "nz_sess";
export const SESSION_MARK_VALUE = "1";
/** nz_keep=0 의 수명 — 세션 쿠키(30일)와 같다 */
export const KEEP_LOGIN_MAX_AGE_SEC = 60 * 60 * 24 * 30;

/** 순수 판정 — 세션을 여기서 끝내야 하는가 */
export function shouldEndSession(input: { hasSession: boolean; keepOff: boolean; hasMark: boolean }): boolean {
  return input.hasSession && input.keepOff && !input.hasMark;
}

/** 요청 쿠키 이름 중 지워야 할 세션 쿠키(조각 `이름.0` 포함) */
export function sessionCookieNamesIn(cookieNames: Iterable<string>): string[] {
  const out: string[] = [];
  for (const name of cookieNames) {
    for (const base of SESSION_COOKIE_NAMES) {
      if (name === base || name.startsWith(`${base}.`)) {
        out.push(name);
        break;
      }
    }
  }
  return out;
}

/** 로그인 화면의 체크 기본값 — 지난번에 껐으면(nz_keep=0) 꺼진 채로 */
export function keepLoginDefault(cookieHeader: string): boolean {
  return !new RegExp(`(?:^|;\\s*)${KEEP_LOGIN_COOKIE}=${KEEP_LOGIN_OFF}(?:;|$)`).test(cookieHeader);
}

/**
 * 클라이언트 — 로그인 직전에 부른다. 켬: nz_keep 삭제 · 끔: nz_keep=0(30일) + nz_sess=1(브라우저 세션).
 * `__Secure-` 세션 쿠키와 달리 이 둘은 비밀이 아니다(사실 두 가지뿐) — HttpOnly 없이 JS 가 심는다.
 */
export function keepLoginCookieStrings(keep: boolean, secure: boolean): string[] {
  const sec = secure ? "; Secure" : "";
  if (keep) {
    return [
      `${KEEP_LOGIN_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${sec}`,
      `${SESSION_MARK_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${sec}`,
    ];
  }
  return [
    `${KEEP_LOGIN_COOKIE}=${KEEP_LOGIN_OFF}; Max-Age=${KEEP_LOGIN_MAX_AGE_SEC}; Path=/; SameSite=Lax${sec}`,
    `${SESSION_MARK_COOKIE}=${SESSION_MARK_VALUE}; Path=/; SameSite=Lax${sec}`,
  ];
}

export function applyKeepLoginChoice(keep: boolean): void {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:";
  for (const c of keepLoginCookieStrings(keep, secure)) document.cookie = c;
}
