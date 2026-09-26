import Link from "next/link";
import { formatKrwShort } from "@/lib/market/format";
import { monthsBehind } from "@/lib/newui/as-of-label";
import { Explain } from "@/app/components/explain/Explain";
import { Delta } from "@/app/components/num/Delta";

/* [1009 · A] 전세가율·갭 스크리너의 순위 표 — 페이지에서 떼어 냈다(임시 하네스가 실데이터 모양으로 그려 확인하려고).
   바뀐 것: 머리 ⓘ(전세가율·갭·월세 환산 — 아래 계산과 같은 말), "매매지수 변동" 칸의 등락 표준
   (예전엔 상승=오류색·하락=테마색이라 이 화면(초록 테마)에서 하락이 초록이었다). */

/* [1009 · A] 표 머리 ⓘ — 이 화면의 계산과 같은 말(아래 GapScreenerPage 의 계산·FAQ 와 같은 식) */
const GAP_HOW = [
  "실측 갭 = 지역 평균 매매가 − 전세 신고 보증금 중앙값(최근 3개월, 전세 30건 이상인 지역만)",
  "추정 갭 = 지역 평균 매매가 × (1 − 전세가율) — 전세 신고가 30건 미만인 지역",
  "지역 평균이라 단지·면적에 따라 실제 갭은 크게 달라요.",
];
const YIELD_HOW = [
  "(최근 3개월 월세 신고 중앙값 × 12) ÷ (평균 매매가 − 월세 보증금 중앙값)",
  "월세 표본이 30건 미만인 지역은 적지 않아요. 세금·수리비·공실은 넣지 않았어요.",
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
  group: "서울" | "경기" | "인천";
};

/* 표 안 셀 배경 막대 — 값의 크기를 배경 길이로 먼저 보인다.
   숫자 7열짜리 표는 눈이 한 열씩 훑어야 순위가 잡힌다. */
function ratioBarStyle(ratio: number, max: number): React.CSSProperties {
  const w = max > 0 ? Math.min(100, Math.round((ratio / max) * 100)) : 0;
  return { ["--w" as string]: `${w}%` };
}

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
  tone,
  maxRatio,
  yieldFailed = false,
}: {
  rows: Row[];
  tone: "high" | "low";
  maxRatio: number;
  /** 월세 수익률 조회가 실패했는가 — 표본 없음("—")과 구분해 적는다 */
  yieldFailed?: boolean;
}) {
  /* relative — 칸 안 <Delta> 의 sr-only(position:absolute)가 이 가로 스크롤 상자를 벗어나 모바일 문서 폭을
     +127px 늘렸다(390px 실측 — 하네스). 이 상자를 기준 상자로 만들어 안에서 잘리게 한다 */
  return (
    <div className="card relative overflow-x-auto rounded-[14px] px-4 py-2">
      <table className="t-body w-full min-w-[600px]">
        <thead>
          <tr className="t-sub border-b border-line text-left text-text-3">
            <th className="py-2 pr-3 font-semibold">지역</th>
            <th className="py-2 pr-3 text-right font-semibold">
              <span className="inline-flex items-center gap-0.5">
                전세가율
                <Explain term="jeonse-garyul" how="공표 지역 통계(한국부동산원·KB)의 매매가 대비 전세가 비율이에요." size={12} />
              </span>
            </th>
            <th className="py-2 pr-3 text-right font-semibold">평균 매매가</th>
            <th className="py-2 pr-3 text-right font-semibold">
              <span className="inline-flex items-center gap-0.5">
                갭(실측 우선)
                <Explain term="gap-tuja" how={GAP_HOW} size={12} />
              </span>
            </th>
            <th className="py-2 pr-3 text-right font-semibold">
              <span className="inline-flex items-center gap-0.5">
                월세 환산
                <Explain title="월세 환산 수익률" how={YIELD_HOW} source="국토교통부 전월세 신고 · 공표 지역 통계" size={12} />
              </span>
            </th>
            <th className="py-2 pr-3 text-right font-semibold">지난달 대비 지수</th>
            <th className="py-2 text-right font-semibold">기준</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.regionId} className="row-hl border-b border-divider last:border-0">
              <td className="py-1.5 pr-3">
                {/* [1009 · A] 지역 이름 링크 — 글자 높이(15px)만 눌렸다(모바일 조작 검사 6건). 24px 로 키우고
                    칸 위아래 여백을 그만큼 줄여 행 높이는 그대로 */}
                <Link
                  href={`/region/${r.regionId}`}
                  className="inline-flex min-h-6 items-center font-bold text-ink underline-offset-2 hover:underline"
                >
                  {r.name}
                </Link>
              </td>
              <td
                className={`cell-bar py-2.5 pr-3 text-right font-extrabold tabular-nums ${
                  tone === "high" ? "text-primary" : "text-text-2"
                }`}
                style={ratioBarStyle(r.ratio, maxRatio)}
              >
                {r.ratio.toFixed(1)}%
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-text-1">
                {r.avgSale && r.avgSale > 0 ? formatKrwShort(r.avgSale) : "—"}
              </td>
              <td className="py-2.5 pr-3 text-right font-bold tabular-nums text-ink">
                {r.measuredGap !== undefined ? (
                  <>
                    {formatKrwShort(r.measuredGap)}
                    <span className="t-caption ml-1 rounded bg-success-soft px-1 py-px font-extrabold text-success">실측</span>
                  </>
                ) : r.gap !== undefined ? (
                  <>
                    {formatKrwShort(r.gap)}
                    <span className="t-caption ml-1 rounded bg-bg px-1 py-px font-extrabold text-text-3">추정</span>
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-text-1">
                {r.rentYield !== undefined ? (
                  `${r.rentYield.toFixed(1)}%`
                ) : yieldFailed ? (
                  <span className="t-caption font-bold text-warning">조회 실패</span>
                ) : (
                  "—"
                )}
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums">
                {/* [1009 · A] 등락 표준 — 예전엔 상승=오류색(text-danger)·하락=테마색(text-primary)이라 이 화면(초록 테마)에서
                    하락이 초록이었다. 이제 ▲ 빨강·▼ 파랑·±0.05% 미만 보합·없으면 "변동 미상" */}
                <Delta pct={r.saleChange ?? null} digits={2} srContext="지난달보다" />
              </td>
              <td className="t-sub py-2.5 text-right text-text-3">
                {fmtPeriod(r.period)} · {r.source.toUpperCase()}
                {periodNote(r.period) && (
                  <span className="t-caption ml-1 block text-text-3">{periodNote(r.period)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

