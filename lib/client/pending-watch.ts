/* [1046 · 성장] 가입 전에 누른 "관심 등록"을 가입 뒤에 마저 담는다.

   왜: 비회원이 단지 화면에서 관심 등록을 누르면 가입 창이 뜨고(soft signup), 가입을 마치면 같은 단지로
   돌아온다. 그런데 단지는 담겨 있지 않아 한 번 더 눌러야 했다 — 가입한 이유(이 단지 새 실거래 알림)가
   첫 화면에서 이뤄지지 않았다. 누른 순간의 단지를 이 브라우저에 적어 두고, 로그인 상태로 그 단지에
   돌아오면 한 번만 담는다.

   지키는 것:
   · 이 브라우저(localStorage)에만 남는다 — 서버로 따로 보내지 않는다. 단지 id·이름·시각 셋뿐.
   · 24시간이 지나면 버린다(메일 인증을 미룬 사람이 며칠 뒤 우연히 담기지 않게).
   · 꺼내는 순간 지운다 — 같은 화면의 버튼 둘(히어로·하단 바)이 동시에 마운트돼도 한 번만 담긴다.
   · 저장소를 못 쓰면(사생활 보호 모드 등) 조용히 아무것도 하지 않는다 — 예전 동작 그대로. */

export const PENDING_WATCH_KEY = "nz_pending_watch";
export const PENDING_WATCH_TTL_MS = 24 * 60 * 60 * 1000;
/** [1052] 이 기록을 남기는 가입 창의 행동 이름(hub-client 의 promptSignup action) — 그 창을 닫으면 기록도 지운다 */
export const PENDING_WATCH_ACTION = "watchlist_add";

export type PendingWatch = { complexId: string; complexName: string; at: number };

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** 관심 등록이 로그인 때문에 막힌 순간 — 그 단지를 적어 둔다 */
export function savePendingWatch(
  complexId: string,
  complexName: string,
  storage: StorageLike | null = defaultStorage(),
  now: number = Date.now(),
): void {
  if (!storage || !complexId) return;
  try {
    storage.setItem(PENDING_WATCH_KEY, JSON.stringify({ complexId, complexName, at: now } satisfies PendingWatch));
  } catch {
    /* 저장 불가 — 예전처럼 다시 누르면 된다 */
  }
}

function read(storage: StorageLike): PendingWatch | null {
  try {
    const raw = storage.getItem(PENDING_WATCH_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<PendingWatch>;
    if (typeof v.complexId !== "string" || typeof v.at !== "number") return null;
    return { complexId: v.complexId, complexName: typeof v.complexName === "string" ? v.complexName : "", at: v.at };
  } catch {
    return null;
  }
}

/** 이 단지에 대한, 아직 유효한 기록이 있는가(지우지 않는다) */
export function hasPendingWatch(
  complexId: string,
  storage: StorageLike | null = defaultStorage(),
  now: number = Date.now(),
): boolean {
  if (!storage) return false;
  const v = read(storage);
  return !!v && v.complexId === complexId && now - v.at >= 0 && now - v.at < PENDING_WATCH_TTL_MS;
}

/**
 * [1052] 기록을 버린다 — 가입 창에서 "로그인 없이 계속 보기"(닫기 · 바깥 누르기 · Esc)를 고른 때.
 * 예전엔 기록이 24시간 남아, 가입을 거절한 사람이 나중에 다른 길로 로그인해 그 단지에 오면 묻지 않고 담겼다.
 */
export function clearPendingWatch(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(PENDING_WATCH_KEY);
  } catch {
    /* 저장소 접근 불가 — 지울 것도 없다 */
  }
}

/**
 * 이 단지의 기록을 꺼내며 지운다. 다른 단지 기록은 그대로 두고, 낡았거나 깨진 기록은 지운다.
 * 반환값이 있으면 호출부가 한 번만 담는다.
 */
export function takePendingWatch(
  complexId: string,
  storage: StorageLike | null = defaultStorage(),
  now: number = Date.now(),
): PendingWatch | null {
  if (!storage) return null;
  const v = read(storage);
  try {
    if (!v || now - v.at < 0 || now - v.at >= PENDING_WATCH_TTL_MS) {
      storage.removeItem(PENDING_WATCH_KEY);
      return null;
    }
    if (v.complexId !== complexId) return null;
    storage.removeItem(PENDING_WATCH_KEY);
    return v;
  } catch {
    return null;
  }
}
