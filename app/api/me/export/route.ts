import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { logger } from "@/lib/log";
import { loadMeProfile } from "@/lib/me/profile";
import { listNotes } from "@/lib/inspection/store-db";
import { listBookmarks } from "@/lib/bookmarks/store";
import { listWatchlist } from "@/lib/watchlist/store-db";
import { listAlertSubscriptions } from "@/lib/alerts/subscriptions";
import { getHistory } from "@/lib/points/ledger";
import { loadBillingHistory } from "@/lib/subscriptions/billing-history";
import { getPrefs } from "@/lib/notification-prefs/store-db";
import {
  EXPORT_LEDGER_LIMIT,
  EXPORT_PAYMENTS_LIMIT,
  buildExportPayload,
  exportFilename,
  settledToSource,
} from "./shape";

/**
 * GET /api/me/export — 내 데이터 JSON 내려받기 (설정 › 계정 › 내 데이터 내보내기).
 *
 * - 로그인 필수. 이메일당 10분에 3회(인스턴스별 best-effort — 남용 완화 목적으로 충분).
 * - 각 원천은 따로 조회한다(allSettled). 하나가 실패해도 나머지는 내려가고, 실패한 원천은
 *   본문의 `errors` 에 이름이 남는다 — 빈 배열로 위장하지 않는다.
 * - 본인 행만. 서비스 클라이언트로 읽되 모든 조회가 세션 이메일로 제한되고, shape.ts 가
 *   이메일이 다른 행을 한 번 더 거른다. 빌링키·고객키 같은 비밀값은 입력 타입에 없다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const email = session.user.email;
  const key = email.trim().toLowerCase();

  const rl = rateLimit(`me-export:${key}`, { limit: 3, windowMs: 10 * 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const [profile, notes, bookmarks, watchlist, alerts, points, payments, prefs] =
    await Promise.allSettled([
      loadMeProfile(email, {
        name: session.user.name,
        plan: (session.user as { plan?: string }).plan,
        role: (session.user as { role?: string }).role,
      }),
      listNotes(email),
      listBookmarks(email),
      listWatchlist(email),
      listAlertSubscriptions(email),
      getHistory(email, EXPORT_LEDGER_LIMIT),
      loadBillingHistory(email, EXPORT_PAYMENTS_LIMIT).then((h) => {
        if (!h.ok) throw new Error("결제 내역 조회 실패");
        return h.payments;
      }),
      getPrefs(email),
    ]);

  const payload = buildExportPayload({
    email,
    generatedAt: new Date().toISOString(),
    profile: settledToSource(profile),
    notes: settledToSource(notes),
    bookmarks: settledToSource(bookmarks),
    watchlist: settledToSource(watchlist),
    alerts: settledToSource(alerts),
    points: settledToSource(points),
    payments: settledToSource(payments),
    notificationPrefs: settledToSource(prefs),
  });

  if (payload.errors.length > 0) {
    logger.error(
      "[me/export] 일부 원천 조회 실패",
      payload.errors.map((e) => `${e.source}: ${e.message}`).join(" | "),
    );
  }

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(new Date())}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
