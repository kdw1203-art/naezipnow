import { NextResponse, type NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import {
  createContentReport,
  markContentReportTarget,
  resolveReportTarget,
  type ReportTargetType,
} from "@/lib/moderation/reports-store";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";
import { markListingReport } from "@/lib/listings/store-db";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

const ALLOWED_CATEGORIES = new Set([
  "spam",
  "fraud",
  "defamation",
  "market_manipulation",
  "off_platform",
  "other",
]);

/** 본문의 targetType — 'board' 는 기사(board_posts), 'post' 는 이야기(posts). 모르는 값은 무시(자동 해석) */
function parseTargetType(v: unknown): ReportTargetType | null {
  const s = String(v ?? "").trim();
  return s === "post" || s === "board" || s === "note" || s === "listing" ? s : null;
}

/**
 * POST /api/moderation/content-report
 * 커뮤니티 글·댓글 신고 (기존 /api/reports 와 구분 — 리포트 상품 생성 API와 혼동 방지)
 *
 * 본문: { targetType?: 'post'|'board'|'note'|'listing', targetId?: string, postId?: string(옛 이름), commentId?, reason, reportCategory? }
 * [1058 · B5] 예전엔 노트만 가려내고 나머지는 전부 post_id(FK → posts)에 넣었다 — 기사 id 는 FK 위반, "complex-review:<id>" 는
 * uuid 오류, 이야기 id 는 CHECK(report_target_required) 위반으로 **모든 신고가 503** 이었고 실패 문구에 DB 원문이 실렸다.
 * 이제 대상을 표에서 확인해(resolveReportTarget) 기사·노트는 content_reports 에, 이야기·매물은 문의 티켓에 적재한다.
 * 어느 표에도 없는 대상(단지 후기 등)은 400 "이 항목은 신고 대상이 아님".
 */
export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;

  const session = await safeAuth();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const targetId = String(body.targetId ?? body.postId ?? "").trim();
  const hint = parseTargetType(body.targetType);
  const reason = String(body.reason ?? "").trim();
  const commentId =
    body.commentId != null && String(body.commentId).trim()
      ? String(body.commentId).trim()
      : null;
  const rawCat = String(body.reportCategory ?? body.category ?? "other").trim();
  const reportCategory = ALLOWED_CATEGORIES.has(rawCat) ? rawCat : "other";

  if (!targetId) {
    return NextResponse.json({ error: "신고 대상 id 필요" }, { status: 400 });
  }
  if (reason.length < 3) {
    return NextResponse.json({ error: "신고 사유 3자 이상 필요" }, { status: 400 });
  }

  let targetType: ReportTargetType | null;
  try {
    targetType = await resolveReportTarget(targetId, hint);
  } catch (e) {
    logger.error("[content-report] 대상 조회 실패", e);
    return NextResponse.json(
      { error: "신고 접수 실패 · 잠시 후 다시" },
      { status: 503, headers: { "Retry-After": "10" } },
    );
  }
  if (!targetType) {
    return NextResponse.json({ error: "이 항목은 신고 대상이 아님" }, { status: 400 });
  }
  const reporterEmail = session?.user?.email?.trim() ?? null;
  /* 이야기·매물 신고는 문의 티켓으로 남는다(reports-store 주석) — 연락 이메일이 필요해 로그인 신고만 */
  if ((targetType === "post" || targetType === "listing") && !reporterEmail) {
    return NextResponse.json({ error: "로그인 필요 · 신고" }, { status: 401 });
  }

  const res = await createContentReport({
    postId: targetId,
    targetType,
    commentId,
    reporterEmail,
    reason,
    reportCategory,
  });
  if (!res.ok) {
    /* 사용자에게는 일반 문구 — DB 원문(제약 이름·열 이름)은 로그로만 */
    logger.error(`[content-report] 접수 실패 (${targetType}/${targetId}): ${res.error}`);
    const notTarget = res.error === "이 항목은 신고 대상이 아님";
    return NextResponse.json(
      { error: notTarget ? res.error : "신고 접수 실패 · 잠시 후 다시" },
      { status: notTarget ? 400 : 503 },
    );
  }

  if (reporterEmail) {
    void recordFunnelEvent(req, {
      eventName: FUNNEL_EVENT.CONTENT_REPORT_SUBMIT,
      userEmail: reporterEmail,
      path: "/api/moderation/content-report",
      metadata: { postId: targetId, targetType, reportCategory, hasComment: Boolean(commentId), via: res.via },
    });
  }

  // 신고 누적 처리(3회 도달 시 자동 숨김, #7) — 매물(markListingReport)뿐 아니라
  // 노트·게시글도 동일 패턴으로 확장. 댓글 신고는 본문 누적에 포함하지 않는다.
  // 실패는 best-effort 로 무시.
  if (!commentId) {
    try {
      if (targetType === "listing") await markListingReport(targetId);
      else await markContentReportTarget(targetType, targetId);
    } catch (e) {
      logger.warn("[content-report] 신고 누적 처리 실패", e);
    }
  }

  return NextResponse.json({ ok: true });
}
