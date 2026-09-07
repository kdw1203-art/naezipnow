/**
 * 지오코딩 질의 후보 만들기 — 순수 함수.
 *
 * [971] 왜 따로 있나: complex-geocode.ts 는 `server-only` 라 node:test 에서 못
 * 읽는다. 후보를 **어떤 순서로** 세우는지가 이 파이프라인에서 제일 자주 틀리는
 * 부분(엉뚱한 도시로 찍히는 사고가 여기서 난다)이라, 그 판단만 떼어 검증한다.
 */

/**
 * 시/도가 빠진 지번 주소에 region_name 의 앞 토막을 붙인 후보.
 *
 * 실거래 주소는 "남구 신정동 산107-50" 처럼 시/도 없이 시작한다. "남구"·"중구"·
 * "북구" 는 전국에 여럿이라, 이 문자열만 주면 지오코더가 다른 도시의 같은 이름
 * 구로 찍을 수 있다. region_name 은 "울산 남구" 처럼 앞에 시/도를 달고 있으니
 * 그 토막을 빌려 쓴다.
 *
 * 보탤 게 없으면 빈 문자열을 돌려준다 — 이미 붙어 있거나("고양시 일산동구 …"),
 * region_name 이 한 토막이거나("김포시"), 주소가 없을 때.
 */
export function withSidoPrefix(region: string, address: string | null | undefined): string {
  const addr = (address ?? "").trim();
  if (!addr) return "";
  const scope = (region ?? "").trim();
  const head = scope.split(/\s+/)[0] ?? "";
  if (!head || head === scope || addr.startsWith(head)) return "";
  return `${head} ${addr}`;
}

/**
 * 한 단지에 대한 질의 후보를 좋은 것부터 세운다.
 *
 * 네이버 지오코더는 POI(단지명)가 아니라 **주소** 전용이다("서울 송파구 리센츠"
 * 같은 질의의 실측 성공률 ~1%). 그래서 주소형을 앞에 두고, 그 안에서도
 *   도로명(대장) → 시/도 보정 지번 → 원본 지번
 * 순으로 내려간다. 구체적일수록 다른 도시로 잘못 찍힐 여지가 줄어든다.
 * 마지막 둘(지역+단지명, 단지명)은 주소가 아예 없을 때를 위한 보루다.
 *
 * 빈 값과 중복은 여기서 지운다 — 부르는 쪽이 후보 수로 예산을 잡기 때문이다.
 */
export function buildGeocodeQueries(input: {
  region: string;
  name: string;
  address?: string | null;
  roadAddress?: string | null;
}): string[] {
  const { region, name, address, roadAddress } = input;
  const out: string[] = [];
  const push = (q: string | null | undefined) => {
    const t = (q ?? "").trim();
    if (t && !out.includes(t)) out.push(t);
  };
  push(roadAddress);
  push(withSidoPrefix(region, address));
  push(address);
  push(`${region} ${name}`);
  push(name);
  return out;
}
