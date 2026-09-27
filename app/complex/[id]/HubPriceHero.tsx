import { Won } from "@/app/components/num/Won";
import { Delta } from "@/app/components/num/Delta";
import { ExplainLazy as Explain } from "./ExplainLazy";
import { changeSentence, pctChange } from "@/lib/format/delta";
import { formatEokMan } from "@/lib/format/eok-man";
import { dealDateLabel, floorLabel } from "@/lib/complex/deal-format";
import { baseSince, type HubHeadline } from "@/lib/complex/hub-price";
import { AreaTextLazy as AreaText } from "./AreaTextLazy";

/* [1009 · C] 허브 첫 화면의 결론 — "대표 가격 한 개 + 비교 기준이 적힌 등락 + 한 줄 문장"(토스증권 종목 화면 머리).

   왜(운영 DB 읽기 전용 실측, 2026-09-22): 예전 머리는 "최근 실거래 평균 30.9억 ▲ 1.2% 전월비" — 그 달 거래의
   **평형 혼합 평균**(헬리오시티 2026.08 = 84㎡ 3건 + 110㎡ 1건)과 그 혼합 평균끼리의 전월비였다. 같은 화면의
   "결과 요약"(AI 분석 근거)은 84㎡ 최근 6건 평균 29.7억을 말했다 — 한 화면에 가격 둘, 그리고 전월비는 팔린 평형
   구성이 바뀌기만 해도 움직였다. 이제 대표가는 AI 분석과 같은 규칙(lib/complex/hub-price → resolveUnitPrice),
   등락은 같은 평형 바로 앞 6건 평균과 비교한다(매매 신고가 2026.01부터라 "1년 전"은 아직 잴 수 없다).
   숫자는 굵고 크게(Won), 단위는 작게. 네이비 면 위라 등락 토큰을 이 안에서만 밝은 쌍으로 바꾼다
   (--up → 주홍 on-dark 4.86:1 · --down → ai-accent — [962] 예전 priceSubDarkClass 와 같은 색). */

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
  const scope =
    "[--up:var(--brand-red-on-dark)] [--down:var(--ai-accent)] [--text-2:var(--on-dark-muted)] [--text-3:var(--on-dark-muted)]";
  const eyebrow = (
    <span
      className="njn-dot njn-dot--breathe"
      style={{ width: 6, height: 6, background: "var(--brand-red-on-dark)" }}
      aria-hidden="true"
    />
  );
  const source = `국토교통부 실거래가${freshness ? ` · 마지막 반영 ${freshness}` : ""}`;

  if (!headline && fallback) {
    return (
      <div className={scope}>
        <div className="inline-flex items-center gap-1.5 t-caption font-bold text-on-dark-muted">
          {eyebrow}최근 실거래 월평균{fallback.ym ? ` · ${fallback.ym}` : ""} · 면적 혼합
        </div>
        <div className="mt-1 t-display leading-none text-on-dark tabular-nums">{fallback.price}</div>
      </div>
    );
  }

  if (!headline) {
    return (
      <div className={scope}>
        <div className="inline-flex items-center gap-1.5 t-caption font-bold text-on-dark-muted">
          {eyebrow}최근 실거래가
        </div>
        <p className="mt-1 t-section text-on-dark">
          {txFailed ? "실거래를 지금 불러오지 못했어요" : "아직 신고된 매매 실거래가 없어요"}
        </p>
        <p className="mt-0.5 t-sub text-on-dark-muted">
          {txFailed
            ? "거래가 없다는 뜻이 아니라 조회에 실패한 거예요 — 잠시 후 새로고침해 주세요."
            : "신고가 들어오면 여기에 가장 최근 거래가 보여요(계약 후 30일 안에 신고)."}
        </p>
      </div>
    );
  }

  const h = headline;
  const range = ymRangeLabel(h.firstYm, h.latestYm);

  if (h.kind === "single") {
    const d = h.deal;
    return (
      <div className={scope}>
        <div className="inline-flex flex-wrap items-center gap-x-1.5 t-caption font-bold text-on-dark-muted">
          {eyebrow}
          <span>
            최근 실거래가
            {h.unitM2 != null && (
              <>
                {" · "}
                <AreaText unitM2={h.unitM2} prefix="전용 " />
              </>
            )}
            {d?.floor != null ? ` · ${floorLabel(d.floor)}` : ""}
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
        </div>
        <Won manwon={h.priceManwon} className="mt-1 block t-display leading-none text-on-dark" />
        <p className="mt-1.5 t-sub text-on-dark-muted">
          {d ? `${dealDateLabel(d.ym, d.day)} 계약` : range} · 한 건 거래라 평균이 아니에요
        </p>
      </div>
    );
  }

  const base = h.base;
  const pct = base ? pctChange(h.priceManwon, base.avgManwon) : null;
  const since = base ? baseSince(base) : "";
  const sentence = base
    ? changeSentence({ curr: h.priceManwon, base: base.avgManwon, since, unit: "manwon" })
    : null;
  const what = h.basis === "band" ? h.bandLabel : null;

  return (
    <div className={scope}>
      <div className="inline-flex flex-wrap items-center gap-x-1.5 t-caption font-bold text-on-dark-muted">
        {eyebrow}
        <span>
          최근 실거래가 ·{" "}
          {what ? <AreaText band={what} /> : <AreaText unitM2={h.unitM2} prefix="전용 " />} {h.sampleSize}건 평균
        </span>
        <Explain
          term="silgeoraega"
          title="최근 실거래가"
          how={[
            `${h.basis === "band" ? `${what} 면적대(평형마다 3건이 안 돼 면적대로 묶었어요)` : `전용 ${h.unitM2}㎡ — 최근 거래가 가장 많은 평형`}의 최근 ${h.sampleSize}건 평균이에요 · ${range} 계약.`,
            /* [1009 · C 리뷰] 예전 문구 "아래 그래프의 '기간 시작 대비'와 같은 기준이에요"는 사실이 아니었다 — 여기는 한 건 단위
               (기간 첫 거래 최대 6건 평균), 그래프 머리는 달 평균끼리다(헬리오시티: 여기 ▼0.8% · 그래프 ▼1.2%, 둘 다 "26.01"). */
            base
              ? `비교 기준: 같은 ${h.basis === "band" ? "면적대" : "평형"}의 기간 첫 거래 ${base.count}건 평균 ${formatEokMan(base.avgManwon, { unit: "만원" })}(${ymRangeLabel(base.firstYm, base.latestYm)} 계약). 아래 그래프 머리는 달 평균끼리 비교라 숫자가 조금 다를 수 있어요.`
              : `비교 기준: 대표가 표본(최근 거래) 말고 같은 ${h.basis === "band" ? "면적대" : "평형"} 거래가 3건이 안 돼 비교하지 않아요 — 아래 그래프도 이 ${h.basis === "band" ? "면적대" : "평형"}은 기간 등락을 적지 않아요.`,
            "AI 분석의 '최근 실거래가'와 같은 규칙이에요(최근 200건 중 가장 많이 거래된 평형, 3건 이상). 해제 신고된 거래는 빼요.",
          ]}
          source={source}
        />
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <Won manwon={h.priceManwon} className="t-display leading-none text-on-dark" />
        {pct !== null && <Delta pct={pct} className="t-section" srContext={since} />}
      </div>
      <p className="mt-1.5 t-sub text-on-dark-muted">
        {sentence ?? `${range} 계약 ${h.sampleSize}건 평균 · 비교할 거래가 아직 적어요`}
      </p>
    </div>
  );
}

function dealYm(ym: string): string {
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}

/** "2026.07~2026.08" · 같은 달이면 "2026.01" */
function ymRangeLabel(first: string, last: string): string {
  return first === last ? dealYm(last) : `${dealYm(first)}~${dealYm(last)}`;
}

export default HubPriceHero;
