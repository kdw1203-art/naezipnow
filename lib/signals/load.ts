import "server-only";

/**
 * [1048 · 다요인 분석] 사실 모으기 — 단지 화면 · 임장노트 · AI 분석이 함께 쓰는 읽기 층.
 *
 * 무엇을 어디서 읽나(모두 이미 적재되는 표 — 새 외부 호출 없음)
 *  · 심리   — market_region_series 매수우위(주간, 지역 → 시도) · public_data_cache ecos:housing-csi(주택가격전망 CSI)
 *  · 뉴스   — board_posts 자동 수집 기사 중 제목에 지역 낱말이 있는 최근 60일(우리 자동 글 제외)
 *  · 관심도 — 같은 기사의 30일/직전 30일 수 · page_view_events(단지 화면 조회 표본) · user_watchlist(관심 등록)
 *  · 거래량 — market_region_monthly(국토부 신고 집계)
 *  · 1년 추이 · 단기 추세 — 라이브 컨텍스트의 REB 월간 흐름 + market_region_series 주간 매매지수
 *  · 매물·공급 — 라이브 컨텍스트의 입주 예정 · KOSIS 세대수 + 기사 제목의 매물 단서
 *  · 금리   — ecos:key-stats(예금은행 대출금리) · ecos:base-rate · 금리수준전망 CSI
 *
 * 캐시: 지역 묶음은 지역 이름 키(전국 약 250키 · 6시간 · market/news/economy 태그), 한국은행 묶음과
 * 관심 지도는 전역 한 벌. 조회 실패는 캐시에 굳히지 않는다(던지면 unstable_cache 가 저장하지 않는다 —
 * 부분값은 이번 요청에만 쓴다). 단지별 키는 만들지 않는다(재사용이 없다 · section-loaders [1007] 참고).
 */
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { getServiceSupabase } from "@/lib/supabase/service";
import { regionIdForName } from "@/lib/region/catalog";
import { transactionNameCandidates, getRegionSeries } from "@/lib/market/store";
import { isRegionNews, regionNewsTokens, safeIlikeToken } from "@/lib/ai/region-parts";
import { isOwnGeneratedPost } from "@/lib/signals/news-tone";
import { sidoForRegionName } from "@/lib/signals/regions";
import {
  annualTradesFrom,
  complexPriceChange,
  computeSignals,
  type FieldSignal,
  type SignalInputs,
  type SignalReport,
} from "@/lib/signals/engine";
import { buildLiveToolContextCached, type LiveToolContext } from "@/lib/ai/live-context";
import { complexHrefFromId } from "@/lib/seo/complex-slug";
import { logger } from "@/lib/log";

const NEWS_WINDOW_DAYS = 60;
const DAY_MS = 86_400_000;

type Failed = "failed";
type RegionSignalParts = {
  regionId: string | null;
  sido: { short: string; id: string; csiGroup: string } | null;
  buySuperiority: { value: number; asOf: string; area: string } | null | Failed;
  news: { title: string; at: string }[] | Failed;
  weekly: { period: string; value: number }[] | Failed;
  volume: { month: string; count: number }[] | Failed;
};

class PartialSignalsError extends Error {
  constructor(readonly partial: RegionSignalParts) {
    super("[signals] 지역 묶음 일부 조회 실패 — 캐시하지 않음");
    this.name = "PartialSignalsError";
  }
}

async function readBuySuperiority(
  regionId: string | null,
  regionName: string,
  sido: RegionSignalParts["sido"],
): Promise<RegionSignalParts["buySuperiority"]> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const ids = [regionId, sido?.id].filter((v): v is string => Boolean(v));
  if (ids.length === 0) return null;
  const { data, error } = await sb
    .from("market_region_series")
    .select("region_id,period,value")
    .in("region_id", ids)
    .eq("property_type", "apt")
    .eq("metric", "buy_superiority")
    .eq("period_type", "weekly")
    .order("period", { ascending: false })
    .limit(8);
  if (error) throw new Error(`market_region_series(매수우위 ${ids.join(",")}) 조회 실패: ${error.message}`);
  const rows = (data ?? []) as Array<{ region_id: string; period: string; value: number | string }>;
  /* 지역 자체 값이 있으면 그것(세종), 없으면 시도 */
  for (const id of ids) {
    const r = rows.find((x) => x.region_id === id && Number.isFinite(Number(x.value)));
    if (r) {
      return {
        value: Number(r.value),
        asOf: String(r.period).slice(0, 10),
        area: id === regionId ? regionName : `${sido?.short ?? ""} 전체`,
      };
    }
  }
  return null;
}

async function readRegionNews(regionName: string): Promise<{ title: string; at: string }[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const tokens = regionNewsTokens(regionName).map(safeIlikeToken).filter((t) => t.length >= 2);
  if (tokens.length === 0) return [];
  const since = new Date(Date.now() - NEWS_WINDOW_DAYS * DAY_MS).toISOString();
  const { data, error } = await sb
    .from("board_posts")
    .select("title,created_at,source_name")
    .eq("is_automated", true)
    .gte("created_at", since)
    .or(tokens.map((t) => `title.ilike.%${t}%`).join(","))
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) throw new Error(`board_posts(지역 기사 ${regionName}) 조회 실패: ${error.message}`);
  return ((data ?? []) as Array<{ title: string | null; created_at: string; source_name: string | null }>)
    .filter((r) => isRegionNews({ title: String(r.title ?? ""), summary: null }, tokens))
    .filter((r) => !isOwnGeneratedPost({ title: r.title, sourceName: r.source_name }))
    .map((r) => ({ title: String(r.title ?? ""), at: String(r.created_at) }));
}

async function readRegionVolume(regionId: string | null, regionName: string): Promise<{ month: string; count: number }[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const names = [...new Set([regionName, ...(regionId ? transactionNameCandidates(regionId, regionName) : [])])];
  const { data, error } = await sb
    .from("market_region_monthly")
    .select("month,transaction_count")
    .in("region_name", names)
    .eq("deal_type", "trade")
    .eq("property_type", "apartment")
    .order("month", { ascending: false })
    .limit(40);
  if (error) throw new Error(`market_region_monthly(${regionName}) 조회 실패: ${error.message}`);
  const byMonth = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ month: string; transaction_count: number | null }>) {
    const m = String(r.month ?? "");
    if (!/^\d{6}$/.test(m)) continue;
    byMonth.set(m, (byMonth.get(m) ?? 0) + Number(r.transaction_count ?? 0));
  }
  return [...byMonth.entries()].map(([month, count]) => ({ month, count })).sort((a, b) => a.month.localeCompare(b.month));
}

async function loadRegionSignalParts(regionName: string): Promise<RegionSignalParts> {
  const regionId = regionIdForName(regionName);
  const s = sidoForRegionName(regionName);
  const sido = s ? { short: s.short, id: s.id, csiGroup: s.csiGroup } : null;
  const [bsR, newsR, weeklyR, volR] = await Promise.allSettled([
    readBuySuperiority(regionId, regionName, sido),
    readRegionNews(regionName),
    regionId ? getRegionSeries(regionId, "sale_index", "weekly", 9) : Promise.resolve([]),
    readRegionVolume(regionId, regionName),
  ]);
  const val = <T,>(r: PromiseSettledResult<T>, label: string): T | Failed => {
    if (r.status === "fulfilled") return r.value;
    logger.warnSampled(`signals:${label}`, `[signals] ${label} 조회 실패`, r.reason);
    return "failed";
  };
  const parts: RegionSignalParts = {
    regionId,
    sido,
    buySuperiority: val(bsR, "매수우위"),
    news: val(newsR, "지역 기사"),
    weekly: val(weeklyR, "주간 지수"),
    volume: val(volR, "거래량"),
  };
  if ([parts.buySuperiority, parts.news, parts.weekly, parts.volume].includes("failed")) throw new PartialSignalsError(parts);
  return parts;
}

const loadRegionSignalPartsCached = unstable_cache(loadRegionSignalParts, ["signals-region-v1"], {
  revalidate: 21_600,
  tags: ["market", "news", "economy"],
});

const regionSignalParts = cache(async (regionName: string): Promise<RegionSignalParts> => {
  try {
    return await loadRegionSignalPartsCached(regionName);
  } catch (e) {
    if (e instanceof Error && e.name === "PartialSignalsError" && "partial" in e) return (e as PartialSignalsError).partial;
    /* 캐시 층 자체가 실패(직렬화 등) — 이번 요청만 직접 읽는다 */
    try {
      return await loadRegionSignalParts(regionName);
    } catch (inner) {
      if (inner instanceof Error && inner.name === "PartialSignalsError") return (inner as PartialSignalsError).partial;
      throw inner;
    }
  }
});

/* ── 한국은행 묶음(전역 한 벌) ─────────────────────────────────────── */

type EcosParts = {
  csi: Record<string, { ym: string; value: number }[]> | null;
  loanRate: { value: number; cycle: string } | null;
  baseRate: { value: number; cycle: string } | null;
};

async function loadEcosParts(): Promise<EcosParts> {
  const sb = getServiceSupabase();
  if (!sb) return { csi: null, loanRate: null, baseRate: null };
  const { data, error } = await sb
    .from("public_data_cache")
    .select("cache_key,payload")
    .in("cache_key", ["ecos:key-stats", "ecos:housing-csi", "ecos:base-rate"]);
  if (error) throw new Error(`public_data_cache(ecos) 조회 실패: ${error.message}`);
  const rows = (data ?? []) as Array<{ cache_key: string; payload: Record<string, unknown> | null }>;
  const get = (k: string) => rows.find((r) => r.cache_key === k)?.payload ?? null;
  const stats = (get("ecos:key-stats")?.stats ?? []) as Array<{ name?: string; value?: string; cycle?: string }>;
  const loan = stats.find((s) => String(s.name ?? "").includes("예금은행 대출금리"));
  const loanValue = loan ? Number(loan.value) : NaN;
  const base = get("ecos:base-rate") as { value?: string; cycle?: string } | null;
  const baseValue = base ? Number(base.value) : NaN;
  const series = (get("ecos:housing-csi")?.series ?? null) as EcosParts["csi"];
  return {
    csi: series && typeof series === "object" ? series : null,
    loanRate: Number.isFinite(loanValue) ? { value: loanValue, cycle: String(loan?.cycle ?? "") } : null,
    baseRate: Number.isFinite(baseValue) ? { value: baseValue, cycle: String(base?.cycle ?? "") } : null,
  };
}

const loadEcosPartsCached = unstable_cache(loadEcosParts, ["signals-ecos-v1"], { revalidate: 21_600, tags: ["economy"] });
const ecosParts = cache(async (): Promise<EcosParts | Failed> => {
  try {
    return await loadEcosPartsCached();
  } catch (e) {
    logger.warnSampled("signals:ecos", "[signals] 한국은행 묶음 조회 실패", e);
    return "failed";
  }
});

/* ── 내집나우 관심(전역 한 벌 · 1시간) ─────────────────────────────── */

type InterestMap = { views: Record<string, [number, number]>; watchers: Record<string, number> };

async function loadInterestMap(): Promise<InterestMap> {
  const sb = getServiceSupabase();
  if (!sb) return { views: {}, watchers: {} };
  const now = Date.now();
  const since = new Date(now - 60 * DAY_MS).toISOString();
  const [pv, wl] = await Promise.all([
    sb
      .from("page_view_events")
      .select("path,occurred_at")
      .eq("route", "/complex/[id]")
      .gte("occurred_at", since)
      .limit(20_000),
    sb.from("user_watchlist").select("complex_id").limit(20_000),
  ]);
  if (pv.error) throw new Error(`page_view_events(단지 조회) 조회 실패: ${pv.error.message}`);
  if (wl.error) throw new Error(`user_watchlist 조회 실패: ${wl.error.message}`);
  const views: InterestMap["views"] = {};
  const cut = now - 30 * DAY_MS;
  for (const r of (pv.data ?? []) as Array<{ path: string | null; occurred_at: string }>) {
    const p = String(r.path ?? "").split("?")[0];
    if (!p) continue;
    const slot = views[p] ?? [0, 0];
    if (Date.parse(r.occurred_at) >= cut) slot[0] += 1;
    else slot[1] += 1;
    views[p] = slot;
  }
  const watchers: InterestMap["watchers"] = {};
  for (const r of (wl.data ?? []) as Array<{ complex_id: string | null }>) {
    const id = String(r.complex_id ?? "");
    if (id) watchers[id] = (watchers[id] ?? 0) + 1;
  }
  return { views, watchers };
}

const loadInterestMapCached = unstable_cache(loadInterestMap, ["signals-interest-v1"], { revalidate: 3_600 });
const interestMap = cache(async (): Promise<InterestMap | Failed> => {
  try {
    return await loadInterestMapCached();
  } catch (e) {
    logger.warnSampled("signals:interest", "[signals] 관심 지도 조회 실패", e);
    return "failed";
  }
});

/* ── 조립 ─────────────────────────────────────────────────────────── */

export type LoadSignalOptions = {
  scope: SignalReport["scope"];
  /** 실거래 지역 이름 — "안양 동안구" */
  regionName: string;
  /** 단지 화면이면 단지 id(관심 · 이웃 노트) */
  complexId?: string | null;
  /** 이미 읽은 라이브 컨텍스트(단지 화면 loadAxisContext) — 없으면 지역만 읽는다 */
  ctx?: LiveToolContext | null;
  /** 이 단지 월별 건수 · 주력 평형 월 중위(만원) — 단지 화면이 이미 가진 값 */
  complexSeries?: { yms: string[]; counts: number[]; mainValues?: (number | null)[] } | null;
  /** 현장 점수(임장노트) — 없으면 단지 화면은 이웃 노트 평균 */
  field?: FieldSignal | null;
  now?: string;
};

function csiPick(
  csi: EcosParts["csi"],
  key: string,
): { value: number; prev: number | null; asOf: string } | null {
  const pts = csi?.[key];
  if (!Array.isArray(pts) || pts.length === 0) return null;
  const last = pts[pts.length - 1];
  const prev = pts.length >= 4 ? pts[pts.length - 4].value : null;
  return { value: last.value, prev, asOf: last.ym };
}

export async function loadSignalReport(opts: LoadSignalOptions): Promise<SignalReport | null> {
  const regionName = opts.regionName.trim();
  if (!regionName) return null;
  const now = opts.now ?? new Date().toISOString();
  const [regionR, ecos, interest, ctxR] = await Promise.all([
    regionSignalParts(regionName).catch((e): null => {
      logger.warnSampled("signals:region", "[signals] 지역 묶음 실패", e);
      return null;
    }),
    ecosParts(),
    opts.scope === "complex" && opts.complexId ? interestMap() : Promise.resolve(null),
    opts.ctx !== undefined
      ? Promise.resolve(opts.ctx)
      : buildLiveToolContextCached(null, regionName, { complexDurable: false }).catch((): null => null),
  ]);
  const region = regionR;
  const ctx = ctxR;

  /* 심리 */
  let sentiment: SignalInputs["sentiment"];
  const csiGroup = region?.sido?.csiGroup ?? "전체";
  const csiRaw = ecos === "failed" ? null : csiPick(ecos.csi, `housing:${csiGroup}`) ?? csiPick(ecos.csi, "housing:전체");
  const csiGroupUsed = ecos !== "failed" && csiPick(ecos.csi, `housing:${csiGroup}`) ? csiGroup : "전국";
  const bs = region ? region.buySuperiority : "failed";
  if (bs === "failed" && ecos === "failed") sentiment = "failed";
  else {
    const housingCsi = csiRaw ? { ...csiRaw, group: csiGroupUsed } : null;
    const buySuperiority = bs === "failed" ? null : bs;
    sentiment = buySuperiority || housingCsi ? { buySuperiority, housingCsi } : null;
  }

  /* 뉴스 · 관심 */
  const newsItems = region ? region.news : "failed";
  const news: SignalInputs["news"] = newsItems === "failed" ? "failed" : { items: newsItems, windowDays: NEWS_WINDOW_DAYS };
  const nowMs = Date.parse(now);
  const recent30 = newsItems === "failed" ? 0 : newsItems.filter((n) => Date.parse(n.at) >= nowMs - 30 * DAY_MS).length;
  const prior30 = newsItems === "failed" ? 0 : newsItems.length - recent30;
  let siteViews30: number | null = null;
  let siteViewsPrior30: number | null = null;
  let watchers: number | null = null;
  if (interest && interest !== "failed" && opts.complexId) {
    const path = complexHrefFromId(opts.complexId);
    const slot = interest.views[path] ?? [0, 0];
    siteViews30 = slot[0];
    siteViewsPrior30 = slot[1];
    watchers = interest.watchers[opts.complexId] ?? 0;
  }
  const interestInput: SignalInputs["interest"] =
    newsItems === "failed" && (interest === "failed" || interest === null)
      ? "failed"
      : { newsRecent30: recent30, newsPrior30: prior30, siteViews30, siteViewsPrior30, watchers };

  /* 거래량 */
  const vol = region ? region.volume : "failed";
  const cx = opts.complexSeries ?? null;
  const volume: SignalInputs["volume"] =
    vol === "failed" ? "failed" : { region: vol, complex: cx ? { yms: cx.yms, counts: cx.counts } : null };

  /* 1년 추이 · 단기 추세 */
  const rt = ctx?.region?.trend ?? null;
  const cxPrice = cx?.mainValues ? complexPriceChange(cx.yms, cx.mainValues, now) : null;
  const trend: SignalInputs["trend"] = rt
    ? {
        yoyPct: rt.yoyPct,
        fromYm: rt.yoyFromYm,
        asOf: rt.asOf,
        complexRecentMan: cxPrice?.recent ?? null,
        complexPriorMan: cxPrice?.prior ?? null,
      }
    : ctx === null
      ? "failed"
      : null;
  const weekly = region ? region.weekly : "failed";
  const momentum: SignalInputs["momentum"] =
    weekly === "failed" && !rt ? "failed" : { weekly: weekly === "failed" ? [] : weekly, momPct: rt?.momPct ?? null, momAsOf: rt?.asOf ?? null };

  /* 매물·공급 */
  const supply: SignalInputs["supply"] = ctx
    ? {
        /* 지역 축이 있는데 입주 예정이 비었으면 0세대(공공데이터 기준) — 지역 축이 없으면 모름 */
        upcomingHouseholds: ctx.supply ? ctx.supply.upcomingHouseholds : ctx.region ? 0 : null,
        regionHouseholds: ctx.region?.demographics?.households ?? null,
        firstYm: ctx.supply?.firstYm ?? null,
        lastYm: ctx.supply?.lastYm ?? null,
        annualTrades: vol === "failed" ? null : annualTradesFrom(vol, now),
      }
    : null;

  /* 금리 */
  const rate: SignalInputs["rate"] =
    ecos === "failed" && !ctx?.macro
      ? "failed"
      : {
          baseRatePct: (ecos !== "failed" ? ecos.baseRate?.value : null) ?? ctx?.macro?.baseRatePct ?? null,
          loanRatePct: ecos !== "failed" ? ecos.loanRate?.value ?? null : null,
          loanAsOf: ecos !== "failed" ? ecos.loanRate?.cycle || null : null,
          rateOutlookCsi: ecos !== "failed" ? csiPick(ecos.csi, "rate:전체")?.value ?? null : null,
        };

  /* 현장 — 노트는 넘겨받은 점수, 단지 화면은 이웃 공개 노트 평균(0~5 → 0~100) */
  let field = opts.field ?? null;
  if (!field && opts.scope === "complex" && ctx?.notes?.avgScore) {
    field = {
      score100: Math.round(ctx.notes.avgScore * 20),
      label: "이웃 임장노트 평균",
      source: ctx.notes.source,
      count: ctx.notes.sample ?? ctx.notes.count,
    };
  }

  return computeSignals({
    scope: opts.scope,
    regionLabel: regionName,
    now,
    sentiment,
    news,
    interest: interestInput,
    volume,
    trend,
    momentum,
    supply,
    rate,
    field,
  });
}

/**
 * 단지 화면 base 시점에 지역 · 한국은행 · 관심 묶음을 미리 띄운다(섹션 예산 3초를 base 부터 재기 때문 —
 * 판이 본문 뒤에 출발하면 이미 지난 마감에 바로 접힌다). React cache 라 판이 같은 약속을 받는다.
 */
export function prefetchSignalParts(regionName: string, withInterest: boolean): Promise<unknown> {
  const name = regionName.trim();
  if (!name) return Promise.resolve(null);
  return Promise.all([regionSignalParts(name), ecosParts(), withInterest ? interestMap() : null]);
}
