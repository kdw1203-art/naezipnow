import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import {
  listWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  isWatching,
  setWatchlistAlertRange,
} from "@/lib/watchlist/store-db";
import { alertRangeOrdered } from "@/lib/watchlist/alert-range";
import { applyRateLimit } from "@/lib/rate-limit";
import { appendOnboardingStep } from "@/lib/onboarding/append-step";
import { FUNNEL_EVENT, recordFunnelEvent } from "@/lib/platform-funnel-events";
import {
  checkWatchlistAddQuota,
  quotaDeniedJson,
  resolveQuotaPlan,
} from "@/lib/subscriptions/usage-summary";
import { withUserQuotaLock } from "@/lib/subscriptions/quota-lock";
import { dbUnavailable } from "@/lib/api/db-unavailable";

export const runtime = "nodejs";

/** 못 읽은 목록을 "등록한 단지가 없어요"로 그리지 않기 위한 안내. */
const WATCHLIST_UNAVAILABLE = "지금은 관심 단지를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.";

export async function GET(req: NextRequest) {
  const session = await safeAuth();
  if (!session?.user?.email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const complexId = req.nextUrl.searchParams.get("complexId");
  if (complexId) {
    try {
      const watching = await isWatching(session.user.email, complexId);
      return NextResponse.json({ watching });
    } catch (err) {
      return dbUnavailable(`관심 등록 여부 조회 실패 (complex=${complexId})`, err, WATCHLIST_UNAVAILABLE);
    }
  }
  try {
    const list = await listWatchlist(session.user.email);
    return NextResponse.json({ items: list });
  } catch (err) {
    return dbUnavailable("관심 단지 목록 조회 실패", err, WATCHLIST_UNAVAILABLE);
  }
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req);
  if (limited) return limited;
  const session = await safeAuth();
  if (!session?.user?.email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 }); }

  const complexId = String(body.complexId ?? "").trim();
  const complexName = String(body.complexName ?? "").trim();
  if (!complexId || !complexName) return NextResponse.json({ error: "complexId, complexName 이 필요합니다." }, { status: 400 });

  const email = session.user.email;

  return withUserQuotaLock(`watchlist:${email}`, async () => {
    /* 등록 여부·현재 개수를 못 읽은 채로 진행하면 한도 검사가 통째로 풀린다
       (개수 0 = 전부 남음). 여기서는 넣지 않고 "지금은 못 한다"고 답한다. */
    let watching: boolean;
    let quota: Awaited<ReturnType<typeof checkWatchlistAddQuota>>;
    try {
      const [w, plan] = await Promise.all([
        isWatching(email, complexId),
        resolveQuotaPlan(email, session.user.plan),
      ]);
      watching = w;
      quota = await checkWatchlistAddQuota(email, plan, watching);
    } catch (err) {
      return dbUnavailable(`관심 단지 한도 확인 실패 (complex=${complexId})`, err, WATCHLIST_UNAVAILABLE);
    }
    if (!quota.allowed) {
      return NextResponse.json(quotaDeniedJson(quota.message, quota.requiredTier, quota.used, quota.limit), {
        status: 403,
      });
    }

    /* [1057 · B9] addToWatchlist 가 던지는 DB 오류를 감싸지 않아 일반 500 HTML 이 나갔다(화면은 "알 수 없는 오류") —
       다른 핸들러와 같은 503 + 고정 문구. 범위 값은 숫자일 때만 넘긴다(없으면 undefined = 기존 범위 유지). */
    const min = Number(body.alertPriceMin);
    const max = Number(body.alertPriceMax);
    let item: Awaited<ReturnType<typeof addToWatchlist>>;
    try {
      item = await addToWatchlist(
        email,
        complexId,
        complexName,
        body.alertPriceMin != null && body.alertPriceMin !== "" && Number.isFinite(min) && min > 0 ? min : undefined,
        body.alertPriceMax != null && body.alertPriceMax !== "" && Number.isFinite(max) && max > 0 ? max : undefined,
      );
    } catch (err) {
      return dbUnavailable(`관심 단지 저장 실패 (complex=${complexId})`, err, "관심 단지 저장 실패 · 잠시 후 다시");
    }
    void recordFunnelEvent(req, {
      eventName: FUNNEL_EVENT.WATCHLIST_ADD,
      userEmail: email,
      path: "/api/me/watchlist",
      metadata: { complexId },
    });
    void appendOnboardingStep(email, "explore");
    return NextResponse.json(item, { status: 201 });
  });
}

/* [1057 · B10] PATCH { complexId, alertPriceMin: 원|null, alertPriceMax: 원|null } — 실거래 알림 범위만 바꾼다(null = 지움).
   예전엔 범위를 받는 길이 POST(upsert) 뿐이라 범위 수정이 "관심 단지 담기" 퍼널 이벤트·온보딩 단계로 기록됐다. */
export async function PATCH(req: NextRequest) {
  const limited = await applyRateLimit(req);
  if (limited) return limited;
  const session = await safeAuth();
  if (!session?.user?.email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }
  const complexId = String(body.complexId ?? "").trim();
  if (!complexId) return NextResponse.json({ error: "complexId 가 필요합니다." }, { status: 400 });
  const bound = (v: unknown): number | null | undefined => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const min = bound(body.alertPriceMin);
  const max = bound(body.alertPriceMax);
  if (min === undefined || max === undefined) {
    return NextResponse.json({ error: "알림 범위는 0 보다 큰 원 단위 숫자 또는 비움" }, { status: 400 });
  }
  if (!alertRangeOrdered(min, max)) return NextResponse.json({ error: "최소가 최대보다 큼" }, { status: 400 });
  let found: boolean;
  try {
    found = await setWatchlistAlertRange(session.user.email, complexId, min, max);
  } catch (err) {
    return dbUnavailable(`알림 범위 저장 실패 (complex=${complexId})`, err, "알림 범위 저장 실패 · 잠시 후 다시");
  }
  if (!found) return NextResponse.json({ error: "관심 단지가 아님" }, { status: 404 });
  return NextResponse.json({ ok: true, alertPriceMin: min, alertPriceMax: max });
}

export async function DELETE(req: NextRequest) {
  const session = await safeAuth();
  if (!session?.user?.email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const complexId = req.nextUrl.searchParams.get("complexId");
  if (!complexId) return NextResponse.json({ error: "complexId 가 필요합니다." }, { status: 400 });
  /* [1009] 삭제 실패가 이제 던져진다(store-db 가 오류를 확인) — 원인을 말하는 503 으로 감싼다(다른 핸들러와 같은 방식).
     감싸지 않으면 일반 500 HTML 이 나가 화면이 "알 수 없는 오류"로만 안내했다. */
  try {
    await removeFromWatchlist(session.user.email, complexId);
  } catch (err) {
    return dbUnavailable(
      `관심 단지 삭제 실패 (complex=${complexId})`,
      err,
      "지금은 관심 단지에서 뺄 수 없어요. 잠시 후 다시 시도해 주세요.",
    );
  }
  void recordFunnelEvent(req, {
    eventName: FUNNEL_EVENT.WATCHLIST_REMOVE,
    userEmail: session.user.email,
    path: "/api/me/watchlist",
    metadata: { complexId },
  });
  return NextResponse.json({ ok: true });
}
