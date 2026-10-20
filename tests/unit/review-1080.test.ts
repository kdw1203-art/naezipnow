/* [1080] 소유자 2026-10-19 — "방문자를 늘렸을 때 예상되는 문제 30가지 … 전부 검토해서 해결". 코드로 끝나는 것:
 *  K  공용 KV 클라이언트(lib/kv/rest) — UPSTASH_* 또는 Vercel KV(KV_REST_API_*) 둘 다 읽는다.
 *  14 속도 제한이 KV 고정 창(인스턴스를 가로질러) — 인라인 Upstash 두 벌 제거.
 *  17 AI 사이트 전체 일일 상한(AI_DAILY_REQUEST_BUDGET) — 모델을 부르는 길목 7곳 · 분석은 규칙 기반 강등 · 모델 대기 90초.
 *  18·30 썸네일 KV 캐시(30일 · 실패 6시간) + 끄기 스위치 NEWS_THUMB_DISABLED.
 *  7  이벤트 표 보존 크론(90일) · 8 조회수 KV 버퍼 + 시간 단위 반영(매물은 렌더 중 쓰기 제거) · 9 뉴스 더 보기 데이터 캐시 ·
 *  11 검색 속도 제한·CDN · 19 길찾기 KV 캐시·일일 상한 · 20 청약홈 속도 제한·CDN · 24 알림 크론 주기(15분·6시간) + 잡기(CAS) ·
 *  25 토론 폴링 간격 30→60→120초 · 29 site-probe 3시간 · 1 로봇 비콘 행 생성 중단 · 4 이미지 캐시 30일 · 15 Turnstile 가입 캡차 ·
 *  outbox-drain 인가 공용화(x-vercel-cron 헤더 신뢰 제거) · /api/health kv 칸. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kvAvailable, kvConfig, kstDayKey } from "@/lib/kv/rest";
import { aiDailyBudget, consumeAiDailyBudget, secondsUntilKstMidnight } from "@/lib/ai/global-budget";
import { bufferView, parseViewBufferKey, viewBufferKey } from "@/lib/views/buffer";
import { talkPollDelayMs, TALK_POLL_MAX_MS, TALK_POLL_MS } from "@/lib/talk/rules";
import { turnstileSiteKey, TURNSTILE_ORIGIN } from "@/lib/auth/turnstile-site-key";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

test("K KV 클라이언트 — 두 변수 이름 · 미설정이면 사용 불가 · 한국 날짜 키", () => {
  const saved = { ...process.env };
  try {
    for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"]) delete process.env[k];
    assert.equal(kvConfig(), null);
    assert.equal(kvAvailable(), false);
    process.env.KV_REST_API_URL = "https://example-kv.invalid/";
    process.env.KV_REST_API_TOKEN = "t";
    assert.deepEqual(kvConfig(), { url: "https://example-kv.invalid", token: "t" });
    process.env.UPSTASH_REDIS_REST_URL = "https://example-upstash.invalid";
    process.env.UPSTASH_REDIS_REST_TOKEN = "u";
    assert.equal(kvConfig()?.url, "https://example-upstash.invalid", "UPSTASH 가 먼저");
  } finally {
    process.env = saved;
  }
  assert.equal(kstDayKey(Date.UTC(2026, 9, 19, 14, 59)), "20261019"); // 23:59 KST
  assert.equal(kstDayKey(Date.UTC(2026, 9, 19, 15, 1)), "20261020"); // 00:01 KST
});

test("14 속도 제한 — 인라인 Upstash 제거 · 두 길 다 공용 KV 고정 창 · 없으면 메모리", () => {
  const src = read("lib/rate-limit.ts");
  assert.match(src, /import \{ kvAvailable, kvIncrWindow \} from "@\/lib\/kv\/rest";/);
  assert.doesNotMatch(src, /UPSTASH_REDIS_REST_URL\?\.trim\(\)/);
  assert.doesNotMatch(src, /\/pipeline/);
  assert.equal((src.match(/if \(kvAvailable\(\)\)/g) ?? []).length, 2);
  assert.match(src, /const count = await kvIncrWindow\(key, windowMs \/ 1000\);/);
  assert.match(src, /return \{ \.\.\.memoryRateLimit\(key, max, windowMs\), degraded: false \};/);
});

test("17 AI 일일 상한 — 변수 해석 · 메모리 폴백 · Retry-After · 라우트 7곳 · 모델 대기 상한", async () => {
  const saved = { ...process.env };
  try {
    delete process.env.AI_DAILY_REQUEST_BUDGET;
    assert.equal(aiDailyBudget(), null);
    process.env.AI_DAILY_REQUEST_BUDGET = "0";
    assert.equal(aiDailyBudget(), null);
    process.env.AI_DAILY_REQUEST_BUDGET = "2";
    for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"]) delete process.env[k];
    const r1 = await consumeAiDailyBudget("test");
    const r2 = await consumeAiDailyBudget("test");
    const r3 = await consumeAiDailyBudget("test");
    assert.ok(r1.allowed && r2.allowed && !r3.allowed);
    assert.equal(r3.budget, 2);
    assert.equal(r3.degraded, true, "KV 없음 → 메모리(degraded)");
  } finally {
    process.env = saved;
  }
  const s = secondsUntilKstMidnight(Date.UTC(2026, 9, 19, 14, 0)); // 23:00 KST
  assert.ok(s >= 3590 && s <= 3600, String(s));
  const routes: Array<[string, RegExp]> = [
    ["app/api/ai/analysis/route.ts", /consumeAiDailyBudget\("analysis"\)/],
    ["app/api/ai/chat/route.ts", /consumeAiDailyBudget\("chat"\)[\s\S]*?aiBudgetExceededResponse\(\)/],
    ["app/api/ai/compare/route.ts", /consumeAiDailyBudget\("compare"\)/],
    ["app/api/ai/compare-summary/route.ts", /consumeAiDailyBudget\("compare-summary"\)/],
    ["app/api/ai/inspection-note/route.ts", /consumeAiDailyBudget\("inspection-note"\)/],
    ["app/api/ai/note-draft/route.ts", /consumeAiDailyBudget\("note-draft"\)/],
    ["app/api/ai/pattern-summary/route.ts", /consumeAiDailyBudget\("pattern-summary"\)/],
  ];
  for (const [f, re] of routes) assert.match(read(f), re, f);
  /* 분석은 규칙 기반으로 강등(503 아님) · 다른 곳은 KV 고정 창 속도 제한 */
  assert.match(read("app/api/ai/analysis/route.ts"), /오늘 AI 요청 한도에 닿아 규칙 기반 결과로 대신합니다/);
  for (const f of ["app/api/ai/chat/route.ts", "app/api/ai/compare/route.ts", "app/api/ai/compare-summary/route.ts", "app/api/ai/inspection-note/route.ts", "app/api/ai/pattern-summary/route.ts"]) {
    assert.match(read(f), /await keyRateLimit\(/, f);
    assert.doesNotMatch(strip(read(f)), /\brateLimit\(`/, `${f}: 인메모리 rateLimit 남음`);
  }
  const llm = read("lib/ai/llm-provider.ts");
  assert.match(llm, /const LLM_TIMEOUT_MS = Number\(process\.env\.AI_LLM_TIMEOUT_MS \?\? "90000"\);/);
  assert.equal((llm.match(/signal: AbortSignal\.timeout\(LLM_TIMEOUT_MS\)/g) ?? []).length, 2);
  assert.match(llm, /return await callLlmChatInner\(option, messages\);/);
});

test("18·30 썸네일 — KV 캐시 · 끄기 스위치", () => {
  const r = read("app/api/town/news/thumb/[id]/route.ts");
  assert.match(r, /if \(process\.env\.NEWS_THUMB_DISABLED\?\.trim\(\) === "1"\) return miss\(\);/);
  assert.match(r, /const cacheKey = `news:thumb:v1:\$\{id\}`;/);
  assert.match(r, /if \(cached === KV_MISS_MARK\) return miss\(\);/);
  assert.match(r, /await kvSet\(cacheKey, out\.toString\("base64"\), KV_OK_SECONDS\);/);
  assert.match(r, /const KV_OK_SECONDS = 30 \* 24 \* 3600;/);
  assert.match(r, /const KV_MISS_SECONDS = 6 \* 3600;/);
});

test("7·8 DB 쓰기 — 보존 크론 · 조회수 버퍼 · 매물 렌더 중 쓰기 제거 · 크론 등록", async () => {
  const ret = read("app/api/cron/events-retention/route.ts");
  assert.match(ret, /\{ name: "page_view_events", timeCol: "occurred_at", idCol: "id" \}/);
  assert.match(ret, /\{ name: "web_vitals", timeCol: "created_at", idCol: "id" \}/);
  assert.match(ret, /const BATCH = 2000;/);
  assert.match(ret, /if \(!\(await authorizeCron\(req\)\)\)/);
  assert.equal(viewBufferKey("listing", "abc"), "views:v1:listing:abc");
  assert.deepEqual(parseViewBufferKey("views:v1:deal:x-1"), { kind: "deal", id: "x-1" });
  assert.equal(parseViewBufferKey("views:v1:other:x"), null);
  assert.equal(parseViewBufferKey("views:v1:listing:../x"), null);
  const saved = { ...process.env };
  try {
    for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"]) delete process.env[k];
    assert.equal(await bufferView("listing", "abc"), "unavailable");
  } finally {
    process.env = saved;
  }
  const page = strip(read("app/listings/[id]/page.tsx"));
  assert.doesNotMatch(page, /await incrementView\(/);
  assert.match(page, /\{countView && <ListingViewPing listingId=\{listing\.id\} \/>\}/);
  const lv = read("app/api/listings/[id]/view/route.ts");
  assert.match(lv, /if \(isBotAgent\(req\.headers\.get\("user-agent"\)\)\)/);
  assert.match(lv, /const buffered = await bufferView\("listing", id\);[\s\S]*if \(buffered === "unavailable"\) await incrementView\(id\);/);
  const dv = read("app/api/dev-deals/deal/[id]/view/route.ts");
  assert.match(dv, /rateLimit\(`deal-view:\$\{getClientIp\(req\)\}`, \{ limit: 60, windowMs: 60_000 \}\)/);
  assert.match(dv, /const buffered = await bufferView\("deal", id\);/);
  assert.match(read("lib/listings/store-db.ts"), /export async function incrementView\(id: string, by = 1\): Promise<boolean>/);
  assert.match(read("lib/dev-deals/store.ts"), /export async function incrementDealView\(id: string, by = 1\): Promise<boolean>/);
  assert.match(read("app/api/cron/view-count-flush/route.ts"), /kind === "listing" \? incrementView\(id, n\) : incrementDealView\(id, n\)/);
  const vercel = JSON.parse(read("vercel.json")) as { crons: Array<{ path: string; schedule: string }> };
  const by = new Map(vercel.crons.map((c) => [c.path, c.schedule]));
  assert.equal(by.get("/api/cron/events-retention"), "30 3 * * *");
  assert.equal(by.get("/api/cron/view-count-flush"), "20 * * * *");
  assert.equal(by.get("/api/cron/notification-outbox-drain"), "*/15 * * * *");
  assert.equal(by.get("/api/cron/price-alerts"), "0 */6 * * *");
  assert.equal(by.get("/api/cron/watchlist-new-tx"), "30 */6 * * *");
  assert.equal(by.get("/api/cron/site-probe"), "15 */3 * * *");
  /* 비콘 — 로봇 UA 는 행을 만들지 않는다 */
  assert.match(read("app/api/metrics/pageview/route.ts"), /if \(isBotAgent\(req\.headers\.get\("user-agent"\)\)\) return NextResponse\.json\(\{ ok: true, stored: false \}\);/);
});

test("9·11·20 조회 절감 — 뉴스 더 보기 데이터 캐시 · 검색·청약홈 속도 제한과 CDN", () => {
  const news = read("app/api/town/news/route.ts");
  assert.match(news, /unstable_cache\(async \(\) => buildNewsRows\(await readTownPosts\(\)\), \["town-news-rows-v1"\], \{\s*revalidate: 300,\s*tags: \[TOWN_POSTS_TAG\],/);
  assert.match(news, /const rows = await cachedNewsRows\(\);/);
  assert.match(read("app/api/search/unified/route.ts"), /keyRateLimit\(`search-unified:\$\{getClientIp\(req\)\}`, \{ max: 60, windowMs: 60_000 \}\)/);
  const legacy = read("app/api/search/route.ts");
  assert.match(legacy, /keyRateLimit\(`search-legacy:\$\{getClientIp\(req\)\}`, \{ max: 30, windowMs: 60_000 \}\)/);
  assert.match(legacy, /"public, s-maxage=300, stale-while-revalidate=600"/);
  for (const [f, name] of [["app/api/applyhome/competition/route.ts", "applyhome-competition"], ["app/api/applyhome/search/route.ts", "applyhome-search"]]) {
    const s = read(f);
    assert.match(s, new RegExp(`keyRateLimit\\(\`${name}:`), f);
    assert.match(s, /"public, s-maxage=3600, stale-while-revalidate=86400"/, f);
  }
});

test("19 길찾기 — KV 캐시 · 일일 상한 · 통근 라우트 KV 창", () => {
  const d = read("lib/map/naver-directions.ts");
  assert.match(d, /const cacheKey = directionsCacheKey\(from, to, option\);/);
  assert.match(d, /if \(!\(await consumeDirectionsDailyCap\(\)\)\) return null;/);
  assert.match(d, /await kvSet\(cacheKey, JSON\.stringify\(result\), DIRECTIONS_CACHE_SECONDS\);/);
  assert.match(d, /Math\.round\(v \* 1e4\) \/ 1e4/);
  assert.match(d, /const DIRECTIONS_DAILY_CAP_DEFAULT = 3000;/);
  assert.match(d, /process\.env\.NAVER_DIRECTIONS_DAILY_CAP\?\.trim\(\)/);
  assert.match(read("app/api/map/commute/route.ts"), /keyRateLimit\(`map-commute:\$\{getClientIp\(req\)\}`, \{ max: 20, windowMs: 60_000 \}\)/);
});

test("24·25 알림·폴링 — outbox 공용 인가 + 잡기 · 폴링 간격 늘리기 · /api/talk 상한", () => {
  const ob = read("app/api/cron/notification-outbox-drain/route.ts");
  assert.match(ob, /if \(!\(await authorizeCron\(req\)\)\)/);
  assert.doesNotMatch(strip(ob), /x-vercel-cron|isAdminApiRequest/);
  assert.match(ob, /\.update\(\{ attempts: attempts \+ 1 \}\)\s*\.eq\("id", id\)\s*\.eq\("status", "pending"\)\s*\.eq\("attempts", attempts\)\s*\.select\("id"\);/);
  assert.match(ob, /if \(claimError \|\| !claimed \|\| claimed\.length === 0\) continue;/);
  assert.equal(talkPollDelayMs(0), TALK_POLL_MS);
  assert.equal(talkPollDelayMs(1), 30_000);
  assert.equal(talkPollDelayMs(2), 60_000);
  assert.equal(talkPollDelayMs(3), 60_000);
  assert.equal(talkPollDelayMs(4), TALK_POLL_MAX_MS);
  assert.equal(talkPollDelayMs(40), 120_000);
  const panel = read("app/components/talk/TalkPanel.tsx");
  assert.match(panel, /const delay = talkPollDelayMs\(quietStreakRef\.current\);/);
  assert.match(panel, /quietStreakRef\.current = quiet && added === 0 \? quietStreakRef\.current \+ 1 : 0;/);
  assert.doesNotMatch(strip(panel), /TALK_POLL_MS/);
  assert.match(read("app/api/talk/route.ts"), /keyFn: \(r\) => `talk-feed:\$\{getClientIp\(r\)\}`/);
});

test("15 가입 캡차 — 위젯 · 가입 요청에 토큰 · 서버 검증 · CSP", () => {
  const saved = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  try {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    assert.equal(turnstileSiteKey(), null);
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = " 0x1 ";
    assert.equal(turnstileSiteKey(), "0x1");
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    else process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = saved;
  }
  assert.equal(TURNSTILE_ORIGIN, "https://challenges.cloudflare.com");
  const w = read("app/components/TurnstileWidget.tsx");
  assert.match(w, /render=explicit/);
  assert.match(w, /"expired-callback": \(\) => onTokenRef\.current\(null\)/);
  const su = read("app/signup/SignupClient.tsx");
  assert.match(su, /captchaSiteKey = null,/);
  assert.match(read("app/signup/page.tsx"), /captchaSiteKey=\{turnstileSiteKey\(\)\}/);
  assert.match(su, /if \(captchaSiteKey && !captchaToken\) \{\s*setError\("보안 확인 필요 · 아래 확인 칸을 완료한 뒤 다시"\);/);
  assert.match(su, /\.\.\.\(captchaToken \? \{ captchaToken \} : \{\}\),/);
  assert.match(su, /<TurnstileWidget key=\{captchaKey\} siteKey=\{captchaSiteKey\} action="signup" onToken=\{setCaptchaToken\}/);
  const reg = read("app/api/auth/register/route.ts");
  assert.match(reg, /if \(!resendOnly\) \{[\s\S]*?const captchaOk = await verifyTurnstile\(captchaToken, getClientIp\(req\)\);[\s\S]*?\{ status: 403 \}/);
  const csp = read("lib/security/content-security-policy.ts");
  assert.match(csp, /const turnstile = "https:\/\/challenges\.cloudflare\.com";/);
  assert.equal((csp.match(/\$\{turnstile\}/g) ?? []).length, 3, "script-src ×2(개발·운영) + frame-src");
});

test("기타 — 이미지 캐시 30일 · /api/health kv 칸 · .env.example 안내", () => {
  assert.match(read("next.config.ts"), /minimumCacheTTL: 60 \* 60 \* 24 \* 30,/);
  const h = read("app/api/health/route.ts");
  assert.match(h, /kv: \{ configured: boolean; ok: boolean \};/);
  assert.match(h, /kv: \{ configured: kvConfigured, ok: kvOk \},/);
  assert.match(h, /kv: ops\.kv,/);
  const env = read(".env.example");
  for (const k of ["KV_REST_API_URL", "AI_DAILY_REQUEST_BUDGET", "NEXT_PUBLIC_TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "NEWS_THUMB_DISABLED", "NAVER_DIRECTIONS_DAILY_CAP", "TRAFFIC_RETENTION_DAYS"])
    assert.ok(env.includes(k), k);
});
