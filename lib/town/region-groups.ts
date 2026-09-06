/**
 * [970 · C-17] 동네 홈 인덱스 — REGION_CATALOG 를 시·도별로 묶는다.
 *
 * 왜: 동네 홈(/town/[region])은 카탈로그 100여 곳이 전부 정적 생성돼 있는데,
 * 화면에서 닿는 건 /town 의 바로가기 8곳 + 각 동네 홈 하단 "다른 동네" 16곳뿐이었다.
 * 나머지는 주소를 직접 쳐야만 열리는 고아 페이지였다. 시·도 그룹(details)으로
 * 전량을 접어 두면 첫 화면 위에 요소를 끼워 넣지 않고도(LCP 보호) 전부 닿는다.
 *
 * 순수 함수 — 서버·클라이언트 어디서든 import 가능(server-only 없음).
 */
import { REGION_CATALOG } from "@/lib/region/catalog";
import type { SeoulDistrictInfo } from "@/lib/map/seoul-districts";

export type RegionGroup = {
  /** 시·도 라벨 — "서울"·"경기"·"인천"·"부산"… */
  city: string;
  /** DOM id 용 안전한 키(영문) — 앵커·details 이름에 쓴다 */
  key: string;
  items: Array<Pick<SeoulDistrictInfo, "id" | "name">>;
};

/** 카탈로그의 city 가 비어 있으면 서울이다(lib/map/seoul-districts SeoulDistrictInfo.city 주석) */
const DEFAULT_CITY = "서울";

/* 화면에 나오는 순서 — 카탈로그 등장순(서울 → 경기 → 인천 → 5대 광역시)을 그대로 쓴다.
   등장순은 곧 "노트·글이 실제로 있는 곳" 순이라 임의로 다시 정렬하지 않는다. */
const CITY_KEYS: Record<string, string> = {
  서울: "seoul",
  경기: "gyeonggi",
  인천: "incheon",
  부산: "busan",
  대구: "daegu",
  대전: "daejeon",
  광주: "gwangju",
  울산: "ulsan",
  세종: "sejong",
};

function keyOf(city: string, index: number): string {
  return CITY_KEYS[city] ?? `city-${index}`;
}

/**
 * 시·도별 그룹 목록(등장순). `exclude` 는 지금 보고 있는 동네 id — 자기 자신은 뺀다.
 * 항목이 0개가 된 그룹은 돌려주지 않는다(빈 details 를 그리지 않기 위해).
 */
export function groupRegionsByCity(
  catalog: readonly SeoulDistrictInfo[] = REGION_CATALOG,
  exclude?: string | null,
): RegionGroup[] {
  const groups: RegionGroup[] = [];
  const byCity = new Map<string, RegionGroup>();
  for (const r of catalog) {
    if (exclude && r.id === exclude) continue;
    const city = (r.city ?? "").trim() || DEFAULT_CITY;
    let g = byCity.get(city);
    if (!g) {
      g = { city, key: keyOf(city, groups.length), items: [] };
      byCity.set(city, g);
      groups.push(g);
    }
    g.items.push({ id: r.id, name: r.name });
  }
  return groups;
}

/** 이 동네가 속한 시·도 라벨 — "다른 동네" 접기에서 자기 시·도를 기본 펼침으로 두는 근거 */
export function cityOfRegion(
  id: string,
  catalog: readonly SeoulDistrictInfo[] = REGION_CATALOG,
): string {
  const r = catalog.find((x) => x.id === id);
  return (r?.city ?? "").trim() || DEFAULT_CITY;
}
