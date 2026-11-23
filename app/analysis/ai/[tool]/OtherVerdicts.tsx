"use client";

/* [1209 · AI 분석 고도화 · 단순화] 소유자 "복잡하고 기능이 너무 많다는 의견이 다수" — 단지 하나를 고르면 4가지(종합 진단 · 시세 예측 ·
   매수 타이밍 · 임장 동선) 판정을 **한 화면에서 한 줄씩** 본다. 예전엔 탭을 하나씩 눌러 옮겨 가며 같은 단지를 네 번 열어야 했다.
   판정은 실행 없이 나오는 규칙 판정(/api/ai/context 의 verdict · 외부 AI 호출 0 · 한도 차감 없음)이라 미리 받아도 비용이 들지 않는다.
   줄을 누르면 그 도구의 자세한 화면으로(같은 단지). 지금 보는 도구는 빼고 셋만. 받지 못한 줄은 그리지 않는다(지어내지 않는다). */
import { useEffect, useState } from "react";
import Link from "@/app/components/IntentLink";
import { FRAME_TABS, frameTabHref } from "@/lib/ai/frame-tabs";

type Row = { id: string; label: string; bandLabel: string; band: string; headline: string; reason: string | null };

/* lib/ai/outcome-band OutcomeBand — strong 좋음 · mixed 보통 · weak 주의 · thin 자료 부족 */
const BAND_CLASS: Record<string, string> = {
  strong: "bg-success-soft text-success",
  mixed: "bg-primary-soft text-primary",
  weak: "bg-warning-soft text-warning",
  thin: "border border-line text-text-3",
};

export function OtherVerdicts({ tool, complexId }: { tool: string; complexId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let alive = true;
    setRows(null);
    const others = FRAME_TABS.filter((t) => t.id !== tool);
    /* [1210] 세 도구를 한 요청에(?tools=) — 컨텍스트를 세 번 만들던 것을 한 번으로 */
    fetch(`/api/ai/context?complexId=${encodeURIComponent(complexId)}&tools=${others.map((t) => t.id).join(",")}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        const vs = (j?.ok ? j.verdicts : null) as Record<string, { headline?: unknown; bandLabel?: unknown; band?: unknown; bandReason?: unknown } | null> | null;
        const list: Row[] = [];
        for (const t of others) {
          const v = vs?.[t.id];
          if (!v || typeof v.headline !== "string" || !v.headline.trim()) continue;
          list.push({ id: t.id, label: t.label, bandLabel: String(v.bandLabel ?? ""), band: String(v.band ?? "mixed"), headline: v.headline, reason: typeof v.bandReason === "string" && v.bandReason.trim() ? v.bandReason.trim() : null });
        }
        setRows(list);
      })
      .catch(() => {
        if (alive) setRows([]);
      });
    return () => {
      alive = false;
    };
  }, [tool, complexId]);

  if (rows === null) {
    return <div className="card h-[132px] animate-pulse rounded-2xl" aria-hidden="true" />;
  }
  if (rows.length === 0) return null;
  return (
    <section className="card rounded-2xl p-[var(--pad-card)]" aria-labelledby="other-verdicts-h">
      <h2 id="other-verdicts-h" className="t-section text-ink">
        같은 단지 · 다른 판정
      </h2>
      <ul className="mt-2 flex flex-col">
        {rows.map((r) => (
          <li key={r.id} className="border-t border-divider first:border-t-0">
            <Link
              href={frameTabHref(r.id, complexId)}
              prefetch={false}
              className="press flex min-h-[52px] items-center gap-3 py-2 no-underline"
            >
              <span className="w-[72px] shrink-0 t-sub font-bold text-ink">{r.label}</span>
              {r.bandLabel && (
                <span className={`chip shrink-0 px-2 py-0.5 t-caption font-bold ${BAND_CLASS[r.band] ?? BAND_CLASS.mixed}`}>{r.bandLabel}</span>
              )}
              {/* [1212] 판정 근거 한 줄(왜 이 판정인가 · verdict.bandReason) — 받았을 때만 */}
              <span className="min-w-0 flex-1">
                <span className="block truncate t-sub text-text-2">{r.headline}</span>
                {r.reason && <span className="block truncate t-caption text-text-3">{r.reason}</span>}
              </span>
              <span className="shrink-0 t-sub text-text-3" aria-hidden="true">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
