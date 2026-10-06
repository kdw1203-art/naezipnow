/* [1040 · 로그인·가입 기능] 로그인·가입·비밀번호 화면이 함께 쓰는 순수 규칙 — 서버·클라이언트·테스트 공용.
 *
 *  · 최근 로그인 수단(이 기기) — 어느 단추로 들어왔는지 다음 방문에 표시한다(수단 이름만 저장 · 이메일은 저장하지 않는다)
 *  · 시도 한도 대기 시간 — 서버가 code 로 싣는 `rate_limited_<초>` 읽기 · "4분 12초" 표기
 *  · Caps Lock 판정
 *  · 비밀번호 찾기 → 메일 → 재설정 → 로그인 사이에서 "원래 가려던 곳"(next) 넘기기
 *  · 가입 3단계(계정 → 메일 인증 → 관심 지역)
 * 문구는 사실 낱말(docs/design-system.md). */

export type LoginMethod = "password" | "google" | "kakao" | "toss";
const LOGIN_METHODS: readonly LoginMethod[] = ["password", "google", "kakao", "toss"];
const LAST_LOGIN_KEY = "nz_last_login";

export function isLoginMethod(v: unknown): v is LoginMethod {
  return typeof v === "string" && (LOGIN_METHODS as readonly string[]).includes(v);
}

/** 이 기기에서 마지막으로 쓴 로그인 수단을 적는다(저장소 차단이면 조용히 넘어간다) */
export function rememberLoginMethod(method: LoginMethod): void {
  try {
    window.localStorage.setItem(LAST_LOGIN_KEY, method);
  } catch {
    /* 저장소 차단 — 표시를 못 할 뿐 */
  }
}

export function recallLoginMethod(): LoginMethod | null {
  try {
    const v = window.localStorage.getItem(LAST_LOGIN_KEY);
    return isLoginMethod(v) ? v : null;
  } catch {
    return null;
  }
}

/** 소셜 로그인이 실패로 돌아왔을 때 — 누르기 전에 적어 둔 표시를 지운다 */
export function forgetLoginMethod(): void {
  try {
    window.localStorage.removeItem(LAST_LOGIN_KEY);
  } catch {
    /* ignore */
  }
}

/* ── 시도 한도 ───────────────────────────────────────────────────────────── */

export const RATE_LIMITED_CODE = "rate_limited";

/** 서버 → 화면 코드. 초는 1초~1시간으로 자른다 */
export function rateLimitedCode(retryAfterSec: number | null | undefined): string {
  const s = Number(retryAfterSec);
  if (!Number.isFinite(s) || s <= 0) return RATE_LIMITED_CODE;
  return `${RATE_LIMITED_CODE}_${Math.min(3600, Math.max(1, Math.ceil(s)))}`;
}

/**
 * `${error} ${code}` 에서 시도 한도 여부와 남은 초를 읽는다.
 * 한도가 아니면 null · 한도인데 초를 모르면 0.
 */
export function rateLimitedSeconds(detail: string | null | undefined): number | null {
  const d = String(detail ?? "").toLowerCase();
  if (!d.includes(RATE_LIMITED_CODE)) return null;
  const m = d.match(/rate_limited_(\d{1,4})/);
  return m ? Math.min(3600, Number(m[1])) : 0;
}

/** 남은 시간 표기 — 61 → "1분 1초" · 45 → "45초" · 120 → "2분" */
export function waitLabel(totalSec: number): string {
  const s = Math.max(0, Math.ceil(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}초`;
  return r === 0 ? `${m}분` : `${m}분 ${r}초`;
}

/* ── Caps Lock ───────────────────────────────────────────────────────────── */

/** 키 이벤트에서 Caps Lock 이 켜져 있는가(지원하지 않는 환경은 false) */
export function capsLockOn(e: { getModifierState?: (key: "CapsLock") => boolean }): boolean {
  try {
    return typeof e.getModifierState === "function" && e.getModifierState("CapsLock") === true;
  } catch {
    return false;
  }
}

/* ── 가려던 곳 넘기기 ────────────────────────────────────────────────────── */

/** 내부 경로만(`/` 로 시작 · `//`·역슬래시·제어문자 없음 · 인증 화면 자신은 제외). 아니면 null */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v.startsWith("/") || v.startsWith("//") || /[\\\u0000-\u001f]/.test(v) || v.length > 512) return null;
  if (v === "/" || /^\/(login|signup|logout|forgot-password|reset-password)(\/|\?|$)/.test(v)) return null;
  return v;
}

/** 로그인 화면 주소 — 가려던 곳이 있으면 callbackUrl 로 */
export function loginHrefWithNext(next: string | null | undefined): string {
  const n = safeNextPath(next);
  return n ? `/login?callbackUrl=${encodeURIComponent(n)}` : "/login";
}

/** 비밀번호 찾기 화면 주소 — 가려던 곳이 있으면 callbackUrl 로 */
export function forgotHrefWithNext(next: string | null | undefined): string {
  const n = safeNextPath(next);
  return n ? `/forgot-password?callbackUrl=${encodeURIComponent(n)}` : "/forgot-password";
}

/** 재설정 메일 링크에 싣는 꼬리 — 토큰 뒤에 붙인다 */
export function resetLinkNextSuffix(next: string | null | undefined): string {
  const n = safeNextPath(next);
  return n ? `&next=${encodeURIComponent(n)}` : "";
}

/* ── 가입 단계 ───────────────────────────────────────────────────────────── */

export const SIGNUP_STEPS = ["계정", "메일 인증", "관심 지역"] as const;
export type SignupStepIndex = 0 | 1 | 2;
