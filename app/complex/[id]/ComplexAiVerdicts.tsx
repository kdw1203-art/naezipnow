"use client";

/* [1210 · 34] 단지 화면 안 "AI 한 줄 판정" — 단지를 보면 바로 4가지(종합 진단 · 시세 예측 · 매수 타이밍 · 임장 동선) 판정 요약.
   예전엔 AI 분석 메뉴로 옮겨 가야 보였다. 판정은 규칙 판정(/api/ai/context?tools= · 외부 AI 호출 0 · 한도 차감 없음)이고
   컨텍스트는 한 번만 만든다(도구 4개를 한 요청에). 화면에 들어올 때만 받는다(ComplexAiVerdictsLazy).
   받지 못한 줄은 그리지 않는다(지어내지 않는다) — 하나도 없으면 칸 자체가 없다. 줄을 누르면 그 도구의 자세한 화면(같은 단지). */
import { useEffect, useState } from "react";
import Link from "@/app/components/IntentLink";
import { FRAME_TABS, frameTabHref } from "@/lib/ai/frame-tabs";

type Row = { id: string; label: string; bandLabel: string; band: string; headline: string };

/* lib/ai/outcome-band OutcomeBand — strong 좋음 · mixed 보통 · weak 주의 · thin 자료 부족 (OtherVerdicts 와 같은 표) */
const BAND_CLASS: Record<string, string> = {
  strong: "bg-success-soft text-success",
  mixed: "bg-primary-soft text-primary",
  weak: "bg-warning-soft text-warning",
  thin: "border border-line text-text-3",
};

export function ComplexAiVerdicts({ complexId, className = "" }: { complexId: string; className?: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  /* 뷰포트 근접 판정은 ComplexAiVerdictsLazy(use-near-viewport)가 한다 — 마운트되면 곧 보이는 자리. 자동화 브라우저는 부르지 않는다 */
  const inView = typeof navigator === "undefined" || !navigator.webdriver;

  useEffect(() => {
    if (!inView || !complexId) return;
    let alive = true;
    const ids = FRAME_TABS.map((t) => t.id).join(",");
    fetch(`/api/ai/context?complexId=${encodeURIComponent(complexId)}&tools=${ids}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        const vs = (j?.ok ? j.verdicts : null) as Record<string, { headline?: unknown; bandLabel?: unknown; band?: unknown } | null> | null;
        const list: Row[] = [];
        for (const t of FRAME_TABS) {
          const v = vs?.[t.id];
          if (!v || typeof v.headline !== "string" || !v.headline.trim()) continue;
          list.push({ id: t.id, label: t.label, bandLabel: String(v.bandLabel ?? ""), band: String(v.band ?? "mixed"), headline: v.headline });
        }
        setRows(list);
      })
      .catch(() => {
        if (alive) setRows([]);
      });
    return () => {
      alive = false;
    };
  }, [inView, complexId]);

  if (!inView || (rows !== null && rows.length === 0)) return null;
  return (
    <div className={className}>
      {rows === null ? (
        <div className="card h-[120px] animate-pulse rounded-2xl" aria-hidden="true" />
      ) : (
        <section className="card rounded-2xl p-[var(--pad-card)]" aria-labelledby="complex-ai-verdicts-h">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="complex-ai-verdicts-h" className="t-section text-ink">
              AI 한 줄 판정
            </h2>
            <span className="t-caption text-text-3">실거래 · 규칙 판정 · 참고용</span>
          </div>
          <ul className="mt-1.5 flex flex-col">
            {rows.map((r) => (
              <li key={r.id} className="border-t border-divider first:border-t-0">
                <Link href={frameTabHref(r.id, complexId)} prefetch={false} className="press flex min-h-[48px] items-center gap-3 py-2 no-underline">
                  <span className="w-[72px] shrink-0 t-sub font-bold text-ink">{r.label}</span>
                  {r.bandLabel && (
                    <span className={`chip shrink-0 px-2 py-0.5 t-caption font-bold ${BAND_CLASS[r.band] ?? BAND_CLASS.mixed}`}>{r.bandLabel}</span>
                  )}
                  <span className="min-w-0 flex-1 truncate t-sub text-text-2">{r.headline}</span>
                  <span className="shrink-0 t-sub text-text-3" aria-hidden="true">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default ComplexAiVerdicts;
