/**
 * [1022 · 온도 지도] 지시 1 — 타일 지도를 우리나라 지도 모양으로: 전국 시/도 타일(sidoTiles: 소속 지역 평균·지역 수)
 * → 시/도 안은 lat/lng 배치(layoutInputs → lib/market/korea-tile-layout.layoutByLatLng). 권역 select 는 시/도 선택과 겹쳐 없앤다.
 * [1021 · 지역 시세 temperature] 온도 허브의 표시 규칙 — 순수 함수만(서버·클라이언트·테스트 공용).
 *
 * 지시: 시안(mock8/temp) — 주 선택 칩(이번 주·지난주·4주 전) · 권역 필터 · 타일 5칸 · 69곳 색 타일 지도 · 레일 8곳.
 * 여기엔 **새 계산이 없다**: 색 구간은 눈금을 나누는 규칙이고, 통계(평균·최고·최저·오른 곳·내린 곳)는
 * 예전 page.tsx 가 히어로 KPI 로 내던 것을 주(week)마다 다시 낼 수 있게 함수로 옮긴 것이다.
 */
import type { TemperatureLatest, TemperatureSnapshot } from "@/lib/market/temperature-archive";
import {
  KOREA_SIDO_TILES,
  regionCoord,
  sidoKeyOfLabel,
  type LayoutInput,
  type SidoTile,
} from "@/lib/market/korea-tile-layout";

/* ── 색 구간 ───────────────────────────────────────────────────────────
   80+ / 65~79 / 55~64 / 45~54 / ~44 — 시안의 다섯 칸. 색은 CSS(.tmp-tile[data-band]) 가 토큰으로 칠한다:
   hot → --brand-red · warm → --brand-red-on-dark · mild → 주홍 24% 섞은 옅은 면 · neutral → --border ·
   cool → --primary-soft. 진한 두 면(hot·warm)만 흰 글자. */
export type TempBand = "hot" | "warm" | "mild" | "neutral" | "cool";

export const TEMP_BANDS: readonly { band: TempBand; label: string; min: number }[] = [
  { band: "hot", label: "80+", min: 80 },
  { band: "warm", label: "65~79", min: 65 },
  { band: "mild", label: "55~64", min: 55 },
  { band: "neutral", label: "45~54", min: 45 },
  { band: "cool", label: "~44", min: -Infinity },
];

export function tempBand(score: number): TempBand {
  for (const b of TEMP_BANDS) if (score >= b.min) return b.band;
  return "cool";
}

/* ── 주 묶기 ───────────────────────────────────────────────────────────
   listLatestTemperatures() 는 최근 주만 "현재+직전"으로 접어 준다. 지난주·4주 전 칩은
   listTemperaturesForWeek() 로 받은 두 주(그 주 · 그 직전 주)를 같은 모양으로 접는다.
   정렬도 같다: 점수 높은 순 → 이름 가나다. */
export function pairWeeks(
  current: readonly TemperatureSnapshot[],
  previous: readonly TemperatureSnapshot[],
): TemperatureLatest[] {
  const prevBy = new Map(previous.map((p) => [p.regionId, p]));
  return current
    .map((c) => ({ current: c, previous: prevBy.get(c.regionId) ?? null }))
    .sort(
      (a, b) =>
        b.current.score - a.current.score ||
        a.current.regionLabel.localeCompare(b.current.regionLabel, "ko"),
    );
}

/* ── 한 주의 통계 — 예전 히어로 KPI 와 같은 식(값이 없으면 null) ── */
export type WeekStats = {
  count: number;
  /** 소수 첫째 자리 반올림 */
  avg: number | null;
  hottest: TemperatureLatest | null;
  coldest: TemperatureLatest | null;
  rising: number;
  falling: number;
  /** 직전 주 기록이 있어 비교가 되는 지역 수 */
  compared: number;
};

export function weekStats(rows: readonly TemperatureLatest[]): WeekStats {
  const count = rows.length;
  const avg =
    count > 0 ? Math.round((rows.reduce((a, r) => a + r.current.score, 0) / count) * 10) / 10 : null;
  return {
    count,
    avg,
    hottest: rows[0] ?? null,
    coldest: count > 0 ? rows[count - 1] : null,
    rising: rows.filter((r) => r.previous && r.current.score > r.previous.score).length,
    falling: rows.filter((r) => r.previous && r.current.score < r.previous.score).length,
    compared: rows.filter((r) => r.previous).length,
  };
}

/* ── 권역 — 지역 표기의 첫 토큰("서울 강남구" → 서울 · "경기 화성시 병점구" → 경기).
   TEMPERATURE_REGIONS 의 label 은 `${city} ${name}` 이라 계산이 아니라 읽기다. */
export function sidoOfTemperatureLabel(label: string): string {
  return label.trim().split(/\s+/)[0] ?? "";
}

export function sidoOptions(rows: readonly TemperatureLatest[]): string[] {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const s = sidoOfTemperatureLabel(r.current.regionLabel);
    if (s) seen.set(s, (seen.get(s) ?? 0) + 1);
  }
  /* 지역 수 많은 순 — 칩 순서가 매주 흔들리지 않게 같은 수면 가나다 */
  return [...seen.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")).map(([s]) => s);
}

export function filterBySido<T extends { current: { regionLabel: string } }>(rows: readonly T[], sido: string | null): T[] {
  if (!sido) return [...rows];
  return rows.filter((r) => sidoOfTemperatureLabel(r.current.regionLabel) === sido);
}

/* ── 내 관심 지역 — 구독 지역(lib/me/user-regions: city·district)을 기록 행에 맞춘다.
   "서울 강남구" 는 label 과 정확히 같고, district 만 있으면 label 의 마지막 토큰과 비교한다.
   못 찾으면 null → 칸을 만들지 않는다. */
export function matchWatchRegion<T extends { current: { regionLabel: string } }>(
  regions: readonly { city?: string; district?: string; label?: string }[],
  rows: readonly T[],
): T | null {
  for (const w of regions) {
    const district = (w.district ?? "").trim();
    const city = (w.city ?? "").trim();
    const full = city && district ? `${city} ${district}` : (w.label ?? "").trim();
    const hit = rows.find((r) => {
      const label = r.current.regionLabel.trim();
      if (full && label === full) return true;
      if (!district) return false;
      const last = label.split(/\s+/).pop() ?? "";
      return last === district || label.endsWith(` ${district}`);
    });
    if (hit) return hit;
  }
  return null;
}

/* ── [1022 · 온도 지도] 전국 시/도 타일 — 시/도 온도 = 소속 지역 평균(weekStats.avg, 있는 값으로) + 지역 수.
   기록 없는 시/도는 count 0 · avg null(회색 "기록 없음", 누를 수 없음). 칸 좌표는 lib/market/korea-tile-layout. */
export type SidoTileView = SidoTile & { count: number; avg: number | null; band: TempBand | null };

export function sidoTiles(rows: readonly TemperatureLatest[]): SidoTileView[] {
  const by = new Map<string, TemperatureLatest[]>();
  for (const r of rows) {
    const k = sidoKeyOfLabel(r.current.regionLabel);
    if (!k) continue;
    const list = by.get(k) ?? [];
    list.push(r);
    by.set(k, list);
  }
  return KOREA_SIDO_TILES.map((t) => {
    const list = by.get(t.key) ?? [];
    const avg = weekStats(list).avg;
    return { ...t, count: list.length, avg, band: avg === null ? null : tempBand(Math.round(avg)) };
  }).sort((a, b) => a.row - b.row || a.col - b.col);
}

/** 시/도 안 타일 배치 입력 — 기록 행에 카탈로그 좌표를 붙인다(없으면 null → 맨 뒤 칸). */
export function layoutInputs(rows: readonly TemperatureLatest[]): LayoutInput[] {
  return rows.map((r) => {
    const c = regionCoord(r.current.regionId);
    return { id: r.current.regionId, lat: c?.lat ?? null, lng: c?.lng ?? null };
  });
}

/** 시/도 안에서는 이름의 시/도 접두를 뗀다("서울 강남구" → "강남구"). 접두가 아니면 그대로. */
export function nameInSido(label: string, sido: string): string {
  const t = label.trim();
  return t.startsWith(`${sido} `) ? t.slice(sido.length + 1) : t;
}

/* ── 주 칩 ───────────────────────────────────────────────────────────── */
export type WeekKey = "this" | "prev" | "4w";
export const WEEK_CHIPS: readonly { key: WeekKey; label: string; offset: number }[] = [
  { key: "this", label: "이번 주", offset: 0 },
  { key: "prev", label: "지난주", offset: -1 },
  { key: "4w", label: "4주 전", offset: -4 },
];
