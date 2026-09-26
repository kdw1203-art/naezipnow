import Link from "next/link";
import { buildComplexTxSlug, type ComplexSummary } from "@/lib/market/complex-transactions";
import { complexHrefFromNames } from "@/lib/seo/complex-slug";
import { formatKrwShort } from "@/lib/market/format";
import { formatEokMan } from "@/lib/format/eok-man";

/* [1009 · H] 지역 화면 단지 목록 — 네이버 부동산 단지 목록처럼 한 행 = 한 단지(누르면 단지 화면).
 *
 * 왜: 예전엔 /complex/browse 와 같이 쓰는 표(ComplexSummaryTable, min-width 560px)라 390px 휴대폰에서 카드 안
 * 가로 스크롤이 생겼고, 단지 이름만 링크라 행을 눌러도 반응이 없었다. 최근 실거래가는 "12.3억" 식으로 줄여
 * 12억 4,500만과 12억 2,000만이 같은 얼굴이었다. 여기서는
 *   · 행 전체가 링크 + 눌림(.press) + 마우스 기기에서만 배경 반응,
 *   · 한 건의 가격 = 정밀 표기(formatEokMan "12억 4,500만") · 평균 평당가 = 짧은 표기 + "평균",
 *   · 숫자는 세로로 줄 서게 tabular-nums(.t-num).
 * 표는 /complex/browse 가 계속 쓴다(그쪽 파일은 건드리지 않는다). 서버 컴포넌트 · JS 없음. */

function shortYm(ym: string): string {
  return ym.length === 6 ? `${ym.slice(2, 4)}.${ym.slice(4)}` : ym;
}

export function RegionComplexList({
  summaries,
  regionId,
  failed = false,
}: {
  summaries: ComplexSummary[];
  regionId: string;
  failed?: boolean;
}) {
  if (failed) {
    return (
      <p className="py-6 text-center t-body text-text-3">
        단지별 실거래를 지금 불러오지 못했어요. 데이터가 없다는 뜻이 아니라 조회에 실패했다는 뜻이에요 — 잠시 뒤 다시
        열어 주세요.
      </p>
    );
  }
  if (summaries.length === 0) {
    return <p className="py-6 text-center t-body text-text-3">이 지역에서 수집된 단지별 매매 실거래가 아직 없어요.</p>;
  }
  return (
    <ul className="mt-2 flex flex-col">
      {summaries.map((s) => {
        const href = s.regionName
          ? complexHrefFromNames(s.regionName, s.complexName)
          : `/complex/tx/${buildComplexTxSlug(s.complexName, regionId)}`;
        const meta = [
          s.representativeAreaM2 !== null ? `대표 ${s.representativeAreaM2}㎡` : null,
          s.buildYear ? `${s.buildYear}년` : null,
          `12개월 ${s.txCount12m.toLocaleString("ko-KR")}건`,
          s.avgPricePerPyeongKrw !== null ? `평균 평당 ${formatKrwShort(s.avgPricePerPyeongKrw)}` : null,
        ].filter(Boolean);
        return (
          <li key={s.complexName} className="border-b border-divider last:border-b-0">
            <Link
              href={href}
              className="press -mx-2 flex items-start justify-between gap-3 rounded-xl px-2 py-2.5 no-underline transition-colors hover:bg-bg"
            >
              <span className="flex min-w-0 flex-col">
                <span className="t-body font-bold text-ink break-words">{s.complexName}</span>
                {/* 조각 단위로만 줄바꿈 — "평균 평당 / 1.5억"처럼 한 값이 두 줄로 갈라지지 않게 */}
                <span className="t-caption text-text-3">
                  {meta.map((m, i) => (
                    <span key={i} className="whitespace-nowrap">
                      {i > 0 ? " · " : ""}
                      {m}{" "}
                    </span>
                  ))}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end text-right">
                <span className="t-body font-extrabold t-num text-ink">
                  {formatEokMan(s.latestAmountKrw / 10_000)}
                </span>
                <span className="t-caption tabular-nums text-text-3">
                  {shortYm(s.latestYm)}
                  {s.latestAreaM2 !== null ? ` · ${s.latestAreaM2.toFixed(0)}㎡` : ""}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default RegionComplexList;
