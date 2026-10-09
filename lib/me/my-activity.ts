/**
 * [1049 · 마이 그래프] 내 임장노트 활동 요약 — 순수(단위 시험 대상).
 *
 * 소유자 지시(2026-10-09): "마이페이지 디자인 개선과 간결화 · 그래프 · 표 적극 도입".
 * 마이의 "내 임장노트" 칸 위에 최근 6개월 월별 기록 수 막대 + 평균 기록 점수 · 공개 수 한 줄.
 * 달은 방문일(없으면 작성일) 기준 · 한국 시간. 지어내지 않는다 — 노트가 0건이면 null(칸을 그리지 않는다).
 */

export type MyActivityInput = {
  /** 방문일(YYYY-MM-DD) — 없으면 작성 시각(ISO) */
  date: string;
  /** 기록 점수 0~100 — 입력한 축이 없으면 null */
  score100: number | null;
  isPublic: boolean;
};

export type MyActivity = {
  months: { ym: string; label: string; count: number }[];
  /** 점수 있는 노트의 평균(반올림) — 없으면 null */
  avgScore: number | null;
  publicCount: number;
  total: number;
  /** 최근 6개월 합 */
  recentTotal: number;
};

function kstYm(iso: string): string | null {
  const t = String(iso ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t.slice(0, 4) + t.slice(5, 7);
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms + 9 * 3600_000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function buildMyActivity(notes: readonly MyActivityInput[], nowIso: string, monthsBack = 6): MyActivity | null {
  if (notes.length === 0) return null;
  const now = new Date(Date.parse(nowIso) + 9 * 3600_000);
  const months: MyActivity["months"] = [];
  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const ym = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    months.push({ ym, label: `${d.getUTCMonth() + 1}월`, count: 0 });
  }
  const byYm = new Map(months.map((m) => [m.ym, m]));
  for (const n of notes) {
    const ym = kstYm(n.date);
    const slot = ym ? byYm.get(ym) : undefined;
    if (slot) slot.count += 1;
  }
  const scored = notes.map((n) => n.score100).filter((v): v is number => typeof v === "number" && v > 0);
  return {
    months,
    avgScore: scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null,
    publicCount: notes.filter((n) => n.isPublic).length,
    total: notes.length,
    recentTotal: months.reduce((s, m) => s + m.count, 0),
  };
}
