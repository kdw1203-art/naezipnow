/* [v4 · 한 화면 한 가지 — 지도판] /map 개편 회귀 테스트(소스 문자열).
 *
 * 지도가 주인공이라 둘레 크롬을 최소로 둔다(app/map/map-client.tsx 맨 위 [v4] 주석). 고정하는 것:
 *  1) 유리(블러) 표면 없음 — 지도 위 판·칩·머리·내비는 흰 면 + 1px 선
 *  2) 칩 한 모양 — 선택 = 한지 + 남색(.chip-active). 채움 파랑·옅은 파랑 칩 클래스(.map-chip/.map-seg) 없음
 *  3) 위 크롬 = 머리 + 검색 + 칩 한 줄 — 줌 탭은 lg 미만에서 칩 줄 끝, 떠 있던 줌 설명 캡션 상자 없음
 *  4) 채움 파랑 — 단지 정보 판은 "이 단지 보기" 하나, 매물 미리보기 판은 0(머리의 노트 쓰기와 동시에 보인다)
 *  5) 단지 정보 판 — 핵심 숫자 칸(KpiCell)·요약 문장 머리 없음, 목록 행은 단지 허브 SummaryRow, 맨 끝 <details> 데이터 출처
 * 브라우저·SDK 가 필요한 화면이라 이 러너에서는 소스 문자열로 본다.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
/** 주석은 코드가 아니다 — 규칙 기록("예전엔 … 였다")까지 잡지 않게 지운다 */
const code = (p: string) =>
  readFileSync(join(ROOT, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const MAP = "app/map/map-client.tsx";
const PANEL = "app/map/ComplexInfoPanel.tsx";
const PREVIEW = "app/map/ListingPreviewPanel.tsx";
const SEARCH = "app/map/MapSearchBox.tsx";

test("[v4] 지도 둘레에 유리(glass·glass-strong) 표면이 없다", () => {
  for (const f of [MAP, PANEL, PREVIEW, SEARCH, "app/map/WelcomeHandoff.tsx", "components/map/RoadviewButton.tsx"]) {
    assert.ok(!/className=[{"`][^"`]*\bglass(-strong)?\b/.test(code(f)), `${f}: glass 표면`);
  }
});

test("[v4] 지도 칩 한 모양 — 선택 = 한지 + 남색, 옛 map-chip/map-seg·채움 파랑 칩 없음", () => {
  const src = code(MAP);
  assert.match(src, /function mapChipClass\(on: boolean\)/);
  assert.match(src, /on \? "chip-active border" : "border border-line bg-surface text-text-2"/);
  assert.ok(!/\bmap-chip\b|\bmap-seg\b|map-chip-soft/.test(src), "옛 map-chip/map-seg 클래스");
  assert.ok(!/active\s*\?\s*"bg-primary/.test(src), "선택 칩이 채움 파랑");
});

test("[v4] 위 크롬 — 줌 탭은 lg 미만 칩 줄 끝 · 줌 설명 캡션 상자 없음 · 칩 줄 134 · 필터 판 186", () => {
  const src = code(MAP);
  /* 칩 줄(lg:hidden) 안에 filterBar 다음 줌 탭 */
  assert.match(src, /\{filterBar\}\s*<span className="map-zone-sep" aria-hidden="true" \/>\s*<div role="group" aria-label="지도 단위"/);
  assert.ok(src.includes("top-[calc(env(safe-area-inset-top,0px)+134px)]"), "모바일 칩 줄 레인 134");
  assert.ok(src.includes("top-[calc(env(safe-area-inset-top,0px)+186px)]"), "모바일 필터 판 레인 186");
  /* ZOOM_CAPTION 은 title 로만 — 화면에 글자로 그리지 않는다 */
  assert.ok(!/>\s*\{ZOOM_CAPTION\[zoom\]\}\s*</.test(src), "줌 설명 캡션이 글자로 그려진다");
});

test("[v4] 채움 파랑 — 지도 머리 '이 지역 노트 쓰기' · 단지 판 '이 단지 보기' 하나 · 매물 미리보기 0", () => {
  const map = code(MAP);
  assert.match(map, /className="btn-primary shrink-0 rounded-lg px-4 py-\[9px\] t-body"\s*>\s*이 지역 노트 쓰기/);
  /* 떠 있는 "매물 등록"은 채움 파랑이 아니다 */
  assert.ok(!/btn-primary[^"]*absolute right-5/.test(map), "떠 있는 매물 등록이 채움 파랑");
  const panel = code(PANEL);
  assert.equal((panel.match(/\bbtn-primary\b/g) ?? []).length, 1, "단지 정보 판 채움 파랑은 1개");
  // JSX 주석 조각은 code() 가 빈 중괄호로 남긴다
  assert.match(panel, /btn-primary[^"]*"\s*>\s*(?:\{\}\s*)*이 단지 보기/);
  assert.equal((code(PREVIEW).match(/\bbtn-primary\b/g) ?? []).length, 0, "매물 미리보기 판 채움 파랑 0");
});

test("[v4] 단지 정보 판 — 핵심 숫자 칸·요약 문장 머리 없음 · SummaryRow 행 · 맨 끝 데이터 출처", () => {
  const panel = code(PANEL);
  assert.ok(!panel.includes("KpiCell") && !panel.includes("SectionHead"), "옛 핵심 숫자 칸/섹션 머리");
  assert.ok(!panel.includes("{summaryLine}"), "머리 요약 문장");
  assert.ok(panel.includes('import { SummaryRow } from "@/app/complex/[id]/SummaryRow"'), "단지 허브 목록 행 재사용");
  assert.match(panel, /<summary[^>]*>\s*데이터 출처/);
  /* 추이는 여전히 ScrubLineLazy(따로 받는 청크) — hub-price-1009 잠금과 같은 사실 */
  assert.ok(panel.includes("<ScrubLineLazy"));
});
