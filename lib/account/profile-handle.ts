/**
 * [1058] 공개 프로필 핸들·소개의 순수 규칙 — ProfileEditSheet(클라이언트)·PATCH /api/me/profile(서버)·
 * node:test 가 같은 규칙을 부른다. `server-only`·React 를 import 하지 않는다.
 *
 * 핸들: 소문자 영문·숫자·밑줄 3~20자. 공개 프로필 주소(/u/<handle>)가 되므로 라우트 이름과 겹치는
 * 낱말은 막는다. 저장은 소문자(profiles.handle 은 lower(handle) 유니크).
 * 소개: 120자(줄바꿈은 공백으로). 비우면 ''(profiles.bio 는 NOT NULL default '').
 */

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;
export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
export const BIO_MAX = 120;

/** 라우트·예약어와 겹치는 핸들 — /u/<handle> 주소가 다른 화면처럼 읽히지 않게 */
export const RESERVED_HANDLES: readonly string[] = [
  "admin",
  "me",
  "login",
  "signup",
  "notes",
  "map",
  "town",
  "api",
  "my",
  "u",
];

/** 입력 다듬기 — 앞뒤 공백·앞의 @ 제거, 소문자. 빈 값은 "" */
export function normalizeHandle(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

export type HandleValidation =
  | { ok: true; handle: string | null }
  | { ok: false; error: string };

/** 빈 값은 "핸들 없음"(null) — 선택 항목이다. */
export function validateHandle(raw: string | null | undefined): HandleValidation {
  const handle = normalizeHandle(raw);
  if (!handle) return { ok: true, handle: null };
  /* 예약어를 먼저 — "me"·"u" 는 길이로도 걸리지만 이유는 예약어다 */
  if (RESERVED_HANDLES.includes(handle)) {
    return { ok: false, error: "쓸 수 없는 핸들 · 다른 낱말로" };
  }
  if (!HANDLE_RE.test(handle)) {
    return {
      ok: false,
      error: `핸들은 영문 소문자·숫자·밑줄 ${HANDLE_MIN}~${HANDLE_MAX}자`,
    };
  }
  return { ok: true, handle };
}

export type BioValidation = { ok: true; bio: string } | { ok: false; error: string };

/** 줄바꿈·연속 공백은 한 칸으로. 빈 값은 ""(소개 없음). */
export function validateBio(raw: string | null | undefined): BioValidation {
  const bio = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (bio.length > BIO_MAX) {
    return { ok: false, error: `소개는 ${BIO_MAX}자 이내` };
  }
  return { ok: true, bio };
}

/** Postgres 유니크 위반(23505) 또는 핸들 유니크 인덱스 이름이 든 오류 메시지 — 409 로 옮긴다 */
export function isHandleConflict(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  return /profiles_handle_key|profiles_handle/i.test(String(err.message ?? ""));
}
