/**
 * [1021 · 지역 시세 price·timing] 면적대별 실거래가(/analysis/price) · 시세·타이밍(/analysis/timing) — 시안(mock8) 구조 잠금.
 *
 * ① 시세·타이밍 대표 그림(지수 선 + 월 거래량 막대 한 SVG)의 좌표 규칙 — app/analysis/timing/overlay-geometry.ts
 * ② 면적 선반 5칸의 표시 규칙 — app/analysis/price/band-shelf-model.ts
 * ③ 소스 구조 — 네이비 온도 카드(ai-panel) 없음 · 레일 클래스 · 선반이 상위 단지를 바꾼다 · 국면 띠·비교 지역은 지어내지 않는다.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { layoutOverlay, monthT, nearestSlot, periodT, tickLabel } from "@/app/analysis/timing/overlay-geometry";
import { initialShelfSlug, shelfCards, type ShelfBand } from "@/app/analysis/price/band-shelf-model";

const BOX = { width: 760, height: 220, padL: 8, padR: 8, padT: 10, padB: 22 };

test("시간 축 — 월간 지수점과 그 달 막대는 같은 x(달의 한가운데), 주간 점은 날짜 위치", () => {
  assert.equal(monthT("202608"), periodT("2026-08-01", false));
  assert.equal(monthT("202601") + 1, monthT("202602"), "한 달 = 1");
  const w = periodT("2026-08-16", true)!;
  assert.ok(w > monthT("202608") - 0.5 && w < monthT("202608") + 0.5, "주간 점은 그 달 칸 안");
  assert.equal(periodT("garbage", false), null);
  assert.equal(tickLabel("202509", true), "25.09");
  assert.equal(tickLabel("202601", false), "26.01", "1월은 연도를 적는다");
  assert.equal(tickLabel("202510", false), "10");
});

test("한 그림 — 지수 13개월과 거래량 8개월이 다른 범위여도 같은 달은 같은 x 에 서고, 최다 달 하나만 채움", () => {
  const index = Array.from({ length: 13 }, (_, i) => {
    const m = ((7 + i) % 12) + 1; // 2025-08 … 2026-08
    const y = 7 + i >= 12 ? 2026 : 2025;
    return { period: `${y}-${String(m).padStart(2, "0")}-01`, value: 95 + i * 0.4 };
  });
  const volume = Array.from({ length: 8 }, (_, i) => ({ month: `2026${String(i + 1).padStart(2, "0")}`, count: [60, 55, 70, 153, 80, 75, 61, 80][i] }));
  const L = layoutOverlay({ index, weekly: false, volume, box: BOX })!;
  assert.ok(L);
  assert.equal(L.bars.length, 8);
  assert.equal(L.points.length, 13);
  const aug = L.points.find((p) => p.ym === "202608")!;
  const bar = L.bars.find((b) => b.month === "202608")!;
  assert.ok(Math.abs(bar.x + bar.w / 2 - aug.x) < 0.6, "같은 달 = 같은 x");
  assert.deepEqual(L.maxBar, { month: "202604", count: 153 });
  assert.equal(L.bars.filter((b) => b.isMax).length, 1);
  assert.ok(L.line.startsWith("M"), "선 path");
  assert.ok(L.area.endsWith("Z"));
  assert.ok(L.points[0].x < L.bars[0].x, "2025-08 지수점은 첫 막대(2026-01)보다 왼쪽");
  assert.ok(L.points.every((p) => p.y >= L.plotTop && p.y <= L.plotBottom));
  assert.ok(L.bars.every((b) => b.y + b.h <= L.plotBottom + 0.1 && b.h <= (L.plotBottom - L.plotTop) * 0.7 + 0.1), "막대는 바닥에서 70% 까지");
  assert.equal(L.ticks[0].label, "26.01", "축 라벨은 막대 달");
  assert.equal(L.ticks.length, 8);
  /* 훑기 — 막대 가운데 x 를 주면 그 달 지수점 */
  const n = nearestSlot(L, bar.x + bar.w / 2)!;
  assert.equal(n.kind, "point");
  assert.equal(L.points[n.i].ym, "202608");
});

test("지어내지 않는다 — 지수가 1점뿐이면 선 없이 막대만, 둘 다 없으면 null, 폭이 너무 좁아도 null", () => {
  const only = layoutOverlay({ index: [{ period: "2026-08-01", value: 100 }], weekly: false, volume: [{ month: "202608", count: 3 }], box: BOX })!;
  assert.equal(only.points.length, 0);
  assert.equal(only.line, "");
  assert.equal(only.bars.length, 1);
  assert.equal(nearestSlot(only, 300)?.kind, "bar");
  assert.equal(layoutOverlay({ index: [], weekly: false, volume: [], box: BOX }), null);
  assert.equal(layoutOverlay({ index: [], weekly: false, volume: [{ month: "202608", count: 3 }], box: { ...BOX, width: 40 } }), null);
});

const band = (slug: string, tx: number): ShelfBand => ({
  slug,
  label: slug,
  txCount: tx,
  complexCount: 1,
  medianText: "1억",
  avgText: "1억",
  minText: "1억",
  maxText: "1억",
  perText: null,
  top: null,
  rows: [],
  avgRows: [],
});

test("면적 선반 — 막대 높이 = 건수 ÷ 최다(최다 100 · 0건도 3) · 배지는 최다·최고 각 하나 · 처음 고른 칸은 거래 최다", () => {
  const bands = [band("under-60", 1805), band("60-85", 3852), band("85-102", 253), band("102-135", 607), band("135-up", 0)];
  const cards = shelfCards(bands, "60-85", "85-102");
  assert.equal(cards[1].barPct, 100);
  assert.equal(cards[0].barPct, 47);
  assert.equal(cards[4].barPct, 3, "0건도 칸은 남긴다");
  assert.equal(cards.filter((c) => c.busiest).length, 1);
  assert.equal(cards.filter((c) => c.priciest).length, 1);
  assert.equal(cards[2].priciest, true);
  assert.equal(initialShelfSlug(bands, "60-85"), "60-85");
  assert.equal(initialShelfSlug(bands, null), "under-60");
  assert.equal(initialShelfSlug(bands, "nope"), "under-60");
  assert.equal(initialShelfSlug([], null), null);
  assert.deepEqual(
    shelfCards(bands, null, null).map((c) => c.busiest || c.priciest),
    [false, false, false, false, false],
    "없는 값에는 배지를 붙이지 않는다",
  );
});

/** 주석은 걷고 본다 — 규칙 기록("예전 네이비 ai-panel")까지 잡지 않게 */
async function src(rel: string): Promise<string> {
  const raw = await readFile(new URL(`../../${rel}`, import.meta.url), "utf8");
  return rel.endsWith(".css") ? raw : raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("소스 구조 — 시세·타이밍: 네이비 온도 카드 없음 · 한 그림 · 레일 클래스 · 국면 띠/비교 지역 없음", async () => {
  const s = await src("app/analysis/timing/TimingClient.tsx");
  assert.ok(!s.includes("ai-panel"), "온도 게이지는 흰 카드(네이비 면 금지)");
  assert.ok(s.includes("<TimingOverlayChart"), "지수+거래량 한 그림");
  assert.ok(!s.includes("<ScrubLineLazy") && !s.includes("<Bars"), "따로 그리던 두 차트는 걷었다");
  assert.ok(s.includes('className="hidden lg:flex lg:flex-col lg:gap-3 lg:sticky lg:top-[76px] lg:self-start"'), "레일 클래스");
  /* [1026] 레일 300 → 340(1025 표준 "본문 | 레일 340" — tests/unit/market-1026.test.ts) */
  assert.ok(s.includes("lg:grid-cols-[minmax(0,1fr)_340px]") && s.includes("grid grid-cols-1"), "본문 그리드");
  assert.ok(!s.includes("다른 지역과 나란히") && !s.includes("숨 고르기"), "시안의 비교 지역·국면 띠 값은 쓰지 않는다");
  assert.ok(s.includes("trend.verdict"), "국면은 기존 판정(verdict)만");
  assert.ok(!s.includes("50점 기준에 더한 값입니다"), "설명문은 ⓘ(TEMPERATURE_EXPLAIN)로");
  assert.ok(s.includes("TEMPERATURE_EXPLAIN"));
  const chart = await src("app/analysis/timing/TimingOverlayChart.tsx");
  assert.ok(chart.includes("var(--brand-red)") && chart.includes("var(--primary)"), "색은 토큰만");
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(chart.replace(/\/\*[\s\S]*?\*\//g, "")), "raw hex 없음");
});

test("소스 구조 — 면적대별: 선반이 상위 단지를 바꾼다 · 타일 5칸 · 히스토그램 없음 · 데이터 정책 그대로", async () => {
  const page = await src("app/analysis/price/page.tsx");
  assert.ok(page.includes("export const revalidate = 86_400;"));
  assert.ok(page.includes("noIndex: true"));
  assert.ok(page.includes("<BandShelf"), "면적 선반");
  assert.ok(page.includes("Promise.all(") && page.includes("listBandComplexes(target.name, \"area\", c.bandSlug, 8)"), "면적대마다 상위 단지");
  assert.ok(page.includes('label: "최근 달"'), "타일 5번째 칸 = 최근 달(신고 기준)");
  assert.ok(!page.includes("<ToolHero") && !page.includes("<BandTable"), "옛 히어로·표는 선반이 대신한다");
  const shelf = await src("app/analysis/price/BandShelf.tsx");
  assert.ok(shelf.includes("useState") && shelf.includes("aria-pressed={on}"), "칸 = 버튼, 상태 하나");
  assert.ok(shelf.includes("거래 최다") && shelf.includes("평단가 최고"));
  assert.ok(!shelf.includes("분포"), "분포 히스토그램은 분포 데이터가 없어 넣지 않는다");
  assert.ok(shelf.includes('className="hidden lg:flex lg:flex-col lg:gap-3 lg:sticky lg:top-[76px] lg:self-start"'), "레일 클래스");
  assert.ok(shelf.includes("lg:grid-cols-[minmax(0,1fr)_340px]"));
  assert.ok(!shelf.includes("btn-primary"), "채움 파랑 버튼 없음(이어서 칩의 노트 쓰기 하나뿐)");
  const css = await src("app/globals.css");
  assert.ok(css.includes("/* [1021 · 지역 시세 price·timing]"), "CSS 블록");
  assert.ok(css.includes(".pxs-shelf") && css.includes(".tmo-plot"));
  assert.ok(css.lastIndexOf("/* [1021 · 지역 시세 price·timing]") > css.lastIndexOf(".qz-ans--picked"), "append-only — 파일 끝쪽");
});
