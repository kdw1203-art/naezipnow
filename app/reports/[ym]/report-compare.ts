/**
 * [1009 · H] 월간 리포트 전월 비교 — 순수 함수(테스트로 잠근다).
 *
 * 왜(리뷰 실측, 운영 market_region_monthly): 두 달의 **집계 지역 수가 다르다**. 2026년 2월은 218곳 35,101건,
 * 3월은 252곳 47,517건이라 합계끼리 나누면 "35.4% 늘었어요"가 됐지만, 그중 3월에만 있는 35곳(5,735건)은 거래가
 * 늘어난 게 아니라 집계 범위가 넓어진 것이다. 두 달 모두 있는 지역끼리만 더하면 41,782 대 35,101 = +19.0%.
 * 계절 리포트(lib/reports/seasonal.ts commonRegions)와 같은 방식으로, 두 달 모두 집계된 지역만 비교한다.
 */

import { absPctText, deltaDir, signedPctText } from "@/lib/format/delta";

export type RegionCount = { regionName: string; txCount: number };

export type CommonCompare = {
  /** 두 달 모두 집계된 지역 수 */
  regionCount: number;
  /** 그 지역들의 이번 달 합계 */
  curTx: number;
  /** 그 지역들의 전월 합계 */
  prevTx: number;
  /** (curTx − prevTx) ÷ prevTx × 100 */
  pct: number;
};

export function commonRegionCompare(
  cur: readonly RegionCount[],
  prev: readonly RegionCount[],
): CommonCompare | null {
  const prevBy = new Map<string, number>();
  for (const r of prev) {
    const name = r.regionName.trim();
    if (!name || !Number.isFinite(r.txCount)) continue;
    prevBy.set(name, (prevBy.get(name) ?? 0) + r.txCount);
  }
  const seen = new Set<string>();
  let regionCount = 0;
  let curTx = 0;
  let prevTx = 0;
  for (const r of cur) {
    const name = r.regionName.trim();
    if (!name || seen.has(name) || !Number.isFinite(r.txCount)) continue;
    const p = prevBy.get(name);
    if (p === undefined) continue;
    seen.add(name);
    regionCount += 1;
    curTx += r.txCount;
    prevTx += p;
  }
  if (regionCount === 0 || prevTx <= 0) return null;
  return { regionCount, curTx, prevTx, pct: ((curTx - prevTx) / prevTx) * 100 };
}

/* ───────────── 머리 문장 · 첫 문단 (순수 — 테스트로 잠근다) ───────────── */

export type ReportSummaryInput = {
  /** "2026년 9월" */
  label: string;
  /** "9월" */
  monthOnly: string;
  txCount: number;
  regionCount: number;
  /** 신고 기한(말일 + 30일) 전인가 */
  open: boolean;
  /** "10/30" — 모르면 null */
  deadline: string | null;
  /** 두 달 공통 지역 비교 — 기한이 지난 두 달일 때만 */
  compare: CommonCompare | null;
};


/**
 * 머리 한 줄 · 비교 문구 · 첫 문단(G12).
 *  · 신고 중인 달: 비교하지 않는다 — "9월 아파트 매매 신고 3,889건 — 신고 기한(10/30)까지 늘어요"
 *  · 기한이 지난 두 달 + 공통 지역: "3월 아파트 매매 신고가 전월보다 19.0% 늘었어요"(보합 |x|<0.05% 는 "거의 같아요")
 *  · 비교 불가: "3월 아파트 매매 신고 47,517건"
 */
export function reportSummary(input: ReportSummaryInput): {
  headline: string;
  compareText: string | null;
  leadSentence: string;
} {
  const { label, monthOnly, regionCount, open, deadline, compare } = input;
  const txText = input.txCount.toLocaleString("ko-KR");
  let headline: string;
  if (open) {
    headline = `${monthOnly} 아파트 매매 신고 ${txText}건 — ${deadline ? `신고 기한(${deadline})까지 늘어요` : "신고가 더 들어오는 중이에요"}`;
  } else if (compare && deltaDir(compare.pct)) {
    const dir = deltaDir(compare.pct);
    headline = `${monthOnly} 아파트 매매 신고가 ${
      dir === "flat" ? "전월과 거의 같아요" : `전월보다 ${absPctText(compare.pct)} ${dir === "up" ? "늘었어요" : "줄었어요"}`
    }`;
  } else {
    headline = `${monthOnly} 아파트 매매 신고 ${txText}건`;
  }
  const compareText = compare
    ? `두 달 모두 집계된 ${compare.regionCount.toLocaleString("ko-KR")}곳만 보면 전월 ${compare.prevTx.toLocaleString(
        "ko-KR",
      )}건 → ${compare.curTx.toLocaleString("ko-KR")}건, ${signedPctText(compare.pct)}`
    : null;
  const leadSentence = open
    ? `${label} 내집나우 집계 지역(${regionCount}곳)의 아파트 매매 실거래 신고는 지금까지 ${txText}건입니다 — 신고 기한(계약 후 30일${
        deadline ? ` · ${deadline}` : ""
      })이 지나지 않아 더 늘어날 잠정치이며, 국토교통부 실거래 신고 기준입니다.`
    : `${label} 내집나우 집계 지역(${regionCount}곳)의 아파트 매매 실거래는 총 ${txText}건입니다${
        compareText ? ` (${compareText})` : ""
      } — 국토교통부 실거래 신고 기준.`;
  return { headline, compareText, leadSentence };
}
