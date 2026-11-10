import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* [1115 · 다른 화면 검토] 소유자 2026-11-09 "다른 페이지들도 검토" — 같은 사실 한 번 · 5개 넘으면 필터 · 표에 그래프 */
const read = (p: string) => readFileSync(p, "utf8");
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

test("단지 상세 — 레일 전세가율 칸 없음(본문 카드) · 요약 탭은 대표가 칸 없음(결과 요약)", () => {
  const p = strip(read("app/complex/[id]/page.tsx"));
  assert.doesNotMatch(p, /key: "jeonse",\s*label: "전세가율"/);
  assert.match(p, /<JeonseGapCards jeonse=\{facts\.jeonseRatio\}/);
  assert.match(p, /\.filter\(\s*\(t\) => t\.key !== "price",\s*\)/);
});

test("단지 목록 — 25개 구 칩 벽 대신 제목 옆 접힘(JS 없음 · 링크 25개는 판 안)", () => {
  const b = strip(read("app/complex/browse/page.tsx"));
  assert.match(b, /<details className="group relative">/);
  assert.match(b, /SEOUL_BROWSE_REGIONS\.map\(\(r\) => \{/);
  assert.match(b, /aria-current=\{active \? "page" : undefined\}/);
  assert.doesNotMatch(b, /rounded-full px-3 py-1\.5/);
});

test("공개 임장노트 — 오른쪽 레일은 광고만(표 첫 줄들과 같은 '최근 임장' 없음)", () => {
  const f = strip(read("app/notes/notes-feed-client.tsx"));
  assert.match(f, /function RightRail\(\{ ad \}: \{ ad: ReactNode \}\)/);
  assert.doesNotMatch(f, />최근 임장</);
});

test("지역 시세 표 — 시장 온도 0~100 막대(50 눈금)", () => {
  const e = strip(read("app/analysis/region-sise-entry.tsx"));
  assert.match(e, /r\.temp\.score >= 55 \? "bg-up" : r\.temp\.score <= 45 \? "bg-down" : "bg-text-3"/);
  assert.match(e, /left-1\/2 w-px bg-surface/);
});

import { buildTickerPages, seriesSince, toTickerCard } from "../../lib/region/region-ticker.ts";

const rowOf = (id: string, sido: string, avg: number | null) => ({
  id, name: id, sido, label: `${sido} ${id}`, href: `/region/${id}`, keys: [id], avgSaleKrw: avg, jeonseRatio: null, temp: null,
});
const ser = (vals: number[]) => vals.map((v, i) => ({ period: `2026-${String(i + 1).padStart(2, "0")}-01`, value: v }));

test("시세판 — 칸(지수 · 전월 대비 · 선) · 두 달 미만 제외 · 쪽 = 서울 평균가 순 · 상승 순 · 하락 순", () => {
  const c = toTickerCard(rowOf("gangnam", "서울", 2.78e9), ser([100.15, 98.5]))!;
  assert.equal(c.index, 98.5);
  assert.equal(c.momPct, -1.6);
  assert.equal(c.ym, "2026.02");
  assert.equal(toTickerCard(rowOf("x", "서울", 1), ser([100])), null);
  const rows = [rowOf("a", "서울", 10), rowOf("b", "서울", 30), rowOf("c", "경기", 50), rowOf("d", "서울", null)];
  const m = new Map([["a", ser([100, 101])], ["b", ser([100, 99])], ["c", ser([100, 103])], ["d", ser([100, 100])]]);
  const pages = buildTickerPages(rows, m, 16);
  assert.deepEqual(pages.map((p) => p.key), ["seoul", "up", "down"]);
  assert.deepEqual(pages[0].cards.map((x) => x.id), ["b", "a", "d"]);
  assert.deepEqual(pages[1].cards.map((x) => x.id), ["c", "a"]);
  assert.deepEqual(pages[2].cards.map((x) => x.id), ["b"]);
  assert.equal(buildTickerPages(rows, m, 1)[0].cards.length, 1, "쪽 상한");
  /* 마지막 달이 다른(공표 멈춘) 지역은 빠진다 */
  const stale = new Map(m);
  stale.set("e", [{ period: "2025-12-01", value: 100 }, { period: "2026-01-01", value: 110 }]);
  const p2 = buildTickerPages([...rows, rowOf("e", "경기", null)], stale, 16);
  assert.ok(!p2.flatMap((p) => p.cards).some((c) => c.id === "e"));
  assert.equal(seriesSince(new Date(Date.UTC(2026, 10, 9)), 14), "2025-09-01");
});

test("시세판 · 도구 결과 예시 — 서버 칸 + 회전판 · 폰 앞 8칸 · '예시' 표기 · 도구 표 칸 머리", () => {
  const b = strip(read("app/analysis/region-ticker-board.tsx"));
  assert.doesNotMatch(b, /"use client"/);
  assert.match(b, /<RollingPanel/);
  assert.match(b, /grid grid-cols-2 gap-2 md:grid-cols-4/);
  assert.match(b, /i >= 8 \? "max-md:hidden" : ""/);
  assert.match(b, /지역 시세판 불러오기 실패 · 잠시 후 다시/);
  const e = strip(read("app/analysis/region-sise-entry.tsx"));
  assert.match(e, /<RegionTickerBoard pages=\{data\.tickerPages\} failed=\{data\.tickerFailed\} \/>/);
  const t = strip(read("app/analysis/tool-preview.tsx"));
  assert.doesNotMatch(t, /^import /m, "import 0 — 클라이언트 묶음 예산");
  assert.match(t, />예시</);
  for (const id of ["ai-diagnosis", "ai-prediction", "ai-inspection", "ai-timing"]) assert.match(t, new RegExp(`"${id}": \\{ el:`));
  const h = strip(read("app/analysis/hub-tiers.tsx"));
  assert.match(h, />결과 예시</);
  assert.match(h, /<ToolResultPreview id=\{c\.id\} result=\{c\.result\} \/>/);
});

import { buildYearHeat } from "../../lib/reports/year-heat.ts";

test("[1118] 월간 리포트 달력 — 해마다 12칸 · 그 해 안에서 0~4단 · 신고 중 달은 -1 · 빈 달은 null", () => {
  const mk = (ym: string, regionCount: number, txCount: number) => ({ ym, regionCount, txCount, updatedAt: null });
  const months = [mk("202611", 32, 388), mk("202610", 249, 31471), mk("202609", 251, 31124), mk("202604", 251, 48001), mk("202601", 218, 40897), mk("202512", 82, 18016), mk("202501", 82, 10578)];
  const open = (ym: string) => ym >= "202610";
  const ys = buildYearHeat(months, open);
  assert.deepEqual(ys.map((y) => y.year), ["2026", "2025"]);
  const y26 = ys[0];
  assert.equal(y26.cells.length, 12);
  assert.equal(y26.cells[3]!.level, 4, "4월 = 그 해 최대");
  assert.equal(y26.cells[10]!.level, -1, "11월 신고 중");
  assert.equal(y26.cells[9]!.level, -1, "10월 신고 중");
  assert.equal(y26.cells[1], null, "2월 없음");
  assert.equal(y26.cells[8]!.level, 2, "9월 31,124 / 48,001 = 0.65");
  assert.equal(ys[1].cells[11]!.level, 4, "2025년은 2025년 안에서 견준다");
  assert.equal(ys[1].total, 28594);
});

test("[1118] 월간 리포트 · 단지 목록 — 달력 칸(서버 조각) · 순위 목록(순번 · 큰 가격 · 12개월 막대) · 순서 칩", () => {
  const page = strip(read("app/reports/(index)/page.tsx"));
  assert.match(page, /<ReportsYearHeatmap years=\{heat\} \/>/);
  assert.doesNotMatch(page, /ReportsMonthBars|<details key=\{y\}/);
  const h = strip(read("app/reports/(index)/ReportsYearHeatmap.tsx"));
  assert.doesNotMatch(h, /"use client"/);
  assert.match(h, /grid grid-cols-4 gap-1\.5 sm:grid-cols-6/);
  assert.match(h, /신고 중/);
  const t = strip(read("app/components/ComplexSummaryTable.tsx"));
  assert.match(t, /<ol className="m-0 flex list-none flex-col p-0">/);
  assert.match(t, /ranked && i < 3 \? "text-primary" : "text-text-3"/);
  assert.match(t, /12개월 \{s\.txCount12m\.toLocaleString\("ko-KR"\)\}건/);
  assert.doesNotMatch(t, /<table/);
  const b = strip(read("app/complex/browse/page.tsx"));
  assert.match(b, /const sort = sp\.sort === "tx" \|\| sp\.sort === "price" \? sp\.sort : "recent";/);
  assert.match(b, /summaries=\{ordered\}/);
});

test("[1117] 시장 온도 레일 — 0~100 막대(지역 시세 표와 같은 꼴)", () => {
  const c = strip(read("app/analysis/temperature/TempMapClient.tsx"));
  assert.match(c, /r\.current\.score >= 55 \? "bg-up" : r\.current\.score <= 45 \? "bg-down" : "bg-text-3"/);
});

test("[1119] 입주 물량 월별 숫자 접힘 · 단지 비교 지역 고르기 접힘 · 맞대결 줄", () => {
  const sup = strip(read("app/supply/SupplyClient.tsx"));
  assert.match(sup, /<details className="group" open=\{monthlyShown\.length <= 2\}>/);
  const cmp = strip(read("app/complex/compare/page.tsx"));
  assert.match(cmp, /지역 고르기 · \{groups\.length\}곳/);
  assert.equal((cmp.match(/groups\.map\(/g) ?? []).length, 2, "링크 63개는 HTML 에 그대로(고르기 판 · 접힘)");
  const t = strip(read("app/complex/compare/ComparePairTiles.tsx"));
  assert.match(t, /조합 \{rest\.length\}개 더 보기/);
});

test("[1120] 정비사업 머리 '최다 단계' 없음 · 동네 홈 다른 동네 = 고르기 접힘 · 동 최근 실거래 앞 8건", () => {
  const r = strip(read("app/redevelopment/(index)/page.tsx"));
  assert.doesNotMatch(r, /최다 단계/);
  const t = strip(read("app/town/[region]/page.tsx"));
  assert.match(t, /다른 동네 고르기 · \{ownCity \?\? "전국"\} 먼저/);
  assert.doesNotMatch(t, /open=\{g\.city === ownCity\}/);
  const d = strip(read("app/dong/[region]/[dong]/page.tsx"));
  assert.match(d, /\[deals\.slice\(0, 8\), deals\.slice\(8\)\]/);
  assert.match(d, /나머지 \{n\(part\.length\)\}건 보기/);
});

import { COMPARE_TABS, GUIDE_TABS, REPORT_TABS } from "../../lib/nav/section-tabs.ts";
import { map3dPathFromAddress } from "../../lib/map3d/geo.ts";

test("[1121] 기능 통폐합 1 · 3단계 — 묶음 탭(비교 · 리포트 · 가이드) · 계산기에 시나리오 · 지도 2D|3D · 지역 탭 임장 가이드 · 내 분석", () => {
  assert.deepEqual(COMPARE_TABS.map((t) => t.href), ["/complex/compare", "/notes/compare", "/listings/compare"]);
  assert.deepEqual(REPORT_TABS.map((t) => t.href), ["/reports", "/digest"]);
  assert.deepEqual(GUIDE_TABS.map((t) => t.label), ["전체", "임장", "계약", "규제", "데이터"]);
  const uses: Array<[string, string]> = [
    ["app/complex/compare/page.tsx", 'tabs={COMPARE_TABS} current="/complex/compare"'],
    ["app/notes/compare/page.tsx", 'tabs={COMPARE_TABS} current="/notes/compare"'],
    ["app/listings/compare/page.tsx", 'tabs={COMPARE_TABS} current="/listings/compare"'],
    ["app/reports/(index)/page.tsx", 'tabs={REPORT_TABS} current="/reports"'],
    ["app/digest/(index)/page.tsx", 'tabs={REPORT_TABS} current="/digest"'],
    ["app/guides/page.tsx", 'tabs={GUIDE_TABS} current="/guides"'],
    ["app/imjang/(index)/page.tsx", 'tabs={GUIDE_TABS} current="/imjang"'],
    ["app/guides/contract/page.tsx", 'tabs={GUIDE_TABS} current="/guides/contract"'],
    ["app/guides/regulations/page.tsx", 'tabs={GUIDE_TABS} current="/guides/regulations"'],
    ["app/methodology/page.tsx", 'tabs={GUIDE_TABS} current="/methodology"'],
    ["app/data-sources/page.tsx", 'tabs={GUIDE_TABS} current="/methodology"'],
  ];
  for (const [p, needle] of uses) assert.ok(read(p).includes(needle), p);
  assert.match(read("app/complex/compare/page.tsx"), /href="\/analysis\/compare"/);
  assert.match(read("app/calculator/CalculatorNav.tsx"), /\{ href: "\/analysis\/scenario", label: "시장·대출 시나리오" \}/);
  assert.match(read("app/analysis/scenario/ScenarioClient.tsx"), /<CalculatorNav current="\/analysis\/scenario" \/>/);
  assert.match(read("app/imjang/[slug]/page.tsx"), /current="imjang"/);
  assert.match(read("app/map/ComplexInfoPanel.tsx"), /3D로 보기/);
  assert.match(read("app/map/3d/Map3DClient.tsx"), /\/map\?region=\$\{encodeURIComponent\(params\.region\)\}/);
  const my = read("app/my/(index)/page.tsx");
  assert.match(my, /aria-label="내 분석"/);
  assert.match(my, /href: "\/my\/analyses"/);
  /* 지번 주소에서 동 → 3D 주소(서울만 · 도로명엔 동을 지어내지 않는다) */
  assert.equal(map3dPathFromAddress("서울특별시", "강남구", "서울특별시 강남구 대치동 316", null), `/map/3d?region=${encodeURIComponent("서울 강남구").replace(/%20/g, "+")}&dong=${encodeURIComponent("대치동")}`);
  assert.equal(map3dPathFromAddress("서울특별시", "강남구", "서울특별시 강남구 남부순환로 3104", null), null);
  assert.equal(map3dPathFromAddress("경기도", "성남시 분당구", "경기도 성남시 분당구 정자동 1", null), null);
});

import { REGION_CATALOG as CAT_1122 } from "../../lib/region/catalog.ts";
import { countShort, imjangMapMarkers, regionSwitchMarkers, switchHref } from "../../lib/region/region-switch.ts";

test("[1122] 다른 지역 찾기 — 탭 그대로 이동 · 지도 말풍선 · 임장 가이드 목록 = 지도 고르기", () => {
  const hasT = (id: string) => id === "gangnam";
  assert.equal(switchHref("overview", "mapo", hasT), "/region/mapo");
  assert.equal(switchHref("town", "mapo", hasT), "/town/mapo");
  assert.equal(switchHref("report", "mapo", hasT), "/region/mapo/report");
  assert.equal(switchHref("temperature", "gangnam", hasT), "/analysis/temperature/gangnam");
  assert.equal(switchHref("temperature", "mapo", hasT), "/region/mapo", "온도 기록 없는 지역은 개요로");
  assert.equal(switchHref("imjang", "mapo", hasT), "/region/mapo");
  const ms = regionSwitchMarkers(CAT_1122, "town", hasT);
  assert.ok(ms.length >= 100 && ms.every((m) => m.href.startsWith("/town/") && m.value === null));
  assert.equal(countShort(40914), "4.1만건");
  assert.equal(countShort(922), "922건");
  const r = imjangMapMarkers([{ slug: "서울 강남구", name: "서울 강남구", txCount: 13935 }, { slug: "없는군", name: "없는군", txCount: 5 }], CAT_1122);
  assert.equal(r.markers.length, 1);
  assert.equal(r.markers[0].id, "gangnam");
  assert.equal(r.markers[0].value, "1.4만건");
  assert.equal(r.markers[0].href, `/imjang/${encodeURIComponent("서울 강남구")}`);
  assert.deepEqual(r.rest.map((x) => x.slug), ["없는군"]);
  const tabs = strip(read("app/components/region/RegionTabs.tsx"));
  assert.match(tabs, /<RegionSwitcher markers=\{switchMarkers\} currentName=\{info\.name\}/);
  const sw = strip(read("app/components/region/RegionSwitcher.tsx"));
  assert.match(sw, /\{open && \(/, "지도는 펼칠 때만");
  const idx = strip(read("app/imjang/(index)/page.tsx"));
  assert.match(idx, /<RegionMapPicker\s+markers=\{imjang\.markers\}/);
  assert.match(idx, /전체 목록 \{regions\.length\}곳/);
});

test("[1123] 다른 지역 찾기 = 늘 보이는 검색칸 + 지도 단추 · 지도 폴백은 내용 높이 격자 · 홈 시장 한눈에 검색", () => {
  const sw = strip(read("app/components/region/RegionSwitcher.tsx"));
  assert.match(sw, /<RegionSearchBox regions=\{regions\} pickIds=\{\[\]\} \/>/);
  assert.match(sw, /\{open \? "지도 닫기" : "지도로 찾기"\}/);
  const pk = strip(read("app/components/region/RegionMapPicker.tsx"));
  assert.match(pk, /grid list-none grid-cols-2 gap-1 p-1 sm:grid-cols-3 lg:grid-cols-5/);
  assert.doesNotMatch(pk, /bg-surface p-2 \$\{heightClass\}/, "폴백이 지도 높이를 잡지 않는다");
  assert.match(strip(read("app/components/home/HomeMarketBoard.tsx")), /<RegionSearchBox regions=\{searchRegions\} pickIds=\{\[\]\} \/>/);
});

/* ── [1124] 좌우 광고 띠 · 처음 온 사람의 길 ── */
test("[1124] 광고 — 좌우 띠가 셸과 홈에 있고, 가운데 흐름 자리는 띠가 보일 때 숨는다", () => {
  const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  assert.ok(read("app/layout.tsx").includes("<SideAdRails />"));
  assert.ok(!read("app/components/PageShell.tsx").includes("SideAdRails"), "PageShell 은 클라이언트 화면도 쓴다");
  const zone = read("app/components/ads/AdZone.tsx");
  assert.ok(zone.includes('data-spot={where}'));
  assert.ok(/CENTER_PLACEMENTS[^\n]*"home_feed", "community_feed", "report_free_body"/.test(zone));
  const css = read("app/globals.css");
  assert.ok(css.includes('main .ad-zone[data-spot="center"]'));
  const rail = css.slice(css.indexOf("[1124] 좌우 광고 띠"));
  assert.ok(!/position:\s*(sticky|fixed)/.test(rail), "띠는 고정이 아니다");
  assert.ok(read("app/components/ads/SideRailGate.tsx").includes("isAdsExcludedPath(pathname)"));
});

test("[1124] 처음 온 사람의 길 — 네 단계 순서 · 가입 뒤 돌아올 곳은 내부 경로만", async () => {
  const m = await import("../../lib/nav/start-steps.ts");
  assert.deepEqual(m.START_STEPS.map((s) => s.key), ["signup", "note", "map", "analysis"]);
  assert.equal(m.signupHref("/notes/abc"), "/signup?callbackUrl=%2Fnotes%2Fabc");
  assert.equal(m.signupHref("//evil.example"), "/signup");
  assert.equal(m.signupHref("https://evil.example"), "/signup");
  assert.equal(m.signupHref(null), "/signup");
  assert.equal(m.currentStep("note"), "note");
  assert.equal(m.currentStep("home"), null);
  for (const s of m.START_STEPS) assert.ok(!/[!！]|해 보세요/.test(s.title + s.sub));
});

/* ── [1125] 제안 50가지 가운데 새로 넣은 것 ── */
test("[1125] 내 노트 방문 달력 — 최근 12개월 칸 · 방문일 없는 노트는 칸에 넣지 않는다", async () => {
  const { buildVisitMonths } = await import("../../lib/notes/visit-months.ts");
  const r = buildVisitMonths(["2026-11-03", "2026-11-09", "2026-08-01", "2025-11-30", "2025-12-01", undefined, "x"], new Date(2026, 10, 10));
  assert.equal(r.cells.length, 12);
  assert.equal(r.cells[0].ym, "2025-12");
  assert.equal(r.cells[11].ym, "2026-11");
  assert.equal(r.cells[11].count, 2);
  assert.equal(r.cells[11].level, 3);
  assert.equal(r.cells[0].count, 1);
  assert.equal(r.total, 4, "12개월 밖(2025-11)은 세지 않는다");
  assert.equal(r.undated, 2);
  assert.equal(buildVisitMonths([], new Date(2026, 0, 5)).cells[0].ym, "2025-02");
});

test("[1125] 유입 경로 묶음 — 첫 화면을 홈 · 임장노트 · 뉴스 · 전문가 · 지도 · 지역·단지로", async () => {
  const { entryGroupOf, summarizeCounts } = await import("../../lib/metrics/page-count.ts");
  assert.equal(entryGroupOf("/"), "home");
  assert.equal(entryGroupOf("/notes/[id]"), "notes");
  assert.equal(entryGroupOf("/town/news/[id]"), "news");
  assert.equal(entryGroupOf("/town/experts"), "other");
  assert.equal(entryGroupOf("/pro"), "expert");
  assert.equal(entryGroupOf("/complex/[id]"), "place");
  assert.equal(entryGroupOf("/pricing"), "other");
  const row = (route: string, n: number, is_landing = true) => ({ day: "2026-11-09", route, is_landing, ref_host: "", utm_source: "", device: "m", n });
  const s = summarizeCounts([row("/notes/[id]", 5), row("/town/news/[id]", 3), row("/", 2), row("/notes/[id]", 9, false)], "2026-11-10");
  const by = Object.fromEntries((s.entryGroups ?? []).map((g) => [g.key, g.n]));
  assert.equal(by.notes, 5, "들어온 첫 화면만 센다");
  assert.equal(by.news, 3);
  assert.equal(by.home, 2);
  assert.equal((s.entryGroups ?? []).reduce((a, g) => a + g.n, 0), s.landings7);
});

test("[1125] 화면 — 로그인 사실 세 칸 · 지도 첫 안내 · 홈 표 순서 칩 · 도구 화면 띠 배너 없음 · 전문가 등록 길", () => {
  const login = read("app/login/LoginClient.tsx");
  const signup = read("app/signup/SignupClient.tsx");
  for (const k of ["저장 · 사진 · 점수", "10곳 · 새 실거래 알림", "누적 3회 무료"]) {
    assert.ok(login.includes(k) && signup.includes(k), `로그인 · 가입이 같은 사실: ${k}`);
  }
  const coach = read("app/map/MapFirstCoach.tsx");
  assert.match(coach, /readAuthedHint\(\)/);
  assert.match(coach, /localStorage\.setItem\(KEY/);
  assert.match(read("app/map/page.tsx"), /<MapFirstCoach \/>/);
  const tb = read("app/components/home/HomeRegionTableBody.tsx");
  assert.match(tb, /aria-pressed=\{sort === o\.key\}/);
  assert.match(read("app/components/nav/StartSteps.tsx"), /href="\/town\/experts\/apply"/);
  assert.match(read("app/my/expert-profile/page.tsx"), /승인 뒤 프로필이 보이는 곳/);
  assert.doesNotMatch(read("app/complex/[id]/RegionRelative.tsx"), /\{r\.district\} 전세가율/);
  assert.match(read("app/notes/notes-feed-client.tsx"), /<MineVisitMonths visitDates=/);
});

/* ── [1126] 잔여분 ── */
test("[1126] AI 해설 남은 횟수 글자 — 한도 없으면 줄 없음 · 누적/이번 달 구분 · 음수 없음", async () => {
  const { aiQuotaLabel } = await import("../../lib/ai/quota-label.ts");
  assert.equal(aiQuotaLabel([{ key: "ai_analysis", used: 1, limit: 3, lifetime: true }]), "누적 3회 중 2회 남음");
  assert.equal(aiQuotaLabel([{ key: "ai_analysis", used: 12, limit: 30 }]), "이번 달 30회 중 18회 남음");
  assert.equal(aiQuotaLabel([{ key: "ai_analysis", used: 5, limit: 3, lifetime: true }]), "누적 3회 중 0회 남음");
  assert.equal(aiQuotaLabel([{ key: "ai_analysis", used: 5, limit: null }]), null);
  assert.equal(aiQuotaLabel([{ key: "bookmark", used: 1, limit: 3 }]), null);
  assert.equal(aiQuotaLabel(null), null);
});

test("[1126] 화면 — 자사 안내 카드 한 번 · 홈 내 관심 지역 · 노트 비교 점수 막대 · 남은 횟수", () => {
  const tr = read("app/components/ads/AdSlotTracker.tsx");
  assert.match(tr, /data-house-ad=\{kind === "house" \? "" : undefined\}/);
  assert.match(tr, /if \(kind !== "house"\) return;/);
  /* [1131] 내 관심 지역 칩은 홈이 아니라 마이에서(MyHomeBrief) */
  assert.match(read("app/my/MyHomeBrief.tsx"), /<HomeMyRegions \/>/);
  assert.match(read("app/notes/compare/page.tsx"), /Math\.max\(0, Math\.min\(100, Number\(s\.value\) \|\| 0\)\)/);
  assert.match(read("app/analysis/ai/[tool]/ResultRail.tsx"), /\{!ai\.running && <AiQuotaNote \/>\}/);
});

/* ── [1127] 토스 심사 완료 뒤 잔여분 ── */
test("[1127] 상단 메뉴 — 핵심 넷만 펼치고 뉴스 · 요금제는 더보기(자료 여섯은 그대로)", async () => {
  const { NAV } = await import("../../app/components/nav-data.ts");
  assert.deepEqual(NAV.filter((i) => !i.more).map((i) => i.label), ["임장노트", "지도", "AI 분석", "동네"]);
  assert.deepEqual(NAV.filter((i) => i.more).map((i) => i.label), ["뉴스", "요금제"]);
  assert.equal(NAV.length, 6, "좌측 내비 · 모바일 전체 메뉴는 여섯 그대로");
  const h = read("app/components/Header.tsx");
  assert.match(h, /NAV\.filter\(\(item\) => !item\.more\)\.map/);
  assert.match(h, /moreItems\.map\(\(item\) =>/);
  assert.match(h, />\s*더보기\s*</);
});

test("[1127] 동 화면 — 구 공개 임장노트 수(동 단위로 세지 않는다 · 실패 · 0건이면 줄 없음)", () => {
  const p = read("app/dong/[region]/[dong]/page.tsx");
  assert.match(p, /countPublicNotesByRegionToken\(guToken\)\.catch\(\(\) => null\)/);
  assert.match(p, /공개 임장노트 없음 · /);
  const s = read("lib/inspection/store-db.ts");
  const f = s.slice(s.indexOf("export async function countPublicNotesByRegionToken"), s.indexOf("* 공개 임장노트 목록 (최신순)"));
  assert.match(f, /\.eq\("is_public", true\)/);
  assert.match(f, /getReadOnlySupabase\(\)/);
});

test("[1127] 조서 지도 — 서울 25구 말풍선 · 건수 없으면 이름만 · 0건도 남긴다", async () => {
  const { upisGuMarkers } = await import("../../lib/region/region-switch.ts");
  const { SEOUL_DISTRICTS } = await import("../../lib/map/seoul-districts.ts");
  const withCounts = upisGuMarkers(SEOUL_DISTRICTS, new Map([["강남구", 1234]]));
  assert.equal(withCounts.length, 25);
  assert.equal(withCounts.find((m) => m.name === "강남구")?.value, "1,234건");
  assert.equal(withCounts.find((m) => m.name === "마포구")?.value, "0건");
  assert.match(withCounts[0].href, /^\/redevelopment\/seoul\//);
  const none = upisGuMarkers(SEOUL_DISTRICTS, null);
  assert.equal(none.length, 25);
  assert.ok(none.every((m) => m.value == null));
});

/* ── [1128] 잔여분 ── */
test("[1128] 출처 표기 한 꼴 · 노트 타일 방문일 · 매물 0건의 다른 길", () => {
  for (const f of ["app/tx/page.tsx", "app/dong/[region]/[dong]/page.tsx", "app/reports/[ym]/page.tsx", "app/auctions/AuctionsClient.tsx"]) {
    const s2 = strip(read(f)).replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    assert.doesNotMatch(s2, /출처: /, `${f}: 출처 표기는 「출처 · 」 한 꼴`);
  }
  assert.match(read("app/notes/notes-feed-client.tsx"), /\.slice\(8, 10\)\)\} 방문/);
  const l = read("app/listings/ListingsListClient.tsx");
  assert.match(l, /aria-label="다른 곳에서 찾기"/);
  for (const h of ['href="/map"', 'href="/auctions"', 'href="/apply"']) assert.ok(l.includes(h), h);
});

/* ── [1131] 홈 자리 비우기 ── */
test("[1131] 홈 — 로그인 묶음 없음 · 마이로 옮김 · 검색칸 흐린 글자 = 최근 본 단지", () => {
  const home = strip(read("app/page.tsx"));
  assert.doesNotMatch(home, /HomeMyRail|HomeEngagementCard|HomeWatchlistBrief/);
  assert.match(read("app/my/(index)/page.tsx"), /<MyHomeBrief \/>/);
  const b = read("app/my/MyHomeBrief.tsx");
  assert.match(b, /<HomeWatchlistBrief \/>/);
  assert.match(read("app/components/home/HomeHeroSearch.tsx"), /placeholder=\{recentComplexes\[0\] \? `최근 본 단지 · /);
});

/* ── [1133] 사칭 금지어 · 빈 자료 문구 ── */
test("[1133] 이름 · 핸들 금지어 — admin · naezipnow · 관리자 등(대소문자 · 공백 · 기호 · 전각 무시)", async () => {
  const { isReservedName, reservedKeywordIn } = await import("../../lib/account/reserved-names.ts");
  for (const bad of ["admin", "Admin", "A d m i n", "naezipnow", "NaeZip-Now", "ＡＤＭＩＮ", "내집나우 공식", "관 리 자", "운영자님", "kim_admin01", "고객센터"]) {
    assert.equal(isReservedName(bad), true, bad);
  }
  for (const ok of ["고대웅", "임장왕", "apt_lover", "강남사는사람", "", "administer"]) {
    assert.equal(isReservedName(ok), ok === "administer" ? true : false, ok);
  }
  assert.equal(reservedKeywordIn("naezipnow_fan"), "naezipnow");
  const { validateHandle } = await import("../../lib/account/profile-handle.ts");
  assert.equal(validateHandle("admin_kim").ok, false);
  assert.equal(validateHandle("naezipnow01").ok, false);
  assert.equal(validateHandle("apt_lover").ok, true);
  const reg = read("app/api/auth/register/route.ts");
  assert.match(reg, /typedName && isReservedName\(typedName\)/);
  assert.match(read("app/api/me/profile/route.ts"), /session\.user\.role !== "admin" && isReservedName\(name\)/);
});

test("[1133] 수집 시작 전 — 실거래 0건인 새 DB 는 0행을 실패로 말하지 않는다", () => {
  const f = read("lib/market/fresh-db.ts");
  assert.match(f, /from\("market_transactions"\)\.select\("id", \{ count: "exact", head: true \}\)/);
  assert.match(f, /return !error && count === 0;/);
  assert.match(read("lib/newui/home-data.ts"), /snapshots\.size === 0 && !\(await isCollectingFromEmpty\(\)\)\) regionsFailed = true;/);
  const e = read("app/analysis/region-sise-entry.tsx");
  assert.match(e, /tickerFailed: seriesMap === null && !collecting,/);
  assert.match(e, /snapshotFailed: snapshots === null && !collecting,/);
});
