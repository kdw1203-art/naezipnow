"use client";

/* [1092 · 비용] 구간 화면 "이 구간에서 거래된 단지" 표 — 서버는 압축 행만 넘기고 표는 여기서 그린다(같은 이유 · 같은 방식:
   app/dong/[region]/[dong]/DongComplexTable 머리 주석). 운영 실측 서울 중랑구 6~9억: 40줄 표가 HTML 31KB · RSC 그 이상.
   첫 화면 HTML(SSR)과 표기 함수는 서버와 같다. [1092 · 화면] 첫 열(단지) 고정 — 동 화면과 같은 규칙(HScroll stickyFirst). */
import Link from "@/app/components/IntentLink";
import { HScroll } from "@/app/components/HScroll";
import { complexHrefFromNames } from "@/lib/seo/complex-slug";
import { formatKrwShort, formatYm } from "@/lib/market/format";

/** [이름, 평균 전용㎡|null, 평균 원, 최저 원, 최고 원, 거래 건수, 최근 계약월|null] */
export type BandComplexWire = [string, number | null, number, number, number, number, string | null];

export function BandComplexTable({ region, rows }: { region: string; rows: BandComplexWire[] }) {
  return (
    <div data-tone="blue">
      <HScroll className="lq-panel mt-3 max-md:mt-2" stickyFirst>
        <table className="w-full min-w-[520px] whitespace-nowrap text-left t-body">
          <thead>
            <tr className="border-b border-border t-sub text-text-3">
              <th className="py-2 font-medium">단지</th>
              <th className="py-2 pl-3 text-right font-medium">전용</th>
              <th className="py-2 pl-3 text-right font-medium">평균</th>
              <th className="py-2 pl-3 text-right font-medium">최저~최고</th>
              <th className="py-2 pl-3 text-right font-medium">거래</th>
              <th className="py-2 pl-3 text-right font-medium">최근</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, area, avgKrw, minKrw, maxKrw, txCount, latestYm]) => (
              <tr key={name} className="border-b border-border last:border-b-0">
                {/* [1074] 밑줄 파란 글자 40줄이 표를 덮었다 · 폰 세로 히트 16px — 밑줄은 손을 올렸을 때만, 폰은 이름 칸이 40px.
                    [1092] 고정 열은 폰 화면의 46% 까지만 — 긴 이름("한신아파트상가동유치원동(103~109)")이 한 줄로 서면 고정 열이 표를 덮어
                    옆 숫자가 보이지 않았다(운영 실측 서울 중랑구 6~9억). 넘치면 두 줄(break-keep). 폭 제한은 셀이 아니라 링크에(표 셀의 max-width 는 무시된다). */}
                <td className="py-0.5 pr-3 md:py-2.5">
                  <Link
                    href={complexHrefFromNames(region, name)}
                    className="inline-flex max-w-[46vw] min-h-[40px] items-center whitespace-normal break-keep font-bold text-primary no-underline hover:underline md:min-h-0 md:max-w-none"
                  >
                    {name}
                  </Link>
                </td>
                <td className="py-2.5 pl-3 text-right t-sub tabular-nums text-text-3">{area !== null ? `${area.toFixed(0)}㎡` : "—"}</td>
                <td className="py-2.5 pl-3 text-right t-num font-bold text-ink">{formatKrwShort(avgKrw)}</td>
                <td className="py-2.5 pl-3 text-right t-sub tabular-nums text-text-2">
                  {formatKrwShort(minKrw)}~{formatKrwShort(maxKrw)}
                </td>
                <td className="py-2.5 pl-3 text-right tabular-nums text-text-2">{txCount}건</td>
                <td className="py-2.5 pl-3 text-right t-sub tabular-nums text-text-3">{formatYm(latestYm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </HScroll>
    </div>
  );
}
