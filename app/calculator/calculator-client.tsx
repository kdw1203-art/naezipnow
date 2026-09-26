"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import nextDynamic from "next/dynamic";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { Segmented } from "@/app/components/ui/Segmented";
import { Explain } from "@/app/components/explain/Explain";
import { CalculatorNav } from "./CalculatorNav";
import { TweenMoney } from "./TweenMoney";
import { CostBar } from "./CostBar";
import { manwonText } from "@/lib/finance/money";
import {
  ACQ_TAX_BASIS,
  ACQ_TAX_HOW,
  burdenLabel as burdenLabelOf,
  costBreakdown,
  loanConclusion,
  ltvTableLines,
  monthlyPaymentOf,
  priceTierLine,
} from "@/lib/finance/calc-summary";
import {
  BROKERAGE_BASIS,
  SALE_HOUSE_BRACKETS,
  bracketLine,
  brokerageFeeCap,
} from "@/lib/finance/brokerage";
import {
  ACQ_TAX_SOURCES,
  LOAN_REGIONS,
  LOAN_RULES_BASIS_LABEL,
  LOAN_RULE_SOURCES,
  OWNERSHIPS,
  OWNERSHIP_HINTS,
  PRICE_TIER_CAPS,
  REGULATED_AREAS,
  acquisitionRateLabel,
  acquisitionTaxOf,
  computeLoanLimit,
  isCapitalOrRegulated,
  isLoanRegion,
  isOwnership,
  maxTermYears,
  moveInDeadlineMonths,
  stressRateFloorPct,
  type LoanRegion,
  type Ownership,
} from "@/lib/finance/loan-rules";

/* [1009 · T] 부동산 계산기 탭(전월세 전환·갭·수익률)은 탭을 눌러야 쓰인다 — 첫 로드 JS 에서 빼고 누를 때 받는다.
   이번에 대출 계산기가 굴러가는 숫자·구성 막대·근거 시트로 모듈 기준 약 18KB(raw) 늘어, /calculator(2026-09-21 빌드
   473KB)가 목록 밖 상한 495KB 에 4KB 까지 붙는 셈이었다. 탭 코드(약 9KB)를 빼 여유를 되찾는다. */
const RealEstateTools = nextDynamic(() => import("./realestate-tools").then((m) => m.RealEstateTools), {
  ssr: false,
  loading: () => (
    <div className="card flex min-h-[240px] items-center justify-center">
      <LoadingHint text="부동산 계산기를 불러오는 중" />
    </div>
  ),
});

/* B10: 상단 섹션 탭 — 기존 대출·수익률 계산기 + 신규 부동산 계산기.
   [1009 · T] 같은 화면의 상태 전환이라 공용 Segmented(선택 표시가 미끄러진다)로 — 예전엔 네이비 알약 두 개가
   순간 교체돼 "어디서 어디로" 바뀌었는지 눈이 따라가지 못했다. */
const SECTIONS = [
  { value: "loan", label: "대출·수익률" },
  { value: "realestate", label: "부동산 계산기" },
] as const;
type Section = (typeof SECTIONS)[number]["value"];

/* G10 / 사실 우선: 예전 상수명은 FALLBACK_RATE("은행 평균 4.19%")였다. 어떤 은행의
   평균도 아닌 임의값을 "은행 평균"이라 부르면 사용자가 시장 금리로 읽는다.
   공시 실데이터가 없을 때는 "사용자가 조정하는 가정 금리"로만 쓰고 그렇게 표기한다. */
const ASSUMED_RATE_DEFAULT = 4.0; // 계산 시작값 (사용자가 슬라이더로 조정)

/* [1008 · M] 대출 한도·취득세 규칙표는 lib/finance/loan-rules 로 옮겼다(단위검증 + 다른 화면이 같은 규칙을 쓰게).
   예전 이 파일의 규칙은 "2023.3 규제 완화 기준(생애최초 80%·무주택 70%·다주택 60%, 규제지역 미반영)"이라
   서울(10·15 대책 뒤 전역 규제지역, LTV 40%) 무주택자에게 8.4억 집 최대 대출 5억 8,800만원을 보여 줬다
   — 실제는 3억 3,600만원. 이제 지역 × 보유 주택으로 LTV 를 고르고, 수도권·규제지역은 가격 구간 한도까지 건다. */

/* P2-4: 서버에서 주입되는 주담대 공시 금리 (lib/finance/mortgage-rates 결과와 동일 형태) */
export interface MortgageRateItem {
  bank: string;
  /** "3.62~5.13%" 형식 (없으면 "-") */
  variable: string;
  fixed: string;
  note: string;
}
export interface MortgageRatesProp {
  live: boolean;
  source: string;
  asOf: string | null;
  rates: MortgageRateItem[];
}

/* G10: 여기 있던 BANK_ROWS(K은행 4.31%→3.89%, S은행, H은행, 보금자리론 고정 4.10% 등)는
   전부 지어낸 금리·우대조건이었다. 대출 은행 선택에 직접 영향을 주는 수치라
   "예시" 배지로 감쌀 성질이 아니어서 삭제하고, 공시가 없으면 원출처로 안내한다. */

/** "3.62~5.13%" → { min: 3.62, max: 5.13 } · 파싱 불가 시 null */
function parseRateRange(s: string): { min: number; max: number } | null {
  const nums = s.match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite);
  if (!nums || nums.length === 0) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

/** 공시 금리표에서 대표 금리(은행별 변동금리 중간값 평균, 없으면 고정) 도출 — 실패 시 null */
function deriveAverageRate(rates: MortgageRateItem[]): number | null {
  const mids: number[] = [];
  for (const r of rates) {
    const range = parseRateRange(r.variable) ?? parseRateRange(r.fixed);
    if (range) mids.push((range.min + range.max) / 2);
  }
  if (mids.length === 0) return null;
  const avg = mids.reduce((a, b) => a + b, 0) / mids.length;
  return Math.round(avg * 100) / 100;
}

/* 입력값 로컬 저장 — "기기에 저장"이 말뿐이던 것을 실제 동작으로.
   [1008 · M] 대출 비율(loanRatio) 대신 대출 금액(loanPick, null = 최대)과 지역(region)을 담는다.
   예전 값의 loanRatio 는 읽지 않는다(규칙이 바뀌어 같은 비율이 같은 뜻이 아니다). */
const STORAGE_KEY = "nuguzip:calculator:loan:v1";
type StoredInputs = {
  price: number;
  loanPick: number | null;
  years: number;
  assumedRate: number;
  incomeManwon: number | null;
  cashManwon: number | null;
  existingDebtMonthly: number;
  ownership: Ownership;
  region: LoanRegion;
};

/* [D69] 매매가 슬라이더의 경계 — 프리필도 같은 경계를 쓴다.
   [1008 · M] 3억~20억 → 1억~40억: 수도권·규제지역 가격 구간(15억·25억 경계)의 한도 차이가 화면에서 보이게,
   지방 1~3억대 집도 넣을 수 있게. 정확한 값은 옆 입력칸으로 넣는다. */
const PRICE_MIN_MANWON = 10_000;
const PRICE_MAX_MANWON = 400_000;
const YEAR_OPTIONS = [10, 20, 30, 40] as const;
/** 대출 금액 슬라이더 한 칸(만원) */
const LOAN_STEP_MANWON = 100;

const numInputCls =
  "w-[118px] rounded-lg border border-line bg-bg px-3 py-[7px] text-right text-[13px] font-extrabold text-ink outline-none focus:border-primary";

const extLinkCls =
  "inline-flex min-h-[24px] items-center font-bold text-primary no-underline underline-offset-2 hover:underline";

export function CalculatorClient({ mortgage }: { mortgage: MortgageRatesProp }) {
  const [section, setSection] = useState<Section>("loan");
  const [price, setPrice] = useState(84000); // 만원
  /* 입력칸에 치는 도중의 글자 — 범위를 벗어난 중간값("8")으로 매매가가 튀지 않게 따로 든다 */
  const [priceDraft, setPriceDraft] = useState<string | null>(null);
  /* [D69] 이 금액이 어디서 왔는지 — 실거래에서 넘겨받았을 때만 값이 있다.
     계산기의 기본값 84,000만원은 우리가 정한 예시 숫자다. 단지 화면에서
     "이 시세로 계산"을 눌러 온 사람에게는 그게 **자기 단지의 실거래가**여야
     하고, 그 사실을 화면이 말해야 숫자를 믿을 수 있다. */
  const [priceFrom, setPriceFrom] = useState<string | null>(null);
  const [priceClamped, setPriceClamped] = useState(false);
  /* [1008 · M] 지역 — 기본은 규제지역(서울). 이 서비스의 단지·노트 대부분이 수도권이고,
     기본값을 비규제로 두면 서울 매수자가 가장 크게 틀린 한도를 먼저 본다. */
  const [region, setRegion] = useState<LoanRegion>("regulated");
  const [ownership, setOwnership] = useState<Ownership>("무주택");
  /** 대출 금액(만원) — null 이면 "최대 대출"을 따라간다(매매가·지역이 바뀌어도 최대로 유지) */
  const [loanPick, setLoanPick] = useState<number | null>(null);
  const [years, setYears] = useState(30);

  /* 내 정보 — 예전엔 소득 7,000만·현금 5.5억·기존대출 35만이 하드코딩된 그림이었다.
     실제 입력 필드로 바꾸고, 판정(적정/주의/위험)도 입력값으로만 계산한다. */
  const [incomeManwon, setIncomeManwon] = useState<number | null>(null); // 연 소득(만원)
  const [cashManwon, setCashManwon] = useState<number | null>(null); // 보유 현금(만원)
  const [existingDebtMonthly, setExistingDebtMonthly] = useState(0); // 기존 대출 월 상환(만원)
  const [infoOpen, setInfoOpen] = useState(false);

  // P2-4: 공시 실데이터가 있으면 은행별 변동금리 중간값 평균을 그대로 쓰고,
  // 없으면 사용자가 직접 정하는 가정 금리로만 계산한다(시장 금리라고 주장하지 않는다).
  const liveRate = mortgage.live ? deriveAverageRate(mortgage.rates) : null;
  const rateIsLive = liveRate !== null;
  const [assumedRate, setAssumedRate] = useState(ASSUMED_RATE_DEFAULT);
  const rate = liveRate ?? assumedRate;

  /* 저장된 입력 복원 (마운트 1회) — SSR 불일치를 피하려 effect에서 수행 */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as Partial<StoredInputs>;
      if (typeof s.price === "number" && s.price >= PRICE_MIN_MANWON && s.price <= PRICE_MAX_MANWON)
        setPrice(s.price);
      if (typeof s.loanPick === "number" && s.loanPick >= 0) setLoanPick(s.loanPick);
      if (typeof s.years === "number" && (YEAR_OPTIONS as readonly number[]).includes(s.years))
        setYears(s.years);
      if (typeof s.assumedRate === "number" && s.assumedRate >= 2 && s.assumedRate <= 9)
        setAssumedRate(s.assumedRate);
      if (typeof s.incomeManwon === "number" && s.incomeManwon > 0)
        setIncomeManwon(s.incomeManwon);
      if (typeof s.cashManwon === "number" && s.cashManwon > 0) setCashManwon(s.cashManwon);
      if (typeof s.existingDebtMonthly === "number" && s.existingDebtMonthly >= 0)
        setExistingDebtMonthly(s.existingDebtMonthly);
      if (isOwnership(s.ownership)) setOwnership(s.ownership);
      if (isLoanRegion(s.region)) setRegion(s.region);
      /* 전에 소득·현금을 넣어 둔 사람에게는 접힌 칸을 펼쳐 둔다(값이 숨어 있으면 판정이 어디서 왔는지 모른다) */
      if ((s.incomeManwon ?? 0) > 0 || (s.cashManwon ?? 0) > 0 || (s.existingDebtMonthly ?? 0) > 0)
        setInfoOpen(true);
    } catch {
      /* 프라이빗 모드 등 접근 불가 — 기본값으로 진행 */
    }
  }, []);

  /* [D69] URL 프리필 — 저장된 입력보다 **뒤에** 적용해서 URL 이 이긴다.
     단지 화면에서 실거래가를 들고 넘어왔는데 지난번에 만지던 숫자가 그대로
     떠 있으면, 링크를 누른 의미가 사라진다.

     ?price= 는 **만원** 단위다(화면 입력 단위와 같게 맞춘다 — 원 단위로 받으면
     0을 네 개 더 붙인 링크가 언젠가 생긴다). 범위 밖 값은 잘라서 넣는다.
     [1008 · M] ?region=regulated|capital|other 도 받는다(단지 화면이 지역을 알면 넘길 수 있게). */
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const p = Number(sp.get("price"));
      if (Number.isFinite(p) && p > 0) {
        /* 슬라이더 밖 금액은 **잘라서** 넣고, 잘랐다는 사실을 아래에 적는다.
           그냥 무시하면 "이 시세로 계산"을 눌렀는데 아무 일도 안 일어난다. */
        const clamped = Math.min(PRICE_MAX_MANWON, Math.max(PRICE_MIN_MANWON, Math.round(p)));
        setPrice(clamped);
        setLoanPick(null); // 새 매매가 — 대출은 최대부터 다시 본다
        const from = (sp.get("from") ?? "").trim().slice(0, 40);
        setPriceFrom(from || null);
        setPriceClamped(clamped !== Math.round(p));
      }
      const rg = sp.get("region");
      if (isLoanRegion(rg)) setRegion(rg);
      const sec = sp.get("section");
      if (sec === "realestate" || sec === "loan") setSection(sec);
    } catch {
      /* URL 이 깨졌으면 기본값으로 진행 */
    }
  }, []);

  /* 입력 변경 시 디바운스 저장 */
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            price,
            loanPick,
            years,
            assumedRate,
            incomeManwon,
            cashManwon,
            existingDebtMonthly,
            ownership,
            region,
          } satisfies StoredInputs),
        );
      } catch {
        /* no-op */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [price, loanPick, years, assumedRate, incomeManwon, cashManwon, existingDebtMonthly, ownership, region]);

  /* ── 한도: 최대 대출 = min(LTV × 매매가, 가격 구간 한도) ── */
  const limit = computeLoanLimit({ priceManwon: price, region, ownership });
  const maxLoan = limit.maxLoanManwon;
  const loan = loanPick === null ? maxLoan : Math.min(Math.max(0, loanPick), maxLoan);
  const loanPct = price > 0 ? Math.round((loan / price) * 100) : 0;
  /* 수도권·규제지역 주담대 만기 30년 이내(6·27) — 40년을 골라 둔 채 지역을 바꾸면 30년으로 계산한다 */
  const termCap = maxTermYears(region);
  const effectiveYears = termCap !== null ? Math.min(years, termCap) : years;
  const moveInMonths = moveInDeadlineMonths(region);
  const stressFloor = stressRateFloorPct(region);
  const capitalOrRegulated = isCapitalOrRegulated(region);

  /* [1008 · M] 월 상환액·총 이자는 이 화면에서 계산한다. 예전엔 같은 원리금균등 식을 /api/loan/calc(엣지 함수)에
     입력이 바뀔 때마다 — 페이지를 열기만 해도 한 번 — 보냈다. 결과가 같은 식이라 서버 왕복은 비용만 늘렸다. */
  const monthly = monthlyPaymentOf(loan, rate, effectiveYears);
  const totalInterest = loan > 0 ? Math.max(0, monthly * effectiveYears * 12 - loan) : 0;

  /* 취득세 — 보유 주택 구분·가격 구간·지역(규제지역 추가 구입 중과)의 대략 규칙표로 */
  const acqTax = acquisitionTaxOf(price, ownership, region);
  const acqRateLabel = acquisitionRateLabel(price, ownership, region);
  /* [1009 · T] 중개보수(법정 상한)를 필요 현금에 넣는다 — 예전 필요 현금은 매매가 − 대출 + 취득세뿐이라 집을 살 때 실제로
     나가는 중개보수(8.4억이면 최대 336만원)가 빠져 있었다. 요율표는 중개보수 계산기와 같은 lib/finance/brokerage. */
  const brokerFee = brokerageFeeCap({ amountWon: price * 10_000, deal: "sale" });
  const brokerManwon = brokerFee ? brokerFee.feeWon / 10_000 : 0;
  const cashNeeded = price - loan + acqTax + brokerManwon;
  /* [1009 · T] 결론 한 줄(숫자보다 문장 먼저) · 돈의 구성 막대 — 전부 위의 실제 계산값에서(lib/finance/calc-summary) */
  const conclusion = loanConclusion({ limit, region, ownership });
  const breakdown = costBreakdown({ priceManwon: price, loanManwon: loan, acqTaxManwon: acqTax, brokerManwon });

  /* 판정 — 소득을 입력했을 때만 계산 (기존 대출 월 상환액 포함) */
  const monthlyTotal = monthly + Math.max(0, existingDebtMonthly);
  const burden =
    incomeManwon && incomeManwon > 0
      ? Math.round(((monthlyTotal * 12) / incomeManwon) * 100)
      : null;
  const burdenLabel = burdenLabelOf(burden);
  const cashGap = cashManwon && cashManwon > 0 ? cashManwon - cashNeeded : null;

  const regionLabel = LOAN_REGIONS.find((r) => r.key === region)?.label ?? "";

  /* [1009 · T] ⓘ 설명 — "이 화면은 이렇게 계산했어요"는 lib/finance/loan-rules·brokerage 의 표에서 만든다(코드와 같은 말) */
  const ruleSource = `${LOAN_RULE_SOURCES[0].label} · ${LOAN_RULES_BASIS_LABEL}`;
  const ltvHow = [
    "최대 대출 = min(LTV × 매매가, 가격 구간 한도)",
    ...ltvTableLines(),
    priceTierLine(),
    "실제 한도는 DSR·소득·신용·은행 심사로 더 낮을 수 있어요.",
  ];
  const cashHow = [
    "필요 현금 = 매매가 − 대출 + 취득세 + 중개보수(법정 상한)",
    "등기 비용(국민주택채권·인지세 등)과 이사비는 넣지 않았어요.",
  ];
  const monthlyHow = [
    "월 상환액 = 대출 × r ÷ (1 − (1 + r)^−n) — r 은 연 금리 ÷ 12, n 은 기간(년) × 12",
    rateIsLive
      ? "금리는 은행별 공시 금리(변동, 없으면 고정) 범위의 중간값을 평균한 값이에요."
      : "금리는 공시를 불러오지 못해 직접 정한 가정치예요.",
    "총 이자 = 월 상환액 × 개월 수 − 대출",
  ];
  const brokerHow = [
    `중개보수 상한 = 매매가 × 상한요율(한도액이 있으면 그 금액까지)${brokerFee ? ` — 이 집은 ${brokerFee.rateLabel}` : ""}`,
    `주택 매매 요율: ${bracketLine(SALE_HOUSE_BRACKETS)}`,
  ];
  const burdenHow = [
    "이 화면의 부담률 = (월 상환액 + 기존 대출 월 상환액) × 12 ÷ 연 소득",
    "30% 이하 적정 · 40% 이하 주의 · 그 위는 위험으로 나눴어요(이 화면의 구분).",
    stressFloor !== null
      ? `은행 DSR 심사는 금리에 스트레스 금리(하한 ${stressFloor}%)를 더해 따로 봐요 — 한도가 더 줄 수 있어요.`
      : "은행 DSR 심사는 이 계산과 따로예요 — 한도가 더 줄 수 있어요.",
  ];

  /* CTA 조건 전달 — 임장노트 메모 프리셋 · 시나리오 딥링크 파라미터 */
  const memoDraft = [
    "대출 계산 조건 (내집나우 계산기)",
    `- 매매가 ${manwonText(price)} · ${regionLabel} · ${ownership}`,
    `- 최대 대출 ${manwonText(maxLoan)} (LTV ${limit.ltvPct}%${limit.capManwon !== null ? ` · 가격 구간 한도 ${manwonText(limit.capManwon)}` : ""}) · ${LOAN_RULES_BASIS_LABEL}${
      conclusion.caveat ? ` · ${conclusion.caveat}` : ""
    }`,
    `- 대출 ${manwonText(loan)} · 금리 ${rate}%${rateIsLive ? "(공시 평균)" : "(가정)"} · ${effectiveYears}년 원리금균등 · 월 약 ${manwonText(monthly)}`,
    `- 필요 현금 약 ${manwonText(cashNeeded)} (취득세 ${acqRateLabel} · 중개보수 상한 포함)`,
  ].join("\n");
  const noteHref = `/notes/new?memo=${encodeURIComponent(memoDraft)}`;
  const scenarioHref = `/analysis/scenario?ltv=${loanPct}&rate=${rate}${
    incomeManwon && incomeManwon > 0 ? `&income=${incomeManwon}` : ""
  }`;

  const parseManwon = (v: string): number | null => {
    const n = Number(v.replace(/[^0-9]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const chipCls = (active: boolean) =>
    `press min-h-[40px] rounded-full px-3.5 text-[13px] ${
      active
        ? "border-[1.5px] border-primary bg-primary-soft font-bold text-primary"
        : "border border-line bg-surface font-semibold text-text-2"
    }`;

  return (
    <PageShell breadcrumb="투자 도구 › 대출·수익률 계산기" title="대출·수익률 계산기" wide>
      {/* [개선 #6] 계산기 랜딩 5장 상호 링크 — 중개보수·전월세 전환·갭·수익률이
          각자 검색 랜딩으로 분리됐다(방문 실측 상위 진입 경로의 SEO 확장). */}
      <CalculatorNav current="/calculator" />
      {/* 사실 우선: 예전 문구("기기에만 저장 · 외부 전송 없음")는 거짓이었다 — 계산을 서버 API 로 보냈다.
          [1008 · M] 이제 계산이 전부 이 화면에서 끝나 문구가 사실이 됐다. */}
      <div className="rise-in -mt-2 mb-4 text-[12px] text-text-3">
        입력값은 이 브라우저 안에서만 계산·저장돼요(서버로 보내지 않아요) · 다음 방문 때 그대로 복원돼요
      </div>

      <Segmented
        options={SECTIONS}
        value={section}
        onChange={setSection}
        ariaLabel="계산기 종류"
        className="rise-in mb-4"
      />

      {section === "realestate" && <RealEstateTools />}

      {section === "loan" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[400px_minmax(0,1fr)]">
          {/* ---------- 입력 ---------- */}
          <div className="flex min-w-0 flex-col gap-3">
            <div className="rise-in text-[12px] font-semibold text-text-3">
              집을 살 때(매매 · 주택담보대출) 쓰는 계산기예요. 전월세는 위 &lsquo;전월세 전환 계산기&rsquo;에서 볼 수 있어요.
            </div>

            {/* 1. 어디에 · 어떤 조건으로 */}
            <section className="rise-in-1 card flex flex-col gap-3 rounded-[18px] p-[18px]" aria-labelledby="calc-step-1">
              <h2 id="calc-step-1" className="text-[13px] font-extrabold text-ink">
                1. 어디서 · 어떤 조건으로 사나요
              </h2>
              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-text-2">지역</span>
                <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="지역">
                  {LOAN_REGIONS.map((r) => {
                    const active = region === r.key;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => setRegion(r.key)}
                        aria-pressed={active}
                        className={`press flex min-h-[48px] min-w-0 flex-col items-center justify-center rounded-xl px-1 py-1.5 text-center ${
                          active
                            ? "border-[1.5px] border-primary bg-primary-soft text-primary"
                            : "border border-line bg-surface text-text-2"
                        }`}
                      >
                        <span className="text-[13px] font-bold">{r.label}</span>
                        <span className="whitespace-pre-line break-words text-[10px] leading-tight">{r.hint}</span>
                      </button>
                    );
                  })}
                </div>
                {region === "regulated" && (
                  <details className="text-[12px] text-text-3">
                    <summary className="inline-flex min-h-[40px] cursor-pointer items-center font-bold text-primary">
                      규제지역 명단 보기
                    </summary>
                    <ul className="mt-1 flex flex-col gap-1 rounded-[10px] bg-bg px-3 py-2 leading-relaxed text-text-2">
                      {REGULATED_AREAS.map((g) => (
                        <li key={`${g.since}-${g.names[0]}`} className="break-words">
                          <b className="text-text-1">{g.since.replace(/-/g, ".")}~</b> {g.names.join(" · ")}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 leading-relaxed">
                      지정·해제는 바뀔 수 있어요 — 살 집이 해당되는지는 국토교통부 공고로 확인해 주세요.
                    </p>
                  </details>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-text-2">보유 주택</span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="보유 주택">
                  {OWNERSHIPS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setOwnership(c)}
                      aria-pressed={ownership === c}
                      className={chipCls(ownership === c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <p className="text-[12px] text-text-3">{OWNERSHIP_HINTS[ownership]}</p>
              </div>

              <div className="flex flex-col gap-1.5 border-t border-divider pt-3">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="calc-price" className="text-[13px] text-text-2">
                    매매가
                  </label>
                  <span className="flex items-center gap-1">
                    <input
                      id="calc-price"
                      inputMode="numeric"
                      value={priceDraft ?? price.toLocaleString("ko-KR")}
                      onChange={(e) => {
                        setPriceDraft(e.target.value);
                        const n = Number(e.target.value.replace(/[^0-9]/g, ""));
                        if (Number.isFinite(n) && n >= PRICE_MIN_MANWON && n <= PRICE_MAX_MANWON) setPrice(n);
                      }}
                      onBlur={() => {
                        if (priceDraft !== null) {
                          const n = Number(priceDraft.replace(/[^0-9]/g, ""));
                          if (Number.isFinite(n) && n > 0) {
                            setPrice(Math.min(PRICE_MAX_MANWON, Math.max(PRICE_MIN_MANWON, n)));
                          }
                        }
                        setPriceDraft(null);
                      }}
                      aria-label="매매가 (만원)"
                      className={numInputCls}
                    />
                    <span className="text-xs font-bold text-text-2">만원</span>
                  </span>
                </div>
                <div className="t-num text-right text-[15px] text-ink">{manwonText(price)}</div>
                {/* [D69] 이 숫자의 출처. 기본값(8.4억)은 우리가 정한 예시이고,
                    단지 화면에서 넘어온 값은 그 단지의 실거래가다 — 둘은 믿을 근거가
                    전혀 다르므로 화면이 구분해서 말해야 한다. */}
                {priceFrom && (
                  <div className="rounded-[10px] bg-primary-soft px-2.5 py-1.5 text-[12px] text-text-1">
                    <b className="text-primary">{priceFrom}</b> 실거래가를 넣었어요
                    {priceClamped && " (계산기 범위에 맞춰 조정)"} · 바꿔도 돼요
                  </div>
                )}
                <input
                  type="range"
                  min={PRICE_MIN_MANWON}
                  max={PRICE_MAX_MANWON}
                  step={500}
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  className="h-9 w-full cursor-pointer accent-primary max-md:h-11"
                  aria-label="매매가"
                />
              </div>
            </section>

            {/* 2. 대출 조건 */}
            <section className="rise-in-2 card flex flex-col gap-3 rounded-[18px] p-[18px]" aria-labelledby="calc-step-2">
              <h2 id="calc-step-2" className="text-[13px] font-extrabold text-ink">
                2. 대출 조건
              </h2>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] text-text-2">
                  대출 금액 <span className="t-num text-[12px] font-medium text-text-3">(최대 {manwonText(maxLoan)})</span>
                </span>
                <span className="t-num text-[15px] text-ink">{manwonText(loan)}</span>
              </div>
              {maxLoan > 0 ? (
                <>
                  <input
                    type="range"
                    min={0}
                    max={maxLoan}
                    step={LOAN_STEP_MANWON}
                    value={loan}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      /* 맨 끝 칸은 "최대" — 매매가·지역을 바꿔도 최대를 따라가게 null 로 둔다 */
                      setLoanPick(v + LOAN_STEP_MANWON > maxLoan ? null : v);
                    }}
                    className="h-9 w-full cursor-pointer accent-primary max-md:h-11"
                    aria-label="대출 금액"
                  />
                  <div className="flex items-center justify-between text-[12px] text-text-3">
                    <span>매매가의 {loanPct}%</span>
                    {loanPick !== null && loanPick < maxLoan && (
                      <button
                        type="button"
                        onClick={() => setLoanPick(null)}
                        className="inline-flex min-h-[24px] items-center font-bold text-primary"
                      >
                        최대로
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <p className="rounded-[10px] bg-warning-soft px-3 py-2 text-[12px] leading-relaxed text-text-1">
                  수도권·규제지역에서 집이 있는데 한 채 더 사는 주담대는 막혀 있어요(LTV 0%) — 아래 필요 현금은
                  매매가 전액 기준이에요.
                </p>
              )}

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[13px] text-text-2">
                  금리{" "}
                  <span className="text-[12px] text-text-3">
                    {rateIsLive ? "(공시 평균)" : "(직접 정하는 가정치)"}
                  </span>
                </span>
                <span className="text-[15px] font-extrabold text-primary">{rate}%</span>
              </div>
              {/* 공시 실데이터가 없으면 금리를 사용자가 직접 정한다 — 임의값을 시장 금리처럼 굳혀두지 않는다. */}
              {!rateIsLive && (
                <input
                  type="range"
                  min={2}
                  max={9}
                  step={0.05}
                  value={assumedRate}
                  onChange={(e) => setAssumedRate(Number(e.target.value))}
                  className="h-9 w-full cursor-pointer accent-primary max-md:h-11"
                  aria-label="가정 금리"
                />
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] text-text-2">상환 기간</span>
                <div className="flex gap-1">
                  {YEAR_OPTIONS.map((y) => {
                    const blocked = termCap !== null && y > termCap;
                    const active = effectiveYears === y;
                    return (
                      <button
                        key={y}
                        type="button"
                        onClick={() => setYears(y)}
                        disabled={blocked}
                        aria-pressed={active}
                        /* [1009 · T] 막힌 이유는 아래 한 줄이 늘 보이게 말한다 — 예전 title= 말풍선은 휴대폰에서 보이지 않았다 */
                        className={`press min-h-[40px] min-w-[48px] rounded-full px-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
                          /* [970 · B-06] 네이비 칩 글자 text-surface → text-on-dark(다크에서 안 보였다) */
                          active
                            ? "bg-brand-navy font-bold text-on-dark"
                            : "border border-line bg-surface text-text-2"
                        }`}
                      >
                        {y}년
                      </button>
                    );
                  })}
                </div>
              </div>
              {termCap !== null && (
                <p className="-mt-1 text-[12px] text-text-3">수도권·규제지역 주담대 만기는 {termCap}년 이내예요(6·27 대책).</p>
              )}
            </section>

            {/* 3. 내 형편(선택) — 판정에만 쓰인다. 접어 두어 입력 → 결과 흐름을 짧게 한다. */}
            <details
              open={infoOpen}
              onToggle={(e) => setInfoOpen((e.currentTarget as HTMLDetailsElement).open)}
              className="rise-in-3 card rounded-[18px] px-[18px] py-1.5"
            >
              <summary className="flex min-h-[48px] cursor-pointer items-center justify-between gap-2 py-1.5">
                <span className="flex min-w-0 flex-col">
                  <span className="text-[13px] font-extrabold text-ink">3. 내 형편 (선택)</span>
                  <span className="text-[12px] text-text-3">소득·현금을 넣으면 부담률·현금 충분 여부가 나와요</span>
                </span>
                <Icon
                  name="plus"
                  size={18}
                  className={`shrink-0 text-text-2 transition-transform ${infoOpen ? "rotate-45" : ""}`}
                />
              </summary>
              <div className="flex flex-col gap-2.5 pb-3 pt-1">
                <div className="text-[12px] text-text-3">
                  소득·현금은 이 기기에서만 쓰여요. 소득을 넣으면 소득 대비 부담률이 계산돼요.
                </div>
                <label className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-text-2">연 소득 (세전)</span>
                  <span className="flex items-center gap-1">
                    <input
                      inputMode="numeric"
                      value={incomeManwon != null ? incomeManwon.toLocaleString("ko-KR") : ""}
                      onChange={(e) => setIncomeManwon(parseManwon(e.target.value))}
                      placeholder="예: 7,000"
                      aria-label="연 소득 (만원)"
                      className={numInputCls}
                    />
                    <span className="text-xs font-bold text-text-2">만원</span>
                  </span>
                </label>
                <label className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-text-2">보유 현금 (예적금·주식)</span>
                  <span className="flex items-center gap-1">
                    <input
                      inputMode="numeric"
                      value={cashManwon != null ? cashManwon.toLocaleString("ko-KR") : ""}
                      onChange={(e) => setCashManwon(parseManwon(e.target.value))}
                      placeholder="예: 55,000"
                      aria-label="보유 현금 (만원)"
                      className={numInputCls}
                    />
                    <span className="text-xs font-bold text-text-2">만원</span>
                  </span>
                </label>
                <label className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-text-2">기존 대출 월 상환액</span>
                  <span className="flex items-center gap-1">
                    <input
                      inputMode="numeric"
                      value={existingDebtMonthly > 0 ? existingDebtMonthly.toLocaleString("ko-KR") : ""}
                      onChange={(e) => setExistingDebtMonthly(parseManwon(e.target.value) ?? 0)}
                      placeholder="없으면 비움"
                      aria-label="기존 대출 월 상환액 (만원)"
                      className={numInputCls}
                    />
                    <span className="text-xs font-bold text-text-2">만원</span>
                  </span>
                </label>
              </div>
            </details>

            {/* [1009 · T] 휴대폰 결과 미리보기 — 결과 카드는 입력 아래(390px 에서 1,248px, 화면 1.5장 밑)라 슬라이더를
                움직여도 바뀌는 숫자가 보이지 않았다. 입력 칸 맨 끝에 두고 sticky 로 탭바 위에 붙인다 — 입력을 훑는
                동안엔 바닥에 떠 있다가, 입력이 끝나는 자리에서 제자리로 멈춘다(결과 카드와 겹치지 않는다). 데스크톱은 옆 칸이 결과라 없다. */}
            <div className="sticky bottom-[calc(var(--nz-tabbar-offset)+8px)] z-10 md:bottom-4 lg:hidden">
              <a
                href="#calc-result"
                className="glass press flex flex-col gap-1 rounded-2xl px-4 py-2.5 no-underline shadow-[var(--shadow-float)]"
                aria-label={`계산 결과로 이동 — 최대 대출 ${manwonText(maxLoan)}, 필요 현금 ${manwonText(cashNeeded)}${
                  conclusion.caveat ? `, ${conclusion.caveat}` : ""
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="t-caption font-bold text-text-3">
                      {conclusion.caveat ? `최대 대출(LTV ${limit.ltvPct}%)` : "최대 대출"}
                    </span>
                    <TweenMoney value={maxLoan} className="t-section text-primary" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="t-caption font-bold text-text-3">필요 현금</span>
                    <TweenMoney value={cashNeeded} className="t-section text-ink" />
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-0.5 t-sub font-bold text-primary">
                    결과
                    <span aria-hidden="true">↓</span>
                  </span>
                </span>
                {/* [1009 · T 리뷰] 숫자만 떠 있는 줄이라 조건도 여기서 같이 말한다(수도권 밖 생애최초 6억원 한도) */}
                {conclusion.caveat && (
                  <span className="t-caption break-words font-bold text-warning">{conclusion.caveat}</span>
                )}
              </a>
            </div>
          </div>

          {/* ---------- 결과 ---------- */}
          <div className="flex min-w-0 flex-col gap-3">
            {/* [1009 · T] 결과 한 장 — 결론 한 줄(문장) → 큰 숫자 셋(값이 바뀌면 굴러간다) → 돈의 구성 막대 → 세부 줄.
                어려운 말(LTV·취득세·원리금균등·중개보수·DSR) 옆에 ⓘ — 누르면 정의와 "이 화면은 이렇게 계산했어요"(코드와 같은 식).
                [--text-3] 덮어쓰기: ⓘ 단추 색(var(--text-3))이 어두운 면에서 흐려 결과 패널 안에서만 ai-muted 로 읽게 한다. */}
            <section
              id="calc-result"
              className="rise-in-1 ai-panel flex scroll-mt-24 flex-col gap-4 rounded-[18px] p-[18px] shadow-[0_14px_36px_rgba(16,28,54,.22)] [--text-3:var(--ai-muted)]"
              aria-label="계산 결과"
            >
              <div className="flex flex-col gap-1">
                <p className="t-section break-words text-ai-text">{conclusion.sentence}</p>
                {/* [1009 · T 리뷰 · 법령] 확정할 수 없는 금액이면 조건을 결론 바로 밑에(수도권 밖 생애최초 6억원 한도 — calc-summary) */}
                {conclusion.caveat && (
                  <p className="t-sub break-words font-bold text-on-navy-amber">{conclusion.caveat}이 필요해요</p>
                )}
                <p className="t-sub break-words text-ai-muted">
                  {conclusion.basis} · {LOAN_RULES_BASIS_LABEL}
                </p>
              </div>

              <div className="flex flex-col gap-3 border-t border-ai-muted/30 pt-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-0.5 t-sub text-ai-muted">
                    최대 대출
                    <Explain term="ltv" how={ltvHow} source={ruleSource} label="최대 대출·LTV" />
                  </div>
                  <TweenMoney value={maxLoan} className="mt-0.5 block t-display text-ai-accent" />
                  {loanPick !== null && loan < maxLoan && (
                    <div className="mt-0.5 t-sub text-ai-muted">
                      지금은 대출 <b className="t-num font-bold text-ai-text">{manwonText(loan)}</b>으로 계산하고 있어요
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-0.5 t-sub text-ai-muted">
                      필요 현금
                      <Explain
                        title="필요 현금"
                        body="대출 말고 내 돈으로 준비해야 하는 금액이에요."
                        how={cashHow}
                        source={`${ACQ_TAX_BASIS} · ${BROKERAGE_BASIS}`}
                      />
                    </div>
                    <TweenMoney value={cashNeeded} className="mt-0.5 block t-title text-ai-text" />
                    <div className="t-caption text-ai-muted">취득세·중개보수 포함</div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-0.5 t-sub text-ai-muted">
                      월 상환액
                      <Explain
                        term="wonligeum-gyundeung"
                        how={monthlyHow}
                        source={rateIsLive ? `${mortgage.source}${mortgage.asOf ? ` · ${mortgage.asOf} 기준` : ""}` : undefined}
                        label="월 상환액"
                      />
                    </div>
                    {loan > 0 ? (
                      <TweenMoney value={monthly} className="mt-0.5 block t-title text-ai-text" />
                    ) : (
                      <div className="mt-0.5 t-title text-ai-text">대출 없음</div>
                    )}
                    <div className="t-caption text-ai-muted">
                      금리 {rate}% · {effectiveYears}년 원리금균등
                    </div>
                  </div>
                </div>
              </div>

              {breakdown && (
                <div className="border-t border-ai-muted/30 pt-4">
                  <CostBar breakdown={breakdown} />
                </div>
              )}

              <div className="flex flex-col gap-1.5 border-t border-ai-muted/30 pt-3 t-sub text-ai-muted">
                <dl className="m-0 flex flex-col gap-1.5">
                  {loan > 0 && (
                    <div className="flex justify-between gap-2">
                      <dt>총 이자 ({effectiveYears}년)</dt>
                      <dd className="m-0 t-num font-bold text-ai-text">{manwonText(totalInterest)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <dt className="flex items-center gap-0.5">
                      취득세 ({acqRateLabel})
                      <Explain term="chwideukse" how={ACQ_TAX_HOW} source={ACQ_TAX_BASIS} size={12} />
                    </dt>
                    <dd className="m-0 t-num font-bold text-ai-text">{manwonText(acqTax)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="flex items-center gap-0.5">
                      중개보수 상한{brokerFee ? ` (${brokerFee.rateLabel})` : ""}
                      <Explain
                        title="중개보수(법정 상한)"
                        body={[
                          "중개사무소에 내는 보수의 법정 최고액이에요. 실제 보수는 이 금액 안에서 협의해 정하고, 부가세 10%는 따로예요.",
                          "직거래라면 0원이에요.",
                        ]}
                        how={brokerHow}
                        source={BROKERAGE_BASIS}
                        size={12}
                      />
                    </dt>
                    <dd className="m-0 t-num font-bold text-ai-text">{manwonText(brokerManwon)}</dd>
                  </div>
                  {cashGap !== null && (
                    <div className="flex justify-between gap-2">
                      <dt>보유 현금 대비</dt>
                      <dd className={`m-0 t-num font-bold ${cashGap >= 0 ? "text-ai-success" : "text-ai-danger"}`}>
                        {cashGap >= 0 ? `충분 (+${manwonText(cashGap)})` : `부족 (${manwonText(cashGap)})`}
                      </dd>
                    </div>
                  )}
                  {burden !== null && burdenLabel !== null ? (
                    <div className="flex justify-between gap-2">
                      <dt className="flex items-center gap-0.5">
                        <span>
                          소득 대비 부담 (연 {incomeManwon?.toLocaleString("ko-KR")}만
                          {existingDebtMonthly > 0 ? " · 기존 대출 포함" : ""})
                        </span>
                        <Explain
                          term="dsr"
                          how={burdenHow}
                          size={12}
                          label="소득 대비 부담"
                          source={stressFloor !== null ? `금융위원회 10·15 대책(스트레스 금리 하한 ${stressFloor}%) · ${LOAN_RULES_BASIS_LABEL}` : undefined}
                        />
                      </dt>
                      <dd className="m-0 t-num font-bold text-ai-accent">
                        {burden}% · {burdenLabel}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                {(burden === null || burdenLabel === null) && (
                  <p className="m-0 t-sub">‘3. 내 형편’에 연 소득을 넣으면 소득 대비 부담률(적정/주의/위험)이 나와요.</p>
                )}
              </div>
            </section>

            {/* 최대 대출이 정해지는 식 — 규칙을 숨기지 않는다 */}
            <section className="rise-in-2 card flex flex-col gap-2.5 rounded-[18px] px-5 py-[18px]" aria-labelledby="calc-rule">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                <h2 id="calc-rule" className="text-[13px] font-extrabold text-ink">
                  최대 대출은 이렇게 정해져요
                </h2>
                <span className="text-[12px] font-bold text-primary">{LOAN_RULES_BASIS_LABEL}</span>
              </div>
              <div className="rounded-[12px] bg-bg px-3.5 py-3 text-[13px] leading-relaxed text-text-1">
                <div className="font-bold text-ink">
                  최대 대출 ={" "}
                  {limit.capManwon !== null && limit.binding !== "none"
                    ? "min(LTV × 매매가, 가격 구간 한도)"
                    : "LTV × 매매가"}
                </div>
                {limit.binding === "none" ? (
                  <div className="mt-1 break-words">
                    = {limit.ltvPct}% × {manwonText(price)} = <b className="text-ink">0원</b> — {regionLabel}에서
                    &lsquo;{ownership}&rsquo;은 집을 사는 주담대를 받을 수 없어요(6·27 대책).
                  </div>
                ) : limit.capManwon !== null ? (
                  <div className="mt-1 break-words">
                    = min(<b className={limit.binding === "ltv" ? "text-primary" : undefined}>{limit.ltvPct}% × {manwonText(price)} = {manwonText(limit.ltvAmountManwon)}</b>,{" "}
                    <b className={limit.binding === "cap" ? "text-primary" : undefined}>{manwonText(limit.capManwon)}</b>) ={" "}
                    <b className="text-ink">{manwonText(maxLoan)}</b>
                  </div>
                ) : (
                  <div className="mt-1 break-words">
                    = {limit.ltvPct}% × {manwonText(price)} = <b className="text-ink">{manwonText(maxLoan)}</b>
                  </div>
                )}
                <div className="mt-1 text-[12px] text-text-3">
                  {regionLabel} · {ownership} LTV {limit.ltvPct}%
                  {limit.binding === "none"
                    ? ""
                    : capitalOrRegulated
                      ? " · 수도권·규제지역 가격 구간 한도 적용"
                      : " · 이 지역은 금액 상한 없이 LTV·DSR로 정해져요"}
                </div>
              </div>
              {capitalOrRegulated && limit.binding !== "none" && (
                <ul className="grid grid-cols-1 gap-1 text-[12px] sm:grid-cols-3" aria-label="주택가격별 주담대 한도">
                  {PRICE_TIER_CAPS.map((t) => {
                    const active = limit.capManwon === t.capManwon;
                    return (
                      <li
                        key={t.label}
                        className={`rounded-[10px] px-2.5 py-1.5 ${
                          active ? "bg-primary-soft font-bold text-primary" : "bg-bg text-text-2"
                        }`}
                      >
                        {t.label}
                      </li>
                    );
                  })}
                </ul>
              )}
              <ul className="flex list-disc flex-col gap-1 pl-4 text-[12px] leading-relaxed text-text-2">
                {moveInMonths !== null && limit.binding !== "none" && (
                  <li>주담대로 집을 사면 {moveInMonths}개월 안에 전입해야 해요.</li>
                )}
                {ownership === "1주택 처분조건" && (
                  <li>
                    {capitalOrRegulated
                      ? "기존 집을 6개월 안에 팔아야 무주택과 같은 LTV를 받아요."
                      : "기존 집을 팔아야 하는 기한은 은행에 확인해 주세요."}
                  </li>
                )}
                {!capitalOrRegulated && ownership === "생애최초" && (
                  <li>수도권 밖 생애최초는 도입 당시(2022.8) 금액 한도가 6억원이었어요 — 지금 적용되는지는 은행에 확인해 주세요.</li>
                )}
                {stressFloor !== null && (
                  <li>
                    은행은 DSR(소득 대비 원리금)을 볼 때 금리에 스트레스 금리(하한 {stressFloor}%)를 더해 봐요 — 소득에 따라 한도가 더 줄 수 있어요.
                  </li>
                )}
                <li>정책대출(보금자리론·디딤돌)은 자체 한도·자격이 따로 있어요 — 한국주택금융공사에서 확인해 주세요.</li>
                <li>토지거래허가구역이면 계약 전에 허가를 받아야 하고 실거주 의무가 붙어요 — 해당 여부는 토지이음에서 확인해 주세요.</li>
              </ul>
              <p className="rounded-[10px] bg-warning-soft px-3 py-2 text-[12px] font-semibold leading-relaxed text-text-1">
                실제 한도는 DSR·소득·신용·은행 심사로 더 낮을 수 있어요. 일반 정보이며 금융·법률·세무 자문이 아니에요.
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-text-3">
                <span>출처</span>
                {LOAN_RULE_SOURCES.slice(0, 2).map((s) => (
                  <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer" className={extLinkCls}>
                    {s.label}
                  </a>
                ))}
              </div>
              <details className="text-[12px] text-text-3">
                <summary className="inline-flex min-h-[40px] cursor-pointer items-center font-bold text-text-2">
                  근거 더 보기
                </summary>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {[...LOAN_RULE_SOURCES.slice(2), ...ACQ_TAX_SOURCES].map((s) => (
                    <li key={s.href}>
                      <a href={s.href} target="_blank" rel="noopener noreferrer" className={extLinkCls}>
                        {s.label}
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 leading-relaxed">
                  근거: 금융위원회 가계부채 대책(6·27 · 9·7 · 10·15) · 지방세법 제11조·제13조의2 · 지방세특례제한법
                  제36조의3. 확인일 2026-09-21.
                </p>
              </details>
            </section>

            <div className="rise-in-3 flex flex-col gap-1.5 sm:flex-row">
              <Link
                href={noteHref}
                className="flex min-h-[44px] flex-1 items-center justify-between rounded-[14px] bg-primary-soft px-4 py-[11px]"
              >
                <span className="text-[13px] font-bold text-primary">이 조건으로 임장노트에 저장</span>
                <span className="text-[13px] font-extrabold text-primary">›</span>
              </Link>
              {/* 계산기→시나리오 연결 (15h) — 현재 조건(대출비율·금리·소득)을 딥링크로 전달 */}
              <Link
                href={scenarioHref}
                className="flex min-h-[44px] flex-1 items-center justify-between rounded-[14px] border border-line bg-surface px-4 py-[11px]"
              >
                <span className="text-[13px] font-bold text-text-1">이 조건으로 시장·대출 시나리오 보기</span>
                <span className="text-[13px] font-extrabold text-text-2">›</span>
              </Link>
            </div>

            {/* P2-4: 은행별 금리 — 공시 실데이터(변동/고정 min~max) 또는 원출처 안내 */}
            <div className="rise-in-4 card flex flex-col gap-1 overflow-x-auto rounded-[18px] px-5 py-[18px]">
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="flex items-center gap-1.5 text-[13px] font-extrabold text-ink">
                  은행별 금리 비교{" "}
                  <span className="text-[12px] font-medium text-text-3">
                    {mortgage.live
                      ? `주담대 공시 금리${mortgage.asOf ? ` · ${mortgage.asOf} 기준` : ""}`
                      : "공시 미연동"}
                  </span>
                </span>
              </div>
              {mortgage.live ? (
                <div className="min-w-[540px]">
                  <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-2 border-b border-divider py-2 text-[12px] text-text-3">
                    <span>은행</span>
                    <span className="text-center">변동금리</span>
                    <span className="text-center">고정금리</span>
                    <span className="text-center">월 원리금 (최저 변동)</span>
                  </div>
                  {mortgage.rates.map((row, i) => {
                    const minVar =
                      parseRateRange(row.variable)?.min ?? parseRateRange(row.fixed)?.min ?? null;
                    const best = i === 0;
                    return (
                      <div
                        key={row.bank}
                        className={`grid grid-cols-[1.2fr_1fr_1fr_1fr] items-center gap-2 border-b border-divider py-2.5 text-xs last:border-b-0 ${
                          best ? "rounded-lg bg-primary-soft/40" : ""
                        }`}
                      >
                        <span className={`pl-1.5 font-bold ${best ? "text-primary" : "text-text-1"}`}>
                          {row.bank}
                          {best ? " · 최저" : ""}
                        </span>
                        <span
                          className={`t-num text-center font-extrabold ${best ? "text-primary" : "text-text-1"}`}
                        >
                          {row.variable}
                        </span>
                        <span className="t-num text-center font-bold text-text-1">{row.fixed}</span>
                        <span className="t-num text-center font-extrabold text-ink">
                          {minVar !== null && loan > 0
                            ? manwonText(monthlyPaymentOf(loan, minVar, effectiveYears), "만")
                            : "—"}
                        </span>
                      </div>
                    );
                  })}
                  <div className="mt-2 text-[12px] text-text-3">
                    금리 출처: {mortgage.source}
                    {mortgage.asOf ? ` · 공시 기준월 ${mortgage.asOf}` : ""} · 월 원리금은 현재 입력한
                    대출액({manwonText(loan)})·{effectiveYears}년 원리금균등 기준 참고 계산이며 실제
                    조건은 은행 심사에 따라 달라집니다
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon="bar"
                  title="은행별 공시 금리를 아직 불러올 수 없어요"
                  desc="금융감독원 공시 연동 전이라 은행별 금리를 표시하지 않습니다. 지어낸 금리를 보여주는 대신, 원출처에서 직접 확인해 주세요. 위 계산은 직접 정한 가정 금리를 쓴 참고 계산입니다."
                  action={{
                    label: "금융상품 한눈에에서 비교하기",
                    href: "https://finlife.fss.or.kr",
                  }}
                />
              )}
            </div>

            {/* 사실 우선: 임의 가정(+8% 상승·손익분기·연 수익률 등) 기반 수익률 시뮬레이션과
                특정 수치를 단정하던 AI 판단 보조를 제거. 시세 상승 전망은 사실이 아니므로 표시하지 않음. */}
            <div className="rise-in-5 card flex flex-col gap-1.5 rounded-[18px] px-5 py-[18px]">
              <div className="text-[13px] font-extrabold text-ink">참고 안내</div>
              <p className="text-[12px] leading-relaxed text-text-2">
                최대 대출은 {LOAN_RULES_BASIS_LABEL} 규칙(지역·보유 주택별 LTV, 수도권·규제지역 주택가격 구간 한도)으로,
                월 상환액은 입력한 대출 금액·금리·기간의 원리금균등 식으로 계산했어요. 취득세는 대략 구간(1주택 계열
                1.1~3.3%, 규제지역 추가 구입 8.4%, 생애최초 12억 이하 최대 200만원 감면)이며 전용 85㎡ 초과
                농어촌특별세와 3주택 이상 중과(12%)는 넣지 않았어요. 필요 현금에는 중개보수 법정 상한(공인중개사법 시행규칙
                제20조, 부가세 별도)을 넣었고 등기 비용·이사비는 넣지 않았어요. 실제 대출 한도와 금리는 소득·DSR·신용·주택 수 등
                은행 심사에 따라 달라지고, 향후 시세 상승·수익률은 확정된 사실이 아니므로 표시하지 않아요.
              </p>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
