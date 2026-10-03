import Link from "next/link";
import { formatKrwShort } from "@/lib/market/format";
import { monthsBehind } from "@/lib/newui/as-of-label";
import { Explain } from "@/app/components/explain/Explain";
import { Delta } from "@/app/components/num/Delta";
import { effectiveGap } from "./screener-model";

/* [1009 · A] 전세가율·갭 스크리너의 순위 표 — 페이지에서 떼어 냈다(임시 하네스가 실데이터 모양으로 그려 확인하려고).
   바뀐 것: 머리 ⓘ(전세가율·갭·월세 환산 — 아래 계산과 같은 말), "매매지수 변동" 칸의 등락 표준
   (예전엔 상승=오류색·하락=테마색이라 이 화면(초록 테마)에서 하락이 초록이었다).
   [1021 · 지역 시세 gap] 시안(mock8/gap)의 결과 표 — 전세가율은 막대 + 값, 갭은 파랑 굵게(실측·추정 배지 유지),
   월세 환산 열은 값이 있거나 조회 실패일 때만, 행 끝에 "단지 보기"(기존 /region/[id] 링크). 상·하위 두 표 → 조건 결과 한 표. */

/* [1009 · A] 표 머리 ⓘ — 이 화면의 계산과 같은 말(아래 GapScreenerPage 의 계산·FAQ 와 같은 식) */
export const GAP_HOW = [
  "실측 갭 = 지역 평균 매매가 − 전세 신고 보증금 중앙값(최근 3개월, 전세 30건 이상인 지역만)",
  "추정 갭 = 지역 평균 매매가 × (1 − 전세가율). 전세 신고가 30건 미만인 지역",
  "지역 평균이라 단지·면적에 따라 실제 갭은 크게 다르다.",
];
export const YIELD_HOW = [
  "(최근 3개월 월세 신고 중앙값 × 12) ÷ (평균 매매가 − 월세 보증금 중앙값)",
  "월세 표본이 30건 미만인 지역은 적지 않는다. 세금·수리비·공실은 반영하지 않는다.",
];

export type Row = {
  regionId: string;
  name: string;
  ratio: number;
  avgSale?: number;
  gap?: number;
  period: string;
  source: string;
  /** 월간 매매지수 변동(%) — 스냅샷의 sale_change (없으면 undefined) */
  saleChange?: number;
  /** [#94 잔여] 월세 환산 수익률(연 %) — 표본 30건 미만·분모 0 이하면 undefined */
  rentYield?: number;
  /** [AI-28] 실측 갭 = 평균 매매가 − 전세 신고 중앙값(최근 3개월, 표본 30건+) */
  measuredGap?: number;
  jeonseSample?: number;
  /** [1021] 시/도 — lib/market/sido-group sidoOfRegionName(모르면 "그 밖의 지역") */
  group: string;
};

function fmtPeriod(period: string): string {
  const d = period.replace(/[^0-9]/g, "");
  if (d.length < 6) return period;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}`;
}

/** 공표 지연을 사람 말로 — "적재가 멈춘 것"과 "원래 늦게 나오는 것"을 가른다. */
function periodNote(period: string): string | null {
  const n = monthsBehind(period);
  if (n === null) return null;
  if (n <= 1) return "최신";
  if (n === 2) return "공표 주기상 최신";
  return `${n}개월 지연`;
}

export function RankTable({
  rows,
  maxRatio,
  yieldFailed = false,
  showYield,
}: {
  rows: Row[];
  maxRatio: number;
  /** 월세 수익률 조회가 실패했는가 — 표본 없음("—")과 구분해 적는다 */
  yieldFailed?: boolean;
  /** 월세 환산 열 — 값이 하나라도 있거나 조회가 실패했을 때만 */
  showYield: boolean;
}) {
  /* relative — 칸 안 <Delta> 의 sr-only(position:absolute)가 이 가로 스크롤 상자를 벗어나 모바일 문서 폭을
     +127px 늘렸다(390px 실측 — 하네스). 이 상자를 기준 상자로 만들어 안에서 잘리게 한다 */
  return (
    /* [1015 · 규칙 I] 흰 카드 안 목록 → plain 톤(색판 없음) */
    <div className="lq-panel relative" data-tone="plain">
      <div className="relative overflow-x-auto">
        <table className="t-sub w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-line text-left text-text-3">
              <th className="py-2 pr-3 font-semibold">지역</th>
              <th className="py-2 pr-3 font-semibold">
                <span className="inline-flex items-center gap-0.5">
                  전세가율
                  <Explain term="jeonse-garyul" how="공표 지역 통계(한국부동산원)의 매매가 대비 전세가 비율." size={12} />
                </span>
              </th>
              <th className="py-2 pr-3 text-right font-semibold">평균 매매가</th>
              <th className="py-2 pr-3 text-right font-semibold">
                <span className="inline-flex items-center gap-0.5">
                  갭
                  <Explain term="gap-tuja" how={GAP_HOW} size={12} />
                </span>
              </th>
              {showYield && (
                <th className="py-2 pr-3 text-right font-semibold">
                  <span className="inline-flex items-center gap-0.5">
                    월세 환산
                    <Explain title="월세 환산 수익률" how={YIELD_HOW} source="국토교통부 전월세 신고 · 공표 지역 통계" size={12} />
                  </span>
                </th>
              )}
              <th className="py-2 pr-3 text-right font-semibold">지수(전월 대비)</th>
              <th className="py-2 pr-3 text-right font-semibold">기준</th>
              <th className="py-2 text-right font-semibold">
                <span className="sr-only">단지</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const gap = effectiveGap(r);
              const w = maxRatio > 0 ? Math.min(100, Math.round((r.ratio / maxRatio) * 100)) : 0;
              return (
                <tr key={r.regionId} className="row-hl border-b border-divider last:border-0">
                  <td className="py-1.5 pr-3">
                    <Link
                      href={`/region/${r.regionId}`}
                      className="inline-flex min-h-[24px] items-center whitespace-nowrap font-bold text-ink underline-offset-2 hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-2">
                      <span className="gap-bar" aria-hidden="true">
                        <i style={{ width: `${w}%` }} />
                      </span>
                      <b className="t-num font-bold text-ink">{r.ratio.toFixed(1)}%</b>
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-text-1">
                    {r.avgSale && r.avgSale > 0 ? formatKrwShort(r.avgSale) : "—"}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right font-bold tabular-nums text-primary">
                    {gap !== null ? (
                      <>
                        {formatKrwShort(gap)}
                        {r.measuredGap !== undefined ? (
                          <span className="t-caption ml-1 rounded bg-success-soft px-1 py-px font-bold text-success">실측</span>
                        ) : (
                          <span className="t-caption ml-1 rounded bg-bg px-1 py-px font-bold text-text-3">추정</span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  {showYield && (
                    <td className="py-2 pr-3 text-right tabular-nums text-text-1">
                      {r.rentYield !== undefined ? (
                        `${r.rentYield.toFixed(1)}%`
                      ) : yieldFailed ? (
                        <span className="t-caption font-bold text-warning">조회 실패</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {/* [1009 · A] 등락 표준 — ▲ 빨강·▼ 파랑·±0.05% 미만 보합·없으면 "변동 미상" */}
                    <Delta pct={r.saleChange ?? null} digits={2} srContext="지난달보다" />
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right text-text-3">
                    {fmtPeriod(r.period)} · {r.source.toUpperCase()}
                    {periodNote(r.period) && <span className="t-caption block text-text-3">{periodNote(r.period)}</span>}
                  </td>
                  <td className="py-1.5 text-right">
                    <Link
                      href={`/region/${r.regionId}`}
                      className="chip press inline-flex min-h-[24px] items-center whitespace-nowrap border border-line bg-surface px-2.5 t-sub text-text-2 no-underline"
                    >
                      단지 보기
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
