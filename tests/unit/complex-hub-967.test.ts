import { test } from "node:test";
import assert from "node:assert/strict";
import { foldTradesByMonth } from "../../lib/complex/tx-month-fold.ts";
import {
  ALL_BANDS,
  deltaLabel,
  formatManwon,
  pctDelta,
  toHubTrades,
  tradeBandChips,
  tradeTotals,
  viewTrades,
} from "../../lib/complex/hub-trades.ts";
import { formatVisitDate, recordsLoginHref, visitOrdinal } from "../../lib/complex/my-records.ts";

/* [967 · 16] 단지 허브 시세 표 — 월별 접기(면적대 분할)·행 변환·필터·정렬 회귀.
   월별 숫자는 lib/complex/complex-store.ts getTransactionHistory 와 같은 규칙이어야
   한다(허브만 다른 평균을 말하면 그게 곧 버그). 그 규칙을 여기서 고정한다. */

const EOK = 1e8;

const RAW = [
  { contract_ym: "202606", deal_amount_krw: 8.0 * EOK, area_m2: 84.9 },
  { contract_ym: "202606", deal_amount_krw: 9.0 * EOK, area_m2: 84.9 },
  { contract_ym: "202606", deal_amount_krw: 12.0 * EOK, area_m2: 114.5 },
  { contract_ym: "202607", deal_amount_krw: 8.5 * EOK, area_m2: 84.9 },
  { contract_ym: "202607", deal_amount_krw: 5.0 * EOK, area_m2: 59.9 },
  { contract_ym: "202605", deal_amount_krw: 7.0 * EOK, area_m2: 84.9 },
  /* 버려야 하는 행들 — 금액 0·월 결측 (기존 접기와 같은 규칙) */
  { contract_ym: "202607", deal_amount_krw: 0, area_m2: 84.9 },
  { contract_ym: "", deal_amount_krw: 3 * EOK, area_m2: 84.9 },
  /* 면적 결측 — 월 합계에는 들어가고 면적대 분할에서는 빠진다 */
  { contract_ym: "202607", deal_amount_krw: 10.0 * EOK, area_m2: null },
];

test("foldTradesByMonth — 과거→최신, limit 개월, 월별 평균/최저/최고/건수(만원 반올림)", () => {
  const rows = foldTradesByMonth(RAW, "cx", 12);
  assert.deepEqual(
    rows.map((r) => r.yyyymm),
    ["202605", "202606", "202607"],
  );
  const jun = rows[1];
  assert.equal(jun.deal_count, 3);
  assert.equal(jun.avg_manwon, Math.round(((8 + 9 + 12) * EOK) / 3 / 10_000));
  assert.equal(jun.min_manwon, 80_000);
  assert.equal(jun.max_manwon, 120_000);
  assert.equal(jun.area_m2, null);
  assert.equal(jun.source, "molit");
  assert.equal(jun.complex_id, "cx");

  /* 7월: 8.5억(84㎡)·5억(59㎡)·10억(면적 결측) — 합계 3건, 분할은 2구간 */
  const jul = rows[2];
  assert.equal(jul.deal_count, 3);
  assert.equal(jul.avg_manwon, Math.round(((8.5 + 5 + 10) * EOK) / 3 / 10_000));
});

test("foldTradesByMonth — limit 은 최근 N개월만 남긴다", () => {
  const rows = foldTradesByMonth(RAW, "cx", 2);
  assert.deepEqual(rows.map((r) => r.yyyymm), ["202606", "202607"]);
});

test("foldTradesByMonth — 면적대 분할은 AREA_BANDS 순서, 거래 있는 구간만, 경계는 bands.ts", () => {
  const rows = foldTradesByMonth(RAW, "cx", 12);
  const jun = rows[1];
  assert.deepEqual(
    jun.bands.map((b) => b.slug),
    ["60-85", "102-135"],
  );
  const b84 = jun.bands[0];
  assert.equal(b84.deal_count, 2);
  assert.equal(b84.avg_manwon, 85_000);
  assert.equal(b84.min_manwon, 80_000);
  assert.equal(b84.max_manwon, 90_000);

  const jul = rows[2];
  /* 59.9㎡ → under-60, 84.9 → 60-85; 면적 결측 1건은 어느 구간에도 없다 */
  assert.deepEqual(jul.bands.map((b) => b.slug), ["under-60", "60-85"]);
  assert.equal(jul.bands.reduce((s, b) => s + b.deal_count, 0), 2);
});

test("formatManwon / pctDelta / deltaLabel — page.tsx 옛 사본과 같은 표기", () => {
  assert.equal(formatManwon(85_000), "8.5억");
  assert.equal(formatManwon(100_000), "10억");
  assert.equal(formatManwon(9_800), "9,800만");
  assert.equal(formatManwon(0), "—");
  assert.equal(formatManwon(Number.NaN), "—");
  assert.equal(pctDelta(110, 100), 10);
  assert.equal(pctDelta(100, undefined), null);
  assert.equal(pctDelta(100, 0), null);
  assert.deepEqual(deltaLabel(null), { delta: "—", tone: "flat" });
  assert.deepEqual(deltaLabel(2.5), { delta: "▲ 2.5%", tone: "up" });
  assert.deepEqual(deltaLabel(-1.2), { delta: "▼ 1.2%", tone: "down" });
});

function trades() {
  return toHubTrades(foldTradesByMonth(RAW, "cx", 12));
}

test("toHubTrades — 최신순, 전월비는 바로 앞 달 대비, sub 는 '건 · 범위'", () => {
  const t = trades();
  assert.deepEqual(t.map((r) => r.ym), ["202607", "202606", "202605"]);
  assert.equal(t[0].date, "2026.07");
  assert.equal(t[2].delta, "—"); // 첫 달은 비교 대상이 없다
  assert.equal(t[2].sub, "1건"); // 1건이면 최저=최고 → 범위 생략
  assert.equal(t[1].sub, "3건 · 8억~12억");
  assert.equal(t[1].tone, "up");
  assert.equal(t[0].bands.length, 2);
});

test("tradeBandChips — 행에 나타난 구간만, 작은 면적부터, 건수 합계", () => {
  const chips = tradeBandChips(trades());
  assert.deepEqual(
    chips.map((c) => [c.slug, c.dealCount]),
    [
      ["under-60", 1],
      ["60-85", 4],
      ["102-135", 1],
    ],
  );
  assert.equal(chips[1].label, "60~85㎡");
  assert.deepEqual(tradeBandChips([]), []);
});

test("viewTrades — 전체는 정렬만, 구간 필터는 그 구간 기준으로 가격·건수·전월비를 다시 센다", () => {
  const t = trades();
  const all = viewTrades(t, ALL_BANDS, "latest");
  assert.deepEqual(all.map((r) => r.ym), ["202607", "202606", "202605"]);
  assert.equal(all[1].price, t[1].price);

  const b84 = viewTrades(t, "60-85", "latest");
  assert.deepEqual(b84.map((r) => r.ym), ["202607", "202606", "202605"]);
  assert.equal(b84[0].price, "8.5억");
  assert.equal(b84[0].sub, "1건");
  assert.equal(b84[1].price, "8.5억");
  assert.equal(b84[1].sub, "2건 · 8억~9억");
  /* 6월 84㎡ 평균 8.5억 vs 5월 7억 → +21.4% (전체 평균 기준이면 다른 값이 나온다) */
  assert.equal(b84[1].delta, "▲ 21.4%");
  assert.equal(b84[0].delta, "—"); // 7월 8.5억 vs 6월 8.5억 → 변동 없음
  assert.equal(b84[2].delta, "—");

  /* 그 구간 거래가 없는 달은 빠진다 */
  const big = viewTrades(t, "102-135", "latest");
  assert.deepEqual(big.map((r) => r.ym), ["202606"]);
  assert.equal(big[0].price, "12억");
  assert.deepEqual(viewTrades(t, "over-135", "latest"), []);
});

test("viewTrades — 가격 정렬(동률은 최신 먼저)", () => {
  const t = trades();
  const desc = viewTrades(t, ALL_BANDS, "price-desc").map((r) => r.ym);
  const asc = viewTrades(t, ALL_BANDS, "price-asc").map((r) => r.ym);
  assert.deepEqual(desc, ["202606", "202607", "202605"]);
  assert.deepEqual(asc, ["202605", "202607", "202606"]);

  /* 84㎡ 만 보면 6·7월이 8.5억으로 동률 — 최신(7월)이 먼저 */
  const tie = viewTrades(t, "60-85", "price-desc").map((r) => r.ym);
  assert.deepEqual(tie, ["202607", "202606", "202605"]);
});

test("tradeTotals — 개월·건수 합계는 보이는 행 기준", () => {
  const t = trades();
  assert.deepEqual(tradeTotals(t), { months: 3, deals: 7 });
  assert.deepEqual(tradeTotals(viewTrades(t, "60-85", "latest")), { months: 3, deals: 4 });
  assert.deepEqual(tradeTotals([]), { months: 0, deals: 0 });
});

/* [967 · 15] 내 기록 탭 헬퍼 */
test("my-records — 로그인 복귀 주소·방문일·회차 표기", () => {
  assert.equal(
    recordsLoginHref("/complex/abc", "?tab=mine"),
    `/login?callbackUrl=${encodeURIComponent("/complex/abc?tab=mine")}`,
  );
  assert.equal(recordsLoginHref("", ""), `/login?callbackUrl=${encodeURIComponent("/")}`);
  assert.equal(formatVisitDate("2026-07-03"), "2026.07.03");
  assert.equal(formatVisitDate("2026-07-03T10:00:00Z"), "2026.07.03");
  assert.equal(formatVisitDate("언제더라"), "언제더라");
  assert.equal(visitOrdinal(0), "1회차");
  assert.equal(visitOrdinal(2), "3회차");
});
