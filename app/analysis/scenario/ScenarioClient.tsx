"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrubLineLazy } from "@/app/components/viz/ScrubLineLazy";
import { TweenNumber } from "@/app/components/motion/TweenNumber";
import { burdenLabel } from "@/lib/finance/calc-summary";
import { Segmented } from "@/app/components/ui/Segmented";
import { Explain } from "@/app/components/explain/Explain";
import { Delta } from "@/app/components/num/Delta";
import { DELTA_ARROW, DELTA_CLASS, DELTA_WORD, deltaDir, pctChange } from "@/lib/format/delta";
import { formatEokMan } from "@/lib/format/eok-man";
import { PageShell } from "../../components/PageShell";
import { SimulationNotice } from "../../components/ExampleBadge";
import { ComplexPicker, type PickedComplex } from "../ComplexPicker";
import { useMapPick } from "../use-map-pick";
import { AnalysisCrossLinks } from "../AnalysisCrossLinks";
import {
  SEOUL_DISTRICTS,
  METRO_EXPLORE_DISTRICTS,
} from "@/lib/map/seoul-districts";
import { pickRegionByAnyName } from "@/lib/regions/param";
import { useCopy } from "@/lib/ui/use-copy";

/* ============================================================
   시장·대출 시나리오 — 기준 시세를 지역 실데이터(스냅샷 평균가)로 프리필.
   지역 미선택/데이터 미보유 시 기존 예시 수치로 동작 (graceful).
   계산은 전부 클라이언트 (30년 원리금균등 상환 기준).

   [1009 · A] 토스 계산기 관례로 다듬었다(2026-09-22 실측).
    · 결과 숫자 9곳이 슬라이더를 움직이면 **순간 교체** — 무엇이 얼마나 바뀌었는지 눈이 못 따라갔다 → TweenNumber
      (이전 값 → 새 값 320ms, 모션 최소화면 즉시).
    · 색 뜻이 뒤섞였다 — "금리 +1%p 시" 금액을 오류색(text-danger), 시세 상승 자산을 테마색(text-primary), 소득 대비
      "적정"을 테마색으로. 이제 변동은 ▲ 빨강·▼ 파랑(등락 관례 + 비교 기준), 부담 판정은 상태색(적정 초록·주의 주황·위험 빨강).
    · 금액 표기: 계산 결과는 "3억 3,600만원"(표준 — 짧은 "3.36억"은 계산 결과를 뭉갠다). 억 미전환 없음.
    · 금리 스트레스 곡선은 누르고 끌면 그 금리의 월 상환액(ScrubLine — 늘어나던 TrendChart 대신).
    · 소득 대비(DSR 성격)·대출 비율(LTV) 옆 ⓘ — 이 화면 계산과 같은 말로.
   ============================================================ */

/** 소득 대비 부담 "위험" 경계(40%) — burdenLabel(계산기)과 같은 값. 곡선의 "넘는 첫 금리"가 쓴다 */
const BURDEN_LIMIT = 0.4;

const REGION_OPTIONS = [
  ...SEOUL_DISTRICTS.map((d) => ({ id: d.id, label: `서울 ${d.name}` })),
  /* [999] 폐지 구(인천 서구·중구, 2026-07)는 선택지에서 뺀다 — 후속 구가 있다 */
  ...METRO_EXPLORE_DISTRICTS.filter((d) => !d.retired).map((d) => ({
    id: d.id,
    label: `${d.city ?? "서울"} ${d.name}`,
  })),
];

/* 기준금리 기본값 — 고정 사실이 아니라 사용자가 자기 조건으로 바꾸는 입력값.
   (예전엔 4.19%가 하드코딩돼 "지금 금리"처럼 읽혔다. 금리는 사람·시점마다 다르다.)
   서버가 시중 주담대 실공시(금감원)를 넘겨주면 그 중앙값을 기본값으로 쓰고,
   못 받으면 이 정적 가정값으로 떨어진다 — 지어낸 값이 아니라 "조정하라"는 출발점. */
const FALLBACK_BASE_RATE = 4.19;

/** 서버에서 주입하는 실금리 참고값(사실 우선 — 값이 없으면 null). */
export type RateContext = {
  /** 한국은행 기준금리 (정책금리) */
  policy: { label: string; value: number; cycle: string | null } | null;
  /** 시중 주담대 변동금리 중앙값 (금감원 공시) */
  mortgageMedian: number | null;
  mortgageSource: string | null;
  mortgageAsOf: string | null;
};
const RATE_OFFSETS: { label: string; offset: number }[] = [
  { label: "기준", offset: 0 },
  { label: "-1.0%p", offset: -1 },
  { label: "-0.5%p", offset: -0.5 },
  { label: "+0.5%p", offset: 0.5 },
  { label: "+1.0%p", offset: 1 },
  { label: "+2.0%p", offset: 2 },
];
const PRICE_CHIPS: { label: string; pct: number }[] = [
  { label: "▲ +10% 급등", pct: 10 },
  { label: "▲ +5%", pct: 5 },
  { label: "보합", pct: 0 },
  { label: "▼ -5%", pct: -5 },
  { label: "▼ -10%", pct: -10 },
  { label: "▼ -20% 급락", pct: -20 },
];
const PERIOD_CHIPS = ["3년", "5년", "10년"];

/** 예시 기본값(데모) — 특정 단지명 없음 · 8.4억 */
const EXAMPLE_PRICE_WON = 840_000_000;
const LOAN_MONTHS = 360; // 30년 원리금균등

type Baseline = {
  regionName: string;
  period: string;
  source: string;
  avgSaleWon: number;
  avgSaleLabel: string;
  jeonseRatio: number | null;
};

function monthlyPayment(principalWon: number, annualRatePct: number): number {
  const r = annualRatePct / 100 / 12;
  if (r <= 0) return principalWon / LOAN_MONTHS;
  const pow = Math.pow(1 + r, LOAN_MONTHS);
  return (principalWon * r * pow) / (pow - 1);
}

/** [1009 · A] 원 → "312만원" · "1억 2,000만원" — 계산 결과 표준(formatEokMan). 0 이하는 "0원" */
function wonText(won: number): string {
  return won > 0 ? formatEokMan(won / 10_000, { unit: "만원" }) : "0원";
}


/** "202607" | "20260701" → "2026.07". 형식이 다르면 원문 그대로. */
function fmtCycle(cycle: string): string {
  const m = /^(\d{4})(\d{2})/.exec(cycle);
  return m ? `${m[1]}.${m[2]}` : cycle;
}

/* [1009 · A] 날것 rgba(bg-[rgba(29,79,216,.1)]) → 토큰(bg-primary-soft), 선택 상태를 스크린리더에도(aria-pressed),
   눌림(press). 시세 칩의 ▲▼ 는 등락색으로 — 화살표만 있고 색이 없었다. */
function Chip({
  label,
  active,
  onClick,
  className = "",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  const m = /^([▲▼])\s?(.*)$/.exec(label);
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`press min-h-[40px] rounded-[10px] px-3 py-2 text-xs ${
        active
          ? "border-[1.5px] border-primary bg-primary-soft font-bold text-primary"
          : "border border-line bg-surface text-text-2"
      } ${className}`}
    >
      {m ? (
        <>
          <span aria-hidden="true" className={m[1] === "▲" ? "delta-up" : "delta-down"}>
            {m[1]}
          </span>{" "}
          <span className="sr-only">{m[1] === "▲" ? "상승" : "하락"} </span>
          {m[2]}
        </>
      ) : (
        label
      )}
    </button>
  );
}

export default function ScenarioClient({ rates }: { rates: RateContext }) {
  /* 기본 금리: 시중 주담대 변동 중앙값(실공시) > 정적 가정값 순.
     정책금리(기준금리)는 대출금리가 아니므로 기본값으로 쓰지 않는다 — 참고로만 보여준다. */
  const defaultRate = rates.mortgageMedian ?? FALLBACK_BASE_RATE;
  const [rateOffset, setRateOffset] = useState(0);
  const [pricePct, setPricePct] = useState(0);
  const [period, setPeriod] = useState("5년");
  /* 실입력 3종 — 예전엔 소득 7,000만·LTV 40%가 고정이었고 슬라이더는 그림이었다.
     내 조건을 넣을 수 없는 시뮬레이터는 결과도 남의 결과다. */
  const [incomeManwon, setIncomeManwon] = useState(7000);
  const [ltvPct, setLtvPct] = useState(40);
  const [baseRate, setBaseRate] = useState(defaultRate);
  const [regionId, setRegionId] = useState("");
  const [pickedName, setPickedName] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [loadingBaseline, setLoadingBaseline] = useState(false);

  /* [975] 단지 선택은 검색·지도 두 길이 같은 함수로 모인다 — 어느 쪽으로 골라도
     기준가 프리필과 지역 전환이 똑같이 일어나야 한다. */
  const onComplex = useCallback((c: PickedComplex) => {
    setPickedName(c.name);
    if (c.regionId) setRegionId(c.regionId);
  }, []);
  const { openMap, mapNode } = useMapPick(onComplex, "시장·대출 시나리오");

  // 딥링크 ?region=·?ltv=·?income=·?rate= 초기 반영 (?complexId=/?apt= 는 ComplexPicker가 처리)
  // ltv/income/rate 는 /calculator "이 조건으로 시나리오 보기"가 현재 조건을 넘겨주는 통로.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    /* [D62] 지역은 어느 말로 와도 받는다 — 지도·홈은 "서울 강남구", 실거래
       화면은 "서울-강남구", 여기 목록은 "gangnam". 예전에는 받은 문자열을
       그대로 id 로 넣어, 다른 화면에서 온 링크가 조용히 기본 지역으로 떨어졌다. */
    const r = sp.get("region");
    if (r) {
      const hit = pickRegionByAnyName(r, REGION_OPTIONS);
      if (hit) setRegionId(hit.id);
    }
    /* 파라미터가 **없을 때** 0 으로 읽히던 버그 수리 (2026-08-27 실측).
       Number(null) === 0 이라, 파라미터 없이 /analysis/scenario 를 열면
       `ltv >= 0` 가드를 통과해 대출 비율이 40% → **0%** 로 덮였다.
       대출 계산기가 "대출 0원 · 필요 현금 8.4억"으로 열리고 있었다.
       숫자로 바꾸기 전에 "값이 실제로 왔는지"를 먼저 본다. */
    const num = (key: string): number | null => {
      const raw = sp.get(key);
      if (raw === null || raw.trim() === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };
    const ltv = num("ltv");
    if (ltv !== null && ltv >= 0 && ltv <= 100)
      setLtvPct(Math.min(70, Math.round(ltv / 5) * 5)); // 슬라이더 step=5에 맞춰 반올림
    const income = num("income");
    if (income !== null && income >= 100 && income <= 100_000)
      setIncomeManwon(Math.round(income));
    const rate = num("rate");
    if (rate !== null && rate >= 0.5 && rate <= 15) setBaseRate(rate);
    /* [AI-27] 공유 링크 복원 — price(가격 변동%)·offset(금리 오프셋) */
    const price = num("price");
    if (price !== null && price >= -30 && price <= 30) setPricePct(price);
    const offset = num("offset");
    if (offset !== null && offset >= -3 && offset <= 3) setRateOffset(offset);
  }, []);

  /* [AI-27] 시나리오 공유 — 현재 입력 세트를 URL로. 열람은 로그인 불필요.
     [966] 복사·토스트·"복사됨" 지속 시간은 useCopy(공용) — 화면마다 다르던 2.5s 를 없앤다. */
  const { copy: copyLink, copied: shareCopied } = useCopy("링크를 복사했어요");
  const copyShareLink = () => {
    const sp = new URLSearchParams();
    if (regionId) sp.set("region", regionId);
    sp.set("ltv", String(ltvPct));
    sp.set("income", String(incomeManwon));
    sp.set("rate", String(baseRate));
    sp.set("price", String(pricePct));
    sp.set("offset", String(rateOffset));
    void copyLink(`${location.origin}/analysis/scenario?${sp.toString()}`);
  };

  useEffect(() => {
    if (!regionId) {
      setBaseline(null);
      return;
    }
    let cancelled = false;
    setLoadingBaseline(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/ai/market-baseline?regionId=${encodeURIComponent(regionId)}`,
        );
        const data = (await res.json().catch(() => null)) as
          | ({ available?: boolean } & Baseline)
          | null;
        if (cancelled) return;
        setBaseline(
          data?.available && data.avgSaleWon > 0
            ? {
                regionName: data.regionName,
                period: data.period,
                source: data.source,
                avgSaleWon: data.avgSaleWon,
                avgSaleLabel: data.avgSaleLabel,
                jeonseRatio: data.jeonseRatio ?? null,
              }
            : null,
        );
      } catch {
        if (!cancelled) setBaseline(null);
      } finally {
        if (!cancelled) setLoadingBaseline(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [regionId]);

  const isReal = baseline !== null;
  const priceWon = baseline?.avgSaleWon ?? EXAMPLE_PRICE_WON;
  const incomeWon = Math.max(100, incomeManwon) * 10_000;
  const loanWon = priceWon * (ltvPct / 100);
  const cashWon = priceWon - loanWon;

  const calc = useMemo(() => {
    const rate = Math.max(0.1, baseRate) + rateOffset;
    const pay = monthlyPayment(loanWon, rate);
    const payStress = monthlyPayment(loanWon, rate + 1);
    const dsr = (pay * 12) / incomeWon;
    const dsrStress = (payStress * 12) / incomeWon;
    const priceDeltaWon = (priceWon * pricePct) / 100;
    const newPrice = priceWon + priceDeltaWon;
    const ltvAfter = newPrice > 0 ? (loanWon / newPrice) * 100 : 0;
    const bars = [
      /* [975] 막대 위에는 흰 글씨가 얹힌다 — 그래서 **채움 전용 토큰**만 쓴다.
         본문용 --primary/--danger 는 다크에서 밝은 색으로 뒤집히고,
         --ai-accent 는 애초에 어두운 패널용이라 밝은 카드 위 흰 글씨가
         2.27:1 이었다(실측). 색의 뜻도 이제 맞다: 붉음=부담 증가, 초록=감소. */
      { label: `기준 ${rate.toFixed(2)}%`, pay, color: "var(--primary-fill)" },
      { label: "+1.0%p", pay: payStress, color: "var(--danger-fill)" },
      { label: "-0.5%p", pay: monthlyPayment(loanWon, Math.max(0.5, rate - 0.5)), color: "var(--success-fill)" },
    ];
    const maxPay = Math.max(...bars.map((b) => b.pay));

    /* 보유기간 배선 — 예전엔 3·5·10년 칩이 어느 계산에도 연결돼 있지 않았다.
       k개월 후 잔여 원금 B = P·((1+r)^n − (1+r)^k)/((1+r)^n − 1) (원리금균등). */
    const years = parseInt(period, 10) || 5;
    const k = Math.min(LOAN_MONTHS, years * 12);
    const r = rate / 100 / 12;
    const pow = Math.pow(1 + r, LOAN_MONTHS);
    const balance =
      r <= 0
        ? loanWon * (1 - k / LOAN_MONTHS)
        : (loanWon * (pow - Math.pow(1 + r, k))) / (pow - 1);
    const paidTotal = pay * k;
    const principalPaid = loanWon - balance;
    const interestPaid = Math.max(0, paidTotal - principalPaid);

    /* 금리 스트레스 곡선 — 막대 3개(기준·+1%p·-0.5%p)로는 "어디서부터
       버거워지는가"가 안 보인다. -1.0%p ~ +3.0%p 를 0.25%p 간격으로 훑어
       월 상환액이 어떻게 휘는지를 선으로 그린다. 슬라이더를 움직이면
       이 곡선이 그 자리에서 다시 그려진다(이 화면의 유일한 실시간 반응). */
    const curve: { rate: number; pay: number }[] = [];
    for (let d = -1; d <= 3.0001; d += 0.25) {
      const rr = Math.max(0.5, rate + d);
      curve.push({ rate: Math.round(rr * 100) / 100, pay: monthlyPayment(loanWon, rr) });
    }
    /* 소득 대비 40%(통상 부담 한계 — 계산기와 같은 "위험" 경계)를 넘는 첫 금리 — 없으면 null */
    const breachRate =
      curve.find((c) => (c.pay * 12) / incomeWon > BURDEN_LIMIT)?.rate ?? null;

    return {
      rate, pay, payStress, dsr, dsrStress, priceDeltaWon, ltvAfter, bars, maxPay,
      holdYears: years, holdBalance: balance, holdInterest: interestPaid, holdPrincipal: principalPaid,
      curve, breachRate,
    };
  }, [loanWon, priceWon, rateOffset, pricePct, incomeWon, baseRate, period]);

  /* [1009 · A] 부담 판정은 상태색 — 예전엔 "적정"이 테마색(text-primary), 주의·위험이 같은 빨강이라 구분이 안 됐다.
     [리뷰] 경계는 대출 계산기와 하나로(lib/finance/calc-summary burdenLabel: 30% 이하 적정 · 40% 이하 주의 · 그 위 위험) —
     예전엔 35% 부터 "위험"이라면서 같은 화면 곡선·문장은 "40% 통상 부담 한계"라고 했다. */
  const dsrTone = (v: number) => {
    const label = burdenLabel(v * 100) ?? "위험";
    return { label, cls: label === "적정" ? "text-success" : label === "주의" ? "text-warning" : "text-danger" };
  };

  const aiComment = useMemo(() => {
    const stress = dsrTone(calc.dsrStress);
    const head = isReal
      ? `${baseline.regionName} 평균 매매가 ${baseline.avgSaleLabel}(${baseline.period} 기준) 실데이터와 입력하신 조건(연 소득 ${incomeManwon.toLocaleString("ko-KR")}만원 · 대출 ${ltvPct}%)으로 계산했습니다.`
      : `예시 시세(8.4억)와 입력하신 조건(연 소득 ${incomeManwon.toLocaleString("ko-KR")}만원 · 대출 ${ltvPct}%) 기준입니다. 지역을 선택하면 실제 평균가로 다시 계산해요.`;
    const body =
      stress.label !== "위험"
        ? `금리 1%p 상승 시에도 월 ${wonText(calc.payStress)}(소득 대비 ${(calc.dsrStress * 100).toFixed(0)}%)로 ${stress.label} 범위입니다.`
        : `금리 1%p 상승 시 월 ${wonText(calc.payStress)}(소득 대비 ${(calc.dsrStress * 100).toFixed(0)}%)로 부담이 커집니다. 대출 비율을 낮추거나 예산을 재조정하세요.`;
    const hold = ` ${calc.holdYears}년 보유 시 누적 이자는 약 ${wonText(calc.holdInterest)}, 잔여 원금은 ${wonText(calc.holdBalance)}입니다.`;
    const tail =
      pricePct < 0
        ? ` 시세 ${pricePct}% 시나리오에서 LTV는 ${calc.ltvAfter.toFixed(0)}%로 ${calc.ltvAfter < 60 ? "안전권" : "주의 구간"}입니다.`
        : "";
    return `${head} ${body}${hold}${tail}`;
  }, [baseline, calc, isReal, pricePct, incomeManwon, ltvPct]);

  return (
    <PageShell breadcrumb="AI 분석 › 시장·대출 시나리오">
      {/* [975] 지도에서 단지 고르기 — 열기 전에는 내려받지 않는다 */}
      {mapNode}
      <div className="mb-2 flex items-center justify-between">
        <h1 className="rise-in t-title text-ink">시장·대출 시나리오</h1>
        {/* [AI-27] 현재 조건 세트를 URL로 공유 — 커뮤니티 글감·상담 공유용 */}
        <button
          type="button"
          onClick={copyShareLink}
          className="press rise-in min-h-[40px] rounded-[10px] border border-line-strong bg-surface px-3 py-1.5 t-sub font-bold text-text-1"
        >
          {shareCopied ? "링크 복사됨 ✓" : "이 조건 공유"}
        </button>
      </div>
      {!isReal && (
        <div className="rise-in mb-3">
          <SimulationNotice />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* 조건 설정 */}
        <div className="rise-in-1 card flex flex-col gap-3.5 rounded-[18px] p-[22px]">
          <div className="t-section text-ink">조건 설정</div>

          {/* 단지 선택 → 그 단지 지역의 실시세로 기준가 프리필 */}
          <ComplexPicker
            label="단지로 기준가 채우기"
            onSelect={onComplex}
            /* [975] 이름을 몰라도 지도에서 눌러 고른다 */
            onMapClick={openMap}
          />

          {/* 지역 실시세 프리필 */}
          <label className="flex flex-col gap-1">
            <span className="t-sub font-bold text-text-2">기준 지역 (실시세)</span>
            <select
              value={regionId}
              onChange={(e) => setRegionId(e.target.value)}
              className="w-full rounded-[10px] border border-line bg-surface px-2.5 py-2 text-xs font-bold text-ink"
            >
              <option value="">예시 시세로 계산 (8.4억)</option>
              {REGION_OPTIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            {regionId && !loadingBaseline && !isReal && (
              <span className="t-sub text-text-3">
                이 지역은 아직 실시세 데이터가 없어 예시 시세로 계산해요.
              </span>
            )}
          </label>

          <div className="flex flex-col gap-2.5">
            <div className="flex justify-between t-body">
              <span className="text-text-2">대상</span>
              <span className="text-right font-bold text-ink">
                {isReal
                  ? `${pickedName ? `${pickedName} · ` : ""}${baseline.regionName} 평균 · ${baseline.avgSaleLabel}`
                  : `${pickedName ? `${pickedName} · ` : "예시 시세 · "}8.4억`}
                {isReal && (
                  <span className="ml-1 rounded border border-line px-1 py-px t-caption font-semibold text-text-3 align-middle">
                    실데이터 기준
                  </span>
                )}
              </span>
            </div>
            {isReal && (
              <div className="flex justify-between t-sub text-text-3">
                <span>출처</span>
                <span>
                  {baseline.source.toUpperCase()} · {baseline.period} 기준
                  {baseline.jeonseRatio !== null
                    ? ` · 전세가율 ${baseline.jeonseRatio.toFixed(0)}%`
                    : ""}
                </span>
              </div>
            )}
            {/* 대출 비율 — 예전 슬라이더는 40%에 고정된 그림이었다. 실제 입력으로 교체. */}
            <div className="flex justify-between t-body">
              <span className="inline-flex items-center gap-0.5 text-text-2">
                대출 비율
                <Explain
                  term="ltv"
                  how={[
                    "대출액 = 기준 시세 × 대출 비율 · 필요 현금 = 기준 시세 − 대출액",
                    "실제 한도는 지역(규제지역 여부)·보유 주택 수·가격대에 따라 달라요 — 계산기에서 내 조건으로 확인하세요.",
                  ]}
                />
              </span>
              <span className="font-extrabold tabular-nums text-ink">
                <TweenNumber value={ltvPct} format="int" suffix="%" />
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={70}
              step={5}
              value={ltvPct}
              onChange={(e) => setLtvPct(Number(e.target.value))}
              aria-label="대출 비율 (%)"
              className="h-9 w-full cursor-pointer accent-primary max-md:h-11"
            />
            <label className="flex items-center justify-between gap-2 t-body">
              <span className="text-text-2">연 소득</span>
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  min={100}
                  max={100_000}
                  step={100}
                  value={incomeManwon}
                  onChange={(e) => setIncomeManwon(Math.max(0, Number(e.target.value)))}
                  aria-label="연 소득 (만원)"
                  className="w-[90px] rounded-[8px] border border-line bg-surface px-2 py-1 text-right t-body font-extrabold text-ink"
                />
                <span className="font-bold text-text-2">만원</span>
              </span>
            </label>
            {/* [D68] 금리는 이 화면에서 **가장 많이 만지는 값**인데 숫자 입력칸
                하나뿐이었다 — 0.05씩 올려 보려면 화살표를 스무 번 눌러야 한다.
                대출 비율은 이미 슬라이더인데 금리만 아닌 건 일관성 문제이기도 하다.
                슬라이더를 더하되 숫자칸은 남긴다: 슬라이더는 "훑어보기",
                숫자칸은 "내 대출 금리 정확히 넣기" — 둘은 다른 용도다.
                DSR 은 입력이 아니라 결과다(소득·상환액에서 계산된다) — 만질 수
                있는 것처럼 보이게 하지 않고, 슬라이더를 움직이는 즉시 아래에서
                다시 계산돼 보인다. */}
            <div className="flex justify-between t-body">
              <span className="text-text-2">기준 금리</span>
              <span className="font-extrabold text-ink">{baseRate.toFixed(2)}%</span>
            </div>
            <input
              type="range"
              min={2}
              max={9}
              step={0.05}
              value={Math.min(9, Math.max(2, baseRate))}
              onChange={(e) => setBaseRate(Number(e.target.value))}
              aria-label="기준 금리 (연 %) 슬라이더"
              className="h-9 w-full cursor-pointer accent-primary max-md:h-11"
            />
            <label className="flex items-center justify-between gap-2 t-body">
              <span className="text-text-2">직접 입력</span>
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  min={0.5}
                  max={15}
                  step={0.05}
                  value={baseRate}
                  onChange={(e) => setBaseRate(Number(e.target.value))}
                  aria-label="기준 금리 (연 %)"
                  className="w-[70px] rounded-[8px] border border-line bg-surface px-2 py-1 text-right t-body font-extrabold text-ink"
                />
                <span className="font-bold text-text-2">%</span>
              </span>
            </label>

            {/* 지금 금리 참고 — 서버가 넘긴 실공시(한국은행 기준금리·금감원 주담대).
                정책금리는 대출금리가 아니라 참고용, 주담대 중앙값은 '적용' 버튼으로 채운다.
                값이 없으면(키 미설정) 블록 자체를 감춰 지어낸 숫자를 만들지 않는다. */}
            {(rates.policy || rates.mortgageMedian != null) && (
              <div className="rounded-[10px] border border-line bg-bg px-3 py-2 t-sub">
                <div className="font-bold text-text-2">지금 금리 참고</div>
                {rates.policy && (
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-text-3">한국은행 기준금리(정책)</span>
                    <span className="font-extrabold text-ink">
                      {rates.policy.label}
                      {rates.policy.cycle ? (
                        <span className="ml-1 font-semibold text-text-3">
                          {fmtCycle(rates.policy.cycle)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                )}
                {rates.mortgageMedian != null && (
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-text-3">
                      시중 주담대 변동 중앙값
                      {rates.mortgageAsOf ? (
                        <span className="ml-0.5 text-text-3">({rates.mortgageAsOf})</span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      onClick={() => setBaseRate(Number(rates.mortgageMedian!.toFixed(2)))}
                      className="shrink-0 rounded-[7px] border-[1.5px] border-primary px-2 py-0.5 t-sub font-extrabold text-primary"
                    >
                      {rates.mortgageMedian.toFixed(2)}% 적용
                    </button>
                  </div>
                )}
                <div className="mt-1.5 t-caption text-text-3">
                  실제 대출 금리 = 기준금리 + 가산금리(신용·LTV·상품별). 위 값은 참고용이며,
                  내 조건에 맞게 금리를 조정하세요.
                </div>
              </div>
            )}

            <div className="flex justify-between gap-2 t-body">
              <span className="text-text-2">필요 현금 (시세−대출)</span>
              <TweenNumber value={cashWon / 10_000} format="eokmanwon" className="text-right font-extrabold text-ink" />
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-divider pt-3">
            <div className="t-body font-extrabold text-ink">금리 시나리오</div>
            <div className="flex flex-wrap gap-1.5">
              {RATE_OFFSETS.map((c) => (
                <Chip
                  key={c.label}
                  label={c.offset === 0 ? `기준 ${baseRate}%` : c.label}
                  active={rateOffset === c.offset}
                  onClick={() => setRateOffset(c.offset)}
                />
              ))}
            </div>
            <div className="mt-1 t-body font-extrabold text-ink">시세 시나리오</div>
            <div className="flex flex-wrap gap-1.5">
              {PRICE_CHIPS.map((c) => (
                <Chip
                  key={c.label}
                  label={c.label}
                  active={pricePct === c.pct}
                  onClick={() => setPricePct(c.pct)}
                />
              ))}
            </div>
            <div className="mt-1 t-body font-extrabold text-ink">보유 기간</div>
            {/* [1009 · A] 세 가지 중 하나 — 같은 화면 상태 전환이라 공용 Segmented(선택 표시가 미끄러진다) */}
            <Segmented
              options={PERIOD_CHIPS.map((c) => ({ value: c, label: c }))}
              value={period}
              onChange={setPeriod}
              ariaLabel="보유 기간"
              className="self-start"
            />
          </div>

          <div className="rounded-[14px] bg-bg p-3 text-center text-xs font-semibold text-text-3">
            {isReal
              ? "지역 평균 실시세 기준 · 30년 원리금균등 상환으로 자동 계산돼요"
              : "예시 시세 기준 · 지역을 선택하면 실제 평균가로 계산돼요"}
          </div>
        </div>

        {/* 결과 */}
        <div className="flex flex-col gap-4">
          <div className="rise-in-2 grid grid-cols-1 gap-3.5 md:grid-cols-3">
            <div className="card rounded-2xl p-[18px]">
              <div className="text-xs text-text-3">
                월 원리금 ({calc.rate.toFixed(2)}%)
                {isReal && (
                  <span className="ml-1 rounded border border-line px-1 py-px t-caption font-semibold">
                    실데이터 기준
                  </span>
                )}
              </div>
              <TweenNumber value={calc.pay / 10_000} format="eokmanwon" className="mt-1 block t-title text-ink" />
              <div className={`mt-0.5 inline-flex flex-wrap items-center gap-0.5 t-sub font-bold ${dsrTone(calc.dsr).cls}`}>
                소득 대비 {(calc.dsr * 100).toFixed(0)}% · {dsrTone(calc.dsr).label}
                <Explain
                  term="dsr"
                  title="소득 대비 상환 부담"
                  body="이 화면의 '소득 대비'는 이 대출 하나만 넣은 값이라 실제 DSR(모든 대출 합산)보다 낮게 나와요."
                  how={[
                    "소득 대비 = 이 대출의 1년 원리금(월 상환액 × 12) ÷ 연 소득",
                    "30% 이하 적정 · 40% 이하 주의 · 40% 넘으면 위험(대출 계산기와 같은 참고 기준)",
                    "30년 원리금균등 상환, 금리는 위에서 고른 값 그대로",
                  ]}
                />
              </div>
            </div>
            <div className="card rounded-2xl p-[18px]">
              <div className="text-xs text-text-3">금리 +1.0%p 시 월 원리금</div>
              <TweenNumber value={calc.payStress / 10_000} format="eokmanwon" className="mt-1 block t-title text-ink" />
              {/* [1009 · A] 오류색(text-danger)으로 칠하던 금액 → "지금 대비 ▲ 얼마" 로 무엇이 늘었는지 말한다 */}
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 t-sub">
                <Delta pct={pctChange(calc.payStress, calc.pay)} diffManwon={(calc.payStress - calc.pay) / 10_000} srContext="지금보다" />
                <span className="t-caption text-text-3">지금 대비</span>
              </div>
              <div className={`mt-0.5 t-sub font-bold ${dsrTone(calc.dsrStress).cls}`}>
                소득 대비 {(calc.dsrStress * 100).toFixed(0)}% · {dsrTone(calc.dsrStress).label}
              </div>
            </div>
            <div className="card rounded-2xl p-[18px]">
              <div className="text-xs text-text-3">
                시세 {pricePct === 0 ? "보합" : `${pricePct > 0 ? "+" : ""}${pricePct}%`} 시 자산 변화
              </div>
              {(() => {
                /* 등락 관례 — 오르면 빨강 ▲, 내리면 파랑 ▼(예전엔 오름을 테마색, 내림을 무색으로 칠했다) */
                const dir = deltaDir(pricePct);
                if (!dir || dir === "flat") return <div className="mt-1 t-title delta-flat">보합 · 0원</div>;
                return (
                  <div className={`mt-1 t-title ${DELTA_CLASS[dir]}`}>
                    <span aria-hidden="true">{DELTA_ARROW[dir]} </span>
                    <span className="sr-only">{DELTA_WORD[dir]} </span>
                    <TweenNumber value={Math.abs(calc.priceDeltaWon) / 10_000} format="eokmanwon" />
                  </div>
                );
              })()}
              <div className="mt-0.5 t-sub text-text-3">
                LTV {calc.ltvAfter.toFixed(0)}%로 {pricePct < 0 ? "상승" : "변동"} ·{" "}
                {calc.ltvAfter < 60 ? "안전권" : "주의"}
              </div>
            </div>
          </div>

          {/* 금리 스트레스 곡선 — 슬라이더에 실시간 반응하는 그림.
              [1009 · A] 누르고 끌면(마우스는 올리기만 해도) 그 금리의 월 상환액이 말풍선에 — 늘어나던 TrendChart 는
              390px 에서 축 글자가 찌그러졌고 값을 읽을 길이 없었다. */}
          <div className="chart-card text-primary" data-reveal="">
            <div className="chart-head">
              <span className="t-section text-ink">금리 스트레스 곡선</span>
              <span className="t-sub t-num text-primary">
                지금 {calc.rate.toFixed(2)}% · 월 <TweenNumber value={calc.pay / 10_000} format="eokmanwon" />
              </span>
              <span className="t-caption ml-auto text-text-3">
                −1.0%p ~ +3.0%p · 0.25%p 간격
              </span>
            </div>
            <ScrubLineLazy
              values={calc.curve.map((c) => Math.round(c.pay / 10_000))}
              labels={calc.curve.map((c) => `${c.rate.toFixed(2)}%`)}
              fullLabels={calc.curve.map((c) => `금리 ${c.rate.toFixed(2)}%`)}
              format="int"
              suffix="만원"
              height={150}
              tone="primary"
              ariaLabel="금리별 월 상환액 곡선"
            />
            <p className="t-sub text-text-2">
              {calc.breachRate === null ? (
                <>
                  +3.0%p 까지 올라도 소득 대비 40%를 넘지 않습니다(현재 조건 기준).
                </>
              ) : (
                <>
                  금리가 <b className="text-ink">{calc.breachRate.toFixed(2)}%</b> 를
                  넘어서면 소득 대비 40%(통상 부담 한계)를 지나갑니다. 지금은{" "}
                  {calc.rate.toFixed(2)}% 입니다.
                </>
              )}{" "}
              세로축은 월 상환액, 가로축은 연 금리예요 — 곡선을 누른 채 좌우로 움직이면 그 금리의 월 상환액이 나와요.
            </p>
          </div>

          <div className="card flex flex-col gap-3 rounded-[14px] p-4" data-reveal="">
            <div className="t-section text-ink">시나리오별 월 부담 비교</div>
            <div className="flex flex-col gap-2.5">
              {calc.bars.map((b) => (
                <div key={b.label} className="flex items-center gap-3">
                  <span className="w-[90px] shrink-0 text-xs text-text-2">{b.label}</span>
                  <div className="relative h-[22px] flex-1 rounded-md bg-bg">
                    <div
                      className="absolute left-0 flex h-[22px] items-center justify-end rounded-md pr-2 t-sub font-bold text-white transition-[width] duration-200 ease-out motion-reduce:transition-none"
                      style={{
                        width: `${Math.max(18, Math.round((b.pay / calc.maxPay) * 92))}%`,
                        background: b.color,
                      }}
                    >
                      {wonText(b.pay)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 보유기간 결과 — 3·5·10년 칩이 실제로 계산에 연결된 유일한 화면.
              (예전엔 칩을 눌러도 아무 숫자도 바뀌지 않았다.) */}
          <div className="rise-in-3 card flex flex-col gap-3 rounded-[18px] p-[22px]">
            <div className="t-section text-ink">
              {calc.holdYears}년 보유 시 상환 현황
              <span className="ml-2 t-sub font-semibold text-text-3">
                30년 원리금균등 · 금리 {calc.rate.toFixed(2)}% 고정 가정
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {/* [1009 · A] 입력이 바뀌면 이전 값에서 굴러간다 · 계산 결과는 "1억 2,000만원" 표준 표기 */}
              <div className="rounded-[10px] bg-bg px-2 py-3">
                <div className="t-sub text-text-3">갚은 원금</div>
                <TweenNumber value={calc.holdPrincipal / 10_000} format="eokmanwon" className="mt-1 block t-section break-words text-ink" />
              </div>
              <div className="rounded-[10px] bg-bg px-2 py-3">
                <div className="t-sub text-text-3">낸 이자 (누적)</div>
                <TweenNumber value={calc.holdInterest / 10_000} format="eokmanwon" className="mt-1 block t-section break-words text-ink" />
              </div>
              <div className="rounded-[10px] bg-bg px-2 py-3">
                <div className="t-sub text-text-3">잔여 원금</div>
                <TweenNumber value={calc.holdBalance / 10_000} format="eokmanwon" className="mt-1 block t-section break-words text-ink" />
              </div>
            </div>
          </div>

          <div className="rise-in-4 ai-panel flex flex-col gap-2 rounded-[18px] p-5 shadow-[0_14px_36px_rgba(16,28,54,.22)]">
            <div className="flex items-start gap-3">
              <span className="ai-chip h-[22px] w-[22px] shrink-0 rounded-[7px] t-sub">AI</span>
              <div className="flex-1 t-body text-ai-text">{aiComment}</div>
              <span className="shrink-0 rounded border border-on-dark-faint px-1.5 py-px t-caption font-bold text-ai-muted">
                규칙 기반 요약
              </span>
            </div>
            <div className="t-caption text-ai-muted">
              본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다.
            </div>
          </div>
        </div>

        {/* #411 — 도구 간 이어가기: 선택한 기준 지역 그대로 (미선택이면 링크만) */}
        <AnalysisCrossLinks
          current="scenario"
          regionLabel={
            regionId
              ? (REGION_OPTIONS.find((r) => r.id === regionId)?.label ?? null)
              : null
          }
          regionFor={
            regionId
              ? {
                  timing: regionId,
                  map:
                    REGION_OPTIONS.find((r) => r.id === regionId)
                      ?.label.split(" ")
                      .pop() ?? undefined,
                }
              : undefined
          }
          note={{ label: "이 조건 계산기로 정밀 계산", href: "/calculator" }}
        />
      </div>
    </PageShell>
  );
}
