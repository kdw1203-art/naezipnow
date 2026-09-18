/**
 * [1003] 애널리틱스로 내보내는 주소에서 결제 열쇠를 지운다 — 순수 모듈.
 *
 * `paymentKey` 는 결제창을 통과한 브라우저에만 돌아오는 값이고, 1003 부터는 이 값이 있어야
 * 비회원 결제에 이메일을 붙일 수 있다(POST /api/payments/guest-claim). 전체 URL 을 GA4 에
 * 실어 보내면 그 열쇠가 보고서(페이지 경로 + 쿼리 문자열)에 남는다 — 속성 열람 권한만 있으면
 * 읽히고, 읽은 사람은 남의 결제에 자기 이메일을 붙일 수 있다.
 * 주문번호·금액은 광고 전환 집계가 쓰므로 그대로 두고, 열쇠 종류만 뺀다.
 */
export const ANALYTICS_STRIPPED_PARAMS = ["paymentKey", "secret", "token", "code"] as const;

export function safePageLocation(href: string): string {
  try {
    const u = new URL(href);
    let touched = false;
    for (const k of ANALYTICS_STRIPPED_PARAMS) {
      if (u.searchParams.has(k)) {
        u.searchParams.delete(k);
        touched = true;
      }
    }
    return touched ? u.toString() : href;
  } catch {
    /* 주소를 파싱하지 못하면 쿼리째 버린다 — 열쇠가 섞여 나가는 쪽이 더 나쁘다 */
    return href.split("?")[0] ?? href;
  }
}
