/* [1102] 소유자 2026-11-03 "전체적으로 괜찮아 보여 · 지도는 필터 등 수정교정검토해 줘" → "잔여 페이지도 작업해 줘".
 *  지도 — 매매·전세·월세는 보기 방식(필터 수 · 요약 · 초기화에 안 셈) · 패널 "거래유형 (매물)" 줄 없음 · 요약은 필터 단추 뒤(폰) · PC 머리줄엔 요약 없음 ·
 *        반경 크기 · 중심은 반경 카드 안 · 기호(◎ ↔ ✕ ⌕ ≤) → 낱말 · 아이콘 · 단지 조건은 화면 단지 0곳이면 접기 · 등록 매물 조건은 따로 접는 묶음 ·
 *        고른 칩은 옅은 채움 · 줌 탭은 검색 칸 아래(128) · 해요체 → 사실 낱말.
 *  잔여 화면 — 단지 비교 폰 표(옆 밀기 없이) · 전세가율 · 시장 온도 결론과 같은 칸 걷기 · 전월세 0행이면 목록 접기 · 지역 탭 전월세 칸은 자료 있을 때만 ·
 *        공매 "표시 중" 칸 · 동 화면 단지별 거래 먼저 · 계산기 전환 줄 걷기 · 검색 지도 알약 중복 · 단지 목록 폰 칩 한 줄 · 리포트 중복 수 · 실매물 0건 칩 · 뉴스 0 수. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarizeMapFilters } from "../../lib/map/filter-summary";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

test("지도 필터 — 매매·전세·월세는 보기 방식 · 배지 수 = 요약 토막 수 · 초기화는 보기 방식을 안 바꾼다", () => {
  const m = strip(read("app/map/map-client.tsx"));
  assert.match(m, /summarizeMapFilters\(\{\s*tradeKey: "all",/, "세그먼트는 요약에 안 들어간다");
  assert.match(m, /const activeCount = filterSummary\.length;\s*const filterActive = activeCount > 0;/);
  const reset = m.slice(m.indexOf("const resetFilters = useCallback"), m.indexOf("}, []);", m.indexOf("const resetFilters = useCallback")));
  assert.doesNotMatch(reset, /setListingTradeKey/, "초기화가 매매·전세·월세를 바꾸지 않는다");
  assert.doesNotMatch(m, /label="거래유형 \(매물\)"/, "패널에 같은 말 한 번 더 없음");
  assert.match(m, /const listingTradeRef = useRef\(topTradeKey\);/, "매물 거래유형 = 세그먼트");
  assert.match(m, /const listingFilterNarrowed = listingDetailFilterActive \|\| rangeActive;/);
  /* 출퇴근 요약은 칩과 같은 낱말 */
  assert.deepEqual(
    summarizeMapFilters({ tradeKey: "all", propertyKindKey: "all", roomsKey: "all", bathroomsKey: "all", parkingKey: "all", commuteKey: "45", ranges: { price: [null, null], area: [null, null], year: [null, null], households: [null, null] } }),
    ["출퇴근 45분 이내"],
  );
});

test("지도 칩 줄 — 요약은 필터 단추 뒤 · PC 머리줄엔 없음 · 반경 크기는 카드 안 · 기호 없음", () => {
  const raw = read("app/map/map-client.tsx");
  const m = strip(raw);
  const bar = m.slice(m.indexOf("const filterBar = ("), m.indexOf("const cxMatchCount = useMemo"));
  assert.ok(bar.indexOf('data-tour="map-filter"') < bar.indexOf("map-filter-summary"), "요약은 필터 단추 뒤");
  assert.match(bar, /className="map-filter-summary t-caption lg:hidden"/);
  assert.doesNotMatch(bar, /개 적용/, "배지와 같은 수를 글로 또 적지 않는다");
  assert.doesNotMatch(bar, /RADIUS_PRESETS|중심 해제/, "반경 크기 · 중심은 카드에");
  assert.match(m, /role="group" aria-label="반경 크기">\s*\{RADIUS_PRESETS\.map/);
  for (const g of ["◎", "↔", "⌕", "≤"]) assert.ok(!m.includes(g), `기호 ${g}`);
  assert.match(m, /aria-label="필터 닫기"[\s\S]{0,200}<Icon name="x" size=\{18\} \/>/);
  assert.match(m, /<div className="hidden w-\[280px\] min-w-\[160px\] md:block">/, "PC 검색 칸 하한");
  /* [1103] 폰 줌 탭은 검색 칸과 같은 줄(82) — 검색 칸 초점 동안 비킨다 */
  assert.match(m, /className=\{`glass absolute right-4 z-30 -mt-\[10px\] flex items-center gap-0\.5 rounded-full p-1 md:right-5 md:mt-0 md:translate-y-9 xl:hidden \$\{phoneSearchFocus \? "max-md:pointer-events-none max-md:opacity-0" : ""\}/);
  /* 해요체 */
  for (const s of ["옮겨요", "찍혀요", "기준이에요", "옮겨져요", "모아 보여요", "불러와요", "않을 수 있어요"]) assert.ok(!m.includes(s), s);
});

test("지도 패널 — 단지 조건 0곳 접기 · 등록 매물 조건 묶음 · 마커 표시는 레이어 절 · 고른 칩 옅은 채움 · 닫는 단추 문구", () => {
  const m = strip(read("app/map/map-client.tsx"));
  assert.match(m, /\{\(cxc\.total > 0 \|\| cxOn\) && \(/);
  assert.match(m, /<details\s+className="group border-t border-line pt-1"\s+open=\{showListings \|\| listingDetailFilterActive\}/);
  assert.match(m, /<span className="t-body font-bold text-ink">등록 매물 조건<\/span>/);
  assert.match(m, /label="건물 유형"/);
  const layer = m.indexOf('id="map-layer-section"');
  assert.ok(m.indexOf('label="마커에 표시"') > layer, "마커 표시는 레이어 절");
  const chip = m.slice(m.indexOf("function FilterChipGroup"), m.indexOf("export type RegionMarker"));
  assert.match(chip, /\? "bg-primary-soft font-bold text-primary"/);
  assert.doesNotMatch(chip, /bg-primary text-white/);
  assert.match(m, /\{filteredDanji\.length > 0 \? `단지 \$\{filteredDanji\.length\.toLocaleString\("ko-KR"\)\}곳 보기` : "지도 보기"\}/);
  assert.match(m, /<p className="-mt-1 t-caption text-text-3">단지 = 국토교통부 실거래 · 값 없는 단지는 조건을 걸면 제외<\/p>/);
  assert.match(read("app/map/HistogramRangeSlider.tsx"), /값 있는 단지 \{available\.toLocaleString\("ko-KR"\)\} \/ 화면 \{total\.toLocaleString\("ko-KR"\)\}/);
});

test("잔여 화면 — 단지 비교 폰 표 · 전세가율 · 시장 온도 · 전월세 · 지역 탭 · 공매", () => {
  const cmp = strip(read("app/complex/compare/[slug]/page.tsx"));
  assert.match(cmp, /<table className="w-full t-body md:min-w-\[420px\]">/);
  assert.match(cmp, /<table className="w-full text-left t-body md:min-w-\[460px\]">/);
  assert.doesNotMatch(cmp, /className="w-full min-w-\[4[26]0px\]/);
  /* [1105] 폰 항목 줄은 그대로(값 위 한 줄) — 다만 보이는 글일 뿐이라 aria-hidden · td(예전 th scope=colgroup 은 아래 값 전부의 열 머리로 읽혔다).
     colSpan 은 폰에도 남긴 폭 0 칸(행 머리 · 차이)까지 덮는 3 · 4. 연결은 행 머리 th + headers(tests/unit/a11y-1105) */
  assert.match(cmp, /<tr className="md:hidden" aria-hidden="true">\s*<td colSpan=\{3\}/);
  assert.match(cmp, /<tr className="md:hidden" aria-hidden="true">\s*<td colSpan=\{4\}/);
  assert.doesNotMatch(cmp, /scope="colgroup"/);
  const gap = strip(read("app/analysis/gap/GapScreener.tsx"));
  assert.doesNotMatch(gap, /조건에 맞는 곳<\/span>|가장 높은 곳<\/span>|전세가율 중앙값/);
  assert.match(gap, /가장 낮은 곳<\/span>/);
  assert.doesNotMatch(strip(read("app/analysis/gap/page.tsx")), /\{rows\.length\}곳<\/span>/);
  const tmp = strip(read("app/analysis/temperature/TempMapClient.tsx"));
  assert.doesNotMatch(tmp, /평균 온도<\/span>|가장 뜨거운 곳<\/span>|가장 차가운 곳<\/span>|지난주 대비<\/span>/);
  assert.match(tmp, /내 관심 지역<\/span>/);
  assert.match(strip(read("app/rent/page.tsx")), /\{counts !== null && total === 0 \? \(/);
  assert.match(strip(read("app/components/region/RegionTabs.tsx")), /const hasRent = isSudogwonRegion\(info\) && \(await hasAnyNonAptRent\(\)\);/);
  const any = read("lib/rent/any-rows.ts");
  assert.match(any, /revalidate: 604_800,/, "지역 화면 ISR(7일)보다 짧지 않게");
  assert.ok(!read("app/components/region/RegionTabs.tsx").includes("region-counts"), "6시간 캐시 모듈을 끌고 오지 않는다");
  const rentRail = strip(read("app/rent/[region]/page.tsx"));
  assert.doesNotMatch(rentRail, /label: "동네 홈"|label: "시장 데이터"/, "탭과 같은 링크 없음");
  const auc = strip(read("app/auctions/AuctionsClient.tsx"));
  assert.doesNotMatch(auc, /\{ k: "표시 중"/);
});

test("잔여 화면 — 동 화면 순서 · 계산기 · 검색 · 단지 목록 · 리포트 · 실매물 · 뉴스 · 문구", () => {
  const dong = strip(read("app/dong/[region]/[dong]/page.tsx"));
  assert.ok(dong.indexOf(">단지별 거래<") < dong.indexOf(">월별 매매 신고<"), "단지별 거래가 먼저");
  assert.match(dong, /last12\.filter\(\(m\) => !\(m\.open && m\.count === 0\)\)/);
  const calc = strip(read("app/calculator/calculator-client.tsx"));
  assert.doesNotMatch(calc, /<Segmented|RealEstateTools|대출·수익률/);
  assert.match(calc, /title="대출 계산기"/);
  assert.match(calc, /window\.location\.replace\("\/calculator\/jeonse-monthly"\)/, "예전 주소는 전월세 전환으로");
  const search = strip(read("app/search/search-client.tsx"));
  assert.match(search, /\{hasQuery && results\.complexes\.length === 0 && \(/);
  assert.ok(!search.includes("⌕"));
  const browse = strip(read("app/complex/browse/page.tsx"));
  assert.match(browse, /max-md:flex-nowrap max-md:overflow-x-auto/);
  assert.doesNotMatch(browse, /지도에서 보기|임장노트 쓰기/);
  assert.doesNotMatch(strip(read("app/reports/(index)/page.tsx")), /최신 \{formatYmKo\(latest\.ym\)\}/);
  assert.doesNotMatch(strip(read("app/reports/[ym]/page.tsx")), /srContext="같은 지역 전월보다"/);
  assert.match(strip(read("app/listings/ListingsListClient.tsx")), /\{\(items\.length > 0 \|\| Boolean\(filter\.type\)\) && \(/);
  const pi = strip(read("app/town/news/[id]/PostInteractions.tsx"));
  assert.match(pi, /도움돼요\{count > 0 \? ` \$\{count\}` : ""\}/);
  for (const [p, s] of [
    ["app/decide/DecideClient.tsx", "나와요"],
    ["app/decide/DecideClient.tsx", "그려요"],
    ["app/notes/compare/page.tsx", "비교할 수 있어요"],
    ["app/analysis/timing/TimingClient.tsx", "계산할 수 없어요"],
    ["app/journey/JourneyBoard.tsx", "완료 →"],
  ] as const) assert.ok(!read(p).includes(s), `${p} ${s}`);
});
