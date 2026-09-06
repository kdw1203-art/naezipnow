/**
 * [970 · B-02 · B-03 · B-33 · B-34] 지역명 ↔ 시/도 — 순수 함수만 (서버·클라이언트·테스트 공용).
 *
 * 왜 한 파일인가: /region/[id] 는 상위 시/도를 `id.startsWith("incheon-") ? "인천" : "서울"`
 * 로 굳혀 두어 대구 중구·부산 해운대구 페이지가 "서울"의 하위로 나갔고(JSON-LD·/supply
 * 링크), 입주물량·정비사업은 자치구명("중구")만으로 조회해 울산·인천·서울 중구가 한
 * 페이지에 섞였다. 시/도의 단일 출처는 lib/region/catalog(REGION_CATALOG.city)다 — 여기서는
 * 그 값을 꺼내는 얇은 헬퍼와, market_transactions.region_name 표기("서울 강남구"·
 * "수원 영통구"·"광명시")를 시/도로 묶는 규칙만 둔다. 지어낸 매핑은 없다: 카탈로그에
 * 없는 지역(청주·천안 등)은 "그 밖의 지역"으로 정직하게 묶는다.
 */
import {
  findCatalogRegionById,
  findCatalogRegionByName,
  normalizeRegionKey,
} from "@/lib/region/catalog";

/** 광역 시/도 접두 — market_transactions.region_name 은 "서울 종로구"·"부산 해운대구" 꼴이다
 *  (lib/market/molit-transactions.ts molitRegionLabel). 세종은 구가 없어 단독 표기. */
const METRO_SIDO = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종"] as const;

export const OTHER_SIDO_LABEL = "그 밖의 지역";

/** 카탈로그 id → 상위 시/도("서울"·"경기"·"인천"·"대구"…). 카탈로그에 없으면 null. */
export function catalogCityForRegionId(id: string): string | null {
  const info = findCatalogRegionById(id);
  if (!info) return null;
  return info.city ?? "서울";
}

/**
 * 지역 표기 → 시/도.
 *  - "서울 강남구" / "대구 중구" → 첫 토큰이 광역 시/도면 그것
 *  - "수원 영통구" / "광명시" / "고양시 덕양구" → 카탈로그(경기·인천…)에서 찾아 city
 *  - 둘 다 아니면 null (호출측이 "그 밖의 지역"으로 묶는다)
 */
export function sidoOfRegionName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  /* 첫 토큰이 정확히 광역 시/도일 때만 — startsWith 로 보면 경기 "광주시"가 광주광역시로,
     "부산진구"(단일 토큰)는 카탈로그 쪽에서 부산으로 제대로 풀린다. */
  const first = trimmed.split(/\s+/)[0] ?? "";
  const metro = METRO_SIDO.find((s) => first === s);
  if (metro) return metro;
  /* 카탈로그는 **정확 일치**만 인정한다 — findCatalogRegionByName 의 부분 일치를 그대로
     쓰면 "포항 남구"가 "부산 남구"로 붙는다(모르는 것은 모른다고 둔다). 실거래 표기
     "수원 영통구"는 카탈로그의 "수원시 영통구"이므로 첫 토큰에 "시"를 붙인 후보도 본다. */
  const rest = trimmed.split(/\s+/).slice(1).join(" ");
  const candidates = rest && !first.endsWith("시") ? [trimmed, `${first}시 ${rest}`] : [trimmed];
  for (const cand of candidates) {
    const hit = findCatalogRegionByName(cand);
    if (hit && normalizeRegionKey(hit.name) === normalizeRegionKey(cand)) return hit.city ?? "서울";
  }
  return null;
}

export type SidoGroup<T> = { sido: string; items: T[] };

/**
 * 시/도별 묶음 — 각 묶음 안의 순서는 입력 순서를 지키고(입력이 이미 거래 많은 순),
 * 묶음 순서는 `weightOf` 합이 큰 순. 시/도를 모르는 항목은 마지막 "그 밖의 지역".
 */
export function groupBySido<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  weightOf: (item: T) => number = () => 1,
): SidoGroup<T>[] {
  const map = new Map<string, { items: T[]; weight: number }>();
  for (const item of items) {
    const sido = sidoOfRegionName(nameOf(item)) ?? OTHER_SIDO_LABEL;
    const g = map.get(sido) ?? { items: [], weight: 0 };
    g.items.push(item);
    g.weight += weightOf(item);
    map.set(sido, g);
  }
  return [...map.entries()]
    .sort((a, b) => {
      if (a[0] === OTHER_SIDO_LABEL) return 1;
      if (b[0] === OTHER_SIDO_LABEL) return -1;
      return b[1].weight - a[1].weight;
    })
    .map(([sido, g]) => ({ sido, items: g.items }));
}

/**
 * [B-33] 같은 시/도 지역을 앞에 — 안정 정렬이라 같은 묶음 안에서는 원래 순서(카탈로그 순)를 지킨다.
 */
export function sameSidoFirst<T extends { id: string; city?: string }>(
  list: readonly T[],
  selfId: string,
): T[] {
  const selfCity = catalogCityForRegionId(selfId);
  return list
    .filter((r) => r.id !== selfId)
    .map((r, i) => ({ r, i, same: (r.city ?? "서울") === selfCity ? 0 : 1 }))
    .sort((a, b) => a.same - b.same || a.i - b.i)
    .map((x) => x.r);
}
