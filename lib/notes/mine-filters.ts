/**
 * [1006] 내 임장노트 목록(/notes?tab=mine)의 필터·정렬 — 순수 함수(클라이언트·테스트 공용).
 *
 * 왜: 내 노트 뷰의 칩이 "최신 · 점수순"뿐이라 노트가 스무 건만 넘어도 "지난달 보류한 것"·
 * "동안구에서 본 것"을 다시 찾을 길이 없었다. listNotes 는 200건까지 한 번에 내려주므로
 * 필터·정렬은 클라이언트에서 끝낸다(서버 왕복 없음).
 *
 * 원칙
 *  · 칩은 **실제로 있는 값만** 그린다(mineFilterOptions) — 누르면 0건인 칩은 죽은 컨트롤이다.
 *  · 기간은 **방문일** 기준이다(작성일이 아니라) — 임장은 다녀온 날이 기준이다.
 *  · 정렬 "최신"은 서버가 준 순서(createdAt desc)를 그대로 둔다 — 안정 정렬.
 *  · 값이 없는 노트(방문일 없음·점수 0)는 정렬 뒤로 보낸다. 빠뜨리지 않는다.
 *
 * `server-only`·React 를 import 하지 않는다.
 */
import type { DecisionChoice } from "@/lib/inspection/decision";
import type { FeedNote } from "@/lib/notes/feed-note";

export type MineSort = "latest" | "visit" | "score";
/** 판단 필터 — 네 가지 판단 + "판단 없음"(none) + 전체(null) */
export type MineDecisionFilter = DecisionChoice | "none" | null;
/** 방문일 기준 기간(개월). null 이면 전체 */
export type MinePeriod = 1 | 3 | 12 | null;

export type MineFilters = {
  sort: MineSort;
  decision: MineDecisionFilter;
  /** regionGroup 과 정확히 같은 문자열. null 이면 전체 */
  region: string | null;
  period: MinePeriod;
};

export const DEFAULT_MINE_FILTERS: MineFilters = {
  sort: "latest",
  decision: null,
  region: null,
  period: null,
};

export const MINE_SORT_OPTIONS: ReadonlyArray<{ value: MineSort; label: string }> = [
  { value: "latest", label: "최신" },
  { value: "visit", label: "방문일순" },
  { value: "score", label: "점수순" },
];

export const MINE_PERIOD_OPTIONS: ReadonlyArray<{ value: MinePeriod; label: string }> = [
  { value: null, label: "전체 기간" },
  { value: 1, label: "최근 1개월" },
  { value: 3, label: "최근 3개월" },
  { value: 12, label: "최근 1년" },
];

/** 판단 칩 표시 순서 — 상세 판단 카드와 같은 순서, 마지막에 "판단 없음" */
const DECISION_ORDER: ReadonlyArray<Exclude<MineDecisionFilter, null>> = [
  "buy",
  "hold",
  "pass",
  "revisit",
  "none",
];

export const DECISION_FILTER_LABEL: Record<Exclude<MineDecisionFilter, null>, string> = {
  buy: "살까",
  hold: "보류",
  pass: "패스",
  revisit: "다시 보기",
  none: "판단 없음",
};

/** 지역 칩 상한 — 한 줄에 스크롤로 담을 만큼. 많으면 건수 많은 순으로 자른다 */
export const MINE_REGION_CHIPS_MAX = 8;

export type MineFilterOptions = {
  decisions: Array<{ value: Exclude<MineDecisionFilter, null>; label: string; count: number }>;
  regions: Array<{ value: string; count: number }>;
};

function decisionKeyOf(n: FeedNote): Exclude<MineDecisionFilter, null> {
  return n.decision?.choice ?? "none";
}

/**
 * 어떤 칩을 그릴지 — 노트에 실제로 있는 판단·지역만, 건수와 함께. 판단은 고정 순서,
 * 지역은 건수 많은 순(같으면 가나다). 값이 한 종류뿐이면 그 축은 칩을 만들지 않는다
 * (전체와 같은 결과라 고를 이유가 없다).
 */
export function mineFilterOptions(notes: readonly FeedNote[]): MineFilterOptions {
  const dCount = new Map<Exclude<MineDecisionFilter, null>, number>();
  const rCount = new Map<string, number>();
  for (const n of notes) {
    const d = decisionKeyOf(n);
    dCount.set(d, (dCount.get(d) ?? 0) + 1);
    const r = (n.regionGroup ?? "").trim();
    if (r) rCount.set(r, (rCount.get(r) ?? 0) + 1);
  }
  const decisions = DECISION_ORDER.filter((d) => (dCount.get(d) ?? 0) > 0).map((d) => ({
    value: d,
    label: DECISION_FILTER_LABEL[d],
    count: dCount.get(d) ?? 0,
  }));
  const regions = [...rCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .slice(0, MINE_REGION_CHIPS_MAX)
    .map(([value, count]) => ({ value, count }));
  return {
    decisions: decisions.length >= 2 ? decisions : [],
    regions: regions.length >= 2 ? regions : [],
  };
}

/** YYYY-MM-DD → 로컬 자정 ms. 깨진 값은 null */
function visitMs(iso: string | undefined): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const t = new Date(y, m - 1, d).getTime();
  return Number.isFinite(t) ? t : null;
}

/** 기간 하한 — now 에서 months 개월 전 같은 날(달력 기준) */
export function periodFloorMs(months: number, now: number): number {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function applyMineFilters(
  notes: readonly FeedNote[],
  f: MineFilters,
  now: number = Date.now(),
): FeedNote[] {
  const floor = f.period ? periodFloorMs(f.period, now) : null;
  const out = notes.filter((n) => {
    if (f.decision && decisionKeyOf(n) !== f.decision) return false;
    if (f.region && (n.regionGroup ?? "") !== f.region) return false;
    if (floor != null) {
      const t = visitMs(n.visitDate);
      /* 방문일을 모르는 노트는 "그 기간에 다녀왔다"고 말할 수 없다 — 기간 필터에서는 뺀다 */
      if (t == null || t < floor) return false;
    }
    return true;
  });
  if (f.sort === "score") {
    /* 점수 0(미입력)은 뒤로 — 안정 정렬이라 같은 점수는 최신 순 유지 */
    return [...out].sort((a, b) => b.score - a.score);
  }
  if (f.sort === "visit") {
    return [...out].sort((a, b) => {
      const ta = visitMs(a.visitDate);
      const tb = visitMs(b.visitDate);
      if (ta == null && tb == null) return 0;
      if (ta == null) return 1;
      if (tb == null) return -1;
      return tb - ta;
    });
  }
  return out;
}

/** 기본값과 다른 축이 하나라도 있는가 — "필터 지우기" 버튼의 표시 조건 */
export function hasActiveMineFilter(f: MineFilters): boolean {
  return f.sort !== "latest" || f.decision !== null || f.region !== null || f.period !== null;
}
