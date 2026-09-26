/**
 * [1008 · J] 여정 진행 — 이 기기 저장(localStorage). 두 칸을 따로 둔다.
 *
 *  ① 비회원 사본 JOURNEY_LOCAL_KEY — 로그인하지 않고 쌓은 진행. 로그인 뒤 처음 열면 계정 것과 한 번 합치고 비운다
 *     (lib/journey/client-store.ts). 이 기기에서 다음에 로그인하는 사람이 가져간다 — 비회원 때의 진행이니 괜찮다.
 *  ② 계정 사본 JOURNEY_ACCOUNT_KEY — 로그인했지만 계정 저장(PUT)이 실패했을 때 잃지 않게 적어 두는 곳.
 *     **주인 표식**(이메일의 SHA-256 앞 16바이트)을 같이 적고, 주인이 열 때만 읽는다. 비회원 화면은 읽지 않고 지우고,
 *     다른 계정은 합치지 않고 지운다.
 *     [리뷰 C] 예전엔 실패한 계정 진행을 ① 에 적어서, 로그아웃한 뒤 같은 브라우저의 비회원에게 계약일·금액이 보였고
 *     다음에 로그인한 다른 계정에 합쳐졌다(leak.mjs 재현).
 *
 * 키 이름 주의: app/components/JourneyBanner.tsx(옛 배너, 지금은 어디서도 마운트되지 않는다)가
 * "nz_journey" 를 지운다 — 같은 이름을 쓰지 않는다.
 *
 * 전부 try/catch — 프라이빗 모드·저장 차단·용량 초과에서도 화면은 빈 상태로 정상 동작한다.
 */
import {
  emptyJourneyState,
  isJourneyEmpty,
  journeyStateBytes,
  JOURNEY_STATE_MAX_BYTES,
  normalizeJourneyState,
  type JourneyState,
} from "./state";

export const JOURNEY_LOCAL_KEY = "nz_journey_state_v1";
export const JOURNEY_ACCOUNT_KEY = "nz_journey_account_v1";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/* ── ① 비회원 사본 ─────────────────────────────────────────── */

/** 비회원 사본 원문 — 합친 뒤 "그 사이 다른 탭이 새로 적었는가"를 가리는 데 쓴다 */
export function readLocalRaw(): string | null {
  try {
    return storage()?.getItem(JOURNEY_LOCAL_KEY) ?? null;
  } catch {
    return null;
  }
}

/** 원문 → 상태(비었거나 틀리면 빈 상태) */
export function parseLocalJourney(raw: string | null): JourneyState {
  if (!raw || raw.length > JOURNEY_STATE_MAX_BYTES * 2) return emptyJourneyState();
  try {
    return normalizeJourneyState(JSON.parse(raw));
  } catch {
    return emptyJourneyState();
  }
}

export function readLocalJourney(): JourneyState {
  return parseLocalJourney(readLocalRaw());
}

/** 저장 성공 여부 — 실패(저장 차단)면 false. 빈 상태는 키를 지운다. */
export function writeLocalJourney(state: JourneyState): boolean {
  const ls = storage();
  if (!ls) return false;
  try {
    if (isJourneyEmpty(state)) {
      ls.removeItem(JOURNEY_LOCAL_KEY);
      return true;
    }
    if (journeyStateBytes(state) > JOURNEY_STATE_MAX_BYTES) return false;
    ls.setItem(JOURNEY_LOCAL_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalJourney(): void {
  try {
    storage()?.removeItem(JOURNEY_LOCAL_KEY);
  } catch {
    /* 저장 차단 — 지울 것도 없다 */
  }
}

/* ── ② 계정 사본(주인 표식) ─────────────────────────────────── */

export type AccountCopy = {
  state: JourneyState;
  /** 이 사본이 갈라져 나온 서버 상태의 updatedAt(서버 시각) — 서버가 그대로면 사본이 최신이다 */
  base: string | null;
};

type StoredAccountCopy = { v: 1; owner: string; base: string | null; state: unknown };

/**
 * 이 계정(owner)의 저장 못 한 사본. 주인이 다르면(다른 계정) 내용을 쓰지 않고 **지운다** — 합치지 않는다.
 * 없거나 깨졌으면 null.
 */
export function readAccountCopy(owner: string): AccountCopy | null {
  const ls = storage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(JOURNEY_ACCOUNT_KEY);
    if (!raw) return null;
    const o = raw.length <= JOURNEY_STATE_MAX_BYTES * 3 ? (JSON.parse(raw) as Partial<StoredAccountCopy>) : null;
    if (!o || o.v !== 1 || typeof o.owner !== "string" || o.owner !== owner) {
      ls.removeItem(JOURNEY_ACCOUNT_KEY);
      return null;
    }
    return {
      state: normalizeJourneyState(o.state),
      base: typeof o.base === "string" && o.base.length <= 40 ? o.base : null,
    };
  } catch {
    clearAccountCopy();
    return null;
  }
}

export function writeAccountCopy(owner: string, base: string | null, state: JourneyState): boolean {
  const ls = storage();
  if (!ls) return false;
  try {
    if (journeyStateBytes(state) > JOURNEY_STATE_MAX_BYTES) return false;
    const rec: StoredAccountCopy = { v: 1, owner, base, state };
    ls.setItem(JOURNEY_ACCOUNT_KEY, JSON.stringify(rec));
    return true;
  } catch {
    return false;
  }
}

/** 계정 사본을 지운다 — 비회원 화면·세션 없음·저장 성공 뒤 */
export function clearAccountCopy(): void {
  try {
    storage()?.removeItem(JOURNEY_ACCOUNT_KEY);
  } catch {
    /* 저장 차단 — 지울 것도 없다 */
  }
}

/** FNV-1a 32비트(보안 문맥이 아니라 SubtleCrypto 가 없을 때만 — 주인 구분용, 비밀이 아니다) */
function fnv1a32(bytes: Uint8Array, offsetBasis: number): string {
  let h = offsetBasis >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * 계정 사본의 주인 표식 — 이메일(소문자·앞뒤 공백 제거)의 SHA-256 앞 16바이트(hex). 이메일 원문은 기기에 적지 않는다.
 * SubtleCrypto 가 없으면(비보안 문맥) FNV-1a — 같은 기기·같은 주소에서는 늘 같은 값이다.
 */
export async function accountOwnerTag(email: string): Promise<string> {
  const norm = `nz-journey:${email.trim().toLowerCase()}`;
  try {
    const subtle = globalThis.crypto?.subtle;
    if (subtle) {
      const buf = await subtle.digest("SHA-256", new TextEncoder().encode(norm));
      return `s1:${Array.from(new Uint8Array(buf).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("")}`;
    }
  } catch {
    /* 아래 대체 해시로 */
  }
  const bytes = new TextEncoder().encode(norm);
  return `f1:${fnv1a32(bytes, 0x811c9dc5)}${fnv1a32(bytes, 0x050c5d1f)}`;
}
