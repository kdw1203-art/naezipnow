import { revalidatePath, revalidateTag } from "next/cache";
import { logger } from "@/lib/log";

/* [OPT-10·15] 태그·경로 기반 재검증 — "데이터가 바뀐 순간에만" 캐시를 비운다.
   시간 기반 revalidate 는 안전망으로 남고, 수집 크론이 끝나면 여기로 정확히 찌른다.
   태그는 unstable_cache(fetch 캐시)에, 경로는 ISR 페이지 HTML 에 각각 작용한다.

   [1007] 동네·홈 경로를 더했다. 배경: /town(120초)·/town/news·/town/news/[id]·/town/story/[id]·
   /town/[region](600초) ISR 이 시간만으로 다시 구워지고 있었다 — 사람 트래픽은 7일 120뷰인데
   크롤러가 하루 985회(/town/news/[id])·198회(/town/[region]) 렌더를 일으켰다. TTL 을 6시간으로
   늘리는 대신 내용이 바뀌는 지점(글·댓글·공감·노트 저장·뉴스 적재)에서 여기 헬퍼로 즉시
   비운다. 시간 TTL 은 안전망으로만 남는다. */

export const CACHE_TAGS = {
  market: "market", // 실거래·지역 시세 계열
  supply: "supply", // 입주 물량
  news: "news", // 자동 뉴스
  economy: "economy", // 기준금리 등 거시
  /** [1007] 홈 데이터 스냅샷(lib/landing/data.ts home-data-v1) */
  homeData: "home-data",
} as const;

/** [1007] 동네 피드·동네 홈 — 이웃 글·공개 노트·뉴스 스트립이 실리는 ISR 페이지 */
export const TOWN_FEED_PATHS = ["/town"] as const;
/** [1007] 동적 세그먼트는 type:"page" 로 62곳을 한 번에 비운다(카탈로그 62개 지역) */
export const TOWN_REGION_ROUTE = "/town/[region]";
/** [1007] 뉴스룸 첫 장 — 적재 직후에만 바뀐다 */
export const TOWN_NEWS_PATHS = ["/town/news"] as const;

const SOURCE_MAP: Record<string, { tags: string[]; paths: string[]; pageRoutes?: string[] }> = {
  /* [1010] 실거래 적재는 집계 화면 전부를 바꾼다. 이 경로들의 TTL 을 하루~일주일로 늘리는
     대신, 적재 직후 여기서 정확히 비운다 — 크롤러 주기가 아니라 적재가 재생성을 정한다. */
  molit: {
    /* [1010] 지도 마커 캐시 두 개(map-region-markers · map-danji)는 여태 **아무도 비우지
       않았다** — 유일한 갱신 경로가 600초 TTL 이었고, 그 600초가 /map 라우트 TTL 의 뚜껑이었다.
       태그를 여기 걸어 하루 1회 적재가 비우게 하고 TTL 은 7일로 올렸다. */
    tags: [CACHE_TAGS.market, "map-region-markers", "map-danji"],
    paths: [
      "/",
      "/analysis",
      "/analysis/accuracy",
      "/analysis/price",
      "/analysis/gap",
      "/analysis/scenario",
      "/analysis/timing",
      "/analysis/temperature",
      "/tx",
      "/map",
      "/data/records",
      "/reports",
      "/digest",
    ],
    pageRoutes: ["/analysis/ai/[tool]", "/reports/season/[slug]"],
  },
  reb: { tags: [CACHE_TAGS.market], paths: ["/analysis"] },
  kb: { tags: [CACHE_TAGS.market], paths: [] },
  /* [1010] 청약 달력은 같은 분양공고를 읽는데 SOURCE_MAP 에 없어서 TTL 을 못 올리고 있었다. */
  supply: {
    tags: [CACHE_TAGS.supply],
    paths: ["/apply", "/supply", "/apply/calendar"],
    pageRoutes: ["/apply/calendar/[week]"],
  },
  economy: { tags: [CACHE_TAGS.economy], paths: [] },
  /* [1007] 뉴스(board_posts 자동수집·주간 글·지역 소개 글) — 뉴스룸 첫 장 + 동네 피드의
     "오늘의 뉴스" 스트립 + 동네 홈 62곳의 뉴스 스트립. 뉴스 상세(/town/news/[id])는
     비우지 않는다: 기사는 적재 뒤 바뀌지 않고, 새 기사는 애초에 캐시가 없다.
     태그 "news" 는 여기서 비우지 **않는다** — 그 태그는 지역 축 캐시(live-region-axes,
     218개 × 8개 조회)에도 붙어 있어 적재마다 통째로 다시 채우게 된다. 뉴스 축은 제목 3줄이라
     6시간 TTL 로 충분하고, related-town-posts 캐시는 300초라 스스로 돈다. */
  /* [1010] 정비사업 페이지와 주간 다이제스트도 이 적재를 읽는다 — 둘 다 비울 지점이 없어
     TTL 이 1시간에 묶여 있었다. */
  news: {
    tags: [],
    paths: [...TOWN_NEWS_PATHS, ...TOWN_FEED_PATHS, "/redevelopment", "/digest", "/digest/archive"],
    pageRoutes: [TOWN_REGION_ROUTE],
  },
  /* [1010] 공매 적재 — /auctions 한 장. 크론이 직접 경로를 부르던 것을 창구로 모은다. */
  onbid: { tags: [], paths: ["/auctions"] },
};

/** 수집 성공 직후 호출 — 실패해도 수집 결과에는 영향을 주지 않는다. */
export function invalidateAfterIngest(source: keyof typeof SOURCE_MAP | string): void {
  const plan = SOURCE_MAP[source];
  if (!plan) return;
  try {
    for (const t of plan.tags) revalidateTag(t);
    for (const p of plan.paths) revalidatePath(p);
    for (const r of plan.pageRoutes ?? []) revalidatePath(r, "page");
  } catch (e) {
    logger.warn("[cache-invalidate] 재검증 실패(무시)", source, e);
  }
}

/**
 * [1007] 동네 피드(/town)·동네 홈(/town/[region] 62곳)을 비운다.
 * 이웃 글 작성·댓글·공감, 공개 임장노트 저장/공개 전환 직후에 부른다 — 피드 카드에
 * 댓글·공감 수가 실리고 동네 홈에 이웃 글·공개 노트가 실리기 때문이다.
 * 요청 밖(크론)에서 revalidatePath 가 던지면 삼키고 경고만 — 6시간 TTL 이 안전망.
 */
export function invalidateTownFeed(): void {
  try {
    for (const p of TOWN_FEED_PATHS) revalidatePath(p);
    revalidatePath(TOWN_REGION_ROUTE, "page");
  } catch (e) {
    logger.warn("[cache-invalidate] 동네 피드 재검증 실패(무시)", e);
  }
}

/**
 * [1007] 홈 데이터 스냅샷(home-data-v1, 600초) + 홈 ISR(/) 을 비운다.
 * 스냅샷의 소스는 이웃 글(posts)·전문가·리포트·모임·배너·총계(회원·노트·글 수)다. 예전엔
 * revalidatePath("/") 만 있어서 ISR 은 비워도 90초 데이터 캐시가 그대로 나갔다 — TTL 을
 * 600초로 늘리면서 태그를 실제로 비우는 지점을 만든다(이웃 글 작성·노트 공개).
 */
export function invalidateHomeData(): void {
  try {
    revalidateTag(CACHE_TAGS.homeData);
    revalidatePath("/");
  } catch (e) {
    logger.warn("[cache-invalidate] 홈 데이터 재검증 실패(무시)", e);
  }
}

/* ── [1010] 크롤러가 아니라 "데이터가 바뀐 순간"이 재생성을 결정하게 한다 ──────────
   실측(2026-09-20~22 청구 데이터, 2일): ISR Writes $1.45 · Fast Origin Transfer $1.10 ·
   Fluid Active CPU $0.49 — 합이 청구서의 절반이다. 그 원인은 한 줄로 요약된다.
   긴 꼬리(단지 ≈26,000 · 지역 ≈218)의 ISR TTL(6시간)이 크롤러의 재방문 간격(≈2.2일)보다
   짧아서, 크롤러가 올 때마다 거의 100% 재렌더가 돌았다(/complex/[id] 하루 11,523회 렌더 vs
   사람 방문 30일 27회).

   해법은 TTL 을 재방문 간격보다 훨씬 길게(7일) 잡고, 대신 **바뀐 페이지만** 즉시 비우는 것이다.
   그러면 안 바뀐 페이지는 크롤러가 몇 번을 와도 CDN HIT 이고(쓰기 0·렌더 0·전송 0),
   바뀐 페이지는 TTL 과 무관하게 다음 요청에서 새로 그려진다 — 신선도 손해가 없다.

   여기 있는 헬퍼는 그 "바뀐 것만" 을 부르는 창구다. 호출부는 수집 크론과 글쓰기 API 다.
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * 한 번의 호출에서 부를 수 있는 revalidatePath 상한.
 *
 * Next 는 요청이 끝날 때 모아서 플랫폼 캐시에 알린다 — 수천 건을 한 요청에 밀어 넣으면
 * 그 플러시가 수집 응답 시간을 잡아먹는다. 상한을 넘으면 넘긴 만큼은 **비우지 않고**
 * 남긴다(7일 TTL 이 안전망). 수집은 시군구 슬라이스로 쪼개져 돌기 때문에, 한 슬라이스가
 * 이 상한을 넘는 경우는 대량 백필뿐이고 그건 다음 슬라이스가 이어서 비운다.
 */
export const REVALIDATE_BUDGET = 800;

export interface InvalidateStats {
  /** 호출부가 비워 달라고 준 경로 수(중복 제거 후) */
  requested: number;
  /** 실제로 비운 경로 수 */
  revalidated: number;
  /** 상한에 걸려 남긴 것이 있는가 */
  truncated: boolean;
}

/**
 * 경로 목록을 그대로 비운다(중복 제거 + 상한).
 *
 * 요청 밖(크론)에서 revalidatePath 가 던지는 경우가 있어 통째로 삼킨다 — 재검증 실패가
 * 수집 결과를 되돌리면 안 된다. 실패해도 TTL 안전망이 남는다.
 */
export function invalidatePathList(
  paths: Iterable<string>,
  opts: { budget?: number; label?: string } = {},
): InvalidateStats {
  const budget = Math.max(0, opts.budget ?? REVALIDATE_BUDGET);
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of paths) {
    const p = typeof raw === "string" ? raw.trim() : "";
    if (!p || !p.startsWith("/") || seen.has(p)) continue;
    seen.add(p);
    unique.push(p);
  }
  const take = unique.slice(0, budget);
  let done = 0;
  for (const p of take) {
    try {
      revalidatePath(p);
      done += 1;
    } catch (e) {
      logger.warn("[cache-invalidate] 경로 재검증 실패(무시)", opts.label ?? "", p, e);
    }
  }
  const stats: InvalidateStats = {
    requested: unique.length,
    revalidated: done,
    truncated: unique.length > take.length,
  };
  if (stats.truncated) {
    logger.warn(
      "[cache-invalidate] 상한 초과 — 남은 경로는 TTL 로 처리",
      opts.label ?? "",
      `${take.length}/${unique.length}`,
    );
  }
  return stats;
}

/**
 * 단지 허브(/complex/{id})와 임베드(/embed/complex/{id})를 비운다.
 *
 * ⚠ 넘길 id 표기는 **직접 만들지 말고** `lib/complex/complex-cache-paths.ts` 의
 * `complexCacheIds(id)` · `complexCacheIdsFromNames(지역, 단지명)` 으로 뽑아라.
 * [#51] 한글 슬러그 전환 이후 단지 허브의 정규 주소는 `/complex/{슬러그}.{base64id}` 이고
 * (사이트맵 25,310개·canonical 이 그 문자열), 순수 id 주소는 미들웨어가 308 로 보내므로
 * ISR 사본이 없다 — 순수 id 만 넘기면 **허브가 한 장도 안 비워진다**. 임베드는 반대로
 * 순수 id 쪽이 실제 사본이라, 두 표기를 모두 넘기는 것이 맞다(중복은 아래에서 접는다).
 */
export function invalidateComplexIds(
  ids: Iterable<string>,
  opts: { budget?: number } = {},
): InvalidateStats {
  const paths: string[] = [];
  for (const raw of ids) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id) continue;
    paths.push(`/complex/${id}`);
    paths.push(`/embed/complex/${id}`);
  }
  return invalidatePathList(paths, { ...opts, label: "complex" });
}

/**
 * 지역 화면(/region/{code} · /embed/region/{code})을 비운다.
 * 실거래·집계가 바뀐 시군구만 넘긴다.
 */
export function invalidateRegionCodes(
  codes: Iterable<string>,
  opts: { budget?: number } = {},
): InvalidateStats {
  const paths: string[] = [];
  for (const raw of codes) {
    const code = typeof raw === "string" ? raw.trim() : "";
    if (!code) continue;
    paths.push(`/region/${code}`);
    paths.push(`/embed/region/${code}`);
  }
  return invalidatePathList(paths, { ...opts, label: "region" });
}
