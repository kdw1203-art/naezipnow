import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { NAV } from "../../app/components/nav-data.ts";
import { toHomeDealRows } from "../../lib/newui/home-deals.ts";

/* ============================================================
   [1108] 통폐합 + 디자인 개선(A안) — 구조 계약
     ① 상단 메뉴: "실거래" 대분류 맨 앞(7) · 하위 6(단지 찾기 · 비교 · 구간 · 동별 · 월간 리포트 · 시장 온도) · AI 분석 하위 3 계열 ·
        동네 하위에 토론 · 모임 · 요금제는 그대로(토스 심사 종료까지 — 소유자 결정 2026-11-07)
     ② 푸터 24 → 18 — 뺀 여섯 목적지는 전부 메뉴 하위에 있다(크롤 경로 합집합 보존 · 1069 · 1094)
     ③ 단지 상세: 기록 한 자리(임장노트 · 후기 · 토론 칩) · 인근 단지 + 비교 한 목록 · AI 입구 하나 · 국토부 이력은 표 아래 링크
     ④ 홈: 네이비 검색 띠(검색 + 오늘의 시장 + AI 브리핑 슬라이드) · 최근 실거래 6건 · AI 입구 판 없음 · 지역 동향은 사이드바
   ============================================================ */

const read = (p: string) => readFileSync(p, "utf8");
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

/* 1107 까지의 푸터 24 목적지 — 1108 뒤에도 메뉴 ∪ 푸터 안에 전부 있어야 한다 */
const OLD_FOOTER_HREFS = [
  "/legal/terms", "/legal/privacy", "/legal/location", "/legal/youth", "/legal",
  "/support", "/subscription", "/subscription/payment-methods", "/about",
  "/methodology", "/data-sources", "/glossary", "/guides", "/journey", "/journey/contract", "/reports",
  "/decide", "/calculator/rent-vs-buy", "/pro", "/imjang", "/tx", "/dong", "/analysis/temperature", "/developers",
];

function footerHrefs(): string[] {
  const f = read("app/components/Footer.tsx");
  return [...f.matchAll(/\{ label: "[^"]+", href: "([^"]+)", bold: (?:true|false), group: "(?:service|data|help|policy)" \}/g)].map((m) => m[1]);
}
function navHrefs(): string[] {
  const out: string[] = [];
  for (const g of NAV) {
    out.push(g.href.split("#")[0]);
    for (const c of g.children ?? []) out.push(c.href.split("#")[0].split("?")[0]);
  }
  return out;
}

test("① 메뉴 — 실거래 맨 앞 · 하위 6 · AI 3 계열 · 동네에 토론 · 모임 · 요금제 그대로", () => {
  assert.deepEqual(
    NAV.map((g) => g.label),
    ["실거래", "임장노트", "지도", "AI 분석", "동네", "뉴스", "요금제"],
  );
  const tx = NAV[0];
  assert.equal(tx.href, "/complex/browse");
  assert.deepEqual(
    (tx.children ?? []).map((c) => [c.label, c.href]),
    [
      ["단지 찾기", "/complex/browse"],
      ["단지 비교", "/complex/compare"],
      ["실거래 구간", "/tx"],
      ["동별 실거래", "/dong"],
      ["월간 리포트", "/reports"],
      ["시장 온도", "/analysis/temperature"],
    ],
  );
  /* 단지 · 지역 · 구간 · 동별 · 리포트 · 온도 화면에서 "실거래"가 켜진다(가장 긴 접두) */
  assert.deepEqual([...(tx.also ?? [])].sort(), ["/analysis/temperature", "/complex", "/dong", "/region", "/reports", "/tx"].sort());
  const map = NAV.find((g) => g.label === "지도");
  assert.deepEqual((map?.children ?? []).map((c) => c.href), ["/map", "/map/3d"]);
  const ai = NAV.find((g) => g.label === "AI 분석");
  assert.deepEqual(
    (ai?.children ?? []).map((c) => c.href),
    ["/analysis", "/analysis#tier-complex", "/analysis#tier-market", "/analysis#tier-record"],
  );
  /* 허브 앵커가 실재한다 */
  const hub = read("app/analysis/page.tsx");
  for (const id of ["tier-complex", "tier-market", "tier-record"]) assert.ok(hub.includes(`id="${id}"`), id);
  const town = NAV.find((g) => g.label === "동네");
  assert.deepEqual(town?.also, ["/talk"]);
  assert.ok((town?.children ?? []).some((c) => c.href === "/talk" && c.label === "토론"));
  assert.ok((town?.children ?? []).some((c) => c.href === "/town/groups" && c.label === "모임"));
  /* 요금제 — 심사 종료까지 자리 · 하위 그대로 */
  const pay = NAV[NAV.length - 1];
  assert.equal(pay.label, "요금제");
  assert.equal((pay.children ?? []).length, 3);
  /* 아이콘 표 두 곳에 실거래 */
  for (const f of ["app/components/DesktopSideNavGroups.tsx", "app/components/MobileMenu.tsx"]) {
    assert.match(read(f), /실거래: "bar",/, f);
  }
});

test("② 푸터 24 → 18 — 묶음 4 · 뺀 여섯은 메뉴 하위에 · 심사 줄(요금제 · 카드 결제 수단 안내)은 그대로", () => {
  const hrefs = footerHrefs();
  assert.equal(hrefs.length, 18);
  const f = read("app/components/Footer.tsx");
  const groups = [...f.matchAll(/group: "(service|data|help|policy)"/g)].map((m) => m[1]);
  assert.deepEqual(
    { service: groups.filter((g) => g === "service").length, data: groups.filter((g) => g === "data").length, help: groups.filter((g) => g === "help").length, policy: groups.filter((g) => g === "policy").length },
    { service: 5, data: 4, help: 4, policy: 5 },
  );
  const removed = ["/journey", "/journey/contract", "/reports", "/tx", "/dong", "/analysis/temperature"];
  for (const h of removed) assert.ok(!hrefs.includes(h), `푸터에 남음: ${h}`);
  const union = new Set([...hrefs, ...navHrefs()]);
  for (const h of OLD_FOOTER_HREFS) assert.ok(union.has(h), `크롤 경로 끊김: ${h}`);
  for (const keep of ['label: "요금제·결제 수단", href: "/subscription"', 'label: "카드 결제 수단 안내", href: "/subscription/payment-methods"', 'label: "법적 고지", href: "/legal"']) {
    assert.ok(f.includes(keep), keep);
  }
});

test("③ 단지 상세 — 기록 한 자리 · 인근 단지+비교 한 목록 · AI 입구 하나 · 국토부 이력은 표 아래", () => {
  const page = strip(read("app/complex/[id]/page.tsx"));
  assert.ok(!existsSync("app/complex/[id]/ComplexNotesNewsAi.tsx"), "옛 2단 카드 파일 없음");
  assert.ok(!existsSync("app/complex/[id]/ComplexPairChips.tsx"), "비교 칩 파일 없음(ComplexNearby 로)");
  assert.match(page, /<ComplexRecordsSection\s+complexId=\{complexId\}\s+name=\{v\.name\}\s+region=\{v\.dong\}/);
  assert.match(page, /<ComplexRelatedNews name=\{v\.name\} region=\{v\.dong\} \/>/);
  assert.doesNotMatch(page, /이 단지 AI 분석 받기/, "본문 AI 단추 없음 — 입구는 결과 요약 머리 하나");
  assert.match(read("app/complex/[id]/ComplexInsightView.tsx"), /이 단지 AI 종합 진단 받기 ›/);
  assert.match(page, /historyHref=\{v\.txHref \?\? null\}/);
  assert.doesNotMatch(page, /국토부 실거래 이력 보기/, "본문 중간 카드 없음");
  /* 순서: 실거래(표) → 다요인(Insight) → 탭 → 전월세 → 기록 → 관련 기사 → 인근 단지 → 정비 · 입주 → 전문가 → 읽을거리 → 출처 */
  const order = ["<RecentDealsTable", "<ComplexInsightPanels", "<ComplexHubTabs", "<ComplexRentSection", "<ComplexRecordsSection", "<ComplexRelatedNews", 'id="nearby-complexes"', "<NearbyRedevelopment", "<UpcomingSupply", "<NearbyExperts", "<ComplexReadMore", "<ComplexFactsCard"];
  let last = -1;
  for (const k of order) {
    const i = page.indexOf(k);
    assert.ok(i > last, `순서: ${k}`);
    last = i;
  }
  const rec = strip(read("app/complex/[id]/ComplexRecords.tsx"));
  assert.match(rec, /"use client"/);
  assert.match(rec, /role="tablist"/);
  assert.match(rec, /\{cur\.node\}/, "고른 칸만 마운트(후기 · 토론 청크는 누른 뒤에만)");
  const sec = strip(read("app/complex/[id]/ComplexRecordsSection.tsx"));
  assert.match(sec, /\{name\}에 공개된 임장노트 없음/);
  assert.match(sec, /노트 불러오기 실패 · 잠시 후 다시/);
  assert.doesNotMatch(sec, /btn-primary/, "채움 파랑 없음");
  const near = strip(read("app/complex/[id]/ComplexNearby.tsx"));
  assert.match(near, /6개월 \$\{n\.recent\.toLocaleString\("ko-KR"\)\}건/);
  /* 매트뷰 열 하나 더 — recent_trade_count */
  const store = read("lib/complex/complex-store.ts");
  assert.match(store, /\.select\("complex_name, region_name, address, build_year, recent_trade_count"\)/);
  assert.match(store, /recent_trade_count\?: number \| null;/);
  /* 읽을거리 2 · 2 */
  const rm = read("app/complex/[id]/ComplexReadMore.tsx");
  assert.match(rm, /const GUIDE_SLUGS = \["real-price-reading", "imjang-checklist"\];/);
  assert.match(rm, /const TERM_SLUGS = \["silgeoraega", "jeonse-garyul"\];/);
});

test("④ 홈 — 네이비 검색 띠 · 최근 실거래 6건 · AI 입구 판 없음 · 지역 동향은 사이드바 · 폰 순서(본문 → 사이드바)", () => {
  const home = strip(read("app/page.tsx"));
  assert.doesNotMatch(home, /AIPanel|HomeAiGateway\(|HOME_AI_GATEWAY_TITLE/);
  assert.match(home, /<section className="brand-navy-card flex flex-col gap-3 rounded-2xl[^"]*" aria-label="검색 · 오늘의 시장">/);
  const band = home.slice(home.indexOf('aria-label="검색 · 오늘의 시장"'), home.indexOf("<TopBanner"));
  assert.match(band, /<HomeHeroSearch\s+onDark/);
  assert.match(band, /<HomeTodayLine\s+embedded/);
  assert.match(band, /briefing=\{data\.briefing \? \{ text: data\.briefing\.text, asOfLabel: data\.briefing\.asOfLabel \} : null\}/);
  assert.equal((home.match(/brand-navy-card/g) ?? []).length, 1, "네이비 판은 하나");
  assert.match(home, /listRegionTransactions\(dealsRegion\.id, dealsRegion\.name, 6\)/);
  assert.match(home, /<HomeRecentDeals\s+regionName=\{dealsRegion\.name\}\s+rows=\{recentDeals\}\s+failed=\{recentDealsFailed\}/);
  /* 본문 순서: 내 관심 → 최근 실거래 → 공개 임장노트 → (폰 광고) → 동네 · 뉴스 → 바로가기 · 사이드바: 지역 동향 → 광고 */
  const main = home.slice(home.indexOf('className="order-1 flex flex-col gap-3 lg:gap-4"'), home.indexOf("<HomeTalkSection"));
  let last = -1;
  for (const k of ["<HomeMyRail", "<HomeRecentDeals", "공개 임장노트", '<AdZone placement="home_feed" seed={1}', "<HomeTownBlock", "<HomeHubLinks"]) {
    const i = main.indexOf(k);
    assert.ok(i > last, `본문 순서: ${k}`);
    last = i;
  }
  const aside = home.slice(home.indexOf('className="order-2 flex flex-col gap-3 lg:sticky'), home.indexOf('className="order-1 flex flex-col gap-3 lg:gap-4"'));
  assert.match(aside, /지역 동향/);
  assert.match(aside, /<HomeSeoulMoves data=\{data\.seoulMoves\} \/>/);
  assert.match(aside, /<AdSenseUnit \/>/);
  /* 오늘의 시장 — embedded 는 제 카드 · 워터마크 없음 · 브리핑 슬라이드 */
  const line = strip(read("app/components/home/HomeTodayLine.tsx"));
  assert.match(line, /embedded\s*\?\s*"relative mt-1 border-t border-on-dark-panel pt-3"/);
  assert.match(line, /\{!embedded && \(\s*<svg/);
  assert.match(line, /key: "briefing",[\s\S]*?href: "\/analysis#tier-market"/);
  /* 최근 실거래 판 — 서버 조각 · 실패/0건 문장 · 한 건 금액 그대로 */
  const deals = strip(read("app/components/home/HomeRecentDeals.tsx"));
  assert.doesNotMatch(deals, /"use client"/);
  assert.match(deals, /최근 실거래 불러오기 실패 · 잠시 후 다시/);
  assert.match(deals, /신고된 매매 실거래 없음/);
  assert.match(deals, /data-tone="blue"/);
  /* 지역 신고 행에 region_name 이 실려 단지 주소를 만든다 */
  const store = read("lib/market/store.ts");
  assert.match(store, /\.select\("complex_name,address,contract_ym,contract_day,deal_amount_krw,area_m2,floor,region_name"\)/);
  assert.match(store, /regionName: r\.region_name \? String\(r\.region_name\) : null,/);
});

test("④-2 toHomeDealRows — 단지 주소 · 날짜 · 사양 · 만원 환산", () => {
  const rows = toHomeDealRows(
    [
      { complexName: "공작아파트", contractYm: "202610", contractDay: 16, dealAmountKrw: 630_000_000, areaM2: 36.99, floor: 14, regionName: "경기 안양 동안구" },
      { complexName: "이름만", contractYm: "202609", contractDay: null, dealAmountKrw: 540_000_000, areaM2: null, floor: 0, regionName: null },
    ],
    (region, name) => `/c/${region}/${name}`,
  );
  assert.equal(rows[0].href, "/c/경기 안양 동안구/공작아파트");
  assert.equal(rows[0].date, "2026.10.16");
  assert.equal(rows[0].spec, "37㎡ · 14층");
  assert.equal(rows[0].man, 63_000);
  assert.equal(rows[1].href, null);
  assert.equal(rows[1].date, "2026.09");
  assert.equal(rows[1].spec, "");
  assert.equal(rows[1].man, 54_000);
  assert.notEqual(rows[0].key, rows[1].key);
});
