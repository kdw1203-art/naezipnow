import { Won } from "@/app/components/num/Won";
import { Delta } from "@/app/components/num/Delta";
import { ExplainLazy as Explain } from "./ExplainLazy";
import { pctChange } from "@/lib/format/delta";
import { formatEokMan } from "@/lib/format/eok-man";
import { dealDateLabel, floorLabel } from "@/lib/complex/deal-format";
import { baseShortLabel, baseSince, type HubHeadline } from "@/lib/complex/hub-price";
import { AreaTextLazy as AreaText } from "./AreaTextLazy";

/* [1009 · C] 허브 첫 화면의 결론 — 대표 실거래가 하나(AI 분석과 같은 평형 규칙, lib/complex/hub-price).

   [v4 · 한 화면 한 가지] 이 화면의 **주인공은 이 숫자 하나**다. 네이비 면·숨쉬는 점·눈썹 줄·결론 문장("26.01 거래 6건
   평균보다 …")을 걷고, 흰 바탕에 t-display 숫자(+ 등락과 그 기준 달) + 사실 한 줄("전용 59㎡ 6건 평균 · 2026.08 ·
   국토교통부")만 둔다. 계산 방법·비교 기준의 긴 설명은 ⓘ 시트 안에 그대로 있다(접힘). 매매 실거래가 없으면
   "신고된 매매 실거래 없음" 한 줄 — **이 문장은 페이지 전체에서 여기 한 번만** 나온다(요약 목록·실거래 탭은 말하지 않는다). */

const SOURCE = "국토교통부";

export function HubPriceHero({
  headline,
  txFailed,
  freshness,
  fallback = null,
}: {
  headline: HubHeadline | null;
  /** 실거래 조회 실패 — "없음"과 다른 문장으로 */
  txFailed: boolean;
  /** 실거래 마지막 반영일("2026-09-21") — 설명 시트 출처 줄 */
  freshness: string | null;
  /** 한 건 목록을 못 받았지만 월별 이력은 있을 때 — 최근 달 평균(면적 혼합)을 그렇다고 적어 보여 준다 */
  fallback?: { price: string; ym: string | null } | null;
}) {
  const source = `국토교통부 실거래가${freshness ? ` · 마지막 반영 ${freshness}` : ""}`;
  const line = "mt-1 flex flex-wrap items-center gap-x-1 t-sub text-text-3";

  if (!headline && fallback) {
    return (
      <div>
        <div className="t-display leading-none text-ink tabular-nums">{fallback.price}</div>
        <p className={line}>
          월평균 · 면적 혼합{fallback.ym ? ` · ${fallback.ym}` : ""} · {SOURCE}
        </p>
      </div>
    );
  }

  if (!headline) {
    /* [v4 · 규칙 8] 빈 상태는 한 줄 — 신고 기한 설명("계약 후 30일 안에 신고")은 페이지 끝 데이터 출처로 */
    return (
      <p className="t-section text-ink" role={txFailed ? "status" : undefined}>
        {txFailed ? "실거래를 지금 불러오지 못했어요" : "신고된 매매 실거래 없음"}
      </p>
    );
  }

  const h = headline;

  if (h.kind === "single") {
    const d = h.deal;
    return (
      <div>
        <Won manwon={h.priceManwon} className="block t-display leading-none text-ink" />
        <p className={line}>
          <span>
            {h.unitM2 != null && (
              <>
                <AreaText unitM2={h.unitM2} prefix="전용 " />
                {" · "}
              </>
            )}
            {d?.floor != null ? `${floorLabel(d.floor)} · ` : ""}
            {d ? `${dealDateLabel(d.ym, d.day)} 계약` : ymDot(h.latestYm)} · 한 건 · {SOURCE}
          </span>
          <Explain
            term="silgeoraega"
            title="최근 실거래가"
            how={[
              "이 단지는 같은 평형·면적대 거래가 3건이 안 돼 평균을 내지 않고, 가장 최근에 계약된 한 건을 그대로 보여 드려요(신고 순서가 아니라 계약일 순서).",
              "해제 신고된 거래는 빼요.",
            ]}
            source={source}
          />
        </p>
      </div>
    );
  }

  const base = h.base;
  const pct = base ? pctChange(h.priceManwon, base.avgManwon) : null;
  const what = h.basis === "band" ? h.bandLabel : null;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <Won manwon={h.priceManwon} className="t-display leading-none text-ink" />
        {pct !== null && base && (
          <span className="inline-flex items-baseline gap-1">
            <Delta pct={pct} className="t-body font-bold" srContext={baseSince(base)} />
            <span className="t-caption text-text-3">{baseShortLabel(base)} 대비</span>
          </span>
        )}
      </div>
      <p className={line}>
        <span>
          {what ? <AreaText band={what} /> : <AreaText unitM2={h.unitM2} prefix="전용 " />} {h.sampleSize}건 평균 ·{" "}
          {ymDot(h.latestYm)} · {SOURCE}
        </span>
        <Explain
          term="silgeoraega"
          title="최근 실거래가"
          how={[
            `${h.basis === "band" ? `${what} 면적대(평형마다 3건이 안 돼 면적대로 묶었어요)` : `전용 ${h.unitM2}㎡ — 최근 거래가 가장 많은 평형`}의 최근 ${h.sampleSize}건 평균이에요 · ${ymRangeLabel(h.firstYm, h.latestYm)} 계약.`,
            base
              ? `비교 기준: 같은 ${h.basis === "band" ? "면적대" : "평형"}의 기간 첫 거래 ${base.count}건 평균 ${formatEokMan(base.avgManwon, { unit: "만원" })}(${ymRangeLabel(base.firstYm, base.latestYm)} 계약). 실거래 탭 그래프 머리는 달 평균끼리 비교라 숫자가 조금 다를 수 있어요.`
              : `비교 기준: 대표가 표본(최근 거래) 말고 같은 ${h.basis === "band" ? "면적대" : "평형"} 거래가 3건이 안 돼 비교하지 않아요.`,
            "AI 분석의 '최근 실거래가'와 같은 규칙이에요(최근 200건 중 가장 많이 거래된 평형, 3건 이상). 해제 신고된 거래는 빼요.",
          ]}
          source={source}
        />
      </p>
    </div>
  );
}

function ymDot(ym: string): string {
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}

/** "2026.07~2026.08" · 같은 달이면 "2026.01" */
function ymRangeLabel(first: string, last: string): string {
  return first === last ? ymDot(last) : `${ymDot(first)}~${ymDot(last)}`;
}

export default HubPriceHero;
