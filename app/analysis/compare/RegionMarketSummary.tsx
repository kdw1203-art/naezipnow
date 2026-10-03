"use client";
/* [1026b · 시나리오·비교] 세부 — 후보 지역 실시세 스냅샷 + 종합 코멘트(POST /api/ai/compare-summary). page.tsx 의 RegionMarketSummary 를 옮겼다.
   첫 화면 아래라 next/dynamic(ssr:false · CompareLazy.tsx). 호출 조건("요약 생성"을 눌렀을 때만) · 사용량 안내 · 면책 문자열은 그대로.
   바뀐 것: "요약 생성" 버튼 = 채움 파랑(ActionButton · 실패 시 주홍 채움) → 테두리 보조 버튼(진행 링) — 화면의 채움 파랑은 "결정 카드에 담기" 하나.
   준비 안내 두 문장 → 담은 지역 이름 한 줄. 흰 카드 한 모양 · 섹션 제목 h2(점). */

import { useState } from "react";
import { Explain } from "@/app/components/explain/Explain";
import { DELTA_ARROW, DELTA_CLASS, DELTA_WORD, deltaDir } from "@/lib/format/delta";

type RegionSnapshotItem = {
  regionId: string;
  regionName: string;
  period: string;
  source: string;
  avgSaleLabel: string | null;
  saleChangeMonthly: number | null;
  jeonseRatio: number | null;
};

type SummaryState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "limited"; message: string }
  | { kind: "error"; message: string }
  | {
      kind: "done";
      items: RegionSnapshotItem[];
      comment: string;
      mode: "llm" | "rule";
      disclaimer: string;
    };

/** [1009 · A] 등락 표준(lib/format/delta) — ▲ 빨강 · ▼ 파랑 · 보합 회색 · 모르면 "변동 미상". */
function DeltaCell({ pct }: { pct: number | null }) {
  const dir = deltaDir(pct);
  if (dir === null) return <span className="text-center font-bold text-text-3">변동 미상</span>;
  if (dir === "flat") return <span className="text-center font-bold delta-flat">보합</span>;
  return (
    <span className={`text-center tabular-nums ${DELTA_CLASS[dir]}`}>
      <span aria-hidden="true">{DELTA_ARROW[dir]} </span>
      <span className="sr-only">{DELTA_WORD[dir]} </span>
      {Math.abs(pct as number).toFixed(1)}%
    </span>
  );
}

/** 비교 트레이의 후보 지역 실시세 요약 — "요약 생성" 버튼을 눌렀을 때만 호출. regions 가 비면 그리지 않는다 */
export function RegionMarketSummary({ regions }: { regions: string[] }) {
  const [state, setState] = useState<SummaryState>({ kind: "idle" });

  /* [970 · B-45] 후보 지역이 없으면(트레이 비었거나 지역 없는 항목뿐) 카드를 접는다 */
  if (regions.length === 0) return null;

  const busy = state.kind === "loading";
  const generate = async () => {
    if (state.kind === "loading" || regions.length === 0) return;
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/ai/compare-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regions }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        items?: RegionSnapshotItem[];
        comment?: string;
        mode?: string;
        disclaimer?: string;
      } | null;
      if (res.status === 429) {
        setState({
          kind: "limited",
          message: data?.error ?? "요약 생성 사용량(시간당 10회)을 모두 썼어요. 잠시 후 다시 확인해 주세요.",
        });
        return;
      }
      if (!res.ok) {
        setState({ kind: "error", message: data?.error ?? "요약 생성 실패 · 잠시 후 다시" });
        return;
      }
      if (!data || !Array.isArray(data.items) || data.items.length === 0) {
        setState({ kind: "empty" });
        return;
      }
      setState({
        kind: "done",
        items: data.items,
        comment: data.comment ?? "",
        mode: data.mode === "llm" ? "llm" : "rule",
        disclaimer: data.disclaimer ?? "본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다",
      });
    } catch {
      setState({ kind: "error", message: "네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요." });
    }
  };

  return (
    <section className="card flex flex-col gap-3 rounded-2xl p-4 max-md:p-3.5" aria-label="후보 지역 통계">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* [1028] "실시세 스냅샷"(내부 말) → "후보 지역 통계" — 한국부동산원 지역 통계(평균 매매가·전월 대비·전세가율) */}
        <h2 className="t-section text-ink">후보 지역 통계</h2>
        {/* 보조 버튼 — 진행(링) · 실패는 아래 문구(채움 색으로 알리지 않는다) */}
        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy}
          aria-busy={busy || undefined}
          className="btn-secondary btn-md shrink-0 gap-1.5 px-3 t-sub"
        >
          {busy && <span className="njn-ring njn-ring--ink" aria-hidden="true" />}
          {busy
            ? "불러오는 중"
            : state.kind === "done"
              ? "요약 다시 생성"
              : state.kind === "limited" || state.kind === "error"
                ? "다시 생성"
                : "요약 생성"}
        </button>
      </div>

      {state.kind === "idle" ? (
        <div className="t-sub text-text-3">
          담은 후보 {regions.length}개 지역 · {regions.join(" · ")}
        </div>
      ) : state.kind === "loading" ? (
        <div className="t-sub text-text-3">지역 시세를 불러오는 중…</div>
      ) : state.kind === "empty" ? (
        <div className="t-sub text-text-3">담은 후보 지역의 시세 통계 없음</div>
      ) : state.kind === "limited" || state.kind === "error" ? (
        <div className="rounded-lg bg-danger-soft px-3 py-2.5 t-sub font-bold text-danger">{state.message}</div>
      ) : (
        <>
          <div className="relative overflow-x-auto">
            <div className="min-w-[520px]">
              <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2 border-b border-divider pb-2 t-sub font-bold text-text-3">
                <span>지역 (기준월)</span>
                <span className="text-center">평균 매매가</span>
                <span className="inline-flex items-center justify-center gap-0.5">
                  지난달 대비
                  <Explain note="delta" size={12} />
                </span>
                <span className="inline-flex items-center justify-center gap-0.5">
                  전세가율
                  <Explain term="jeonse-garyul" how="지역 아파트의 매매가 대비 전세가 비율(공표 통계). 단지 값이 아니라 지역 평균." size={12} />
                </span>
              </div>
              {state.items.map((it) => (
                <div key={it.regionId} className="grid grid-cols-[1.4fr_1fr_1fr_1fr] items-center gap-2 border-b border-divider py-2.5 t-sub">
                  <span className="font-bold text-ink">
                    {it.regionName}
                    <span className="ml-1 t-caption font-semibold text-text-3">
                      {it.period} · {it.source.toUpperCase()}
                    </span>
                  </span>
                  <span className="text-center font-bold text-text-1">{it.avgSaleLabel ?? "—"}</span>
                  <DeltaCell pct={it.saleChangeMonthly} />
                  <span className="text-center font-bold text-text-1">{it.jeonseRatio !== null ? `${it.jeonseRatio.toFixed(0)}%` : "—"}</span>
                </div>
              ))}
            </div>
          </div>

          {state.comment && (
            /* [1023] 흰 카드 위 잉크 토큰 — 예전 네이비 .ai-panel */
            <div className="flex flex-col gap-2 rounded-2xl border border-line bg-bg p-4 max-md:p-3.5">
              <div className="flex items-start gap-3">
                {/* [1028] "AI" 표시는 AI 모델이 쓴 요약일 때만 — 규칙 요약에는 붙이지 않는다 */}
                {state.mode === "llm" && (
                  <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-lg border border-line t-caption font-bold text-ink">
                    AI
                  </span>
                )}
                <div className="flex-1 t-sub text-text-1">{state.comment}</div>
                <span className="shrink-0 rounded border border-line px-1.5 py-px t-caption font-bold text-text-3">
                  {state.mode === "llm" ? "AI 생성" : "규칙 기반 요약"}
                </span>
              </div>
              <div className="t-caption text-text-3">{state.disclaimer}.</div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default RegionMarketSummary;
