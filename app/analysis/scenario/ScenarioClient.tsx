"use client";
/* [1026b · 시나리오·비교] 1025 표준 — 머리(PageHead) 아래 절차 한 줄(조건 · {대상} · 대출 N% → 시나리오 · 금리 · 시세 · 보유 → 결과 · 월 상환 →
   다음 행동) · 결론 한 줄(t-title "월 상환 164만원 · 금리 +1%p 시 184만원" + 판정 칩 "소득 대비 28% 적정" · 근거 = 지금 대비 · N년 보유 이자 ·
   잔여 원금) · 대표 그림(금리 스트레스 곡선)을 결론 바로 아래 · 손잡이(조건 · 시나리오 두 카드)는 데스크톱 레일 / 폰 결론·그림 아래 접이식
   (자리 하나만 마운트 — useDesktop) · 세부(결과 세 칸 · 월 부담 비교 · 보유 현황 · AI 코멘트) · 다음 행동 카드(채움 파랑 "살까, 빌릴까 계산"
   + 결정 카드 · 이 지역 알림 · 지도) · 폰 하단 바(같은 요소). 이어서 칩의 파란 "이 조건 계산기로 정밀 계산"은 걷었다(채움 파랑 하나).
   번들: 손잡이·세부는 next/dynamic(ScenarioLazy.tsx) — 494KB → 첫 묶음에서 단지 검색 · 지역 목록 · ⓘ 사전 · 등락 표기 · Segmented ·
   TweenNumber 가 빠진다. 계산은 lib/market/scenario-calc(예전 useMemo 본문 그대로) · 문장은 lib/market/scenario-conclusion(새 계산 없음).
   [1023 · AI 분석] "실데이터 기준" 부연 라벨 2곳 제거 · AI 코멘트 판 네이비 → 흰 카드·잉크 토큰. */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ScrubLineLazy } from "@/app/components/viz/ScrubLineLazy";
import { StepLine } from "@/app/components/StepLine";
import { PageHead } from "@/app/components/PageHead";
import { Icon } from "@/app/components/Icon";
import { MobilePrimaryBar } from "@/app/components/MobilePrimaryBar";
import { PageShell } from "../../components/PageShell";
import { SimulationNotice } from "../../components/ExampleBadge";
import type { PickedComplex } from "../ComplexPicker";
import { AnalysisCrossLinks } from "../AnalysisCrossLinks";
import { VerdictCard } from "../timing/region-verdict";
import { useCopy } from "@/lib/ui/use-copy";
import { EXAMPLE_PRICE_WON, computeScenario } from "@/lib/market/scenario-calc";
import {
  SCENARIO_PRIMARY,
  scenarioActionLinks,
  scenarioConclusion,
  scenarioConditionLine,
  scenarioSteps,
  scenarioWon,
} from "@/lib/market/scenario-conclusion";
import { ControlsShell, ScenarioControlsLazy, ScenarioDetailsLazy } from "./ScenarioLazy";
import { useDesktop } from "./use-desktop";

/* ============================================================
   시장·대출 시나리오 — 기준 시세를 지역 실데이터(스냅샷 평균가)로 프리필.
   지역 미선택/데이터 미보유 시 기존 예시 수치로 동작 (graceful).
   계산은 전부 클라이언트 (30년 원리금균등 상환 기준 · lib/market/scenario-calc).

   [1009 · A] 토스 계산기 관례로 다듬었다(2026-09-22 실측) — 결과 숫자 TweenNumber · 등락 ▲ 빨강 ▼ 파랑 · 부담 판정 상태색 ·
   금액 "3억 3,600만원" 표준 · 금리 스트레스 곡선 ScrubLine · 소득 대비·대출 비율 ⓘ. (세부 카드는 ScenarioDetails · 손잡이는 ScenarioControls)
   ============================================================ */

/* 기준금리 기본값 — 고정 사실이 아니라 사용자가 자기 조건으로 바꾸는 입력값.
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

type Baseline = {
  regionName: string;
  period: string;
  source: string;
  avgSaleWon: number;
  avgSaleLabel: string;
  jeonseRatio: number | null;
};

/** 지역 목록(seoul-districts)은 첫 묶음에 싣지 않는다 — 필요할 때 한 번 받아 둔다 */
const loadRegions = () => import("./scenario-regions");

export default function ScenarioClient({ rates }: { rates: RateContext }) {
  /* 기본 금리: 시중 주담대 변동 중앙값(실공시) > 정적 가정값 순.
     정책금리(기준금리)는 대출금리가 아니므로 기본값으로 쓰지 않는다 — 참고로만 보여준다. */
  const defaultRate = rates.mortgageMedian ?? FALLBACK_BASE_RATE;
  const [rateOffset, setRateOffset] = useState(0);
  const [pricePct, setPricePct] = useState(0);
  const [period, setPeriod] = useState("5년");
  /* 실입력 3종 — 예전엔 소득 7,000만·LTV 40%가 고정이었고 슬라이더는 그림이었다. */
  const [incomeManwon, setIncomeManwon] = useState(7000);
  const [ltvPct, setLtvPct] = useState(40);
  const [baseRate, setBaseRate] = useState(defaultRate);
  const [regionId, setRegionId] = useState("");
  /** 고른 지역의 표기("서울 강남구") — 지역 목록을 지연으로 읽어 채운다 */
  const [regionLabel, setRegionLabel] = useState<string | null>(null);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [loadingBaseline, setLoadingBaseline] = useState(false);
  /* [1026b] 폰 손잡이 접이식 · 손잡이를 그릴 자리(데스크톱 레일 / 폰 접이식 중 하나만) */
  const [panelOpen, setPanelOpen] = useState(false);
  const desktop = useDesktop();

  /* [975] 단지 선택은 검색·지도 두 길이 같은 함수로 모인다(ScenarioControls 안의 검색·지도 모두 이 함수). */
  const onComplex = useCallback((c: PickedComplex) => {
    setPickedName(c.name);
    if (c.regionId) setRegionId(c.regionId);
  }, []);

  // 딥링크 ?region=·?ltv=·?income=·?rate= 초기 반영 (?complexId=/?apt= 는 ComplexPicker가 처리)
  // ltv/income/rate 는 /calculator "이 조건으로 시나리오 보기"가 현재 조건을 넘겨주는 통로.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    /* [D62] 지역은 어느 말로 와도 받는다 — 지도·홈은 "서울 강남구", 실거래 화면은 "서울-강남구", 여기 목록은 "gangnam".
       [1026b] 목록은 지연으로 읽는다 — 그 사이 단지 딥링크가 지역을 먼저 정했으면 덮지 않는다. */
    const r = sp.get("region");
    if (r) {
      void loadRegions().then((m) => {
        const id = m.regionIdFromParam(r);
        if (id) setRegionId((prev) => prev || id);
      });
    }
    /* 파라미터가 **없을 때** 0 으로 읽히던 버그 수리 (2026-08-27 실측) — Number(null) === 0 이라 대출 비율이 40% → 0% 로 덮였다.
       숫자로 바꾸기 전에 "값이 실제로 왔는지"를 먼저 본다. */
    const num = (key: string): number | null => {
      const raw = sp.get(key);
      if (raw === null || raw.trim() === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };
    const ltv = num("ltv");
    if (ltv !== null && ltv >= 0 && ltv <= 100) setLtvPct(Math.min(70, Math.round(ltv / 5) * 5)); // 슬라이더 step=5에 맞춰 반올림
    const income = num("income");
    if (income !== null && income >= 100 && income <= 100_000) setIncomeManwon(Math.round(income));
    const rate = num("rate");
    if (rate !== null && rate >= 0.5 && rate <= 15) setBaseRate(rate);
    /* [AI-27] 공유 링크 복원 — price(가격 변동%)·offset(금리 오프셋) */
    const price = num("price");
    if (price !== null && price >= -30 && price <= 30) setPricePct(price);
    const offset = num("offset");
    if (offset !== null && offset >= -3 && offset <= 3) setRateOffset(offset);
  }, []);

  /* 지역 표기(이어서 분석 · 지도 링크) — 목록을 지연으로 읽어 채운다 */
  useEffect(() => {
    if (!regionId) {
      setRegionLabel(null);
      return;
    }
    let cancelled = false;
    void loadRegions().then((m) => {
      if (!cancelled) setRegionLabel(m.regionLabelOf(regionId));
    });
    return () => {
      cancelled = true;
    };
  }, [regionId]);

  /* [AI-27] 시나리오 공유 — 현재 입력 세트를 URL로. 열람은 로그인 불필요.
     [966] 복사·토스트·"복사됨" 지속 시간은 useCopy(공용). */
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
        const res = await fetch(`/api/ai/market-baseline?regionId=${encodeURIComponent(regionId)}`);
        const data = (await res.json().catch(() => null)) as ({ available?: boolean } & Baseline) | null;
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

  const calc = useMemo(
    () => computeScenario({ loanWon, priceWon, rateOffset, pricePct, incomeWon, baseRate, period }),
    [loanWon, priceWon, rateOffset, pricePct, incomeWon, baseRate, period],
  );

  /* [1026b] 절차 · 결론 · 다음 행동 — 화면이 이미 가진 값만(lib/market/scenario-conclusion) */
  const target = pickedName ?? (isReal ? baseline.regionName : "예시 8.4억");
  const plan = scenarioSteps({ target, ltvPct, rateOffset, pricePct, period, pay: calc.pay });
  const conclusion = scenarioConclusion(calc, pricePct);
  const mapRegion = regionLabel ? (regionLabel.split(" ").pop() ?? null) : null;
  const links = scenarioActionLinks(mapRegion);

  /* 손잡이 — 자리 하나만(데스크톱 레일 / 폰 접이식). 대상·출처 줄은 예전 표기 그대로 */
  const controls = (
    <ScenarioControlsLazy
      rates={rates}
      regionId={regionId}
      onRegion={setRegionId}
      onComplex={onComplex}
      loadingBaseline={loadingBaseline}
      isReal={isReal}
      targetText={
        isReal
          ? `${pickedName ? `${pickedName} · ` : ""}${baseline.regionName} 평균 · ${baseline.avgSaleLabel}`
          : `${pickedName ? `${pickedName} · ` : "예시 시세 · "}8.4억`
      }
      sourceText={
        isReal
          ? `${baseline.source.toUpperCase()} · ${baseline.period} 기준${baseline.jeonseRatio !== null ? ` · 전세가율 ${baseline.jeonseRatio.toFixed(0)}%` : ""}`
          : null
      }
      ltvPct={ltvPct}
      setLtvPct={setLtvPct}
      incomeManwon={incomeManwon}
      setIncomeManwon={setIncomeManwon}
      baseRate={baseRate}
      setBaseRate={setBaseRate}
      cashWon={cashWon}
      rateOffset={rateOffset}
      setRateOffset={setRateOffset}
      pricePct={pricePct}
      setPricePct={setPricePct}
      period={period}
      setPeriod={setPeriod}
    />
  );

  /* 채움 파랑 — 화면의 주 행동 하나. 데스크톱 레일 카드(lg+)와 폰 하단 바가 이 요소를 나눠 그린다 */
  const primary = (
    <Link href={SCENARIO_PRIMARY.href} className="btn-primary btn-md press w-full gap-1.5 no-underline">
      <Icon name="calculator" size={16} />
      {SCENARIO_PRIMARY.label}
    </Link>
  );

  /* 다음 행동 카드 — 데스크톱 레일 · 폰 본문 끝(채움 파랑은 하단 바가 맡아 카드 안에서는 lg 에서만) */
  const actionCard = (
    <section className="card flex flex-col gap-2 rounded-2xl p-4 max-md:p-3.5" aria-label="다음 행동">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h2 className="t-section text-ink">다음 행동</h2>
        <span className="min-w-0 t-caption tabular-nums text-text-3">
          월 {scenarioWon(calc.pay)} · 필요 현금 {scenarioWon(cashWon)}
        </span>
      </div>
      <div className="hidden lg:block">{primary}</div>
      <ul className="m-0 flex list-none flex-col divide-y p-0" data-tone="plain" aria-label="이어서 할 일">
        {links.map((l) => (
          <li key={l.label}>
            <Link href={l.href} className="flex min-h-10 items-center justify-between gap-2 t-sub font-bold text-primary no-underline">
              {l.label}
              <span aria-hidden="true">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <PageShell breadcrumb="분석 › 시장·대출 시나리오">
      <div className="nz-dot-blue mx-auto w-full max-w-[1200px]">
        <PageHead
          icon="calculator"
          title="시장·대출 시나리오"
          sub={`30년 원리금균등 · ${isReal ? `${baseline.regionName} 평균 매매가 ${baseline.avgSaleLabel}` : "예시 시세 8.4억"}`}
          actions={
            /* [AI-27] 현재 조건 세트를 URL로 공유 */
            <button
              type="button"
              onClick={copyShareLink}
              className="press min-h-[40px] rounded-lg border border-line-strong bg-surface px-3 py-1.5 t-sub font-bold text-text-1"
            >
              {shareCopied ? "링크 복사됨 ✓" : "이 조건 공유"}
            </button>
          }
        />
        {!isReal && (
          <div className="mt-2">
            <SimulationNotice />
          </div>
        )}

        {/* [1026b] 절차 한 줄 — 화면당 한 번 */}
        <StepLine className="mt-3" steps={plan.steps} current={plan.current} />

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
          <div className="flex min-w-0 flex-col gap-3">
            {/* [1026b] 결론 한 줄 — 조건·시나리오를 바꾸면 바로 바뀐다 */}
            <VerdictCard conclusion={conclusion} />

            {/* 대표 그림 — 금리 스트레스 곡선(누르고 끌면 그 금리의 월 상환액) */}
            <section className="card flex flex-col gap-2.5 rounded-2xl p-4 text-primary max-md:p-3.5" aria-label="금리 스트레스 곡선">
              <div className="chart-head">
                <h2 className="t-section text-ink">금리 스트레스 곡선</h2>
                <span className="t-sub t-num text-primary">
                  지금 {calc.rate.toFixed(2)}% · 월 {scenarioWon(calc.pay)}
                </span>
                <span className="t-caption ml-auto text-text-3">−1.0%p ~ +3.0%p · 0.25%p 간격</span>
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
              <p className="m-0 t-sub text-text-2">
                {calc.breachRate === null ? (
                  <>+3.0%p 까지 올라도 소득 대비 40%를 넘지 않습니다(현재 조건 기준).</>
                ) : (
                  <>
                    금리가 <b className="text-ink">{calc.breachRate.toFixed(2)}%</b> 를 넘어서면 소득 대비 40%(통상 부담 한계)를 지나갑니다. 지금은{" "}
                    {calc.rate.toFixed(2)}% 입니다.
                  </>
                )}
              </p>
            </section>

            {/* 손잡이(폰) — 결론·그림 아래 접이식. lg 는 오른쪽 레일 */}
            <div className="lg:hidden">
              <button
                type="button"
                onClick={() => setPanelOpen(!panelOpen)}
                aria-expanded={panelOpen}
                aria-controls="scenario-panel"
                className="card flex min-h-10 w-full items-center justify-between gap-2 rounded-2xl px-3.5 py-2 text-left"
              >
                <span className="min-w-0 t-sub font-bold text-ink">
                  조건 · 시나리오
                  <span className="ml-1 font-medium text-text-3">{scenarioConditionLine({ ltvPct, incomeManwon, baseRate })}</span>
                </span>
                <span aria-hidden="true" className={`shrink-0 text-text-3 transition-transform ${panelOpen ? "rotate-90" : ""}`}>
                  ›
                </span>
              </button>
              <div id="scenario-panel" className={panelOpen ? "mt-3 flex flex-col gap-3" : "hidden"}>
                {desktop === false && controls}
              </div>
            </div>

            {/* 세부 — 결과 세 칸 · 월 부담 비교 · 보유 현황 · AI 코멘트(면책) */}
            <ScenarioDetailsLazy
              calc={calc}
              pricePct={pricePct}
              baseline={baseline}
              incomeManwon={incomeManwon}
              ltvPct={ltvPct}
            />

            {/* 폰 — 다음 행동 카드는 본문 끝(레일은 lg 부터) */}
            <div className="lg:hidden">{actionCard}</div>
            {/* #411 — 도구 간 이어가기: 선택한 기준 지역 그대로 (미선택이면 링크만). [1026b] 파란 "계산기" 칩은 걷었다(채움 파랑 하나).
                데스크톱에서도 본문 끝 — 레일(조건 · 시나리오 · 다음 행동)이 이미 길다 */}
            <AnalysisCrossLinks
              current="scenario"
              regionLabel={regionLabel}
              regionFor={regionId ? { timing: regionId, map: mapRegion ?? undefined } : undefined}
            />
          </div>
          {/* 레일(lg+) — 손잡이(조건 · 시나리오) + 다음 행동. 손잡이가 길어 sticky 는 걸지 않는다(아래 카드가 화면 밖에 갇히지 않게) */}
          <aside className="hidden lg:flex lg:flex-col lg:gap-3" aria-label="조건과 다음 행동">
            {desktop === true ? controls : desktop === null ? <ControlsShell /> : null}
            {actionCard}
          </aside>
        </div>
        {/* [1026b] 폰 하단 바 — 레일의 채움 파랑과 같은 요소(화면에 한 번) */}
        <MobilePrimaryBar label={SCENARIO_PRIMARY.label}>{primary}</MobilePrimaryBar>
      </div>
    </PageShell>
  );
}
