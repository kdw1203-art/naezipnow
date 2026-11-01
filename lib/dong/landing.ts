/**
 * [1083] 법정동 실거래 페이지 — 조회. 원천은 둘 다 이미 있는 것:
 *  · market_agg.search_complex_mv(단지 × 동 · RPC search_complexes_filtered) · search_area_mv(동 집계 · RPC search_area_children)
 *  · market_transactions(월별 추이 · 면적대 · 최근 거래 — 서비스 키가 있을 때만. 없으면 그 조각만 뺀다)
 *
 * 규칙(lib/market/tx-bands 와 같다): "없다"(→ 404)와 "못 읽었다"(→ 던져서 5xx)를 구분한다. 404 는 색인에서 지우고 5xx 는 다시 오게 한다.
 * 동 목록(사이트맵·허브)은 지역마다 RPC 한 번(상한 20) — 254 지역 × 1회를 10분 메모로 묶는다. 전용 뷰는 소유자 DB 작업(owner-todo).
 */
import "server-only";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { currentYm, ymMonthsBefore } from "@/lib/format/ym";
import { reportingClosed } from "@/lib/newui/reporting-window";
import { listTxRegions } from "@/lib/market/tx-bands";
import { unstable_cache } from "next/cache";
import { complexPairPath, listComplexPairs } from "@/lib/market/complex-pairs";
import { parseDong } from "@/lib/complex/dong";
import {
  DONG_RECENT_DEALS,
  DONG_TREND_MONTHS,
  aggregateBands,
  aggregateMonths,
  dongInSitemap,
  regionSlugOf,
  type DongBandCell,
  type DongComplex,
  type DongDeal,
  type DongLanding,
  type DongMonth,
  type DongSibling,
} from "./format";

type FilteredRow = {
  complex_id: string;
  region_name: string;
  complex_name: string;
  address: string | null;
  trade_count: number | string | null;
  recent_trade_count: number | string | null;
  avg_price_manwon: number | string | null;
  avg_area_m2: number | string | null;
  build_year: number | null;
  households: number | null;
  total_count: number | string | null;
};

type ChildRow = { kind: string; dong: string | null; regions: string[] | null; complex_count: number | null; recent_trade_count: number | string | null };

const num = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};

const RPC_PAGE = 30;
const RPC_MAX_OFFSET = 300;

/** 동의 단지 전부(거래 많은 순) — 0건이면 빈 배열("없다"), 조회 실패는 던진다.
 *  [1094 · 기능] **매매 실거래가 한 건도 없는 단지(전월세만)는 뺀다** — search_complex_mv 40,317곳 가운데 6,003곳이 전월세만 있는 단지인데,
 *  단지 화면은 매매 실거래가 있어야 존재한다(complex/[id]/layout exists → getComplexBaseById: trade · apartment). 동 화면 · 3D 동네 지도가
 *  그 단지에 링크를 걸어 404 였다(운영 실측 상계동 "나머지" 목록 7곳). 이 화면의 제목도 "매매 실거래"다 — 세는 단지 수도 같은 기준으로. */
export async function loadDongComplexes(region: string, dong: string): Promise<DongComplex[]> {
  const sb = getReadOnlySupabase();
  if (!sb) throw new Error("search_complexes_filtered 를 부를 수단이 없습니다(Supabase 미설정)");
  const out: DongComplex[] = [];
  for (let offset = 0; offset <= RPC_MAX_OFFSET; offset += RPC_PAGE) {
    const { data, error } = await sb.rpc("search_complexes_filtered", {
      p_regions: [region],
      p_dong: dong,
      p_sort: "trades",
      p_limit: RPC_PAGE,
      p_offset: offset,
    });
    if (error) throw new Error(`search_complexes_filtered(${region} ${dong}) 실패 — ${error.message}${error.code ? ` [${error.code}]` : ""}`);
    const rows = (data as FilteredRow[] | null) ?? [];
    for (const r of rows) {
      if (num(r.trade_count) === 0) continue;
      out.push({
        id: r.complex_id,
        name: r.complex_name,
        region: r.region_name,
        address: r.address?.trim() || null,
        tradeCount: num(r.trade_count) ?? 0,
        recentTradeCount: num(r.recent_trade_count) ?? 0,
        avgPriceManwon: num(r.avg_price_manwon),
        avgAreaM2: num(r.avg_area_m2),
        buildYear: r.build_year ?? null,
        households: r.households ?? null,
      });
    }
    /* 페이지 끝 판정은 RPC 가 준 행 수로(걸러낸 뒤의 out.length 로 하면 전월세만 있는 단지가 섞인 동에서 일찍 멈춘다) */
    const total = num(rows[0]?.total_count) ?? Number.POSITIVE_INFINITY;
    if (rows.length < RPC_PAGE || offset + rows.length >= total) break;
  }
  return out;
}

/** 같은 지역의 동 목록(거래 많은 순 · 상한 20) — 실패는 빈 배열(보조 내비게이션이라 페이지를 막지 않는다) */
export async function loadDongSiblings(region: string): Promise<DongSibling[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc("search_area_children", { p_regions: [region], p_dong: null, p_limit: 20 });
  if (error) {
    logger.warn("[dong] search_area_children 실패", { region, message: error.message });
    return [];
  }
  return ((data as ChildRow[] | null) ?? [])
    .filter((r) => r.kind === "dong" && r.dong)
    .map((r) => ({ dong: r.dong as string, complexCount: r.complex_count ?? 0, recentTradeCount: num(r.recent_trade_count) ?? 0 }));
}

type TxRow = { complex_name: string; address: string | null; contract_ym: string; contract_day: number | null; deal_amount_krw: number | string; area_m2: number | string | null; floor: number | null };

/** 동 거래 창(최근 24개월) — 월별 추이·면적대·최근 거래의 공용 원천. 서비스 키 없음 → null(조각 생략) · 실패 → 던진다 */
async function loadDongWindow(region: string, dong: string, now: Date): Promise<{ rows: TxRow[]; fromYm: string; nowYm: string } | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const nowYm = currentYm(now);
  const fromYm = ymMonthsBefore(nowYm, DONG_TREND_MONTHS - 1);
  const rows: TxRow[] = [];
  const PAGE = 1000;
  for (let page = 0; page < 8; page += 1) {
    const { data, error } = await sb
      .from("market_transactions")
      .select("complex_name,address,contract_ym,contract_day,deal_amount_krw,area_m2,floor")
      .eq("region_name", region)
      .eq("transaction_type", "trade")
      .eq("property_type", "apartment")
      .eq("is_cancelled", false)
      .gte("contract_ym", fromYm)
      /* 주소는 "송파구 잠실동 22" 꼴 — 앞에 공백이 있는 토큰만. 넓게 걸러 오고(like) 아래에서 parseDong 으로 정확히 맞춘다 */
      .like("address", `% ${dong}%`)
      .order("contract_ym", { ascending: false })
      .order("contract_day", { ascending: false, nullsFirst: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(`market_transactions(${region} ${dong}) 조회 실패 — ${error.message}${error.code ? ` [${error.code}]` : ""}`);
    const chunk = (data as TxRow[] | null) ?? [];
    rows.push(...chunk.filter((r) => parseDong(r.address) === dong));
    if (chunk.length < PAGE) break;
  }
  return { rows, fromYm, nowYm };
}

export type DongWindowStats = { months: DongMonth[]; bands: DongBandCell[]; deals: DongDeal[]; totalInWindow: number };

export async function loadDongStats(region: string, dong: string, now: Date = new Date()): Promise<DongWindowStats | null> {
  const w = await loadDongWindow(region, dong, now);
  if (!w) return null;
  const rows = w.rows.map((r) => ({ ym: r.contract_ym, priceKrw: num(r.deal_amount_krw) ?? 0, areaM2: num(r.area_m2) }));
  const yms: string[] = [];
  for (let i = DONG_TREND_MONTHS - 1; i >= 0; i -= 1) yms.push(ymMonthsBefore(w.nowYm, i));
  const months = aggregateMonths(rows, yms, (ym) => !reportingClosed(ym, now));
  const bands = aggregateBands(rows, ymMonthsBefore(w.nowYm, 11));
  const deals: DongDeal[] = w.rows.slice(0, DONG_RECENT_DEALS).map((r) => ({
    complexName: r.complex_name,
    ym: r.contract_ym,
    day: r.contract_day ?? null,
    priceKrw: num(r.deal_amount_krw) ?? 0,
    areaM2: num(r.area_m2),
    floor: r.floor ?? null,
  }));
  return { months, bands, deals, totalInWindow: w.rows.length };
}

/* ── 동 목록(사이트맵·허브·지역 화면) — 지역마다 RPC 1회 · 10분 메모 · 빈 결과는 기억하지 않는다 ── */
const LIST_MEMO_MS = 10 * 60_000;
let listMemo: { at: number; p: Promise<DongLanding[]> } | null = null;

async function listDongLandingsUncached(): Promise<DongLanding[]> {
  const regions = await listTxRegions();
  const out: DongLanding[] = [];
  const BATCH = 16;
  for (let i = 0; i < regions.length; i += BATCH) {
    const slice = regions.slice(i, i + BATCH);
    const results = await Promise.all(slice.map((r) => loadDongSiblings(r.name).then((d) => ({ region: r.name, dongs: d }))));
    for (const { region, dongs } of results) {
      for (const d of dongs) {
        out.push({
          region,
          regionSlug: regionSlugOf(region),
          dong: d.dong,
          label: `${region} ${d.dong}`,
          complexCount: d.complexCount,
          recentTradeCount: d.recentTradeCount,
        });
      }
    }
  }
  out.sort((a, b) => b.recentTradeCount - a.recentTradeCount || a.label.localeCompare(b.label, "ko"));
  return out;
}

/** 전체 동 목록(지역당 상한 20 · 거래 많은 순). 조회 실패는 던진다 — 사이트맵이 빈 목록을 사실처럼 내지 않게 */
export function listDongLandings(): Promise<DongLanding[]> {
  const now = Date.now();
  if (listMemo && now - listMemo.at < LIST_MEMO_MS) return listMemo.p;
  const p = listDongLandingsUncached().then(
    (list) => {
      if (list.length === 0) listMemo = null;
      return list;
    },
    (e: unknown) => {
      listMemo = null;
      throw e;
    },
  );
  listMemo = { at: now, p };
  return p;
}

/** 사이트맵 문턱을 넘는 동만 */
export async function listSitemapDongs(): Promise<DongLanding[]> {
  return (await listDongLandings()).filter((d) => dongInSitemap(d.complexCount, d.recentTradeCount));
}

/* ── [1095 · 기능] 동 안의 단지 비교 조합 ──────────────────────────────────────────────────────────────
   비교 화면(/complex/compare/[slug] · 1,119쌍)은 단지 화면의 "비교 담기"와 사이트맵에서만 닿았다. 동 화면은 같은 동 단지를 나란히 보는
   자리라 그 동의 조합(거래 많은 순)을 칩으로 건다. 조합 목록은 7일 데이터 캐시 한 벌(약 1,119행 · 날짜 필드는 빼고 저장) — 화면 수명(7일)과
   같은 눈금(check-isr-ttl). 실패는 빈 배열(곁다리) · 실패는 캐시하지 않는다(unstable_cache 는 throw 를 저장하지 않는다). */
export interface DongPairLink {
  a: string;
  b: string;
  href: string;
  /** 두 단지의 최근 12개월 매매 신고 합 */
  pairTradeCount: number;
}
type PairSlim = { region: string; dong: string; a: string; b: string; href: string; pairTradeCount: number };
const loadAllPairsCached = unstable_cache(
  async (): Promise<PairSlim[]> =>
    (await listComplexPairs()).map((p) => ({ region: p.regionName, dong: p.dong, a: p.complexA, b: p.complexB, href: complexPairPath(p), pairTradeCount: p.pairTradeCount })),
  ["complex-pairs-all-v1"],
  { revalidate: 604_800 },
);

export async function loadDongPairs(region: string, dong: string, max = 6): Promise<DongPairLink[]> {
  const pairs = await loadAllPairsCached().catch((e: unknown) => {
    logger.warn(`[dong] 비교 조합 목록 실패(생략) ${region} ${dong}`, e);
    return [] as PairSlim[];
  });
  return pairs
    .filter((p) => p.region === region && p.dong === dong)
    .sort((x, y) => y.pairTradeCount - x.pairTradeCount || x.a.localeCompare(y.a, "ko"))
    .slice(0, max)
    .map(({ a, b, href, pairTradeCount }) => ({ a, b, href, pairTradeCount }));
}

/** [1095 · 기능] 이 단지가 낀 비교 조합(거래 많은 순) — 단지 화면 "인근 단지" 옆 "단지 비교" 칩. other = 상대 단지 이름 */
export interface ComplexPairLink {
  other: string;
  href: string;
  pairTradeCount: number;
}
export async function loadComplexPairLinks(region: string, name: string, max = 4): Promise<ComplexPairLink[]> {
  const pairs = await loadAllPairsCached().catch((e: unknown) => {
    logger.warn(`[complex] 비교 조합 목록 실패(생략) ${region} ${name}`, e);
    return [] as PairSlim[];
  });
  return pairs
    .filter((p) => p.region === region && (p.a === name || p.b === name))
    .sort((x, y) => y.pairTradeCount - x.pairTradeCount)
    .slice(0, max)
    .map((p) => ({ other: p.a === name ? p.b : p.a, href: p.href, pairTradeCount: p.pairTradeCount }));
}
