import "server-only";
/* [1211] 단지 vs 단지 비교 — 숫자 계산(서버 전용). 소유자 "단지 vs 단지는 지도에서 비교 표시를 하면 팝업으로 보이게 하고 해당 페이지는 삭제해줘".
   예전 /complex/compare/[slug] 화면의 계산을 그대로 옮겼다 — 화이트리스트(complex_pair_mv)에 있는 조합만 · 화면 숫자는 전부 이번 요청에서
   읽은 거래 행에서(머리 숫자와 표가 어긋나지 않게). 지도 팝업(/api/map/complex-pair)이 이 결과를 그대로 그린다. */
import { AREA_BANDS } from "@/lib/market/bands";
import {
  findComplexTxRegionById,
  listComplexTransactions,
  regionDisplayName,
  type ComplexTransactionRecord,
} from "@/lib/market/complex-transactions";
import { findComplexPair, pairWindowMonths, pairWindowStartYm, parseComplexPairSlug } from "@/lib/market/complex-pairs";
import { buildComplexPairSlug } from "@/lib/market/complex-pair-slug";
import { complexHrefFromNames } from "@/lib/seo/complex-slug";
import { getCachedCoord } from "@/lib/map/complex-geocode";

/** 단지별 거래 표본 상한 — 12개월 창을 덮었는지 스스로 증명할 수 있을 만큼 */
const SAMPLE_LIMIT = 400;

export type PairBand = { label: string; count: number; avgKrw: number; latestKrw: number; latestYm: string };
export type PairSide = {
  name: string;
  href: string;
  count: number;
  /** 표본이 12개월 창 전체를 덮었는가(아니면 "이상") */
  covered: boolean;
  avgAmountKrw: number | null;
  avgPerPyeongKrw: number | null;
  medianAreaM2: number | null;
  buildYear: number | null;
  address: string | null;
  latest: { ym: string; day: number | null; amountKrw: number; areaM2: number | null; floor: number | null } | null;
  bands: PairBand[];
  /** months 와 같은 순서의 월별 매매 건수 */
  monthly: number[];
  coord: { lat: number; lng: number } | null;
};
export type ComplexPairStats = {
  slug: string;
  regionLabel: string;
  dong: string;
  months: string[];
  a: PairSide;
  b: PairSide;
};

function summarize(
  name: string,
  regionName: string,
  sample: ComplexTransactionRecord[],
  windowStartYm: string,
  months: readonly string[],
): Omit<PairSide, "coord"> {
  const rows = sample.filter((r) => r.contractYm >= windowStartYm);
  const covered = sample.length < SAMPLE_LIMIT || rows.length < sample.length;
  const amounts = rows.map((r) => r.dealAmountKrw).filter((v) => v > 0);
  const perPyeong = rows.map((r) => r.pricePerPyeongKrw).filter((v): v is number => v !== null && v > 0);
  const areas = rows
    .map((r) => r.areaM2)
    .filter((v): v is number => v !== null && v > 0)
    .sort((x, y) => x - y);
  const bands: PairBand[] = [];
  for (const band of AREA_BANDS) {
    const inBand = rows.filter((r) => r.areaM2 !== null && r.areaM2 >= band.min && r.areaM2 < band.max);
    if (inBand.length === 0) continue;
    bands.push({
      label: band.label,
      count: inBand.length,
      avgKrw: inBand.reduce((s, r) => s + r.dealAmountKrw, 0) / inBand.length,
      latestKrw: inBand[0].dealAmountKrw,
      latestYm: inBand[0].contractYm,
    });
  }
  const byYm = new Map<string, number>();
  for (const r of rows) byYm.set(r.contractYm, (byYm.get(r.contractYm) ?? 0) + 1);
  const latest = rows[0] ?? sample[0] ?? null;
  return {
    name,
    href: complexHrefFromNames(regionName, name),
    count: rows.length,
    covered,
    avgAmountKrw: amounts.length > 0 ? amounts.reduce((s, v) => s + v, 0) / amounts.length : null,
    avgPerPyeongKrw: perPyeong.length > 0 ? perPyeong.reduce((s, v) => s + v, 0) / perPyeong.length : null,
    medianAreaM2: areas.length > 0 ? (areas[Math.floor(areas.length / 2)] ?? null) : null,
    buildYear: sample.find((r) => r.buildYear !== null)?.buildYear ?? null,
    address: sample.find((r) => r.address)?.address ?? null,
    latest: latest
      ? { ym: latest.contractYm, day: latest.contractDay ?? null, amountKrw: latest.dealAmountKrw, areaM2: latest.areaM2, floor: latest.floor ?? null }
      : null,
    bands,
    monthly: months.map((ym) => byYm.get(ym) ?? 0),
  };
}

/** slug → 비교 숫자. 화이트리스트에 없는 조합 · 형식이 틀린 slug 는 null. 조회 실패는 던진다(없음과 못 읽음을 섞지 않는다) */
export async function loadComplexPairStats(rawSlug: string): Promise<ComplexPairStats | null> {
  const parsed = parseComplexPairSlug(rawSlug);
  if (!parsed) return null;
  const region = findComplexTxRegionById(parsed.regionId);
  if (!region) return null;
  const pair = await findComplexPair(region, parsed.first, parsed.second);
  if (!pair) return null;
  const [sampleA, sampleB] = await Promise.all([
    listComplexTransactions(pair.complexA, region, SAMPLE_LIMIT),
    listComplexTransactions(pair.complexB, region, SAMPLE_LIMIT),
  ]);
  if (sampleA.length === 0 || sampleB.length === 0) {
    throw new Error(`단지 비교 거래를 읽지 못했습니다 — ${pair.complexA}: ${sampleA.length}행 · ${pair.complexB}: ${sampleB.length}행`);
  }
  const windowStartYm = pairWindowStartYm();
  const months = pairWindowMonths();
  const [coordA, coordB] = await Promise.all([
    getCachedCoord(pair.regionName, pair.complexA).catch(() => null),
    getCachedCoord(pair.regionName, pair.complexB).catch(() => null),
  ]);
  return {
    slug: buildComplexPairSlug(pair.complexA, pair.complexB, region.id),
    regionLabel: regionDisplayName(region),
    dong: pair.dong,
    months: [...months],
    a: { ...summarize(pair.complexA, pair.regionName, sampleA, windowStartYm, months), coord: coordA },
    b: { ...summarize(pair.complexB, pair.regionName, sampleB, windowStartYm, months), coord: coordB },
  };
}
