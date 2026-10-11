/**
 * [1056 · B8] 작성자 이름 → 공개 프로필(/u/[handle]) 주소. 순수 함수(서버·클라이언트·테스트 공용).
 *
 * 감사(2026-10-11): /u/[handle] 로 들어오는 링크가 사이트 안에 하나도 없었다 — 노트·이야기·토론의
 * 작성자 이름이 전부 글자였다. /u 는 profiles.handle → full_name(닉네임) 순으로 풀고, 공개 노트의
 * author_label 로도 찾으므로 **사람 이름일 때만** 링크한다.
 *
 * 링크하지 않는 이름(사람이 아니거나 한 사람을 가리키지 못한다):
 *  · 빈 값 · "익명" · "이웃"
 *  · 마스킹 표기("ki** 이웃" — 이름 없는 계정의 대체 표기, 여러 사람이 공유)
 *  · 이메일 모양(옛 행에 남아 있을 수 있다 — 주소에 싣지 않는다)
 *  · 운영진·자동수집 표기("내집나우 …", "… Lab", 편집부/에디터)
 */
const MASKED_RE = /\*\*\s*이웃$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LAB_RE = /\blab\b/i;
const STAFF_RE = /^내집나우|편집부|에디터|편집장|스카우트/;

/** 이름이 실제 사용자 한 사람을 가리키는가 */
export function isLinkableAuthor(label: string | null | undefined): boolean {
  const s = String(label ?? "").trim();
  if (!s) return false;
  if (s === "익명" || s === "이웃") return false;
  if (MASKED_RE.test(s)) return false;
  if (EMAIL_RE.test(s)) return false;
  if (LAB_RE.test(s)) return false;
  if (STAFF_RE.test(s)) return false;
  return true;
}

/** 링크 가능한 이름이면 `/u/{name}`, 아니면 null(글자 그대로 그린다) */
export function authorProfileHref(label: string | null | undefined): string | null {
  if (!isLinkableAuthor(label)) return null;
  return `/u/${encodeURIComponent(String(label).trim())}`;
}
