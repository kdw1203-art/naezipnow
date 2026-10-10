/* [1053 · 방문 집계] 동의와 무관한 익명 하루 수.
 *
 * 잠그는 사실:
 *  C1 로봇 · 짧은 UA 는 세지 않는다 · 기기 종류 d/m/t + 앱 안 브라우저 이름.
 *  C2 한국 날짜 경계 · 들어온 곳은 호스트만(우리 주소 · 옛 주소 · 미리보기 제외) · utm 형식.
 *  C3 한 줄 — 들어온 곳 · utm 은 첫 화면에만 · 관리 화면 제외 · 화면 묶음은 접힌 이름.
 *  C4 다른 사이트 요청 제외(Sec-Fetch-Site) · 없으면 통과.
 *  C5 카드 숫자 — 7일 · 그 앞 7일 · 첫 화면 · 앱 안 비중 · 가입 단계 · 14일 막대(빈 날 0).
 *  C6 연결 — 비콘은 쿠키 · 저장소 · 식별자 없이(문서 안 변수) · 동의 방문은 view 에 실어 · 서버는 service_role RPC ·
 *     마이그레이션 사본은 운영 적용본과 같은 바이트(md5) · 권한은 service_role 만. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  SIGNUP_STEPS,
  cleanRefHost,
  cleanUtmSource,
  countRow,
  deviceClass,
  deviceLabel,
  isBotAgent,
  isCrossSite,
  kstDay,
  normalizeRoute,
  summarizeCounts,
  type AggRow,
} from "@/lib/metrics/page-count";

const read = (p: string) => readFileSync(p, "utf8");
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1";
const NAVER_AOS =
  "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.8.3)";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1";
const ANDROID_TAB = "Mozilla/5.0 (Linux; Android 14; SM-X710N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

test("C1 로봇 · 기기 종류", () => {
  for (const ua of [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd) NaverBot",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse",
    "curl/8.5.0",
    "python-requests/2.32.3",
    "",
  ]) {
    assert.equal(isBotAgent(ua), true, ua);
    assert.equal(deviceClass(ua), null, ua);
  }
  assert.equal(isBotAgent(IPHONE), false);
  assert.equal(deviceClass(IPHONE), "m");
  assert.equal(deviceClass(WIN), "d");
  assert.equal(deviceClass(IPAD), "t");
  assert.equal(deviceClass(ANDROID_TAB), "t");
  assert.equal(deviceClass(NAVER_AOS), "m:naver");
  assert.equal(deviceLabel("m:naver"), "폰 · 앱 안(naver)");
  assert.equal(deviceLabel("d"), "컴퓨터");
  assert.equal(deviceLabel("t"), "태블릿");
});

test("C2 날짜 · 들어온 곳 · utm", () => {
  assert.equal(kstDay(Date.parse("2026-10-09T14:59:59Z")), "2026-10-09");
  assert.equal(kstDay(Date.parse("2026-10-09T15:00:00Z")), "2026-10-10");
  assert.equal(cleanRefHost("m.search.naver.com"), "m.search.naver.com");
  assert.equal(cleanRefHost("WWW.Google.COM"), "www.google.com");
  assert.equal(cleanRefHost("search.naver.com:443"), "search.naver.com");
  for (const own of ["naezipnow.com", "www.naezipnow.com", "nuguzip.com", "m.nuguzip.com", "nuguzip-abc.vercel.app", "localhost"]) {
    assert.equal(cleanRefHost(own), "", own);
  }
  assert.equal(cleanRefHost("https://search.naver.com/search?query=집"), "");
  assert.equal(cleanRefHost("intranet"), "");
  assert.equal(cleanRefHost(42), "");
  assert.equal(cleanUtmSource("Naver_Blog"), "naver_blog");
  assert.equal(cleanUtmSource("a b"), "");
  assert.equal(cleanUtmSource("x".repeat(81)), "x".repeat(80));
});

test("C3 한 줄", () => {
  const now = Date.parse("2026-10-10T03:00:00Z");
  assert.deepEqual(countRow("/complex/[id]", { landing: true, referrerHost: "m.search.naver.com", utmSource: "x" }, NAVER_AOS, now), {
    p_day: "2026-10-10",
    p_route: "/complex/[id]",
    p_landing: true,
    p_ref_host: "m.search.naver.com",
    p_utm_source: "x",
    p_device: "m:naver",
  });
  /* 첫 화면이 아니면 들어온 곳 · utm 을 싣지 않는다 */
  assert.deepEqual(countRow("/map", { referrerHost: "google.com", utmSource: "x" }, WIN, now), {
    p_day: "2026-10-10",
    p_route: "/map",
    p_landing: false,
    p_ref_host: "",
    p_utm_source: "",
    p_device: "d",
  });
  assert.equal(countRow("/admin/traffic", {}, WIN, now), null);
  assert.equal(countRow("/admin", {}, WIN, now), null);
  assert.equal(countRow("/map", {}, "Googlebot/2.1 (+http://www.google.com/bot.html)", now), null);
  assert.equal(countRow("map", {}, WIN, now), null);
  assert.equal(normalizeRoute("/complex/11680-123?tab=price"), "/complex/[id]");
  assert.equal(normalizeRoute("/u/somebody"), "/u/[handle]");
  assert.equal(normalizeRoute("/redevelopment/abc"), "/redevelopment/[id]");
  assert.equal(normalizeRoute("/n/xyz"), "/n/[code]");
  assert.equal(normalizeRoute("/signup"), "/signup");
  assert.equal(normalizeRoute("/auth/confirm"), "/auth/confirm");
  assert.equal(normalizeRoute("/analysis/ai/price-check"), "/analysis/ai/*");
  assert.equal(normalizeRoute("/"), "/");
  for (const s of SIGNUP_STEPS) assert.equal(normalizeRoute(s.route), s.route);
});

test("C4 다른 사이트 요청", () => {
  assert.equal(isCrossSite("same-origin"), false);
  assert.equal(isCrossSite(null), false);
  assert.equal(isCrossSite(""), false);
  assert.equal(isCrossSite("cross-site"), true);
  assert.equal(isCrossSite("same-site"), true);
  assert.equal(isCrossSite("none"), true);
});

test("C5 카드 숫자", () => {
  const today = "2026-10-20";
  const row = (day: string, route: string, n: number, extra: Partial<AggRow> = {}): AggRow => ({
    day,
    route,
    is_landing: false,
    ref_host: "",
    utm_source: "",
    device: "m",
    n,
    ...extra,
  });
  const rows: AggRow[] = [
    row("2026-10-20", "/", 10, { is_landing: true, ref_host: "m.search.naver.com", device: "m:naver" }),
    row("2026-10-20", "/complex/[id]", 6),
    row("2026-10-18", "/signup", 4, { device: "d" }),
    row("2026-10-18", "/auth/confirm", 2),
    row("2026-10-19", "/welcome", 1),
    row("2026-10-14", "/", 3, { is_landing: true }),
    row("2026-10-13", "/", 5, { is_landing: true }),
    row("2026-10-07", "/", 7),
    row("2026-10-06", "/", 100),
    row("2026-10-21", "/", 100),
    row("2026-10-20", "/x", 0),
  ];
  const s = summarizeCounts(rows, today);
  assert.equal(s.days.length, 14);
  assert.equal(s.days[0].day, "2026-10-07");
  assert.equal(s.days[13].day, "2026-10-20");
  assert.equal(s.days[13].n, 16);
  assert.equal(s.days.find((d) => d.day === "2026-10-15")?.n, 0);
  assert.equal(s.last7, 10 + 6 + 4 + 2 + 1 + 3);
  assert.equal(s.prev7, 5 + 7);
  assert.equal(s.landings7, 13);
  assert.deepEqual(s.topRefs, [
    { host: "m.search.naver.com", n: 10 },
    { host: "", n: 3 },
  ]);
  assert.equal(s.topRoutes[0].route, "/");
  assert.equal(s.topRoutes[0].n, 13);
  assert.equal(s.inAppShare, 10 / 26);
  assert.deepEqual(
    s.signup.map((x) => x.n),
    [4, 2, 1],
  );
  const empty = summarizeCounts([], today);
  assert.equal(empty.last7, 0);
  assert.equal(empty.inAppShare, null);
});

test("C6 연결", () => {
  const rec = read("app/components/TrafficRecorder.tsx");
  const i = rec.indexOf("let docLanded = false;");
  assert.ok(i > 0);
  const countPart = rec.slice(i, rec.indexOf("function send(", i));
  assert.doesNotMatch(countPart, /localStorage|sessionStorage|document\.cookie|randomUUID|getVisitorKey|getSessionKey/);
  assert.match(rec, /send\(\{ t: "count", path: pathname, \.\.\.countFacts\(\) \}, false\)/);
  assert.match(rec, /if \(!consentKnown \|\| consented \|\| !pathname\) return;/);
  assert.match(rec, /\.\.\.\(agg \? \{ agg \} : \{\}\)/);
  assert.match(rec, /isProbeSession\(\)/);

  const route = read("app/api/metrics/pageview/route.ts");
  assert.match(route, /if \(body\.t === "count"\)/);
  assert.match(route, /sb\.rpc\("bump_page_view_agg", row\)/);
  assert.match(route, /isCrossSite\(req\.headers\.get\("sec-fetch-site"\)\)/);
  /* 수 요청도 같은 속도 제한 뒤 */
  assert.ok(route.indexOf("rateLimit(`pageview:") < route.indexOf('body.t === "count"'));

  const mig = readFileSync("supabase/migrations/20261009221208_1053_page_view_daily_agg.sql");
  assert.equal(createHash("md5").update(mig).digest("hex"), "62903dc8e69417fad3246aafcecdc1f9");
  const sql = mig.toString("utf8");
  assert.ok(!sql.endsWith("\n"));
  assert.match(sql, /revoke all on function public\.bump_page_view_agg\(date, text, boolean, text, text, text\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.bump_page_view_agg\(date, text, boolean, text, text, text\) to service_role;/);
  assert.match(sql, /revoke all on table public\.page_view_daily_agg from public, anon, authenticated;/);
  assert.match(sql, /enable row level security/);

  const page = read("app/admin/traffic/page.tsx");
  assert.match(page, /<AnonCounts \/>/);
  const card = read("app/admin/traffic/AnonCounts.tsx");
  assert.match(card, /방문 수 불러오기 실패 · 잠시 후 다시/);
  assert.match(card, /사람 수 아님/);
});
