/* [1061] 네이버·구글 실적·방문을 관리 화면에 + 다이제스트 뉴스 링크·사진. 잠그는 사실:
 *  T1 순수 규칙 — 리퍼러 호스트 → 출처 묶음(네이버 검색은 search 호스트만 · 블로그는 referral · AI 묶음) · 28일 접기(앞 기간·상위 화면).
 *  T2 서치콘솔 응답 모양 — 줄 파싱 · 합계(노출 가중 순위) · 기간(이틀 지연) · 빈 날 채우기 · 경로 표시.
 *  T3 손 기록 규칙 — 검증(엔진·날짜·수) · 빈 기록 거절 · 저장 키 · 되읽기.
 *  T4 화면·API — 관리 메뉴에 검색 유입 · API 는 관리자만 · 화면이 세 자를 다른 문장으로 · 트래픽 표에 "동의 방문" 라벨.
 *  T5 다이제스트 — 뉴스 항목에 href·사진·원문 · 메일은 제목 링크(절대 주소)·썸네일·원문 링크 · "시세" 낱말 제거. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyRefHost, deltaPct, summarizeSearchLandings } from "@/lib/seo/search-engines";
import { fillDates, gscDateRanges, pagePath, parseSearchAnalyticsRows, sumTotals } from "@/lib/seo/gsc-performance-shape";
import { normalizeSearchReport, readSearchReport, reportCtr, searchReportKey } from "@/lib/seo/search-report-rules";
import { weeklyDigestEmail } from "@/lib/email/templates";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, "");

test("T1 classifyRefHost — 검색 호스트만 검색으로, 네이버 블로그는 다른 사이트, AI 는 따로", () => {
  assert.equal(classifyRefHost("m.search.naver.com"), "naver");
  assert.equal(classifyRefHost("search.naver.com"), "naver");
  assert.equal(classifyRefHost("blog.naver.com"), "referral");
  assert.equal(classifyRefHost("www.google.com"), "google");
  assert.equal(classifyRefHost("google.co.kr"), "google");
  assert.equal(classifyRefHost("com.google.android.googlequicksearchbox"), "google");
  assert.equal(classifyRefHost("www.bing.com"), "bing");
  assert.equal(classifyRefHost("search.daum.net"), "daum");
  assert.equal(classifyRefHost("duckduckgo.com"), "other-search");
  assert.equal(classifyRefHost("chatgpt.com"), "ai");
  assert.equal(classifyRefHost("perplexity.ai"), "ai");
  assert.equal(classifyRefHost(""), "direct");
  assert.equal(classifyRefHost(null), "direct");
  assert.equal(classifyRefHost("example.com"), "referral");
});

test("T1 summarizeSearchLandings — 28일 안만 세고 앞 28일은 비교로, 상위 화면은 엔진별", () => {
  const today = "2026-10-12";
  const rows = [
    { day: "2026-10-12", route: "/complex/[id]", ref_host: "m.search.naver.com", n: 5 },
    { day: "2026-10-11", route: "/town/news/[id]", ref_host: "search.naver.com", n: 3 },
    { day: "2026-10-11", route: "/complex/[id]", ref_host: "www.google.com", n: 2 },
    { day: "2026-09-15", route: "/", ref_host: "", n: 9 }, // 기간 안 · 직접
    { day: "2026-09-14", route: "/", ref_host: "m.search.naver.com", n: 7 }, // 앞 기간
    { day: "2026-07-01", route: "/", ref_host: "m.search.naver.com", n: 100 }, // 둘 다 밖 → 버림
    { day: "2026-10-10", route: "/x", ref_host: "www.bing.com", n: 0 }, // 0 은 무시
  ];
  const s = summarizeSearchLandings(rows, today, 28);
  assert.equal(s.days.length, 28);
  assert.equal(s.range.start, "2026-09-15");
  assert.equal(s.range.end, today);
  assert.equal(s.range.prevStart, "2026-08-18");
  assert.equal(s.range.prevEnd, "2026-09-14");
  assert.equal(s.totals.naver, 8);
  assert.equal(s.totals.google, 2);
  assert.equal(s.totals.direct, 9);
  assert.equal(s.prevTotals.naver, 7);
  assert.equal(s.days.at(-1)?.bySource.naver, 5);
  assert.deepEqual(s.topRoutes.naver, [
    { route: "/complex/[id]", n: 5 },
    { route: "/town/news/[id]", n: 3 },
  ]);
  assert.deepEqual(s.topRoutes.google, [{ route: "/complex/[id]", n: 2 }]);
  assert.equal(deltaPct(8, 7), 14);
  assert.equal(deltaPct(5, 0), null);
});

test("T2 서치콘솔 응답 — 줄 파싱·합계(노출 가중 순위)·기간·빈 날 채우기·경로", () => {
  const rows = parseSearchAnalyticsRows({
    rows: [
      { keys: ["2026-10-01"], clicks: 10, impressions: 1000, ctr: 0.01, position: 12.5 },
      { keys: ["2026-10-03"], clicks: "3", impressions: 500, ctr: 0.006, position: 8 },
      { clicks: 1 }, // 키 없음 → key ""
      "junk",
    ],
  });
  assert.equal(rows.length, 3);
  assert.equal(rows[1].clicks, 3);
  assert.equal(parseSearchAnalyticsRows(null).length, 0);
  const t = sumTotals(rows.slice(0, 2));
  assert.equal(t.clicks, 13);
  assert.equal(t.impressions, 1500);
  assert.equal(Math.round(t.ctr * 10000) / 10000, 0.0087);
  assert.equal(t.position, (12.5 * 1000 + 8 * 500) / 1500);
  assert.equal(sumTotals([]).position, null);

  const r = gscDateRanges("2026-10-12", 28, 2);
  assert.equal(r.end, "2026-10-10");
  assert.equal(r.start, "2026-09-13");
  assert.equal(r.prevEnd, "2026-09-12");
  assert.equal(r.prevStart, "2026-08-16");

  const filled = fillDates(rows.slice(0, 2), "2026-10-01", "2026-10-03");
  assert.deepEqual(
    filled.map((x) => [x.key, x.clicks]),
    [
      ["2026-10-01", 10],
      ["2026-10-02", 0],
      ["2026-10-03", 3],
    ],
  );
  assert.equal(pagePath("https://naezipnow.com/complex/%EC%84%9C%EC%9A%B8", "https://naezipnow.com"), "/complex/서울");
  assert.equal(pagePath("https://naezipnow.com", "https://naezipnow.com"), "/");
  assert.equal(pagePath("https://other.com/a", "https://naezipnow.com"), "https://other.com/a");
});

test("T3 손 기록 규칙 — 검증·빈 기록 거절·키·되읽기·CTR", () => {
  const ok = normalizeSearchReport(
    { engine: "naver", date: "2026-10-12", clicks: "2,500", impressions: "28000", indexedPages: "", note: "  수집 요청 20건  " },
    "admin@example.com",
    "2026-10-12T00:00:00.000Z",
  );
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.report.clicks, 2500);
    assert.equal(ok.report.impressions, 28000);
    assert.equal(ok.report.indexedPages, null);
    assert.equal(ok.report.periodDays, 30);
    assert.equal(ok.report.note, "수집 요청 20건");
    assert.equal(reportCtr(ok.report), 2500 / 28000);
    assert.equal(searchReportKey(ok.report.engine, ok.report.date), "search-report:naver:2026-10-12");
    assert.deepEqual(readSearchReport(ok.report), ok.report);
  }
  const empty = normalizeSearchReport({ engine: "naver", date: "2026-10-12" }, "a", "b");
  assert.equal(empty.ok, false);
  const bad = normalizeSearchReport({ engine: "yahoo", date: "2026-13-40", clicks: "-1", periodDays: 0 }, "a", "b");
  assert.equal(bad.ok, false);
  /* 엔진·날짜·클릭·기간 네 가지 + 틀린 클릭이 버려져 "적은 값이 없음"까지 다섯 — 오류를 하나로 뭉치지 않는다 */
  if (!bad.ok) assert.equal(bad.errors.length, 5);
  assert.equal(readSearchReport({ engine: "naver", date: "nope" }), null);
  assert.equal(reportCtr({ clicks: 1, impressions: null }), null);
});

test("T4 화면·API — 메뉴·관리자 가드·세 자 구분·트래픽 라벨", () => {
  const nav = code("app/admin/AdminNav.tsx");
  assert.match(nav, /href: "\/admin\/search", label: "검색 유입"/);
  const api = code("app/api/admin/search-report/route.ts");
  assert.match(api, /isAdmin\(session\)/);
  assert.match(api, /status: 403/);
  assert.match(api, /normalizeSearchReport\(body/);
  assert.match(api, /dbUnavailable\("admin\/search-report:save"/);
  const page = code("app/admin/search/page.tsx");
  assert.match(page, /force-dynamic/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(page, /loadSearchLandings\(now\)/);
  assert.match(page, /loadGscPerformance\(\)/);
  assert.match(page, /listSearchReports\("naver"\)/);
  assert.match(page, /GscSetupSteps/);
  assert.match(page, /연결 안 됨/);
  assert.match(page, /조회 실패/);
  assert.match(page, /기록 없음/);
  assert.match(page, /<SearchReportForm engine="naver"/);
  const traffic = code("app/admin/traffic/page.tsx");
  assert.match(traffic, /유입 출처 · 동의 방문 표본/);
  assert.match(traffic, /href="\/admin\/search"/);
  const cache = code("lib/admin/gsc-performance.ts");
  assert.match(cache, /revalidate: 3600/);
  const landings = code("lib/admin/search-landings.ts");
  assert.match(landings, /\.eq\("is_landing", true\)/);
  const store = code("lib/admin/search-reports.ts");
  assert.match(store, /onConflict: "key"/);
  assert.doesNotMatch(store, /\.delete\(/);
});

test("T5 다이제스트 — 뉴스 항목에 href·사진·원문, 메일은 링크·썸네일, '시세' 낱말 없음", () => {
  const digest = code("lib/newui/digest.ts");
  assert.match(digest, /href: canonicalNewsPath\(readNewsMeta\(p\.automationMeta\)\.seo\.slug, p\.id\)/);
  assert.match(digest, /imageUrl: newsImageUrl\(p\)/);
  const cron = code("app/api/cron/weekly-digest/route.ts");
  assert.match(cron, /href: n\.href/);
  assert.match(cron, /imageUrl: n\.imageUrl/);
  /* 메일 사진은 보내기 전 확인(받아지지 않으면 null) — 메일은 깨진 사진을 숨길 수 없다 */
  assert.match(cron, /newsForMail = emailReady \? await dropUnreachableImages\(digest\.news, 5\)/);
  assert.match(cron, /news: newsForMail\.map/);
  const verify = code("lib/email/verify-image.ts");
  assert.match(verify, /\/\^image\\\/\/i\.test\(type\)/);
  assert.match(verify, /AbortController/);
  assert.doesNotMatch(cron, /주요 지역 시세/);
  const page = code("app/digest/(index)/page.tsx");
  assert.match(page, /<DigestThumb src=\{n\.imageUrl\}/);
  assert.match(page, /href=\{n\.sourceUrl\}/);
  assert.doesNotMatch(page, /주요 지역 시세/);

  const mail = weeklyDigestEmail({
    weekLabel: "10월 2주차",
    market: [{ name: "강남구", price: "28.6억", delta: "▼ 0.4%", tone: "down" }],
    news: [
      {
        title: "A <b>기사</b>",
        sourceName: "아시아경제",
        href: "/town/news/a-1111",
        imageUrl: "https://img.example.com/a.jpg",
        sourceUrl: "https://news.example.com/a",
      },
      { title: "B 기사", sourceName: null, href: null, imageUrl: "javascript:alert(1)", sourceUrl: null },
    ],
    communityCount: 0,
  });
  assert.match(mail.html, /href="https:\/\/naezipnow\.com\/town\/news\/a-1111"/);
  assert.match(mail.html, /<img src="https:\/\/img\.example\.com\/a\.jpg" alt="A &lt;b&gt;기사&lt;\/b&gt;" width="64"/);
  assert.match(mail.html, /href="https:\/\/news\.example\.com\/a"[^>]*>원문 · 아시아경제/);
  assert.doesNotMatch(mail.html, /javascript:/);
  assert.match(mail.html, /시장 요약 · 주요 지역/);
  assert.doesNotMatch(mail.html, /주요 지역 시세/);
  assert.match(mail.text, /B 기사\n/);
  assert.match(mail.text, /A <b>기사<\/b> https:\/\/naezipnow\.com\/town\/news\/a-1111/);
});
