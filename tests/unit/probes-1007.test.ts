import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  AUTHED_HINT_COOKIE,
  authedHintFromSetCookies,
  authedHintSetCookieHeader,
  decideAuthedHint,
  hasAuthedHint,
  hasSessionCookieName,
  readAuthedHint,
} from "../../lib/auth/authed-hint.ts";
import {
  EDGE_LOGIN_GUARD_PREFIXES,
  EDGE_LOGIN_GUARD_SERVER_FILES,
  loginRedirectHref,
  needsLoginAtEdge,
} from "../../lib/auth/edge-login-guard.ts";
import { isBotUserAgent, isLikelyBotClient } from "../../lib/client/is-bot-ua.ts";
import { BLOCKED_CRAWLERS } from "../../lib/security/blocked-crawlers.ts";
import { envVapidPublicKey } from "../../lib/push/subscribe-client.ts";

/* 1007 · V2a — 클라이언트 프로브·비콘·미들웨어·봇.
   실측(2026-09-19, 24h): 사람 페이지뷰 ~17/일인데 /api/metrics/web-vitals 4,350 · /api/auth/session 1,299 ·
   /api/ai/context 1,215 · unread-count 982 · push/subscribe 943 · /embed 1,723 · /my/analyses 367 —
   JS 를 실행하는 크롤러가 마운트 즉시 나가는 조회를 그대로 일으켰다. 아래는 그 차단 규칙의 순수 부분. */

const read = (p: string) => readFileSync(p, "utf8");

/* ── 1. 로그인 힌트 쿠키 ─────────────────────────────────────────────────── */

test("decideAuthedHint — 세션·힌트가 다를 때만 set/clear, 같으면 null(Set-Cookie 없음 = CDN 캐시 유지)", () => {
  assert.equal(decideAuthedHint({ hasSession: true, hasHint: false }), "set");
  assert.equal(decideAuthedHint({ hasSession: false, hasHint: true }), "clear");
  assert.equal(decideAuthedHint({ hasSession: true, hasHint: true }), null);
  assert.equal(decideAuthedHint({ hasSession: false, hasHint: false }), null);
});

test("hasSessionCookieName — Auth.js v5 기본 이름·Secure 접두·레거시·청크(.0/.1)를 세션으로 본다", () => {
  assert.equal(hasSessionCookieName(["authjs.session-token"]), true);
  assert.equal(hasSessionCookieName(["__Secure-authjs.session-token"]), true);
  assert.equal(hasSessionCookieName(["next-auth.session-token"]), true);
  assert.equal(hasSessionCookieName(["__Secure-authjs.session-token.0", "__Secure-authjs.session-token.1"]), true);
  assert.equal(hasSessionCookieName(["authjs.csrf-token", "authjs.callback-url", "nz_cookie_consent"]), false);
  assert.equal(hasSessionCookieName(["authjs.session-token.abc"]), false);
  assert.equal(hasSessionCookieName([]), false);
});

test("authedHintFromSetCookies — 로그인 응답(세션 심음)은 set, 로그아웃 응답(빈 값·Max-Age=0)은 clear, 세션 줄 없음은 null", () => {
  assert.equal(
    authedHintFromSetCookies([
      "authjs.csrf-token=abc; Path=/; HttpOnly; SameSite=Lax",
      "authjs.session-token=eyJ.jwt; Path=/; Expires=Tue, 20 Oct 2026 00:00:00 GMT; Max-Age=2592000; HttpOnly; SameSite=Lax",
    ]),
    "set",
  );
  assert.equal(authedHintFromSetCookies(["__Secure-authjs.session-token=eyJ.jwt; Path=/; HttpOnly; Secure; SameSite=Lax"]), "set");
  assert.equal(authedHintFromSetCookies(["authjs.session-token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly"]), "clear");
  assert.equal(authedHintFromSetCookies(["authjs.session-token=eyJ.jwt; Path=/; Max-Age=0"]), "clear");
  /* 청크 쿠키 */
  assert.equal(authedHintFromSetCookies(["__Secure-authjs.session-token.0=aaa; Path=/", "__Secure-authjs.session-token.1=bbb; Path=/"]), "set");
  assert.equal(authedHintFromSetCookies(["authjs.callback-url=http%3A%2F%2Flocalhost; Path=/; HttpOnly"]), null);
  assert.equal(authedHintFromSetCookies([]), null);
  /* 지우는 줄과 심는 줄이 같이 오면(청크 정리) 심는 쪽이 이긴다 */
  assert.equal(authedHintFromSetCookies(["authjs.session-token.1=; Max-Age=0", "authjs.session-token=eyJ; Max-Age=100"]), "set");
});

test("authedHintSetCookieHeader — 미들웨어의 속성(Path=/·SameSite=Lax·Secure·1년/0초)과 같다", () => {
  assert.equal(authedHintSetCookieHeader("set", true), "nz_authed=1; Max-Age=31536000; Path=/; SameSite=Lax; Secure");
  assert.equal(authedHintSetCookieHeader("clear", false), "nz_authed=; Max-Age=0; Path=/; SameSite=Lax");
  assert.ok(!authedHintSetCookieHeader("set", true).includes("HttpOnly"), "클라이언트가 읽어야 하므로 HttpOnly 가 아니다");
});

test("hasAuthedHint — document.cookie 꼴에서 nz_authed=1 만 참(다른 값·유사 이름은 거짓)", () => {
  assert.equal(hasAuthedHint(`a=1; ${AUTHED_HINT_COOKIE}=1; b=2`), true);
  assert.equal(hasAuthedHint(`${AUTHED_HINT_COOKIE}=1`), true);
  assert.equal(hasAuthedHint(`${AUTHED_HINT_COOKIE}=0`), false);
  assert.equal(hasAuthedHint(`x${AUTHED_HINT_COOKIE}=1`), false);
  assert.equal(hasAuthedHint(""), false);
  assert.equal(hasAuthedHint(null), false);
  /* 서버(문서 없음)에서는 "조회하지 않는다" 쪽 */
  assert.equal(readAuthedHint(), false);
});

test("세션 관문 — getSessionLite 는 힌트를 먼저 보고, 벨·최근 본 단지도 같은 힌트를 본다", () => {
  const lite = read("lib/client/session-lite.ts");
  assert.ok(lite.includes("readAuthedHint()"), "session-lite 가 힌트를 읽지 않음");
  assert.ok(lite.indexOf("readAuthedHint()") < lite.indexOf('fetch("/api/auth/session")'), "힌트 판정이 fetch 앞이어야 한다");
  const bell = read("app/components/NotificationBell.tsx");
  assert.ok(bell.indexOf("readAuthedHint()") < bell.indexOf('fetch("/api/notifications/unread-count"'));
  const recents = read("app/components/RecentComplexes.tsx");
  assert.equal((recents.match(/readAuthedHint\(\)/g) ?? []).length >= 2, true, "POST·DELETE 둘 다 힌트를 봐야 한다");
});

/* ── 2. 봇 판정 ──────────────────────────────────────────────────────────── */

const HUMAN_UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/30.0 Chrome/143.0.0.0 Mobile Safari/537.36",
  /* 안드로이드 제조사 Cubot — "bot" 이 들어가지만 사람이다 */
  "Mozilla/5.0 (Linux; Android 11; CUBOT NOTE 20) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 10; CUBOT_X30 Build/QP1A.190711.020) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36",
  /* 카카오톡·네이버 인앱 웹뷰, DuckDuckGo 브라우저 — 사람 */
  "Mozilla/5.0 (Linux; Android 13; SM-S918N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 KAKAOTALK/10.4.5",
  "Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.8.5)",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 DuckDuckGo/7 Safari/605.1.15",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:147.0) Gecko/20100101 Firefox/147.0",
];

const BOT_UAS = [
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.8010.47 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot) Chrome/119.0.6045.214 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36; compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 (compatible; meta-webindexer/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler))",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; KeenableBot/1.0; +https://keenable.ai/)",
  "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/150.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse",
  "Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)",
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "python-requests/2.32.3",
  "curl/8.5.0",
  "Mozilla/5.0 (compatible; Google-Extended)",
  "AdsBot-Google (+http://www.google.com/adsbot.html)",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "",
];

test("isBotUserAgent — 크롤러·헤드리스·스크립트·빈 UA 는 봇, 브라우저·인앱·Cubot 은 사람", () => {
  for (const ua of BOT_UAS) assert.equal(isBotUserAgent(ua), true, `봇이어야 함: ${ua || "(빈 UA)"}`);
  for (const ua of HUMAN_UAS) assert.equal(isBotUserAgent(ua), false, `사람이어야 함: ${ua}`);
  assert.equal(isBotUserAgent(null), true);
  assert.equal(isBotUserAgent(undefined), true);
});

test("isLikelyBotClient — navigator.webdriver 가 참이면 UA 가 사람이어도 봇", () => {
  assert.equal(isLikelyBotClient({ userAgent: HUMAN_UAS[0], webdriver: true }), true);
  assert.equal(isLikelyBotClient({ userAgent: HUMAN_UAS[0], webdriver: false }), false);
  assert.equal(isLikelyBotClient({ userAgent: BOT_UAS[0] }), true);
});

test("봇 판정 — next.config.ts htmlLimitedBots(<head> 메타 보장 목록)의 이름은 전부 봇으로 잡는다", () => {
  const cfg = read("next.config.ts");
  const m = /const HTML_LIMITED_BOTS =\s*\/(.+)\/i;/.exec(cfg);
  assert.ok(m, "HTML_LIMITED_BOTS 정규식을 찾지 못함");
  /* 이름 항목만(패턴 조각 `[\w-]+-Google` 류는 제외) — 이름을 UA 로 넣어 본다 */
  const names = m[1].split("|").filter((n) => !/[\\[\]]/.test(n));
  assert.ok(names.length > 30);
  for (const n of names) assert.equal(isBotUserAgent(`Mozilla/5.0 (compatible; ${n}/1.0)`), true, `${n} 이 봇으로 안 잡힘`);
  /* 패턴 조각의 대표값도 */
  assert.equal(isBotUserAgent("Mediapartners-Google"), true);
  assert.equal(isBotUserAgent("Google-InspectionTool/1.0"), true);
});

test("봇 판정 — 차단 크롤러 표(BLOCKED_CRAWLERS)도 전부 잡힌다(임베드 403·비콘 거름망이 같은 규칙)", () => {
  for (const n of BLOCKED_CRAWLERS) assert.equal(isBotUserAgent(`Mozilla/5.0 (compatible; ${n}/1.0)`), true, n);
});

/* ── 3. 미들웨어 매처 ────────────────────────────────────────────────────── */

type MatcherEntry = string | { source: string; has?: { type: string; key: string; value?: string }[] };

function loadMiddlewareMatchers(): MatcherEntry[] {
  const src = read("middleware.ts");
  const start = src.indexOf("export const config = {");
  assert.ok(start > 0, "middleware config 를 찾지 못함");
  const body = src.slice(start + "export const config =".length);
  const end = body.indexOf("\n};");
  assert.ok(end > 0);
  const literal = body.slice(0, end + 2);
  const cfg = new Function(`return (${literal});`)() as { matcher: MatcherEntry[] };
  assert.ok(Array.isArray(cfg.matcher));
  return cfg.matcher;
}

test("매처 — 차단 크롤러 UA 매처는 BLOCKED_CRAWLERS 12개 이름과 정확히 같다(정적 문자열이라 손으로 적는다)", () => {
  const matchers = loadMiddlewareMatchers();
  const ua = matchers.find(
    (m): m is Exclude<MatcherEntry, string> =>
      typeof m === "object" && (m.has ?? []).some((h) => h.key === "user-agent" && typeof h.value === "string"),
  );
  assert.ok(ua, "user-agent 조건 매처가 없음");
  const value = ua.has!.find((h) => h.key === "user-agent")!.value!;
  const inner = /\(\?:(.+)\)/.exec(value);
  assert.ok(inner);
  const names = inner[1].split("|");
  assert.deepEqual([...names].sort(), [...BLOCKED_CRAWLERS].sort());
  /* Next 는 `^value$` 로 감싸 앵커한다 — 앞뒤 `.*` 가 있어야 UA 중간의 이름이 걸린다 */
  assert.ok(value.startsWith(".*") && value.endsWith(".*"));
});

test("매처 — Next 의 실제 매처 컴파일러로: 문서·RSC 는 걸리고, Origin 없는 API GET 은 안 걸리고, admin·Origin·차단UA API 는 걸린다", () => {
  const require = createRequire(import.meta.url);
  const { getMiddlewareMatchers } = require("next/dist/build/analysis/get-page-static-info.js") as {
    getMiddlewareMatchers: (m: unknown, cfg: Record<string, unknown>) => { regexp: string; has?: unknown[]; missing?: unknown[] }[];
  };
  const { getMiddlewareRouteMatcher } = require("next/dist/shared/lib/router/utils/middleware-route-matcher.js") as {
    getMiddlewareRouteMatcher: (m: unknown[]) => (pathname: string, req: { headers: Record<string, string> }, query: Record<string, string>) => boolean;
  };
  const compiled = getMiddlewareMatchers(loadMiddlewareMatchers(), {});
  const match = getMiddlewareRouteMatcher(compiled);
  const req = (headers: Record<string, string> = {}) => ({ headers });

  /* 문서·화면·RSC — 미들웨어가 돈다(보안 헤더·리다이렉트·힌트·가드) */
  for (const p of ["/", "/complex/abc", "/my/analyses", "/embed/complex/x", "/index", "/town/news/1", "/login", "/complex/abc.rsc"]) {
    assert.equal(match(p, req(), {}), true, `돌아야 함: ${p}`);
  }
  /* 정적 자산·크롤러 파일 — 예전과 같이 제외 */
  for (const p of ["/_next/static/a.js", "/robots.txt", "/sitemap.xml", "/icons/a.png", "/logo.png", "/sw.js"]) {
    assert.equal(match(p, req(), {}), false, `빠져야 함: ${p}`);
  }
  /* API — Origin 없는 GET(봇·같은 출처 GET)은 미들웨어를 타지 않는다 */
  for (const p of ["/api/metrics/web-vitals", "/api/auth/session", "/api/og/complex", "/api/ai/context", "/api/cron/x", "/api/push/subscribe"]) {
    assert.equal(match(p, req({ "user-agent": HUMAN_UAS[0] }), {}), false, `API 는 빠져야 함: ${p}`);
  }
  /* ① 관리자 API 는 속도 제한 때문에 항상 */
  assert.equal(match("/api/admin/ops", req(), {}), true);
  assert.equal(match("/api/admin", req(), {}), true);
  /* ② Origin 이 실린 요청(미니앱 CORS·preflight·같은 출처 POST)은 탄다 */
  assert.equal(match("/api/metrics/web-vitals", req({ origin: "https://nuguzip.apps.tossmini.com" }), {}), true);
  assert.equal(match("/api/push/subscribe", req({ origin: "https://naezipnow.com" }), {}), true);
  /* ③ 차단 크롤러 UA 는 403 을 위해 탄다 */
  assert.equal(match("/api/og/complex", req({ "user-agent": "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)" }), {}), true);
  assert.equal(match("/api/og/complex", req({ "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" }), {}), false);
});

/* ── 4. 엣지 로그인 가드 ───────────────────────────────────────────────── */

test("needsLoginAtEdge — 서버가 redirect 하는 화면만, 안내 화면(GuestGate)이 있는 /my·/my/points 등은 아니다", () => {
  assert.equal(needsLoginAtEdge("/my/analyses"), true);
  assert.equal(needsLoginAtEdge("/my/analyses/123"), true);
  assert.equal(needsLoginAtEdge("/admin"), true);
  assert.equal(needsLoginAtEdge("/admin/perf"), true);
  assert.equal(needsLoginAtEdge("/my"), false);
  assert.equal(needsLoginAtEdge("/my/points"), false);
  assert.equal(needsLoginAtEdge("/my/settings"), false);
  assert.equal(needsLoginAtEdge("/my/analysesx"), false);
  assert.equal(needsLoginAtEdge("/admin-dashboard"), false); // 레거시 표가 먼저 /admin 으로 보낸다
  assert.equal(needsLoginAtEdge("/"), false);
});

test("엣지 가드 목록의 화면은 서버 가드도 redirect(\"/login…\") 다 — 안내 화면으로 바뀌면 여기서 걸린다", () => {
  for (const p of EDGE_LOGIN_GUARD_PREFIXES) {
    const file = EDGE_LOGIN_GUARD_SERVER_FILES[p];
    const src = read(file);
    assert.ok(/redirect\(\s*["'`]\/login/.test(src), `${file} 이 /login 으로 redirect 하지 않음 — 엣지 가드 목록에서 빼야 한다`);
    assert.ok(!/GuestGate|GuestView/.test(src), `${file} 에 안내 화면이 있다 — 엣지에서 자르면 그 화면이 사라진다`);
  }
});

test("loginRedirectHref — /login 이 읽는 callbackUrl 로, 쿼리까지 되돌아온다", () => {
  assert.equal(loginRedirectHref("/my/analyses", ""), "/login?callbackUrl=%2Fmy%2Fanalyses");
  assert.equal(loginRedirectHref("/my/analyses", "?tab=x"), "/login?callbackUrl=%2Fmy%2Fanalyses%3Ftab%3Dx");
  assert.equal(loginRedirectHref("/admin/perf", "?"), "/login?callbackUrl=%2Fadmin%2Fperf");
  /* 로그인 화면은 callbackUrl 만 읽는다 */
  assert.ok(read("app/login/LoginClient.tsx").includes('get("callbackUrl")'));
});

/* ── 5. 푸시 공개키·비콘·임베드 ─────────────────────────────────────────── */

test("envVapidPublicKey — NEXT_PUBLIC_VAPID_PUBLIC_KEY 가 있을 때만 키(서버 GET 의 enabled 판정과 같다)", () => {
  const prev = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  try {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    assert.equal(envVapidPublicKey(), null);
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "  ";
    assert.equal(envVapidPublicKey(), null);
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "BKey";
    assert.equal(envVapidPublicKey(), "BKey");
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    else process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = prev;
  }
  /* 서버 활성 판정의 근거 — 같은 변수 하나 */
  assert.ok(read("lib/push/vapid.ts").includes("return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;"));
});

test("PushSubscribe — 마운트 때 공개키 GET 을 하지 않는다(누를 때 subscribeToPush 가 인라인 키를 쓴다)", () => {
  const src = read("components/PushSubscribe.tsx");
  assert.ok(!src.includes("fetchVapidPublicKey"), "마운트 GET 이 남아 있음");
  assert.ok(src.includes("envVapidPublicKey()"));
  assert.ok(src.includes("subscribeToPush()"));
  /* 전체 메뉴는 처음 열릴 때부터 마운트한다 */
  const menu = read("app/components/MobileMenu.tsx");
  assert.ok(menu.includes("{everOpened && <PushSubscribe />}"));
});

test("WebVitalsReporter — 봇이면 걸지 않고, 표본은 큐에 모아 숨을 때 한 번 보낸다(지표별 POST 없음)", () => {
  const src = read("app/components/WebVitalsReporter.tsx");
  assert.ok(src.includes("if (isBotBrowser()) return;"));
  assert.equal((src.match(/navigator\.sendBeacon\(/g) ?? []).length, 1, "sendBeacon 호출은 한 곳(sendQueued)뿐이어야 한다");
  assert.ok(src.includes("enqueue(ledger.enterRoute("), "화면 이동분은 큐에만");
  assert.ok(/enqueue\(ledger\.flush\(now\(\)\)\);\s*\n[^\n]*\n?\s*sendQueued\(\);/.test(src), "숨을 때 flush → sendQueued");
  const route = read("app/api/metrics/web-vitals/route.ts");
  assert.ok(route.includes("Array.isArray(body)"), "서버가 배열 본문을 받아야 한다");
  assert.ok(route.indexOf("isBotUserAgent(ua)") < route.indexOf("rateLimit("), "봇 204 는 속도 제한보다 앞");
  assert.ok(route.includes("status: 204"));
});

test("임베드 — robots 는 /embed 를 막고, 미들웨어는 크롤러 UA 에 403(사람 iframe 은 통과)", () => {
  const robots = read("app/robots.ts");
  assert.ok((robots.match(/"\/embed"/g) ?? []).length >= 2, "`*` 그룹과 AI 봇 그룹 둘 다");
  const mw = read("middleware.ts");
  assert.ok(mw.includes('request.nextUrl.pathname.startsWith("/embed/") && isBotUserAgent('));
  assert.ok(mw.includes('"/notes/new" && Math.random()') === false, "/notes/new UA 표본 로그는 제거돼야 한다");
  assert.ok(mw.includes("Math.random() < 0.01"), "단지 UA 표본은 1% 로");
  for (const f of ["app/embed/layout.tsx", "app/embed/complex/[id]/page.tsx", "app/embed/region/[id]/page.tsx"]) {
    assert.ok(read(f).includes("robots: { index: false, follow: false }"), `${f} noindex`);
  }
});
