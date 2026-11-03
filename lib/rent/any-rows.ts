import "server-only";
/**
 * [1102] 비아파트 전월세가 한 행이라도 있는가 — 지역 탭(RegionTabs)의 "전월세" 칸을 이것으로 건다.
 * 1101 은 수도권이면 늘 탭을 그려, 0행인 지금(운영 2026-11-03 확인) 모든 수도권 지역 화면이 "—" 뿐인 /rent/{id} 로 보냈다.
 *
 * region-counts.ts 와 따로 둔 이유: 그 모듈의 6시간 캐시들이 같이 딸려 오면 지역 화면(ISR 7일)의 수명이 6시간으로 내려간다
 * (scripts/check-isr-ttl). 여기 캐시는 화면 수명과 같은 7일이고, 적재 직후 "market" 태그 비우기(SOURCE_MAP.molit)가 바로 갱신한다.
 */
import { unstable_cache } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase/service";
import { NONAPT_PROPERTY_TYPES } from "@/lib/market/rent-nonapt-core";
import { CACHE_TAGS } from "@/lib/cache/invalidate";
import { logger } from "@/lib/log";

async function probe(): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { data, error } = await sb
    .from("market_transactions")
    .select("id")
    .eq("transaction_type", "rent")
    .in("property_type", [...NONAPT_PROPERTY_TYPES])
    .limit(1);
  if (error) {
    logger.warn("[rent] 비아파트 전월세 탐침 실패(지역 탭)", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

const cachedProbe = unstable_cache(probe, ["rent-nonapt-any-v1"], {
  revalidate: 604_800,
  tags: [CACHE_TAGS.market],
});

/** 실패는 false — 없는 화면으로 링크하지 않는 쪽 */
export async function hasAnyNonAptRent(): Promise<boolean> {
  try {
    return await cachedProbe();
  } catch (e) {
    logger.warn("[rent] 비아파트 전월세 탐침(캐시) 실패", e);
    return false;
  }
}
