"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Verdict } from "@/lib/ai/verdict";
import { CONFIDENCE_LABEL } from "@/lib/ai/insight-blocks";

/* ============================================================
   [993] 판단 카드 — AI 분석의 **결과값**을 한 형식으로.

   위 → 아래로: 구간 배지 + 규칙 한 줄 결론 → 대표 수치(크게) + 핵심 숫자 3개(각각
   기준일) → 근거 칩(출처·기준일·표본 주의, 접지 않는다) → 반대 조건(접힘).
   숫자는 전부 서버(lib/ai/verdict.ts)가 실데이터에서 조립한 것이고, 여기서는 그리기만
   한다 — 이 컴포넌트는 값을 계산하지 않는다(번들 예산·단일 출처).
   ============================================================ */

function ymLabel(asOf: string | null): string | null {
  if (!asOf) return null;
  if (/^\d{6}$/.test(asOf)) return `${asOf.slice(0, 4)}.${asOf.slice(4)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(asOf)) return asOf.slice(0, 10).replace(/-/g, ".");
  return asOf;
}

export function VerdictCard({
  verdict,
  toneLine,
  compact = false,
  extraChips,
}: {
  verdict: Verdict;
  /** 도구 말투 한 줄(persona.tone[band]) — 결론 아래 보조 문장 */
  toneLine?: string | null;
  /** 실행 전 미리보기(입력 카드 안) — 배지·결론·대표 수치만 */
  compact?: boolean;
  /** [996] 근거 칩 줄 끝에 붙는 칩(내 임장노트) — 개인 데이터라 카드 밖에서 따로 받아 넘긴다 */
  extraChips?: ReactNode;
}) {
  const m = verdict.metric;
  const metricAsOf = ymLabel(m?.asOf ?? null);
  return (
    <section
      className="verdict flex flex-col gap-3"
      data-band={verdict.band}
      aria-label="판단 카드"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="verdict-band rounded-md px-2 py-0.5 t-caption font-extrabold tracking-wider" data-band={verdict.band}>
          {verdict.bandLabel}
        </span>
        <span className="t-caption text-text-3">
          규칙 계산{metricAsOf ? ` · 기준 ${metricAsOf}` : ""}
        </span>
      </div>
      <p className="t-section text-ink" style={{ textWrap: "balance" }}>
        {verdict.headline}
      </p>
      {toneLine && !compact && <p className="t-sub text-text-2">{toneLine}</p>}

      <div className={`grid gap-2 ${m ? "grid-cols-1 sm:grid-cols-[minmax(150px,1fr)_2fr]" : "grid-cols-1"}`}>
        {m && (
          <div className="verdict-metric rounded-[12px] px-3.5 py-3">
            <div className="t-caption font-extrabold text-text-3">{m.label}</div>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="t-display tabular-nums text-ink">{m.value}</span>
              {m.unit && <span className="t-body font-bold text-text-2">{m.unit}</span>}
            </div>
            {m.note && <div className="mt-0.5 t-caption text-text-3">{m.note}</div>}
          </div>
        )}
        {!compact && verdict.numbers.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {verdict.numbers.map((n) => (
              <div key={n.key} className="rounded-[12px] bg-bg px-3 py-2.5">
                <div className="truncate t-caption font-bold text-text-3">{n.label}</div>
                <div className="mt-0.5 t-body font-extrabold tabular-nums text-ink">{n.value}</div>
                <div className="t-caption text-text-3">
                  {ymLabel(n.asOf) ?? "시점 없음"}
                  {n.confidence !== "ok" && (
                    <span className="ml-1 rounded bg-warning-soft px-1 py-px font-extrabold text-warning">
                      {CONFIDENCE_LABEL[n.confidence]}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!compact && (verdict.evidence.length > 0 || extraChips) && (
        <div className="flex flex-wrap gap-1.5" aria-label="근거">
          {verdict.evidence.map((e) => (
            <span
              key={e.label}
              className="inline-flex min-h-[28px] items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-0.5 t-caption text-text-2"
              title={`${e.source}${e.sample != null ? ` · 표본 ${e.sample}건` : ""}`}
            >
              <b className="font-extrabold text-text-1">{e.label}</b>
              {ymLabel(e.asOf) && <span>{ymLabel(e.asOf)}</span>}
              {e.confidence !== "ok" && (
                <span className="font-extrabold text-warning">{CONFIDENCE_LABEL[e.confidence]}</span>
              )}
              {e.href && (
                <Link
                  href={e.href}
                  className="inline-flex min-h-[24px] min-w-[28px] items-center justify-center px-1 font-bold text-primary no-underline"
                >
                  원본
                </Link>
              )}
            </span>
          ))}
          {extraChips}
        </div>
      )}

      {!compact && verdict.counters.length > 0 && (
        <details className="rounded-[10px] bg-bg px-3.5 py-2.5">
          <summary className="cursor-pointer t-sub font-extrabold text-text-2">
            이 판단이 틀리는 조건 {verdict.counters.length}가지
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1">
            {verdict.counters.map((c, i) => (
              <li key={i} className="t-sub text-text-2">· {c}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
