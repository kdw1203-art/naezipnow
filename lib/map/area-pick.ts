/**
 * [1047 · 단지 위치 지도] 반경 안의 역 · 관공서 · 유사 단지 고르기 — 순수(단위 시험 대상).
 *
 * 소유자 지시(2026-10-09): "단지를 검색하면 지도에서 위치를 보여주고(오른쪽 레일), 확대·축소, 인근 반경 범위,
 * 유사 단지나 전철역, 관공서 위치도 간단하게".
 *
 * 원천
 *  · 역 · 관공서: OpenStreetMap(Overpass) — 공공 POI 표(poi_stations)는 아직 비어 있다(공공데이터 활용신청 대기).
 *    지도 아래에 "© OpenStreetMap 기여자"를 적는다(ODbL 표시 의무).
 *  · 유사 단지: 우리 표(map_price_point_source · 국토부 매매 실거래 집계 + 단지 좌표) — 지도 시세 색과 같은 원천.
 */

export const AREA_RADIUS_M = 1000;
export const AREA_RADII_M = [500, 1000] as const;

export type AreaPoint = { name: string; lat: number; lng: number; distanceM: number };
export type AreaStation = AreaPoint & { line: string | null };
export type AreaOffice = AreaPoint & { kind: string };
export type AreaComplex = AreaPoint & {
  regionName: string;
  avgPerPyeongKrw: number | null;
  buildYear: number | null;
  households: number | null;
  /** 이 단지와 얼마나 닮았나 — 0(다름)~1(같음). 기준이 없으면 null */
  similarity: number | null;
};

export type AreaData = {
  center: { lat: number; lng: number };
  radiusM: number;
  similar: AreaComplex[];
  stations: AreaStation[];
  offices: AreaOffice[];
  /** 원천별로 못 읽은 것 — "없음"과 "못 읽음"을 구분한다 */
  missing: string[];
};

export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/** 한국 영역 안의 좌표만(지도 화면 /map 의 검사와 같은 범위) */
export function isKoreaCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
}

/** 캐시 열쇠용 반올림(약 11m) — 같은 단지의 요청이 CDN 한 칸에 모인다 */
export function roundCoord(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}

/* ── OpenStreetMap ─────────────────────────────────────────────────────── */

export type OsmElement = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string | undefined>;
};

/** 관공서 종류 이름 — 태그에서. 해당 없으면 null(지도에 올리지 않는다) */
export function officeKind(tags: Record<string, string | undefined>): string | null {
  const a = tags.amenity;
  if (a === "townhall") return "주민센터·청사";
  if (a === "police") return "경찰";
  if (a === "fire_station") return "소방";
  if (a === "post_office") return "우체국";
  if (a === "courthouse") return "법원";
  if (a === "library") return "도서관";
  if (tags.office === "government") return "관공서";
  return null;
}

export function isStationTags(tags: Record<string, string | undefined>): boolean {
  return (
    tags.railway === "station" ||
    tags.station === "subway" ||
    (tags.public_transport === "station" && (tags.subway === "yes" || tags.train === "yes"))
  );
}

function osmName(tags: Record<string, string | undefined>): string {
  return (tags["name:ko"] || tags.name || "").trim();
}

/**
 * Overpass 응답 → 반경 안의 역(가까운 순 최대 6) · 관공서(가까운 순 최대 8).
 * 같은 이름의 역(출입구·플랫폼이 따로 잡힌 것)은 가장 가까운 하나만. 이름 없는 점은 버린다.
 */
export function parseOverpass(
  elements: OsmElement[],
  center: { lat: number; lng: number },
  radiusM = AREA_RADIUS_M,
): { stations: AreaStation[]; offices: AreaOffice[] } {
  const stations = new Map<string, AreaStation>();
  const offices = new Map<string, AreaOffice>();
  for (const el of elements) {
    const tags = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const name = osmName(tags);
    if (!name || typeof lat !== "number" || typeof lng !== "number") continue;
    const d = distanceM(center.lat, center.lng, lat, lng);
    if (d > radiusM) continue;
    if (isStationTags(tags)) {
      const key = name.replace(/역$/, "");
      const prev = stations.get(key);
      if (!prev || d < prev.distanceM) {
        stations.set(key, { name: /역$/.test(name) ? name : `${name}역`, lat, lng, distanceM: d, line: (tags.line || tags["subway:line"] || null) ?? null });
      }
      continue;
    }
    const kind = officeKind(tags);
    if (kind) {
      const prev = offices.get(name);
      if (!prev || d < prev.distanceM) offices.set(name, { name, lat, lng, distanceM: d, kind });
    }
  }
  return {
    stations: [...stations.values()].sort((a, b) => a.distanceM - b.distanceM).slice(0, 6),
    offices: [...offices.values()].sort((a, b) => a.distanceM - b.distanceM).slice(0, 8),
  };
}

/** Overpass 질의문 — 반경 안의 역 · 관공서 점(길·건물은 가운데 점) */
export function overpassQuery(lat: number, lng: number, radiusM = AREA_RADIUS_M): string {
  const a = `(around:${radiusM},${lat},${lng})`;
  return `[out:json][timeout:8];(node["railway"="station"]${a};node["station"="subway"]${a};nwr["amenity"~"^(townhall|police|fire_station|post_office|courthouse|library)$"]${a};nwr["office"="government"]${a};);out center 80;`;
}

/* ── 유사 단지 ─────────────────────────────────────────────────────────── */

export type ComplexCandidate = {
  regionName: string;
  complexName: string;
  lat: number;
  lng: number;
  avgPerPyeongKrw: number | null;
  buildYear: number | null;
  households: number | null;
};

/**
 * 반경 안 단지 중 "이 단지와 닮은" 순 최대 limit 곳.
 * 닮음 = 평당 실거래가 차이(±30% 안에서 0~1) × 0.6 + 준공 연도 차이(±10년 안에서 0~1) × 0.4.
 * 이 단지의 값을 모르면(자기 행이 없으면) 가까운 순. 자기 자신(같은 이름 · 40m 안)은 뺀다.
 */
export function pickSimilarComplexes(
  rows: ComplexCandidate[],
  self: { name: string; lat: number; lng: number; buildYear?: number | null },
  limit = 6,
  radiusM = AREA_RADIUS_M,
): AreaComplex[] {
  const norm = (s: string) => s.replace(/\s+/g, "");
  const within = rows
    .map((r) => ({ r, d: distanceM(self.lat, self.lng, r.lat, r.lng) }))
    .filter((x) => x.d <= radiusM);
  const selfRow = within
    .filter((x) => norm(x.r.complexName) === norm(self.name))
    .sort((a, b) => a.d - b.d)[0]?.r;
  const basePrice = selfRow?.avgPerPyeongKrw ?? null;
  const baseYear = self.buildYear ?? selfRow?.buildYear ?? null;
  const others = within.filter((x) => !(norm(x.r.complexName) === norm(self.name) || x.d < 40));
  const scored = others.map(({ r, d }) => {
    let score: number | null = null;
    if (basePrice && r.avgPerPyeongKrw) {
      const diff = Math.abs(r.avgPerPyeongKrw - basePrice) / basePrice;
      const p = Math.max(0, 1 - diff / 0.3);
      const y = baseYear && r.buildYear ? Math.max(0, 1 - Math.abs(r.buildYear - baseYear) / 10) : p;
      score = Math.round((p * 0.6 + y * 0.4) * 100) / 100;
    }
    return { r, d, score };
  });
  const hasScores = scored.some((s) => s.score !== null);
  scored.sort((a, b) =>
    hasScores ? (b.score ?? -1) - (a.score ?? -1) || a.d - b.d : a.d - b.d,
  );
  return scored.slice(0, Math.max(0, limit)).map(({ r, d, score }) => ({
    name: r.complexName,
    regionName: r.regionName,
    lat: r.lat,
    lng: r.lng,
    distanceM: d,
    avgPerPyeongKrw: r.avgPerPyeongKrw,
    buildYear: r.buildYear,
    households: r.households,
    similarity: score,
  }));
}

/** 거리 표기 — 1km 미만은 m, 이상은 0.1km */
export function formatDistance(m: number): string {
  if (m >= 1000) return m % 1000 === 0 ? `${m / 1000}km` : `${(m / 1000).toFixed(1)}km`;
  return `${Math.round(m)}m`;
}
