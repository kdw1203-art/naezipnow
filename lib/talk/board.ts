/**
 * [1051 · 홈 실시간 토론] 왼쪽 지역 순위 재료 + 오른쪽 자동 소식 — 서버 전용.
 *
 * 숫자는 이미 적재된 것만 읽는다(새 수집 없음):
 *  · 매매가격지수 전월비 — market_region_series(한국부동산원 월간 · 홈 구별 막대와 같은 계산 districtMovesFromIndexRows)
 *  · 아파트 매매 거래량 — market_region_series trade_count(한국부동산원 월간 · 홈 지역 동향 카드와 같은 행)
 *  · 뉴스 — board_posts 자동 수집 기사 중 제목에 지역 낱말이 있는 것(1048 시장 신호와 같은 낱말 규칙)
 *  · 임장노트 — 공개 노트 중 그 지역 것
 * 시장 숫자·소식은 10분 캐시(전 지역 한 벌 · 지역마다 한 벌). 글 수는 캐시하지 않는다(사람 글은 쓰는 즉시 보여야 한다).
 * 조회 실패는 캐시에 굳히지 않는다(던지면 unstable_cache 가 저장하지 않는다).
 */
import { unstable_cache } from "next/cache";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { districtMovesFromIndexRows } from "@/lib/newui/home-briefing";
import { regionNewsTokens, safeIlikeToken, isRegionNews } from "@/lib/ai/region-parts";
import { isOwnGeneratedPost } from "@/lib/signals/news-tone";
import { newsHref } from "@/lib/town/post-href";
import { TALK_REGIONS, talkRegionById, talkRegionNoteTokens, type TalkRegion } from "@/lib/talk/regions";
import { countRecentTalks } from "@/lib/talk/store";
import { signedPct, ymMonthLabel, type TalkBoard, type TalkBoardRegion, type TalkFact } from "@/lib/talk/rules";

type MarketPart = {
  indexYm: string | null;
  tradesYm: string | null;
  byId: Record<string, { pct: number | null; trades: number | null }>;
};

function ymOf(ms: number): string {
  const d = new Date(ms + 9 * 3_600_000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 지역마다 가장 최근 달 값 + 그 달(여러 지역이 가진 가장 최근 달 하나로 맞춘다 — 늦게 들어온 지역의 옛 달 값을 섞지 않는다) */
function latestMonthly(rows: readonly { region_id: string; period: string; value: number | string | null }[]): {
  ym: string | null;
  byId: Map<string, number>;
} {
  const per = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const ym = String(r.period ?? "").replace(/[^0-9]/g, "").slice(0, 6);
    const v = Number(r.value);
    if (!r.region_id || !/^\d{6}$/.test(ym) || !Number.isFinite(v) || v < 0) continue;
    const m = per.get(String(r.region_id)) ?? new Map<string, number>();
    if (!m.has(ym)) m.set(ym, v);
    per.set(String(r.region_id), m);
  }
  const count = new Map<string, number>();
  for (const m of per.values()) {
    const latest = [...m.keys()].sort().pop();
    if (latest) count.set(latest, (count.get(latest) ?? 0) + 1);
  }
  const ym = [...count.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] ?? null;
  const byId = new Map<string, number>();
  if (ym) for (const [id, m] of per) if (m.has(ym)) byId.set(id, m.get(ym) as number);
  return { ym, byId };
}

async function readMarketPart(): Promise<MarketPart> {
  const sb = getReadOnlySupabase();
  if (!sb) return { indexYm: null, tradesYm: null, byId: {} };
  const ids = TALK_REGIONS.map((r) => r.id);
  const sinceYm = ymOf(Date.now() - 150 * 86_400_000);
  const since = `${sinceYm.slice(0, 4)}-${sinceYm.slice(4, 6)}-01`;
  /* 지수·거래량 모두 한국부동산원 월간(홈 지역 동향 카드 "8월 거래 180건 · 부동산원"과 같은 행) — 같은 화면에서 숫자가 갈리지 않게 */
  const read = (metric: string) =>
    sb
      .from("market_region_series")
      .select("region_id,period,value")
      .eq("property_type", "apt")
      .eq("metric", metric)
      .eq("period_type", "monthly")
      .in("region_id", ids)
      .gte("period", since)
      .order("period", { ascending: false })
      .limit(ids.length * 6);
  const [idx, tx] = await Promise.all([read("sale_index"), read("trade_count")]);
  if (idx.error) throw new Error(`market_region_series(토론 지수) 조회 실패: ${idx.error.message}`);
  if (tx.error) throw new Error(`market_region_series(토론 거래량) 조회 실패: ${tx.error.message}`);

  const moves = districtMovesFromIndexRows((idx.data ?? []) as { region_id: string; period: string; value: number }[]);
  const pctById = new Map((moves?.moves ?? []).map((m) => [m.id, Math.round(m.pct * 100) / 100]));
  const trades = latestMonthly((tx.data ?? []) as { region_id: string; period: string; value: number }[]);

  const byId: MarketPart["byId"] = {};
  for (const r of TALK_REGIONS) {
    const t = trades.byId.get(r.id);
    byId[r.id] = { pct: pctById.get(r.id) ?? null, trades: t !== undefined ? Math.round(t) : null };
  }
  return { indexYm: moves?.period ?? null, tradesYm: trades.ym, byId };
}

const readMarketPartCached = unstable_cache(readMarketPart, ["talk-board-market-v1"], { revalidate: 600 });

export async function loadTalkBoard(): Promise<TalkBoard> {
  const [market, talks] = await Promise.all([readMarketPartCached(), countRecentTalks()]);
  const regions: TalkBoardRegion[] = TALK_REGIONS.map((r) => {
    const m = market.byId[r.id] ?? { pct: null, trades: null };
    const t = talks.get(r.id);
    return {
      id: r.id,
      name: r.name,
      sido: r.sido,
      txName: r.txNames[0] ?? r.name,
      pct: m.pct,
      indexYm: m.pct !== null ? market.indexYm : null,
      trades: m.trades,
      tradesYm: m.trades !== null ? market.tradesYm : null,
      talks: t?.count ?? 0,
      lastTalkAt: t?.last ?? null,
    };
  });
  return {
    regions,
    indexYm: market.indexYm,
    tradesYm: market.tradesYm,
    totalTalks: regions.reduce((s, r) => s + r.talks, 0),
  };
}

/* ── 오른쪽 자동 소식 ───────────────────────────────────────────── */

async function readNewsFacts(r: TalkRegion): Promise<TalkFact[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  const tokens = regionNewsTokens(r.txNames[0] ?? r.name).map(safeIlikeToken).filter((t) => t.length >= 2);
  if (tokens.length === 0) return [];
  const since = new Date(Date.now() - 21 * 86_400_000).toISOString();
  const { data, error } = await sb
    .from("board_posts")
    .select("id,title,created_at,source_name,source_published_at")
    .eq("is_automated", true)
    .eq("is_published", true)
    .gte("created_at", since)
    .or(tokens.map((t) => `title.ilike.%${t}%`).join(","))
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(`board_posts(토론 뉴스 ${r.name}) 조회 실패: ${error.message}`);
  return ((data ?? []) as { id: string; title: string | null; created_at: string; source_name: string | null; source_published_at: string | null }[])
    .filter((p) => isRegionNews({ title: String(p.title ?? ""), summary: null }, tokens))
    .filter((p) => !isOwnGeneratedPost({ title: p.title, sourceName: p.source_name }))
    .slice(0, 3)
    .map((p) => ({
      kind: "fact" as const,
      id: `news-${p.id}`,
      label: "뉴스" as const,
      text: String(p.title ?? "").trim(),
      href: newsHref(String(p.id)),
      at: String(p.source_published_at ?? p.created_at),
      source: p.source_name ? String(p.source_name) : null,
    }));
}

type NoteRow = {
  id: string;
  title: string | null;
  apt_name: string | null;
  created_at: string;
  score_location: number | null;
  score_school: number | null;
  score_transport: number | null;
  score_facility: number | null;
  score_future: number | null;
};

/** 기록 점수 — 홈 공개 임장노트와 같은 규칙(매긴 항목만 평균 × 20 · 반올림) */
function noteScore(n: NoteRow): number {
  const v = [n.score_location, n.score_school, n.score_transport, n.score_facility, n.score_future].filter(
    (x): x is number => typeof x === "number" && x > 0,
  );
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 20) : 0;
}

async function readNoteFacts(r: TalkRegion): Promise<TalkFact[]> {
  const sb = getReadOnlySupabase();
  if (!sb) return [];
  const { sido, token } = talkRegionNoteTokens(r);
  const pattern = sido ? `%${sido}%${token}%` : `%${token}%`;
  const { data, error } = await sb
    .from("inspection_notes")
    .select("id,title,apt_name,created_at,score_location,score_school,score_transport,score_facility,score_future")
    .eq("is_public", true)
    .ilike("region", pattern)
    .order("created_at", { ascending: false })
    .limit(2);
  if (error) throw new Error(`inspection_notes(토론 노트 ${r.name}) 조회 실패: ${error.message}`);
  return ((data ?? []) as NoteRow[]).map((n) => {
    const score = noteScore(n);
    const name = (n.apt_name || n.title || "임장노트").trim();
    return {
      kind: "fact" as const,
      id: `note-${n.id}`,
      label: "임장노트" as const,
      text: score > 0 ? `${name} · 기록 ${score}점` : name,
      href: `/notes/${encodeURIComponent(String(n.id))}`,
      at: String(n.created_at),
      source: null,
    };
  });
}

/* [1052] 조각마다 따로 캐시 — 예전엔 셋을 한 번에(Promise.all) 묶어 뉴스 하나가 실패하면 지수·거래·노트 소식까지 통째로
   비었다. 이제 실패한 조각만 빠지고(캐시에 굳히지 않음 — 던지면 unstable_cache 가 저장하지 않는다) 나머지는 그대로 */
const readNewsFactsCached = unstable_cache(
  async (regionId: string) => {
    const r = talkRegionById(regionId);
    return r ? readNewsFacts(r) : [];
  },
  ["talk-region-news-v2"],
  { revalidate: 600 },
);
const readNoteFactsCached = unstable_cache(
  async (regionId: string) => {
    const r = talkRegionById(regionId);
    return r ? readNoteFacts(r) : [];
  },
  ["talk-region-notes-v2"],
  { revalidate: 600 },
);

export type RegionFacts = {
  facts: TalkFact[];
  /** 실패한 조각(지수·거래 · 뉴스 · 임장노트) — 비어 있으면 전부 받음 */
  failed: ("market" | "news" | "notes")[];
};

/** 오른쪽 자동 소식 — 지수 · 거래(위) + 뉴스 · 임장노트(최신 순). 조각 실패는 그 조각만 뺀다 */
export async function loadRegionFacts(regionId: string): Promise<RegionFacts> {
  const r = talkRegionById(regionId);
  if (!r) return { facts: [], failed: [] };
  const [marketR, newsR, notesR] = await Promise.allSettled([
    readMarketPartCached(),
    readNewsFactsCached(r.id),
    readNoteFactsCached(r.id),
  ]);
  const failed: RegionFacts["failed"] = [];
  if (marketR.status === "rejected") failed.push("market");
  if (newsR.status === "rejected") failed.push("news");
  if (notesR.status === "rejected") failed.push("notes");
  const market: MarketPart = marketR.status === "fulfilled" ? marketR.value : { indexYm: null, tradesYm: null, byId: {} };
  const news = newsR.status === "fulfilled" ? newsR.value : [];
  const notes = notesR.status === "fulfilled" ? notesR.value : [];
  const out: TalkFact[] = [];
  const m = market.byId[r.id];
  if (m && m.pct !== null && market.indexYm) {
    const tone = m.pct > 0.05 ? "up" : m.pct < -0.05 ? "down" : "flat";
    out.push({
      kind: "fact",
      id: `index-${r.id}-${market.indexYm}`,
      label: "지수",
      text: `${ymMonthLabel(market.indexYm)} 매매가격지수 전월 대비 ${signedPct(m.pct)}`,
      href: `/region/${encodeURIComponent(r.id)}`,
      at: null,
      source: "한국부동산원",
      tone,
    });
  }
  if (m && m.trades !== null && market.tradesYm) {
    out.push({
      kind: "fact",
      id: `trades-${r.id}-${market.tradesYm}`,
      label: "거래",
      text: `${ymMonthLabel(market.tradesYm)} 아파트 매매 거래 ${m.trades.toLocaleString("ko-KR")}건`,
      href: `/region/${encodeURIComponent(r.id)}`,
      at: null,
      source: "한국부동산원",
    });
  }
  const timed = [...news, ...notes].sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")));
  return { facts: [...out, ...timed], failed };
}
