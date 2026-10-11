import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { getServiceSupabase } from "@/lib/supabase/service";
import { readPaged } from "@/lib/supabase/read-paged";
import { normalizeJourneyState } from "@/lib/journey/state";
import { kstToday } from "@/lib/journey/dates";
import {
  JOURNEY_REMINDER_DEDUPE_DAYS,
  JOURNEY_REMINDER_URL,
  dueJourneyRemindersFor,
  type JourneyReminder,
} from "@/lib/journey/reminder";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { sendPush, type PushPayload } from "@/lib/push/vapid";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * [1057 · C3] 내 집 마련 여정 D-day 리마인드 — user_preferences.journey_state 의 계약일·중도금일·잔금일·입주일이
 * 오늘(KST) 기준 **D-7 · D-1** 인 사람에게 수신함 알림("{항목} D-7" · "{M/D} · 내 집 마련 여정" · /journey)
 * + 웹푸시(push_subscriptions 가 있는 사람만).
 *
 * 왜: 일정표는 /journey/contract 에서 적기만 하고 아무 크론도 알려 주지 않았다 — 다시 들어와야만 보이는 날짜였다.
 * 주기: `.github/workflows/etl.yml` 의 `alerts` 잡이 매일 06:00 UTC = 15:00 KST 에 호출한다.
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션).
 * 대상 조회: user_preferences 를 readPaged(author_email 정렬 — 이 표의 PK · id 열은 없다)로 끝까지 읽는다. journey_state 는
 *   NOT NULL DEFAULT '{}' 라 `is null` 이 걸러 주지 않는다 — `journey_state->contract` 가 SQL NULL(키 없음)인 행만 뺀다.
 *   날짜 판정(D-7 · D-1 · KST)은 lib/journey/reminder.ts(순수 · 테스트).
 * 멱등: 같은 사람에게 같은 제목+본문의 수신함 행이 최근 10일 안에 있으면 건너뛴다(user_inbox_notifications · action_url=/journey).
 *   이 조회가 실패하면 보내지 않는다 — 보냈는지 모르는 채 또 보내는 쪽이 한 번 거르는 쪽보다 나쁘다(schedule-reminders 와 같다).
 * 푸시: push_subscriptions.user_email 은 세션 표기 그대로라 소문자(user_preferences 의 표기)와 어긋나면 푸시만 빠진다(수신함은 남는다).
 * 설정 게이트 없음: 본인이 적은 날짜의 리마인드라 끄는 스위치를 두지 않았다.
 * 응답: { ok, sent, skipped, pushSent, date, scanned, truncated }.
 */
const MAX_USERS = 50_000;
/** 수신함 중복 조회·푸시 구독 조회의 이메일 묶음 크기 — 사람당 최대 8행(날짜 4 × D-7/D-1)이라 50명 = 400행 < PostgREST 1,000행 상한 */
const CHUNK = 50;

type Candidate = { email: string; reminders: JourneyReminder[] };

export async function GET(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ ok: true, sent: 0, skipped: 0, note: "Supabase 미설정" });

  const now = new Date();
  const date = kstToday(now.getTime());

  let scanned: { rows: Array<{ author_email: unknown; journey_state: unknown }>; truncated: boolean };
  try {
    scanned = await readPaged<{ author_email: unknown; journey_state: unknown }>(
      (from, to) =>
        sb
          .from("user_preferences")
          .select("author_email, journey_state")
          .not("journey_state->contract", "is", null)
          .order("author_email", { ascending: true })
          .range(from, to),
      MAX_USERS,
    );
  } catch (e) {
    logger.error("[cron/journey-reminders] user_preferences 조회 실패", e);
    return NextResponse.json(
      { ok: false, sent: 0, skipped: 0, error: "여정 상태 조회 실패" },
      { status: 503, headers: { "Retry-After": "600" } },
    );
  }

  const norm = (v: string) => v.trim().toLowerCase();
  const candidates: Candidate[] = [];
  for (const r of scanned.rows) {
    const email = norm(String(r.author_email ?? ""));
    if (!email) continue;
    const reminders = dueJourneyRemindersFor(normalizeJourneyState(r.journey_state), now);
    if (reminders.length > 0) candidates.push({ email, reminders });
  }
  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      sent: 0,
      skipped: 0,
      pushSent: 0,
      date,
      scanned: scanned.rows.length,
      truncated: scanned.truncated,
    });
  }

  const since = new Date(now.getTime() - JOURNEY_REMINDER_DEDUPE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let sent = 0;
  let skipped = 0;
  let pushSent = 0;

  for (let i = 0; i < candidates.length; i += CHUNK) {
    const chunk = candidates.slice(i, i + CHUNK);
    const emails = chunk.map((c) => c.email);

    const { data: recent, error: recentError } = await sb
      .from("user_inbox_notifications")
      .select("user_email, title, body")
      .eq("action_url", JOURNEY_REMINDER_URL)
      .gte("created_at", since)
      .in("user_email", emails)
      .limit(1000);
    if (recentError) {
      return NextResponse.json(
        {
          ok: false,
          sent,
          skipped: skipped + chunk.reduce((n, c) => n + c.reminders.length, 0),
          error: `수신함 조회 실패: ${recentError.message}`,
        },
        { status: 503, headers: { "Retry-After": "600" } },
      );
    }
    const already = new Set(
      (recent ?? []).map((r) => `${norm(String(r.user_email ?? ""))}|${String(r.title ?? "")}|${String(r.body ?? "")}`),
    );

    /* 푸시 구독은 묶음마다 한 번 — 못 읽으면 푸시만 생략한다(수신함은 그대로 남긴다). */
    const subsByEmail = new Map<string, Array<{ endpoint: string; p256dh: string; auth: string }>>();
    const { data: subs, error: subsError } = await sb
      .from("push_subscriptions")
      .select("user_email, endpoint, p256dh, auth")
      .in("user_email", emails)
      .limit(1000);
    if (subsError) {
      logger.warn("[cron/journey-reminders] push_subscriptions 조회 실패 — 푸시 생략", subsError.message);
    }
    for (const s of subs ?? []) {
      const key = norm(String(s.user_email ?? ""));
      if (!key) continue;
      const list = subsByEmail.get(key) ?? [];
      list.push({ endpoint: String(s.endpoint), p256dh: String(s.p256dh), auth: String(s.auth) });
      subsByEmail.set(key, list);
    }

    for (const c of chunk) {
      for (const rem of c.reminders) {
        const key = `${c.email}|${rem.title}|${rem.body}`;
        if (already.has(key)) {
          skipped += 1;
          continue;
        }
        try {
          await appendInboxNotification({
            userEmail: c.email,
            title: rem.title,
            body: rem.body,
            actionUrl: JOURNEY_REMINDER_URL,
          });
        } catch (e) {
          logger.error("[cron/journey-reminders] 수신함 기록 실패", e);
          skipped += 1;
          continue;
        }
        already.add(key);
        sent += 1;

        const mySubs = subsByEmail.get(c.email) ?? [];
        if (mySubs.length === 0) continue;
        const payload: PushPayload = {
          title: rem.title,
          body: rem.body,
          url: JOURNEY_REMINDER_URL,
          tag: `journey-${rem.key}-${rem.date}`,
          eventType: "generic",
        };
        await Promise.allSettled(
          mySubs.map(async (sub) => {
            const r = await sendPush({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
            if (r.ok) pushSent += 1;
          }),
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    skipped,
    pushSent,
    date,
    scanned: scanned.rows.length,
    truncated: scanned.truncated,
  });
}
