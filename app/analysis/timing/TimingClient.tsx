"use client";
/* [1026 · 지역 시세] 1025 표준 — 머리 아래 절차 한 줄(지역 · {지역} → 신호 · 지수·거래량·온도 → 판단 · {온도 문구} → 다음 행동) ·
   결론 한 줄(t-title "{지역} 지수 ±x.xx% · 온도 N" + 판정 칩 = 온도 문구, 65+·35 미만은 주의) · 근거 t-sub(지수 pt · 대비 · 누적 · 추세) ·
   숫자 칸 4개(폰은 결론과 겹치지 않는 기간 누적 · 거래량 2칸) → 대표 그림(지수+거래량) → 온도 · 거래량 카드.
   본문 | 레일 340(다음 행동 카드: 지수 흐름 스파크 + 채움 파랑 "이 지역 알림 받기"(예전 "알림 설정" 흐린 버튼 — 같은 /notifications) +
   지도 · 노트 쓰기 · 결정 카드 텍스트 링크 · 이어서 분석). 폰은 같은 채움 파랑을 하단 바(MobilePrimaryBar)로. 이어서 칩의 파란
   "노트 쓰기"는 텍스트 링크로 옮겨 채움 파랑은 화면에 하나. 문장은 lib/market/region-conclusion(새 계산 없음). 지역 전환·캐시·신고 기한 규칙 그대로.
   [1023 · AI 분석] 머리 통일 — h1 t-display 손 마크업(.pxs-head) → 공용 PageHead(t-title). 본문은 그대로. */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
// 서버 전용 체인이 있는 모듈들 — 타입만 가져온다(컴파일에서 소거).
import type { TrendResult, MarketTemp } from "@/lib/market/temperature";
import type { RegionMonthlyVolumeRow } from "@/lib/market/store";
import { PageHead } from "@/app/components/PageHead";
import { StepLine } from "@/app/components/StepLine";
import type { HeroKpi } from "@/app/components/analysis/ToolHero";
import { Gauge } from "@/app/components/viz/Gauge";
import { Spark } from "@/app/components/viz/Spark";
import { CountUp } from "@/app/components/motion/CountUp";
import { SkBlock } from "@/app/components/ui/Skeleton";
import { Explain } from "@/app/components/explain/Explain";
import { Delta } from "@/app/components/num/Delta";
import { DELTA_ARROW, DELTA_BADGE_CLASS, DELTA_CLASS, DELTA_WORD, absPctText, deltaDir } from "@/lib/format/delta";
import { TEMPERATURE_EXPLAIN } from "../temperature-explain";
import { monthWord, reportingDeadlineLabel, volumeCompare } from "./volume-window";
import { TimingRegionSelect } from "./region-select";
import { TimingComplexPicker } from "./complex-picker";
import { TimingOverlayChart } from "./TimingOverlayChart";
import { AnalysisCrossLinks } from "../AnalysisCrossLinks";
import { pickRegionByAnyName } from "@/lib/regions/param";
import { regionActionLinks, timingConclusion, timingSteps } from "@/lib/market/region-conclusion";
import { RegionActionCard, RegionPrimaryBar, VerdictCard } from "./region-verdict";

/** [1026] 숫자 칸 — phone 이 false 면 폰에서 숨긴다(결론 한 줄과 같은 값) */
type TimingKpi = HeroKpi & { phone: boolean };

/**
 * [1021 · 지역 시세 price·timing] 시안(mock8/timing)대로 — 머리(아이콘·제목·출처 한 줄 + 지역 선택) → 타일 4칸(지금 값) →
 * 큰 그림 하나(지수 선 + 월 거래량 막대, TimingOverlayChart) → 아래 2열(시장 온도 **흰 카드** · 거래량 사실) → 오른쪽 레일
 * (이 지역 알림 · 이어서 칩). 국면 띠는 구간별 판정 함수가 없어(judgeTrend 는 최근 창 하나의 verdict) 넣지 않고 verdict 알약만,
 * "다른 지역과 나란히"는 이 화면에 비교 데이터가 없어 생략. 지역 전환·캐시·딥링크·신고 기한 비교 로직은 그대로.
 *
 * /analysis/timing 클라이언트 셸 (사용량 절감 13차 — ISR 전환의 클라이언트 절반).
 *
 * 서버(ISR)는 기본 지역 한 곳만 계산해 SSR 로 그린다. ?region= 은 마운트 후
 * location.search 에서 읽고, 지역 전환은 pushState + /api/timing(CDN 캐시)
 * 페치다 — auctions 와 같은 삼분할(ISR 기본 화면 + 캐시 API + 클라 상태).
 * 62개 지역 전량을 페이지에 실으면 재생성마다 124회 쿼리라 이 구조를 골랐다.
 *
 * 페치 실패는 "데이터 없음"과 구별해 그린다(0건이 아니라 조회 실패).
 */

export type TimingData = {
  trend: TrendResult | null;
  volume: RegionMonthlyVolumeRow[];
  temp: MarketTemp | null;
};

type RegionOption = { id: string; label: string };

function periodLabel(period: string): string {
  // "2025-07-01" → "25.07"
  const m = /^(\d{4})-(\d{2})/.exec(period);
  return m ? `${m[1].slice(2)}.${m[2]}` : period;
}

/** [1009 · A] 등락 KPI — ▲ 빨강·▼ 파랑·보합(±0.05% 미만), 숫자는 처음 볼 때 굴러 올라간다(CountUp).
    예전엔 "+0.12%"(부호만, 색 없음)라 오름·내림이 한눈에 안 갈렸다. */
function DeltaCount({ pct, decimals }: { pct: number; decimals: number }) {
  const dir = deltaDir(pct);
  if (!dir || dir === "flat") return <span className="delta-flat">보합</span>;
  return (
    <span className={DELTA_CLASS[dir]}>
      <span aria-hidden="true">{DELTA_ARROW[dir]} </span>
      <span className="sr-only">{DELTA_WORD[dir]} </span>
      <CountUp value={Math.abs(pct)} decimals={decimals} suffix="%" />
    </span>
  );
}

/** 이번 달 yyyymm — 서버 값으로 하이드레이션 후 마운트에서 재계산(월 경계 대비) */
function clientYyyymm(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * [D62] `?region=` 을 **어느 말로 와도** 내 지역 목록에서 찾는다.
 *
 * 예전에는 받은 문자열을 그대로 지역 id 로 믿고 /api/timing?region= 에 보냈다.
 * 그런데 지도·홈은 "서울 강남구"(한글 이름)를, 실거래 화면은 "서울-강남구"
 * (슬러그)를 쓴다 — 그 링크를 타고 오면 API 가 그런 id 를 모르니 빈 화면이
 * 떴다. 화면끼리 잇는 링크가 조용히 죽어 있던 자리다.
 *
 * 목록(regions)은 이미 이 컴포넌트가 prop 으로 들고 있으므로 새 의존이 없다.
 */
function readRegionFromLocation(fallback: string, regions: RegionOption[]): string {
  const raw = (new URLSearchParams(window.location.search).get("region") ?? "").trim();
  if (!raw) return fallback;
  return pickRegionByAnyName(raw, regions)?.id ?? fallback;
}

export function TimingClient({
  regions,
  defaultRegionId,
  initialData,
  builtYyyymm,
  builtAt,
}: {
  regions: RegionOption[];
  defaultRegionId: string;
  initialData: TimingData;
  builtYyyymm: string;
  /** [1009 · A · 리뷰] 서버가 그린 시각(ms) — 신고 기한 판정의 첫 기준(서버·첫 렌더가 같은 값), 마운트 뒤 지금 시각으로 */
  builtAt: number;
}) {
  const [regionId, setRegionId] = useState(defaultRegionId);
  const [data, setData] = useState<TimingData>(initialData);
  const [status, setStatus] = useState<"ok" | "loading" | "error">("ok");
  const [nowYm, setNowYm] = useState(builtYyyymm);
  const [nowAt, setNowAt] = useState(builtAt);
  /* 딥링크 ?complexId=/?apt= — SSR 은 없이 그리고, 마운트 후 읽어 피커를
     리마운트한다(initial* 는 마운트 시점에만 반영되므로 key 로 강제). */
  const [deep, setDeep] = useState<{ c: string | null; a: string | null }>({ c: null, a: null });
  const cache = useRef(new Map<string, TimingData>([[defaultRegionId, initialData]]));
  const reqSeq = useRef(0);

  const load = (id: string) => {
    const hit = cache.current.get(id);
    if (hit) {
      setData(hit);
      setStatus("ok");
      return;
    }
    const seq = ++reqSeq.current;
    setStatus("loading");
    fetch(`/api/timing?region=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { ok: boolean } & TimingData) => {
        if (seq !== reqSeq.current) return; // 뒤늦게 온 이전 요청은 버린다
        if (!j.ok) throw new Error("not_ok");
        const d = { trend: j.trend, volume: j.volume, temp: j.temp };
        cache.current.set(id, d);
        setData(d);
        setStatus("ok");
      })
      .catch(() => {
        if (seq !== reqSeq.current) return;
        setStatus("error");
      });
  };

  useEffect(() => {
    setNowYm(clientYyyymm());
    setNowAt(Date.now());
    const usp = new URLSearchParams(window.location.search);
    setDeep({ c: usp.get("complexId"), a: usp.get("apt") });
    const initial = readRegionFromLocation(defaultRegionId, regions);
    if (initial !== defaultRegionId) {
      setRegionId(initial);
      load(initial);
    } else if (!initialData.trend && !initialData.temp && initialData.volume.length === 0) {
      /* SSR 초깃값이 전부 빈 값이면 API 로 즉시 재조회 — 자기 회복.
         실측(2026-08-16): 강남 지수 94점·거래량 8개월이 DB 에 있는데도
         ISR 빌드/재생성이 빈 화면을 구웠고, 같은 계산을 하는 force-dynamic
         /api/timing 은 정상 응답했다. 원인(정적 생성 컨텍스트의 서비스 키)
         추적과 별개로, 사용자는 이 경로로 수백 ms 안에 실데이터를 본다.
         기본 지역에 정말 데이터가 없는 경우엔 API 도 같은 빈 값을 돌려주므로
         화면은 그대로 정직한 빈 상태다(추가 호출 1회는 CDN 30분 캐시). */
      cache.current.delete(defaultRegionId);
      load(defaultRegionId);
    }
    const onPop = () => {
      const id = readRegionFromLocation(defaultRegionId, regions);
      setRegionId(id);
      load(id);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectRegion = (id: string) => {
    if (id === regionId) return;
    setRegionId(id);
    window.history.pushState(
      null,
      "",
      id === defaultRegionId
        ? "/analysis/timing"
        : `/analysis/timing?region=${encodeURIComponent(id)}`,
    );
    load(id);
  };

  const selected = regions.find((r) => r.id === regionId) ?? regions[0];
  const { trend, volume, temp } = data;
  const loading = status === "loading";

  /* ── 차트 입력 ──────────────────────────────────────────────────────────
     예전엔 div 높이 %로 막대를 쌓고 색을 #1d4fd8 / #c9d4e5 로 박아 두었다.
     다크 모드에서 그 색이 그대로 나오고(토큰을 안 타서), 지수는 "선"이 아니라
     막대라 방향이 안 읽혔다. SVG 차트 컴포넌트로 옮기고 색은 currentColor 로
     계열 토큰을 타게 한다. */
  const idxValues = trend?.points.map((p) => p.value) ?? [];
  const idxLabels = trend?.points.map((p) => periodLabel(p.period)) ?? [];
  const weekly = trend?.periodType === "weekly";
  const maxVol = volume.reduce<{ month: string; count: number } | null>(
    (m, v) => (m === null || v.count > m.count ? { month: v.month, count: v.count } : m),
    null,
  );
  const volLabels = volume.map((v) => `${v.month.slice(2, 4)}.${v.month.slice(4)}`);
  /* [1009 · A · 리뷰] 등락은 신고가 끝난 달끼리만 — 신고 기한(말일 + 30일) 안의 달은 숫자만, "집계 중" */
  const vc = volumeCompare(volume, new Date(nowAt));
  const lastVol = vc.latest;
  const latestOpen = Boolean(lastVol && vc.open.some((o) => o.month === lastVol.month));
  const openWords = vc.open.map((o) => monthWord(o.month)).join("·");
  const openUntil = vc.open.length > 0 ? reportingDeadlineLabel(vc.open[vc.open.length - 1].month) : null;

  /* 첫 화면이 "제목 → 빈 카드"였다. 이 도구가 내는 숫자를 먼저 세운다.
     값이 없으면 그 칸은 **아예 만들지 않는다**(빈 칸을 "—"로 채우지 않는다). */
  const kpis: TimingKpi[] = [];
  if (trend) {
    kpis.push({
      label: weekly ? "지난주 대비" : "지난달 대비",
      value: <DeltaCount pct={trend.latestChangePct} decimals={2} />,
      note: `매매가격지수 · ${trend.points.length}구간 기준`,
      phone: false,
    });
    kpis.push({
      label: "기간 누적",
      value: <DeltaCount pct={trend.cumulativePct} decimals={1} />,
      note: `${idxLabels[0] ?? ""} 대비 ${idxLabels[idxLabels.length - 1] ?? ""}`,
      phone: true,
    });
  }
  if (temp) {
    kpis.push({
      label: "시장 온도",
      value: `${temp.score}/100`,
      note: temp.headline,
      aside: <Explain {...TEMPERATURE_EXPLAIN} size={12} />,
      phone: false,
    });
  }
  if (vc.closedLast) {
    kpis.push({
      label: `${monthWord(vc.closedLast.month)} 거래량`,
      value: <CountUp value={vc.closedLast.count} suffix="건" />,
      delta: vc.closedDeltaPct === null || !vc.closedPrev ? null : { pct: vc.closedDeltaPct, label: monthWord(vc.closedPrev.month) },
      note: openUntil ? `${openWords}은 집계 중 · ${openUntil}까지 신고` : "신고 기한이 지난 달끼리 비교",
      phone: true,
    });
  } else if (lastVol) {
    kpis.push({
      label: `${monthWord(lastVol.month)} 거래량`,
      value: <CountUp value={lastVol.count} suffix="건" />,
      note: openUntil ? `집계 중 · ${openUntil}까지 신고` : "",
      phone: true,
    });
  }

  const sourceLine = trend
    ? `한국부동산원 ${trend.periodType === "weekly" ? "주간" : "월간"} 매매가격지수 · 국토교통부 실거래 집계 · 규칙 기반 판정(참고용)`
    : "한국부동산원 지수 · 국토교통부 실거래 집계";
  const latestIdx = idxValues.length ? idxValues[idxValues.length - 1] : null;

  /* [1026] 절차 · 결론 — 화면이 이미 가진 값(trend · temp · 마지막 지수)만 문장으로 */
  const conclusionInput = {
    regionLabel: selected.label,
    latestChangePct: trend ? trend.latestChangePct : null,
    cumulativePct: trend ? trend.cumulativePct : null,
    weekly: Boolean(weekly),
    verdict: trend?.verdict ?? null,
    latestIndex: latestIdx !== null ? Math.round(latestIdx * 10) / 10 : null,
    tempScore: temp?.score ?? null,
    tempHeadline: temp?.headline ?? null,
  };
  const conclusion = timingConclusion(conclusionInput);
  const plan = timingSteps(conclusionInput, { index: Boolean(trend), volume: volume.length > 0, temp: Boolean(temp) });
  const mapRegion = selected.label.split(" ").pop() ?? selected.label;

  /* 레일 — 데스크톱은 오른쪽 고정, 폰은 본문 아래 한 열(같은 내용을 두 자리 중 한 곳에만 보인다) */
  const rail = (
    <>
      {/* [1026] 다음 행동 — 예전 "이 지역 알림" 카드(스파크 · /notifications)를 채움 파랑 + 텍스트 링크 3개로 */}
      <RegionActionCard
        regionLabel={selected.label}
        links={regionActionLinks(mapRegion, selected.label)}
        extra={
          trend ? (
            <span
              className={
                deltaDir(trend.cumulativePct) === "up" ? "text-up" : deltaDir(trend.cumulativePct) === "down" ? "text-down" : "text-text-3"
              }
            >
              <Spark values={idxValues} width={140} height={26} smooth />
            </span>
          ) : null
        }
      />
      {/* #411 — 도구 간 이어가기: 화면의 **현재 선택 지역** 그대로. [1026] 파란 "노트 쓰기" 칩은 다음 행동 카드의 텍스트 링크로 */}
      <AnalysisCrossLinks
        current="timing"
        regionLabel={selected.label}
        regionFor={{
          scenario: selected.id,
          map: mapRegion,
        }}
      />
    </>
  );

  return (
    <>
      {/* 머리 — 아이콘 칩 · 제목 · 출처 한 줄 | 단지로 찾기 · 지역 선택. [1023] 공용 PageHead(t-title) */}
      <PageHead
        icon="trending-up"
        title="시세·타이밍 분석"
        sub={sourceLine}
        subOnPhone
        actions={
          <>
            <TimingComplexPicker
              key={`${deep.c ?? ""}|${deep.a ?? ""}`}
              initialComplexId={deep.c}
              initialApt={deep.a}
              currentRegion={selected.id}
              onRegion={selectRegion}
            />
            <TimingRegionSelect options={regions} value={selected.id} disabled={loading} onChange={selectRegion} />
            {loading && (
              <span className="t-sub inline-flex min-h-[24px] items-center gap-1.5 font-bold text-primary">
                <span className="pulse-dot" style={{ color: "var(--brand-red)" }} />
                {selected.label} 불러오는 중
              </span>
            )}
          </>
        }
      />

      {/* [1026] 절차 한 줄 — 화면당 한 번 */}
      <StepLine className="mt-3" steps={plan.steps} current={plan.current} />

      {status === "error" ? (
        /* 조회 실패 — "데이터 없음"과 다른 사실이다. 캐시 API 실패는 no-store 라
           재시도가 의미 있다. */
        <div className="card mt-3 flex flex-col items-center gap-2 rounded-2xl p-8 text-center">
          <p className="t-section text-ink">{selected.label} 분석을 불러오지 못했어요</p>
          <p className="t-sub text-text-3">잠시 후 다시 시도해 주세요.</p>
          <button
            type="button"
            onClick={() => {
              cache.current.delete(selected.id);
              load(selected.id);
            }}
            className="btn-soft btn-md mt-1"
          >
            다시 시도
          </button>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
          <div className="flex min-w-0 flex-col gap-3">
            {/* [1026] 결론 한 줄 — 불러오는 동안은 이전 지역 값이 섞이지 않게 자리만 */}
            {loading ? <SkBlock h={76} /> : conclusion && <VerdictCard conclusion={conclusion} />}

            {/* 숫자 칸 4개 — 값이 있는 칸만. [1026] 폰은 결론과 겹치지 않는 칸만 */}
            {kpis.length > 0 && (
              <div className="pxs-tiles">
                {kpis.map((k) => (
                  <div key={k.label} className={k.phone ? "min-w-0" : "min-w-0 max-md:hidden"}>
                    <div className="kpi h-full">
                      <span className="kpi-k inline-flex items-center gap-0.5">
                        {k.label}
                        {k.aside}
                      </span>
                      <span className="kpi-v flex flex-wrap items-baseline gap-1.5">
                        {k.value}
                        {k.delta && (
                          <span className={`delta ${DELTA_CLASS[deltaDir(k.delta.pct) ?? "flat"]} ${DELTA_BADGE_CLASS[deltaDir(k.delta.pct) ?? "flat"]}`}>
                            {k.delta.label ? `${k.delta.label} 대비 ` : ""}
                            {(deltaDir(k.delta.pct) ?? "flat") === "flat" ? (
                              "보합"
                            ) : (
                              <>
                                <span aria-hidden="true">{DELTA_ARROW[deltaDir(k.delta.pct)!]}</span>
                                <span className="sr-only">{DELTA_WORD[deltaDir(k.delta.pct)!]}</span> {absPctText(k.delta.pct)}
                              </>
                            )}
                          </span>
                        )}
                      </span>
                      {k.note && <span className="kpi-d">{k.note}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── 대표 그림: 지수(선) + 월 거래량(막대) ── */}
            <div className="card flex flex-col gap-2.5 rounded-2xl p-4 max-md:p-3.5" data-reveal="">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="t-caption text-text-3">
                    {selected.label} · 지수(선){volume.length > 0 ? " + 거래량(막대)" : ""}
                  </span>
                  {latestIdx !== null && (
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="t-num t-display text-ink">
                        {(Math.round(latestIdx * 10) / 10).toLocaleString("ko-KR")}
                        <span className="t-sub font-bold text-text-3">pt</span>
                      </span>
                      {trend && <span className="chip chip-soft chip-pad t-caption">{trend.verdict}</span>}
                    </div>
                  )}
                </div>
                <div className="tmo-legend">
                  {trend && (
                    <span>
                      <i style={{ background: "var(--brand-red)" }} />
                      매매가격지수
                    </span>
                  )}
                  {volume.length > 0 && (
                    <>
                      <span>
                        <i style={{ background: "var(--primary)", opacity: 0.28 }} />월 거래량
                      </span>
                      <span>
                        <i style={{ background: "var(--primary)" }} />
                        최다 달
                      </span>
                    </>
                  )}
                </div>
              </div>
              {loading ? (
                <SkBlock h={220} />
              ) : trend || volume.length > 0 ? (
                <>
                  <TimingOverlayChart
                    key={selected.id}
                    index={trend?.points ?? []}
                    weekly={Boolean(weekly)}
                    volume={volume}
                    height={220}
                    ariaLabel={`${selected.label} 매매가격지수${volume.length > 0 ? "와 월별 매매 거래량" : ""}`}
                  />
                  {trend && <p className="t-sub text-text-1">{trend.detail}</p>}
                  <p className="t-caption text-text-3">
                    {trend ? `한국부동산원 ${weekly ? "주간" : "월간"} 아파트 매매가격지수 · 기준 시점 = 100` : ""}
                    {trend && volume.length > 0 ? " · " : ""}
                    {volume.length > 0 ? "국토교통부 실거래 신고 건수 · 가장 진한 막대 = 최다 거래월" : ""}
                    {nowYm && volume.some((v) => v.month >= nowYm) ? " · 마지막 칸은 진행 중인 달" : ""}
                  </p>
                </>
              ) : (
                /* [1026] 빈 상태 — 회색 견본(선 + 막대 윤곽) + 한 문장 */
                <div className="flex flex-col items-center gap-2 py-3">
                  <div aria-hidden="true" className="flex h-[88px] w-full max-w-[360px] items-end gap-2 border-b border-dashed border-line-strong">
                    {[30, 45, 38, 60, 52, 70, 48, 40].map((h, i) => (
                      <span key={i} className="block flex-1 rounded-sm border border-dashed border-line-strong" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                  <p className="t-sub text-text-3">{selected.label} 지수·거래량 기록 아직 없음</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {/* ── 시장 온도 — 흰 카드(예전 네이비 ai-panel) ── */}
              <section className="card flex flex-col gap-3 rounded-2xl p-4 max-md:p-3.5" data-reveal="">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="inline-flex items-center gap-0.5 t-section text-ink">
                    시장 온도
                    <Explain {...TEMPERATURE_EXPLAIN} size={12} />
                  </h2>
                  <span className="t-caption rounded border border-line px-1.5 py-px font-bold text-text-3">규칙 계산 · 공공데이터</span>
                </div>
                {loading ? (
                  <SkBlock h={120} />
                ) : temp ? (
                  <>
                    <div className="flex items-center gap-3 text-primary">
                      <Gauge value={temp.score} label={String(temp.score)} caption="100점 중 · 50이 중립" size={116} className="shrink-0" />
                      {/* [1028] 구간 이름 + 두 성분(50점에서 더하고 뺀 값) — 지수와 거래량이 엇갈릴 때 어느 쪽이 점수를 움직였는지 보인다 */}
                      <p className="t-sub min-w-0 flex-1 font-bold text-ink">
                        {temp.headline}
                        {temp.parts ? <span className="block t-caption font-normal text-text-3 tabular-nums">50 기준 · {temp.parts}</span> : null}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1">
                      {temp.inputs.map((s) => (
                        <div key={s.label} className="flex items-baseline justify-between gap-2 border-t border-divider pt-1.5 first:border-t-0 first:pt-0">
                          <span className="t-sub shrink-0 text-text-3">{s.label}</span>
                          <span className={`t-sub t-num text-right ${s.accent ? "text-primary" : "text-ink"}`}>{s.value}</span>
                        </div>
                      ))}
                    </div>
                    {temp.volumeNote && <p className="t-caption text-text-3">{temp.volumeNote}</p>}
                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      <Link href="/methodology#temperature" className="inline-flex min-h-[24px] items-center t-sub font-bold text-primary no-underline">
                        계산 공식 ›
                      </Link>
                      <Link
                        href={`/analysis/temperature/${selected.id}`}
                        className="inline-flex min-h-[24px] items-center t-sub font-bold text-primary no-underline"
                      >
                        주간 기록 ›
                      </Link>
                    </div>
                  </>
                ) : (
                  <p className="t-sub text-text-3">이 지역은 지수 시계열이 아직 없어 온도를 계산할 수 없어요.</p>
                )}
              </section>

              {/* ── 월 거래량 사실 — 신고 기한 규칙(1009 리뷰) 그대로 ── */}
              <section className="card flex flex-col gap-2 rounded-2xl p-4 max-md:p-3.5" data-reveal="">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="t-section text-ink">월 거래량</h2>
                  <span className="t-caption rounded border border-line px-1.5 py-px font-bold text-text-3">국토교통부 실거래</span>
                </div>
                {loading ? (
                  <SkBlock h={100} />
                ) : volume.length > 0 && lastVol ? (
                  <>
                    <div className="flex flex-col gap-1">
                      {vc.closedLast && (
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="t-sub text-text-3">{monthWord(vc.closedLast.month)} · 신고 마감</span>
                          <span className="inline-flex flex-wrap items-baseline justify-end gap-x-1.5">
                            <b className="t-num t-sub text-ink">{vc.closedLast.count.toLocaleString("ko-KR")}건</b>
                            {vc.closedDeltaPct !== null && vc.closedPrev && (
                              <span className="t-caption">
                                <Delta pct={vc.closedDeltaPct} srContext={`${monthWord(vc.closedPrev.month)}보다`} />{" "}
                                <span className="text-text-3">{monthWord(vc.closedPrev.month)} 대비</span>
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                      {latestOpen && (
                        <div className="flex items-baseline justify-between gap-2 border-t border-divider pt-1.5">
                          <span className="t-sub text-text-3">
                            {volLabels[volLabels.length - 1]} · 집계 중({reportingDeadlineLabel(lastVol.month)}까지 신고)
                          </span>
                          <b className="t-num t-sub text-ink">{lastVol.count.toLocaleString("ko-KR")}건</b>
                        </div>
                      )}
                      {maxVol && (
                        <div className="flex items-baseline justify-between gap-2 border-t border-divider pt-1.5">
                          <span className="t-sub text-text-3">가장 많았던 달 {`${maxVol.month.slice(2, 4)}.${maxVol.month.slice(4)}`}</span>
                          <b className="t-num t-sub text-primary">{maxVol.count.toLocaleString("ko-KR")}건</b>
                        </div>
                      )}
                    </div>
                    <p className="t-caption mt-auto text-text-3">
                      {openUntil
                        ? `${openWords}은 신고 기한 전(계약 후 30일 · ${openUntil}까지)이라 실제보다 적음 · 등락은 신고가 끝난 달끼리 비교`
                        : "모든 달이 신고 기한(계약 후 30일)을 지난 값"}
                    </p>
                  </>
                ) : (
                  <p className="t-sub text-text-3">월별 거래량 집계 아직 없음</p>
                )}
              </section>
            </div>

            {/* 폰 — 레일 내용을 본문 아래 한 열로 */}
            <div className="flex flex-col gap-3 lg:hidden">{rail}</div>
          </div>

          <aside className="hidden lg:flex lg:flex-col lg:gap-3 lg:sticky lg:top-[76px] lg:self-start">{rail}</aside>
        </div>
      )}

      {/* [1026] 폰 하단 바 — 레일의 채움 파랑과 같은 요소(화면에 한 번 · 조회 실패여도 알림은 받을 수 있다) */}
      <RegionPrimaryBar regionLabel={selected.label} />
    </>
  );
}
