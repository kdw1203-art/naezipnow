import { invalidatePathList } from "@/lib/cache/invalidate";

/**
 * [1010] 매물 목록(/listings)을 지금 비운다.
 *
 * ── 왜 필요했나 ────────────────────────────────────────────────────────────
 * `/listings` 는 ISR 이고 `listApprovedListings()`(status="approved")의 결과를 서버 HTML 에
 * 전부 싣는다(필터는 ListingsListClient 가 메모리에서 한다). 지금까지 그 신선도는 300초
 * TTL 이 혼자 맡고 있었다 — 즉 승인 버튼을 눌러도 최대 5분은 안 보였고, 그 대가로 크롤러
 * 재방문마다 재렌더가 돌았다.
 *
 * TTL 을 30분으로 올리는 대신, **목록을 바꾸는 쓰기 지점**에서 여기로 찌른다:
 *   · 관리자 승인·반려 / 관리자 수정            → app/api/admin/listings/route.ts
 *   · 소유자 수정(승인분 수정은 pending 으로 되돌아간다) · 삭제 → app/api/listings/[id]/route.ts
 *   · 거래완료(목록에서 빠진다)                 → app/api/listings/[id]/sold/route.ts
 *   · 끌어올리기(정렬·배지가 바뀐다)            → app/api/listings/[id]/boost/route.ts
 * 등록(POST /api/listings)은 부르지 않는다 — 새 매물은 status="pending" 이라 이 목록에
 * 들어가지 않는다(lib/listings/store-db.ts createListing). 승인 때 위 경로로 비워진다.
 *
 * 같은 쓰기가 단지 허브도 바꾸므로 호출부는 invalidateComplexByNames 와 **나란히** 부른다.
 * 재검증 실패가 쓰기 결과를 되돌리면 안 되므로 통째로 삼킨다 — TTL 이 안전망이다.
 */
export const LISTINGS_INDEX_PATHS = ["/listings"] as const;

export function invalidateListingsIndex(): void {
  try {
    invalidatePathList(LISTINGS_INDEX_PATHS, { label: "listings-index" });
  } catch {
    /* 요청 밖(크론·백그라운드)에서 불려 revalidatePath 가 던져도 쓰기는 이미 끝났다 */
  }
}
