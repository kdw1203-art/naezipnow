/**
 * R-ONE CLS_FULLNM / KB 지역명 → 내부 지역(id/name/city) 매핑.
 * R-ONE CLS_FULLNM 예: "서울>강남구", "경기>경부1권>안양시>만안구", "인천>연수구", "전북>전주시"
 *
 * [998] 2026-07 행정구역 개편 뒤 R-ONE 이 어떤 표기를 낼지는 아직 모른다(8월분 9월 중순 공표).
 * 그래서 옛 표기("광주>광산구"·"인천>서구")와 있을 법한 새 표기("전남광주>광산구"·
 * "전남광주통합특별시>광산구"·"인천>검단구"·"경기>…>화성시>동탄구")를 **모두** 카탈로그로
 * 풀 수 있게 한다. 지어낸 데이터는 없다 — 표기 후보만 넓힌 것이고, 실제 행이 오면 그때 붙는다.
 */
import { SEOUL_DISTRICTS, METRO_EXPLORE_DISTRICTS, METRO_CITY_DISTRICTS } from "@/lib/map/seoul-districts";

export interface RegionMatch {
  id: string;
  name: string;
  city: string;
}

interface InternalRegion {
  id: string;
  name: string;
  city: string;
  /** [998] 원천 표기 별칭(정확 일치 전용) */
  aliases: readonly string[];
}

const INTERNAL_REGIONS: InternalRegion[] = [
  ...SEOUL_DISTRICTS.map((d) => ({ id: d.id, name: d.name, city: d.city ?? "서울", aliases: d.aliases ?? [] })),
  ...METRO_EXPLORE_DISTRICTS.map((d) => ({ id: d.id, name: d.name, city: d.city ?? "서울", aliases: d.aliases ?? [] })),
  /* [945] 5대 광역시 — REB 수집이 다음 회차부터 자동 적재 */
  ...METRO_CITY_DISTRICTS.map((d) => ({ id: d.id, name: d.name, city: d.city ?? "서울", aliases: d.aliases ?? [] })),
];

function stripSpaces(s: string): string {
  return s.replace(/\s+/g, "");
}

/** [998] 별칭 비교 키 — 공백과 시도 접미(광역시·특별시·통합특별시·특별자치시/도)를 뗀다.
 *  "전남광주통합특별시>광산구" 와 "전남광주 광산구" 가 같은 키("전남광주광산구")가 된다. */
function aliasKey(s: string): string {
  return stripSpaces(s).replace(/통합특별시|특별자치시|특별자치도|특별시|광역시/g, "");
}

/**
 * CLS_FULLNM 의 시도 표기 → 내부 city 후보(순서대로 시도).
 * [998] 전남광주통합특별시는 카탈로그가 옛 광주(구)와 옛 전남(시·군)으로 나뉘어 있어 둘 다 본다 —
 * "전남광주>광산구" 는 광주에서 잡히고, "전남광주>목포시" 는 전남 항목이 없으면 그대로 null 이다.
 */
function sidoCandidates(sido: string): string[] {
  const s = sido.trim();
  if (s.startsWith("전남광주") || s.startsWith("광주전남")) return ["광주", "전남"];
  if (s.startsWith("서울")) return ["서울"];
  if (s.startsWith("경기")) return ["경기"];
  if (s.startsWith("인천")) return ["인천"];
  if (s.startsWith("부산")) return ["부산"];
  if (s.startsWith("대구")) return ["대구"];
  if (s.startsWith("대전")) return ["대전"];
  if (s.startsWith("광주")) return ["광주"];
  if (s.startsWith("울산")) return ["울산"];
  if (s.startsWith("세종")) return ["세종"];
  return [s];
}

function toMatch(r: InternalRegion): RegionMatch {
  return { id: r.id, name: r.name, city: r.city };
}

/** [998] 별칭 정확 일치 — 원문 전체("전남광주통합특별시 광산구")를 별칭 키로 비교한다. */
function matchByAlias(full: string): RegionMatch | null {
  const key = aliasKey(full);
  if (!key) return null;
  for (const r of INTERNAL_REGIONS) {
    for (const a of r.aliases) {
      if (aliasKey(a) === key) return toMatch(r);
    }
  }
  return null;
}

/**
 * R-ONE CLS_FULLNM 에서 내부 지역을 찾는다. 매칭 실패 시 null (해당 지역은 스킵).
 */
export function matchRegionFromClsFullNm(clsFullNm: string | null | undefined): RegionMatch | null {
  if (!clsFullNm) return null;
  const segments = clsFullNm
    .split(">")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;
  /* [998] 세그먼트 하나("세종"·"세종특별자치시")는 시도 전체 행이라 원래 건너뛰지만, 세종은 시 자체가
     시군구라 별칭으로만 붙인다(다른 시도는 별칭이 없어 그대로 null). */
  if (segments.length < 2) return matchByAlias(segments[0]);

  const cities = sidoCandidates(segments[0]);
  // 권역(예: 경부1권) 세그먼트 제거 후 시/구 조합
  const meaningful = segments.slice(1).filter((s) => !s.endsWith("권"));
  if (meaningful.length === 0) return null;
  const candidate = meaningful.join(" ");
  const candidateTight = stripSpaces(candidate);
  const lastSegTight = stripSpaces(meaningful[meaningful.length - 1]);

  for (const city of cities) {
    for (const r of INTERNAL_REGIONS) {
      if (r.city !== city) continue;
      const nameTight = stripSpaces(r.name);
      if (nameTight === candidateTight) return toMatch(r);
      /* 인천 중구("인천 중구") ↔ CLS "인천>중구"(candidate "중구") 등 보정 — 이름이 **정확히**
         "<시도><구>" 일 때만. [998] 예전의 "끝이 같고 길이차 ≤4" 규칙은 "인천>동구" 를
         남동구에 붙였다(옛 동구 REB 행이 남동구 통계를 덮어쓴다). 동구는 카탈로그에 없으니 null 이 맞다. */
      if (nameTight === stripSpaces(r.city) + lastSegTight) return toMatch(r);
    }
  }
  /* [998] 시도 표기가 카탈로그 city 와 다를 때(통합시 새 이름 등) — 원문 전체를 별칭과 정확 비교 */
  return matchByAlias(`${segments[0]} ${candidate}`) ?? matchByAlias(candidate);
}

/** KB 지역명(예: "강남구", "분당구", "수원 영통구")에서 내부 지역 추정 */
export function matchRegionByName(name: string, cityHint?: string): RegionMatch | null {
  const tight = stripSpaces(name);
  // 1차: city 힌트 + 정확 매칭 (이름 또는 [998] 별칭)
  for (const r of INTERNAL_REGIONS) {
    if (cityHint && r.city !== cityHint) continue;
    if (stripSpaces(r.name) === tight) return toMatch(r);
    if (r.aliases.some((a) => aliasKey(a) === aliasKey(name))) return toMatch(r);
  }
  // 2차: 부분 포함(구 단위)
  for (const r of INTERNAL_REGIONS) {
    const nt = stripSpaces(r.name);
    if (nt === tight || nt.endsWith(tight) || tight.endsWith(nt)) {
      return toMatch(r);
    }
  }
  return null;
}
