import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CARD_REGIONS,
  CARD_REGION_MONTHLY_NAMES,
  deltaOf,
  formatEok,
  periodLabelOf,
  regionCardsFromMonthly,
  type MonthlyRow,
} from "../../lib/newui/home-region-fallback.ts";
import { DELTA_UNKNOWN } from "../../lib/newui/delta-label.ts";
import { dedupeRecents, isKaptId, recentComplexKey } from "../../lib/recent-complexes/dedupe.ts";

/* ============================================================
   [1002] 홈 개선 회귀 잠금
   A. 지역 시세 카드 — 스냅샷 실패 시 market_region_monthly 마지막 월 집계 폴백
   C. 최근 본 단지 — 옛 id·새 id 가 같은 단지를 두 칸으로 만들던 중복
   ============================================================ */

const EOK = 100_000_000;

function row(
  region_name: string,
  month: string,
  transaction_count: number | string | null,
  avg_deal_amount_krw: number | string | null,
  trend_delta_pct: number | string | null,
): MonthlyRow {
  return { region_name, month, transaction_count, avg_deal_amount_krw, trend_delta_pct };
}

/* 실제 표 모양을 흉내 낸다 — 당월(202609)은 부분 집계(4건), 그 앞 달이 온전하다.
   월 내림차순으로 오지만 함수는 순서에 기대지 않는다(아래 별도 검증). */
const ROWS: MonthlyRow[] = [
  row("서울 강남구", "202609", 4, 40 * EOK, 3.2), // 부분 집계 — 건너뛴다
  row("서울 마포구", "202609", 2, 15 * EOK, -1.0), // 부분 집계 — 건너뛴다
  row("서울 강남구", "202608", 63, 32.5 * EOK, -4.2),
  row("서울 마포구", "202608", 41, 12.84 * EOK, null), // 변동률 미상
  row("서울 송파구", "202608", 9, 20 * EOK, 0.5), // 9건 — 기준 미달
  row("서울 송파구", "202607", 58, "2180000000", "0"), // 문자열로 온 bigint/numeric
  row("서울 강남구", "202607", 70, 31 * EOK, 1.1),
  // 남양주시 — 행 없음 → 카드 없음
];

test("[1002·A] 지역마다 거래 10건 이상인 가장 최근 달을 고른다 — 당월 부분 집계는 건너뛴다", () => {
  const cards = regionCardsFromMonthly(ROWS, CARD_REGIONS);
  assert.deepEqual(
    cards.map((c) => c.id),
    ["gangnam", "mapo", "songpa"],
    "대상 순서를 지키고, 행이 없는 남양주는 빠진다",
  );
  const [gangnam, mapo, songpa] = cards;
  assert.equal(gangnam.periodLabel, "8월");
  assert.equal(gangnam.price, "32.5억");
  assert.equal(gangnam.meta, "서울 · 63건 (8월 집계)");
  assert.equal(gangnam.delta, "▼ 4.2%");
  assert.equal(gangnam.tone, "down");
  assert.equal(gangnam.href, "/map?region=%EA%B0%95%EB%82%A8%EA%B5%AC");
  assert.deepEqual(gangnam.spark, []);

  /* 9건인 8월은 미달 → 7월(58건). 문자열 숫자도 읽는다. */
  assert.equal(songpa.periodLabel, "7월");
  assert.equal(songpa.price, "21.8억");
  assert.equal(songpa.meta, "서울 · 58건 (7월 집계)");
  assert.equal(songpa.delta, "— 0.0%");
  assert.equal(songpa.tone, "flat");

  assert.equal(mapo.price, "12.8억"); // 10억 이상은 소수 1자리(eok 스타일)
});

test("[1002·A] 변동률 null 은 '변동 미상' — 0.0% 보합으로 위장하지 않는다", () => {
  const [, mapo] = regionCardsFromMonthly(ROWS, CARD_REGIONS);
  assert.equal(mapo.id, "mapo");
  assert.equal(mapo.delta, DELTA_UNKNOWN);
  assert.equal(mapo.tone, "flat");
  /* 빈 문자열도 미상이다 — Number("") 는 0 이라 그대로 쓰면 보합이 지어진다 */
  const [c] = regionCardsFromMonthly(
    [row("서울 강남구", "202608", 20, 10 * EOK, "")],
    CARD_REGIONS,
  );
  assert.equal(c.delta, DELTA_UNKNOWN);
});

test("[1002·A] 폴백 카드는 stale: true — 스냅샷 카드와 구분된다", () => {
  const cards = regionCardsFromMonthly(ROWS, CARD_REGIONS);
  assert.ok(cards.length > 0);
  for (const c of cards) assert.equal(c.stale, true);
});

test("[1002·A] 입력 순서에 기대지 않는다 — 월 오름차순으로 와도 같은 결과", () => {
  const asc = [...ROWS].reverse();
  assert.deepEqual(regionCardsFromMonthly(asc, CARD_REGIONS), regionCardsFromMonthly(ROWS, CARD_REGIONS));
});

test("[1002·A] minTrades 옵션 — 낮추면 부분 집계 달도 쓴다", () => {
  const [gangnam] = regionCardsFromMonthly(ROWS, CARD_REGIONS, { minTrades: 1 });
  assert.equal(gangnam.periodLabel, "9월");
  assert.equal(gangnam.meta, "서울 · 4건 (9월 집계)");
});

test("[1002·A] 행이 없거나 전부 미달이면 카드 0장(빈 배열) — 빈 카드·'—' 카드를 만들지 않는다", () => {
  assert.deepEqual(regionCardsFromMonthly([], CARD_REGIONS), []);
  assert.deepEqual(
    regionCardsFromMonthly([row("서울 강남구", "202609", 4, 40 * EOK, 1)], CARD_REGIONS),
    [],
  );
  /* 가격 0·음수·null, 월 형식 불량도 카드가 안 된다 */
  assert.deepEqual(
    regionCardsFromMonthly(
      [
        row("서울 강남구", "202608", 20, 0, 1),
        row("서울 강남구", "202607", 20, null, 1),
        row("서울 강남구", "2026-06", 20, 10 * EOK, 1),
      ],
      CARD_REGIONS,
    ),
    [],
  );
});

test("[1002·A] CARD_REGIONS 의 모든 카드 id 에 월 집계 region_name 이 있다(두 표 동기)", () => {
  assert.equal(CARD_REGIONS.length, 4);
  for (const t of CARD_REGIONS) {
    assert.ok(CARD_REGION_MONTHLY_NAMES[t.id], `${t.id} 의 market_region_monthly 이름이 없다`);
  }
  assert.deepEqual(CARD_REGION_MONTHLY_NAMES, {
    gangnam: "서울 강남구",
    mapo: "서울 마포구",
    songpa: "서울 송파구",
    namyangju: "남양주시",
  });
});

test("[1002·A] deltaOf · formatEok · periodLabelOf — home-data 에서 옮긴 규칙 그대로", () => {
  assert.deepEqual(deltaOf(undefined), { delta: DELTA_UNKNOWN, tone: "flat" });
  assert.deepEqual(deltaOf(Number.NaN), { delta: DELTA_UNKNOWN, tone: "flat" });
  assert.deepEqual(deltaOf(4.25), { delta: "▲ 4.3%", tone: "up" });
  assert.deepEqual(deltaOf(-0.05), { delta: "▼ 0.1%", tone: "flat" }); // |0.1| 이하는 보합 톤
  assert.deepEqual(deltaOf(0.1), { delta: "▲ 0.1%", tone: "flat" });
  assert.deepEqual(deltaOf(0.11), { delta: "▲ 0.1%", tone: "up" });
  assert.deepEqual(deltaOf(0), { delta: "— 0.0%", tone: "flat" });
  /* 부호는 화살표, 크기는 소수 1자리 — 0.04 는 "▲ 0.0%"(옛 규칙 그대로, 바꾸지 않는다) */
  assert.deepEqual(deltaOf(0.04), { delta: "▲ 0.0%", tone: "flat" });
  assert.equal(formatEok(32.5 * EOK), "32.5억");
  assert.equal(formatEok(8.4 * EOK), "8.4억");
  assert.equal(formatEok(0.85 * EOK), "0.85억");
  assert.equal(periodLabelOf("202608"), "8월");
  assert.equal(periodLabelOf("202611"), "11월");
  assert.equal(periodLabelOf("2026-08"), null);
  assert.equal(periodLabelOf(null), null);
});

/* ------------------------------------------------------------------ */
/* C. 최근 본 단지 중복 제거                                               */
/* ------------------------------------------------------------------ */

test("[1002·C] 같은 지역+이름이면 id 가 달라도 한 칸 — 최근 방문이 남는다", () => {
  const list = [
    { id: "kapt.A12345", name: "공작아파트", region: "서울 강남구", at: 2_000 },
    { id: "서울 강남구::공작아파트", name: "공작아파트", region: "서울 강남구", at: 1_000 },
  ];
  const out = dedupeRecents(list, 8);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "kapt.A12345");
  /* 반대 순서·반대 시각이면 옛 id 쪽이 최신이니 그쪽이 남는다 */
  const out2 = dedupeRecents(
    [
      { id: "kapt.A12345", name: "공작아파트", region: "서울 강남구", at: 1_000 },
      { id: "서울 강남구::공작아파트", name: "공작아파트", region: "서울 강남구", at: 3_000 },
    ],
    8,
  );
  assert.equal(out2.length, 1);
  assert.equal(out2[0].id, "서울 강남구::공작아파트");
});

test("[1002·C] 이름이 다르거나 지역이 다르면 그대로 둔다", () => {
  const list = [
    { id: "a", name: "현대아파트", region: "서울 강남구", at: 3 },
    { id: "b", name: "현대아파트", region: "서울 마포구", at: 2 },
    { id: "c", name: "래미안", region: "서울 강남구", at: 1 },
  ];
  const out = dedupeRecents(list, 8);
  assert.deepEqual(
    out.map((r) => r.id),
    ["a", "b", "c"],
  );
});

test("[1002·C] 같은 id 도 접고, 최신순으로 정렬해 max 개만", () => {
  const list = [
    { id: "x", name: "A", region: "r", at: 1 },
    { id: "y", name: "B", region: "r", at: 5 },
    { id: "x", name: "A", region: "r", at: 4 },
    { id: "z", name: "C", region: "r", at: 3 },
    { id: "w", name: "D", region: "r", at: 2 },
  ];
  const out = dedupeRecents(list, 3);
  assert.deepEqual(
    out.map((r) => [r.id, r.at]),
    [
      ["y", 5],
      ["x", 4],
      ["z", 3],
    ],
  );
  assert.deepEqual(dedupeRecents(list, 0), []);
  /* 입력은 바뀌지 않는다 */
  assert.equal(list.length, 5);
});

test("[1002·C] 키는 공백을 정규화한다 · 지역 없는 기록은 합치지 않는다", () => {
  assert.equal(recentComplexKey({ name: "  공작  아파트 ", region: " 서울 강남구 " }), "서울 강남구|공작 아파트");
  assert.equal(recentComplexKey({ name: "공작아파트" }), "|공작아파트");
  assert.equal(recentComplexKey({ name: "공작아파트", region: null }), "|공작아파트");
  const out = dedupeRecents(
    [
      { id: "1", name: "공작 아파트", at: 2 },
      { id: "2", name: "공작  아파트", region: "", at: 1 },
      { id: "3", name: "공작아파트", at: 3 },
    ],
    8,
  );
  /* [리뷰] 지역을 모르는 기록은 같은 단지라는 확신이 없다 — 셋 다 그대로(최신순) */
  assert.deepEqual(
    out.map((r) => r.id),
    ["3", "1", "2"],
  );
});

test("[1002·C] kapt id 끼리는 같은 구·같은 이름이어도 합치지 않는다 — 동명 단지를 가르는 게 kapt id 다", () => {
  assert.equal(isKaptId("kapt.A10027"), true);
  assert.equal(isKaptId("서울 노원구::현대아파트"), false);
  const out = dedupeRecents(
    [
      { id: "kapt.A1", name: "현대아파트", region: "서울 노원구", at: 3 },
      { id: "kapt.A2", name: "현대아파트", region: "서울 노원구", at: 2 },
      { id: "서울 노원구::현대아파트", name: "현대아파트", region: "서울 노원구", at: 1 },
    ],
    8,
  );
  /* 이름 id 는 첫 kapt 기록에 접히고, 두 kapt 는 둘 다 남는다 */
  assert.deepEqual(
    out.map((r) => r.id),
    ["kapt.A1", "kapt.A2"],
  );
});
