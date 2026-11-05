/* [1106] 소유자 2026-11-05 — 관리 › 검색 유입 캡처(막대가 10.22 뒤로 빔 · 앞 28일 전부 0) "이것도 업데이트 매일 해줘" ·
 * "Admin에 대한 개선작업도 진행해줘". 잠그는 사실:
 *  A 운영 정지 날(10.24~10.31) — 표시하고 합계 · 비교에서 뺀다.
 *  B 측정 쓰기 — 자동 점검(CI E2E · 운영 키) 실행은 방문 수 · 웹 바이탈 · 오류를 쓰지 않는다.
 *  C 검색 유입 — 응답 상한(1,000행)을 넘어 끝까지 읽고, 앞 기간 "수집 전"을 0 과 구분한다.
 *  D 한국 날짜 경계 · 관리 화면 수치(회원 · 의뢰 · 노트 · 방문 · 웹 바이탈)가 화면마다 같은 자를 쓴다. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KNOWN_OUTAGES, outageDaysIn, outageOn } from "@/lib/metrics/known-outages";
import { telemetryWritesDisabled } from "@/lib/metrics/telemetry-write";
import { comparablePeriods, summarizeSearchLandings } from "@/lib/seo/search-engines";
import { summarizeCounts } from "@/lib/metrics/page-count";
import { kstDayStartIso } from "@/lib/format/kst";
import { vitalRowUsable } from "@/lib/metrics/vitals-scope";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, "");

test("A 운영 정지 날 — 10.24~10.31 여덟 날 · 경계 밖은 아님", () => {
  assert.equal(KNOWN_OUTAGES.length >= 1, true);
  assert.equal(outageOn("2026-10-23"), null);
  assert.ok(outageOn("2026-10-24"));
  assert.ok(outageOn("2026-10-31"));
  assert.equal(outageOn("2026-11-01"), null);
  assert.equal(outageDaysIn("2026-10-09", "2026-11-05"), 8);
  assert.equal(outageDaysIn("2026-10-30", "2026-11-05"), 2);
  assert.equal(outageDaysIn("2026-11-01", "2026-11-28"), 0);
});

test("B 측정 쓰기 — 자동 점검 플래그 · GitHub Actions 안에서는 쓰지 않는다", () => {
  assert.equal(telemetryWritesDisabled({}), false);
  assert.equal(telemetryWritesDisabled({ VERCEL_ENV: "production" }), false);
  assert.equal(telemetryWritesDisabled({ PLATFORM_EVENTS_DISABLED: "1" }), true);
  assert.equal(telemetryWritesDisabled({ GITHUB_ACTIONS: "true" }), true);
  for (const p of ["app/api/metrics/pageview/route.ts", "app/api/metrics/web-vitals/route.ts", "app/api/metrics/client-error/route.ts", "lib/platform-events.ts"]) {
    assert.match(code(p), /telemetryWritesDisabled\(\)/, p);
  }
  /* 방문 수는 세 갈래(count · view · leave) 모두 앞에서 접는다 — POST 첫 줄 */
  assert.match(code("app/api/metrics/pageview/route.ts"), /export async function POST\(req: NextRequest\): Promise<Response> \{\s*if \(telemetryWritesDisabled\(\)\) return NextResponse\.json\(\{ ok: true, stored: false \}\);/);
  assert.match(read(".github/workflows/e2e.yml"), /PLATFORM_EVENTS_DISABLED: "1"/);
});

test("C 검색 유입 요약 — 수집 전 · 정지 · 오늘 표시, 정지 날은 합계에서 뺌, 비교 가능 판정", () => {
  const today = "2026-11-05";
  const rows = [
    { day: "2026-10-11", route: "/complex/[id]", ref_host: "m.search.naver.com", n: 40 },
    { day: "2026-10-27", route: "/", ref_host: "", n: 108 }, // 정지 날 · 자동 점검
    { day: "2026-11-04", route: "/complex/[id]", ref_host: "m.search.naver.com", n: 31 },
    { day: "2026-11-05", route: "/complex/[id]", ref_host: "search.naver.com", n: 2 },
  ];
  const s = summarizeSearchLandings(rows, today, 28, { firstDay: "2026-10-11", isOutage: (d) => outageOn(d) !== null });
  assert.equal(s.days[0].day, "2026-10-09");
  assert.equal(s.days[0].flag, "before");
  assert.equal(s.days[1].flag, "before");
  assert.equal(s.days[2].flag, undefined);
  assert.equal(s.days.find((d) => d.day === "2026-10-27")?.flag, "outage");
  assert.equal(s.days.find((d) => d.day === "2026-10-27")?.total, 108, "칸에는 남긴다");
  assert.equal(s.days.at(-1)?.flag, "today");
  assert.equal(s.totals.naver, 73);
  assert.equal(s.totals.direct, 0, "정지 날 수는 합계에서 뺀다");
  assert.deepEqual(s.coverage, { firstDay: "2026-10-11", curDays: 26, prevDays: 0, curOutageDays: 8, prevOutageDays: 0 });
  assert.equal(comparablePeriods(s.coverage), false);
  assert.equal(comparablePeriods(undefined), true, "범위를 모르면 예전처럼");
  assert.equal(comparablePeriods({ firstDay: "2026-01-01", curDays: 28, prevDays: 28, curOutageDays: 0, prevOutageDays: 0 }), true);
  assert.equal(comparablePeriods({ firstDay: "2026-01-01", curDays: 28, prevDays: 5, curOutageDays: 0, prevOutageDays: 0 }), false);
});

test("C 검색 유입 화면 — 끝까지 읽기(readPaged · 기본 키 순서) · 시작일 · 마지막 기록 · 수집 전 칸", () => {
  const loader = code("lib/admin/search-landings.ts");
  assert.match(loader, /readPaged<Record<string, unknown>>\(/);
  assert.match(loader, /\.range\(from, to\)/);
  assert.doesNotMatch(loader, /\.limit\(50_000\)/);
  assert.match(loader, /\.order\("device", \{ ascending: true \}\)/);
  assert.match(loader, /select\("day"\)\.order\("day", \{ ascending: true \}\)\.limit\(1\)/);
  assert.match(loader, /isOutage: \(d\) => outageOn\(d\) !== null/);
  const page = code("app/admin/search/page.tsx");
  assert.match(page, /열 때마다 새로 읽음 · 마지막 기록/);
  assert.match(page, /c && c\.prevDays === 0 \? <span className="text-text-3">수집 전<\/span> : fmt\(prev\)/);
  assert.match(page, /const d = comparable \? deltaPct\(now, prev\) : null;/);
  assert.doesNotMatch(page, /10\.11 부터 쌓임/, "시작일은 표에서 읽는다");
  assert.match(page, /export const dynamic = "force-dynamic";/);
});

test("C 트래픽 — 14일 달력(빈 날 0) · 익명 수 끝까지 · 정지 날 표시", () => {
  const counts = summarizeCounts(
    [
      { day: "2026-10-30", route: "/", is_landing: true, ref_host: "", utm_source: "", device: "d", n: 108 },
      { day: "2026-11-04", route: "/", is_landing: true, ref_host: "", utm_source: "", device: "d", n: 50 },
    ],
    "2026-11-05",
    (d) => outageOn(d) !== null,
  );
  assert.equal(counts.last7, 50, "정지 날 수는 합계에서 뺀다");
  assert.deepEqual(counts.outageDays7, { last: 2, prev: 6 });
  assert.equal(counts.days.find((d) => d.day === "2026-10-30")?.outage, true);
  assert.match(code("lib/admin/anon-counts.ts"), /readPaged<Record<string, unknown>>\(/);
  const traffic = code("app/admin/traffic/page.tsx");
  assert.match(traffic, /fillDays\(\(dailyR\.data as DailyRow\[\] \| null\) \?\? \[\], kstDay\(Date\.now\(\)\)\)/);
  assert.match(traffic, /\.gte\("day", kstDay\(Date\.now\(\) - 13 \* 86_400_000\)\)/);
});

test("D 한국 날짜 경계 — 자정은 한국 0시(UTC 15시)", () => {
  assert.equal(kstDayStartIso(Date.parse("2026-11-05T00:30:00Z")), "2026-11-04T15:00:00.000Z");
  assert.equal(kstDayStartIso(Date.parse("2026-11-04T16:00:00Z")), "2026-11-04T15:00:00.000Z");
  assert.equal(kstDayStartIso(Date.parse("2026-11-04T14:59:00Z")), "2026-11-03T15:00:00.000Z");
  assert.equal(kstDayStartIso(Date.parse("2026-11-05T00:30:00Z"), -7), "2026-10-28T15:00:00.000Z");
  for (const p of ["lib/admin/stats.ts", "lib/admin/operating-metrics.ts"]) {
    assert.doesNotMatch(code(p), /setHours\(0, 0, 0, 0\)/, p);
    assert.match(code(p), /kstDayStartIso\(/, p);
  }
  assert.doesNotMatch(code("app/admin/ai/page.tsx"), /monthStart\.setHours/);
  assert.match(code("app/admin/ai/page.tsx"), /new Date\(kstMonthStartIso\(\)\)/);
  assert.doesNotMatch(code("app/admin/freshness/page.tsx"), /getHours\(\)/);
  assert.doesNotMatch(code("app/admin/payments/page.tsx"), /getHours\(\)/);
});

test("D 관리 수치 — 회원은 profiles · 의뢰는 표 · 노트는 사람 글 · 첫 카드 열 이름 · 방문 카드", () => {
  const stats = code("lib/admin/stats.ts");
  assert.doesNotMatch(stats, /readMarketRequestsFile/);
  assert.match(stats, /sb\.from\("market_requests"\)\.select\("\*", \{ count: "exact", head: true \}\)\.eq\("status", "open"\)/);
  assert.match(stats, /sb\.from\("profiles"\)\.select\("\*", \{ count: "exact", head: true \}\),/);
  assert.match(stats, /if \(isLabAuthor\(n\.author_label\)\) \{\s*base\.labInspections \+= 1;/);
  const metrics = code("lib/newui/admin-metrics.ts");
  assert.doesNotMatch(metrics, /author_id/);
  assert.match(metrics, /select\("user_id, author_email, author_label, created_at"\)/);
  assert.doesNotMatch(metrics, /label: "DAU \(24h\)"/);
  assert.match(metrics, /label: "오늘 방문 \(첫 화면\)"/);
  assert.match(metrics, /\.from\("page_view_daily_agg"\)/);
  const ops = code("lib/admin/operating-metrics.ts");
  assert.match(ops, /if \(firstInspection7d === 0\) firstInspection7d = kpi\.inspectionsThisWeek;/);
  assert.match(ops, /signup30d > 0 \? Math\.round\(\(n \/ signup30d\) \* 1000\) \/ 10 : null/);
  const dash = code("app/admin/page.tsx");
  assert.match(dash, /await Promise\.allSettled\(\[/);
  assert.doesNotMatch(dash, /loadError/);
  assert.match(code("app/admin/quality/page.tsx"), /paidSubscriptionCount\(kpi\.planCounts\)/);
});

test("D 응답 상한 · 같은 자 — 뉴스 연결률 · 웹 바이탈 · 수익 게이트 · 적재 기록", () => {
  assert.match(code("lib/admin/news-region-link.ts"), /readPaged<unknown>\(/);
  assert.equal(vitalRowUsable("CLS", "route"), true);
  assert.equal(vitalRowUsable("CLS", "doc"), false);
  assert.equal(vitalRowUsable("LCP", "doc"), true);
  assert.equal(vitalRowUsable("LCP", null), false);
  const stats = code("lib/admin/stats.ts");
  assert.match(stats, /!isLegacyProbeSample\(r\.user_agent, r\.created_at\) && vitalRowUsable\(r\.metric, r\.scope\)/);
  const perf = code("app/admin/perf/page.tsx");
  assert.match(perf, /readPaged<Row>\(/);
  assert.doesNotMatch(perf, /\.limit\(20000\)/);
  const rev = code("app/admin/revenue/page.tsx");
  assert.match(rev, /latestIngestLogFor\("plan-expiry"\)/);
  assert.doesNotMatch(rev, /listIngestLog\(60\)/);
  assert.match(rev, /\.from\("page_view_daily_agg"\)/);
  assert.doesNotMatch(rev, /from\("platform_activity_events"\)/);
});
