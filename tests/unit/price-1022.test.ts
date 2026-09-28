/**
 * [1022 · 면적대별 검색·비교] 면적대별 실거래가(/analysis/price) — 지시 2 "검색기능 + 타 단지 비교".
 *
 * ① 지역 검색 걸러내기(filterRegions) — 같은 배열, 공백·대소문자 무시, 앞 일치 우선.
 * ② 비교 선택 — ?cmp= 파싱/쓰기(다른 파라미터 보존) · localStorage 파싱 · 담기/빼기(최대 4 · 중복 없음).
 * ③ 표 한 행 — /api/complex/[id]/detail 응답의 areaBands 만 옮겨 적는다(없는 칸 null · 최근 거래월 = 가장 늦은 달).
 * ④ 소스 구조 — 셀렉트 없음 · 콤보박스 · replaceState 만 · 새 API 없음 · 채움 파랑 없음 · CSS 블록은 파일 끝쪽.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  COMPARE_BAND_LABELS,
  COMPARE_MAX,
  addCompareId,
  compareRowFromDetail,
  filterRegions,
  parseCompareParam,
  parseStoredIds,
  removeCompareId,
  withCompareParam,
  ymDot,
} from "@/app/analysis/price/price-search-model";
import { AREA_BANDS } from "@/lib/market/bands";

const REGIONS = [
  { slug: "seoul-gangnam", name: "서울 강남구", txCount: 1200 },
  { slug: "seoul-gangdong", name: "서울 강동구", txCount: 800 },
  { slug: "seoul-gangseo", name: "서울 강서구", txCount: 700 },
  { slug: "gyeonggi-seongnam-bundang", name: "경기 성남시 분당구", txCount: 900 },
  { slug: "busan-haeundae", name: "부산 해운대구", txCount: 300 },
];

test("지역 검색 — 빈 입력은 앞에서 limit 개 · 공백·대소문자 무시 · 시군구만 쳐도 앞 일치 · 슬러그도 된다 · 없으면 빈 목록", () => {
  assert.equal(filterRegions(REGIONS, "", 3).length, 3);
  assert.deepEqual(
    filterRegions(REGIONS, "강").map((r) => r.slug),
    ["seoul-gangnam", "seoul-gangdong", "seoul-gangseo"],
  );
  assert.deepEqual(filterRegions(REGIONS, "강남구").map((r) => r.name), ["서울 강남구"]);
  assert.deepEqual(filterRegions(REGIONS, "서울 강 남").map((r) => r.name), ["서울 강남구"], "공백은 무시");
  assert.deepEqual(filterRegions(REGIONS, "분당").map((r) => r.name), ["경기 성남시 분당구"]);
  assert.deepEqual(filterRegions(REGIONS, "Bundang").map((r) => r.slug), ["gyeonggi-seongnam-bundang"], "슬러그·대소문자");
  assert.deepEqual(filterRegions(REGIONS, "해운"), [REGIONS[4]]);
  assert.deepEqual(filterRegions(REGIONS, "제주"), []);
  /* 앞 일치가 뒤쪽 일치보다 먼저 — "남" 은 강남구(부분) 만 */
  assert.deepEqual(filterRegions(REGIONS, "성남").map((r) => r.name), ["경기 성남시 분당구"]);
});

test("비교 선택 — ?cmp= 파싱(중복·공백·이상한 조각 제거 · 최대 4) 과 쓰기(다른 파라미터 보존 · 비면 뗀다)", () => {
  assert.deepEqual(parseCompareParam("?region=seoul-gangnam&cmp=a1,b2, a1 ,c3,,d4,e5"), ["a1", "b2", "c3", "d4"]);
  assert.deepEqual(parseCompareParam("region=x"), []);
  assert.deepEqual(parseCompareParam("?cmp=%3Cscript%3E,kapt.A123,ok_id-1"), ["kapt.A123", "ok_id-1"], "id 문자만");
  assert.equal(withCompareParam("?region=seoul-gangnam", ["a1", "b2"]), "?region=seoul-gangnam&cmp=a1%2Cb2");
  assert.equal(withCompareParam("?region=seoul-gangnam&cmp=a1", []), "?region=seoul-gangnam");
  assert.equal(withCompareParam("?cmp=a1", []), "", "남는 파라미터가 없으면 빈 문자열");
  assert.deepEqual(parseCompareParam(withCompareParam("", ["a1", "b2"])), ["a1", "b2"], "쓴 것을 다시 읽으면 같다");
});

test("비교 선택 — localStorage 파싱은 깨진 값에 빈 목록 · 담기는 최대 4·중복 없음 · 빼기", () => {
  assert.deepEqual(parseStoredIds(null), []);
  assert.deepEqual(parseStoredIds("not json"), []);
  assert.deepEqual(parseStoredIds('{"a":1}'), []);
  assert.deepEqual(parseStoredIds('["a1", 3, "b2", "a1"]'), ["a1", "b2"]);
  assert.equal(COMPARE_MAX, 4);
  let ids: string[] = [];
  for (const id of ["a", "b", "b", "c", "d", "e"]) ids = addCompareId(ids, id);
  assert.deepEqual(ids, ["a", "b", "c", "d"], "다섯 번째는 담기지 않는다");
  assert.deepEqual(removeCompareId(ids, "b"), ["a", "c", "d"]);
  assert.deepEqual(removeCompareId(ids, "zz"), ids);
  assert.deepEqual(addCompareId(["a"], "  "), ["a"]);
});

test("표 한 행 — detail 응답의 areaBands 만 옮겨 적는다: 라벨로 5칸 맞춤 · 없는 칸 null · 최근 거래월은 가장 늦은 달", () => {
  assert.deepEqual(COMPARE_BAND_LABELS, AREA_BANDS.map((b) => b.label));
  const row = compareRowFromDetail("id1", {
    complex: { name: "헬리오시티", city: "서울", district: "송파구" },
    areaBands: [
      { label: "60~85㎡", count: 42, latestManwon: 289_000, latestYm: "202608", avgManwon: 275_000 },
      { label: "~59㎡", count: 7, latestManwon: 190_000, latestYm: "202606", avgManwon: 185_000 },
      { label: "135㎡~", count: 1, latestManwon: 0, latestYm: "202601", avgManwon: 0 },
    ],
    mode: "db",
  })!;
  assert.ok(row);
  assert.equal(row.name, "헬리오시티");
  assert.equal(row.region, "서울 송파구");
  assert.equal(row.cells.length, 5);
  assert.equal(row.cells[0]?.latestText, "19억");
  assert.equal(row.cells[0]?.count, 7);
  assert.equal(row.cells[1]?.latestText, "28.9억");
  assert.equal(row.cells[1]?.avgText, "27.5억");
  assert.equal(row.cells[2], null, "응답에 없는 면적대는 null");
  assert.equal(row.cells[3], null);
  assert.equal(row.cells[4], null, "최근가 0 은 값이 아니다");
  assert.equal(row.latestLabel, "2026.08");
  /* 단지를 못 찾았으면 행이 없다 · 이름이 비면 넘겨받은 이름 */
  assert.equal(compareRowFromDetail("x", { complex: null, areaBands: [], mode: "not_found" }), null);
  assert.equal(compareRowFromDetail("x", { complex: { name: "" }, areaBands: [] }, "래미안")?.name, "래미안");
  assert.equal(compareRowFromDetail("x", { complex: { name: "A" }, areaBands: null })?.latestLabel, null);
  assert.equal(ymDot("202607"), "2026.07");
  assert.equal(ymDot(""), null);
});

/** 주석은 걷고 본다 */
async function src(rel: string): Promise<string> {
  const raw = await readFile(new URL(`../../${rel}`, import.meta.url), "utf8");
  return rel.endsWith(".css") ? raw : raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("소스 구조 — 지역 검색은 콤보박스(셀렉트 없음) · 같은 이동 규칙 · 비교는 ComplexPicker+detail API · replaceState 만 · 새 API 없음", async () => {
  const sel = await src("app/analysis/price/RegionSelect.tsx");
  assert.ok(!sel.includes("<select"), "셀렉트는 걷었다");
  assert.ok(sel.includes('role="combobox"') && sel.includes('role="listbox"'), "검색형 입력");
  assert.ok(sel.includes("filterRegions("), "걸러내기는 순수 함수");
  assert.ok(sel.includes("router.push(`/analysis/price?region=${encodeURIComponent(slug)}"), "경로 규칙 그대로");
  assert.ok(sel.includes("isComposing"), "한글 조합 중 키는 가로채지 않는다");

  const cmp = await src("app/analysis/price/CompareComplexes.tsx");
  assert.ok(cmp.includes("<ComplexPicker"), "단지 검색은 기존 선택기");
  assert.ok(cmp.includes("/api/complex/${encodeURIComponent(id)}/detail"), "면적대별 실거래는 기존 detail API 의 areaBands");
  assert.ok(cmp.includes("history.replaceState") && !cmp.includes("router.push") && !cmp.includes("router.replace"), "URL 은 replaceState 만");
  assert.ok(cmp.includes("localStorage.setItem(COMPARE_STORAGE_KEY"), "localStorage 저장");
  assert.ok(cmp.includes("useHumanGate") && cmp.includes("isBotBrowser()"), "사람일 때만 읽는다");
  assert.ok(cmp.includes("읽는 중") && cmp.includes("다시 읽기"), "로딩·실패 상태");
  assert.ok(cmp.includes("complexHrefFromId(id)"), "단지 보기 링크");
  assert.ok(!cmp.includes("btn-primary"), "채움 파랑 버튼 없음");
  assert.ok(cmp.includes("COMPARE_BAND_LABELS.map"), "열 = 면적대 5칸");

  const page = await src("app/analysis/price/page.tsx");
  assert.ok(page.includes("<CompareComplexes"), "선반 아래 비교 카드");
  assert.ok(page.includes("export const revalidate = 86_400;") && page.includes("noIndex: true"), "데이터 정책 그대로");
  const shelf = await src("app/analysis/price/BandShelf.tsx");
  assert.ok(shelf.includes("{below}"), "비교 카드는 본문 열(상위 단지 아래)");

  const css = await src("app/globals.css");
  const at = css.lastIndexOf("/* [1022 · 면적대별 검색·비교]");
  assert.ok(at > 0, "CSS 블록");
  assert.ok(at > css.lastIndexOf("/* [1021 · 지역 시세 price·timing]"), "append-only — 1021 블록 뒤");
  assert.ok(css.includes(".pxc-region-input") && css.includes(".pxc-table"));
});
