import "server-only";

/**
 * [1057 · C1·C2] 팔로우한 작성자의 공개 노트 — 서버 조회 한 곳(라우트 /api/me/follows/feed 와 /my 섹션이 같이 쓴다).
 *
 * 질의: inspection_notes 를 `author_email in (팔로우한 이메일)` · is_public · created_at desc, id desc · limit 로 직접 읽는다 —
 * 사이트 전체 최신 100건에서 거르던 예전 방식은 팔로우한 사람의 101번째 이후 노트를 영영 못 보였다.
 * 작성자 표시용 profiles(handle · full_name)는 이메일 묶음 한 번(`.in`). 프로필 조회 실패는 라벨 폴백(마스킹)으로 넘긴다 —
 * 노트 조회 실패는 던진다(빈 배열로 접으면 "새 노트 없음"이 되고, 그건 거짓이다).
 * author_email 열은 anon 에게 GRANT 가 없어(20260806) 서비스 롤로만 읽는다.
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { listFollowing } from "@/lib/follows/store-db";
import { logger } from "@/lib/log";
import {
  FOLLOWED_NOTES_LIMIT,
  authorKey,
  followedEmailKeys,
  shapeFollowedNotes,
  type AuthorProfile,
  type FollowedNoteItem,
  type FollowedNoteRow,
} from "./feed";

export type FollowedAuthorsFeed = { items: FollowedNoteItem[]; followingCount: number };

export async function listFollowedAuthorsNotes(
  viewerEmail: string,
  limit: number = FOLLOWED_NOTES_LIMIT,
): Promise<FollowedAuthorsFeed> {
  const follows = await listFollowing(viewerEmail);
  if (follows.length === 0) return { items: [], followingCount: 0 };

  const sb = getServiceSupabase();
  if (!sb) throw new Error("inspection_notes 를 읽을 서비스 클라이언트가 없습니다 (SUPABASE_SERVICE_ROLE_KEY 미설정)");

  const keys = followedEmailKeys(follows.map((f) => f.followedEmail));
  const cap = Math.max(1, Math.min(FOLLOWED_NOTES_LIMIT, Math.floor(limit)));
  const { data, error } = await sb
    .from("inspection_notes")
    .select("id, author_email, author_label, title, apt_name, region, created_at")
    .in("author_email", keys)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(cap);
  if (error) throw new Error(`inspection_notes 조회 실패 (팔로우 피드): ${error.message}`);
  if (!Array.isArray(data)) throw new Error("inspection_notes 조회 실패 (팔로우 피드): 응답이 배열이 아닙니다");
  const rows: FollowedNoteRow[] = data.map((r) => ({
    id: String(r.id ?? ""),
    author_email: String(r.author_email ?? ""),
    author_label: typeof r.author_label === "string" ? r.author_label : null,
    title: String(r.title ?? ""),
    apt_name: typeof r.apt_name === "string" ? r.apt_name : null,
    region: typeof r.region === "string" ? r.region : null,
    created_at: String(r.created_at ?? ""),
  }));

  const profiles = new Map<string, AuthorProfile>();
  const authorEmails = followedEmailKeys(rows.map((r) => r.author_email));
  if (authorEmails.length > 0) {
    const { data: prof, error: profErr } = await sb
      .from("profiles")
      .select("email, handle, full_name")
      .in("email", authorEmails);
    if (profErr) {
      /* 이름·핸들은 장식이다 — 못 읽으면 마스킹 라벨로 간다(노트 목록은 그대로) */
      logger.warn("[follows/feed] profiles 조회 실패 — 마스킹 라벨로 표시", profErr.message);
    } else {
      for (const row of (prof ?? []) as Array<{ email?: unknown; handle?: unknown; full_name?: unknown }>) {
        const key = authorKey(String(row.email ?? ""));
        if (!key) continue;
        profiles.set(key, {
          handle: typeof row.handle === "string" && row.handle.trim() ? row.handle.trim() : null,
          name: typeof row.full_name === "string" && row.full_name.trim() ? row.full_name.trim() : null,
        });
      }
    }
  }

  return { items: shapeFollowedNotes(rows, profiles), followingCount: follows.length };
}
