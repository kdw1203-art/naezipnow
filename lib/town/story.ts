/**
 * [1006] 이야기(이웃 글) 판정·조회 — 서버 전용.
 *
 * 판정은 하나다: **`isAutomated` 가 아니면 이야기**(isStoryPost). 피드(lib/town/feed.ts
 * loadPostCards)·동네 홈(/town/[region])·뉴스룸 조립기(isNewsPost 의 반대)가 전부 이 판정으로
 * 사람 글과 기사를 가르고, 상세도 같은 판정을 써야 카드가 건 `/town/story/[id]` 링크가
 * 404 로 떨어지지 않는다. 그래서 단건 조회는 posts 스토어만 보지 않고 목록과 같은 소스
 * (getTownPost = posts + board_posts)에서 찾은 뒤 판정을 건다 — board_posts 에 비자동
 * community 행이 있어도(지금 운영 0건) 목록과 상세가 같은 답을 낸다.
 *
 * 뉴스 상세(/town/news/[id])는 같은 getTownPost 결과에 isStoryPost 를 걸어 이야기면
 * /town/story 로 영구 리다이렉트한다(옛 링크 보호). getTownPost 는 요청당 1회 캐시라
 * generateMetadata·본문·리다이렉트 판정이 한 번의 조회를 나눠 쓴다.
 * 실패는 던진다(두 스토어의 규칙) — 못 읽은 것을 404 로 위장하지 않는다.
 */
import { cache } from "react";
import { getTownPost, readTownPosts } from "@/lib/newui/board-posts";
import { listHiddenPostIds } from "@/lib/moderation/reports-store";
import type { Post } from "@/lib/types/post";

/* [1007 · P2] 판정 본체는 lib/town/post-href.ts(순수·의존성 0)로 옮겼다 — 검색 클라이언트·
   테스트가 같은 규칙으로 링크를 만들어야 하는데 이 파일은 server-only 스토어를 끌고 온다.
   같은 이름으로 다시 내보내므로 피드·동네 홈·상세·사이트맵의 import 는 그대로다. */
export { isStoryPost } from "@/lib/town/post-href";
import { isStoryPost } from "@/lib/town/post-href";

/** 단건 — 없으면 null, 못 읽으면 던진다. 자동수집 글(뉴스)은 이야기로 치지 않는다(null). */
export const getStoryPost = cache(async (id: string): Promise<Post | null> => {
  const p = await getTownPost(id);
  return p && isStoryPost(p) ? p : null;
});

/**
 * 공개 이야기 목록(최신순) — 숨김(신고 누적)·link_only 제외.
 * 상세의 "다른 이웃 글" · 사이트맵 로더가 쓴다. 소스·판정은 피드(lib/town/feed.ts loadPostCards)와
 * 같다(readTownPosts + isStoryPost + link_only 제외). 실패는 던진다.
 */
export const listStoryPosts = cache(async (limit = 50): Promise<Post[]> => {
  const posts = (await readTownPosts()).filter(isStoryPost).filter((p) => p.visibility !== "link_only");
  const hidden = await listHiddenPostIds(posts.map((p) => p.id)).catch(() => new Set<string>());
  return posts
    .filter((p) => !hidden.has(p.id))
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
    .slice(0, Math.max(1, limit));
});
