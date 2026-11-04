import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { TOWN_POSTS_TAG } from "@/lib/town/cache-tags";
import { readNewsTagBoardPosts } from "@/lib/newui/board-posts";
import type { Post } from "@/lib/types/post";

/* [1103] 뉴스 주제 허브 20장이 **한 벌**을 나눠 읽는 데이터 캐시.
 *
 * 왜(운영 2026-10-31T23:05 · Vercel 런타임 오류): 허브 ~15장이 같은 초에 "[news-tag] … board_posts 조회 실패: TimeoutError"
 * 였다. 이 라우트는 렌더마다 board_posts 300행을 요청 단위 캐시(React cache)로만 읽는다 — 20장이 같은 목록을 따로따로 읽는다.
 * 그런데 invalidateNewsHubs()(뉴스 적재 재검증 · 신고가 · 주간 시황 · 지역 소개 크론)는 20장을 **한꺼번에** 비우므로 다음 방문·
 * 크롤·링크 프리페치가 20번의 같은 읽기를 동시에 일으킨다(그 순간 단지 화면 폭주와 겹쳐 12초 예산을 넘겼다).
 * 여기서 한 번 읽어 20장이 나눠 쓴다. 본문(content)은 읽지 않는다(lib/newui/board-posts.ts BOARD_SELECT_TAGHUB).
 *
 * 신선도: 태그 town-posts — invalidateNewsHubs() 가 이 라우트를 비우기 **직전에** invalidateTownDataCaches() 로 이 태그도 비운다
 * (lib/town/invalidate-town.ts). 그래서 적재 직후의 새 렌더는 새 목록을 읽는다. revalidate 는 화면과 같은 하루(86_400) —
 * 화면 수명을 끌어내리지 않는다(scripts/check-isr-ttl.mjs 와 같은 원칙). 실패는 던지므로 캐시에 남지 않는다. */
const readNewsTagPostsCached = unstable_cache(
  (): Promise<Post[]> => readNewsTagBoardPosts(),
  ["news-tag-hub-posts-v1"],
  { revalidate: 86_400, tags: [TOWN_POSTS_TAG] },
);

/** 뉴스 주제 허브 목록 원천 — 0건이면 빈 배열, 못 읽으면 던진다. 요청당 1회. */
export const readNewsTagHubPosts = cache((): Promise<Post[]> => readNewsTagPostsCached());
