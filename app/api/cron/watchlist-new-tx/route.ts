import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { getServiceSupabase } from "@/lib/supabase/service";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { getPrefs } from "@/lib/notification-prefs/store-db";
import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import { watchlistTxEmail } from "@/lib/email/templates";
import { decodeComplexId } from "@/lib/complex/complex-store";
import { complexHrefFromId } from "@/lib/seo/complex-slug";
import { formatKrwShort } from "@/lib/market/format";
import { logger } from "@/lib/log";
import { batchAdvance, groupWatchRows, idleSeenAt, tsAfter, type WatchRow } from "@/lib/notifications/watchlist-tx-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * [945 · 실사용50 #20] 관심단지 **새 실거래 신고** 알림 — 하루 1회 묶음.
 *
 * price-alerts(가격 변동 ±1%)와 별개다: 저 크론은 "평균이 움직였나"를 보고,
 * 이 크론은 "새 신고가 있었나"를 본다. 재방문 이유 1순위("내 단지에 무슨 일이
 * 생겼나")에는 변동 여부와 무관하게 신규 신고 자체가 소식이다.
 *
 * 판정: market_transactions.created_at(적재 시각) > user_watchlist.last_tx_seen_at.
 *  - 계약일이 아니라 **적재 시각**을 쓰는 이유: 국토부 신고는 30일 지연이 흔해서
 *    "오늘 계약된 건"은 오늘 알 수 없다. 사용자가 알 수 있게 된 시점 = 적재 시점이다.
 *  - 최초 관측(last_tx_seen_at null)은 알림 없이 기준만 세운다 — 과거 이력
 *    전체를 첫날 "새 소식"으로 쏟지 않는다(price-alerts 와 같은 원칙).
 *
 * 채널: 인앱 수신함(사용자당 1건 묶음) + 메일(RESEND 설정 시,
 *  prefs.emailWatchlistTx 기본 켜짐 — 끄면 메일만 생략).
 */

/* [1086 · A5] 예전엔 user_watchlist 를 순서 없이 500행만 읽어, 501번째 행부터는 영영 알림이 가지 않았다 · 같은 단지를 여러 명이
   담으면 같은 조회를 사람 수만큼 했다. 이제 id 순으로 쪽(PAGE)을 넘겨 끝까지(상한 MAX_ROWS) 읽고, 단지별로 한 번만 조회한다
   (그 단지 담은 사람들 중 가장 이른 고수위선 이후 신고 → 행마다 자기 고수위선으로 거른다). 실행 시간 상한(TIME_BUDGET_MS) 안에서
   고수위선이 가장 오래된 단지부터 — 못 본 단지는 다음 실행이 먼저 본다(새 신고가 없던 단지도 확인 시각을 올려 차례가 돈다). */
const PAGE = 1000;
const MAX_ROWS = 20_000;
const TIME_BUDGET_MS = 90_000;
/** 사용자당 묶음에 담는 단지 수 상한(본문 길이 통제 — 초과분은 "외 N개 단지") */
const MAX_COMPLEXES_PER_USER = 8;

type TxRow = {
  created_at: string;
  contract_ym: string | null;
  deal_amount_krw: number | string | null;
  area_m2: number | string | null;
  floor: number | string | null;
};

function n(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const x = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(x) ? x : null;
}

function latestLine(tx: TxRow): string {
  const parts: string[] = [];
  const area = n(tx.area_m2);
  if (area) parts.push(`${Math.round(area)}㎡`);
  const fl = n(tx.floor);
  if (fl) parts.push(`${fl}층`);
  const amt = n(tx.deal_amount_krw);
  if (amt) parts.push(formatKrwShort(amt));
  const ym = (tx.contract_ym ?? "").trim();
  if (ym.length === 6) parts.push(`(${ym.slice(0, 4)}.${ym.slice(4)} 계약)`);
  return parts.join(" ") || "신규 신고";
}

async function run() {
  const read = getReadOnlySupabase();
  const write = getServiceSupabase();
  if (!read || !write) {
    return { ok: true, checked: 0, users: 0, emails: 0, reason: "no-store" };
  }
  const startedAt = Date.now();

  const raw: Array<Record<string, unknown>> = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await read
      .from("user_watchlist")
      .select("id, user_email, complex_id, complex_name, last_tx_seen_at")
      .not("complex_id", "like", "alert:%")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      logger.warn("[cron/watchlist-new-tx] user_watchlist 조회 실패", error.message);
      if (raw.length === 0) return { ok: true, checked: 0, users: 0, emails: 0, reason: "query-failed" };
      break;
    }
    const page = (data ?? []) as Array<Record<string, unknown>>;
    raw.push(...page);
    if (page.length < PAGE) break;
  }

  const nowIso = new Date().toISOString();
  let checked = 0;
  let baselineSet = 0;
  let deferred = 0;
  const skipReasons: Record<string, number> = {};
  const skip = (r: string, n = 1) => {
    skipReasons[r] = (skipReasons[r] ?? 0) + n;
  };

  const rows: WatchRow[] = [];
  for (const row of raw) {
    const complexId = String(row.complex_id ?? "");
    const userEmail = String(row.user_email ?? "").trim().toLowerCase();
    if (!complexId || !userEmail || !decodeComplexId(complexId)) {
      checked++;
      skip("unresolvable");
      continue;
    }
    rows.push({
      id: row.id,
      userEmail,
      complexId,
      complexName: String(row.complex_name ?? ""),
      since: row.last_tx_seen_at ? String(row.last_tx_seen_at) : null,
    });
  }

  /* 사용자별 묶음: email → { complexName, count, latestLine, href }[] */
  const perUser = new Map<
    string,
    Array<{ complexName: string; count: number; latestLine: string; href: string }>
  >();
  /* 알림 성사 여부와 무관하게 고수위선을 올릴 행들 */
  const advance: Array<{ id: unknown; seenAt: string }> = [];

  for (const group of groupWatchRows(rows)) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      deferred += group.rows.length;
      continue;
    }
    const decoded = decodeComplexId(group.complexId);
    if (!decoded) continue;
    checked += group.rows.length;
    /* 최초 관측 — 기준만 세운다(과거 이력을 첫날 새 소식으로 쏟지 않는다) */
    for (const r of group.rows) {
      if (!r.since) {
        advance.push({ id: r.id, seenAt: nowIso });
        baselineSet++;
      }
    }
    const watchers = group.rows.filter((r) => r.since);
    if (watchers.length === 0 || !group.minSince) continue;
    const queryStart = Date.now();
    try {
      const { data: txs, error: txErr } = await read
        .from("market_transactions")
        .select("created_at, contract_ym, deal_amount_krw, area_m2, floor")
        .eq("complex_name", decoded.name)
        .eq("region_name", decoded.region)
        .eq("transaction_type", "trade")
        .eq("property_type", "apartment")
        .eq("is_cancelled", false)
        .gt("created_at", group.minSince)
        .order("created_at", { ascending: false })
        .limit(200);
      if (txErr) {
        skip("tx-query-failed", watchers.length);
        continue;
      }
      const all = (txs ?? []) as TxRow[];
      for (const r of watchers) {
        const since = r.since as string;
        const list = all.filter((t) => tsAfter(String(t.created_at), since)).slice(0, 50);
        if (list.length === 0) {
          skip("no-new-tx");
          /* 확인했다는 표시(차례가 돈다) — 새 신고가 없었으니 놓치는 소식이 없다 */
          const next = idleSeenAt(since, queryStart);
          if (next !== since) advance.push({ id: r.id, seenAt: next });
          continue;
        }
        const name = r.complexName || decoded.name;
        const bucket = perUser.get(r.userEmail) ?? [];
        bucket.push({
          complexName: name,
          count: list.length,
          latestLine: latestLine(list[0]),
          href: `https://naezipnow.com${complexHrefFromId(group.complexId)}`,
        });
        perUser.set(r.userEmail, bucket);
        advance.push({ id: r.id, seenAt: list[0].created_at });
      }
    } catch (e) {
      skip("exception", watchers.length);
      logger.warn("[cron/watchlist-new-tx] 단지 처리 실패", { complexId: group.complexId, err: e });
    }
  }

  let users = 0;
  let emails = 0;
  for (const [userEmail, items] of perUser) {
    const shown = items.slice(0, MAX_COMPLEXES_PER_USER);
    const extra = items.length - shown.length;
    const total = items.reduce((a, x) => a + x.count, 0);
    const summary =
      shown
        .map((x) => `${x.complexName} ${x.count}건(${x.latestLine})`)
        .join(" · ") + (extra > 0 ? ` 외 ${extra}개 단지` : "");
    try {
      await appendInboxNotification({
        userEmail,
        title: `관심단지 새 실거래 ${total}건`,
        body: `${summary} — 국토부 신고 기준`,
        actionUrl: items.length === 1 ? new URL(items[0].href).pathname : "/my/watchlist",
      });
      users++;
    } catch (e) {
      logger.warn("[cron/watchlist-new-tx] 인앱 적재 실패", { userEmail, err: e });
    }
    if (isEmailConfigured()) {
      try {
        const prefs = await getPrefs(userEmail);
        if (prefs.emailWatchlistTx) {
          const r = await sendEmail({ to: userEmail, ...watchlistTxEmail({ items: shown }) });
          if (r.sent) emails++;
        }
      } catch (e) {
        logger.warn("[cron/watchlist-new-tx] 메일 발송 실패", { userEmail, err: e });
      }
    }
  }

  /* 고수위선 갱신은 알림 적재 **뒤에** — 먼저 올렸다가 적재가 죽으면 그 소식은
     영원히 사라진다. 뒤에 올리면 최악이 중복 알림 1회(다음 실행)로 그친다. */
  /* [1086 · A5] 같은 값끼리 묶어 한 번에(행마다 한 번이던 쓰기 → 값마다 한 번) */
  for (const b of batchAdvance(advance)) {
    const { error: upErr } = await write
      .from("user_watchlist")
      .update({ last_tx_seen_at: b.seenAt })
      .in("id", b.ids as Array<string | number>);
    if (upErr) logger.warnSampled("watchlist-new-tx-advance", "[cron/watchlist-new-tx] 고수위선 갱신 실패", { message: upErr.message, n: b.ids.length });
  }

  if (deferred > 0) logger.warnSampled("watchlist-new-tx-deferred", "[cron/watchlist-new-tx] 시간 상한 — 다음 실행으로 넘김", { deferred });
  return { ok: true, checked, baselineSet, users, emails, deferred, rows: raw.length, skipReasons };
}

export async function GET(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  try {
    const result = await run();
    return NextResponse.json(result);
  } catch (err) {
    logger.error("[cron/watchlist-new-tx] 실패", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "알 수 없는 오류" },
      { status: 500 },
    );
  }
}
