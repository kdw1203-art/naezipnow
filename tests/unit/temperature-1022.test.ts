/**
 * [1022 · 온도 지도] 지시 1 — 온도 타일 지도를 우리나라 지도 모양으로.
 *
 * ① lib/market/korea-tile-layout.ts — 전국 시/도 격자 표(17개 · 겹침 없음 · 방위) · 시/도 키 · layoutByLatLng(경도→열 · 위도→행 · 충돌 밀기)
 *    서울은 실제 지도와 비슷해야 한다: 강서구 열 < 강동구 열, 노원구 행 < 서초구 행(데스크톱 8열·폰 5열 둘 다).
 * ② app/analysis/temperature/temp-map-model.ts — sidoTiles(시/도 평균 = 소속 지역 평균 · 지역 수 · 없으면 null) · nameInSido
 * ③ 소스 구조 — 권역 select 없음 · 2단계 머리(전국 › · 전국으로 · 시/도 칩) · ?sido= 는 replaceState 로만 · 서버는 쿼리를 안 읽는다 · CSS 블록
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  KOREA_SIDO_TILES,
  KOREA_TILE_COLS,
  KOREA_TILE_ROWS,
  cellMap,
  layoutByLatLng,
  regionCoord,
  sidoKeyOfLabel,
} from "@/lib/market/korea-tile-layout";
import { layoutInputs, nameInSido, pairWeeks, sidoTiles } from "@/app/analysis/temperature/temp-map-model";
import { SEOUL_DISTRICTS, METRO_EXPLORE_DISTRICTS } from "@/lib/map/seoul-districts";
import type { TemperatureSnapshot } from "@/lib/market/temperature-archive";

function snap(regionId: string, regionLabel: string, score: number): TemperatureSnapshot {
  return {
    regionId,
    regionLabel,
    weekStart: "2026-09-21",
    score,
    headline: "h",
    periodType: "monthly",
    momentumPct: null,
    priorPct: null,
    volumeRecentCount: null,
    volumePriorCount: null,
    volumeDeltaPct: null,
    indexLatest: null,
    formulaVersion: 1,
    observedAt: null,
  };
}

/* ── ① 전국 격자 ─────────────────────────────────────────────────────── */
test("전국 격자 — 시/도 17개 · 칸 겹침 없음 · 6열×7행 안 · 방위(서울·인천·경기 북서 / 강원 북동 / 제주 맨 아래 왼쪽)", () => {
  assert.equal(KOREA_SIDO_TILES.length, 17);
  const keys = new Set(KOREA_SIDO_TILES.map((t) => t.key));
  for (const k of ["서울", "인천", "경기", "강원", "충북", "충남", "세종", "대전", "경북", "대구", "울산", "부산", "경남", "전북", "광주", "전남", "제주"]) {
    assert.ok(keys.has(k), k);
  }
  const cells = new Set(KOREA_SIDO_TILES.map((t) => `${t.row}:${t.col}`));
  assert.equal(cells.size, 17, "같은 칸에 둘이 없다");
  for (const t of KOREA_SIDO_TILES) {
    assert.ok(t.col >= 0 && t.col < KOREA_TILE_COLS, `${t.key} 열`);
    assert.ok(t.row >= 0 && t.row < KOREA_TILE_ROWS, `${t.key} 행`);
  }
  const at = (k: string) => KOREA_SIDO_TILES.find((t) => t.key === k)!;
  assert.ok(at("인천").col < at("서울").col, "인천은 서울 서쪽");
  assert.ok(at("강원").col > at("경기").col, "강원은 경기 동쪽");
  assert.ok(at("서울").row <= 1 && at("인천").row <= 1 && at("경기").row === 0, "북서");
  assert.ok(at("제주").row === KOREA_TILE_ROWS - 1 && at("제주").col === 0, "제주 맨 아래 왼쪽");
  assert.ok(at("부산").row > at("대구").row && at("부산").col >= at("울산").col, "부산은 대구 남쪽·울산 아래");
  assert.ok(at("전남").row > at("전북").row, "전남은 전북 남쪽");
  assert.ok(at("충남").col < at("충북").col, "충남은 충북 서쪽");
});

test("시/도 키 — label 첫 토큰(짧은 표기) · 긴 표기는 짧은 표기로 · 모르면 null", () => {
  assert.equal(sidoKeyOfLabel("서울 강남구"), "서울");
  assert.equal(sidoKeyOfLabel("경기 화성시 병점구"), "경기");
  assert.equal(sidoKeyOfLabel("경기도 수원시 영통구"), "경기");
  assert.equal(sidoKeyOfLabel("전북특별자치도 전주시"), "전북");
  assert.equal(sidoKeyOfLabel("수원 영통구"), null, "지어내지 않는다");
  assert.equal(sidoKeyOfLabel(""), null);
});

/* ── ① lat/lng 배치 ───────────────────────────────────────────────────── */
const SEOUL_INPUTS = SEOUL_DISTRICTS.map((d) => ({ id: d.id, lat: d.lat, lng: d.lng }));

test("서울 25구 lat/lng 배치 — 강서구 열 < 강동구 열 · 노원구 행 < 서초구 행 (8열 · 5열) · 칸 겹침 없음 · 격자 안", () => {
  for (const cols of [8, 5]) {
    const layout = layoutByLatLng(SEOUL_INPUTS, cols);
    const m = cellMap(layout);
    assert.equal(layout.cols, cols);
    assert.equal(layout.cells.length, 25, `${cols}열 — 입력을 잃지 않는다`);
    assert.equal(new Set(layout.cells.map((c) => `${c.row}:${c.col}`)).size, 25, `${cols}열 — 칸 겹침 없음`);
    for (const c of layout.cells) {
      assert.ok(c.col >= 0 && c.col < layout.cols && c.row >= 0 && c.row < layout.rows, `${cols}열 — ${c.id} 격자 안`);
    }
    assert.ok(m.get("gangseo")!.col < m.get("gangdong")!.col, `${cols}열 — 강서 왼쪽 · 강동 오른쪽`);
    assert.ok(m.get("nowon")!.row < m.get("seocho")!.row, `${cols}열 — 노원 위 · 서초 아래`);
    assert.ok(m.get("dobong")!.row < m.get("geumcheon")!.row, `${cols}열 — 도봉 위 · 금천 아래`);
    assert.ok(m.get("gangnam")!.row > m.get("gangbuk")!.row, `${cols}열 — 강남 아래 · 강북 위`);
  }
  const eight = layoutByLatLng(SEOUL_INPUTS, 8);
  assert.equal(cellMap(eight).get("gangseo")!.col, 0, "8열 — 경도 최소 강서구는 첫 열");
  assert.equal(cellMap(eight).get("gangdong")!.col, 7, "8열 — 경도 최대 강동구는 마지막 열");
  assert.ok(eight.rows >= 4 && eight.rows <= 12, "행 수는 하한 ⌈n×1.25/cols⌉ ~ 상한 ⌈cols×1.5⌉");
});

test("배치 규칙 — 같은 칸 충돌은 가까운 빈 칸으로 · 좌표 없는 항목은 맨 뒤 칸 · 빈 입력 · 결정적(같은 입력 → 같은 결과)", () => {
  const same = [
    { id: "a", lat: 37.5, lng: 127.0 },
    { id: "b", lat: 37.5, lng: 127.0 },
    { id: "c", lat: 37.5, lng: 127.0 },
  ];
  const l = layoutByLatLng(same, 4);
  assert.equal(new Set(l.cells.map((c) => `${c.row}:${c.col}`)).size, 3, "충돌 셋이 세 칸으로");
  const m = cellMap(l);
  const dist = (id: string) => {
    const c = m.get(id)!;
    const a = m.get("a")!;
    return Math.abs(c.row - a.row) + Math.abs(c.col - a.col);
  };
  assert.ok(dist("b") <= 2 && dist("c") <= 2, "밀린 칸은 가까이");

  const withNull = [...SEOUL_INPUTS.slice(0, 5), { id: "zz", lat: null, lng: null }];
  const ln = layoutByLatLng(withNull, 4);
  assert.equal(ln.cells.length, 6);
  const zz = cellMap(ln).get("zz")!;
  assert.ok(zz.row >= ln.rows - 2, "좌표 없는 항목은 아래쪽");

  assert.deepEqual(layoutByLatLng([], 8), { cols: 8, rows: 0, cells: [] });
  assert.equal(layoutByLatLng([{ id: "one", lat: 37.5, lng: 127 }], 6).cells.length, 1);
  assert.deepEqual(layoutByLatLng(SEOUL_INPUTS, 8), layoutByLatLng([...SEOUL_INPUTS].reverse(), 8), "입력 순서와 무관");
});

test("경기 33곳 — 8열·5열 모두 칸 겹침 없음 · 북(의정부) 위 · 남(평택) 아래 · 서(김포) 왼쪽 · 동(남양주) 오른쪽", () => {
  const gg = METRO_EXPLORE_DISTRICTS.filter((d) => d.city === "경기").map((d) => ({ id: d.id, lat: d.lat, lng: d.lng }));
  assert.equal(gg.length, 33);
  for (const cols of [8, 5]) {
    const l = layoutByLatLng(gg, cols);
    const m = cellMap(l);
    assert.equal(new Set(l.cells.map((c) => `${c.row}:${c.col}`)).size, 33, `${cols}열`);
    assert.ok(m.get("uijeongbu")!.row < m.get("pyeongtaek")!.row, `${cols}열 — 의정부 위 · 평택 아래`);
    assert.ok(m.get("gimpo")!.col < m.get("namyangju")!.col, `${cols}열 — 김포 왼쪽 · 남양주 오른쪽`);
    assert.ok(l.rows <= Math.max(Math.ceil(cols * 1.5), Math.ceil((33 * 1.25) / cols)), `${cols}열 — 행 상한(빈 칸 여유 하한이 더 크면 그것)`);
  }
});

test("카탈로그 좌표 — 온도 지역 id 로 lat/lng 를 찾는다 · 모르는 id 는 null", () => {
  assert.deepEqual(regionCoord("gangnam"), { lat: 37.5172, lng: 127.0473 });
  assert.equal(regionCoord("no-such-region"), null);
});

/* ── ② 시/도 타일 · 이름 ─────────────────────────────────────────────── */
test("sidoTiles — 시/도 온도 = 소속 지역 평균(weekStats.avg) · 지역 수 · 기록 없는 시/도는 count 0 · avg null · 격자 읽는 순서", () => {
  const rows = pairWeeks(
    [snap("gangnam", "서울 강남구", 80), snap("nowon", "서울 노원구", 60), snap("bucheon", "경기 부천시", 44), snap("x", "모름 어디", 90)],
    [],
  );
  const tiles = sidoTiles(rows);
  assert.equal(tiles.length, 17);
  const seoul = tiles.find((t) => t.key === "서울")!;
  assert.deepEqual([seoul.count, seoul.avg, seoul.band], [2, 70, "warm"]);
  const gg = tiles.find((t) => t.key === "경기")!;
  assert.deepEqual([gg.count, gg.avg, gg.band], [1, 44, "cool"]);
  const busan = tiles.find((t) => t.key === "부산")!;
  assert.deepEqual([busan.count, busan.avg, busan.band], [0, null, null]);
  assert.equal(tiles.reduce((s, t) => s + t.count, 0), 3, "시/도를 모르는 행은 어느 타일에도 넣지 않는다");
  for (let i = 1; i < tiles.length; i += 1) {
    const a = tiles[i - 1];
    const b = tiles[i];
    assert.ok(a.row < b.row || (a.row === b.row && a.col < b.col), "위→아래 · 왼→오른");
  }
  const inputs = layoutInputs(rows);
  assert.deepEqual(inputs.find((i) => i.id === "gangnam"), { id: "gangnam", lat: 37.5172, lng: 127.0473 });
  assert.deepEqual(inputs.find((i) => i.id === "x"), { id: "x", lat: null, lng: null });
});

test("nameInSido — 시/도 접두를 뗀다 · 접두가 아니면 그대로", () => {
  assert.equal(nameInSido("서울 강남구", "서울"), "강남구");
  assert.equal(nameInSido("경기 화성시 병점구", "경기"), "화성시 병점구");
  assert.equal(nameInSido("서울 강남구", "경기"), "서울 강남구");
});

/* ── ③ 소스 구조 ─────────────────────────────────────────────────────── */
const read = (p: string) => readFile(new URL(`../../${p}`, import.meta.url), "utf8");

test("온도 허브 — 전국 격자 · 시/도 안 lat/lng 격자 · 권역 select 없음 · 2단계 머리 · ?sido= 는 replaceState · 서버는 쿼리를 안 읽는다 · CSS 블록", async () => {
  const client = await read("app/analysis/temperature/TempMapClient.tsx");
  const page = await read("app/analysis/temperature/page.tsx");
  const model = await read("app/analysis/temperature/temp-map-model.ts");
  const layout = await read("lib/market/korea-tile-layout.ts");
  assert.ok(client.includes("[1022") && page.includes("[1022") && model.includes("[1022") && layout.includes("[1022"), "표식");
  assert.ok(client.includes("tm-nation") && client.includes("tm-grid") && client.includes("tm-cell"), "전국 격자 · 시/도 격자");
  assert.ok(client.includes("layoutByLatLng(") && client.includes("sidoTiles("), "배치는 순수 함수로");
  assert.ok(!client.includes("<select"), "권역 select 없음(시/도 선택과 겹친다)");
  assert.ok(client.includes("전국 › {sido}") && client.includes("전국으로"), "브레드크럼 · 전국으로");
  assert.ok(client.includes('aria-label="시/도"'), "시/도 칩 줄");
  assert.ok(client.includes("window.history.replaceState"), "?sido= 는 replaceState 로만");
  assert.ok(!client.includes("useSearchParams") && !client.includes("router.push") && !client.includes("useRouter"), "라우터 이동 없음");
  assert.ok(!page.includes("searchParams"), "서버는 쿼리를 읽지 않는다(ISR 그대로)");
  assert.ok(page.includes("export const revalidate = 86_400"), "캐시 정책 유지");
  assert.ok(client.includes("목록 보기") && client.includes("TempRegionCard"), "목록 보기 토글 유지");
  assert.ok(client.includes("WEEK_CHIPS"), "주 선택 유지");
  assert.ok(client.includes("기록 없음") && client.includes("data-empty"), "기록 없는 시/도는 회색 · 누를 수 없음");
  assert.ok(client.includes("const SIDO_COLS = 8") && client.includes("const SIDO_COLS_PHONE = 5"), "2단계 데스크톱 8열 · 폰 5열");
  assert.ok(!client.includes("btn-primary"), "채움 파랑 없음");
  assert.ok(!client.includes("overflow-x-auto"), "가로 스크롤 없음");
  assert.ok(!layout.includes("server-only"), "레이아웃 모듈은 순수(클라이언트에서도 쓴다)");
  const css = await read("app/globals.css");
  const i = css.indexOf("/* [1022 · 온도 지도]");
  assert.ok(i > 0, "CSS 블록");
  /* 다른 담당의 블록이 뒤에 붙으므로 내 블록만(다음 [1022 · 블록 앞까지) 본다 */
  const next = css.indexOf("/* [1022 · ", i + 1);
  const block = css.slice(i, next > 0 ? next : undefined);
  assert.ok(block.includes(".tm-grid") && block.includes(".tm-cell") && block.includes(".tm-sido[data-empty]"));
  assert.ok(block.includes("--tm-cols-m") && block.includes("--tm-cols"), "열 수는 변수(폰·데스크톱)");
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(block), "색은 토큰만(hex 없음)");
  assert.ok(!/gradient\(/.test(block), "그라데이션 없음");
  assert.ok(!/font-weight:\s*800/.test(block), "굵기 800 없음");
});
