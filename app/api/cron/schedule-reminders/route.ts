import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { getServiceSupabase } from "@/lib/supabase/service";
import { listPlannedSchedulesBetween } from "@/lib/inspection-schedules/store-db";
import {
  SCHEDULE_REMINDER_TITLE,
  SCHEDULE_REMINDER_URL,
  kstTomorrowWindow,
  scheduleReminderBody,
} from "@/lib/inspection-schedules/reminder";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { sendPush, type PushPayload } from "@/lib/push/vapid";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * [1056 · C7] 임장 일정 리마인드 — status=planned 이고 scheduled_at 이 **내일(KST)** 인 일정의 작성자에게
 * 수신함 알림("내일 임장 일정" · "{단지/장소명} · MM/DD HH:mm") + 웹푸시(push_subscriptions 가 있는 사람만).
 *
 * 왜: inspection_schedules 는 /my/assistant 에서 잡기만 하고 아무 크론도 알려 주지 않았다 — 일정을 잡은 뒤
 * 다시 들어와야만 보이는 약속이었다.
 *
 * 주기: `.github/workflows/etl.yml` 의 `alerts` 잡이 매일 06:00 UTC = 15:00 KST 에 호출한다.
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션).
 * 멱등: 하루 한 번 돌지만 수동 실행(어드민 패널)에 대비해, 같은 사람에게 같은 제목+본문의 수신함 행이
 *       최근 2일 안에 있으면 건너뛴다(user_inbox_notifications). 이 조회가 실패하면 보내지 않는다 —
 *       보냈는지 모르는 채 또 보내는 쪽이 한 번 거르는 쪽보다 나쁘다(attendance-reminders 와 같은 태도).
 * 설정 게이트 없음: 본인이 잡은 일정의 전날 알림이라 끄는 스위치를 두지 않았다(구독이 없으면 푸시만 생략).
 * 응답: { ok, sent, skipped, pushSent, date }.
 */
export async function GET(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ ok: true, sent: 0, skipped: 0, note: "Supabase 미설정" });

  const win = kstTomorrowWindow();
  let schedules: Awaited<ReturnType<typeof listPlannedSchedulesBetween>>;
  try {
    schedules = await listPlannedSchedulesBetween(win.startIso, win.endIso);
  } catch (e) {
    logger.error("[cron/schedule-reminders] 일정 조회 실패", e);
    return NextResponse.json(
      { ok: false, sent: 0, skipped: 0, error: "일정 조회 실패" },
      { status: 503, headers: { "Retry-After": "600" } },
    );
  }
  if (schedules.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, skipped: 0, pushSent: 0, date: win.date });
  }

  const norm = (v: string) => v.trim().toLowerCase();
  /* 수신함은 소문자 정규화로 저장한다(lib/notifications/inbox normEmail) · push_subscriptions 는 저장 당시 표기
     그대로일 수 있어 두 표기를 다 묻는다 */
  const rawEmails = [...new Set(schedules.map((s) => s.authorEmail.trim()).filter(Boolean))];
  const emails = [...new Set([...rawEmails, ...rawEmails.map(norm)])];
  if (emails.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, skipped: schedules.length, pushSent: 0, date: win.date });
  }

  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent, error: recentError } = await sb
    .from("user_inbox_notifications")
    .select("user_email, body")
    .eq("title", SCHEDULE_REMINDER_TITLE)
    .gte("created_at", since)
    .in("user_email", emails);
  if (recentError) {
    return NextResponse.json(
      { ok: false, sent: 0, skipped: schedules.length, error: `수신함 조회 실패: ${recentError.message}` },
      { status: 503, headers: { "Retry-After": "600" } },
    );
  }
  const already = new Set(
    (recent ?? []).map((r) => `${norm(String(r.user_email ?? ""))}|${String(r.body ?? "")}`),
  );

  /* 푸시 구독은 한 번에 — 못 읽으면 푸시만 생략한다(수신함은 그대로 남긴다). */
  const subsByEmail = new Map<string, Array<{ endpoint: string; p256dh: string; auth: string }>>();
  const { data: subs, error: subsError } = await sb
    .from("push_subscriptions")
    .select("user_email, endpoint, p256dh, auth")
    .in("user_email", emails)
    .limit(1000);
  if (subsError) {
    logger.warn("[cron/schedule-reminders] push_subscriptions 조회 실패 — 푸시 생략", subsError.message);
  }
  for (const s of subs ?? []) {
    const key = norm(String(s.user_email ?? ""));
    if (!key) continue;
    const list = subsByEmail.get(key) ?? [];
    list.push({ endpoint: String(s.endpoint), p256dh: String(s.p256dh), auth: String(s.auth) });
    subsByEmail.set(key, list);
  }

  let sent = 0;
  let skipped = 0;
  let pushSent = 0;
  for (const s of schedules) {
    const email = norm(s.authorEmail);
    if (!email) {
      skipped += 1;
      continue;
    }
    const body = scheduleReminderBody(s);
    const key = `${email}|${body}`;
    if (already.has(key)) {
      skipped += 1;
      continue;
    }
    try {
      await appendInboxNotification({
        userEmail: email,
        title: SCHEDULE_REMINDER_TITLE,
        body,
        actionUrl: SCHEDULE_REMINDER_URL,
      });
    } catch (e) {
      logger.error("[cron/schedule-reminders] 수신함 기록 실패", e);
      skipped += 1;
      continue;
    }
    already.add(key);
    sent += 1;

    const mySubs = subsByEmail.get(email) ?? [];
    if (mySubs.length === 0) continue;
    const payload: PushPayload = {
      title: SCHEDULE_REMINDER_TITLE,
      body,
      url: SCHEDULE_REMINDER_URL,
      tag: `schedule-${s.id}`,
      eventType: "generic",
    };
    await Promise.allSettled(
      mySubs.map(async (sub) => {
        const r = await sendPush({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        if (r.ok) pushSent += 1;
      }),
    );
  }

  return NextResponse.json({ ok: true, sent, skipped, pushSent, date: win.date });
}
