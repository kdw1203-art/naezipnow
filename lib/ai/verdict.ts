/**
 * [993] 판단 카드(Verdict) — AI 분석 결과의 **결과값**을 한 형식으로 조립한다.
 *
 * 왜(2026-09-13 실측): 12종 도구의 결과 실체는 자유 마크다운이었고, `structuredSummary.score`
 * 는 입력에서만 읽어 항상 null, `headline` 은 본문 첫 90자를 자른 문장이었다. 그런데 이미
 * 계산되는 판정이 있었다 — 결과 구간(outcomeBand 4단) · 레이더 5축 · 타이밍 신호등 3개 ·
 * 리스크 플래그 5종 · 근거 각주(출처·기준일·표본). 그것을 말투 한 줄로만 쓰고 있었다.
 *
 * 이 모듈은 **새 수치를 만들지 않는다.** LiveToolContext(실데이터)와 insight-blocks 의 판정만
 * 조립해 `{ 구간, 한 줄 결론, 대표 수치 1, 핵심 숫자 ≤3(각각 기준일·출처), 근거 칩, 반대 조건,
 * 다음 행동 }` 을 돌려준다. 재료가 없으면 해당 칸을 비운다(0이나 50을 지어내지 않는다).
 *
 * 순수 함수 — 서버(컨텍스트·실행 API)와 단위테스트가 같은 값을 본다. 브라우저 번들에는
 * 싣지 않는다(워크벤치 라우트 예산 480KB 에 여유가 7KB 뿐이다) — 클라이언트는 결과만 그린다.
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
import { outcomeBand, type OutcomeBand } from "@/lib/ai/outcome-band";
import { formatKrwWon } from "@/lib/format/krw";

export type VerdictNumber = {
  key: string;
  label: string;
  value: string;
  /** yyyymm · ISO 날짜 · null(시점 없음) */
  asOf: string | null;
  source: string;
  confidence: Confidence;
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
  /** 규칙이 만든 한 줄 결론 — 본문을 자른 문장이 아니다 */
  headline: string;
  /** 도구의 대표 수치 — 재료가 없으면 null(칸을 비운다) */
  metric: { label: string; value: string; unit: string | null; note: string | null; asOf: string | null } | null;
  numbers: VerdictNumber[];
  evidence: VerdictEvidence[];
  counters: string[];
  /** 규칙 계산 기준 시각(ISO) */
  computedAt: string;
};

export const BAND_LABEL: Record<OutcomeBand, string> = {
  strong: "좋음",
  mixed: "갈림",
  weak: "주의",
  thin: "판단 보류",
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
  const v = Math.round(n * 10 ** digits) / 10 ** digits;
  return `${v > 0 ? "+" : ""}${v.toLocaleString("ko-KR")}%`;
}

/* 건수 자체가 값인 축 — 표본 수로 신뢰를 깎지 않는다(오래됨만 본다) */
const COUNT_AXES = new Set(["입주 예정 물량", "기준금리", "인구·미분양", "이웃 임장노트", "최근 사건(뉴스)", "학교(표준데이터)"]);

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

/* 핵심 숫자 후보 — 도구가 고른다. 없는 값은 만들지 않는다. */
function numberPool(ctx: LiveToolContext, now: Date): Record<string, VerdictNumber | null> {
  const price = ctx.complex?.price ?? null;
  const snap = ctx.region?.snapshot ?? null;
  const conf = (m: { sample?: number | null; asOf: string | null } | null) =>
    m ? judgeConfidence(m.sample ?? null, axisAgeDaysPure(m.asOf, now)) : "insufficient";
  /* 건수 자체가 값인 축(입주 예정·미분양·노트 수·기준금리)은 표본 수로 신뢰를 깎지 않는다 —
     "입주 예정 396세대 · 판단 불가(표본 부족)" 은 말이 안 된다. 오래됨만 본다. */
  const confAge = (m: { asOf: string | null } | null) =>
    m ? judgeConfidence(null, axisAgeDaysPure(m.asOf, now)) : "insufficient";
  return {
    price: price
      ? {
          key: "price",
          label: `대표 실거래가 (${price.bandLabel})`,
          value: formatKrwWon(price.priceKrw, { style: "short" }),
          asOf: price.latestYm,
          source: price.source,
          confidence: conf(price),
        }
      : null,
    change: snap && snap.saleChangeMonthly != null
      ? {
          key: "change",
          label: "지역 월간 변동",
          value: pctStr(snap.saleChangeMonthly) ?? "—",
          asOf: snap.period,
          source: snap.source,
          confidence: conf(snap),
        }
      : null,
    trades: snap && snap.tradeCount != null
      ? {
          key: "trades",
          label: "지역 월 거래",
          value: `${snap.tradeCount.toLocaleString("ko-KR")}건`,
          asOf: snap.period,
          source: snap.source,
          confidence: conf(snap),
        }
      : null,
    jeonseRatio: snap && snap.jeonseRatio != null
      ? {
          key: "jeonseRatio",
          label: "지역 전세가율",
          value: `${snap.jeonseRatio}%`,
          asOf: snap.period,
          source: snap.source,
          confidence: conf(snap),
        }
      : null,
    supply: ctx.supply
      ? {
          key: "supply",
          label: "입주 예정",
          value: `${ctx.supply.upcomingHouseholds.toLocaleString("ko-KR")}세대`,
          asOf: ctx.supply.asOf,
          source: ctx.supply.source,
          confidence: confAge(ctx.supply),
        }
      : null,
    wolse: ctx.rent && ctx.rent.wolseSharePct != null
      ? {
          key: "wolse",
          label: "월세 비중(신고)",
          value: `${ctx.rent.wolseSharePct}%`,
          asOf: ctx.rent.asOf,
          source: ctx.rent.source,
          confidence: conf(ctx.rent),
        }
      : null,
    baseRate: ctx.macro && ctx.macro.baseRatePct != null
      ? {
          key: "baseRate",
          label: "기준금리",
          value: `${ctx.macro.baseRatePct}%`,
          asOf: ctx.macro.asOf,
          source: ctx.macro.source,
          confidence: confAge(ctx.macro),
        }
      : null,
    unsold: ctx.region?.demographics && ctx.region.demographics.unsoldUnits != null
      ? {
          key: "unsold",
          label: "미분양",
          value: `${ctx.region.demographics.unsoldUnits.toLocaleString("ko-KR")}호`,
          asOf: ctx.region.demographics.period,
          source: ctx.region.demographics.source,
          confidence: confAge(ctx.region.demographics),
        }
      : null,
    notes: ctx.notes && ctx.notes.count > 0
      ? {
          key: "notes",
          label: "이웃 임장노트",
          value: `${ctx.notes.count}건${ctx.notes.avgScore != null ? ` · 평균 ${ctx.notes.avgScore}점` : ""}`,
          asOf: ctx.notes.asOf,
          source: ctx.notes.source,
          confidence: confAge(ctx.notes),
        }
      : null,
  };
}

function pick(pool: Record<string, VerdictNumber | null>, keys: string[], max = 3): VerdictNumber[] {
  const out: VerdictNumber[] = [];
  for (const k of keys) {
    const v = pool[k];
    if (v) out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

const SIGNAL_WORD: Record<TimingSignal["state"], string> = {
  green: "유리",
  yellow: "보통",
  red: "주의",
  na: "미측정",
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

function toolMetric(
  tool: AiAnalysisToolId,
  ctx: LiveToolContext,
  insight: { radar: RadarAxis[]; signals: TimingSignal[]; flags: RiskFlag[] },
  input: VerdictInput,
  band: OutcomeBand,
): { metric: Verdict["metric"]; headline: string; numberKeys: string[] } {
  const snap = ctx.region?.snapshot ?? null;
  const price = ctx.complex?.price ?? null;
  const name = ctx.complex?.name ?? ctx.region?.name ?? "이 대상";

  switch (tool) {
    case "ai-diagnosis": {
      const r = radarSummary(insight.radar);
      if (!r) {
        return {
          metric: null,
          headline: `${name}: 채점할 축이 없어 점수를 비워 뒀어요.`,
          numberKeys: ["price", "change", "supply"],
        };
      }
      return {
        metric: {
          label: "투자 점수",
          value: String(r.avg),
          unit: "점",
          note: `${r.measured}/${r.total}축 측정 평균`,
          asOf: snap?.period ?? price?.latestYm ?? null,
        },
        headline:
          band === "strong"
            ? `${name}: ${r.measured}축이 고르게 좋아요 — 가장 강한 축은 ${r.strongest.label}(${r.strongest.score}점).`
            : band === "weak"
              ? `${name}: 평균 ${r.avg}점 — ${r.weakest.label}(${r.weakest.score}점)이 점수를 끌어내려요.`
              : `${name}: 평균 ${r.avg}점 — ${r.strongest.label}은 좋고 ${r.weakest.label}은 약해요.`,
        numberKeys: ["price", "change", "trades", "supply"],
      };
    }
    case "ai-prediction": {
      /* 공개 예측 규칙(lib/ai/backtest.ts)과 같은 것: 월간 변동률을 3개월 외삽. 다른 모델을
         쓰면 /analysis/accuracy 의 적중률과 다른 숫자가 된다 — 같은 규칙만 쓴다. */
      const monthly = snap?.saleChangeMonthly ?? null;
      if (price && monthly != null) {
        const projected = price.priceKrw * (1 + monthly / 100) ** 3;
        return {
          metric: {
            label: "3개월 뒤 기준가 (모멘텀 외삽)",
            value: formatKrwWon(projected, { style: "short" }),
            unit: null,
            note: `현재 ${formatKrwWon(price.priceKrw, { style: "short" })} × 월 ${pctStr(monthly)} 3회 · 예측은 예측`,
            asOf: snap?.period ?? null,
          },
          headline:
            monthly >= 0.8
              ? `${name}: 지역 월간 ${pctStr(monthly)} — 같은 속도면 3개월 뒤 ${formatKrwWon(projected, { style: "short" })} 안팎. 추격 매수는 주의.`
              : monthly <= -0.5
                ? `${name}: 지역 월간 ${pctStr(monthly)} — 조정 구간. 3개월 뒤 ${formatKrwWon(projected, { style: "short" })} 안팎.`
                : `${name}: 지역 월간 ${pctStr(monthly)} — 보합. 3개월 뒤도 ${formatKrwWon(projected, { style: "short" })} 안팎.`,
          numberKeys: ["price", "change", "trades", "supply"],
        };
      }
      return {
        metric: null,
        headline: `${name}: 실거래 표본이나 지역 변동률이 없어 예측을 비워 뒀어요.`,
        numberKeys: ["price", "change", "supply"],
      };
    }
    case "ai-timing": {
      const live = insight.signals.filter((s) => s.state !== "na");
      if (live.length === 0) {
        return { metric: null, headline: `${name}: 타이밍을 볼 신호가 없어요.`, numberKeys: ["price", "change", "supply"] };
      }
      const green = live.filter((s) => s.state === "green").length;
      const red = live.filter((s) => s.state === "red").length;
      const verdictWord = green > red ? "협상 유리" : red > green ? "추격 주의" : "관망";
      return {
        metric: {
          label: "매수 시그널",
          value: verdictWord,
          unit: null,
          note: insight.signals.map((s) => `${s.label} ${SIGNAL_WORD[s.state]}`).join(" · "),
          asOf: snap?.period ?? null,
        },
        headline:
          verdictWord === "협상 유리"
            ? `${name}: ${live.length}개 신호 중 ${green}개가 매수자에게 유리해요 — 급매 협상 여지가 있어요.`
            : verdictWord === "추격 주의"
              ? `${name}: ${red}개 신호가 과열 쪽이에요 — 지금 호가를 따라가지 마세요.`
              : `${name}: 신호가 엇갈려요 — 서두를 이유도, 미룰 이유도 뚜렷하지 않아요.`,
        numberKeys: ["change", "trades", "supply"],
      };
    }
    case "ai-risk": {
      const warn = insight.flags.filter((f) => f.level === "warn").length;
      const grade = warn >= 2 ? "높음" : warn === 1 ? "보통" : "낮음";
      return {
        metric: {
          label: "리스크 등급",
          value: grade,
          unit: null,
          note: insight.flags.length > 0 ? insight.flags.map((f) => f.title).join(" · ") : "걸리는 플래그 없음",
          asOf: snap?.period ?? null,
        },
        headline:
          warn === 0
            ? `${name}: 규칙이 보는 5가지 리스크 중 걸리는 게 없어요.`
            : `${name}: 경고 ${warn}건 — ${insight.flags.filter((f) => f.level === "warn").map((f) => f.title).join(", ")}.`,
        numberKeys: ["trades", "jeonseRatio", "supply", "unsold"],
      };
    }
    case "ai-gap": {
      const mae = num(input.maeMan);
      const jeon = num(input.jeonMan);
      if (mae && jeon && mae > 0) {
        const gap = mae - jeon;
        const rate = Math.round((gap / mae) * 1000) / 10;
        return {
          metric: {
            label: "갭 비율 (입력값)",
            value: `${rate.toLocaleString("ko-KR")}`,
            unit: "%",
            note: `갭 ${gap.toLocaleString("ko-KR")}만원 = 매매 ${mae.toLocaleString("ko-KR")} − 전세 ${jeon.toLocaleString("ko-KR")}`,
            asOf: null,
          },
          headline: `${name}: 갭 ${gap.toLocaleString("ko-KR")}만원(${rate}%) — ${rate <= 15 ? "초기 자본은 가볍지만 역전세에 민감해요." : "자본 부담은 있어도 역전세 완충은 넓어요."}`,
          numberKeys: ["jeonseRatio", "wolse", "trades"],
        };
      }
      if (price && snap?.jeonseRatio != null) {
        const rate = Math.round((100 - snap.jeonseRatio) * 10) / 10;
        return {
          metric: {
            label: "갭 비율 (지역 전세가율 적용 추정)",
            value: `${rate.toLocaleString("ko-KR")}`,
            unit: "%",
            note: `대표 실거래가 × (100 − 전세가율 ${snap.jeonseRatio}%) — 매매·전세가를 입력하면 정확해져요`,
            asOf: snap.period,
          },
          headline: `${name}: 지역 전세가율 ${snap.jeonseRatio}% 기준 갭은 매매가의 약 ${rate}% — 이 단지 전세 실거래로 다시 확인하세요.`,
          numberKeys: ["price", "jeonseRatio", "wolse"],
        };
      }
      return { metric: null, headline: `${name}: 매매가·전세가를 입력하면 갭을 계산해요.`, numberKeys: ["price", "jeonseRatio", "wolse"] };
    }
    case "contract-risk": {
      const ratio = num(input.marketRatioPct) ?? snap?.jeonseRatio ?? null;
      if (ratio != null) {
        const level = ratio >= 90 ? "위험" : ratio >= 80 ? "주의" : "안전";
        return {
          metric: {
            label: "전세 계약 위험도",
            value: level,
            unit: null,
            note: `전세가율 ${ratio}% (${input.marketRatioPct != null ? "입력값" : "지역 신고 통계"}) · 90% 이상 위험 · 80% 이상 주의`,
            asOf: input.marketRatioPct != null ? null : (snap?.period ?? null),
          },
          headline:
            level === "위험"
              ? `전세가율 ${ratio}% — 보증금이 매매가에 육박해요. 보증보험·등기 확인 없이는 계약하지 마세요.`
              : level === "주의"
                ? `전세가율 ${ratio}% — 하락장에 역전세 위험이 있어요. 등기부·보증보험을 먼저 확인하세요.`
                : `전세가율 ${ratio}% — 수치상 여유가 있어요. 그래도 등기부 근저당은 직접 보세요.`,
          numberKeys: ["jeonseRatio", "wolse", "change"],
        };
      }
      return { metric: null, headline: "전세가율을 입력하거나 단지를 고르면 위험도를 계산해요.", numberKeys: ["jeonseRatio", "wolse"] };
    }
    case "ai-inspection": {
      const n = input.similarCount ?? 0;
      return {
        metric: n > 0 ? { label: "함께 볼 단지", value: String(n), unit: "곳", note: "같은 지역 최근 3개월 거래 활발 순", asOf: snap?.period ?? null } : null,
        headline: n > 0 ? `${name} 포함 ${n + 1}곳을 한 동선으로 — 거래가 활발한 곳부터 도세요.` : `${name}: 비교할 활발 단지가 아직 없어요 — 이 단지만 집중해 보세요.`,
        numberKeys: ["price", "trades", "notes"],
      };
    }
    case "ai-compare": {
      const n = input.compareCount ?? 0;
      return {
        metric: n >= 2 ? { label: "비교 대상", value: String(n), unit: "곳", note: "본문 표에서 종합점수 순위", asOf: null } : null,
        headline: n >= 2 ? `${n}곳을 같은 잣대(가격·거래·공급·현장)로 나란히 봤어요.` : "비교하려면 단지를 2곳 이상 담아 주세요.",
        numberKeys: ["price", "change", "trades"],
      };
    }
    case "ai-economy": {
      return {
        metric: ctx.macro && ctx.macro.baseRatePct != null
          ? { label: "기준금리", value: `${ctx.macro.baseRatePct}`, unit: "%", note: "한국은행 ECOS", asOf: ctx.macro.asOf }
          : null,
        headline: ctx.macro && ctx.macro.baseRatePct != null
          ? `기준금리 ${ctx.macro.baseRatePct}% — 대출 원리금 민감도를 아래 숫자로 보세요.`
          : "거시 지표를 아직 못 읽었어요.",
        numberKeys: ["baseRate", "unsold", "change"],
      };
    }
    case "ai-simulator":
      return {
        metric: null,
        headline: price ? `${name}: 기준가 ${formatKrwWon(price.priceKrw, { style: "short" })} 로 대출·보유기간 가정을 바꿔 보세요.` : `${name}: 기준가가 없어 시뮬레이션을 입력값으로만 해요.`,
        numberKeys: ["price", "baseRate", "change"],
      };
    case "ai-portfolio":
      return { metric: null, headline: "관심 단지를 불러오면 지역·가격대 집중도를 봐요.", numberKeys: ["price", "change", "supply"] };
    case "my-checklist":
      return { metric: null, headline: `${name}: 임장 전 확인할 항목을 본문 체크리스트로 정리했어요.`, numberKeys: ["price", "supply", "notes"] };
    default:
      return { metric: null, headline: `${name} 분석 결과예요.`, numberKeys: ["price", "change", "supply"] };
  }
}

export function buildVerdict(params: {
  tool: AiAnalysisToolId;
  ctx: LiveToolContext;
  footnotes: Footnote[];
  input?: VerdictInput;
  degraded?: boolean;
  reasonCode?: string | null;
  now?: Date;
}): Verdict {
  const now = params.now ?? new Date();
  const insight = {
    radar: diagnosisRadar(params.ctx),
    signals: timingSignals(params.ctx),
    flags: riskFlags(params.ctx),
  };
  const band = outcomeBand({
    hasInsight: true,
    radar: insight.radar.map((r) => r.score),
    signals: insight.signals.map((s) => s.state),
    flags: insight.flags.map((f) => f.level),
    degraded: params.degraded,
    reasonCode: params.reasonCode ?? null,
  });
  const pool = numberPool(params.ctx, now);
  const { metric, headline, numberKeys } = toolMetric(params.tool, params.ctx, insight, params.input ?? {}, band);
  return {
    tool: params.tool,
    band,
    bandLabel: BAND_LABEL[band],
    headline,
    metric,
    numbers: pick(pool, numberKeys, 3),
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
