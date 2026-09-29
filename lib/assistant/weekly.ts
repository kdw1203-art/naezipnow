/**
 * [1025 · 결정·비서] AI 비서(/my/assistant) 순수 규칙 — 수신함 알림의 종류 판정 · 최근 7일 집계 · D-day.
 *
 * user_inbox_notifications 에는 kind 칸이 없다(실측 2026-09-29 — 칸은 id·user_email·title·body·action_url·read_at·
 * created_at·channel). 종류는 **쓰는 쪽이 적는 제목**으로 가른다 — 크론 4개의 제목 리터럴을 그대로 옮겼다:
 *   · 새 실거래  : app/api/cron/watchlist-new-tx  `관심단지 새 실거래 N건`
 *   · 가격 변동  : app/api/cron/price-alerts       `관심 단지 가격 변동` · lib/watchlist/store-db `… 가격 변동 알림`
 *   · 저장 검색  : app/api/cron/saved-search-alerts `저장검색 새 결과`
 *   · 주간 브리핑: app/api/cron/weekly-digest       `<주> 주간 다이제스트` · lib/digest/personal-format `이번 주 내 요약 — …` ·
 *                  `<주> 내 주간 요약` · action_url "/digest"
 * 제목이 바뀌면 여기도 바뀌어야 한다 — tests/unit/decide-1025.test.ts 가 네 리터럴을 잠근다.
 */

export type InboxKind = "tx" | "price" | "saved" | "digest" | "other";

export const INBOX_KIND_LABEL: Record<Exclude<InboxKind, "other">, string> = {
  tx: "새 실거래 알림",
  price: "가격 변동",
  saved: "저장 검색 매치",
  digest: "주간 브리핑",
};

export function inboxKindOf(row: { title: string; actionUrl?: string | null }): InboxKind {
  const t = (row.title ?? "").trim();
  if (t.startsWith("관심단지 새 실거래")) return "tx";
  if (t === "관심 단지 가격 변동" || t.endsWith("가격 변동 알림")) return "price";
  if (t === "저장검색 새 결과") return "saved";
  if (t.includes("주간 다이제스트") || t.startsWith("이번 주 내 요약") || t.endsWith("내 주간 요약")) return "digest";
  if ((row.actionUrl ?? "") === "/digest") return "digest";
  return "other";
}

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface WeeklyCounts {
  tx: number;
  price: number;
  saved: number;
  digest: number;
  other: number;
  /** 네 종류 + 기타 합 */
  total: number;
  /** 창 [from, to] ISO */
  fromIso: string;
  toIso: string;
}

/** 최근 7일 [now-7d, now] 안의 알림을 종류별로 센다. created_at 을 못 읽는 행은 세지 않는다 */
export function countWeekly(
  rows: readonly { title: string; actionUrl?: string | null; createdAt: string }[],
  now: Date = new Date(),
): WeeklyCounts {
  const to = now.getTime();
  const from = to - WEEK_MS;
  const out: WeeklyCounts = { tx: 0, price: 0, saved: 0, digest: 0, other: 0, total: 0, fromIso: new Date(from).toISOString(), toIso: now.toISOString() };
  for (const r of rows) {
    const t = Date.parse(r.createdAt);
    if (!Number.isFinite(t) || t < from || t > to) continue;
    out[inboxKindOf(r)] += 1;
    out.total += 1;
  }
  return out;
}

/* ── KST 달력 ─────────────────────────────────────────────────────────── */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 달력 날짜(자정 기준 epoch 일수) */
function kstDayIndex(t: number): number {
  return Math.floor((t + KST_OFFSET_MS) / 86_400_000);
}

/** "YYYY-MM-DD"(KST) */
export function kstDay(input: string | number | Date): string {
  const t = typeof input === "number" ? input : input instanceof Date ? input.getTime() : Date.parse(input);
  if (!Number.isFinite(t)) return "";
  return new Date(t + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 오늘(KST)부터 그 날까지 남은 날 수 — 오늘 0 · 내일 1 · 지난 날은 음수. 못 읽으면 null */
export function daysUntil(target: string | null | undefined, now: Date = new Date()): number | null {
  if (!target) return null;
  const t = /^\d{4}-\d{2}-\d{2}$/.test(target) ? Date.parse(`${target}T00:00:00+09:00`) : Date.parse(target);
  if (!Number.isFinite(t)) return null;
  return kstDayIndex(t) - kstDayIndex(now.getTime());
}

/** "D-3" · "D-day" · "D+2" */
export function dDayLabel(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "D-day";
  return days > 0 ? `D-${days}` : `D+${-days}`;
}

/** "2026-09-23 ~ 09-29" — 사실 줄의 창 표기(KST) */
export function weekRangeLabel(counts: Pick<WeeklyCounts, "fromIso" | "toIso">): string {
  const a = kstDay(counts.fromIso);
  const b = kstDay(counts.toIso);
  if (!a || !b) return "최근 7일";
  return `${a} ~ ${b.slice(5)}`;
}

/* ── [1025c] 이번 주 7일 스트립 · 비서 한 줄 ─────────────────────────────
   "이번 주" = KST 월요일 ~ 일요일. 칸마다 그 날(KST)의 수신함 알림 수(종류별). 오늘 뒤의 날은 아직 없음(future).
   listInboxLastWeek 은 [now-7d, now] 를 읽으므로 월요일부터 오늘까지는 전부 들어 있다(월요일은 최대 6일 전). */

export const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

export interface WeekStripDay {
  /** "YYYY-MM-DD"(KST) */
  date: string;
  /** "월"… */
  dow: string;
  /** 달력 일(1~31) */
  day: number;
  today: boolean;
  future: boolean;
  /** 이 날의 알림 수(전부) */
  count: number;
  tx: number;
  price: number;
}

export interface WeekStrip {
  days: WeekStripDay[];
  /** 월요일 ~ 오늘 사이 */
  txNotices: number;
  /** 새 실거래 알림 제목의 건수 합("관심단지 새 실거래 N건" 의 N) */
  txDeals: number;
  price: number;
  total: number;
  /** "2026-09-28 ~ 10-04" */
  rangeLabel: string;
}

/** "관심단지 새 실거래 12건" → 12. 숫자가 없으면 1(알림 하나는 최소 한 건) · 새 실거래 알림이 아니면 0 */
export function txCountFromTitle(title: string): number {
  const t = (title ?? "").trim();
  if (!t.startsWith("관심단지 새 실거래")) return 0;
  const m = /(\d[\d,]*)건/.exec(t);
  const n = m ? Number(m[1].replace(/,/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** 이번 주 월요일(KST)의 epoch 일수 */
function kstMondayIndex(now: Date): number {
  const today = kstDayIndex(now.getTime());
  /* epoch 일수 0 = 1970-01-01(목) → 요일 = (idx + 4) % 7 (0 = 일) */
  const dow = (((today + 4) % 7) + 7) % 7;
  return today - ((dow + 6) % 7);
}

function dayFromIndex(idx: number): string {
  return new Date(idx * 86_400_000).toISOString().slice(0, 10);
}

/** 이번 주(월~일 KST) 7칸에 최근 알림을 날짜별로 담는다 */
export function weekStrip(rows: readonly { title: string; actionUrl?: string | null; createdAt: string }[], now: Date = new Date()): WeekStrip {
  const todayIdx = kstDayIndex(now.getTime());
  const mon = kstMondayIndex(now);
  const days: WeekStripDay[] = Array.from({ length: 7 }, (_, i) => {
    const idx = mon + i;
    const date = dayFromIndex(idx);
    return {
      date,
      dow: WEEKDAY_KO[(((idx + 4) % 7) + 7) % 7],
      day: Number(date.slice(8, 10)),
      today: idx === todayIdx,
      future: idx > todayIdx,
      count: 0,
      tx: 0,
      price: 0,
    };
  });
  let txNotices = 0;
  let txDeals = 0;
  let price = 0;
  let total = 0;
  for (const r of rows) {
    const t = Date.parse(r.createdAt);
    if (!Number.isFinite(t)) continue;
    const i = kstDayIndex(t) - mon;
    if (i < 0 || i > 6) continue;
    const kind = inboxKindOf(r);
    const d = days[i];
    d.count += 1;
    total += 1;
    if (kind === "tx") {
      d.tx += 1;
      txNotices += 1;
      txDeals += txCountFromTitle(r.title);
    } else if (kind === "price") {
      d.price += 1;
      price += 1;
    }
  }
  return { days, txNotices, txDeals, price, total, rangeLabel: `${days[0].date} ~ ${days[6].date.slice(5)}` };
}

/**
 * 비서 한 줄 — 규칙으로만 만든다(실제 수치 · 권유 없음).
 * "이번 주 관심 단지 6곳 중 새 실거래 3건 · 가격 변동 1건 · 다음 임장 D-3"
 * 관심 단지 수를 못 읽었으면(null) "관심 단지" 만. 임장 없으면 "없음".
 */
export function assistantLine(input: { watchCount: number | null; txDeals: number; price: number; nextInspectionDays: number | null }): string {
  const head = input.watchCount === null ? "이번 주 관심 단지" : `이번 주 관심 단지 ${input.watchCount.toLocaleString("ko-KR")}곳 중`;
  const n = (v: number) => `${v.toLocaleString("ko-KR")}건`;
  return `${head} 새 실거래 ${n(input.txDeals)} · 가격 변동 ${n(input.price)} · 다음 임장 ${input.nextInspectionDays === null ? "없음" : dDayLabel(input.nextInspectionDays)}`;
}

/** 계약 일정표(lib/journey ContractPlan)에서 오늘 이후 가장 가까운 날짜 한 개 — 없으면 null */
export function nextContractDate(
  plan: { contractDate: string | null; midDate: string | null; balanceDate: string | null; moveInDate: string | null } | null | undefined,
  now: Date = new Date(),
): { label: string; date: string; days: number } | null {
  if (!plan) return null;
  const cands: { label: string; date: string | null }[] = [
    { label: "계약", date: plan.contractDate },
    { label: "중도금", date: plan.midDate },
    { label: "잔금", date: plan.balanceDate },
    { label: "입주", date: plan.moveInDate },
  ];
  let best: { label: string; date: string; days: number } | null = null;
  for (const c of cands) {
    const d = daysUntil(c.date, now);
    if (d === null || d < 0 || !c.date) continue;
    if (!best || d < best.days) best = { label: c.label, date: c.date, days: d };
  }
  return best;
}
