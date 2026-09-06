"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Segmented } from "@/app/components/ui/Segmented";
import {
  ALL_BANDS,
  TRADE_SORTS,
  tradeBandChips,
  tradeTotals,
  viewTrades,
  type HubTrade,
  type TradeSort,
} from "@/lib/complex/hub-trades";
import { TradeRow } from "./TradeRow";

/* [968 · 4] 단지 허브 "시세" 탭 본문 — 면적대 필터·정렬·전체 표·계산기 링크.
   hub-client.tsx 안에 있던 것을 그대로 옮겼다(동작 동일). 기본 탭(요약)이 아니라
   서버 HTML 에는 없고 탭을 열 때만 필요하므로 next/dynamic(ssr:false) 로 떼어
   첫 로드 JS 에서 Segmented·필터 헬퍼를 뺀다. */

export function PriceTab({
  trades,
  latestAvgManwon,
  complexName,
  priceChart,
  region,
}: {
  trades: HubTrade[];
  /** 가장 최근 달 평균 매매가(만원) — 계산기 프리필. 0 이면 링크를 만들지 않는다 */
  latestAvgManwon: number;
  complexName?: string;
  /** 서버가 그린 실거래 추이 차트(PriceTrendChart) — 2개월 미만이면 null */
  priceChart: ReactNode;
  /** [970 · B-39] 이 단지의 지역("서울 중랑구") — /analysis/price?region= 프리필 */
  region?: string;
}) {
  /* [967 · 16] 시세 탭 면적대 필터·정렬 — 이미 받은 행 위에서만(추가 질의 없음).
     주소에는 싣지 않는다(탭까지만 URL 동기화). */
  const [band, setBand] = useState<string>(ALL_BANDS);
  const [sort, setSort] = useState<TradeSort>("latest");
  const bandChips = useMemo(() => tradeBandChips(trades), [trades]);
  const shownTrades = useMemo(() => viewTrades(trades, band, sort), [trades, band, sort]);
  const totals = tradeTotals(shownTrades);
  const chipCls = (active: boolean) =>
    `chip press shrink-0 px-3 py-1.5 t-sub ${
      active ? "chip-active" : "border border-line bg-surface text-text-2"
    }`;

  return (
    <>
      <div className="px-1 text-xs font-extrabold text-text-3">
        실거래 히스토리 <span className="font-medium text-text-3">· 국토교통부 기준</span>
      </div>
      {/* 실거래 가격 추이 차트 (실데이터 2개월 이상일 때만) */}
      {priceChart}
      {trades.length > 0 ? (
        <>
          {/* [967 · 16] 필터 줄 — 면적대 칩(행에 실제로 있는 구간만, AREA_BANDS 순) + 정렬.
              면적대 칩은 분할 데이터가 있을 때만 그린다(구 로더로 만든 행은 bands 가 비어
              있고, 그때 "전체" 하나만 있는 칩 줄은 누를 게 없는 장식이다). */}
          <div className="flex flex-col gap-2">
            {bandChips.length > 0 && (
              <div
                className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="group"
                aria-label="면적대"
              >
                <button
                  type="button"
                  onClick={() => setBand(ALL_BANDS)}
                  aria-pressed={band === ALL_BANDS}
                  className={chipCls(band === ALL_BANDS)}
                >
                  전체
                </button>
                {bandChips.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => setBand(c.slug)}
                    aria-pressed={band === c.slug}
                    className={chipCls(band === c.slug)}
                  >
                    {c.label}
                    <span className="ml-1 opacity-70">{c.dealCount}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Segmented
                options={TRADE_SORTS}
                value={sort}
                onChange={setSort}
                ariaLabel="실거래 정렬"
              />
              <span className="t-sub font-bold text-text-2 tabular-nums" role="status">
                {totals.months}개월 · {totals.deals}건
              </span>
            </div>
          </div>
          {shownTrades.length > 0 ? (
            <div className="card flex flex-col overflow-hidden rounded-[14px] px-0 py-0">
              <div className="border-b border-line bg-bg px-3.5 py-2 t-sub font-bold text-text-2">
                {band === ALL_BANDS
                  ? `전체 ${trades.length}개월 · 국토교통부`
                  : `${bandChips.find((c) => c.slug === band)?.label ?? ""} ${shownTrades.length}개월 · 국토교통부`}
              </div>
              {/* [967 · 18] key = yyyymm — 필터·정렬을 바꿔도 같은 달은 같은 노드 */}
              {shownTrades.map((t, i) => (
                <TradeRow
                  key={t.ym}
                  t={t}
                  divider={i < shownTrades.length - 1 ? "bottom" : "none"}
                />
              ))}
            </div>
          ) : (
            <div className="card rounded-[14px] px-[15px] py-6 text-center t-body text-text-3">
              이 면적대의 실거래가 표에 없어요
            </div>
          )}
        </>
      ) : (
        <div className="card rounded-[14px] px-[15px] py-6 text-center t-body text-text-3">
          아직 수집된 국토교통부 실거래가 없어요
        </div>
      )}
      {/* [D69] 계산기로 **이 단지의 실거래가를 들고** 간다.
          예전엔 계산기가 어디서도 값을 받지 못해 8.4억이라는 예시 숫자에서
          늘 새로 시작했다 — 방금 시세를 보고 온 사람에게 그건 남의 숫자다.
          최근 달 평균 매매가(만원)를 그대로 넘긴다. 값이 없으면 링크를
          만들지 않는다(빈손으로 보내면 예시 숫자가 자기 단지인 척한다). */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {/* [970 · B-39] 지역을 실어 보낸다 — 빈손이면 /analysis/price 가 첫 지역(강남구)으로 열렸다.
            D62 매칭이 "서울 강남구" 꼴을 받는다. */}
        <Link
          href={region ? `/analysis/price?region=${encodeURIComponent(region)}` : "/analysis/price"}
          className="btn-soft rounded-xl p-3 text-center t-body"
        >
          AI 시세 분석 보기
        </Link>
        {latestAvgManwon > 0 && (
          <Link
            href={`/calculator?price=${latestAvgManwon}${complexName ? `&from=${encodeURIComponent(complexName)}` : ""}`}
            className="btn-soft rounded-xl p-3 text-center t-body"
          >
            이 시세로 대출 계산
          </Link>
        )}
      </div>
    </>
  );
}
