"use client";
/* [1021 · 단지 분석 /analysis/ai] 단지 분석 4종(종합 진단·시세 예측·임장 동선·매수 타이밍)의 **대표 그림(signature) 카드**.
   소유자 지시: "단지 분석 4종에 각각의 특징을 담은 디자인" → 시안(mock8/diag·pred·insp·timing-ai)대로.
   규칙: 숫자는 있는 것만(verdict·insight·scenario·series) · 새 계산 없음(지금 대비 % 만 scenario 두 값의 비율) ·
   설명문 없음 · 색은 토큰만 · 굵기 700 까지. ResultView(next/dynamic 청크)가 가져간다 — 본체 번들에 싣지 않는다. */

import Link from "next/link";
import type { ReactNode } from "react";
import type { Verdict } from "@/lib/ai/verdict";
import type { ComplexTradeSeries } from "@/lib/ai/result-series";
import { SCENARIO_RULE, scenarioAssumptionLine, signedPct, type PriceScenario } from "@/lib/ai/price-scenarios";
import { formatKrwWon } from "@/lib/format/krw";
import { pctChange } from "@/lib/format/delta";
import { ScoreRadar } from "@/app/components/viz/ScoreRadar";
import { ScenarioFanChart } from "@/app/components/viz/ScenarioFanChart";
import { Sparkline } from "@/app/analysis/Sparkline";
import { Won } from "@/app/components/num/Won";
import { Explain } from "@/app/components/explain/Explain";
import { ymLabel } from "./VerdictCard";
import type { Insight, PickedLite, Similar } from "./workbench-types";

const BAND_TEXT: Record<string, string> = { strong: "좋음", mixed: "보통", weak: "주의", thin: "자료 부족" };

export function SigCard({ children, label, className = "" }: { children: ReactNode; label: string; className?: string }) {
  return (
    <section className={`card cxw-sig rounded-2xl p-4 md:p-5 ${className}`} aria-label={label}>
      {children}
    </section>
  );
}

/* ── 종합 진단 — 레이더(크게) + 큰 점수 + 결론 알약 + 축별 점수 행 ───────────────────────── */

function scoreTone(score: number): string {
  return score >= 70 ? "text-success" : score < 50 ? "text-warning" : "text-ink";
}

export function DiagnosisSignature({ verdict, radar, metricAside }: { verdict: Verdict | null; radar: Insight["radar"]; metricAside?: ReactNode }) {
  const m = verdict?.metric ?? null;
  return (
    <SigCard label="5가지 항목 점수">
      <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="cxw-radar">{radar.length >= 3 ? <ScoreRadar items={radar} /> : null}</div>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            {m ? (
              <span className="flex items-baseline gap-0.5">
                <b className="cxw-score font-bold tabular-nums text-ink">{m.value}</b>
                <span className="t-body font-bold text-text-3">{m.unit ?? ""}</span>
                {metricAside}
              </span>
            ) : null}
            {verdict && (
              <span className="verdict-band inline-flex items-center rounded-full px-2.5 py-0.5 t-sub font-bold" data-band={verdict.band}>
                {BAND_TEXT[verdict.band] ?? verdict.bandLabel}
              </span>
            )}
          </div>
          {verdict?.bandReason && <p className="t-sub text-text-2 break-words">{verdict.bandReason}</p>}
          {radar.length > 0 && (
            <ul className="mt-1 flex flex-col divide-y divide-line" data-tone="plain" aria-label="항목별 점수">
              {radar.map((a) => (
                <li key={a.key} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0 t-sub text-text-2 break-words">
                    <b className="font-bold text-ink">{a.label}</b> {a.basis}
                  </span>
                  <b className={`shrink-0 t-body font-bold tabular-nums ${a.score != null ? scoreTone(a.score) : "text-text-3"}`}>
                    {a.score != null ? a.score : "—"}
                  </b>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SigCard>
  );
}

/* ── 시세 예측 — 부채꼴 + N년 뒤 기본값 + 지금 대비 % + 기간 칩 · 해마다 표 · 가정 ───────────── */

const HORIZON_CHIPS: { months: string; years: number; label: string }[] = [
  { months: "12", years: 1, label: "1년" },
  { months: "36", years: 3, label: "3년" },
  { months: "60", years: 5, label: "5년" },
];

export function PredictionSignature({
  verdict,
  scenario,
  onHorizon,
}: {
  verdict: Verdict | null;
  scenario: PriceScenario | null;
  /** 기간 칩 — TuningForm 의 horizonMonths(기존 입력)를 바꾸고 다시 계산한다. 없으면 칩을 그리지 않는다 */
  onHorizon?: ((months: string) => void) | null;
}) {
  if (!scenario) {
    return (
      <SigCard label="시나리오">
        <p className="t-body font-bold text-text-1 break-words">{verdict?.headline ?? "시나리오를 그릴 자료가 없어요."}</p>
        {verdict?.bandReason && <p className="mt-1 t-sub text-text-2">{verdict.bandReason}</p>}
      </SigCard>
    );
  }
  const last = scenario.path[scenario.path.length - 1];
  const vs = pctChange(last.base, scenario.startKrw);
  return (
    <SigCard label={`앞으로 ${scenario.years}년, 세 가지 시나리오`}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <span className="t-caption text-text-3">기본 시나리오 · {scenario.years}년 뒤 · 가정 계산</span>
          <div className="flex flex-wrap items-center gap-2">
            <Won manwon={last.base / 10_000} unit="만" className="t-display text-ink" />
            {vs != null && (
              <span className="rounded-full bg-primary-soft px-2.5 py-0.5 t-sub font-bold tabular-nums text-primary">지금 대비 {signedPct(vs, 1)}</span>
            )}
          </div>
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 t-caption text-text-2" aria-label="시나리오별 연 변동률">
          <li className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-success" aria-hidden="true" />낙관 연 {signedPct(scenario.annual.opt)}</li>
          <li className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-primary" aria-hidden="true" />기본 연 {signedPct(scenario.annual.base)}</li>
          <li className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-warning" aria-hidden="true" />비관 연 {signedPct(scenario.annual.pess)}</li>
        </ul>
      </div>
      <div className="mt-2">
        <ScenarioFanChart startKrw={scenario.startKrw} path={scenario.path} />
      </div>
      {onHorizon && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="내다볼 기간">
          {HORIZON_CHIPS.map((c) => {
            const on = c.years === scenario.years;
            return (
              <button
                key={c.months}
                type="button"
                onClick={() => onHorizon(c.months)}
                aria-pressed={on}
                className={`chip press min-h-[40px] border px-3 t-sub font-bold ${on ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-text-1"}`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}
    </SigCard>
  );
}

export function ScenarioTables({ scenario, startLabel }: { scenario: PriceScenario; startLabel: string | null }) {
  const fmt = (n: number) => formatKrwWon(n, { style: "short" });
  const anchor =
    scenario.anchorKind === "yoy"
      ? `지역 매매지수 지난 1년 ${signedPct(scenario.anchorPct)}의 절반`
      : `지역 매매지수 최근 한 달 변화×12 ${signedPct(scenario.anchorPct)}의 절반`;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <section className="card rounded-2xl p-4" aria-label="해마다">
        <h3 className="t-body font-bold text-ink">해마다</h3>
        <table className="mt-2 w-full border-collapse t-sub">
          <thead>
            <tr className="t-caption text-text-3">
              <th scope="col" className="py-1 text-left font-medium">시점</th>
              <th scope="col" className="py-1 text-right font-medium">낙관</th>
              <th scope="col" className="py-1 text-right font-medium">기본</th>
              <th scope="col" className="py-1 text-right font-medium">비관</th>
            </tr>
          </thead>
          <tbody>
            {scenario.path.slice(1).map((p) => (
              <tr key={p.year} className="border-t border-line">
                <th scope="row" className="py-1.5 text-left font-bold text-ink">{p.year}년 뒤</th>
                <td className="py-1.5 text-right font-bold tabular-nums text-success">{fmt(p.opt)}</td>
                <td className="py-1.5 text-right font-bold tabular-nums text-primary">{fmt(p.base)}</td>
                <td className="py-1.5 text-right font-bold tabular-nums text-warning">{fmt(p.pess)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card rounded-2xl p-4" aria-label="가정">
        <h3 className="flex items-center gap-0.5 t-body font-bold text-ink">
          가정
          <Explain title="시나리오 가정" how={scenarioAssumptionLine(scenario)} source="공개 규칙 · 가정 계산" size={12} />
        </h3>
        <ul className="mt-2 flex flex-col divide-y divide-line" data-tone="plain">
          <li className="flex items-baseline justify-between gap-3 py-1.5 t-sub">
            <span className="text-text-1">출발점</span>
            <span className="text-right text-text-3 break-words">
              {scenario.startKind === "input" ? "내가 넣은 기준 가격" : `최근 실거래 평균${startLabel ? `(${startLabel})` : ""}`} {fmt(scenario.startKrw)}
              {scenario.startYm ? ` · ${ymLabel(scenario.startYm)}` : ""}
            </span>
          </li>
          <li className="flex items-baseline justify-between gap-3 py-1.5 t-sub">
            <span className="text-text-1">기본 속도</span>
            <span className="text-right text-text-3 break-words">{anchor} · 연 ±{SCENARIO_RULE.baseCapPct}% 이내</span>
          </li>
          <li className="flex items-baseline justify-between gap-3 py-1.5 t-sub">
            <span className="text-text-1">낙관 / 비관</span>
            <span className="text-right text-text-3">기본 ±{SCENARIO_RULE.spreadPct}%p</span>
          </li>
        </ul>
        <p className="mt-2 t-caption text-text-3">예측이 아니라 가정 계산</p>
      </section>
    </div>
  );
}

/* ── 임장 동선 — 순서 목록(번호 원 · 이름 · 있는 사실). 좌표가 없어 지도 카드는 그리지 않는다 ────── */

export function InspectionSignature({
  picked,
  similar,
  recent6,
  onPick,
}: {
  picked: PickedLite;
  similar: Similar[];
  /** 이 단지 최근 6개월 거래(result-series) — 없으면 줄을 비운다 */
  recent6: ComplexTradeSeries["recent6"] | null;
  onPick: (s: Similar) => void;
}) {
  const total = similar.length + 1;
  return (
    <SigCard label="하루 임장 순서">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div>
          <span className="t-caption text-text-3">오늘 코스</span>
          <div className="t-section font-bold text-ink">{total}곳 · 같은 지역 · 최근 6개월 거래 많은 순</div>
        </div>
        <Link href={`/map?complexId=${encodeURIComponent(picked.id)}`} className="inline-flex min-h-[24px] items-center t-sub font-bold text-primary no-underline">
          지도에서 위치 보기 ›
        </Link>
      </div>
      <ol className="mt-3 flex flex-col divide-y divide-line" data-tone="plain">
        <li className="flex items-center gap-3 py-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-red t-sub font-bold text-white">1</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <b className="break-words t-body font-bold text-ink">{picked.name}</b>
            <span className="t-caption text-text-3">
              출발{recent6 ? ` · 최근 6개월 ${recent6.count.toLocaleString("ko-KR")}건` : ""}
            </span>
          </span>
        </li>
        {similar.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3 py-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-navy t-sub font-bold text-on-dark">{i + 2}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="break-words t-body font-bold text-ink">{s.name}</b>
              <span className="t-caption tabular-nums text-text-3">최근 6개월 {s.txCount.toLocaleString("ko-KR")}건</span>
            </span>
            <button type="button" onClick={() => onPick(s)} className="btn-outline btn-md shrink-0 px-3 t-sub">
              이 단지 보기
            </button>
          </li>
        ))}
      </ol>
      {similar.length === 0 && <p className="mt-2 t-sub text-text-2">같은 지역에 함께 볼 거래 많은 단지가 아직 없어요.</p>}
    </SigCard>
  );
}

/* ── 매수 타이밍 — 종합 결론(점 3개 + headline + 알약) + 신호등 3개 카드 ────────────────────── */

type SignalState = Insight["signals"][number]["state"];
const SIG_WORD: Record<SignalState, string> = { green: "좋음", yellow: "보통", red: "주의", na: "자료 없음" };
const SIG_DOT: Record<SignalState, string> = { green: "bg-success", yellow: "bg-primary", red: "bg-warning", na: "bg-line" };
const SIG_PILL: Record<SignalState, string> = {
  green: "bg-success-soft text-success",
  yellow: "bg-primary-soft text-primary",
  red: "bg-warning-soft text-warning",
  na: "bg-bg text-text-3",
};
const SIG_TOP: Record<SignalState, string> = { green: "border-t-success", yellow: "border-t-primary", red: "border-t-warning", na: "border-t-line" };
const SIG_TEXT: Record<SignalState, string> = { green: "text-success", yellow: "text-primary", red: "text-warning", na: "text-text-3" };

/** 신호마다 작은 흐름선 재료 — 시계열이 있을 때만(result-series). 값이 2개 미만이면 그리지 않는다(Sparkline 규칙). */
function signalSeries(key: string, series: ComplexTradeSeries | null): number[] | null {
  if (!series) return null;
  if (key === "price") return series.months.map((m) => m.avgMan).filter((v): v is number => v != null);
  if (key === "volume") return series.months.map((m) => m.nAll);
  return null;
}

export function TimingSignature({ verdict, signals, series }: { verdict: Verdict | null; signals: Insight["signals"]; series: ComplexTradeSeries | null }) {
  return (
    <div className="flex flex-col gap-3">
      <SigCard label="종합 결론">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex shrink-0 gap-1.5" aria-hidden="true">
            {signals.map((s) => (
              <i key={s.key} className={`block h-5 w-5 rounded-full ${SIG_DOT[s.state]}`} />
            ))}
          </span>
          <div className="min-w-0 flex-1">
            <p className="t-section font-bold text-ink break-words" style={{ textWrap: "balance" }}>
              {verdict?.headline ?? "타이밍을 볼 자료가 아직 부족해요."}
            </p>
            {verdict?.bandReason && <p className="t-sub text-text-2 break-words">{verdict.bandReason}</p>}
          </div>
          {verdict && (
            <span className="verdict-band inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 t-sub font-bold" data-band={verdict.band}>
              {BAND_TEXT[verdict.band] ?? verdict.bandLabel}
            </span>
          )}
        </div>
      </SigCard>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="신호등 3개">
        {signals.map((s) => {
          const vals = signalSeries(s.key, series);
          return (
            <li key={s.key} className={`card flex flex-col gap-2 rounded-2xl border-t-4 p-4 ${SIG_TOP[s.state]}`}>
              <div className="flex items-center justify-between gap-2">
                <b className="t-body font-bold text-ink">{s.label}</b>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 t-caption font-bold ${SIG_PILL[s.state]}`}>
                  <i className={`h-1.5 w-1.5 rounded-full ${s.state === "na" ? "bg-text-3" : "bg-current"}`} aria-hidden="true" />
                  {SIG_WORD[s.state]}
                </span>
              </div>
              {vals && vals.length >= 2 && (
                <span className={`block w-full ${SIG_TEXT[s.state]}`}>
                  <Sparkline values={vals} width={220} height={44} className="h-11 w-full" />
                </span>
              )}
              <span className="t-caption text-text-2 break-words">{s.basis}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
