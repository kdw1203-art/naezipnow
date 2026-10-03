/**
 * [1026 · 지역 시세] 네 화면(면적대별 실거래가 · 시세·타이밍 · 지역별 시장 온도 · 전세가율·갭)에 "1025 표준"을 씌우는
 * 문장 규칙 — 순수 함수만(서버·클라이언트·테스트 공용 · tests/unit/market-1026.test.ts).
 *
 * 소유자(2026-09-29): "내용, 과정, 절차, 결과, 액션 … 데스크탑 및 모바일 분리". 전 캡처(before1026)의 문제는 네 화면 모두
 * 결론 없이 숫자 칸부터 시작한다는 것이었다. 여기서 만드는 것은 세 가지뿐이다:
 *   ① 절차 한 줄(StepLine 에 넘길 단계 · 지난 단계는 "이름 · 내용", 현재 단계만 note)
 *   ② 결론 한 줄(t-title) + 판정 칩 하나(좋음 · 보통 · 주의) + 근거 한 줄(t-sub)
 *   ③ 다음 행동 링크(알림 · 지도 · 노트 · 결정 카드) — 이미 있는 경로만
 * **새 계산·새 조회는 없다.** 숫자는 각 화면이 이미 타일·선반·표로 보여 주던 값을 받아 문장으로 옮길 뿐이다.
 * 판정 칩의 경계도 새로 만들지 않는다 — 시장 온도는 temperatureHeadline 의 경계(65 · 35), 전세가율은 이 앱이
 * 계약 위험에서 이미 쓰는 "80% 이상 주의"(lib/ai/analysis-engine · lib/ai/verdict) 그대로다.
 */
import { formatKrwShort } from "@/lib/market/format";
import { deltaDir, signedPctText } from "@/lib/format/delta";

/* ── 공통 ─────────────────────────────────────────────────────────────── */

/** 판정 칩 톤 — good = bg-success-soft text-success · neutral = bg-primary-soft text-primary · caution = bg-warning-soft text-warning */
export type VerdictTone = "good" | "neutral" | "caution";
export type Verdict = { label: string; tone: VerdictTone };

/** StepLine 한 칸과 같은 모양(app/components/StepLine.tsx StepLineItem) — lib 가 app 을 import 하지 않게 구조만 맞춘다 */
export type StepItem = { label: string; note?: string };
export type StepPlan = { steps: StepItem[]; current: number };

/** 결론 카드 한 벌 — title(t-title) · chip(하나 또는 없음) · sub(근거 t-sub 한 줄, 없으면 null) */
export type Conclusion = { title: string; chip: Verdict | null; sub: string | null };

const n = (v: number) => v.toLocaleString("ko-KR");

/** 지난 단계 라벨 — "지역 · 남양주시". 내용이 비면 이름만 */
function doneLabel(name: string, content: string | null | undefined): string {
  const c = (content ?? "").trim();
  return c ? `${name} · ${c}` : name;
}

/**
 * 시장 온도 톤 — temperatureHeadline(lib/market/temperature) 의 경계 그대로:
 * 65 이상 "가격·거래 모두 달아오르는 구간" · 35 미만 "가격·거래 모두 식은 구간" 은 주의, 그 사이는 보통.
 * 점수가 높다고 좋음이 아니다(Q&A "점수가 높으면 지금 사야 한다는 뜻인가요? — 아닙니다").
 */
export function temperatureTone(score: number | null | undefined): VerdictTone {
  if (typeof score !== "number" || !Number.isFinite(score)) return "neutral";
  return score >= 65 || score < 35 ? "caution" : "neutral";
}

/** 전세가율 주의 경계 — 앱이 계약 위험에서 이미 쓰는 값(80% 이상 주의) */
export const JEONSE_RATIO_CAUTION = 80;

/* ── 다음 행동(액션 카드) ─────────────────────────────────────────────── */

/** 알림 구독을 관리하는 곳(알림함). [1027] 채움 파랑 "이 지역 알림 받기"는 이제 이 주소를 여는 링크가 아니라
 *  누르면 그 지역을 구독하는 버튼이다(app/components/RegionAlertButton) — 이 주소는 설정 뒤 "관리" 링크의 목적지로 남는다. */
export const REGION_ALERT_HREF = "/notifications";

export type ActionLink = { href: string; label: string };

/**
 * 텍스트 링크 3개 — 지도(?region= 은 지도가 이미 읽는 한글 지역명) · 노트 쓰기(?region= 은 노트 폼이 이미 읽는다) · 결정 카드.
 * 지역을 모르면 파라미터 없이 보낸다(AnalysisCrossLinks 와 같은 규칙 — 모르는 값을 지어 보내지 않는다).
 */
export function regionActionLinks(mapRegion: string | null | undefined, noteRegion: string | null | undefined): ActionLink[] {
  const m = (mapRegion ?? "").trim();
  const t = (noteRegion ?? "").trim();
  return [
    { href: m ? `/map?region=${encodeURIComponent(m)}` : "/map", label: "이 지역 단지 보기" },
    { href: t ? `/notes/new?region=${encodeURIComponent(t)}` : "/notes/new", label: "이 지역 노트 쓰기" },
    { href: "/decide", label: "결정 카드" },
  ];
}

/* ── ① 면적대별 실거래가 ─────────────────────────────────────────────── */

export type PriceBandInput = {
  label: string;
  txCount: number;
  complexCount: number;
  medianText: string;
  minText: string;
  maxText: string;
  /** "2,402만/평" — 없으면 null */
  perText: string | null;
  /** 지역 분위(상위 %) — 표본 8곳 미만이면 null */
  top: number | null;
};

/** 절차 — 지역 → 면적대 → 실거래 범위(현재 · 최저~최고) → 다음 행동 */
export function priceSteps(regionName: string, band: Pick<PriceBandInput, "label" | "minText" | "maxText"> | null): StepPlan {
  return {
    steps: [
      { label: doneLabel("지역", regionName) },
      { label: doneLabel("면적대", band?.label) },
      { label: "실거래 범위", note: band ? `${band.minText}~${band.maxText}` : undefined },
      { label: "다음 행동" },
    ],
    current: 2,
  };
}

/**
 * 결론 — "남양주시 60~85㎡ 거래 최다 3,852건 · 중앙 5.5억". 칩은 그 면적대의 지역 분위("평단가 상위 19%" · 보통),
 * 분위가 없으면 거래 최다 칸일 때만 "거래 최다". 근거 = 평당 · 단지 수 · 실거래 최저~최고(선반·범위 카드의 값).
 */
export function priceConclusion(regionName: string, band: PriceBandInput, busiest: boolean): Conclusion {
  const title = `${regionName} ${band.label} ${busiest ? "거래 최다 " : ""}${n(band.txCount)}건 · 중앙 ${band.medianText}`;
  const chip: Verdict | null =
    band.top !== null
      ? { label: `평단가 상위 ${band.top}%`, tone: "neutral" }
      : busiest
        ? { label: "거래 최다", tone: "neutral" }
        : null;
  const sub = [
    band.perText ? `평당 ${band.perText.replace("/평", "")}` : null,
    `${n(band.complexCount)}개 단지`,
    `실거래 ${band.minText}~${band.maxText}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return { title, chip, sub };
}

/* ── ② 시세·타이밍 ───────────────────────────────────────────────────── */

export type TimingInput = {
  regionLabel: string;
  /** trend.latestChangePct — 지수가 없으면 null */
  latestChangePct: number | null;
  /** trend.cumulativePct */
  cumulativePct: number | null;
  weekly: boolean;
  /** trend.verdict("상승 지속" …) */
  verdict: string | null;
  /** 마지막 지수값(pt) — 이미 소수 한 자리로 반올림된 값 */
  latestIndex: number | null;
  /** temp.score / temp.headline */
  tempScore: number | null;
  tempHeadline: string | null;
};

/** 부호 붙은 등락 — 보합 구간(±0.05% 미만)은 "보합"(lib/format/delta 규칙 그대로) */
function signedOrFlat(pct: number, digits: number): string {
  return deltaDir(pct) === "flat" ? "보합" : signedPctText(pct, digits);
}

/** 절차 — 지역 → 신호(지수·거래량·온도 중 있는 것) → 판단(현재) → 다음 행동 */
export function timingSteps(i: Pick<TimingInput, "regionLabel" | "verdict" | "tempHeadline">, signals: { index: boolean; volume: boolean; temp: boolean }): StepPlan {
  const names = [signals.index ? "지수" : null, signals.volume ? "거래량" : null, signals.temp ? "온도" : null].filter(Boolean).join("·");
  return {
    steps: [
      { label: doneLabel("지역", i.regionLabel) },
      { label: doneLabel("신호", names || null) },
      { label: "판단", note: i.tempHeadline ?? i.verdict ?? undefined },
      { label: "다음 행동" },
    ],
    current: 2,
  };
}

/**
 * 결론 — "서울 강남구 지수 -0.42% · 온도 37". 칩 = 온도 문구(temp.headline, 톤은 temperatureTone) · 온도가 없으면 지수 판정(보통).
 * 근거 = 지수 pt · 지난달(주) 대비 · 기간 누적 · 추세 판정. 값이 없으면 그 토막을 뺀다(지어내지 않는다).
 */
export function timingConclusion(i: TimingInput): Conclusion | null {
  const parts: string[] = [];
  if (i.latestChangePct !== null) parts.push(`지수 ${signedOrFlat(i.latestChangePct, 2)}`);
  if (i.tempScore !== null) parts.push(`온도 ${i.tempScore}`);
  if (parts.length === 0) return null;
  const title = `${i.regionLabel} ${parts.join(" · ")}`;
  const chip: Verdict | null = i.tempHeadline
    ? { label: i.tempHeadline, tone: temperatureTone(i.tempScore) }
    : i.verdict
      ? { label: i.verdict, tone: "neutral" }
      : null;
  const sub = [
    i.latestIndex !== null ? `매매가격지수 ${i.latestIndex.toLocaleString("ko-KR")}pt` : null,
    i.latestChangePct !== null ? `${i.weekly ? "지난주" : "지난달"} 대비 ${signedOrFlat(i.latestChangePct, 2)}` : null,
    i.cumulativePct !== null ? `기간 누적 ${signedOrFlat(i.cumulativePct, 1)}` : null,
    i.verdict && i.tempHeadline ? `추세 ${i.verdict}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return { title, chip, sub: sub || null };
}

/* ── ③ 지역별 시장 온도 ──────────────────────────────────────────────── */

export type TemperatureInput = {
  /** 주 칩 말("이번 주" · "지난주" · "4주 전") */
  weekWord: string;
  sido: string | null;
  count: number;
  avg: number | null;
  hottest: { label: string; score: number } | null;
  coldest: { label: string; score: number } | null;
  rising: number;
  falling: number;
  compared: number;
};

/** 절차 — 주(지난 단계) → 시·도(전국이면 현재) → 지역(시·도를 고르면 현재) → 다음 행동 */
export function temperatureSteps(weekWord: string, sido: string | null, count: number, sidoCount: number): StepPlan {
  return {
    steps: [
      { label: doneLabel("주", weekWord) },
      sido ? { label: doneLabel("시·도", sido) } : { label: "시·도", note: sidoCount > 0 ? `${n(sidoCount)}곳 기록` : undefined },
      { label: "지역", note: sido && count > 0 ? `${n(count)}곳` : undefined },
      { label: "다음 행동" },
    ],
    current: sido ? 2 : 1,
  };
}

/**
 * 결론 — "이번 주 가장 뜨거운 곳 경기 화성시 병점구 95 · 가장 차가운 곳 경기 과천시 16"(시·도를 고르면 "이번 주 서울 …").
 * 한 곳뿐이면 그 한 곳만. 칩 = "평균 53.1"(톤은 temperatureTone). 근거 = 기록 지역 수 · 직전 주 대비 오른 곳·내린 곳.
 */
export function temperatureConclusion(i: TemperatureInput): Conclusion | null {
  if (!i.hottest) return null;
  const head = `${i.weekWord}${i.sido ? ` ${i.sido}` : ""}`;
  /* 시·도를 고르면 머리에 이미 "서울"이 있으므로 지역 이름에서 떼어 적는다("서울 강남구" → "강남구") */
  const nm = (label: string) => (i.sido && label.startsWith(`${i.sido} `) ? label.slice(i.sido.length + 1) : label);
  const same = !i.coldest || i.count <= 1 || (i.coldest.label === i.hottest.label && i.coldest.score === i.hottest.score);
  const title = same
    ? `${head} ${nm(i.hottest.label)} ${i.hottest.score}`
    : `${head} 가장 뜨거운 곳 ${nm(i.hottest.label)} ${i.hottest.score} · 가장 차가운 곳 ${nm(i.coldest!.label)} ${i.coldest!.score}`;
  const chip: Verdict | null = i.avg !== null ? { label: `평균 ${i.avg}`, tone: temperatureTone(i.avg) } : null;
  const sub = [`${n(i.count)}곳 기록`, i.compared > 0 ? `직전 주보다 오른 곳 ${n(i.rising)} · 내린 곳 ${n(i.falling)}` : null]
    .filter(Boolean)
    .join(" · ");
  return { title, chip, sub };
}

/* ── ④ 전세가율·갭 ───────────────────────────────────────────────────── */

export type GapTopInput = {
  name: string;
  ratio: number;
  avgSale?: number;
  /** 표에 적는 갭(원, 실측 우선) — 없으면 null */
  gap: number | null;
  measured: boolean;
};

/** 절차 — 조건(지난 단계 · 조건 문구) → 결과 N곳(현재) → 단지 → 다음 행동 */
export function gapSteps(conditionText: string | null, count: number): StepPlan {
  return {
    steps: [
      { label: doneLabel("조건", conditionText ?? "제한 없음") },
      { label: "결과", note: `${n(count)}곳` },
      { label: "단지" },
      { label: "다음 행동" },
    ],
    current: 1,
  };
}

/**
 * 결론 — "조건에 맞는 107곳 · 전세가율 중앙 66.2% · 최고 광주 북구 81.4%". 중앙값은 서버가 낸 **전체** 값이라
 * 조건이 걸리면 "전체 중앙"이라고 적는다(걸러진 곳의 중앙값을 새로 계산하지 않는다).
 * 칩 = 결과의 최고 전세가율이 80% 이상이면 "80% 이상 있음"(주의) · 아니면 "모두 80% 미만"(보통).
 * 근거 = 최고 지역의 평균 매매가 · 갭(실측/추정 — 표와 같은 값).
 */
export function gapConclusion(i: { count: number; hasCondition: boolean; median: number | null; top: GapTopInput | null }): Conclusion {
  const parts = [`조건에 맞는 ${n(i.count)}곳`];
  if (i.median !== null) parts.push(`${i.hasCondition ? "전체 중앙" : "전세가율 중앙"} ${i.median.toFixed(1)}%`);
  if (i.top) parts.push(`최고 ${i.top.name} ${i.top.ratio.toFixed(1)}%`);
  const chip: Verdict | null = i.top
    ? i.top.ratio >= JEONSE_RATIO_CAUTION
      ? { label: `${JEONSE_RATIO_CAUTION}% 이상 있음`, tone: "caution" }
      : { label: `모두 ${JEONSE_RATIO_CAUTION}% 미만`, tone: "neutral" }
    : null;
  const sub = i.top
    ? [
        i.top.avgSale && i.top.avgSale > 0 ? `${i.top.name} 평균 매매 ${formatKrwShort(i.top.avgSale)}` : i.top.name,
        i.top.gap !== null ? `갭 ${formatKrwShort(i.top.gap)}(${i.top.measured ? "실측" : "추정"})` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
  return { title: parts.join(" · "), chip, sub };
}

/** 폰 카드 목록 — 처음 20개 · "더 보기"마다 20개씩 */
export const GAP_CARD_PAGE = 20;

export function nextCardCount(shown: number, total: number, page: number = GAP_CARD_PAGE): number {
  return Math.min(total, Math.max(0, shown) + page);
}
