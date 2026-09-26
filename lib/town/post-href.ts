/**
 * [1007 · P2] 글 한 건의 상세 주소 — 순수 헬퍼(의존성 0, 클라이언트·서버·테스트 공용).
 *
 * 왜: 1006 이 이웃 글 상세를 `/town/story/[id]` 로 분리했지만, 검색·다이제스트·댓글
 * 알림·관리자·글감 스레드는 여전히 `/town/news/${id}` 를 만들고 있었다. 뉴스 상세가
 * 사람 글 id 를 받으면 `/town/story/` 로 영구 이동하므로 **동작은** 했지만, 사람 글마다
 * 왕복(리다이렉트) 한 번 + 서버 함수 호출 한 번이 더 붙었다(실측: /town/news/[id] 가
 * 24h 서버리스 호출 985회 — 크롤러가 옛 링크를 따라오는 몫이 그 안에 있다).
 * 링크를 만드는 곳이 이 함수 하나를 부르면 첫 요청부터 바른 주소로 간다.
 *
 * 판정은 `lib/town/story.ts` 의 isStoryPost 와 **같은 것**이다 — 그 파일이 여기서
 * 다시 내보낸다(server-only 모듈을 클라이언트 번들·테스트에 끌고 오지 않기 위해
 * 규칙 본체를 이쪽에 둔다).
 */

/** 판정에 필요한 최소 모양 — Post 와 구조적으로 호환된다 */
export type PostHrefInput = {
  id: string;
  /** true = 자동수집 기사(뉴스). undefined/false = 사람이 쓴 글(이야기) */
  isAutomated?: boolean | null;
};

/** 사람이 쓴 글인가 — 자동수집(뉴스)이 아닌 것. 피드·동네 홈·상세·사이트맵이 같은 판정을 쓴다. */
export function isStoryPost(p: { isAutomated?: boolean | null }): boolean {
  return p.isAutomated !== true;
}

/** 이야기(이웃 글) 상세 — id 만 알 때(posts 표만 읽는 화면: 관리자·다이제스트 커뮤니티 칸) */
export function storyHref(id: string): string {
  return `/town/story/${encodeURIComponent(id)}`;
}

/** 뉴스 상세 — 자동수집 기사만 */
export function newsHref(id: string): string {
  return `/town/news/${encodeURIComponent(id)}`;
}

/**
 * 글 → 상세 주소. 사람 글이면 `/town/story/{id}`, 자동수집 기사면 `/town/news/{id}`.
 * 댓글 앵커 등은 호출부가 뒤에 붙인다(`${postHref(p)}#comments`).
 */
export function postHref(p: PostHrefInput): string {
  return isStoryPost(p) ? storyHref(p.id) : newsHref(p.id);
}
