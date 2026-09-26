/**
 * [1009 · T] 대출 계산기 결과의 "결론 한 줄 · 돈의 구성 · 설명 문장" — 순수 모듈(단위검증: tests/unit/calc-1009.test.ts).
 *
 * 왜(2026-09-22 실측, /calculator 390px): 결과 카드는 숫자 세 개(최대 대출·필요 현금·월 상환액)뿐이라 "그래서 이 집은
 * 얼마까지 빌릴 수 있다는 건지"를 문장으로 말하지 않았고, 결과 카드가 페이지 1,248px 아래(화면 1.5장)에 있어 슬라이더를
 * 움직여도 바뀌는 숫자가 보이지 않았다. LTV·DSR·취득세는 설명이 없었다(ⓘ 0곳).
 * 여기서는 화면이 쓸 문장을 **실제 계산 결과로만** 만든다 — 값이 없으면 문장도 없다.
 * 설명(how) 문장은 lib/finance/loan-rules.ts 의 표에서 직접 만든다(표를 고치면 설명도 같이 바뀐다).
 */
import {
  LOAN_REGIONS,
  LTV_TABLE,
  OWNERSHIPS,
  PRICE_TIER_CAPS,
  isCapitalOrRegulated,
  type LoanLimit,
  type LoanRegion,
  type Ownership,
} from "./loan-rules";
import { manwonText, nb } from "./money";

/* ── 결론 한 줄 ─────────────────────────────────────────────────────────── */

export type LoanConclusion = {
  /** "이 집은 최대 3억 3,600만원까지 대출받을 수 있어요" */
  sentence: string;
  /** 무엇이 그 숫자를 정했나 — "규제지역 · 무주택 LTV 40% 기준" */
  basis: string;
  /** 숫자를 확정할 수 없는 조건 — 있으면 결론·모바일 요약 줄·메모 초안에 같이 붙인다(없으면 null) */
  caveat: string | null;
};

/**
 * [1009 · T 리뷰 · 법령] 수도권 밖 생애최초(LTV 80%)의 금액 한도.
 * 도입 때(금융위원회 「부동산 대출규제 완화···생애 최초 LTV 80%」, 2022.8.1 시행) "대출한도 최대 6억원"이 함께 정해졌고,
 * 6·27 대책은 수도권·규제지역 밖을 "현행 유지"라고만 했다. 그 뒤 6억원 한도를 없앴다는 공식 발표는 찾지 못했다
 * (2026-09-22 WebSearch — 금융위 보도·정책브리핑 제목만 확인). loan-rules.ts 머리말·계산기 규칙 카드도 "은행 확인"이라
 * 적는다. 그래서 LTV 금액이 6억원을 넘으면 그 금액을 확정처럼 말하지 않고 이 조건을 붙인다
 * (예전: 15억 → "최대 12억원까지 대출받을 수 있어요", 40억 → 32억원).
 */
export const FIRST_HOME_CAP_AT_INTRO_MANWON = 60_000;
export const FIRST_HOME_CAP_CAVEAT = "생애최초 금액 한도(도입 당시 6억원)는 은행 확인";

/** 위 조건이 붙는 경우 — 수도권 밖 · 생애최초 · LTV 로 정해진 금액이 6억원 초과. 수도권·규제지역은 가격 구간 한도가 이미 건다. */
export function firstHomeCapCaveat(input: { limit: LoanLimit; region: LoanRegion; ownership: Ownership }): string | null {
  const { limit } = input;
  if (input.ownership !== "생애최초" || isCapitalOrRegulated(input.region)) return null;
  if (limit.binding !== "ltv" || limit.maxLoanManwon <= FIRST_HOME_CAP_AT_INTRO_MANWON) return null;
  return FIRST_HOME_CAP_CAVEAT;
}

/** 가격 구간 한도가 정했을 때 그 구간 이름 — "15억 이하" */
function tierName(capManwon: number | null): string | null {
  const t = PRICE_TIER_CAPS.find((x) => x.capManwon === capManwon);
  return t ? t.label.split(" → ")[0] : null;
}

export function loanConclusion(input: {
  limit: LoanLimit;
  region: LoanRegion;
  ownership: Ownership;
}): LoanConclusion {
  const { limit, ownership } = input;
  const regionLabel = LOAN_REGIONS.find((r) => r.key === input.region)?.label ?? "";
  if (limit.binding === "none") {
    return {
      sentence: "이 조건에선 집을 사는 주택담보대출을 받을 수 없어요",
      basis: `${regionLabel} · ${ownership} LTV ${limit.ltvPct}% 기준(6·27 대책)`,
      caveat: null,
    };
  }
  const caveat = firstHomeCapCaveat(input);
  if (caveat) {
    /* 확정처럼 말하지 않는다 — "LTV 로는 여기까지", 금액 한도는 은행에서 */
    return {
      sentence: `LTV ${limit.ltvPct}%로는 최대 ${nb(manwonText(limit.maxLoanManwon))}까지예요 — 금액 한도가 남아 있다면 ${nb(manwonText(FIRST_HOME_CAP_AT_INTRO_MANWON))}까지예요`,
      basis: `${regionLabel} · ${ownership} LTV ${limit.ltvPct}% 기준`,
      caveat,
    };
  }
  const sentence = `이 집은 최대 ${nb(manwonText(limit.maxLoanManwon))}까지 대출받을 수 있어요`;
  if (limit.binding === "cap" && limit.capManwon !== null) {
    const tier = tierName(limit.capManwon);
    return {
      sentence,
      basis: `${regionLabel} · ${tier ? `${tier} 주택` : "주택가격 구간"} 한도 ${manwonText(limit.capManwon)} 기준(LTV ${limit.ltvPct}%면 ${manwonText(limit.ltvAmountManwon)})`,
      caveat: null,
    };
  }
  return { sentence, basis: `${regionLabel} · ${ownership} LTV ${limit.ltvPct}% 기준`, caveat: null };
}

/* ── 돈의 구성(구성 막대) ───────────────────────────────────────────────── */

export type CostKey = "loan" | "equity" | "tax" | "broker";
export type CostSegment = { key: CostKey; label: string; manwon: number; ratio: number };
export type CostBreakdown = {
  /** 매매가 + 취득세 + 중개보수(만원) — 막대 전체 */
  totalManwon: number;
  /** 내 돈 = 매매가 − 대출 + 취득세 + 중개보수(만원) */
  cashManwon: number;
  segments: CostSegment[];
};

/**
 * 집값·세금·중개보수가 어디서 나오는지 — 대출 / 내 돈(매매가 − 대출) / 취득세 / 중개보수.
 * 비율은 막대 전체(매매가 + 취득세 + 중개보수) 대비. 매매가가 0 이하면 null.
 */
export function costBreakdown(input: {
  priceManwon: number;
  loanManwon: number;
  acqTaxManwon: number;
  brokerManwon: number;
}): CostBreakdown | null {
  const price = Math.max(0, Number.isFinite(input.priceManwon) ? input.priceManwon : 0);
  if (price <= 0) return null;
  const loan = Math.min(price, Math.max(0, input.loanManwon || 0));
  const tax = Math.max(0, input.acqTaxManwon || 0);
  const broker = Math.max(0, input.brokerManwon || 0);
  const equity = price - loan;
  const total = price + tax + broker;
  const seg = (key: CostKey, label: string, manwon: number): CostSegment => ({
    key,
    label,
    manwon,
    ratio: total > 0 ? manwon / total : 0,
  });
  return {
    totalManwon: total,
    cashManwon: equity + tax + broker,
    segments: [
      seg("loan", "대출", loan),
      seg("equity", "내 돈(매매가 − 대출)", equity),
      seg("tax", "취득세", tax),
      seg("broker", "중개보수(상한)", broker),
    ],
  };
}

/* ── 소득 대비 부담(이 화면의 판정) ──────────────────────────────────────── */

/**
 * 30% 이하 적정 · 40% 이하 주의 · 그 위 위험 — calculator-client 가 쓰던 경계 그대로.
 * [1009 · T 리뷰] 경계의 근거(값은 바꾸지 않는다 — 시나리오 app/analysis/scenario 도 이 함수를 쓴다):
 *  · 40%: 은행권 차주단위 DSR 한도와 같은 선 — 금융위원회 「가계부채 관리 강화방안」(2021.10.26), 2022.7 부터 총 대출
 *    1억원 초과 차주에 은행 40%(2금융권 50%). 이 화면의 부담률 = (월 상환액 + 기존 대출 월 상환액) × 12 ÷ 연 소득으로
 *    DSR 과 같은 꼴이지만 스트레스 금리를 넣지 않았다 — 40% 를 넘으면 은행 심사에서 한도가 막힐 가능성이 커 "위험".
 *  · 30%: 법정 기준이 아니다 — 금리가 오르거나 소득이 줄어도 버틸 여유를 두는 이 화면의 "적정" 선(ⓘ 에도 "이 화면의 구분"이라 적는다).
 */
export function burdenLabel(pct: number | null): "적정" | "주의" | "위험" | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  return pct <= 30 ? "적정" : pct <= 40 ? "주의" : "위험";
}

/* ── 임대수익률 결론 한 줄(부동산 계산기) ─────────────────────────────── */

function pct2(x: number): string {
  return `${x.toFixed(2)}%`;
}

/**
 * 입력값으로 만든 결론 — 계산이 안 되면 null(문장을 지어내지 않는다).
 * [1009 · T 리뷰] 손해일 때 "연 -6.32%를 버는 셈이에요"라고 했다(매매 8.4억·보증금 5천·월세 100만·대출 6억·4%).
 * 이자가 월세보다 많으면 손해라고 말하고, 금액(연 얼마 모자라는지)과 비율을 양수로 적는다.
 */
export function rentalYieldConclusion(input: {
  /** 월세 × 12(만원) */
  annualRentManwon: number;
  /** 대출금 × 금리(만원) */
  annualInterestManwon: number;
  /** 매매가 − 보증금(만원) — 무대출 실투자금 */
  investNoLoanManwon: number;
  /** 매매가 − 보증금 − 대출금(만원) — 내 돈 */
  equityManwon: number;
  hasLoan: boolean;
}): string | null {
  const rent = input.annualRentManwon;
  if (!(rent > 0)) return null;
  if (!input.hasLoan) {
    const invest = input.investNoLoanManwon;
    if (!(invest > 0)) return null;
    return `연 임대수익 ${nb(manwonText(rent))}은 실투자금 ${nb(manwonText(invest))}의 ${pct2((rent / invest) * 100)}예요`;
  }
  const equity = input.equityManwon;
  if (!(equity > 0)) return null;
  const net = rent - input.annualInterestManwon;
  const netR = Math.round(net);
  const y = (net / equity) * 100;
  if (netR < 0) {
    return `대출 이자가 월세보다 연 ${nb(manwonText(-netR))} 많아 내 돈 ${nb(manwonText(equity))} 기준 연 ${pct2(-y)} 손해예요`;
  }
  if (netR === 0) return `월세와 대출 이자가 거의 같아 내 돈 ${nb(manwonText(equity))}으로 남는 게 거의 없어요`;
  return `대출 이자를 빼면 내 돈 ${nb(manwonText(equity))}으로 연 ${pct2(y)}를 버는 셈이에요`;
}

/* ── ⓘ 설명 문장(how) — 표에서 만든다 ─────────────────────────────────── */

/** "규제지역: 생애최초 70% · 무주택 40% · 1주택 처분조건 40% · 다주택 0%" × 3 */
export function ltvTableLines(): string[] {
  return LOAN_REGIONS.map(
    (r) => `${r.label}: ${OWNERSHIPS.map((o) => `${o} ${LTV_TABLE[r.key][o]}%`).join(" · ")}`,
  );
}

/** "수도권·규제지역 가격 구간 한도: 15억 이하 → 6억 · …" */
export function priceTierLine(): string {
  return `수도권·규제지역 주택가격 구간 한도: ${PRICE_TIER_CAPS.map((t) => t.label).join(" · ")}`;
}

/** 원리금균등 월 상환액(만원) — calculator-client 에서 옮겼다(동작 동일) */
export function monthlyPaymentOf(loanManwon: number, annualRatePct: number, years: number): number {
  if (loanManwon <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return loanManwon / n;
  return (loanManwon * r) / (1 - Math.pow(1 + r, -n));
}

/** 취득세 ⓘ 설명 — lib/finance/loan-rules.ts acquisitionTaxOf 의 식을 같은 말로 */
export const ACQ_TAX_HOW: readonly string[] = [
  "1주택 계열(생애최초·무주택·처분조건): 6억 이하 1.1% · 9억 이상 3.3% · 그 사이는 (매매가(억) × 2/3 − 3)% × 1.1 — 지방교육세를 더한 근사치예요.",
  "다주택(규제지역에서 한 채 더): 8.4% · 비규제 지역 2주택은 일반세율이에요.",
  "생애최초는 12억 이하면 최대 200만원을 감면해요.",
  "전용 85㎡ 초과 농어촌특별세(0.2%)와 3주택 이상 중과(12%)는 넣지 않았어요.",
];

/** 취득세 근거 — 화면 각주·ⓘ 출처 */
export const ACQ_TAX_BASIS = "지방세법 제11조·제13조의2 · 지방세특례제한법 제36조의3 · 2026.09 확인";
