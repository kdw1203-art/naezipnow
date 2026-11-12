/* [1162 · 내 임장 이력] 다녀온 곳과 돌려 본 분석을 날짜 줄 하나로 — 임장노트(방문일)와 AI 분석 기록(실행일)을 합친다.
   순수 규칙(server-only · React 없음) — 이력 화면 · node:test 가 같이 쓴다. 없는 값은 적지 않는다. */

export type HistoryNoteIn = { id: string; title: string; aptName?: string | null; region: string; visitDate: string; createdAt: string; score: number | null; decisionLabel: string | null; lat?: number; lng?: number };
export type HistoryRunIn = { id: string; toolTitle: string; createdAt: string; headline: string | null };

export type HistoryItem = { key: string; kind: "note" | "analysis"; date: string; title: string; sub: string; href: string; /** [1164] 오른쪽 큰 숫자(노트 점수) — 없으면 null */ score: number | null };
export type HistoryMonth = { ym: string; label: string; days: { date: string; day: string; items: HistoryItem[] }[] };

const YMD = /^(\d{4})-(\d{2})-(\d{2})/;

/** ISO 시각 → 한국 날짜(YYYY-MM-DD). 읽을 수 없으면 "" */
export function kstYmd(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t + 9 * 3600_000).toISOString().slice(0, 10);
}

export function noteHistoryItem(n: HistoryNoteIn): HistoryItem | null {
  const date = YMD.test(n.visitDate) ? n.visitDate.slice(0, 10) : kstYmd(n.createdAt);
  if (!date) return null;
  /* [1164] 점수는 오른쪽 큰 숫자로 뺀다 — 한 줄에는 종류 · 판단 · 지역만 */
  const sub = ["임장노트", n.decisionLabel, n.region || null].filter(Boolean).join(" · ");
  return { key: `note:${n.id}`, kind: "note", date, title: n.aptName?.trim() || n.title, sub, href: `/notes/${n.id}`, score: n.score != null && n.score > 0 ? n.score : null };
}

export function runHistoryItem(r: HistoryRunIn): HistoryItem | null {
  const date = kstYmd(r.createdAt);
  if (!date) return null;
  return { key: `run:${r.id}`, kind: "analysis", date, title: r.toolTitle, sub: ["AI 분석", r.headline?.trim() || null].filter(Boolean).join(" · "), href: `/analysis/ai/r/${r.id}`, score: null };
}

/** 최근 날짜가 위 · 같은 날은 노트 먼저 */
export function buildHistory(notes: readonly HistoryNoteIn[], runs: readonly HistoryRunIn[]): HistoryMonth[] {
  const items = [...notes.map(noteHistoryItem), ...runs.map(runHistoryItem)].filter((x): x is HistoryItem => x !== null);
  items.sort((a, b) => (a.date === b.date ? (a.kind === b.kind ? a.key.localeCompare(b.key) : a.kind === "note" ? -1 : 1) : a.date < b.date ? 1 : -1));
  const months: HistoryMonth[] = [];
  for (const it of items) {
    const ym = it.date.slice(0, 7);
    let m = months[months.length - 1];
    if (!m || m.ym !== ym) {
      m = { ym, label: `${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5, 7))}월`, days: [] };
      months.push(m);
    }
    let d = m.days[m.days.length - 1];
    if (!d || d.date !== it.date) {
      d = { date: it.date, day: `${Number(it.date.slice(8, 10))}일`, items: [] };
      m.days.push(d);
    }
    d.items.push(it);
  }
  return months;
}

/** 지도에 찍을 점 — 좌표가 있는 노트만(없는 좌표를 만들지 않는다) */
export function historyPoints(notes: readonly HistoryNoteIn[]): { id: string; name: string; lat: number; lng: number }[] {
  return notes
    .filter((n) => typeof n.lat === "number" && typeof n.lng === "number" && Number.isFinite(n.lat) && Number.isFinite(n.lng))
    .map((n) => ({ id: n.id, name: n.aptName?.trim() || n.title, lat: n.lat as number, lng: n.lng as number }));
}

/** [1164] 맨 위 숫자 세 칸 — 이번 달 임장 횟수 · 평균 점수(점수 있는 노트만) · 다녀온 단지 수(이름 기준). 없는 값은 null */
export function historySummary(notes: readonly HistoryNoteIn[], todayYmd: string): { monthVisits: number; avgScore: number | null; places: number } {
  const ym = todayYmd.slice(0, 7);
  let monthVisits = 0;
  let sum = 0;
  let scored = 0;
  const names = new Set<string>();
  for (const n of notes) {
    const d = YMD.test(n.visitDate) ? n.visitDate.slice(0, 10) : kstYmd(n.createdAt);
    if (d.slice(0, 7) === ym) monthVisits += 1;
    if (n.score != null && n.score > 0) {
      sum += n.score;
      scored += 1;
    }
    const name = (n.aptName?.trim() || n.title).trim();
    if (name) names.add(name);
  }
  return { monthVisits, avgScore: scored > 0 ? Math.round(sum / scored) : null, places: names.size };
}
