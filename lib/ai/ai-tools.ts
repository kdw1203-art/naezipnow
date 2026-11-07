/** AI 분석 워크벤치·동적 라우트에서 공통으로 쓰는 도구 ID */

export const AI_TOOL_IDS = [
  "ai-diagnosis",
  "ai-prediction",
  "ai-risk",
  "ai-compare",
  "ai-inspection",
  "my-checklist",
  "ai-portfolio",
  "ai-timing",
  "ai-simulator",
  "ai-gap",
  "ai-economy",
  "contract-risk",
] as const;

/** 데스크톱 통합 4기능 노출용 */
export const CORE_AI_TOOL_IDS = [
  "ai-diagnosis",
  "ai-prediction",
  "ai-inspection",
  "ai-timing",
] as const;

/**
 * 핵심 4기능 + 추가 5기능 = 통합 9개.
 * Hero/Digest/InputOptions UX 패턴이 적용되는 전체 도구 집합.
 */
export const EXTENDED_AI_TOOL_IDS = [
  ...CORE_AI_TOOL_IDS,
  "ai-risk",
  "ai-compare",
  "ai-simulator",
  "ai-gap",
  "ai-economy",
] as const;

export type AiAnalysisToolId = (typeof AI_TOOL_IDS)[number];

export type CoreAiAnalysisToolId = (typeof CORE_AI_TOOL_IDS)[number];

export type ExtendedAiAnalysisToolId = (typeof EXTENDED_AI_TOOL_IDS)[number];

const SET = new Set<string>(AI_TOOL_IDS);
const EXTENDED_SET = new Set<string>(EXTENDED_AI_TOOL_IDS);

/** `Array.prototype.includes` 타입이 튜플에서 과도하게 좁혀져 도구 전체 union과 맞지 않을 때 사용 */
export function isCoreAiAnalysisToolId(id: AiAnalysisToolId): id is CoreAiAnalysisToolId {
  return (CORE_AI_TOOL_IDS as readonly string[]).includes(id);
}

/** Hero/Digest/InputOptions 패턴이 적용되는 9종 인지 검사. */
export function isExtendedAiAnalysisToolId(
  id: AiAnalysisToolId,
): id is ExtendedAiAnalysisToolId {
  return EXTENDED_SET.has(id);
}

export function isAiAnalysisToolId(v: string): v is AiAnalysisToolId {
  return SET.has(v);
}

/* ── [1109 · AI 분석 통폐합] 살아 있는 도구 4 · 통합된 도구 8 ──────────────────────────────────────
   근거(운영 실측 2026-11-07): 60일 동의 표본에서 열린 도구는 종합 진단 16 · 매수 타이밍 10 · 시세 예측 9 · 리스크 점검 3 ·
   임장 동선 3 — 나머지 7종은 0. 저장된 실행 전체 25건 가운데 핵심 4종 밖은 경제지표 1건(5월)뿐이고 최근 30일 실행은 0.
   이름이 겹치는 쌍(비교 · 갭 · 포트폴리오 · 타이밍 · 시나리오)이 "어떤 게 어느 기능인지"를 흐린 2026-08-25 진단은
   도구 12종이 남아 있는 한 풀리지 않았다 — 같은 일을 하는 **살아 있는 화면**으로 보낸다(주소는 308 · 저장된 결과 화면은 그대로).
   도구 id 의 합(AI_TOOL_IDS)은 타입 · 옛 결과(/analysis/ai/r/[id]) · 관리 화면이 읽으므로 그대로 두고, **목록 · 사이트맵 ·
   실행 API 는 ACTIVE 만** 본다. */
export const ACTIVE_AI_TOOL_IDS: readonly AiAnalysisToolId[] = CORE_AI_TOOL_IDS;

/** 통합된 도구 → 같은 일을 하는 살아 있는 화면(1홉 · 실존 라우트). 쿼리(?complexId= · ?ids=)는 그대로 넘긴다. */
export const RETIRED_AI_TOOLS: Readonly<Record<Exclude<AiAnalysisToolId, CoreAiAnalysisToolId>, string>> = {
  /* 거래량 · 전세가율 · 입주 · 미분양 · 월세 5신호 — 종합 진단의 5항목 점수 · 단지 상세 다요인 분석이 같은 재료를 이미 센다 */
  "ai-risk": "/analysis/ai/ai-diagnosis",
  /* 담은 단지 2~3곳 나란히 — 후보 단지 비교 표(/analysis/compare)가 같은 역할 · 비교함 5곳까지 */
  "ai-compare": "/analysis/compare",
  /* 매매-전세 차이 · 역전세 — 전세가율·갭 스크리너(지역) + 단지 상세의 전세가율·갭 카드 */
  "ai-gap": "/analysis/gap",
  /* 관심 단지가 어느 지역 · 가격대에 몰렸는지 — 후보 단지 비교 표가 같은 목록을 같은 숫자 칸으로 */
  "ai-portfolio": "/analysis/compare",
  /* 대출 비율 · 금리 → 월 상환 · 이자 — 대출·비용 계산기(실제 계산 · 30일 35방문) */
  "ai-simulator": "/calculator",
  /* 금리 · 미분양 지표 — 시장·대출 시나리오(실제 기준금리로 상환 부담) · 임계 알림(economy_watches)은 등록 0건 */
  "ai-economy": "/analysis/scenario",
  /* 임장 · 매수 전 체크리스트 — 임장 가이드(/imjang) 체크리스트 · 노트 쓰기의 고려사항 */
  "my-checklist": "/imjang",
  /* 전세 계약 위험(전세가율 · 등기부 · 보증보험) — 계약 가이드 */
  "contract-risk": "/guides/contract",
};

export function isRetiredAiToolId(id: string): id is keyof typeof RETIRED_AI_TOOLS {
  return Object.prototype.hasOwnProperty.call(RETIRED_AI_TOOLS, id);
}

/** 살아 있는 도구인가 — 목록 · 사이트맵 · 실행 API 의 기준 */
export function isActiveAiToolId(id: string): id is CoreAiAnalysisToolId {
  return (ACTIVE_AI_TOOL_IDS as readonly string[]).includes(id);
}

/** 통합된 도구의 이동 주소 — 쿼리는 그대로(?complexId= 로 온 사람은 그 단지로 이어진다). 살아 있는 도구면 null */
export function retiredAiToolTarget(id: string, search = ""): string | null {
  if (!isRetiredAiToolId(id)) return null;
  const to = RETIRED_AI_TOOLS[id];
  if (!search) return to;
  const q = search.startsWith("?") ? search.slice(1) : search;
  return q ? `${to}${to.includes("?") ? "&" : "?"}${q}` : to;
}
