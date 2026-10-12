import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { awardPoints } from "@/lib/points/ledger";
import {
  listReviews,
  listReviewScores,
  getMyReview,
  upsertReview,
  calcSummary,
  type ComplexReview,
} from "@/lib/complex-reviews/store-db";
import { REVIEW_PAGE_SIZE, nextReviewOffset, parseReviewOffset } from "@/lib/complex-reviews/rules";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";

/** 작성자 이메일 마스킹 — 목록 공개 응답에 원본 이메일 노출 금지 */
function maskAuthor(email: string): string {
  const local = email.split("@")[0] ?? "";
  return `${local.slice(0, 2) || "이웃"}** 이웃`;
}

function toPublic(r: ComplexReview) {
  return {
    id: r.id,
    author: maskAuthor(r.authorEmail),
    noiseScore: r.noiseScore,
    parkingScore: r.parkingScore,
    mgmtScore: r.mgmtScore,
    neighborScore: r.neighborScore,
    transportScore: r.transportScore,
    comment: r.comment,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    helpfulCount: r.helpfulCount,
    isResident: r.isResident,
    isVisitVerified: r.isVisitVerified,
    residentPeriod: r.residentPeriod,
  };
}

/**
 * GET /api/complex-reviews?complexId=&offset=
 * [1058 · C3] → { reviews(한 쪽 50건), summary(전체 기준), nextOffset(더 없으면 null), mine(로그인 시 내 후기 · 없으면 null) }
 * 틀린 사실: 목록에 상한이 없었고(1,000행에서 조용히 잘림), 이미 쓴 사람에게 자기 후기를 돌려주지 않아 폼이 늘 빈 채 열렸다.
 */
export async function GET(req: NextRequest) {
  const complexId = req.nextUrl.searchParams.get("complexId");
  if (!complexId) return NextResponse.json({ error: "complexId 가 필요합니다." }, { status: 400 });
  const offset = parseReviewOffset(req.nextUrl.searchParams.get("offset"));
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  /* 조회 실패를 200 + 빈 목록으로 답하면 "이 단지 후기 0건 · 평점 0점"이 된다.
     못 읽었을 뿐이라는 사실을 상태 코드로 말한다. */
  let rows: ComplexReview[];
  let scores: Awaited<ReturnType<typeof listReviewScores>>;
  let mine: ComplexReview | null = null;
  try {
    [rows, scores, mine] = await Promise.all([
      listReviews(complexId, { limit: REVIEW_PAGE_SIZE, offset }),
      /* 요약은 첫 쪽에서만 — 더 보기 쪽은 목록만 받는다 */
      offset === 0 ? listReviewScores(complexId) : Promise.resolve([]),
      email ? getMyReview(complexId, email) : Promise.resolve(null),
    ]);
  } catch (e) {
    return dbUnavailable("complex-reviews", e);
  }
  const summary = offset === 0 ? calcSummary(scores) : null;
  const reviews = rows.map(toPublic);
  return NextResponse.json({
    reviews,
    summary,
    nextOffset: nextReviewOffset(offset, rows.length, REVIEW_PAGE_SIZE),
    mine: mine
      ? {
          id: mine.id,
          noiseScore: mine.noiseScore,
          parkingScore: mine.parkingScore,
          mgmtScore: mine.mgmtScore,
          neighborScore: mine.neighborScore,
          transportScore: mine.transportScore,
          comment: mine.comment,
          isResident: mine.isResident,
          isVisitVerified: mine.isVisitVerified,
          residentPeriod: mine.residentPeriod,
          createdAt: mine.createdAt,
          updatedAt: mine.updatedAt,
        }
      : null,
  });
}

export async function POST(req: NextRequest) {
  /* [1058 · C3] 로그인 판정이 먼저, 그다음 **계정당** 1시간 5회. 틀린 사실: IP 당 5회 제한이 로그인 확인 **앞**에 있었다 —
     같은 통신사 NAT·사무실 IP 를 쓰는 비로그인 방문자가 다른 사람의 후기 등록을 429 로 막았고, 로그인 안내(401)도 받지 못했다. */
  const session = await safeAuth();
  if (!session?.user?.email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  // 계정당 1시간에 5회 (인스턴스별 best-effort)
  const rlUser = rateLimit(`complex-review:user:${session.user.email.trim().toLowerCase()}`, {
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!rlUser.ok) return tooManyRequests(rlUser.retryAfterSec);

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 }); }

  const complexId = String(body.complexId ?? "").trim().slice(0, 160);
  const complexName = String(body.complexName ?? "").trim().slice(0, 120);
  if (!complexId || !complexName) return NextResponse.json({ error: "complexId, complexName 이 필요합니다." }, { status: 400 });

  const toScore = (v: unknown, fallback = 3) => {
    const n = Number(v);
    return isNaN(n) ? fallback : Math.min(5, Math.max(1, Math.round(n)));
  };

  // 신뢰 신호(선택) — 미전송 시 기존 동작(false / null) 유지
  const residentPeriodRaw = body.residentPeriod ? String(body.residentPeriod).trim().slice(0, 60) : "";

  let review: ComplexReview;
  try {
    review = await upsertReview({
      complexId,
      complexName,
      authorEmail: session.user.email,
      noiseScore: toScore(body.noiseScore),
      parkingScore: toScore(body.parkingScore),
      mgmtScore: toScore(body.mgmtScore),
      neighborScore: toScore(body.neighborScore),
      transportScore: toScore(body.transportScore),
      comment: body.comment ? String(body.comment).slice(0, 500) : null,
      isResident: body.isResident === true,
      isVisitVerified: body.isVisitVerified === true,
      residentPeriod: residentPeriodRaw || null,
    });
  } catch (e) {
    /* [1058 · C3] 저장 실패가 처리되지 않은 예외(500 · 본문 없음)로 나가 화면이 "후기 등록 실패" 로만 적던 것 → 503 + 사실 문구 */
    return dbUnavailable("complex-reviews:upsert", e, "후기 저장 실패 · 잠시 후 다시");
  }
  // 후기 작성 적립 — refId=review.id 로 재작성(upsert) 중복 지급 방지.
  /* [1056 · B3] 화면이 "30P 적립" 을 고정 문구로 썼다 — 재작성(같은 refId)·상한이면 0P 인데도.
     실제 지급액을 응답에 실어 화면이 그 수를 적게 한다. 지급 실패는 후기 저장을 되돌리지 않는다. */
  let pointsAwarded = 0;
  if (session.user.email) {
    try {
      const award = await awardPoints(session.user.email, "review_written", review.id);
      if (award.ok) pointsAwarded = award.awarded;
    } catch {
      /* fail-soft */
    }
  }
  return NextResponse.json({ ...review, pointsAwarded }, { status: 201 });
}
