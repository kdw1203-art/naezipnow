/**
 * [970 · C-23] /town/news 지역 칩 — 빈도순 + 시·도 접기.
 *
 * 왜: 칩은 `[...new Set(news.map(p => p.city))].slice(0, 8)` 이었다. board_posts.region
 * 값은 "서울"·"경기" 같은 시·도와 "강남구"·"성남시 분당구" 같은 시·군·구가 한 컬럼에
 * 섞여 있어, 칩 줄에 단위가 다른 이름이 **등장순**으로 나란히 섰다(기사 한 건짜리
 * 지역이 앞, 수십 건짜리가 뒤). 여기서는 값마다 시·도를 해석해(카탈로그) 시·도 칩으로
 * 접고, 시·도 안의 시·군·구는 그 칩을 눌렀을 때 두 번째 줄로 편다. 순서는 건수순.
 *
 * 순수 함수 — 서버가 계산해 DTO 로 내리고 클라이언트(NewsListClient)는 그리기만 한다.
 */
import { findCatalogRegionByName, normalizeRegionKey } from "@/lib/region/catalog";

export type NewsRegionChip = {
  /** 칩 라벨 — 시·도 그룹이면 "서울", 시·군·구면 원래 값("강남구") */
  label: string;
  /** 이 칩이 거르는 원본 city 값들(대표 + 하위 전부) */
  values: string[];
  /** 기사 수(하위 포함) */
  count: number;
  /** 시·도 칩에만 — 그 안의 시·군·구 칩(건수순). 하나뿐이면 펼 것이 없어 비운다 */
  children: NewsRegionChip[];
};

/** 시·도 표기 정규화 — "서울특별시"·"서울시" → "서울", "경기도" → "경기" */
const SIDO_ALIASES: Record<string, string> = {
  서울: "서울",
  서울시: "서울",
  서울특별시: "서울",
  경기: "경기",
  경기도: "경기",
  인천: "인천",
  인천시: "인천",
  인천광역시: "인천",
  부산: "부산",
  부산시: "부산",
  부산광역시: "부산",
  대구: "대구",
  대구광역시: "대구",
  대전: "대전",
  대전광역시: "대전",
  광주: "광주",
  광주광역시: "광주",
  울산: "울산",
  울산광역시: "울산",
  세종: "세종",
  세종시: "세종",
  세종특별자치시: "세종",
  강원: "강원",
  강원도: "강원",
  강원특별자치도: "강원",
  충북: "충북",
  충청북도: "충북",
  충남: "충남",
  충청남도: "충남",
  전북: "전북",
  전라북도: "전북",
  전북특별자치도: "전북",
  전남: "전남",
  전라남도: "전남",
  경북: "경북",
  경상북도: "경북",
  경남: "경남",
  경상남도: "경남",
  제주: "제주",
  제주도: "제주",
  제주특별자치도: "제주",
};

/**
 * 원본 city 값 → 시·도 라벨. 시·도 이름 그 자체면 그것, 시·군·구면 카탈로그의 city
 * (비어 있으면 서울), "경기 성남시" 처럼 앞에 시·도가 붙어 있으면 그 앞 토막.
 * 어느 쪽도 아니면 null — 그 값은 제 이름으로 독립 칩이 된다(틀린 묶음보다 낫다).
 */
export function sidoOfNewsRegion(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, "");
  if (SIDO_ALIASES[compact]) return SIDO_ALIASES[compact];
  const first = raw.split(/\s+/)[0] ?? "";
  if (first !== raw && SIDO_ALIASES[first]) return SIDO_ALIASES[first];
  const hit = findCatalogRegionByName(raw);
  if (hit) return (hit.city ?? "").trim() || "서울";
  return null;
}

/**
 * 뉴스 city 값 목록 → 칩 트리. `maxGroups` 는 첫 줄 상한(예전 8 유지),
 * `maxChildren` 은 시·도 안 두 번째 줄 상한.
 */
export function buildNewsRegionChips(
  cities: ReadonlyArray<string | null | undefined>,
  opts: { maxGroups?: number; maxChildren?: number } = {},
): NewsRegionChip[] {
  const maxGroups = opts.maxGroups ?? 8;
  const maxChildren = opts.maxChildren ?? 10;

  /* 원본 값별 건수(등장순 보존 — 같은 건수면 먼저 나온 값이 앞) */
  const freq = new Map<string, number>();
  for (const c of cities) {
    const v = (c ?? "").trim();
    if (!v) continue;
    freq.set(v, (freq.get(v) ?? 0) + 1);
  }

  type Group = { label: string; count: number; leaves: Map<string, number> };
  const groups = new Map<string, Group>();
  for (const [value, n] of freq) {
    const sido = sidoOfNewsRegion(value) ?? value;
    let g = groups.get(sido);
    if (!g) {
      g = { label: sido, count: 0, leaves: new Map() };
      groups.set(sido, g);
    }
    g.count += n;
    g.leaves.set(value, n);
  }

  const ordered = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, maxGroups);
  return ordered.map((g) => {
    const values = [...g.leaves.keys()];
    /* 시·도 이름 그 자체("서울")는 하위 칩이 아니다 — 시·군·구만 두 번째 줄에 */
    const leafEntries = [...g.leaves.entries()].filter(
      ([v]) => normalizeRegionKey(v) !== normalizeRegionKey(g.label) && sidoOfNewsRegion(v) !== null,
    );
    const children: NewsRegionChip[] =
      leafEntries.length >= 2
        ? leafEntries
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxChildren)
            .map(([v, n]) => ({ label: v, values: [v], count: n, children: [] }))
        : [];
    return { label: g.label, values, count: g.count, children };
  });
}

/** 라벨(URL ?region=)로 칩을 찾는다 — 시·도 칩과 그 하위 칩 모두 대상 */
export function findNewsRegionChip(
  chips: readonly NewsRegionChip[],
  label: string | null | undefined,
): { chip: NewsRegionChip; parent: NewsRegionChip | null } | null {
  const l = (label ?? "").trim();
  if (!l) return null;
  for (const g of chips) {
    if (g.label === l) return { chip: g, parent: null };
    for (const c of g.children) if (c.label === l) return { chip: c, parent: g };
  }
  return null;
}
