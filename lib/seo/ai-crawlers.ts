/**
 * [1006 · E] AI 검색·사용자 대리 크롤러 표 — app/robots.ts 가 이 표로 명시 허용 그룹을 낸다.
 *
 * 왜 표로 뺐나: robots.txt 규칙은 "UA 에 맞는 그룹이 있으면 그 그룹만 본다". 예전엔
 * GPTBot·ClaudeBot 등 6개만 그룹이 있었고, 답변 시점에 페이지를 직접 읽는 **사용자 대리
 * 봇**(ChatGPT-User·Claude-User·Perplexity-User)과 검색 색인용 봇(Claude-SearchBot)은
 * 그룹이 없어 `*` 규칙으로 떨어졌다. `*` 도 공개 영역은 열려 있어 실질 차단은 아니었지만,
 * `*` 는 /notes/new·/widget·/analysis/price 류를 더 막고 있어 AI 봇 그룹과 규칙이 달랐다.
 * 이제 같은 규칙(개인 영역만 차단)을 한 표에서 낸다.
 *
 * 기준(2026-08-23 소유자 승인 판단 유지):
 *  - 연다: 검색 인용·답변 생성에 쓰이는 봇. 열어야 인용된다(GEO 의 전제).
 *  - 열지 않는다(여기 없음): meta-externalagent 처럼 학습 전용이면서 실측 낭비가 컸던 봇
 *    (app/robots.ts 에서 전면 차단), Applebot-Extended(Applebot 이 긁은 것을 학습에 쓸지
 *    정하는 토큰 — 검색 봇 Applebot 자체는 `*` 로 열려 있다).
 *  - GPTBot·CCBot·Google-Extended 는 학습 성격도 있지만 기존 허용 판단을 바꾸지 않는다.
 *
 * next.config.ts 의 htmlLimitedBots(<head> 메타 보장 목록)에도 같은 이름이 있어야 한다 —
 * 아래 이름은 전부 그 정규식에 들어 있다(tests/unit/seo-1006.test.ts 가 대조한다).
 */
export const AI_SEARCH_CRAWLERS = [
  /* 기존 6종 */
  "GPTBot",
  "OAI-SearchBot",
  "ClaudeBot",
  "CCBot",
  "PerplexityBot",
  "Google-Extended",
  /* [1006] 검색 색인·사용자 대리 봇 — 답변에 인용될 때 페이지를 직접 읽는 쪽 */
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "Perplexity-User",
  /* Alexa·Amazon 검색 — 일반 크롤러이나 학습 전용이 아니다 */
  "Amazonbot",
] as const;

export type AiSearchCrawler = (typeof AI_SEARCH_CRAWLERS)[number];
