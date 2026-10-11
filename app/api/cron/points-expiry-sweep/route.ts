import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { getServiceSupabase } from "@/lib/supabase/service";
import { readPaged } from "@/lib/supabase/read-paged";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
/** 한 번의 스윕에서 처리할 최대 사용자 수 */
const MAX_USERS = 500;
/** [1057] 후보 행 조회 상한(쪽 단위로 끝까지 읽는다) · 사용자 한 명의 원장 행 상한 */
const CANDIDATE_MAX_ROWS = 20_000;
const USER_LEDGER_MAX_ROWS = 20_000;

/**
 * 포인트 만료 스윕 — 하루 1회(etl.yml alerts 잡).
 *
 * 원장(point_ledger)은 적립 행마다 expires_at 을 기록하지만, 지금까지 그 시각이
 * 지나도 아무 일도 일어나지 않았다(만료 "예정" 표기만 있고 집행이 없음). 이 크론이:
 *
 *  1) expires_at 이 지난 적립분 중 아직 소진되지 않은 잔여분을 FIFO 로 계산해
 *     만료 차감 행(reason='expire', delta<0)으로 기록한다 — 원장 방식 유지, 행 삭제 없음.
 *     멱등: 만료 행 자체가 음수 소비로 집계되므로 재실행 시 잔여분이 0 이 된다.
 *  2) 만료 6~7일 전 구간에 들어온 잔여 적립분이 있으면 인앱 알림을 1회 보낸다
 *     (매일 도는 크론이 하루짜리 창을 스캔하므로 자연히 1회만 나간다).
 *
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션)
 * (plan-expiry-sweep 과 같은 규칙).
 */

type LedgerLite = {
  delta: number;
  balance: number;
  expires_at: string | null;
  created_at: string;
};

/** FIFO 소진 계산 — 적립 lot 별 미소진 잔여분을 돌려준다 */
function lotRemainders(rows: LedgerLite[]): Array<{ expiresAt: string | null; remaining: number }> {
  let consumed = rows.reduce((s, r) => (r.delta < 0 ? s + Math.abs(r.delta) : s), 0);
  const out: Array<{ expiresAt: string | null; remaining: number }> = [];
  for (const r of rows) {
    if (r.delta <= 0) continue;
    const use = Math.min(r.delta, consumed);
    consumed -= use;
    out.push({ expiresAt: r.expires_at, remaining: r.delta - use });
  }
  return out;
}

export async function GET(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ ok: true, expiredUsers: 0, note: "Supabase 미설정" });

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const noticeFromIso = new Date(now + 6 * DAY_MS).toISOString();
  const noticeToIso = new Date(now + 7 * DAY_MS).toISOString();

  try {
    // 대상 사용자: (a) 만료 시각이 지난 적립 행 보유, (b) 6~7일 내 만료 예정 적립 행 보유
    /* [1057] `.limit(2000)` 은 정렬 없이 1,000행에서 조용히 잘렸다(PostgREST 상한) — 유일 정렬(expires_at, id)로 쪽을 나눠 읽는다 */
    type CandRow = { user_email: unknown };
    const [expiredCand, noticeCand] = await Promise.all([
      readPaged<CandRow>(
        (from, to) =>
          sb
            .from("point_ledger")
            .select("user_email")
            .gt("delta", 0)
            .not("expires_at", "is", null)
            .lt("expires_at", nowIso)
            .order("expires_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to),
        CANDIDATE_MAX_ROWS,
      ),
      readPaged<CandRow>(
        (from, to) =>
          sb
            .from("point_ledger")
            .select("user_email")
            .gt("delta", 0)
            .gt("expires_at", noticeFromIso)
            .lte("expires_at", noticeToIso)
            .order("expires_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to),
        CANDIDATE_MAX_ROWS,
      ),
    ]);
    if (expiredCand.truncated || noticeCand.truncated) {
      logger.warn("[points-expiry-sweep] 후보 행이 상한에 닿음 — 남은 사용자는 다음 스윕", CANDIDATE_MAX_ROWS);
    }

    const emails = [
      ...new Set(
        [...expiredCand.rows, ...noticeCand.rows]
          .map((r) => String(r.user_email ?? "").trim())
          .filter(Boolean),
      ),
    ].slice(0, MAX_USERS);

    let expiredUsers = 0;
    let expiredPoints = 0;
    let notified = 0;

    for (const email of emails) {
      /* [1057] 사용자 원장도 상한 없는 조회라 1,000행에서 잘려 FIFO 잔여분이 틀릴 수 있었다 — 쪽을 나눠 끝까지 읽는다.
         상한에 닿은 사용자는 건너뛴다(잘린 원장으로 만료를 집행하지 않는다). */
      let rows: Array<Record<string, unknown>>;
      try {
        const paged = await readPaged<Record<string, unknown>>(
          (from, to) =>
            sb
              .from("point_ledger")
              .select("delta, balance, expires_at, created_at")
              .eq("user_email", email)
              .order("created_at", { ascending: true })
              .order("id", { ascending: true })
              .range(from, to),
          USER_LEDGER_MAX_ROWS,
        );
        if (paged.truncated) {
          logger.warn("[points-expiry-sweep] 원장 행이 상한에 닿아 건너뜀", email);
          continue;
        }
        rows = paged.rows;
      } catch (e) {
        logger.warn("[points-expiry-sweep] 원장 조회 실패 — 건너뜀", email, e);
        continue;
      }
      if (rows.length === 0) continue;

      const lite: LedgerLite[] = rows.map((r) => ({
        delta: Number(r.delta) || 0,
        balance: Number(r.balance) || 0,
        expires_at: r.expires_at ? String(r.expires_at) : null,
        created_at: String(r.created_at),
      }));
      const remainders = lotRemainders(lite);

      // 1) 만료 집행
      const toExpire = remainders
        .filter((l) => l.expiresAt && l.expiresAt < nowIso)
        .reduce((s, l) => s + l.remaining, 0);
      const currentBalance = lite[lite.length - 1]?.balance ?? 0;
      if (toExpire > 0) {
        const amount = Math.min(toExpire, Math.max(0, currentBalance));
        if (amount > 0) {
          /* [1057] 알려진 한계: 이 insert 는 point_ledger_spend/award 의 자물쇠 밖이라, 같은 순간의 적립·차감과 겹치면 러닝 잔액이
             어긋날 수 있다(만료 행을 RPC 로 옮기는 일은 이 묶음 밖). */
          const { error: insErr } = await sb.from("point_ledger").insert({
            user_email: email,
            delta: -amount,
            reason: "expire",
            ref_id: nowIso.slice(0, 10),
            balance: currentBalance - amount,
          });
          if (insErr) {
            logger.warn("[points-expiry-sweep] insert", insErr.message);
          } else {
            expiredUsers += 1;
            expiredPoints += amount;
            await appendInboxNotification({
              userEmail: email,
              title: "포인트 기한 만료 안내",
              body: `유효기간이 지난 ${amount.toLocaleString("ko-KR")}P가 만료 처리됐어요.`,
              actionUrl: "/my/points",
            });
          }
        }
      }

      // 2) 만료 7일 전 예고 (6~7일 창에 들어온 잔여분만 — 하루 1회 창이라 중복 없음)
      const expiringSoon = remainders
        .filter((l) => l.expiresAt && l.expiresAt > noticeFromIso && l.expiresAt <= noticeToIso)
        .reduce((s, l) => s + l.remaining, 0);
      if (expiringSoon > 0) {
        await appendInboxNotification({
          userEmail: email,
          title: "포인트 만료 7일 전",
          body: `${expiringSoon.toLocaleString("ko-KR")}P가 7일 뒤 만료돼요 · 상점에서 사용 가능`,
          actionUrl: "/points/shop",
        });
        notified += 1;
      }
    }

    await logIngest({
      source: "points-expiry",
      dataset: "point_ledger",
      origin: "cron-fetch",
      rows: expiredUsers,
      status: "ok",
      message: `만료 ${expiredUsers}명 ${expiredPoints}P 차감 · 7일 전 예고 ${notified}명 (스캔 ${emails.length}명)`,
    });
    return NextResponse.json({
      ok: true,
      scanned: emails.length,
      expiredUsers,
      expiredPoints,
      notified,
    });
  } catch (e) {
    logger.error("[points-expiry-sweep]", e);
    await logIngest({
      source: "points-expiry",
      dataset: "point_ledger",
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message: ingestErrorMessage(e),
    });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "sweep failed" },
      { status: 500 },
    );
  }
}
