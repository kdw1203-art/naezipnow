/* [1024 · 단지 상세] 전세가율 · 갭 2칸 — 같은 재료(complex-facts jeonseRatio: 최근 6개월 전세 중앙 ÷ 매매 중앙, 전 타입).
   갭 = 매매 중앙 − 전세 중앙(complex-v2-model.gapManwon) — 둘 다 있을 때만 숫자, 아니면 "—"와 이유 한 줄.
   타입별 갭은 전월세 원표본에 면적이 없어 만들지 않는다(지어내지 않는다). 서버 조각. */
import { Fineprint } from "@/app/components/Fineprint";
import type { ComplexFacts } from "@/lib/complex/complex-facts";
import { formatEokMan } from "@/lib/format/eok-man";
import { gapManwon, krwToMan } from "./complex-v2-model";
import { ExplainLazy as Explain } from "./ExplainLazy";

function ymDot(ym: string): string {
  return /^\d{6}$/.test(ym) ? `${ym.slice(0, 4)}.${ym.slice(4)}` : ym;
}

export function JeonseGapCards({ jeonse, reason }: { jeonse: ComplexFacts["jeonseRatio"] | null; reason: string | null }) {
  const trade = jeonse ? krwToMan(jeonse.tradeMedianKrw) : null;
  const deposit = jeonse ? krwToMan(jeonse.jeonseMedianKrw) : null;
  const gap = gapManwon(trade, deposit);
  const window = jeonse ? `최근 ${jeonse.windowMonths}개월 · ${ymDot(jeonse.fromYm)}~${ymDot(jeonse.toYm)}` : null;
  return (
    <div className="rise-in-1 mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <section aria-label="전세가율" className="card flex flex-col gap-0.5 rounded-2xl px-4 py-3.5 max-md:px-3.5 max-md:py-3">
        <span className="inline-flex items-center gap-0.5 t-caption text-text-3">
          전세가율 · 전 타입
          <Explain
            term="jeonse-garyul"
            how={[
              "최근 6개월 전세 보증금 중앙값 ÷ 같은 기간 매매 거래가 중앙값 × 100.",
              "전세·매매 각각 3건 이상일 때만 계산. 면적 미가중이라 평형 구성이 다르면 실제와 차이가 날 수 있다.",
            ]}
            source="국토교통부 매매·전월세 실거래 신고"
          />
        </span>
        <span className="t-title t-num text-ink">{jeonse ? `${jeonse.pct}%` : "—"}</span>
        {/* [1036 · 밀도] 계산식 줄은 접힘 — 값 아래엔 기간만 */}
        {jeonse ? (
          <>
            <span className="t-caption text-text-3 tabular-nums">{window}</span>
            <Fineprint label="계산">
              전세 중앙 {formatEokMan(deposit)}({jeonse.jeonseCount}건) ÷ 매매 중앙 {formatEokMan(trade)}({jeonse.tradeCount}건)
            </Fineprint>
          </>
        ) : (
          <span className="t-caption text-text-3">{reason ?? "전세·매매 각 3건 이상일 때 계산"}</span>
        )}
      </section>
      <section aria-label="갭" className="card flex flex-col gap-0.5 rounded-2xl px-4 py-3.5 max-md:px-3.5 max-md:py-3">
        <span className="t-caption text-text-3">갭 · 전 타입</span>
        <span className="t-title t-num text-ink">{gap != null ? formatEokMan(gap) : "—"}</span>
        {gap != null ? (
          <>
            <span className="t-caption text-text-3 tabular-nums">{window}</span>
            <Fineprint label="계산">매매 중앙 − 전세 중앙</Fineprint>
          </>
        ) : (
          <span className="t-caption text-text-3">매매·전세 중앙값이 둘 다 있을 때 계산</span>
        )}
      </section>
    </div>
  );
}

export default JeonseGapCards;
