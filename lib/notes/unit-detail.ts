/* [1032 · 임장노트 1단계] 임장한 타입(전용면적·동·층·향) · 세부 기록(측정값) — 순수 함수.
 *
 * 왜: 노트는 단지까지만 가리켰다. 같은 단지라도 59㎡ 와 114㎡, 1층과 15층, 남향과 북향은 다른 집인데
 * 적을 칸이 없어 메모에 섞였다. 타입 목록은 지어내지 않는다 — 그 단지의 **실거래에 신고된 전용면적**
 * (/api/complex/[id]/trades · 최근 24개월)에서 뽑는다. 실거래가 없는 단지는 면적을 직접 적는다.
 *
 * 평면도: 공공 데이터(국토부 실거래·K-apt)에 평면도는 없다. 그래서 "평면도 자료 없음"이라고 말하고,
 * 현장 안내판·분양 카탈로그를 찍은 사진에 역할(평면도)을 붙여 노트가 보관한다(metadata.photoRoles).
 *
 * 저장: metadata.unit · metadata.fieldDetail · metadata.photoRoles (jsonb 임의 키 — POST/PATCH 통과).
 * 이 모듈은 폼 조각(지연 로드)과 노트 상세(서버)가 같이 쓴다 — React·브라우저 의존 없음. */

/* 돈 표기(formatKrwManwon)를 쓰는 줄 만들기는 unit-detail-lines.ts. [1033] 폼 첫 로드에 실리는 핵심(NoteUnit·파서·사진 역할)은 unit-core.ts —
   여기서 다시 내보낸다(기존 import 유지). 이 파일 자체는 지연 조각·서버·목록 빌더만 가져온다. */
export * from "@/lib/notes/unit-core";
import { areaTypeLabel, photoRolesFromMetadata, unitForSave, unitFromMetadata } from "@/lib/notes/unit-core";

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function finite(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/* ── 임장한 타입 ─────────────────────────────────────────────────────────── */

/** 실거래 튜플([계약연월, 전용㎡, 만원, 층|null]) 한 건 */
export type TradeTuple = [ym: string, areaM2: number, manwon: number, floor: number | null];

export type UnitType = {
  /** 타입 키(= 라벨) */
  key: string;
  label: string;
  /** 대표 전용면적 — 그 타입에서 가장 많이 신고된 정확한 값 */
  areaM2: number;
  /** 24개월 신고 건수 */
  count: number;
  /** 가장 최근 신고 한 건 */
  latestManwon: number;
  latestYm: string;
  /** 신고된 층 범위(층이 있는 건만) */
  floorMin: number | null;
  floorMax: number | null;
};

/** 응답 → 튜플(모양이 틀린 행은 버린다 — 신뢰 경계) */
export function tradeTuplesFrom(raw: unknown): TradeTuple[] {
  const rows = (raw as { trades?: unknown } | null)?.trades;
  if (!Array.isArray(rows)) return [];
  const out: TradeTuple[] = [];
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 3) continue;
    const [ym, area, man, floor] = r as unknown[];
    if (typeof ym !== "string" || !/^\d{6}$/.test(ym)) continue;
    if (typeof area !== "number" || !Number.isFinite(area) || area <= 0) continue;
    if (typeof man !== "number" || !Number.isFinite(man) || man <= 0) continue;
    const f = typeof floor === "number" && Number.isFinite(floor) && floor !== 0 ? floor : null;
    out.push([ym, area, man, f]);
  }
  return out;
}

/**
 * 실거래에서 타입 목록 — 전용면적 정수부로 묶고(84.95·84.97 → 84㎡), 면적 오름차순.
 * 최근 건은 계약연월 → 금액 순(같은 달이면 큰 금액이 아니라 **목록 순서**를 지킨다: 응답은 최신순).
 */
export function unitTypesFromTrades(trades: TradeTuple[]): UnitType[] {
  const groups = new Map<string, { exact: Map<number, number>; rows: TradeTuple[] }>();
  for (const t of trades) {
    const key = areaTypeLabel(t[1]);
    const g = groups.get(key) ?? { exact: new Map<number, number>(), rows: [] as TradeTuple[] };
    g.exact.set(t[1], (g.exact.get(t[1]) ?? 0) + 1);
    g.rows.push(t);
    groups.set(key, g);
  }
  const out: UnitType[] = [];
  for (const [key, g] of groups) {
    let rep = g.rows[0][1];
    let repN = 0;
    for (const [a, n] of g.exact) {
      if (n > repN || (n === repN && a < rep)) {
        rep = a;
        repN = n;
      }
    }
    let latest = g.rows[0];
    for (const r of g.rows) if (r[0] > latest[0]) latest = r;
    const floors = g.rows.map((r) => r[3]).filter((f): f is number => f != null);
    out.push({
      key,
      label: key,
      areaM2: rep,
      count: g.rows.length,
      latestManwon: latest[2],
      latestYm: latest[0],
      floorMin: floors.length ? Math.min(...floors) : null,
      floorMax: floors.length ? Math.max(...floors) : null,
    });
  }
  return out.sort((a, b) => a.areaM2 - b.areaM2);
}

/* ── 단지 사실 줄 ────────────────────────────────────────────────────────── */

/** /api/complex/[id]/detail 의 complex → "준공 1996년 · 1,200세대 · 12개동 · 최고 25층 · 주차 1.1대/세대 · 지역난방 · ○○건설"(있는 것만) */
export function complexFactChips(complex: unknown): string[] {
  const c = rec(complex);
  if (!c) return [];
  const n = (k: string) => {
    const v = finite(c[k]);
    return v != null && v > 0 ? v : null;
  };
  const s = (k: string) => (typeof c[k] === "string" ? (c[k] as string).trim() : "");
  const out: string[] = [];
  const year = n("build_year");
  if (year) out.push(`준공 ${year}년`);
  const hh = n("households");
  if (hh) out.push(`${hh.toLocaleString("ko-KR")}세대`);
  const bc = n("building_count");
  if (bc) out.push(`${bc}개동`);
  const tf = n("total_floors");
  if (tf) out.push(`최고 ${tf}층`);
  const pph = n("parking_per_hh");
  const pc = n("parking_count");
  if (pph) out.push(`주차 ${pph.toFixed(pph >= 10 ? 0 : 1)}대/세대`);
  else if (pc) out.push(`주차 ${pc.toLocaleString("ko-KR")}대`);
  const heat = s("heating");
  if (heat) out.push(heat);
  const ev = n("elevator_count");
  if (ev) out.push(`승강기 ${ev}대`);
  const builder = s("builder_name");
  if (builder) out.push(builder);
  const mt = s("manage_type");
  if (mt) out.push(mt);
  return out;
}

/* ── 세부 기록(측정값) ──────────────────────────────────────────────────── */

export const FIELD_CHOICE_GROUPS = [
  { key: "roadNoise", label: "도로 소음", options: ["없음", "약간", "큼"] },
  { key: "parkingNow", label: "방문 시각 주차", options: ["여유", "빠듯", "만차", "이중주차"] },
  { key: "sunlight", label: "방문 시각 채광", options: ["밝음", "보통", "어두움"] },
  { key: "exterior", label: "외벽·복도 상태", options: ["양호", "보통", "노후"] },
  { key: "smell", label: "냄새·습기", options: ["없음", "약간", "심함"] },
] as const;
export type FieldChoiceKey = (typeof FIELD_CHOICE_GROUPS)[number]["key"];

export const FIELD_NUMBER_GROUPS = [
  { key: "subwayWalkMin", label: "지하철 도보", unit: "분", max: 60 },
  { key: "schoolWalkMin", label: "초등학교 도보", unit: "분", max: 60 },
  { key: "elevatorWaitSec", label: "승강기 대기", unit: "초", max: 600 },
  { key: "askingManwon", label: "들은 호가", unit: "만원", max: 1_000_000 },
  /* [1033] 관리실·중개사에게 들은 월 관리비 — 같은 면적대 비교 재료 */
  { key: "maintenanceFeeManwon", label: "월 관리비", unit: "만원", max: 1_000 },
] as const;
export type FieldNumberKey = (typeof FIELD_NUMBER_GROUPS)[number]["key"];

export type FieldDetail = Partial<Record<FieldChoiceKey, string>> & Partial<Record<FieldNumberKey, number>> & {
  /** 중개사·관리실에서 들은 말(≤ 200자) */
  heard?: string;
  /** [1033] 도보 분을 잰 역 이름(≤ 20자) — "지하철 도보 7분(송파역)" */
  nearestStation?: string;
};

/** 저장된 metadata.fieldDetail → FieldDetail(모양이 틀린 키는 버린다) */
export function fieldDetailFromMetadata(meta: unknown): FieldDetail {
  const d = rec(rec(meta)?.fieldDetail);
  const out: FieldDetail = {};
  if (!d) return out;
  for (const g of FIELD_CHOICE_GROUPS) {
    const v = d[g.key];
    if (typeof v === "string" && (g.options as readonly string[]).includes(v)) out[g.key] = v;
  }
  for (const g of FIELD_NUMBER_GROUPS) {
    const v = finite(d[g.key]);
    if (v != null && v >= 0 && v <= g.max) out[g.key] = v;
  }
  if (typeof d.heard === "string" && d.heard.trim()) out.heard = d.heard.trim().slice(0, 200);
  if (typeof d.nearestStation === "string" && d.nearestStation.trim()) out.nearestStation = d.nearestStation.trim().slice(0, 20);
  return out;
}

export function isEmptyFieldDetail(d: FieldDetail): boolean {
  return Object.keys(d).length === 0;
}

/** 저장용 — 빈 값 키 제거. 전부 비면 undefined */
export function fieldDetailForSave(d: FieldDetail): FieldDetail | undefined {
  const o: FieldDetail = {};
  for (const g of FIELD_CHOICE_GROUPS) if (d[g.key]) o[g.key] = d[g.key];
  for (const g of FIELD_NUMBER_GROUPS) {
    const v = d[g.key];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= g.max) o[g.key] = v;
  }
  if (d.heard?.trim()) o.heard = d.heard.trim().slice(0, 200);
  if (d.nearestStation?.trim()) o.nearestStation = d.nearestStation.trim().slice(0, 20);
  return Object.keys(o).length ? o : undefined;
}

/* ── 서버 쪽 정리(POST/PATCH 공통) ───────────────────────────────────────── */

/**
 * [1033] metadata 의 unit · fieldDetail · photoRoles 를 폼과 같은 파서로 거른다(신뢰 경계 — 길이·선택지·역할).
 * 키가 있는데 비었거나(null · {}) 모양이 아니면 키를 **지운다** — PATCH 가 기존 metadata 위에 덮어쓰므로,
 * 수정 화면에서 타입을 비운 것(폼이 null 로 보낸다)이 예전 값으로 되살아나지 않게. 키가 없으면 손대지 않는다.
 */
export function sanitizeUnitMeta(meta: Record<string, unknown>): void {
  if ("unit" in meta) {
    const u = unitForSave(unitFromMetadata({ unit: meta.unit }));
    if (u) meta.unit = u;
    else delete meta.unit;
  }
  if ("fieldDetail" in meta) {
    const d = fieldDetailForSave(fieldDetailFromMetadata({ fieldDetail: meta.fieldDetail }));
    if (d) meta.fieldDetail = d;
    else delete meta.fieldDetail;
  }
  if ("photoRoles" in meta) {
    const r = photoRolesFromMetadata({ photoRoles: meta.photoRoles });
    const kept = Object.fromEntries(Object.entries(r).filter(([url]) => url.length <= 600));
    if (Object.keys(kept).length) meta.photoRoles = kept;
    else delete meta.photoRoles;
  }
}
