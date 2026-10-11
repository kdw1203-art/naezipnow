/**
 * [1057 · C3] 내 집 마련 여정 D-day 리마인드 — 순수 계산(크론 라우트 app/api/cron/journey-reminders 와 테스트 공용).
 *
 * 왜: user_preferences.journey_state 에 계약일·중도금일·잔금일·입주일(YYYY-MM-DD)을 적어 두어도 아무 크론도 알리지 않았다 —
 * /journey 를 다시 열어야만 보이는 날짜였다. 하루 한 번(etl.yml alerts 잡 · 06:00 UTC = 15:00 KST) 돌며
 * 한국 날짜 기준으로 **정확히 7일 앞 · 1일 앞**인 항목만 고른다.
 *
 * 수신함 제목 "{항목} D-7" · 본문 "{M/D} · 내 집 마련 여정" · actionUrl "/journey". 같은 제목+본문이 최근 10일 안에 있으면 건너뛴다
 * (수동 실행·지연 재실행 대비). "오늘"은 KST(lib/journey/dates kstToday — Asia/Seoul 고정) — UTC 날짜로 세면 KST 자정~09:00
 * 사이 실행에서 하루가 어긋난다.
 */
import { daysBetween, kstToday } from "./dates";
import { isIsoDay, type ContractPlan, type JourneyState } from "./state";

export const JOURNEY_REMINDER_URL = "/journey";
export const JOURNEY_REMINDER_SUFFIX = "내 집 마련 여정";
/** 며칠 앞에서 알리는가 — D-7 · D-1 */
export const JOURNEY_REMINDER_OFFSETS = [7, 1] as const;
/** 멱등 창(일) — 같은 제목+본문이 이 안에 있으면 건너뛴다 */
export const JOURNEY_REMINDER_DEDUPE_DAYS = 10;

export type JourneyDateKey = "contractDate" | "midDate" | "balanceDate" | "moveInDate";

/** 일정표의 날짜 칸과 수신함에 적는 항목 이름(lib/journey/contract.ts 의 제목과 같다) */
export const JOURNEY_DATE_FIELDS: ReadonlyArray<{ key: JourneyDateKey; label: string }> = [
  { key: "contractDate", label: "계약일" },
  { key: "midDate", label: "중도금일" },
  { key: "balanceDate", label: "잔금일" },
  { key: "moveInDate", label: "입주일" },
];

export type JourneyReminder = {
  key: JourneyDateKey;
  label: string;
  /** 해당 날짜 YYYY-MM-DD */
  date: string;
  daysLeft: (typeof JOURNEY_REMINDER_OFFSETS)[number];
  title: string;
  body: string;
};

export function journeyReminderTitle(label: string, daysLeft: number): string {
  return `${label} D-${daysLeft}`;
}

/** "10/18 · 내 집 마련 여정" — 월·일은 0 없이 */
export function journeyReminderBody(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d} · ${JOURNEY_REMINDER_SUFFIX}`;
}

/**
 * 일정표에서 오늘(KST) 기준 D-7 · D-1 인 항목. 날짜가 없거나 모양이 틀린 칸은 건너뛴다.
 * 순서는 JOURNEY_DATE_FIELDS 순(계약 → 중도금 → 잔금 → 입주).
 */
export function dueJourneyReminders(contract: ContractPlan | null | undefined, now: Date = new Date()): JourneyReminder[] {
  if (!contract) return [];
  const today = kstToday(now.getTime());
  const out: JourneyReminder[] = [];
  for (const f of JOURNEY_DATE_FIELDS) {
    const date = contract[f.key];
    if (!isIsoDay(date)) continue;
    const left = daysBetween(today, date);
    for (const offset of JOURNEY_REMINDER_OFFSETS) {
      if (left !== offset) continue;
      out.push({
        key: f.key,
        label: f.label,
        date,
        daysLeft: offset,
        title: journeyReminderTitle(f.label, offset),
        body: journeyReminderBody(date),
      });
    }
  }
  return out;
}

/** 저장된 journey_state(jsonb 원문)에서 — 정규화는 호출자가(normalizeJourneyState) 하고 여기엔 상태를 넘긴다 */
export function dueJourneyRemindersFor(state: JourneyState, now: Date = new Date()): JourneyReminder[] {
  return dueJourneyReminders(state.contract, now);
}
