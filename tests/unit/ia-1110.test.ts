import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { NAV } from "../../app/components/nav-data.ts";
import { REGION_ALIASES, REGION_CATALOG, normalizeRegionKey } from "../../lib/region/catalog.ts";
import { REDIRECT_RULES } from "../../lib/seo/redirect-map.ts";
import {
  SIDO_ORDER,
  buildRegionSiseGroups,
  legacyRegionParamHref,
  listRegionSiseRegions,
  regionSiseKey,
  searchRegionSise,
} from "../../lib/region/region-sise.ts";
import type { RegionMarketSnapshot } from "../../lib/market/types.ts";

/* ============================================================
   [1110] AI 분석 2차 통폐합 — 구조 계약 (소유자 2026-11-07 ~ 08)
     ① 단지 분석 4줄 — 펼침 문구 없이 바로 열기("1, 2 같은 문구는 필요없어")
     ② 지역 시세 5줄 → 지역 시세 분석 하나 — 시 · 구 · 동 검색 + 시/도 필터(5개 넘으면 필터식) → 지역 종합 화면(/region/[id])
        · /analysis/timing = 고르는 자리(ISR · 쿼리는 클라이언트만) · /analysis/price 삭제 → 301 · 옛 ?region= 은 그 지역 종합 화면으로
     ③ 내 임장노트 묶음 · 에이전트 → 임장노트 카테고리(/notes/analysis) · AI 분석에서 제외
     ④ 상단 메뉴 "실거래" 대분류 제거(6칸) — 실거래 현황은 지도 · 크롤 경로(구간 · 동별 · 리포트 · 온도)는 푸터 데이터 묶음
     ⑤ E2E 스모크는 지금 화면을 본다(낡은 문구 19건 갱신)
   ============================================================ */

const read = (p: string) => readFileSync(p, "utf8");
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

test("② 지역 시세 분석 — 순수 함수: 키 규칙은 카탈로그와 같다 · 폐지 지역 제외 · 검색 · 옛 ?region= · 시/도 묶음", () => {
  for (const v of ["서울특별시 강남구", "성남시 분당구", " 인천광역시 서구 ", "Gangnam"]) assert.equal(regionSiseKey(v), normalizeRegionKey(v), v);
  const regions = listRegionSiseRegions(REGION_CATALOG, REGION_ALIASES);
  assert.ok(regions.length >= 100 && regions.every((r) => r.href === `/region/${encodeURIComponent(r.id)}`));
  assert.ok(regions.every((r) => !REGION_CATALOG.find((c) => c.id === r.id)?.retired), "폐지 지역은 고르는 자리에 없다");
  const gangnam = regions.find((r) => r.id === "gangnam")!;
  assert.equal(gangnam.label, "서울 강남구");
  /* 검색 — 앞 일치 먼저 · 두 글자부터 포함 일치 · 시/도를 치면 그 시/도의 앞 8곳 */
  assert.equal(searchRegionSise(regions, "강남")[0]?.id, "gangnam");
  assert.equal(searchRegionSise(regions, "서울 강남구")[0]?.id, "gangnam");
  assert.equal(searchRegionSise(regions, "분당")[0]?.id, "seongnam-bundang");
  assert.equal(searchRegionSise(regions, "판교")[0]?.id, "seongnam-bundang", "통용 지명(REGION_ALIASES)도 본다");
  assert.equal(searchRegionSise(regions, "화성 동탄구")[0]?.id, "hwaseong-dongtan", "항목 별칭(aliases)도 본다");
  assert.ok(searchRegionSise(regions, "구").length <= 8 && searchRegionSise(regions, "구").every((r) => r.keys.some((k) => k.startsWith("구"))), "한 글자는 앞 일치만");
  assert.ok(searchRegionSise(regions, "서울").every((r) => r.sido === "서울") && searchRegionSise(regions, "서울").length === 8, "시/도를 치면 그 시/도의 앞 8곳");
  assert.deepEqual(searchRegionSise(regions, "   "), []);
  /* 옛 주소 ?region= — 카탈로그 id · 한글 표기("서울 강남구" · "강남구") 둘 다 · 모르면 null */
  assert.equal(legacyRegionParamHref(regions, "gangnam"), "/region/gangnam");
  assert.equal(legacyRegionParamHref(regions, "서울 강남구"), "/region/gangnam");
  assert.equal(legacyRegionParamHref(regions, "강남구"), "/region/gangnam");
  assert.equal(legacyRegionParamHref(regions, "없는곳"), null);
  assert.equal(legacyRegionParamHref(regions, null), null);
  /* 시/도 묶음 — 사람이 찾는 순(서울 · 경기 · 인천 · 광역시 · 세종) · 값 없음은 null(0 으로 채우지 않는다) */
  const snaps = new Map<string, RegionMarketSnapshot>([
    ["gangnam", { regionId: "gangnam", regionName: "강남구", source: "reb", period: "202610", avgSale: 2_870_000_000, jeonseRatio: 43.6 } as RegionMarketSnapshot],
    ["seocho", { regionId: "seocho", regionName: "서초구", source: "reb", period: "202610", avgSale: 0, jeonseRatio: 0 } as RegionMarketSnapshot],
  ]);
  const groups = buildRegionSiseGroups(regions, snaps, [{ regionId: "gangnam", score: 13, headline: "차가움" }]);
  assert.deepEqual(groups.map((g) => g.sido).slice(0, 3), ["서울", "경기", "인천"]);
  assert.ok(groups.every((g, i) => i === 0 || SIDO_ORDER.indexOf(g.sido) === -1 || SIDO_ORDER.indexOf(g.sido) >= SIDO_ORDER.indexOf(groups[i - 1].sido)));
  const seoul = groups.find((g) => g.sido === "서울")!;
  const gn = seoul.rows.find((r) => r.id === "gangnam")!;
  assert.deepEqual([gn.avgSaleKrw, gn.jeonseRatio, gn.temp], [2_870_000_000, 43.6, { score: 13, headline: "차가움" }]);
  const sc = seoul.rows.find((r) => r.id === "seocho")!;
  assert.deepEqual([sc.avgSaleKrw, sc.jeonseRatio, sc.temp], [null, null, null], "0 · 없음은 null");
  assert.equal(buildRegionSiseGroups(regions, null, null).reduce((n, g) => n + g.rows.length, 0), regions.length, "못 읽어도 줄은 전부(값만 —)");
});

test("①② 허브 — 단지 분석은 바로 열기 · 지역 시세는 조각 하나 · 기록 계열 · 에이전트 없음", () => {
  const hub = strip(read("app/analysis/page.tsx"));
  assert.match(hub, /<WorkbenchGrid core=\{workbenchCards\.core\} \/>/);
  assert.match(hub, /<TierHead id="market" count=\{regionSise\.regions\.length\} unit="곳" \/>/);
  assert.match(hub, /<RegionSiseEntry data=\{regionSise\} \/>/);
  for (const gone of ['id="tier-record"', 'href="/agent"', "<ToolRows", "HubNoteAnalysis", "HubRecordStart", "loadHubTeasers"]) assert.ok(!hub.includes(gone), gone);
  const tiers = strip(read("app/analysis/hub-tiers.tsx"));
  assert.ok(!/openId|role="region"|접기|단지 고르고 \$\{c\.title\}/.test(tiers), "펼침 칸 없음");
  for (const f of ["app/analysis/hub-tool-detail.tsx", "app/analysis/hub-teasers.ts", "app/analysis/hub-region-teaser.tsx", "app/analysis/hub-tool-card.tsx"]) assert.ok(!existsSync(f), f);
  /* 지역 시세 분석 조각 — 검색칸(클라이언트 · 카탈로그 import 없음) · 시/도 필터(클라이언트 · 판은 서버) · 비교 화면 글자 링크 3 */
  const entry = strip(read("app/analysis/region-sise-entry.tsx"));
  /* [1111] 검색칸 · 시/도 표 · 지도 보기는 클라이언트 묶음(region-sise-client)이 하나로 — 판(표)은 서버가 그려 넘긴다 */
  assert.match(entry, /<RegionSiseClient\s+regions=\{data\.regions\}\s+markers=\{data\.markers\}/);
  assert.match(entry, /panels=\{data\.groups\.map\(\(g\) => <Panel key=\{g\.sido\} g=\{g\} \/>\)\}/);
  const client = strip(read("app/analysis/region-sise-client.tsx"));
  assert.match(client, /<RegionSearchBox regions=\{regions\} autoFocus=\{autoFocus\} onMapClick=\{\(\) => setView\("map"\)\} \/>/);
  assert.match(client, /<SidoFilter sidos=\{sidos\} counts=\{counts\} panels=\{panels\} \/>/);
  assert.match(client, /<RegionMapPicker markers=\{markers\}/);
  for (const h of ["/analysis/temperature", "/analysis/gap", "/analysis/scenario"]) assert.ok(entry.includes(`href="${h}"`), h);
  assert.match(entry, /loadWithinPrerenderBudget\(`\$\{what\} 스냅샷`, \(\) => getAllRegionSnapshots\(\), BUDGET_MS\)/);
  assert.match(entry, /loadWithinPrerenderBudget\(`\$\{what\} 온도`, \(\) => listLatestTemperatures\(\), BUDGET_MS\)/);
  const box = strip(read("app/analysis/region-search-box.tsx"));
  assert.match(box, /^"use client";/m);
  assert.ok(!box.includes("@/lib/region/catalog"), "검색칸은 카탈로그를 import 하지 않는다(번들)");
  assert.match(box, /\/api\/search\/suggest\?q=/);
  assert.match(box, /a\.kind === "dong" && typeof a\.href === "string" && a\.href\.startsWith\("\/dong\/"\)/);
  assert.match(box, /통합 검색 ›/, "0건이면 통합 검색으로 — 없음으로 끝내지 않는다");
  const filt = strip(read("app/analysis/sido-filter.tsx"));
  assert.match(filt, /role="tablist"/);
  assert.match(filt, /hidden=\{i !== idx\}/);
  /* 히어로 — 계열 둘 · 고른 단지의 지역 → /region/[id] · 노트 카드 링크는 임장노트 분석으로 */
  const hero = strip(read("app/analysis/hub-hero.tsx"));
  assert.match(hero, /const TIER_ORDER: readonly TierId\[\] = \["complex", "market"\];/);
  assert.match(hero, /picked\?\.regionId \? `\/region\/\$\{encodeURIComponent\(picked\.regionId\)\}` : "\/analysis\/timing"/);
  assert.match(hero, /href=\{`\/notes\/analysis\$\{q\}`\}/);
  assert.match(hero, /toolCount/);
  assert.match(hub, /toolCount=\{AI_TOOL_COUNT \+ 1\}/);
});

test("② /analysis/timing = [1112] 대시보드 + 머리 검색 · /analysis/price 삭제 → 301 1홉 · 앱 안 링크 정리", () => {
  const page = strip(read("app/analysis/timing/page.tsx"));
  assert.match(page, /export const revalidate = 86_400;/);
  assert.doesNotMatch(page, /searchParams/, "서버는 쿼리를 읽지 않는다(ISR)");
  /* [1112] 소유자 "이런 식으로 해줘"(시세·타이밍 대시보드 캡처) — 대시보드 복귀 · 머리 오른쪽은 검색칸 하나 */
  assert.match(page, /<TimingWithSearch\s+searchRegions=\{listRegionSiseRegions\(REGION_CATALOG, REGION_ALIASES\)\}/);
  const tc = strip(read("app/analysis/timing/TimingClient.tsx"));
  for (const gone of ["<StepLine", "<AnalysisCrossLinks", "<TimingRegionSelect", "<TimingComplexPicker", '"지난달 대비"', 'label: "시장 온도"']) assert.ok(!tc.includes(gone), `중복 제거: ${gone}`);
  assert.match(tc, /title="지역 시세 분석"/);
  assert.match(strip(read("app/analysis/region-search-box.tsx")), /if \(id && onPick && pickIds\?\.includes\(id\)\)/);
  assert.match(strip(read("app/analysis/region-sise-entry.tsx")), /findTemperatureRegion\(r\.id\) \? \{ \.\.\.r, href: `\/analysis\/timing\?region=\$\{encodeURIComponent\(r\.id\)\}` \} : r/);
  for (const f of [
    "app/analysis/price/page.tsx",
    "app/analysis/timing/region-select.tsx",
    "app/analysis/timing/complex-picker.tsx",
    "app/analysis/timing/legacy-region-param.tsx",
    "app/components/home/HomeToolPick.tsx",
  ]) assert.ok(!existsSync(f), `${f} 는 지웠다`);
  assert.ok(existsSync("app/analysis/timing/region-verdict.tsx"), "갭 · 온도 · 시나리오 · 비교가 쓰는 공용 조각은 남는다");
  const rule = REDIRECT_RULES.find((r) => r.from === "/analysis/price");
  assert.equal(rule?.to, "/analysis/timing");
  assert.ok(!REDIRECT_RULES.some((r) => r.from === "/analysis/timing"), "목적지는 살아 있는 라우트(1홉)");
  /* 앱 안에서 지운 화면 주소를 글자로 만드는 곳이 없다(주석 제외) */
  for (const f of [
    "app/analysis/AnalysisCrossLinks.tsx",
    "app/analysis/tool-catalog.ts",
    "app/analysis/ToolGlyph.tsx",
    "app/map/map-client.tsx",
    "app/complex/[id]/PriceTab.tsx",
    "app/components/home/HomeTodayLine.tsx",
    "lib/ai/tool-persona.ts",
    "lib/cache/invalidate.ts",
    "lib/http/cache-policy.ts",
    "app/robots.ts",
  ]) assert.ok(!strip(read(f)).includes('"/analysis/price"') && !strip(read(f)).includes("`/analysis/price"), `${f}: /analysis/price 링크가 남았다`);
  /* 지역을 아는 링크는 종합 화면으로 — 온도 기록 화면의 채움 단추 · 단지 시세 탭은 ?region= 으로 넘긴다 */
  assert.match(strip(read("app/analysis/temperature/[region]/page.tsx")), /href=\{`\/region\/\$\{region\.id\}`\}\s+className="rounded-xl bg-primary/);
  assert.match(strip(read("app/complex/[id]/PriceTab.tsx")), /`\/analysis\/timing\?region=\$\{encodeURIComponent\(region\)\}`/);
  assert.ok(existsSync("app/analysis/timing/region-verdict.tsx"));
});

test("③ 임장노트 분석(/notes/analysis) — 허브의 기록 묶음 · 에이전트가 그대로 · 노트 링크는 이리로", () => {
  const p = strip(read("app/notes/analysis/page.tsx"));
  assert.match(p, /export const revalidate = 86_400;/);
  assert.match(p, /<HubRecordStart\s+guest=\{/);
  assert.match(p, /<HubNoteAnalysis \/>/);
  assert.match(p, /<ToolRows tools=\{RECORD_LIVE\} nowLabel="내 기록" extras=\{\{ "\/analysis\/compare": <CompareTrayCount bare \/> \}\} \/>/);
  assert.match(p, /공개 노트 AI 정리 미리보기/);
  assert.equal((p.match(/btn-primary/g) ?? []).length, 0, "채움 파랑은 노트 AI 카드의 분석 실행 하나(ai-note-analysis)");
  const cat = strip(read("app/analysis/tool-catalog.ts"));
  assert.match(cat, /href: "\/analysis\/compare",\s*title: "후보 단지 비교",[\s\S]{0,160}tier: "record"/);
  assert.match(cat, /href: "\/agent",\s*title: "에이전트",[\s\S]{0,200}tier: "record"/);
  assert.doesNotMatch(cat, /href: "\/notes",\s*title: "임장노트 분석"/, "임장노트 분석 줄은 그 화면 자체(실행 카드)로");
  assert.doesNotMatch(cat, /href: "\/analysis\/price"/);
  for (const f of ["app/notes/[id]/NoteToolsRow.tsx", "app/notes/[id]/(index)/page.tsx", "app/map/ComplexInfoPanel.tsx"]) {
    const s = strip(read(f));
    assert.ok(!/(?<!\/notes)\/analysis\?noteId=/.test(s), `${f}: 노트 AI 링크는 /notes/analysis?noteId= 로`);
    assert.ok(s.includes("/notes/analysis?noteId="), f);
  }
  /* 캐시 · 사이트맵 */
  assert.match(read("lib/http/cache-policy.ts"), /\{ path: "\/notes\/analysis", sMaxAge: 86_400, swr: 86400 \}/);
  assert.match(read("lib/seo/build-sitemap.ts"), /\{ path: "\/notes\/analysis", priority: 0\.5 \}/);
});

test("④ 메뉴 6 · 실거래 대분류 없음 · 지도가 실거래 화면을 켠다 · 푸터 데이터 묶음에 넷 · AI 하위 둘 · 임장노트 하위에 노트 분석", () => {
  assert.deepEqual(NAV.map((g) => g.label), ["임장노트", "지도", "AI 분석", "동네", "뉴스", "요금제"]);
  const map = NAV.find((g) => g.label === "지도")!;
  assert.deepEqual([...(map.also ?? [])].sort(), ["/complex", "/dong", "/region", "/reports", "/tx"]);
  const ai = NAV.find((g) => g.label === "AI 분석")!;
  assert.deepEqual((ai.children ?? []).map((c) => [c.label, c.href]), [["분석 허브", "/analysis"], ["단지 분석", "/analysis#tier-complex"], ["지역 시세", "/analysis/timing"]]);
  const notes = NAV[0];
  assert.deepEqual((notes.children ?? []).map((c) => c.href), ["/notes/new", "/notes", "/notes/analysis", "/journey", "/journey/contract", "/quiz"]);
  const footer = read("app/components/Footer.tsx");
  for (const [label, href] of [["실거래 구간", "/tx"], ["동별 실거래", "/dong"], ["월간 리포트", "/reports"], ["시장 온도", "/analysis/temperature"]]) {
    assert.ok(footer.includes(`{ label: "${label}", href: "${href}", bold: false, group: "data" }`), href);
  }
  assert.ok(!footer.includes('href: "/complex/browse"'), "단지 찾기는 지도 · 홈 · 지역 화면이 잇는다(메뉴 · 푸터에 없음)");
  for (const f of ["app/components/DesktopSideNavGroups.tsx", "app/components/MobileMenu.tsx"]) assert.doesNotMatch(read(f), /실거래: "bar",/, f);
});

test("⑤ E2E 스모크 — 지금 화면의 문구를 본다(낡은 19건) · 설치 배너 검사는 사흘 방문 상태로 시작", () => {
  const smoke = read("tests/e2e/smoke.spec.ts");
  for (const gone of ['"이 집은 이사 갔어요"', '"비밀번호를 잊으셨나요?"', "/멤버십 요금제/", "/대출·수익률 계산기/", '"단지·매물·임장노트·뉴스 통합 검색"', 'getByText("로그인이 필요해요")', "/눌러서 변경/", "/이 템플릿으로 노트 쓰기/", 'name: "오픈 알림 받기"']) {
    assert.ok(!smoke.includes(gone), `낡은 문구가 남았다: ${gone}`);
  }
  for (const now of ['for (const name of ["임장노트", "지도", "AI 분석", "동네", "뉴스", "요금제"])', "/기록은 무료, 판단은 더 깊게/", "/대출 계산기/", "/페이지 없음/", '"비밀번호 찾기", exact: true', 'getByPlaceholder(/^단지·지역/)', '"로그인 필요"']) {
    assert.ok(smoke.includes(now), `지금 문구가 없다: ${now}`);
  }
  assert.match(read("tests/e2e/install-prompt.spec.ts"), /localStorage\.setItem\("nuguzip:visit-days", JSON\.stringify\(\[d\(2\), d\(1\), d\(0\)\]\)\)/);
  assert.ok(!read("tests/e2e/install-prompt.spec.ts").includes('name: "추가하기"'), "배너 단추는 \"홈 화면에 추가\"(InstallPrompt)");
  assert.ok(!read("tests/e2e/ios-install-hint.spec.ts").includes("베타 공지가 아직 안 닫혔으면"), "없는 모달에 양보하는 검사 없음");
  /* 화면 쪽 문구가 바뀌면 이 두 줄이 먼저 잡는다 */
  assert.match(read("app/components/NotFoundBody.tsx"), /페이지 없음<span/);
  assert.match(read("app/components/nav-data.ts"), /label: "동네",/);
});
