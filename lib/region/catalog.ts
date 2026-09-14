// ─── 지역 마스터(SSOT) ────────────────────────────────────────
// 지역 식별·정규화의 단일 출처. 좌표·이름은 seoul-districts 에 두고,
// 여기서는 "정규화 키"와 "카탈로그 조회"를 한 곳으로 모은다.
// 시세는 이 카탈로그가 알지 못한다 — lib/map/region-market.ts 또는
// lib/market/store.ts 로 실데이터를 조인해서 얻는다(사실 우선).

import {
  METRO_EXPLORE_DISTRICTS,
  METRO_CITY_DISTRICTS,
  SEOUL_DISTRICTS,
  type SeoulDistrictInfo,
} from "@/lib/map/seoul-districts";

/** 서울 25구 + 수도권 권역을 합친 정식 지역 카탈로그. */
export const REGION_CATALOG: SeoulDistrictInfo[] = [
  ...SEOUL_DISTRICTS,
  ...METRO_EXPLORE_DISTRICTS,
  /* [945] 5대 광역시 39개 구·군 — 실사용50 #4 전국 확장 1차 */
  ...METRO_CITY_DISTRICTS,
];

/** [999] 목록·내비에 보일 항목 — 폐지(`retired`) 지역은 뺀다. 조회(id·이름)는 REGION_CATALOG 그대로. */
export const ACTIVE_REGION_CATALOG: SeoulDistrictInfo[] = REGION_CATALOG.filter((r) => !r.retired);

/**
 * 지역명 정규화 키 — 공백·행정구역 접미사 제거 + 소문자화.
 * 검색 매칭·구 비교·카탈로그 조회의 단일 기준. (특별시/광역시/특별자치시/특별자치도)
 */
export function normalizeRegionKey(value: string): string {
  return value
    .replace(/\s+/g, "")
    .replace(/특별시|광역시|특별자치시|특별자치도/g, "")
    .toLowerCase();
}

const CATALOG_BY_KEY = new Map(
  REGION_CATALOG.map((info) => [normalizeRegionKey(info.name), info]),
);

const CATALOG_BY_ID = new Map(REGION_CATALOG.map((info) => [info.id, info]));

/** [998] 항목 자체의 별칭(SeoulDistrictInfo.aliases) → 항목. 정식 이름 키와 겹치면 정식 이름이 이긴다. */
const CATALOG_BY_ALIAS_KEY = new Map<string, SeoulDistrictInfo>(
  REGION_CATALOG.flatMap((info) =>
    (info.aliases ?? [])
      .map((a) => normalizeRegionKey(a))
      .filter((k) => k && !CATALOG_BY_KEY.has(k))
      .map((k) => [k, info] as const),
  ),
);

/** [998] 이 항목을 뜻하는 정규화 키 전부(정식 이름 + aliases) — "정확 일치" 판정용. */
export function catalogNameKeys(info: SeoulDistrictInfo): Set<string> {
  return new Set([info.name, ...(info.aliases ?? [])].map((n) => normalizeRegionKey(n)).filter(Boolean));
}

/** [#54] 통용 지명·신도시 별칭 → 카탈로그 id.
 *  뉴스 region 값의 미매핑 상위 실측(2026-08-23)에서 확실한 것만 넣는다 —
 *  틀린 연결은 미연결보다 나쁘다. 모호한 지명(위례·광교 등 복수 행정구 걸침)은
 *  대표 행정구가 사회적으로 합의된 경우만 포함. */
const REGION_ALIASES: Record<string, string> = {
  평촌: "anyang-dongan",
  평촌신도시: "anyang-dongan",
  판교: "seongnam-bundang",
  목동: "yangcheon",
  마곡: "gangseo",
  송도: "incheon-yeonsu",
  /* [998] 2026-07 인천 서구 분구 — 청라·가정·석남은 서해구, 검단은 검단구, 영종도는 영종구 */
  청라: "incheon-seohae",
  검단: "incheon-geomdan",
  검단신도시: "incheon-geomdan",
  영종: "incheon-yeongjong",
  영종도: "incheon-yeongjong",
  미사: "hanam",
  별내: "namyangju",
  다산: "namyangju",
  광교: "suwon-yeongtong",
};

/** 구/시명으로 카탈로그 항목 조회 (정확 → 항목 별칭 → 통용 지명 → 부분 일치). */
export function findCatalogRegionByName(
  query: string,
): SeoulDistrictInfo | undefined {
  const key = normalizeRegionKey(query.trim());
  if (!key) return undefined;
  const exact = CATALOG_BY_KEY.get(key) ?? CATALOG_BY_ALIAS_KEY.get(key);
  if (exact) return exact;
  const aliasId = REGION_ALIASES[key];
  if (aliasId) return CATALOG_BY_ID.get(aliasId);
  return REGION_CATALOG.find((info) => {
    const k = normalizeRegionKey(info.name);
    return k.includes(key) || key.includes(k);
  });
}

/** 카탈로그 id로 조회. */
export function findCatalogRegionById(
  id: string,
): SeoulDistrictInfo | undefined {
  return CATALOG_BY_ID.get(id);
}

/** [998] 폐지 지역의 후속 항목들(카탈로그에 실제로 있는 것만, 선언 순서). 폐지 지역이 아니면 빈 배열. */
export function findCatalogSuccessors(id: string): SeoulDistrictInfo[] {
  const info = CATALOG_BY_ID.get(id);
  if (!info?.retired) return [];
  return (info.successors ?? [])
    .map((sid) => CATALOG_BY_ID.get(sid))
    .filter((s): s is SeoulDistrictInfo => s !== undefined);
}

/** 구/시명 → 정식 지역 id. 매칭 실패 시 null. */
export function regionIdForName(query: string): string | null {
  return findCatalogRegionByName(query)?.id ?? null;
}
