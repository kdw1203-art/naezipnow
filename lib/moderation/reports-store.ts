import { getServiceSupabase } from "@/lib/supabase/service";
import { pushInboxNotification } from "@/lib/notifications/inbox";
import { invalidateNoteCache } from "@/lib/inspection/note-cache";
import { createSupportTicket } from "@/lib/support/tickets";
import { logger } from "@/lib/log";
import { revalidatePath } from "next/cache";
import { invalidateTownFeed, invalidateHomeData } from "@/lib/cache/invalidate";

export type ReportStatus = "open" | "reviewed" | "dismissed";

/**
 * 신고 대상 유형.
 * - "post": 커뮤니티 이야기(posts) — 글·댓글(jsonb) 모두.
 * - "board": 자동수집 기사(board_posts) — content_reports.target_type='post' + target_post_id(FK → board_posts).
 * - "note": 임장노트(inspection_notes) — target_type='note' + target_note_id. 노트 댓글은 comment_id(text) 를 곁들인다.
 * - "listing": 매물(listings) — content_reports 에 FK 자리가 없다.
 *
 * [1058 · B5] 운영 DB 실측(2026-10-12 pg_constraint):
 *   report_target_required CHECK = (post ∧ target_post_id) ∨ (comment ∧ target_comment_id) ∨ (note ∧ target_note_id)
 *   — target_type 이 NULL 이거나 'post' 인데 target_post_id(→ board_posts) 가 없으면 **거절**된다. 그래서 예전처럼
 *   이야기 id 를 post_id(→ posts) 에만 적는 행은 한 번도 들어간 적이 없다(content_reports 0행). 뉴스 상세는
 *   board_posts id 를 post_id 에 넣어 FK 위반, 단지 후기는 "complex-review:<id>" 를 uuid 열에 넣어 22P02 — 셋 다 503.
 *   마이그레이션 없이 이야기·매물 신고를 남길 자리는 content_reports 에 없다 → 문의 티켓(support_tickets ·
 *   분류 "악성 콘텐츠 신고" · metadata 에 대상)으로 접수한다. 운영자는 /admin/support 에서 본다.
 *   자동 숨김(3회)은 그 티켓도 센다(countActiveReports).
 */
export type ReportTargetType = "post" | "board" | "note" | "listing";

/** 신고 접수 결과 — 티켓으로 접수된 경우 `via: "ticket"` */
export type CreateReportResult = { ok: true; via: "content_reports" | "ticket" } | { ok: false; error: string };

/** 문의 티켓으로 접수하는 신고의 분류(lib/support/ticket-labels TICKET_CATEGORIES 에 있는 값) */
export const REPORT_TICKET_CATEGORY = "악성 콘텐츠 신고" as const;
/** 티켓 metadata.kind — 자동 숨김 집계가 이 값으로 신고 티켓만 고른다 */
export const REPORT_TICKET_KIND = "content_report" as const;

/** 신고 누적 자동 숨김 임계값 — 매물(markListingReport)과 동일하게 3회. */
export const CONTENT_REPORT_HIDE_THRESHOLD = 3;

export type ContentReportRow = {
  id: string;
  post_id: string | null;
  target_post_id: string | null;
  target_note_id: string | null;
  comment_id: string | null;
  reporter_email: string | null;
  reason: string;
  report_category: string | null;
  status: ReportStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 대상 표에 그 id 가 있는가 — uuid 모양이 아니면 조회 없이 false. 조회 실패는 던진다(없음과 구분) */
async function rowExists(table: "posts" | "board_posts" | "inspection_notes" | "listings" | "board_comments", id: string): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { data, error } = await sb.from(table).select("id").eq("id", id).maybeSingle();
  if (error) throw new Error(`${table} (${id}) 조회 실패: ${error.message ?? "알 수 없는 오류"}`);
  return Boolean(data);
}

/**
 * [1058 · B5] 신고 대상 해석 — 호출부가 유형을 적어 보내면 그 표에서만 확인하고, 안 적었으면(옛 ReportButton 은
 * postId 하나만 보낸다) 이야기 → 기사 → 노트 → 매물 순으로 찾는다. 어느 표에도 없으면 null(= 신고 대상 아님).
 * "complex-review:<id>" 처럼 uuid 가 아닌 값도 null — 단지 후기는 문의 폼으로 보낸다(다른 묶음).
 */
export async function resolveReportTarget(
  targetId: string,
  hint?: ReportTargetType | null,
): Promise<ReportTargetType | null> {
  const id = targetId.trim();
  if (!id) return null;
  const order: ReportTargetType[] = hint ? [hint] : ["post", "board", "note", "listing"];
  for (const type of order) {
    const table =
      type === "post" ? "posts" : type === "board" ? "board_posts" : type === "note" ? "inspection_notes" : "listings";
    if (await rowExists(table, id)) return type;
  }
  return null;
}

/** 신고 대상의 화면 주소 — 티켓 본문에 적는다(운영자가 바로 연다) */
function reportTargetPath(targetType: ReportTargetType, targetId: string, commentId: string | null): string {
  const id = encodeURIComponent(targetId);
  if (targetType === "post") return `/town/story/${id}${commentId ? "#comments" : ""}`;
  if (targetType === "board") return `/town/news/${id}`;
  if (targetType === "note") return `/notes/${id}${commentId ? "#comments" : ""}`;
  return `/listings/${id}`;
}

export async function createContentReport(input: {
  /** 신고 대상 id — 하위호환을 위해 이름 유지(노트·기사·매물 신고도 대상 id 를 여기에 담는다). */
  postId: string;
  /** 생략 시 "post"(이야기) — 호출부가 resolveReportTarget 으로 먼저 푼다. */
  targetType?: ReportTargetType;
  commentId?: string | null;
  reporterEmail?: string | null;
  reason: string;
  reportCategory?: string | null;
}): Promise<CreateReportResult> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, error: "Supabase 미설정" };
  const targetType: ReportTargetType = input.targetType ?? "post";
  const targetId = input.postId.trim();
  const commentId = input.commentId?.trim() || null;
  const reason = input.reason.trim();
  const reportCategory = input.reportCategory?.trim() || null;
  const reporterEmail = input.reporterEmail?.trim().toLowerCase() || null;

  /* content_reports 에 FK 자리가 있는 대상만 거기에 — 기사(board_posts)·노트(inspection_notes) */
  if (targetType === "board" || targetType === "note") {
    let targetColumns: Record<string, unknown>;
    if (targetType === "note") {
      /* [967 · 12] 노트 댓글 신고는 comment_id(text, FK 없음)를 곁들인다 */
      targetColumns = { post_id: null, target_type: "note", target_note_id: targetId, comment_id: commentId };
    } else if (commentId) {
      /* 기사 댓글 — board_comments 의 uuid 일 때만 target_comment_id(FK) */
      if (!(await rowExists("board_comments", commentId).catch(() => false))) {
        return { ok: false, error: "이 항목은 신고 대상이 아님" };
      }
      targetColumns = { post_id: null, target_type: "comment", target_comment_id: commentId, target_post_id: targetId, comment_id: null };
    } else {
      targetColumns = { post_id: null, target_type: "post", target_post_id: targetId, comment_id: null };
    }
    const { error } = await sb.from("content_reports").insert({
      ...targetColumns,
      reporter_email: reporterEmail,
      reason,
      report_category: reportCategory,
      status: "open",
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, via: "content_reports" };
  }

  /* 이야기(posts · 댓글 jsonb)·매물 — 문의 티켓. 티켓은 연락 이메일이 필수라 로그인 신고만 받는다(라우트가 401). */
  if (!reporterEmail) return { ok: false, error: "로그인 필요" };
  const label = targetType === "post" ? (commentId ? "이야기 댓글" : "이야기") : "매물";
  const path = reportTargetPath(targetType, targetId, commentId);
  const ticket = await createSupportTicket({
    userEmail: reporterEmail,
    contactEmail: reporterEmail,
    category: REPORT_TICKET_CATEGORY,
    subject: `신고 · ${label} ${targetId.slice(0, 8)}`,
    message: [`대상: ${label} ${path}`, commentId ? `댓글 id: ${commentId}` : null, `사유: ${reason}`].filter(Boolean).join("\n"),
    metadata: {
      kind: REPORT_TICKET_KIND,
      targetType,
      targetId,
      commentId,
      reportCategory,
    },
  });
  if (!ticket) return { ok: false, error: "신고 티켓 저장 실패" };
  return { ok: true, via: "ticket" };
}

export async function listContentReports(
  status: ReportStatus | "all" = "open",
): Promise<ContentReportRow[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const base = () =>
    sb.from("content_reports").select("*").order("created_at", { ascending: false });
  const { data, error } =
    status === "all" ? await base() : await base().eq("status", status);
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    post_id: r.post_id != null ? String(r.post_id) : null,
    target_post_id: r.target_post_id != null ? String(r.target_post_id) : null,
    target_note_id: r.target_note_id != null ? String(r.target_note_id) : null,
    comment_id: r.comment_id != null ? String(r.comment_id) : null,
    reporter_email: r.reporter_email != null ? String(r.reporter_email) : null,
    reason: String(r.reason ?? ""),
    report_category: r.report_category != null ? String(r.report_category) : null,
    status: r.status as ReportStatus,
    admin_note: r.admin_note != null ? String(r.admin_note) : null,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  }));
}

/* ---------- 신고 누적 자동 숨김 (#7) — markListingReport 패턴을 posts·inspection_notes 로 확장 ---------- */

/** dismissed 를 제외한 누적 신고 수. 본문 신고만 센다(댓글 신고 제외).
 *  [1058 · B5] 이야기·매물은 문의 티켓(종료되지 않은 것)을, 기사·노트는 content_reports 를 센다. */
async function countActiveReports(
  targetType: ReportTargetType,
  targetId: string,
): Promise<number> {
  const sb = getServiceSupabase();
  if (!sb || !targetId) return 0;
  const { count, error } =
    targetType === "post" || targetType === "listing"
      ? await sb
          .from("support_tickets")
          .select("id", { count: "exact", head: true })
          .eq("category", REPORT_TICKET_CATEGORY)
          .eq("metadata->>kind", REPORT_TICKET_KIND)
          .eq("metadata->>targetType", targetType)
          .eq("metadata->>targetId", targetId)
          .is("metadata->>commentId", null)
          .neq("status", "closed")
      : await sb
          .from("content_reports")
          .select("id", { count: "exact", head: true })
          .neq("status", "dismissed")
          .eq(targetType === "note" ? "target_note_id" : "target_post_id", targetId)
          .is("comment_id", null)
          .is("target_comment_id", null);
  /* 못 센 것을 0 으로 돌려주면 아래 `reportCount >= 3` 자동 숨김이 절대 발동하지
     않는다 — 신고가 쌓인 콘텐츠가 조회 실패 한 번 때문에 공개된 채로 남는다.
     실패가 "가려지지 않는 쪽"으로 새는 셈이라, 못 셌으면 던진다. */
  if (error) {
    throw new Error(
      `신고 개수 조회 실패 (${targetType}/${targetId}): ` +
        `${error.message ?? "알 수 없는 오류"}`,
    );
  }
  return count ?? 0;
}

/**
 * 신고 대상 콘텐츠 숨김.
 * - note: 기존 컬럼 is_public=false 로 공개 목록에서 제외 + metadata.moderation 에 사유 기록.
 * - post: posts 엔 숨김 컬럼이 없어 visibility="hidden" 값으로 표시(공개 값 public/link_only 와 구분).
 *   post_id 에 매물 id 가 들어오는 기존 경로를 위해 posts 에 없으면 listings.is_hidden 도 시도한다.
 * - board·listing: [1058 · B5] 기사는 board_posts.is_published 를 내리지 않는다(자동수집 글의 공개는 수집 파이프라인 몫) —
 *   운영자가 /admin 에서 처리한다. 매물은 종전대로 listings.is_hidden.
 */
export async function hideReportedContent(
  targetType: ReportTargetType,
  targetId: string,
): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb || !targetId) return false;
  try {
    if (targetType === "board") return false;
    if (targetType === "note") {
      const { data } = await sb
        .from("inspection_notes")
        .select("id, metadata")
        .eq("id", targetId)
        .maybeSingle();
      if (!data) return false;
      const metadata =
        data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {};
      const { error } = await sb
        .from("inspection_notes")
        .update({
          is_public: false,
          metadata: {
            ...metadata,
            moderation: { hidden: true, reason: "report", hiddenAt: new Date().toISOString() },
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetId);
      /* [969 · 20] 숨긴 노트의 상세 데이터 캐시(행·회차·관련 풀)를 비운다 — 안 비우면
         신고 누적으로 가린 글이 공개 링크로 5분간 그대로 열린다. 숨김이 성공한 때만. */
      if (!error) invalidateNoteCache(targetId, "content");
      return !error;
    }
    const { data: post } = await sb
      .from("posts")
      .select("id")
      .eq("id", targetId)
      .maybeSingle();
    if (post) {
      const { error } = await sb
        .from("posts")
        .update({ visibility: "hidden", updated_at: new Date().toISOString() })
        .eq("id", targetId);
      /* [1007 · 리뷰 M2] 숨긴 글이 6시간 ISR 상세·피드·동네 홈·홈에 남지 않게 */
      if (!error) {
        try {
          revalidatePath(`/town/story/${targetId}`);
          revalidatePath(`/town/news/${targetId}`);
        } catch {
          /* 요청 밖(크론)에서는 던질 수 있다 — TTL 이 안전망 */
        }
        invalidateTownFeed();
        invalidateHomeData();
      }
      return !error;
    }
    const { data: listing } = await sb
      .from("listings")
      .select("id")
      .eq("id", targetId)
      .maybeSingle();
    if (listing) {
      const { error } = await sb
        .from("listings")
        .update({ is_hidden: true, updated_at: new Date().toISOString() })
        .eq("id", targetId);
      return !error;
    }
    return false;
  } catch (e) {
    logger.warn("[moderation] hideReportedContent", e);
    return false;
  }
}

/**
 * 신고 접수 후 누적 처리 — 임계값(3회) 도달 시 자동 숨김. best-effort(실패 무시).
 */
export async function markContentReportTarget(
  targetType: ReportTargetType,
  targetId: string,
): Promise<{ ok: boolean; reportCount: number | null; hidden: boolean }> {
  try {
    const reportCount = await countActiveReports(targetType, targetId);
    if (reportCount >= CONTENT_REPORT_HIDE_THRESHOLD) {
      const hidden = await hideReportedContent(targetType, targetId);
      return { ok: true, reportCount, hidden };
    }
    return { ok: true, reportCount, hidden: false };
  } catch (e) {
    /* 자동 숨김이 조용히 건너뛰어진 것이므로 warn 이 아니라 error 로 남긴다.
       reportCount 도 0 이 아니라 null — "신고 0건"이 아니라 "못 셌다"이다. */
    logger.error(
      `[moderation] 자동 숨김 판정 실패 (${targetType}/${targetId}) — 임계값 확인을 건너뛰었습니다.`,
      e,
    );
    return { ok: false, reportCount: null, hidden: false };
  }
}

/**
 * 숨김 처리된 posts id 부분집합 조회 — 피드에서 걸러내기 위한 헬퍼.
 * (posts.visibility="hidden" 은 Post 타입에 없는 값이라 읽기 경로에서 드러나지 않는다.)
 */
export async function listHiddenPostIds(ids: string[]): Promise<Set<string>> {
  const sb = getServiceSupabase();
  const targets = ids.filter(Boolean);
  if (!sb || targets.length === 0) return new Set();
  try {
    const { data, error } = await sb
      .from("posts")
      .select("id")
      .in("id", targets)
      .eq("visibility", "hidden");
    if (error || !data) return new Set();
    return new Set(data.map((r) => String((r as { id: unknown }).id)));
  } catch (e) {
    logger.warn("[moderation] listHiddenPostIds", e);
    return new Set();
  }
}

/** 단건 숨김 여부 — 상세 페이지 게이트용.
 *  [1058 · B7] listHiddenPostIds 는 피드용이라 실패를 빈 집합으로 삼킨다(fail-open) — 상세 게이트는 못 읽었으면
 *  던진다. 가린 글을 조회 실패 한 번 때문에 여는 쪽으로 새지 않게. uuid 모양이 아니면 조회 없이 false. */
export async function isPostHidden(id: string): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { data, error } = await sb
    .from("posts")
    .select("visibility")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(`posts (${id}) 숨김 여부 조회 실패: ${error.message ?? "알 수 없는 오류"}`);
  }
  return data?.visibility === "hidden";
}

/**
 * 신고 상태 변경.
 * reviewed(처리 확정) 시 대상 콘텐츠를 숨기고, 신고자에게 인앱 알림으로 결과를 통보한다(#7).
 * dismissed 시에도 신고자에게 검토 결과를 통보한다. 부가 동작은 best-effort.
 */
export async function updateContentReportStatus(
  id: string,
  status: ReportStatus,
  adminNote?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, error: "Supabase 미설정" };

  const { data: reportRow } = await sb
    .from("content_reports")
    .select("id, post_id, target_post_id, target_note_id, comment_id, target_comment_id, reporter_email")
    .eq("id", id)
    .maybeSingle();

  const { error } = await sb
    .from("content_reports")
    .update({
      status,
      admin_note: adminNote ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  if (reportRow) {
    const noteId = reportRow.target_note_id != null ? String(reportRow.target_note_id) : null;
    const postId = reportRow.post_id != null ? String(reportRow.post_id) : null;
    const isCommentReport = reportRow.comment_id != null || reportRow.target_comment_id != null;
    try {
      if (status === "reviewed" && !isCommentReport) {
        if (noteId) await hideReportedContent("note", noteId);
        else if (postId) await hideReportedContent("post", postId);
        /* [1058 · B5] 기사(target_post_id) 는 자동 숨김 대상이 아니다(hideReportedContent 주석) */
      }
      const reporter =
        reportRow.reporter_email != null ? String(reportRow.reporter_email).trim() : "";
      if (reporter && (status === "reviewed" || status === "dismissed")) {
        await pushInboxNotification({
          userEmail: reporter,
          title: status === "reviewed" ? "신고 처리 완료" : "신고 검토 결과",
          body:
            status === "reviewed"
              ? "신고해 주신 콘텐츠가 운영정책 위반으로 확인되어 숨김 처리됐어요. 신고 감사합니다."
              : "신고해 주신 콘텐츠를 검토했지만 운영정책 위반을 확인하지 못했어요.",
          actionUrl: "/notifications",
        });
      }
    } catch (e) {
      logger.warn("[moderation] updateContentReportStatus side-effects", e);
    }
  }
  return { ok: true };
}
