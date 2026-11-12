/* [1161 · 정비구역 경계] 서울특별시 「서울시 의제처리구역 위치정보」(서울 열린데이터광장 OA-20957 · 2026-09)의 정비구역 도형을
   지도에 그린다. 자료는 public/data/seoul-zone-shapes.json(좌표 변환 · 화면용 단순화만 한 것 · 법적 효력 없는 참고 자료).
   **지금 진행 중인 구역만** 그린다 — 지도에 찍힌 구역(정리본 40곳 + 국토교통부 목록)의 점이 도형 안에 있거나, 이름이 같고 가까울 때만 짝짓는다.
   순수 규칙(server-only · React 없음) — 지도 화면 · node:test 가 같이 쓴다. */
import { sameZoneKey, zoneNameKey } from "./zone-locate";

export type ZoneShape = { n: string; k: string; c: [number, number]; a: number; p: number[] };
export type ZoneShapeFile = { meta: { source: string; asOf: string; note: string }; zones: ZoneShape[] };

export const ZONE_SHAPES_URL = "/data/seoul-zone-shapes.json";
export const ZONE_SHAPES_CREDIT = "구역 경계 서울특별시 의제처리구역 위치정보(2026-09) · 법적 효력 없는 참고 자료";

/** 점이 고리 안에 있나 — p 는 [경도, 위도, 경도, 위도 …] */
export function pointInShape(lng: number, lat: number, p: readonly number[]): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 두 점 사이 거리(m) — 서울 위도 기준 평면 근사(수 km 안에서 충분) */
export function roughMeters(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const dx = (aLng - bLng) * 88_000;
  const dy = (aLat - bLat) * 111_000;
  return Math.hypot(dx, dy);
}

/** 이름으로 짝지을 때 허용하는 거리 — 구역 대표점과 도형 중심 사이 */
export const SHAPE_NAME_MATCH_M = 1200;

/** 구역 하나의 도형 찾기 — **이름이 같은 도형만**: ① 점을 품는 것(가장 작은 것) ② 가까운 것. 없으면 null(그리지 않는다).
    이름이 다른데 점만 안에 든 도형은 쓰지 않는다 — 대표점이 근사값이라 옆 구역에 들 수 있다(실측: 장위4 → 장위8). */
export function matchZoneShape(zone: { name: string; lat: number; lng: number }, shapes: readonly ZoneShape[]): ZoneShape | null {
  const key = zoneNameKey(zone.name);
  let insideNamed: ZoneShape | null = null;
  let near: { s: ZoneShape; d: number } | null = null;
  for (const s of shapes) {
    const d = roughMeters(zone.lng, zone.lat, s.c[0], s.c[1]);
    if (d > 3000) continue;
    const named = sameZoneKey(key, zoneNameKey(s.n)) !== null;
    if (pointInShape(zone.lng, zone.lat, s.p)) {
      if (named && (!insideNamed || s.a < insideNamed.a)) insideNamed = s;
    } else if (named && d <= SHAPE_NAME_MATCH_M && (!near || d < near.d)) near = { s, d };
  }
  return insideNamed ?? near?.s ?? null;
}
