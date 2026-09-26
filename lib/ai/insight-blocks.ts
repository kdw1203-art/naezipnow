import type { LiveToolContext } from "@/lib/ai/live-context";

/* [AI-03·04·08·19·21·26] 인사이트 블록 — 라이브 컨텍스트 → 구조화 판정.
 *
 * 전부 순수 함수다: 입력이 같으면 출력이 같고, DB·시계를 직접 만지지 않는다.
 * 골든셋 회귀 테스트(AI-07, tests/ai-insight.test.ts)가 이 파일을 잠근다 —
 * 판정 규칙을 바꾸면 테스트 스냅샷 diff 로 "무엇이 달라졌는지"가 드러난다.
 * 임계값은 상수로 노출해 화면 캡션과 테스트가 같은 숫자를 쓴다.
 */

/* ── [AI-03] 불확실성 표기 표준 ──────────────────────────────────────── */

export const UNCERTAINTY = {
  /** 이 표본 미만이면 단정 대신 "판단 불가(표본 부족)" */
  minSample: 5,
  /** 이 표본 미만이면 값에 "표본 적음" 주의를 붙인다 */
  thinSample: 30,
  /** 데이터가 이 일수보다 오래되면 "오래된 데이터" 주의 */
  staleDays: 120,
} as const;

export type Confidence = "ok" | "thin" | "insufficient" | "stale";

export function judgeConfidence(
  sample: number | null | undefined,
  ageDays: number | null | undefined,
): Confidence {
  if (sample != null && sample < UNCERTAINTY.minSample) return "insufficient";
  if (ageDays != null && ageDays > UNCERTAINTY.staleDays) return "stale";
  if (sample != null && sample < UNCERTAINTY.thinSample) return "thin";
  return "ok";
}

/* [1008 · W] 쉬운 말 — "표본 적음 — 참고용"·"판단 불가(표본 부족)" 는 통계 용어였다(소유자: "무슨 말인지 모르겠다").
   판정 기준(UNCERTAINTY)은 그대로다. */
export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  ok: "",
  thin: "거래 적음 · 참고용",
  insufficient: "자료 부족",
  stale: "오래된 자료",
};

/* ── [AI-19] 투자 진단 레이더 5축 (0~100) ────────────────────────────── */

export interface RadarAxis {
  key: "momentum" | "liquidity" | "supply" | "field" | "macro";
  label: string;
  /** 0~100 · null = 데이터 없음(축을 그리지 않고 "자료 없음"으로 말한다) */
  score: number | null;
  basis: string;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

/** 월간 변동률 표기 — "+1.03%" · "−0.2%" (원값 소수 꼬리를 자른다) */
function pctText(n: number): string {
  const v = Math.round(n * 100) / 100;
  if (v === 0) return "0%";
  return `${v > 0 ? "+" : "−"}${Math.abs(v).toLocaleString("ko-KR")}%`;
}

export function diagnosisRadar(ctx: LiveToolContext): RadarAxis[] {
  const snap = ctx.region?.snapshot ?? null;

  /* 모멘텀: 월간 변동률 -3%~+3% → 0~100 (0% = 50) */
  const momentum =
    snap?.saleChangeMonthly != null
      ? clamp(50 + (snap.saleChangeMonthly / 3) * 50)
      : null;

  /* 유동성: 월 거래량 0~300건 → 0~100 (지역 규모 보정 전 단순 척도 — 근거 표기) */
  const liquidity =
    snap?.tradeCount != null ? clamp((snap.tradeCount / 300) * 100) : null;

  /* 공급 부담(역방향): 입주 예정 세대 0→100점, 3,000세대+→0점 */
  const supply =
    ctx.supply != null
      ? clamp(100 - (ctx.supply.upcomingHouseholds / 3000) * 100)
      : null;

  /* 현장 정성: 이웃 노트 평균(5점 만점 — inspection_notes.score_* 는 0~5) → 0~100.
     [1008 · W] 예전엔 10점 만점으로 보고 ×10 했다 — 노트 축이 늘 null 이라(열 이름 오류) 드러나지 않았다. */
  const field = ctx.notes?.avgScore != null ? clamp((ctx.notes.avgScore / 5) * 100) : null;

  /* 거시(역방향 혼합): 기준금리 1%→90 · 5%→10, 미분양 있으면 -10 보정 */
  let macro: number | null = null;
  if (ctx.macro?.baseRatePct != null) {
    macro = clamp(100 - ((ctx.macro.baseRatePct - 1) / 4) * 80 - 10 * 0);
    const unsold = ctx.region?.demographics?.unsoldUnits;
    if (unsold != null && unsold > 500) macro = clamp(macro - 10);
  }

  /* [1008 · W] 축 이름·근거를 사람이 아는 말로 — "가격 모멘텀·거래 유동성·현장 정성" 은 업계 용어였다 */
  return [
    {
      key: "momentum",
      label: "가격 흐름",
      score: momentum,
      basis: snap?.saleChangeMonthly != null ? `지역 시세 한 달 ${pctText(snap.saleChangeMonthly)}` : "지역 시세 자료 없음",
    },
    {
      key: "liquidity",
      label: "거래 활발",
      score: liquidity,
      basis: snap?.tradeCount != null ? `지역 한 달 거래 ${snap.tradeCount.toLocaleString("ko-KR")}건` : "거래량 자료 없음",
    },
    {
      key: "supply",
      label: "공급 여유",
      score: supply,
      basis: ctx.supply ? `앞으로 입주 ${ctx.supply.upcomingHouseholds.toLocaleString("ko-KR")}세대` : "입주 예정 자료 없음",
    },
    {
      key: "field",
      label: "이웃 평가",
      score: field,
      basis: ctx.notes?.avgScore != null ? `이웃 임장노트 ${ctx.notes.sample}건 평균 ${ctx.notes.avgScore}점(5점 만점)` : "공개 임장노트 없음",
    },
    {
      key: "macro",
      label: "금리 환경",
      score: macro,
      basis: ctx.macro?.baseRatePct != null ? `기준금리 ${ctx.macro.baseRatePct}%` : "금리 자료 없음",
    },
  ];
}

/* ── [AI-21] 리스크 플래그 ───────────────────────────────────────────── */

export const RISK_THRESHOLDS = {
  tradeDrop: 10, // 월 거래 10건 미만 = 유동성 경고
  wolseShareHigh: 55, // 월세 비중 55%+ = 전세 수요 약화 신호
  supplyHeavy: 1500, // 입주 예정 1,500세대+ = 공급 부담
  unsoldHigh: 500, // 미분양 500호+ = 소화 부진
  jeonseRatioHigh: 80, // 전세가율 80%+ = 갭 리스크(역전 주의)
} as const;

export interface RiskFlag {
  key: string;
  level: "warn" | "info";
  title: string;
  detail: string;
}

export function riskFlags(ctx: LiveToolContext): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const snap = ctx.region?.snapshot;

  if (snap?.tradeCount != null && snap.tradeCount < RISK_THRESHOLDS.tradeDrop) {
    flags.push({
      key: "liquidity",
      level: "warn",
      title: "거래가 드물어요",
      detail: `지역 한 달 거래 ${snap.tradeCount}건 — 팔고 싶을 때 바로 못 팔 수 있어요.`,
    });
  }
  if (
    ctx.rent?.wolseSharePct != null &&
    ctx.rent.wolseSharePct >= RISK_THRESHOLDS.wolseShareHigh
  ) {
    flags.push({
      key: "wolse",
      level: "info",
      title: "월세 계약이 많아요",
      detail: `신고 기준 월세 비중 ${ctx.rent.wolseSharePct}% — 전세를 끼고 사는 계산이 빠듯해질 수 있어요.`,
    });
  }
  if (ctx.supply && ctx.supply.upcomingHouseholds >= RISK_THRESHOLDS.supplyHeavy) {
    flags.push({
      key: "supply",
      level: "warn",
      title: "입주 물량이 많아요",
      detail: `앞으로 입주 ${ctx.supply.upcomingHouseholds.toLocaleString("ko-KR")}세대 — 입주 무렵 전세·매매 가격이 흔들릴 수 있어요.`,
    });
  }
  const unsold = ctx.region?.demographics?.unsoldUnits;
  if (unsold != null && unsold >= RISK_THRESHOLDS.unsoldHigh) {
    flags.push({
      key: "unsold",
      level: "warn",
      title: "미분양이 쌓였어요",
      detail: `미분양 ${unsold.toLocaleString("ko-KR")}호 — 새 아파트가 잘 안 팔리는 지역이에요.`,
    });
  }
  if (
    snap?.jeonseRatio != null &&
    snap.jeonseRatio >= RISK_THRESHOLDS.jeonseRatioHigh
  ) {
    flags.push({
      key: "gapRisk",
      level: "warn",
      title: "전세가율이 높아요",
      detail: `전세가율 ${snap.jeonseRatio}% — 집값이 조금만 내려도 전세금 돌려주기가 어려워질 수 있어요.`,
    });
  }
  return flags;
}

/* ── [1008 · W] 리스크 체크리스트 — 위 5가지를 **걸린 것만이 아니라 전부** 상태와 함께 ──────
   캡처: "규칙이 보는 5가지 리스크 중 걸리는 게 없어요" 한 줄뿐이라 무엇을 봤는지 몰랐다.
   같은 임계값(RISK_THRESHOLDS)으로 통과/주의/참고/자료 없음을 항목마다 말한다. */

export type RiskCheckStatus = "pass" | "warn" | "info" | "na";

export interface RiskCheck {
  key: "liquidity" | "wolse" | "supply" | "unsold" | "gapRisk";
  label: string;
  status: RiskCheckStatus;
  /** 잰 값 — "월 448건" · "41%" (없으면 null) */
  value: string | null;
  /** 왜 이 상태인가 한 줄 */
  detail: string;
  /** 기준 — "월 10건 미만이면 주의" */
  rule: string;
}

export function riskChecklist(ctx: LiveToolContext): RiskCheck[] {
  const snap = ctx.region?.snapshot ?? null;
  const flags = new Map(riskFlags(ctx).map((f) => [f.key, f]));
  const status = (key: string, measured: boolean): RiskCheckStatus => {
    const f = flags.get(key);
    if (f) return f.level === "warn" ? "warn" : "info";
    return measured ? "pass" : "na";
  };
  const trade = snap?.tradeCount ?? null;
  const wolse = ctx.rent?.wolseSharePct ?? null;
  const supply = ctx.supply?.upcomingHouseholds ?? null;
  const unsold = ctx.region?.demographics?.unsoldUnits ?? null;
  const jr = snap?.jeonseRatio ?? null;
  return [
    {
      key: "liquidity",
      label: "거래량",
      status: status("liquidity", trade != null),
      value: trade != null ? `월 ${trade.toLocaleString("ko-KR")}건` : null,
      detail: flags.get("liquidity")?.detail ?? (trade != null ? "거래가 꾸준해 팔 때 살 사람을 찾기 어렵지 않은 편이에요." : "지역 거래량 자료가 없어요."),
      rule: `지역 한 달 거래 ${RISK_THRESHOLDS.tradeDrop}건 미만이면 주의`,
    },
    {
      key: "gapRisk",
      label: "전세가율",
      status: status("gapRisk", jr != null),
      value: jr != null ? `${jr}%` : null,
      detail: flags.get("gapRisk")?.detail ?? (jr != null ? "매매가 대비 전세금 비율이 높지 않아 역전세 걱정이 덜한 편이에요." : "지역 전세가율 자료가 없어요."),
      rule: `${RISK_THRESHOLDS.jeonseRatioHigh}% 이상이면 주의`,
    },
    {
      key: "supply",
      label: "입주 물량",
      status: status("supply", supply != null),
      value: supply != null ? `${supply.toLocaleString("ko-KR")}세대` : null,
      detail: flags.get("supply")?.detail ?? (supply != null ? "앞으로 들어올 새 아파트가 많지 않아요." : "이 지역 입주 예정 자료가 없어요."),
      rule: `앞으로 ${RISK_THRESHOLDS.supplyHeavy.toLocaleString("ko-KR")}세대 이상이면 주의`,
    },
    {
      key: "unsold",
      label: "미분양",
      status: status("unsold", unsold != null),
      value: unsold != null ? `${unsold.toLocaleString("ko-KR")}호` : null,
      detail: flags.get("unsold")?.detail ?? (unsold != null ? "팔리지 않고 남은 새 아파트가 많지 않아요." : "미분양 자료가 없어요."),
      rule: `${RISK_THRESHOLDS.unsoldHigh}호 이상이면 주의`,
    },
    {
      key: "wolse",
      label: "월세 비중",
      status: status("wolse", wolse != null),
      value: wolse != null ? `${wolse}%` : null,
      detail: flags.get("wolse")?.detail ?? (wolse != null ? "전세 계약이 아직 많은 지역이에요." : "전월세 신고 자료가 없어요."),
      rule: `${RISK_THRESHOLDS.wolseShareHigh}% 이상이면 참고`,
    },
  ];
}

/* ── [AI-26] 매수 타이밍 신호등 ─────────────────────────────────────── */

export interface TimingSignal {
  key: "price" | "volume" | "supply";
  label: string;
  state: "green" | "yellow" | "red" | "na";
  basis: string;
}

export function timingSignals(ctx: LiveToolContext): TimingSignal[] {
  const snap = ctx.region?.snapshot;

  const priceState: TimingSignal["state"] =
    snap?.saleChangeMonthly == null
      ? "na"
      : snap.saleChangeMonthly <= -0.5
        ? "green"
        : snap.saleChangeMonthly < 0.8
          ? "yellow"
          : "red";

  const volState: TimingSignal["state"] =
    snap?.tradeCount == null
      ? "na"
      : snap.tradeCount >= 100
        ? "red"
        : snap.tradeCount >= 30
          ? "yellow"
          : "green";

  const supState: TimingSignal["state"] = !ctx.supply
    ? "na"
    : ctx.supply.upcomingHouseholds >= RISK_THRESHOLDS.supplyHeavy
      ? "green"
      : ctx.supply.upcomingHouseholds > 0
        ? "yellow"
        : "red";

  /* [1008 · W] 신호마다 "왜" 한 줄을 쉬운 말로 — 매수자 입장에서 유리(초록)·보통(노랑)·불리(빨강) */
  return [
    {
      key: "price",
      label: "가격 흐름",
      state: priceState,
      basis:
        snap?.saleChangeMonthly != null
          ? `지역 시세 한 달 ${pctText(snap.saleChangeMonthly)} — ${priceState === "green" ? "내리는 중이라 값을 깎을 여지가 있어요" : priceState === "red" ? "빠르게 오르는 중이라 따라 사기 조심" : "크게 움직이지 않아요"}`
          : "지역 시세 자료가 없어요",
    },
    {
      key: "volume",
      label: "거래 열기",
      state: volState,
      basis:
        snap?.tradeCount != null
          ? `지역 한 달 거래 ${snap.tradeCount.toLocaleString("ko-KR")}건 — ${volState === "green" ? "한산해서 급매를 노려볼 만해요" : volState === "red" ? "거래가 몰려 파는 쪽이 유리해요" : "보통 수준이에요"}`
          : "거래량 자료가 없어요",
    },
    {
      key: "supply",
      label: "입주 물량",
      state: supState,
      basis: ctx.supply
        ? `앞으로 입주 ${ctx.supply.upcomingHouseholds.toLocaleString("ko-KR")}세대 — ${supState === "green" ? "입주 무렵 매물이 늘어 고르기 쉬워질 수 있어요" : "새 물량이 많지 않아 매물이 늘 요인은 약해요"}`
        : "입주 예정 자료가 없어요",
    },
  ];
}

/* ── [AI-04] 반대 시나리오 — 결론이 틀리는 조건 ─────────────────────── */

export function counterScenarios(ctx: LiveToolContext): string[] {
  const out: string[] = [];
  if (ctx.supply && ctx.supply.upcomingHouseholds > 0) {
    out.push(
      `앞으로 입주할 ${ctx.supply.upcomingHouseholds.toLocaleString("ko-KR")}세대가 예정대로 들어오면 전세·매매 가격이 잠시 눌릴 수 있어요.`,
    );
  }
  if (ctx.macro?.baseRatePct != null) {
    out.push(
      `기준금리가 지금 ${ctx.macro.baseRatePct}%에서 0.5%p 넘게 오르면 이자 부담이 커져 계산을 다시 해야 해요.`,
    );
  }
  const snap = ctx.region?.snapshot;
  if (snap?.saleChangeMonthly != null && snap.saleChangeMonthly > 0) {
    out.push(
      "최근 상승이 몇 건의 신고가 거래 때문이라면 흐름이 아니라 일시적인 착시일 수 있어요.",
    );
  }
  if (out.length === 0) {
    out.push("입주 물량·금리·거래량 중 자료가 없는 항목은 그 항목이 바뀌면 결과도 바뀔 수 있어요.");
  }
  return out.slice(0, 3);
}

/* ── [AI-08] 수치 환각 가드 — LLM 서술 속 미승인 숫자 검출 ──────────── */

const NUM_RE = /\d[\d,]*(?:\.\d+)?/g;

/** 컨텍스트·입력에서 "언급 허용" 숫자 집합을 만든다 (콤마 제거·소수 2자리 반올림 키) */
export function buildNumberWhitelist(values: unknown[]): Set<string> {
  const set = new Set<string>();
  const addNum = (n: number) => {
    if (!Number.isFinite(n)) return;
    set.add(String(Math.round(n * 100) / 100));
    set.add(String(Math.round(n)));
    /* 억/만 환산 표기도 허용 (1230000000 → 12.3 / 123000) */
    if (Math.abs(n) >= 1e8) addOnce(n / 1e8);
    if (Math.abs(n) >= 1e4) addOnce(n / 1e4);
  };
  const addOnce = (n: number) => {
    set.add(String(Math.round(n * 100) / 100));
    set.add(String(Math.round(n * 10) / 10));
    set.add(String(Math.round(n)));
  };
  const walk = (v: unknown) => {
    if (typeof v === "number") addNum(v);
    else if (typeof v === "string") {
      for (const m of v.matchAll(NUM_RE)) addNum(Number(m[0].replace(/,/g, "")));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  values.forEach(walk);
  /* 흔한 무해 숫자(연도·소형 서수·백분율 스케일)는 항상 허용 */
  for (let y = 2000; y <= 2035; y++) set.add(String(y));
  for (let i = 0; i <= 12; i++) set.add(String(i));
  ["50", "100", "1000"].forEach((s) => set.add(s));
  return set;
}

export interface NumberGuardResult {
  ok: boolean;
  /** 화이트리스트에 없던 숫자들 (최대 8개) */
  violations: string[];
}

export function guardLlmNumbers(
  markdown: string,
  whitelist: Set<string>,
): NumberGuardResult {
  const found = new Set<string>();
  for (const m of markdown.matchAll(NUM_RE)) {
    const raw = m[0].replace(/,/g, "");
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    const keys = [String(Math.round(n * 100) / 100), String(Math.round(n * 10) / 10), String(Math.round(n))];
    if (!keys.some((k) => whitelist.has(k))) found.add(m[0]);
    if (found.size >= 8) break;
  }
  return { ok: found.size === 0, violations: [...found] };
}
