/* [950 · 운영 필수 11] 가치 없는 크롤러 표 — robots.txt(전면 disallow)와 미들웨어(403)가
 * 같은 표를 본다.
 *
 * 기준: (1) 검색 유입을 만들지 않는다 (SEO 분석 도구·링크 색인·데이터 수집)
 *       (2) 공개적으로 UA 를 밝힌다(정직한 봇만 이름으로 막을 수 있다)
 * 넣지 않는 것: Googlebot·Naver(Yeti)·Bingbot·Daum·DuckDuckBot 같은 검색엔진,
 * 카카오·페이스북·트위터 공유 미리보기 봇, GPTBot·ClaudeBot·PerplexityBot 같은
 * AI 검색 인용 봇(소유자 승인으로 열어 둔 상태 — app/robots.ts 주석).
 *
 * 실측 근거: 단지 허브 함수 호출 6,034회/일 중 대부분이 1.5초 간격의 롱테일
 * 크롤이었다(2026-09-02). 정체는 949 의 UA 표본 로그로 확인하고, 이 표는 그 결과와
 * 무관하게 "트래픽을 주지 않는 봇"만 담는다. */
export const BLOCKED_CRAWLERS = [
  "AhrefsBot",
  "SemrushBot",
  "MJ12bot",
  "DotBot",
  "BLEXBot",
  "DataForSeoBot",
  "serpstatbot",
  "Barkrowler",
  "ZoominfoBot",
  "PetalBot",
  "Bytespider",
  "ImagesiftBot",
  /* [1087 · 비용] Meta AI 검색 색인 봇 — 공유 미리보기(facebookexternalhit)·학습(meta-externalagent, robots 전면 차단)과
     다른 토큰이다. 운영 실측(2026-10-22~23 단지 화면 UA 1% 표본 100건): 59건이 이 봇 — 단지 2.4만 곳을 1~2초 간격으로 훑어
     ISR 렌더(쓰기)·오리진 전송 비용의 가장 큰 몫이었고, 그날 요금 한도로 프로젝트가 일시 정지됐다. 국내 검색 유입은 없다.
     AI 검색 인용 봇(GPTBot·OAI-SearchBot·ClaudeBot·PerplexityBot 등 — lib/seo/ai-crawlers.ts)은 그대로 연다. */
  "meta-webindexer",
] as const;

const BLOCKED_RE = new RegExp(BLOCKED_CRAWLERS.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");

/** 차단 대상 UA 인가 — 대소문자 무시, 부분 일치 */
export function isBlockedCrawler(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return BLOCKED_RE.test(userAgent);
}
