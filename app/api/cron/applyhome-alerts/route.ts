import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { getServiceSupabase } from "@/lib/supabase/service";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { listAnnouncementEvents, type AnnouncementRow } from "@/lib/applyhome/store";
import { normalizeApplyhomeRegion } from "@/lib/applyhome/regions";
import { ALERT_PREFIX } from "@/lib/alerts/subscriptions";
import { logIngest } from "@/lib/market/store";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * [994 · D4] 청약 알림 스윕 — 관심 지역(user_watchlist `alert:region:<값>`)에 대해
 *   ① 지난 26시간 안에 처음 저장된 새 공고, ② 오늘 접수 시작, ③ 오늘 당첨자 발표
 * 를 인앱 수신함에 넣는다. 재료는 applyhome_announcements(supply-ingest 가 매일 적재).
 *
 * 지역 매칭: 구독값은 "서울 강남구" 처럼 시군구까지지만 청약홈 공급지역은 시/도("서울")다.
 * 시/도로 정규화해 맞춘다 — 시군구는 공고 주소 문자열에 포함되면 우선 표시할 뿐 필터하지 않는다
 * (놓치는 것보다 한 건 더 알리는 쪽이 낫다; 하루 한 번, 지역당 최대 5건).
 * 중복 방지: 같은 사용자에게 같은 공고·같은 종류를 7일 안에 다시 보내지 않는다(body 대조).
 *
 * 보호: lib/cron/authorize.ts. 스케줄: .github/workflows/etl.yml alerts 잡(매일 06:00 UTC).
 */

const MAX_PER_USER = 5;

type Sub = { email: string; value: string; sido: string };

async function listRegionSubscriptions(): Promise<Sub[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("user_watchlist")
    .select("user_email, complex_id")
    .like("complex_id", `${ALERT_PREFIX}region:%`)
    .limit(5000);
  if (error || !Array.isArray(data)) return [];
  const out: Sub[] = [];
  for (const r of data as Array<{ user_email: string; complex_id: string }>) {
    const value = String(r.complex_id).slice(`${ALERT_PREFIX}region:`.length).trim();
    const sido = normalizeApplyhomeRegion(value);
    if (!value || sido === "전체") continue;
    out.push({ email: String(r.user_email).trim().toLowerCase(), value, sido });
  }
  return out;
}

function matches(a: AnnouncementRow, sub: Sub): { hit: boolean; strong: boolean } {
  const region = a.region ?? "";
  const hit = region === sub.sido || region.includes(sub.sido);
  const gu = sub.value.split(/\s+/)[1] ?? "";
  const strong = hit && gu.length > 0 && Boolean(a.address?.includes(gu));
  return { hit, strong };
}

async function alreadySent(email: string, marker: string): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { count } = await sb
    .from("user_inbox_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_email", email)
    .gte("created_at", since)
    .like("body", `%${marker}%`);
  return (count ?? 0) > 0;
}

async function run() {
  const todayKst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const sinceIso = new Date(Date.now() - 26 * 3600_000).toISOString();
  const [subs, events] = await Promise.all([listRegionSubscriptions(), listAnnouncementEvents(todayKst, sinceIso)]);
  const byUser = new Map<string, Sub[]>();
  for (const s of subs) byUser.set(s.email, [...(byUser.get(s.email) ?? []), s]);

  let notified = 0;
  let users = 0;
  for (const [email, userSubs] of byUser) {
    users += 1;
    const candidates: Array<{ kind: "new" | "start" | "announce"; a: AnnouncementRow; strong: boolean }> = [];
    const push = (kind: "new" | "start" | "announce", rows: AnnouncementRow[]) => {
      for (const a of rows) {
        for (const s of userSubs) {
          const m = matches(a, s);
          if (m.hit) {
            candidates.push({ kind, a, strong: m.strong });
            break;
          }
        }
      }
    };
    push("announce", events.announcesToday);
    push("start", events.startsToday);
    push("new", events.fresh);
    /* 시군구까지 맞는 것 먼저, 그다음 종류 순(발표 > 접수 > 새 공고) */
    candidates.sort((x, y) => Number(y.strong) - Number(x.strong));
    let sent = 0;
    for (const c of candidates) {
      if (sent >= MAX_PER_USER) break;
      const marker = `[청약:${c.kind}:${c.a.house_manage_no}:${c.a.pblanc_no}]`;
      try {
        if (await alreadySent(email, marker)) continue;
        const title =
          c.kind === "announce"
            ? `오늘 당첨자 발표 · ${c.a.house_nm}`
            : c.kind === "start"
              ? `오늘 청약 접수 시작 · ${c.a.house_nm}`
              : `새 분양공고 · ${c.a.house_nm}`;
        const when =
          c.kind === "announce"
            ? `발표일 ${c.a.przwner_de ?? todayKst}`
            : c.kind === "start"
              ? `접수 ${c.a.rcept_bgnde ?? todayKst}${c.a.rcept_endde ? `~${c.a.rcept_endde}` : ""}`
              : `${c.a.rcept_bgnde ? `접수 ${c.a.rcept_bgnde}` : "접수일 미정"}${c.a.tot_supply ? ` · ${c.a.tot_supply.toLocaleString("ko-KR")}세대` : ""}`;
        await appendInboxNotification({
          userEmail: email,
          title,
          body: `${c.a.region ?? ""} ${c.a.address ?? ""} — ${when}. 자격·일정은 청약홈 공고 원문을 확인하세요. ${marker}`.trim(),
          actionUrl: c.a.pblanc_url ?? "/apply/calendar",
        });
        notified += 1;
        sent += 1;
      } catch (e) {
        logger.error("[applyhome-alerts] 알림 실패", e);
      }
    }
  }
  return { users, subs: subs.length, fresh: events.fresh.length, startsToday: events.startsToday.length, announcesToday: events.announcesToday.length, notified };
}

async function handle(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  try {
    const summary = await run();
    await logIngest({
      source: "applyhome-alerts",
      dataset: "청약 관심 지역 알림",
      origin: "cron-fetch",
      rows: summary.notified,
      status: "ok",
      message: `구독 ${summary.subs}건/${summary.users}명 · 새 공고 ${summary.fresh} · 오늘 접수 ${summary.startsToday} · 오늘 발표 ${summary.announcesToday} · 알림 ${summary.notified}`,
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    logger.error("[applyhome-alerts] 실패", e);
    await logIngest({
      source: "applyhome-alerts",
      dataset: "청약 관심 지역 알림",
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
