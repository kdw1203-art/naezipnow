import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { getServiceSupabase } from "@/lib/supabase/service";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { sendEmail, isEmailConfigured } from "@/lib/email/send";
import { SITE_ORIGIN } from "@/lib/seo/complex-url";
import { buildPersonalDigest, loadPersonalDigestShared, PersonalDigestBudgetExceeded } from "@/lib/digest/personal";
import {
  formatDailyDigestEmail,
  formatDailyDigestInbox,
  personalDigestPrimaryHref,
  toDailyDigest,
} from "@/lib/digest/personal-format";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * [1168] 일간 요약 — 하루 한 번, 어제부터 달라진 것이 있는 사람에게만.
 * 내용: 관심 단지 새 실거래 · 임장 다녀온 단지 새 실거래 · 오늘 접수 시작 청약 · 오늘 모임 일정.
 * 대상: 관심 단지가 있거나 모임에 참여 중인 사람(그 밖은 달라질 것이 없다). 다이제스트 알림을 끈 사람은 뺀다.
 * 채널: 수신함 + 메일(발송 설정 + 마케팅 수신 동의자만 · 제목 (광고)).
 * 같은 제목이 오늘 이미 있으면 건너뛴다. ?dry=1 이면 보내지 않는다.
 */
const MAX_USERS = 3000;
const BUDGET_MS = 90_000;

export async function GET(req: Request) {
  if (!(await authorizeCron(req))) return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ ok: true, sent: 0, note: "Supabase 미설정" });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const started = Date.now();
  const now = new Date();
  const ymd = new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

  const emails = new Set<string>();
  let optOut = new Set<string>();
  let consent = new Set<string>();
  try {
    const [w, g, off, ok] = await Promise.all([
      sb.from("user_watchlist").select("user_email").limit(20000),
      sb.from("group_members").select("user_email").eq("status", "joined").limit(20000),
      sb.from("notification_preferences").select("user_email").eq("push_weekly_digest", false).limit(20000),
      sb.from("user_consents").select("user_email").eq("marketing_agreed", true).limit(20000),
    ]);
    if (w.error) throw new Error(`user_watchlist: ${w.error.message}`);
    if (g.error) throw new Error(`group_members: ${g.error.message}`);
    if (off.error) throw new Error(`notification_preferences: ${off.error.message}`);
    for (const r of [...(w.data ?? []), ...(g.data ?? [])]) {
      const e = norm(r.user_email);
      if (e) emails.add(e);
    }
    optOut = new Set((off.data ?? []).map((r) => norm(r.user_email)));
    if (ok.error) logger.error("[cron/daily-digest] 동의 조회 실패 — 메일 생략", ok.error.message);
    else consent = new Set((ok.data ?? []).map((r) => norm(r.user_email)));
  } catch (e) {
    logger.error("[cron/daily-digest] 대상 조회 실패", e);
    return NextResponse.json({ ok: false, sent: 0, error: "대상 조회 실패" }, { status: 503, headers: { "Retry-After": "600" } });
  }

  const targets = [...emails].filter((e) => !optOut.has(e)).slice(0, MAX_USERS);
  const shared = await loadPersonalDigestShared(now, 1);
  const mailOn = isEmailConfigured();
  const dayStart = new Date(Date.parse(`${ymd}T00:00:00+09:00`)).toISOString();
  let sent = 0;
  let mailed = 0;
  let empty = 0;
  let skipped = 0;
  let failed = 0;
  let stopped = false;
  for (const email of targets) {
    if (Date.now() - started > BUDGET_MS) {
      stopped = true;
      break;
    }
    try {
      const d = toDailyDigest(await buildPersonalDigest(email, { now, days: 1, shared }));
      if (!d) {
        empty += 1;
        continue;
      }
      const inbox = formatDailyDigestInbox(d, ymd);
      if (dry) {
        sent += 1;
        continue;
      }
      const dup = await sb
        .from("user_inbox_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_email", email)
        .eq("title", inbox.title)
        .gte("created_at", dayStart);
      if (dup.error) throw new Error(dup.error.message);
      if ((dup.count ?? 0) > 0) {
        skipped += 1;
        continue;
      }
      await appendInboxNotification({
        userEmail: email,
        title: inbox.title,
        body: inbox.body,
        actionUrl: personalDigestPrimaryHref(d),
        channel: "user",
      });
      sent += 1;
      if (mailOn && consent.has(email)) {
        const mail = formatDailyDigestEmail(d, ymd, { siteUrl: SITE_ORIGIN });
        const r = await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
        if (r.sent) mailed += 1;
      }
    } catch (e) {
      failed += 1;
      if (!(e instanceof PersonalDigestBudgetExceeded)) logger.error("[cron/daily-digest] 한 건 실패", e);
    }
  }
  return NextResponse.json({ ok: true, dry, targets: targets.length, sent, mailed, empty, skipped, failed, stopped, mailOn });
}
