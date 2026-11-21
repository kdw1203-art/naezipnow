/* [1204 · 1기 신도시 구역 범위] 소유자 2026-11-21 "1기 신도시 등 정비사업 현황 구역표시를 지도에도".
   1기 신도시 선도지구 · 2차 후보(lib/redevelopment/special-zones)는 공식 경계 도형이 공개 자료로 없다 — 지어내지 않는다.
   대신 **그 구역을 이루는 단지들의 실제 좌표**(complex_geocode)를 단지마다 반경 70m 로 넓혀 감싸는 볼록 껍질을 그린다.
   이름은 서울 도형(zone-shapes)과 같은 꼴(ZoneShape)이라 지도의 짝짓기(matchZoneShape)가 그대로 쓴다. 범례에 "단지 위치로 그린 근사"라고 적는다.
   순수 함수(server-only · React 없음) — API 라우트와 node:test 가 같이 쓴다. */
import type { ZoneShape } from "./zone-shapes";

export const NEWTOWN_SHAPES_URL = "/api/redevelopment/newtown-shapes";
export const NEWTOWN_SHAPES_NOTE = "1기 신도시 구역 범위 = 구역 단지 위치로 그린 근사(공식 경계 아님)";
/** 단지 하나를 넓히는 반경(m) — 단지 대표점이 단지 가운데쯤이라 동 몇 개를 덮는 크기 */
export const NEWTOWN_PAD_M = 70;

type Pt = [number, number]; // [lng, lat]

/** 위도 기준 미터 → 도(°) 근사(수 km 안에서 충분) */
function padDeg(lat: number, m: number): { dLng: number; dLat: number } {
  return { dLat: m / 111_000, dLng: m / (111_000 * Math.cos((lat * Math.PI) / 180)) };
}

/** 볼록 껍질(Andrew monotone chain) — 반시계 방향 · 마지막 점은 첫 점과 다르다 */
export function convexHull(points: readonly Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** 넓이(m²) — 신발끈 공식(평면 근사) */
function areaM2(ring: readonly Pt[]): number {
  if (ring.length < 3) return 0;
  const lat0 = ring[0][1];
  const kx = 111_000 * Math.cos((lat0 * Math.PI) / 180);
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += ring[j][0] * kx * (ring[i][1] * 111_000) - ring[i][0] * kx * (ring[j][1] * 111_000);
  }
  return Math.abs(s / 2);
}

/** 구역 하나 — 단지 좌표들 → 도형. 좌표가 하나도 없으면 null(그리지 않는다) */
export function newtownZoneShape(name: string, kind: string, coords: readonly Pt[], padM = NEWTOWN_PAD_M): ZoneShape | null {
  const valid = coords.filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
  if (valid.length === 0) return null;
  const ring: Pt[] = [];
  for (const [lng, lat] of valid) {
    const { dLng, dLat } = padDeg(lat, padM);
    /* 팔각형으로 넓힌다 */
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * Math.PI * 2;
      ring.push([lng + Math.cos(t) * dLng, lat + Math.sin(t) * dLat]);
    }
  }
  const hull = convexHull(ring);
  const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
  const cx = valid.reduce((s, p) => s + p[0], 0) / valid.length;
  const cy = valid.reduce((s, p) => s + p[1], 0) / valid.length;
  return { n: name, k: kind, c: [r6(cx), r6(cy)], a: Math.round(areaM2(hull)), p: hull.flatMap(([x, y]) => [r6(x), r6(y)]) };
}

/** 구역 목록 + 단지 좌표표 → 도형들(좌표 없는 구역은 빠진다) */
export function newtownZoneShapes(
  zones: ReadonlyArray<{ name: string; typeKey: string; regionKey: string; complexes?: readonly string[] }>,
  coordOf: (regionKey: string, complexName: string) => Pt | null,
): ZoneShape[] {
  const out: ZoneShape[] = [];
  for (const z of zones) {
    if (!z.complexes?.length) continue;
    const pts = z.complexes.map((c) => coordOf(z.regionKey, c)).filter((p): p is Pt => p !== null);
    const s = newtownZoneShape(z.name, z.typeKey, pts);
    if (s) out.push(s);
  }
  return out;
}
