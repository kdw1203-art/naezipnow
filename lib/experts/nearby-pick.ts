/**
 * [1047] 단지 화면 "이 지역 인증 전문가" 고르기 — 순수(단위 시험 대상).
 * 점수 → 후기 수 → 이름 순으로 limit 명, 0점은 뺀다.
 *
 * [1052] 시·도를 먼저 맞춘다. 예전엔 활동 지역 문자열에 구 이름 낱말이 있으면 시·도와 무관하게 2점이었다 —
 * "부산광역시 중구" 전문가가 서울 중구 단지에, "부산광역시 강서구" 가 서울 강서구 단지에 붙었다.
 * 시·도 비교도 앞 두 글자라 충청북도↔충청남도 · 경상북도↔경상남도 · 전라북도↔전라남도가 같은 시·도로 읽혔다.
 * 이제 시·도는 표기 표(lib/region/sido — "서울특별시"·"서울시"·"서울" 모두 서울)로 맞추고, 단계는
 *   2   정확한 지역 — 같은 시·도 + 같은 시·군·구("서울특별시 송파구" ↔ 서울 송파구)
 *   1.5 같은 시·도 + 구가 겹침 — 더 넓거나 좁게 적힌 지역("경기도 성남시" ↔ 성남시 분당구)
 *   1   같은 시·도만
 *   0   다른 시·도 · 무관
 * 시·도를 적지 않은 활동 지역("중구")이나 단지의 시·도를 모를 때는, 전국에 같은 이름이 여럿인 구
 * (AMBIGUOUS_DISTRICTS)를 맞춘 것으로 치지 않는다 — 어느 도시인지 알 수 없다.
 */
import { sidoByName } from "@/lib/region/sido";

export type NearbyCandidate = { id: string; name: string; regions: string[]; reviews: number };

export const NEARBY_SCORE = { exact: 2, district: 1.5, sido: 1, none: 0 } as const;

/**
 * 전국에 같은 이름이 둘 이상인 시·군·구(정규화 이름 — 3자 이상은 끝의 시·군·구를 뗀다).
 * lib/national-data/region-codes 전국 표에서 뽑은 값(2026): 중구 · 동구 · 서구 · 남구 · 북구 · 강서(구) · 고성(군),
 * 그리고 경기 광주시 ↔ 광주광역시가 섞이는 "광주".
 */
export const AMBIGUOUS_DISTRICTS: ReadonlySet<string> = new Set([
  "중구",
  "동구",
  "서구",
  "남구",
  "북구",
  "강서",
  "고성",
  "광주",
]);

/** 시·군·구 낱말 정규화 — "송파구"→"송파", "수원시"→"수원". 두 글자("중구")는 그대로 둔다. */
function normDistrict(token: string): string {
  const t = token.trim();
  return t.length > 2 ? t.replace(/[시군구]$/, "") : t;
}

const SIDO_SUFFIX = /(특별시|광역시|특별자치시|특별자치도|통합특별시|도)$/;

/** 첫 낱말이 시·도면 짧은 이름("서울")으로. 표에 없지만 시·도 꼴이면 원문 그대로(서로 같을 때만 같은 시·도). */
function sidoOf(token: string | undefined): string | null {
  const t = (token ?? "").trim();
  if (!t) return null;
  const hit = sidoByName(t);
  if (hit) return hit.short;
  return SIDO_SUFFIX.test(t) && t.length >= 3 ? t : null;
}

type Place = { sido: string | null; districts: string[] };

function tokens(raw: string): string[] {
  return raw
    .split(/[\s·,/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** "서울특별시 송파구" → { sido: "서울", districts: ["송파"] } · "송파구" → { sido: null, districts: ["송파"] } */
export function parseRegion(raw: string): Place {
  const ts = tokens(raw);
  const sido = sidoOf(ts[0]);
  const rest = sido ? ts.slice(1) : ts;
  return { sido, districts: [...new Set(rest.map(normDistrict))] };
}

function placeOf(sigungu: string, city: string): Place {
  const fromCity = sidoOf(tokens(city)[0]);
  const gu = parseRegion(sigungu);
  return { sido: fromCity ?? gu.sido, districts: gu.districts };
}

const subset = (a: string[], b: string[]) => a.length > 0 && a.every((x) => b.includes(x));

/** 활동 지역 하나 ↔ 단지 위치 점수 */
function regionScore(region: Place, place: Place): number {
  const bothSido = Boolean(region.sido && place.sido);
  if (bothSido && region.sido !== place.sido) return NEARBY_SCORE.none;

  const exact = subset(region.districts, place.districts) && subset(place.districts, region.districts);
  const overlap =
    exact || subset(place.districts, region.districts) || subset(region.districts, place.districts);
  if (overlap) {
    /* 시·도를 양쪽 다 확인 못 했으면 동명 구는 버린다 */
    const ambiguous = place.districts.some((d) => AMBIGUOUS_DISTRICTS.has(d));
    if (bothSido || !ambiguous) return exact ? NEARBY_SCORE.exact : NEARBY_SCORE.district;
  }
  return bothSido ? NEARBY_SCORE.sido : NEARBY_SCORE.none;
}

export function nearbyScore(regions: string[], sigungu: string, city: string): number {
  const place = placeOf(sigungu ?? "", city ?? "");
  if (!place.sido && place.districts.length === 0) return NEARBY_SCORE.none;
  let best: number = NEARBY_SCORE.none;
  for (const raw of regions) {
    const r = (raw ?? "").trim();
    if (!r) continue;
    best = Math.max(best, regionScore(parseRegion(r), place));
    if (best === NEARBY_SCORE.exact) break;
  }
  return best;
}

export function pickNearbyExperts<T extends NearbyCandidate>(all: T[], sigungu: string, city: string, limit = 3): T[] {
  return all
    .map((e) => ({ e, s: nearbyScore(e.regions, sigungu, city) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.e.reviews - a.e.reviews || a.e.name.localeCompare(b.e.name, "ko"))
    .slice(0, Math.max(0, limit))
    .map((x) => x.e);
}
