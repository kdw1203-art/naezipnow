import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { expertBadgeText } from "@/lib/experts/taxonomy";
import { logger } from "@/lib/log";

/**
 * [1047] 인증 마크 일괄 조회 — 소유자 지시(2026-10-09) "전문가 등록을 인증했다는 마크도 아이디나 게시글에 보이도록".
 *
 * 글·댓글·노트의 작성자 이메일은 화면(클라이언트)으로 나가지 않는다(개인정보 원칙). 그래서 서버 렌더 시점에
 * 이메일 → 인증 전문가(expert_profiles.is_verified) 를 한 번에 묻고, 화면에는 마크 문구와 프로필 id 만 넘긴다.
 * 승인된(관리자 심사 통과) 프로필만 마크가 붙는다 — 심사 중·반려·미인증은 아무것도 붙지 않는다.
 * 조회 실패는 마크 없음으로 접는다(장식이 본문 렌더를 막으면 안 된다 · 경고만 남긴다).
 */
export type ExpertBadgeInfo = { expertId: string; text: string };

const MAX_EMAILS = 300;

export async function loadExpertBadges(
  emails: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, ExpertBadgeInfo>> {
  const out = new Map<string, ExpertBadgeInfo>();
  const list = [...new Set(emails.map((e) => (e ?? "").trim().toLowerCase()).filter((e) => e.includes("@")))].slice(0, MAX_EMAILS);
  if (list.length === 0) return out;
  const sb = getServiceSupabase();
  if (!sb) return out;
  try {
    const { data, error } = await sb
      .from("expert_profiles")
      .select("id, owner_email, category")
      .eq("is_verified", true)
      .in("owner_email", list);
    if (error) {
      logger.warn(`[expert-badges] 조회 실패: ${error.message}`);
      return out;
    }
    for (const r of (data ?? []) as Array<{ id: string; owner_email: string | null; category: string | null }>) {
      const email = (r.owner_email ?? "").trim().toLowerCase();
      if (email && !out.has(email)) out.set(email, { expertId: String(r.id), text: expertBadgeText(r.category) });
    }
  } catch (e) {
    logger.warn("[expert-badges] 조회 예외", e);
  }
  return out;
}

/** 동네이야기 글 id → 인증 마크(작성자 이메일은 서비스 키로만 읽고 밖으로 내보내지 않는다) */
export async function loadPostAuthorBadges(postIds: readonly string[]): Promise<Map<string, ExpertBadgeInfo>> {
  const out = new Map<string, ExpertBadgeInfo>();
  const ids = [...new Set(postIds.filter(Boolean))].slice(0, MAX_EMAILS);
  if (ids.length === 0) return out;
  const sb = getServiceSupabase();
  if (!sb) return out;
  try {
    const { data, error } = await sb.from("posts").select("id, author_email").in("id", ids);
    if (error) {
      logger.warn(`[expert-badges] 글 작성자 조회 실패: ${error.message}`);
      return out;
    }
    const rows = (data ?? []) as Array<{ id: string; author_email: string | null }>;
    const badges = await loadExpertBadges(rows.map((r) => r.author_email));
    for (const r of rows) {
      const b = badges.get((r.author_email ?? "").trim().toLowerCase());
      if (b) out.set(String(r.id), b);
    }
  } catch (e) {
    logger.warn("[expert-badges] 글 작성자 조회 예외", e);
  }
  return out;
}
