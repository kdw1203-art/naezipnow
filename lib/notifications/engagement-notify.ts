/**
 * [1056 · B] 참여 알림 한곳 — 좋아요·댓글 채택·후기 도움·새 팔로워·답글·지역 레벨 상승.
 *
 * 감사(2026-10-11)에서 확인한 사실: 위 여섯 사건은 전부 **상대에게 조용했다.** 좋아요는
 * 카운트만 올랐고, 채택은 포인트만 들어갔고, 팔로우는 팔로워 수만 바뀌었다. 받은편지함
 * (lib/notifications/inbox)과 웹푸시(lib/push/vapid)는 이미 있었지만 이 사건들이 부르지 않았다.
 *
 * 규칙:
 *  · 인앱(받은편지함)은 항상. 푸시는 수신자의 설정(pushLikes·pushComments·pushExpert)이 켜져
 *    있고 push_subscriptions 에 구독이 있을 때만. 설정 조회에 실패하면 푸시는 보내지 않는다
 *    (app/api/cron/attendance-reminders 와 같은 태도 — 껐는지 모르는 채 보내는 쪽이 더 나쁘다.
 *    인앱은 이미 남아 있다).
 *  · 전부 fail-soft — 알림이 본작업(좋아요·채택·팔로우)을 되돌리지 않는다. 호출부는
 *    `void notify…().catch(...)` 로 부른다.
 *  · 본문은 사실만 " · " 로 잇는다(브리프 규칙). 제목에 느낌표·권유문 없음.
 *
 * 임계 판정(likeMilestone·helpfulMilestone)은 순수 함수 — tests/unit/review-1056-b 가 고정한다.
 */
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { getPrefs, type NotificationPrefs } from "@/lib/notification-prefs/store-db";
import { getServiceSupabase } from "@/lib/supabase/service";
import { isWebPushConfigured, sendPush, type PushPayload } from "@/lib/push/vapid";
import { kstParts } from "@/lib/format/kst";
import { complexHrefFromId } from "@/lib/seo/complex-slug";
import { logger } from "@/lib/log";

/* ---------- 순수 규칙 ---------- */

/** 좋아요 알림을 보내는 누적 수 — 매 좋아요마다 보내면 소음이라 경계에서만 */
export const LIKE_MILESTONES: readonly number[] = [1, 5, 10, 25, 50, 100];
/** 후기 "도움돼요" 알림 경계 */
export const HELPFUL_MILESTONES: readonly number[] = [1, 5, 10, 25];

/** 좋아요 수가 알림 경계(1·5·10·25·50·100)에 **정확히** 닿았는가 */
export function likeMilestone(count: number): boolean {
  return Number.isInteger(count) && LIKE_MILESTONES.includes(count);
}

/** 도움돼요 수가 알림 경계(1·5·10·25)에 정확히 닿았는가 */
export function helpfulMilestone(count: number): boolean {
  return Number.isInteger(count) && HELPFUL_MILESTONES.includes(count);
}

/** "10/11" — 알림 본문용 KST 월/일. 파싱 실패면 "" */
export function kstDayLabel(input: string | number | Date | null | undefined = new Date()): string {
  const p = kstParts(input);
  if (!p) return "";
  return `${p.month}/${p.day}`;
}

/** 제목 30자 자르기 — 비면 대체어 */
export function clipTitle(s: string | null | undefined, fallback = "제목 없음", max = 30): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return fallback;
  return t.length > max ? t.slice(0, max) : t;
}

/** 이메일 앞부분(로컬 파트) — 닉네임이 없을 때 표시용. 비면 "이웃" */
export function emailLocalPart(email: string | null | undefined): string {
  const local = String(email ?? "").split("@")[0]?.trim() ?? "";
  return local || "이웃";
}

/** 핸들(또는 닉네임) → 공개 프로필 주소. 없으면 받은편지함 */
export function profileHrefFor(handleOrName: string | null | undefined): string {
  const h = String(handleOrName ?? "").trim();
  return h ? `/u/${encodeURIComponent(h)}` : "/notifications";
}

/* ---------- 발송 ---------- */

/** 푸시를 가르는 설정 키 — 이 모듈이 아는 것만(나머지 키는 각자 크론이 쓴다) */
export type EngagementPushPref = Extract<
  keyof NotificationPrefs,
  "pushLikes" | "pushComments" | "pushExpert"
>;

type SubRow = { endpoint: unknown; p256dh: unknown; auth: unknown };

/**
 * 한 사람의 모든 구독에 웹푸시(best-effort). VAPID 미설정·구독 없음·조회 실패는 0.
 * 만료(410/404) 구독은 지우지 않는다 — 다른 발송 경로(app/api/push/send)가 정리한다.
 */
export async function sendPushToUser(userEmail: string, payload: PushPayload): Promise<number> {
  if (!isWebPushConfigured()) return 0;
  const sb = getServiceSupabase();
  if (!sb) return 0;
  const email = userEmail.trim();
  if (!email) return 0;
  /* push_subscriptions.user_email 은 세션 이메일 그대로 저장된다(소문자 보장 없음) */
  const keys = [...new Set([email, email.toLowerCase()])];
  const { data, error } = await sb
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("user_email", keys)
    .limit(20);
  if (error) {
    logger.warn(`[engagement-notify] push_subscriptions 조회 실패 (${email})`, error.message);
    return 0;
  }
  const subs = (data ?? []) as SubRow[];
  if (subs.length === 0) return 0;
  let sent = 0;
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        const r = await sendPush(
          { endpoint: String(s.endpoint), keys: { p256dh: String(s.p256dh), auth: String(s.auth) } },
          payload,
        );
        if (r.ok) sent += 1;
      } catch {
        /* 개별 구독 실패는 무시 — 인앱 알림이 이미 남아 있다 */
      }
    }),
  );
  return sent;
}

/**
 * 인앱 + (설정이 켜져 있으면) 푸시. 인앱이 실패해도 던지지 않는다 — 로그만.
 * push 를 주지 않으면 인앱만 보낸다.
 */
export async function notifyEngagement(input: {
  userEmail: string;
  title: string;
  body: string;
  actionUrl: string;
  push?: { pref: EngagementPushPref; tag: string; eventType?: PushPayload["eventType"] };
}): Promise<{ inbox: boolean; pushed: number }> {
  const email = input.userEmail.trim();
  if (!email) return { inbox: false, pushed: 0 };
  let inbox = false;
  try {
    await appendInboxNotification({
      userEmail: email,
      title: input.title,
      body: input.body,
      actionUrl: input.actionUrl,
    });
    inbox = true;
  } catch (e) {
    logger.error(`[engagement-notify] 인앱 알림 실패 (${input.title})`, e);
  }
  if (!input.push) return { inbox, pushed: 0 };
  const pushed = await pushIfPrefAllows(email, input.push.pref, {
    title: input.title,
    body: input.body,
    url: input.actionUrl,
    tag: input.push.tag,
    eventType: input.push.eventType ?? "generic",
  });
  return { inbox, pushed };
}

/**
 * 설정 키가 켜져 있을 때만 웹푸시. 설정 조회 실패·꺼짐·구독 없음은 0. 던지지 않는다.
 * 인앱을 따로 보내는 호출부(lib/notifications/comment-notify)가 푸시만 덧붙일 때 쓴다.
 */
export async function pushIfPrefAllows(
  userEmail: string,
  pref: EngagementPushPref,
  payload: PushPayload,
): Promise<number> {
  const email = userEmail.trim();
  if (!email) return 0;
  let allowed = false;
  try {
    const prefs = await getPrefs(email);
    allowed = Boolean(prefs[pref]);
  } catch (e) {
    /* 껐는지 모르면 보내지 않는다 — 인앱은 이미 남았다 */
    logger.warn(`[engagement-notify] 알림 설정 조회 실패 — 푸시 생략 (${email})`, e);
    return 0;
  }
  if (!allowed) return 0;
  try {
    return await sendPushToUser(email, payload);
  } catch (e) {
    logger.warn(`[engagement-notify] 푸시 발송 실패 (${email})`, e);
    return 0;
  }
}

/* ---------- 조회 보조 ---------- */

/**
 * 이메일 → profiles.handle·full_name(닉네임). 행이 없거나 실패하면 둘 다 null.
 * /u/[handle] 의 조회 규칙(handle 우선 → full_name 폴백)과 짝이 되는 역방향 조회.
 */
export async function lookupProfileHandle(
  email: string,
): Promise<{ handle: string | null; name: string | null }> {
  const none = { handle: null, name: null };
  const clean = email.trim().toLowerCase();
  if (!clean) return none;
  try {
    const sb = getServiceSupabase();
    if (!sb) return none;
    const { data, error } = await sb
      .from("profiles")
      .select("handle, full_name")
      .eq("email", clean)
      .limit(1);
    if (error) {
      logger.warn(`[engagement-notify] profiles 조회 실패 (${clean})`, error.message);
      return none;
    }
    const row = (data ?? [])[0] as { handle?: string | null; full_name?: string | null } | undefined;
    if (!row) return none;
    return {
      handle: row.handle?.trim() || null,
      name: row.full_name?.trim() || null,
    };
  } catch (e) {
    logger.warn(`[engagement-notify] profiles 조회 실패 (${clean})`, e);
    return none;
  }
}

/**
 * 임장노트 댓글 한 건의 작성자 이메일 — 답글 알림의 수신자.
 * lib/inspection/note-comments 의 공개 응답(NoteComment)에는 author_email 이 없어
 * 여기서 표를 직접 읽는다(소프트삭제된 댓글은 null — 지운 댓글에 답글 알림을 보내지 않는다).
 */
export async function loadNoteCommentAuthorEmail(
  noteId: string,
  commentId: string,
): Promise<string | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("note_comments")
      .select("author_email, deleted_at")
      .eq("note_id", noteId)
      .eq("id", commentId)
      .maybeSingle();
    if (error || !data) return null;
    if (data.deleted_at) return null;
    const email = String(data.author_email ?? "").trim().toLowerCase();
    return email || null;
  } catch {
    return null;
  }
}

/* ---------- 사건별 발송 ---------- */

/** B1 — 글 좋아요 경계 알림(작성자에게). 호출부가 경계·본인 여부를 이미 걸렀다 */
export async function notifyPostLikeMilestone(input: {
  authorEmail: string;
  postId: string;
  postTitle: string;
  likeCount: number;
  postPath: string;
}): Promise<void> {
  await notifyEngagement({
    userEmail: input.authorEmail,
    title: `좋아요 ${input.likeCount}`,
    body: `${clipTitle(input.postTitle)} · ${kstDayLabel()}`,
    actionUrl: input.postPath,
    push: { pref: "pushLikes", tag: `post-like-${input.postId}-${input.likeCount}` },
  });
}

/** B2 — 댓글 채택(채택된 댓글 작성자에게). 포인트가 실제로 들어갔을 때만 +NP 를 적는다 */
export async function notifyCommentAdopted(input: {
  commenterEmail: string;
  postTitle: string;
  pointsAwarded: number;
  postPath: string;
}): Promise<void> {
  const body =
    input.pointsAwarded > 0
      ? `${clipTitle(input.postTitle)} · +${input.pointsAwarded}P`
      : clipTitle(input.postTitle);
  await notifyEngagement({
    userEmail: input.commenterEmail,
    title: "댓글 채택",
    body,
    actionUrl: `${input.postPath}#comments`,
    push: { pref: "pushComments", tag: `comment-adopted-${input.postPath}`, eventType: "comment" },
  });
}

/** B3 — 단지 후기 도움돼요 경계 알림(후기 작성자에게) */
export async function notifyReviewHelpfulMilestone(input: {
  authorEmail: string;
  reviewId: string;
  complexId: string;
  complexName: string;
  helpfulCount: number;
}): Promise<void> {
  await notifyEngagement({
    userEmail: input.authorEmail,
    title: `후기 도움 ${input.helpfulCount}`,
    body: `${clipTitle(input.complexName, "단지")} 후기 · ${kstDayLabel()}`,
    /* 정규 슬러그 주소 — 순수 id 로 보내면 미들웨어가 308 을 한 번 더 탄다(lib/seo/complex-slug) */
    actionUrl: complexHrefFromId(input.complexId),
    push: { pref: "pushLikes", tag: `review-helpful-${input.reviewId}-${input.helpfulCount}` },
  });
}

/** B4 — 새 팔로워(팔로우 당한 사람에게). 팔로워 닉네임이 없으면 이메일 앞부분 */
export async function notifyNewFollower(input: {
  followedEmail: string;
  followerEmail: string;
}): Promise<void> {
  const prof = await lookupProfileHandle(input.followerEmail);
  const shown = prof.name || prof.handle || emailLocalPart(input.followerEmail);
  await notifyEngagement({
    userEmail: input.followedEmail,
    title: "새 팔로워",
    body: `${shown} · ${kstDayLabel()}`,
    actionUrl: profileHrefFor(prof.handle ?? prof.name),
    /* 팔로우는 "좋아요 · 저장" 묶음(pushLikes) — 설정 화면에 팔로우 전용 토글이 없다 */
    push: { pref: "pushLikes", tag: `follow-${input.followerEmail}` },
  });
}

/** B5 — 내 댓글에 답글(부모 댓글 작성자에게) */
export async function notifyReplyToComment(input: {
  parentAuthorEmail: string;
  noteId: string;
  noteTitle: string;
  replierLabel: string;
}): Promise<void> {
  await notifyEngagement({
    userEmail: input.parentAuthorEmail,
    title: "내 댓글에 답글",
    body: `${clipTitle(input.noteTitle)} · ${input.replierLabel}`,
    actionUrl: `/notes/${encodeURIComponent(input.noteId)}#comments`,
    push: { pref: "pushComments", tag: `note-reply-${input.noteId}`, eventType: "comment" },
  });
}

/** B6 — 지역 임장 레벨 상승(본인에게). 포인트가 실제 지급됐을 때만 호출한다 */
export async function notifyRegionLevelUp(input: {
  userEmail: string;
  regionName: string;
  levelLabel: string;
  pointsAwarded: number;
}): Promise<void> {
  await notifyEngagement({
    userEmail: input.userEmail,
    title: "지역 임장 레벨 상승",
    body: `${input.regionName} ${input.levelLabel} · +${input.pointsAwarded}P`,
    /* /my 허브의 "지역 임장 레벨" 섹션에는 id 앵커가 없다(app/my/MyHubView.tsx) — 허브로 */
    actionUrl: "/my",
  });
}

/**
 * B7 — 전문가 상담 답변(의뢰자에게). pushExpert 로 푸시를 가른다.
 * 발송 지점은 app/api/experts/[id]/consult/route.ts PATCH(지금은 appendInboxNotification 직접
 * 호출) — 그 파일은 이 묶음의 소유가 아니라 여기 헬퍼만 둔다. 한 줄로 바꿔 끼우면 된다.
 */
export async function notifyExpertConsultReply(input: {
  requesterEmail: string;
  expertName: string;
  replyMessage: string;
}): Promise<void> {
  const preview = input.replyMessage.replace(/\s+/g, " ").trim();
  await notifyEngagement({
    userEmail: input.requesterEmail,
    title: `${input.expertName} 전문가 답변`,
    body: preview.length > 160 ? `${preview.slice(0, 159)}…` : preview,
    actionUrl: "/my/consultations#sent",
    push: { pref: "pushExpert", tag: `expert-reply-${input.requesterEmail}`, eventType: "expert" },
  });
}
