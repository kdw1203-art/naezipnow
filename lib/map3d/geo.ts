/**
 * [1086 · 서울 3D] 3D 동네 지도의 순수 계산 — 브라우저 없이 테스트한다.
 *
 * 화면이 하는 일: 건물(OpenStreetMap · OpenFreeMap 벡터 타일의 building 층 · 높이 render_height)을 세우고,
 * 우리 단지(국토교통부 실거래 집계 · 단지 좌표)를 이름표로 올린 뒤, **단지 좌표 반경 안의 고층 건물**을 그 단지 색으로 칠한다.
 *
 * 칠하기 규칙(추정 — 화면에 그렇게 적는다):
 *  - 건물 높이가 HIGHRISE_MIN_M(15m · 대략 5층) 이상이어야 후보(단독주택·상가는 칠하지 않는다).
 *  - 건물 중심이 단지 좌표에서 radiusFor(세대수) 안이어야 한다. 세대수가 클수록 넓다(70~260m).
 *  - 여러 단지 반경에 걸치면 **가장 가까운 단지** 하나만(겹쳐 칠하지 않는다).
 *  - 세대수를 모르면 기본 반경(110m).
 * 값(가격)은 건물 모양에 영향을 주지 않는다 — 색 단계만 정한다(priceBand).
 */

export type LngLat = [number, number];

export type Map3DComplex = {
  /** 단지 화면 주소(complexHrefFromNames) — 화면에서 열기 · 고유 키로도 쓴다 */
  href: string;
  name: string;
  region: string;
  lat: number;
  lng: number;
  households: number | null;
  buildYear: number | null;
  /** 평당 평균 매매가(원) — 국토교통부 신고 · 집계 기간은 API 가 함께 준다 */
  avgPerPyeongKrw: number | null;
  /** 집계 기간 매매 건수 */
  txCount: number;
  /** 이 동 소속인가(아니면 주변 단지 — 흐리게) */
  inDong: boolean;
};

/** API(/api/map/3d) 응답 — 서버(lib/map3d/load)와 화면이 같이 쓴다 */
export type Map3DPayload = {
  region: string;
  dong: string;
  center: { lat: number; lng: number };
  complexes: Map3DComplex[];
  /** 실거래 집계 기간(이 동 단지들의 첫 달 ~ 마지막 달 · "202101") */
  period: { from: string | null; to: string | null };
};

export type BuildingLite = {
  /** 건물 다각형의 바깥 고리(경도·위도) */
  ring: LngLat[];
  heightM: number;
};

export const HIGHRISE_MIN_M = 15;
export const DEFAULT_RADIUS_M = 110;

const EARTH_R = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** 세대수 → 칠하기 반경(m). 1,000세대 ≈ 141m · 5,000세대 ≈ 260m(상한) · 100세대 ≈ 72m */
export function radiusFor(households: number | null | undefined): number {
  if (!(typeof households === "number" && households > 0)) return DEFAULT_RADIUS_M;
  return Math.round(Math.min(260, Math.max(70, 40 + Math.sqrt(households) * 3.2)));
}

/** 다각형 바깥 고리의 면적 가중 중심(작은 동네 범위라 평면 근사) — 퇴화 고리면 꼭짓점 평균 */
export function ringCentroid(ring: LngLat[]): { lat: number; lng: number } | null {
  const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  if (pts.length === 0) return null;
  /* 첫 꼭짓점 기준으로 옮겨 계산한다 — 경도 127 · 위도 37 을 그대로 곱하면 건물 크기(1e-4°) 차이가 반올림에 묻혀
     중심이 수 m~10m 어긋났다(테스트에서 발견) */
  const [ox, oy] = pts[0];
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const x0 = pts[i][0] - ox;
    const y0 = pts[i][1] - oy;
    const x1 = pts[(i + 1) % pts.length][0] - ox;
    const y1 = pts[(i + 1) % pts.length][1] - oy;
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-18) {
    const sx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const sy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    return { lng: sx, lat: sy };
  }
  return { lng: ox + cx / (3 * a), lat: oy + cy / (3 * a) };
}

/**
 * 건물 → 단지 배정. 돌려주는 배열은 buildings 와 같은 길이 — 배정 안 된 건물은 null.
 * 단지가 많아도 빠르게: 위도·경도 칸(약 300m)으로 나눠 이웃 칸만 본다.
 */
export function assignBuildings(buildings: BuildingLite[], complexes: Map3DComplex[]): (string | null)[] {
  const CELL = 0.003;
  const key = (lat: number, lng: number) => `${Math.floor(lat / CELL)}:${Math.floor(lng / CELL)}`;
  const grid = new Map<string, Map3DComplex[]>();
  for (const c of complexes) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
    const k = key(c.lat, c.lng);
    const list = grid.get(k);
    if (list) list.push(c);
    else grid.set(k, [c]);
  }
  return buildings.map((b) => {
    if (!(b.heightM >= HIGHRISE_MIN_M)) return null;
    const c0 = ringCentroid(b.ring);
    if (!c0) return null;
    const gy = Math.floor(c0.lat / CELL);
    const gx = Math.floor(c0.lng / CELL);
    let best: { href: string; d: number } | null = null;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const c of grid.get(`${gy + dy}:${gx + dx}`) ?? []) {
          const d = distanceM(c0, c);
          if (d <= radiusFor(c.households) && (!best || d < best.d || (d === best.d && c.href < best.href))) best = { href: c.href, d };
        }
      }
    }
    return best ? best.href : null;
  });
}

/** 평당 평균 매매가 단계(0~4) — 서울 분포(평당 2천만~2억)에 맞춘 경계: 4천만 미만 · 4천만~6천만 · 6천만~8천만 · 8천만~1.2억 · 1.2억 이상 */
export const PRICE_BAND_EDGES_KRW = [40_000_000, 60_000_000, 80_000_000, 120_000_000] as const;
export const PRICE_BAND_LABELS = ["평당 4천만 미만", "4천만~6천만", "6천만~8천만", "8천만~1.2억", "1.2억 이상"] as const;

export function priceBand(avgPerPyeongKrw: number | null | undefined): number | null {
  if (!(typeof avgPerPyeongKrw === "number" && avgPerPyeongKrw > 0)) return null;
  let b = 0;
  for (const edge of PRICE_BAND_EDGES_KRW) if (avgPerPyeongKrw >= edge) b++;
  return b;
}

/** 역 이름 옆 숫자 — 역에서 걸어서(직선 radiusM) 닿는 이 동 단지 수 */
export function complexesNear(point: { lat: number; lng: number }, complexes: Map3DComplex[], radiusM = 600): number {
  return complexes.filter((c) => c.inDong && distanceM(point, c) <= radiusM).length;
}

/** 단지들의 가운데(중앙값 — 멀리 떨어진 한 단지에 끌려가지 않게) */
export function medianCenter(points: { lat: number; lng: number }[]): { lat: number; lng: number } | null {
  const ok = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (ok.length === 0) return null;
  const mid = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  return { lat: mid(ok.map((p) => p.lat)), lng: mid(ok.map((p) => p.lng)) };
}

/** 3D 지도 주소 — 동 단위(서울 우선). focus 는 처음 고를 단지 화면 주소 */
export function map3dPath(region: string, dong: string, focusHref?: string | null): string {
  const sp = new URLSearchParams({ region, dong });
  if (focusHref) sp.set("focus", focusHref);
  return `/map/3d?${sp.toString()}`;
}

/** 3D 지도를 여는 지역 — 서울(소유자 요청 "서울권") */
export function map3dSupported(region: string | null | undefined): boolean {
  return typeof region === "string" && /^서울(특별시)?\s/.test(region.trim());
}
