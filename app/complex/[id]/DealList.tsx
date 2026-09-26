"use client";

import { formatEokMan } from "@/lib/format/eok-man";
import type { DealTuple } from "@/lib/complex/hub-price";
import { dealDateLabel, floorLabel, unitKeyOf } from "@/lib/complex/deal-format";
import { useAreaUnit, unitAreaLabel } from "./AreaText";

/* [1009 · C] 실거래 한 건씩 — 네이버 부동산 단지 화면의 "실거래가" 목록 관례(계약일 · 전용 · 층 · 거래가).
   왜: 허브의 "최근 실거래"는 월별 **평균** 줄(8.4억 · N건 · 최저~최고)뿐이라 "그 집이 정확히 얼마·몇 층에 팔렸나"를
   읽을 수 없었다. 한 건 값은 반올림 없이 "12억 4,500만"(formatEokMan), 숫자 열은 tabular-nums 로 세로 정렬.
   면적은 사용자 단위(㎡/평). 줄은 누를 곳이 없으므로 눌림 효과를 주지 않는다(누를 수 있는 것에만 — 1009 공통 규칙). */

export function DealList({
  deals,
  className,
}: {
  deals: readonly DealTuple[];
  className?: string;
}) {
  const unit = useAreaUnit();
  if (deals.length === 0) return null;
  /* 390px 카드 안쪽 ≈ 300px — 계약일 74 · 전용 48 · 층 46 · 간격 24 를 빼면 거래가 칸이 ~110px 라
     "34억 7,000만"이 한 줄에 들어간다(하네스 실측: 예전 폭 배분에선 두 줄로 꺾였다) */
  const cols = "grid grid-cols-[4.6rem_3rem_2.9rem_minmax(0,1fr)] items-baseline gap-x-2";
  return (
    <div className={`overflow-hidden rounded-xl bg-bg ${className ?? ""}`}>
      <div className={`${cols} border-b border-line px-3.5 py-1.5 t-caption text-text-3`} aria-hidden="true">
        <span>계약일</span>
        <span>전용</span>
        <span>층</span>
        <span className="text-right">거래가</span>
      </div>
      <ul className="flex flex-col">
        {deals.map(([ym, day, man, area, floor], i) => (
          <li
            key={`${ym}-${day ?? 0}-${man}-${area ?? 0}-${floor ?? 0}-${i}`}
            className={`${cols} px-3.5 py-2 t-sub ${i > 0 ? "border-t border-divider" : ""}`}
          >
            <span className="tabular-nums text-text-2">{dealDateLabel(ym, day)}</span>
            <span className="tabular-nums text-text-2">{area != null ? unitAreaLabel(unitKeyOf(area), unit) : "—"}</span>
            <span className="tabular-nums text-text-3">{floorLabel(floor)}</span>
            <span className="whitespace-nowrap text-right font-extrabold tabular-nums text-ink">{formatEokMan(man)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default DealList;
