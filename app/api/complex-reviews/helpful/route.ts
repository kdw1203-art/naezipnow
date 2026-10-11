import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { markReviewHelpful } from "@/lib/complex-reviews/store-db";
import { getServiceSupabase } from "@/lib/supabase/service";
import { helpfulMilestone, notifyReviewHelpfulMilestone } from "@/lib/notifications/engagement-notify";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

/**
 * [1056 · B3] 알림 수신자·착지점을 위해 후기 한 건의 작성자·단지만 읽는다.
 * markReviewHelpful 은 집계만 돌려주고 store 에는 단건 조회가 없다(그 파일은 이 묶음 소유가 아니다).
 * 실패·미설정은 null — 알림만 생략되고 투표 응답은 그대로다.
 */
async function loadReviewForNotify(reviewId: string): Promise<{
  authorEmail: string;
  complexId: string;
  complexName: string;
} | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("complex_reviews")
      .select("author_email, complex_id, complex_name")
      .eq("id", reviewId)
      .maybeSingle();
    if (error || !data) return null;
    const authorEmail = String(data.author_email ?? "").trim();
    const complexId = String(data.complex_id ?? "").trim();
    if (!authorEmail || !complexId) return null;
    return {
      authorEmail,
      complexId,
      complexName: String(data.complex_name ?? "").trim(),
    };
  } catch {
    return null;
  }
}

/**
 * POST /api/complex-reviews/helpful
 * body: { reviewId }
 * 로그인 사용자가 후기에 "도움돼요" 를 1회 투표. 중복 시 already=true 로 응답.
 */
export async function POST(req: NextRequest) {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  if (!email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const reviewId = String(body.reviewId ?? "").trim();
  if (!reviewId) return NextResponse.json({ error: "reviewId 가 필요합니다." }, { status: 400 });

  try {
    const result = await markReviewHelpful(reviewId, email);
    /* [1056 · B3] 도움돼요가 후기 작성자에게 조용했다 — 수만 올랐다. 새 표가 경계(1·5·10·25)에
       닿을 때, 누른 사람이 작성자 본인이 아닐 때만 인앱(+pushLikes 켜진 사람은 푸시). fail-soft. */
    if (!result.already && helpfulMilestone(result.count)) {
      void (async () => {
        const review = await loadReviewForNotify(reviewId);
        if (!review) return;
        if (review.authorEmail.toLowerCase() === email.trim().toLowerCase()) return;
        await notifyReviewHelpfulMilestone({
          authorEmail: review.authorEmail,
          reviewId,
          complexId: review.complexId,
          complexName: review.complexName,
          helpfulCount: result.count,
        });
      })().catch((e) => logger.error("[review-helpful-notify]", e));
    }
    return NextResponse.json(result);
  } catch (e) {
    logger.error("[api/complex-reviews/helpful] 실패", e);
    return NextResponse.json(
      { error: "도움돼요 처리에 실패했어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
