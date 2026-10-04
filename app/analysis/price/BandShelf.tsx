"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { RankBars } from "@/app/components/viz/RankBars";
import { Explain } from "@/app/components/explain/Explain";
import { StepLine } from "@/app/components/StepLine";
import { priceConclusion, priceSteps } from "@/lib/market/region-conclusion";
import { VerdictCard } from "../timing/region-verdict";
import { PYEONG_HOW, RANK_HOW } from "./BandTable";
import { initialShelfSlug, shelfCards, type ShelfBand } from "./band-shelf-model";

/* [1026 · 지역 시세] 1025 표준 — 선반이 고른 칸(selected)을 따라 **절차 한 줄**(지역 · {지역} → 면적대 · {칸} → 실거래 범위 · 최저~최고 →
   다음 행동)과 **결론 한 줄**(t-title "{지역} {칸} 거래 최다 N건 · 중앙 X억" + 판정 칩 "평단가 상위 N%" · 근거 t-sub)이 바로 바뀐다 —
   선반 = 대표 그림이자 손잡이라 결론 바로 아래에 둔다. 그리드는 처음부터 본문 | 레일 340(선반도 본문 열 안). 레일 = 실거래 범위(고른 칸
   요약) + page.tsx 가 넘긴 다음 행동 카드 · 이어서 분석. 숫자 줄(facts)은 서버 마크업 그대로 결론 카드 아래에.
   채움 파랑 리터럴은 여기 없다(다음 행동 카드 = app/analysis/timing/region-verdict.tsx 한 곳). 문장은 lib/market/region-conclusion(새 계산 없음).
   [1021 · 지역 시세 price·timing] 면적 선반 5칸 + 상위 단지 목록 + 레일(선택한 면적대의 범위 카드).
   지시(시안 mock8/price): 칸을 누르면 아래 "실거래 상위 단지"가 그 면적대로 바뀐다 — 클라이언트 상태 하나(selected).
   데이터는 서버(page.tsx)가 면적대마다 미리 읽어 넘긴다(listBandComplexes × 면적대 수, 하루 1회 재생성이라 비용 미미).
   분포 히스토그램은 셀에 분포 데이터가 없어(최저·평균·중앙·최고뿐) 넣지 않고, 그 네 값을 범위 카드로 보인다.
   폰: 선반은 가로 스크롤 레일(스냅) — .pxs-shelf(globals.css [1021] 블록).
   [1022 · 면적대별 검색·비교] 지시 2 — 본문 열의 상위 단지 카드 아래에 `below`(타 단지 비교 카드, page.tsx 가 넘긴다)를
   그린다. 선반·상태·레일은 그대로다. */

const CARD = "card flex flex-col gap-2.5 rounded-2xl p-4 max-md:p-3.5";

export function BandShelf({
  bands,
  busiestSlug,
  hiSlug,
  regionName,
  regionSlug,
  rail,
  below,
  facts,
}: {
  bands: readonly ShelfBand[];
  busiestSlug: string | null;
  hiSlug: string | null;
  regionName: string;
  regionSlug: string;
  /** 레일 아래쪽(다음 행동 카드 · 이어서 분석 칩) — 서버 컴포넌트를 그대로 받는다 */
  rail: ReactNode;
  /** [1022] 상위 단지 카드 아래(본문 열) — 타 단지 비교 카드 */
  below?: ReactNode;
  /** [1026] 결론 카드 아래 숫자 줄(서버 마크업) */
  facts?: ReactNode;
}) {
  const [selected, setSelected] = useState<string | null>(() => initialShelfSlug(bands, busiestSlug));
  const cards = shelfCards(bands, busiestSlug, hiSlug);
  const band = bands.find((b) => b.slug === selected) ?? bands[0] ?? null;
  const plan = priceSteps(regionName, band);

  const railNodes = (
    <>
      {band && (
        <section className={CARD} data-reveal="">
          <h2 className="t-section text-ink">{band.label} 실거래 범위</h2>
          <div className="flex flex-col gap-1">
            {[
              ["최저", band.minText],
              ["중앙값", band.medianText],
              ["평균", band.avgText],
              ["최고", band.maxText],
            ].map(([k, v], i) => (
              <div key={k} className={`flex items-baseline justify-between gap-2 ${i > 0 ? "border-t border-divider pt-1.5" : ""}`}>
                <span className="t-sub text-text-3">{k}</span>
                <b className="t-num t-sub text-ink">{v}</b>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-2 border-t border-divider pt-1.5">
              <span className="t-sub text-text-3">단지 수</span>
              <b className="t-num t-sub text-ink">{band.complexCount.toLocaleString("ko-KR")}곳</b>
            </div>
          </div>
        </section>
      )}
      {rail}
    </>
  );

  return (
    <>
      {/* [1026] 절차 한 줄 — 화면당 한 번 */}
      <StepLine className="mt-3" steps={plan.steps} current={plan.current} />

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-3">
          {/* [1026] 결론 한 줄 — 고른 칸을 따라 바뀐다 */}
          {band && <VerdictCard conclusion={priceConclusion(regionName, band, band.slug === busiestSlug)} />}
          {facts}

          {/* 대표 그림 · 손잡이 — 면적 선반 5칸. 칸 = 버튼(aria-pressed) */}
          <div>
            <div className="flex items-center gap-1 px-0.5">
              <span className="t-caption font-bold text-text-3">면적대별 중앙값 · 건수 · 평단가</span>
              <Explain term="pyeongdanga" how={PYEONG_HOW} source="국토교통부 실거래가" size={12} />
              <span className="t-caption text-text-3">· 지역 분위</span>
              <Explain title="지역 분위" how={RANK_HOW} size={12} />
            </div>
            <div className="pxs-shelf mt-1.5" role="group" aria-label="면적대 고르기">
              {bands.map((b) => {
                const c = cards.find((x) => x.slug === b.slug)!;
                const on = band?.slug === b.slug;
                return (
                  <button
                    key={b.slug}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSelected(b.slug)}
                    className={`pxs-band card tile flex flex-col rounded-lg p-3 text-left ${on ? "pxs-band-on" : ""}`}
                  >
                    <span className="flex items-start justify-between gap-1">
                      <b className="t-sub text-ink">{b.label}</b>
                      {c.busiest ? (
                        <span className="t-caption shrink-0 rounded bg-primary-soft px-1.5 py-px font-bold text-primary">거래 최다</span>
                      ) : c.priciest ? (
                        <span className="t-caption shrink-0 rounded bg-warning-soft px-1.5 py-px font-bold text-warning">평단가 최고</span>
                      ) : null}
                    </span>
                    <span className="pxs-bar" aria-hidden="true">
                      <i className={c.busiest ? "bg-primary" : "bg-primary-soft"} style={{ width: `${c.barPct}%` }} />
                    </span>
                    <span className="t-num t-title text-ink">{b.medianText}</span>
                    <span className="t-caption text-text-3">중앙값 · {b.txCount.toLocaleString("ko-KR")}건</span>
                    {(b.perText || b.top !== null) && (
                      <span className="t-caption tabular-nums text-text-3">
                        {b.perText ? `평당 ${b.perText.replace("/평", "")}` : ""}
                        {b.perText && b.top !== null ? " · " : ""}
                        {b.top !== null ? `상위 ${b.top}%` : ""}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <section className={`${CARD} text-primary`} data-reveal="">
            <div className="chart-head">
              <h2 className="t-section text-ink">{band ? `${band.label} 실거래 상위 단지` : "실거래 상위 단지"}</h2>
              <span className="t-caption ml-auto text-text-3">거래 많은 순</span>
            </div>
            {band && band.rows.length > 0 ? (
              <>
                <RankBars key={band.slug} rows={band.rows} suffix="건" />
                {band.avgRows.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {band.avgRows.map((r) => (
                      <div key={r.name} className="flex justify-between gap-2">
                        <span className="t-sub truncate text-text-3">{r.name} 평균</span>
                        <span className="t-sub t-num text-ink">{r.avgText}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="t-sub text-text-3">이 면적대 단지별 집계 없음</p>
            )}
            <Link href={`/tx/${encodeURIComponent(regionSlug)}`} className="btn-soft btn-md mt-auto no-underline">
              {regionName} 전체 실거래·단지 보기
            </Link>
          </section>
          {below}
          {/* 폰 — 레일 내용을 본문 아래 한 열로 */}
          <div className="flex flex-col gap-3 lg:hidden">{railNodes}</div>
        </div>
        <aside className="hidden lg:flex lg:flex-col lg:gap-3 lg:sticky lg:top-[76px] lg:self-start">{railNodes}</aside>
      </div>
    </>
  );
}
