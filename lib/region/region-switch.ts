/* [1122 · 다른 지역 찾기] 소유자 2026-11-09(임장 가이드 48칩 · 강남구 지역 화면 캡처): "목록이 많으면 지도 · 필터 · 검색으로 찾도록,
   하나만 있다면 지도 · 필터 · 검색을 통해 다른 지역도 찾고 분석할 수 있도록". 순수 함수(단위 테스트).
     ① 지역 화면(탭 줄이 있는 일곱 화면)의 "다른 지역 찾기" 지도 말풍선 — 고르면 **지금 보던 탭 그대로** 그 지역으로
        (개요 · 동네 · 월간 리포트 · 시장 온도[기록하는 지역만]. 실거래 구간 · 전월세 · 임장 가이드는 지역마다 슬러그 · 범위가 달라 개요로).
     ② 임장 가이드 목록의 지도 말풍선 — 실거래 구간 지역 이름을 카탈로그 좌표에 대조(값 = 실거래 건수) · 못 맞춘 지역은 따로 돌려준다. */
import type { SeoulDistrictInfo } from "@/lib/map/seoul-districts";
import { regionSiseKey } from "@/lib/region/region-sise";
import type { RegionMapMarker } from "@/lib/region/region-map";
import { catalogIdForTxRegionName, type RegionTabKey } from "@/lib/region/region-tabs";

export function switchHref(tab: RegionTabKey, id: string, hasTemperature: (id: string) => boolean): string {
  const enc = encodeURIComponent(id);
  if (tab === "town") return `/town/${enc}`;
  if (tab === "report") return `/region/${enc}/report`;
  if (tab === "temperature" && hasTemperature(id)) return `/analysis/temperature/${enc}`;
  return `/region/${enc}`;
}

export function regionSwitchMarkers(
  catalog: readonly SeoulDistrictInfo[],
  tab: RegionTabKey,
  hasTemperature: (id: string) => boolean,
): RegionMapMarker[] {
  return catalog
    .filter((r) => !r.retired && Number.isFinite(r.lat) && Number.isFinite(r.lng))
    .map((r) => {
      const sido = r.city ?? "서울";
      return {
        id: r.id,
        name: r.name,
        sido,
        lat: r.lat,
        lng: r.lng,
        href: switchHref(tab, r.id, hasTemperature),
        value: null,
        keys: [...new Set([r.name, `${sido} ${r.name}`, ...(r.aliases ?? [])].map(regionSiseKey).filter(Boolean))],
      };
    });
}

/** "40,914" → "4.1만건" · 만 미만은 그대로 */
export function countShort(n: number): string {
  return n >= 10_000 ? `${(n / 10_000).toFixed(1)}만건` : `${n.toLocaleString("ko-KR")}건`;
}

export type ImjangRegionLike = { slug: string; name: string; txCount: number };

export function imjangMapMarkers(
  regions: readonly ImjangRegionLike[],
  catalog: readonly SeoulDistrictInfo[],
): { markers: RegionMapMarker[]; rest: ImjangRegionLike[] } {
  const byId = new Map(catalog.map((r) => [r.id, r] as const));
  const markers: RegionMapMarker[] = [];
  const rest: ImjangRegionLike[] = [];
  const seen = new Set<string>();
  for (const g of regions) {
    const id = catalogIdForTxRegionName(g.name);
    const c = id ? byId.get(id) : undefined;
    if (!c || c.retired || !Number.isFinite(c.lat) || !Number.isFinite(c.lng) || seen.has(c.id)) {
      rest.push(g);
      continue;
    }
    seen.add(c.id);
    const sido = c.city ?? "서울";
    markers.push({
      id: c.id,
      name: c.name,
      sido,
      lat: c.lat,
      lng: c.lng,
      href: `/imjang/${encodeURIComponent(g.slug)}`,
      value: countShort(g.txCount),
      keys: [...new Set([c.name, `${sido} ${c.name}`, g.name, ...(c.aliases ?? [])].map(regionSiseKey).filter(Boolean))],
    });
  }
  return { markers, rest };
}

/* [1127 · 조서 지도] 서울 자치구 25곳 말풍선 — 값 = 도시계획 결정 조서 건수(seoul_upis_gu_summary). 조서에는 구역 좌표가 없어
   구 중심에 놓는다(구역 경계 지도 아님). 건수를 못 불러왔으면(counts = null) 값 없이 이름 알약만 — 자료가 없어도 지도와 길은 선다.
   건수가 0 인 구도 뺴지 않는다("0건"). 누르면 그 구의 조서 화면(/redevelopment/seoul/[gu]). */
export function upisGuMarkers(
  districts: readonly SeoulDistrictInfo[],
  counts: ReadonlyMap<string, number> | null,
): RegionMapMarker[] {
  return districts
    .filter((d) => !d.retired && Number.isFinite(d.lat) && Number.isFinite(d.lng) && (d.city ?? "서울") === "서울")
    .map((d) => ({
      id: d.id,
      name: d.name,
      sido: "서울",
      lat: d.lat,
      lng: d.lng,
      href: `/redevelopment/seoul/${encodeURIComponent(d.id)}`,
      value: counts ? `${(counts.get(d.name) ?? 0).toLocaleString("ko-KR")}건` : null,
      keys: [...new Set([d.name, `서울 ${d.name}`, ...(d.aliases ?? [])].map(regionSiseKey).filter(Boolean))],
    }));
}

/* [1150 · 정비구역 수 지도] 서울 자치구 25곳 말풍선 — 값 = 국토교통부 공표 정비구역 수(재개발 · 재건축 · 주거환경개선).
   이 자료에도 구역 좌표가 없어 구 중심에 놓는다. 누르면 그 구의 전국 목록(/redev-list). 0곳인 구도 뺴지 않는다. */
export function nationalGuMarkers(districts: readonly SeoulDistrictInfo[], counts: ReadonlyMap<string, number>): RegionMapMarker[] {
  return districts
    .filter((d) => !d.retired && Number.isFinite(d.lat) && Number.isFinite(d.lng) && (d.city ?? "서울") === "서울")
    .map((d) => ({
      id: `nz-${d.id}`,
      name: d.name,
      sido: "서울",
      lat: d.lat,
      lng: d.lng,
      href: `/redev-list?sido=${encodeURIComponent("서울특별시")}&sigungu=${encodeURIComponent(d.name)}`,
      value: `${(counts.get(d.name) ?? 0).toLocaleString("ko-KR")}곳`,
      keys: [...new Set([d.name, `서울 ${d.name}`, ...(d.aliases ?? [])].map(regionSiseKey).filter(Boolean))],
    }));
}
