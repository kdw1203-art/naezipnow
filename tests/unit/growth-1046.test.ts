/* [1046] 1년 1만 회원 계획 — 첫 주 실행분. 소유자 지시(2026-10-08) "…고속성장 계획을 만들어주고 실행해줘".
 *
 * 잠그는 사실:
 *  ① 단지 페이지를 IndexNow 로 알린다 — 최근 계약월 거래가 새로 들어온 단지만, 하루 900개 상한(이력 백필은 고르지 않는다).
 *  ② 가입 전에 누른 관심 등록은 가입 뒤 그 단지에서 한 번만 마저 담긴다(24시간 · 꺼내면 지운다).
 *  ③ 가입 경로는 분석 동의 뒤에서만, 로그인한 뒤 한 번만 잇는다. 채널 이름 규칙은 한 곳.
 *  ④ 성장 주간표의 목표는 계획 문서와 같다(합계 1만) · 멈출 기준은 표본이 작으면 울리지 않는다.
 *  ⑤ 주간 요약 메일은 동의 기록(user_consents)을 본다 · 단지 공유 링크엔 출처가 붙는다.
 *  ⑥ 운영 DB 변경은 원장과 글자 하나까지 같은 파일 · 실행권은 service_role 만. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { INDEXNOW_COMPLEX_DAILY_CAP, pickFreshComplexes, ymMinus } from "@/lib/seo/indexnow-pick";
import {
  PENDING_WATCH_KEY,
  PENDING_WATCH_TTL_MS,
  hasPendingWatch,
  savePendingWatch,
  takePendingWatch,
} from "@/lib/client/pending-watch";
import {
  ATTRIBUTION_DONE_STATUSES,
  GROWTH_MONTHLY_TARGETS,
  classifyChannel,
  conversionRate,
  conversionStopSignal,
  isVisitorKey,
  kstMonthKey,
  kstMonthStartIso,
  mergeChannels,
  monthTarget,
  type GrowthWeek,
} from "@/lib/growth/channels";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── ① IndexNow 단지 ─────────────────────────────────────────────────────── */

test("ymMinus — 해를 넘겨 센다", () => {
  assert.equal(ymMinus("202610", 1), "202609");
  assert.equal(ymMinus("202601", 1), "202512");
  assert.equal(ymMinus("2026-10", 1), "");
});

test("pickFreshComplexes — 이력 백필은 버리고, 단지로 묶어 최근 순 · 상한에서 자른다", () => {
  const rows = [
    { region_name: "서울 강남구", complex_name: "가단지", contract_ym: "202310" }, // 백필
    { region_name: "서울 강남구", complex_name: "나단지", contract_ym: "202609" },
    { region_name: "서울 강남구", complex_name: "다단지", contract_ym: "202610" },
    { region_name: "서울 강남구", complex_name: "나단지", contract_ym: "202610" },
    { region_name: "서울 강남구", complex_name: "나단지", contract_ym: "202609" },
    { region_name: null, complex_name: "이름만", contract_ym: "202610" },
    { region_name: "서울 송파구", complex_name: "라단지", contract_ym: "202609" },
  ];
  const got = pickFreshComplexes(rows, { minYm: "202609" });
  assert.deepEqual(
    got.map((c) => [c.name, c.latestYm, c.newTrades]),
    [
      ["나단지", "202610", 3],
      ["다단지", "202610", 1],
      ["라단지", "202609", 1],
    ],
  );
  assert.equal(pickFreshComplexes(rows, { minYm: "202609", cap: 1 }).length, 1);
  assert.equal(INDEXNOW_COMPLEX_DAILY_CAP, 900);
});

test("IndexNow 크론 — 단지 묶음을 허브·리포트·노트 뒤에 붙이고, 못 읽으면 missing 에 남긴다", () => {
  const src = code("app/api/cron/indexnow-submit/route.ts");
  assert.match(src, /listFreshComplexPaths\(\)/);
  assert.match(src, /complexes\(조회 실패\)/);
  const lib = code("lib/seo/indexnow-complexes.ts");
  assert.match(lib, /\.gte\("contract_ym", minYm\)/, "옛 연도 백필 행은 DB 에서부터 거른다");
  assert.match(lib, /complexCanonicalPathFromNames/, "사이트맵과 같은 정규 경로");
  assert.match(lib, /\.eq\("is_cancelled", false\)/);
});

/* ── ② 가입 뒤 관심 등록 마저 담기 ───────────────────────────────────────── */

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    raw: m,
  };
}

test("pending-watch — 같은 단지에서만 한 번 꺼내지고, 꺼내면 지워진다", () => {
  const s = memStorage();
  savePendingWatch("seoul-a", "가단지", s, 1_000);
  assert.equal(hasPendingWatch("seoul-a", s, 2_000), true);
  assert.equal(hasPendingWatch("seoul-b", s, 2_000), false);
  assert.equal(takePendingWatch("seoul-b", s, 2_000), null, "다른 단지 화면은 꺼내지 않는다");
  assert.ok(s.raw.has(PENDING_WATCH_KEY), "다른 단지 화면은 기록을 지우지 않는다");
  assert.deepEqual(takePendingWatch("seoul-a", s, 2_000), { complexId: "seoul-a", complexName: "가단지", at: 1_000 });
  assert.equal(takePendingWatch("seoul-a", s, 2_000), null, "두 번째 버튼은 담지 않는다");
});

test("pending-watch — 24시간이 지났거나 깨진 기록은 버린다", () => {
  const s = memStorage();
  savePendingWatch("seoul-a", "가단지", s, 0);
  assert.equal(hasPendingWatch("seoul-a", s, PENDING_WATCH_TTL_MS), false);
  assert.equal(takePendingWatch("seoul-a", s, PENDING_WATCH_TTL_MS), null);
  assert.equal(s.raw.has(PENDING_WATCH_KEY), false);
  s.setItem(PENDING_WATCH_KEY, "{깨진");
  assert.equal(takePendingWatch("seoul-a", s, 1), null);
  assert.equal(takePendingWatch("seoul-a", null, 1), null, "저장소가 없으면 조용히 아무것도 안 한다");
});

test("관심 버튼 — 401 이면 단지를 적어 두고, 로그인 상태로 돌아오면 replay 로 한 번 담는다", () => {
  const src = code("app/complex/[id]/hub-client.tsx");
  assert.match(src, /if \(target\) savePendingWatch\(complexId, complexName\)/);
  assert.match(src, /if \(opts\.replay\) return;/, "다시 담기 중 세션이 끊기면 가입 창을 또 띄우지 않는다");
  assert.match(src, /takePendingWatch\(complexId\)\) void applyRef\.current\?\.\(true, \{ replay: true \}\)/);
  assert.match(src, /가입 전에 누른 관심 등록을 마쳤어요/);
  assert.match(src, /새 실거래가 올라올 때 메일로 알려 드려요/, "가입 창은 가입 이유(새 실거래 메일)를 말한다");
});

/* ── ③ 가입 경로 ─────────────────────────────────────────────────────────── */

test("가입 경로 잇기 — 분석 동의 뒤 · 로그인한 뒤 · 끝나면 다시 묻지 않는다", () => {
  const src = code("app/components/TrafficRecorder.tsx");
  const i = src.indexOf('fetch("/api/me/attribution"');
  assert.ok(i > 0);
  const effect = src.slice(src.lastIndexOf("useEffect(", i), i);
  assert.match(effect, /if \(!consented\) return;/);
  /* [1052] 계정별(이메일 해시) 완료 표시 · 탭당 재시도 1회 — claimAttributionAttempt */
  assert.match(effect, /if \(!claimAttributionAttempt\(marker, local, session\)\) return;/);
  assert.match(effect, /s\?\.user\?\.email/);
  const route = code("app/api/me/attribution/route.ts");
  assert.match(route, /status: 401/);
  assert.match(route, /isVisitorKey\(visitorKey\)/);
  assert.match(route, /p_max_age_days: 14/);
});

test("isVisitorKey · 다시 묻지 않는 응답 목록", () => {
  assert.equal(isVisitorKey("0123456789abcdef0123456789abcdef"), true);
  assert.equal(isVisitorKey("0123"), false);
  assert.equal(isVisitorKey("XYZ3456789abcdef"), false);
  for (const s of ["linked", "linked_no_events", "exists", "too_old", "no_user"]) assert.ok(ATTRIBUTION_DONE_STATUSES.has(s));
  assert.equal(ATTRIBUTION_DONE_STATUSES.has("bad_key"), false);
});

test("classifyChannel — UTM 이 리퍼러보다 먼저, 사람이 아는 이름으로", () => {
  const c = (utmSource: string | null, referrerHost: string | null, attributed = true) =>
    classifyChannel({ utmSource, referrerHost, attributed });
  assert.equal(c(null, null, false), "기록 없음");
  assert.equal(c("share", "talk.kakao.com"), "공유 링크");
  assert.equal(c("naver_blog", null), "네이버 블로그");
  assert.equal(c("spring", null), "캠페인 · spring");
  assert.equal(c(null, null), "직접 · 북마크");
  assert.equal(c(null, "www.google.com"), "구글 검색");
  assert.equal(c(null, "www.google.co.kr"), "구글 검색");
  assert.equal(c(null, "m.search.naver.com"), "네이버 검색");
  assert.equal(c(null, "search.naver.com"), "네이버 검색");
  assert.equal(c(null, "m.blog.naver.com"), "네이버 블로그");
  assert.equal(c(null, "cafe.naver.com"), "네이버 카페");
  assert.equal(c(null, "chatgpt.com"), "AI 검색");
  assert.equal(c(null, "ntp.msn.com"), "기타 · ntp.msn.com");
});

test("mergeChannels — 채널로 합쳐 많은 순, '기록 없음'은 맨 끝", () => {
  const got = mergeChannels([
    { utmSource: null, referrerHost: null, attributed: false, signups: 9 },
    { utmSource: null, referrerHost: "www.google.com", attributed: true, signups: 2 },
    { utmSource: null, referrerHost: "www.google.co.kr", attributed: true, signups: 1 },
    { utmSource: null, referrerHost: "m.search.naver.com", attributed: true, signups: 4 },
    { utmSource: null, referrerHost: "chatgpt.com", attributed: true, signups: 0 },
  ]);
  assert.deepEqual(got, [
    { channel: "네이버 검색", signups: 4 },
    { channel: "구글 검색", signups: 3 },
    { channel: "기록 없음", signups: 9 },
  ]);
});

/* ── ④ 주간표 ───────────────────────────────────────────────────────────── */

test("월별 가입 목표 — 계획 문서와 같은 12개월, 합계 10,000", () => {
  const vals = Object.values(GROWTH_MONTHLY_TARGETS);
  assert.equal(vals.length, 12);
  assert.equal(vals.reduce((a, b) => a + b, 0), 10_000);
  assert.equal(monthTarget("2026-10"), 30);
  assert.equal(monthTarget("2027-09"), 1910);
  assert.equal(monthTarget("2027-10"), null);
});

test("KST 달 경계 — 10/31 23시(KST)는 10월, 11/1 00시(KST)는 11월", () => {
  const oct31_23kst = Date.UTC(2026, 9, 31, 14, 0);
  const nov1_00kst = Date.UTC(2026, 9, 31, 15, 0);
  assert.equal(kstMonthKey(oct31_23kst), "2026-10");
  assert.equal(kstMonthKey(nov1_00kst), "2026-11");
  assert.equal(kstMonthStartIso(nov1_00kst), "2026-10-31T15:00:00.000Z");
});

const wk = (weekStart: string, visitors: number, signups: number): GrowthWeek => ({
  weekStart,
  visitors,
  sessions: visitors,
  searchLandings: 0,
  signups,
  newWatchers: 0,
});

test("conversionRate · 멈출 기준 — 방문자 0 은 null, 작은 표본·진행 중인 주로는 울리지 않는다", () => {
  assert.equal(conversionRate(wk("2026-10-05", 0, 0)), null);
  assert.equal(conversionRate(wk("2026-10-05", 200, 6)), 0.03);
  const small = [wk("2026-10-05", 10, 0), wk("2026-09-28", 40, 0), wk("2026-09-21", 30, 0)];
  assert.equal(conversionStopSignal(small), false, "주 방문자 50 미만이면 판단하지 않는다");
  const bad = [wk("2026-10-05", 500, 50), wk("2026-09-28", 300, 3), wk("2026-09-21", 400, 4)];
  assert.equal(conversionStopSignal(bad), true, "진행 중인 주(맨 앞)는 빼고 직전 2주로 본다");
  const ok = [wk("2026-10-05", 500, 0), wk("2026-09-28", 300, 9), wk("2026-09-21", 400, 4)];
  assert.equal(conversionStopSignal(ok), false);
});

test("트래픽 화면 — 성장 주간표가 페이지뷰 목표보다 먼저, 실패는 실패 문구로", () => {
  const page = code("app/admin/traffic/page.tsx");
  assert.ok(page.indexOf("<GrowthWeekly />") > 0);
  assert.ok(page.indexOf("<GrowthWeekly />") < page.indexOf("WEEKLY_PV_TARGET.toLocaleString"));
  const card = read("app/admin/traffic/GrowthWeekly.tsx");
  assert.match(card, /성장 주간표 불러오기 실패 · 잠시 후 다시/);
  assert.match(card, /최근 28일 가입 없음/);
});

/* ── ⑤ 메일 동의 · 공유 출처 ─────────────────────────────────────────────── */

test("주간 요약 메일 — 동의 기록(user_consents.marketing_agreed)이 정본", () => {
  const src = code("app/api/cron/weekly-digest/route.ts");
  assert.match(src, /consentEmailSet\(sb\)/);
  assert.match(src, /\.from\("user_consents"\)[\s\S]{0,80}\.eq\("marketing_agreed", true\)/);
  assert.doesNotMatch(src, /prefsEmailSet\(sb, "email_marketing", true\)/);
});

test("단지 공유 링크 — utm_source=share 가 붙는다(공유 유입 · 가입 채널이 센다)", () => {
  const src = read("app/complex/[id]/page.tsx");
  assert.match(src, /url="\?utm_source=share&utm_medium=complex"/);
});

/* ── ⑥ 운영 DB 변경 ─────────────────────────────────────────────────────── */

test("1046 마이그레이션 — 원장과 같은 바이트(md5) · 실행권은 service_role 만 · 끝 줄바꿈 없음", () => {
  const p = "supabase/migrations/20261008234525_1046_growth_attribution_weekly.sql";
  const sql = read(p);
  assert.equal(createHash("md5").update(sql).digest("hex"), "f966ba0cfd887607b78f329c33b38e76");
  assert.equal(sql.endsWith("\n"), false);
  for (const fn of [
    "link_signup_attribution(text, text, integer)",
    "admin_growth_weekly(integer, text[])",
    "admin_signup_channels(timestamptz, text[])",
  ]) {
    assert.ok(sql.includes(`revoke all on function public.${fn} from public, anon, authenticated;`), fn);
    assert.ok(sql.includes(`grant execute on function public.${fn} to service_role;`), fn);
  }
  assert.match(sql, /alter table public\.signup_attribution enable row level security;/);
  assert.match(sql, /revoke all on table public\.signup_attribution from public, anon, authenticated;/);
  assert.match(sql, /make_interval\(days => greatest\(coalesce\(p_max_age_days, 14\), 1\)\)/, "가입 14일 지난 계정은 잇지 않는다");
});
