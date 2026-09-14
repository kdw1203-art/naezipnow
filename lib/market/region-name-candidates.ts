/**
 * [967 · 28b] 지역 시세 표기 → 실거래 표기 후보 이름 (순수 함수, 의존성 없음).
 *
 * 두 테이블의 지역 표기가 다르다:
 *   market_region_price : "강남구" · "고양시 덕양구"
 *   market_transactions : "서울 강남구" · "고양 덕양구"
 * lib/market/store.ts 의 transactionNameCandidates 와 같은 규칙이다. tx-bands.ts 의
 * findTxRegionForMarketRegion 이 이 변환을 안에 복제해 갖고 있었고, 사이트맵
 * (lib/seo/build-sitemap.ts loadRegionEntries)이 같은 대조를 하려면 세 번째 사본이
 * 필요했다. 여기 한 곳에 두고 양쪽이 쓴다.
 *
 * 왜 tx-bands.ts 안이 아니라 별도 파일인가: tx-bands.ts 는 `server-only` 라 node:test
 * 가 import 하지 못한다(그 패키지는 빌드 시 Next 가 alias 로 채운다). 순수 규칙은
 * 단위테스트가 닿는 자리에 둔다.
 *
 * 결과는 **후보**일 뿐이다. 실제로 존재하는 지역 목록과 대조해서만 링크·시각을 만든다 —
 * 추측한 이름으로 링크를 걸면 404 로 이어지는 내부 링크가 생긴다.
 */
/** [998] 카탈로그 id 접두 → 실거래 시/도 접두(molitRegionLabel 의 "<시도> <구>" 표기). 접두가 없으면 서울.
 *  예전엔 인천만 봐서 "광산구"·"해운대구" 가 "서울 광산구" 로 나갔다 — 2026-07 통합 뒤 광주 구의
 *  실거래 표기는 여전히 "광주 광산구" 라 여기서 맞춘다(의존성 없이 접두만 본다). */
const METRO_PREFIX: ReadonlyArray<readonly [string, string]> = [
  ["incheon-", "인천"],
  ["busan-", "부산"],
  ["daegu-", "대구"],
  ["daejeon-", "대전"],
  ["gwangju-", "광주"],
  ["ulsan-", "울산"],
];

export function marketRegionNameCandidates(regionId: string, regionName: string): string[] {
  const name = regionName.trim();
  if (!name) return [];
  const out = new Set<string>([name]);
  if (name.includes(" ")) {
    // "고양시 덕양구" → "고양 덕양구", "수원시 영통구" → "수원 영통구", [998] "화성시 동탄구" → "화성 동탄구"
    out.add(name.replace("시 ", " "));
  } else if (name.endsWith("구")) {
    const sido = METRO_PREFIX.find(([p]) => regionId.startsWith(p))?.[1] ?? "서울";
    out.add(`${sido} ${name}`);
  }
  return [...out];
}

/** 후보 이름 순서대로 목록에서 첫 일치를 찾는다. 없으면 null. */
export function findByRegionNameCandidates<T extends { name: string }>(
  list: readonly T[],
  regionId: string,
  regionName: string,
): T | null {
  for (const candidate of marketRegionNameCandidates(regionId, regionName)) {
    const hit = list.find((r) => r.name === candidate);
    if (hit) return hit;
  }
  return null;
}
