/* [1009 · H 리뷰] 월간 리포트 전월 비교 — 두 달 모두 집계된 지역끼리만.
   숫자는 이 파일 안에서만 쓰는 가짜 값이다(운영 데이터 아님). */
import test from "node:test";
import assert from "node:assert/strict";
import { commonRegionCompare, reportSummary } from "../../app/reports/[ym]/report-compare.ts";
import { summarizeReportMonths } from "../../lib/reports/month-summary.ts";

test("[1009·H 리뷰] 전월 비교 — 이번 달에만 있는 지역은 빼고 공통 지역끼리 더한다", () => {
  const prev = [
    { regionName: "가구", txCount: 100 },
    { regionName: "나구", txCount: 50 },
  ];
  const cur = [
    { regionName: "가구", txCount: 120 },
    { regionName: "나구", txCount: 60 },
    { regionName: "다구", txCount: 500 }, // 이번 달에만 집계 — 합계끼리 나누면 +340% 로 부풀던 몫
  ];
  const c = commonRegionCompare(cur, prev);
  assert.ok(c);
  assert.equal(c.regionCount, 2);
  assert.equal(c.curTx, 180);
  assert.equal(c.prevTx, 150);
  assert.equal(Math.round(c.pct * 10) / 10, 20);
});

test("[1009·H 리뷰] 전월 비교 — 공통 지역이 없거나 전월 합이 0이면 비교하지 않는다(null) · 이름 공백·중복 정리", () => {
  assert.equal(commonRegionCompare([{ regionName: "가구", txCount: 3 }], [{ regionName: "나구", txCount: 3 }]), null);
  assert.equal(commonRegionCompare([{ regionName: "가구", txCount: 3 }], [{ regionName: "가구", txCount: 0 }]), null);
  const c = commonRegionCompare(
    [
      { regionName: " 가구 ", txCount: 10 },
      { regionName: "가구", txCount: 99 }, // 같은 이름 두 번 — 첫 행만
    ],
    [{ regionName: "가구", txCount: 5 }],
  );
  assert.equal(c?.curTx, 10);
  assert.equal(c?.prevTx, 5);
});

test("[1009·H 리뷰] 월간 리포트 머리 — 신고 중인 달은 비교 없이 기한을 적고, 기한이 지난 두 달만 공통 지역 비교", () => {
  const base = { label: "2026년 9월", monthOnly: "9월", txCount: 1234, regionCount: 40, deadline: "10/30" };
  const open = reportSummary({ ...base, open: true, compare: null });
  assert.equal(open.headline, "9월 아파트 매매 신고 1,234건 — 신고 기한(10/30)까지 늘어요");
  assert.equal(open.compareText, null);
  assert.match(open.leadSentence, /지금까지 1,234건입니다 — 신고 기한\(계약 후 30일 · 10\/30\)이 지나지 않아 더 늘어날 잠정치/);
  /* 기한 지남 + 공통 지역 비교 */
  const closed = reportSummary({
    ...base,
    label: "2026년 3월",
    monthOnly: "3월",
    open: false,
    deadline: "4/30",
    compare: { regionCount: 2, curTx: 180, prevTx: 150, pct: 20 },
  });
  assert.equal(closed.headline, "3월 아파트 매매 신고가 전월보다 20.0% 늘었어요");
  assert.equal(closed.compareText, "두 달 모두 집계된 2곳만 보면 전월 150건 → 180건, +20.0%");
  assert.match(closed.leadSentence, /총 1,234건입니다 \(두 달 모두 집계된 2곳만 보면/);
  /* 보합 · 감소 · 비교 불가 */
  assert.equal(
    reportSummary({ ...base, open: false, compare: { regionCount: 1, curTx: 100, prevTx: 100, pct: 0.01 } }).headline,
    "9월 아파트 매매 신고가 전월과 거의 같아요",
  );
  assert.equal(
    reportSummary({ ...base, open: false, compare: { regionCount: 1, curTx: 90, prevTx: 100, pct: -10 } }).headline,
    "9월 아파트 매매 신고가 전월보다 10.0% 줄었어요",
  );
  assert.equal(reportSummary({ ...base, open: false, compare: null }).headline, "9월 아파트 매매 신고 1,234건");
});

test("[1009·H 리뷰] 리포트 목록 달별 요약 — 지역 수·합계·마지막 갱신, 최신 달이 앞 · 이상한 달은 버림", () => {
  const out = summarizeReportMonths([
    { month: "202602", transaction_count: 10, updated_at: "2026-03-01T00:00:00Z" },
    { month: "202603", transaction_count: "7", updated_at: null },
    { month: "202603", transaction_count: 5, updated_at: "2026-04-02T00:00:00Z" },
    { month: "202613", transaction_count: 99, updated_at: null },
    { month: null, transaction_count: 1, updated_at: null },
  ]);
  assert.deepEqual(out, [
    { ym: "202603", regionCount: 2, txCount: 12, updatedAt: "2026-04-02T00:00:00Z" },
    { ym: "202602", regionCount: 1, txCount: 10, updatedAt: "2026-03-01T00:00:00Z" },
  ]);
});
