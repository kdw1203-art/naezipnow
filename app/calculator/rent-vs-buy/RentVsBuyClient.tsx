"use client";

/* [1025 · 담당 S] 살까·빌릴까 — 입력(단지 검색 → 실거래 중앙값 채움 · 직접 입력) → 매매·전세·월세 N년 총비용 →
   한 줄 결론 · 상승률 민감도 · 가정. 계산은 전부 lib/calc/rent-vs-buy(순수) — 화면은 숫자를 만들지 않는다.
   · 매매·전세·월세 값은 /api/complex/[id]/detail 의 12개월 중앙값(facts.tradeSummary · rent)만 채운다 — 없으면 빈칸.
   · 금리는 서버가 준 공시값(금감원 금융상품 한눈에)이 있을 때만 미리 채운다 — 없으면 빈칸(출처 없는 숫자를 두지 않는다).
   · 채움 파랑 1개: 폰에서 결과로 내려가는 링크(데스크톱은 옆 칸이 결과라 숨긴다). 계산은 입력과 동시에 된다.

   [1025b · 담당 S] 배포 전 다듬기(소유자 "디자인·기능·심플·테마") — 캡처 d_rentbuy.png 의 "입력 10칸 · 대시 30개" 를 고친다.
   · 입력 카드: 세그(칩 2개) → 핵심 3칸(매매가 · 전세 보증금 · 월세 보증금/월) → <details> "자세한 조건"(대출 비율 · 금리 ·
     보유 기간 · 기대 상승률 · 전세대출 2칸) 닫힌 채. 요약 줄에 지금 값만 — "보유 5년 · 상승률 0% · 대출 없음 · 금리 4.1%(공시)".
     대출 비율 빈칸 = 대출 없음(0% · 전액 자기자본) — 핵심 3칸만 넣어도 매매 합계가 서게. 숫자를 지어내는 게 아니라 요약 줄·
     가정에 그대로 적히는 조건이다. 월세 보증금 빈칸 = 0(월세가 있을 때만 · lib 주석과 같은 뜻).
   · 결과: 매매가·전세·월세 중 둘 미만이면 카드 하나(무엇을 넣으면 무엇이 나오는지 한 문장).
   · 섹션 제목은 한 모양(t-section · 온점은 lq-dot-blue 로 파랑 하나). 머리 아래 상태 줄은 없앴다(상태는 카드 안).
   · 면책은 화면 맨 아래 한 줄 한 번.

   [1025c · 담당 S] "심심하지 않게" — 화면마다 대표 그림 1 · 굵은 결론 1 · 손잡이 1(brief-1025c · mock1025c/rentbuy-d).
   · 손잡이: 결과 칸 맨 위 **연 상승률 슬라이더(−2~8% · 0.1 단위)** + 보유 기간 칩(3·5·10년). 자세한 조건의 같은 칸과 한 상태라
     어느 쪽을 움직여도 막대·결론·곡선이 바로 바뀐다. 트랙 위 빨간 눈금 = 손익분기 상승률(있을 때).
   · 결론: t-title 굵게 "{N}년 기준 {전세}가 {차이} 적게 듭니다" + success-soft 칩 "{전세} 유리" · t-sub 두 줄(합계·조건 / 손익분기 문장).
   · 대표 그림 1 — 누적 막대 3개 나란히(이자 · 취득세+중개 · 기회비용 · 월세 합 · −상승분 · 토큰 색) + 범례(0 인 조각은 범례에만).
   · 대표 그림 2 — 손익분기 선 그래프(x 상승률 0~8% · 매매 총비용 곡선 17점 · 전세(없으면 월세) 수평선 · 교차점 "손익분기 약 N%" ·
     지금 상승률 점선). 좌표는 lib/calc/rent-vs-buy-chart(순수 · [1025c] 단위검증) · 그리기는 RentVsBuyCharts.
   · 항목별 표 · 계산 가정은 <details> 그대로. 빈 상태 카드에는 회색 견본 막대(윤곽) + 한 문장. 옛 옵션 카드 3장·민감도 표는
     그림이 대신한다(민감도 값은 곡선이 17점으로 더 촘촘히 보여 준다). */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PageHead } from "@/app/components/PageHead";
import { StepLine } from "@/app/components/StepLine";
import { Icon } from "@/app/components/Icon";
import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { ComplexPicker, type PickedComplex } from "@/app/analysis/ComplexPicker";
import { CalculatorNav } from "../CalculatorNav";
import { manwonText } from "@/lib/finance/money";
import {
  BREAK_EVEN_RANGE,
  OPTION_LABELS,
  compareRentVsBuy,
  type OptionKey,
  type OptionResult,
  type RentVsBuyInput,
  type RentVsBuyResult,
} from "@/lib/calc/rent-vs-buy";
import { layoutBreakEven, layoutStackedBars, type StackedBarsLayout } from "@/lib/calc/rent-vs-buy-chart";
import { BreakEvenSvg, STACK_FILL, StackedBarsSvg } from "./RentVsBuyCharts";

export type RateDefault = {
  /** 공시에서 만든 대표 금리(연 %) — 없으면 null */
  pct: number | null;
  source: string;
  asOf: string | null;
};

type Mode = "search" | "manual";
const MODES: ReadonlyArray<{ value: Mode; label: string }> = [
  { value: "search", label: "단지 검색" },
  { value: "manual", label: "직접 입력" },
];

type Draft = {
  price: string;
  jeonse: string;
  deposit: string;
  monthly: string;
  loanRatio: string;
  rate: string;
  years: string;
  growth: string;
  jeonseLoan: string;
  jeonseLoanRate: string;
};

/** 채움 출처 — 단지 검색으로 들어온 값에만 붙는다(한 줄) */
type Filled = { name: string; line: string | null };

type DetailResponse = {
  complex?: { name?: string; city?: string; district?: string } | null;
  facts?: { tradeSummary?: { medianKrw: number | null; count: number; fromYm: string; toYm: string } | null } | null;
  rent?: {
    jeonseCount: number;
    jeonseMedianKrw: number | null;
    wolseCount: number;
    wolseMedianDepositKrw: number | null;
    wolseMedianMonthlyKrw: number | null;
    fromYm: string;
    toYm: string;
  } | null;
  sideFailures?: string[];
  mode?: string;
};

const YEARS_MIN = 1;
const YEARS_MAX = 30;
/* [1025c] 손잡이 눈금 — 슬라이더 −2~8% · 보유 기간 칩 */
const GROWTH_MIN = -2;
const GROWTH_MAX = 8;
const GROWTH_STEP = 0.1;
const YEAR_CHIPS: readonly number[] = [3, 5, 10];

function intOrNull(s: string): number | null {
  const n = Number(s.replace(/[^0-9]/g, ""));
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
}
function decOrNull(s: string): number | null {
  const t = s.trim().replace(/[^0-9.\-]/g, "");
  if (t === "" || t === "-" || t === ".") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
function krwToManwon(krw: number | null | undefined): number | null {
  return typeof krw === "number" && Number.isFinite(krw) && krw > 0 ? Math.round(krw / 10_000) : null;
}
function ymLabel(ym: string): string {
  return ym.length === 6 ? `${ym.slice(0, 4)}-${ym.slice(4)}` : ym;
}
/** 상승률 글자 — 음수는 "−"(유니코드 마이너스) */
function pctText(g: number): string {
  const r = Math.round(g * 10) / 10;
  return r < 0 ? `−${Math.abs(r)}%` : `${r}%`;
}

const CARD = "card rounded-2xl p-4 max-md:p-3.5";
const INPUT_CLS =
  "h-10 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-3 pr-11 t-body font-semibold text-ink outline-none focus:border-primary";
const CHIP_BASE = "press inline-flex min-h-[32px] items-center whitespace-nowrap rounded-full px-3 py-1 t-sub font-semibold no-underline";
const CHIP_SM = "press inline-flex min-h-[24px] items-center whitespace-nowrap rounded-full px-2.5 t-caption font-semibold no-underline";
const DETAILS_SUMMARY = "flex cursor-pointer list-none items-center justify-between gap-3 py-1.5 [&::-webkit-details-marker]:hidden";

/* [1025c] 빈 상태 견본 — 값 없는 결과의 막대 윤곽(회색 점선 3개). 모듈에서 한 번 */
const EMPTY_INPUT: RentVsBuyInput = { price: null, jeonse: null, deposit: null, monthly: null, loanRatio: null, rate: null, years: 5, growth: 0 };
const EMPTY_LAYOUT: StackedBarsLayout = layoutStackedBars(compareRentVsBuy(EMPTY_INPUT));

/** 항목 짧은 이름(통계 칸·항목별 표) */
const PART_SHORT: Record<string, string> = {
  interest: "이자",
  tax: "취득세",
  broker: "중개보수",
  opp: "기회비용",
  gain: "상승분",
  jloan: "전세대출 이자",
  rent: "월세 합",
};

/** 항목별 표 줄 — 선택지마다 어느 항목이 그 줄인지 */
const TABLE_ROWS: ReadonlyArray<{ label: string; keys: Partial<Record<OptionKey, string>> }> = [
  { label: "이자", keys: { buy: "interest", jeonse: "jloan" } },
  { label: "취득세", keys: { buy: "tax" } },
  { label: "중개보수", keys: { buy: "broker", jeonse: "broker", monthly: "broker" } },
  { label: "기회비용", keys: { buy: "opp", jeonse: "opp", monthly: "opp" } },
  { label: "월세 합", keys: { monthly: "rent" } },
  { label: "상승분", keys: { buy: "gain" } },
];

function Field({
  id,
  label,
  unit,
  value,
  onChange,
  inputMode = "numeric",
  hint,
  labelHidden = false,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: "numeric" | "decimal";
  hint?: ReactNode;
  /** 묶음 라벨이 위에 따로 있을 때(월세 보증금/월) — 라벨은 스크린리더에만 */
  labelHidden?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className={labelHidden ? "sr-only" : "t-caption font-semibold text-text-3"}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          placeholder=""
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT_CLS}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 t-caption text-text-3">{unit}</span>
      </div>
      {hint && <span className="t-caption text-text-3">{hint}</span>}
    </div>
  );
}

function partValue(opt: OptionResult, key: string | undefined): number | null | undefined {
  if (!key) return undefined;
  const p = opt.parts.find((x) => x.key === key);
  return p ? p.manwon : undefined;
}

/** 통계 칸 — 선택지의 가장 큰 양수 항목 + 그다음 항목 한 줄 */
function topParts(opt: OptionResult): { k: string; v: string; s: string | null } | null {
  if (opt.total === null) return null;
  const pos = opt.parts.filter((p) => p.manwon !== null && (p.manwon as number) > 0).sort((a, b) => (b.manwon as number) - (a.manwon as number));
  if (pos.length === 0) return null;
  const [a, b] = pos;
  return {
    k: `${opt.label} · ${PART_SHORT[a.key] ?? a.label}`,
    v: manwonText(a.manwon as number, "만"),
    s: b ? `${PART_SHORT[b.key] ?? b.label} ${manwonText(b.manwon as number, "만")}` : null,
  };
}

function breakEvenLine(r: RentVsBuyResult): string | null {
  const vs = r.breakEvenAgainst ? OPTION_LABELS[r.breakEvenAgainst] : null;
  switch (r.breakEven.kind) {
    case "in":
      return r.cheapest === "buy"
        ? `집값 상승이 연 약 ${r.breakEven.pct.toFixed(1)}%에 못 미치면 ${vs}가 유리해집니다`
        : `집값이 연 약 ${r.breakEven.pct.toFixed(1)}% 넘게 오르면 매매가 유리해집니다`;
    case "below":
      return `상승률 ${BREAK_EVEN_RANGE[0]}%에서도 매매가 ${vs}보다 적게 듭니다`;
    case "above":
      return `상승률 연 ${BREAK_EVEN_RANGE[1]}%까지 ${vs}가 매매보다 적게 듭니다`;
    default:
      return null;
  }
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="shrink-0 t-body text-text-1">{k}</dt>
      <dd className="m-0 text-right t-sub text-text-3">{v}</dd>
    </div>
  );
}

export function RentVsBuyClient({ rateDefault }: { rateDefault: RateDefault }) {
  const [mode, setMode] = useState<Mode>("search");
  const [draft, setDraft] = useState<Draft>({
    price: "",
    jeonse: "",
    deposit: "",
    monthly: "",
    loanRatio: "",
    rate: rateDefault.pct !== null ? String(rateDefault.pct) : "",
    years: "5",
    growth: "0",
    jeonseLoan: "",
    jeonseLoanRate: "",
  });
  const [picked, setPicked] = useState<PickedComplex | null>(null);
  const [fill, setFill] = useState<{ state: "idle" | "loading" | "ok" | "fail"; filled: Filled | null; note: string | null }>({
    state: "idle",
    filled: null,
    note: null,
  });

  const set = (k: keyof Draft) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));

  /* 단지를 고르면 12개월 중앙값을 채운다 — id 가 바뀔 때 한 번(ComplexPicker 는 onSelect 를 두 번 부른다: 즉시 + 상세 뒤) */
  const pickedId = picked?.id ?? null;
  useEffect(() => {
    if (!pickedId) return;
    const ac = new AbortController();
    setFill({ state: "loading", filled: null, note: null });
    (async () => {
      try {
        const res = await fetch(`/api/complex/${encodeURIComponent(pickedId)}/detail`, { signal: ac.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as DetailResponse;
        if (ac.signal.aborted) return;
        const name = data.complex?.name?.trim() || "단지";
        const ts = data.facts?.tradeSummary ?? null;
        const rent = data.rent ?? null;
        const price = krwToManwon(ts?.medianKrw);
        const jeonse = krwToManwon(rent?.jeonseMedianKrw);
        const wDep = krwToManwon(rent?.wolseMedianDepositKrw);
        const wMon = krwToManwon(rent?.wolseMedianMonthlyKrw);
        setDraft((d) => ({
          ...d,
          price: price !== null ? String(price) : "",
          jeonse: jeonse !== null ? String(jeonse) : "",
          deposit: wDep !== null ? String(wDep) : "",
          monthly: wMon !== null ? String(wMon) : "",
        }));
        const failed = new Set(data.sideFailures ?? []);
        const counts = [
          price !== null && ts ? `매매 ${ts.count}건` : null,
          jeonse !== null && rent ? `전세 ${rent.jeonseCount}건` : null,
          wMon !== null && rent ? `월세 ${rent.wolseCount}건` : null,
        ].filter(Boolean);
        const span = ts ?? rent;
        setFill({
          state: "ok",
          filled: {
            name,
            line:
              counts.length > 0
                ? `${name} · 실거래 12개월 중앙값 · ${counts.join(" · ")}${span ? ` · ${ymLabel(span.fromYm)}~${ymLabel(span.toYm)}` : ""}`
                : null,
          },
          note:
            price === null && jeonse === null && wMon === null
              ? failed.has("tradeWindow") || failed.has("rent")
                ? "실거래 조회 실패 · 직접 입력"
                : "12개월 신고 실거래 없음 · 직접 입력"
              : failed.has("rent")
                ? "전월세 조회 실패 · 매매만 채움"
                : failed.has("tradeWindow")
                  ? "매매 조회 실패 · 전월세만 채움"
                  : null,
        });
      } catch {
        if (ac.signal.aborted) return;
        setFill({ state: "fail", filled: null, note: "단지 실거래를 불러오지 못함 · 직접 입력" });
      }
    })();
    return () => ac.abort();
  }, [pickedId]);

  const price = intOrNull(draft.price);
  const jeonse = intOrNull(draft.jeonse);
  const monthly = intOrNull(draft.monthly);
  /* 월세만 있고 보증금이 비면 0(lib 입력 주석과 같은 뜻) — 월세가 없으면 그대로 없음 */
  const deposit = intOrNull(draft.deposit) ?? (monthly !== null ? 0 : null);
  const years = Math.min(YEARS_MAX, Math.max(YEARS_MIN, intOrNull(draft.years) ?? 5));
  const growth = decOrNull(draft.growth) ?? 0;
  const rate = decOrNull(draft.rate);
  /* 대출 비율 빈칸 = 대출 없음(0%) — 요약 줄·가정에 그대로 적힌다 */
  const loanRatioInput = decOrNull(draft.loanRatio);
  const loanRatio = loanRatioInput ?? 0;
  const jeonseLoan = intOrNull(draft.jeonseLoan);
  const jeonseLoanRate = decOrNull(draft.jeonseLoanRate);

  const input = useMemo<RentVsBuyInput>(
    () => ({ price, jeonse, deposit, monthly, loanRatio, rate, years, growth, jeonseLoan, jeonseLoanRate }),
    [price, jeonse, deposit, monthly, loanRatio, rate, years, growth, jeonseLoan, jeonseLoanRate],
  );
  const result = useMemo(() => compareRentVsBuy(input), [input]);

  const rateIsDefault = rateDefault.pct !== null && rate === rateDefault.pct;
  const rateShort = rate === null ? "금리 입력 전" : rateIsDefault ? `금리 ${rate}%(공시)` : `금리 ${rate}%`;
  const loanShort = loanRatioInput === null ? "대출 없음" : `대출 ${loanRatioInput}%`;
  const rateFact =
    rate === null
      ? "입력 전"
      : rateIsDefault
        ? `${rate}% · ${rateDefault.source}${rateDefault.asOf ? ` ${rateDefault.asOf}` : ""} 공시 변동금리 중간값 평균`
        : `${rate}% · 직접 입력`;
  const detailSummary = [
    `보유 ${years}년`,
    `상승률 ${pctText(growth)}`,
    loanShort,
    rateShort,
    jeonseLoan !== null ? `전세대출 ${manwonText(jeonseLoan)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  /* 있는 열만 — 매매가·전세·월세 중 둘 이상 있을 때 결과를 그린다 */
  const shown: OptionKey[] = (
    [
      ["buy", price !== null],
      ["jeonse", jeonse !== null],
      ["monthly", monthly !== null],
    ] as const
  )
    .filter(([, on]) => on)
    .map(([k]) => k);
  const ready = shown.length >= 2;
  const beLine = ready ? breakEvenLine(result) : null;

  /* [1025c] 대표 그림 좌표 — 순수 함수(lib/calc/rent-vs-buy-chart) */
  const bars = useMemo(() => (ready ? layoutStackedBars(result) : EMPTY_LAYOUT), [ready, result]);
  const beChart = useMemo(() => (ready ? layoutBreakEven(input, result, growth) : null), [ready, input, result, growth]);

  /* 결론 — 가장 적게 드는 쪽과 그다음의 차이 */
  const totals: Record<OptionKey, number | null> = { buy: result.buy.total, jeonse: result.jeonse.total, monthly: result.monthly.total };
  const have = shown.filter((k) => totals[k] !== null);
  const winner = result.cheapest !== null && have.length >= 2 ? result.cheapest : null;
  const runnerUp = winner ? have.filter((k) => k !== winner).sort((a, b) => (totals[a] as number) - (totals[b] as number))[0] : null;
  const diff = winner && runnerUp ? Math.round((totals[runnerUp] as number) - (totals[winner] as number)) : null;
  const conclusionTitle =
    winner && runnerUp && diff !== null
      ? diff === 0
        ? `${years}년 기준 ${OPTION_LABELS[winner]}와 ${OPTION_LABELS[runnerUp]}의 총비용이 같습니다`
        : `${years}년 기준 ${OPTION_LABELS[winner]}가 ${manwonText(diff)} 적게 듭니다`
      : (() => {
          const need = Array.from(new Set(shown.flatMap((k) => result[k].missing)));
          return need.length > 0 ? `${need.join(" · ")} 입력 뒤 비교` : `${years}년 총비용 비교 · 계산 전`;
        })();
  const conclusionFacts = [
    ...shown.map((k) => `${OPTION_LABELS[k]} ${totals[k] === null ? "—" : manwonText(totals[k] as number, "만")}`),
    `상승률 ${pctText(growth)}`,
    rateShort,
    loanShort,
  ].join(" · ");

  /* 슬라이더 — 범위 밖 값(자세한 조건에서 손으로 넣은 12% 등)은 트랙 끝에 붙이고 글자는 실제 값 */
  const growthOnTrack = Math.min(GROWTH_MAX, Math.max(GROWTH_MIN, growth));
  const beTickPct =
    result.breakEven.kind === "in" && result.breakEven.pct >= GROWTH_MIN && result.breakEven.pct <= GROWTH_MAX
      ? ((result.breakEven.pct - GROWTH_MIN) / (GROWTH_MAX - GROWTH_MIN)) * 100
      : null;
  const stats = shown.map((k) => topParts(result[k])).filter((s): s is NonNullable<typeof s> => s !== null);
  const tableRows = TABLE_ROWS.filter((row) => shown.some((k) => row.keys[k] !== undefined));

  const headSub =
    fill.filled && price !== null && jeonse !== null
      ? `${fill.filled.name} · 매매 ${manwonText(price)} · 전세 ${manwonText(jeonse)} · 실거래 기준`
      : `매매·전세·월세 ${years}년 총비용 · 실거래 기준`;

  return (
    <>
      <PageHead icon="calculator" title="살까, 빌릴까" sub={headSub} />
      <div className="mt-3">
        <CalculatorNav current="/calculator/rent-vs-buy" />
      </div>
      {/* [1025b] 절차 한 줄 — 입력 → 조건 → 결과 */}
      <StepLine
        className="mt-3"
        current={ready ? 2 : price != null || jeonse != null ? 1 : 0}
        steps={[
          { label: "매매가·전세 입력", note: price != null && jeonse != null ? "완료" : undefined },
          { label: "조건", note: `보유 ${years}년 · 상승률 ${pctText(growth)}` },
          { label: "총비용 비교" },
        ]}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start lg:gap-5">
        {/* ── 입력 ── */}
        <div className="lg:sticky lg:top-[76px]">
          <section className={`lq-dot-blue ${CARD}`} aria-labelledby="rb-inputs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="rb-inputs" className="m-0 t-section text-ink">
                입력
              </h2>
              <div role="group" aria-label="입력 방식" className="flex gap-1.5">
                {MODES.map((m) => {
                  const on = m.value === mode;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setMode(m.value)}
                      className={`${CHIP_BASE} ${on ? "chip-active" : "chip border border-line bg-surface text-text-1"}`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {mode === "search" && (
              <div className="mt-2 flex flex-col gap-1">
                <ComplexPicker label="단지" onSelect={setPicked} onMapClick={null} />
                {fill.state === "loading" && <LoadingHint text="실거래 중앙값 불러오는 중" />}
                {fill.note && <span className="t-caption text-text-3">{fill.note}</span>}
              </div>
            )}

            {/* 핵심 3칸 — 매매가 · 전세 보증금 · 월세(보증금 / 월) */}
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
              <Field id="rb-price" label="매매가" unit="만원" value={draft.price} onChange={set("price")} />
              <Field id="rb-jeonse" label="전세 보증금" unit="만원" value={draft.jeonse} onChange={set("jeonse")} />
              <div className="col-span-2 flex min-w-0 flex-col gap-1">
                <span className="t-caption font-semibold text-text-3" aria-hidden="true">
                  월세 · 보증금 / 월
                </span>
                <div className="grid grid-cols-2 gap-x-3">
                  <Field id="rb-deposit" label="월세 보증금" unit="만원" value={draft.deposit} onChange={set("deposit")} labelHidden />
                  <Field id="rb-monthly" label="월세" unit="만원/월" value={draft.monthly} onChange={set("monthly")} labelHidden />
                </div>
              </div>
            </div>
            {fill.filled?.line && <p className="m-0 mt-1.5 t-caption text-text-3">{fill.filled.line}</p>}

            {/* 나머지 조건은 접힌 채 — 요약 줄에 지금 값(기본값 포함)이 보인다 */}
            <details className="group mt-3 border-t border-divider pt-1">
              <summary className={DETAILS_SUMMARY}>
                <span className="min-w-0">
                  <span className="t-body font-bold text-ink">자세한 조건</span>
                  <span className="ml-1.5 t-caption text-text-3">{detailSummary}</span>
                </span>
                <span className="shrink-0 text-text-3 transition-transform group-open:rotate-45" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-2.5 pb-1">
                <Field id="rb-loan" label="대출 비율" unit="%" value={draft.loanRatio} onChange={set("loanRatio")} inputMode="decimal" hint="비우면 대출 없음" />
                <Field
                  id="rb-rate"
                  label="금리 · 연"
                  unit="%"
                  value={draft.rate}
                  onChange={set("rate")}
                  inputMode="decimal"
                  hint={rateDefault.pct !== null ? `${rateDefault.source}${rateDefault.asOf ? ` · ${rateDefault.asOf}` : ""} 공시` : "공시 금리 없음 · 직접 입력"}
                />
                <Field id="rb-years" label="보유 기간" unit="년" value={draft.years} onChange={set("years")} hint={`${YEARS_MIN}~${YEARS_MAX}년`} />
                <Field id="rb-growth" label="기대 상승률 · 연" unit="%" value={draft.growth} onChange={set("growth")} inputMode="decimal" hint="결과 위 슬라이더와 같은 값" />
                <Field id="rb-jloan" label="전세대출 · 선택" unit="만원" value={draft.jeonseLoan} onChange={set("jeonseLoan")} />
                <Field id="rb-jrate" label="전세대출 금리 · 선택" unit="%" value={draft.jeonseLoanRate} onChange={set("jeonseLoanRate")} inputMode="decimal" hint="비우면 위 금리" />
              </div>
            </details>

            {/* 폰: 결과는 아래 — 채움 파랑 1개(화면당). 데스크톱은 옆 칸이 결과라 숨긴다 */}
            {ready && (
              <a href="#rb-result" className="btn-primary mt-3 flex min-h-[40px] w-full items-center justify-center gap-1.5 no-underline lg:hidden">
                <Icon name="calculator" size={16} />
                결과
              </a>
            )}
            <p className="m-0 mt-2 t-caption text-text-3">입력값은 서버에 보내지 않음 · 계산은 이 화면에서</p>
          </section>
        </div>

        {/* ── 결과 ── */}
        <section id="rb-result" className="lq-dot-blue flex min-w-0 scroll-mt-24 flex-col gap-3" aria-labelledby="rb-result-title">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
            <h2 id="rb-result-title" className="m-0 t-section text-ink">
              결과
            </h2>
            {ready && (
              <span className="t-caption text-text-3">
                {years}년 합계 · 상승률 {pctText(growth)}
              </span>
            )}
          </div>

          {!ready ? (
            <div className={CARD}>
              <p className="m-0 t-body text-text-1">매매가와 전세 보증금을 넣으면 {years}년 총비용을 비교합니다</p>
              <p className="m-0 mt-1 t-caption text-text-3">월세까지 넣으면 셋을 나란히 · 단지를 고르면 실거래 12개월 중앙값으로 채움</p>
              {/* [1025c] 회색 견본 — 무엇이 나올지 윤곽으로 보인다 */}
              <div className="mx-auto mt-3 max-w-[320px]">
                <StackedBarsSvg layout={bars} years={years} empty />
              </div>
            </div>
          ) : (
            <>
              {/* [1025c] 손잡이 — 상승률 슬라이더 · 보유 기간 칩. 움직이면 아래 막대·결론·곡선이 바로 바뀐다 */}
              <div className={CARD}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="rb-growth-range" className="flex items-baseline gap-2">
                    <span className="t-section text-ink">연 상승률</span>
                    <span className="t-title t-num text-ink">{pctText(growth)}</span>
                  </label>
                  <div role="group" aria-label="보유 기간" className="flex gap-1.5">
                    {YEAR_CHIPS.map((y) => {
                      const on = y === years;
                      return (
                        <button
                          key={y}
                          type="button"
                          aria-pressed={on}
                          onClick={() => set("years")(String(y))}
                          className={`${CHIP_SM} ${on ? "chip-active" : "chip border border-line bg-surface text-text-1"}`}
                        >
                          {y}년
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-1 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                  <span className="t-caption t-num text-text-3">{pctText(GROWTH_MIN)}</span>
                  <div className="relative">
                    <input
                      id="rb-growth-range"
                      type="range"
                      min={GROWTH_MIN}
                      max={GROWTH_MAX}
                      step={GROWTH_STEP}
                      value={growthOnTrack}
                      onChange={(e) => set("growth")(e.target.value)}
                      aria-valuetext={`연 ${pctText(growth)}`}
                      className="relative z-[1] h-10 w-full cursor-pointer accent-primary"
                    />
                    {beTickPct !== null && (
                      /* 손익분기 눈금 — 트랙 끝의 손잡이 반지름(8px)만큼 안쪽으로 보정 */
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute top-1/2 h-4 w-px -translate-y-1/2 bg-brand-red"
                        style={{ left: `calc(${beTickPct}% + ${8 - (16 * beTickPct) / 100}px)` }}
                      />
                    )}
                  </div>
                  <span className="t-caption t-num text-text-3">{pctText(GROWTH_MAX)}</span>
                </div>
                <p className="m-0 mt-1 t-caption text-text-3">
                  움직이면 막대·결론에 바로 반영
                  {result.breakEven.kind === "in" && beTickPct !== null && ` · 빨간 눈금은 손익분기 ${result.breakEven.pct.toFixed(1)}%`}
                </p>
              </div>

              {/* [1025c] 결론 — 굵은 한 줄 + 유리 칩 + 근거 두 줄 */}
              <div className={CARD}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="m-0 t-title text-ink">{conclusionTitle}</p>
                  {winner && (
                    <span className="inline-flex min-h-[24px] items-center rounded-full bg-success-soft px-2.5 t-caption font-bold text-success">
                      {OPTION_LABELS[winner]} 유리
                    </span>
                  )}
                </div>
                <p className="m-0 mt-1 t-sub text-text-2">{conclusionFacts}</p>
                {beLine && <p className="m-0 mt-0.5 t-sub text-text-2">{beLine}</p>}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {/* 대표 그림 1 — 누적 막대 */}
                <section className={`lq-dot-blue ${CARD} min-w-0`} aria-labelledby="rb-bars-title">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 id="rb-bars-title" className="m-0 t-section text-ink">
                      {years}년 총비용
                    </h3>
                    <span className="t-caption text-text-3">누적 막대 · 만 원</span>
                  </div>
                  <div className="mx-auto mt-2 max-w-[360px]">
                    <StackedBarsSvg layout={bars} years={years} />
                  </div>
                  <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 t-caption text-text-3" aria-label="범례">
                    {bars.legend.map((l) => (
                      <li key={l.key} className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 shrink-0 rounded-sm ${STACK_FILL[l.key].html}`} />
                        {l.label}
                        {l.key === "opp" && rate !== null ? ` × ${rate}%` : ""}
                        {l.manwon === 0 ? " 0" : ""}
                      </li>
                    ))}
                  </ul>
                  {stats.length > 0 && (
                    <dl className="m-0 mt-3 grid grid-cols-3 gap-2 max-md:grid-cols-2">
                      {stats.map((s) => (
                        <div key={s.k} className="flex min-w-0 flex-col">
                          <dt className="t-caption text-text-3">{s.k}</dt>
                          <dd className="m-0 t-body t-num font-bold text-ink">{s.v}</dd>
                          {s.s && <dd className="m-0 t-caption text-text-3">{s.s}</dd>}
                        </div>
                      ))}
                    </dl>
                  )}
                </section>

                {/* 대표 그림 2 — 손익분기 선 */}
                <section className={`lq-dot-blue ${CARD} min-w-0`} aria-labelledby="rb-be-title">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 id="rb-be-title" className="m-0 t-section text-ink">
                      상승률에 따라
                    </h3>
                    <span className="t-caption text-text-3">0~8% · {years}년</span>
                  </div>
                  {beChart ? (
                    <>
                      <div className="mx-auto mt-2 max-w-[360px]">
                        <BreakEvenSvg layout={beChart} />
                      </div>
                      <p className="m-0 mt-1 t-caption text-text-3">
                        파란 선이 초록 선 아래인 구간은 매매 유리 · 상승분 = {price !== null ? manwonText(price) : "매매가"} × ((1+g)^{years} − 1)
                        {growth < 0 && ` · 지금 ${pctText(growth)}는 그래프 범위(0~8%) 밖`}
                      </p>
                    </>
                  ) : (
                    <p className="m-0 mt-2 t-body text-text-3">
                      {result.buy.missing.length > 0 ? `${result.buy.missing.join(" · ")} 입력 뒤 곡선 표시` : "전세 또는 월세 입력 뒤 곡선 표시"}
                    </p>
                  )}
                </section>
              </div>

              <div className={CARD}>
                <details className="group">
                  <summary className={DETAILS_SUMMARY}>
                    <span className="min-w-0">
                      <span className="t-body font-bold text-ink">항목별 표</span>
                      <span className="ml-1.5 t-caption text-text-3">이자 · 취득세 · 중개보수 · 기회비용 · 상승분</span>
                    </span>
                    <span className="shrink-0 text-text-3 transition-transform group-open:rotate-45" aria-hidden="true">
                      +
                    </span>
                  </summary>
                  <div className="-mx-4 mt-1 overflow-x-auto px-4 max-md:-mx-3.5 max-md:px-3.5">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-line">
                          <th className="py-1.5 pr-2 text-left t-caption font-semibold text-text-3">항목</th>
                          {shown.map((k) => (
                            <th key={k} className="py-1.5 px-2 text-right t-caption font-semibold text-text-3">
                              {OPTION_LABELS[k]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tableRows.map((row) => (
                          <tr key={row.label} className="border-b border-line">
                            <td className="whitespace-nowrap py-2 pr-2 t-body text-text-1">{row.label}</td>
                            {shown.map((k) => {
                              const v = partValue(result[k], row.keys[k]);
                              return (
                                <td key={k} className={`whitespace-nowrap py-2 px-2 text-right t-body t-num ${v === null || v === undefined ? "text-text-3" : "text-text-1"}`}>
                                  {v === undefined ? "" : v === null ? "—" : manwonText(v, "만")}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                        <tr>
                          <td className="whitespace-nowrap py-2 pr-2 t-body font-bold text-ink">합계</td>
                          {shown.map((k) => (
                            <td key={k} className={`whitespace-nowrap py-2 px-2 text-right t-body t-num font-bold ${totals[k] === null ? "text-text-3" : "text-ink"}`}>
                              {totals[k] === null ? "—" : manwonText(totals[k] as number, "만")}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </details>

                <details className="group mt-1 border-t border-divider">
                  <summary className={DETAILS_SUMMARY}>
                    <span className="min-w-0">
                      <span className="t-body font-bold text-ink">계산 가정</span>
                      <span className="ml-1.5 t-caption text-text-3">취득세 · 중개보수 상한 · 원리금균등 · 기회비용 × 금리</span>
                    </span>
                    <span className="shrink-0 text-text-3 transition-transform group-open:rotate-45" aria-hidden="true">
                      +
                    </span>
                  </summary>
                  <dl className="mt-1 divide-y" data-tone="plain">
                    {result.assumptions.map((a) => {
                      const i = a.indexOf(" · ");
                      return <Row key={a} k={i > 0 ? a.slice(0, i) : a} v={i > 0 ? a.slice(i + 3) : ""} />;
                    })}
                    {loanRatioInput === null && <Row k="대출" v="비율 미입력 · 대출 없음(전액 자기자본)" />}
                    {deposit === 0 && monthly !== null && intOrNull(draft.deposit) === null && <Row k="월세 보증금" v="미입력 · 0" />}
                    <Row k="가격 출처" v={fill.filled ? "국토교통부 실거래 12개월 중앙값 · 매물 호가 아님" : "직접 입력"} />
                    <Row k="금리 출처" v={rateFact} />
                  </dl>
                </details>
              </div>
            </>
          )}
        </section>
      </div>

      <p className="m-0 mt-4 t-caption text-text-3">본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다 · 금융·세무 자문 아님</p>
    </>
  );
}
