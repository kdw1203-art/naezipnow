/**
 * [1022 · 단지 분석 고도화] 이전 실행과 견주기 — history-store(localStorage) 항목을 읽어 한 줄로 만드는 순수 함수.
 *
 * 지시 3: 종합 진단 "같은 단지의 이전 실행 점수(지난번 N점 → 지금 M점)" · 매수 타이밍 "신호 조합 이력
 * (같은 지역 이전 실행이 있으면 '지난번 좋음 2 : 주의 1')".
 *
 * 저장은 화면(ResultView)이 verdict 가 설 때 pushHistory 로 하고, 여기서는 **읽어서 문장으로만** 만든다.
 * 새 수치 없음 — 저장된 점수·신호 개수를 그대로 옮긴다. DB·시계를 만지지 않는다(now 는 인자).
 */
import type { HistoryEntry } from "@/lib/ai/history-store";

/* ── 날짜 ────────────────────────────────────────────────────────────────── */

/** ISO → 한국 날짜 "9.20" (같은 해) · "2025.12.3" (다른 해). 잘못된 값이면 null */
export function shortDateKst(iso: string, now: Date = new Date()): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const parts = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(t));
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  const nowY = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric" }).formatToParts(now).find((p) => p.type === "year")?.value;
  return get("year") === nowY ? `${get("month")}.${get("day")}` : `${get("year")}.${get("month")}.${get("day")}`;
}

/** 같은 한국 날짜인가 */
export function sameDayKst(a: string, b: string): boolean {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  const f = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(new Date(ta)) === f.format(new Date(tb));
}

/* ── 저장할지 ─────────────────────────────────────────────────────────────── */

/**
 * 같은 날 같은 값(점수·신호 조합)이면 다시 저장하지 않는다 — 화면을 새로 고칠 때마다 "지난번"이 몇 분 전이 되지 않게.
 * 값이 바뀌었으면 같은 날이라도 저장한다(그것이 곧 변화다).
 */
export function shouldRecord(entries: readonly HistoryEntry[], next: Pick<HistoryEntry, "score" | "oneLine" | "createdAt">): boolean {
  const last = entries[0];
  if (!last) return true;
  if (last.createdAt === next.createdAt) return false;
  return !(sameDayKst(last.createdAt, next.createdAt) && last.score === next.score && (last.oneLine ?? null) === (next.oneLine ?? null));
}

/* ── 종합 진단 — 점수 ─────────────────────────────────────────────────────── */

/** 지금 것(createdAt 같음)을 뺀 가장 최근 항목 — 없으면 null */
export function previousEntry(entries: readonly HistoryEntry[], currentCreatedAt: string | null): HistoryEntry | null {
  return entries.find((e) => e.createdAt !== currentCreatedAt) ?? null;
}

/** "지난번 72점(9.20) → 지금 74점" — 이전 점수가 없으면 null */
export function scoreHistoryLine(entries: readonly HistoryEntry[], current: { score: number | null; createdAt: string | null }, now: Date = new Date()): string | null {
  if (current.score == null) return null;
  const prev = previousEntry(entries, current.createdAt);
  if (!prev || prev.score == null) return null;
  const when = shortDateKst(prev.createdAt, now);
  return `지난번 ${prev.score}점${when ? `(${when})` : ""} → 지금 ${current.score}점`;
}

/* ── 매수 타이밍 — 신호 조합 ───────────────────────────────────────────────── */

export type SignalCounts = { green: number; yellow: number; red: number };

/** 신호 상태 배열 → 개수(자료 없음은 세지 않는다) */
export function countSignals(states: readonly string[]): SignalCounts {
  const c: SignalCounts = { green: 0, yellow: 0, red: 0 };
  for (const s of states) if (s === "green" || s === "yellow" || s === "red") c[s] += 1;
  return c;
}

/** history-store 의 oneLine 에 넣는 표기 — "g2y1r0" */
export function encodeSignalCombo(c: SignalCounts): string {
  return `g${c.green}y${c.yellow}r${c.red}`;
}

export function decodeSignalCombo(s: string | null | undefined): SignalCounts | null {
  const m = /^g(\d+)y(\d+)r(\d+)$/.exec(s ?? "");
  return m ? { green: Number(m[1]), yellow: Number(m[2]), red: Number(m[3]) } : null;
}

const SIGNAL_WORD: Record<keyof SignalCounts, string> = { green: "좋음", yellow: "보통", red: "주의" };

/** "좋음 2 : 주의 1" — 0 인 것은 적지 않는다. 전부 0 이면 null */
export function signalComboText(c: SignalCounts): string | null {
  const parts = (["green", "yellow", "red"] as const).filter((k) => c[k] > 0).map((k) => `${SIGNAL_WORD[k]} ${c[k]}`);
  return parts.length ? parts.join(" : ") : null;
}

/** "지난번 좋음 2 : 주의 1(9.20)" — 같은 지역 이전 실행이 없으면 null */
export function signalHistoryLine(entries: readonly HistoryEntry[], currentCreatedAt: string | null, now: Date = new Date()): string | null {
  const prev = previousEntry(entries, currentCreatedAt);
  const c = prev ? decodeSignalCombo(prev.oneLine) : null;
  if (!prev || !c) return null;
  const text = signalComboText(c);
  if (!text) return null;
  const when = shortDateKst(prev.createdAt, now);
  return `지난번 ${text}${when ? `(${when})` : ""}`;
}
