import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { getServiceSupabase } from "@/lib/supabase/service";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { sendEmail, isEmailConfigured } from "@/lib/email/send";
import { logger } from "@/lib/log";
import { TENURE_MARKS, milestoneMessage, signupWindow, type MilestoneKind } from "@/lib/me/milestones";
import { milestoneEmail } from "@/lib/me/milestone-mail";
import { loadActivityStats } from "@/lib/me/milestone-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * [1168] 함께한 기록 — 하루 한 번.
 *  · 가입 뒤 일주일 · 한 달 · 6개월 · 1년이 되는 날(한국 날짜)
 *  · 어제부터 지금까지 첫 임장노트를 쓴 사람 · 전문가 승인을 받은 사람
 * 채널: 수신함(항상) + 메일(발송 설정이 있고 마케팅 수신 동의한 사람만 · 제목 (광고)).
 * 같은 제목이 최근 30일 안에 수신함에 있으면 건너뛴다(수동 재실행 중복 방지).
 * ?dry=1 이면 보내지 않고 대상만 돌려준다.
 */
const MAX_PER_RUN = 2000;
const DEDUPE_DAYS = 30;

type Target = { email: string; name: string; kind: MilestoneKind };

export async function GET(req: Request) {
  if (!(await authorizeCron(req))) return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ ok: true, sent: 0, note: "Supabase 미설정" });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const now = Date.now();
  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
  const targets: Target[] = [];

  try {
    for (const mark of TENURE_MARKS) {
      const w = signupWindow(mark.days, now);
      const { data, error } = await sb
        .from("app_users")
        .select("email,name,created_at")
        .gte("created_at", w.from)
        .lt("created_at", w.to)
        .limit(MAX_PER_RUN);
      if (error) throw new Error(`app_users(${mark.id}): ${error.message}`);
      for (const r of data ?? []) {
        const email = norm(r.email);
        if (email) targets.push({ email, name: String(r.name ?? ""), kind: mark.id });
      }
    }
    const since = new Date(now - 26 * 3600 * 1000).toISOString();
    const recent = await sb
      .from("inspection_notes")
      .select("author_email,author_label,created_at")
      .gte("created_at", since)
      .limit(MAX_PER_RUN);
    if (recent.error) throw new Error(`inspection_notes: ${recent.error.message}`);
    const authors = new Map<string, string>();
    for (const r of recent.data ?? []) authors.set(norm(r.author_email), String(r.author_label ?? ""));
    for (const [email, name] of authors) {
      if (!email) continue;
      const older = await sb
        .from("inspection_notes")
        .select("id", { count: "exact", head: true })
        .eq("author_email", email)
        .lt("created_at", since);
      if (older.error) throw new Error(`inspection_notes(이전): ${older.error.message}`);
      if ((older.count ?? 0) === 0) targets.push({ email, name, kind: "first_note" });
    }
    const approved = await sb
      .from("expert_verification_requests")
      .select("applicant_email,display_name,reviewed_at")
      .eq("status", "approved")
      .gte("reviewed_at", since)
      .limit(MAX_PER_RUN);
    if (approved.error) throw new Error(`expert_verification_requests: ${approved.error.message}`);
    for (const r of approved.data ?? []) {
      const email = norm(r.applicant_email);
      if (email) targets.push({ email, name: String(r.display_name ?? ""), kind: "expert_approved" });
    }
  } catch (e) {
    logger.error("[cron/milestone-greetings] 대상 조회 실패", e);
    return NextResponse.json({ ok: false, sent: 0, error: "대상 조회 실패" }, { status: 503, headers: { "Retry-After": "600" } });
  }

  if (dry) {
    return NextResponse.json({ ok: true, dry: true, targets: targets.length, kinds: targets.map((t) => t.kind) });
  }

  /* 메일은 동의 기록(user_consents.marketing_agreed)이 있는 사람만. 못 읽으면 메일은 아무에게도 보내지 않는다. */
  let consent = new Set<string>();
  const mailOn = isEmailConfigured();
  if (mailOn && targets.length > 0) {
    const c = await sb
      .from("user_consents")
      .select("user_email")
      .eq("marketing_agreed", true)
      .in("user_email", [...new Set(targets.map((t) => t.email))].slice(0, 500));
    if (c.error) logger.error("[cron/milestone-greetings] 동의 조회 실패 — 메일 생략", c.error.message);
    else consent = new Set((c.data ?? []).map((r) => norm(r.user_email)));
  }

  let sent = 0;
  let mailed = 0;
  let skipped = 0;
  let failed = 0;
  const dedupeSince = new Date(now - DEDUPE_DAYS * 86400 * 1000).toISOString();
  for (const t of targets) {
    try {
      const stats = await loadActivityStats(t.email);
      const m = milestoneMessage(t.kind, t.name, stats);
      const dup = await sb
        .from("user_inbox_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_email", t.email)
        .eq("title", m.title)
        .gte("created_at", dedupeSince);
      if (dup.error) throw new Error(dup.error.message);
      if ((dup.count ?? 0) > 0) {
        skipped += 1;
        continue;
      }
      await appendInboxNotification({ userEmail: t.email, title: m.title, body: m.body, actionUrl: m.href, channel: "user" });
      sent += 1;
      if (mailOn && consent.has(t.email)) {
        const mail = milestoneEmail(m, stats);
        const r = await sendEmail({ to: t.email, subject: mail.subject, html: mail.html, text: mail.text });
        if (r.sent) mailed += 1;
      }
    } catch (e) {
      failed += 1;
      logger.error("[cron/milestone-greetings] 한 건 실패", e);
    }
  }
  return NextResponse.json({ ok: true, targets: targets.length, sent, mailed, skipped, failed, mailOn });
}
