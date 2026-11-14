import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { getServiceSupabase } from "@/lib/supabase/service";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { GROUP_REMINDER_TITLE, groupReminderBody, isMissingTable, kstTomorrowRange } from "@/lib/groups/club";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * [1179] 모임 일정 전날 알림 — 하루 한 번. 내일(한국 날짜) 일정에 참석을 누른 사람의 수신함에 한 줄.
 * 같은 제목 · 같은 본문이 최근 2일 안에 있으면 건너뛴다(수동 재실행 중복 방지).
 * 모임 테이블이 아직 없는 DB 에서는 아무것도 하지 않는다. ?dry=1 이면 보내지 않는다.
 */
export async function GET(req: Request) {
  if (!(await authorizeCron(req))) return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ ok: true, sent: 0, note: "Supabase 미설정" });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const win = kstTomorrowRange(Date.now());
  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

  const sch = await sb
    .from("group_schedules")
    .select("id,meeting_id,title,scheduled_at,place,status")
    .gte("scheduled_at", win.from)
    .lt("scheduled_at", win.to)
    .limit(500);
  if (sch.error) {
    if (isMissingTable(sch.error)) return NextResponse.json({ ok: true, sent: 0, note: "모임 테이블 없음" });
    logger.error("[cron/group-schedule-reminders] 일정 조회 실패", sch.error.message);
    return NextResponse.json({ ok: false, sent: 0, error: "일정 조회 실패" }, { status: 503, headers: { "Retry-After": "600" } });
  }
  const schedules = (sch.data ?? []).filter((r) => String(r.status ?? "open") !== "cancelled");
  if (schedules.length === 0) return NextResponse.json({ ok: true, sent: 0, schedules: 0, date: win.ymd });

  const ids = schedules.map((r) => String(r.id));
  const meetingIds = [...new Set(schedules.map((r) => String(r.meeting_id)))];
  const [att, meet] = await Promise.all([
    sb.from("group_schedule_attendees").select("schedule_id,user_email").in("schedule_id", ids).limit(5000),
    sb.from("meetings").select("id,title").in("id", meetingIds),
  ]);
  if (att.error) {
    logger.error("[cron/group-schedule-reminders] 참석 조회 실패", att.error.message);
    return NextResponse.json({ ok: false, sent: 0, error: "참석 조회 실패" }, { status: 503, headers: { "Retry-After": "600" } });
  }
  const titles = new Map((meet.data ?? []).map((m) => [String(m.id), String(m.title ?? "")]));
  const byId = new Map(schedules.map((r) => [String(r.id), r]));

  const targets: { email: string; body: string; href: string }[] = [];
  for (const a of att.data ?? []) {
    const s = byId.get(String(a.schedule_id));
    const email = norm(a.user_email);
    if (!s || !email) continue;
    targets.push({
      email,
      body: groupReminderBody(
        { title: String(s.title ?? ""), scheduledAt: String(s.scheduled_at), place: s.place ? String(s.place) : null },
        titles.get(String(s.meeting_id)) ?? "",
      ),
      href: `/town/groups/${String(s.meeting_id)}?tab=schedule`,
    });
  }
  if (dry) return NextResponse.json({ ok: true, dry: true, schedules: schedules.length, targets: targets.length, date: win.ymd });

  const since = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
  const emails = [...new Set(targets.map((t) => t.email))];
  const recent = emails.length
    ? await sb.from("user_inbox_notifications").select("user_email,body").eq("title", GROUP_REMINDER_TITLE).gte("created_at", since).in("user_email", emails.slice(0, 500))
    : { data: [], error: null };
  if (recent.error) {
    return NextResponse.json({ ok: false, sent: 0, error: "수신함 조회 실패" }, { status: 503, headers: { "Retry-After": "600" } });
  }
  const already = new Set((recent.data ?? []).map((r) => `${norm(r.user_email)}|${String(r.body ?? "")}`));
  let sent = 0;
  let skipped = 0;
  for (const t of targets) {
    const key = `${t.email}|${t.body}`;
    if (already.has(key)) {
      skipped += 1;
      continue;
    }
    await appendInboxNotification({ userEmail: t.email, title: GROUP_REMINDER_TITLE, body: t.body, actionUrl: t.href, channel: "user" });
    already.add(key);
    sent += 1;
  }
  return NextResponse.json({ ok: true, schedules: schedules.length, targets: targets.length, sent, skipped, date: win.ymd });
}
