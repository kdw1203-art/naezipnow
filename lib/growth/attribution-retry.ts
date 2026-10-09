/**
 * [1052 · 성장] 가입 경로 잇기(TrafficRecorder → POST /api/me/attribution)를 언제 다시 묻나 — 순수(단위 시험 대상).
 *
 * 예전 규칙의 두 구멍:
 *  · 끝남 표시가 브라우저 하나에 "1" 하나였다 — 한 계정이 끝내면 같은 브라우저로 가입한 다른 계정은 영영 안 이어졌다.
 *  · 실패(네트워크 · 5xx · 4xx 모두)면 아무것도 적지 않아 화면을 옮길 때마다 다시 보냈다 — 끝이 없었다.
 *
 * 지금 규칙:
 *  · 끝남 표시는 계정별 — 열쇠는 이메일의 해시(SHA-256 앞 32자). 이메일 원문은 어느 저장소에도 두지 않는다.
 *  · 2xx = 끝(다시 묻지 않는다) · 4xx = 끝(서버가 "이 키로는 안 된다"고 답했다 — 다시 보내도 같다).
 *    단 401(세션이 그사이 끊김)은 이 계정에 대한 답이 아니라 이 탭에서만 멈춘다. 408 · 429 는 잠깐의 일이라 5xx 처럼.
 *  · 네트워크 실패 · 5xx = 이 탭 세션에서 한 번만 더(다음 화면 이동 때). 그래도 안 되면 다음 탭 세션에서.
 */

/** localStorage — 계정(이메일 해시)별 끝남 표시. 값 "1" */
export const ATTR_DONE_PREFIX = "nz_attr_done:";
/** sessionStorage — 이 탭에서 보낸 횟수 */
export const ATTR_TRY_PREFIX = "nz_attr_try:";
/** 예전 브라우저 전체 끝남 표시(계정 구분 없음) — 읽지 않고 지운다. 이미 이어진 계정은 서버가 "exists"(2xx)로 답한다 */
export const LEGACY_ATTR_DONE_KEY = "nz_attr_done";
/** 탭 세션당 보내는 횟수 상한 — 첫 시도 + 다시 한 번 */
export const ATTR_MAX_TRIES_PER_TAB = 2;

export type AttributionOutcome = "done" | "retry" | "stop";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** 응답 상태 → 다음 할 일. null = 네트워크 실패(응답 없음) */
export function attributionOutcome(status: number | null): AttributionOutcome {
  if (status === null) return "retry";
  if (status >= 200 && status < 300) return "done";
  if (status === 401) return "stop";
  if (status === 408 || status === 429 || status >= 500) return "retry";
  if (status >= 400) return "done";
  return "retry";
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fnv1a32(s: string, seed: number): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 끝남 표시의 열쇠 — 이메일(소문자 · 앞뒤 공백 제거)의 SHA-256 앞 32자.
 * Web Crypto 가 없는 환경(https 아닌 개발 주소 등)에서는 FNV 해시 16자 — 열쇠 구분용일 뿐 비밀이 아니다.
 * 빈 이메일이면 null.
 */
export async function emailMarker(email: string | null | undefined): Promise<string | null> {
  const norm = String(email ?? "").trim().toLowerCase();
  if (!norm) return null;
  const input = `nz-attr:${norm}`;
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const buf = await subtle.digest("SHA-256", new TextEncoder().encode(input));
      return hex(new Uint8Array(buf)).slice(0, 32);
    } catch {
      /* 아래 대체 해시 */
    }
  }
  return fnv1a32(input, 0).toString(16).padStart(8, "0") + fnv1a32(input, 0x9e3779b9).toString(16).padStart(8, "0");
}

function safeGet(s: StorageLike | null, key: string): string | null {
  try {
    return s ? s.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSet(s: StorageLike | null, key: string, value: string): boolean {
  try {
    if (!s) return false;
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * 지금 보낼까. 보낼 거면 이 탭의 횟수를 먼저 올린다(보내는 도중 화면을 옮겨도 두 번 세지 않게).
 * 저장소를 못 쓰면 보내지 않는다 — 끝남을 적을 곳이 없으면 화면마다 다시 보내게 된다.
 */
export function claimAttributionAttempt(marker: string, local: StorageLike | null, session: StorageLike | null): boolean {
  if (!local || !session) return false;
  if (safeGet(local, ATTR_DONE_PREFIX + marker) === "1") return false;
  const tries = Number(safeGet(session, ATTR_TRY_PREFIX + marker) ?? "0");
  if (Number.isFinite(tries) && tries >= ATTR_MAX_TRIES_PER_TAB) return false;
  return safeSet(session, ATTR_TRY_PREFIX + marker, String((Number.isFinite(tries) ? tries : 0) + 1));
}

/** 응답을 받은 뒤 — 끝이면 계정 표시, 멈춤이면 이 탭 횟수를 다 쓴 것으로 */
export function recordAttributionOutcome(
  marker: string,
  outcome: AttributionOutcome,
  local: StorageLike | null,
  session: StorageLike | null,
): void {
  if (outcome === "done") safeSet(local, ATTR_DONE_PREFIX + marker, "1");
  else if (outcome === "stop") safeSet(session, ATTR_TRY_PREFIX + marker, String(ATTR_MAX_TRIES_PER_TAB));
}
