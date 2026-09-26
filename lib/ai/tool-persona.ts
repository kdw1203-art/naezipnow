/**
 * 도구 16종의 **성격** 단일 소스 — 색·아이콘을 넘어 "화면이 어떻게 생겼고,
 * [1008 · W] 문구를 쉬운 말로 — "궤적·갈래·심사·정독·관제" 같은 말은 처음 온 사람이 알아듣지 못했다(소유자).
 * 도는 동안 무슨 말을 하고, 결과가 어떻게 등장하며, 결과에 따라 어떤 말투를
 * 쓰는가" 까지.
 *
 * ── 왜 만들었나 (소유자 지적, 2026-09-09) ──────────────────────────────────
 * "AI 분석에 각 테마별 화면 구성·디자인·기능의 특색과 개성을 추가해 달라."
 *
 * 지적이 정확했다. lib/ai/tool-identity.ts 를 세어 보면 **12종 중 10종이
 * 같은 액센트(#3182f6)** 를 쓰고 gradient·softBg 까지 같은 문자열이다. 화면도
 * 하나다 — app/analysis/ai/[tool]/WorkbenchClient.tsx 한 벌이 12종을 전부
 * 그리고, 실행 중 문구("국토부 실거래 대조 중" 외 3줄)는 도구와 무관하게 고정,
 * 결과 등장도 전부 같은 카드다. 즉 도구를 바꿔도 **바뀌는 것은 제목과 아이콘뿐**
 * 이었다. 이건 취향 문제가 아니라, 다른 일을 하는 화면이 같아 보이면 사용자가
 * "아까 그 화면 아닌가?" 로 되돌아 나가는 문제다.
 *
 * ── 무엇을 담나 ────────────────────────────────────────────────────────────
 *  ① composition — 화면 구성 아키타입(입력 순서·결과 배치가 달라진다)
 *  ② palette     — 도구 고유색. 라이트/다크 각각 본문 대비 4.5:1 을 넘는 값만
 *                  쓴다(tests/unit/tool-persona-980.test.ts 가 실제로 계산해 고정)
 *  ③ runStages   — 실행 중 4줄. **같은 실제 점검을 도구의 말로** 적는다.
 *                  가짜 단계·가짜 진행률은 만들지 않는다(브랜드 원칙).
 *  ④ reveal      — 결과가 등장하는 방식(숫자가 오르는가, 표가 펼쳐지는가…)
 *  ⑤ tone        — 결과 구간별 한 줄. strong/mixed/weak 그리고 **thin**
 *                  (데이터가 모자랄 때) — 모자란 걸 좋게 말하지 않는다.
 *
 * 이 파일에는 React·브라우저 API 가 없다 — 서버 카드·클라이언트 워크벤치·
 * 단위테스트가 모두 같은 값을 읽는다.
 */

import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";
import { AI_TOOL_IDS } from "@/lib/ai/ai-tools";

/** 지역·시장 계열 4종 — AI 도구가 아니라 공표 통계 화면이라 성격이 다르다. */
export const MARKET_TOOL_IDS = [
  "market:price",
  "market:timing",
  "market:temperature",
  "market:gap",
] as const;
export type MarketToolId = (typeof MARKET_TOOL_IDS)[number];
export type ToolPersonaId = AiAnalysisToolId | MarketToolId;

export const PERSONA_IDS: readonly ToolPersonaId[] = [...AI_TOOL_IDS, ...MARKET_TOOL_IDS];

/** 지역·시장 4종의 경로 ↔ 페르소나 id */
export const MARKET_TOOL_BY_HREF: Record<string, MarketToolId> = {
  "/analysis/price": "market:price",
  "/analysis/timing": "market:timing",
  "/analysis/temperature": "market:temperature",
  "/analysis/gap": "market:gap",
};

/**
 * 화면 구성 아키타입 — **입력 순서와 결과 배치가 실제로 달라진다.**
 * 같은 3단계(대상→옵션→실행)를 쓰더라도 무엇이 주인공인지가 다르다.
 */
export type CompositionArchetype =
  /** 서류 심사 — 왼쪽에 종합 점수 하나, 오른쪽에 항목별 채점이 줄줄이 */
  | "dossier"
  /** 시간축 — 시나리오 세 줄이 왼→오른쪽으로 뻗는다. 축이 주인공 */
  | "trajectory"
  /** 위험 장부 — 심각도 스트라이프가 붙은 항목이 세로로 쌓인다 */
  | "ledger"
  /** 비교표 — 열이 대상, 행이 기준. 표가 주인공 */
  | "matrix"
  /** 동선 — 번호가 매겨진 경유지 카드 + 지도. 순서가 주인공 */
  | "route"
  /** 계기판 — 큰 눈금 하나가 화면 가운데. 단일 신호가 주인공 */
  | "gauge"
  /** 작업장부 — 채워 가는 체크 항목. 진행률이 주인공 */
  | "workbook"
  /** 배분 — 도넛 + 비중 막대. 비율이 주인공 */
  | "allocation"
  /** 계산기 — 입력 슬라이더가 위, 숫자가 실시간으로 굴러간다 */
  | "calculator"
  /** 콘솔 — 지표 칩 격자 + 신호등. 한눈에 훑는 화면 */
  | "console"
  /** 지도책 — 지역 분포·순위가 주인공. 대상이 단지가 아니라 지역이다 */
  | "atlas";

/** 실행 중 연출 — 도구가 하는 일의 몸짓 */
export type RunMotion =
  /** 항목이 하나씩 체크된다(진단·체크리스트) */
  | "tick"
  /** 위에서 아래로 훑는 선(리스크·계약 — 읽어 내려간다) */
  | "scan"
  /** 선이 그려진다(동선·예측 — 경로/궤적) */
  | "draw"
  /** 좌에서 우로 쓸린다(비교·시세 — 나란히 놓는다) */
  | "sweep"
  /** 숫자가 굴러간다(수익률·갭 — 계산한다) */
  | "roll"
  /** 블록이 쌓인다(포트폴리오·시세 분포) */
  | "stack"
  /** 바늘이 흔들린다(타이밍·온도 — 재고 있다) */
  | "pulse";

/** 결과 등장 방식 */
export type RevealMotion =
  | "count-up"
  | "stagger-rows"
  | "sweep-lr"
  | "draw-path"
  | "flip"
  | "fill";

/** 결과 구간 — thin 은 "데이터가 모자라 판단을 아낀다" 이다(좋게 말하지 않는다) */
export type OutcomeBand = "strong" | "mixed" | "weak" | "thin";

export type PersonaPalette = {
  /** 라이트 배경(#ffffff) 위 본문 대비 4.5:1 이상 */
  accent: string;
  /** 다크 표면(#171b22) 위 본문 대비 4.5:1 이상 */
  accentDark: string;
  /** 라이트 칩 배경 — 액센트를 아주 옅게 */
  soft: string;
  /** 다크 칩 배경 */
  softDark: string;
};

export type ToolPersona = {
  id: ToolPersonaId;
  /** 한 낱말 성격 — 화면 머리의 눈썹 라벨로 뜬다 */
  character: string;
  /** 이 화면이 하는 일을 도구의 말로 한 문장 */
  premise: string;
  composition: CompositionArchetype;
  palette: PersonaPalette;
  runMotion: RunMotion;
  reveal: RevealMotion;
  /**
   * 실행 중 4줄. 앞의 3줄은 **실제 점검 3가지**(실거래 대조 / 전월세·공급 /
   * 노트·뉴스)에 붙는 도구별 설명이고, 마지막 한 줄은 이 도구가 그 재료로
   * 무엇을 하는지다. 문구만 다르고 점검 자체는 같다 — 없는 단계를 지어내면
   * 로딩 화면이 거짓말을 하게 된다.
   */
  runStages: readonly [string, string, string, string];
  /** 결과 구간별 한 줄 — 화면이 결과를 두고 하는 말 */
  tone: Record<OutcomeBand, string>;
  /** 결과를 보고 나서 할 일 — 도구마다 다음 행동이 다르다 */
  nextAction: { label: string; href: string };
};

/* ─────────────────────────────────────────────────────────────────────────
   색 고르기 규칙
   ────────────────────────────────────────────────────────────────────────
   ① 주제에서 나온다 — 리스크는 붉고, 동선은 초록(길), 수익률은 이익의 초록,
      타이밍은 신호의 주황, 계약은 서류의 적갈. 무작위 팔레트가 아니다.
   ② 라이트는 흰 바탕 위 4.5:1, 다크는 #171b22 위 4.5:1 을 각각 넘는 값만.
      눈으로 고르지 않고 tests/unit/tool-persona-980.test.ts 가 계산해 막는다.
   ③ 옆 도구와 붙어 보이지 않게 색상환에서 벌린다. 같은 주제(갭)만 의도적으로
      가깝게 둔다 — AI 갭투자와 지역 갭 스크리너는 실제로 같은 이야기다.
   ───────────────────────────────────────────────────────────────────────── */

function p(accent: string, accentDark: string, soft: string, softDark: string): PersonaPalette {
  return { accent, accentDark, soft, softDark };
}

export const TOOL_PERSONAS: Record<ToolPersonaId, ToolPersona> = {
  /* ── AI 도구 12종 ───────────────────────────────────────────────────── */
  "ai-diagnosis": {
    id: "ai-diagnosis",
    character: "점수",
    premise: "가격 흐름·거래·공급·이웃 평가·금리 5가지를 점수로 매겨 한눈에 보여 줘요",
    composition: "dossier",
    palette: p("#1D4ED8", "#93B4FF", "#EEF3FF", "rgba(147,180,255,.14)"),
    runMotion: "tick",
    reveal: "count-up",
    runStages: [
      "국토부 실거래 불러오는 중 — 점수의 기준을 잡아요",
      "전월세·입주 예정 확인 중 — 수요와 공급을 봐요",
      "이웃 임장노트·뉴스를 읽는 중 — 사람이 본 것을 더해요",
      "항목별 점수를 모으는 중",
    ],
    tone: {
      strong: "여러 항목이 고르게 좋아요. 약한 곳이 없다는 게 이 단지의 강점이에요.",
      mixed: "좋은 항목과 약한 항목이 섞여 있어요. 점수가 낮은 항목부터 확인하세요.",
      weak: "지금 점수로는 권하기 어려워요. 어느 항목이 점수를 끌어내렸는지 보세요.",
      thin: "점수를 낼 자료가 모자라요. 없는 점수를 지어내지 않고 비워 뒀어요.",
    },
    nextAction: { label: "약한 항목 위험 점검하기", href: "/analysis/ai/ai-risk" },
  },
  "ai-prediction": {
    id: "ai-prediction",
    character: "시나리오",
    premise: "최근 실거래가에서 출발해 1~5년 뒤 가격을 낙관·기본·비관 세 가지로 그려요",
    composition: "trajectory",
    palette: p("#6D28D9", "#C3A6FF", "#F4EEFF", "rgba(195,166,255,.14)"),
    runMotion: "draw",
    reveal: "draw-path",
    runStages: [
      "국토부 실거래 불러오는 중 — 출발 가격을 잡아요",
      "전월세·입주 예정 확인 중 — 앞으로 들어올 물량을 봐요",
      "이웃 임장노트·뉴스로 최근 분위기를 보는 중",
      "낙관·기본·비관 시나리오를 그리는 중",
    ],
    tone: {
      strong: "세 시나리오 모두 오르는 쪽이에요. 다만 가정 계산이지 예측이 아니에요.",
      mixed: "시나리오 사이 간격이 커요 — 그 간격만큼 앞날이 불확실하다는 뜻이에요.",
      weak: "기본 시나리오도 내리는 쪽이에요. 낙관 시나리오가 무엇을 가정하는지 보세요.",
      thin: "시나리오를 그릴 자료가 모자라요. 선을 억지로 잇지 않았어요.",
    },
    nextAction: { label: "이 가격으로 수익률 계산", href: "/analysis/ai/ai-simulator" },
  },
  "ai-risk": {
    id: "ai-risk",
    character: "점검",
    premise: "거래량·전세가율·입주 물량·미분양·월세 비중 5가지 위험 신호를 하나씩 확인해요",
    composition: "ledger",
    palette: p("#B91C1C", "#FF9E93", "#FEF0EF", "rgba(255,158,147,.14)"),
    runMotion: "scan",
    reveal: "stagger-rows",
    runStages: [
      "국토부 실거래 확인 중 — 거래가 끊겼는지 봐요",
      "전월세·입주 예정 확인 중 — 공급 부담을 봐요",
      "이웃 임장노트·뉴스에서 경고를 찾는 중",
      "위험 신호 5가지를 하나씩 점검하는 중",
    ],
    tone: {
      strong: "지금 잡히는 큰 위험은 없어요. 위험이 없다는 게 아니라 이 5가지에서 안 걸렸다는 뜻이에요.",
      mixed: "그냥 넘겨도 되는 것과 꼭 확인할 것이 섞여 있어요.",
      weak: "먼저 풀어야 할 위험이 있어요. 위에서부터 보세요.",
      thin: "점검할 자료가 모자라요. 위험이 없다는 뜻이 아니에요.",
    },
    nextAction: { label: "계약 위험까지 점검", href: "/analysis/ai/contract-risk" },
  },
  "ai-compare": {
    id: "ai-compare",
    character: "비교",
    premise: "담은 단지 2~3곳의 가격·거래·지역 흐름을 같은 칸으로 나란히 놓아요",
    composition: "matrix",
    palette: p("#0F766E", "#4FD8C4", "#E8F7F5", "rgba(79,216,196,.14)"),
    runMotion: "sweep",
    reveal: "sweep-lr",
    runStages: [
      "국토부 실거래 불러오는 중 — 같은 면적으로 맞춰요",
      "전월세·입주 예정 확인 중 — 후보별 공급 부담을 봐요",
      "지역 흐름을 후보마다 붙이는 중",
      "같은 칸으로 나란히 놓는 중",
    ],
    tone: {
      strong: "한 곳이 대부분의 기준에서 앞서요. 흔치 않은 경우예요.",
      mixed: "기준마다 앞서는 곳이 달라요 — 무엇을 포기할지 정할 차례예요.",
      weak: "어느 쪽도 뚜렷하지 않아요. 후보를 바꿔 보는 게 빨라요.",
      thin: "나란히 놓을 후보가 모자라요. 두 곳 이상 담아 주세요.",
    },
    nextAction: { label: "앞선 단지로 임장 동선 짜기", href: "/analysis/ai/ai-inspection" },
  },
  "ai-inspection": {
    id: "ai-inspection",
    character: "동선",
    premise: "같은 지역에서 함께 볼 단지를 골라 하루 임장 순서를 짜요",
    composition: "route",
    palette: p("#15803D", "#5FDD92", "#EAF7EF", "rgba(95,221,146,.14)"),
    runMotion: "draw",
    reveal: "draw-path",
    runStages: [
      "국토부 실거래 확인 중 — 들를 곳의 최근 가격을 봐요",
      "전월세·입주 예정 확인 중 — 근처 새 아파트를 봐요",
      "이웃 임장노트·뉴스에서 다녀온 기록을 찾는 중",
      "거래 많은 순서로 동선을 짜는 중",
    ],
    tone: {
      strong: "하루에 둘러보기 무리 없는 동선이에요.",
      mixed: "떨어진 곳이 섞여 있어요 — 하루에 다 돌기는 빠듯해요.",
      weak: "흩어져 있어요. 이틀로 나눠 다니는 편이 나아요.",
      thin: "동선을 짤 후보가 모자라요. 지도에서 몇 곳 더 골라 주세요.",
    },
    nextAction: { label: "임장노트 미리 만들기", href: "/notes/new" },
  },
  "my-checklist": {
    id: "my-checklist",
    character: "체크",
    premise: "임장·매수 전에 확인할 항목을 빠짐없이 챙겨요",
    composition: "workbook",
    palette: p("#0369A1", "#6DCBF5", "#E9F5FD", "rgba(109,203,245,.14)"),
    runMotion: "tick",
    reveal: "fill",
    runStages: [
      "국토부 실거래 확인 중 — 가격 항목을 채워요",
      "전월세·입주 예정 확인 중 — 임대 항목을 채워요",
      "이웃 임장노트·뉴스에서 이미 확인된 것을 찾는 중",
      "남은 확인 항목을 추리는 중",
    ],
    tone: {
      strong: "거의 다 채웠어요. 남은 것만 확인하면 돼요.",
      mixed: "절반쯤 왔어요. 비어 있는 줄이 지금 놓치고 있는 곳이에요.",
      weak: "아직 빈칸이 많아요. 위에서부터 하나씩 채워 보세요.",
      thin: "자동으로 채울 자료가 모자라요. 직접 채워야 하는 줄이 많아요.",
    },
    nextAction: { label: "빈칸을 임장에서 확인", href: "/notes/new" },
  },
  "ai-portfolio": {
    id: "ai-portfolio",
    character: "배분",
    premise: "관심 단지를 한데 모아 어디에 쏠렸는지 봐요",
    composition: "allocation",
    palette: p("#A16207", "#E8B93A", "#FDF4E3", "rgba(232,185,58,.14)"),
    runMotion: "stack",
    reveal: "fill",
    runStages: [
      "관심 단지 목록을 불러오는 중",
      "지역별로 세는 중",
      "가격대별로 세는 중 — 가격 알림 기준가로",
      "쏠린 곳을 찾는 중",
    ],
    tone: {
      strong: "고르게 나뉘어 있어요. 한 곳이 흔들려도 전체가 크게 흔들리지 않아요.",
      mixed: "한쪽으로 기울어 있어요. 기운 만큼 위험을 더 지고 있어요.",
      weak: "한 곳에 몰려 있어요. 그 한 곳의 사정이 곧 전체의 사정이에요.",
      thin: "모아 둔 자산이 모자라요. 비중을 말하기엔 이릅니다.",
    },
    nextAction: { label: "갈아타기 시나리오 보기", href: "/analysis/switch" },
  },
  "ai-timing": {
    id: "ai-timing",
    character: "신호",
    premise: "가격 흐름·거래 열기·입주 물량 신호 3개로 지금 사기 좋은지 봐요",
    composition: "gauge",
    palette: p("#C2410C", "#FFA470", "#FEF1EA", "rgba(255,164,112,.14)"),
    runMotion: "pulse",
    reveal: "count-up",
    runStages: [
      "국토부 실거래 확인 중 — 거래가 도는지 봐요",
      "전월세·입주 예정 확인 중 — 물량이 가격을 누르는지 봐요",
      "이웃 임장노트·뉴스로 분위기를 읽는 중",
      "신호등 3개를 켜는 중",
    ],
    tone: {
      strong: "신호가 사는 쪽에 유리해요. 그래도 바닥을 맞히는 도구는 아니에요.",
      mixed: "신호가 엇갈려요 — 지금은 서두를 이유가 약해요.",
      weak: "신호가 파는 쪽에 유리해요. 기다릴 이유가 있다는 뜻이에요.",
      thin: "신호를 볼 자료가 모자라요. 신호등을 억지로 켜지 않았어요.",
    },
    nextAction: { label: "이 흐름으로 시세 예측 보기", href: "/analysis/ai/ai-prediction" },
  },
  "ai-simulator": {
    id: "ai-simulator",
    character: "계산",
    premise: "대출 비율·금리로 월 상환액·이자를, 보유 기간을 넣으면 시나리오별 수익률을 계산해요",
    composition: "calculator",
    palette: p("#047857", "#3FD79B", "#E7F7F0", "rgba(63,215,155,.14)"),
    runMotion: "roll",
    reveal: "count-up",
    runStages: [
      "국토부 실거래 확인 중 — 기준 가격을 잡아요",
      "대출액과 원리금균등 월 상환액을 계산하는 중",
      "지역 가격 흐름으로 낙관·기본·비관 가정을 세우는 중",
      "보유 기간 뒤 팔았을 때의 연 수익률을 계산하는 중",
    ],
    tone: {
      strong: "이 단지 종합 점수가 좋아요. 수익률은 가격 가정에 따라 달라져요.",
      mixed: "이 단지 종합 점수는 보통이에요. 금리 1%p에 월 상환액이 얼마나 변하는지 보세요.",
      weak: "이 단지 종합 점수가 낮아요. 비관 시나리오 수익률부터 보세요.",
      thin: "계산에 넣을 값이 모자라요. 빈 값을 임의로 채우지 않았어요.",
    },
    nextAction: { label: "금리 시나리오로 흔들어 보기", href: "/analysis/scenario" },
  },
  "ai-gap": {
    id: "ai-gap",
    character: "갭",
    premise: "매매가와 전세가 차이(갭)가 얼마인지, 그 차이가 위험한지 봐요",
    composition: "gauge",
    palette: p("#A21CAF", "#EDA3F2", "#FBEEFC", "rgba(237,163,242,.14)"),
    runMotion: "roll",
    reveal: "fill",
    runStages: [
      "국토부 실거래 확인 중 — 매매가를 봐요",
      "전월세 신고 확인 중 — 전세가를 봐요",
      "입주 예정·뉴스 확인 중 — 전세가가 밀릴 요인을 봐요",
      "갭과 역전세 위험을 재는 중",
    ],
    tone: {
      strong: "갭이 작아요. 들어가기 쉽다는 뜻이지 안전하다는 뜻은 아니에요.",
      mixed: "갭이 보통이에요. 전세가가 내려갈 때 버틸 여유가 있는지가 관건이에요.",
      weak: "갭이 커요. 이 방식으로 들어가기엔 부담이 커요.",
      thin: "전세 거래가 모자라 갭을 재지 못했어요.",
    },
    nextAction: { label: "지역 전체 갭 순위 보기", href: "/analysis/gap" },
  },
  "ai-economy": {
    id: "ai-economy",
    character: "지표",
    premise: "금리·미분양 같은 큰 지표가 집값에 주는 신호를 모아 봐요",
    composition: "console",
    palette: p("#3730A3", "#A3AAFF", "#EEEFFE", "rgba(163,170,255,.14)"),
    runMotion: "pulse",
    reveal: "flip",
    runStages: [
      "국토부 실거래 확인 중 — 큰 지표가 실제 거래에 닿았는지 봐요",
      "전월세·입주 예정 확인 중 — 공급 지표를 새로 봐요",
      "뉴스에서 지표를 흔든 소식을 찾는 중",
      "지표별 신호를 켜는 중",
    ],
    tone: {
      strong: "지표들이 같은 방향을 가리켜요. 흔치 않은 정렬이에요.",
      mixed: "지표가 엇갈려요 — 어느 지표를 믿느냐가 곧 관점이에요.",
      weak: "집값을 누르는 지표가 많아요. 무엇이 먼저 풀려야 하는지 보세요.",
      thin: "최근에 갱신된 지표가 모자라요.",
    },
    /* [1008 · 리뷰 A-28] 알림은 이 화면의 "기준금리 알림 걸기" 카드에서 건다 — 알림함(/notifications)은 알림이
       도착하는 곳이지 거는 곳이 아니었다. 같은 화면의 그 카드로 내려 보낸다. */
    nextAction: { label: "기준금리 알림 걸기", href: "/analysis/ai/ai-economy#economy-watch" },
  },
  "contract-risk": {
    id: "contract-risk",
    character: "계약",
    premise: "전세가율·등기부·보증보험으로 전세 계약 위험을 점검해요",
    composition: "ledger",
    palette: p("#9F1239", "#FB9CBB", "#FDEFF3", "rgba(251,156,187,.14)"),
    runMotion: "scan",
    reveal: "stagger-rows",
    runStages: [
      "전세가율 확인 중 — 보증금이 매매가에 얼마나 가까운지 봐요",
      "등기부·보증보험 확인 항목을 모으는 중",
      "계약서에 넣을 특약 문장을 고르는 중",
      "계약 전에 확인할 것을 정리하는 중",
    ],
    tone: {
      strong: "크게 걸리는 것은 없어요. 법률 자문을 대신하지는 않아요.",
      mixed: "손볼 부분이 몇 개 있어요. 표시된 곳부터 보세요.",
      weak: "그대로 계약하기 어려운 부분이 있어요. 위에서부터 확인하세요.",
      thin: "점검할 내용이 모자라요. 전세 보증금과 전세가율을 넣어 주세요.",
    },
    nextAction: { label: "단지 위험도 함께 보기", href: "/analysis/ai/ai-risk" },
  },

  /* ── 지역·시장 4종 ─────────────────────────────────────────────────────
     여기는 AI 가 판단하는 화면이 아니라 **공표 통계를 그대로 보여 주는** 화면이다.
     그래서 성격이 달라야 한다 — 말투는 더 건조하고, 주인공은 점수가 아니라 분포다.
     runStages 는 AI 실행이 아니라 데이터 적재 상태를 말한다. */
  "market:price": {
    id: "market:price",
    character: "실측",
    premise: "면적대별로 실제 체결된 값을 늘어놓습니다 — 호가가 아닙니다",
    composition: "atlas",
    palette: p("#0E7490", "#54D3EC", "#E7F6FA", "rgba(84,211,236,.14)"),
    runMotion: "stack",
    reveal: "stagger-rows",
    runStages: [
      "국토부 실거래 불러오는 중",
      "면적대별로 나누는 중",
      "중앙값·평단가 계산 중",
      "표본이 적은 구간을 표시하는 중",
    ],
    tone: {
      strong: "표본이 넉넉한 구간입니다. 중앙값을 믿을 만해요.",
      mixed: "구간에 따라 표본이 들쭉날쭉합니다. 적은 구간은 참고만 하세요.",
      weak: "거래가 적어 값이 튑니다. 평균보다 중앙값을 보세요.",
      thin: "이 조건의 실거래가 모자랍니다. 기간이나 면적대를 넓혀 보세요.",
    },
    nextAction: { label: "이 지역 흐름 보기", href: "/analysis/timing" },
  },
  "market:timing": {
    id: "market:timing",
    character: "흐름",
    premise: "12개월 지수와 모멘텀으로 지역이 어느 쪽으로 가는지 봅니다",
    composition: "trajectory",
    palette: p("#4338CA", "#A7AEFF", "#EEEFFE", "rgba(167,174,255,.14)"),
    runMotion: "draw",
    reveal: "draw-path",
    runStages: [
      "지수 12개월치 불러오는 중",
      "월간 변화율 계산 중",
      "모멘텀 방향 판정 중",
      "표본이 얇은 달을 표시하는 중",
    ],
    tone: {
      strong: "방향이 일정합니다. 최근 몇 달이 같은 쪽을 봅니다.",
      mixed: "방향이 자주 바뀝니다 — 추세로 부르기 이른 구간이에요.",
      weak: "내리는 쪽이 이어집니다. 반등 신호는 아직 안 잡힙니다.",
      thin: "지수 표본이 모자라 방향을 말하지 않았습니다.",
    },
    nextAction: { label: "단지 단위로 좁혀 보기", href: "/analysis/ai/ai-timing" },
  },
  "market:temperature": {
    id: "market:temperature",
    character: "체온",
    premise: "매주 잰 기록을 이어 붙여 지금이 아니라 추세를 보여 줍니다",
    composition: "atlas",
    palette: p("#B45309", "#F0AC4E", "#FDF3E5", "rgba(240,172,78,.14)"),
    runMotion: "pulse",
    reveal: "fill",
    runStages: [
      "주간 온도 기록 불러오는 중",
      "지역별로 묶는 중",
      "최근 구간 방향 계산 중",
      "기록이 짧은 지역을 표시하는 중",
    ],
    tone: {
      strong: "여러 주 연속 같은 방향입니다.",
      mixed: "주마다 오르내립니다 — 한 주 값으로 판단하지 마세요.",
      weak: "식는 쪽으로 이어집니다.",
      thin: "쌓인 주가 모자랍니다. 추세로 읽기에는 이릅니다.",
    },
    nextAction: { label: "면적대별 실거래로 확인", href: "/analysis/price" },
  },
  "market:gap": {
    id: "market:gap",
    character: "순위",
    premise: "시군구를 전세가율로 줄 세우고 실측 갭을 먼저 보여 줍니다",
    composition: "atlas",
    palette: p("#7E22CE", "#D3A2F7", "#F6EEFD", "rgba(211,162,247,.14)"),
    runMotion: "sweep",
    reveal: "stagger-rows",
    runStages: [
      "시군구 전세가율 불러오는 중",
      "실측 갭 우선으로 정렬 중",
      "공표 통계로 빈 칸 메우는 중",
      "추정값에 표시를 다는 중",
    ],
    tone: {
      strong: "실측 갭이 잡히는 지역이 충분합니다.",
      mixed: "실측과 추정이 섞여 있습니다. 표시를 보고 구분하세요.",
      weak: "대부분 추정값입니다. 순위를 그대로 믿지 마세요.",
      thin: "이 조건의 표본이 모자랍니다.",
    },
    nextAction: { label: "관심 단지 갭 진단", href: "/analysis/ai/ai-gap" },
  },
};

/**
 * 결과 화면의 **블록 순서** — 아키타입이 실제로 화면 구성을 바꾸는 자리.
 *
 * 예전에는 12종이 전부 같은 순서(제목 → 위젯 → 반대 시나리오 → 본문)였다.
 * 그런데 도구마다 "먼저 보여야 하는 것"이 다르다:
 *   · 계기판·점수형(gauge·dossier·calculator·allocation) — 눈금/점수가 본문보다 먼저
 *   · 장부형(ledger) — 위험 목록 바로 뒤에 "이 판단이 틀리는 조건"이 와야 읽힌다
 *   · 표·목록형(matrix·atlas·console·workbook) — 표가 먼저고 위젯은 보조다
 * 순서를 아키타입에서 뽑으므로 16종에 손으로 적지 않는다(적으면 어긋난다).
 */
export type ResultBlock = "headline" | "widget" | "body" | "counters";

/* [998] 본체는 lib/ai/result-order.ts — 클라이언트가 이 모듈(페르소나 본문 28KB)을 끌고 오지 않게 분리. */
export { resultOrder } from "@/lib/ai/result-order";

/** 잘못된 id 대응 — 화면이 죽는 것보다 기본 성격으로 뜨는 편이 낫다. */
export function getToolPersona(id: string): ToolPersona {
  return TOOL_PERSONAS[id as ToolPersonaId] ?? TOOL_PERSONAS["ai-diagnosis"];
}

/** 경로로 지역·시장 페르소나 찾기 (없으면 null) */
export function marketPersonaByHref(href: string): ToolPersona | null {
  const id = MARKET_TOOL_BY_HREF[href];
  return id ? TOOL_PERSONAS[id] : null;
}

/**
 * 도구 색을 CSS 변수로 — 화면 한 곳(래퍼)에 style 로 붙이면 그 안쪽 전부가
 * 이 색을 쓴다. 클래스마다 색을 적지 않는다(적으면 반드시 어긋난다).
 */
/* [1008] 다크 모드 도구 색은 globals.css `.dark .tool-scope`(!important)가 맡는다 — personaVars 가 인라인
   style 이라 선택자 규칙에 !important 가 없으면 밝은 값이 남았다(1008 · W 다크 캡처). */
export function personaVars(persona: ToolPersona): Record<string, string> {
  return {
    "--tool-accent": persona.palette.accent,
    /* [1008] 채움(흰 글자) 전용 — 다크에서도 라이트 액센트를 쓴다. 다크 --tool-accent 는 어두운 면 위 **글자**용
       밝은 값(accentDark)이라 그 위에 흰 글자를 얹으면 2:1 까지 떨어졌다(1008 리뷰 A-13: 다크 리스크 점검
       "이 단지 임장노트 쓰기" #FF9E93 위 흰 글자 1.99:1). 라이트 액센트는 흰 글자 4.5:1 이상으로 고른 값이다. */
    "--tool-fill": persona.palette.accent,
    "--tool-accent-dark": persona.palette.accentDark,
    "--tool-soft": persona.palette.soft,
    "--tool-soft-dark": persona.palette.softDark,
  };
}
