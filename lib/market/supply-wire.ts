/**
 * [1092 · 비용] 입주 물량 행의 전송용 압축 행 — [입주월, 지역, 사업유형|null, 주소|null, 단지명|null, 세대|null].
 * 입주 물량 허브는 1,362행 전부를 클라이언트(필터 · 표 · 그래프)에 넘기는데 키 이름만 행당 70B(JSON 184KB 의 45%)였다.
 * 서버(app/supply/page)는 toSupplyWire 로 넘기고 SupplyClient 가 fromSupplyWire 로 편다 — 같은 SupplyItem[].
 * 순수 함수만(server-only 밖) — 클라이언트 · node:test 가 직접 부른다. 행 모양은 lib/market/supply SupplyItem 과 같다.
 */
export type SupplyItemLike = {
  moveInYm: string;
  region: string;
  bizType: string | null;
  address: string | null;
  aptName: string | null;
  households: number | null;
};

export type SupplyItemWire = [string, string, string | null, string | null, string | null, number | null];

export function toSupplyWire(items: readonly SupplyItemLike[]): SupplyItemWire[] {
  return items.map((it) => [it.moveInYm, it.region, it.bizType ?? null, it.address ?? null, it.aptName ?? null, it.households ?? null]);
}

export function fromSupplyWire(wire: readonly SupplyItemWire[]): SupplyItemLike[] {
  return wire.map(([moveInYm, region, bizType, address, aptName, households]) => ({ moveInYm, region, bizType, address, aptName, households }));
}
