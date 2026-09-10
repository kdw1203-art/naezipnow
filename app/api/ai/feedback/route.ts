/**
 * POST /api/ai/feedback — AI 출력 품질(도움됨/부족함).
 * platform_activity_events 에만 기록. AI 실행 KPI와 이벤트명을 분리한다.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toText(v: unknown, max = 80): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;

  const session = await safeAuth();
  const email = session?.user?.email?.trim() ?? null;
  if (!email) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청 본문입니다." },
      { status: 400 },
    );
  }

  const rating = body.rating === "up" || body.rating === "down" ? body.rating : null;
  if (!rating) {
    return NextResponse.json(
      { ok: false, message: "rating 은 up 또는 down 이어야 합니다." },
      { status: 400 },
    );
  }

  const targetType = toText(body.targetType, 64) || "unknown";
  const targetId = toText(body.targetId, 80) || null;
  const rawContext =
    body.context && typeof body.context === "object" && !Array.isArray(body.context)
      ? (body.context as Record<string, unknown>)
      : {};
  /* [987 · 후기 수집] 사용자가 쓴 한 줄과 인용 동의는 **서버에서 다시 자른다**.
     클라이언트가 300자로 자르지만 그건 편의일 뿐이고, 여기로 오는 값은 그대로
     이벤트 metadata 에 실린다 — 길이를 믿으면 안 되는 자리다.
     인용 동의는 boolean 만 받는다("true" 같은 문자열을 참으로 읽지 않는다).

     주의: 이 문장은 아직 **어디에도 공개되지 않는다**. 나중에 소개 페이지에
     인용하려면 quotable === true 인 것만 고르고, 그때 금칙어 검사를
     통과시켜야 한다(lib/moderation) — 지금 통과시키지 않는 이유는 공개 표면이
     없어서지, 필요 없어서가 아니다. */
  const comment = toText(rawContext.comment, 300);
  const context: Record<string, unknown> = {
    ...rawContext,
    ...(comment ? { comment } : { comment: undefined }),
    quotable: rawContext.quotable === true,
  };
  if (!comment) delete context.comment;

  await recordFunnelEvent(req, {
    eventName: FUNNEL_EVENT.AI_FEEDBACK,
    userEmail: email,
    path: "/api/ai/feedback",
    metadata: {
      rating,
      targetType,
      targetId,
      ...context,
      kpiSeparate: true,
    },
  });

  return NextResponse.json({ ok: true, rating });
}
