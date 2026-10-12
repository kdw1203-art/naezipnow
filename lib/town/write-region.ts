import { CITY_OPTIONS, DISTRICTS } from "@/lib/regions";
import { findCatalogRegionStrict } from "@/lib/region/catalog";

/* [1058 · B6] 글쓰기 화면의 지역 프리필 — 순수 함수(브라우저·DB 없이 테스트).
 *
 * 예전 initialCity 는 ?city= 만 읽고 없으면 서울특별시로 굳혔다. 피드의 "{관심지역}에 글쓰기"와
 * 뉴스 상세의 "이 기사로 동네이야기 쓰기"는 ?region=성남시 분당구 처럼 **region 하나**만 보내므로
 * 시·도는 늘 서울이 됐고, 서울 목록에서 "성남시 분당구"를 못 찾아 첫 항목 강남구가 조용히 골라졌다.
 *
 * 여기서는 지역 카탈로그(lib/region/catalog · 부분 일치 없는 strict 조회)로 시·도와 시·군·구를 함께 푼다.
 * 못 풀면 **빈 값**을 돌려준다 — 폼은 "선택" 자리에서 시작하고 등록 때 "지역 선택 필요"로 막는다.
 * 틀린 지역을 고르는 것보다 고르게 하는 편이 낫다. */

export type WriteCity = (typeof CITY_OPTIONS)[number];

/** city·district 중 못 푼 쪽은 "" — 폼이 "선택" 자리로 둔다 */
export type WriteRegionPick = { city: WriteCity | ""; district: string };

export const EMPTY_WRITE_REGION: WriteRegionPick = { city: "", district: "" };

/** 사람이 적는 시·도 낱말 → 폼의 시·도 옵션 */
const CITY_WORDS: Record<string, WriteCity> = {
  서울: "서울특별시",
  서울시: "서울특별시",
  서울특별시: "서울특별시",
  경기: "경기도",
  경기도: "경기도",
  인천: "인천광역시",
  인천시: "인천광역시",
  인천광역시: "인천광역시",
  부산: "부산광역시",
  부산시: "부산광역시",
  부산광역시: "부산광역시",
};

/** 카탈로그 항목의 city 값(서울 항목은 city 가 없다) → 폼의 시·도 옵션 */
const CATALOG_CITY: Record<string, WriteCity> = {
  경기: "경기도",
  인천: "인천광역시",
  부산: "부산광역시",
};

function isCity(v: string): v is WriteCity {
  return (CITY_OPTIONS as readonly string[]).includes(v);
}

/** 시·도 목록에서 이름을 찾는다 — 정확 일치, 아니면 첫 낱말("성남시 분당구" → "성남시") 정확 일치 */
function districtIn(city: WriteCity, name: string): string | null {
  const list = DISTRICTS[city] ?? [];
  const n = name.trim();
  if (!n) return null;
  if (list.includes(n)) return n;
  const squashed = n.replace(/\s+/g, "");
  const exact = list.find((d) => d.replace(/\s+/g, "") === squashed);
  if (exact) return exact;
  const head = n.split(/\s+/)[0] ?? "";
  return head && list.includes(head) ? head : null;
}

/** 카탈로그 이름 "부산 남구"·"인천 연수구" 의 앞 시·도 낱말을 뗀다 */
function stripCityWord(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 && CITY_WORDS[parts[0] ?? ""] ? parts.slice(1).join(" ") : name.trim();
}

/** 카탈로그 strict 조회 → 폼 값. 폼이 표현 못 하는 시·도(대구·대전·광주·울산·세종)는 빈 값 */
function fromCatalog(query: string): WriteRegionPick | null {
  const info = findCatalogRegionStrict(query);
  if (!info) return null;
  const city: WriteCity | undefined = info.city ? CATALOG_CITY[info.city] : "서울특별시";
  if (!city) return null;
  const district = districtIn(city, stripCityWord(info.name));
  return district ? { city, district } : { city, district: "" };
}

/**
 * ?city=&district= · ?region= · ?district= 를 폼의 시·도/시·군·구로 푼다.
 *  1) city 옵션 + 그 목록의 district → 그대로
 *  2) "전국" → 기타(전국)
 *  3) 첫 낱말이 시·도("서울 강남구"·"경기 성남시 분당구") → 그 시·도 목록에서 나머지를 찾는다
 *  4) 그 밖("성남시 분당구"·"성남 분당구"·"판교"·"해운대구") → 카탈로그 strict 조회
 *  5) 카탈로그에 없으면 네 시·도 목록 중 **한 곳에만** 있는 이름일 때 그 시·도
 * 못 풀면 빈 값 — 폼이 고르게 한다.
 */
export function parseWriteRegion(input: {
  region?: string | null;
  city?: string | null;
  district?: string | null;
}): WriteRegionPick {
  const cityParam = (input.city ?? "").trim();
  const districtParam = (input.district ?? "").trim();
  const regionParam = (input.region ?? "").trim();

  if (isCity(cityParam)) {
    const d = districtParam ? districtIn(cityParam, districtParam) : null;
    if (d) return { city: cityParam, district: d };
    const viaRegion = regionParam ? parseWriteRegion({ region: regionParam }) : EMPTY_WRITE_REGION;
    return viaRegion.city === cityParam && viaRegion.district
      ? viaRegion
      : { city: cityParam, district: "" };
  }

  const raw = (districtParam || regionParam).replace(/\s+/g, " ").trim();
  if (!raw) return EMPTY_WRITE_REGION;
  if (raw === "전국" || raw === "기타(전국)") return { city: "기타(전국)", district: "전국" };

  const parts = raw.split(" ");
  const cityWord = CITY_WORDS[parts[0] ?? ""];
  if (cityWord) {
    const rest = parts.slice(1).join(" ");
    if (!rest) return { city: cityWord, district: "" };
    const direct = districtIn(cityWord, rest);
    if (direct) return { city: cityWord, district: direct };
    const viaCatalog = fromCatalog(rest) ?? fromCatalog(raw);
    return viaCatalog && viaCatalog.city === cityWord ? viaCatalog : { city: cityWord, district: "" };
  }

  const viaCatalog = fromCatalog(raw);
  if (viaCatalog) return viaCatalog;

  const hits: WriteRegionPick[] = [];
  for (const c of CITY_OPTIONS as readonly WriteCity[]) {
    if (c === "기타(전국)") continue;
    const d = districtIn(c, raw);
    if (d) hits.push({ city: c, district: d });
  }
  return hits.length === 1 ? hits[0]! : EMPTY_WRITE_REGION;
}
