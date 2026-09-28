import "server-only";
/**
 * [1024 · 원룸·오피스텔] /rent 화면이 쓰는 조회 — 담당 Q 의 lib/market/rent-nonapt.ts 를 6시간 데이터 캐시로 감싼다.
 *
 * /rent/[region] 은 searchParams(type·dong·area)를 읽는 동적 라우트라 라우트 ISR 이 없다. 그래서 DB 읽기를
 * unstable_cache(revalidate 21600 · tag market)로 묶는다 — 같은 (지역·유형·동·면적대) 조합은 6시간에 한 번만
 * market_transactions 를 읽고, 적재 직후 SOURCE_MAP.molit 이 "market" 태그를 비운다.
 *
 * 수도권 전 지역 건수(목록 /rent · 사이트맵)는 먼저 **한 행 탐침**(비아파트 전월세가 한 행이라도 있는가)을 보고,
 * 0 이면 지역별 head-count 190회를 아예 돌리지 않는다(지금 운영 DB 는 0행).
 */
import { unstable_cache } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getNonAptRentSnapshot, countNonAptRent, type NonAptRentSnapshot } from "@/lib/market/rent-nonapt";
import { NONAPT_PROPERTY_TYPES, type AreaBandKey, type NonAptPropertyType } from "@/lib/market/rent-nonapt-core";
import { CACHE_TAGS } from "@/lib/cache/invalidate";
import { REGION_CATALOG } from "@/lib/region/catalog";
import { logger } from "@/lib/log";
import { isSudogwonRegion, RENT_MONTHS } from "@/lib/rent/params";

export const RENT_CACHE_SECONDS = 21_600;

/** 표에는 30건, 산점에는 최대 400건 — 한 조회로 둘 다 받는다(summary.deals 는 최신순) */
export const RENT_RECENT_LIMIT = 400;

const cachedSnapshot = unstable_cache(
  async (regionId: string, regionName: string, type: NonAptPropertyType, dong: string | null, areaBand: AreaBandKey | null) =>
    getNonAptRentSnapshot(regionId, regionName, { type, dong, areaBand, months: RENT_MONTHS, recentLimit: RENT_RECENT_LIMIT }),
  ["rent-nonapt-snapshot-v1"],
  { revalidate: RENT_CACHE_SECONDS, tags: [CACHE_TAGS.market] },
);

/** 조회 실패는 던진다(rent-nonapt.ts 원칙) — 페이지의 error.tsx 가 받는다 */
export function getRentSnapshotCached(
  regionId: string,
  regionName: string,
  p: { type: NonAptPropertyType; dong: string | null; areaBand: AreaBandKey | null },
): Promise<NonAptRentSnapshot | null> {
  return cachedSnapshot(regionId, regionName, p.type, p.dong, p.areaBand);
}

const cachedCounts = unstable_cache(
  async (regionId: string, regionName: string) => countNonAptRent(regionId, regionName, 12),
  ["rent-nonapt-counts-v1"],
  { revalidate: RENT_CACHE_SECONDS, tags: [CACHE_TAGS.market] },
);

/** 지역의 유형별 건수(최근 12개월). 실패는 null — noindex 판단은 null 도 "행 없음"으로 본다 */
export async function getRentCountsCached(regionId: string, regionName: string): Promise<Record<NonAptPropertyType, number> | null> {
  try {
    return await cachedCounts(regionId, regionName);
  } catch (e) {
    logger.warn(`[rent] 건수 조회 실패(${regionId})`, e);
    return null;
  }
}

/** 비아파트 전월세 행이 하나라도 있는가 — 한 행만 읽는다. 실패는 false(목록·사이트맵은 "없음"으로 그린다) */
async function probeAnyNonAptRent(): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { data, error } = await sb
    .from("market_transactions")
    .select("id")
    .eq("transaction_type", "rent")
    .in("property_type", [...NONAPT_PROPERTY_TYPES])
    .limit(1);
  if (error) {
    logger.warn("[rent] 비아파트 전월세 탐침 실패", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export type RentRegionCount = { id: string; name: string; city: string; total: number; counts: Record<NonAptPropertyType, number> | null };

async function loadSudogwonCounts(): Promise<RentRegionCount[]> {
  const regions = REGION_CATALOG.filter(isSudogwonRegion);
  const zero: Record<NonAptPropertyType, number> = { officetel: 0, rowhouse: 0, house: 0 };
  const any = await probeAnyNonAptRent();
  const out: RentRegionCount[] = [];
  const CONCURRENCY = 6;
  for (let i = 0; i < regions.length; i += CONCURRENCY) {
    const chunk = regions.slice(i, i + CONCURRENCY);
    const rows = await Promise.all(
      chunk.map(async (r) => {
        const counts = any ? await countNonAptRent(r.id, r.name, 12).catch(() => null) : zero;
        const total = counts ? NONAPT_PROPERTY_TYPES.reduce((a, t) => a + (counts[t] ?? 0), 0) : 0;
        return { id: r.id, name: r.name, city: (r.city ?? "").trim() || "서울", total, counts };
      }),
    );
    out.push(...rows);
  }
  return out;
}

const cachedSudogwon = unstable_cache(loadSudogwonCounts, ["rent-nonapt-sudogwon-v1"], {
  revalidate: RENT_CACHE_SECONDS,
  tags: [CACHE_TAGS.market],
});

/** 수도권 전 지역 건수(목록 /rent · 사이트맵). 실패는 던진다 — 호출부가 정한다 */
export function getSudogwonRentCounts(): Promise<RentRegionCount[]> {
  return cachedSudogwon();
}
