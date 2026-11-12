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
  assert.doesNotMatch(home, /HomeMyRail|HomeEngagementCard|HomeWatchlistBrief/); // [1137] 내 화면 조각은 HomeAltBoard 안에서만(따로 자리를 차지하지 않는다)
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
  assert.match(f, /from\(table\)\.select\("\*", \{ count: "exact", head: true \}\)/);
  assert.match(f, /return !error && count === 0;/);
  assert.match(read("lib/newui/home-data.ts"), /snapshots\.size === 0 && !\(await isCollectingFromEmpty\("market_region_price"\)\)\) regionsFailed = true;/);
  const e = read("app/analysis/region-sise-entry.tsx");
  assert.match(e, /tickerFailed: seriesMap === null && !collecting,/);
  assert.match(e, /snapshotFailed: snapshots === null && !collecting,/);
});

/* ── [1134] 새 프로젝트 공개 키 ── */
test("[1134] 공개 키 — 다른 프로젝트의 anon JWT · 옛 공개 키는 무효 · 폴백은 새 프로젝트", async () => {
  const { publicKeyFitsProject, refOfAnonJwt } = await import("../../lib/supabase/env.ts");
  const jwt = (ref: string) => "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ ref, role: "anon" })).toString("base64url") + ".sig";
  assert.equal(refOfAnonJwt(jwt("abc")), "abc");
  assert.equal(publicKeyFitsProject(jwt("oldproject"), "gjhnrpiiuhjzjzuuvdck"), false);
  assert.equal(publicKeyFitsProject(jwt("gjhnrpiiuhjzjzuuvdck"), "gjhnrpiiuhjzjzuuvdck"), true);
  assert.equal(publicKeyFitsProject("sb_publishable_UjkQXcYY6f9oBbjjfZvFAA_jYpui-OX", "gjhnrpiiuhjzjzuuvdck"), false);
  assert.equal(publicKeyFitsProject("sb_publishable_anything", "gjhnrpiiuhjzjzuuvdck"), true);
  assert.equal(publicKeyFitsProject("[SENSITIVE]", "x"), false);
  assert.equal(publicKeyFitsProject(undefined, "x"), false);
  const src = read("lib/supabase/env.ts");
  assert.match(src, /FALLBACK_SUPABASE_URL = "https:\/\/gjhnrpiiuhjzjzuuvdck\.supabase\.co"/);
});

/* ── [1135] 기본 정보(선택) · 첫 계정 금지어 한 번 ── */
test("[1135] 기본 정보 — 휴대전화 · 생년월일 6자리 · 주소(전부 선택 · 빈 값은 지움 · 넘어온 칸만)", async () => {
  const { normalizePhone, normalizeBirth, normalizeAddress, validateBasicInfo, hasAnyBasicInfo } = await import("../../lib/account/basic-info.ts");
  assert.equal(normalizePhone("01012345678"), "010-1234-5678");
  assert.equal(normalizePhone("010 123 4567"), "010-123-4567");
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone("0212345678"), undefined);
  assert.equal(normalizeBirth("900115"), "900115");
  assert.equal(normalizeBirth("90-01-15"), "900115");
  assert.equal(normalizeBirth("901315"), undefined);
  assert.equal(normalizeBirth("900230"), undefined);
  assert.equal(normalizeBirth("9001151"), undefined, "7자리(주민번호 뒷자리 첫 글자)는 받지 않는다");
  assert.equal(normalizeAddress("  서울  강남구\n대치동 "), "서울 강남구 대치동");
  assert.equal(normalizeAddress("가".repeat(121)), undefined);
  assert.deepEqual(validateBasicInfo({ phone: "01012345678" }), { ok: true, value: { phone: "010-1234-5678" } });
  assert.deepEqual(validateBasicInfo({}), { ok: true, value: {} });
  assert.equal(validateBasicInfo({ birth: "1" }).ok, false);
  assert.equal(hasAnyBasicInfo({ phone: null }), false);
  assert.equal(hasAnyBasicInfo({ address: "서울" }), true);
});

test("[1135] 가입 — 기본 정보는 새 계정 뒤에만 저장 · 금지어 이름은 허용 목록 · 첫 계정만 · 탈퇴 때 삭제 · 방침에 항목", () => {
  const reg = read("app/api/auth/register/route.ts");
  assert.match(reg, /isReservedName\(typedName\) && !isAllowlistedAdmin\(/);
  assert.match(reg, /&& !\(await isFirstAccount\(\)\)\) \{/);
  assert.match(reg, /await recordConsent\(sb, email, consent, ip, ua\);\s*await saveBasic\(\);/);
  assert.match(read("app/api/me/delete-account/route.ts"), /from\("user_basic_info"\)\.delete\(\)/);
  /* [1138] 방침 · 가입 화면 문구는 필수로 바뀜 — 아래 1138 테스트가 본다 */
  const su = read("app/signup/SignupClient.tsx");
  assert.doesNotMatch(su + read("app/my/settings/BasicInfoCard.tsx") + read("app/components/account/BasicInfoFields.tsx"), /주민등록번호 (앞|뒤)자리 입력|rrn/i);
});

/* ── [1137] 홈 개편 — 시세판 ↔ 내 화면 번갈아 ── */
test("[1137] 홈 — 비회원은 시세판만 · 로그인하면 탭 둘 + 자동 넘김(손대면 멈춤 · 움직임 줄이기 존중) · 겹친 칸이라 밀리지 않음", () => {
  const a = read("app/components/home/HomeAltBoard.tsx");
  assert.match(a, /if \(!authed\) return <>\{market\}<\/>;/);
  assert.match(a, /prefers-reduced-motion: reduce/);
  assert.match(a, /inert=\{tab !== "market"\}/);
  assert.match(a, /inert=\{tab !== "mine"\}/);
  assert.equal((a.match(/col-start-1 row-start-1/g) ?? []).length, 2, "두 판이 한 칸에 겹친다");
  for (const k of ["HomeMyRegions", "HomeWatchlistBrief", "HomeEngagementCard"]) assert.match(a, new RegExp(`const ${k} = dynamic\\(`), `${k} 는 로그인 뒤에만 받는다`);
});

/* ── [1138] 기본 정보 필수 — 순서 · 추천 두 칸 · 소셜/기존 회원 완성 화면 ── */
test("[1138] 기본 정보 — 순서(생년월일 · 주소 · 휴대전화 · 직업 · 보유 주택 · 이용 목적) · 여섯 칸 모두 필수 · 목록 밖 값 거절", async () => {
  const m = await import("../../lib/account/basic-info.ts");
  assert.deepEqual([...m.BASIC_FIELD_ORDER], ["birth", "address", "phone", "job", "housing", "purpose"]);
  const full = { birth: "900115", address: "서울 강남구 대치동", phone: "01012345678", job: "직장인", housing: "무주택", purpose: "실거주 매수" };
  const ok = m.validateRequiredBasicInfo(full);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.value.phone, "010-1234-5678");
  assert.deepEqual(m.validateRequiredBasicInfo({ ...full, birth: "" }), { ok: false, field: "birth", error: "생년월일 6자리 입력 필요" });
  const miss = m.validateRequiredBasicInfo({});
  assert.equal(miss.ok, false);
  if (!miss.ok) assert.equal(miss.field, "birth", "화면 순서대로 첫 칸부터");
  assert.equal(m.validateRequiredBasicInfo({ ...full, job: "왕" }).ok, false);
  assert.equal(m.validateRequiredBasicInfo({ ...full, purpose: undefined }).ok, false);
  assert.equal(m.isBasicInfoComplete({ ...full }), true);
  assert.equal(m.isBasicInfoComplete({ ...full, housing: null }), false);
  assert.equal(m.isBasicGateExempt("/my/basic-info"), true);
  assert.equal(m.isBasicGateExempt("/legal/privacy"), true);
  assert.equal(m.isBasicGateExempt("/login"), true);
  assert.equal(m.isBasicGateExempt("/loginx"), false);
  assert.equal(m.isBasicGateExempt("/"), false);
  assert.equal(m.isBasicGateExempt("/my/settings"), false);
});

test("[1138] 가입 · API · 게이트 · 방침 · DB 열이 같은 규칙을 쓴다", () => {
  const reg = read("app/api/auth/register/route.ts");
  assert.match(reg, /validateRequiredBasicInfo\(basicRaw\)/);
  assert.match(reg, /if \(!basic\.ok && !b\.resendConfirmation\) return/, "인증 메일 다시 보내기는 다시 묻지 않는다");
  assert.match(read("app/api/me/basic-info/route.ts"), /validateRequiredBasicInfo\(body\)/);
  const su = read("app/signup/SignupClient.tsx");
  assert.match(su, /<BasicInfoFields prefix="signup-basic"/);
  assert.doesNotMatch(su, /기본 정보 \(선택\)/);
  const gate = read("app/components/account/BasicInfoGate.tsx");
  assert.match(gate, /if \(!alive \|\| !r\.ok\) return;/, "조회 실패면 보내지 않는다");
  assert.match(gate, /\/my\/basic-info\?next=/);
  assert.match(read("app/layout.tsx"), /<BasicInfoGate \/>/);
  assert.match(read("app/legal/privacy/page.tsx"), /"생년월일\(6자리\), 주소, 휴대전화 번호, 직업, 보유 주택 수, 이용 목적"/);
  const sql = read("supabase/rebuild/bridge/20261231000600_bridge_user_basic_info_required.sql");
  const lib = read("lib/account/basic-info.ts");
  for (const v of ["직장인", "구직 중", "2주택 이상", "실거주 매수", "정보 확인"]) {
    assert.ok(sql.includes(`'${v}'`) && lib.includes(`"${v}"`), `${v} — DB 제약과 화면 목록이 같다`);
  }
});

test("[1138] 로그인 — 공용 카운터(KV) 장애면 메모리 카운터로(전부 막지 않는다 · 무제한도 아니다)", () => {
  const auth = read("auth.ts");
  assert.match(auth, /if \(rl\.degraded\) \{[\s\S]{0,200}rl = memoryKeyRateLimit\(key, \{ max, windowMs \}\);/);
  assert.match(auth, /if \(!rl\.ok\) \{\s*logger\.warn\(`\[auth\] 로그인 시도 제한/);
  assert.doesNotMatch(auth, /!rl\.ok \|\| rl\.degraded/);
  const rl = read("lib/rate-limit.ts");
  assert.match(rl, /if \(result\.degraded && failClosed\) \{\s*return \{ \.\.\.memoryRateLimit\(key, max, windowMs\), degraded: true \};/);
  assert.match(rl, /export function memoryKeyRateLimit\(key: string, \{ max, windowMs \}[^)]*\): DetailedRateLimitResult \{\s*return \{ \.\.\.memoryRateLimit\(key, max, windowMs\), degraded: false \};/, "같은 상한(메모리)");
});

/* ── [1139] 지역 관심도 · 기사 수 — 네이버 검색어 트렌드 6개월 · 일별 기사 건수 ── */
test("[1139] 관심도 — 검색어 묶음 · 데이터랩 풀기 · 완결월 6개(이번 달 제외) · 쌓인 날만큼만 기사 수", async () => {
  const m = await import("../../lib/buzz/model.ts");
  assert.deepEqual(m.buzzKeywords({ name: "강남구" }), ["강남구 아파트", "강남구 부동산"]);
  assert.deepEqual(m.buzzKeywords({ name: "중구" }), ["서울 중구 아파트", "서울 중구 부동산"], "여러 도시에 있는 구는 도시를 붙인다");
  assert.deepEqual(m.buzzKeywords({ name: "성남시 분당구", city: "경기" }), ["분당구 아파트", "분당구 부동산", "성남 분당구 아파트"]);
  assert.equal(m.buzzNewsQuery({ name: "파주시", city: "경기" }), "파주 부동산");
  const pts = m.parseDatalabGroup({ data: [{ period: "2026-05-01", ratio: 10 }, { period: "2026-06-01", ratio: 20 }, { period: "bad", ratio: 1 }] });
  assert.deepEqual(pts, [{ ym: "202605", ratio: 10 }, { ym: "202606", ratio: 20 }]);
  const six = ["202605", "202606", "202607", "202608", "202609", "202610", "202611"].map((ym, i) => ({ ym, ratio: (i + 1) * 10 }));
  assert.deepEqual(m.searchTrendSummary(six, "2026-11-11T00:00:00Z"), { prior3: 20, recent3: 50, asOf: "202610" }, "이번 달(11월)은 뺀다");
  assert.equal(m.searchTrendSummary(six.slice(2), "2026-11-11T00:00:00Z"), null, "완결월 6개 미만이면 말하지 않는다");
  const items = [{ pubDate: "Wed, 11 Nov 2026 01:00:00 +0900" }, { pubDate: "Tue, 10 Nov 2026 23:00:00 +0900" }, { pubDate: "Tue, 10 Nov 2026 09:00:00 +0900" }, { pubDate: "Mon, 09 Nov 2026 09:00:00 +0900" }];
  assert.deepEqual(m.countNewsOnDay(items, "2026-11-10", 100), { count: 2, capped: false });
  let p: { days: Record<string, Record<string, number>> } | null = null;
  for (let d = 1; d <= 13; d++) p = m.mergeNewsDay(p, `2026-10-${String(d).padStart(2, "0")}`, { gangnam: d });
  assert.equal(m.newsDailySummary(p!.days, "gangnam", "2026-11-11T00:00:00Z"), null, "14일 미만이면 말하지 않는다");
  p = m.mergeNewsDay(p, "2026-10-14", { gangnam: 14 });
  assert.deepEqual(m.newsDailySummary(p.days, "gangnam", "2026-11-11T00:00:00Z"), { recent: 77, prior: 28, windowDays: 7, asOf: "2026-10-14" });
  assert.equal(m.newsDailySummary(p.days, "nowhere", "2026-11-11T00:00:00Z"), null);
});

test("[1139] 관심도 요인 — 네이버 검색 추이가 있으면 점수를 낸다(지수 2 미만은 잡음) · 크론 · 월 집계 일일 잡", async () => {
  const { interestFactor } = await import("../../lib/signals/engine.ts");
  const base = { newsRecent30: 1, newsPrior30: 0, siteViews30: null, siteViewsPrior30: null, watchers: null };
  const thin = interestFactor(base);
  assert.equal(thin.status, "thin");
  const up = interestFactor({ ...base, search: { recent3: 30, prior3: 20, asOf: "202610" } });
  assert.equal(up.status, "ok");
  assert.ok((up.score ?? 0) > 0);
  assert.match(up.value, /네이버 검색 3개월 평균 30\(직전 3개월 20 · 상대 지수\)/);
  assert.equal(interestFactor({ ...base, search: { recent3: 1, prior3: 0.5, asOf: "202610" } }).status, "thin");
  const route = read("app/api/cron/region-buzz-ingest/route.ts");
  assert.match(route, /if \(!\(await authorizeCron\(req\)\)\) return/);
  /* vercel.json 은 배포 빌드에서 한 줄로 줄어든다 — 글자 모양이 아니라 내용으로 본다(1147 · 1148 배포가 이 줄에서 멈췄다) */
  assert.ok((JSON.parse(read("vercel.json")) as { crons: { path: string }[] }).crons.some((c) => c.path === "/api/cron/region-buzz-ingest"));
  const ing = read("lib/buzz/ingest.ts");
  assert.match(ing, /if \(res\.status === 401 \|\| res\.status === 403\) break;/, "권한 오류면 한도를 태우지 않는다");
  assert.doesNotMatch(ing, /trends\.google/);
  const sql = read("supabase/rebuild/bridge/20261231000700_bridge_region_monthly_daily.sql");
  assert.match(sql, /'market-region-monthly-daily'/);
  assert.match(sql, /select public\.refresh_market_region_monthly\(25\);/);
});

/* ── [1140] 관리자 개편 — 메뉴 5묶음 + 검색 · 상태 신호등 ── */
test("[1140] 관리자 메뉴 — 오늘 + 5묶음 · 23개 화면(1141 회원 추가) 모두 한 번씩 · 검색 낱말 · / 초점", () => {
  const nav = read("app/admin/AdminNav.tsx");
  const titles = [...nav.matchAll(/^\s{4}title: "([^"]+)",$/gm)].map((m) => m[1]);
  assert.deepEqual(titles, ["오늘", "회원 · 콘텐츠", "데이터", "매출 · 결제", "유입 · 성능", "도구"]);
  const hrefs = [...nav.matchAll(/\{ href: "(\/admin[^"]*)", label: "/g)].map((m) => m[1]);
  assert.equal(hrefs.length, 23);
  assert.equal(new Set(hrefs).size, 23, "같은 화면이 두 묶음에 들어가지 않는다");
  for (const h of hrefs) assert.match(nav, new RegExp(`"${h}": "`), `${h} 검색 낱말`);
  assert.match(nav, /if \(e\.key !== "\/" \|\| e\.ctrlKey/);
  assert.match(nav, /맞는 메뉴 없음/);
});

test("[1140] 상태 신호등 — 멈춤 · 수집 실패는 빨강 · 비었거나 모르면 노랑(초록 아님) · 못 읽은 대기는 0 이 아니다", async () => {
  const m = await import("../../lib/admin/status-board.ts");
  const row = (o: Record<string, unknown>) => ({ label: "x", status: "fresh", lagDays: 0.2, rows: 10, ingest: null, ...o }) as Parameters<typeof m.freshnessLine>[0];
  assert.equal(m.freshnessLine(row({})).level, "ok");
  assert.equal(m.freshnessLine(row({ status: "stale", lagDays: 9 })).level, "bad");
  assert.equal(m.freshnessLine(row({ ingest: { outcome: "failed", message: null } })).level, "bad");
  assert.deepEqual(m.freshnessLine(row({ status: "empty", rows: 0 })), { label: "x", level: "warn", detail: "비어 있음 · 첫 수집 전" });
  assert.equal(m.freshnessLine(row({ status: "unknown", rows: null })).detail, "불러오기 실패");
  const s = m.summarizeFreshness([row({ label: "a" }), row({ label: "b", status: "stale" }), row({ label: "c", status: "aging" })], 2);
  assert.equal(s.level, "bad");
  assert.deepEqual(s.counts, { ok: 1, warn: 1, bad: 1 });
  assert.deepEqual(s.lines.map((l) => l.label), ["b", "c"], "나쁜 것부터");
  assert.equal(m.queueLine("신고", null, "/a").detail, "불러오기 실패");
  assert.equal(m.queueLine("신고", 0, "/a").level, "ok");
  assert.equal(m.queueLine("신고", 3, "/a").detail, "3건 대기");
  assert.equal(m.headline(["ok", "ok", "warn", "bad"]), "정상 2 · 주의 1 · 장애 1");
  const dash = read("app/admin/page.tsx");
  assert.match(dash, /<Suspense fallback=\{<AdminStatusBoardFallback \/>\}>/);
  assert.match(dash, /openReports=\{errs\.ops \? null : \(openReportCount \?\? 0\)\}/);
});

/* ── [1141] 회원 조회 · 메뉴 옆 대기 숫자 · 모바일 묶음 ── */
test("[1141] 회원 통계 — 생년월일은 연령대 · 휴대전화 가림 · 주소는 시·구까지 · 검색어 정리", async () => {
  const m = await import("../../lib/admin/member-stats.ts");
  const now = "2026-11-11T00:00:00Z";
  assert.equal(m.ageFromBirth6("900115", now), 36);
  assert.equal(m.ageFromBirth6("051231", now), 20, "생일 전이면 한 살 적다");
  assert.equal(m.ageFromBirth6("200101", now), 106, "14세 미만으로 읽히면 1900년대");
  assert.equal(m.ageFromBirth6("9001", now), null);
  assert.equal(m.ageBand(36), "30대");
  assert.equal(m.ageBand(71), "60대 이상");
  assert.equal(m.ageBand(null), "미입력");
  assert.equal(m.sidoOf("서울특별시 강남구 대치동 1"), "서울");
  assert.equal(m.sidoOf("충청북도 청주시"), "충북");
  assert.equal(m.sidoOf("우리집"), "기타");
  assert.equal(m.addressBrief("경기 성남시 분당구 정자동 12-3 101동"), "경기 성남시");
  assert.equal(m.phoneMasked("010-1234-5678"), "010-****-5678");
  assert.equal(m.phoneMasked(null), "미입력");
  assert.equal(m.memberQuery("  a,b(c)%  "), "a b c");
  const st = m.basicStats([{ birth: "900115", address: "서울 강남구", job: "직장인", housing: "무주택", purpose: "투자" }, { birth: null, address: null, job: null, housing: "무주택", purpose: null }], now);
  assert.equal(st.total, 2);
  assert.deepEqual(st.housing, [{ label: "무주택", count: 2 }]);
  assert.deepEqual(st.age.map((a) => a.label).sort(), ["30대", "미입력"]);
});

test("[1141] 관리자 — 회원 화면은 users 권한 · 메뉴 옆 숫자는 실집계(못 읽으면 없음) · 모바일 묶음 · 인증 링크 안내", () => {
  const page = read("app/admin/members/page.tsx");
  assert.match(page, /if \(!canAccessAdminSection\(session, "users"\)\) redirect\("\/admin"\);/);
  assert.doesNotMatch(page, /birth_yymmdd|m\.address\b/, "원본 생년월일 · 주소를 화면에 내보내지 않는다");
  const qc = read("lib/admin/queue-counts.ts");
  assert.match(qc, /if \(r\.status === "fulfilled" && !r\.value\.error && typeof r\.value\.count === "number"\)/);
  assert.match(read("app/admin/layout.tsx"), /<AdminNav badges=\{badges\} \/>/);
  const nav = read("app/admin/AdminNav.tsx");
  assert.match(nav, /role="tablist" aria-label="메뉴 묶음"/);
  assert.match(nav, /\{badge \? \(/);
  assert.match(read("app/login/LoginClient.tsx"), /인증 링크 만료 또는 이미 사용됨 · 인증을 마쳤다면 아래에서 바로 로그인/);
});

/* ── [1143] 한 줄 맞춤 — 두 줄로 넘친 짧은 설명 줄만 · 자간 먼저 · 88% · 11px 바닥 ── */
test("[1143] 한 줄 맞춤 규칙 — 딱 두 줄 · 64자 이하만 · 자간 5단 뒤 글자 3단 · 바닥 밑으로는 안 줄인다", async () => {
  const m = await import("../../lib/client/one-line-fit.ts");
  assert.equal(m.isTwoLineOverflow(39, 19.5, 30), true);
  assert.equal(m.isTwoLineOverflow(19.5, 19.5, 30), false, "한 줄은 그대로");
  assert.equal(m.isTwoLineOverflow(58.5, 19.5, 30), false, "세 줄 이상은 읽는 글");
  assert.equal(m.isTwoLineOverflow(39, 19.5, 65), false, "긴 문단은 건드리지 않는다");
  const a13 = m.fitAttempts(13);
  assert.deepEqual(a13.slice(0, 5).map((x) => x.scale), [1, 1, 1, 1, 1], "먼저 자간만");
  assert.deepEqual(a13.slice(5).map((x) => x.scale), [0.96, 0.92, 0.88]);
  assert.deepEqual(m.fitAttempts(12).slice(5).map((x) => x.scale), [0.96, 0.92], "12px 는 11px 밑으로 안 내려간다");
  assert.equal(m.fitAttempts(11).length, 5, "11px 는 자간만");
  const c = read("app/components/OneLineFit.tsx");
  assert.match(c, /if \(!ok\) \{\s*el\.style\.letterSpacing = prev\.ls;/, "안 맞으면 원래대로");
  assert.match(read("app/layout.tsx"), /<OneLineFit \/>/);
});

test("[1143] 게시판 — 인자 정리 · 검색 조건(표마다 열 이름) · 쪽 번호 창 · 주소", async () => {
  const m = await import("../../lib/community/board-query.ts");
  assert.deepEqual(m.parseBoardParams({}), { kind: "story", field: "all", q: "", page: 1 });
  assert.deepEqual(m.parseBoardParams({ kind: "news", in: "tag", q: " 재건축,(1) ", page: "3" }), { kind: "news", field: "tag", q: "재건축 1", page: 3 });
  assert.equal(m.parseBoardParams({ kind: "x", in: "y", page: "-2" }).page, 1);
  assert.equal(m.boardOrFilter("story", "all", ""), null);
  assert.equal(m.boardOrFilter("story", "all", "전세"), "title.ilike.%전세%,body.ilike.%전세%");
  assert.equal(m.boardOrFilter("news", "content", "전세"), "content.ilike.%전세%");
  assert.equal(m.boardOrFilter("story", "tag", "전세"), 'tags.cs.{"전세"}');
  assert.equal(m.boardOrFilter("news", "tag", "전세"), 'tags.cs.["전세"],ai_keywords.cs.["전세"]');
  assert.equal(m.boardHref({ kind: "story", q: "", field: "all", page: 1 }), "/board");
  assert.equal(m.boardHref({ kind: "news", q: "전세", field: "title", page: 2 }), "/board?kind=news&q=%EC%A0%84%EC%84%B8&in=title&page=2");
  assert.deepEqual(m.pageWindow(1, 0), { pages: [1], last: 1, current: 1 });
  assert.deepEqual(m.pageWindow(6, 400).pages, [1, 0, 4, 5, 6, 7, 8, 0, 20]);
  assert.equal(m.pageWindow(99, 45).current, 3, "끝을 넘으면 마지막 쪽");
  const page = read("app/board/page.tsx");
  assert.match(page, /\.or\("visibility\.is\.null,visibility\.eq\.public"\)/, "링크 전용 글은 목록에 없다");
  assert.match(page, /\.eq\("is_published", true\)/);
  assert.match(page, /noIndex: true/);
  assert.match(read("app/town/page.tsx"), /href="\/board"/);
});

/* ── [1144] 전문가 홍보 — 100일 무료 · 이후 프로 구독 · 프로필은 유지 ── */
test("[1144] 홍보 상태 — 100일 무료 · 프로 구독 중이면 계속 · 끝나면 홍보만 멈춤 · 글 규칙 · 날마다 차례", async () => {
  const m = await import("../../lib/experts/promo.ts");
  const now = "2026-11-11T00:00:00Z";
  const day = (n: number) => new Date(Date.parse(now) - n * 86_400_000).toISOString();
  const free = m.promoState({ createdAt: day(10), plan: "free", planExpiresAt: null, now });
  assert.deepEqual([free.active, free.mode, free.freeDaysLeft], [true, "free", 355]); /* [1167] 100일 → 365일 */
  assert.equal(m.promoState({ createdAt: day(365), plan: "free", planExpiresAt: null, now }).mode, "ended");
  assert.equal(m.promoState({ createdAt: day(400), plan: "expert", planExpiresAt: new Date(Date.parse(now) + 86_400_000).toISOString(), now }).mode, "subscribed");
  assert.equal(m.promoState({ createdAt: day(400), plan: "expert", planExpiresAt: day(1), now }).active, false, "만료된 구독은 구독이 아니다");
  assert.equal(m.promoState({ createdAt: day(400), plan: "pro", planExpiresAt: null, now }).active, false, "플러스는 홍보 대상이 아니다");
  assert.equal(m.promoState({ createdAt: null, plan: "free", planExpiresAt: null, now }).active, false);
  const ok = m.sanitizePromo({ headline: " 분당 재건축 상담!! ", body: "정자동 20년", on: true });
  assert.deepEqual(ok, { ok: true, value: { headline: "분당 재건축 상담", body: "정자동 20년", on: true } });
  assert.equal(m.sanitizePromo({ headline: "수익 보장 매물" }).ok, false);
  assert.equal(m.sanitizePromo({ headline: "문의 https://a.b" }).ok, false);
  assert.equal(m.sanitizePromo({ headline: "가".repeat(29) }).ok, false);
  const c = { id: "a", createdAt: day(5), plan: null, planExpiresAt: null, promoOn: true, promoHeadline: "한 줄" };
  assert.equal(m.isPromoLive(c, now), true);
  assert.equal(m.isPromoLive({ ...c, promoOn: false }, now), false);
  assert.equal(m.isPromoLive({ ...c, promoHeadline: null }, now), false);
  const three = [{ id: "c" }, { id: "a" }, { id: "b" }];
  assert.notEqual(m.rotatePromo(three, now, 0)[0].id, m.rotatePromo(three, now, 1)[0].id, "자리마다 다른 사람");
  assert.notEqual(m.rotatePromo(three, now, 0)[0].id, m.rotatePromo(three, "2026-11-12T00:00:00Z", 0)[0].id, "날마다 차례");
  assert.deepEqual(m.rotatePromo([], now, 0), []);
});

test("[1144] 홍보 자리 다섯 곳 · 본인만 저장 · 승인된 전문가만 · 요금제 바뀌면 캐시 비움 · 가격은 그대로", () => {
  assert.match(read("app/complex/[id]/page.tsx"), /<RegionExpertPromo sigungu=\{v\.dong\} city=\{v\.city\} \/>/);
  assert.match(read("app/town/experts/page.tsx"), /<RotatingExpertPromo slot=\{0\} count=\{2\}/);
  assert.match(read("app/page.tsx"), /<RotatingExpertPromo slot=\{1\} compact \/>/);
  assert.match(read("app/town/page.tsx"), /<RotatingExpertPromo slot=\{2\} compact/);
  assert.match(read("app/notes/(index)/page.tsx"), /promo=\{<RotatingExpertPromo slot=\{3\} compact \/>\}/);
  assert.match(read("app/notes/notes-feed-client.tsx"), /promo && !mine && i === PROMO_AFTER_INDEX/, "목록 사이 · 내 노트 보기에는 없다");
  assert.match(read("app/components/experts/ExpertPromo.tsx"), />홍보<\/span>/, "광고임을 밝힌다");
  const api = read("app/api/me/expert-promo/route.ts");
  assert.match(api, /\.eq\("owner_email", owner\)/);
  assert.match(api, /if \(profile\.is_verified !== true\) return NextResponse\.json\(\{ error: "승인된 전문가만/);
  assert.match(api, /revalidateTag\("verified-experts"\)/);
  assert.match(read("lib/billing/apply-plan.ts"), /revalidateTag\("verified-experts"\)/);
  const bp = read("lib/subscriptions/billing-periods.ts");
  for (const v of ["totalKrw: 2_900", "totalKrw: 27_600", "totalKrw: 18_900", "totalKrw: 181_200", "totalKrw: 1_100"]) assert.ok(bp.includes(v), `${v} 그대로`);
});

/* ── [1145] 지역 화면 홍보 칸 · 임장노트 검색 · DB 용량 ── */
test("[1145] 게시판에 임장노트 · 지역 화면 홍보 한 칸 · DB 용량은 포함 용량 대비로 색", async () => {
  const b = await import("../../lib/community/board-query.ts");
  assert.equal(b.parseBoardParams({ kind: "notes" }).kind, "notes");
  assert.equal(b.boardOrFilter("notes", "title", "자이"), "title.ilike.%자이%,apt_name.ilike.%자이%");
  assert.equal(b.boardOrFilter("notes", "tag", "분당"), "region.ilike.%분당%,apt_name.ilike.%분당%");
  assert.match(read("app/board/page.tsx"), /\.from\("inspection_notes"\)[\s\S]{0,160}\.eq\("is_public", true\)/, "비공개 노트는 목록에 없다");
  assert.match(read("app/region/[id]/page.tsx"), /<RegionExpertPromo sigungu=\{name\}/);
  const s = await import("../../lib/admin/status-board.ts");
  assert.equal(s.dbSizeLine(null).detail, "확인 실패");
  const GB = 1024 ** 3;
  assert.equal(s.dbSizeLine(0.4 * GB).level, "ok");
  assert.equal(s.dbSizeLine(6.6 * GB).level, "warn");
  assert.equal(s.dbSizeLine(7.7 * GB).level, "bad");
  assert.match(s.dbSizeLine(400 * 1024 * 1024, [{ name: "market_transactions", bytes: 245 * 1024 * 1024 }]).detail, /400MB · 포함 용량 8GB 의 5% · 가장 큰 표 market_transactions 245MB/);
  const sql = read("supabase/rebuild/bridge/20261231000900_bridge_admin_db_stats.sql");
  assert.match(sql, /revoke all on function public\.admin_db_stats\(\) from public, anon, authenticated;/);
});

/* ── [1147] 관리자 2단계 인증(TOTP) · 가입 걸음 계측 ── */
test("[1147] TOTP — RFC 6238 시험값 · 앞뒤 30초 · 암호화 보관 · 서명한 확인 표식(계정 · 만료)", async () => {
  const m = await import("../../lib/auth/totp.ts");
  const sec = m.base32Encode(Buffer.from("12345678901234567890"));
  assert.equal(sec, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.equal(m.base32Decode(sec).toString(), "12345678901234567890");
  assert.equal(m.totpAt(sec, 59), "287082");
  assert.equal(m.totpAt(sec, 1111111109), "081804");
  assert.equal(m.totpAt(sec, 1234567890), "005924");
  assert.equal(m.totpAt(sec, 2000000000), "279037");
  assert.equal(m.verifyTotp(sec, "287082", 59_000), true);
  assert.equal(m.verifyTotp(sec, "287 082", 59_000 + 30_000), true, "한 칸 늦어도 받는다");
  assert.equal(m.verifyTotp(sec, "287082", 59_000 + 90_000), false, "세 칸 뒤는 안 받는다");
  assert.equal(m.verifyTotp(sec, "28708", 59_000), false);
  assert.equal(m.verifyTotp(sec, "abcdef", 59_000), false);
  const fresh = m.generateTotpSecret();
  assert.match(fresh, /^[A-Z2-7]{32}$/);
  const sealed = m.sealSecret(fresh, "k1");
  assert.ok(!sealed.includes(fresh), "DB 에 평문으로 두지 않는다");
  assert.equal(m.openSecret(sealed, "k1"), fresh);
  assert.equal(m.openSecret(sealed, "k2"), null, "다른 열쇠로는 못 연다");
  assert.equal(m.openSecret("v1.x.y.z", "k1"), null);
  const now = 1_800_000_000_000;
  const t = m.signAdmin2fa("A@b.com", "k1", now);
  assert.equal(m.checkAdmin2fa(t, "a@b.com", "k1", now + 1000), true);
  assert.equal(m.checkAdmin2fa(t, "other@b.com", "k1", now + 1000), false, "다른 계정에 못 쓴다");
  assert.equal(m.checkAdmin2fa(t, "a@b.com", "k2", now + 1000), false);
  assert.equal(m.checkAdmin2fa(t, "a@b.com", "k1", now + (m.ADMIN_2FA_TTL_SEC + 1) * 1000), false, "12시간 뒤 만료");
  assert.equal(m.checkAdmin2fa(`${Math.floor(now / 1000) + 99999}.AAAA`, "a@b.com", "k1", now), false, "만료만 고친 표식은 서명이 안 맞는다");
  assert.equal(m.checkAdmin2fa(null, "a@b.com", "k1", now), false);
  assert.match(m.otpauthUrl(sec, "a@b.com"), /^otpauth:\/\/totp\/.+\?secret=GEZD.+&algorithm=SHA1&digits=6&period=30$/);
});

test("[1147] 관리자 화면 — 등록한 계정은 번호 확인 없이는 못 들어온다 · 못 읽으면 통과시키지 않는다 · 번호 대입 한도 · 가입 걸음 표식", () => {
  const lay = read("app/admin/layout.tsx");
  assert.match(lay, /if \(gate === "need-code" \|\| gate === "error"\) redirect\("\/admin-2fa"\);/);
  assert.ok(lay.indexOf("canAccessAdminConsole(session)") < lay.indexOf("admin2faGate("), "권한 확인 뒤에 2단계");
  const g = read("lib/auth/admin-2fa.ts");
  assert.match(g, /catch \{\s*return "error";/);
  const api = read("app/api/admin/2fa/route.ts");
  assert.match(api, /canAccessAdminConsole\(session\) \? email : null/);
  assert.match(api, /keyRateLimit\(`admin-2fa:\$\{email\}`, \{ max: 8, windowMs: 10 \* 60_000 \}\)/);
  assert.match(api, /if \(row\?\.enabled\) return NextResponse\.json\(\{ error: "이미 등록됨" \}, \{ status: 409 \}\);/, "등록을 마친 뒤에는 비밀값을 다시 내보내지 않는다");
  assert.match(api, /httpOnly: true,/);
  assert.match(read("app/signup/SignupClient.tsx"), /trackStep\("signup_step_2_basic"\);/);
  assert.match(read("app/admin/traffic/page.tsx"), /signup_step_2_basic: "가입 2단계\(기본 정보 도착\)"/);
});

test("[1148] 좌우 광고 띠 — 세로형 광고만 · 띠 안 안내 카드는 제목 + 바로 가기(낱말 단위 줄바꿈) · 한 줄 맞춤 제외", () => {
  assert.match(read("app/components/ads/SideAdRails.tsx"), /spot="side" shape="vertical" \/>[\s\S]*spot="side" shape="vertical" \/>/);
  const u = read("app/components/ads/AdZoneUnit.tsx");
  /* [1153] 세로 띠는 형식을 맡기지 않고 고정 크기 칸(160×600 · 넓은 화면 300×600)으로 요청한다 */
  assert.match(u, /data-ad-format=\{shape === "vertical" \? undefined : inArticle \? "fluid" : "auto"\}/);
  assert.match(u, /side-rail-ins/);
  assert.match(read("app/globals.css"), /\.side-ad-rail ins\.side-rail-ins \{\s*width: 160px;\s*height: 600px;/);
  const css = read("app/globals.css");
  assert.match(css, /\.side-ad-rail \.card p \{\s*display: none;/);
  assert.match(css, /\.side-ad-rail \.t-section \{\s*font-size: var\(--fs-body\);[\s\S]{0,80}word-break: keep-all;/);
  assert.match(read("app/components/OneLineFit.tsx"), /\[data-fit-skip\], \.side-ad-rail"/);
});

test("[1148] 처음 안내 — 닫기는 이 탭 · 일주일간 보지 않기는 7일 뒤 다시 보임", async () => {
  const m = await import("../../lib/nav/start-steps.ts");
  const now = 1_800_000_000_000;
  assert.equal(m.isStartHidden(null, null, now), false);
  assert.equal(m.isStartHidden(null, "1", now), true);
  const until = String(m.startHideUntil(now));
  assert.equal(m.isStartHidden(until, null, now + 6 * 86_400_000), true);
  assert.equal(m.isStartHidden(until, null, now + 7 * 86_400_000 + 1), false, "7일 지나면 다시");
  assert.equal(m.isStartHidden("abc", null, now), false);
  const c = read("app/components/nav/StartSteps.tsx");
  assert.match(c, /onClick=\{\(\) => close\(true\)\}[\s\S]{0,140}일주일간 보지 않기/);
  assert.match(c, /onClick=\{\(\) => close\(false\)\}[\s\S]{0,180}닫기/);
});

test("[1148] 정비구역 이름표 — 구역명 + 단계 두 줄이 기본 · 다른 보기에서는 아래 줄 없음", async () => {
  const m = await import("../../lib/redevelopment/map-layer.ts");
  assert.equal(m.REDEV_LABEL_MODES[0].key, "both");
  assert.equal(m.isRedevLabelMode("both"), true);
  const p = { name: "한남3구역", stageKey: "moving", households: 5816 } as Parameters<typeof m.redevMarkerLabel>[0];
  assert.equal(m.redevMarkerLabel(p, "both"), "한남3구역");
  assert.ok(m.redevMarkerSubLabel(p, "both"));
  assert.equal(m.redevMarkerSubLabel(p, "name"), undefined);
  const nm = read("components/map/NaverMap.tsx");
  assert.match(nm, /if \(data\.subLabel\) \{\s*return \{ content: buildStackedMarkerHtml\(data\.label, data\.subLabel, color\)/);
  assert.match(nm, /\$\{escapeHtml\(sub\.trim\(\)\)\}/, "아래 줄도 이스케이프");
  assert.match(read("app/redevelopment/RedevelopmentMap.tsx"), /subLabel: stageLabel\(p\.stageKey\) \|\| undefined,/);
});

/* ── [1149] 전국 정비구역 목록(국토교통부 공표 · 좌표 없음) ── */
test("[1149] 전국 정비구역 — 응답 한 줄 풀기 · 세대수는 지어내지 않는다 · 같은 구역은 같은 열쇠 · 주소", async () => {
  const m = await import("../../lib/redevelopment/national.ts");
  const z = m.parseNationalRow({ "시도": "서울특별시", "시군구": "용산구", "구역명칭": " 한남3 재정비촉진구역 ", "현 사업추진단계": "관리처분인가", "사업유형": "재개발사업", "사업시행자": "조합", "공급 예정 세대수": "5,816" });
  assert.deepEqual(z, { id: "서울특별시|용산구|한남3재정비촉진구역", sido: "서울특별시", sigungu: "용산구", name: "한남3 재정비촉진구역", stage: "관리처분인가", projectType: "재개발사업", operator: "조합", households: 5816 });
  assert.equal(m.parseNationalRow({ "시도": "서울특별시", "시군구": "", "구역명칭": "x" }), null);
  assert.equal(m.parseHouseholds("-"), null);
  assert.equal(m.parseHouseholds("0"), null);
  assert.equal(m.parseHouseholds("1,234세대"), 1234);
  assert.equal(m.nationalZoneId("서울", "강남구", "은마 아파트"), m.nationalZoneId("서울", "강남구", "은마아파트"));
  assert.deepEqual(m.parseNationalParams({ sido: "경기도", q: "광명,(1)", page: "2" }), { sido: "경기도", sigungu: "", q: "광명 1", page: 2, stage: "", sort: "" });
  assert.equal(m.nationalHref({ sido: "", sigungu: "", q: "", page: 1 }), "/redev-list");
  assert.match(m.NATIONAL_API_PATH, /^15160169\/v1\/uddi:[0-9a-f-]{36}$/);
  const page = read("app/redev-list/page.tsx");
  assert.match(page, /noIndex: true/);
  assert.match(page, /서울은 대표 지번이 확인된 구역만 지도에 표시/);
  assert.doesNotMatch(read("lib/redevelopment/national-ingest.ts"), /lat|lng/, "좌표를 지어내지 않는다");
  assert.ok((JSON.parse(read("vercel.json")) as { crons: { path: string }[] }).crons.some((c) => c.path === "/api/cron/redev-national-ingest"));
});

test("[1150] 단지 정보 갱신 주기 · 서울 구별 정비구역 수 지도(자료가 있을 때만) · vercel.json 은 내용으로 본다", async () => {
  const crons = (JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] }).crons;
  const at = (p: string) => crons.find((c) => c.path.startsWith(p))?.schedule;
  /* [1166] 단지 정보 수집을 더 빠르게 — 상세 보강 매시간 200곳 · 좌표 매시간 800곳 · 단지 마스터 2시간마다 */
  assert.equal(at("/api/cron/apt-detail-enrich"), "30 * * * *");
  assert.ok(crons.some((c) => c.path === "/api/cron/apt-detail-enrich?limit=200"));
  assert.equal(at("/api/cron/geocode-complexes"), "20 * * * *");
  assert.equal(at("/api/cron/apt-master-ingest"), "0 */2 * * *");
  assert.equal(at("/api/cron/complex-crawl"), "10 1,13 * * *");
  const m = await import("../../lib/region/region-switch.ts");
  const ms = m.nationalGuMarkers([{ id: "gangnam", name: "강남구", lat: 37.5, lng: 127.0 }] as Parameters<typeof m.nationalGuMarkers>[0], new Map([["강남구", 12]]));
  assert.equal(ms[0].value, "12곳");
  assert.match(ms[0].href, /^\/redev-list\?sido=.+&sigungu=/);
  assert.match(read("app/redevelopment/seoul/page.tsx"), /\{nationalCounts && \(/);
  assert.doesNotMatch(read("tests/unit/ia-1115.test.ts").split("[1150]")[0], /assert\.match\(read\("vercel\.json"\)/, "vercel.json 을 글자 모양으로 보지 않는다");
});

test("[1151] 정비구역 분류 값의 순번을 뗀다 — 3)재건축(공동주택) → 재건축(공동주택)", async () => {
  const m = await import("../../lib/redevelopment/national.ts");
  assert.equal(m.stripOrdinal("3)재건축(공동주택)"), "재건축(공동주택)");
  assert.equal(m.stripOrdinal("17)사업시행자지정"), "사업시행자지정");
  assert.equal(m.stripOrdinal("재개발"), "재개발");
  assert.equal(m.stripOrdinal(""), null);
  const z = m.parseNationalRow({ "시도": "서울특별시", "시군구": "강남구", "구역명칭": "대치미도아파트", "현 사업추진단계": "2)정비구역지정", "사업유형": "3)재건축(공동주택)", "사업시행자": "1)조합", "공급 예정 세대수": "3914" });
  assert.deepEqual([z?.stage, z?.projectType, z?.operator], ["정비구역지정", "재건축(공동주택)", "조합"]);
  assert.match(read("app/api/cron/redev-national-ingest/route.ts"), /revalidatePath\("\/redevelopment\/seoul"\)/);
});

test("[1152] 정비구역을 지도에 — 조서의 대표 지번으로만 찍는다(이름 맞추기 · 지번 뽑기 · 분류)", async () => {
  const m = await import("../../lib/redevelopment/zone-locate.ts");
  assert.equal(m.zoneNameKey("한남3재정비촉진구역"), m.zoneNameKey("한남3 구역"));
  assert.equal(m.sameZoneKey(m.zoneNameKey("면목9구역"), m.zoneNameKey("면목9-1구역")), null, "옆 구역과 섞지 않는다");
  assert.equal(m.sameZoneKey(m.zoneNameKey("방배14"), m.zoneNameKey("방배14주택재건축 정비사업")), "eq");
  assert.equal(m.sameZoneKey(m.zoneNameKey("수색8재정비촉진"), m.zoneNameKey("수색8주택재개발정비구역")), "eq");
  assert.deepEqual(m.firstLot("용산구 한남동 686번지 일대"), { dong: "한남동", lot: "686" });
  assert.deepEqual(m.firstLot("용산구 후암동 산1, 401번지일대"), { dong: "후암동", lot: "산1" });
  assert.deepEqual(m.firstLot("강서구 방화대로21길 70 (공항동 18번지) 일원"), { dong: "공항동", lot: "18" });
  assert.deepEqual(m.firstLot("문래동3가 9"), { dong: "문래동3가", lot: "9" });
  assert.deepEqual(m.firstLot("응암동700번지일대"), { dong: "응암동", lot: "700" });
  assert.equal(m.firstLot("중구 삼각동, 수하동, 장교동 일부"), null, "지번이 없으면 찍지 않는다");
  assert.equal(m.firstLot("목동10단지아파트"), null);
  const rows = [
    { name: "한남3재정비촉진구역", place: "용산구 한남동 686번지 일대", sigungu: "용산구", date: "2018-08-02" },
    { name: "한남3 재정비촉진구역", place: "용산구 한남동 557 일대", sigungu: "용산구", date: "2025-06-12" },
    { name: "한남3구역", place: "성동구 옥수동 1", sigungu: "성동구", date: "2026-01-01" },
  ];
  assert.equal(m.pickUpisLot({ name: "한남3재정비촉진", sigungu: "용산구" }, rows)?.lot, "557", "같은 구 · 최근 조서");
  assert.equal(m.pickUpisLot({ name: "한남3재정비촉진", sigungu: "마포구" }, rows), null);
  assert.equal(m.lotQuery("서울특별시", "용산구", { dong: "한남동", lot: "686" }), "서울특별시 용산구 한남동 686");
  assert.deepEqual([m.nationalTypeKey("1)재개발(주택정비)"), m.nationalTypeKey("3)재건축(공동주택)"), m.nationalTypeKey("4)재건축(단독주택)"), m.nationalTypeKey("5)주거환경개선"), m.nationalTypeKey("?")], ["redev", "recon_apt", "recon_house", "env_improve", null]);
  assert.deepEqual(["2)정비구역지정", "3)추진위구성", "17)사업시행자지정", "5)사업시행인가", "6)관리처분인가", "7)착공", "?"].map(m.nationalStageKey), ["designated", "committee", "union", "plan_approved", "mgmt_approved", "moving", null]);
  assert.equal(m.shortSido("서울특별시"), "서울");
  assert.match(m.locateSummary({ stage: "2)정비구역지정", operator: "1)조합" }), /^공표 단계 정비구역지정 · 시행 조합 · 위치는 대표 지번 기준 · 구역 경계 아님$/);
  assert.equal(m.hitInSigungu("서울특별시 용산구 한남동 686", "용산구"), true);
  assert.equal(m.hitInSigungu("서울특별시 성동구 옥수동 1", "용산구"), false);
  const run = read("lib/redevelopment/zone-locate-run.ts");
  assert.match(run, /hitInSigungu/);
  assert.doesNotMatch(run, /Math\.random|centroid/, "좌표를 지어내지 않는다");
  assert.ok((JSON.parse(read("vercel.json")) as { crons: { path: string }[] }).crons.some((c) => c.path === "/api/cron/redev-zone-locate"));
});

test("[1153] 관리자 API 도 2단계 인증을 본다 — 등록 계정은 확인 표식이 있어야 통과", () => {
  const a = read("lib/admin/api-auth.ts");
  assert.match(a, /admin2faGate\(email\)/);
  assert.match(a, /gate === "ok" \|\| gate === "not-enrolled"/);
  /* [1156] 제 손으로 관리자 확인을 하는 14개 경로도 같은 확인을 붙였다 */
  for (const f of ["acquisition", "business", "finance", "roadmap", "moderation", "search-report", "email-test", "talk", "report", "sms", "reports/[id]", "users", "invest", "banners"]) {
    assert.match(read(`app/api/admin/${f}/route.ts`), /admin2faPassed\(/, f);
  }
});

test("[1154] 주거환경개선도 지도 분류에 · 아파트 이름 구역은 같은 이름 단지가 하나일 때만 그 좌표", async () => {
  const m = await import("../../lib/redevelopment/zone-locate.ts");
  const t = await import("../../lib/redevelopment/types.ts");
  assert.equal(t.typeMeta("env_improve").label, "주거환경개선");
  assert.equal(t.typeMeta("env_improve").group, "public");
  const cs = [{ name: "도곡우성", lat: 37.49, lng: 127.04 }, { name: "한양", lat: 1, lng: 1 }, { name: "한양아파트", lat: 2, lng: 2 }];
  assert.equal(m.pickComplexPoint("도곡우성아파트", cs)?.lat, 37.49);
  assert.equal(m.pickComplexPoint("한양아파트", cs), null, "같은 이름이 둘이면 고르지 않는다");
  assert.equal(m.pickComplexPoint("없는아파트", cs), null);
  assert.match(m.locateSummaryBy({ stage: "7)착공", operator: null }, "complex"), /^공표 단계 착공 · 위치는 같은 이름 단지 기준 · 구역 경계 아님$/);
});

test("[1154] 전국 정비구역 목록 — 단계 걸러 보기 · 세대수 많은 순 · 주소에 실린다", async () => {
  const m = await import("../../lib/redevelopment/national.ts");
  const p = m.parseNationalParams({ stage: "착공", sort: "households", sido: "서울특별시" });
  assert.deepEqual([p.stage, p.sort], ["착공", "households"]);
  assert.equal(m.parseNationalParams({ stage: "아무말", sort: "x" }).stage, "");
  assert.equal(m.parseNationalParams({ sort: "x" }).sort, "");
  assert.equal(m.nationalHref({ ...p, page: 2 }), `/redev-list?sido=${encodeURIComponent("서울특별시")}&stage=${encodeURIComponent("착공")}&sort=households&page=2`);
});

test("[1155] 정비사업 지도는 지적도(필지 경계)와 같이 본다 — /map 은 켤 때 함께 · /redevelopment 는 기본 켬", () => {
  assert.match(read("app/map/map-client.tsx"), /if \(!showRedevelopment\) setShowCadastral\(true\);/);
  const r = read("app/redevelopment/RedevelopmentMap.tsx");
  assert.match(r, /const \[cadastral, setCadastral\] = useState\(true\);/);
  assert.match(r, /nativeLayers=\{nativeLayers\}/);
  assert.match(r, /점은 대표 지번 위치 · 구역 경계 아님/);
});

test("[1161] 정비구역 경계 — 도형 자료 · 점이 도형 안이거나 이름이 같고 가까울 때만 짝 · 지도 두 곳에 그린다", async () => {
  const m = await import("../../lib/redevelopment/zone-shapes.ts");
  const file = JSON.parse(read("public/data/seoul-zone-shapes.json")) as { meta: { source: string; note: string }; zones: Array<{ n: string; k: string; c: [number, number]; a: number; p: number[] }> };
  assert.ok(file.zones.length > 2000);
  assert.match(file.meta.source, /서울특별시/);
  assert.match(file.meta.note, /법적 효력 없는 참고 자료/);
  assert.ok(file.zones.every((z) => z.k.startsWith("UQ12") && z.p.length >= 8 && z.p.length % 2 === 0));
  const sq = { n: "가나1구역", k: "UQ1221", c: [127.0, 37.5] as [number, number], a: 100, p: [126.999, 37.499, 127.001, 37.499, 127.001, 37.501, 126.999, 37.501, 126.999, 37.499] };
  assert.equal(m.pointInShape(127.0, 37.5, sq.p), true);
  assert.equal(m.pointInShape(127.01, 37.5, sq.p), false);
  assert.equal(m.matchZoneShape({ name: "가나1 재정비촉진", lat: 37.5, lng: 127.0 }, [sq]), sq);
  assert.equal(m.matchZoneShape({ name: "가나1구역", lat: 37.505, lng: 127.004 }, [sq]), sq, "이름이 같고 1.2km 안");
  assert.equal(m.matchZoneShape({ name: "다라2구역", lat: 37.505, lng: 127.004 }, [sq]), null, "이름도 다르고 밖이면 그리지 않는다");
  assert.equal(m.matchZoneShape({ name: "다라2구역", lat: 37.5, lng: 127.0 }, [sq]), null, "이름이 다르면 점이 안에 있어도 그리지 않는다");
  assert.equal(m.matchZoneShape({ name: "가나1구역", lat: 37.6, lng: 127.2 }, [sq]), null, "멀면 그리지 않는다");
  const han = file.zones.find((z) => z.n.includes("한남3"));
  assert.ok(han && Math.abs(han.c[0] - 127.0015) < 0.01 && Math.abs(han.c[1] - 37.53) < 0.01, "좌표 변환 — 한남3구역이 한남동에");
  assert.match(read("app/map/map-client.tsx"), /polygons=\{redevPolygons\}/);
  assert.match(read("app/redevelopment/RedevelopmentMap.tsx"), /polygons=\{polygons\}/);
  assert.match(read("components/map/NaverMap.tsx"), /clickable: false/);
});

test("[1156] 정비구역 목록 내려받기(CSV) · 단지 좌표 채우기 한 번에 800곳", async () => {
  const m = await import("../../lib/redevelopment/national.ts");
  const csv = m.nationalCsv([{ sido: "서울특별시", sigungu: "강남구", name: '=대치"미도', stage: "2)정비구역지정", project_type: "3)재건축(공동주택)", operator: "1)조합", households: 3914 }], "출처기관");
  assert.ok(csv.startsWith("\uFEFF시도,시군구,구역,"));
  assert.match(csv, /서울특별시,강남구,"'=대치""미도",재건축\(공동주택\),정비구역지정,3914,조합\r\n/);
  assert.match(csv, /출처: 출처기관\r\n$/);
  const crons = (JSON.parse(read("vercel.json")) as { crons: { path: string }[] }).crons;
  assert.ok(crons.some((c) => c.path === "/api/cron/geocode-complexes?limit=800"));
  assert.match(read("app/redev-list/page.tsx"), /엑셀로 내려받기\(CSV\)/);
});

test("[1157] 정비구역 마커 색 — 사업종류 · 진행단계 · 위치 붙이기는 하루 2회(사람이 눌러야 하지 않게)", async () => {
  const m = await import("../../lib/redevelopment/map-layer.ts");
  const t = await import("../../lib/redevelopment/types.ts");
  const p = { typeKey: "redev" as const, stageKey: "moving" as const };
  assert.equal(m.redevMarkerColor(p, "type"), t.colorForType("redev"));
  assert.equal(m.redevMarkerColor(p, "stage"), "#e5484d");
  assert.deepEqual(m.redevLegendEntry(p, "stage"), { key: "moving", color: "#e5484d", label: "이주·철거·착공" });
  assert.equal(new Set(Object.values(t.STAGE_COLORS)).size, t.STAGES.length, "단계마다 다른 색");
  const crons = (JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] }).crons;
  assert.equal(crons.find((c) => c.path === "/api/cron/redev-zone-locate")?.schedule, "50 5,17 * * *");
});

test("[1158] 정비사업 화면 지도 — 색 기준(사업종류 · 진행단계)과 범례", () => {
  const r = read("app/redevelopment/RedevelopmentMap.tsx");
  assert.match(r, /pinColor: redevMarkerColor\(p, colorMode\)/);
  assert.match(r, /redevLegendEntry\(p, colorMode\)/);
  assert.match(r, /REDEV_COLOR_MODES\.map/);
});

test("[1159] 임장노트 쓰기 — 넓은 화면은 3단계를 한 화면에 · 레일에 강점 약점 확인 남음", async () => {
  const f = read("app/notes/new/NoteForm.tsx");
  assert.match(f, /const onePage = showRail;/);
  for (const n of [1, 2, 3]) assert.match(f, new RegExp(`onePage \\|\\| step === ${n} \\? "flex flex-col gap-3" : "hidden"`));
  assert.match(f, /id="note-sec-1"[\s\S]*id="note-sec-2"[\s\S]*id="note-sec-3"/);
  assert.match(f, /\{onePage \? null : step < NOTE_STEPS\.length \? \(/, "한 화면에서는 이전 · 다음 단추를 그리지 않는다");
  const m = await import("../../lib/notes/note-preview.ts");
  const v = m.axisVerdicts({ location: 5, school: 3, transport: 1, facility: 4.2, future: 0 });
  assert.equal(v.strong.length, 2);
  assert.equal(v.weak.length, 1);
  assert.equal(v.missing.length, 1);
});

test("[1160] 사용법을 풀어 쓴 문구를 걷었다 — '~하면 자동으로 ~돼요' 식 설명 대신 사실 한 줄", () => {
  const gone: Array<[string, RegExp]> = [
    ["app/notes/new/NotePreviewRail.tsx", /채워짐/],
    ["app/my/points/MissionsSection.tsx", /진행도가 채워짐/],
    ["app/notes/[id]/AiPendingCard.tsx", /자동으로 반영돼요/],
    ["app/notes/compare/page.tsx", /채워져요/],
    ["app/invite/[code]/page.tsx", /자동으로 적립돼요/],
    ["app/analysis/compare/MyCriteriaRank.tsx", /바로 다시 매겨요/],
    ["app/my/watchlist/SavedSearchClient.tsx", /모아 볼 수 있어요/],
    ["app/redevelopment/RedevelopmentMap.tsx", /걸러서 볼 수 있어요/],
  ];
  for (const [f, re] of gone) assert.doesNotMatch(read(f), re, f);
});

test("[1162] 내 임장 이력 — 노트(방문일)와 분석(실행일)을 날짜 줄 하나로 · 좌표 있는 노트만 지도에", async () => {
  const m = await import("../../lib/me/history-timeline.ts");
  assert.equal(m.kstYmd("2026-11-11T16:30:00Z"), "2026-11-12", "한국 날짜");
  assert.equal(m.kstYmd("x"), "");
  const notes = [
    { id: "n1", title: "t", aptName: "가나아파트", region: "서울 강남구", visitDate: "2026-11-11", createdAt: "2026-11-11T01:00:00Z", score: 68, decisionLabel: "다시 보기", lat: 37.5, lng: 127 },
    { id: "n2", title: "제목만", aptName: null, region: "", visitDate: "", createdAt: "2026-10-30T20:00:00Z", score: null, decisionLabel: null },
  ];
  const runs = [{ id: "r1", toolTitle: "종합 진단", createdAt: "2026-11-11T05:00:00Z", headline: "72점" }];
  const h = m.buildHistory(notes, runs);
  assert.deepEqual(h.map((x) => x.label), ["2026년 11월", "2026년 10월"]);
  assert.deepEqual(h[0].days[0].items.map((i) => i.key), ["note:n1", "run:r1"], "같은 날은 노트 먼저");
  assert.equal(h[0].days[0].items[0].sub, "임장노트 · 다시 보기 · 서울 강남구");
  assert.equal(h[0].days[0].items[0].score, 68, "[1164] 점수는 오른쪽 큰 숫자로");
  assert.deepEqual(m.historySummary(notes, "2026-11-12"), { monthVisits: 1, avgScore: 68, places: 2 });
  assert.deepEqual(m.historySummary([], "2026-11-12"), { monthVisits: 0, avgScore: null, places: 0 });
  assert.equal(h[1].days[0].date, "2026-10-31", "방문일이 없으면 쓴 날(한국 날짜)");
  assert.equal(h[1].days[0].items[0].sub, "임장노트", "없는 값은 적지 않는다");
  assert.deepEqual(m.historyPoints(notes), [{ id: "n1", name: "가나아파트", lat: 37.5, lng: 127 }]);
  assert.match(read("app/my/MyHubView.tsx"), /href="\/my\/history"/);
  assert.match(read("app/my/history/page.tsx"), /robots: \{ index: false, follow: false \}/);
  for (const [f, re] of [["app/my/watchlist/page.tsx", /여기에 모여요/], ["app/page.tsx", /여기에 (표시돼요|보여요)/], ["app/my/consultations/page.tsx", /여기에 (쌓여요|표시)/]] as const) assert.doesNotMatch(read(f), re, f);
});

test("[1163] 다녀온 단지 변동 — 방문 뒤 새 실거래 · 같은 평형끼리만 견줌 · 없는 것은 적지 않는다", async () => {
  const m = await import("../../lib/me/visit-changes.ts");
  const deals = [
    { ym: "202611", day: 20, man: 126000, area: 84.9 },
    { ym: "202611", day: 2, man: 121000, area: 59.9 },
    { ym: "202610", day: 15, man: 120000, area: 84.5 },
    { ym: "202611", day: 25, man: 999999, area: 84.9, cancelled: true },
    { ym: "202611", day: null, man: 110000, area: 84.9 },
  ];
  const c = m.visitChange(deals, "2026-11-10");
  assert.equal(c.newDeals, 1, "해제 · 일 모르는 같은 달 거래는 방문 뒤로 치지 않는다");
  assert.deepEqual(c.diff, { pct: 5, beforeMan: 120000, afterMan: 126000, area: 85 });
  assert.equal(m.changeLine(c), "방문 뒤 새 실거래 1건 · 85㎡ 12억 → 12.6억(+5%)");
  assert.deepEqual(m.changeParts(c), { text: "방문 뒤 새 실거래 1건 · 85㎡ 12억 → 12.6억", delta: { label: "+5%", dir: "up" } });
  assert.equal(m.changeParts(m.visitChange([], "2026-11-30")).delta, null);
  assert.equal(m.changeLine(m.visitChange(deals, "2026-11-30")), "방문 뒤 새 실거래 없음 · 최근 12.6억(26.11.20)");
  assert.equal(m.changeLine(m.visitChange([], "2026-11-30")), "실거래 자료 없음");
  assert.equal(m.visitChange([{ ym: "202611", day: 20, man: 126000, area: 84 }, { ym: "202610", day: 1, man: 90000, area: 59 }], "2026-11-10").diff, null, "평형이 다르면 견주지 않는다");
  assert.equal(m.manShort(9800), "9,800만");
  const v = m.visitedComplexes([
    { id: "a", complexId: "c1", name: "가", visitYmd: "2026-11-01" },
    { id: "b", complexId: "c1", name: "가", visitYmd: "2026-11-09" },
    { id: "c", complexId: "", name: "나", visitYmd: "2026-11-10" },
    { id: "d", complexId: "c2", name: "다", visitYmd: "2026-10-01" },
  ]);
  assert.deepEqual(v.map((x) => [x.complexId, x.rounds, x.noteId, x.visitYmd]), [["c1", 2, "b", "2026-11-09"], ["c2", 1, "d", "2026-10-01"]]);
  assert.match(read("app/my/history/page.tsx"), /<VisitedChanges visited=\{visited\} \/>/);
});

test("[1166] 구역 경계 켜고 끄기 · 경계 있는 구역만 · 지번 없는 구역은 이름이 꼭 같은 도형 하나의 중심으로", async () => {
  const m = await import("../../lib/redevelopment/zone-shapes.ts");
  const z = await import("../../lib/redevelopment/zone-locate.ts");
  const a = { n: "가나1구역", k: "UQ1221", c: [127.0, 37.5] as [number, number], a: 100, p: [] };
  const far = { n: "가나1 재개발구역", k: "UQ1221", c: [127.2, 37.6] as [number, number], a: 50, p: [] };
  const near = { n: "가나1재정비촉진구역", k: "UQ1221", c: [127.001, 37.5] as [number, number], a: 300, p: [] };
  assert.deepEqual(m.uniqueShapeCenter("가나1", [a]), { lng: 127.0, lat: 37.5, shapeName: "가나1구역" });
  assert.equal(m.uniqueShapeCenter("가나1", [a, far]), null, "같은 이름이 떨어진 곳에 또 있으면 고르지 않는다");
  assert.equal(m.uniqueShapeCenter("가나1", [a, near])?.shapeName, "가나1재정비촉진구역", "가까이 겹친 같은 이름은 큰 도형");
  assert.equal(m.uniqueShapeCenter("다라", [a]), null);
  assert.match(z.locateSummaryBy({ stage: "7)착공", operator: null }, "shape"), /^공표 단계 착공 · 위치는 구역 경계 중심 기준$/);
  const run = read("lib/redevelopment/zone-locate-run.ts");
  assert.match(run, /naverReverseGeocode\(t\.lat, t\.lng\)/);
  assert.match(run, /hitInSigungu\(rev\.address, t\.sigungu\)/, "자치구가 확인된 좌표만 싣는다");
  const map = read("app/map/map-client.tsx");
  assert.match(map, /구역 경계\n/);
  assert.match(map, /경계 있는 구역만/);
  assert.match(read("app/redevelopment/RedevelopmentMap.tsx"), /aria-pressed=\{showShapes\}/);
});

test("[1166] 전문가 직군 — 정비업체 · PM사 · 신탁사 · 증권사 · 자산운용사 추가(사업자로만) · 법률 유형은 계속 없음", async () => {
  const m = await import("../../lib/experts/taxonomy.ts");
  const labels = m.EXPERT_TYPES.map((t) => t.label);
  for (const want of ["정비업체", "PM사", "신탁사", "증권사", "자산운용사"]) assert.ok(labels.includes(want), want);
  assert.ok(!labels.some((l) => /변호|법무|법률/.test(l)), "법률 서비스 유형은 넣지 않는다");
  for (const id of ["redev_mgmt", "pm", "trust", "securities", "asset_mgmt"] as const) {
    assert.deepEqual(m.allowedBusinessForms(id), ["sole", "corporation", "employee"], id);
    assert.deepEqual(m.requiredDocKinds(id, "corporation"), ["business_reg"], id);
  }
  assert.equal(new Set(m.EXPERT_TYPES.map((t) => t.id)).size, m.EXPERT_TYPES.length);
  assert.equal(m.EXPERT_TYPES[m.EXPERT_TYPES.length - 1].id, "other", "기타는 맨 끝");
});

test("[1167] 무료 이용 기간 — 가입 프로 90일 · 전문가 승인 프로 365일 + 홍보 365일 · 자동결제 구독은 건드리지 않는다", async () => {
  const m = await import("../../lib/billing/free-grant.ts");
  const p = await import("../../lib/experts/promo.ts");
  const now = Date.parse("2026-11-12T00:00:00Z");
  assert.deepEqual(m.signupTrialColumns(now), { plan: "expert", plan_expires_at: "2027-02-10T00:00:00.000Z" });
  assert.equal(p.PROMO_FREE_DAYS, 365);
  assert.deepEqual(m.expertGrantDecision({ plan: "free", planExpiresAt: null }, now), { grant: true, expiresAt: "2027-11-12T00:00:00.000Z" });
  assert.deepEqual(m.expertGrantDecision({ plan: "expert", planExpiresAt: "2027-02-10T00:00:00.000Z" }, now), { grant: true, expiresAt: "2028-02-10T00:00:00.000Z" }, "가입 무료 기간이 남았으면 이어 붙인다");
  assert.deepEqual(m.expertGrantDecision({ plan: "expert", planExpiresAt: null }, now), { grant: false, reason: "subscription" }, "자동결제 구독 중이면 만료를 적지 않는다");
  assert.deepEqual(m.expertGrantDecision({ plan: "pro", planExpiresAt: "2027-01-01T00:00:00.000Z" }, now), { grant: false, reason: "other-plan" });
  for (const f of ["lib/auth/ensure-app-user.ts", "lib/auth/kakao-user-store.ts", "lib/auth/toss-user-store.ts", "app/api/auth/register/route.ts"]) assert.match(read(f), /\.\.\.signupTrialColumns\(Date\.now\(\)\)/, f);
  assert.match(read("lib/experts/verification-store.ts"), /expertGrantDecision\(/);
  assert.match(read("app/signup/SignupClient.tsx"), /자동 결제 없음/);
});

test("[1168] 전문가 증빙 — 회사 임직원은 명함 하나로 신청(사업자등록번호 없이) · 자격 직군은 그대로", async () => {
  const m = await import("../../lib/experts/taxonomy.ts");
  for (const id of ["builder", "securities", "trust", "asset_mgmt", "pm", "redev_mgmt", "other"] as const) {
    assert.ok(m.allowedBusinessForms(id).includes("employee"), id);
    assert.deepEqual(m.requiredDocKinds(id, "employee"), ["business_card"], id);
    assert.equal(m.missingDocsMessage(id, "employee", ["business_card"]), null, id);
    assert.match(m.missingDocsMessage(id, "employee", ["other"]) ?? "", /명함/, id);
  }
  for (const id of ["broker", "tax", "appraiser"] as const) assert.ok(!m.allowedBusinessForms(id).includes("employee"), id);
  assert.equal(m.docKindLabel("business_card"), "명함");
  assert.equal(m.findBusinessForm("employee")?.label, "임직원");
  const route = read("app/api/experts/register/route.ts");
  assert.match(route, /form\.id === "employee" && businessName\.length < 2/);
  assert.match(route, /form\.id !== "individual" && form\.id !== "employee" && !\//);
});

test("[1168] 임장 모임 — 일정 검증 · 달력 · 1인 비용 · 투표 집계 · 게시판 분류", async () => {
  const m = await import("../../lib/groups/club.ts");
  const now = Date.parse("2026-11-12T07:00:00Z");
  assert.equal(m.kstToIso("2026-11-14", "14:00"), "2026-11-14T05:00:00.000Z");
  assert.equal(m.kstToIso("2026-02-30", "14:00"), null, "없는 날짜");
  assert.deepEqual(m.kstParts("2026-11-14T05:00:00.000Z"), { ymd: "2026-11-14", y: 2026, m: 11, d: 14, dow: "토", time: "오후 2:00" });
  assert.equal(m.kstParts("2026-11-13T15:30:00Z")?.time, "오전 12:30");
  const ok = m.validateSchedule({ title: " 마포 도보 임장 ", date: "2026-11-14", time: "14:00", place: "공덕역 1번 출구", maxMembers: 6, mode: "도보 임장", costTotal: "25000" }, now);
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual(ok.value, { title: "마포 도보 임장", scheduledAt: "2026-11-14T05:00:00.000Z", place: "공덕역 1번 출구", complexId: null, maxMembers: 6, mode: "도보 임장", costTotal: 25000 });
  assert.deepEqual(m.validateSchedule({ title: "지난", date: "2026-11-11", time: "10:00", maxMembers: 4 }, now), { ok: false, message: "지난 시각은 선택 불가" });
  assert.deepEqual(m.validateSchedule({ title: "인원", date: "2026-11-14", time: "10:00", maxMembers: 1 }, now), { ok: false, message: "인원 2~50명" });
  assert.deepEqual(m.validateSchedule({ title: "a", date: "2026-11-14", time: "10:00", maxMembers: 4 }, now), { ok: false, message: "일정 이름 2자 이상" });
  const grid = m.monthGrid(2026, 11);
  assert.deepEqual(grid[0], [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(grid[grid.length - 1], [29, 30, null, null, null, null, null]);
  assert.equal(m.monthGrid(2027, 2).flat().filter((d) => d !== null).length, 28);
  assert.deepEqual(m.shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(m.shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
  assert.equal(m.perHead(25000, 3), 8340, "10원 단위 올림");
  assert.equal(m.perHead(25000, 0), null);
  assert.equal(m.perHead(null, 3), null);
  assert.equal(m.scheduleState({ scheduledAt: "2026-11-11T00:00:00Z", maxMembers: 4, attendeeCount: 1 }, now), "past");
  assert.equal(m.scheduleState({ scheduledAt: "2026-11-14T00:00:00Z", maxMembers: 4, attendeeCount: 4 }, now), "full");
  assert.equal(m.scheduleLine({ scheduledAt: "2026-11-14T05:00:00Z", place: "공덕역", maxMembers: 6, attendeeCount: 3 }), "11월 14일 (토) 오후 2:00 · 공덕역 · 3/6명");
  assert.deepEqual(m.countByDay([{ scheduledAt: "2026-11-14T05:00:00Z" }, { scheduledAt: "2026-11-14T15:30:00Z" }]), { "2026-11-14": 1, "2026-11-15": 1 }, "한국 날짜로 센다");
  const poll = m.validatePoll({ title: "다음 임장 지역", options: ["마포", "성동", "마포", " "], multiple: true });
  assert.ok(poll.ok);
  if (poll.ok) {
    assert.deepEqual(poll.value.options, [{ id: "o1", label: "마포" }, { id: "o2", label: "성동" }]);
    assert.deepEqual(m.sanitizeVote(poll.value.options, ["o1", "o9", "o1"], false), ["o1"]);
    assert.equal(m.sanitizeVote(poll.value.options, ["o1", "o2"], false), null, "단일 선택에 둘");
    assert.deepEqual(m.tallyPoll(poll.value.options, [{ optionIds: ["o1"] }, { optionIds: ["o1", "o2"] }, { optionIds: ["x"] }]), { counts: { o1: 2, o2: 1 }, voters: 2, topIds: ["o1"] });
  }
  assert.deepEqual(m.validatePoll({ title: "하나뿐", options: ["마포"] }), { ok: false, message: "항목 2개 이상" });
  const dates = m.validatePoll({ title: "언제 갈까", kind: "date", options: ["2026-11-21", "2026-11-14", "토요일"] });
  assert.ok(dates.ok);
  if (dates.ok) assert.deepEqual(dates.value.options.map((o) => o.label), ["2026-11-14", "2026-11-21"]);
  assert.equal(m.pollOptionLabel("date", "2026-11-14"), "11월 14일 (토)");
  const post = m.validatePost({ board: "없는분류", body: " 다녀왔습니다 ", noteId: "nope", scheduleId: "8b6f2c1e-1d2a-4f3b-9c4d-5e6f7a8b9c0d" });
  assert.deepEqual(post, { ok: true, value: { board: "free", body: "다녀왔습니다", scheduleId: "8b6f2c1e-1d2a-4f3b-9c4d-5e6f7a8b9c0d", noteId: null, parentId: null } });
  assert.deepEqual(m.validatePost({ body: "  " }), { ok: false, message: "내용 입력" });
  assert.equal(m.clubTab("poll"), "poll");
  assert.equal(m.clubTab("nope"), "home");
  assert.ok(m.isMissingTable({ code: "PGRST205" }));
  assert.ok(m.isMissingTable({ message: 'relation "public.group_schedules" does not exist' }));
  assert.ok(!m.isMissingTable({ message: "timeout" }));
  const route = read("app/api/groups/[id]/club/route.ts");
  assert.match(route, /if \(!role\.member\) return bad\("모임 참여 후 이용 가능", 403\)/);
  assert.match(route, /공지는 모임장만 작성 가능/);
  const types = read("lib/groups/club-types.ts");
  assert.ok(!/email/i.test(types.replace(/이메일/g, "")), "화면으로 가는 모양에 이메일 필드가 없다");
});

test("[1168] 함께한 기록 — 일주일 · 한 달 · 6개월 · 1년(한국 날짜) · 한 일 한 줄 · 메일은 (광고) 표기", async () => {
  const m = await import("../../lib/me/milestones.ts");
  const now = Date.parse("2026-11-12T03:00:00Z");
  assert.equal(m.daysSince("2026-11-04T16:00:00Z", now), 7, "KST 11/5 01:00 가입 → 11/12 는 7일째");
  assert.equal(m.daysSince("2026-11-04T14:00:00Z", now), 8, "KST 11/4 23:00 가입");
  assert.equal(m.daysSince("2026-12-01T00:00:00Z", now), null);
  assert.equal(m.tenureMarkToday("2026-11-04T16:00:00Z", now)?.id, "d7");
  assert.equal(m.tenureMarkToday("2026-11-04T14:00:00Z", now), null);
  assert.equal(m.tenureMarkRecent("2026-11-04T14:00:00Z", now)?.id, "d7", "그 주 안에는 팝업");
  assert.equal(m.tenureMarkRecent("2026-10-25T14:00:00Z", now), null);
  assert.equal(m.tenureMarkRecent("2025-11-12T03:00:00Z", now)?.id, "d365");
  const w = m.signupWindow(7, now);
  assert.deepEqual(w, { from: "2026-11-04T15:00:00.000Z", to: "2026-11-05T15:00:00.000Z" });
  assert.equal(m.tenureMarkToday(w.from, now)?.id, "d7");
  assert.equal(m.activityLine({ notes: 3, analyses: 0, watchlist: 5, groups: 1 }), "임장노트 3개 · 관심 단지 5곳 · 모임 1곳");
  const msg = m.milestoneMessage("d30", "대웅", { notes: 3, analyses: 2, watchlist: 0, groups: 0 });
  assert.deepEqual(msg, { kind: "d30", title: "대웅님과 함께한 한 달", body: "임장노트 3개 · AI 분석 2회", href: "/my/history", cta: "내 임장 이력 보기" });
  assert.equal(m.milestoneMessage("d7", "", { notes: 0, analyses: 0, watchlist: 0, groups: 0 }).href, "/notes/new");
  assert.equal(m.milestoneMessage("first_note", "대웅", { notes: 1, analyses: 0, watchlist: 0, groups: 0 }).title, "대웅님의 첫 임장노트");
  const cron = read("app/api/cron/milestone-greetings/route.ts");
  assert.match(cron, /consent\.has\(t\.email\)/, "메일은 동의자만");
  assert.match(read("lib/me/milestone-mail.ts"), /\(광고\) \[내집나우\]/);
  assert.match(read(".github/workflows/etl.yml"), /call milestone-greetings/);
});

test("[1168] 다이제스트 — 주간에 모임 일정 · 새 임장노트 · 거래 많은 지역 / 일간은 달라진 것만", async () => {
  const m = await import("../../lib/digest/personal-format.ts");
  const base = { weekLabel: "11월 2주차", windowFrom: "2026-11-05", windowTo: "2026-11-12" };
  const g = { groupId: "g1", groupTitle: "마포 모임", title: "성수 둘러보기", scheduledAt: "2026-11-14T05:00:00Z", place: "성수역 3번 출구" };
  assert.equal(m.kstWhen(g.scheduledAt), "11/14(토) 14:00");
  assert.equal(m.groupScheduleLine(g), "모임 일정 11/14(토) 14:00 성수 둘러보기 · 성수역 3번 출구 · 마포 모임");
  assert.equal(m.isPersonalDigestEmpty({ ...base, groups: { count: 1, items: [g] } }), false, "모임 일정만 있어도 나간다");
  assert.equal(m.isPersonalDigestEmpty({ ...base, pickNotes: [{ id: "n1", title: "노트", region: null }] }), true, "곁들임만으로는 보내지 않는다");
  const cands = [
    { id: "a", title: "내 노트", region: "마포구", authorEmail: "Me@x.com" },
    { id: "b", title: "강남 노트", region: "서울 강남구", authorEmail: "o@x.com" },
    { id: "c", title: "마포 노트", region: "서울 마포구", authorEmail: "p@x.com" },
    { id: "d", title: " ", region: null, authorEmail: "q@x.com" },
  ];
  assert.deepEqual(m.choosePickNotes(cands, "me@x.com", ["서울 마포구"]).map((n) => n.id), ["c", "b"], "관심 지역 먼저 · 본인 제외 · 제목 없는 것 제외");
  const regs = [
    { regionName: "마포구", regionId: "r1", tradeCount: 90, period: "202610" },
    { regionName: "송파구", regionId: "r2", tradeCount: 300, period: "202610" },
    { regionName: "노원구", regionId: null, tradeCount: 250, period: "202610" },
    { regionName: "세종", regionId: null, tradeCount: 0, period: null },
  ];
  assert.deepEqual(m.choosePickRegions(regs, ["마포구"]).map((r) => r.regionName), ["송파구", "노원구"]);
  const full = { ...base, groups: { count: 1, items: [g] }, pickNotes: [{ id: "c", title: "마포 노트", region: "서울 마포구" }], pickRegions: regs.slice(1, 3) };
  const mail = m.formatPersonalDigestEmail(full, { siteUrl: "https://naezipnow.com" });
  assert.match(mail.subject, /모임 일정 1건/);
  assert.match(mail.html, /town\/groups\/g1\?tab=schedule/);
  assert.match(mail.html, /이번 주 새 임장노트/);
  assert.match(mail.html, /거래가 많았던 지역/);
  const daily = m.toDailyDigest({ ...full, regions: [] });
  assert.ok(daily && !("pickNotes" in daily) && !("pickRegions" in daily) && !("regions" in daily));
  assert.equal(m.toDailyDigest({ ...base, pickNotes: full.pickNotes }), null);
  if (daily) {
    assert.equal(m.formatDailyDigestInbox(daily, "2026-11-12").title, "11.12 오늘의 요약 — 모임 일정 1건");
    const dm = m.formatDailyDigestEmail(daily, "2026-11-12", { siteUrl: "https://naezipnow.com" });
    assert.match(dm.subject, /^\(광고\) \[내집나우\] 11\.12 오늘의 요약/);
    assert.ok(!dm.html.includes("내 주간 요약"));
  }
  assert.match(read(".github/workflows/etl.yml"), /call daily-digest/);
});

test("[1169] 전문가 등록 — 홍보 안내는 신청 칸 아래 · 채팅 위 바로가기 · MY 내 모임 한 줄", () => {
  const apply = read("app/town/experts/apply/page.tsx");
  assert.ok(apply.indexOf("<ApplyForm />") < apply.indexOf('id="apply-promo-h"'), "신청 칸이 먼저");
  const chat = read("app/town/groups/[id]/chat/page.tsx");
  assert.match(chat, /sched\.state === "missing"\s*\?\s*undefined/, "모임 테이블이 없으면 바로가기를 숨긴다");
  assert.match(read("app/town/groups/[id]/ChatRoom.tsx"), /aria-label="모임 바로가기"/);
  assert.match(read("app/my/MyHubView.tsx"), /\{groupLine && \(/);
});

test("[1170] 모임 — 캘린더 저장(.ics) · 날짜 투표에서 일정 만들기 · 탭에 필요한 것만 읽기 · 지도 자료 캐시", async () => {
  const m = await import("../../lib/groups/club.ts");
  const ics = m.scheduleIcs({ id: "s1", title: "성수, 둘러보기", scheduledAt: "2026-11-14T05:00:00.000Z", place: "성수역 3번 출구" }, "마포 모임", "https://naezipnow.com/town/groups/g1?tab=schedule");
  assert.ok(ics);
  const lines = (ics ?? "").split("\r\n");
  assert.equal(lines[0], "BEGIN:VCALENDAR");
  assert.ok(lines.includes("DTSTART:20261114T050000Z"));
  assert.ok(lines.includes("DTEND:20261114T070000Z"));
  assert.ok(lines.includes("SUMMARY:성수\\, 둘러보기 · 마포 모임"), "쉼표는 이스케이프");
  assert.ok(lines.includes("LOCATION:성수역 3번 출구"));
  assert.equal(lines[lines.length - 1], "END:VCALENDAR");
  assert.equal(m.scheduleIcs({ id: "s", title: "x", scheduledAt: "nope", place: null }, "", ""), null);
  const page = read("app/town/groups/[id]/page.tsx");
  assert.match(page, /tab === "poll" \? loadPolls/);
  assert.match(page, /\(tab === "board" \|\| tab === "home"\) \? loadPosts/);
  assert.match(read("app/town/groups/[id]/ClubPolls.tsx"), /tab=schedule&date=/);
  assert.match(read("app/town/groups/[id]/chat/page.tsx"), /countUpcomingSchedules\(id\)/);
  assert.match(read("next.config.ts"), /source: "\/data\/:path\*"[\s\S]{0,120}max-age=86400, stale-while-revalidate=604800/);
});

test("[1171] 단지 분석 4종 탭 — 고른 단지를 들고 옆 도구로 · 일정에 관심 단지 붙이기", async () => {
  const m = await import("../../lib/ai/frame-tabs.ts");
  const f = await import("../../app/analysis/ai/[tool]/frame-tools.ts");
  assert.deepEqual([...m.FRAME_TABS.map((t) => t.id)].sort(), [...f.FRAME_TOOLS].sort(), "탭 = 머리를 쓰는 4종");
  assert.equal(m.frameTabHref("ai-timing", "서울 마포구|가나"), "/analysis/ai/ai-timing?complexId=%EC%84%9C%EC%9A%B8%20%EB%A7%88%ED%8F%AC%EA%B5%AC%7C%EA%B0%80%EB%82%98");
  assert.equal(m.frameTabHref("ai-diagnosis", null), "/analysis/ai/ai-diagnosis");
  const wb = read("app/analysis/ai/[tool]/WorkbenchClient.tsx");
  assert.match(wb, /frameTabHref\(t\.id, picked\?\.id\)/);
  assert.match(read("app/town/groups/[id]/ClubSchedule.tsx"), /complexId: complexId \|\| null/);
});
