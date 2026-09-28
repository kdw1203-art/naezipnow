/**
 * [1022 · 온도 지도] 온도 타일 지도를 우리나라 지도 모양으로 — 순수 함수만(서버·클라이언트·테스트 공용).
 *
 * 지시 1: "온도타일지도는 우리나라 지도형식을 바탕으로, '도'(경기도, 서울시) 이렇게 누르면 해당 도에서
 * 지도모양으로 타일이 보이게끔".
 *  ① 전국 — 시/도 17개를 한반도 모양 격자(6열×7행)에 손으로 놓은 좌표 표(KOREA_SIDO_TILES).
 *  ② 시/도 안 — 그 시/도의 시군구를 카탈로그(lib/map/seoul-districts)의 lat/lng 로 격자에 놓는다:
 *     경도 → 열, 위도 → 행, 같은 칸 충돌은 가장 가까운 빈 칸으로 민다(layoutByLatLng).
 * 여기엔 새 계산이 없다 — 좌표를 칸 번호로 옮기는 눈금뿐이고 온도 값은 건드리지 않는다.
 */
import { findCatalogRegionById } from "@/lib/region/catalog";

/* ── ① 전국 격자 ───────────────────────────────────────────────────────
   col 0 = 서쪽, row 0 = 북쪽. 서울·인천·경기 북서 / 강원 북동 / 충북·충남·세종·대전 가운데 /
   전북·전남·광주 남서 / 경북·대구·울산·부산·경남 남동 / 제주 맨 아래 왼쪽.
       c0    c1    c2    c3    c4    c5
   r0  ·     ·     경기   강원   ·     ·
   r1  인천   서울   ·     ·     ·     ·
   r2  ·     충남   세종   충북   경북   ·
   r3  ·     ·     대전   ·     대구   울산
   r4  ·     전북   ·     경남   ·     부산
   r5  ·     광주   전남   ·     ·     ·
   r6  제주   ·     ·     ·     ·     ·
   시/도 이름은 lib/market/sido-group 의 짧은 표기(METRO_SIDO·DO_SIDO)와 같다 — 온도 기록의 label 첫 토큰. */
export type SidoTile = { key: string; label: string; col: number; row: number };

export const KOREA_TILE_COLS = 6;
export const KOREA_TILE_ROWS = 7;

export const KOREA_SIDO_TILES: readonly SidoTile[] = [
  { key: "경기", label: "경기", col: 2, row: 0 },
  { key: "강원", label: "강원", col: 3, row: 0 },
  { key: "인천", label: "인천", col: 0, row: 1 },
  { key: "서울", label: "서울", col: 1, row: 1 },
  { key: "충남", label: "충남", col: 1, row: 2 },
  { key: "세종", label: "세종", col: 2, row: 2 },
  { key: "충북", label: "충북", col: 3, row: 2 },
  { key: "경북", label: "경북", col: 4, row: 2 },
  { key: "대전", label: "대전", col: 2, row: 3 },
  { key: "대구", label: "대구", col: 4, row: 3 },
  { key: "울산", label: "울산", col: 5, row: 3 },
  { key: "전북", label: "전북", col: 1, row: 4 },
  { key: "경남", label: "경남", col: 3, row: 4 },
  { key: "부산", label: "부산", col: 5, row: 4 },
  { key: "광주", label: "광주", col: 1, row: 5 },
  { key: "전남", label: "전남", col: 2, row: 5 },
  { key: "제주", label: "제주", col: 0, row: 6 },
];

const SIDO_KEYS = new Set(KOREA_SIDO_TILES.map((t) => t.key));

/** 긴 표기 → 짧은 표기. 온도 기록의 label 은 짧은 표기("서울 강남구")라 보통 첫 토큰이 곧 키다. */
const SIDO_LONG: Record<string, string> = {
  서울특별시: "서울",
  인천광역시: "인천",
  경기도: "경기",
  강원도: "강원",
  강원특별자치도: "강원",
  충청북도: "충북",
  충청남도: "충남",
  세종특별자치시: "세종",
  대전광역시: "대전",
  경상북도: "경북",
  대구광역시: "대구",
  울산광역시: "울산",
  부산광역시: "부산",
  경상남도: "경남",
  전라북도: "전북",
  전북특별자치도: "전북",
  광주광역시: "광주",
  전라남도: "전남",
  제주도: "제주",
  제주특별자치도: "제주",
};

/** 지역 표기("서울 강남구"·"경기 화성시 병점구"·"경기도 …") → 시/도 키. 모르면 null(지어내지 않는다). */
export function sidoKeyOfLabel(label: string): string | null {
  const first = label.trim().split(/\s+/)[0] ?? "";
  if (!first) return null;
  if (SIDO_KEYS.has(first)) return first;
  const long = SIDO_LONG[first];
  return long ?? null;
}

/* ── ② 시/도 안 — lat/lng → 격자 ───────────────────────────────────── */
export type LatLng = { lat: number; lng: number };

/** 카탈로그 좌표(구 중심 근사). 카탈로그에 없는 id 는 null. */
export function regionCoord(regionId: string): LatLng | null {
  const info = findCatalogRegionById(regionId);
  return info ? { lat: info.lat, lng: info.lng } : null;
}

export type LayoutInput = { id: string; lat: number | null; lng: number | null };
export type Cell = { id: string; col: number; row: number };
export type TileLayout = { cols: number; rows: number; cells: Cell[] };

const KM_PER_DEG = 111;

/**
 * 시군구를 열(경도)·행(위도) 격자에 놓는다.
 *  - 행 수: 칸이 대략 정사각형이 되게 위도·경도 폭(km)의 비로 정한다(cols × 세로/가로).
 *    하한 ⌈n×1.25/cols⌉(빈 칸 여유), 상한 ⌈cols×1.5⌉(너무 길어지지 않게).
 *  - 순서: 북→남(위도 내림), 같은 위도면 서→동. 좌표 없는 항목은 맨 뒤(아래 가운데 칸 근처).
 *  - 충돌: 목표 칸이 차 있으면 거리(행·열 제곱합)가 가장 가까운 빈 칸, 같으면 위·왼쪽 칸.
 *  - 빈 칸이 없으면 행을 하나 더 만든다(입력을 잃지 않는다).
 */
export function layoutByLatLng(regions: readonly LayoutInput[], cols: number): TileLayout {
  const c = Math.max(1, Math.floor(cols));
  const n = regions.length;
  if (n === 0) return { cols: c, rows: 0, cells: [] };

  const located = regions.filter((r): r is LayoutInput & LatLng => r.lat !== null && r.lng !== null);
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const r of located) {
    if (r.lat < minLat) minLat = r.lat;
    if (r.lat > maxLat) maxLat = r.lat;
    if (r.lng < minLng) minLng = r.lng;
    if (r.lng > maxLng) maxLng = r.lng;
  }
  const latSpan = located.length > 0 ? maxLat - minLat : 0;
  const lngSpan = located.length > 0 ? maxLng - minLng : 0;
  const midLat = located.length > 0 ? (minLat + maxLat) / 2 : 0;
  const kmH = latSpan * KM_PER_DEG;
  const kmW = lngSpan * KM_PER_DEG * Math.cos((midLat * Math.PI) / 180);
  const aspect = kmW > 0 && kmH > 0 ? kmH / kmW : 1;

  const minRows = Math.ceil((n * 1.25) / c);
  const maxRows = Math.ceil(c * 1.5);
  let rows = Math.max(minRows, Math.min(Math.round(c * aspect), maxRows));
  if (rows < 1) rows = 1;

  const ordered = [...regions].sort((a, b) => {
    const aHas = a.lat !== null && a.lng !== null;
    const bHas = b.lat !== null && b.lng !== null;
    if (aHas !== bHas) return aHas ? -1 : 1;
    if (!aHas) return a.id.localeCompare(b.id);
    return (b.lat as number) - (a.lat as number) || (a.lng as number) - (b.lng as number) || a.id.localeCompare(b.id);
  });

  const taken = new Set<string>();
  const key = (row: number, col: number) => `${row}:${col}`;
  const cells: Cell[] = [];

  const target = (r: LayoutInput): { row: number; col: number } => {
    if (r.lat === null || r.lng === null) return { row: rows - 1, col: Math.floor((c - 1) / 2) };
    const col = lngSpan > 0 ? Math.round(((r.lng - minLng) / lngSpan) * (c - 1)) : Math.floor((c - 1) / 2);
    const row = latSpan > 0 ? Math.round(((maxLat - r.lat) / latSpan) * (rows - 1)) : Math.floor((rows - 1) / 2);
    return { row, col };
  };

  const nearestFree = (row: number, col: number): { row: number; col: number } => {
    let best: { row: number; col: number; d: number } | null = null;
    for (let rr = 0; rr < rows; rr += 1) {
      for (let cc = 0; cc < c; cc += 1) {
        if (taken.has(key(rr, cc))) continue;
        const d = (rr - row) * (rr - row) + (cc - col) * (cc - col);
        if (!best || d < best.d || (d === best.d && (rr < best.row || (rr === best.row && cc < best.col)))) {
          best = { row: rr, col: cc, d };
        }
      }
    }
    if (best) return { row: best.row, col: best.col };
    rows += 1;
    return nearestFree(row, col);
  };

  for (const r of ordered) {
    const t = target(r);
    const at = taken.has(key(t.row, t.col)) ? nearestFree(t.row, t.col) : t;
    taken.add(key(at.row, at.col));
    cells.push({ id: r.id, col: at.col, row: at.row });
  }

  return { cols: c, rows, cells };
}

/** id → 칸. 화면이 tiles 를 그릴 때 두 번(데스크톱 열 수·폰 열 수) 찾기 쉽게. */
export function cellMap(layout: TileLayout): Map<string, Cell> {
  return new Map(layout.cells.map((cell) => [cell.id, cell]));
}
