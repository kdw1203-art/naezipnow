/**
 * [1009 · A] 결과 요약 숫자 옆 ⓘ 설명 — "이 화면은 이렇게 계산했어요" 문장(순수 데이터).
 *
 * 왜: 1008 결과 화면은 숫자마다 "어떻게 나온 값인지"가 없었다 — 소유자 "무슨 말인지 모르겠다".
 * 설명은 `title=`(마우스를 올려야만 보이는 말풍선)이 아니라 누르면 열리는 시트(<Explain>)로 둔다 — 휴대폰에서도 읽힌다.
 *
 * 규칙: how 문장은 **실제 계산 코드와 같은 말**만 쓴다. 문장마다 근거 코드:
 *  · 최근 실거래가 ← lib/ai/result-series.ts resolveUnitPrice(최근 200건 · 가장 많이 거래된 평형 · 최근 6건 · 최소 3건)
 *                    + lib/ai/complex-trades.ts(해제 신고 제외)
 *  · 최근 6개월 거래 ← result-series.ts buildComplexTradeSeries(기준 달 = 마지막 거래 달과 지난달 중 늦은 달, 달력 6개월)
 *  · 지역 1년 변화 ← lib/ai/region-trend.ts buildRegionTrend(같은 달 1년 전 · 한 달 ±5% 넘게 튀면 말하지 않음)
 *  · 입주 ← lib/ai/live-context.ts(이번 달(한국 시간) 이후 입주분)
 *  · 월세 비중 ← live-context.ts(이번 달 포함 최근 3개월 계약 · 월세 ÷ (전세 + 월세))
 *  · 투자 점수 ← lib/ai/insight-blocks.ts diagnosisRadar · 신호등 ← timingSignals · 위험 ← riskChecklist/RISK_THRESHOLDS
 *  · 시나리오 ← lib/ai/price-scenarios.ts SCENARIO_RULE · 대출 ← lib/ai/loan-calc.ts
 * 계산 규칙을 바꾸면 여기 문장도 바꾼다(tests/unit/analysis-a-1009.test.ts 가 상수와 문장을 대조한다).
 */
import type { ExplainContent } from "@/app/components/explain/Explain";
import type { Verdict, VerdictTile } from "@/lib/ai/verdict";
import { RISK_THRESHOLDS } from "@/lib/ai/insight-blocks";
import { SCENARIO_RULE } from "@/lib/ai/price-scenarios";
import { CONTRACT_RULE } from "@/lib/ai/contract-check";
import { PRICE_MIN, PRICE_SAMPLE, PRICE_WINDOW } from "@/lib/ai/result-series";

/** 수익률(가정) 연환산 문장 — lib/ai/loan-calc.ts scenarioYields 의 annualPct = (비율^(1/햇수) − 1)×100 과 같은 말(테스트로 잠금) */
export const YIELD_FORMULA_LINE =
  "연 수익률 = (받는 돈 ÷ 넣은 돈)^(1 ÷ 보유 햇수) − 1 — 해마다 같은 비율로 불었다고 보고(복리) 1년치로 바꾼 값";

const ymDot = (ym: string | null | undefined): string | null =>
  ym && /^\d{6}$/.test(ym) ? `${ym.slice(0, 4)}.${ym.slice(4)}` : (ym ?? null);

const n = (v: number) => v.toLocaleString("ko-KR");

/** 칸 하나의 설명 — 없으면 null(ⓘ 를 그리지 않는다) */
export function tileExplain(t: VerdictTile): ExplainContent | null {
  const source = t.source ? `${t.source}${t.asOf ? ` · ${ymDot(t.asOf)} 기준` : ""}` : undefined;
  switch (t.key) {
    case "price":
      if (t.source === "입력값") {
        return { title: "기준 가격", body: "② 내 조건에 넣은 가격이에요. 대출·수익률 계산이 이 값에서 출발해요.", source: "입력값" };
      }
      return {
        term: "silgeoraega",
        title: "최근 실거래가",
        how: [
          `이 단지 최근 매매 ${n(PRICE_WINDOW)}건 안에서 가장 많이 거래된 평형(전용면적)을 골라, 그 평형의 최근 거래 ${PRICE_SAMPLE}건 평균이에요.`,
          `그 평형으로 ${PRICE_MIN}건을 못 채우면 가장 많이 거래된 면적대의 최근 ${PRICE_SAMPLE}건 평균으로 대신해요.`,
          "해제(취소) 신고된 거래는 빼요. 평균이라 한 건의 실제 거래가와는 다를 수 있어요.",
        ],
        source,
      };
    case "trades6m":
      return {
        term: "geoRae-ryang",
        title: "최근 6개월 거래",
        how: [
          "이 단지 매매 신고를 모든 평형 합쳐 셌어요 — 기준 달을 포함한 달력 6개월이에요.",
          /* [1009 · A · 리뷰] 코드(lib/ai/result-series.ts)는 max(마지막 거래 달, 지난달) — 이번 달에 신고된 거래가
             있으면 이번 달까지 센다. 예전 문장("이번 달은 빼요")은 사실과 달랐다(운영에 이번 달 계약이 이미 있다) */
          "기준 달은 이 단지 마지막 거래 달과 지난달 중 늦은 달이에요 — 이번 달에 이미 신고된 거래가 있으면 이번 달까지 세요.",
          "계약 후 30일 안에 신고하므로 이번 달·지난달은 아직 덜 잡혔을 수 있어요(나중에 늘어요).",
        ],
        source,
      };
    case "regionYoy":
      return {
        term: "maemae-gagyeok-jisu",
        title: "지역 1년 변화",
        how: [
          "지역 월간 아파트 매매가격지수의 최근 달 값을 1년 전 같은 달 값과 비교한 변동률이에요 — 이 단지가 아니라 지역 전체의 흐름이에요.",
          "그 사이 한 달에 5% 넘게 튄 달(지수 기준이 바뀐 흔적)이 있으면 1년 변화를 적지 않아요.",
        ],
        source,
      };
    case "regionMom":
      return {
        term: "maemae-gagyeok-jisu",
        title: "지역 한 달 변화",
        how: [
          "지역 시세 통계의 지난달 대비 매매가 변동률이에요.",
          "지역 시세 칸이 비어 있으면 같은 출처(한국부동산원) 월간 매매지수의 한 달 변화로 채워요.",
        ],
        source,
      };
    case "regionTrades":
      return {
        term: "geoRae-ryang",
        title: "지역 한 달 거래",
        how: ["지역 아파트 매매 한 달 거래 건수예요.", "거래량은 매매지수보다 한 달 늦게 나와, 이 칸의 기준 달이 다른 칸과 다를 수 있어요."],
        source,
      };
    case "jeonseRatio":
      return {
        term: "jeonse-garyul",
        title: "지역 전세가율",
        how: ["지역 아파트의 매매가 대비 전세가 비율(공표 통계)이에요 — 이 단지 값이 아니라 지역 평균이에요."],
        source,
      };
    case "supply":
      return {
        term: "ipju-mulryang",
        title: "앞으로 입주",
        how: ["청약홈 분양 공고의 입주 예정 월로, 이번 달(한국 시간) 이후 이 시·구에 들어올 세대를 더했어요."],
        source,
      };
    case "wolse":
      return {
        title: "월세 비중",
        body: "최근 전월세 계약 가운데 월세 계약이 차지하는 비율이에요. 높을수록 전세를 끼고 사는 계산이 빠듯해질 수 있어요.",
        how: ["국토교통부 전월세 신고 중 이번 달을 포함한 최근 3개월 계약을 세어, 월세 건수 ÷ (전세 + 월세 건수)로 냈어요."],
        source,
      };
    case "unsold":
      return { term: "mibunyang", title: "미분양", how: ["통계청 KOSIS 미분양 주택 현황에서 이 지역의 최근 값이에요."], source };
    case "notes":
      return {
        title: "이웃 임장노트",
        /* [1009 · A · 리뷰] 코드(lib/ai/live-context.ts loadNotes)는 단지 노트가 먼저, 없을 때만 지역(구·시) 노트 —
           예전 문장은 늘 "이 지역"이라 했다 */
        how: [
          "이 단지 이름으로 공개된 이웃 임장노트가 있으면 그 노트를, 없으면 같은 구·시의 공개 노트를 세요(최근 공개 노트 40건 안에서).",
          "평균 점수는 노트마다 매긴 항목(입지·학군·교통·편의·미래)만 평균한 5점 만점이에요. 편집부(Lab) 예시 노트는 세지 않아요.",
        ],
        source,
      };
    case "baseRate":
      return { title: "기준금리", body: "한국은행이 정하는 정책 금리예요. 대출 금리는 여기에 은행 가산금리가 더해져요.", source };
    case "loanAmount":
      return { term: "ltv", title: "대출액", how: ["기준 가격 × 대출 비율(② 에 넣은 값)이에요."], source: "입력값 계산" };
    case "loanMonthly":
      return {
        term: "wonligeum-gyundeung",
        title: "월 상환액",
        how: ["원리금균등 상환 — 매달 같은 금액으로 원금과 이자를 함께 갚는 방식으로 계산했어요.", "상환 기간을 비우면 30년으로 계산해요."],
        source: "입력값 계산",
      };
    case "loanInterest":
      return {
        term: "wonligeum-gyundeung",
        title: t.label,
        how: ["원리금균등 상환에서 그 기간 동안 낸 이자를 모두 더했어요. 취득세·중개보수·보유세는 넣지 않았어요."],
        source: "입력값 계산",
      };
    default:
      return null;
  }
}

/** 대표 수치(큰 숫자)의 설명 — 도구마다. 없으면 null */
export function metricExplain(v: Verdict): ExplainContent | null {
  const m = v.metric;
  if (!m) return null;
  switch (v.tool) {
    case "ai-diagnosis":
      return {
        title: "투자 점수",
        body: "다섯 가지 항목을 0~100점으로 잰 뒤, 잴 수 있었던 항목만 평균한 점수예요. 65점 이상 좋음 · 45점 미만 주의.",
        how: [
          "가격 흐름: 지역 시세 한 달 변동률 −3%~+3%를 0~100점으로(0%면 50점)",
          "거래 활발: 지역 한 달 거래 0~300건을 0~100점으로",
          "공급 여유: 앞으로 입주 0세대면 100점, 3,000세대 이상이면 0점",
          "이웃 평가: 공개 임장노트 평균 점수(5점 만점) × 20",
          "금리 환경: 기준금리 1%면 100점, 1%p 오를 때마다 20점 낮게 · 미분양이 500호를 넘으면 10점 더 낮게",
        ],
      };
    case "ai-timing":
      return {
        title: "매수 신호",
        body: "사는 사람 입장에서 가격 흐름·거래 열기·입주 물량 세 신호를 유리·보통·불리로 나눴어요. 유리가 더 많으면 '협상 유리', 불리가 더 많으면 '추격 매수 주의', 같으면 '지켜보기'예요.",
        how: [
          "가격 흐름: 지역 시세 한 달 −0.5% 이하면 유리, +0.8% 이상이면 불리",
          "거래 열기: 지역 한 달 거래 30건 미만이면 유리, 100건 이상이면 불리",
          `입주 물량: 앞으로 ${n(RISK_THRESHOLDS.supplyHeavy)}세대 이상이면 유리(매물이 늘 수 있어요), 0세대면 불리`,
        ],
      };
    case "ai-risk":
      return {
        title: "위험 수준",
        body: "다섯 가지 위험 신호 중 '주의'에 걸린 개수로 정해요 — 2개 이상 높음 · 1개 보통 · 0개 낮음. 5가지 중 3가지도 잴 수 없으면 수준을 매기지 않아요.",
        how: [
          `거래량: 지역 한 달 ${n(RISK_THRESHOLDS.tradeDrop)}건 미만이면 주의`,
          `전세가율: ${RISK_THRESHOLDS.jeonseRatioHigh}% 이상이면 주의`,
          `입주 물량: 앞으로 ${n(RISK_THRESHOLDS.supplyHeavy)}세대 이상이면 주의`,
          `미분양: ${n(RISK_THRESHOLDS.unsoldHigh)}호 이상이면 주의`,
          `월세 비중: ${RISK_THRESHOLDS.wolseShareHigh}% 이상이면 참고(등급에는 세지 않아요)`,
        ],
      };
    case "ai-prediction":
      return {
        title: m.label,
        body: "예측이 아니라 공개한 규칙으로 낸 가정 계산이에요. 3개월 적중률을 공개한 규칙(예측 적중률 화면)과는 다른 계산이라 섞어 보지 마세요.",
        how: [
          "출발점: 이 단지 최근 실거래가(가장 많이 거래된 평형의 최근 거래 평균) 또는 ② 에 넣은 기준 가격",
          `기본: 지역 매매지수 지난 1년 변화의 ${SCENARIO_RULE.baseShare * 100}% 속도가 해마다 이어진다고 가정(연 ±${SCENARIO_RULE.baseCapPct}% 안으로 자름) — 1년 변화가 없으면 최근 한 달 변화 × 12`,
          `낙관·비관: 기본에서 연 ${SCENARIO_RULE.spreadPct}%p 위·아래, 해마다 복리로 이어 붙여요`,
        ],
      };
    case "ai-gap":
      return {
        term: "gap-tuja",
        title: "갭 비율",
        how: [
          "갭 = 매매가 − 전세가, 갭 비율 = 갭 ÷ 매매가",
          "매매가를 비우면 이 단지 최근 실거래가를 써요.",
          "전세가를 넣지 않으면 지역 전세가율로 추정해요: 100% − 전세가율.",
        ],
      };
    case "contract-risk":
      return {
        term: "jeonse-garyul",
        title: m.label,
        how: [
          "전세가율 = 보증금 ÷ 매매가",
          `${CONTRACT_RULE.dangerPct}% 이상 위험 · ${CONTRACT_RULE.cautionPct}% 이상 주의 · 그 아래는 숫자로는 안전 — 등기부·보증보험은 따로 확인해야 해요.`,
          "이 집 전세가율을 넣지 않으면 지역 평균 전세가율을 참고값으로만 보여 줘요.",
        ],
      };
    case "ai-simulator":
      if (m.display?.kind === "delta") {
        return {
          title: "연 수익률(가정)",
          body: "보유 기간 뒤 시나리오 가격에 판다고 가정한 계산이에요. 세금·중개보수·보유세·임대료는 넣지 않았어요.",
          how: [
            "넣은 돈 = 계약 때 내 돈(가격 − 대출) + 보유 기간 동안 낸 원리금",
            "받는 돈 = 판 값 − 남은 대출",
            /* [1009 · A · 리뷰] 코드(lib/ai/loan-calc.ts scenarioYields)는 복리 연환산 — 예전 문장("햇수로 나눠")은
               단순 평균이라 5억·LTV 60%·4.2%·30년·5년·낙관이면 설명대로 5.4%, 화면은 4.9%로 어긋났다 */
            YIELD_FORMULA_LINE,
            "받는 돈이 0 이하이면 −100%로 적어요.",
            "판 값은 시세 예측과 같은 낙관·기본·비관 시나리오 가격이에요.",
          ],
        };
      }
      return tileExplain({ key: "loanMonthly", label: m.label, value: m.value, note: null, asOf: null, source: "입력값 계산", confidence: "ok" });
    case "ai-economy":
      return { title: "기준금리", body: "한국은행이 정하는 정책 금리예요. 대출 금리는 여기에 은행 가산금리가 더해져요.", source: "한국은행 ECOS" };
    case "ai-inspection":
      return { title: m.label, how: ["같은 지역에서 최근 6개월 매매 거래가 많은 단지를 골랐어요."], source: "국토교통부 실거래" };
    default:
      return null;
  }
}
