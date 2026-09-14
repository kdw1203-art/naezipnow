import "server-only";

import { unstable_cache } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  complexCanonicalPath,
  decodeComplexId,
  encodeComplexId,
  getComplexById,
  getTransactionHistoryWithBands,
} from "@/lib/complex/complex-store";
import { pureIdFromParam } from "@/lib/seo/complex-slug";
import { findAreaBand } from "@/lib/market/bands";
import { logger } from "@/lib/log";
import {
  classifyReferrer,
  hashtagsFor,
  promoWeekTag,
  renderComplexBlogPost,
  renderComplexShortPost,
  summarizeInflow,
  withUtm,
  type InflowSummaryRow,
  type PromoTradeRow,
} from "./promo-pure";

/* ============================================================
   [1002] 홍보 킷 — 실측 유입 → 이번 주 할 일 → 붙여넣기 완성본.

   데이터 층위(전부 실측):
   - 유입: page_view_referrer_30d · page_view_utm_30d (분석 동의 표본 — 하한선).
     조회 실패는 null 이다. 0 으로 위장하지 않는다.
   - 단지 후보: 최근 30일 검색·AI 유입으로 랜딩된 단지(실제로 사람이 찾아온 곳)
     → 부족하면 사이트맵 집계(complex_sitemap_source)의 거래 많은 단지로 채운다.
   - 단지 수치: 허브 페이지와 같은 로더(getTransactionHistoryWithBands) —
     블로그 글의 숫자와 사이트의 숫자가 갈라지면 그게 곧 버그다.

   무거운 것은 없다: 뷰 2개(limit 50) + 랜딩 200행 + 사이트맵 6행 + 단지별
   허브 로더 2회 × 최대 9. 결과는 1시간 캐시(unstable_cache).
   ============================================================ */

export type UtmInflowRow = {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  landings: number;
  sessions: number;
};

export type ComplexPack = {
  id: string;
  name: string;
  region: string;
  /** "2026년 8월 신고분까지" */
  asOfLabel: string;
  /** 왜 이 단지인가 — "검색·AI 랜딩 N회" 또는 "거래 상위" */
  reason: string;
  titles: string[];
  blogBody: string;
  shortPost: string;
  hashtags: string[];
  /** utm 이 붙은 절대 URL (블로그용·커뮤니티용) */
  blogUrl: string;
  shortUrl: string;
  tradeCount12m: number | null;
};

export type PromoKit = {
  weekTag: string;
  inflow: {
    /** null = 조회 실패(0건이 아니라 못 읽은 것) */
    rows: InflowSummaryRow[] | null;
    utm: UtmInflowRow[] | null;
    sinceLabel: "최근 30일";
  };
  complexPacks: ComplexPack[];
  /** 소스 실패로 못 넣은 것 — 없음과 구분해 표시 */
  missing: string[];
  generatedAt: string;
};

const SITE = "https://naezipnow.com";
const MAX_PACKS = 3;

type ReferrerRow = { source: string; landings: number; sessions: number };
type LandingRow = { path: string | null; referrer_host: string | null };
type SitemapRow = { region_name: string | null; complex_name: string | null; trade_count: number | null };

type Candidate = { id: string; reason: string };

function ymAsOfLabel(ym: string): string {
  const m = ym.match(/^(\d{4})(\d{2})$/);
  return m ? `${m[1]}년 ${Number(m[2])}월 신고분까지` : `${ym} 신고분까지`;
}

/** 랜딩 경로 → 순수 단지 id (슬러그 장식 제거 · kapt.* 유지). 못 풀면 null */
function complexIdFromPath(path: string | null): string | null {
  if (!path) return null;
  const m = path.match(/^\/complex\/([^/?#]+)/);
  if (!m) return null;
  try {
    const id = pureIdFromParam(decodeURIComponent(m[1]));
    return id || null;
  } catch {
    return null;
  }
}

async function loadLandingCandidates(
  sb: NonNullable<ReturnType<typeof getServiceSupabase>>,
): Promise<Candidate[]> {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data, error } = await sb
    .from("page_view_events")
    .select("path, referrer_host")
    .eq("is_landing", true)
    .eq("route", "/complex/[id]")
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`page_view_events (단지 랜딩) 조회 실패: ${error.message}`);
  const counts = new Map<string, number>();
  for (const r of (data as LandingRow[] | null) ?? []) {
    const { channel } = classifyReferrer(r.referrer_host);
    if (channel !== "search" && channel !== "ai") continue;
    const id = complexIdFromPath(r.path);
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_PACKS)
    .map(([id, n]) => ({ id, reason: `최근 30일 검색·AI 랜딩 ${n}회` }));
}

async function loadTopTradeCandidates(
  sb: NonNullable<ReturnType<typeof getServiceSupabase>>,
): Promise<Candidate[]> {
  const { data, error } = await sb
    .from("complex_sitemap_source")
    .select("region_name, complex_name, trade_count")
    .order("trade_count", { ascending: false })
    .limit(6);
  if (error) throw new Error(`complex_sitemap_source 조회 실패: ${error.message}`);
  const out: Candidate[] = [];
  for (const r of (data as SitemapRow[] | null) ?? []) {
    if (!r.region_name || !r.complex_name) continue;
    out.push({
      id: encodeComplexId(r.region_name, r.complex_name),
      reason: `누적 매매 신고 ${Number(r.trade_count ?? 0).toLocaleString("ko-KR")}건 (거래 상위)`,
    });
  }
  return out;
}

/** 후보 하나 → 팩. 단지가 없거나 12개월 거래가 0 이면 null(실패가 아니라 "글감 없음"). */
async function buildComplexPack(cand: Candidate, weekTag: string): Promise<ComplexPack | null> {
  const row = await getComplexById(cand.id);
  if (!row) return null;
  const months = await getTransactionHistoryWithBands(row.canonical_id, 12);
  if (months.length === 0) return null;

  const tradeCount12m = months.reduce((s, m) => s + (Number(m.deal_count) || 0), 0);
  const latestYm = months[months.length - 1].yyyymm;
  const recent = months.slice(-6);
  const trades: PromoTradeRow[] = [];
  for (const m of recent) {
    if (m.bands.length > 0) {
      for (const b of m.bands) {
        trades.push({
          ym: m.yyyymm,
          areaM2: null,
          areaLabel: findAreaBand(b.slug)?.label ?? b.slug,
          avgManwon: b.avg_manwon,
          dealCount: b.deal_count,
        });
      }
    } else {
      trades.push({ ym: m.yyyymm, areaM2: null, areaLabel: null, avgManwon: m.avg_manwon, dealCount: m.deal_count });
    }
  }

  const region = decodeComplexId(row.canonical_id)?.region ?? row.city;
  const pageUrl = `${SITE}${complexCanonicalPath(row)}`;
  const blogUrl = withUtm(pageUrl, { source: "naver", medium: "blog", campaign: `complex-${weekTag}` });
  const shortUrl = withUtm(pageUrl, { source: "community", medium: "post", campaign: `complex-${weekTag}` });
  const asOfLabel = ymAsOfLabel(latestYm);
  const base = { name: row.name, region, asOfLabel, trades, noteCount: null, tradeCount12m };
  const blog = renderComplexBlogPost({ ...base, url: blogUrl });
  const shortPost = renderComplexShortPost({ ...base, url: shortUrl });

  return {
    id: row.canonical_id,
    name: row.name,
    region,
    asOfLabel,
    reason: cand.reason,
    titles: blog.titles,
    blogBody: blog.body,
    shortPost,
    hashtags: hashtagsFor(row.name, region),
    blogUrl,
    shortUrl,
    tradeCount12m,
  };
}

async function buildPromoKitUncached(): Promise<PromoKit> {
  const weekTag = promoWeekTag();
  const missing: string[] = [];
  const sb = getServiceSupabase();

  if (!sb) {
    return {
      weekTag,
      inflow: { rows: null, utm: null, sinceLabel: "최근 30일" },
      complexPacks: [],
      missing: ["유입 30일(DB 미설정)", "UTM 유입(DB 미설정)", "단지 글 팩(DB 미설정)"],
      generatedAt: new Date().toISOString(),
    };
  }

  /* ── 1) 유입 ── */
  const [refR, utmR, landR, topR] = await Promise.allSettled([
    sb.from("page_view_referrer_30d").select("*").order("sessions", { ascending: false }).limit(50),
    sb.from("page_view_utm_30d").select("*").order("sessions", { ascending: false }).limit(50),
    loadLandingCandidates(sb),
    loadTopTradeCandidates(sb),
  ]);

  let rows: InflowSummaryRow[] | null = null;
  if (refR.status === "fulfilled" && !refR.value.error) {
    rows = summarizeInflow(((refR.value.data as ReferrerRow[] | null) ?? []).map((r) => ({
      source: String(r.source ?? ""),
      sessions: Number(r.sessions) || 0,
      landings: Number(r.landings) || 0,
    })));
  } else {
    missing.push("유입 30일");
    logger.error("[promo-kit] 유입 출처 조회 실패", refR.status === "fulfilled" ? refR.value.error : refR.reason);
  }

  let utm: UtmInflowRow[] | null = null;
  if (utmR.status === "fulfilled" && !utmR.value.error) {
    utm = ((utmR.value.data as Partial<UtmInflowRow>[] | null) ?? []).map((r) => ({
      utm_source: String(r.utm_source ?? ""),
      utm_medium: String(r.utm_medium ?? ""),
      utm_campaign: String(r.utm_campaign ?? ""),
      landings: Number(r.landings) || 0,
      sessions: Number(r.sessions) || 0,
    }));
  } else {
    missing.push("UTM 유입");
    logger.error("[promo-kit] UTM 조회 실패", utmR.status === "fulfilled" ? utmR.value.error : utmR.reason);
  }

  /* ── 2) 단지 후보 — 랜딩 우선, 거래 상위로 보충 ── */
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  const pushCand = (c: Candidate) => {
    if (seen.has(c.id)) return;
    seen.add(c.id);
    candidates.push(c);
  };
  if (landR.status === "fulfilled") landR.value.forEach(pushCand);
  else {
    missing.push("검색·AI 랜딩 단지");
    logger.error("[promo-kit] 랜딩 단지 조회 실패", landR.reason);
  }
  if (topR.status === "fulfilled") topR.value.forEach(pushCand);
  else {
    missing.push("거래 상위 단지");
    logger.error("[promo-kit] 거래 상위 단지 조회 실패", topR.reason);
  }

  /* ── 3) 팩 — 후보 순서를 지키되 병렬로 읽는다(최대 9). 첫 3개만 쓴다. ── */
  const packR = await Promise.allSettled(candidates.map((c) => buildComplexPack(c, weekTag)));
  const complexPacks: ComplexPack[] = [];
  const packSeen = new Set<string>();
  packR.forEach((r, i) => {
    if (complexPacks.length >= MAX_PACKS) return;
    if (r.status === "rejected") {
      missing.push(`단지 글 팩(${candidates[i].id.slice(0, 12)}…)`);
      logger.error("[promo-kit] 단지 팩 실패", { id: candidates[i].id, error: r.reason });
      return;
    }
    const pack = r.value;
    if (!pack || packSeen.has(pack.id)) return;
    packSeen.add(pack.id);
    complexPacks.push(pack);
  });

  /* 아무것도 못 읽었으면 던진다 — 빈 킷을 1시간 굳히지 않기 위해서다. */
  if (rows === null && utm === null && complexPacks.length === 0) {
    throw new Error("[promo-kit] 유입·UTM·단지 팩을 하나도 읽지 못했습니다");
  }

  return {
    weekTag,
    inflow: { rows, utm, sinceLabel: "최근 30일" },
    complexPacks,
    missing,
    generatedAt: new Date().toISOString(),
  };
}

const buildPromoKitCached = unstable_cache(buildPromoKitUncached, ["promo-kit-v1"], {
  revalidate: 3600,
});

/** 실패해도 관리자 화면을 죽이지 않는다 — 전부 실패면 null 들 + missing 으로 돌려준다(캐시 안 함). */
export async function buildPromoKit(): Promise<PromoKit> {
  try {
    return await buildPromoKitCached();
  } catch (e) {
    logger.error("[promo-kit]", e);
    return {
      weekTag: promoWeekTag(),
      inflow: { rows: null, utm: null, sinceLabel: "최근 30일" },
      complexPacks: [],
      missing: ["유입 30일", "UTM 유입", "단지 글 팩"],
      generatedAt: new Date().toISOString(),
    };
  }
}
