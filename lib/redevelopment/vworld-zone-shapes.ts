/* [1206 · 전국 정비구역 경계] 소유자 2026-11-22 "지도에 정비구역 표시는 12월까지 다 수집 · 한 달에 한 번 업데이트".
   서울은 서울시 「의제처리구역 위치정보」(OA-20957 · public/data/seoul-zone-shapes.json)가 정비구역 도형을 준다. 서울 밖은 공개된
   정비구역 경계 파일이 없어, 국토교통부 도시계획정보(UPIS)를 브이월드 2D 데이터 API 로 내려받는 「지구단위계획구역」(LT_C_UPISUQ161) 가운데
   이름(dgm_nm)에 재개발 · 재건축 · 정비구역 · 촉진 · 주거환경 · 도시환경 이 든 것을 쓴다 — 정비구역을 지정할 때 함께 결정되는 지구단위계획구역
   경계라 실제 정비구역과 거의 겹치지만 **같은 것은 아니다**(화면에 "참고 경계"로 적는다).
   결과 꼴은 서울 도형과 같다(ZoneShape) — 지도 화면이 한 규칙(matchZoneShape · historyShapesIn)으로 같이 그린다.
   순수 함수(정규화 · 단순화)와 받기(fetch)를 나눠 node:test 가 순수 쪽을 본다. */
import type { ZoneShape } from "./zone-shapes";

export const VWORLD_ZONE_LAYER = "LT_C_UPISUQ161";
export const VWORLD_ZONE_SHAPES_URL = "/api/redevelopment/vworld-shapes";
/* [1210 · 9] 소규모 정비(가로주택 · 소규모재건축 · 모아타운)도 — 첫 수집 112곳이 큰 정비사업 이름뿐이었다 */
export const VWORLD_ZONE_KEYWORDS = ["재개발", "재건축", "정비구역", "촉진", "주거환경", "도시환경", "가로주택", "소규모주택", "모아타운"] as const;
/** 대한민국 전역(제주 · 울릉 포함) */
export const KOREA_BOX = "BOX(124.5,33.0,131.9,38.7)";
export const VWORLD_ZONE_SHAPES_NOTE =
  "서울 밖 구역 경계는 국토교통부 도시계획정보(브이월드)의 지구단위계획구역 중 정비사업 이름이 든 것 — 정비구역과 거의 겹치는 참고 경계 · 법적 효력 없음";
/** 한 도형의 꼭짓점 상한 — 전국 수천 곳을 한 번에 내려보내므로 화면용으로 줄인다 */
export const MAX_RING_POINTS = 120;

type Ring = number[][];

/** 이름 → 지도 분류 코드(서울 도형의 k 와 같은 체계 — UQ1240 재건축 · UQ5110 촉진 · UQ1211 주거환경 · UQ1222 도시환경 · UQ1221 재개발) */
export function zoneCodeFromName(name: string): string {
  if (/재건축/.test(name)) return "UQ1240";
  if (/촉진/.test(name)) return "UQ5110";
  if (/주거환경/.test(name)) return "UQ1211";
  if (/도시환경|도시정비형/.test(name)) return "UQ1222";
  return "UQ1221";
}

/** 정비사업 이름인가 — 키워드가 이름에 있어야 한다(attrFilter 는 like 라 넓게 걸린다) */
export function isRedevZoneName(name: string): boolean {
  return VWORLD_ZONE_KEYWORDS.some((k) => name.includes(k));
}

/** GeoJSON Polygon/MultiPolygon → 가장 큰 바깥 고리 하나 */
export function largestOuterRing(geometry: unknown): Ring | null {
  const g = geometry as { type?: string; coordinates?: unknown } | null;
  if (!g || !Array.isArray(g.coordinates)) return null;
  const rings: Ring[] = [];
  if (g.type === "Polygon") {
    const r = (g.coordinates as Ring[])[0];
    if (Array.isArray(r)) rings.push(r);
  } else if (g.type === "MultiPolygon") {
    for (const poly of g.coordinates as Ring[][]) if (Array.isArray(poly?.[0])) rings.push(poly[0]);
  } else return null;
  let best: Ring | null = null;
  let bestA = -1;
  for (const r of rings) {
    const a = Math.abs(ringAreaM2(r));
    if (a > bestA) {
      bestA = a;
      best = r;
    }
  }
  return best;
}

/** 고리 넓이(㎡) — 위도에 맞춘 평면 근사(구역 크기에서 충분) */
export function ringAreaM2(r: Ring): number {
  if (r.length < 3) return 0;
  const lat0 = r[0][1] ?? 37;
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110_540;
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    s += (r[j][0] * kx) * (r[i][1] * ky) - (r[i][0] * kx) * (r[j][1] * ky);
  }
  return s / 2;
}

/** 꼭짓점을 고르게 솎아 상한 안으로 · 소수 5자리(≈1m) */
export function simplifyRing(r: Ring, max = MAX_RING_POINTS): number[] {
  const pts = r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r;
  const step = Math.max(1, Math.ceil(pts.length / max));
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += step) out.push(round5(pts[i][0]), round5(pts[i][1]));
  return out;
}

const round5 = (v: number) => Math.round(v * 1e5) / 1e5;

/** 브이월드 지물 하나 → 지도 도형. 서울(시군구 11…)은 서울시 자료를 쓰므로 뺀다 · 정비 이름이 아니면 뺀다 */
export function vworldFeatureToShape(f: { properties?: Record<string, unknown>; geometry?: unknown }): (ZoneShape & { id: string; sgg: string }) | null {
  const p = f.properties ?? {};
  const name = String(p.dgm_nm ?? "").trim();
  const sgg = String(p.signgu_se ?? "").trim();
  if (!name || !isRedevZoneName(name)) return null;
  if (sgg.startsWith("11")) return null;
  const ring = largestOuterRing(f.geometry);
  if (!ring || ring.length < 4) return null;
  const pts = simplifyRing(ring);
  if (pts.length < 6) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < pts.length; i += 2) {
    sx += pts[i];
    sy += pts[i + 1];
  }
  const n = pts.length / 2;
  return {
    id: String(p.present_sn ?? p.wtnnc_sn ?? `${sgg}:${name}`),
    sgg,
    n: name,
    k: zoneCodeFromName(name),
    c: [round5(sx / n), round5(sy / n)],
    a: Math.round(Math.abs(ringAreaM2(ring))),
    p: pts,
  };
}

/** 여러 키워드 결과 합치기 — 같은 구역(id)은 한 번 */
export function mergeShapes<T extends { id: string }>(lists: T[][]): T[] {
  const m = new Map<string, T>();
  for (const l of lists) for (const s of l) if (!m.has(s.id)) m.set(s.id, s);
  return [...m.values()];
}
