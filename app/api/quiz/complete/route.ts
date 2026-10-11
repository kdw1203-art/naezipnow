import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { awardPoints } from "@/lib/points/ledger";
import { kstDateString } from "@/lib/points/store-db";
import { applyRateLimit } from "@/lib/rate-limit";
import { parseQuizCompleteBody } from "@/lib/quiz/complete";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/quiz/complete — body { score, total }.
 * [1056 · A7] 실거래가 게임(/quiz) 하루 1판 완주 적립 — quiz_daily 10P, refId=KST 날짜라 한국 하루에 1회.
 * 게임은 기기(localStorage)에만 기록돼 서버가 점수를 검증할 수 없다 — 그래서 점수가 아니라 "완주 1회"에
 * 지급한다(참여형 무상 리워드). 본문은 형식만 확인한다(정수 · 0 ≤ score ≤ total ≤ 20).
 *
 * → 201 { ok: true, awarded: 10, balance }            — 오늘 첫 완주
 * → 200 { ok: false, awarded: 0, balance, reason }    — 이미 오늘 적립(already_ref·rule_cap) · 상한(cap)
 * → 401 비로그인 · 400 본문 오류 · 429 과다 요청
 */
export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, { max: 10, windowMs: 60_000 });
  if (limited) return limited;
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = parseQuizCompleteBody(body);
  if (!parsed) {
    return NextResponse.json({ error: "score·total 은 정수(0 ≤ score ≤ total ≤ 20)여야 합니다." }, { status: 400 });
  }
  const r = await awardPoints(session.user.email, "quiz_daily", kstDateString());
  return NextResponse.json(
    { ok: r.ok, awarded: r.awarded, balance: r.balance, reason: r.reason ?? null },
    { status: r.ok ? 201 : 200 },
  );
}
