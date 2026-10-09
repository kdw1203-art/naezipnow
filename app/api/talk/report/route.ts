import { NextResponse, type NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { reportRegionTalk } from "@/lib/talk/store";

export const runtime = "nodejs";

/* [1051 · 홈 실시간 토론] 신고 — 로그인 · 한 사람당 한 번 · 3건이면 숨김(DB 함수 report_region_talk 가 한 번에). */
export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;
  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase() ?? null;
  if (!email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const id = String(b.id ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "id 가 필요합니다." }, { status: 400 });
  const reason = String(b.reason ?? "").trim().slice(0, 200);
  try {
    const r = await reportRegionTalk(id, email, reason);
    if (r === "missing") return NextResponse.json({ error: "글을 찾을 수 없어요." }, { status: 404 });
    return NextResponse.json({ ok: true, result: r });
  } catch (e) {
    return dbUnavailable("region-talk-report", e);
  }
}
