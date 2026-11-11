/* [1140 · 관리자 상태 신호등] 순수 규칙 — 대시보드 맨 위 "서비스 상태" 판이 쓴다(server-only · React 없음 · node:test 가 그대로 부른다).
   초록 = 정상 · 노랑 = 주의(늦음 · 비어 있음 · 모름) · 빨강 = 장애(멈춤 · 마지막 수집 실패).
   모르는 것을 초록으로 칠하지 않는다 — 못 읽으면 "불러오기 실패"(노랑)로 적는다. */

export type SignalLevel = "ok" | "warn" | "bad";

export type StatusLine = { label: string; level: SignalLevel; detail: string; href?: string };

export type FreshnessLike = {
  label: string;
  status: "fresh" | "aging" | "stale" | "empty" | "unknown";
  lagDays: number | null;
  rows: number | null;
  ingest: { outcome: string; message: string | null } | null;
};

const RANK: Record<SignalLevel, number> = { bad: 0, warn: 1, ok: 2 };

export function worstLevel(levels: SignalLevel[]): SignalLevel {
  return levels.reduce<SignalLevel>((w, l) => (RANK[l] < RANK[w] ? l : w), "ok");
}

function lagText(d: number | null): string {
  if (d === null) return "시각 모름";
  if (d < 1) return "오늘";
  return `${Math.floor(d)}일 전`;
}

/** 데이터셋 한 줄 → 신호 */
export function freshnessLine(r: FreshnessLike): StatusLine {
  const failed = r.ingest?.outcome === "failed";
  const count = r.rows === null ? "행 수 모름" : `${r.rows.toLocaleString("ko-KR")}행`;
  if (r.status === "stale") return { label: r.label, level: "bad", detail: `멈춤 · ${lagText(r.lagDays)} · ${count}` };
  if (failed) return { label: r.label, level: "bad", detail: `마지막 수집 실패 · ${count}` };
  if (r.status === "empty") return { label: r.label, level: "warn", detail: "비어 있음 · 첫 수집 전" };
  if (r.status === "unknown") return { label: r.label, level: "warn", detail: "불러오기 실패" };
  if (r.status === "aging") return { label: r.label, level: "warn", detail: `늦음 · ${lagText(r.lagDays)} · ${count}` };
  return { label: r.label, level: "ok", detail: `${lagText(r.lagDays)} · ${count}` };
}

/** 나쁜 것부터 limit 줄 + 전체 수 */
export function summarizeFreshness(rows: FreshnessLike[], limit = 5): { level: SignalLevel; counts: Record<SignalLevel, number>; lines: StatusLine[] } {
  const all = rows.map(freshnessLine);
  const counts: Record<SignalLevel, number> = { ok: 0, warn: 0, bad: 0 };
  for (const l of all) counts[l.level] += 1;
  const lines = [...all].sort((a, b) => RANK[a.level] - RANK[b.level]).slice(0, limit);
  return { level: worstLevel(all.map((l) => l.level)), counts, lines };
}

/** 처리 대기 한 줄 — null 은 못 읽음(0 이 아니다) */
export function queueLine(label: string, count: number | null, href: string): StatusLine {
  if (count === null) return { label, level: "warn", detail: "불러오기 실패", href };
  return { label, level: count > 0 ? "warn" : "ok", detail: count > 0 ? `${count.toLocaleString("ko-KR")}건 대기` : "대기 없음", href };
}

export function headline(levels: SignalLevel[]): string {
  const c = { ok: 0, warn: 0, bad: 0 };
  for (const l of levels) c[l] += 1;
  return `정상 ${c.ok} · 주의 ${c.warn} · 장애 ${c.bad}`;
}

/** [1145] DB 용량 한 줄 — Supabase Pro 요금제에 포함된 디스크(8GB) 대비로 색을 정한다(80% 주의 · 95% 장애).
 *  조직 요금제 실측 2026-11-11: pro. 요금제를 바꾸면 이 값을 고친다. 넘으면 초과 요금이 붙는다(서비스가 멈추지는 않는다). */
export const DB_INCLUDED_BYTES = 8 * 1024 ** 3;

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)}GB`;
  return `${Math.round(n / 1024 ** 2).toLocaleString("ko-KR")}MB`;
}

export function dbSizeLine(bytes: number | null, top: Array<{ name: string; bytes: number }> = []): StatusLine {
  if (bytes === null || !Number.isFinite(bytes)) return { label: "DB 용량", level: "warn", detail: "확인 실패" };
  const ratio = bytes / DB_INCLUDED_BYTES;
  const biggest = top[0] ? ` · 가장 큰 표 ${top[0].name} ${formatBytes(top[0].bytes)}` : "";
  return {
    label: "DB 용량",
    level: ratio >= 0.95 ? "bad" : ratio >= 0.8 ? "warn" : "ok",
    detail: `${formatBytes(bytes)} · 포함 용량 8GB 의 ${Math.round(ratio * 100)}%${biggest}`,
  };
}
