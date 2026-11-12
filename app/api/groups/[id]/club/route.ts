/**
 * POST /api/groups/[id]/club — 임장 모임의 일정 · 게시판 · 투표 쓰기.
 * body.action: schedule.create | schedule.attend | schedule.leave | schedule.cancel
 *            | post.create | post.hide | poll.create | poll.vote | poll.close
 * 참여 중인 멤버(와 모임장)만 쓸 수 있다. 읽기는 페이지가 서버에서 한다.
 */
import { NextResponse, type NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getMeeting } from "@/lib/meetings/store-db";
import { applyRateLimit, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { isUuid, validatePoll, validatePost, validateSchedule } from "@/lib/groups/club";
import {
  cancelSchedule,
  closePoll,
  clubLabel,
  clubRole,
  createPoll,
  createPost,
  createSchedule,
  hidePost,
  setAttendance,
  votePoll,
  type WriteResult,
} from "@/lib/groups/club-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
function done(r: WriteResult) {
  if (!r.ok) return bad(r.message, r.status ?? 400);
  return NextResponse.json({ ok: true, id: r.id ?? null });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!isUuid(id)) return bad("모임 없음", 404);

  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return bad("로그인 필요", 401);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("요청 형식 확인");
  }
  const action = String(body.action ?? "");

  try {
    const meeting = await getMeeting(id);
    if (!meeting) return bad("모임 없음", 404);
    const role = await clubRole(id, meeting.organizerEmail, email);
    if (!role.member) return bad("모임 참여 후 이용 가능", 403);
    const label = clubLabel(email, session?.user?.name);
    const now = Date.now();

    switch (action) {
      case "schedule.create": {
        const v = validateSchedule(body, now);
        if (!v.ok) return bad(v.message);
        return done(await createSchedule(id, email, label, v.value));
      }
      case "schedule.attend":
      case "schedule.leave": {
        if (!isUuid(body.scheduleId)) return bad("일정 없음", 404);
        return done(await setAttendance(id, body.scheduleId, email, label, action === "schedule.attend", now));
      }
      case "schedule.cancel": {
        if (!isUuid(body.scheduleId)) return bad("일정 없음", 404);
        return done(await cancelSchedule(id, body.scheduleId, email, role.organizer));
      }
      case "post.create": {
        const v = validatePost(body);
        if (!v.ok) return bad(v.message);
        if (v.value.board === "notice" && !v.value.parentId && !role.organizer) {
          return bad("공지는 모임장만 작성 가능", 403);
        }
        return done(await createPost(id, email, label, v.value));
      }
      case "post.hide": {
        if (!isUuid(body.postId)) return bad("글 없음", 404);
        return done(await hidePost(id, body.postId, email, role.organizer));
      }
      case "poll.create": {
        const v = validatePoll(body);
        if (!v.ok) return bad(v.message);
        return done(await createPoll(id, email, label, v.value));
      }
      case "poll.vote": {
        if (!isUuid(body.pollId)) return bad("투표 없음", 404);
        return done(await votePoll(id, body.pollId, email, body.optionIds));
      }
      case "poll.close": {
        if (!isUuid(body.pollId)) return bad("투표 없음", 404);
        return done(await closePoll(id, body.pollId, email, role.organizer));
      }
      default:
        return bad("지원하지 않는 요청");
    }
  } catch (err) {
    return dbUnavailable(`모임 쓰기 실패 (meeting=${id}, action=${action})`, err);
  }
}
