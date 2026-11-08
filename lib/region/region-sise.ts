/* [1110 · AI 분석 2차 통폐합] "지역 시세 분석" 입구 — 순수 함수.
   소유자 2026-11-07: 지역 시세 도구 5줄(면적대별 · 시세·타이밍 · 시장 온도 · 갭 스크리너 · 시나리오)을 **하나**로 — "눌렀을 때 지역을 검색하거나
   지역(시 · 구 · 동) 단위로 분석해서 종합적으로". 지역 하나의 종합 화면은 이미 /region/[id](개요 · 실거래 구간 · 전월세 · 시장 온도 · 동네 ·
   월간 리포트 탭 — 1101)가 맡는다. 여기는 **고르는 자리**다: 검색(시 · 구 · 동) + 시/도 필터 → 그 시/도의 시 · 구 줄(지금 값) → 종합 화면.
   규칙(소유자 2026-11-08): 항목이 5개를 넘으면 나열하지 않고 필터식 — 107곳을 한 번에 펼치지 않는다(시/도 하나씩).
   서버 조각(app/analysis/region-sise-entry)과 클라이언트 검색칸(region-search-box)이 같은 함수를 쓴다. 단위 테스트가 그대로 부른다. */

import type { SeoulDistrictInfo } from "@/lib/map/seoul-districts";
import type { RegionMarketSnapshot } from "@/lib/market/types";

/** 지역명 정규화 키 — lib/region/catalog normalizeRegionKey 와 **같은 규칙**(단위 테스트가 같음을 잠근다).
 *  여기 다시 적는 이유: 이 모듈은 클라이언트 검색칸(region-search-box)도 import 한다 — catalog 를 끌어오면 카탈로그 전부가 번들에 실린다. */
export function regionSiseKey(value: string): string {
  return value
    .replace(/\s+/g, "")
    .replace(/특별시|광역시|특별자치시|특별자치도/g, "")
    .toLowerCase();
}

/** 시/도 순서 — 카탈로그 규모 순이 아니라 사람이 찾는 순(수도권 → 광역시 → 세종). 목록에 없는 시/도는 뒤에 이름순. */
export const SIDO_ORDER: readonly string[] = ["서울", "경기", "인천", "부산", "대구", "대전", "광주", "울산", "세종"];

/** 검색칸·표가 같이 쓰는 지역 한 줄(카탈로그 → 종합 화면 /region/[id]) */
export type RegionSiseRegion = {
  id: string;
  /** 카탈로그 이름("강남구" · "성남시 분당구") */
  name: string;
  sido: string;
  /** 화면 표기 — "서울 강남구" · "경기 성남시 분당구" */
  label: string;
  href: string;
  /** 정확 일치 후보(별칭 포함) — 검색칸이 본다 */
  keys: string[];
};

export function toRegionSiseRegion(info: SeoulDistrictInfo, extraNames: readonly string[] = []): RegionSiseRegion {
  const sido = info.city ?? "서울";
  return {
    id: info.id,
    name: info.name,
    sido,
    label: `${sido} ${info.name}`,
    href: `/region/${encodeURIComponent(info.id)}`,
    keys: [...new Set([info.name, `${sido} ${info.name}`, ...(info.aliases ?? []), ...extraNames].map(regionSiseKey).filter(Boolean))],
  };
}

/** 폐지(retired) 지역은 뺀다 — 고르는 자리에 없어진 구역을 두지 않는다(옛 주소 · 통계는 /region/[id] 가 따로 안내한다).
 *  aliasMap(통용 지명 → 카탈로그 id · lib/region/catalog REGION_ALIASES)을 주면 "판교" · "목동" 같은 말도 검색 키가 된다. */
export function listRegionSiseRegions(catalog: readonly SeoulDistrictInfo[], aliasMap: Readonly<Record<string, string>> = {}): RegionSiseRegion[] {
  const extra = new Map<string, string[]>();
  for (const [name, id] of Object.entries(aliasMap)) extra.set(id, [...(extra.get(id) ?? []), name]);
  return catalog.filter((r) => !r.retired).map((r) => toRegionSiseRegion(r, extra.get(r.id) ?? []));
}

export function sidoRank(sido: string): number {
  const i = SIDO_ORDER.indexOf(sido);
  return i === -1 ? SIDO_ORDER.length : i;
}

/** 표 한 줄의 지금 값 — 없으면 null(0 이나 "—" 로 채우지 않는다 · 화면이 "—" 를 그린다) */
export type RegionSiseRow = RegionSiseRegion & {
  /** 평균 매매가(원 · 부동산원 스냅샷) */
  avgSaleKrw: number | null;
  /** 전세가율(%) */
  jeonseRatio: number | null;
  /** 이번 주 시장 온도(0~100)와 한 줄 */
  temp: { score: number; headline: string } | null;
};

export type RegionSiseGroup = { sido: string; rows: RegionSiseRow[] };

export type TempPointLike = { regionId: string; score: number; headline: string };

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** 시/도별 묶음(SIDO_ORDER 순 · 묶음 안은 카탈로그 순). 스냅샷 · 온도는 못 읽었으면 null 을 넘긴다 — 그 칸이 전부 "—" 가 된다. */
export function buildRegionSiseGroups(
  regions: readonly RegionSiseRegion[],
  snapshots: ReadonlyMap<string, RegionMarketSnapshot> | null,
  temps: readonly TempPointLike[] | null,
): RegionSiseGroup[] {
  const tempById = new Map<string, TempPointLike>();
  for (const t of temps ?? []) tempById.set(t.regionId, t);
  const groups = new Map<string, RegionSiseRow[]>();
  for (const r of regions) {
    const s = snapshots?.get(r.id);
    const t = tempById.get(r.id);
    const row: RegionSiseRow = {
      ...r,
      avgSaleKrw: s && finite(s.avgSale) && s.avgSale > 0 ? s.avgSale : null,
      jeonseRatio: s && finite(s.jeonseRatio) && s.jeonseRatio > 0 ? s.jeonseRatio : null,
      temp: t && finite(t.score) ? { score: t.score, headline: t.headline } : null,
    };
    const list = groups.get(r.sido) ?? [];
    list.push(row);
    groups.set(r.sido, list);
  }
  return [...groups.entries()]
    .sort((a, b) => sidoRank(a[0]) - sidoRank(b[0]) || a[0].localeCompare(b[0], "ko"))
    .map(([sido, rows]) => ({ sido, rows }));
}

/** 검색칸 — 입력 한 글자부터. 앞이 같은 것 → 이름에 들어 있는 것 순(시/도를 치면 "서울 ○○구" 키가 앞 일치라 그 시/도의 앞 max 곳).
 *  두 글자 미만 질의는 앞 일치만(한 글자 "구" 가 전부를 맞추지 않게). */
export function searchRegionSise(regions: readonly RegionSiseRegion[], query: string, max = 8): RegionSiseRegion[] {
  const q = regionSiseKey(query);
  if (!q) return [];
  const starts: RegionSiseRegion[] = [];
  const contains: RegionSiseRegion[] = [];
  for (const r of regions) {
    if (r.keys.some((k) => k.startsWith(q))) starts.push(r);
    else if (q.length >= 2 && r.keys.some((k) => k.includes(q))) contains.push(r);
  }
  return [...starts, ...contains].slice(0, max);
}

/** 옛 주소 ?region=<카탈로그 id> (시세·타이밍 · 홈 바로가기 · 온도 기록 화면이 붙이던 값) → 종합 화면. 모르는 값은 null(그냥 고르는 자리) */
export function legacyRegionParamHref(regions: readonly RegionSiseRegion[], regionParam: string | null | undefined): string | null {
  const v = (regionParam ?? "").trim();
  if (!v) return null;
  const byId = regions.find((r) => r.id === v);
  if (byId) return byId.href;
  const k = regionSiseKey(v);
  const byName = regions.find((r) => r.keys.includes(k));
  return byName ? byName.href : null;
}
