/**
 * [993] 판단 카드(Verdict) — AI 분석 결과의 **결과값**을 한 형식으로 조립한다.
 * [1008 · W] 화면 이름은 "결과 요약"이다(소유자: "무슨 말인지 모르겠다" — 판단 카드·규칙 계산·갈림·
 * 판단 보류 같은 내부 말을 걷어냈다). 구간 이름은 좋음·보통·주의·자료 부족.
 *
 * 왜(2026-09-13 실측): 12종 도구의 결과 실체는 자유 마크다운이었고, `structuredSummary.score`
 * 는 입력에서만 읽어 항상 null, `headline` 은 본문 첫 90자를 자른 문장이었다. 그런데 이미
 * 계산되는 판정이 있었다 — 결과 구간(outcomeBand 4단) · 레이더 5축 · 타이밍 신호등 3개 ·
 * 리스크 플래그 5종 · 근거 각주(출처·기준일·표본). 그것을 말투 한 줄로만 쓰고 있었다.
 *
 * 이 모듈은 **데이터에 없는 수치를 만들지 않는다.** LiveToolContext(실데이터)와 insight-blocks 의
 * 판정만 조립해 `{ 구간, 한 줄 결론, 대표 수치 1, 핵심 숫자 타일 4(각각 기준일·출처 — 모르면 "자료 없음"),
 * 근거, 반대 조건 }` 을 돌려준다. 시세 예측의 1~5년 시나리오는 공개된 가정 규칙(lib/ai/price-scenarios.ts)
 * 으로 계산한 값이고 화면이 "가정 계산" 이라고 적는다.
 *
 * 순수 함수 — 서버(컨텍스트·실행 API)와 단위테스트가 같은 값을 본다. 브라우저 번들에는
 * 싣지 않는다(워크벤치 라우트 예산 480KB) — 클라이언트는 결과만 그린다.
 */

import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";
import type { LiveToolContext, Footnote } from "@/lib/ai/live-context";
import {
  diagnosisRadar,
  riskFlags,
  timingSignals,
  counterScenarios,
  judgeConfidence,
  type Confidence,
  type RadarAxis,
  type TimingSignal,
  type RiskFlag,
} from "@/lib/ai/insight-blocks";
import type { OutcomeBand } from "@/lib/ai/outcome-band";
import { contractCheck, type ContractCheck } from "@/lib/ai/contract-check";
import { loanCalc, scenarioYields, type LoanCalc } from "@/lib/ai/loan-calc";
import { CHECKLIST_FULL } from "@/lib/ai/workbench-constants";
import { formatKrwWon } from "@/lib/format/krw";
import { formatEokMan } from "@/lib/format/eok-man";
import { buildPriceScenario, signedPct, type PriceScenario } from "@/lib/ai/price-scenarios";

export type VerdictNumber = {
  key: string;
  label: string;
  value: string;
  /** yyyymm · ISO 날짜 · null(시점 없음) */
  asOf: string | null;
  source: string;
  confidence: Confidence;
};

/**
 * [1009 · A] 표시용 숫자 — 화면이 큰 가격(<Won> "5억 833만원")·등락(<Delta> "▲ 18.3%")으로 그린다.
 * **새 계산이 아니다** — 같은 칸의 value 문자열을 만든 숫자를 그대로 넘긴다(문자열을 다시 파싱하면 반올림 때문에
 * 어긋난다 — lib/market/temperature.ts 의 raw 와 같은 이유). 옛 스냅샷(공유 페이지)엔 없다 → 화면이 value 로 그린다.
 *  · won   : 만원(가격·대출액·이자·월 상환액)
 *  · delta : 변동률 %(지역 매매지수·시세 변화, 수익률) — base 는 비교 기준("1년 전(2025.08) 대비")
 */
export type VerdictDisplay =
  | { kind: "won"; manwon: number }
  | { kind: "delta"; pct: number; digits: 1 | 2; base: string };

/**
 * [1008] 핵심 숫자 타일 — 큰 숫자 + 한 줄 출처. 도구마다 4칸이 **고정**이고, 모르는 값은
 * value=null("—" + "자료 없음")로 둔다(빈칸을 다른 숫자로 메우지 않는다).
 */
export type VerdictTile = {
  key: string;
  label: string;
  value: string | null;
  /** 값 옆 보조 설명 — "~59㎡ 최근 6건 평균" */
  note: string | null;
  asOf: string | null;
  /** 짧은 출처 — "국토부 실거래" · "한국부동산원" */
  source: string;
  confidence: Confidence;
  /** [1009 · A] 표시용 숫자(없으면 value 문자열로 그린다) */
  display?: VerdictDisplay | null;
};

export type VerdictEvidence = {
  label: string;
  source: string;
  asOf: string | null;
  ageDays: number | null;
  sample: number | null;
  confidence: Confidence;
  href: string | null;
};

export type Verdict = {
  tool: AiAnalysisToolId;
  band: OutcomeBand;
  bandLabel: string;
  /** [1008] 알약 옆 짧은 이유 — "주의" 가 무엇 때문인지(가격 흐름·거래 열기가 파는 쪽 등). 옛 스냅샷엔 없다 */
  bandReason?: string | null;
  /** [1008] 알약이 무엇에 대한 것인가 — tool: 이 도구의 결론 · complex: 이 단지 종합(종합 진단 점수) */
  bandBasis?: "tool" | "complex";
  /** 쉬운 문장 한 줄 결론 — 본문을 자른 문장이 아니다 */
  headline: string;
  /** 도구의 대표 수치 — 재료가 없으면 null(칸을 비운다). [1009 · A] display = 표시용 숫자 */
  metric: {
    label: string;
    value: string;
    unit: string | null;
    note: string | null;
    asOf: string | null;
    display?: VerdictDisplay | null;
  } | null;
  /** 값이 있는 핵심 숫자 ≤3 — 임장노트 메모·저장 요약이 쓴다(예전 계약) */
  numbers: VerdictNumber[];
  /** [1008] 화면 타일 4칸(없는 값 포함) */
  tiles?: VerdictTile[];
  /** [1008] 시세 예측 — 낙관·기본·비관 1~5년(가정 계산) */
  scenario?: PriceScenario | null;
  /** [1008 · 리뷰 A-3] 전월세 계약 점검 — 입력(전세가율·보증금·등기부·보증보험)으로 만든 사실 목록 */
  contract?: ContractCheck | null;
  /** [1008 · 리뷰 A-3] 수익률 계산 — 기준 가격·대출 비율·금리·기간으로 낸 원리금균등 상환 */
  loan?: LoanCalc | null;
  /** [1008 · 리뷰 A-3] 투자 체크리스트 — 임장·계약 전에 확인할 항목(고정 목록 · 체크 상태는 기기에 저장) */
  checklist?: { title: string; items: { id: string; label: string }[] }[] | null;
  evidence: VerdictEvidence[];
  counters: string[];
  /** 계산 기준 시각(ISO) */
  computedAt: string;
};

/* [1008 · W] "갈림"·"판단 보류" 는 내부 말이었다 — 상태 알약은 좋음·보통·주의·자료 부족 */
export const BAND_LABEL: Record<OutcomeBand, string> = {
  strong: "좋음",
  mixed: "보통",
  weak: "주의",
  thin: "자료 부족",
};

/** 판단 카드에 넣을 수 있는 입력(전부 선택) — 워크벤치 보정 입력과 같은 키 */
export type VerdictInput = {
  maeMan?: number | null;
  jeonMan?: number | null;
  jeonseMan?: number | null;
  marketRatioPct?: number | null;
  horizonMonths?: number | null;
  compareCount?: number | null;
  similarCount?: number | null;
  /** [1008] 사용자가 넣은 기준 가격(만원) — 시세 예측 시나리오·대출 계산의 출발점 */
  basePriceMan?: number | null;
  /** [1008 · 리뷰 A-3] 계약 점검 토글 — 끈 상태도 뜻이 있다(확인 전 = 할 일) */
  hasRegistrationCheck?: boolean | null;
  hasInsurance?: boolean | null;
  /** [1008 · 리뷰 A-3] 대출 계산 */
  ltvPct?: number | null;
  mortgageRatePct?: number | null;
  loanTermYears?: number | null;
  holdingYears?: number | null;
};

/** [1008] 컨텍스트 밖 재료 — 단지 월별 실거래 요약(라우트가 따로 읽는다) */
export type VerdictExtras = {
  recent6?: { count: number; fromYm: string; toYm: string; span: number } | null;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

export function axisAgeDaysPure(asOf: string | null, now: Date): number | null {
  if (!asOf) return null;
  let d: Date | null = null;
  if (/^\d{6}$/.test(asOf)) d = new Date(Number(asOf.slice(0, 4)), Number(asOf.slice(4, 6)) - 1, 15);
  else {
    const t = Date.parse(asOf);
    d = Number.isNaN(t) ? null : new Date(t);
  }
  if (!d) return null;
  return Math.max(0, Math.round((now.getTime() - d.getTime()) / 86_400_000));
}

function pctStr(n: number | null | undefined, digits = 1): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return signedPct(n, digits);
}

/** 원 → "213만원"·"1.2억" — 짧은 금액은 "만"에 "원"을 붙인다 */
function manWon(krw: number): string {
  const t = formatKrwWon(krw, { style: "short" });
  return /만$/.test(t) ? `${t}원` : t;
}

function ymDot(ym: string | null | undefined): string | null {
  if (!ym) return null;
  if (/^\d{6}$/.test(ym)) return `${ym.slice(0, 4)}.${ym.slice(4)}`;
  return ym;
}

/* 건수 자체가 값인 축 — 표본 수로 신뢰를 깎지 않는다(오래됨만 본다).
   [1008] 실거래가도 — 규칙상 최근 3~6건 평균이라 늘 "거래 적음"이 붙었다(타일과 같은 규칙: 오래됨만). */
const COUNT_AXES = new Set(["입주 예정", "기준금리", "인구·미분양", "이웃 임장노트", "관련 뉴스", "학교", "지역 가격 흐름", "실거래가"]);

function evidenceOf(footnotes: Footnote[], now: Date): VerdictEvidence[] {
  return footnotes.map((f) => {
    const ageDays = axisAgeDaysPure(f.asOf, now);
    return {
      label: f.label,
      source: f.source,
      asOf: f.asOf,
      ageDays,
      sample: f.sample,
      confidence: judgeConfidence(COUNT_AXES.has(f.label) ? null : f.sample, ageDays),
      href: f.href,
    };
  });
}

/** 지역 이름 짧게 — "서울 강남구" → "강남구", "세종시" → "세종시" */
function regionShort(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "지역";
  const parts = n.split(/\s+/);
  return parts[parts.length - 1];
}

/* ── 핵심 숫자 타일 후보 — 없는 값은 value=null ───────────────────────── */

function tilePool(
  ctx: LiveToolContext,
  now: Date,
  extras: VerdictExtras,
  opts: { loan?: LoanCalc | null; areaLabel?: string | null } = {},
): Record<string, VerdictTile> {
  const price = ctx.complex?.price ?? null;
  const snap = ctx.region?.snapshot ?? null;
  const trend = ctx.region?.trend ?? null;
  const area = opts.areaLabel ?? regionShort(ctx.region?.name ?? ctx.complex?.region);
  /* [1008 · 리뷰 A-9] 조회가 실패한 칸은 "자료 없음"이 아니라 "지금 불러오지 못했어요" */
  const failed = new Set(ctx.unavailable ?? []);
  const FAILED_NOTE = "지금 불러오지 못했어요";
  const fieldAsOf = snap?.fieldAsOf ?? null;
  const loan = opts.loan ?? null;
  /* 건수 자체가 값인 칸은 오래됨만 본다. 대표가는 규칙상 최근 거래 3~6건 평균이라 "거래 적음" 을
     매번 붙이면 거짓 경고가 된다(캡처: "표본 적음 — 참고용" 이 늘 떴다) — 오래됨만 본다. */
  const ageConf = (asOf: string | null | undefined): Confidence =>
    asOf ? judgeConfidence(null, axisAgeDaysPure(asOf, now)) : "ok";
  const none = (key: string, label: string, source: string, note: string | null = null): VerdictTile => ({
    key,
    label,
    value: null,
    note,
    asOf: null,
    source,
    confidence: "insufficient",
  });

  const recent6 = extras.recent6 ?? ctx.complex?.recent6 ?? null;
  const snapSrc = snap?.source ?? "";
  const momSource = snapSrc.startsWith("KB") ? "KB" : snapSrc.includes("한국부동산원") ? "한국부동산원" : "지역 시세 통계";
  const monthly = snap?.saleChangeMonthly ?? null;

  return {
    price:
      loan && loan.priceKind === "input"
        ? {
            key: "price",
            label: "기준 가격",
            value: formatKrwWon(loan.priceKrw, { style: "short" }),
            note: "② 에 넣은 값",
            asOf: null,
            source: "입력값",
            confidence: "ok",
            display: { kind: "won", manwon: loan.priceKrw / 10_000 },
          }
        : price
      ? {
          key: "price",
          label: "최근 실거래가",
          value: formatKrwWon(price.priceKrw, { style: "short" }),
          note: `${price.bandLabel} 최근 ${price.sample ?? "몇"}건 평균`,
          asOf: price.latestYm,
          source: "국토부 실거래",
          confidence: ageConf(price.latestYm),
          display: { kind: "won", manwon: price.priceKrw / 10_000 },
        }
      : none("price", "최근 실거래가", "국토부 실거래", failed.has("실거래가") ? FAILED_NOTE : "같은 평형 거래 3건 미만"),
    trades6m:
      recent6 && recent6.span > 0
        ? {
            key: "trades6m",
            label: recent6.span >= 6 ? "최근 6개월 거래" : `최근 ${recent6.span}개월 거래`,
            value: `${recent6.count.toLocaleString("ko-KR")}건`,
            note: `이 단지 · ${ymDot(recent6.fromYm)}~${ymDot(recent6.toYm)}`,
            /* 기간이 note 에 있다 — 기준 달을 한 번 더 적지 않는다 */
            asOf: null,
            source: "국토부 실거래",
            confidence: recent6.count < 3 ? "thin" : "ok",
          }
        : none("trades6m", "최근 6개월 거래", "국토부 실거래", failed.has("실거래가") ? FAILED_NOTE : null),
    regionYoy:
      trend?.yoyPct != null
        ? {
            key: "regionYoy",
            label: "지역 1년 변화",
            value: signedPct(trend.yoyPct),
            note: `${area} 매매지수`,
            asOf: trend.asOf,
            source: "한국부동산원",
            confidence: ageConf(trend.asOf),
            display: {
              kind: "delta",
              pct: trend.yoyPct,
              digits: 1,
              base: trend.yoyFromYm ? `1년 전(${ymDot(trend.yoyFromYm)}) 대비` : "1년 전 대비",
            },
          }
        : none("regionYoy", "지역 1년 변화", "한국부동산원", failed.has("지역 가격 흐름") ? FAILED_NOTE : null),
    regionMom:
      monthly != null
        ? {
            key: "regionMom",
            label: "지역 한 달 변화",
            value: pctStr(monthly, 2) ?? "—",
            note: `${area} 시세`,
            asOf: fieldAsOf?.change ?? (snap?.period || null),
            source: momSource,
            confidence: ageConf(fieldAsOf?.change ?? (snap?.period || null)),
            display: { kind: "delta", pct: monthly, digits: 2, base: "지난달 대비" },
          }
        : none("regionMom", "지역 한 달 변화", "한국부동산원"),
    regionTrades:
      snap?.tradeCount != null
        ? {
            key: "regionTrades",
            label: "지역 한 달 거래",
            value: `${snap.tradeCount.toLocaleString("ko-KR")}건`,
            note: area,
            /* [1008 · 리뷰 A-20] 거래량은 매매지수보다 한 달 늦게 나온다 — 그 칸의 달로 적는다 */
            asOf: fieldAsOf?.trade ?? (snap.period || null),
            source: momSource,
            confidence: ageConf(fieldAsOf?.trade ?? (snap.period || null)),
          }
        : none("regionTrades", "지역 한 달 거래", "한국부동산원"),
    jeonseRatio:
      snap?.jeonseRatio != null
        ? {
            key: "jeonseRatio",
            label: "지역 전세가율",
            value: `${snap.jeonseRatio}%`,
            note: `${area} 매매가 대비 전세금`,
            asOf: fieldAsOf?.jeonse ?? (snap.period || null),
            source: momSource,
            confidence: ageConf(fieldAsOf?.jeonse ?? (snap.period || null)),
          }
        : none("jeonseRatio", "지역 전세가율", "한국부동산원"),
    supply: ctx.supply
      ? {
          key: "supply",
          label: "앞으로 입주",
          value: `${ctx.supply.upcomingHouseholds.toLocaleString("ko-KR")}세대`,
          note:
            ctx.supply.firstYm && ctx.supply.lastYm
              ? `${area} ${ctx.supply.upcomingComplexes}곳 · ${ymDot(ctx.supply.firstYm)}~${ymDot(ctx.supply.lastYm)}`
              : `${area} ${ctx.supply.upcomingComplexes}곳`,
          asOf: null,
          source: "청약홈",
          confidence: "ok",
        }
      : none("supply", "앞으로 입주", "청약홈", "입주 예정 없음 또는 자료 없음"),
    wolse:
      ctx.rent && ctx.rent.wolseSharePct != null
        ? {
            key: "wolse",
            label: "월세 비중",
            value: `${ctx.rent.wolseSharePct}%`,
            note: `${area} 최근 3개월 전월세 신고`,
            asOf: ctx.rent.asOf,
            source: "국토부 전월세",
            confidence: judgeConfidence(ctx.rent.sample ?? null, null),
          }
        : none("wolse", "월세 비중", "국토부 전월세"),
    unsold:
      ctx.region?.demographics && ctx.region.demographics.unsoldUnits != null
        ? {
            key: "unsold",
            label: "미분양",
            value: `${ctx.region.demographics.unsoldUnits.toLocaleString("ko-KR")}호`,
            note: area,
            asOf: ctx.region.demographics.period,
            source: "통계청 KOSIS",
            confidence: ageConf(ctx.region.demographics.period),
          }
        : none("unsold", "미분양", "통계청 KOSIS"),
    notes:
      ctx.notes && ctx.notes.count > 0
        ? {
            key: "notes",
            label: "이웃 임장노트",
            value: `${ctx.notes.count}건`,
            note: ctx.notes.avgScore != null ? `평균 ${ctx.notes.avgScore}점(5점 만점)` : null,
            asOf: ctx.notes.asOf,
            source: "내집나우 이웃",
            confidence: "ok",
          }
        : none("notes", "이웃 임장노트", "내집나우 이웃", "이웃이 쓴 공개 노트 0건"),
    baseRate:
      ctx.macro && ctx.macro.baseRatePct != null
        ? {
            key: "baseRate",
            label: "기준금리",
            value: `${ctx.macro.baseRatePct}%`,
            note: null,
            asOf: ctx.macro.asOf,
            source: "한국은행",
            confidence: ageConf(ctx.macro.asOf),
          }
        : none("baseRate", "기준금리", "한국은행"),
    /* [1008 · 리뷰 A-8] "3개월 뒤 예상" 칸은 뺐다 — 적중률을 공개한 규칙(/analysis/accuracy: 지역 실거래
       평당가 3개월 모멘텀)과 다른 식이었고, 1년 비관값이 3개월 값보다 낮게 같이 뜨는 모순이 있었다. */
    loanAmount: loan
      ? {
          key: "loanAmount",
          label: "대출액",
          value: formatKrwWon(loan.loanKrw, { style: "short" }),
          note: `가격의 ${loan.ltvPct}% · 내 돈 ${formatKrwWon(loan.equityKrw, { style: "short" })}`,
          asOf: null,
          source: "입력값 계산",
          confidence: "ok",
          display: { kind: "won", manwon: loan.loanKrw / 10_000 },
        }
      : none("loanAmount", "대출액", "입력값 계산", "② 에서 대출 비율·금리를 넣으면 계산"),
    loanInterest: loan
      ? {
          key: "loanInterest",
          label: loan.holdingInterestKrw != null ? `${loan.holdingYears}년 보유 동안 이자` : `${loan.termYears}년 총 이자`,
          value: manWon(loan.holdingInterestKrw ?? loan.totalInterestKrw),
          note:
            loan.holdingInterestKrw != null
              ? `${loan.termYears}년 전체로는 ${manWon(loan.totalInterestKrw)}`
              : `원리금균등 · 금리 ${loan.ratePct}%`,
          asOf: null,
          source: "입력값 계산",
          confidence: "ok",
          display: { kind: "won", manwon: (loan.holdingInterestKrw ?? loan.totalInterestKrw) / 10_000 },
        }
      : none("loanInterest", "총 이자", "입력값 계산"),
    loanMonthly: loan
      ? {
          key: "loanMonthly",
          label: "월 상환액",
          value: manWon(loan.monthlyKrw),
          note: `금리 1%p 오르면 월 ${manWon(loan.monthlyPlus1ppKrw)}`,
          asOf: null,
          source: "입력값 계산",
          confidence: "ok",
          display: { kind: "won", manwon: loan.monthlyKrw / 10_000 },
        }
      : none("loanMonthly", "월 상환액", "입력값 계산"),
  };
}

const TILE_KEYS: Record<AiAnalysisToolId, readonly string[]> = {
  "ai-diagnosis": ["price", "regionYoy", "trades6m", "jeonseRatio"],
  "ai-prediction": ["price", "regionYoy", "trades6m", "supply"],
  "ai-timing": ["price", "regionMom", "regionTrades", "supply"],
  "ai-inspection": ["price", "trades6m", "notes", "supply"],
  "ai-risk": ["price", "jeonseRatio", "supply", "wolse"],
  "ai-gap": ["price", "jeonseRatio", "wolse", "regionYoy"],
  "contract-risk": ["jeonseRatio", "wolse", "regionMom", "price"],
  "ai-simulator": ["price", "loanAmount", "loanMonthly", "loanInterest"],
  "ai-economy": ["baseRate", "unsold", "regionMom", "regionYoy"],
  "ai-compare": ["price", "trades6m", "regionYoy", "jeonseRatio"],
  "ai-portfolio": ["price", "trades6m", "regionYoy", "jeonseRatio"],
  "my-checklist": ["price", "trades6m", "notes", "supply"],
};

const SIGNAL_WORD: Record<TimingSignal["state"], string> = {
  green: "유리",
  yellow: "보통",
  red: "불리",
  na: "자료 없음",
};

/* ── 도구별 대표 수치·결론 ───────────────────────────────────────────── */

function radarSummary(radar: RadarAxis[]) {
  const scored = radar.filter((r): r is RadarAxis & { score: number } => typeof r.score === "number");
  if (scored.length === 0) return null;
  const avg = Math.round(scored.reduce((a, r) => a + r.score, 0) / scored.length);
  const weakest = [...scored].sort((a, b) => a.score - b.score)[0];
  const strongest = [...scored].sort((a, b) => b.score - a.score)[0];
  return { avg, measured: scored.length, total: radar.length, weakest, strongest };
}

/** "가격 흐름은" / "공급 여유는" — 받침에 맞는 조사 */
function topicJosa(word: string): string {
  const last = word.charCodeAt(word.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return `${word}은`;
  return (last - 0xac00) % 28 === 0 ? `${word}는` : `${word}은`;
}
function subjJosa(word: string): string {
  const last = word.charCodeAt(word.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return `${word}이`;
  return (last - 0xac00) % 28 === 0 ? `${word}가` : `${word}이`;
}

function toolMetric(
  tool: AiAnalysisToolId,
  ctx: LiveToolContext,
  insight: { radar: RadarAxis[]; signals: TimingSignal[]; flags: RiskFlag[] },
  input: VerdictInput,
  band: OutcomeBand,
): {
  metric: Verdict["metric"];
  headline: string;
  scenario?: PriceScenario | null;
  contract?: ContractCheck | null;
  loan?: LoanCalc | null;
  checklist?: Verdict["checklist"];
} {
  const snap = ctx.region?.snapshot ?? null;
  const price = ctx.complex?.price ?? null;
  const name = ctx.complex?.name ?? ctx.region?.name ?? "이 대상";

  switch (tool) {
    case "ai-diagnosis": {
      const r = radarSummary(insight.radar);
      if (!r) {
        return { metric: null, headline: `${name}: 점수를 낼 자료가 아직 부족해요.` };
      }
      return {
        metric: {
          label: "투자 점수",
          value: String(r.avg),
          unit: "점",
          note: `${r.total}개 항목 중 ${r.measured}개로 낸 평균`,
          asOf: snap?.period || price?.latestYm || null,
        },
        headline:
          band === "strong"
            ? `${name}: ${r.measured}개 항목이 고르게 좋아요 — 특히 ${r.strongest.label}(${r.strongest.score}점).`
            : band === "weak"
              ? `${name}: 평균 ${r.avg}점 — ${subjJosa(r.weakest.label)} 약해요(${r.weakest.score}점).`
              : r.strongest.key === r.weakest.key
                ? `${name}: 평균 ${r.avg}점 — ${r.strongest.label} 한 가지로만 본 점수예요.`
                : `${name}: 평균 ${r.avg}점 — ${topicJosa(r.strongest.label)} 좋고 ${topicJosa(r.weakest.label)} 약해요.`,
      };
    }
    case "ai-prediction": {
      const userStart = num(input.basePriceMan);
      const startKrw = userStart && userStart > 0 ? userStart * 10_000 : (price?.priceKrw ?? null);
      const scenario = buildPriceScenario({
        startKrw,
        startYm: userStart && userStart > 0 ? null : (price?.latestYm ?? null),
        startKind: userStart && userStart > 0 ? "input" : "recent",
        yoyPct: ctx.region?.trend?.yoyPct ?? null,
        momPct: snap?.saleChangeMonthly ?? null,
        horizonMonths: input.horizonMonths ?? null,
      });
      if (scenario) {
        const at = scenario.path[scenario.path.length - 1];
        const fmt = (n: number) => formatKrwWon(n, { style: "short" });
        return {
          scenario,
          metric: {
            label: `${scenario.years}년 뒤 기본 시나리오`,
            value: fmt(at.base),
            unit: null,
            note: `낙관 ${fmt(at.opt)} · 비관 ${fmt(at.pess)} · 가정 계산`,
            asOf: ctx.region?.trend?.asOf ?? snap?.period ?? null,
          },
          headline: `${name}: ${scenario.years}년 뒤 기본 ${fmt(at.base)} 안팎 — 낙관 ${fmt(at.opt)}, 비관 ${fmt(at.pess)}.`,
        };
      }
      return {
        scenario: null,
        metric: null,
        headline: startKrw
          ? `${name}: 지역 가격 흐름 자료가 없어 앞으로의 시나리오를 그리지 않았어요.`
          : `${name}: 최근 실거래가 모자라 출발 가격을 잡지 못했어요 — 기준 가격을 넣으면 계산해요.`,
      };
    }
    case "ai-timing": {
      const live = insight.signals.filter((s) => s.state !== "na");
      if (live.length === 0) {
        return { metric: null, headline: `${name}: 타이밍을 볼 자료가 아직 부족해요.` };
      }
      const green = live.filter((s) => s.state === "green").length;
      const red = live.filter((s) => s.state === "red").length;
      const verdictWord = green > red ? "협상 유리" : red > green ? "추격 매수 주의" : "지켜보기";
      return {
        metric: {
          label: "매수 신호",
          value: verdictWord,
          unit: null,
          note: insight.signals.map((s) => `${s.label} ${SIGNAL_WORD[s.state]}`).join(" · "),
          asOf: snap?.period || null,
        },
        headline:
          verdictWord === "협상 유리"
            ? `${name}: 신호 ${live.length}개 중 ${green}개가 사는 쪽에 유리해요 — 값을 깎아 볼 여지가 있어요.`
            : verdictWord === "추격 매수 주의"
              ? `${name}: 신호 ${live.length}개 중 ${red}개가 파는 쪽에 유리해요 — 지금 호가를 따라가지 마세요.`
              : `${name}: 신호가 엇갈려요 — 서두를 이유도, 미룰 이유도 뚜렷하지 않아요.`,
      };
    }
    case "ai-risk": {
      const warn = insight.flags.filter((f) => f.level === "warn");
      const measured = riskMeasured(ctx);
      /* [1008 · 리뷰 A-6] 5가지 중 3가지도 못 쟀으면 등급을 매기지 않는다 — 한 가지만 재고 "낮음"이라 하던 것 */
      if (measured < RISK_MIN_MEASURED) {
        return {
          metric: null,
          headline: `${name}: 5가지 위험 신호 중 ${measured}가지만 잴 수 있어 위험 수준을 매기지 않았어요 — 아래 항목별로 보세요.`,
        };
      }
      const grade = warn.length >= 2 ? "높음" : warn.length === 1 ? "보통" : "낮음";
      const unmeasured = 5 - measured;
      return {
        metric: {
          label: "위험 수준",
          value: grade,
          unit: null,
          note:
            warn.length > 0
              ? `걸린 항목: ${warn.map((f) => f.title).join(" · ")}`
              : unmeasured > 0
                ? `잰 ${measured}가지 중 걸린 항목 없음 · ${unmeasured}가지 자료 없음`
                : "5가지 중 걸린 항목 없음",
          asOf: snap?.period || null,
        },
        headline:
          warn.length === 0
            ? unmeasured > 0
              ? `${name}: 잰 ${measured}가지 위험 신호 중 걸린 게 없어요(${unmeasured}가지는 자료 없음).`
              : `${name}: 살펴본 5가지 위험 신호 중 걸린 게 없어요.`
            : unmeasured > 0
              ? `${name}: 잰 ${measured}가지 위험 신호 중 ${warn.length}가지가 걸렸어요(${unmeasured}가지는 자료 없음) — ${warn.map((f) => f.title).join(", ")}.`
              : `${name}: 5가지 위험 신호 중 ${warn.length}가지가 걸렸어요 — ${warn.map((f) => f.title).join(", ")}.`,
      };
    }
    case "ai-gap": {
      /* [1008 · 리뷰 A-3] 매매가 칸은 "비우면 최근 실거래가"라고 약속한다 — 전세가만 넣으면 최근 실거래가로 계산 */
      const maeIn = num(input.maeMan);
      const mae = maeIn ?? (price ? Math.round(price.priceKrw / 10_000) : null);
      const jeon = num(input.jeonMan);
      if (mae && jeon && mae > 0) {
        const gap = mae - jeon;
        const rate = Math.round((gap / mae) * 1000) / 10;
        return {
          metric: {
            label: maeIn != null ? "갭 비율 (입력값)" : "갭 비율 (전세가 입력 · 매매가는 최근 실거래가)",
            value: `${rate.toLocaleString("ko-KR")}`,
            unit: "%",
            /* [1009 · A] "34,500만원" 같은 억 미전환 표기를 표준(formatEokMan)으로 — 계산은 그대로 */
            note: `갭 ${formatEokMan(gap, { unit: "만원" })} = 매매 ${formatEokMan(mae, { unit: "만원" })} − 전세 ${formatEokMan(jeon, { unit: "만원" })}`,
            asOf: null,
          },
          headline: `${name}: 갭 ${formatEokMan(gap, { unit: "만원" })}(매매가의 ${rate}%) — ${rate <= 15 ? "적은 돈으로 들어가지만 전세가가 내리면 위험해요." : "필요한 돈은 크지만 전세가가 내려도 버틸 여유가 있어요."}`,
        };
      }
      if (price && snap?.jeonseRatio != null) {
        const rate = Math.round((100 - snap.jeonseRatio) * 10) / 10;
        return {
          metric: {
            label: "갭 비율 (지역 전세가율로 추정)",
            value: `${rate.toLocaleString("ko-KR")}`,
            unit: "%",
            note: `최근 실거래가 × (100 − 전세가율 ${snap.jeonseRatio}%) — 매매·전세가를 넣으면 정확해져요`,
            asOf: snap.period || null,
          },
          headline: `${name}: 지역 전세가율 ${snap.jeonseRatio}%로 추정하면 갭은 매매가의 약 ${rate}% — 이 단지 전세 실거래로 다시 확인하세요.`,
        };
      }
      return { metric: null, headline: `${name}: 매매가·전세가를 넣으면 갭을 계산해요.` };
    }
    case "contract-risk": {
      /* [1008 · 리뷰 A-3·7] 입력(전세가율·보증금·등기부·보증보험)으로 만든 사실 목록을 결과 카드로 싣는다.
         입력 없이 지역 평균 전세가율만 있으면 "안전"이라고 하지 않는다 — 이 계약이 아니라 지역 평균이다. */
      const contract = contractCheck(input, snap?.jeonseRatio ?? null);
      const ratio = contract.ratioPct;
      if (ratio == null) {
        return { metric: null, headline: "이 집 전세가율(보증금 ÷ 매매가)을 넣거나 단지를 고르면 위험도를 계산해요.", contract };
      }
      if (contract.ratioSource === "region") {
        const src = snap?.source ?? "지역 시세 통계";
        return {
          contract,
          metric: {
            label: "지역 평균 전세가율",
            value: `${ratio}`,
            unit: "%",
            note: `${src} · 이 집 전세가율을 넣으면 이 계약 기준으로 다시 계산해요`,
            asOf: snap?.fieldAsOf?.jeonse ?? (snap?.period || null),
          },
          headline:
            ratio >= 80
              ? `지역 평균 전세가율부터 ${ratio}%예요 — 이 집 보증금·매매가로 전세가율을 꼭 계산해 보세요.`
              : `지역 평균 전세가율 ${ratio}% — 지역 평균으로는 여유가 있어요. 이 집 전세가율을 넣어야 이 계약의 위험을 볼 수 있어요.`,
        };
      }
      const level = contract.level ?? "안전";
      return {
        contract,
        metric: {
          label: "전세 계약 위험도",
          value: level,
          unit: null,
          note: `전세가율 ${ratio}%(입력값) · 90% 이상 위험 · 80% 이상 주의`,
          asOf: null,
        },
        headline:
          level === "위험"
            ? `전세가율 ${ratio}% — 보증금이 매매가에 가까워요. 보증보험·등기부 확인 없이는 계약하지 마세요.`
            : level === "주의"
              ? `전세가율 ${ratio}% — 집값이 내리면 보증금을 돌려받기 어려울 수 있어요. 등기부·보증보험을 먼저 확인하세요.`
              : `전세가율 ${ratio}% — 숫자로는 여유가 있어요. 그래도 등기부의 근저당은 직접 보세요.`,
      };
    }
    case "ai-inspection": {
      const n = input.similarCount ?? 0;
      return {
        metric: n > 0 ? { label: "함께 볼 단지", value: String(n), unit: "곳", note: "같은 지역 최근 6개월 거래 많은 순", asOf: null } : null,
        headline:
          n > 0
            ? `${name} 포함 ${n + 1}곳을 하루 동선으로 — 거래가 많은 곳부터 둘러보세요.`
            : `${name}: 같은 지역에 함께 볼 거래 많은 단지가 아직 없어요 — 이 단지에 집중해 보세요.`,
      };
    }
    case "ai-compare": {
      const n = input.compareCount ?? 0;
      /* [1008 · 리뷰 A-3] "나란히 봤어요"는 화면이 실제로 나란히 그릴 때만 — 비교표(결과 화면)가 담은 단지의
         같은 숫자 칸을 한 줄씩 놓는다 */
      return {
        metric: n >= 2 ? { label: "비교 대상", value: String(n), unit: "곳", note: "같은 숫자 칸(가격·거래·지역 흐름·전세가율)으로 나란히", asOf: null } : null,
        headline:
          n >= 2
            ? `${n}곳을 같은 숫자 칸으로 나란히 놓았어요 — 아래 비교표에서 칸마다 견줘 보세요.`
            : "비교하려면 단지를 2곳 이상 담아 주세요 — 담으면 같은 숫자 칸으로 나란히 놓아요.",
      };
    }
    case "ai-economy": {
      return {
        metric:
          ctx.macro && ctx.macro.baseRatePct != null
            ? { label: "기준금리", value: `${ctx.macro.baseRatePct}`, unit: "%", note: "한국은행", asOf: ctx.macro.asOf }
            : null,
        headline:
          ctx.macro && ctx.macro.baseRatePct != null
            ? `기준금리 ${ctx.macro.baseRatePct}% — 대출 이자 부담이 어느 쪽으로 움직이는지 아래 숫자로 보세요.`
            : "금리 자료를 아직 못 읽었어요.",
      };
    }
    case "ai-simulator": {
      /* [1008 · 리뷰 A-3] 입력(기준 가격·대출 비율·금리·기간)으로 확실히 계산되는 것만 — 세금·중개비·임대료는 없다 */
      const userPrice = num(input.basePriceMan);
      const loan = loanCalc({
        priceKrw: userPrice && userPrice > 0 ? userPrice * 10_000 : (price?.priceKrw ?? null),
        priceKind: userPrice && userPrice > 0 ? "input" : "recent",
        ltvPct: input.ltvPct,
        ratePct: input.mortgageRatePct,
        termYears: input.loanTermYears,
        holdingYears: input.holdingYears,
      });
      if (!loan) {
        const p = userPrice && userPrice > 0 ? userPrice * 10_000 : (price?.priceKrw ?? null);
        return {
          loan: null,
          metric: null,
          headline: p
            ? `${name}: 기준 가격 ${formatKrwWon(p, { style: "short" })} — ② 에서 대출 비율·금리를 넣으면 월 상환액과 이자를 계산해요.`
            : `${name}: 최근 실거래가가 없어요 — ② 에서 기준 가격·대출 비율·금리를 넣으면 계산해요.`,
        };
      }
      /* 보유 기간을 넣었으면 시세 예측과 같은 시나리오 가격에 판다고 가정한 연 수익률까지 — 도구 이름이 약속하는 것 */
      const sc = buildPriceScenario({
        startKrw: loan.priceKrw,
        startYm: null,
        startKind: loan.priceKind,
        yoyPct: ctx.region?.trend?.yoyPct ?? null,
        momPct: snap?.saleChangeMonthly ?? null,
        horizonMonths: loan.holdingYears != null ? loan.holdingYears * 12 : null,
      });
      const yields = scenarioYields(loan, sc?.annual ?? null);
      const withYields: LoanCalc = { ...loan, yields };
      const base = yields?.find((y) => y.key === "base") ?? null;
      if (base && loan.holdingYears != null) {
        const opt = yields!.find((y) => y.key === "opt")!;
        const pess = yields!.find((y) => y.key === "pess")!;
        return {
          loan: withYields,
          metric: {
            label: `${loan.holdingYears}년 보유 · 기본 시나리오 연 수익률`,
            value: signedPct(base.annualPct, 1),
            unit: null,
            note: `비관 ${signedPct(pess.annualPct, 1)} ~ 낙관 ${signedPct(opt.annualPct, 1)} · 넣은 돈 대비 · 세금·중개비·임대료 제외 · 가정 계산`,
            asOf: null,
            display: { kind: "delta", pct: base.annualPct, digits: 1, base: "넣은 돈 대비" },
          },
          headline: `${name}: ${formatKrwWon(loan.loanKrw, { style: "short" })}을 빌려 ${loan.holdingYears}년 보유하면 기본 시나리오로 넣은 돈 대비 연 ${signedPct(base.annualPct, 1)} — 월 상환액은 ${manWon(loan.monthlyKrw)}이에요.`,
        };
      }
      return {
        loan: withYields,
        metric: {
          label: "월 상환액",
          value: manWon(loan.monthlyKrw),
          display: { kind: "won", manwon: loan.monthlyKrw / 10_000 },
          unit: null,
          note: `대출 ${formatKrwWon(loan.loanKrw, { style: "short" })}(${loan.ltvPct}%) · 금리 ${loan.ratePct}% · ${loan.termYears}년 원리금균등${loan.termAssumed ? "(기간 비워 30년)" : ""}`,
          asOf: null,
        },
        headline: `${name}: ${formatKrwWon(loan.priceKrw, { style: "short" })}에 ${formatKrwWon(loan.loanKrw, { style: "short" })}을 빌리면 월 ${manWon(loan.monthlyKrw)} — 금리가 1%p 오르면 월 ${manWon(loan.monthlyPlus1ppKrw - loan.monthlyKrw)} 더 내요.${loan.holdingYears == null ? " 보유 기간을 넣으면 수익률도 계산해요." : ""}`,
      };
    }
    case "ai-portfolio":
      /* [1008 · 리뷰 A-3] 쏠림(지역·가격대)은 결과 화면의 "관심 단지 구성" 카드가 불러온 목록으로 센다 —
         여기 결론은 고른 한 단지의 것이다 */
      return {
        metric: null,
        headline: `${name}: 관심 단지 중 이 단지의 숫자와 흐름이에요 — 전체 구성(지역·가격대)은 위 카드에서 봐요.`,
      };
    case "my-checklist": {
      const checklist = CHECKLIST_FULL.map((c) => ({ title: c.title, items: c.items.map((i) => ({ id: i.id, label: i.label })) }));
      const total = checklist.reduce((a, c) => a + c.items.length, 0);
      return {
        checklist,
        metric: { label: "확인할 항목", value: String(total), unit: "개", note: `${checklist.length}개 분야 · 체크하면 이 기기에 저장돼요`, asOf: null },
        headline: `${name}: 임장·계약 전에 확인할 ${total}개 항목이에요 — 현장에서 하나씩 체크해 보세요.`,
      };
    }
    default:
      return { metric: null, headline: `${name} 분석 결과예요.` };
  }
}

/** [1008] 상태 알약 — 구간·이유 한 줄·무엇에 대한 알약인지 */
type BandCall = { band: OutcomeBand; reason: string; basis: "tool" | "complex" };

const THIN_REASON = "판단할 자료가 모자라요";

/** 리스크 5가지 중 잰 항목 수 — 거래량·전세가율·입주 물량·미분양·월세 비중 */
function riskMeasured(ctx: LiveToolContext): number {
  const snap = ctx.region?.snapshot ?? null;
  return (
    (snap?.tradeCount != null ? 1 : 0) +
    (snap?.jeonseRatio != null ? 1 : 0) +
    (ctx.supply ? 1 : 0) +
    (ctx.region?.demographics?.unsoldUnits != null ? 1 : 0) +
    (ctx.rent?.wolseSharePct != null ? 1 : 0)
  );
}
/** [1008 · 리뷰 A-6] 리스크 등급·알약을 매기려면 5가지 중 이만큼은 재야 한다 */
const RISK_MIN_MEASURED = 3;

/** 알약을 매기려면 최소 이만큼의 항목을 쟀어야 한다 — 한 항목 점수를 "종합"이라 부르지 않는다 */
const MIN_SCORED_AXES = 2;

/** 종합 진단 점수 구간 — 65점 이상 좋음 · 45점 미만 주의(outcomeBand 와 같은 경계) */
function scoreBand(radar: RadarAxis[]): OutcomeBand {
  const r = radarSummary(radar);
  if (!r || r.measured < MIN_SCORED_AXES) return "thin";
  return r.avg >= 65 ? "strong" : r.avg < 45 ? "weak" : "mixed";
}

/**
 * [1008] 구간 — 결론 문장과 상태 알약이 서로 다른 말을 하지 않게 **도구마다 자기 결론으로** 정한다.
 * 예전엔 판단 도구 셋(진단·타이밍·리스크) 밖의 도구가 전부 종합 규칙(outcomeBand)을 써서, 타이밍 신호
 * 하나 때문에 "전세 계약 위험도 안전" 옆에 "주의", 임장 동선 옆에 "주의 — 파는 쪽에 유리" 가 붙었다
 * (운영 픽스처 실측: 은마 12개 도구 중 9개가 "주의"). 새 판정은 없다 — 화면에 이미 있는 재료만 쓴다.
 *  · 종합 진단: 5개 항목 평균 점수 · 매수 타이밍: 신호등 · 리스크 점검: 걸린 위험 항목 수
 *  · 시세 예측: 기본 시나리오 방향(연 ±1% 밖이면 오름세·내림세) · 전월세 계약 점검: 전세가율 80%·90%
 *  · 경제 모니터: 금리 환경 점수 · 그 밖(임장 동선·갭·시뮬레이터·비교·배분·체크리스트): 이 단지 종합 점수
 */
function toolBand(
  tool: AiAnalysisToolId,
  insight: { radar: RadarAxis[]; signals: TimingSignal[]; flags: RiskFlag[] },
  ctx: LiveToolContext,
  input: VerdictInput,
  scenario: PriceScenario | null | undefined,
): BandCall {
  /* [1008 · 리뷰 A-5] AI 해설(외부 모델)의 성공·실패는 알약을 바꾸지 않는다 — 알약은 공공데이터 계산이다.
     예전엔 모델 오류·예산 초과(LLM_PROVIDER_ERROR·MODEL_OPTION_NOT_FOUND)를 "데이터 부족"으로 세어 '자료 부족'이 됐다. */
  const r = radarSummary(insight.radar);
  switch (tool) {
    case "ai-timing": {
      const live = insight.signals.filter((s) => s.state !== "na");
      if (live.length === 0) return { band: "thin", reason: THIN_REASON, basis: "tool" };
      const green = live.filter((s) => s.state === "green").length;
      const red = live.filter((s) => s.state === "red").length;
      return {
        band: green > red ? "strong" : red > green ? "weak" : "mixed",
        reason: `신호 ${live.length}개 중 사는 쪽 유리 ${green} · 파는 쪽 유리 ${red}`,
        basis: "tool",
      };
    }
    case "ai-risk": {
      const measured = riskMeasured(ctx);
      /* [1008 · 리뷰 A-6] 5가지 중 3가지도 못 쟀으면 "좋음·걸린 것 없음"이라 하지 않는다 */
      if (measured < RISK_MIN_MEASURED) {
        return { band: "thin", reason: `5가지 중 ${measured}가지만 잴 수 있었어요`, basis: "tool" };
      }
      const warn = insight.flags.filter((f) => f.level === "warn").length;
      const unmeasured = 5 - measured;
      return {
        band: warn >= 2 ? "weak" : warn === 1 ? "mixed" : "strong",
        reason:
          warn === 0
            ? unmeasured > 0
              ? `잰 ${measured}가지 중 걸린 것 없음(${unmeasured}가지 자료 없음)`
              : "5가지 위험 신호 중 걸린 것 없음"
            : unmeasured > 0
              ? `잰 ${measured}가지 중 ${warn}가지 걸림(${unmeasured}가지 자료 없음)`
              : `5가지 중 ${warn}가지 걸림`,
        basis: "tool",
      };
    }
    case "ai-diagnosis": {
      if (!r) return { band: "thin", reason: THIN_REASON, basis: "tool" };
      if (r.measured < MIN_SCORED_AXES) {
        return { band: "thin", reason: `${r.total}개 항목 중 ${r.measured}개만 잴 수 있었어요`, basis: "tool" };
      }
      return {
        band: scoreBand(insight.radar),
        reason: `${r.measured}개 항목 평균 ${r.avg}점 — 65점 이상 좋음 · 45점 미만 주의`,
        basis: "tool",
      };
    }
    case "ai-prediction": {
      if (!scenario) {
        const hasStart = Boolean(ctx.complex?.price) || (num(input.basePriceMan) ?? 0) > 0;
        return {
          band: "thin",
          reason: hasStart ? "지역 가격 흐름 자료가 없어요" : "최근 실거래가 모자라 출발 가격이 없어요",
          basis: "tool",
        };
      }
      /* 말투(tool-persona tone)와 같은 경계 — 좋음: 비관까지 세 시나리오 모두 오름 · 주의: 기본도 내림 ·
         보통: 시나리오마다 방향이 갈림(낙관은 오르고 비관은 내림) */
      const { base, pess } = scenario.annual;
      const pct = signedPct(base, 1);
      return pess > 0
        ? { band: "strong", reason: `세 시나리오 모두 오름세(기본 연 ${pct})`, basis: "tool" }
        : base < 0
          ? { band: "weak", reason: `기본 시나리오도 내림세(연 ${pct})`, basis: "tool" }
          : { band: "mixed", reason: `시나리오마다 방향이 달라요(기본 연 ${pct})`, basis: "tool" };
    }
    case "contract-risk": {
      const inputRatio = num(input.marketRatioPct);
      const regionRatio = ctx.region?.snapshot?.jeonseRatio ?? null;
      if (inputRatio != null && inputRatio > 0) {
        return inputRatio >= 90
          ? { band: "weak", reason: `전세가율 ${inputRatio}% — 90% 이상`, basis: "tool" }
          : inputRatio >= 80
            ? { band: "weak", reason: `전세가율 ${inputRatio}% — 80% 이상`, basis: "tool" }
            : { band: "strong", reason: `전세가율 ${inputRatio}% — 80% 미만`, basis: "tool" };
      }
      /* [1008 · 리뷰 A-7] 입력 없이 지역 평균만 — "좋음·안전"이라 하지 않는다(이 계약이 아니라 지역 평균) */
      if (regionRatio == null) return { band: "thin", reason: "전세가율 자료가 없어요", basis: "tool" };
      return regionRatio >= 80
        ? { band: "weak", reason: `지역 평균 전세가율부터 ${regionRatio}%`, basis: "tool" }
        : { band: "mixed", reason: "지역 평균으로 본 참고값 — 이 집 전세가율을 넣으면 정확해져요", basis: "tool" };
    }
    case "ai-economy": {
      const macro = insight.radar.find((a) => a.key === "macro");
      if (!macro || typeof macro.score !== "number") return { band: "thin", reason: "금리 자료가 없어요", basis: "tool" };
      return {
        band: macro.score >= 65 ? "strong" : macro.score < 45 ? "weak" : "mixed",
        reason: `${macro.basis} — 금리 환경 ${macro.score}점`,
        basis: "tool",
      };
    }
    default: {
      /* 판단을 내리는 도구가 아니다 — 알약은 "이 단지 종합" 이고, 이유 줄이 그렇게 말한다 */
      if (!r || r.measured < MIN_SCORED_AXES) return { band: "thin", reason: THIN_REASON, basis: "complex" };
      const who = ctx.complex ? "이 단지" : "이 지역";
      return { band: scoreBand(insight.radar), reason: `${who} 종합 점수 ${r.avg}점(종합 진단 기준)`, basis: "complex" };
    }
  }
}

export function buildVerdict(params: {
  tool: AiAnalysisToolId;
  ctx: LiveToolContext;
  footnotes: Footnote[];
  input?: VerdictInput;
  extras?: VerdictExtras;
  now?: Date;
}): Verdict {
  const now = params.now ?? new Date();
  const insight = {
    radar: diagnosisRadar(params.ctx),
    signals: timingSignals(params.ctx),
    flags: riskFlags(params.ctx),
  };
  /* 종합 진단 결론 문장은 점수 구간으로 말투를 고른다 — 알약(toolBand)과 같은 경계 */
  const { metric, headline, scenario, contract, loan, checklist } = toolMetric(
    params.tool,
    params.ctx,
    insight,
    params.input ?? {},
    scoreBand(insight.radar),
  );
  const pool = tilePool(params.ctx, now, params.extras ?? {}, {
    loan: loan ?? null,
    /* [1008 · 리뷰 A-23] 경제 모니터의 지역 칸은 한 지역(서울 강남구) 값이다 — 그렇게 적는다 */
    areaLabel: params.tool === "ai-economy" ? "서울 강남구 기준" : null,
  });
  const call = toolBand(params.tool, insight, params.ctx, params.input ?? {}, scenario);
  const band = call.band;
  const tiles = (TILE_KEYS[params.tool] ?? TILE_KEYS["ai-diagnosis"]).map((k) => pool[k]).filter(Boolean);
  const numbers: VerdictNumber[] = tiles
    .filter((t): t is VerdictTile & { value: string } => t.value != null)
    .slice(0, 3)
    .map((t) => ({ key: t.key, label: t.label, value: t.value, asOf: t.asOf, source: t.source, confidence: t.confidence }));
  return {
    tool: params.tool,
    band,
    bandLabel: BAND_LABEL[band],
    bandReason: call.reason,
    bandBasis: call.basis,
    headline,
    metric,
    numbers,
    tiles,
    ...(params.tool === "ai-prediction" ? { scenario: scenario ?? null } : {}),
    ...(params.tool === "contract-risk" ? { contract: contract ?? null } : {}),
    ...(params.tool === "ai-simulator" ? { loan: loan ?? null } : {}),
    ...(params.tool === "my-checklist" ? { checklist: checklist ?? null } : {}),
    evidence: evidenceOf(params.footnotes, now),
    counters: counterScenarios(params.ctx),
    computedAt: now.toISOString(),
  };
}

/** 판단 카드 → 저장용 요약(structuredSummary 호환). 점수는 대표 수치가 숫자일 때만. */
export function verdictToSummary(v: Verdict): { headline: string; bullets: string[]; score: number | null } {
  const score = v.metric && /^\d+(\.\d+)?$/.test(v.metric.value) ? Number(v.metric.value) : null;
  return {
    headline: v.headline,
    bullets: v.numbers.map((n) => `${n.label} ${n.value}${n.asOf ? ` (${n.asOf})` : ""}`),
    score,
  };
}
