import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getSpendItem, type SpendItem } from "@/lib/points/catalog";
import { getBalance, refundPoints, spendPoints, type SpendResult } from "@/lib/points/ledger";
import { boostListing, getListingById } from "@/lib/listings/store-db";
import { invalidateComplexByNames } from "@/lib/complex/complex-invalidate";
import { invalidateListingsIndex } from "@/lib/listings/invalidate-listings";
import { invalidateHomeData, invalidatePathList, invalidateTownFeed } from "@/lib/cache/invalidate";
import { invalidateTownDataCaches, scheduleProfileInvalidation } from "@/lib/town/invalidate-town";
import { extendUntil } from "@/lib/points/extend-until";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function spendError(spend: SpendResult): NextResponse {
  const msg =
    spend.reason === "insufficient"
      ? "포인트가 부족해요."
      : "교환에 실패했어요. 잠시 후 다시 시도해 주세요.";
  return NextResponse.json({ error: msg, balance: spend.balance }, { status: 400 });
}

type Sb = NonNullable<ReturnType<typeof getServiceSupabase>>;

/** 효과 적용 결과 — 실패면 사용자에게 보일 문장만(원인은 로그) */
type Applied = { ok: true } | { ok: false; message: string };

/**
 * [1057] 효과 적용이 실패했을 때 — 차감된 포인트를 되돌린다(reason=refund:<itemKey> · refId 멱등).
 * 환불까지 실패하면 그 사실을 그대로 적는다(문의로 이어지게).
 */
async function failAfterSpend(email: string, item: SpendItem, refundRef: string, message: string): Promise<NextResponse> {
  const refund = await refundPoints(email, item.cost, item.key, refundRef);
  if (refund.ok) {
    return NextResponse.json(
      { error: `${message} · ${item.cost.toLocaleString("ko-KR")}P 환불`, balance: refund.balance, refunded: true },
      { status: 503 },
    );
  }
  logger.error("[points:spend] 효과 실패 뒤 환불 실패", { email, item: item.key, refundRef, reason: refund.reason });
  return NextResponse.json(
    { error: `${message} · 포인트 환불 실패 · 문의`, balance: refund.balance, refunded: false },
    { status: 503 },
  );
}

/**
 * POST /api/points/spend — body: { itemKey, listingId?, postId? }
 * 상점 아이템 교환. 잔액은 ledger(spendPoints) 가 최종 방어한다.
 * 속도 제한: IP+계정당 시간당 20회.
 *
 * [1057] 순서를 바꿨다 — 예전엔 **효과를 먼저 적용하고** 차감했다. 차감이 실패하면(잔액 경합·DB) 효과만 남아
 * 공짜 부스트가 됐다. 이제 대상 확인 → 차감 → 효과 적용 → (실패면 환불) → 캐시 비움.
 */
export async function POST(req: NextRequest) {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  // 남용 방지 — IP + 계정 조합으로 시간당 20회
  const rl = rateLimit(`points-spend:${getClientIp(req)}:${email}`, {
    limit: 20,
    windowMs: 60 * 60_000,
  });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const itemKey = typeof body.itemKey === "string" ? body.itemKey : "";
  const item = getSpendItem(itemKey);
  if (!item) {
    return NextResponse.json({ error: "존재하지 않는 상품이에요." }, { status: 400 });
  }
  const listingId = typeof body.listingId === "string" ? body.listingId : undefined;
  const postId = typeof body.postId === "string" ? body.postId : undefined;

  /* 잔액을 못 읽었을 때 0 으로 보고 "포인트가 부족해요" 라고 답하면 안 된다 —
     넉넉히 가진 사람에게 없다고 말하는 것이다. 부족한 것과 확인하지 못한 것은
     사용자가 취해야 할 행동부터 다르다(활동으로 더 모으기 vs 재시도). */
  const read = await getBalance(email).then(
    (balance) => ({ ok: true as const, balance }),
    (err: unknown) => {
      logger.error("[api/points/spend] 잔액 조회 실패", err);
      return { ok: false as const, cause: err instanceof Error ? err.message : String(err) };
    },
  );
  if (!read.ok) {
    return NextResponse.json(
      { error: `보유 포인트를 확인하지 못했어요. 잠시 후 다시 시도해 주세요. (${read.cause})` },
      { status: 503 },
    );
  }
  const balance = read.balance;
  if (balance < item.cost) {
    return NextResponse.json({ error: "포인트가 부족해요.", balance }, { status: 400 });
  }

  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json({ error: "잠시 후 다시 시도해 주세요.", balance }, { status: 503 });
  }

  // ── 매물 상단 노출: 대상 매물이 있을 때만 차감 (없으면 미차감) ──
  if (item.effect === "listing_boost") {
    let q = sb
      .from("listings")
      .select("id")
      .eq("author_email", email)
      .eq("status", "approved");
    if (listingId) q = q.eq("id", listingId);
    const { data: target } = await q
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const targetId = target?.id ? String(target.id) : null;
    if (!targetId) {
      return NextResponse.json(
        {
          error: "상단 노출할 승인된 매물이 없어요. 매물 등록·승인 후 이용해 주세요.",
          balance,
        },
        { status: 400 },
      );
    }
    const days = item.durationDays ?? 7;

    const spend = await spendPoints(email, item.cost, `spend:${item.key}`, targetId);
    if (!spend.ok) return spendError(spend);

    /* boostListing — 현재 만료 뒤에 이어 붙인다(max(current, now) + days) · 소유자 조건 포함 */
    const boostUntil = await boostListing(targetId, email, days);
    if (!boostUntil) {
      return failAfterSpend(email, item, `${targetId}:${spend.balance}:${Date.now()}`, "상단 노출 적용 실패");
    }
    /* [1010] 단지 허브·/listings 는 부스트 배지·정렬을 서버에서 그린다 — app/api/listings/[id]/boost 와 같은 비움 */
    const listing = await getListingById(targetId).catch(() => null);
    if (listing) invalidateComplexByNames(listing.regionName, listing.complexName);
    invalidateListingsIndex();
    return NextResponse.json({
      ok: true,
      balance: spend.balance,
      effect: item.effect,
      boostUntil,
      note: `내 매물을 ${days}일간 목록·지도 상단에 노출해요.`,
    });
  }

  // ── 동네이야기 추천글: 내 글이 있을 때만 차감 (listing_boost 와 같은 규칙) ──
  if (item.effect === "post_boost") {
    /* [1057] 피드가 싣지 않는 글(링크로만 공개 link_only · 신고 숨김 hidden)이 대상이 되면 돈만 나가고 아무 데도 안 보였다 —
       lib/town/feed.ts 와 같은 조건(사람 글 · visibility 공개 또는 미지정) */
    let q = sb
      .from("posts")
      .select("id,title,boost_until")
      .eq("author_email", email)
      .eq("is_automated", false)
      .or("visibility.is.null,visibility.eq.public");
    if (postId) q = q.eq("id", postId);
    const { data: target } = await q
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const targetId = target?.id ? String(target.id) : null;
    if (!targetId) {
      return NextResponse.json(
        { error: "추천글로 올릴 내 글이 없어요. 동네이야기에 공개 글을 쓴 뒤 이용해 주세요.", balance },
        { status: 400 },
      );
    }
    const days = item.durationDays ?? 3;
    const boostUntil = extendUntil(target?.boost_until as string | null | undefined, days);

    const spend = await spendPoints(email, item.cost, `spend:${item.key}`, targetId);
    if (!spend.ok) return spendError(spend);

    const applied = await applyPostBoost(sb, targetId, email, boostUntil);
    if (!applied.ok) {
      return failAfterSpend(email, item, `${targetId}:${spend.balance}:${Date.now()}`, applied.message);
    }
    /* 피드(/town · 동네 홈)·홈 인기글·글 상세·동네 데이터 캐시 — 글 작성 라우트와 같은 비움 */
    invalidateTownFeed();
    invalidateHomeData();
    invalidateTownDataCaches();
    invalidatePathList([`/town/story/${targetId}`, `/town/news/${targetId}`], { label: "post-boost" });
    return NextResponse.json({
      ok: true,
      balance: spend.balance,
      effect: item.effect,
      boostUntil,
      note: `내 글을 ${days}일간 동네이야기 상단에 추천글로 노출해요.`,
    });
  }

  // ── 닉네임 효과(오로라·[#146] 노을) · 시즌 배지: 프로필 settings 에 기록 ──
  if (item.effect === "nickname_aurora" || item.effect === "nickname_sunset" || item.effect === "season_badge") {
    const { data: prof, error: profErr } = await sb
      .from("profiles")
      .select("settings")
      .eq("email", email)
      .maybeSingle();
    if (profErr) {
      logger.warn("[points:spend] profiles 조회 실패", profErr);
      return NextResponse.json({ error: "프로필 확인 실패 · 잠시 후 다시", balance }, { status: 503 });
    }
    if (!prof) {
      return NextResponse.json(
        { error: "프로필을 찾지 못했어요. 마이페이지에서 프로필을 먼저 저장해 주세요.", balance },
        { status: 400 },
      );
    }
    const settings = (
      prof.settings && typeof prof.settings === "object" ? prof.settings : {}
    ) as Record<string, unknown>;
    const isBadge = item.effect === "season_badge";
    const kind = isBadge ? "autumn2026" : item.effect === "nickname_sunset" ? "sunset" : "aurora";
    const slot = isBadge ? "season_badge" : "nickname_effect";
    const current = settings[slot] as { kind?: unknown; until?: unknown } | undefined;
    const days = item.durationDays ?? (isBadge ? 30 : 7);
    /* 같은 종류를 다시 사면 남은 기간 뒤에 이어 붙인다 · 다른 종류(오로라 ↔ 노을)로 바꾸면 지금부터 */
    const until = extendUntil(current?.kind === kind && typeof current.until === "string" ? current.until : null, days);

    const spend = await spendPoints(email, item.cost, `spend:${item.key}`);
    if (!spend.ok) return spendError(spend);

    const { error: upErr } = await sb
      .from("profiles")
      .update({
        settings: { ...settings, [slot]: { kind, until } },
        updated_at: new Date().toISOString(),
      })
      .eq("email", email);
    if (upErr) {
      logger.warn(`[points:spend] ${slot} update`, upErr);
      return failAfterSpend(email, item, `${slot}:${spend.balance}:${Date.now()}`, isBadge ? "배지 적용 실패" : "효과 적용 실패");
    }
    /* 효과는 글 상세(/town/story/[id] · ISR)의 작성자 이름에 그려진다 — 내 최근 글 상세와 공개 프로필을 비운다 */
    await invalidateAuthorStories(sb, email);
    scheduleProfileInvalidation(email);
    return NextResponse.json({
      ok: true,
      balance: spend.balance,
      effect: item.effect,
      effectUntil: until,
      note: isBadge
        ? `가을 산책 배지가 ${days}일간 달려요. 글 상세의 내 이름 옆에서 확인할 수 있어요.`
        : `닉네임 ${kind === "sunset" ? "노을" : "오로라"} 효과가 ${days}일간 적용돼요. 글 상세의 작성자 이름에서 확인할 수 있어요.`,
    });
  }

  /* ── 구 PRO/EXPERT 구독 이용권 교환 분기는 2026-08-23 토스 회신에 따라
     카탈로그 상품과 함께 제거 — 포인트와 유료 결제 상품의 교환 접점은 만들지
     않는다(충전업종 오해 방지, lib/points/catalog.ts 주석 참조). ── */

  // (구 ai_analysis · complex_report 분기는 카탈로그에서 상품이 내려가면서 함께 제거 —
  //  둘 다 크레딧만 기록하고 실제 소비 지점이 없던 유령 상품이었다. 존재하지 않는
  //  itemKey 는 위 getSpendItem 에서 "존재하지 않는 상품이에요"로 걸러진다)
  return NextResponse.json({ error: "지원하지 않는 상품이에요.", balance }, { status: 400 });
}

/** 추천글 적용 — 소유자 조건을 다시 건다(차감 뒤 남의 글에 쓰지 않게) */
async function applyPostBoost(sb: Sb, postId: string, email: string, boostUntil: string): Promise<Applied> {
  const { data, error } = await sb
    .from("posts")
    .update({ boost_until: boostUntil })
    .eq("id", postId)
    .eq("author_email", email)
    .select("id");
  if (error) {
    logger.warn("[points:spend] post boost update", error);
    return { ok: false, message: "추천글 적용 실패" };
  }
  if (!Array.isArray(data) || data.length === 0) return { ok: false, message: "추천글 적용 실패 · 글 없음" };
  return { ok: true };
}

/** 내가 쓴 최근 글 상세(/town/story/{id}) 를 비운다 — 닉네임 효과·배지는 거기 작성자 이름에 그려진다. 실패는 무시 */
async function invalidateAuthorStories(sb: Sb, email: string): Promise<void> {
  try {
    const { data } = await sb
      .from("posts")
      .select("id")
      .eq("author_email", email)
      .eq("is_automated", false)
      .order("created_at", { ascending: false })
      .limit(30);
    const ids = (data ?? []).map((r) => String((r as { id: unknown }).id)).filter(Boolean);
    if (ids.length === 0) return;
    invalidatePathList(ids.map((id) => `/town/story/${id}`), { label: "nickname-effect" });
  } catch (e) {
    logger.warn("[points:spend] 글 상세 비움 실패(무시)", e);
  }
}
