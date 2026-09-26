/**
 * [1009 · A · 리뷰] 월 거래량 등락 — 신고가 끝난 달끼리만 비교한다(순수 함수 · 테스트 대상).
 *
 * 왜(리뷰 실측, 운영 DB): 강남구 2026.08 은 9/30 까지 신고가 들어오는 달인데(80건), 신고가 끝난 7월(189건)과
 * 견줘 "▼ 57.7% 지난달 대비"를 KPI 배지·요약 줄에 적었다 — 덜 모인 달을 다 모인 달과 비교한 것이다.
 * 신고 기한(계약 달 말일 + 30일, lib/newui/reporting-window.ts 와 같은 규칙)이 지난 달끼리 등락을 내고,
 * 기한 안의 달은 숫자만 보여 주고 "집계 중"이라고 적는다.
 */
import { splitByReporting } from "@/lib/newui/reporting-window";

export type VolumeRow = { month: string; count: number };

export type VolumeCompare = {
  /** 표의 마지막 달 */
  latest: VolumeRow | null;
  /** 아직 신고 기한 안인 달(오래된 순) — 숫자가 앞으로 늘어난다 */
  open: VolumeRow[];
  /** 신고가 끝난 마지막 달과 그 앞 달 — 등락은 이 둘로만 */
  closedLast: VolumeRow | null;
  closedPrev: VolumeRow | null;
  /** closedLast ÷ closedPrev − 1 (%, 소수 1자리) — 앞 달이 0건이거나 없으면 null */
  closedDeltaPct: number | null;
};

export function volumeCompare(rows: readonly VolumeRow[], now: Date): VolumeCompare {
  const { closed, open } = splitByReporting(rows, now);
  const closedLast = closed.length > 0 ? closed[closed.length - 1] : null;
  const closedPrev = closed.length > 1 ? closed[closed.length - 2] : null;
  const closedDeltaPct =
    closedLast && closedPrev && closedPrev.count > 0
      ? Math.round(((closedLast.count - closedPrev.count) / closedPrev.count) * 1000) / 10
      : null;
  return { latest: rows.length > 0 ? rows[rows.length - 1] : null, open, closedLast, closedPrev, closedDeltaPct };
}

/** yyyymm 계약분의 신고 기한(그 달 말일 + 30일) — "9/30" */
export function reportingDeadlineLabel(ym: string): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6));
  const d = new Date(Date.UTC(y, m, 0) + 30 * 86_400_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/** "202607" → "7월" */
export function monthWord(ym: string): string {
  return `${Number(ym.slice(4, 6))}월`;
}
