/**
 * 주간 다이제스트 (#86) — 최근 7일 실데이터 요약 (서버 전용, 1h 캐시).
 *
 * - 뉴스 하이라이트: board_posts 자동 수집 뉴스 (community·is_automated·is_published,
 *   source_published_at 기준 7일 이내, 없으면 created_at) 상위 8건
 * - 시장 요약: market_region_price 최신 스냅샷 (서울/경기/인천 주요 지역) + 전월 대비 등락
 * - 커뮤니티: 최근 7일 이웃(비자동) 글 수·제목
 *
 * ── 못 읽은 것과 없는 것은 다르다 ────────────────────────────────────────────
 * 예전에는 세 섹션이 전부 `.catch(() => [])` 였다. 그래서 DB 가 흔들리면
 * 이 페이지가 "최근 7일 수집된 뉴스가 없어요" · "이웃 글 0건" 이라고 **단언**
 * 했다 — 뉴스도 글도 있는데. 조회 실패를 데이터 없음으로 위장한 것이다.
 * 지금은 실패한 섹션을 `failed` 로 화면까지 들고 간다. 세 섹션이 **전부**
 * 실패하면 값을 돌려주지 않고 던진다 — 값으로 돌려주면 unstable_cache 가
 * 그 고장 스냅샷을 1시간 붙들어서, DB 가 살아난 뒤에도 계속 고장나 보인다
 * (거부는 캐시되지 않는다).
 */
import "server-only";
import { unstable_cache } from "next/cache";
import { WEEKLY_DIGEST_TAG } from "@/lib/town/cache-tags";
import { readBoardPosts, readTownPosts } from "@/lib/newui/board-posts";
import { getMarketFreshnessDateLabel } from "@/lib/newui/freshness";
import { getAllRegionSnapshots } from "@/lib/market/store";
import { logger } from "@/lib/log";
import type { Post } from "@/lib/types/post";
import { formatKrwWon } from "@/lib/format/krw";
import { DELTA_UNKNOWN } from "@/lib/newui/delta-label";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const NEWS_LIMIT = 8;
const COMMUNITY_TITLE_LIMIT = 3;

export type DigestDeltaTone = "up" | "down" | "flat";

export interface DigestNewsItem {
  id: string;
  title: string;
  sourceName: string | null;
  region: string | null;
  /** 표시용 게시 시각 (source_published_at ?? created_at, ISO) */
  publishedAt: string;
}

export interface DigestMarketItem {
  regionId: string;
  name: string;
  city: string;
  /** "12.8억" 형식 평균 매매가 */
  price: string;
  /** "▲ 0.6%" 형식 전월 대비 등락 */
  delta: string;
  tone: DigestDeltaTone;
  /** [1009 · H] 변동률 원값(%) — 모르면 null. 화면(/digest)은 이 값으로 <Delta> 를 그린다 */
  changePct: number | null;
  /** [1009 · H] changePct 의 기준 — 부동산원 지수 월간(전월 대비) · 월간 값이 없어 주간(전주 대비)으로 대신한 경우 · 모름 */
  changeBasis: "monthly" | "weekly" | null;
  /** "2026.05" — market_region_price.period(yyyymm) */
  periodLabel: string | null;
}

export interface DigestCommunitySummary {
  count: number;
  titles: Array<{ id: string; title: string }>;
}

export interface WeeklyDigest {
  /** "7월 3주차" */
  weekLabel: string;
  /** 다이제스트 계산 시각 (ISO) — 데이터 기준 시각 캡션용 */
  generatedAt: string;
  /** 실거래 적재 기준일 "YYYY.MM.DD" (market_ingest_log) — 없으면 null */
  marketAsOf: string | null;
  news: DigestNewsItem[];
  market: DigestMarketItem[];
  community: DigestCommunitySummary;
  /**
   * 조회 자체가 실패한 섹션. 빈 배열·0건이 "아직 없음"인지 "못 불러옴"인지는
   * 값만 봐서는 구분이 안 된다 — 화면이 둘을 다르게 말하려면 이게 필요하다.
   */
  failed: DigestFailedSections;
}

export interface DigestFailedSections {
  news: boolean;
  market: boolean;
  community: boolean;
}

/** 시장 요약 대상 주요 지역 (market_region_price region_id 기준) */
const MAJOR_REGIONS: Array<{ id: string; city: string }> = [
  { id: "gangnam", city: "서울" },
  { id: "mapo", city: "서울" },
  { id: "songpa", city: "서울" },
  { id: "gwacheon", city: "경기" },
  { id: "gwangmyeong", city: "경기" },
  { id: "incheon-bupyeong", city: "인천" },
];

/** [970 · B-31] 시장 요약 가격 — "short"(0.1억 단위, 1억 미만은 만원)로 통일.
    예전 "eok"(8.51억)은 /analysis·지역 카드의 28.8억 과 자릿수가 달랐다. 본체는 lib/format/krw.ts */
function formatEok(won: number): string {
  return formatKrwWon(won, { style: "short" });
}

function deltaOf(changePct: number | undefined): { delta: string; tone: DigestDeltaTone } {
  if (typeof changePct !== "number" || !Number.isFinite(changePct)) {
    /* [1009 · H] 예전엔 "— 0.0%" — 모르는 변동을 "보합 0.0%"로 적었다(웹·주간 메일 둘 다). 홈 카드(lib/newui/
       home-region-fallback deltaOf)와 같은 낱말로 모른다고 적는다. 사용처: /digest 화면 · 주간 메일(cron/weekly-digest) ·
       /api/digest JSON — 셋 다 이 문자열을 그대로 보여 줄 뿐 숫자로 되읽지 않는다(확인함). */
    return { delta: DELTA_UNKNOWN, tone: "flat" };
  }
  const arrow = changePct > 0 ? "▲" : changePct < 0 ? "▼" : "—";
  const tone: DigestDeltaTone = changePct > 0.1 ? "up" : changePct < -0.1 ? "down" : "flat";
  return { delta: `${arrow} ${Math.abs(changePct).toFixed(1)}%`, tone };
}

function displayTime(p: Post): number {
  const t = Date.parse(p.sourcePublishedAt || p.createdAt);
  return Number.isFinite(t) ? t : 0;
}

/** "9월 2주차" — [995] 개인 다이제스트(lib/digest/personal.ts)도 같은 라벨을 쓴다 */
export function weekLabelOf(now: Date): string {
  const month = now.getMonth() + 1;
  const week = Math.min(Math.ceil(now.getDate() / 7), 5);
  return `${month}월 ${week}주차`;
}

/* 아래 세 compute* 는 실패를 삼키지 않는다 — 삼키면 "없음"과 구분이 사라진다.
   실패 처리는 computeWeeklyDigest 의 allSettled 한 곳에서만 한다. */
async function computeNews(sinceMs: number): Promise<DigestNewsItem[]> {
  const posts: Post[] = await readBoardPosts();
  return posts
    .filter((p) => p.isAutomated && displayTime(p) >= sinceMs)
    .sort((a, b) => displayTime(b) - displayTime(a))
    .slice(0, NEWS_LIMIT)
    .map((p) => ({
      id: p.id,
      title: p.title,
      sourceName: p.sourceName ?? null,
      region: p.city || null,
      publishedAt: new Date(displayTime(p)).toISOString(),
    }));
}

async function computeMarket(): Promise<DigestMarketItem[]> {
  const snapshots = await getAllRegionSnapshots();
  const items: DigestMarketItem[] = [];
  for (const target of MAJOR_REGIONS) {
    const snap = snapshots.get(target.id);
    if (!snap) continue;
    const priceWon = snap.avgSale ?? snap.medianSale;
    if (typeof priceWon !== "number" || priceWon <= 0) continue;
    const change = snap.saleChangeMonthly ?? snap.saleChangeWeekly;
    /* 월간이 비면 주간 변동률로 대신한다(예전부터) — 화면이 "전월 대비"라고 잘못 적지 않게 기준을 함께 싣는다 */
    const changeBasis: DigestMarketItem["changeBasis"] =
      snap.saleChangeMonthly != null ? "monthly" : snap.saleChangeWeekly != null ? "weekly" : null;
    const { delta, tone } = deltaOf(change);
    const period = /^\d{6}$/.test(snap.period)
      ? `${snap.period.slice(0, 4)}.${snap.period.slice(4, 6)}`
      : null;
    items.push({
      regionId: target.id,
      name: snap.regionName,
      city: target.city,
      price: formatEok(priceWon),
      delta,
      tone,
      changePct: typeof change === "number" && Number.isFinite(change) ? change : null,
      changeBasis: typeof change === "number" && Number.isFinite(change) ? changeBasis : null,
      periodLabel: period,
    });
  }
  return items;
}

async function computeCommunity(sinceMs: number): Promise<DigestCommunitySummary> {
  const posts: Post[] = await readTownPosts();
  const recent = posts.filter(
    (p) => !p.isAutomated && Date.parse(p.createdAt) >= sinceMs,
  );
  return {
    count: recent.length,
    titles: recent
      .slice(0, COMMUNITY_TITLE_LIMIT)
      .map((p) => ({ id: p.id, title: p.title })),
  };
}

const EMPTY_COMMUNITY: DigestCommunitySummary = { count: 0, titles: [] };

async function computeWeeklyDigest(): Promise<WeeklyDigest> {
  const now = new Date();
  const sinceMs = now.getTime() - WEEK_MS;
  const [newsR, marketR, communityR, asOfR] = await Promise.allSettled([
    computeNews(sinceMs),
    computeMarket(),
    computeCommunity(sinceMs),
    getMarketFreshnessDateLabel(),
  ]);

  const failed: DigestFailedSections = {
    news: newsR.status === "rejected",
    market: marketR.status === "rejected",
    community: communityR.status === "rejected",
  };
  if (newsR.status === "rejected") logger.error("[digest] 뉴스 조회 실패", newsR.reason);
  if (marketR.status === "rejected") logger.error("[digest] 시세 조회 실패", marketR.reason);
  if (communityR.status === "rejected") {
    logger.error("[digest] 커뮤니티 조회 실패", communityR.reason);
  }

  /* 세 섹션이 전부 실패했으면 다이제스트라는 값이 성립하지 않는다. 던져야
     unstable_cache 에 남지 않고 다음 요청이 다시 시도한다. */
  if (failed.news && failed.market && failed.community) {
    throw new Error("[getWeeklyDigest] 다이제스트 데이터 소스 전체 조회 실패");
  }

  return {
    weekLabel: weekLabelOf(now),
    generatedAt: now.toISOString(),
    /* 적재 기준일은 부가 캡션이라 실패해도 섹션을 깨뜨리지 않는다 — 대신
       거짓 날짜를 지어내지 않고 null 로 두어 캡션 자체가 사라진다. */
    marketAsOf: asOfR.status === "fulfilled" ? asOfR.value : null,
    news: newsR.status === "fulfilled" ? newsR.value : [],
    market: marketR.status === "fulfilled" ? marketR.value : [],
    community: communityR.status === "fulfilled" ? communityR.value : EMPTY_COMMUNITY,
    failed,
  };
}

/* [1009 · H 리뷰] 키 -v2 — 값의 모양이 바뀌었다(changePct·changeBasis 새 필드, 모르는 변동 "변동 미상"). 옛 키면 배포 뒤 최대
   1시간 옛 모양(새 필드 없음)이 나와 화면이 등락을 "변동 미상"으로만 그린다. */
/* [1010] 1시간 → 1일 + 태그(weekly-digest).
   왜: 이 캐시가 /town/news 라우트의 실제 TTL 을 정하고 있었다 — 그 페이지의
   `export const revalidate = 21_600` 에도 불구하고 .next/prerender-manifest.json 의
   /town/news 는 3600 이었다(Next 는 세그먼트 revalidate 와 데이터 캐시 revalidate 중
   작은 값을 쓴다). 라우트 TTL 만 올리면 아무 일도 일어나지 않는다.
   신선도는 시간이 아니라 태그가 맡는다: 뉴스 적재 재검증 크론(하루 3슬롯)·뉴스 성격의 글
   크론 3곳·이웃 글 작성/수정/삭제가 invalidateTownDataCaches() 로 비운다. 남는 항목(지역
   시세 요약)은 **주간** 요약이라 하루 지연이 화면에서 구분되지 않는다. */
const loadWeeklyDigestCached = unstable_cache(computeWeeklyDigest, ["newui-weekly-digest-v2"], {
  revalidate: 86_400,
  tags: [WEEKLY_DIGEST_TAG],
});

/**
 * 최근 7일 주간 다이제스트 ([1010] 1일 캐시 + weekly-digest 태그).
 *
 * **던질 수 있다** — 세 섹션이 전부 조회 실패한 경우다. 호출부는 그걸 잡아서
 * "조회 실패"로 표시해야 하며, "데이터 없음"이나 "준비 중"으로 바꿔 말하면 안 된다.
 * 일부만 실패한 경우는 값이 오고, 어느 섹션이 실패했는지는 `failed` 에 있다.
 */
export async function getWeeklyDigest(): Promise<WeeklyDigest> {
  return loadWeeklyDigestCached();
}
