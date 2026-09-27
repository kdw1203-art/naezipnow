import { AI_TOOL_IDS, CORE_AI_TOOL_IDS, type AiAnalysisToolId } from "@/lib/ai/ai-tools";
import { TOOL_IDENTITIES } from "@/lib/ai/tool-identity";

/* ============================================================
   분석 허브 카탈로그 — [UI-01·02·04·06] 단일 진실 소스.

   왜 이 파일이 생겼나(2026-08-25 실측 진단):
   - 허브 한 화면에 진입점이 23개였고 전부 같은 무게로 평평했다(UI-01).
   - 워크벤치 12종과 도구 카드 8종 사이에 **이름이 겹치는 쌍이 5개** 있었다
     (비교·포트폴리오·타이밍·갭·시나리오) — "어떤 게 어느 기능인지" 알 방법이
     없었던 직접 원인이다(UI-02). 이름에 **대상**(이 단지 / 지역 / 전국)을 넣어
     구분한다. 사용자는 기능 이름이 아니라 대상으로 고른다.

   [v4 · 한 화면 한 가지] 허브는 이제 **구분선 목록 3개**(단지 분석 · 지역 시세 · 내 임장노트)다.
   카드·아이콘 타일·계열 배지·계열별 출처 줄·히어로 칩이 없어졌으므로 그 재료(badge·hint·iconClass·
   sparkClass·icon·tierNavLabel·workbenchCard·WORKBENCH_ICONS)를 지웠다. 예시 계산 3종(시나리오·자산 배분·
   갈아타기)도 허브에서 뺐다 — 각 화면은 그대로 있고 다른 입구(홈 오늘의 한 줄·계산기·도구 간 이어가기·
   AI 결과의 다음 행동)로 들어간다.
   ============================================================ */

export type TierId = "complex" | "market" | "record";

export interface TierMeta {
  id: TierId;
  /** [v4] 섹션 제목 — 명사 두어 글자("단지 분석"). 화면은 옆에 도구 수를 숫자로 붙인다("단지 분석 12").
   *  /analysis/ai/[tool] 의 경로 표시(AI 분석 › 단지 분석)도 이 값을 읽는다. */
  label: string;
}

export const TIERS: Record<TierId, TierMeta> = {
  complex: { id: "complex", label: "단지 분석" },
  market: { id: "market", label: "지역 시세" },
  record: { id: "record", label: "내 임장노트" },
};

/** [v4] 지역 시세 섹션 끝 출처 캡션 한 줄 — 카드마다 달던 출처 줄을 여기 하나로 모았다 */
export const MARKET_SOURCES = "출처 국토교통부 실거래 신고 · 한국부동산원 매매가격지수·전세가율";

export interface HubTool {
  href: string;
  title: string;
  /** [v4] 행 보조 한 줄 — **결과**가 무엇인지(기능 설명 문장 아님). 실측 티저가 있으면 화면이 티저 캡션으로 바꾼다 */
  sub: string;
  tier: TierId;
  /** 티저 키 — hub-teasers 의 실측 숫자와 연결 (없으면 행 오른쪽이 `›`) */
  teaser?: "price" | "timing" | "temp" | "gap";
}

/** 워크벤치(단지 1개 스코프) — 많이 쓰는 4개가 앞, 나머지가 뒤(UI-03). */
export const WORKBENCH_CORE: readonly AiAnalysisToolId[] = CORE_AI_TOOL_IDS;
export const WORKBENCH_MORE: readonly AiAnalysisToolId[] = AI_TOOL_IDS.filter(
  (id) => !CORE_AI_TOOL_IDS.includes(id as (typeof CORE_AI_TOOL_IDS)[number]),
);

/**
 * [1012 · R2 · A6] 워크벤치 행 보조 줄의 **도구 고유 숫자** — 각 도구가 실제로 계산하는 것의 개수만
 * (lib/ai/insight-blocks: 진단 레이더 5축 · 타이밍 신호 3개 · 위험 신호 5개 / lib/ai/verdict: 시나리오 3개 ·
 * 1~5년 · 숫자 칸 4개 · 전세가율 80·90% / lib/ai/price-scenarios). 지어낸 수치 없음 — 코드에 있는 개수뿐.
 * [v4] 화면(workbench-cards.ts)이 앞에 결과 이름(tool-identity metricLabel — "투자 점수")을 붙여
 * "투자 점수 · 5개 항목" 한 줄을 만든다. 커버리지("실거래 있는 단지 N곳 · 국토교통부 신고분")를 12줄마다
 * 되풀이하던 꼬리는 지웠다 — 같은 사실은 화면 머리 한 줄에 한 번만.
 */
export const WORKBENCH_FACTS: Record<AiAnalysisToolId, string> = {
  "ai-diagnosis": "5개 항목",
  "ai-prediction": "시나리오 3개 · 1~5년",
  "ai-risk": "위험 신호 5개",
  "ai-compare": "단지 2~3곳 · 숫자 칸 4개",
  "ai-inspection": "같은 지역 · 최근 6개월 거래 순",
  "my-checklist": "임장·계약 전 확인 항목",
  "ai-portfolio": "관심 단지 · 지역·가격대 2축",
  "ai-timing": "신호 3개",
  "ai-simulator": "대출 비율·금리·기간 3개 입력",
  "ai-gap": "매매가·전세가 2개 입력",
  "ai-economy": "기준금리 · 미분양 · 지역 지수",
  "contract-risk": "전세가율 80% 주의 · 90% 위험",
};

/** [v4] 워크벤치 행 보조 한 줄 — "투자 점수 · 5개 항목"(결과 이름 · 코드에 있는 개수).
 *  metricLabel 이 기본값("결과")이면 개수만. 서버(workbench-cards.ts)에서만 부른다 — tool-identity 는 큰 모듈이라
 *  클라이언트가 이 함수를 import 하면 번들에 통째로 실린다. */
export function workbenchSub(id: AiAnalysisToolId): string {
  const label = TOOL_IDENTITIES[id].metricLabel;
  const own = WORKBENCH_FACTS[id];
  return label && label !== "결과" ? `${label} · ${own}` : own;
}

/* 지역·시장 / 내 기록 도구.
   [UI-02] 중복은 **워크벤치 쪽 이름에 대상("이 단지"·"내")을 넣어** 풀었다.
   그래서 여기 제목은 도착 페이지가 스스로 쓰는 이름을 그대로 쓴다 — 목록에서
   본 이름과 열린 화면의 이름이 다르면 그게 다시 "어떤 게 어느 기능인지"를
   흐린다. 대상(지역/내 기록)은 제목이 아니라 **섹션 제목**이 말한다. */
export const HUB_TOOLS: readonly HubTool[] = [
  {
    href: "/analysis/price",
    title: "면적대별 실거래 시세",
    sub: "면적대별 평단가·중앙값",
    tier: "market",
    teaser: "price",
  },
  {
    href: "/analysis/timing",
    title: "시세·타이밍 분석",
    sub: "12개월 지수·모멘텀",
    tier: "market",
    teaser: "timing",
  },
  {
    href: "/analysis/temperature",
    title: "지역별 시장 온도",
    sub: "주간 온도 0~100 · 추세",
    tier: "market",
    teaser: "temp",
  },
  {
    href: "/analysis/gap",
    title: "전세가율·갭 스크리너",
    sub: "시군구 전세가율 순위",
    tier: "market",
    teaser: "gap",
  },
  {
    href: "/notes",
    title: "임장노트 분석",
    sub: "강점·약점·확인 항목",
    tier: "record",
  },
  {
    href: "/analysis/compare",
    title: "후보 단지 비교",
    sub: "담은 후보 단지 비교표",
    tier: "record",
  },
] as const;

/** 섹션별 도구 — 화면은 이 순서 그대로 그린다. */
export const MARKET_LIVE = HUB_TOOLS.filter((t) => t.tier === "market");
export const RECORD_LIVE = HUB_TOOLS.filter((t) => t.tier === "record");

/** 선택 단지를 ?complexId= 로 그대로 받는 도구 — 링크에 붙여 보낸다. */
export const ACCEPTS_COMPLEX: ReadonlySet<string> = new Set(["/analysis/compare", "/analysis/timing"]);

/** 워크벤치 도구 총 개수 — 섹션 제목의 숫자("단지 분석 12")에 쓴다. */
export const AI_TOOL_COUNT = AI_TOOL_IDS.length;

/** 허브 도구 전체 수 — 머리 사실 한 줄("도구 18개"). 세 섹션 숫자의 합과 같다. */
export const HUB_TOOL_COUNT = AI_TOOL_COUNT + MARKET_LIVE.length + RECORD_LIVE.length;
