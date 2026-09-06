/**
 * [967 · 24] 알림 읽음 → 헤더 벨 배지 즉시 갱신용 브라우저 이벤트.
 *
 * /notifications 에서 "모두 읽음"·항목 열기로 읽음 처리한 뒤 벨(NotificationBell)이
 * 다음 페이지 이동 때까지 옛 숫자를 달고 있었다. 벨은 마운트 때 한 번만 세기
 * 때문이다. 페이지가 남은 수를 이벤트로 알리고 벨이 그 값으로 배지를 바꾼다 —
 * 서버를 한 번 더 부르지 않는다(방금 그 서버에 읽음을 보냈으니 남은 수는 안다).
 *
 * 브라우저 전용(window). 서버 import 없음 — 클라이언트 두 곳이 같이 쓴다.
 */
export const NOTIFICATIONS_READ_EVENT = "nz:notifications-read";

export type NotificationsReadDetail = {
  /** 읽음 처리 뒤 남은 **사용자 채널** 미읽음 수(벨이 세는 채널과 같다) */
  remaining: number;
};

export function emitNotificationsRead(remaining: number): void {
  if (typeof window === "undefined") return;
  const n = Number.isFinite(remaining) ? Math.max(0, Math.floor(remaining)) : 0;
  try {
    window.dispatchEvent(
      new CustomEvent<NotificationsReadDetail>(NOTIFICATIONS_READ_EVENT, { detail: { remaining: n } }),
    );
  } catch {
    /* CustomEvent 미지원 환경 — 벨은 다음 focus 재조회에서 따라온다 */
  }
}

/** 이벤트 detail 에서 remaining 을 안전하게 읽는다(잘못된 값이면 null) */
export function readNotificationsReadDetail(ev: Event): number | null {
  const detail = (ev as CustomEvent<Partial<NotificationsReadDetail>>).detail;
  const n = detail?.remaining;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}
