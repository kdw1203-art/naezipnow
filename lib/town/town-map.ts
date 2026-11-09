/* [1111 · 지도 중심 개편] 동네 홈 고르기 지도의 마커 — 순수 함수(단위 테스트 대상).
   카탈로그 107곳(폐지 제외) → 말풍선. 값은 **이 피드에 실린 이웃 글 수**(그 동네의 전체 글이 아니다 — 화면 범례에도 그렇게 적는다).
   글이 0건이면 값을 적지 않는다(이름 알약) — "글 0"을 107곳에 깔지 않는다. 동명 구(중구 · 서구 · 북구 …)는 시/도까지 맞아야 센다. */
import type { SeoulDistrictInfo } from "@/lib/map/seoul-districts";
import { regionSiseKey } from "@/lib/region/region-sise";
import type { RegionMapMarker } from "@/lib/region/region-map";

export type TownCardLike = { region?: string | null };

/** 카드의 지역 표기("서울 마포구" · "경기 성남시 분당구" · "전국")가 이 카탈로그 지역을 뜻하는가 — 시/도 + 이름의 모든 토막 */
export function cardMatchesRegion(cardRegion: string | null | undefined, sido: string, name: string): boolean {
  const r = regionSiseKey(cardRegion ?? "");
  if (!r || r === "전국") return false;
  const parts = name.split(/\s+/).filter(Boolean).map(regionSiseKey);
  if (!parts.every((p) => r.includes(p))) return false;
  /* 시/도 토막이 적혀 있으면 맞아야 한다("부산 중구" 는 서울 중구가 아니다) — 시/도 없이 "마포구"만 적힌 카드는 이름으로만 */
  const sidoKey = regionSiseKey(sido);
  const mentionsOtherSido = ["서울", "경기", "인천", "부산", "대구", "대전", "광주", "울산", "세종"].some((s) => s !== sidoKey && r.startsWith(s));
  return !mentionsOtherSido;
}

export function townMapMarkers(catalog: readonly SeoulDistrictInfo[], cards: readonly TownCardLike[]): RegionMapMarker[] {
  return catalog
    .filter((r) => !r.retired && Number.isFinite(r.lat) && Number.isFinite(r.lng))
    .map((r) => {
      const sido = r.city ?? "서울";
      const n = cards.filter((c) => cardMatchesRegion(c.region, sido, r.name)).length;
      return {
        id: r.id,
        name: r.name,
        sido,
        lat: r.lat,
        lng: r.lng,
        href: `/town/${encodeURIComponent(r.id)}`,
        value: n > 0 ? `글 ${n.toLocaleString("ko-KR")}` : null,
        keys: [...new Set([r.name, `${sido} ${r.name}`, ...(r.aliases ?? [])].map(regionSiseKey).filter(Boolean))],
      };
    });
}
