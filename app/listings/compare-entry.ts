/**
 * [1009 · T 리뷰 MED-10] 매물 비교함 입구 — 소유자가 정하기 전까지 닫아 둔다.
 *
 * 왜: 비교 화면 /listings/compare 는 보관 경로다(lib/seo/archived-routes.ts — 입구만 닫고 30일 관찰). 그런데 /listings
 * 목록이 카드마다 "비교 담기" 토글을, 화면 아래에 비교함 트레이("비교하기" → /listings/compare)를 상주시켜 보관 영역으로
 * 다시 들어가게 했다 — 1009 에서 토스트·되돌리기를 붙여 오히려 입구를 키웠다. 카드 링크(<a>) 안에 토글 단추가 든
 * 중첩 조작(ListingsListClient)도 함께 없어진다.
 * 코드는 남기고 렌더만 끈다 — 보관을 풀기로 하면 true 로 되돌린다(비교 화면·저장소·트레이는 그대로 돈다).
 * 서버 컴포넌트(app/listings/page.tsx)도 읽으므로 여기엔 상수만 둔다(클라이언트 저장소를 끌고 오지 않게).
 */
export const LISTING_COMPARE_ENTRY_OPEN = false;
