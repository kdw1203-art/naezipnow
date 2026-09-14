/**
 * [1000] 정기결제 청구 사전 통지 판정 — 순수 함수(크론과 테스트가 같은 식을 본다).
 *
 * 전자상거래법 시행령 취지: 정기결제는 청구 전에 "언제·얼마" 를 미리 알린다.
 * 같은 회차(next_charge_at)에 두 번 보내지 않도록 notice_sent_for 에 통지한 회차를
 * 적어 두고, 값이 같으면 건너뛴다. 비교는 문자열이 아니라 시각(ms)으로 한다 —
 * PostgREST 가 돌려주는 timestamptz 표기와 우리가 쓴 ISO 문자열은 모양이 다를 수 있다.
 */

export const UPCOMING_NOTICE_LEAD_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

function toMs(v: string | number | Date | null | undefined): number {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.getTime();
  return Date.parse(v);
}

/**
 * 이 구독에 지금 사전 통지를 보내야 하는가.
 *  - next_charge_at 이 없거나 파싱 불가 → false
 *  - 이미 지난 회차(청구 시각 ≤ now) → false (갱신 크론 몫 — "곧 결제돼요" 는 거짓말)
 *  - leadDays 보다 먼 회차 → false
 *  - 같은 회차에 이미 통지했으면(notice_sent_for == next_charge_at, 1초 오차 허용) → false
 */
export function needsUpcomingNotice(input: {
  nextChargeAt: string | number | Date | null | undefined;
  noticeSentFor: string | number | Date | null | undefined;
  now?: number | Date;
  leadDays?: number;
}): boolean {
  const next = toMs(input.nextChargeAt);
  if (!Number.isFinite(next)) return false;
  const now = input.now === undefined ? Date.now() : toMs(input.now);
  const lead = (input.leadDays ?? UPCOMING_NOTICE_LEAD_DAYS) * DAY_MS;
  if (next <= now) return false;
  if (next - now > lead) return false;
  const sent = toMs(input.noticeSentFor);
  if (Number.isFinite(sent) && Math.abs(sent - next) < 1000) return false;
  return true;
}
