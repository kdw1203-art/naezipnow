/* [1104] 소유자 2026-11-04 "추가로 더 해 줘" → 네 묶음(데이터 수집 · 속도 2차 · 시안 4장 반영 · 다크 모드·접근성).
 *  데이터 · 속도 · 다크 고정은 data-1104 · perf-1104 · (각 화면 테스트). 이 파일은 시안 반영과 리퀴드 판 선택자. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { priceConclusion, timingConclusion } from "../../lib/market/region-conclusion";

const read = (p: string) => readFileSync(p, "utf8");

test("시안 반영 — 가격 결론 근거 줄 없음 · 타이밍 근거 줄에 '대비' 없음", () => {
  const band = { label: "60~85㎡", txCount: 3852, medianText: "5.5억", minText: "1.2억", maxText: "14억", complexCount: 247, perText: "2,402만/평", top: 19 };
  assert.equal(priceConclusion("남양주시", band, true).sub, null);
  const t = timingConclusion({ regionLabel: "서울 강남구", latestChangePct: -1.65, cumulativePct: 2.8, weekly: false, verdict: "상승 지속", latestIndex: 98.5, tempScore: 13, tempHeadline: "차가움" })!;
  assert.equal(t.title, "서울 강남구 지수 -1.65% · 온도 13");
  assert.ok(!t.sub!.includes("대비"));
});

test("시안 반영 — 정비사업 폰 지도 먼저 · 여정 폰 칩 줄 숨김", () => {
  assert.match(read("app/redevelopment/(index)/page.tsx"), /<section className="rise-in flex flex-col gap-3 max-md:-order-1">/);
  assert.match(read("app/journey/JourneyBoard.tsx"), /className="jr-steps--light flex gap-1\.5 overflow-x-auto max-md:hidden lg:hidden"/);
});

test("리퀴드 판 선택자 — class 속성 선택자 대신 .divide-y(같은 매칭 · html/body class 변경 때 전체 재계산 방지)", () => {
  const css = read("app/globals.css");
  assert.equal(css.indexOf('[class~="divide-y"]'), -1);
  assert.match(css, /:is\(main, \.lq-scope\) :is\(\.divide-y, \.lq-panel\) > \* \{/);
});
