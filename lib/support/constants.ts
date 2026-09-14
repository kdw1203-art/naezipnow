/**
 * [1000] 고객센터 공통 상수 — 서버·클라이언트 어디서든 import 해도 되는 순수 모듈.
 *
 * RESPONSE_TIME 은 예전에 app/support/page.tsx 안에 갇혀 있어서 문의 폼·접수 완료
 * 화면·/api/support 접수 알림·내 문의 내역이 각자 문구를 적었다. 한 곳에서 읽는다 —
 * 실측 평균은 어디에도 없으므로 코드가 실제로 약속하는 값 하나만 둔다.
 */
export const RESPONSE_TIME = "영업일 기준 24~72시간 이내 답변";

/** 운영 시간 — 화면 곳곳의 "평일 10-18시" 도 여기서 */
export const SUPPORT_HOURS = "평일 10-18시";
