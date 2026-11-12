/* [1163 · 다녀온 단지의 변동] 임장노트를 쓴 단지가 **방문한 뒤 어떻게 달라졌나**를 사실로만 적는다:
   방문 뒤 새 실거래 건수 · 가장 최근 실거래 · 방문 전 마지막 실거래와의 차이(같은 평형끼리만) · 조회수 · 관심 담은 수 · 같은 구 다른 단지.
   순수 규칙(server-only · React 없음) — 이력 화면 · node:test 가 같이 쓴다. 견줄 거래가 없으면 차이를 적지 않는다(지어내지 않는다). */

export type DealLite = { ym: string; day: number | null; man: number; area: number | null; cancelled?: boolean };

export type VisitChange = {
  /** 방문 뒤 계약된 실거래 건수(해제 제외) */
  newDeals: number;
  /** 가장 최근 실거래 — 방문 전후를 가리지 않는다 */
  latest: { man: number; area: number | null; date: string } | null;
  /** 방문 전 마지막 거래 대비 — 같은 평형(±3㎡)의 방문 뒤 최근 거래가 있을 때만 */
  diff: { pct: number; beforeMan: number; afterMan: number; area: number } | null;
};

/** 거래 날짜 — 일이 없으면 그 달 1일로 본다(순서 비교용) */
export function dealDate(d: Pick<DealLite, "ym" | "day">): string {
  return `${d.ym.slice(0, 4)}-${d.ym.slice(4, 6)}-${String(d.day ?? 1).padStart(2, "0")}`;
}

export function visitChange(deals: readonly DealLite[], visitYmd: string): VisitChange {
  const live = deals.filter((d) => !d.cancelled && /^\d{6}$/.test(d.ym) && d.man > 0).map((d) => ({ ...d, date: dealDate(d) }));
  live.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const visitYm = visitYmd.slice(0, 7).replace("-", "");
  /* 일 없는 거래는 방문한 달이면 "방문 뒤"로 치지 않는다(앞뒤를 모른다) */
  const isAfter = (d: (typeof live)[number]) => (d.day == null ? d.ym > visitYm : d.date > visitYmd);
  const after = live.filter(isAfter);
  /* 방문한 달의 일 없는 거래는 앞에도 뒤에도 세지 않는다 */
  const before = live.filter((d) => !isAfter(d) && !(d.day == null && d.ym === visitYm));
  const latest = live[0] ? { man: live[0].man, area: live[0].area, date: live[0].date } : null;
  let diff: VisitChange["diff"] = null;
  for (const a of after) {
    if (a.area == null) continue;
    const b = before.find((x) => x.area != null && Math.abs(x.area - (a.area as number)) <= 3);
    if (b) {
      diff = { pct: Math.round(((a.man - b.man) / b.man) * 1000) / 10, beforeMan: b.man, afterMan: a.man, area: Math.round(a.area) };
      break;
    }
  }
  return { newDeals: after.length, latest, diff };
}

/** 만원 → "12.4억" · "9,800만" */
export function manShort(man: number): string {
  if (man >= 10_000) {
    const eok = man / 10_000;
    return `${eok >= 100 ? Math.round(eok) : Math.round(eok * 10) / 10}억`;
  }
  return `${Math.round(man).toLocaleString("ko-KR")}만`;
}

/** 변동 한 줄 — 방문 뒤 거래가 없으면 그렇게 적는다 */
export function changeLine(c: VisitChange): string {
  if (c.newDeals === 0) return c.latest ? `방문 뒤 새 실거래 없음 · 최근 ${manShort(c.latest.man)}(${c.latest.date.slice(2).replace(/-/g, ".")})` : "실거래 자료 없음";
  const head = `방문 뒤 새 실거래 ${c.newDeals.toLocaleString("ko-KR")}건`;
  if (!c.diff) return c.latest ? `${head} · 최근 ${manShort(c.latest.man)}` : head;
  const sign = c.diff.pct > 0 ? "+" : "";
  return `${head} · ${c.diff.area}㎡ ${manShort(c.diff.beforeMan)} → ${manShort(c.diff.afterMan)}(${sign}${c.diff.pct}%)`;
}

export type VisitedComplex = { complexId: string; name: string; visitYmd: string; noteId: string; rounds: number };

/** 노트 묶음 → 다녀온 단지(단지 id 가 있는 노트만 · 최근 방문 순 · 같은 단지는 한 번, 회차 수와 마지막 방문일) */
export function visitedComplexes(notes: readonly { id: string; complexId?: string | null; name: string; visitYmd: string }[], limit = 5): VisitedComplex[] {
  const by = new Map<string, VisitedComplex>();
  for (const n of notes) {
    const cid = (n.complexId ?? "").trim();
    if (!cid || !/^\d{4}-\d{2}-\d{2}$/.test(n.visitYmd)) continue;
    const cur = by.get(cid);
    if (!cur) by.set(cid, { complexId: cid, name: n.name, visitYmd: n.visitYmd, noteId: n.id, rounds: 1 });
    else {
      cur.rounds += 1;
      if (n.visitYmd > cur.visitYmd) {
        cur.visitYmd = n.visitYmd;
        cur.noteId = n.id;
      }
    }
  }
  return [...by.values()].sort((a, b) => (a.visitYmd < b.visitYmd ? 1 : -1)).slice(0, Math.max(0, limit));
}

/** [1164] 카드 한 줄을 글과 등락 칩으로 나눈다 — 칩은 같은 평형 차이가 있을 때만 */
export function changeParts(c: VisitChange): { text: string; delta: { label: string; dir: "up" | "down" | "flat" } | null } {
  if (c.newDeals === 0 || !c.diff) return { text: changeLine(c), delta: null };
  const sign = c.diff.pct > 0 ? "+" : "";
  return {
    text: `방문 뒤 새 실거래 ${c.newDeals.toLocaleString("ko-KR")}건 · ${c.diff.area}㎡ ${manShort(c.diff.beforeMan)} → ${manShort(c.diff.afterMan)}`,
    delta: { label: `${sign}${c.diff.pct}%`, dir: c.diff.pct > 0 ? "up" : c.diff.pct < 0 ? "down" : "flat" },
  };
}
