import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { getServiceSupabase } from "@/lib/supabase/service";
import { trySendViaResend } from "@/lib/notifications/resend-send";
import { isEmailConfigured } from "@/lib/email/send";
import { emailLayout, escapeHtml } from "@/lib/email/templates";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * notification_outbox 드레인 (항목 40).
 *
 * 이메일 발송이 실패하거나 키가 없을 때 comment-notify 등이 이 큐에
 * `status:"pending"` 으로 쌓아 왔는데 — **그걸 읽는 워커가 지금까지 없었다.**
 * 큐는 재시도 장치가 아니라 무덤이었다. 이 크론이 하루 1회(etl.yml alerts 잡)
 * 큐를 비운다.
 *
 * 정직성 규칙:
 * - RESEND 키가 없으면 아무것도 "failed" 로 바꾸지 않는다 — 보내려고 시도한
 *   적이 없는 것을 실패로 기록하면 그것도 거짓 기록이다. skipped 로 답한다.
 * - 발송 실패는 attempts 를 올리고 오류 원문을 남긴다. 5회 넘게 실패한 건은
 *   dead 로 옮겨 매일 같은 주소로 재시도하는 스팸을 막는다.
 *
 * 보호: lib/cron/authorize.ts (Authorization: Bearer · x-cron-secret · 관리자 세션) — 다른 크론과 같은 규칙.
 * [1080] 예전 검사는 누구나 붙일 수 있는 `x-vercel-cron: 1` 헤더를 믿었고 CRON_SECRET 이 없으면 전부 통과였다.
 * Vercel 크론은 CRON_SECRET 을 Authorization: Bearer 로 보내므로 공용 검사로 충분하다.
 *
 * [1080] 동시 실행 보호 — 보내기 전에 attempts 를 조건부(현재값과 같을 때만)로 올려 **먼저 잡은 실행만** 보낸다.
 * 예전엔 select 와 update 가 조건 없이 떨어져 두 실행이 겹치면 같은 메일이 두 번 나갔다(주기를 15분으로 당기므로 필요).
 */
export async function GET(req: Request) {
  if (!(await authorizeCron(req))) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ ok: true, sent: 0, note: "Supabase 미설정" });

  /* [1042] 발송 수단이 하나라도 있으면 큐를 비운다 — 예전엔 Resend 키와 RESEND_FROM_EMAIL 둘 다 있어야 했다
     (SMTP 로 나가는 지금은 그 둘이 없어도 보낼 수 있다). trySendViaResend 는 키가 없으면 공용 발송기로 넘긴다. */
  const resendReady = isEmailConfigured();
  if (!resendReady) {
    /* 시도하지 않은 것을 실패로 기록하지 않는다 — 큐는 그대로 두고 사실을 남긴다. */
    return NextResponse.json({
      ok: true,
      sent: 0,
      skipped: "resend-not-configured",
      note: "메일 발송 미설정(RESEND_API_KEY 또는 SMTP_HOST) — 큐를 건드리지 않았습니다.",
    });
  }

  try {
    const { data: pending, error } = await sb
      .from("notification_outbox")
      .select("id, to_email, subject, body, attempts")
      .eq("channel", "email")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) throw new Error(error.message);

    let sent = 0;
    let failed = 0;
    let dead = 0;
    for (const row of pending ?? []) {
      const id = String(row.id);
      const to = String(row.to_email ?? "").trim();
      const attempts = Number(row.attempts ?? 0);
      if (!to) {
        await sb.from("notification_outbox").update({ status: "dead" }).eq("id", id);
        dead += 1;
        continue;
      }
      /* [1080] 잡기(CAS) — attempts 가 읽은 값 그대로일 때만 +1. 0행이면 다른 실행이 먼저 잡았다 */
      const { data: claimed, error: claimError } = await sb
        .from("notification_outbox")
        .update({ attempts: attempts + 1 })
        .eq("id", id)
        .eq("status", "pending")
        .eq("attempts", attempts)
        .select("id");
      if (claimError || !claimed || claimed.length === 0) continue;
      /* 고도화 49 — 표준 레이아웃(수신거부·사업자 푸터) 적용.
         body 는 사용자 입력(댓글 미리보기 등)이 올 수 있어 반드시 이스케이프한다
         — 이전 코드는 원문을 그대로 HTML 에 끼워 넣고 있었다. */
      const result = await trySendViaResend({
        to,
        subject: String(row.subject ?? "[내집나우] 알림"),
        html: emailLayout(
          `<div style="font-size:14px;line-height:1.7;color:#3d4657;white-space:pre-wrap">${escapeHtml(
            String(row.body ?? ""),
          )}</div>`,
        ),
        text: String(row.body ?? ""),
      });
      if (result.ok) {
        await sb
          .from("notification_outbox")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", id);
        sent += 1;
      } else if (attempts + 1 >= 5) {
        await sb
          .from("notification_outbox")
          .update({ status: "dead", last_error: result.error ?? null })
          .eq("id", id);
        dead += 1;
      } else {
        /* attempts 는 위 잡기 단계에서 이미 +1 — 오류 원문만 남긴다 */
        await sb
          .from("notification_outbox")
          .update({ last_error: result.error ?? null })
          .eq("id", id);
        failed += 1;
      }
    }

    await logIngest({
      source: "notification-outbox",
      dataset: "notification_outbox",
      origin: "cron-fetch",
      rows: sent,
      status: "ok",
      message: `outbox 드레인 — 발송 ${sent} · 재시도 대기 ${failed} · dead ${dead}`,
    });
    return NextResponse.json({ ok: true, sent, failed, dead, pending: pending?.length ?? 0 });
  } catch (e) {
    logger.error("[outbox-drain]", e);
    return NextResponse.json(
      { ok: false, error: ingestErrorMessage(e) },
      { status: 500 },
    );
  }
}
