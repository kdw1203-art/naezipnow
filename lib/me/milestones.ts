/* [1168] 함께한 기록 — 가입 뒤 일주일 · 한 달 · 6개월 · 1년, 그리고 첫 임장노트 · 전문가 승인.
   그 날 수신함 · 메일 · MY 팝업으로 "그동안 한 일"을 한 줄로 보여 준다. 여기는 계산만 한다. */

export const TENURE_MARKS = [
  { id: "d7", days: 7, label: "일주일" },
  { id: "d30", days: 30, label: "한 달" },
  { id: "d180", days: 180, label: "6개월" },
  { id: "d365", days: 365, label: "1년" },
] as const;
export type TenureMarkId = (typeof TENURE_MARKS)[number]["id"];
export type MilestoneKind = TenureMarkId | "first_note" | "expert_approved";

export type ActivityStats = { notes: number; analyses: number; watchlist: number; groups: number };

const KST = 9 * 3600 * 1000;
const DAY = 86400 * 1000;

/** 한국 날짜 기준 가입 뒤 며칠째인가(가입일 = 0). */
export function daysSince(createdAt: string | null | undefined, nowMs: number): number | null {
  const ts = Date.parse(createdAt ?? "");
  if (!Number.isFinite(ts) || ts > nowMs) return null;
  return Math.floor((nowMs + KST) / DAY) - Math.floor((ts + KST) / DAY);
}

/** 오늘이 딱 그 날인 기록(크론용 — 하루 한 번 돌 때 한 번만 걸린다). */
export function tenureMarkToday(createdAt: string | null | undefined, nowMs: number) {
  const d = daysSince(createdAt, nowMs);
  return d === null ? null : (TENURE_MARKS.find((m) => m.days === d) ?? null);
}

/** 그 날부터 windowDays 일 동안 보여 줄 기록(MY 팝업용). 겹치면 가장 최근 것. */
export function tenureMarkRecent(createdAt: string | null | undefined, nowMs: number, windowDays = 7) {
  const d = daysSince(createdAt, nowMs);
  if (d === null) return null;
  const hit = TENURE_MARKS.filter((m) => d >= m.days && d < m.days + windowDays);
  return hit.length > 0 ? hit[hit.length - 1] : null;
}

/** 크론이 읽을 가입 시각 범위 — 한국 날짜로 정확히 days 일 전 하루. */
export function signupWindow(days: number, nowMs: number): { from: string; to: string } {
  const dayIdx = Math.floor((nowMs + KST) / DAY) - days;
  return { from: new Date(dayIdx * DAY - KST).toISOString(), to: new Date((dayIdx + 1) * DAY - KST).toISOString() };
}

/** "임장노트 3개 · AI 분석 2회 · 관심 단지 5곳 · 모임 1곳" — 0 인 항목은 뺀다. */
export function activityLine(s: ActivityStats): string {
  return [
    s.notes > 0 ? `임장노트 ${s.notes}개` : null,
    s.analyses > 0 ? `AI 분석 ${s.analyses}회` : null,
    s.watchlist > 0 ? `관심 단지 ${s.watchlist}곳` : null,
    s.groups > 0 ? `모임 ${s.groups}곳` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export type MilestoneMessage = { kind: MilestoneKind; title: string; body: string; href: string; cta: string };

export function milestoneMessage(kind: MilestoneKind, name: string, s: ActivityStats): MilestoneMessage {
  const who = (name || "회원").trim().slice(0, 20);
  const line = activityLine(s);
  if (kind === "first_note") {
    return {
      kind,
      title: `${who}님의 첫 임장노트`,
      body: "첫 임장노트 저장 완료 · 같은 단지를 다시 가면 지난 기록과 나란히 비교",
      href: "/my/history",
      cta: "내 임장 이력 보기",
    };
  }
  if (kind === "expert_approved") {
    return {
      kind,
      title: `${who}님, 전문가 승인 완료`,
      body: "프로 요금제 1년 · 전문가 홍보 1년 무료 적용",
      href: "/my/expert-profile",
      cta: "전문가 프로필 보기",
    };
  }
  const mark = TENURE_MARKS.find((m) => m.id === kind)!;
  return {
    kind,
    title: `${who}님과 함께한 ${mark.label}`,
    body: line || "아직 남긴 기록 없음 · 첫 임장노트부터",
    href: line ? "/my/history" : "/notes/new",
    cta: line ? "내 임장 이력 보기" : "임장노트 쓰기",
  };
}
