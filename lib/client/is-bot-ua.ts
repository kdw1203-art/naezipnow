/**
 * [1007 · V2a-4/5/6] 봇 판정 — 순수 함수. 브라우저(클라이언트 섬)·엣지 미들웨어·라우트 핸들러가
 * 같은 규칙을 본다. 이 파일은 의존성이 없고 브라우저 전역을 모듈 로드 시점에 만지지 않는다.
 *
 * ── 왜 ───────────────────────────────────────────────────────────────────────
 * 실측(2026-09-19, 24h): 사람 페이지뷰 ~17/일인데 /api/metrics/web-vitals 4,350회 ·
 * /api/ai/context 1,215회 · /embed/complex/[id] 1,723회. JS 를 실행하는 크롤러(Googlebot·
 * PerplexityBot·OAI-SearchBot·Amazonbot·meta-webindexer·헤드리스 크롬 — 949 UA 표본에서 확인)가
 * 마운트 즉시 나가는 비콘·컨텍스트 조회를 그대로 일으켰다. 봇이면 부르지 않는다.
 *
 * ── 규칙 ─────────────────────────────────────────────────────────────────────
 * 1. UA 에 크롤러 표식(bot·crawl·spider·slurp·headless·lighthouse … 및 이름 목록)이 있으면 봇.
 *    `bot` 은 단어 끝(Googlebot/2.1 · Bingbot; · Twitterbot) 만 본다 — 안드로이드 제조사 Cubot
 *    (UA 에 "CUBOT NOTE 20" 처럼 실림)은 사람이므로 먼저 지운다.
 * 2. 브라우저에서는 navigator.webdriver(퍼펫티어·플레이라이트·셀레니움)도 봇.
 * 3. UA 가 비어 있으면 봇(진짜 브라우저는 UA 를 비우지 않는다 — 스크립트 요청이다).
 *
 * 넣지 않은 것: 앱인토스·카카오 인앱 웹뷰(사람), Samsung/Whale/Naver 앱 UA(사람).
 * next.config.ts htmlLimitedBots(<head> 메타 보장 목록)의 이름은 전부 이 규칙에 걸린다
 * (tests/unit/probes-1007.test.ts 가 대조한다).
 */

const BOT_RE =
  /bot\b|bot[/;)_-]|crawl|spider|slurp|headless|lighthouse|\bptst\b|pagespeed|gtmetrix|pingdom|phantomjs|puppeteer|playwright|selenium|scrapy|python-requests|python-urllib|go-http-client|okhttp|java\/|libwww|node-fetch|axios\/|undici|curl\/|wget\/|httpclient|feedfetcher|mediapartners|apis-google|-google\b|\bgoogle-[a-z]|googleother|yeti|daumoa|naverbot|bingpreview|facebookexternalhit|facebookcatalog|kakaotalk-scrap|whatsapp|skypeuripreview|vkshare|quora link preview|ia_archiver|archive\.org|baiduspider|yandex|sogou|applebot|googleweblight|gptbot|oai-searchbot|chatgpt-user|claudebot|claude-user|claude-searchbot|anthropic-ai|perplexitybot|perplexity-user|ccbot|amazonbot|meta-externalagent|meta-webindexer|cohere-ai|diffbot|timpibot|omgili|keenable|dataforseo|serpstat|barkrowler|zoominfo|imagesift|blexbot|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|tumblr|bitlybot|redditbot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot/i;

/** 사람이 쓰는 기기·앱인데 표식과 겹치는 조각 — 판정 전에 지운다 */
const HUMAN_FALSE_POSITIVES = /cubot/gi;

/** UA 문자열만으로 봇인가. 빈 값·null 은 봇으로 본다(브라우저는 UA 를 비우지 않는다). */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  if (!ua) return true;
  return BOT_RE.test(ua.replace(HUMAN_FALSE_POSITIVES, ""));
}

/** 브라우저 환경값으로 봇인가 — UA 표식 또는 자동화 드라이버. 테스트는 값을 주입한다. */
export function isLikelyBotClient(env: { userAgent: string | null | undefined; webdriver?: boolean }): boolean {
  if (env.webdriver === true) return true;
  return isBotUserAgent(env.userAgent);
}

/** 지금 이 브라우저가 봇인가. 서버 렌더에서는 "모름" 을 봇 쪽(true)으로 둔다 — 효과는 클라이언트에서만 돈다. */
export function isBotBrowser(): boolean {
  if (typeof navigator === "undefined") return true;
  return isLikelyBotClient({
    userAgent: navigator.userAgent,
    webdriver: (navigator as Navigator & { webdriver?: boolean }).webdriver === true,
  });
}
