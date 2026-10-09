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

/**
 * Overpass 질의문 — 반경 안의 역 · 관공서 점(길·건물은 가운데 점).
 * [1052] 서버 쪽 시간 한도 4초 — 우리 쪽 한 곳 대기(area-load 4.5초)보다 짧게 둬서, 바쁜 서버는 끊기기 전에
 * "시간 초과" 표시(remark)를 돌려준다. 응답은 80개로 자른다(out center 80 — 역 6 · 관공서 8 만 쓴다).
 */
export function overpassQuery(lat: number, lng: number, radiusM = AREA_RADIUS_M): string {
  const a = `(around:${radiusM},${lat},${lng})`;
  return `[out:json][timeout:4];(node["railway"="station"]${a};node["station"="subway"]${a};nwr["amenity"~"^(townhall|police|fire_station|post_office|courthouse|library)$"]${a};nwr["office"="government"]${a};);out center 80;`;
}

/**
 * [1052] Overpass 가 HTTP 200 으로 돌려준 "실패" — 있으면 이유, 정상이면 null.
 * 서버가 시간 초과·메모리 부족으로 질의를 멈추면 200 + remark("runtime error: Query timed out …") 에
 * 빈(또는 일부) elements 를 준다. 예전엔 이것을 "주변에 역·관공서 0곳"으로 받아 30일 캐시에 넣었다.
 * elements 배열이 없는 응답도 실패다 — "없음"과 "못 읽음"을 섞지 않는다.
 */
export function overpassFailure(json: unknown): string | null {
  if (!json || typeof json !== "object") return "Overpass 응답 형식 아님";
  const j = json as { remark?: unknown; elements?: unknown };
  if (typeof j.remark === "string" && /runtime error|timed out|timeout|out of memory|rate.?limit/i.test(j.remark)) {
    return `Overpass ${j.remark.slice(0, 120)}`;
  }
  if (!Array.isArray(j.elements)) return "Overpass 응답에 elements 없음";
  return null;
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

/* ── [1052] 화면 표기 규칙(정직한 이름표) ─────────────────────────────── */

/** 거리는 전부 두 점 사이의 직선 거리다(길 따라 잰 것이 아니다) — 숫자 앞에 그렇게 적는다 */
export function formatStraightDistance(m: number): string {
  return `직선 ${formatDistance(m)}`;
}

/** 직선 거리로 셈한 걷는 시간은 실제보다 짧다(길은 돌아간다) — "이상"으로 적는다. 분당 80m */
export function walkMinutesAtLeast(m: number): string {
  return `도보 ${Math.max(1, Math.round(m / 80))}분 이상`;
}

/** 이보다 덜 닮았으면 "유사 단지"라고 부르지 않는다(0 = 다름 · 1 = 같음) */
export const SIMILARITY_MIN = 0.3;

export type SimilarBasis = "similar" | "nearest";

/**
 * 유사 단지 목록을 화면에 올릴 때의 이름과 항목.
 *  · 닮음 점수가 하나라도 있으면(이 단지 시세를 안다) "similar" — 점수 SIMILARITY_MIN 미만 · 점수 없는 단지는 뺀다.
 *  · 점수가 하나도 없으면(이 단지 시세를 모른다) "nearest" — 닮은 순이 아니라 가까운 순이므로 그렇게 부른다.
 */
export function similarView(list: AreaComplex[]): { basis: SimilarBasis; items: AreaComplex[] } {
  const scored = list.some((c) => c.similarity !== null);
  if (!scored) return { basis: "nearest", items: list };
  return { basis: "similar", items: list.filter((c) => c.similarity !== null && c.similarity >= SIMILARITY_MIN) };
}

/** 겹 이름 — 가까운 순이면 "주변 단지"(닮았다고 말하지 않는다) */
export function similarLayerLabel(basis: SimilarBasis): string {
  return basis === "similar" ? "유사 단지" : "주변 단지";
}

export type AreaLayer = "similar" | "stations" | "offices";

/**
 * 겹 단추 옆 숫자. 아직 읽는 중이면 null(숫자 없음) · 그 원천을 못 읽었으면 "—".
 * 못 읽은 것을 0 으로 적으면 "주변에 하나도 없다"로 읽힌다.
 */
export function areaLayerCount(data: AreaData | null, layer: AreaLayer, radiusM: number): string | null {
  if (!data) return null;
  if (data.missing.includes(layer === "similar" ? "similar" : "osm")) return "—";
  const list = layer === "similar" ? similarView(data.similar).items : layer === "stations" ? data.stations : data.offices;
  return String(list.filter((x) => x.distanceM <= radiusM).length);
}

/**
 * 다시 불러온 응답을 합친다 — 원천별로 읽은 쪽을 남긴다.
 * 예전 자동 재시도는 역·관공서만 보고 응답 전체를 바꿔 끼워, 처음엔 읽었던 유사 단지가 재시도에서
 * 실패하면 사라졌다.
 */
export function mergeAreaData(prev: AreaData | null, next: AreaData): AreaData {
  if (!prev) return next;
  const has = (d: AreaData, src: string) => !d.missing.includes(src);
  const sim = has(next, "similar") || !has(prev, "similar") ? next : prev;
  const osm = has(next, "osm") || !has(prev, "osm") ? next : prev;
  const missing = [
    ...(has(sim, "similar") ? [] : ["similar"]),
    ...(has(osm, "osm") ? [] : ["osm"]),
    ...next.missing.filter((m) => m !== "similar" && m !== "osm"),
  ];
  return { ...next, similar: sim.similar, stations: osm.stations, offices: osm.offices, missing };
}
