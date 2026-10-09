/**
 * [1052 · 마이 사용량 표] 줄마다 "무엇을 · 언제부터" 센 숫자인지 — 순수(단위 시험 대상).
 *
 * 왜: 마이 화면 사용량 표의 제목이 "이번 달 사용량"이었는데, 세 줄 중 북마크·관심 단지는 이번 달이 아니라
 * 지금 담아 둔 개수(보유)였고, 무료 AI 분석은 누적이었다. 줄마다 기간을 적고, 매달 초기화되는 줄에는
 * 초기화 날짜를 적는다.
 *
 * "이번 달"은 한국 시간(UTC+9) 달이다. 서버(Vercel)는 UTC 로 돌아서 예전엔 매달 1일 0시~9시(한국)에
 * 지난달 한도가 그대로 남았고, 10월 31일 16시(UTC) 실행은 한국으로 11월 1일 1시인데 10월로 셌다.
 * 한국은 서머타임이 없어 +9시간 고정 — Intl 없이 셈한다.
 */

export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 줄이 세는 기간 — month: 이번 달(매달 1일 초기화) · lifetime: 누적(초기화 없음) · current: 지금 보유 개수 */
export type UsagePeriod = "month" | "lifetime" | "current";

function toMs(now: Date | number | string): number {
  return typeof now === "number" ? now : typeof now === "string" ? Date.parse(now) : now.getTime();
}

/** 한국 시간 이번 달 1일 0시(= 전달 말일 15시 UTC) */
export function kstMonthStart(now: Date | number | string = Date.now()): Date {
  const k = new Date(toMs(now) + KST_OFFSET_MS);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1) - KST_OFFSET_MS);
}

/** 한국 시간 다음 달 1일 0시 — 월 한도가 다시 열리는 때 */
export function kstNextMonthStart(now: Date | number | string = Date.now()): Date {
  const k = new Date(toMs(now) + KST_OFFSET_MS);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth() + 1, 1) - KST_OFFSET_MS);
}

/**
 * 사용량 한 줄의 기간. AI 분석은 한도 검사(checkAiAnalysisQuota)와 같은 셈 — 누적 한도가 있으면 누적, 아니면 이번 달.
 * 북마크·관심 단지는 한도 검사가 지금 담아 둔 개수를 세므로(countBookmarks · countWatchlist) 보유.
 */
export function usagePeriodFor(key: string, lifetime: boolean): UsagePeriod {
  if (lifetime) return "lifetime";
  if (key === "bookmark" || key === "interest_complex") return "current";
  return "month";
}

export function usagePeriodLabel(period: UsagePeriod): string {
  return period === "month" ? "이번 달" : period === "lifetime" ? "누적" : "보유";
}

/** "11월 1일 초기화" — 한국 시간 날짜. 읽을 수 없는 값이면 "" */
export function formatResetLabel(resetsAt: string | null | undefined): string {
  if (!resetsAt) return "";
  const t = Date.parse(resetsAt);
  if (!Number.isFinite(t)) return "";
  const k = new Date(t + KST_OFFSET_MS);
  return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 초기화`;
}

/** 표의 한 줄 아래에 적는 기간 설명 — "이번 달 · 11월 1일 초기화" / "누적 · 초기화 없음" / "보유" */
export function usagePeriodNote(period: UsagePeriod, resetsAt?: string | null): string {
  if (period === "month") {
    const reset = formatResetLabel(resetsAt);
    return reset ? `이번 달 · ${reset}` : "이번 달";
  }
  if (period === "lifetime") return "누적 · 초기화 없음";
  return "보유";
}
