/* [1111 · 지도 중심 개편] 지역 고르기 지도 — 순수 함수.
   소유자 2026-11-08: 동네 홈 107곳 나열(시/도별 칩 벽) → "지도를 통해 호갱노노 · 재개발닷컴처럼" 고르기 · "항목이 5개를 넘으면 필터식".
   지역(시 · 구) 107곳을 실지도 위 말풍선(이름 | 값)으로 놓고, 시/도 칩으로 그 시/도 화면 범위로 옮긴다. 값은 화면마다 다르다 —
   동네 홈은 이웃 글 수, 지역 시세 분석은 평균 매매가. 값이 없으면 이름 알약(값을 지어내지 않는다).
   클라이언트 조각(app/components/region/RegionMapPicker)과 서버 조각들이 같은 함수를 쓴다. 단위 테스트가 그대로 부른다. */

import type { MapMarkerData } from "@/components/map/NaverMap";
import { SIDO_ORDER, regionSiseKey, sidoRank } from "@/lib/region/region-sise";

export type RegionMapMarker = {
  id: string;
  /** 카탈로그 이름("강남구" · "성남시 분당구") */
  name: string;
  sido: string;
  lat: number;
  lng: number;
  href: string;
  /** 말풍선 값("글 3" · "27.8억") — 없으면 이름 알약 */
  value?: string | null;
  /** 값 옆 등락(%) — 없으면 생략 */
  deltaPct?: number | null;
  /** 테두리 색(구간 색) — 없으면 기본 */
  tier?: string | null;
  /** 검색 키(정규화) — 이름 · "시/도 이름" · 별칭 */
  keys: string[];
};

export type SidoViewport = { sido: string; count: number; center: { lat: number; lng: number }; level: number };

/** 전국 보기 — 대한민국 중심 근처 · NaverMap level 14(zoom 7) */
export const NATIONAL_VIEW: SidoViewport = { sido: "전국", count: 0, center: { lat: 36.5, lng: 127.8 }, level: 14 };

/** 마커 묶음의 가로 · 세로 너비(km)로 NaverMap level(1~14 · 내부 zoom = 21 − level)을 고른다.
 *  서울 25구(≈30km) → 9(zoom 12 · 구 중심 4~5km 가 130px 쯤 — 이름 알약이 서로 접히지 않는 가장 넓은 눈금 · 600px 높이에 남북 23km) ·
 *  경기 33곳(≈100km) → 11 · 한 곳뿐이면 8. 실측(2026-11-08 로컬 캡처): zoom 11 에서는 도심 구 아홉 곳이 점으로 접혔다. */
export function levelForSpanKm(spanKm: number): number {
  if (!Number.isFinite(spanKm) || spanKm <= 0) return 8;
  if (spanKm <= 12) return 8;
  if (spanKm <= 32) return 9;
  if (spanKm <= 70) return 10;
  if (spanKm <= 140) return 11;
  return 12;
}

/** 시/도별 화면 범위 — 중심은 평균 좌표 · 범위는 가장 먼 두 점. 순서는 SIDO_ORDER(서울 · 경기 · 인천 · 광역시 · 세종) 뒤 이름순. */
export function sidoViewports(markers: readonly RegionMapMarker[]): SidoViewport[] {
  const by = new Map<string, RegionMapMarker[]>();
  for (const m of markers) by.set(m.sido, [...(by.get(m.sido) ?? []), m]);
  return [...by.entries()]
    .sort((a, b) => sidoRank(a[0]) - sidoRank(b[0]) || a[0].localeCompare(b[0], "ko"))
    .map(([sido, list]) => {
      const lats = list.map((m) => m.lat);
      const lngs = list.map((m) => m.lng);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
      const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
      const spanKm = Math.max((maxLat - minLat) * 111, (maxLng - minLng) * 88);
      return { sido, count: list.length, center, level: levelForSpanKm(spanKm) };
    });
}

/** 지도 마커 데이터 — 값이 있으면 호갱노노식 말풍선(이름 | 값 · 등락), 없으면 이름 알약 */
export function toMapMarkerData(m: RegionMapMarker): MapMarkerData {
  if (m.value) {
    return {
      id: m.id,
      lat: m.lat,
      lng: m.lng,
      label: m.name,
      /* NaverMap 은 avgPricePerM2 가 정의돼 있을 때 값 말풍선을 그린다 — 값 글자는 priceLabel 그대로(숫자가 아니어도 된다) */
      avgPricePerM2: 0,
      priceLabel: m.value,
      showName: true,
      ...(m.deltaPct != null && Number.isFinite(m.deltaPct) ? { momPct: m.deltaPct } : {}),
      ...(m.tier ? { tierColor: m.tier } : {}),
      regionName: m.sido,
    };
  }
  return { id: m.id, lat: m.lat, lng: m.lng, label: m.name, regionName: m.sido, ...(m.tier ? { pinColor: m.tier } : {}) };
}

/** 검색 — 앞 일치 먼저 · 두 글자부터 포함 일치(lib/region/region-sise searchRegionSise 와 같은 규칙) */
export function filterRegionMarkers(markers: readonly RegionMapMarker[], query: string, max = 8): RegionMapMarker[] {
  const q = regionSiseKey(query);
  if (!q) return [];
  const starts: RegionMapMarker[] = [];
  const contains: RegionMapMarker[] = [];
  for (const m of markers) {
    if (m.keys.some((k) => k.startsWith(q))) starts.push(m);
    else if (q.length >= 2 && m.keys.some((k) => k.includes(q))) contains.push(m);
  }
  return [...starts, ...contains].slice(0, max);
}

/** 처음 보일 시/도 — 목록에 있으면 그것, 없으면 첫 시/도(서울) */
export function initialSido(viewports: readonly SidoViewport[], want?: string | null): string | null {
  if (viewports.length === 0) return null;
  if (want && viewports.some((v) => v.sido === want)) return want;
  const first = SIDO_ORDER.find((s) => viewports.some((v) => v.sido === s));
  return first ?? viewports[0].sido;
}

/** [1111] 지역 시세 분석의 지도 보기 — 표의 줄(RegionSiseRow)을 말풍선으로. 값 = 평균 매매가(없으면 이름 알약) · 좌표는 카탈로그에서 */
export function regionSiseMapMarkers(
  rows: readonly { id: string; name: string; sido: string; href: string; keys: string[]; avgSaleKrw: number | null; temp: { score: number } | null }[],
  coords: ReadonlyMap<string, { lat: number; lng: number }>,
  formatKrw: (krw: number) => string,
): RegionMapMarker[] {
  const out: RegionMapMarker[] = [];
  for (const r of rows) {
    const c = coords.get(r.id);
    if (!c) continue;
    out.push({
      id: r.id,
      name: r.name,
      sido: r.sido,
      lat: c.lat,
      lng: c.lng,
      href: r.href,
      value: r.avgSaleKrw !== null ? formatKrw(r.avgSaleKrw) : r.temp ? `온도 ${r.temp.score}` : null,
      keys: r.keys,
    });
  }
  return out;
}
