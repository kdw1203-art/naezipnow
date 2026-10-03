/**
 * [1012 · R2 · complex A6] 단지 허브 "이 단지 결과 요약"의 **빈 상태 규칙** — 순수 함수(서버 화면·단위테스트 공용).
 *
 * 왜(리뷰 2라운드, 표본 창원 대동): 5개 항목 중 1개(금리 환경)만 있는데 "투자 점수 58점"을 큰 숫자로 그리고,
 * 지표 칸 4개가 전부 "—" 였다 — 자료 부족을 점수처럼 꾸민 것(규칙 0-1 "없는 값은 — 로 두고 지표처럼 꾸미지
 * 않는다" 위반). lib/ai/verdict.ts 는 항목 1개부터 평균을 내므로(워크벤치의 계약), 허브 요약은 여기서 한 번 더
 * 거른다:
 *  · 값이 있는 축이 AXIS_MIN_SCORED(3) 미만 → 점수(metric)를 지우고 알약은 "자료 부족", 결론은
 *    "자료 부족 — 5개 항목 중 N개만 확인됨 · …" 한 줄, 확인된 축만 이름·근거로 나열.
 *  · 핵심 숫자 칸 4개가 전부 값 없음 → 칸 격자 대신 한 문장(EMPTY_TILES_LINE). 조회 실패면 그렇게 말한다.
 * 새 수치는 만들지 않는다 — verdict 가 준 값을 지우거나 문장으로 바꿀 뿐이다.
 */
import type { RadarAxis } from "@/lib/ai/insight-blocks";
import type { Verdict, VerdictTile } from "@/lib/ai/verdict";

/** 종합 점수를 그리려면 5개 항목 중 이만큼은 값이 있어야 한다 */
export const AXIS_MIN_SCORED = 3;

/** lib/ai/verdict.ts tilePool 의 조회 실패 표시와 같은 문자열 */
const FAILED_NOTE = "불러오기 실패";

export const EMPTY_TILES_LINE = "신고된 매매 실거래 없음 · 신고 기한은 계약 후 30일";
export const FAILED_TILES_LINE = "실거래·지역 자료 불러오기 실패 · 잠시 후 다시";

export type AxisSummary = {
  total: number;
  measured: number;
  /** 값이 있는 축만(있는 축만 표시) */
  confirmed: RadarAxis[];
  /** measured < AXIS_MIN_SCORED */
  thin: boolean;
};

export function summarizeAxes(radar: readonly RadarAxis[]): AxisSummary {
  const confirmed = radar.filter((a) => typeof a.score === "number");
  return { total: radar.length, measured: confirmed.length, confirmed, thin: confirmed.length < AXIS_MIN_SCORED };
}

/**
 * "자료 부족 — 5개 항목 중 1개만 확인됨". 출처는 여기 붙이지 않는다 — 5개 항목의 원천은 한국부동산원·청약홈·
 * 이웃 노트·한국은행이라 "국토교통부 신고분 기준"이라 적으면 거짓이 된다. 실제 원천은 카드 아래 출처 줄
 * (VerdictCard ⑤ — evidence 원천, 접힘 밖에 늘 보임)이 말한다.
 */
export function thinHeadline(s: Pick<AxisSummary, "total" | "measured">): string {
  return `자료 부족 · ${s.total}개 항목 중 ${s.measured}개만 확인됨`;
}

/** "확인된 항목: 금리 환경(기준금리 2.5%)" — 확인된 축이 없으면 null */
export function confirmedAxesLine(s: Pick<AxisSummary, "confirmed">): string | null {
  if (s.confirmed.length === 0) return null;
  return `확인된 항목: ${s.confirmed.map((a) => `${a.label}(${a.basis})`).join(" · ")}`;
}

/** 핵심 숫자 칸이 하나도 값이 없을 때 격자 대신 그릴 한 줄 — 값이 하나라도 있으면 null(격자 그대로) */
export function emptyTilesLine(tiles: readonly VerdictTile[] | undefined): string | null {
  if (!tiles || tiles.length === 0) return null;
  if (tiles.some((t) => t.value != null)) return null;
  const failed = tiles.some((t) => t.note === FAILED_NOTE);
  return failed ? FAILED_TILES_LINE : EMPTY_TILES_LINE;
}

/**
 * 허브 요약용 verdict — 축이 모자라면 점수를 지우고 알약·결론을 "자료 부족"으로. 축이 충분하면 그대로.
 * (verdict 원본은 건드리지 않는다 — 워크벤치·공유 페이지는 lib/ai/verdict.ts 계약 그대로다.)
 */
export function applyAxisRule(verdict: Verdict, radar: readonly RadarAxis[]): { verdict: Verdict; axes: AxisSummary } {
  const axes = summarizeAxes(radar);
  if (!axes.thin) return { verdict, axes };
  return {
    axes,
    verdict: {
      ...verdict,
      band: "thin",
      bandLabel: "자료 부족",
      bandReason: `${axes.total}개 항목 중 ${axes.measured}개만 확인됨`,
      bandBasis: "complex",
      headline: thinHeadline(axes),
      metric: null,
    },
  };
}
