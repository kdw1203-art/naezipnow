import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* [1115 · 다른 화면 검토] 소유자 2026-11-09 "다른 페이지들도 검토" — 같은 사실 한 번 · 5개 넘으면 필터 · 표에 그래프 */
const read = (p: string) => readFileSync(p, "utf8");
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

test("단지 상세 — 레일 전세가율 칸 없음(본문 카드) · 요약 탭은 대표가 칸 없음(결과 요약)", () => {
  const p = strip(read("app/complex/[id]/page.tsx"));
  assert.doesNotMatch(p, /key: "jeonse",\s*label: "전세가율"/);
  assert.match(p, /<JeonseGapCards jeonse=\{facts\.jeonseRatio\}/);
  assert.match(p, /\.filter\(\s*\(t\) => t\.key !== "price",\s*\)/);
});

test("단지 목록 — 25개 구 칩 벽 대신 제목 옆 접힘(JS 없음 · 링크 25개는 판 안)", () => {
  const b = strip(read("app/complex/browse/page.tsx"));
  assert.match(b, /<details className="group relative">/);
  assert.match(b, /SEOUL_BROWSE_REGIONS\.map\(\(r\) => \{/);
  assert.match(b, /aria-current=\{active \? "page" : undefined\}/);
  assert.doesNotMatch(b, /rounded-full px-3 py-1\.5/);
});

test("공개 임장노트 — 오른쪽 레일은 광고만(표 첫 줄들과 같은 '최근 임장' 없음)", () => {
  const f = strip(read("app/notes/notes-feed-client.tsx"));
  assert.match(f, /function RightRail\(\{ ad \}: \{ ad: ReactNode \}\)/);
  assert.doesNotMatch(f, />최근 임장</);
});

test("지역 시세 표 — 시장 온도 0~100 막대(50 눈금)", () => {
  const e = strip(read("app/analysis/region-sise-entry.tsx"));
  assert.match(e, /r\.temp\.score >= 55 \? "bg-up" : r\.temp\.score <= 45 \? "bg-down" : "bg-text-3"/);
  assert.match(e, /left-1\/2 w-px bg-surface/);
});

import { buildTickerPages, seriesSince, toTickerCard } from "../../lib/region/region-ticker.ts";

const rowOf = (id: string, sido: string, avg: number | null) => ({
  id, name: id, sido, label: `${sido} ${id}`, href: `/region/${id}`, keys: [id], avgSaleKrw: avg, jeonseRatio: null, temp: null,
});
const ser = (vals: number[]) => vals.map((v, i) => ({ period: `2026-${String(i + 1).padStart(2, "0")}-01`, value: v }));

test("시세판 — 칸(지수 · 전월 대비 · 선) · 두 달 미만 제외 · 쪽 = 서울 평균가 순 · 상승 순 · 하락 순", () => {
  const c = toTickerCard(rowOf("gangnam", "서울", 2.78e9), ser([100.15, 98.5]))!;
  assert.equal(c.index, 98.5);
  assert.equal(c.momPct, -1.6);
  assert.equal(c.ym, "2026.02");
  assert.equal(toTickerCard(rowOf("x", "서울", 1), ser([100])), null);
  const rows = [rowOf("a", "서울", 10), rowOf("b", "서울", 30), rowOf("c", "경기", 50), rowOf("d", "서울", null)];
  const m = new Map([["a", ser([100, 101])], ["b", ser([100, 99])], ["c", ser([100, 103])], ["d", ser([100, 100])]]);
  const pages = buildTickerPages(rows, m, 16);
  assert.deepEqual(pages.map((p) => p.key), ["seoul", "up", "down"]);
  assert.deepEqual(pages[0].cards.map((x) => x.id), ["b", "a", "d"]);
  assert.deepEqual(pages[1].cards.map((x) => x.id), ["c", "a"]);
  assert.deepEqual(pages[2].cards.map((x) => x.id), ["b"]);
  assert.equal(buildTickerPages(rows, m, 1)[0].cards.length, 1, "쪽 상한");
  /* 마지막 달이 다른(공표 멈춘) 지역은 빠진다 */
  const stale = new Map(m);
  stale.set("e", [{ period: "2025-12-01", value: 100 }, { period: "2026-01-01", value: 110 }]);
  const p2 = buildTickerPages([...rows, rowOf("e", "경기", null)], stale, 16);
  assert.ok(!p2.flatMap((p) => p.cards).some((c) => c.id === "e"));
  assert.equal(seriesSince(new Date(Date.UTC(2026, 10, 9)), 14), "2025-09-01");
});

test("시세판 · 도구 결과 예시 — 서버 칸 + 회전판 · 폰 앞 8칸 · '예시' 표기 · 도구 표 칸 머리", () => {
  const b = strip(read("app/analysis/region-ticker-board.tsx"));
  assert.doesNotMatch(b, /"use client"/);
  assert.match(b, /<RollingPanel/);
  assert.match(b, /grid grid-cols-2 gap-2 md:grid-cols-4/);
  assert.match(b, /i >= 8 \? "max-md:hidden" : ""/);
  assert.match(b, /지역 시세판 불러오기 실패 · 잠시 후 다시/);
  const e = strip(read("app/analysis/region-sise-entry.tsx"));
  assert.match(e, /<RegionTickerBoard pages=\{data\.tickerPages\} failed=\{data\.tickerFailed\} \/>/);
  const t = strip(read("app/analysis/tool-preview.tsx"));
  assert.doesNotMatch(t, /^import /m, "import 0 — 클라이언트 묶음 예산");
  assert.match(t, />예시</);
  for (const id of ["ai-diagnosis", "ai-prediction", "ai-inspection", "ai-timing"]) assert.match(t, new RegExp(`"${id}": \\{ el:`));
  const h = strip(read("app/analysis/hub-tiers.tsx"));
  assert.match(h, />결과 예시</);
  assert.match(h, /<ToolResultPreview id=\{c\.id\} result=\{c\.result\} \/>/);
});
