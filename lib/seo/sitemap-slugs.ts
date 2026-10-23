/**
 * N4 — 사이트맵 유형 목록. **의존성이 없는 상수만** 둔다.
 *
 * 이 파일이 따로 있는 이유: 자식 사이트맵 경로를 알아야 하는 곳이 세 군데인데
 * (미들웨어 캐시 정책, 비공개 사이트 게이트, robots.txt) 셋 다 Edge 이거나
 * 가벼운 라우트라 DB 로더가 딸려 들어오면 안 된다. sitemap-sections.ts 는
 * 실제 조회를 하므로 import 하면 그 무게가 그대로 따라온다.
 *
 * 유형을 추가할 때는 여기에 slug 를 넣고, sitemap-sections.ts 에 로더를 등록하고,
 * app/sitemap-{slug}.xml/route.ts 를 만든다. 셋 중 하나라도 빠지면
 * scripts/check-sitemap-index.mjs 가 실패시킨다.
 */

/** [1081] 단지 사이트맵 조각 — 거래 많은 순으로 5,000개씩. 인덱스에는 조각만 싣고, 통짜 /sitemap-complexes.xml 은
 *  소유자가 콘솔에 직접 제출해 둔 주소라 살려 둔다(인덱스에서만 뺀다). 수용량 6 × 5,000 = 30,000(현재 23,809). */
export const COMPLEX_SITEMAP_CHUNK_SIZE = 5000;

/**
 * [1085] 단지 사이트맵 조각 범위 — 순수. 전체 0개 = "empty"(조회 실패 → 503) · 조각이 목록 끝보다 뒤 = "hub"(원래 없음 → 허브 한 줄 200)
 * · 그 밖 = 자를 범위. 운영 23,8xx곳 < 6조각(30,000)이라 6번째 조각이 늘 0개로 503 을 냈다(7일 48회).
 */
export function complexChunkRange(
  total: number,
  chunkIndex: number,
  size: number = COMPLEX_SITEMAP_CHUNK_SIZE,
): "empty" | "hub" | { start: number; end: number } {
  if (!(total > 0)) return "empty";
  const start = chunkIndex * size;
  if (start >= total) return "hub";
  return { start, end: Math.min(total, start + size) };
}
export const COMPLEX_SITEMAP_CHUNKS = 6;
export const COMPLEX_CHUNK_SLUGS = ["complexes-1", "complexes-2", "complexes-3", "complexes-4", "complexes-5", "complexes-6"] as const;

export const SITEMAP_SECTION_SLUGS = [
  "pages",
  "complexes",
  "complexes-1",
  "complexes-2",
  "complexes-3",
  "complexes-4",
  "complexes-5",
  "complexes-6",
  "regions",
  "tx",
  "pairs",
  "reports",
  "notes",
  "glossary",
  "temperature",
  /* 지역 임장 가이드 — /tx 와 같은 지역 원천이라 tx 가 살아 있으면 함께 산다 */
  "imjang",
  "digest",
  /* [개선 #3, 2026-08-22] 색인을 열어 둔 두 상세 표면이 사이트맵에 없었다 —
     만들어 둔 페이지를 검색엔진에 알리지 않던 공백. 지금은 둘 다 0건이라
     optional(0개=사실)로 등록하고, 데이터가 생기는 즉시 자동으로 실린다. */
  /* 뉴스 요약 — 우리가 쓴 요약·핵심·FAQ 가 붙은 기사만 싣는다.
     원문 본문을 그대로 싣던 시절에는 색인도 사이트맵도 막는 게 맞았지만,
     상세 페이지가 우리 글로 바뀌면서(2026-08-04) 그 전제가 사라졌다.
     싣는 기준은 상세 페이지의 색인 조건과 같다 — build-sitemap.ts 의
     loadNewsEntries() 주석 참고. */
  "news",
  /* [1006] 이웃 글(이야기) 상세 /town/story/[id] — 뉴스와 라우트를 갈랐다(사람 글 전용).
     지금은 0건이 사실이라 optional. 글이 생기는 즉시 실린다. */
  "story",
  /* [1027] 정비사업 구역 상세 /redevelopment/[id] — 구역 표(redevelopment_projects)의 행마다 한 쪽.
     표가 비면 0개가 사실이라 optional(허브 /redevelopment 한 줄이 대신 실린다). */
  "redevelopment",
  /* [1083] 법정동 실거래 /dong/<지역>/<동> — 단지 3곳 · 최근 6개월 50건 이상인 동만(운영 실측 2026-10-21: 1,154곳).
     동 집계(search_area_mv)는 실거래 적재와 함께 산다 — 0개가 되는 현실적 경로는 조회 실패뿐이라 required. */
  "dongs",
] as const;

export type SitemapSectionSlug = (typeof SITEMAP_SECTION_SLUGS)[number];

/** /sitemap-complexes.xml */
export function sitemapSectionPath(slug: SitemapSectionSlug): string {
  return `/sitemap-${slug}.xml`;
}

export const SITEMAP_SECTION_PATHS: readonly string[] =
  SITEMAP_SECTION_SLUGS.map(sitemapSectionPath);

/** 인덱스 + 자식 전부 — 크롤러 엔드포인트 등록·공개 경로 허용에 쓴다. */
export const SITEMAP_INDEX_PATH = "/sitemap.xml";
export const SITEMAP_PATHS: readonly string[] = [
  SITEMAP_INDEX_PATH,
  ...SITEMAP_SECTION_PATHS,
];

/** [1082] 인덱스·robots.txt 에 싣지 않는 자식(주소는 산다 · 캐시 정책·공개 허용 목록에는 그대로) — 통짜 단지 사이트맵.
 *  lib/seo/sitemap-sections 의 indexed:false 와 같은 목록이어야 한다(테스트가 잠근다). */
export const SITEMAP_UNLISTED_SLUGS: readonly SitemapSectionSlug[] = ["complexes"];

/** robots.txt 의 Sitemap: 줄 — 인덱스 + 인덱스에 실리는 자식만. 운영 실측(2026-10-21) robots 가 통짜(23,809)와 조각 6개를
 *  함께 적으면 같은 URL 2.4만 개가 두 번 제출된다. */
export const SITEMAP_PATHS_FOR_ROBOTS: readonly string[] = [
  SITEMAP_INDEX_PATH,
  ...SITEMAP_SECTION_SLUGS.filter((s) => !SITEMAP_UNLISTED_SLUGS.includes(s)).map(sitemapSectionPath),
];
