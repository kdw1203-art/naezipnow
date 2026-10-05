/* [1038 · 시각화] 1037 제안 중 자료 있는 항목 구현 — 글 → 링·레이더·점·막대·표 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("[1038] ScoreRing — 서버 SVG 링(토큰 클래스 · 값 없으면 호 없음)", () => {
  const src = read("app/components/viz/ScoreRing.tsx");
  assert.doesNotMatch(src, /"use client"/);
  assert.match(src, /className="stroke-primary"/);
  assert.match(src, /score == null \? "—" : score/);
});

test("[1038 · 1·4·5·8·9·10] 노트 상세 — 링+레이더 · 점 3개 · 두 칸 카드 · 요약 링+칩 · 재방문 표 · 도보 막대", () => {
  const page = read("app/notes/[id]/page.tsx");
  assert.match(page, /radar: scoreEntries\.map/);
  assert.match(page, /avgScore: scored \? Math\.round\(avg \* 10\) \/ 10 : null/);
  assert.match(page, /radar=\{v\.radar\}/);
  assert.match(page, /bg-current" : "bg-line"/); // 항목 평가 점
  assert.match(page, /border-l-4 border-success/);
  assert.match(page, /border-l-4 border-danger/);
  assert.match(page, /v\.aiBadge\.startsWith\("규칙"\) && v\.totalScore != null \? \(/);
  assert.match(page, /<ScoreRing score=\{v\.totalScore\} size=\{72\}/);
  assert.doesNotMatch(page, /conic-gradient/); // 레일 링도 SVG
  assert.ok(page.includes("/^(.+?)\\s(\\S+?)→(\\S+)$/.exec(c)")); // 재방문 표 파서
  assert.match(page, /fd\.subwayWalkMin/);
  assert.match(page, /도보 \{w\.min\}분/);
  const card = read("app/notes/[id]/NoteVerdictCard.tsx");
  assert.match(card, /<ScoreRadar items=\{p\.radar\} \/>/);
  assert.match(card, /filter\(\(r\) => r\.score != null\)\.length >= 3/);
  assert.match(card, /주의할 점 \{p\.cautionCount\}/);
  assert.match(card, /미확인 \{p\.checklistTotal - p\.checklistDone\}/);
});

test("[1038 · 21] 단지 허브 결과 요약 — 투자 점수 링 + 5축 레이더 · 같은 숫자는 한 번(hideMetric)", () => {
  const src = read("app/complex/[id]/ComplexAxisSummary.tsx");
  assert.match(src, /const radar = diagnosisRadar\(ctx\)/);
  assert.match(src, /verdict\.metric\.label === "투자 점수"/);
  assert.match(src, /<ScoreRing score=\{score\} size=\{96\} label="투자 점수" \/>/);
  assert.match(src, /hideMetric=\{showViz\}/);
  const card = read("app/analysis/ai/[tool]/VerdictCard.tsx");
  assert.match(card, /\{m && !hideMetric && \(/);
  assert.match(card, /공공데이터 자동 계산/);
});

test("[1038 · 11·18] 동네 홈 — 타일 3 + 16주 스파크라인 · 인근 지역 막대(같은 시·도 · 실패하면 그 조각만 생략)", () => {
  const src = read("app/town/[region]/page.tsx");
  assert.match(src, /getRegionSeries\(id, "sale_index", "weekly", 16\)/);
  assert.match(src, /getAllRegionSnapshots\(\)/);
  assert.match(src, /<Spark values=\{spark\} width=\{150\} height=\{34\} smooth/);
  assert.match(src, /aria-label="인근 지역 평균 매매가"/);
  assert.match(src, /nearbyTop\.length >= 2 &&/);
});

test("[1038 · 14·16·17·19] 다이제스트 타일 · 정비 단계 막대 · 입주 표 · 공매 % 막대", () => {
  assert.match(read("app/digest/page.tsx"), /grid grid-cols-2 gap-1\.5 md:grid-cols-3/);
  const redev = read("app/redevelopment/page.tsx");
  assert.match(redev, /redevStageCounts\(projects, new Set\(\)\)/);
  assert.match(redev, /stageCounts\[s\.key\]\.toLocaleString/);
  const supply = read("app/supply/SupplyClient.tsx");
  assert.match(supply, /<th className="border-b border-line py-1\.5 font-semibold">세대<\/th>/);
  assert.match(supply, /maxHh/);
  const auc = read("app/auctions/AuctionsClient.tsx");
  assert.match(auc, /bidRatio: a\.minBidKrw && a\.appraisalKrw && a\.appraisalKrw > 0/);
  assert.match(auc, /aria-label=\{`감정가 대비 \$\{c\.bidRatio\}%`\}/);
});
