import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  MAX_BRIEF_CHECKS,
  MAX_BRIEF_PLANS,
  briefFetchedLabel,
  buildFieldBrief,
} from "../../lib/inspection/field-brief.ts";

test("아무것도 없으면 null — 빈 카드를 그려 '볼 게 없다'로 보이게 하지 않는다", () => {
  assert.equal(buildFieldBrief(null), null);
  assert.equal(buildFieldBrief({}), null);
  assert.equal(buildFieldBrief("문자열"), null);
  assert.equal(buildFieldBrief({ plans: [], checklistHints: [] }), null);
  /* 날씨만 있는 응답도 null — 날씨는 방문 정보 칸에 이미 있다 */
  assert.equal(buildFieldBrief({ weatherHint: "맑음 24도" }), null);
});

test("날씨는 브리핑에 싣지 않는다 — 같은 말이 한 화면에 두 번 읽힌다", () => {
  const b = buildFieldBrief({ weatherHint: "맑음 24도", airQualityHint: "미세먼지 보통" });
  assert.ok(b);
  assert.deepEqual(
    b.lines.map((l) => l.key),
    ["air"],
  );
});

test("marketHint 가 있으면 그 문장을 그대로 쓴다(출처가 이미 들어 있다)", () => {
  const b = buildFieldBrief({
    marketHint: "한국부동산원 기준 서울 강남구 아파트 매매 12.3억 · 전세가율 52.1%",
  });
  assert.equal(b?.lines[0].label, "시세");
  assert.match(b?.lines[0].text ?? "", /^한국부동산원 기준/);
});

test("marketHint 가 없고 구조화 값만 있으면 그걸로 한 줄 만든다", () => {
  const b = buildFieldBrief({
    market: { source: "한국부동산원", period: "2026-07", perM2Sale: 1234.6, jeonseRatio: 52.14, tradeCount: 1200 },
  });
  const t = b?.lines[0].text ?? "";
  assert.match(t, /㎡당 매매 1,235만원/);
  assert.match(t, /전세가율 52\.1%/);
  assert.match(t, /거래 1,200건/);
  assert.match(t, /\(한국부동산원 2026-07\)/);
});

test("구조화 값이 숫자가 아니면 그 항목만 빠진다 — 통째로 버리지 않는다", () => {
  const b = buildFieldBrief({
    market: { source: "KB", perM2Sale: Number.NaN, jeonseRatio: 51, tradeCount: "많음" },
  });
  const t = b?.lines[0].text ?? "";
  assert.doesNotMatch(t, /NaN/);
  assert.doesNotMatch(t, /많음/);
  assert.match(t, /전세가율 51\.0%/);
});

test("marketHint 가 있으면 구조화 줄을 겹쳐 넣지 않는다", () => {
  const b = buildFieldBrief({
    marketHint: "한국부동산원 기준 …",
    market: { source: "KB", perM2Sale: 1000 },
  });
  assert.equal(b?.lines.filter((l) => l.label === "시세").length, 1);
});

test("체크 힌트는 중복을 지우고 상한까지만", () => {
  const b = buildFieldBrief({
    checklistHints: ["소음 확인", "소음 확인", " 주차 확인 ", "학군", "공급", "치안", "조도"],
  });
  assert.deepEqual(b?.checks.slice(0, 3), ["소음 확인", "주차 확인", "학군"]);
  assert.equal(b?.checks.length, MAX_BRIEF_CHECKS);
});

test("건수 0 인 개발계획 슬라이스는 싣지 않는다 — 화면이 실제보다 풍부해 보인다", () => {
  const b = buildFieldBrief({
    plans: [
      { title: "정비사업", items: [] },
      { title: "도시계획", items: [1, 2] },
      { title: "", items: [1] },
      { title: "공원", items: [1] },
      { title: "어린이집", items: [1] },
      { title: "상업", items: [1] },
    ],
  });
  assert.deepEqual(b?.plans, [
    { title: "도시계획", count: 2 },
    { title: "공원", count: 1 },
    { title: "어린이집", count: 1 },
  ]);
  assert.equal(b?.plans.length, MAX_BRIEF_PLANS);
});

test("조회 시각 — 못 읽으면 문구를 빼는 편이 낫다", () => {
  assert.equal(briefFetchedLabel(null), null);
  assert.equal(briefFetchedLabel("어제"), null);
  assert.equal(briefFetchedLabel("2026-09-10T03:00:00.000Z"), "9월 10일 조회");
});
