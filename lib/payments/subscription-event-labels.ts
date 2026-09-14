/**
 * [1000] 구독 이력 이벤트 — 종류·한글 라벨. 순수 모듈(타임라인 화면·테스트·서버 공용).
 * 값은 DB check 제약(public.subscription_events.event)과 같아야 한다.
 */

export const SUBSCRIPTION_EVENTS = [
  "enrolled",
  "activated",
  "renewed",
  "renewal_failed",
  "suspended",
  "card_changed",
  "canceled",
  "deleted",
  "notice_sent",
  "reactivated",
] as const;

export type SubscriptionEventType = (typeof SUBSCRIPTION_EVENTS)[number];

export const SUBSCRIPTION_EVENT_LABEL: Record<SubscriptionEventType, string> = {
  enrolled: "카드 등록",
  activated: "자동결제 시작",
  renewed: "자동결제 갱신",
  renewal_failed: "갱신 결제 실패",
  suspended: "자동결제 일시중단",
  card_changed: "결제 카드 변경",
  canceled: "자동결제 해지",
  deleted: "카드 등록 해제",
  notice_sent: "결제 예정 안내 발송",
  reactivated: "자동결제 재개",
};

/** 타임라인 점 색 — 토큰 클래스만(색상값 직접 지정 금지) */
export const SUBSCRIPTION_EVENT_TONE: Record<SubscriptionEventType, "ok" | "warn" | "bad" | "muted"> = {
  enrolled: "ok",
  activated: "ok",
  renewed: "ok",
  renewal_failed: "bad",
  suspended: "warn",
  card_changed: "ok",
  canceled: "muted",
  deleted: "muted",
  notice_sent: "muted",
  reactivated: "ok",
};

export function isSubscriptionEventType(v: unknown): v is SubscriptionEventType {
  return typeof v === "string" && (SUBSCRIPTION_EVENTS as readonly string[]).includes(v);
}

export function subscriptionEventLabel(event: string): string {
  return isSubscriptionEventType(event) ? SUBSCRIPTION_EVENT_LABEL[event] : event;
}
