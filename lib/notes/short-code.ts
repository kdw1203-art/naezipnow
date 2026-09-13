/**
 * [995] 임장노트 짧은 링크 — `/n/{code}`. **순수 로직(테스트 가능, 브라우저·서버 공용).**
 *
 * 카드 이미지에 인쇄되는 주소다. uuid 36자를 카드에 찍으면 아무도 안 친다 —
 * 앞 8자(hex)만 쓴다. 8자 = 32비트라 노트 수천 건까지 충돌 확률이 사실상 0이고,
 * 충돌해도 라우트(app/n/[code]/route.ts)가 공개·최신 순으로 하나를 고른다.
 *
 * 코드는 **파생값**이다 — 따로 저장하지 않는다. 컬럼을 추가하면 기존 노트 백필과
 * 두 곳 동기화가 생기는데, uuid 앞 8자는 이미 모든 노트에 있다.
 */

/** 8자 소문자 hex — uuid 의 첫 그룹 */
export const SHORT_CODE_RE = /^[0-9a-f]{8}$/;

export const DEFAULT_SHORT_BASE = "https://naezipnow.com";

/** 카드에 인쇄된 링크로 들어온 방문 — page_view_events.utm_* 에 그대로 찍힌다 */
export const CARD_UTM = { source: "card", medium: "image", campaign: "note-card" } as const;

/** 노트 uuid → 8자 코드(소문자). uuid 가 아니어도 앞 8자를 돌려준다(검증은 isShortCode). */
export function noteShortCode(id: string): string {
  return id.trim().toLowerCase().slice(0, 8);
}

export function isShortCode(s: string): boolean {
  return SHORT_CODE_RE.test(s);
}

function trimBase(base: string): string {
  return base.trim().replace(/\/+$/, "");
}

/** 절대 주소 — 복사·공유 시트·카카오 링크에 쓴다 */
export function shortNoteUrl(id: string, base: string = DEFAULT_SHORT_BASE): string {
  return `${trimBase(base)}/n/${noteShortCode(id)}`;
}

/** 카드에 **인쇄**되는 표기 — 프로토콜 없이 `naezipnow.com/n/xxxxxxxx` */
export function shortNoteLabel(id: string, base: string = DEFAULT_SHORT_BASE): string {
  return shortNoteUrl(id, base).replace(/^https?:\/\//, "");
}

/**
 * `/n/{code}` 가 보내는 곳. 공개 노트를 찾으면 노트 상세, 아니면 공개 노트 목록 —
 * 인쇄된 링크는 되돌릴 수 없으므로 **절대 404 를 내지 않는다**. 둘 다 utm 이
 * 붙어 있어 어드민 트래픽의 UTM 표·공유 유입 표에 잡힌다.
 */
export function cardLandingPath(noteId: string): string {
  return `/notes/${encodeURIComponent(noteId)}?utm_source=${CARD_UTM.source}&utm_medium=${CARD_UTM.medium}&utm_campaign=${CARD_UTM.campaign}`;
}

export const CARD_FALLBACK_PATH = `/notes?utm_source=${CARD_UTM.source}&utm_medium=${CARD_UTM.medium}`;

/**
 * 코드 → uuid 범위. PostgREST 는 `left(id::text, 8) = code` 같은 식 필터를 못 쓴다.
 * 대신 uuid 는 바이트 순서 비교라 hex 문자열 순서와 같으므로, 앞 8자를 고정한
 * 최소·최대 uuid 사이를 PK 인덱스로 훑으면 같은 결과가 나온다.
 */
export function shortCodeUuidRange(code: string): { lo: string; hi: string } {
  return {
    lo: `${code}-0000-0000-0000-000000000000`,
    hi: `${code}-ffff-ffff-ffff-ffffffffffff`,
  };
}
