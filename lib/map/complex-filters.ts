/**
 * [1053 · 지도 상세 필터 2] 단지 조건(난방 · 세대당 주차 · 동 수 · 최근 거래 · 승강기 · 시공사 · 평당가)과
 * 마커 표시 값 — 순수 규칙(tests/unit/map-filters-1053.test.ts).
 *
 * 소유자 지시(2026-10-10): "지도에서 필터라던지 보여지는 정보에 대해 더 다양하고 디테일한 필터와 정보를 제공".
 * 값의 출처는 둘뿐이다 — K-apt 단지 대장(market_agg.complex_spec_resolved: 난방 · 시공사 · 주차대수 · 동 수 · 승강기)과
 * 국토교통부 실거래(최근 6개월 매매 건수 · 평당가). 서버(/api/map/clusters → map_complex_attrs_v2)가 이 모양으로 접어 보낸다.
 * 대장이 없는 단지(대부분 소규모 비의무관리)는 값이 없다 — 조건을 걸면 그 단지는 빠진다(값을 지어 채우지 않는다).
 */

export type RangeSel = [number | null, number | null];

/* ── 난방 ─────────────────────────────────────────────────────────── */

export type HeatingKey = "district" | "individual" | "central" | "other";

export const HEATING_LABEL: Record<HeatingKey, string> = {
  district: "지역난방",
  individual: "개별난방",
  central: "중앙난방",
  other: "기타 난방",
};

/** K-apt 난방 방식 글자 → 묶음. 운영 실측 값: 개별난방 · 지역난방 · 중앙난방 · 개별난방+기타 · 기타 */
export function heatingKey(raw: unknown): HeatingKey | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/\s+/g, "");
  if (!s) return null;
  if (s.startsWith("지역")) return "district";
  if (s.startsWith("개별")) return "individual";
  if (s.startsWith("중앙")) return "central";
  return "other";
}

/* ── 시공사 ───────────────────────────────────────────────────────── */

/* 회사 이름이 바뀐 곳은 지금 이름(예전 이름)으로 한 묶음 — 같은 회사가 두 칩으로 갈리지 않게.
   바뀐 해: 대한주택공사·한국토지공사 → 한국토지주택공사 2009 · 현대산업개발 → HDC현대산업개발 2018 ·
   대림산업 → DL이앤씨 2021 · SK건설 → SK에코플랜트 2021 · 포스코건설 → 포스코이앤씨 2023 ·
   LG건설 → GS건설 2005 · 선경건설 → SK건설 1998 · 삼성건설 → 삼성물산(건설 부문) 1996 */
const BUILDER_ALIAS: Record<string, string> = {
  대한주택공사: "LH(한국토지주택공사)",
  한국토지주택공사: "LH(한국토지주택공사)",
  LH: "LH(한국토지주택공사)",
  현대산업개발: "HDC현대산업개발",
  HDC현대산업개발: "HDC현대산업개발",
  에이치디씨현대산업개발: "HDC현대산업개발",
  대림산업: "DL이앤씨(대림산업)",
  DL이앤씨: "DL이앤씨(대림산업)",
  디엘이앤씨: "DL이앤씨(대림산업)",
  SK건설: "SK에코플랜트(SK건설)",
  에스케이건설: "SK에코플랜트(SK건설)",
  SK에코플랜트: "SK에코플랜트(SK건설)",
  포스코건설: "포스코이앤씨(포스코건설)",
  포스코이앤씨: "포스코이앤씨(포스코건설)",
  지에스건설: "GS건설",
  LG건설: "GS건설",
  엘지건설: "GS건설",
  선경건설: "SK에코플랜트(SK건설)",
  삼성건설: "삼성물산",
};

/** 대장의 시공사 글자 → 칩 이름. "(주)" · "㈜" · "주식회사" · 빈칸을 걷고 이름 바뀐 회사를 한 묶음으로. 모르면 null */
export function builderLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw
    .replace(/\(주\)|㈜|\(株\)|주식회사|\(유\)|유한회사/g, "")
    .replace(/^주\)|\(주$/g, "") // 대장에 반쪽 괄호로 적힌 것("주)롯데건설")
    .replace(/\s+/g, "")
    .trim();
  if (!s || s === "-" || /^(미상|없음|기타)$/.test(s)) return null;
  /* "A건설,B건설" · "A건설+B건설" 공동 시공은 첫 회사 · 끝의 "외 2개사"는 걷는다 */
  const head = (s.split(/[,/·+]/)[0] ?? s).replace(/외\d*(개사|사)?$/, "");
  const name = (head || s).slice(0, 30);
  return BUILDER_ALIAS[name] ?? name;
}

/* ── 주차 ─────────────────────────────────────────────────────────── */

/** 세대당 주차 대수(소수 둘째 자리). 세대수·주차대수 둘 다 있어야 · 10대 넘으면 대장 오류로 보고 버린다 */
export function parkingPerHousehold(parking: unknown, households: unknown): number | null {
  const p = Number(parking);
  const h = Number(households);
  if (parking == null || households == null || !Number.isFinite(p) || !Number.isFinite(h) || h <= 0 || p < 0) return null;
  const v = Math.round((p / h) * 100) / 100;
  return v > 10 ? null : v;
}

/* ── 필터 상태 ────────────────────────────────────────────────────── */

export type ParkingMin = "all" | "1" | "1.2" | "1.5";
export type BuildingsMin = "all" | "2" | "5" | "10";
export type RecentMin = "all" | "1" | "5" | "10";

export type ComplexExtraFilters = {
  /** 평당가(만원/평) — 실거래 평균 */
  pyeong: RangeSel;
  heating: "all" | HeatingKey;
  parkingMin: ParkingMin;
  buildingsMin: BuildingsMin;
  recentMin: RecentMin;
  elevator: "all" | "yes";
  builder: string; // "all" 또는 builderLabel 결과
};

export const EMPTY_CX: ComplexExtraFilters = {
  pyeong: [null, null],
  heating: "all",
  parkingMin: "all",
  buildingsMin: "all",
  recentMin: "all",
  elevator: "all",
  builder: "all",
};

/** 지도 점(서버가 접어 보낸 값) — 모르는 값은 필드가 없다 */
export type CxPoint = {
  pyeongManwon?: number;
  heating?: HeatingKey;
  parkingPerHh?: number;
  buildings?: number;
  elevators?: number;
  recentTrades?: number;
  builder?: string;
};

export function cxActive(f: ComplexExtraFilters): boolean {
  return (
    f.pyeong[0] !== null ||
    f.pyeong[1] !== null ||
    f.heating !== "all" ||
    f.parkingMin !== "all" ||
    f.buildingsMin !== "all" ||
    f.recentMin !== "all" ||
    f.elevator !== "all" ||
    f.builder !== "all"
  );
}

function within(v: number | undefined, sel: RangeSel): boolean {
  const [lo, hi] = sel;
  if (lo === null && hi === null) return true;
  if (v === undefined || !Number.isFinite(v)) return false;
  if (lo !== null && v < lo) return false;
  if (hi !== null && v > hi) return false;
  return true;
}

function atLeast(v: number | undefined, min: string): boolean {
  if (min === "all") return true;
  if (v === undefined || !Number.isFinite(v)) return false;
  return v >= Number(min);
}

/**
 * 조건을 통과하는가. 건 조건의 값이 없는 단지는 통과하지 못한다(모르는 것을 맞는 것으로 치지 않는다).
 * price=false(전세 보기)면 평당가(매매 실거래) 조건은 건너뛴다 — 매매 기준 값으로 전세 단지를 거르지 않는다.
 */
export function passesCx(p: CxPoint, f: ComplexExtraFilters, opts: { price: boolean } = { price: true }): boolean {
  if (opts.price && !within(p.pyeongManwon, f.pyeong)) return false;
  if (f.heating !== "all" && p.heating !== f.heating) return false;
  if (!atLeast(p.parkingPerHh, f.parkingMin)) return false;
  if (!atLeast(p.buildings, f.buildingsMin)) return false;
  if (!atLeast(p.recentTrades, f.recentMin)) return false;
  if (f.elevator === "yes" && !(p.elevators !== undefined && p.elevators > 0)) return false;
  if (f.builder !== "all" && p.builder !== f.builder) return false;
  return true;
}

function manwonShort(v: number): string {
  return `${Math.round(v).toLocaleString("ko-KR")}만`;
}

/** 걸린 조건 낱말 — "○○ · ○○ · N개 적용" 줄에 이어 붙인다 */
export function cxSummary(f: ComplexExtraFilters): string[] {
  const out: string[] = [];
  const [lo, hi] = f.pyeong;
  if (lo !== null && hi !== null) out.push(`평당 ${manwonShort(lo)}~${manwonShort(hi)}`);
  else if (lo !== null) out.push(`평당 ${manwonShort(lo)} 이상`);
  else if (hi !== null) out.push(`평당 ${manwonShort(hi)} 이하`);
  if (f.heating !== "all") out.push(HEATING_LABEL[f.heating]);
  if (f.parkingMin !== "all") out.push(`세대당 주차 ${f.parkingMin}대+`);
  if (f.buildingsMin !== "all") out.push(f.buildingsMin === "2" ? "2개 동+(나홀로 제외)" : `${f.buildingsMin}개 동+`);
  if (f.recentMin !== "all") out.push(`6개월 매매 ${f.recentMin}건+`);
  if (f.elevator === "yes") out.push("승강기 있음");
  if (f.builder !== "all") out.push(`시공 ${f.builder}`);
  return out;
}

/* ── 칩 옆 수(지금 화면의 단지 기준) ───────────────────────────────── */

export type CxCounts = {
  total: number;
  heating: Record<HeatingKey, number>;
  heatingKnown: number;
  parking: Record<Exclude<ParkingMin, "all">, number>;
  parkingKnown: number;
  buildings: Record<Exclude<BuildingsMin, "all">, number>;
  buildingsKnown: number;
  recent: Record<Exclude<RecentMin, "all">, number>;
  recentKnown: number;
  elevator: number;
  elevatorKnown: number;
  builders: Array<{ label: string; n: number }>;
  builderKnown: number;
  pyeongKnown: number;
};

export function cxCounts(points: CxPoint[], topBuilders = 8): CxCounts {
  const c: CxCounts = {
    total: points.length,
    heating: { district: 0, individual: 0, central: 0, other: 0 },
    heatingKnown: 0,
    parking: { "1": 0, "1.2": 0, "1.5": 0 },
    parkingKnown: 0,
    buildings: { "2": 0, "5": 0, "10": 0 },
    buildingsKnown: 0,
    recent: { "1": 0, "5": 0, "10": 0 },
    recentKnown: 0,
    elevator: 0,
    elevatorKnown: 0,
    builders: [],
    builderKnown: 0,
    pyeongKnown: 0,
  };
  const b = new Map<string, number>();
  for (const p of points) {
    if (p.heating) {
      c.heating[p.heating]++;
      c.heatingKnown++;
    }
    if (p.parkingPerHh !== undefined) {
      c.parkingKnown++;
      for (const k of ["1", "1.2", "1.5"] as const) if (p.parkingPerHh >= Number(k)) c.parking[k]++;
    }
    if (p.buildings !== undefined) {
      c.buildingsKnown++;
      for (const k of ["2", "5", "10"] as const) if (p.buildings >= Number(k)) c.buildings[k]++;
    }
    if (p.recentTrades !== undefined) {
      c.recentKnown++;
      for (const k of ["1", "5", "10"] as const) if (p.recentTrades >= Number(k)) c.recent[k]++;
    }
    if (p.elevators !== undefined) {
      c.elevatorKnown++;
      if (p.elevators > 0) c.elevator++;
    }
    if (p.builder) {
      c.builderKnown++;
      b.set(p.builder, (b.get(p.builder) ?? 0) + 1);
    }
    if (p.pyeongManwon !== undefined) c.pyeongKnown++;
  }
  c.builders = [...b.entries()]
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], "ko"))
    .slice(0, topBuilders)
    .map(([label, n]) => ({ label, n }));
  return c;
}

/** 평당가 막대 — 지금 화면 단지의 1~99퍼센타일 사이를 buckets 칸으로 */
export function pyeongHistogram(points: CxPoint[], buckets = 20): { lo: number | null; hi: number | null; n: number; bins: number[] } {
  const vals = points
    .map((p) => p.pyeongManwon)
    .filter((v): v is number => v !== undefined && Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  const bins = new Array<number>(buckets).fill(0);
  if (vals.length === 0) return { lo: null, hi: null, n: 0, bins };
  const q = (r: number) => vals[Math.min(vals.length - 1, Math.max(0, Math.round(r * (vals.length - 1))))];
  const lo = Math.floor(q(0.01) / 100) * 100;
  let hi = Math.ceil(q(0.99) / 100) * 100;
  if (hi <= lo) hi = lo + 100;
  const w = (hi - lo) / buckets;
  for (const v of vals) {
    const i = Math.min(buckets - 1, Math.max(0, Math.floor((v - lo) / w)));
    bins[i]++;
  }
  return { lo, hi, n: vals.length, bins };
}

/* ── 마커에 적는 값 ───────────────────────────────────────────────── */

export type MarkerMetric = "pyeong" | "price" | "recent" | "year" | "households" | "parking";

export const MARKER_METRIC_OPTIONS: ReadonlyArray<{ key: MarkerMetric; label: string }> = [
  { key: "pyeong", label: "평당가" },
  { key: "price", label: "평균 매매가" },
  { key: "recent", label: "6개월 거래" },
  { key: "year", label: "준공" },
  { key: "households", label: "세대수" },
  { key: "parking", label: "세대당 주차" },
];

export type MetricPoint = CxPoint & { avgPriceManwon?: number; buildYear?: number; households?: number };

function eokLabel(manwon: number): string {
  if (manwon >= 10_000) {
    const eok = manwon / 10_000;
    return `${eok >= 10 ? Math.round(eok) : Math.round(eok * 10) / 10}억`;
  }
  return `${Math.round(manwon).toLocaleString("ko-KR")}만`;
}

/** 마커 알약 글자. 값이 없으면 null(알약 없이 점) — 평당가는 기존 색 단계 함수가 따로 그린다 */
export function metricLabel(p: MetricPoint, metric: MarkerMetric): string | null {
  switch (metric) {
    case "price":
      return p.avgPriceManwon !== undefined && p.avgPriceManwon > 0 ? eokLabel(p.avgPriceManwon) : null;
    case "recent":
      return p.recentTrades !== undefined ? `${p.recentTrades}건` : null;
    case "year":
      return p.buildYear !== undefined ? `${p.buildYear}년` : null;
    case "households":
      return p.households !== undefined && p.households > 0 ? `${p.households.toLocaleString("ko-KR")}세대` : null;
    case "parking":
      return p.parkingPerHh !== undefined ? `주차 ${p.parkingPerHh.toFixed(2)}` : null;
    default:
      return null;
  }
}

/** 호버 카드 한 줄 — 대장 값이 있는 것만 */
export function hoverFacts(p: CxPoint): string[] {
  const out: string[] = [];
  if (p.heating) out.push(HEATING_LABEL[p.heating]);
  if (p.parkingPerHh !== undefined) out.push(`세대당 주차 ${p.parkingPerHh.toFixed(2)}대`);
  if (p.buildings !== undefined) out.push(`${p.buildings}개 동`);
  if (p.recentTrades !== undefined) out.push(`6개월 매매 ${p.recentTrades}건`);
  if (p.builder) out.push(p.builder);
  return out;
}

/* ── 브라우저 저장(이 기기만) ─────────────────────────────────────── */

export const CX_STORAGE_KEY = "nz_map_cx_v1";

function pick<T extends string>(v: unknown, allowed: readonly T[], dflt: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : dflt;
}

/** 저장된 JSON → 필터(모양이 틀리면 그 칸만 기본값) */
export function parseCx(raw: unknown): ComplexExtraFilters {
  if (!raw || typeof raw !== "object") return EMPTY_CX;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1_000_000 ? v : null);
  const py = Array.isArray(o.pyeong) ? o.pyeong : [];
  const builder = typeof o.builder === "string" && o.builder.length > 0 && o.builder.length <= 40 ? o.builder : "all";
  return {
    pyeong: [num(py[0]), num(py[1])],
    heating: pick(o.heating, ["all", "district", "individual", "central", "other"] as const, "all"),
    parkingMin: pick(o.parkingMin, ["all", "1", "1.2", "1.5"] as const, "all"),
    buildingsMin: pick(o.buildingsMin, ["all", "2", "5", "10"] as const, "all"),
    recentMin: pick(o.recentMin, ["all", "1", "5", "10"] as const, "all"),
    elevator: pick(o.elevator, ["all", "yes"] as const, "all"),
    builder,
  };
}

export function parseMetric(raw: unknown): MarkerMetric {
  return pick(raw, ["pyeong", "price", "recent", "year", "households", "parking"] as const, "pyeong");
}
