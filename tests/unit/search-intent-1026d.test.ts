import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bandsLabel,
  hasFilter,
  parseSearchIntent,
  buildNextWords,
  completeWords,
  nameKeys,
  resolveScope,
  scopeQuery,
  type AreaRow,
} from "@/lib/search/query-intent";
import { ghostRest, keywordPhrases } from "@/lib/search/ghost";
import { complexAddressLine, jibunTail } from "@/lib/search/complex-address";

/* [1026d · 검색] 소유자(2026-09-30) "낱말만 쳐도 키워드·조건으로 원하는 아파트나 지역을 찾게, 상세주소·위치를 음영으로".
   배포 전 운영 실측: "마포 신축" · "대치동 대단지" · "잠실 30평대" 모두 "일치하는 단지가 없어요". */

const Y = 2026;

test("조건 — 준공(신축·준신축·구축·재건축·연도·N년 이내)", () => {
  const a = parseSearchIntent("마포 신축", Y);
  assert.deepEqual(a.rest, ["마포"]);
  assert.equal(a.minYear, 2021);
  assert.equal(a.chips[0].label, "신축 · 2021년 이후 준공");
  assert.ok(hasFilter(a));
  const b = parseSearchIntent("준신축", Y);
  assert.equal(b.minYear, 2016);
  assert.equal(b.maxYear, 2020);
  assert.equal(parseSearchIntent("목동 재건축", Y).maxYear, 1996);
  assert.equal(parseSearchIntent("구축", Y).maxYear, 2006);
  assert.equal(parseSearchIntent("2015년 이후", Y).minYear, 2015);
  assert.equal(parseSearchIntent("2010년 이전", Y).maxYear, 2010);
  assert.equal(parseSearchIntent("10년 이내", Y).minYear, 2016);
  assert.equal(parseSearchIntent("30년 이상", Y).maxYear, 1996);
});

test("조건 — 세대·면적·가격·순서", () => {
  const a = parseSearchIntent("대치동 대단지", Y);
  assert.deepEqual(a.rest, ["대치동"]);
  assert.equal(a.minHouseholds, 1000);
  assert.equal(parseSearchIntent("1,500세대 이상", Y).minHouseholds, 1500);
  assert.equal(parseSearchIntent("초대단지", Y).minHouseholds, 3000);

  assert.deepEqual(parseSearchIntent("잠실 30평대", Y).areaBands, ["60-85"]);
  assert.deepEqual(parseSearchIntent("국평", Y).areaBands, ["60-85"]);
  assert.deepEqual(parseSearchIntent("84㎡", Y).areaBands, ["60-85"]);
  assert.deepEqual(parseSearchIntent("24평", Y).areaBands, ["under-60"]);
  assert.deepEqual(parseSearchIntent("40평대", Y).areaBands, ["85-102", "102-135"]);
  assert.equal(bandsLabel(["85-102", "102-135"]), "전용 85~135㎡");

  const p = parseSearchIntent("분당 30평대 10억 이하", Y);
  assert.deepEqual(p.rest, ["분당"]);
  assert.equal(p.maxPrice, 100000);
  assert.deepEqual(p.chips.map((c) => c.token), ["30평대", "10억 이하"], "칩은 검색어 순서");
  assert.deepEqual([parseSearchIntent("5~10억", Y).minPrice, parseSearchIntent("5~10억", Y).maxPrice], [50000, 100000]);
  assert.equal(parseSearchIntent("9억5천 이하", Y).maxPrice, 95000);
  assert.deepEqual([parseSearchIntent("20억대", Y).minPrice, parseSearchIntent("20억대", Y).maxPrice], [200000, 299999]);
  assert.deepEqual([parseSearchIntent("5억대", Y).minPrice, parseSearchIntent("5억대", Y).maxPrice], [50000, 59999]);

  assert.equal(parseSearchIntent("마포구 저렴한 순", Y).sort, "price_asc");
  assert.equal(parseSearchIntent("신축순 마포구", Y).sort, "new");
  assert.equal(parseSearchIntent("신축순 마포구", Y).minYear, undefined, "신축 순은 준공 조건이 아니다");
});

test("반영 안 하는 말 — 적용하지 않고 알려만 준다 · 전세면 매매가로 거르지 않는다", () => {
  const a = parseSearchIntent("마포 역세권 신축", Y);
  assert.deepEqual(a.rest, ["마포"]);
  assert.equal(a.unsupported[0].label, "역세권(반영 안 함)");
  const b = parseSearchIntent("전세 5억 잠실", Y);
  assert.equal(b.maxPrice, undefined);
  assert.equal(b.minPrice, undefined);
  assert.ok(!hasFilter(b));
  assert.deepEqual(b.rest, ["잠실"]);
});

test("이름 검색은 그대로 — 조건이 없으면 원문 낱말, 군말만 뺀다", () => {
  assert.deepEqual(parseSearchIntent("공작아파트", Y).rest, ["공작아파트"]);
  assert.deepEqual(parseSearchIntent("잠실 주공 5단지", Y).rest, ["잠실", "주공", "5단지"]);
  assert.deepEqual(parseSearchIntent("헬리오시티 실거래", Y).rest, ["헬리오시티"]);
  assert.deepEqual(parseSearchIntent("아파트", Y).rest, ["아파트"], "군말만 있으면 그대로");
  assert.ok(!hasFilter(parseSearchIntent("래미안", Y)));
  assert.deepEqual(parseSearchIntent("래미안30평대", Y).rest, ["래미안"]);
});

const row = (o: Partial<AreaRow> & Pick<AreaRow, "kind" | "label" | "shortLabel" | "regions">): AreaRow => ({
  areaKey: o.label,
  dong: null,
  complexCount: 10,
  recentTradeCount: 10,
  lat: 37.5,
  lng: 127,
  matchToken: null,
  matchRank: 3,
  ...o,
});

test("지역 해석 — 시군구·읍면동·좁히기·이름 남기기", () => {
  const mapoGu = row({ kind: "sigungu", label: "서울 마포구", shortLabel: "마포구", regions: ["서울 마포구"], matchToken: "마포", matchRank: 2, recentTradeCount: 974 });
  const mapoDong = row({ kind: "dong", label: "서울 마포구 마포동", shortLabel: "마포동", regions: ["서울 마포구"], dong: "마포동", matchToken: "마포", matchRank: 2, recentTradeCount: 7 });
  const r1 = resolveScope(["마포"], [mapoDong, mapoGu]);
  assert.equal(r1.scope?.label, "서울 마포구", "같은 확실도면 시군구가 먼저");
  assert.equal(r1.scope?.rank, 2);

  const seoul = row({ kind: "sido", label: "서울특별시", shortLabel: "서울", regions: ["서울 마포구", "서울 송파구"], matchToken: "서울" });
  const guFull = { ...mapoGu, matchToken: "마포구", matchRank: 3 };
  const ahyeon = row({ kind: "dong", label: "서울 마포구 아현동", shortLabel: "아현동", regions: ["서울 마포구"], dong: "아현동", matchToken: "아현동" });
  const r2 = resolveScope(["서울", "마포구", "아현동"], [seoul, guFull, ahyeon]);
  assert.equal(r2.scope?.label, "서울 마포구 아현동");
  assert.equal(r2.scope?.dong, "아현동");
  assert.deepEqual(r2.nameTokens, []);

  const r3 = resolveScope(["마포", "래미안"], [mapoGu]);
  assert.equal(r3.scope?.label, "서울 마포구");
  assert.deepEqual(r3.nameTokens, ["래미안"]);

  /* 앞글자 일치(rank 1)는 범위로 쓰지 않는다 */
  const pre = row({ kind: "dong", label: "서울 송파구 잠실동", shortLabel: "잠실동", regions: ["서울 송파구"], dong: "잠실동", matchToken: null, matchRank: 1 });
  assert.equal(resolveScope(["잠"], [pre]).scope, null);
});

test("다시 검색할 말", () => {
  assert.equal(scopeQuery({ kind: "sigungu", label: "서울 마포구", shortLabel: "마포구", dong: null }), "마포구");
  assert.equal(scopeQuery({ kind: "sigungu", label: "서울 중구", shortLabel: "중구", dong: null }), "서울 중구");
  assert.equal(scopeQuery({ kind: "dong", label: "서울 송파구 잠실동", shortLabel: "잠실동", dong: "잠실동" }), "송파구 잠실동");
  assert.equal(scopeQuery({ kind: "sido", label: "서울특별시", shortLabel: "서울", dong: null }), "서울");
});

/* [1026e · 연관 검색어] 운영 DB search_next_words("서울 마포구") 실측 행(2026-10-01) 일부 */
const MAPO_ROWS = [
  { kind: "total", word: "", cnt: 334 },
  { kind: "cond", word: "new5", cnt: 23 },
  { kind: "cond", word: "semi10", cnt: 24 },
  { kind: "cond", word: "old30", cnt: 24 },
  { kind: "cond", word: "big1000", cnt: 19 },
  { kind: "cond", word: "u60", cnt: 132 },
  { kind: "cond", word: "m85", cnt: 186 },
  { kind: "cond", word: "l135", cnt: 101 },
  { kind: "cond", word: "p_u5", cnt: 20 },
  { kind: "cond", word: "p_u10", cnt: 119 },
  { kind: "cond", word: "p_o15", cnt: 67 },
  { kind: "dong", word: "망원동", cnt: 72 },
  { kind: "dong", word: "성산동", cnt: 37 },
  { kind: "dong", word: "아현동", cnt: 16 },
  { kind: "dong", word: "신수동", cnt: 15 },
  { kind: "dong", word: "신공덕동", cnt: 16 },
  { kind: "brand", word: "래미안", cnt: 20 },
  { kind: "brand", word: "자이", cnt: 12 },
];

test("1026e 연관 검색어 — 다음 낱말: 종류를 섞고, 0곳·전부·이미 건 조건은 뺀다", () => {
  const { total, words } = buildNextWords(MAPO_ROWS, parseSearchIntent("마포", Y));
  assert.equal(total, 334);
  assert.deepEqual(
    words.slice(0, 6).map((w) => `${w.word}:${w.count}`),
    ["신축:23", "망원동:72", "대단지:19", "래미안:20", "성산동:37", "30평대:186"],
  );
  assert.equal(words.find((w) => w.word === "아현동")?.label, "동네");
  /* 이미 준공 조건을 걸었으면 준공 낱말(신축·준신축·재건축)은 권하지 않는다 */
  const withNew = buildNextWords(MAPO_ROWS, parseSearchIntent("마포 신축", Y)).words.map((w) => w.word);
  assert.ok(!withNew.includes("신축") && !withNew.includes("준신축") && !withNew.includes("재건축"));
  assert.ok(withNew.includes("대단지"));
  /* 묶음을 줄이지 못하면(전부 = total) 권하지 않는다 */
  const all = buildNextWords([{ kind: "total", word: "", cnt: 5 }, { kind: "cond", word: "new5", cnt: 5 }, { kind: "cond", word: "big1000", cnt: 0 }], parseSearchIntent("x", Y));
  assert.deepEqual(all.words, []);
  /* 이미 친 낱말(동네)은 다시 권하지 않는다 */
  assert.ok(!buildNextWords(MAPO_ROWS, parseSearchIntent("마포 망원동", Y)).words.some((w) => w.word === "망원동"));
  /* 여러 곳에 있는 시군구 이름은 시도를 붙인다 */
  const sgg = buildNextWords([{ kind: "total", word: "", cnt: 50 }, { kind: "sgg", word: "서울 중구", cnt: 3 }, { kind: "sgg", word: "서울 서초구", cnt: 22 }], parseSearchIntent("래미안", Y));
  assert.deepEqual(sgg.words.map((w) => w.word), ["서초구", "서울 중구"]);
});

test("1026e 연관 검색어 — 낱말 완성 · 검색어 줄 · 이름 묶음", () => {
  const { words } = buildNextWords(MAPO_ROWS, parseSearchIntent("마포", Y));
  assert.deepEqual(completeWords(words, "신").map((w) => w.word), ["신축", "신공덕동", "신수동"], "조건 낱말이 먼저 · 동네는 단지 많은 순");
  assert.deepEqual(completeWords(words, "래").map((w) => w.word), ["래미안"]);
  assert.deepEqual(completeWords(words, "30").map((w) => w.word), ["30평대"]);
  assert.deepEqual(completeWords(words, "신축"), [], "다 친 낱말은 완성하지 않는다");

  const next = [{ word: "신축", label: "조건", count: 23 }, { word: "아현동", label: "동네", count: 16 }];
  const comp = [{ word: "래미안", label: "브랜드", count: 20 }];
  assert.deepEqual(keywordPhrases("마포 ", "마포", next, comp).map((k) => k.q), ["마포 신축", "마포 아현동"], "띄어 쓰면 다음 낱말");
  assert.deepEqual(keywordPhrases("마포 래", "마포 래", next, comp).map((k) => k.q), ["마포 래미안"], "덜 친 낱말은 완성");
  assert.deepEqual(keywordPhrases("마포 신", "마포", next, comp), [], "받아 온 검색어와 지금 입력이 다르면 쓰지 않는다");
  assert.deepEqual(keywordPhrases("마포", "마포", next, comp), [], "한 낱말이면 완성 없음(지역·단지 줄이 맡는다)");
  /* 음영 자동완성은 띄어 쓴 뒤에도 연관 검색어로 잇는다 */
  assert.equal(ghostRest("마포 ", ["마포 신축", "마포구"]), "신축");
  assert.equal(ghostRest("마포 래", ["마포 래미안"]), "미안");

  assert.deepEqual(nameKeys(["공작아파트", "래미안"]), ["공작", "래미안"]);
});

test("음영 자동완성 · 음영 주소 줄", () => {
  assert.equal(ghostRest("헬리", ["헬리오시티", "헬리오스빌"]), "오시티");
  assert.equal(ghostRest("마포", ["마포구", "마포래미안푸르지오1단지"]), "구");
  assert.equal(ghostRest("마포 ", ["마포구"]), "", "띄어 쓴 뒤에는 그 말로 시작하는 후보만 잇는다");
  assert.equal(ghostRest("공작", ["관양동 공작"]), "", "앞글자가 다르면 없음");
  assert.equal(jibunTail("마포구 아현동 777"), "아현동 777");
  assert.equal(jibunTail("세종시 산울동 가-"), "산울동");
  assert.equal(
    complexAddressLine({ region: "서울 송파구", address: "서울 송파구 가락동 913", roadAddress: "서울특별시 송파구 송파대로 345" }),
    "서울 송파구 송파대로 345 (가락동 913)",
  );
  assert.equal(complexAddressLine({ region: "오산시", address: "오산시 오산동 861-4", roadAddress: null }), "오산시 오산동 861-4");
  assert.equal(complexAddressLine({ region: "서울 마포구", address: null, roadAddress: null }), "");
});

test("배선 — 두 API 가 검색어를 먼저 읽고, 네 검색창이 범위·지역·음영 줄을 그린다", () => {
  const suggest = readFileSync("app/api/search/suggest/route.ts", "utf8");
  const unified = readFileSync("app/api/search/unified/route.ts", "utf8");
  for (const src of [suggest, unified]) {
    assert.match(src, /planSearch\(rawQ\)/);
    assert.match(src, /runFilteredSearch\(/);
    assert.match(src, /intent: intentInfo\(plan,/);
    assert.match(src, /areas: plan\.areas/);
  }
  const panel = readFileSync("app/search/UnifiedSuggestPanel.tsx", "utf8");
  assert.match(panel, /<ScopeBar/);
  assert.match(panel, /<ComplexShade/);
  assert.match(panel, /<RelatedChips/);
  for (const f of ["app/components/HeaderSearch.tsx", "app/components/home/HomeHeroSearch.tsx", "app/search/search-client.tsx", "app/map/MapSearchBox.tsx"]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /ghostRest\(/, `${f} 음영 자동완성`);
    assert.match(src, /e\.key === "Tab"/, `${f} Tab 으로 채움`);
  }
  /* 헤더(전 페이지 첫 묶음)는 그리는 부분을 동적 청크로 */
  assert.match(readFileSync("app/components/HeaderSearch.tsx", "utf8"), /dynamic\(loadGhost/);
  /* DB — 거울 파일 */
  const mig = readFileSync("supabase/migrations/20260930225407_1026d_search_intent.sql", "utf8");
  for (const fn of ["search_areas", "search_complexes_filtered", "search_complex_facets", "search_complexes_preview_addr"]) {
    assert.match(mig, new RegExp(`grant execute on function public\\.${fn}\\(`));
  }
  assert.ok(!mig.endsWith("\n"), "원장 원문과 같은 바이트(끝 줄바꿈 없음)");
});

test("보강 — 동네로 좁히기 · 정렬 · 더 보기(쪽 넘김) · 이름 검색 먼저 시작", () => {
  const unified = readFileSync("app/api/search/unified/route.ts", "utf8");
  const suggest = readFileSync("app/api/search/suggest/route.ts", "utf8");
  assert.match(unified, /searchParams\.get\("kids"\) === "1"/);
  assert.match(unified, /children: await childrenP/);
  assert.match(suggest, /searchParams\.get\("offset"\)/);
  for (const src of [unified, suggest]) assert.match(src, /preParse\(rawQ\)/);
  const client = readFileSync("app/search/search-client.tsx", "utf8");
  assert.match(client, /&cx=20&kids=1/);
  assert.match(client, /동네로 좁히기/);
  assert.match(client, /aria-label="정렬"/);
  assert.match(client, /limit=20&offset=\$\{results\.complexes\.length\}/);
  const mig = readFileSync("supabase/migrations/20260930232454_1026d_search_area_children.sql", "utf8");
  assert.match(mig, /grant execute on function public\.search_area_children\(/);
  assert.ok(!mig.endsWith("\n"));
  /* 정렬 낱말은 해석기가 알아듣는 말이어야 한다 */
  for (const [w, k] of [["신축 순", "new"], ["저렴한 순", "price_asc"], ["비싼 순", "price_desc"], ["세대 많은 순", "households"]] as const) {
    assert.equal(parseSearchIntent(`마포구 ${w}`, Y).sort, k, w);
  }
});

test("보강 — 지역·조건으로 쓴 낱말은 단지 이름에서 칠하지 않는다", async () => {
  const { nameHighlightQuery } = await import("@/lib/search/name-highlight");
  const base = { unsupported: [], total: 1 };
  assert.equal(
    nameHighlightQuery("마포 신축", { ...base, mode: "filter", scope: { label: "서울 마포구", kind: "sigungu", q: "마포구", lat: null, lng: null }, chips: [{ key: "year", label: "신축", token: "신축" }] }),
    "",
  );
  assert.equal(
    nameHighlightQuery("래미안 30평대", { ...base, mode: "filter", scope: null, chips: [{ key: "area", label: "30평대", token: "30평대" }] }),
    "래미안",
  );
  assert.equal(nameHighlightQuery("헬리오", { ...base, mode: "name", scope: null, chips: [] }), "헬리오");
});

test("1026e 배선 — API 가 next · complete · related 를 싣고, 네 검색창이 검색어 줄을 그린다", () => {
  for (const f of ["app/api/search/suggest/route.ts", "app/api/search/unified/route.ts"]) {
    assert.match(readFileSync(f, "utf8"), /loadSuggestWords/, f);
  }
  const server = readFileSync("lib/search/intent-server.ts", "utf8");
  assert.match(server, /sb\.rpc\("search_next_words"/);
  assert.match(server, /export function headPlan/);
  for (const f of ["app/components/HeaderSearch.tsx", "app/components/home/HomeHeroSearch.tsx", "app/map/MapSearchBox.tsx", "app/search/search-client.tsx"]) {
    assert.match(readFileSync(f, "utf8"), /keywordPhrases\(/, f);
  }
  assert.match(readFileSync("app/search/UnifiedSuggestPanel.tsx", "utf8"), /onKeyword\?\.\(/);
  const mig = readFileSync("supabase/migrations/20261001054257_1026e_search_next_words.sql", "utf8");
  assert.match(mig, /grant execute on function public\.search_next_words\(/);
  assert.ok(!mig.endsWith("\n"));
  /* 속도 — 단지별 검색 값을 미리 모은 표를 두 함수가 읽는다(서울 전체·30평대 2,028ms → 75ms) */
  const mv = readFileSync("supabase/migrations/20261001060232_1026e_search_complex_mv.sql", "utf8");
  assert.match(mv, /create materialized view if not exists market_agg\.search_complex_mv/);
  assert.match(mv, /refresh materialized view concurrently market_agg\.search_complex_mv/);
  for (const fn of ["search_complexes_filtered", "search_next_words"]) {
    assert.match(mv, new RegExp(`grant execute on function public\\.${fn}\\(`), fn);
  }
  assert.ok(!mv.endsWith("\n"));
});
