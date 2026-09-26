/**
 * [1009 · T] 중개보수(중개수수료) 법정 상한 — 순수 모듈(단위검증: tests/unit/calc-1009.test.ts).
 *
 * 왜 옮겼나(2026-09-22 실측): 요율표가 app/calculator/BrokerageFeeCalc.tsx 안에만 있었다. 대출 계산기(/calculator)의
 * "필요 현금"은 매매가 − 대출 + 취득세만 더해, 집을 살 때 실제로 드는 중개보수(8.4억이면 최대 336만원)가 빠져 있었다.
 * 같은 표를 두 화면이 쓰게 여기로 올리고, 중개보수 계산기는 이 함수를 그대로 부른다(동작 동일).
 *
 * 요율은 공인중개사법 시행규칙 제20조의 **법정 상한요율표**(2021.10.19 시행 개정표) 그대로다 —
 * 한국공인중개사협회 게시 요율표와 대조 확인(2026-08-22, BrokerageFeeCalc 주석).
 *  - 상한이지 확정 보수가 아니다 — 실제 보수는 상한 안에서 협의로 정한다(시·도 조례로 일부 다를 수 있다).
 *  - 임대차 거래금액 = 보증금 + 월세×100. 그 값이 5천만원 미만이면 보증금 + 월세×70 으로 다시 계산한다.
 *  - 부가가치세(10%)는 별도다.
 * 금액 단위는 **원**이다(요율표의 한도액이 원 단위라 반올림 없이 그대로 비교한다).
 */

export type BrokerageDeal = "sale" | "lease";
export type BrokerageProperty = "house" | "officetel" | "other";

/** [하한(원), 상한요율, 한도액(원)|null] — 구간은 하한 이상 다음 하한 미만 */
export type BrokerageBracket = readonly [number, number, number | null];

export const SALE_HOUSE_BRACKETS: readonly BrokerageBracket[] = [
  [0, 0.006, 250_000],
  [50_000_000, 0.005, 800_000],
  [200_000_000, 0.004, null],
  [900_000_000, 0.005, null],
  [1_200_000_000, 0.006, null],
  [1_500_000_000, 0.007, null],
];

export const LEASE_HOUSE_BRACKETS: readonly BrokerageBracket[] = [
  [0, 0.005, 200_000],
  [50_000_000, 0.004, 300_000],
  [100_000_000, 0.003, null],
  [600_000_000, 0.004, null],
  [1_200_000_000, 0.005, null],
  [1_500_000_000, 0.006, null],
];

/** 근거 한 줄 — 화면의 ⓘ 설명·각주가 같은 말을 쓴다 */
export const BROKERAGE_BASIS = "공인중개사법 시행규칙 제20조(법정 상한요율) · 한국공인중개사협회 요율표 대조 2026.08";

export function bracketFor(table: readonly BrokerageBracket[], amountWon: number): BrokerageBracket {
  let hit = table[0];
  for (const row of table) if (amountWon >= row[0]) hit = row;
  return hit;
}

/** 임대차 거래금액(원) — 보증금 + 월세×100, 그 값이 5천만원 미만이고 월세가 있으면 보증금 + 월세×70 */
export function leaseAmountWon(depositWon: number, monthlyWon: number): { amountWon: number; note: string } {
  const dep = Math.max(0, depositWon);
  const mon = Math.max(0, monthlyWon);
  const amount = dep + mon * 100;
  if (amount < 50_000_000 && mon > 0) {
    return { amountWon: dep + mon * 70, note: "거래금액 = 보증금 + 월세×70 (환산액 5천만원 미만 규정)" };
  }
  return { amountWon: amount, note: "거래금액 = 보증금 + 월세×100" };
}

export type BrokerageFee = {
  /** 거래금액(원) */
  amountWon: number;
  /** 적용 상한요율(소수, 0.004 = 0.4%) */
  rate: number;
  /** 구간 한도액(원) — 없으면 null */
  capWon: number | null;
  /** 법정 상한액(원) = min(거래금액 × 요율, 한도액) */
  feeWon: number;
  /** 한도액이 금액을 정했나 */
  capped: boolean;
  /** "0.4%" · "0.5% (한도 80만원)" · "0.9% 이내 협의" */
  rateLabel: string;
};

function pctLabel(rate: number): string {
  return `${(Math.round(rate * 1000) / 10).toFixed(1)}%`;
}

/** 원 → "80만원" · "25만원" — 한도액 표기용(만원 단위로 떨어지는 값만) */
function capLabel(won: number): string {
  return `${Math.round(won / 10_000).toLocaleString("ko-KR")}만원`;
}

/**
 * 법정 상한 중개보수. 금액이 0 이하이면 null.
 *  - 주택: 매매·임대차 상한요율표 + 구간 한도액
 *  - 오피스텔(전용 85㎡ 이하·주거설비): 매매 0.5% · 임대차 0.4%(한도 없음)
 *  - 주택 외(토지·상가 등): 0.9% 이내 협의
 */
export function brokerageFeeCap(input: {
  amountWon: number;
  deal: BrokerageDeal;
  property?: BrokerageProperty;
}): BrokerageFee | null {
  const amountWon = Number.isFinite(input.amountWon) ? input.amountWon : 0;
  if (amountWon <= 0) return null;
  const property = input.property ?? "house";
  if (property === "other") {
    return { amountWon, rate: 0.009, capWon: null, feeWon: amountWon * 0.009, capped: false, rateLabel: "0.9% 이내 협의" };
  }
  if (property === "officetel") {
    const rate = input.deal === "sale" ? 0.005 : 0.004;
    return { amountWon, rate, capWon: null, feeWon: amountWon * rate, capped: false, rateLabel: pctLabel(rate) };
  }
  const [, rate, capWon] = bracketFor(input.deal === "sale" ? SALE_HOUSE_BRACKETS : LEASE_HOUSE_BRACKETS, amountWon);
  const raw = amountWon * rate;
  const feeWon = capWon != null ? Math.min(raw, capWon) : raw;
  return {
    amountWon,
    rate,
    capWon,
    feeWon,
    capped: capWon != null && raw > capWon,
    rateLabel: `${pctLabel(rate)}${capWon != null ? ` (한도 ${capLabel(capWon)})` : ""}`,
  };
}

/** 원 → "5천만원" · "2억" · "15억" — 요율표 구간 경계 표기 */
function boundaryLabel(won: number): string {
  if (won >= 100_000_000) return `${won / 100_000_000}억`;
  return `${won / 10_000_000}천만원`;
}

/**
 * 요율표 한 줄 — ⓘ 설명의 "이렇게 계산했어요"가 표와 같은 말을 쓰게 표에서 만든다.
 * 매매: "5천만원 미만 0.6%(한도 25만원) · 2억 미만 0.5%(한도 80만원) · 9억 미만 0.4% · 12억 미만 0.5% · 15억 미만 0.6% · 15억 이상 0.7%"
 */
export function bracketLine(table: readonly BrokerageBracket[]): string {
  return table
    .map(([, rate, cap], i) => {
      const next = table[i + 1]?.[0];
      const range = next !== undefined ? `${boundaryLabel(next)} 미만` : `${boundaryLabel(table[i][0])} 이상`;
      return `${range} ${pctLabel(rate)}${cap != null ? `(한도 ${capLabel(cap)})` : ""}`;
    })
    .join(" · ");
}
