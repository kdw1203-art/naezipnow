/* [1023 · 임장노트] 내 노트 회차 묶기 — 같은 단지(aptName) 2건 이상이면 한 묶음.
 *
 * 규칙(docs/review-1022.md 1장 ①): 내 노트 뷰에서 같은 aptName 이 2건 이상이면 묶음 카드
 * (단지명 · N회차 · 최근 방문일)로 접고, 펼치면 회차별 카드. 1건뿐인 단지·단지명이 없는 노트는
 * 그대로 낱장. 묶음의 자리는 그 단지의 첫 카드가 있던 자리(목록 정렬을 흐트러뜨리지 않는다).
 * 묶음 안 순서는 방문일 내림차순(같으면 입력 순서) — "최근 방문" 이 맨 위.
 * 순수 모듈 — 데이터를 만들지 않고 손에 든 카드만 다시 배열한다. */

export type RoundGroupable = {
  id: string;
  aptName?: string | null;
  visitDate?: string;
  createdAt?: string;
};

export type RoundGroup<T extends RoundGroupable> =
  | { kind: "single"; note: T }
  | {
      kind: "group";
      key: string;
      aptName: string;
      /** 방문일 내림차순 — [0] 이 가장 최근 방문 */
      notes: T[];
      /** 가장 최근 방문일(YYYY-MM-DD) — visitDate 가 없으면 createdAt 날짜부, 그것도 없으면 "" */
      latestVisit: string;
    };

function visitKey(n: RoundGroupable): string {
  const v = (n.visitDate ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const c = (n.createdAt ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(c) ? c : "";
}

export function groupNoteRounds<T extends RoundGroupable>(notes: ReadonlyArray<T>): RoundGroup<T>[] {
  const byApt = new Map<string, T[]>();
  for (const n of notes) {
    const key = (n.aptName ?? "").trim();
    if (!key) continue;
    const arr = byApt.get(key);
    if (arr) arr.push(n);
    else byApt.set(key, [n]);
  }
  const emitted = new Set<string>();
  const out: RoundGroup<T>[] = [];
  for (const n of notes) {
    const key = (n.aptName ?? "").trim();
    const members = key ? byApt.get(key) : undefined;
    if (!members || members.length < 2) {
      out.push({ kind: "single", note: n });
      continue;
    }
    if (emitted.has(key)) continue;
    emitted.add(key);
    const sorted = members
      .map((m, order) => ({ m, order, v: visitKey(m) }))
      .sort((a, b) => (a.v === b.v ? a.order - b.order : a.v < b.v ? 1 : -1))
      .map((x) => x.m);
    out.push({
      kind: "group",
      key,
      aptName: key,
      notes: sorted,
      latestVisit: visitKey(sorted[0]),
    });
  }
  return out;
}
