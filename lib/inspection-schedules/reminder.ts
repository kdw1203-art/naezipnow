/**
 * [1056 · C7] 내일 임장 일정 리마인드 — 순수 계산(크론 라우트 app/api/cron/schedule-reminders 와 테스트 공용).
 *
 * 왜 따로 두나: inspection_schedules 는 일정을 저장만 하고 아무도 알려 주지 않았다(status=planned 가 그대로
 * 지나간다). 리마인드는 하루 한 번(etl.yml alerts 잡 · 06:00 UTC = 15:00 KST) 돌며 "내일(KST)" 일정만 고른다.
 * 날짜 창 계산을 여기 순수 함수로 빼 둔 건 고정 시각으로 검증하기 위해서다 — 크론이 UTC 에서 돌아 KST 자정
 * 근처에서 하루가 어긋나는 사고(lib/points/store-db.kstDateString 의 사유와 같다)를 테스트로 잠근다.
 *
 * KST 는 서머타임이 없어 +9h 고정 산술로 충분하다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 수신함·푸시 제목 — 멱등 검사(같은 제목+본문이 이틀 안에 있으면 건너뜀)의 키이기도 하다 */
export const SCHEDULE_REMINDER_TITLE = "내일 임장 일정";

/** 알림을 누르면 가는 곳 — 예정 일정 목록은 AI 비서 화면(app/my/assistant)에 있다 */
export const SCHEDULE_REMINDER_URL = "/my/assistant";

export type KstDayWindow = {
  /** 내일의 한국 날짜 "YYYY-MM-DD" */
  date: string;
  /** 내일 00:00 KST 를 UTC ISO 로(포함) */
  startIso: string;
  /** 모레 00:00 KST 를 UTC ISO 로(미포함) */
  endIso: string;
};

/** `now` 기준 한국 날짜의 **다음 날** 하루 창 [startIso, endIso). */
export function kstTomorrowWindow(now: Date = new Date()): KstDayWindow {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  /* Date.UTC 는 일(day) 넘침을 달·연으로 올려 준다(10/31 + 1 → 11/01) */
  const tomorrowKstMidnightAsUtc = Date.UTC(y, m, d + 1);
  const startMs = tomorrowKstMidnightAsUtc - KST_OFFSET_MS;
  return {
    date: new Date(tomorrowKstMidnightAsUtc).toISOString().slice(0, 10),
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(startMs + DAY_MS).toISOString(),
  };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** ISO 시각 → "MM/DD HH:mm"(KST). 파싱 실패면 null */
export function kstShortDateTime(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const k = new Date(t + KST_OFFSET_MS);
  return `${pad2(k.getUTCMonth() + 1)}/${pad2(k.getUTCDate())} ${pad2(k.getUTCHours())}:${pad2(k.getUTCMinutes())}`;
}

/** 본문 — "{단지/장소명} · {MM/DD HH:mm}". 단지명이 없으면 일정 제목, 시각을 못 읽으면 날짜 대신 "내일". */
export function scheduleReminderBody(s: {
  title: string;
  aptName: string | null;
  scheduledAt: string;
}): string {
  const place = (s.aptName ?? "").trim() || s.title.trim() || "임장";
  return `${place} · ${kstShortDateTime(s.scheduledAt) ?? "내일"}`;
}
