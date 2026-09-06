/**
 * [967 · 30e] 단지 비교 슬러그의 **클라이언트 안전** 파서.
 *
 * lib/market/complex-pairs.ts 의 parseComplexPairSlug 와 같은 규칙이지만, 그 모듈은
 * `server-only` + Supabase 를 끌고 들어와서 클라이언트 컴포넌트(not-found.tsx 가
 * usePathname 으로 슬러그를 읽는다)에서 import 할 수 없다. 여기는 의존성이 없다.
 *
 * 형식: encodeURIComponent(A) + "--" + encodeURIComponent(B) + "--" + regionId
 * "느슨한(loose)" 이유: 404 화면은 "이 조합이 유효한가"를 판정하지 않는다. 방문자가
 * 찾던 단지 이름을 검색 링크로 돌려주는 게 목적이라, 형태만 맞으면 이름을 꺼낸다.
 */
export function parsePairSlugLoose(
  rawSlug: string,
): { first: string; second: string; regionId: string } | null {
  let slug = rawSlug;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    /* 깨진 인코딩은 원문 그대로 */
  }
  const sepRegion = slug.lastIndexOf("--");
  if (sepRegion <= 0 || sepRegion >= slug.length - 2) return null;
  const regionId = slug.slice(sepRegion + 2);
  if (!/^[a-z0-9-]+$/.test(regionId)) return null;

  const names = slug.slice(0, sepRegion);
  const sepName = names.lastIndexOf("--");
  if (sepName <= 0 || sepName >= names.length - 2) return null;

  const decode = (v: string): string => {
    try {
      return decodeURIComponent(v).trim();
    } catch {
      return v.trim();
    }
  };
  const first = decode(names.slice(0, sepName));
  const second = decode(names.slice(sepName + 2));
  if (!first || !second) return null;
  return { first, second, regionId };
}
