import "server-only";
/**
 * [1024] 원룸·오피스텔 동네 실거래 전월세 조회 — /rent/[region](담당 S) 의 데이터.
 *
 * 출처: market_transactions(source MOLIT, transaction_type='rent', property_type ∈ officetel·rowhouse·house,
 * is_cancelled=false) — 국토부 신고 실거래(매물 아님). 적재는 molit-nonapt-ingest 크론(수도권·최근 12개월).
 * 아직 0행이면 `deals` 가 비고 `sampleCount=0` — 화면은 빈 상태 사실 문장으로 받는다.
 *
 * 지역 = 기존 지역 카탈로그 id(시군구). region_name 후보는 아파트 전월세(rent.ts)와 같은 함수로 만든다.
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { transactionNameCandidates } from "@/lib/market/store";
import { logger } from "@/lib/log";
import { currentYm, ymMonthsBefore } from "@/lib/format/ym";
import { readPaged } from "@/lib/supabase/read-paged";
import {
  rowToNonAptDeal,
  summarizeNonAptRent,
  type AreaBandKey,
  type NonAptPropertyType,
  type NonAptRentDeal,
  type NonAptRentSummary,
} from "@/lib/market/rent-nonapt-core";

export {
  AREA_BANDS,
  NONAPT_PROPERTY_TYPES,
  NONAPT_TYPE_LABEL,
  areaBandKeyOf,
  dongOfAddress,
  isAreaBandKey,
  summarizeNonAptRent,
} from "@/lib/market/rent-nonapt-core";
export type { AreaBandKey, NonAptPropertyType, NonAptRentDeal, NonAptRentStats, NonAptRentSummary } from "@/lib/market/rent-nonapt-core";

/** 표본 상한 — [1055] range 로 쪽을 나눠 읽으므로 PostgREST 상한(1,000)과 무관하게 여기까지 받는다. 닿으면 sampleTruncated */
export const NONAPT_SAMPLE_CAP = 3000;

export interface NonAptRentSnapshot extends NonAptRentSummary {
  regionId: string;
  type: NonAptPropertyType;
  /** 표본 기간(캘린더 월, 당월 포함) */
  fromYm: string;
  toYm: string;
  periodLabel: string;
  /** 필터 전 표본 크기 */
  sampleCount: number;
  sampleTruncated: boolean;
  /** 표본에 있는 가장 최근 계약월 */
  latestYm: string | null;
}

/* [1055] 한국 달 기준 — 예전 getUTCMonth 는 매월 1일 00~09시(KST)에 창과 라벨이 한 달 뒤로 밀렸다 */
function ymMonthsAgo(n: number, now = new Date()): string {
  return ymMonthsBefore(currentYm(now), n);
}

/**
 * 지역·유형의 최근 N개월(기본 3) 전월세 실거래 → 동·면적대 요약.
 * 조회 실패는 던진다 — 빈 결과로 뭉개면 "신고 없음"이라는 거짓 문장이 된다(rent.ts 와 같은 원칙).
 */
export async function getNonAptRentSnapshot(
  regionId: string,
  regionName: string,
  opts: { type: NonAptPropertyType; dong?: string | null; areaBand?: AreaBandKey | null; months?: number; recentLimit?: number },
  signal?: AbortSignal,
): Promise<NonAptRentSnapshot | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const months = Math.max(1, Math.min(12, opts.months ?? 3));
  const now = new Date();
  const fromYm = ymMonthsAgo(months - 1, now);
  const toYm = ymMonthsAgo(0, now);
  const names = transactionNameCandidates(regionId, regionName);

  /* [1055] 끝까지 나눠 읽는다(PostgREST 상한 1,000행 · 예전 limit 3000 은 1,000에서 조용히 잘리고 상한 표시는 영원히 안 떴다) */
  let paged: { rows: Record<string, unknown>[]; truncated: boolean };
  try {
    paged = await readPaged<Record<string, unknown>>((f, t) => {
      let q = sb
        .from("market_transactions")
        .select("contract_ym,contract_day,property_type,address,area_m2,floor,deposit_krw,monthly_rent_krw,complex_name,build_year")
        .in("region_name", names)
        .eq("transaction_type", "rent")
        .eq("property_type", opts.type)
        .eq("is_cancelled", false)
        .gte("contract_ym", fromYm)
        .not("deposit_krw", "is", null)
        .order("contract_ym", { ascending: false })
        .order("contract_day", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .range(f, t);
      if (signal) q = q.abortSignal(signal);
      return q;
    }, NONAPT_SAMPLE_CAP);
  } catch (e) {
    logger.error(`[rent-nonapt] 조회 실패(${regionId}/${opts.type})`, e);
    throw new Error(`market_transactions(rent · ${opts.type}) 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
  const deals: NonAptRentDeal[] = [];
  for (const r of paged.rows) {
    const d = rowToNonAptDeal(r);
    if (d) deals.push(d);
  }
  const summary = summarizeNonAptRent(deals, { dong: opts.dong, areaBand: opts.areaBand }, opts.recentLimit ?? 30);
  const fmt = (ym: string) => `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
  let latestYm: string | null = null;
  for (const d of deals) if (!latestYm || d.ym > latestYm) latestYm = d.ym;
  return {
    ...summary,
    regionId,
    type: opts.type,
    fromYm,
    toYm,
    periodLabel: `${fmt(fromYm)}~${fmt(toYm)}`,
    sampleCount: deals.length,
    sampleTruncated: paged.truncated,
    latestYm,
  };
}

/**
 * 지역에 비아파트 전월세 행이 하나라도 있는가(유형별 건수) — 화면의 noindex/빈 상태 판단용. 실패 시 null.
 */
export async function countNonAptRent(
  regionId: string,
  regionName: string,
  months = 12,
  signal?: AbortSignal,
): Promise<Record<NonAptPropertyType, number> | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const names = transactionNameCandidates(regionId, regionName);
  const fromYm = ymMonthsAgo(Math.max(1, months) - 1);
  const out: Record<NonAptPropertyType, number> = { officetel: 0, rowhouse: 0, house: 0 };
  for (const type of Object.keys(out) as NonAptPropertyType[]) {
    let q = sb
      .from("market_transactions")
      .select("id", { count: "exact", head: true })
      .in("region_name", names)
      .eq("transaction_type", "rent")
      .eq("property_type", type)
      .eq("is_cancelled", false)
      .gte("contract_ym", fromYm);
    if (signal) q = q.abortSignal(signal);
    const { count, error } = await q;
    if (error) {
      logger.warn(`[rent-nonapt] 건수 조회 실패(${regionId}/${type})`, error.message);
      return null;
    }
    out[type] = count ?? 0;
  }
  return out;
}
