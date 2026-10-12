import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { kstDateString } from "@/lib/points/store-db";
import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/quiz/today → { date, finishers }
 * [1058 · C7] 오늘(KST) 실거래가 게임을 완주해 적립까지 된 사람 수 — point_ledger 의 reason='quiz_daily' · ref_id=<KST 날짜>
 * 행(1056 · A7: 하루 1회 · refId=KST 날짜 멱등)을 **정확히** 센다(count exact · 행을 읽지 않는다 → 1,000행 상한 무관).
 * 공개 · 개인화 없음 · 5분 공유 캐시(정확한 수가 5분 늦는 것은 사실 왜곡이 아니다). 못 세면 503 — 0명이라고 적지 않는다.
 * 틀린 사실: 결과 화면이 "오늘 N명 참여" 같은 참여 신호를 아예 못 적었다(세는 곳이 없었다).
 */
export async function GET() {
  const date = kstDateString();
  const sb = getServiceSupabase();
  if (!sb) return dbUnavailable("quiz-today", new Error("supabase 미설정"));
  const { count, error } = await sb
    .from("point_ledger")
    .select("id", { count: "exact", head: true })
    .eq("reason", "quiz_daily")
    .eq("ref_id", date);
  if (error) return dbUnavailable("quiz-today", error);
  if (typeof count !== "number") return dbUnavailable("quiz-today", new Error("count 없음"));
  return NextResponse.json(
    { date, finishers: count },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
  );
}
