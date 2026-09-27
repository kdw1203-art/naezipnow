/**
 * [967 · 21] 동네이야기 피드 필터 ↔ URL 쿼리 (순수 함수 — 클라이언트·테스트 공용).
 *
 *   ?kind=note|post   유형(전체는 생략)
 *   ?sort=latest      정렬(추천순이 기본이라 생략)
 *   ?mine=1           내 관심지역만
 *
 * 기본값은 URL 에 적지 않는다 — /town 그대로가 기본 목록이어야 공유 링크가
 * 깨끗하고, 스크롤 복원 키(경로 + 쿼리)도 "필터 없음 = /town" 으로 맞는다.
 * 모르는 값은 기본값으로 떨어뜨린다(잘못 적힌 링크가 빈 화면을 만들지 않게).
 */
export const TOWN_FEED_KINDS = ["all", "note", "post"] as const;
export type TownFeedKind = (typeof TOWN_FEED_KINDS)[number];
export const TOWN_FEED_SORTS = ["reco", "latest"] as const;
export type TownFeedSort = (typeof TOWN_FEED_SORTS)[number];

export type TownFeedFilters = {
  kind: TownFeedKind;
  sort: TownFeedSort;
  mine: boolean;
};

export const TOWN_FEED_DEFAULT_FILTERS: TownFeedFilters = { kind: "all", sort: "reco", mine: false };

function isKind(v: string | null): v is TownFeedKind {
  return v !== null && (TOWN_FEED_KINDS as readonly string[]).includes(v);
}
function isSort(v: string | null): v is TownFeedSort {
  return v !== null && (TOWN_FEED_SORTS as readonly string[]).includes(v);
}

/** location.search("?kind=note&sort=latest") → 필터. 빈 문자열·모르는 값은 기본값. */
export function parseTownFeedFilters(search: string): TownFeedFilters {
  let sp: URLSearchParams;
  try {
    sp = new URLSearchParams(search);
  } catch {
    return { ...TOWN_FEED_DEFAULT_FILTERS };
  }
  const kind = sp.get("kind");
  const sort = sp.get("sort");
  const mine = sp.get("mine");
  return {
    kind: isKind(kind) ? kind : "all",
    sort: isSort(sort) ? sort : "reco",
    mine: mine === "1" || mine === "true",
  };
}

/**
 * 필터 → 쿼리 문자열("?kind=note" 또는 ""). `currentSearch` 의 다른 파라미터
 * (ref_code 등)는 그대로 두고 필터 키만 갈아 끼운다.
 */
export function townFeedFilterQuery(f: TownFeedFilters, currentSearch = ""): string {
  let sp: URLSearchParams;
  try {
    sp = new URLSearchParams(currentSearch);
  } catch {
    sp = new URLSearchParams();
  }
  sp.delete("kind");
  sp.delete("sort");
  sp.delete("mine");
  if (f.kind !== "all") sp.set("kind", f.kind);
  if (f.sort !== "reco") sp.set("sort", f.sort);
  if (f.mine) sp.set("mine", "1");
  const q = sp.toString();
  return q ? `?${q}` : "";
}
