/**
 * [1025 · 담당 S] 살까·빌릴까 — 매매·전세·월세의 N년 총비용 비교. 순수 모듈(단위검증: tests/unit/rentbuy-1025.test.ts).
 *
 * 금액 단위는 전부 **만원**(국토부 신고 단위 · 계산기 입력 단위와 같다). 금리·상승률은 연 %.
 * 없는 입력은 null — 그 항목은 계산하지 않고 null 로 둔다(화면은 "—"). 기본값을 지어 넣지 않는다.
 *
 * 산식(가정은 assumptionsOf 가 화면에 그대로 적는다):
 *  · 매매 = 대출 이자(원리금균등 · 만기 loanTermYears · 보유 N년 동안의 이자분) + 취득세(lib/finance/loan-rules acquisitionTaxOf)
 *          + 중개보수(lib/finance/brokerage 매매 상한) + 자기자본 기회비용(자기자본 × 입력 금리 × N · 단리)
 *          − 상승분(매매가 × ((1+g)^N − 1)) — 양도세·보유세·수리비 미반영
 *  · 전세 = 보증금 기회비용((전세 − 전세대출) × 입력 금리 × N) + 전세대출 이자(전세대출 × 전세대출 금리 × N · 만기일시상환 이자만)
 *          + 중개보수(임대차 상한 · 전세 보증금 기준)
 *  · 월세 = 월세 × 12 × N + 보증금 기회비용(보증금 × 입력 금리 × N) + 중개보수(임대차 상한 · 보증금 + 월세×100)
 *  기회비용의 금리로 예금금리 대신 **입력 금리(대출 금리)** 를 쓴다 — 예금금리 실데이터가 없어 지어내지 않는다(가정에 적는다).
 */
import { brokerageFeeCap, leaseAmountWon } from "@/lib/finance/brokerage";
import { acquisitionRateLabel, acquisitionTaxOf, type LoanRegion, type Ownership } from "@/lib/finance/loan-rules";

export type RentVsBuyInput = {
  /** 매매가(만원) */
  price: number | null;
  /** 전세 보증금(만원) */
  jeonse: number | null;
  /** 월세 보증금(만원) — 월세만 있고 보증금이 없으면 0 */
  deposit: number | null;
  /** 월세(만원/월) */
  monthly: number | null;
  /** 대출 비율(% · 0~100) */
  loanRatio: number | null;
  /** 금리(연 %) — 주담대 이자 · 기회비용 공통 */
  rate: number | null;
  /** 보유 기간(년) */
  years: number;
  /** 기대 상승률(연 %) */
  growth: number;
  /** 전세대출 금액(만원) — 없으면 null(0 과 같다) */
  jeonseLoan?: number | null;
  /** 전세대출 금리(연 %) — 없으면 rate */
  jeonseLoanRate?: number | null;
  /** 주담대 만기(년) — 기본 30 */
  loanTermYears?: number;
  /** 취득세 조건 — 기본 무주택 · 지역 미지정 */
  taxes?: { ownership?: Ownership; region?: LoanRegion };
};

export type OptionKey = "buy" | "jeonse" | "monthly";

export type CostPart = { key: string; label: string; manwon: number | null };

export type OptionResult = {
  key: OptionKey;
  label: string;
  /** 모든 항목이 있을 때만 합계, 아니면 null */
  total: number | null;
  parts: CostPart[];
  /** 합계를 못 만든 이유(없는 입력 이름) */
  missing: string[];
};

export type SensitivityRow = {
  growthPct: number;
  buy: number | null;
  jeonse: number | null;
  monthly: number | null;
  cheapest: OptionKey | null;
};

export type BreakEven =
  | { kind: "in"; pct: number }
  | { kind: "below" }
  | { kind: "above" }
  | { kind: "none" };

export type RentVsBuyResult = {
  years: number;
  growthPct: number;
  buy: OptionResult;
  jeonse: OptionResult;
  monthly: OptionResult;
  /** 합계가 있는 선택지가 둘 이상일 때만 */
  cheapest: OptionKey | null;
  /** 매매와 (전세 있으면 전세, 없으면 월세)의 총비용이 같아지는 연 상승률 — 0~20% 이분법 */
  breakEven: BreakEven;
  /** 손익분기의 비교 상대 */
  breakEvenAgainst: Exclude<OptionKey, "buy"> | null;
  sensitivity: SensitivityRow[];
  assumptions: string[];
};

export const DEFAULT_LOAN_TERM_YEARS = 30;
export const SENSITIVITY_GROWTHS: readonly number[] = [-2, 0, 2, 4];
export const BREAK_EVEN_RANGE: readonly [number, number] = [0, 20];

export const OPTION_LABELS: Record<OptionKey, string> = { buy: "매매", jeonse: "전세", monthly: "월세" };

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * 원리금균등 상환 중 처음 holdYears 년 동안 낸 **이자 합**(만원).
 * 월 상환액 P = L·r / (1 − (1+r)^−n). k개월 뒤 잔액 B_k = L(1+r)^k − P((1+r)^k − 1)/r.
 * 이자 합 = P·k − (L − B_k). r = 0 이면 0.
 */
export function amortizationInterest(
  loanManwon: number,
  annualRatePct: number,
  termYears: number,
  holdYears: number,
): number {
  if (!(loanManwon > 0) || !(termYears > 0) || !(holdYears > 0)) return 0;
  const r = annualRatePct / 100 / 12;
  if (!(r > 0)) return 0;
  const n = Math.round(termYears * 12);
  const k = Math.min(n, Math.round(holdYears * 12));
  const pay = (loanManwon * r) / (1 - Math.pow(1 + r, -n));
  const growthK = Math.pow(1 + r, k);
  const balance = loanManwon * growthK - (pay * (growthK - 1)) / r;
  const principalPaid = loanManwon - balance;
  return Math.max(0, pay * k - principalPaid);
}

/** 단리 기회비용(만원) = 원금 × 연 금리 × 년 */
export function opportunityCost(principalManwon: number, annualRatePct: number, years: number): number {
  if (!(principalManwon > 0) || !(years > 0)) return 0;
  return principalManwon * (annualRatePct / 100) * years;
}

/** 상승분(만원) = 매매가 × ((1+g)^N − 1) — g 가 음수면 음수(손실) */
export function appreciation(priceManwon: number, growthPct: number, years: number): number {
  if (!(priceManwon > 0) || !(years > 0)) return 0;
  return priceManwon * (Math.pow(1 + growthPct / 100, years) - 1);
}

function brokerSaleManwon(priceManwon: number): number {
  const fee = brokerageFeeCap({ amountWon: priceManwon * 10_000, deal: "sale" });
  return fee ? fee.feeWon / 10_000 : 0;
}

function brokerLeaseManwon(depositManwon: number, monthlyManwon: number): number {
  const { amountWon } = leaseAmountWon(depositManwon * 10_000, monthlyManwon * 10_000);
  const fee = brokerageFeeCap({ amountWon, deal: "lease" });
  return fee ? fee.feeWon / 10_000 : 0;
}

function sumOrNull(parts: CostPart[]): number | null {
  let s = 0;
  for (const p of parts) {
    if (p.manwon === null) return null;
    s += p.manwon;
  }
  return s;
}

function buyOption(input: RentVsBuyInput, growthPct: number): OptionResult {
  const price = num(input.price);
  const rate = num(input.rate);
  const loanRatio = num(input.loanRatio);
  const years = input.years;
  const term = input.loanTermYears ?? DEFAULT_LOAN_TERM_YEARS;
  const ownership = input.taxes?.ownership ?? "무주택";
  const region = input.taxes?.region;
  const missing: string[] = [];
  if (price === null || !(price > 0)) missing.push("매매가");
  if (loanRatio === null) missing.push("대출 비율");
  if (rate === null) missing.push("금리");

  const loan = price !== null && loanRatio !== null ? price * Math.min(100, Math.max(0, loanRatio)) / 100 : null;
  const equity = price !== null && loan !== null ? price - loan : null;
  const parts: CostPart[] = [
    {
      key: "interest",
      label: "이자 · 원리금균등 이자분",
      manwon: loan !== null && rate !== null ? amortizationInterest(loan, rate, term, years) : null,
    },
    {
      key: "tax",
      label: `취득세 · ${price !== null && price > 0 ? acquisitionRateLabel(price, ownership, region) : "—"}`,
      manwon: price !== null && price > 0 ? acquisitionTaxOf(price, ownership, region) : null,
    },
    {
      key: "broker",
      label: "중개보수 · 매매 상한",
      manwon: price !== null && price > 0 ? brokerSaleManwon(price) : null,
    },
    {
      key: "opp",
      label: "자기자본 기회비용",
      manwon: equity !== null && rate !== null ? opportunityCost(equity, rate, years) : null,
    },
    {
      key: "gain",
      label: `상승분 · 연 ${growthPct}%`,
      manwon: price !== null && price > 0 ? -appreciation(price, growthPct, years) : null,
    },
  ];
  return { key: "buy", label: OPTION_LABELS.buy, total: sumOrNull(parts), parts, missing };
}

function jeonseOption(input: RentVsBuyInput): OptionResult {
  const jeonse = num(input.jeonse);
  const rate = num(input.rate);
  const jLoan = num(input.jeonseLoan) ?? 0;
  const jRate = num(input.jeonseLoanRate) ?? rate;
  const years = input.years;
  const missing: string[] = [];
  if (jeonse === null || !(jeonse > 0)) missing.push("전세 보증금");
  if (rate === null) missing.push("금리");
  if (jLoan > 0 && jRate === null) missing.push("전세대출 금리");

  const own = jeonse !== null ? Math.max(0, jeonse - jLoan) : null;
  const parts: CostPart[] = [
    {
      key: "opp",
      label: "보증금 기회비용",
      manwon: own !== null && rate !== null ? opportunityCost(own, rate, years) : null,
    },
    {
      key: "jloan",
      label: "전세대출 이자",
      manwon: jLoan > 0 ? (jRate !== null ? opportunityCost(jLoan, jRate, years) : null) : 0,
    },
    {
      key: "broker",
      label: "중개보수 · 임대차 상한",
      manwon: jeonse !== null && jeonse > 0 ? brokerLeaseManwon(jeonse, 0) : null,
    },
  ];
  return { key: "jeonse", label: OPTION_LABELS.jeonse, total: sumOrNull(parts), parts, missing };
}

function monthlyOption(input: RentVsBuyInput): OptionResult {
  const monthly = num(input.monthly);
  const deposit = num(input.deposit);
  const rate = num(input.rate);
  const years = input.years;
  const missing: string[] = [];
  if (monthly === null || !(monthly > 0)) missing.push("월세");
  if (deposit === null) missing.push("월세 보증금");
  if (deposit !== null && deposit > 0 && rate === null) missing.push("금리");

  const months = Math.round(years * 12);
  const parts: CostPart[] = [
    {
      key: "rent",
      label: `월세 합 · ${months}개월`,
      manwon: monthly !== null && monthly > 0 ? monthly * months : null,
    },
    {
      key: "opp",
      label: "보증금 기회비용",
      manwon: deposit === null ? null : deposit > 0 ? (rate !== null ? opportunityCost(deposit, rate, years) : null) : 0,
    },
    {
      key: "broker",
      label: "중개보수 · 임대차 상한",
      manwon: monthly !== null && monthly > 0 && deposit !== null ? brokerLeaseManwon(deposit, monthly) : null,
    },
  ];
  return { key: "monthly", label: OPTION_LABELS.monthly, total: sumOrNull(parts), parts, missing };
}

/** [1025c] 상승률 g 에서의 매매 총비용(만원) — 손익분기 그래프가 곡선을 찍을 때 쓴다(lib/calc/rent-vs-buy-chart). 입력이 모자라면 null */
export function buyTotalAt(input: RentVsBuyInput, growthPct: number): number | null {
  return buyOption(input, growthPct).total;
}

/** 합계가 있는 선택지가 둘 이상일 때 가장 적게 드는 쪽. 아니면 null */
export function cheapestOf(totals: Record<OptionKey, number | null>): OptionKey | null {
  const rows = (Object.keys(totals) as OptionKey[]).filter((k) => totals[k] !== null);
  if (rows.length < 2) return null;
  let best = rows[0];
  for (const k of rows) if ((totals[k] as number) < (totals[best] as number)) best = k;
  return best;
}

/**
 * 손익분기 상승률 — 매매 총비용(g) 이 비교 상대(전세, 없으면 월세)와 같아지는 g 를 [0, 20] 에서 이분법으로.
 * 매매 총비용은 g 에 대해 단조 감소(상승분만 g 에 걸린다)라 근이 있으면 하나다.
 */
export function breakEvenGrowth(
  input: RentVsBuyInput,
  rentTotal: number,
  range: readonly [number, number] = BREAK_EVEN_RANGE,
): BreakEven {
  const f = (g: number): number | null => {
    const t = buyOption(input, g).total;
    return t === null ? null : t - rentTotal;
  };
  let lo = range[0];
  let hi = range[1];
  const fLo = f(lo);
  const fHi = f(hi);
  if (fLo === null || fHi === null) return { kind: "none" };
  if (fLo <= 0) return { kind: "below" };
  if (fHi > 0) return { kind: "above" };
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (fm === null) return { kind: "none" };
    if (fm > 0) lo = mid;
    else hi = mid;
    if (hi - lo < 0.005) break;
  }
  return { kind: "in", pct: Math.round(((lo + hi) / 2) * 10) / 10 };
}

/** 화면이 그대로 적는 가정 — 값이 있는 것만 숫자로, 없으면 규칙만 */
export function assumptionsOf(input: RentVsBuyInput): { label: string; text: string }[] {
  const price = num(input.price);
  const term = input.loanTermYears ?? DEFAULT_LOAN_TERM_YEARS;
  const ownership = input.taxes?.ownership ?? "무주택";
  const region = input.taxes?.region;
  const years = input.years;
  const jLoan = num(input.jeonseLoan) ?? 0;
  const saleFee = price !== null && price > 0 ? brokerageFeeCap({ amountWon: price * 10_000, deal: "sale" }) : null;
  const jeonse = num(input.jeonse);
  const leaseFee =
    jeonse !== null && jeonse > 0 ? brokerageFeeCap({ amountWon: jeonse * 10_000, deal: "lease" }) : null;
  return [
    {
      label: "취득세",
      text: `${ownership} · ${price !== null && price > 0 ? acquisitionRateLabel(price, ownership, region) : "매매가 입력 후"} (지방교육세 포함 근사 · 85㎡ 초과 농특세 제외)`,
    },
    {
      label: "중개보수",
      text: `법정 상한요율 · 매매 ${saleFee ? saleFee.rateLabel : "—"} · 전세 ${leaseFee ? leaseFee.rateLabel : "—"} · 부가세 별도`,
    },
    { label: "이자", text: `원리금균등 · 만기 ${term}년 · 입력 금리 · 보유 ${years}년 동안의 이자분만` },
    { label: "기회비용", text: `자기자본(또는 보증금) × 입력 금리 × ${years}년 · 단리 · 예금금리 대신 입력 금리` },
    {
      label: "전세대출",
      text: jLoan > 0 ? `${jLoan.toLocaleString("ko-KR")}만원 · 이자만(만기일시상환) · 미입력 시 입력 금리` : "미입력 · 0 으로 계산",
    },
    { label: "상승분", text: `${years}년 뒤 매매가 − 매입가 = 매매가 × ((1+g)^${years} − 1) · 양도세·보유세·수리비 미반영` },
    { label: "월세", text: `월세 × 12 × ${years}년 · 관리비·인상분 미반영` },
  ];
}

export function compareRentVsBuy(input: RentVsBuyInput): RentVsBuyResult {
  const years = Number.isFinite(input.years) && input.years > 0 ? input.years : 1;
  const growthPct = Number.isFinite(input.growth) ? input.growth : 0;
  const norm: RentVsBuyInput = { ...input, years, growth: growthPct };

  const buy = buyOption(norm, growthPct);
  const jeonse = jeonseOption(norm);
  const monthly = monthlyOption(norm);
  const cheapest = cheapestOf({ buy: buy.total, jeonse: jeonse.total, monthly: monthly.total });

  const against: Exclude<OptionKey, "buy"> | null =
    jeonse.total !== null ? "jeonse" : monthly.total !== null ? "monthly" : null;
  const rentTotal = against === "jeonse" ? jeonse.total : against === "monthly" ? monthly.total : null;
  const breakEven: BreakEven = rentTotal !== null ? breakEvenGrowth(norm, rentTotal) : { kind: "none" };

  const sensitivity: SensitivityRow[] = SENSITIVITY_GROWTHS.map((g) => {
    const b = buyOption(norm, g).total;
    return {
      growthPct: g,
      buy: b,
      jeonse: jeonse.total,
      monthly: monthly.total,
      cheapest: cheapestOf({ buy: b, jeonse: jeonse.total, monthly: monthly.total }),
    };
  });

  return {
    years,
    growthPct,
    buy,
    jeonse,
    monthly,
    cheapest,
    breakEven,
    breakEvenAgainst: against,
    sensitivity,
    assumptions: assumptionsOf(norm).map((a) => `${a.label} · ${a.text}`),
  };
}
