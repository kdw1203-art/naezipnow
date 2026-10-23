/**
 * [1086 · A8] "방금 가입했다" 표식 — 가입 화면이 남기고, 관심 지역 화면(/welcome)의 전환 집계가 읽는다. 순수(저장소 주입 · 테스트).
 *
 * 왜: GA4 sign_up(광고 전환)이 /welcome 을 **열 때마다**(탭당 1회) 나갔다. /welcome 은 홈의 "관심 지역 수정"으로도
 * 다시 열리는 화면이라 기존 회원의 지역 수정이 가입으로 세졌다. 반대로 메일 인증 링크(새 탭)로 온 가입은
 * 탭이 달라 막을 길이 없었고, 소셜 가입은 따로 구분되지 않았다.
 * 이제 가입 화면이 가입(또는 소셜 버튼)을 누른 순간 이 브라우저에 표식을 남기고(24시간), /welcome 은 표식이 있을 때만
 * sign_up 을 한 번 보낸다(보냈다는 표시 gaSent). 표식은 방법(password·google·kakao·toss)과 시각뿐 — 이메일·id 없음.
 */

export const FRESH_SIGNUP_KEY = "nz_fresh_signup";
export const FRESH_SIGNUP_TTL_MS = 24 * 60 * 60 * 1000;
export const SIGNUP_METHODS = ["password", "google", "kakao", "toss"] as const;
export type SignupMethod = (typeof SIGNUP_METHODS)[number];

export type FreshSignup = { method: SignupMethod; at: number; gaSent?: boolean };

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function asSignupMethod(v: unknown): SignupMethod | null {
  return typeof v === "string" && (SIGNUP_METHODS as readonly string[]).includes(v) ? (v as SignupMethod) : null;
}

export function markFreshSignup(method: SignupMethod, storage: StorageLike | null = defaultStorage(), now = Date.now()): void {
  if (!storage) return;
  try {
    storage.setItem(FRESH_SIGNUP_KEY, JSON.stringify({ method, at: now } satisfies FreshSignup));
  } catch {
    /* 저장 불가 — 전환 집계만 빠진다 */
  }
}

/** 유효한 표식(24시간 안) — 지우지 않는다. 낡았거나 깨졌으면 지우고 null */
export function peekFreshSignup(storage: StorageLike | null = defaultStorage(), now = Date.now()): FreshSignup | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(FRESH_SIGNUP_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<FreshSignup>;
    const method = asSignupMethod(v.method);
    if (!method || typeof v.at !== "number" || now - v.at < -120_000 || now - v.at >= FRESH_SIGNUP_TTL_MS) {
      storage.removeItem(FRESH_SIGNUP_KEY);
      return null;
    }
    return { method, at: v.at, gaSent: v.gaSent === true };
  } catch {
    return null;
  }
}

/**
 * GA sign_up 을 보낼 차례인가 — 유효한 표식이 있고 아직 안 보냈으면 "보냄"으로 적고 방법을 돌려준다(한 번만).
 * 표식 자체는 남긴다(관심 지역 화면이 소셜 가입 귀환을 셀 때 읽는다 · 끝내면 clearFreshSignup).
 */
export function claimSignupConversion(storage: StorageLike | null = defaultStorage(), now = Date.now()): SignupMethod | null {
  const v = peekFreshSignup(storage, now);
  if (!v || v.gaSent || !storage) return null;
  try {
    storage.setItem(FRESH_SIGNUP_KEY, JSON.stringify({ ...v, gaSent: true } satisfies FreshSignup));
  } catch {
    return null;
  }
  return v.method;
}

export function clearFreshSignup(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(FRESH_SIGNUP_KEY);
  } catch {
    /* no-op */
  }
}
