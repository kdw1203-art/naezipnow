/* [1026f · 결제] 결제위젯 "결제 UI" 의 베리언트 키 — 체크아웃 · 관리자 결제 화면 · 헬스체크가 같은 값을 쓴다.
   소유자(2026-10-01)가 상점관리자 → 결제 UI 설정(라이브)에 만든 UI: 이름 "결제 UI" · 베리언트 키 "naezipnow" · 국내 일반결제(nuguzibowg).
   토스 SDK 는 키를 안 주면 "DEFAULT" 를 찾는데, 라이브에 그 이름의 UI 가 없어 404 · 4015(존재하지 않는 위젯)로 카드 목록이 안 떴다
   (docs.tosspayments.com/guides/v2/payment-widget/admin — 기본 UI 는 DEFAULT, 추가 UI 는 연동 코드에 variantKey 를 넘긴다).
   Vercel 에 NEXT_PUBLIC_TOSS_WIDGET_VARIANT_KEY 를 넣으면 그 값이 이긴다(관리자 화면에서 UI 이름을 바꿨을 때 — 다시 배포 필요).
   클라이언트 번들에 실린다 — 작게. */
export const TOSS_WIDGET_VARIANT_FALLBACK = "naezipnow";

export function tossWidgetVariant(): string {
  return process.env.NEXT_PUBLIC_TOSS_WIDGET_VARIANT_KEY?.trim() || TOSS_WIDGET_VARIANT_FALLBACK;
}
