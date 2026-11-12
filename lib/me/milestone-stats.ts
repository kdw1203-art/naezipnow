/* [1168] 함께한 기록 — 한 사람의 활동 수(서버 전용). 하나라도 못 읽으면 던진다(0 으로 꾸미지 않는다). */
import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { ActivityStats } from "@/lib/me/milestones";

export async function loadActivityStats(email: string): Promise<ActivityStats> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("활동 수 조회 실패: Supabase 미설정");
  const me = email.trim().toLowerCase();
  const count = async (table: string, col: string, extra?: [string, string]): Promise<number> => {
    let q = sb.from(table).select("*", { count: "exact", head: true }).eq(col, me);
    if (extra) q = q.eq(extra[0], extra[1]);
    const { count: n, error } = await q;
    if (error) throw new Error(`${table} 수 조회 실패: ${error.message}`);
    return n ?? 0;
  };
  const [notes, analyses, watchlist, groups] = await Promise.all([
    count("inspection_notes", "author_email"),
    count("ai_analysis_runs", "author_email"),
    count("user_watchlist", "user_email"),
    count("group_members", "user_email", ["status", "joined"]),
  ]);
  return { notes, analyses, watchlist, groups };
}
