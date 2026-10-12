/**
 * POST /api/push/subscribe   — 푸시 구독 저장
 * DELETE /api/push/subscribe — 구독 삭제 (알림 끄기)
 * GET /api/push/subscribe    — VAPID 공개키 반환
 * GET /api/push/subscribe?endpoint=<endpoint> — [1058] 이 브라우저 구독이 **서버에** 있는지 { subscribed } (로그인 · 내 행만)
 */
import { NextResponse } from "next/server";
import { logger } from "@/lib/log";
import { safeAuth } from "@/lib/safe-auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getVapidPublicKey } from "@/lib/push/vapid";
import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";

export async function GET(req: Request) {
  /* [1058] 브라우저에 구독 객체가 있어도 서버 저장(POST)이 실패했거나 비로그인(401)으로 안 됐으면 알림은 오지 않는다 —
     PushSubscribe 가 "알림 켜짐"을 그리기 전에 여기로 묻는다. 읽기 전용 · endpoint + 내 이메일로만 찾는다. */
  const endpoint = new URL(req.url).searchParams.get("endpoint")?.trim() ?? "";
  if (endpoint) {
    const session = await safeAuth();
    if (!session?.user?.email) {
      return NextResponse.json({ subscribed: false, requiresLogin: true }, { status: 401 });
    }
    const sb = getServiceSupabase();
    if (!sb) return NextResponse.json({ subscribed: false, stored: false });
    const { data, error } = await sb
      .from("push_subscriptions")
      .select("endpoint")
      .eq("endpoint", endpoint)
      .eq("user_email", session.user.email)
      .limit(1);
    if (error) return dbUnavailable("push-subscribe-status", error, "알림 상태 확인 실패 · 잠시 후 다시");
    return NextResponse.json({ subscribed: Array.isArray(data) && data.length > 0 }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return NextResponse.json({
      enabled: false,
      publicKey: null,
      reason: "VAPID 키 미설정",
    });
  }
  return NextResponse.json({
    enabled: true,
    publicKey,
    policy: {
      requiresLogin: true,
      eventTypes: ["comment", "meeting", "attendance", "service"],
    },
  });
}

export async function POST(req: Request) {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "푸시 알림은 로그인 후 사용할 수 있습니다.", requiresLogin: true },
      { status: 401 },
    );
  }
  const sb = getServiceSupabase();

  const body = (await req.json().catch(() => ({}))) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "endpoint, keys.p256dh, keys.auth 필수" }, { status: 400 });
  }

  if (!sb) {
    return NextResponse.json({ ok: true, stored: false, note: "Supabase 미설정 - 메모리만" });
  }

  const ua = req.headers.get("user-agent") ?? null;

  const { error } = await sb.from("push_subscriptions").upsert(
    {
      user_email: session.user.email,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      user_agent: ua,
      requires_login: true,
      event_types: ["comment", "meeting", "attendance", "service"],
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    logger.error("[api] DB 오류", error.message);
    return NextResponse.json({ error: "서버 오류 — 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, stored: true });
}

/**
 * 구독 해제. 예전에는 세션 확인 없이 요청 본문의 endpoint 만으로 service-role
 * 클라이언트가 행을 지웠다 — endpoint 는 남의 것을 알아낼 수 있는 값이라(같은 기기·
 * 로그 유출 등) 아무나 남의 푸시 구독을 끊을 수 있었다. POST 와 같은 규칙으로
 * 로그인을 요구하고, 삭제 대상도 **자기 이메일의 행** 으로 좁힌다.
 */
export async function DELETE(req: Request) {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "푸시 알림은 로그인 후 사용할 수 있습니다.", requiresLogin: true },
      { status: 401 },
    );
  }
  const sb = getServiceSupabase();
  const body = (await req.json().catch(() => ({}))) as { endpoint?: string };

  if (!body.endpoint) {
    return NextResponse.json({ error: "endpoint 필수" }, { status: 400 });
  }

  if (!sb) return NextResponse.json({ ok: true });

  await sb
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", body.endpoint)
    .eq("user_email", session.user.email);
  return NextResponse.json({ ok: true });
}
