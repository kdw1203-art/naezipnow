/**
 * [1010] 동네·커뮤니티 축 데이터 캐시 태그 — 순수 상수(서버·클라 겸용, 유닛 테스트 대상).
 *
 * ── 왜 "news" 태그를 쓰지 않는가 ───────────────────────────────────────────
 * lib/cache/invalidate.ts 의 SOURCE_MAP.news 는 태그 "news" 를 **일부러 비우지 않는다** —
 * 그 태그가 지역 축 캐시(lib/ai/live-context.ts, 218개 × 8개 조회)에도 붙어 있어서
 * 뉴스 적재마다 그쪽까지 통째로 다시 채우게 되기 때문이다. 그래서 동네 축 캐시는
 * 제 이름의 태그를 따로 갖는다: 뉴스 적재·이웃 글 쓰기에서 **이 캐시들만** 비운다.
 *
 * ── 왜 태그가 필요해졌나 (실측) ───────────────────────────────────────────
 * unstable_cache 의 revalidate 는 그 캐시를 읽는 **라우트의 revalidate 를 끌어내린다**
 * (Next 는 둘 중 작은 값을 쓴다). 빌드 산출물로 확인: app/town/news/page.tsx 의
 * `export const revalidate = 21_600` 인데 .next/prerender-manifest.json 의
 * `/town/news` 는 3600 이었다 — 그 페이지가 읽는 주간 다이제스트 캐시(3600)가
 * 페이지 TTL 을 대신 정하고 있었다는 뜻이다. 데이터 캐시 TTL 을 같이 올리지 않으면
 * 라우트 TTL 을 올려도 아무 일도 일어나지 않는다. 대신 올린 TTL 만큼은 태그로 비운다.
 */

/**
 * 동네 글 병합 목록(`related-town-posts-v1`) — 자동수집 뉴스 + 이웃 글을 합친 공용 한 벌.
 * 비우는 지점: 뉴스 적재 재검증 크론 · 뉴스 성격의 글을 싣는 크론 · 이웃 글 작성/수정/삭제.
 */
export const TOWN_POSTS_TAG = "town-posts";

/**
 * 주간 다이제스트(`newui-weekly-digest-v2`) — 이번 주 뉴스·주요 지역·이웃 글 건수 요약.
 * 비우는 지점: TOWN_POSTS_TAG 와 같다(같은 원천에서 나온다).
 */
export const WEEKLY_DIGEST_TAG = "weekly-digest";

/** 동네 축 데이터 캐시 태그 전부 — 비우는 쪽이 하나씩 빠뜨리지 않도록 한 곳에 모은다. */
export const TOWN_DATA_CACHE_TAGS: readonly string[] = [TOWN_POSTS_TAG, WEEKLY_DIGEST_TAG];
