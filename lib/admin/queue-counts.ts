import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";

/* [1141] 관리자 메뉴 옆 숫자 — 처리 대기 실집계(신고 · 문의 · 매물 검수 · 전문가 심사). 못 읽은 것은 싣지 않는다(0 으로 그리지 않는다). */
const QUEUES: Array<{ href: string; table: string; status: string }> = [
  { href: "/admin/moderation", table: "content_reports", status: "open" },
  { href: "/admin/support", table: "support_tickets", status: "open" },
  { href: "/admin/listings", table: "listings", status: "pending" },
  { href: "/admin/quality", table: "expert_verification_requests", status: "pending" },
];

export async function loadAdminQueueCounts(): Promise<Record<string, number>> {
  const sb = getServiceSupabase();
  if (!sb) return {};
  const out: Record<string, number> = {};
  const res = await Promise.allSettled(QUEUES.map((q) => sb.from(q.table).select("id", { count: "exact", head: true }).eq("status", q.status)));
  res.forEach((r, i) => {
    if (r.status === "fulfilled" && !r.value.error && typeof r.value.count === "number") out[QUEUES[i].href] = r.value.count;
  });
  return out;
}
