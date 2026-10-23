/**
 * [1086 · A5] 관심단지 새 실거래 알림(app/api/cron/watchlist-new-tx)의 순수 계획 — 브라우저·DB 없이 테스트한다.
 *
 * 예전: user_watchlist 를 순서 없이 500행만 읽어 501번째 행부터는 영영 알림이 가지 않았다 · 같은 단지를 여러 명이 담으면
 * 같은 조회를 사람 수만큼 했다 · 새 신고가 없던 행은 확인 시각이 그대로라 실행 시간이 모자라면 늘 같은 행만 봤다.
 * 지금: 쪽을 넘겨 끝까지 읽고(상한), 단지별로 한 번 조회하고, 고수위선이 오래된 단지부터 본다. 새 신고가 없던 행도
 * 확인 시각을 올려(조회 시작 − 10분 · 늦게 커밋된 적재를 다시 보게) 차례가 돈다. 고수위선 갱신은 같은 값끼리 묶어 한 번에 쓴다.
 */

export type WatchRow = { id: unknown; userEmail: string; complexId: string; complexName: string; since: string | null };

export const SEEN_MARGIN_MS = 10 * 60_000;

/** 단지별 묶음 — 기준만 세우면 되는 단지(고수위선 없음)가 맨 앞(조회 없음), 나머지는 고수위선이 오래된 순 */
export function groupWatchRows(rows: WatchRow[]): Array<{ complexId: string; rows: WatchRow[]; minSince: string | null }> {
  const map = new Map<string, WatchRow[]>();
  for (const r of rows) {
    const list = map.get(r.complexId);
    if (list) list.push(r);
    else map.set(r.complexId, [r]);
  }
  const groups = [...map.entries()].map(([complexId, list]) => {
    const sinces = list.map((r) => r.since).filter((v): v is string => !!v).sort();
    return { complexId, rows: list, minSince: sinces[0] ?? null };
  });
  groups.sort((a, b) => {
    const x = a.minSince ?? "";
    const y = b.minSince ?? "";
    if (x !== y) return x < y ? -1 : 1;
    return a.complexId < b.complexId ? -1 : a.complexId > b.complexId ? 1 : 0;
  });
  return groups;
}

/** 새 신고가 없던 행의 다음 고수위선 — max(지금 고수위선, 조회 시작 − 10분). ISO 문자열 비교(같은 형식) */
export function idleSeenAt(since: string, queryStartMs: number): string {
  const floor = new Date(queryStartMs - SEEN_MARGIN_MS).toISOString();
  const sinceMs = Date.parse(since);
  if (Number.isFinite(sinceMs) && sinceMs >= queryStartMs - SEEN_MARGIN_MS) return since;
  return floor;
}

/** 고수위선 갱신을 같은 값끼리 묶는다(한 번의 update … in(id) 로) — 묶음당 최대 size 개 */
export function batchAdvance(advance: Array<{ id: unknown; seenAt: string }>, size = 200): Array<{ seenAt: string; ids: unknown[] }> {
  const bySeen = new Map<string, unknown[]>();
  for (const a of advance) {
    const list = bySeen.get(a.seenAt);
    if (list) list.push(a.id);
    else bySeen.set(a.seenAt, [a.id]);
  }
  const out: Array<{ seenAt: string; ids: unknown[] }> = [];
  for (const [seenAt, ids] of bySeen) {
    for (let i = 0; i < ids.length; i += size) out.push({ seenAt, ids: ids.slice(i, i + size) });
  }
  return out;
}

/** 타임스탬프(Postgres timestamptz 문자열)를 마이크로초로 — DB 의 gt 와 같은 정밀도로 비교한다(Date.parse 는 밀리초까지) */
export function tsMicros(ts: string): number | null {
  const ms = Date.parse(ts);
  if (!Number.isFinite(ms)) return null;
  const frac = /T\d{2}:\d{2}:\d{2}\.(\d+)/.exec(ts)?.[1] ?? "";
  const extra = Number((frac + "000000").slice(3, 6));
  return ms * 1000 + (Number.isFinite(extra) ? extra : 0);
}

/** a 가 b 보다 나중인가(둘 중 하나라도 못 읽으면 false) */
export function tsAfter(a: string, b: string): boolean {
  const x = tsMicros(a);
  const y = tsMicros(b);
  return x !== null && y !== null && x > y;
}
