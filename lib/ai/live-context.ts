import "server-only";
import { getRegionRentYieldRows } from "@/lib/market/rent-yield";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase/service";
import { decodeComplexId } from "@/lib/complex/complex-store";
import { loadComplexTrades, type ComplexTrades } from "@/lib/ai/complex-trades";
import { buildComplexTradeSeries, nowYm, resolveUnitPrice } from "@/lib/ai/result-series";
import { getRegionSnapshot, getRegionDemographics } from "@/lib/market/store";
import { getSupplyForAreaStrict } from "@/lib/market/supply";
import { regionIdForName } from "@/lib/region/catalog";
import {
  complexNewsToken,
  isComplexNews,
  isRegionNews,
  regionNewsTokens,
  regionParts,
  safeIlikeToken,
  supplyQueryFor,
} from "@/lib/ai/region-parts";
import { buildRegionTrend, patchSnapshot, type RegionTrend, type SeriesPoint } from "@/lib/ai/region-trend";
import { summarizeNeighborNotes, type NoteRowLite } from "@/lib/ai/neighbor-notes";
import { logger } from "@/lib/log";

/* [AI-09~17] 라이브 도구 컨텍스트 — AI 워크벤치의 실데이터 백본.
 *
 * 원칙:
 * - 축마다 출처(source)·기준 시점(asOf)·표본 수(sample)를 함께 나른다.
 *   이것이 그대로 근거 각주(AI-01)·신선도 배지(AI-17)·불확실성 판정(AI-03)의
 *   입력이 된다. 값만 나르는 축은 만들지 않는다.
 * - 축 하나의 조회 실패가 전체를 죽이지 않는다(allSettled). 실패한 축은
 *   null — "없음"과 "못 읽음"은 UI 캡션에서 구분한다.
 * - 여기서 계산하지 않는다. 판정(플래그·레이더·신호)은 insight-blocks 가
 *   이 컨텍스트를 입력으로 받아 순수 함수로 한다(골든셋 테스트 대상).
 */

export interface AxisMeta {
  /** 사람이 읽는 출처 라벨 — 예: "국토교통부 실거래(신고)" */
  source: string;
  /** 기준 시점 (ISO 날짜 또는 yyyymm) — 신선도 배지 재료 */
  asOf: string | null;
  /** 표본 수 — 불확실성 판정 재료 (없으면 null) */
  sample?: number | null;
  /** 원본을 볼 수 있는 내부 링크 */
  href?: string | null;
}

export interface LiveToolContext {
  generatedAt: string;
  /** [1008 · 리뷰 A-9] 이번에 조회가 **실패한** 축 라벨("실거래가"·"지역 가격 흐름") — "자료 없음"과 구분한다 */
  unavailable?: string[];
  complex: {
    id: string;
    name: string;
    region: string;
    price:
      | ({
          priceKrw: number;
          /** 화면 라벨 — [1008] 평형 기준이면 "전용 37㎡", 면적대 기준이면 "60~85㎡" */
          bandLabel: string;
          latestYm: string;
          /** [1008] 그 평형이 속한 면적대(또는 면적대 자체) 슬러그 */
          bandSlug?: string;
          /** [1008] 평형 키(전용 ㎡ 정수) — 결과 그래프가 같은 평형의 월평균을 그린다. 면적대 기준이면 null */
          unitM2?: number | null;
          /** [1008] unit = 가장 많이 거래된 평형 하나 · band = 평형으로 3건을 못 채워 면적대 */
          basis?: "unit" | "band";
        } & AxisMeta)
      | null;
    /** [1008 · 리뷰 A-4] 이 단지 최근 6개월(달력, 기준 달 포함) 매매 건수 — 대표가와 같은 행에서 센다.
        워크벤치·단지 허브가 같은 값을 쓴다(허브 "결과 요약"의 이 칸이 늘 "자료 없음"이던 것). */
    recent6?: { count: number; fromYm: string; toYm: string; span: number } | null;
  } | null;
  region: {
    id: string | null;
    name: string;
    snapshot:
      | ({
          avgSale: number | null;
          jeonseRatio: number | null;
          saleChangeMonthly: number | null;
          tradeCount: number | null;
          period: string;
          /** [1008] 빈 칸을 같은 출처(REB) 월간 시계열로 채웠는가 */
          patched?: boolean;
          /** [1008 · 리뷰 A-20] 칸마다 기준 달 — 채운 칸은 그 시계열의 달이라 period 와 다를 수 있다 */
          fieldAsOf?: { change: string | null; jeonse: string | null; trade: string | null };
        } & AxisMeta)
      | null;
    /** [1008] 한국부동산원 월간 매매지수 흐름(1년 변화·한 달 변화) — 없으면 null */
    trend?: RegionTrend | null;
    demographics:
      | ({
          population: number | null;
          households: number | null;
          unsoldUnits: number | null;
          period: string;
        } & AxisMeta)
      | null;
  } | null;
  rent:
    | ({
        wolseSharePct: number | null;
        jeonseCount: number;
        wolseCount: number;
        medianMonthlyKrw: number | null;
        months: number;
      } & AxisMeta)
    | null;
  supply:
    | ({
        upcomingHouseholds: number;
        upcomingComplexes: number;
        items: { aptName: string | null; moveInYm: string; households: number | null }[];
        /** [1008] 찾은 지역(구·시 이름) · 가장 이른/늦은 입주 월 */
        area?: string | null;
        firstYm?: string | null;
        lastYm?: string | null;
      } & AxisMeta)
    | null;
  news:
    | ({ items: { id: string; title: string; at: string }[] } & AxisMeta)
    | null;
  notes:
    | ({
        count: number;
        avgScore: number | null;
        latest: { id: string; title: string } | null;
      } & AxisMeta)
    | null;
  macro:
    | ({ baseRatePct: number | null } & AxisMeta)
    | null;
  /* [AI-18] 학군 축 — 오너 키(⑧) 등록 후 poi_schools 적재 시 자동 합류.
     0행이면 null(축을 그리지 않는다) — 결합부만 미리 깔아 둔다. */
  poi: ({ schoolCount: number } & AxisMeta) | null;
}

const NUM = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

async function loadRent(regionName: string): Promise<LiveToolContext["rent"]> {
  /* 예전엔 여기서 직접 RPC 를 불렀다 — 워크벤치를 열 때마다 758,872행짜리
     전월세 집계를 **전 지역** 돌린 뒤 그중 한 지역만 골라 썼다(평균 5.5초).
     같은 값을 쓰는 세 화면이 공유 캐시 한 벌을 보게 바꿨다. */
  let data: Array<Record<string, unknown>>;
  try {
    data = await getRegionRentYieldRows();
  } catch {
    return null;
  }
  const row = data.find(
    (r) => String(r.region_name ?? "").trim() === regionName,
  );
  if (!row) return null;
  const jeonse = NUM(row.jeonse_count) ?? 0;
  const wolse = NUM(row.wolse_count) ?? 0;
  const total = jeonse + wolse;
  return {
    jeonseCount: jeonse,
    wolseCount: wolse,
    wolseSharePct: total > 0 ? Math.round((wolse / total) * 100) : null,
    medianMonthlyKrw: NUM(row.wolse_median_monthly_krw),
    months: 3,
    /* [1008 · 리뷰 A-27] 기준은 조회일이 아니라 계약 달 창(요약 RPC: 이번 달 포함 최근 3개월 계약) */
    source: "국토교통부 전월세 신고(최근 3개월 계약)",
    asOf: nowYm(new Date()),
    sample: total,
    href: "/map?layer=rent-share",
  };
}

/* [1008 · W] 뉴스 적합성 — 캡처(공작아파트·안양 동안구)에 "서울 아파트값 84주 연속 상승…"·"삼성전자 5억
   사내대출…" 이 붙었다. 원인: 지역 뉴스를 `ai_summary ilike '%안양 동안구%'` 로 찾았고, 그 두 기사는 요약
   400~500자 뒤 지역 목록에 "안양 동안구" 가 한 번 나올 뿐이었다(실측 position 478·272). 이제
   · 지역 뉴스 = **제목**에 그 지역 낱말(동안구·평촌·안양 …)이 있는 기사
   · 단지 뉴스 = 제목 또는 요약 앞 160자에 단지명 — 두 글자 이름(은마·공작)이면 지역 낱말도 함께
   맞는 게 없으면 null 이고 화면은 그 칸을 숨긴다. 규칙은 lib/ai/region-parts.ts(단위테스트). */
const NEWS_CANDIDATES = 12;

async function loadNews(
  regionName: string,
  complexName: string | null,
  opts: { fallbackToRegion?: boolean } = {},
): Promise<LiveToolContext["news"]> {
  const fallbackToRegion = opts.fallbackToRegion ?? true;
  const sb = getServiceSupabase();
  if (!sb) return null;
  const regionTokens = regionNewsTokens(regionName);
  let picked: Array<{ id: string; title: string; created_at: string }> = [];

  if (complexName) {
    const token = complexNewsToken(complexName);
    const safe = token ? safeIlikeToken(token) : "";
    if (safe.length >= 2) {
      const { data, error } = await sb
        .from("board_posts")
        .select("id,title,ai_summary,created_at")
        .eq("is_automated", true)
        .or(`title.ilike.%${safe}%,ai_summary.ilike.%${safe}%`)
        .order("created_at", { ascending: false })
        .limit(NEWS_CANDIDATES);
      if (error) throw new Error(`board_posts(단지 뉴스 ${safe}) 조회 실패: ${error.message}`);
      const district = regionParts(regionName)?.district ?? null;
      const hints = district ? [...regionTokens, district] : regionTokens;
      picked = ((data ?? []) as Array<{ id: string; title: string; ai_summary: string | null; created_at: string }>)
        .filter((r) => isComplexNews({ title: String(r.title ?? ""), summary: r.ai_summary }, safe, hints))
        .slice(0, 3);
    }
    if (picked.length === 0) {
      // 단지 매칭 실패 → 지역으로 폴백 (948: 단지 캐시 채우기에서는 끈다)
      return fallbackToRegion ? loadNews(regionName, null) : null;
    }
  } else {
    const tokens = regionTokens.map(safeIlikeToken).filter((t) => t.length >= 2);
    if (tokens.length === 0) return null;
    const { data, error } = await sb
      .from("board_posts")
      .select("id,title,created_at")
      .eq("is_automated", true)
      .or(tokens.map((t) => `title.ilike.%${t}%`).join(","))
      .order("created_at", { ascending: false })
      .limit(NEWS_CANDIDATES);
    if (error) throw new Error(`board_posts(지역 뉴스 ${regionName}) 조회 실패: ${error.message}`);
    picked = ((data ?? []) as Array<{ id: string; title: string; created_at: string }>)
      .filter((r) => isRegionNews({ title: String(r.title ?? ""), summary: null }, tokens))
      .slice(0, 3);
  }
  if (picked.length === 0) return null;
  return {
    items: picked.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      at: String(r.created_at),
    })),
    source: complexName ? "내집나우가 모은 부동산 뉴스(이 단지)" : "내집나우가 모은 부동산 뉴스(이 지역)",
    asOf: String(picked[0].created_at ?? "").slice(0, 10) || null,
    sample: picked.length,
    href: "/town/news",
  };
}

async function loadNotes(
  regionName: string,
  complexName: string | null,
  opts: { fallbackToRegion?: boolean } = {},
): Promise<LiveToolContext["notes"]> {
  const fallbackToRegion = opts.fallbackToRegion ?? true;
  const sb = getServiceSupabase();
  if (!sb) return null;
  /* [1008 · W] 예전엔 `scores` 열을 골랐는데 inspection_notes 에 그런 열이 없다(점수는 score_location…
     score_future 다섯 열) — PostgREST 42703 오류로 이 축이 **늘 null** 이었다(운영 DB 열 목록 실측).
     [1008 · 리뷰 A-1] 공개 노트 30건이 전부 운영진(Lab) 예시 글이라 author_label 로 거른다 —
     사람 글만 "이웃 임장노트·이웃 평가"다(lib/ai/neighbor-notes.ts). 거르고 남을 몫까지 넉넉히 읽는다. */
  let q = sb
    .from("inspection_notes")
    .select("id,title,author_label,score_location,score_school,score_transport,score_facility,score_future,created_at")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(40);
  if (complexName) q = q.eq("apt_name", complexName);
  else {
    /* [1008 · W] 노트의 region 은 "서울 성북구 장위동"·"경기 수원시 권선구" 처럼 적힌다 — 실거래 지역명
       ("서울 성북구"·"수원 권선구")과 같지 않아 정확 일치로는 거의 안 걸렸다. 구·시 낱말로 건다. */
    const p = regionParts(regionName);
    if (!p) return null;
    if (p.city) {
      q = q.ilike("region", `%${safeIlikeToken(p.district)}%`).ilike("region", `%${safeIlikeToken(p.city)}%`);
    } else {
      const stem = p.district.replace(/(특별자치시|시|군)$/, "");
      q = q.ilike("region", `%${safeIlikeToken(stem.length >= 2 ? stem : p.district)}%`);
    }
  }
  const { data, error } = await q;
  if (error) throw new Error(`inspection_notes(${complexName ?? regionName}) 조회 실패: ${error.message}`);
  if (!Array.isArray(data)) return null;
  const summary = summarizeNeighborNotes(data as NoteRowLite[], complexName ? "complex" : "region");
  if (!summary) {
    /* 사람 글이 없으면(0건이거나 전부 Lab) 지역으로 물러선다 — 지역도 없으면 축 없음 */
    if (complexName && fallbackToRegion) return loadNotes(regionName, null);
    return null;
  }
  return summary;
}

async function loadMacro(): Promise<LiveToolContext["macro"]> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("public_data_cache")
    .select("payload,fetched_at")
    .eq("cache_key", "ecos:base-rate")
    .maybeSingle();
  if (error || !data) return null;
  const payload = (data as { payload?: { value?: string } }).payload;
  const rate = NUM(payload?.value ?? null);
  if (rate === null) return null;
  return {
    baseRatePct: rate,
    source: "한국은행 ECOS 기준금리",
    asOf: String((data as { fetched_at?: string }).fetched_at ?? "").slice(0, 10) || null,
    sample: null,
    href: "/analysis/ai/ai-economy",
  };
}

async function loadPoi(regionName: string): Promise<LiveToolContext["poi"]> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  /* [1008 · W] 입주물량과 같은 함정 — 통째 이름("서울 강남구")은 주소("서울특별시 강남구 …")에 안 걸린다.
     구 이름 + 시 이름으로 나눠 건다(지금은 0행 표 — 적재되는 날 바로 맞게). */
  const q = supplyQueryFor(regionName);
  if (!q) return null;
  let query = sb
    .from("poi_schools")
    .select("*", { count: "exact", head: true })
    .ilike("address", `%${safeIlikeToken(q.area)}%`);
  if (q.city) query = query.ilike("address", `%${safeIlikeToken(q.city)}%`);
  const { count, error } = await query;
  if (error || typeof count !== "number" || count === 0) return null;
  return {
    schoolCount: count,
    source: "전국 학교 표준데이터",
    asOf: null,
    sample: count,
    href: "/map",
  };
}

/* ── [948 · 최적화 2차] 축을 "지역 단위"와 "단지 단위"로 갈라서 캐시한다 ──────
   실측(2026-09-02, pg_stat_statements 11.5시간 델타): 단지 허브 렌더 약 3,000회에
   apartment_supply ILIKE 6,035회·board_posts ILIKE 4,408회·region_rent_yield_summary
   RPC 2,959회·apartment_complexes 2,995회 — 즉 **단지마다 9개 축을 전부 다시 읽었다**.
   원인은 둘이다.
   (1) 캐시 키가 단지 id 라 크롤러가 훑는 롱테일(2.6만 단지)에서는 사실상 항상 미스.
   (2) 캐시 채우기 안에서 부른 안쪽 unstable_cache(rent-yield)가 저장되지 않아
       "전역 1벌" 이어야 할 RPC 가 렌더마다 돌았다(13회 렌더 → 13회 호출로 확인).
   그래서 지역 축(시세 스냅샷·인구·전월세·입주·지역 뉴스·거시·학교)은 **지역명
   키**(전국 218개)로 따로 캐시하고, 단지 축(대표가·단지 뉴스·단지 노트)만 단지 키로
   캐시한다. 두 캐시 모두 최상위에서 부른다(중첩 금지 — 위 (2) 의 이유).
   조립 결과(LiveToolContext) 모양은 그대로다 — 부르는 쪽은 바뀌지 않는다. */

type RegionAxes = {
  snapshot: Awaited<ReturnType<typeof getRegionSnapshot>>;
  demographics: Awaited<ReturnType<typeof getRegionDemographics>>;
  rent: LiveToolContext["rent"];
  supply: Awaited<ReturnType<typeof getSupplyForAreaStrict>>;
  /** [1008] 입주물량을 찾은 지역 이름(구·시) */
  supplyArea?: string | null;
  /** [1008] 한국부동산원 월간 지수 흐름 */
  trend?: RegionTrend | null;
  news: LiveToolContext["news"];
  notes: LiveToolContext["notes"];
  macro: LiveToolContext["macro"];
  poi: LiveToolContext["poi"];
  /** [1008 · 리뷰 A-9] 조회가 **실패한** 축 — "없음"과 구분해 화면이 "지금 불러오지 못했어요"라고 말한다 */
  failed?: string[];
};

/**
 * [1008 · 리뷰 A-9] 조회 실패를 데이터 캐시에 굳히지 않는 장치 — unstable_cache 는 **던지면 저장하지 않는다.**
 * 핵심 축(매매 행·지역 흐름)이 실패하면 조립한 부분값을 실어 던지고, 캐시 바깥(unwrapPartial)에서 그 부분값으로
 * 이번 요청만 그린다. 예전엔 실패가 null 로 6시간 저장돼 화면이 그동안 "거래 없음"이라고 말했다.
 */
class PartialAxesError<T> extends Error {
  constructor(
    message: string,
    readonly partial: T,
  ) {
    super(message);
    this.name = "PartialAxesError";
  }
}
function unwrapPartial<T>(e: unknown): T {
  if (e && typeof e === "object" && "partial" in e && (e as { name?: string }).name === "PartialAxesError") {
    return (e as PartialAxesError<T>).partial;
  }
  throw e;
}

/* [1008 · W] 지역 가격 흐름 — REB 월간 매매지수·전세가율·거래량을 **한 번의 질의**로(인덱스
   idx_mrs_region: region_id, property_type, metric, period_type, period). 15개월치 ≈ 40행.
   지역 축 캐시(지역명 키 6시간) 안에서만 부른다 — 단지마다 다시 읽지 않는다. */
async function loadRegionTrend(regionId: string): Promise<RegionTrend | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 16);
  const sinceDay = `${since.getUTCFullYear()}-${String(since.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const { data, error } = await sb
    .from("market_region_series")
    .select("metric,period,value")
    .eq("region_id", regionId)
    .eq("property_type", "apt")
    .eq("source", "reb")
    .eq("period_type", "monthly")
    .in("metric", ["sale_index", "jeonse_ratio", "trade_count"])
    .gte("period", sinceDay)
    .order("period", { ascending: true })
    .limit(80);
  if (error) throw new Error(`market_region_series(${regionId} 월간 흐름) 조회 실패: ${error.message}`);
  const rows = (data ?? []) as Array<{ metric: string; period: string; value: number | string }>;
  const pick = (metric: string): SeriesPoint[] =>
    rows.filter((r) => r.metric === metric).map((r) => ({ period: String(r.period), value: Number(r.value) }));
  return buildRegionTrend({
    saleIndex: pick("sale_index"),
    jeonseRatio: pick("jeonse_ratio"),
    tradeCount: pick("trade_count"),
  });
}

type ComplexAxes = {
  /** [1008 · W] 매매 실거래 행 — 대표가(평형)와 결과 그래프가 같은 행을 쓴다(lib/ai/result-series.ts) */
  trades: ComplexTrades | null;
  news: LiveToolContext["news"];
  notes: LiveToolContext["notes"];
  /** [1008 · 리뷰 A-9] 조회가 실패한 축 */
  failed?: string[];
};

const settledVal = <T,>(r: PromiseSettledResult<T>, label: string): T | null => {
  if (r.status === "fulfilled") return r.value;
  /* [1007] 축 하나가 막히면 렌더마다 같은 줄 — 축(label)별 1분 1건 + 생략 건수 */
  logger.warnSampled(`live-axis:${label}`, `[live-context] ${label} 축 조회 실패`, r.reason);
  return null;
};

async function loadRegionAxes(regionName: string): Promise<RegionAxes> {
  const regionId = regionName ? regionIdForName(regionName) : null;
  /* [1008 · W] 입주물량은 시/도·구로 쪼개 찾는다 — 통째 이름("서울 강남구")으로는 주소
     ("서울특별시 강남구 …")에 한 건도 안 걸렸다(전국 0건 실측). 규칙은 lib/ai/region-parts.ts. */
  const supplyQ = regionName ? supplyQueryFor(regionName) : null;
  const [snapR, demoR, rentR, supplyR, newsR, notesR, macroR, poiR, trendR] =
    await Promise.allSettled([
      regionId ? getRegionSnapshot(regionId) : Promise.resolve(null),
      regionId ? getRegionDemographics(regionId) : Promise.resolve(null),
      regionName ? loadRent(regionName) : Promise.resolve(null),
      /* [1008 · 리뷰 A-2] 이번 달(한국 시간) 이후 입주분만 넉넉히 — 하한 없이 오름차순 24행이면 지난 입주분이
         자리를 차지해 앞으로 입주가 과소 집계됐다(양주 23,474 → 10,797세대) */
      supplyQ ? getSupplyForAreaStrict(supplyQ.area, 200, undefined, supplyQ.city, nowYm(new Date())) : Promise.resolve([]),
      regionName ? loadNews(regionName, null) : Promise.resolve(null),
      regionName ? loadNotes(regionName, null) : Promise.resolve(null),
      loadMacro(),
      regionName ? loadPoi(regionName) : Promise.resolve(null),
      regionId ? loadRegionTrend(regionId) : Promise.resolve(null),
    ]);
  const axes: RegionAxes = {
    snapshot: settledVal(snapR, "지역 시세"),
    demographics: settledVal(demoR, "인구·미분양"),
    rent: settledVal(rentR, "전월세"),
    supply: settledVal(supplyR, "입주 물량") ?? [],
    supplyArea: supplyQ ? regionName : null,
    trend: settledVal(trendR, "지역 흐름"),
    news: settledVal(newsR, "지역 뉴스"),
    notes: settledVal(notesR, "지역 노트"),
    macro: settledVal(macroR, "거시"),
    poi: settledVal(poiR, "학교"),
    ...(trendR.status === "rejected" ? { failed: ["지역 가격 흐름"] } : {}),
  };
  /* 축이 **하나도** 없으면 던진다 — 로더들은 실패를 null 로 삼키므로, 전부 null 은
     "이 지역엔 정말 아무 것도 없다"가 아니라 DB 가 잡혀 있던 순간일 가능성이
     높다(거시 축은 지역과 무관하게 항상 있다). 던지면 데이터 캐시에 빈 지역이
     6시간 동안 굳지 않는다 — 부르는 쪽(ComplexAxisSummary 등)은 catch 로 접는다. */
  const blank =
    !axes.snapshot && !axes.demographics && !axes.rent && axes.supply.length === 0 &&
    !axes.news && !axes.notes && !axes.macro && !axes.poi && !axes.trend;
  if (blank) throw new Error(`[live-context] ${regionName} 지역 축 전부 없음 — 캐시하지 않음`);
  /* [1008 · 리뷰 A-9] 지역 흐름 조회 실패는 캐시에 굳히지 않는다 — 부분값은 이번 요청만 */
  if (axes.failed?.length) throw new PartialAxesError(`[live-context] ${regionName} 지역 흐름 조회 실패 — 캐시하지 않음`, axes);
  return axes;
}

/* 단지 축 — loadNews/loadNotes 는 단지 매칭이 0건이면 지역으로 스스로 물러선다.
   여기서는 그 폴백을 **끄고**(단지 결과만 저장) 조립 단계에서 지역 캐시의 값으로
   대신한다 — 그래야 폴백 조회가 단지마다 반복되지 않는다. */
async function loadComplexAxes(
  complexId: string,
  regionName: string,
  complexName: string,
): Promise<ComplexAxes> {
  const [tradesR, newsR, notesR] = await Promise.allSettled([
    loadComplexTrades(regionName, complexName),
    loadNews(regionName, complexName, { fallbackToRegion: false }),
    loadNotes(regionName, complexName, { fallbackToRegion: false }),
  ]);
  const axes: ComplexAxes = {
    trades: settledVal(tradesR, "실거래가"),
    news: settledVal(newsR, "단지 뉴스"),
    notes: settledVal(notesR, "단지 노트"),
    ...(tradesR.status === "rejected" ? { failed: ["실거래가"] } : {}),
  };
  /* [1008 · 리뷰 A-9] 매매 행 조회 실패는 캐시에 굳히지 않는다(6시간 "거래 없음"이 되던 것) */
  if (axes.failed?.length) throw new PartialAxesError(`[live-context] ${complexName} 매매 조회 실패 — 캐시하지 않음`, axes);
  return axes;
}

/* 지역 키 캐시 — 전국 218개 지역명 × 6시간. market·supply·economy 태그는 수집
   크론이 끝나는 즉시 비운다(lib/cache/invalidate.ts). */
/* [1008] v2 — 모양이 바뀌었다(trend·supplyArea) · 입주물량·뉴스 규칙 수정: 옛 빈 값이 6시간 남지 않게 키를 올린다 */
/* [1008 · 리뷰 A] v3 — 입주 예정 하한(이번 달 이후)·Lab 노트 제외·실패 비저장: 옛 값이 6시간 남지 않게 */
  /* [1010] TTL 은 라우트 revalidate 의 뚜껑이다 — Next 는 세그먼트 값과 이 값 중 작은 쪽을 쓴다.
     실측으로 확인됨(.next/prerender-manifest.json): /town/news 는 revalidate 21600 인데 매니페스트가
     3600 이었다(= 그 페이지가 읽는 데이터 캐시 값). 그래서 이 값이 낮으면 라우트 TTL 을 올려도
     아무 효과가 없다. 태그로 비워지는 캐시는 TTL 을 길게 잡아도 신선도 손해가 없다 —
     태그 무효화는 "다음 렌더에서 다시 읽어라"일 뿐 재렌더를 강제하지 않기 때문이다. */
const loadRegionAxesCached = unstable_cache(loadRegionAxes, ["live-region-axes-v3"], {
  revalidate: 604_800,
  tags: ["market", "supply", "news", "economy"],
});

/* 단지 키 캐시 — AI 워크벤치(/api/ai/context·/api/ai/analysis)가 같은 단지를 몇 분 안에
   여러 번 묻는 자리에서만 값이 있다(선택 → 실행 → 재실행). 단지 허브 렌더는 이 캐시를
   쓰지 않는다 — buildLiveToolContextCached 의 complexDurable 주석 참고 [1007]. */
/* [1008] v2 — 단지 뉴스 적합성 규칙 수정(옛 결과가 6시간 남지 않게)
   [1008 · W] v3 — 대표가 대신 매매 행(최대 600행, 평형 단위 계산 재료)을 담는다: 모양이 바뀌었다 */
/* [1008 · 리뷰 A] v4 — Lab 노트 제외·매매 조회 실패 비저장·같은 날 거래 정렬 확정 */
const loadComplexAxesCached = unstable_cache(loadComplexAxes, ["live-complex-axes-v4"], {
  revalidate: 604_800,
  tags: ["market", "news"],
});

/* [1007] 요청 안 중복만 막는 판 — 같은 렌더에서 prefetch 와 섹션이 같은 인자로 두 번 불러도
   조회는 한 번. TTL 저장이 없으니 ISR Writes 도 없다. */
const loadComplexAxesPerRequest = cache(loadComplexAxes);

/* [1008 · W] 지역 시세 출처 라벨 — 스냅샷 행의 출처(reb·kb·crawl)대로 말한다 */
function snapshotSourceLabel(source: string | null | undefined, patched: boolean): string {
  if (patched) return "한국부동산원 월간 아파트 지수";
  if (source === "reb") return "한국부동산원 지역 시세";
  if (source === "kb") return "KB 지역 시세";
  return "지역 시세 통계";
}

function assembleContext(params: {
  complexId: string | null;
  decoded: { region: string; name: string } | null;
  regionName: string;
  regionAxes: RegionAxes | null;
  complexAxes: ComplexAxes | null;
}): LiveToolContext {
  const { complexId, decoded, regionName, regionAxes, complexAxes } = params;
  const regionId = regionName ? regionIdForName(regionName) : null;
  /* [1008 · W] 최근 실거래가 = 가장 많이 거래된 평형의 최근 6건 평균(평형으로 못 채우면 면적대) */
  const price = resolveUnitPrice(complexAxes?.trades?.rows);
  const rawSnap = regionAxes?.snapshot ?? null;
  const trend = regionAxes?.trend ?? null;
  /* [1008 · W] 빈 칸만 같은 출처(REB) 월간 시계열로 채우고 반올림한다(서울 25개 구 스냅샷이
     period='' · 값 null 이라 은마·헬리오시티가 "가격 흐름 자료 없음" 이던 것). lib/ai/region-trend.ts */
  const snapBase = rawSnap
    ? {
        avgSale: rawSnap.avgSale ?? null,
        jeonseRatio: rawSnap.jeonseRatio ?? null,
        saleChangeMonthly: rawSnap.saleChangeMonthly ?? null,
        tradeCount: rawSnap.tradeCount ?? null,
        period: rawSnap.period ?? "",
      }
    : null;
  const snap = patchSnapshot(snapBase, trend) as
    | (NonNullable<typeof snapBase> & { patched?: boolean })
    | null;
  const snapHasValue =
    snap != null && (snap.avgSale != null || snap.jeonseRatio != null || snap.saleChangeMonthly != null || snap.tradeCount != null);
  const demo = regionAxes?.demographics ?? null;
  const supplyItems = regionAxes?.supply ?? [];

  /* [1008 · 리뷰 A-25] "앞으로 입주"의 이번 달은 한국 시간 기준(UTC 로 자르면 매달 1일 0~9시에 한 달 어긋난다) */
  const thisYm = nowYm(new Date());
  const upcoming = supplyItems.filter((s) => s.moveInYm >= thisYm);
  const upcomingYms = upcoming.map((i) => i.moveInYm).filter(Boolean).sort();
  /* [1008 · 리뷰 A-4] 최근 6개월 거래 — 대표가와 같은 행·같은 평형 규칙(시계열 계산의 부산물) */
  const trades = complexAxes?.trades ?? null;
  const recent6 =
    trades && price
      ? (buildComplexTradeSeries(trades.rows, {
          unitM2: price.unitM2,
          bandSlug: price.bandSlug,
          now: new Date(),
          capped: trades.capped,
        })?.recent6 ?? null)
      : trades
        ? (buildComplexTradeSeries(trades.rows, { now: new Date(), capped: trades.capped })?.recent6 ?? null)
        : null;
  const unavailable = [...(complexAxes?.failed ?? []), ...(regionAxes?.failed ?? [])];
  const period = (v: string | null | undefined) => (v && v.trim() ? v : null);
  const fieldAsOf = snap
    ? {
        change: rawSnap?.saleChangeMonthly != null ? period(rawSnap.period) : trend?.momPct != null ? trend.asOf : null,
        jeonse: rawSnap?.jeonseRatio != null ? period(rawSnap.period) : trend?.jeonseRatio != null ? trend.jeonseAsOf : null,
        trade: rawSnap?.tradeCount != null ? period(rawSnap.period) : trend?.tradeCount != null ? trend.tradeAsOf : null,
      }
    : null;

  return {
    generatedAt: new Date().toISOString(),
    ...(unavailable.length ? { unavailable } : {}),
    complex:
      decoded && complexId
        ? {
            id: complexId,
            name: decoded.name,
            region: decoded.region,
            price: price
              ? {
                  priceKrw: price.priceKrw,
                  bandLabel: price.label,
                  bandSlug: price.bandSlug,
                  unitM2: price.unitM2,
                  basis: price.basis,
                  latestYm: price.latestYm,
                  source:
                    price.basis === "unit"
                      ? "국토교통부 실거래 신고 · 가장 많이 거래된 평형의 최근 거래 평균"
                      : "국토교통부 실거래 신고 · 가장 많이 거래된 면적대의 최근 거래 평균",
                  asOf: price.latestYm,
                  sample: price.sampleSize,
                  href: `/complex/${encodeURIComponent(complexId)}`,
                }
              : null,
            recent6,
          }
        : null,
    region: regionName
      ? {
          id: regionId,
          name: regionName,
          snapshot:
            snap && snapHasValue
              ? {
                  avgSale: snap.avgSale ?? null,
                  jeonseRatio: snap.jeonseRatio ?? null,
                  saleChangeMonthly: snap.saleChangeMonthly ?? null,
                  tradeCount: snap.tradeCount ?? null,
                  period: snap.period,
                  ...(snap.patched ? { patched: true } : {}),
                  ...(fieldAsOf ? { fieldAsOf } : {}),
                  source: snapshotSourceLabel(rawSnap?.source, Boolean(snap.patched) && !rawSnap?.period),
                  asOf: snap.period || null,
                  sample: snap.tradeCount ?? null,
                  href: regionId ? `/region/${regionId}` : null,
                }
              : null,
          trend,
          demographics: demo
            ? {
                population: demo.population ?? null,
                households: demo.households ?? null,
                unsoldUnits: demo.unsoldUnits ?? null,
                period: demo.period,
                source: "통계청 KOSIS 인구·미분양",
                asOf: demo.period,
                sample: null,
                href: regionId ? `/region/${regionId}` : null,
              }
            : null,
        }
      : null,
    rent: regionAxes?.rent ?? null,
    supply:
      upcoming.length > 0
        ? {
            upcomingHouseholds: upcoming.reduce((s, i) => s + (i.households ?? 0), 0),
            upcomingComplexes: upcoming.length,
            items: upcoming.slice(0, 3).map((i) => ({
              aptName: i.aptName,
              moveInYm: i.moveInYm,
              households: i.households,
            })),
            area: regionAxes?.supplyArea ?? regionName ?? null,
            firstYm: upcomingYms[0] ?? null,
            lastYm: upcomingYms[upcomingYms.length - 1] ?? null,
            source: "청약홈 분양 공고의 입주 예정 월",
            asOf: new Date().toISOString().slice(0, 10),
            sample: upcoming.length,
            href: "/apply/calendar",
          }
        : null,
    /* 단지 매칭이 있으면 단지 값, 없으면 지역 값 — 예전 loadNews/loadNotes 의
       "단지 0건 → 지역 폴백"과 같은 결과다. */
    news: complexAxes?.news ?? regionAxes?.news ?? null,
    notes: complexAxes?.notes ?? regionAxes?.notes ?? null,
    macro: regionAxes?.macro ?? null,
    poi: regionAxes?.poi ?? null,
  };
}

function resolveTarget(params: { complexId?: string | null; regionName?: string | null }) {
  const complexId = params.complexId ?? null;
  const decoded = complexId ? decodeComplexId(complexId) : null;
  const regionName = (decoded?.region ?? params.regionName ?? "").trim();
  return { complexId, decoded, regionName };
}

/**
 * 단지 또는 지역 기준의 라이브 컨텍스트 조립 — **캐시 없이** 실조회.
 * complexId 는 encodeComplexId(region, name) 형식 — 해석 실패 시 지역 축만 조립한다.
 * (AI 초안 생성처럼 "지금 값"이 필요한 곳이 쓴다. 화면은 아래 Cached 를 쓴다.)
 */
export async function buildLiveToolContext(params: {
  complexId?: string | null;
  regionName?: string | null;
}): Promise<LiveToolContext> {
  const { complexId, decoded, regionName } = resolveTarget(params);
  const [regionAxes, complexAxes] = await Promise.all([
    /* 캐시가 없는 경로에서는 "축 전부 없음" 예외를 삼켜 예전처럼 빈 컨텍스트를
       돌려준다 — 이 예외는 오직 캐시에 빈 값을 남기지 않기 위한 것이다. */
    regionName
      ? loadRegionAxes(regionName).catch((e): RegionAxes | null => {
          try {
            return unwrapPartial<RegionAxes>(e);
          } catch {
            logger.warn("[live-context] 지역 축 조립 실패", e);
            return null;
          }
        })
      : Promise.resolve(null),
    complexId && decoded
      ? loadComplexAxes(complexId, regionName, decoded.name).catch((e) => unwrapPartial<ComplexAxes>(e))
      : Promise.resolve(null),
  ]);
  return assembleContext({ complexId, decoded, regionName, regionAxes, complexAxes });
}

/* ── [AI-01] 근거 각주 — 컨텍스트에서 각주 표를 뽑는다 ───────────────── */

export interface Footnote {
  n: number;
  label: string;
  source: string;
  asOf: string | null;
  sample: number | null;
  href: string | null;
}

export function contextFootnotes(ctx: LiveToolContext): Footnote[] {
  const rows: Omit<Footnote, "n">[] = [];
  const push = (label: string, m: AxisMeta | null | undefined) => {
    if (!m) return;
    rows.push({
      label,
      source: m.source,
      asOf: m.asOf,
      sample: m.sample ?? null,
      href: m.href ?? null,
    });
  };
  /* [1008 · W] 라벨을 쉬운 말로 — "근거 각주"는 이제 화면에서 "데이터 출처"다(내부 용어 정리) */
  push("실거래가", ctx.complex?.price);
  push("지역 시세", ctx.region?.snapshot);
  const trend = ctx.region?.trend ?? null;
  if (trend?.asOf && trend.index.length >= 2) {
    push("지역 가격 흐름", {
      source: "한국부동산원 월간 아파트 매매지수",
      asOf: trend.asOf,
      sample: null,
      href: ctx.region?.id ? `/region/${ctx.region.id}` : null,
    });
  }
  push("전월세 신고", ctx.rent);
  push("입주 예정", ctx.supply);
  push("관련 뉴스", ctx.news);
  push("이웃 임장노트", ctx.notes);
  push("인구·미분양", ctx.region?.demographics);
  push("기준금리", ctx.macro);
  push("학교", ctx.poi);
  return rows.map((r, i) => ({ n: i + 1, ...r }));
}

/* ── [AI-17] 신선도 — asOf(yyyymm 또는 ISO) → 경과 일수 ─────────────── */

export function axisAgeDays(asOf: string | null, now = new Date()): number | null {
  if (!asOf) return null;
  let d: Date | null = null;
  if (/^\d{6}$/.test(asOf)) {
    d = new Date(Number(asOf.slice(0, 4)), Number(asOf.slice(4, 6)) - 1, 15);
  } else {
    const t = Date.parse(asOf);
    d = Number.isNaN(t) ? null : new Date(t);
  }
  if (!d) return null;
  return Math.max(0, Math.round((now.getTime() - d.getTime()) / 86_400_000));
}

/* [OPT-23 → 948] 컨텍스트 캐시 — 예전엔 조립 전체를 단지 id 키 하나로 캐시했다.
   그 판단과 실측 기록은 위 "[948 · 최적화 2차]" 주석에 있다. 이제 지역 캐시와
   단지 캐시를 **여기 최상위에서** 나란히 부른다(중첩하면 안쪽 캐시가 저장되지 않는다).
   generatedAt 은 조립 시각이지만 축마다 asOf 가 따로 실리므로 "언제 데이터인지"는
   여전히 각주(ageDays)가 정직하게 말한다. */
export async function buildLiveToolContextCached(
  complexId: string | null,
  regionName: string | null,
  opts?: {
    /**
     * [1007] 단지 축을 데이터 캐시(6시간, 단지 id 키)에 저장할지. 기본 true(워크벤치 API).
     * 단지 허브 렌더(app/complex/[id]/section-loaders.ts)는 false — 그 페이지는 ISR 6시간이라
     * 다시 렌더되는 순간엔 이 캐시도 같이 만료돼 있어(같은 TTL) 항목이 **쓰이기만 하고
     * 읽히지 않았다**: 하루 8,907 렌더 = 8,907 ISR Write, 읽기 0. 요청 안 중복만 막는다.
     */
    complexDurable?: boolean;
  },
): Promise<LiveToolContext> {
  const parts = await loadCachedParts(complexId, regionName, opts?.complexDurable ?? true);
  return assembleContext(parts);
}

async function loadCachedParts(complexId: string | null, regionName: string | null, complexDurable: boolean) {
  const target = resolveTarget({ complexId, regionName });
  const loadComplex = complexDurable ? loadComplexAxesCached : loadComplexAxesPerRequest;
  const [regionAxes, complexAxes] = await Promise.all([
    /* 지역 축 전부 없음(DB 포화 순간)은 캐시에 남지 않고 여기서 null 로 접힌다 —
       화면은 예전처럼 축 없는 컨텍스트를 받는다(부르는 쪽은 바뀌지 않는다). */
    target.regionName
      ? loadRegionAxesCached(target.regionName).catch((e): RegionAxes | null => {
          /* [1008 · 리뷰 A-9] 흐름 조회만 실패한 부분값 — 캐시엔 없고 이번 요청만 그린다 */
          try {
            return unwrapPartial<RegionAxes>(e);
          } catch {
            logger.warnSampled("live-region-axes", "[live-context] 지역 축 캐시 조립 실패", e);
            return null;
          }
        })
      : Promise.resolve(null),
    target.complexId && target.decoded
      ? loadComplex(target.complexId, target.regionName, target.decoded.name).catch((e) => unwrapPartial<ComplexAxes>(e))
      : Promise.resolve(null),
  ]);
  return { ...target, regionAxes, complexAxes };
}

/**
 * [1008 · W] 워크벤치 API 용 — 컨텍스트와 **같은 캐시 항목의** 매매 행을 함께 돌려준다.
 * 결과 그래프(/api/ai/context?series=1)와 "최근 6개월 거래" 칸(/api/ai/analysis)이 대표가와 같은 행에서
 * 나온다 — 조회를 더 하지 않는다(단지 축 캐시 live-complex-axes-v3 하나).
 */
export async function buildLiveToolContextWithTrades(
  complexId: string | null,
  regionName: string | null,
): Promise<{ ctx: LiveToolContext; trades: ComplexTrades | null }> {
  const parts = await loadCachedParts(complexId, regionName, true);
  return { ctx: assembleContext(parts), trades: parts.complexAxes?.trades ?? null };
}
