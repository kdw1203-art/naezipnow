"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Segmented } from "@/app/components/ui/Segmented";
import {
  ALL_BANDS,
  TRADE_SORTS,
  tradeBandChips,
  tradeDeltaBases,
  tradeTotals,
  viewTrades,
  type HubTrade,
  type TradeSort,
} from "@/lib/complex/hub-trades";
import { monthDeltaView } from "@/lib/complex/month-delta";
import { TradeRow } from "./TradeRow";
import { DealList } from "./DealList";
import { useAreaUnit } from "./AreaText";
import { areaBandLabelByUnit } from "@/lib/complex/area-band-label";
import { areaBandOf } from "@/lib/market/bands";
import type { DealTuple } from "@/lib/complex/hub-price";

/* [1009 · C] 실거래 목록(한 건 단위) — 면적대 칩·정렬을 월별 표와 같이 따른다. 처음엔 10건, "더 보기"로 받은 전부(최대 60). */
const DEALS_FIRST = 10;

function sortDeals(list: readonly DealTuple[], sort: TradeSort): DealTuple[] {
  if (sort === "latest") return [...list];
  const sign = sort === "price-desc" ? -1 : 1;
  /* 동률은 최신 먼저(목록은 이미 최신순이라 안정 정렬이면 그대로 남는다) */
  return [...list].sort((a, b) => sign * (a[2] - b[2]));
}

/* [968 · 4] 단지 허브 "시세" 탭 본문 — 면적대 필터·정렬·전체 표·계산기 링크.
   hub-client.tsx 안에 있던 것을 그대로 옮겼다(동작 동일). 기본 탭(요약)이 아니라
   서버 HTML 에는 없고 탭을 열 때만 필요하므로 next/dynamic(ssr:false) 로 떼어
   첫 로드 JS 에서 Segmented·필터 헬퍼를 뺀다. */

export function PriceTab({
  trades,
  deals = [],
  latestAvgManwon,
  complexName,
  priceChart,
  region,
  loanRegion,
}: {
  trades: HubTrade[];
  /** [1009 · C] 최근 실거래 한 건 단위(최신순, 최대 60) */
  deals?: readonly DealTuple[];
  /** 계산기 프리필(만원) — [1009 · C] 첫 화면 대표가(없으면 최근 달 평균). 0 이면 링크를 만들지 않는다 */
  latestAvgManwon: number;
  complexName?: string;
  /** 서버가 그린 실거래 추이 차트(PriceTrendChart) — 2개월 미만이면 null */
  priceChart: ReactNode;
  /** [970 · B-39] 이 단지의 지역("서울 중랑구") — /analysis/price?region= 프리필 */
  region?: string;
  /** [1008] 계산기 지역(regulated·capital·other) — 서버가 정한 값, 없으면 계산기에서 고른다 */
  loanRegion?: string;
}) {
  /* [967 · 16] 시세 탭 면적대 필터·정렬 — 이미 받은 행 위에서만(추가 질의 없음).
     주소에는 싣지 않는다(탭까지만 URL 동기화). */
  const [band, setBand] = useState<string>(ALL_BANDS);
  const [sort, setSort] = useState<TradeSort>("latest");
  const bandChips = useMemo(() => tradeBandChips(trades), [trades]);
  const shownTrades = useMemo(() => viewTrades(trades, band, sort), [trades, band, sort]);
  /* [1009 · C 리뷰] 줄마다 등락의 기준 달 — 앞 줄이 정확히 전달이면 "전월 대비", 가운데 달이 비었으면 "26.02 대비".
     예전 머리("전월 대비")는 거래 있던 앞 달과의 비교를 전월비라고 불렀다(리뷰 실측: 다월 단지 53%에 빈 달) */
  const deltaViews = useMemo(() => {
    const bases = tradeDeltaBases(trades, band);
    return new Map(shownTrades.map((t) => [t.ym, monthDeltaView(t.ym, bases.get(t.ym))]));
  }, [trades, band, shownTrades]);
  const allAdjacent = [...deltaViews.values()].every((v) => v.basis === null || v.adjacent);
  const totals = tradeTotals(shownTrades);
  const [allDeals, setAllDeals] = useState(false);
  const bandDeals = useMemo(
    () =>
      sortDeals(
        band === ALL_BANDS ? deals : deals.filter(([, , , area]) => area != null && areaBandOf(area)?.slug === band),
        sort,
      ),
    [deals, band, sort],
  );
  /* [1009 · C] 면적 단위 설정(㎡/평)을 칩·표 머리에도 — 쿠키는 붙은 뒤에 읽는다(이 탭은 어차피 클라이언트에서만 그린다) */
  const unit = useAreaUnit();
  const bandLabel =
    band === ALL_BANDS ? "전체" : areaBandLabelByUnit(bandChips.find((c) => c.slug === band)?.label ?? "", unit);
  const chipCls = (active: boolean) =>
    `chip press shrink-0 px-3 py-1.5 t-sub ${
      active ? "chip-active" : "border border-line bg-surface text-text-2"
    }`;

  return (
    <>
      <div className="px-1 text-xs font-extrabold text-text-3">
        실거래 <span className="font-medium text-text-3">· 국토교통부 기준 · 해제 신고 제외</span>
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
                    {areaBandLabelByUnit(c.label, unit)}
                    <span className="ml-1 font-normal tabular-nums">{c.dealCount}</span>
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
          {/* [1009 · C] 한 건 단위 목록 — 네이버 부동산 단지 화면 "실거래가" 목록(계약일·전용·층·거래가) */}
          {bandDeals.length > 0 && (
            <div className="card flex flex-col gap-2 rounded-[14px] px-3.5 py-3">
              <div className="flex items-baseline justify-between gap-2 px-0.5">
                <span className="t-sub font-bold text-text-2">
                  {bandLabel} 실거래 <span className="tabular-nums">{bandDeals.length}건</span>
                </span>
                <span className="t-caption text-text-3">최근 {deals.length}건 중</span>
              </div>
              <DealList deals={allDeals ? bandDeals : bandDeals.slice(0, DEALS_FIRST)} />
              {bandDeals.length > DEALS_FIRST && (
                <button
                  type="button"
                  onClick={() => setAllDeals((v) => !v)}
                  aria-expanded={allDeals}
                  className="btn-soft min-h-10 rounded-xl px-3 t-sub"
                >
                  {allDeals ? "접기" : `${bandDeals.length - DEALS_FIRST}건 더 보기`}
                </button>
              )}
            </div>
          )}
          {shownTrades.length > 0 ? (
            <div className="card flex flex-col overflow-hidden rounded-[14px] px-0 py-0">
              {/* [1009 · C] 이 표의 가격은 그 달 거래의 **평균**이다 — 머리에 "월평균"과 비교 기준을 적는다.
                  [1009 · C 리뷰] 전체 보기는 평형을 섞은 평균이라 적는다(헬리오시티 8월 ▲15.8% 는 84·110㎡ 달과 39·59㎡ 포함 달의
                  비교였다). 기준은 앞 줄 — 모든 앞 줄이 전달이면 "전월 대비", 아니면 "앞 거래 달 대비"이고 빈 달 다음 줄에 기준 달을 적는다. */}
              <div className="flex items-baseline justify-between gap-2 border-b border-line bg-bg px-3.5 py-2 t-sub font-bold text-text-2">
                <span className="min-w-0">{band === ALL_BANDS ? "월평균 · 면적 혼합" : `월평균 · ${bandLabel}`}</span>
                <span className="shrink-0 t-caption font-medium text-text-3">
                  {allAdjacent ? "전월 대비" : "앞 거래 달 대비"}
                </span>
              </div>
              {/* [967 · 18] key = yyyymm — 필터·정렬을 바꿔도 같은 달은 같은 노드 */}
              {shownTrades.map((t, i) => (
                <TradeRow
                  key={t.ym}
                  t={t}
                  dv={deltaViews.get(t.ym)}
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
            href={`/calculator?price=${latestAvgManwon}${complexName ? `&from=${encodeURIComponent(complexName)}` : ""}${loanRegion ? `&region=${loanRegion}` : ""}`}
            className="btn-soft rounded-xl p-3 text-center t-body"
          >
            {/* [1008] "시세" → "실거래가" — 넘기는 값은 최근 달 평균 **실거래가**다(단지 단위 시세 원천 없음) */}
            이 실거래가로 대출 계산
          </Link>
        )}
      </div>
    </>
  );
}
