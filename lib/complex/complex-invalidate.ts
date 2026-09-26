import { invalidateComplexIds, type InvalidateStats } from "@/lib/cache/invalidate";
import {
  complexCacheIds,
  complexCacheIdsFromNames,
} from "@/lib/complex/complex-cache-paths";

/* [1010] 쓰기 API 용 한 줄 창구 — "이 단지 화면(허브·임베드)을 지금 비워라".
   어떤 id 표기를 넘겨야 하는지는 complex-cache-paths.ts 주석 참고(허브는 슬러그가 붙은
   정규 주소로, 임베드는 순수 id 로 캐시돼 있다). */

export { complexCacheIds, complexCacheIdsFromNames };

/**
 * 단지 허브(/complex/{정규 슬러그}.{id})와 임베드(/embed/complex/{id})를 비운다.
 *
 * 재검증 실패가 쓰기 결과를 되돌리면 안 되므로 통째로 삼킨다(헬퍼도 각 경로를 삼키지만,
 * 요청 밖에서 부르는 경로가 생겨도 안전하도록 호출도 감싼다). 7일 TTL 이 안전망이다.
 */
export function invalidateComplexById(
  rawId: string | null | undefined,
  opts: { budget?: number } = {},
): InvalidateStats | null {
  const ids = complexCacheIds(rawId);
  if (ids.length === 0) return null;
  try {
    return invalidateComplexIds(ids, opts);
  } catch {
    return null;
  }
}

/** (지역, 단지명)으로 같은 일을 한다 — 매물·실거래처럼 id 를 모르는 쓰기 지점용. */
export function invalidateComplexByNames(
  region: string | null | undefined,
  name: string | null | undefined,
  opts: { budget?: number } = {},
): InvalidateStats | null {
  const ids = complexCacheIdsFromNames(region, name);
  if (ids.length === 0) return null;
  try {
    return invalidateComplexIds(ids, opts);
  } catch {
    return null;
  }
}
