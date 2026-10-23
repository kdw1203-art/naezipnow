/**
 * [1086 · 서울 3D] OpenFreeMap "liberty" 스타일 → 내집나우 3D 동네 지도 스타일(순수 변환 · 테스트한다).
 *
 * 원천: https://tiles.openfreemap.org/styles/liberty (OpenMapTiles 스키마 · OpenStreetMap 데이터 · 키 없음 · 출처 표기 필수).
 * 바꾸는 것:
 *  - 글자: 라틴 표기 병기("Guryong Station 구룡역") → 한국어 이름 하나(name:ko → name:nonlatin → name)
 *  - 끄는 층: 일반 POI(가게·식당 등 r1·r7·r20) · 일방통행 화살표 · 미국식 도로 방패 · 공항 — 동네 3D 에서는 잡음
 *  - 역(poi_transit): 철도·지하철만(버스 정류장 제외) — 이름표는 화면이 따로 그린다(단지 수를 붙이려고) → 타일 층은 숨김
 *  - 학교: poi 층의 school 을 한국어 이름표로(nz-school)
 *  - 색: 화면 토큰(palette — 다크 모드 포함)을 그대로 받는다. 건물은 중립색 · 단지 색칠은 화면이 위에 따로 올린다(nz-complex-3d)
 * 원본 객체를 바꾸지 않는다(깊은 복사).
 */

export type Map3DPalette = {
  bg: string;
  water: string;
  park: string;
  road: string;
  roadCasing: string;
  building: string;
  text: string;
  textHalo: string;
  school: string;
};

type Layer = {
  id: string;
  type: string;
  source?: string;
  "source-layer"?: string;
  filter?: unknown;
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
  minzoom?: number;
  maxzoom?: number;
};

export type StyleSpecLite = {
  version: number;
  sources: Record<string, unknown>;
  layers: Layer[];
  glyphs?: string;
  sprite?: string;
  [k: string]: unknown;
};

export const KOREAN_NAME: unknown[] = ["coalesce", ["get", "name:ko"], ["get", "name:nonlatin"], ["get", "name"]];

/** 숨길 타일 층 id(있으면) */
export const HIDDEN_LAYER_IDS = [
  "poi_r1",
  "poi_r7",
  "poi_r20",
  "poi_transit",
  "road_one_way_arrow",
  "road_one_way_arrow_opposite",
  "highway-shield-us-interstate",
  "road_shield_us",
  "airport",
  "natural_earth",
] as const;

function usesLatinName(tf: unknown): boolean {
  const s = JSON.stringify(tf ?? null);
  return s.includes("name:latin") || s.includes("name:nonlatin") || s.includes('"name"');
}

export function tuneLibertyStyle(input: StyleSpecLite, p: Map3DPalette): StyleSpecLite {
  const style = JSON.parse(JSON.stringify(input)) as StyleSpecLite;
  const hidden = new Set<string>(HIDDEN_LAYER_IDS);
  const layers: Layer[] = [];
  for (const l of style.layers) {
    if (hidden.has(l.id)) continue;
    const layout = { ...(l.layout ?? {}) };
    const paint = { ...(l.paint ?? {}) };
    if (l.type === "symbol" && usesLatinName(layout["text-field"]) && !JSON.stringify(layout["text-field"]).includes('"ref"')) {
      layout["text-field"] = KOREAN_NAME;
      paint["text-color"] = p.text;
      paint["text-halo-color"] = p.textHalo;
      paint["text-halo-width"] = 1.4;
    }
    if (l.id === "background") paint["background-color"] = p.bg;
    if (l.id === "water") paint["fill-color"] = p.water;
    if (l.id === "park") {
      paint["fill-color"] = p.park;
      paint["fill-opacity"] = 0.85;
      delete paint["fill-outline-color"];
    }
    if (l.id === "landcover_wood" || l.id === "landcover_grass") paint["fill-color"] = p.park;
    if (l.id === "building") paint["fill-color"] = p.building;
    if (l.id === "building-3d") {
      paint["fill-extrusion-color"] = p.building;
      paint["fill-extrusion-opacity"] = 0.9;
    }
    if (l.type === "line" && /^road_(minor|secondary_tertiary|trunk_primary|link|service_track)$/.test(l.id)) paint["line-color"] = p.road;
    if (l.type === "line" && /^road_.*_casing$/.test(l.id)) paint["line-color"] = p.roadCasing;
    layers.push({ ...l, layout, paint });
  }
  /* 학교 이름표 — 건물 위에 그린다(맨 끝 = 맨 위) */
  layers.push({
    id: "nz-school",
    type: "symbol",
    source: "openmaptiles",
    "source-layer": "poi",
    minzoom: 13.5,
    filter: ["==", ["get", "class"], "school"],
    layout: {
      "text-field": KOREAN_NAME,
      "text-size": 12,
      "text-font": ["Noto Sans Bold"],
      "text-anchor": "center",
      "text-max-width": 8,
      "text-allow-overlap": false,
      "symbol-sort-key": 2,
    },
    paint: { "text-color": p.school, "text-halo-color": p.textHalo, "text-halo-width": 1.8 },
  });
  return { ...style, layers };
}

/** 화면이 그리는 건물 층 — 타일 건물(높이 render_height)을 모두 옮겨 담고 단지 것만 색을 바꾼다(타일의 building-3d 는 숨긴다 · 두 층을 겹치면 벽이 줄무늬로 깜빡인다) */
export function complexExtrusionLayer(id = "nz-complex-3d", source = "nz-complex-buildings"): Layer {
  return {
    id,
    type: "fill-extrusion",
    source,
    paint: {
      "fill-extrusion-color": ["get", "color"],
      "fill-extrusion-height": ["get", "h"],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.95,
    },
  };
}
