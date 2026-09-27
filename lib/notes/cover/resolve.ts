/**
 * 목록 커버 한 곳 — "이 노트의 썸네일 주소는 무엇인가". **순수 모듈**.
 *
 * 노트 목록 격자·피드(lib/notes/feed-note)·동네 피드(lib/town/feed)·(보고서의 한 줄 변경으로) 공개 프로필·서재·
 * OG 가 전부 이 함수를 부른다 — 커버 규칙이 화면마다 따로 늙지 않게.
 *
 *  · metadata.cover 가 있고 **지금 노트 원문으로 다시 검증해도 통과**하면 → `/api/og/note-cover/{id}?v=…`
 *    (저장 뒤 본문에서 그 숫자가 지워졌으면 옛 숫자를 계속 걸어 두지 않는다 — 사진으로 돌아간다)
 *  · 아니면 지금처럼 첫 사진(없으면 null → 화면의 단색 타일)
 */
import { coverImagePath, coverVersion, readCoverSpec, type CoverSpec } from "./spec";
import { buildNumberCorpus, verifyCoverText, type CoverNote } from "./verify";
import { coverPhotoOf } from "./rules";

export type ResolvedCover = {
  /** 목록에 거는 주소 — 템플릿이면 렌더 라우트, 아니면 첫 사진 */
  url: string | null;
  /** 템플릿 썸네일인가(글자가 그림 안에 있으므로 목록이 제목 오버레이를 다시 그릴 필요가 없다) */
  template: boolean;
  /** 검증을 통과한 저장값(없으면 null) */
  spec: CoverSpec | null;
  /** photo 변형이 깔 사진(허용 주소) — 그 밖에는 null */
  photoUrl: string | null;
};

function firstPhoto(note: CoverNote): string | null {
  const photos = Array.isArray(note.photos) ? note.photos : [];
  const first = photos.find((p) => typeof p === "string" && p.trim());
  return typeof first === "string" ? first : null;
}

/** 저장된 커버가 지금 노트로도 유효한가 — 렌더 라우트도 같은 판정을 쓴다 */
export function validCoverSpec(note: CoverNote): CoverSpec | null {
  const spec = readCoverSpec(note.metadata);
  if (!spec) return null;
  return verifyCoverText(spec, buildNumberCorpus(note)).ok ? spec : null;
}

export function resolveNoteCover(note: CoverNote & { id: string }, opts: { photoHost?: string | null } = {}): ResolvedCover {
  const spec = validCoverSpec(note);
  if (spec) {
    const photoUrl = spec.variant === "photo" ? (opts.photoHost === undefined ? coverPhotoOf(note) : coverPhotoOf(note, opts.photoHost)) : null;
    return { url: coverImagePath(note.id, coverVersion(spec, photoUrl)), template: true, spec, photoUrl };
  }
  return { url: firstPhoto(note), template: false, spec: null, photoUrl: null };
}

/** 목록 카드용 한 줄 — 주소만 */
export function noteCoverUrl(note: CoverNote & { id: string }): string | null {
  return resolveNoteCover(note).url;
}
