"use client";

import type { HubTrade } from "@/lib/complex/hub-trades";
import type { MonthDeltaView } from "@/lib/complex/month-delta";

/* [968 · 4] 실거래 표 한 줄 — hub-client(요약 탭 미리보기)와 PriceTab(시세 탭 전체)이
   같은 모양을 쓴다. 시세 탭을 next/dynamic 으로 떼면서 둘이 공유하는 조각만 여기로. */

export function deltaClass(tone: "up" | "down" | "flat"): string {
  return tone === "down" ? "delta-down" : tone === "up" ? "delta-up" : "delta-flat";
}

/* [1009 · C] 이 줄은 **월별 평균**(그 달 거래의 산술평균·면적 혼합 또는 고른 면적대)이다 — 한 건 값이 아니라
   짧은 표기("8.4억")가 표준이고, 숫자 열은 tabular-nums 로 세로 정렬한다. 색은 .delta-up/.delta-down(토큰 --up/--down).
   한 건 단위는 DealList. 누를 곳이 없어 눌림 없음.
   [1009 · C 리뷰] 등락은 "바로 앞 **줄**"(거래 있던 달)과의 비교다 — 가운데 달이 비면 전월이 아니다. dv(month-delta)가
   오면 앞 줄이 정확히 전달일 때만 "전월 대비"(스크린리더), 아니면 기준 달("26.02 대비")을 화면에 적는다.
   비교할 앞 줄이 없으면 "—", 변동 0 은 "보합"(예전엔 둘 다 "—"). */
export function TradeRow({
  t,
  divider,
  dv,
}: {
  t: HubTrade;
  divider: "top" | "bottom" | "none";
  dv?: MonthDeltaView;
}) {
  const dir = dv ? dv.dir : t.tone;
  const text = dv ? dv.text : t.delta;
  return (
    <div
      className={`flex items-center justify-between gap-2 px-3.5 py-[7px] t-sub ${
        divider === "top" ? "border-t border-line" : divider === "bottom" ? "border-b border-divider" : ""
      }`}
    >
      <span className="min-w-0 text-text-2 tabular-nums">
        {t.date}
        <span className="ml-1.5 text-text-3">{t.sub}</span>
      </span>
      <span className="flex shrink-0 items-baseline gap-1.5">
        <span className="font-extrabold text-ink tabular-nums">{t.price}</span>
        <span className="flex flex-col items-end">
          <span className={`t-caption tabular-nums ${dir ? deltaClass(dir) : "text-text-3"}`}>
            {dv ? (
              dv.basis && dv.adjacent ? <span className="sr-only">{dv.basis} </span> : null
            ) : t.tone !== "flat" ? (
              <span className="sr-only">앞 거래 달 대비 </span>
            ) : null}
            {dv && !dv.basis ? <span className="sr-only">비교할 앞 거래 달 없음 </span> : null}
            {text}
          </span>
          {dv?.basis && !dv.adjacent ? (
            <span className="t-caption leading-none text-text-3 tabular-nums">{dv.basis}</span>
          ) : null}
        </span>
      </span>
    </div>
  );
}
