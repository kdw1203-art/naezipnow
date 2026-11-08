import { ACTIVE_AI_TOOL_IDS, type AiAnalysisToolId } from "@/lib/ai/ai-tools";
import { TOOL_IDENTITIES } from "@/lib/ai/tool-identity";

/* ============================================================
   분석 허브 카탈로그 — [UI-01·02·04·06] 단일 진실 소스.

   왜 이 파일이 생겼나(2026-08-25 실측 진단):
   - 허브 한 화면에 진입점이 23개였고 전부 같은 무게로 평평했다(UI-01).
   - 워크벤치 12종과 도구 카드 8종 사이에 **이름이 겹치는 쌍이 5개** 있었다
     (비교·포트폴리오·타이밍·갭·시나리오) — "어떤 게 어느 기능인지" 알 방법이
     없었던 직접 원인이다(UI-02). 이름에 **대상**(이 단지 / 지역 / 전국)을 넣어
     구분한다. 사용자는 기능 이름이 아니라 대상으로 고른다.
   - 실데이터 도구와 체험(시뮬레이션) 도구가 9px 칩 하나로만 구분됐다(UI-04)
     → 구역 자체를 나눈다.
   - 아이콘이 이모지(📝📈⏱…)라 기기마다 모양이 달랐다(UI-06) → 선형 Icon 세트.

   계열(tier)은 색과 아이콘 배경을 결정한다 — 색이 곧 분류다.
   ============================================================ */

export type TierId = "complex" | "market" | "record";

export interface TierMeta {
  id: TierId;
  /** 계열 제목 — [1015 · 규칙 D] 소망문("단지 하나를 깊게 보고 싶어요")이 아니라 명사(label 과 같은 값) */
  question: string;
  hint: string;
  /** 아이콘 배경·강조에 쓰는 토큰 클래스 (raw hex 금지 — 대비 게이트 통과 조건) */
  iconClass: string;
  /** 스파크라인 선 색 — currentColor 를 타고 들어간다 */
  sparkClass: string;
  /** 계열 한 줄 요약 배지 */
  badge: string;
  /** [1012 · R2] 계열 이름(명사) — /analysis/ai/[tool] 의 경로 표시(AI 분석 › 단지 분석)가 읽는다 */
  label: string;
}

export const TIERS: Record<TierId, TierMeta> = {
  complex: {
    id: "complex",
    question: "단지 분석",
    hint: "단지명만 넣으면 실거래·전월세·공급·뉴스가 자동으로 붙습니다",
    iconClass: "bg-primary-soft text-primary",
    sparkClass: "text-primary",
    badge: "단지 1곳",
    label: "단지 분석",
  },
  market: {
    id: "market",
    question: "지역 시세",
    hint: "국토교통부 실거래와 공표 통계로 계산합니다",
    iconClass: "bg-success-soft text-success",
    sparkClass: "text-success",
    badge: "지역·전국",
    label: "지역 시세",
  },
  record: {
    id: "record",
    question: "내 임장노트",
    hint: "임장노트를 점수화하고 후보를 나란히 비교합니다",
    iconClass: "bg-warning-soft text-warning",
    sparkClass: "text-warning",
    badge: "내 기록",
    label: "내 임장노트",
  },
};

export interface HubTool {
  href: string;
  title: string;
  desc: string;
  /** 선형 아이콘 이름 (app/components/Icon.tsx) — 이모지 금지 */
  icon: string;
  tier: TierId;
  /** 실데이터가 아니라 예시 계산이면 true */
  sim?: boolean;
}

/** 워크벤치(단지 1개 스코프) — [1109 · AI 분석 통폐합] 살아 있는 4종만(종합 진단 · 시세 예측 · 매수 타이밍 · 임장 동선).
 *  "그 밖의 8종" 접힘 칸은 없다 — 8종은 같은 일을 하는 화면으로 308(lib/ai/ai-tools RETIRED_AI_TOOLS). */
export const WORKBENCH_CORE: readonly AiAnalysisToolId[] = ACTIVE_AI_TOOL_IDS;
export const WORKBENCH_MORE: readonly AiAnalysisToolId[] = [];

/** 워크벤치 12종의 허브용 아이콘 — TOOL_IDENTITIES 는 lucide 컴포넌트를 들고
 *  있어 서버 카드에서 바로 못 쓴다. 같은 뜻의 선형 아이콘 이름으로 잇는다. */
export const WORKBENCH_ICONS: Record<AiAnalysisToolId, string> = {
  "ai-diagnosis": "target",
  "ai-prediction": "trending-up",
  "ai-risk": "shield",
  "ai-compare": "scale",
  "ai-inspection": "compass",
  "my-checklist": "clipboard",
  "ai-portfolio": "briefcase",
  "ai-timing": "clock",
  "ai-simulator": "calculator",
  "ai-gap": "coin",
  "ai-economy": "bar",
  "contract-risk": "file-text",
};

export function workbenchCard(id: AiAnalysisToolId) {
  const t = TOOL_IDENTITIES[id];
  return {
    href: `/analysis/ai/${id}`,
    title: t.title,
    desc: t.tagline,
    icon: WORKBENCH_ICONS[id] ?? "sparkles",
  };
}

/* 지역·시장 / 내 기록 화면.
   [UI-02] 중복은 **워크벤치 쪽 이름에 대상("이 단지"·"내")을 넣어** 풀었다. 제목은 도착 페이지가 스스로 쓰는 이름 그대로.
   [1110 · AI 분석 2차 통폐합] 소유자 2026-11-07 ~ 08:
     · 지역 시세 도구 5줄(면적대별 실거래가 · 시세·타이밍 · 지역별 시장 온도 · 갭 스크리너 · 시나리오) → **지역 시세 분석 하나**
       (/analysis/timing — 시 · 구 · 동 검색 + 시/도 필터 → 그 지역의 종합 화면 /region/[id]). 면적대별 실거래가(/analysis/price)는 지웠다 →
       /analysis/timing 301(그 일은 지역 종합 화면의 "면적대·가격대별 실거래" · 실거래 구간 탭이 한다). 온도 지도 · 갭 순위 · 시나리오는
       **지역 비교 화면**으로 남아 지역 시세 분석 아래 글자 링크 — 허브 표의 줄이 아니다.
     · 내 임장노트 묶음(임장노트 분석 · 후보 단지 비교 · 노트 AI 실행)과 에이전트는 AI 분석에서 빼고 임장노트 카테고리(/notes/analysis)로.
   허브(/analysis)는 이 배열을 더는 표로 그리지 않는다 — 임장노트 분석 화면이 RECORD_LIVE 를, 글리프 · 페르소나 표가 href 를 읽는다. */
export const HUB_TOOLS: readonly HubTool[] = [
  {
    href: "/analysis/timing",
    title: "지역 시세 분석",
    desc: "시 · 구 · 동 검색 → 개요 · 실거래 구간 · 전월세 · 시장 온도 · 동네 · 월간 리포트",
    icon: "trending-up",
    tier: "market",
  },
  {
    href: "/analysis/temperature",
    title: "지역별 시장 온도",
    desc: "매주 쌓은 온도 기록으로 지금 값이 아니라 추세를 확인",
    icon: "flame",
    tier: "market",
  },
  {
    href: "/analysis/gap",
    title: "전세가율·갭 스크리너",
    desc: "시군구 전세가율 순위와 실측 우선 갭 — 공표 통계 기반",
    icon: "landmark",
    tier: "market",
  },
  {
    href: "/analysis/scenario",
    title: "시장·대출 시나리오",
    desc: "실제 기준금리로 상환 부담 변화를 계산 · 기준가 없으면 예시",
    icon: "calculator",
    tier: "market",
    sim: true,
  },
  {
    href: "/analysis/compare",
    title: "후보 단지 비교",
    desc: "담아 둔 후보 단지를 같은 기준의 표로 나란히",
    icon: "scale",
    tier: "record",
  },
  {
    href: "/agent",
    title: "에이전트",
    desc: "내 임장노트·실거래 조회 · 참고한 자료 목록 표시 · 수도권 실거래 기준",
    icon: "bot",
    tier: "record",
  },
  /* [1097 · 통폐합] 갈아타기 추천(/analysis/switch)은 추천 엔진 없이 "준비 중" 빈 화면이라 지웠다 → /analysis/timing 으로 리다이렉트 */
] as const;

export const LIVE_TOOLS = HUB_TOOLS.filter((t) => !t.sim);
export const SIM_TOOLS = HUB_TOOLS.filter((t) => t.sim);

/** 계열별 화면 — 지역 시세 계열(시나리오 포함) · 기록 계열(임장노트 분석 화면의 표) */
export const MARKET_LIVE = HUB_TOOLS.filter((t) => t.tier === "market");
export const RECORD_LIVE = LIVE_TOOLS.filter((t) => t.tier === "record");

/** 선택 단지를 ?complexId= 로 그대로 받는 도구 — 링크에 붙여 보낸다. */
export const ACCEPTS_COMPLEX: ReadonlySet<string> = new Set([
  "/analysis/scenario",
  "/analysis/compare",
]);

/** 워크벤치 도구 개수(살아 있는 4종) — 계열 머리글의 "N종" 표기에 쓴다. */
export const AI_TOOL_COUNT = ACTIVE_AI_TOOL_IDS.length;
