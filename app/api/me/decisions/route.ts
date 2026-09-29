/**
 * [1025 · 결정·비서] GET/POST /api/me/decisions — 결정 카드(/decide) 기록.
 *
 *  GET  → { items: DecisionRecord[] }(최근 30건)
 *  POST { complexIds, chosenId?, chosenName?, verdict, memo?, weights? } → { item }(201)
 *  세션 필수(401). 검증은 lib/decide/score parseDecisionInput(순수). 저장·조회 실패는 503(dbUnavailable — 원인을 말한다).
 *  응답은 개인 것이라 private, no-store. 게스트는 이 API 를 치지 않는다(localStorage).
 *  표는 마이그레이션 20260929104418_1025_user_decisions.sql(통합자 적용).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { insertDecision, listDecisions } from "@/lib/decide/decisions-store";
import { parseDecisionInput } from "@/lib/decide/score";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function GET() {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) return json({ error: "로그인이 필요합니다." }, 401);
  try {
    return json({ items: await listDecisions(email) });
  } catch (err) {
    return dbUnavailable("me/decisions", err, "지금은 지난 결정을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.");
  }
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req);
  if (limited) return limited;
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) return json({ error: "로그인이 필요합니다." }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON이 필요합니다." }, 400);
  }
  const parsed = parseDecisionInput(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const o = (body ?? {}) as Record<string, unknown>;
  const chosenName =
    parsed.value.chosenId && typeof o.chosenName === "string" && o.chosenName.trim()
      ? o.chosenName.trim().slice(0, 120)
      : null;
  try {
    const item = await insertDecision(email, { ...parsed.value, chosenName });
    return json({ item }, 201);
  } catch (err) {
    return dbUnavailable("me/decisions", err, "지금은 결정을 저장할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  }
}
