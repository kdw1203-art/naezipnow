import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { transactionNameCandidates } from "@/lib/market/store";
import { logger } from "@/lib/log";
import { currentYm, ymMonthsBefore } from "@/lib/format/ym";
import { readPaged } from "@/lib/supabase/read-paged";

/* [#52, 2026-08-23] 지역 페이지 평형대별 시세 섹션용 경량 로더.
 * "강남구 30평대 시세" 류 검색 수요를 지역 페이지 안에서 받는다(새 URL 없음).
 * 최근 3개월 매매 원본에서 면적대 4밴드의 건수·중앙값·평당 중앙값만 계산 —
 * 표본 상한 4000행, 밴드 표본 5건 미만이면 그 밴드는 숨긴다(희소 표본의
 * 중앙값은 사실이 아니라 소음이다). */

export type AreaBandRow = {
  key: string;
  label: string;
  count: number;
  medianKrw: number;
  medianPerPyeongKrw: number;
};

export type RegionAreaBands = {
  bands: AreaBandRow[];
  sampleCount: number;
  truncated: boolean;
  periodLabel: string;
};

const CAP = 4000;
const PYEONG = 3.305785;

const BANDS: Array<{ key: string; label: string; min: number; max: number | null }> = [
  { key: "lt60", label: "60㎡ 미만 (~24평)", min: 0, max: 60 },
  { key: "b6085", label: "60~85㎡ (25~33평)", min: 60, max: 85.001 },
  { key: "b85102", label: "85~102㎡ (34~40평)", min: 85.001, max: 102 },
  { key: "gte102", label: "102㎡ 이상 (41평~)", min: 102, max: null },
];

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/* [1055] 한국 달 · 넘침 없음(예전 setMonth 는 31일에 두 달 창, 1일 새벽엔 전달 기준) */
function ymMonthsAgo(n: number): string {
  return ymMonthsBefore(currentYm(), n);
}

export async function getRegionTradeAreaBands(
  regionId: string,
  regionName: string,
  signal?: AbortSignal,
): Promise<RegionAreaBands | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const from3 = ymMonthsAgo(2);
  /* [1055] 끝까지 나눠 읽는다 — `.limit(4000)` 은 PostgREST 상한(1,000행)에서 잘려 큰 구의 3개월 매매 표본이 임의의 1,000행이었다 */
  let paged: { rows: Array<Record<string, unknown>>; truncated: boolean };
  try {
    paged = await readPaged<Record<string, unknown>>((f, t) => {
      let q = sb
        .from("market_transactions")
        .select("deal_amount_krw, area_m2")
        .in("region_name", transactionNameCandidates(regionId, regionName))
        .eq("transaction_type", "trade")
        .eq("is_cancelled", false)
        .eq("property_type", "apartment")
        .gte("contract_ym", from3)
        .not("deal_amount_krw", "is", null)
        .not("area_m2", "is", null)
        .order("contract_ym", { ascending: false })
        .order("id", { ascending: true })
        .range(f, t);
      if (signal) q = q.abortSignal(signal);
      return q;
    }, CAP);
  } catch (e) {
    logger.error(`[area-bands] 조회 실패(${regionId})`, e);
    throw new Error(`market_transactions(면적대) 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
  const rows = paged.rows;
  if (rows.length === 0) return null;

  const buckets = new Map<string, { prices: number[]; perPyeong: number[] }>();
  for (const b of BANDS) buckets.set(b.key, { prices: [], perPyeong: [] });
  for (const r of rows) {
    const price = Number(r.deal_amount_krw);
    const area = Number(r.area_m2);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(area) || area <= 0) continue;
    const band = BANDS.find((b) => area >= b.min && (b.max === null || area < b.max));
    if (!band) continue;
    const bucket = buckets.get(band.key);
    if (!bucket) continue;
    bucket.prices.push(price);
    bucket.perPyeong.push(Math.round(price / (area / PYEONG)));
  }

  const bands: AreaBandRow[] = [];
  for (const b of BANDS) {
    const bucket = buckets.get(b.key);
    if (!bucket || bucket.prices.length < 5) continue;
    bucket.prices.sort((x, y) => x - y);
    bucket.perPyeong.sort((x, y) => x - y);
    bands.push({
      key: b.key,
      label: b.label,
      count: bucket.prices.length,
      medianKrw: median(bucket.prices),
      medianPerPyeongKrw: median(bucket.perPyeong),
    });
  }
  if (bands.length === 0) return null;

  const fmtYm = (ym: string) => `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
  return {
    bands,
    sampleCount: rows.length,
    truncated: paged.truncated,
    periodLabel: `${fmtYm(from3)}~${fmtYm(ymMonthsAgo(0))}`,
  };
}
