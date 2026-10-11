/**
 * [1057 · C1] 팔로우한 작성자의 새 노트 — 순수 조립(라우트 · /my 섹션 · node:test 공용). DB 를 모른다.
 *
 * 예전 /api/me/follows/feed 는 (1) 사이트 전체 최신 공개 노트 100건만 긁어 팔로우한 사람 것을 걸러서 오래된 노트는
 * 영영 안 보였고, (2) `saves` 를 "평균 점수 × 40 + 체크 수"로 지어냈고(저장 수 자료가 없다), (3) 작성자 라벨이
 * 이메일 앞 두 글자를 그대로 썼다. 여기서는 행(author_email in 팔로우 목록)을 받아 화면 항목으로만 접는다 —
 * `saves` 없음 · 작성자 라벨은 노트의 author_label → 프로필 이름 → 공용 마스킹(maskNoteAuthor) 순 · 이메일은 내려가지 않는다.
 */
import { maskNoteAuthor } from "@/lib/town/shared";

/** inspection_notes 에서 읽는 열 — 목록 한 줄에 쓰는 것만(jsonb 없음) */
export type FollowedNoteRow = {
  id: string;
  author_email: string;
  author_label: string | null;
  title: string;
  apt_name: string | null;
  region: string | null;
  created_at: string;
};

/** profiles 의 공개 표시 재료(핸들·이름). 행이 없으면 둘 다 null */
export type AuthorProfile = { handle: string | null; name: string | null };

export type FollowedNoteItem = {
  id: string;
  title: string;
  authorLabel: string;
  authorHandle: string | null;
  regionLabel: string;
  /** ISO 시각(created_at 원문) — 날짜 표기는 화면이 KST 로 */
  createdAt: string;
  href: string;
};

/** 한 번에 싣는 상한 — 라우트 limit · /my 는 그중 5건 */
export const FOLLOWED_NOTES_LIMIT = 30;

/** 프로필 맵의 키 — 이메일 소문자 */
export function authorKey(email: string): string {
  return email.trim().toLowerCase();
}

/** 제목 — 단지명이 있으면 단지명(마이 허브의 toHubNote 와 같은 규칙), 없으면 노트 제목 */
export function followedNoteTitle(row: Pick<FollowedNoteRow, "title" | "apt_name">): string {
  return (row.apt_name ?? "").trim() || row.title.trim() || "제목 없음";
}

/** 작성자 라벨 — 노트의 author_label → 프로필 이름 → "○○** 이웃"(공용 마스킹). 이메일 전체는 어떤 경우에도 나가지 않는다 */
export function followedNoteAuthorLabel(
  row: Pick<FollowedNoteRow, "author_label" | "author_email">,
  profile: AuthorProfile | undefined,
): string {
  const label = (row.author_label ?? "").trim() || (profile?.name ?? "").trim() || null;
  return maskNoteAuthor(label, row.author_email);
}

/** 행 목록 → 화면 항목(최신순 그대로). 같은 id 는 한 번만 */
export function shapeFollowedNotes(
  rows: ReadonlyArray<FollowedNoteRow>,
  profiles: ReadonlyMap<string, AuthorProfile>,
): FollowedNoteItem[] {
  const seen = new Set<string>();
  const out: FollowedNoteItem[] = [];
  for (const r of rows) {
    const id = String(r.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const profile = profiles.get(authorKey(r.author_email));
    out.push({
      id,
      title: followedNoteTitle(r),
      authorLabel: followedNoteAuthorLabel(r, profile),
      authorHandle: profile?.handle?.trim() || null,
      regionLabel: (r.region ?? "").trim(),
      createdAt: r.created_at,
      href: `/notes/${encodeURIComponent(id)}`,
    });
  }
  return out;
}

/** 팔로우 행의 이메일 → `.in()` 에 넣을 키 목록(원문 + 소문자, 중복 제거) — user_follows 는 저장 당시 표기 그대로일 수 있다 */
export function followedEmailKeys(emails: ReadonlyArray<string>): string[] {
  const out = new Set<string>();
  for (const e of emails) {
    const raw = e.trim();
    if (!raw) continue;
    out.add(raw);
    out.add(raw.toLowerCase());
  }
  return [...out];
}
