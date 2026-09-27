import "server-only";
import { unstable_cache } from "next/cache";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getActiveAuctionCount } from "@/lib/onbid/store";
import { CACHE_TAGS } from "@/lib/cache/invalidate";
import { logger } from "@/lib/log";
import { kstDayOf, kstYmOf, type TownCategoryCounts } from "./category-subs";

/* ============================================================
   [1012 · R2] 동네이야기 카테고리 타일의 실집계 — 하루 캐시(unstable_cache).

   2라운드 리뷰(채점 A −3 "숫자 없는 타일 4장"): /town 은 뉴스 건수만 손에 들고 있어 청약·공매·
   입주·정비사업 칸이 이름만 서 있었다(976 읽기 예산 때문에 조회를 얹지 않았다). 여기서는 그 예산을
   지키면서 숫자를 붙인다 — **건수만 세는 head 조회**(행을 받지 않는다) 넷을 하루에 한 번.

   원천은 각 화면이 이미 읽는 표·필터 그대로다(새 권한·새 뷰 없음):
     · 청약  applyhome_announcements  — lib/applyhome/store(서비스 롤). 오늘이 rcept_bgnde~rcept_endde 안
     · 공매  onbid_auctions           — lib/onbid/store getActiveAuctionCount(/auctions 히어로와 같은 값).
                                        bid_end 가 자유 형식 텍스트라 SQL 비교로는 못 세고 그 함수가 앱에서 센다(head 예외)
     · 입주  apartment_supply         — lib/market/supply(읽기 전용 클라이언트). move_in_ym = 이번 달(KST)
     · 정비  redevelopment_projects   — lib/redevelopment/store(읽기 전용 클라이언트). 전체 행(지도의 모수)

   실패 규율: 조회 하나가 실패하면 그 칸만 null(부제 없음). 넷 다 실패면 던져서 빈 값을 하루 동안
   캐시에 굳히지 않는다(lib/newui/home-coverage 와 같은 규칙). 호출부는 null 을 받아 부제 없이 그린다.
   캐시 키에 오늘 날짜·이번 달이 들어가므로 자정이 지나면 자연히 새로 센다.
   ============================================================ */

function countOf(r: { count: number | null; error: { message: string } | null }, what: string): number | null {
  if (r.error) {
    logger.warn(`[town-category-counts] ${what} 집계 실패`, r.error.message);
    return null;
  }
  return typeof r.count === "number" && Number.isFinite(r.count) ? r.count : null;
}

async function countApplyOpen(today: string): Promise<number | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const r = await sb
    .from("applyhome_announcements")
    .select("*", { count: "exact", head: true })
    .lte("rcept_bgnde", today)
    .gte("rcept_endde", today);
  return countOf(r, "청약 접수 중");
}

async function countSupplyMonth(ym: string): Promise<number | null> {
  const sb = getReadOnlySupabase();
  if (!sb) return null;
  const r = await sb.from("apartment_supply").select("*", { count: "exact", head: true }).eq("move_in_ym", ym);
  return countOf(r, "이번 달 입주");
}

async function countRedevZones(): Promise<number | null> {
  const sb = getReadOnlySupabase();
  if (!sb) return null;
  const r = await sb.from("redevelopment_projects").select("*", { count: "exact", head: true });
  return countOf(r, "정비사업 구역");
}

async function loadUncached(today: string, ym: string): Promise<TownCategoryCounts> {
  const settled = await Promise.allSettled([
    countApplyOpen(today),
    getActiveAuctionCount(),
    countSupplyMonth(ym),
    countRedevZones(),
  ]);
  const pick = (i: number, what: string): number | null => {
    const s = settled[i];
    if (s.status === "fulfilled") return s.value;
    logger.warn(`[town-category-counts] ${what} 집계 실패`, s.reason);
    return null;
  };
  const out: TownCategoryCounts = {
    applyOpen: pick(0, "청약 접수 중"),
    onbidActive: pick(1, "공매 진행"),
    supplyMonth: pick(2, "이번 달 입주"),
    supplyYm: ym,
    redevZones: pick(3, "정비사업 구역"),
  };
  if (out.applyOpen === null && out.onbidActive === null && out.supplyMonth === null && out.redevZones === null) {
    throw new Error("[town-category-counts] 카테고리 집계를 하나도 읽지 못했습니다");
  }
  return out;
}

const loadCached = unstable_cache(loadUncached, ["town-category-counts-v1"], {
  revalidate: 86_400,
  tags: [CACHE_TAGS.market, CACHE_TAGS.supply, CACHE_TAGS.news],
});

/** 실패해도 /town 을 죽이지 않는다 — null 이면 화면은 타일 부제를 생략한다. */
export async function loadTownCategoryCounts(nowMs: number = Date.now()): Promise<TownCategoryCounts | null> {
  try {
    return await loadCached(kstDayOf(nowMs), kstYmOf(nowMs));
  } catch (e) {
    logger.error("[town-category-counts]", e);
    return null;
  }
}
