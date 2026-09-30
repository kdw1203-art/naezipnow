/**
 * [1026b · 시나리오·비교] 후보 단지 비교(/analysis/compare)에 "1025 표준"을 씌우는 문장 규칙 — 순수 함수만
 * (클라이언트·테스트 공용 · tests/unit/scenario-compare-1026b.test.ts).
 *
 * 전 캡처(before1026b/{d,m}_compare)의 문제: 빈 화면이 입력칸 두 개와 칩 줄뿐이고, 담은 뒤에도 표만 있어 "그래서 어디가 앞서나"를
 * 한 줄로 말하지 않았다. 여기서 만드는 것:
 *   ① 절차 한 줄(단지 담기 · N곳 → 비교 → 결론 → 다음 행동)
 *   ② 결론 한 줄 — **기존 비교표의 1위 칸**(평당가 최저 · 6개월 평균가 최저 · 12개월 거래 최다) 그대로
 *   ③ 다음 행동 텍스트 링크(AI 비교 해석 · 알림 · 지도) — 채움 파랑 "결정 카드에 담기"는 화면이 그린다
 * **새 계산·새 조회는 없다.** 1위는 표의 배지와 같은 함수(bestOf — 이 파일로 옮겼다)로 고른다: 값이 있는 단지가 2곳 미만이면
 * 비교가 성립하지 않아 1위도 없고, 동점이면 둘 다 적는다(임의로 하나를 고르면 그건 사실이 아니다).
 * 배지는 "좋고 나쁨의 판정이 아니다" — 그래서 칩 톤은 보통(neutral) 하나뿐이다.
 */
import type { ActionLink, Conclusion, StepPlan } from "./region-conclusion";

/** 항목별 최고/최저 — 비교표 배지와 결론이 같이 쓴다. 값이 있는 단지가 2곳 미만이면 빈 집합, 동점이면 전부 */
export function bestOf<T>(items: readonly T[], pick: (x: T) => number | null, dir: "max" | "min"): Set<number> {
  const vals = items.map(pick);
  const usable = vals.filter((v): v is number => v !== null && Number.isFinite(v));
  if (usable.length < 2) return new Set();
  const target = dir === "max" ? Math.max(...usable) : Math.min(...usable);
  const out = new Set<number>();
  vals.forEach((v, i) => {
    if (v !== null && v === target) out.add(i);
  });
  return out;
}

/** 비교표 한 행에서 결론이 보는 값만 */
export type CompareRow = {
  name: string;
  hasData: boolean;
  avg6mKrw: number | null;
  avgPyeong6mKrw: number | null;
  count12m: number;
};

/** 표와 같은 표기 — 호출부(화면)가 표에서 쓰는 함수를 그대로 넘긴다 */
export type CompareFormat = {
  /** 6개월 평균가(원) → "8.45억" */
  avg: (krw: number) => string;
  /** 평당가 평균(원) → "3,383만" */
  pyeong: (krw: number) => string;
};

export type CompareWinners = { avg: Set<number>; pyeong: Set<number>; count: Set<number> };

/** 표 배지 세 칸 — 6개월 평균가 최저 · 평당가 최저 · 12개월 거래 최다(값이 없는 행은 뺀다) */
export function compareWinners(rows: readonly CompareRow[]): CompareWinners {
  return {
    avg: bestOf(rows, (i) => (i.hasData ? i.avg6mKrw : null), "min"),
    pyeong: bestOf(rows, (i) => (i.hasData ? i.avgPyeong6mKrw : null), "min"),
    count: bestOf(rows, (i) => (i.hasData ? i.count12m : null), "max"),
  };
}

const namesOf = (rows: readonly CompareRow[], set: Set<number>) => [...set].map((i) => rows[i].name).join("·");
const first = (set: Set<number>) => set.values().next().value as number;

/**
 * 결론 — "3곳 중 평당가 최저 공작아파트 3,383만"(평당가가 없으면 6개월 평균가 · 그것도 없으면 거래 최다).
 * 칩 = "거래 최다 {단지}"(보통) · 근거 = 제목에 안 쓴 1위 칸(6개월 평균가 최저 · 12개월 거래 건수).
 * 값이 있는 단지가 2곳 미만이면 null(결론 카드를 그리지 않는다).
 */
export function compareConclusion(rows: readonly CompareRow[], fmt: CompareFormat): Conclusion | null {
  const n = rows.filter((r) => r.hasData).length;
  if (n < 2) return null;
  const w = compareWinners(rows);
  const head = `${n.toLocaleString("ko-KR")}곳 중`;
  let title: string;
  let used: "pyeong" | "avg" | "count";
  if (w.pyeong.size > 0) {
    title = `${head} 평당가 최저 ${namesOf(rows, w.pyeong)} ${fmt.pyeong(rows[first(w.pyeong)].avgPyeong6mKrw as number)}`;
    used = "pyeong";
  } else if (w.avg.size > 0) {
    title = `${head} 6개월 평균가 최저 ${namesOf(rows, w.avg)} ${fmt.avg(rows[first(w.avg)].avg6mKrw as number)}`;
    used = "avg";
  } else if (w.count.size > 0) {
    title = `${head} 거래 최다 ${namesOf(rows, w.count)} ${rows[first(w.count)].count12m.toLocaleString("ko-KR")}건`;
    used = "count";
  } else {
    return null;
  }
  const chip = used !== "count" && w.count.size > 0 ? { label: `거래 최다 ${namesOf(rows, w.count)}`, tone: "neutral" as const } : null;
  const sub = [
    used === "pyeong" && w.avg.size > 0 ? `6개월 평균가 최저 ${namesOf(rows, w.avg)} ${fmt.avg(rows[first(w.avg)].avg6mKrw as number)}` : null,
    used !== "count" && w.count.size > 0 ? `12개월 거래 ${rows[first(w.count)].count12m.toLocaleString("ko-KR")}건` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return { title, chip, sub: sub || null };
}

/** 절차 단계 — pick(담는 중: 0~1곳) · compare(표를 불러오는 중이거나 결론이 없다) · result(결론이 섰다) */
export type ComparePhase = "pick" | "compare" | "result";

/** 절차 — 단지 담기(N곳) → 비교 → 결론 → 다음 행동. 담기 전·한 곳뿐이면 현재 = 담기(옆에 "N곳") */
export function compareSteps(count: number, phase: ComparePhase): StepPlan {
  const n = Math.max(0, count);
  return {
    steps: [
      phase === "pick" ? { label: "단지 담기", note: n > 0 ? `${n}곳` : undefined } : { label: `단지 담기 · ${n}곳` },
      { label: "비교" },
      { label: "결론" },
      { label: "다음 행동" },
    ],
    current: phase === "pick" ? 0 : phase === "compare" ? 1 : 2,
  };
}

/** 채움 파랑 — 결정 카드(비교함 = /decide 후보 · lib/newui/compare-tray) */
export const COMPARE_DECIDE_HREF = "/decide";

/**
 * 텍스트 링크 — AI 비교 해석(담은 단지 2곳 이상일 때 · 앞 3곳 · 예전 채움 파랑 버튼을 링크로) · 알림 받기(기존 알림함) · 지도.
 * 비교는 지역이 여럿이라 지도에 지역 파라미터를 붙이지 않는다(AnalysisCrossLinks 와 같은 규칙).
 */
export function compareActionLinks(ids: readonly string[]): ActionLink[] {
  const out: ActionLink[] = [];
  if (ids.length >= 2) {
    out.push({ href: `/analysis/ai/ai-compare?ids=${encodeURIComponent(ids.slice(0, 3).join(","))}`, label: "AI 비교 해석" });
  }
  out.push({ href: "/notifications", label: "알림 받기" }, { href: "/map", label: "지도에서 보기" });
  return out;
}
