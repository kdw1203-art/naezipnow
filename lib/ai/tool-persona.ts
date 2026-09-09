/**
 * 도구 16종의 **성격** 단일 소스 — 색·아이콘을 넘어 "화면이 어떻게 생겼고,
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
    character: "심사",
    premise: "이 단지를 항목별로 채점해 종합 점수 하나로 답합니다",
    composition: "dossier",
    palette: p("#1D4ED8", "#93B4FF", "#EEF3FF", "rgba(147,180,255,.14)"),
    runMotion: "tick",
    reveal: "count-up",
    runStages: [
      "국토부 실거래 대조 — 점수의 바닥을 잡는 중",
      "전월세·입주 예정 — 수요와 공급 축을 채우는 중",
      "임장노트·뉴스 — 사람이 본 것을 반영하는 중",
      "항목별 채점을 합산하는 중 — 각주를 붙입니다",
    ],
    tone: {
      strong: "고르게 좋습니다. 약한 축이 없다는 게 이 단지의 강점이에요.",
      mixed: "잘하는 축과 못하는 축이 갈립니다. 아래 낮은 축부터 확인하세요.",
      weak: "지금 점수로는 권하기 어렵습니다. 어느 축이 끌어내렸는지 보세요.",
      thin: "채점할 재료가 모자랍니다. 점수를 만들어 내는 대신 비워 뒀어요.",
    },
    nextAction: { label: "약한 축 리스크로 보기", href: "/analysis/ai/ai-risk" },
  },
  "ai-prediction": {
    id: "ai-prediction",
    character: "궤적",
    premise: "1~5년 뒤 가격을 하나로 찍지 않고 세 갈래로 그립니다",
    composition: "trajectory",
    palette: p("#6D28D9", "#C3A6FF", "#F4EEFF", "rgba(195,166,255,.14)"),
    runMotion: "draw",
    reveal: "draw-path",
    runStages: [
      "국토부 실거래 대조 — 시나리오의 출발점을 잡는 중",
      "전월세·입주 예정 — 앞으로 들어올 물량을 세는 중",
      "임장노트·뉴스 — 최근 분위기를 반영하는 중",
      "베이스·낙관·비관 세 갈래를 그리는 중",
    ],
    tone: {
      strong: "세 갈래가 모두 위를 봅니다. 다만 예측은 예측입니다.",
      mixed: "갈래가 벌어집니다 — 벌어진 폭만큼이 이 단지의 불확실성이에요.",
      weak: "베이스도 아래를 봅니다. 낙관 갈래가 무엇을 전제하는지 보세요.",
      thin: "궤적을 그릴 점이 모자랍니다. 선을 이어 붙이지 않았어요.",
    },
    nextAction: { label: "이 가격으로 수익률 계산", href: "/analysis/ai/ai-simulator" },
  },
  "ai-risk": {
    id: "ai-risk",
    character: "점검",
    premise: "좋은 점은 접어 두고 위험한 것만 위에서부터 쌓아 보여 줍니다",
    composition: "ledger",
    palette: p("#B91C1C", "#FF9E93", "#FEF0EF", "rgba(255,158,147,.14)"),
    runMotion: "scan",
    reveal: "stagger-rows",
    runStages: [
      "국토부 실거래 대조 — 가격이 흔들린 구간을 찾는 중",
      "전월세·입주 예정 — 공급 충격 가능성을 보는 중",
      "임장노트·뉴스 — 현장에서 나온 경고를 줍는 중",
      "위험을 심각한 순서로 세우는 중",
    ],
    tone: {
      strong: "지금 잡히는 큰 위험은 없습니다. 없다는 게 아니라 안 잡혔다는 뜻이에요.",
      mixed: "넘어갈 수 있는 것과 그렇지 않은 것이 섞여 있습니다.",
      weak: "먼저 해결해야 할 항목이 위에 있습니다. 순서대로 보세요.",
      thin: "점검할 재료가 모자랍니다. 위험이 없다는 뜻이 아닙니다.",
    },
    nextAction: { label: "계약 조항까지 점검", href: "/analysis/ai/contract-risk" },
  },
  "ai-compare": {
    id: "ai-compare",
    character: "대조",
    premise: "후보를 같은 자로 재서 한 표에 나란히 놓습니다",
    composition: "matrix",
    palette: p("#0F766E", "#4FD8C4", "#E8F7F5", "rgba(79,216,196,.14)"),
    runMotion: "sweep",
    reveal: "sweep-lr",
    runStages: [
      "국토부 실거래 대조 — 같은 면적 기준으로 맞추는 중",
      "전월세·입주 예정 — 후보별 공급 부담을 재는 중",
      "임장노트·뉴스 — 후보마다 사람이 남긴 말을 붙이는 중",
      "기준별로 줄 세우는 중 — 이긴 칸을 표시합니다",
    ],
    tone: {
      strong: "한 곳이 대부분의 기준에서 앞섭니다. 드문 경우예요.",
      mixed: "기준마다 이기는 곳이 다릅니다 — 무엇을 포기할지의 문제입니다.",
      weak: "어느 쪽도 뚜렷하지 않습니다. 후보를 바꾸는 편이 빠릅니다.",
      thin: "나란히 놓을 후보가 모자랍니다. 최소 두 곳이 필요해요.",
    },
    nextAction: { label: "이긴 곳 임장 동선 짜기", href: "/analysis/ai/ai-inspection" },
  },
  "ai-inspection": {
    id: "ai-inspection",
    character: "동선",
    premise: "하루에 도는 순서를 정해 지도 위에 선으로 잇습니다",
    composition: "route",
    palette: p("#15803D", "#5FDD92", "#EAF7EF", "rgba(95,221,146,.14)"),
    runMotion: "draw",
    reveal: "draw-path",
    runStages: [
      "국토부 실거래 대조 — 들를 곳의 최근 시세를 확인하는 중",
      "전월세·입주 예정 — 근처 새 물량을 표시하는 중",
      "임장노트·뉴스 — 남이 다녀온 기록을 붙이는 중",
      "가까운 순서로 묶어 동선을 잇는 중",
    ],
    tone: {
      strong: "한 번에 도는 데 무리가 없는 동선입니다.",
      mixed: "떨어진 곳이 섞여 있습니다 — 하루에 다 돌기는 빠듯해요.",
      weak: "흩어져 있습니다. 둘로 나눠 다니는 편이 낫습니다.",
      thin: "동선을 그릴 후보가 모자랍니다. 지도에서 몇 곳 더 골라 주세요.",
    },
    nextAction: { label: "임장노트 미리 만들기", href: "/notes/new" },
  },
  "my-checklist": {
    id: "my-checklist",
    character: "장부",
    premise: "내 기준을 한 줄씩 채워 가며 빠뜨린 것을 드러냅니다",
    composition: "workbook",
    palette: p("#0369A1", "#6DCBF5", "#E9F5FD", "rgba(109,203,245,.14)"),
    runMotion: "tick",
    reveal: "fill",
    runStages: [
      "국토부 실거래 대조 — 가격 항목을 자동으로 채우는 중",
      "전월세·입주 예정 — 임대 항목을 자동으로 채우는 중",
      "임장노트·뉴스 — 내가 이미 확인한 것을 표시하는 중",
      "남은 항목을 추리는 중",
    ],
    tone: {
      strong: "거의 다 채웠습니다. 남은 것만 확인하면 됩니다.",
      mixed: "절반쯤 왔습니다. 비어 있는 줄이 지금의 사각지대예요.",
      weak: "아직 빈칸이 많습니다. 위에서부터 하나씩 채워 보세요.",
      thin: "자동으로 채울 재료가 모자랍니다. 손으로 채워야 하는 줄이 많아요.",
    },
    nextAction: { label: "빈칸을 임장에서 확인", href: "/notes/new" },
  },
  "ai-portfolio": {
    id: "ai-portfolio",
    character: "배분",
    premise: "가진 것을 한 판에 올려 어디가 쏠렸는지 봅니다",
    composition: "allocation",
    palette: p("#A16207", "#E8B93A", "#FDF4E3", "rgba(232,185,58,.14)"),
    runMotion: "stack",
    reveal: "fill",
    runStages: [
      "국토부 실거래 대조 — 보유 자산의 현재 값을 매기는 중",
      "전월세·입주 예정 — 임대 수입 쪽 비중을 세는 중",
      "임장노트·뉴스 — 관심 목록의 성격을 보는 중",
      "쏠린 곳을 찾는 중",
    ],
    tone: {
      strong: "고르게 나뉘어 있습니다. 한 곳이 무너져도 전체가 흔들리지 않아요.",
      mixed: "한쪽으로 기울어 있습니다. 기운 만큼이 감수하는 위험이에요.",
      weak: "한 곳에 몰려 있습니다. 그 한 곳의 사정이 곧 전체의 사정입니다.",
      thin: "올려 둔 자산이 모자랍니다. 비중을 말할 단계가 아니에요.",
    },
    nextAction: { label: "갈아타기 시나리오 보기", href: "/analysis/switch" },
  },
  "ai-timing": {
    id: "ai-timing",
    character: "신호",
    premise: "지금이 어느 국면인지 눈금 하나로 답합니다",
    composition: "gauge",
    palette: p("#C2410C", "#FFA470", "#FEF1EA", "rgba(255,164,112,.14)"),
    runMotion: "pulse",
    reveal: "count-up",
    runStages: [
      "국토부 실거래 대조 — 거래량이 도는지 보는 중",
      "전월세·입주 예정 — 물량이 신호를 누르는지 보는 중",
      "임장노트·뉴스 — 분위기 쪽 신호를 읽는 중",
      "바늘을 세우는 중",
    ],
    tone: {
      strong: "신호가 한쪽을 가리킵니다. 그래도 바닥·꼭지를 맞히는 도구는 아닙니다.",
      mixed: "신호가 엇갈립니다 — 지금은 서두를 이유가 약합니다.",
      weak: "신호가 반대를 가리킵니다. 기다릴 근거가 있다는 뜻이에요.",
      thin: "거래가 너무 적어 신호가 서지 않습니다. 바늘을 억지로 세우지 않았어요.",
    },
    nextAction: { label: "이 신호로 시세 예측 보기", href: "/analysis/ai/ai-prediction" },
  },
  "ai-simulator": {
    id: "ai-simulator",
    character: "계산",
    premise: "매수가·대출·임대료를 넣으면 숫자가 바로 따라 움직입니다",
    composition: "calculator",
    palette: p("#047857", "#3FD79B", "#E7F7F0", "rgba(63,215,155,.14)"),
    runMotion: "roll",
    reveal: "count-up",
    runStages: [
      "국토부 실거래 대조 — 매수가의 기준선을 잡는 중",
      "전월세·입주 예정 — 받을 수 있는 임대료를 보는 중",
      "임장노트·뉴스 — 공실 위험 쪽을 확인하는 중",
      "세전·세후를 나눠 계산하는 중",
    ],
    tone: {
      strong: "대출 비용을 빼고도 남습니다. 전제 금리가 유지될 때의 이야기예요.",
      mixed: "남기는 하지만 얇습니다. 금리가 조금만 올라도 뒤집힙니다.",
      weak: "지금 조건으로는 마이너스입니다. 어느 항목이 갉아먹는지 보세요.",
      thin: "계산에 넣을 값이 모자랍니다. 빈 값을 임의로 채우지 않았어요.",
    },
    nextAction: { label: "금리 시나리오로 흔들어 보기", href: "/analysis/scenario" },
  },
  "ai-gap": {
    id: "ai-gap",
    character: "간격",
    premise: "매매와 전세 사이의 거리를 재고, 그 거리가 위험한지 봅니다",
    composition: "gauge",
    palette: p("#A21CAF", "#EDA3F2", "#FBEEFC", "rgba(237,163,242,.14)"),
    runMotion: "roll",
    reveal: "fill",
    runStages: [
      "국토부 실거래 대조 — 매매가 쪽을 확인하는 중",
      "전월세 신고 — 전세가 쪽을 확인하는 중",
      "입주 예정·뉴스 — 전세가 밀릴 요인을 보는 중",
      "간격과 회전 위험을 재는 중",
    ],
    tone: {
      strong: "간격이 좁습니다. 좁다는 건 들어가기 쉽다는 뜻이지 안전하다는 뜻은 아닙니다.",
      mixed: "간격이 보통입니다. 전세가 밀릴 때 버틸 여력이 있는지가 관건이에요.",
      weak: "간격이 큽니다. 이 방식으로 접근하기에는 부담이 커요.",
      thin: "전세 표본이 모자라 간격을 재지 못했습니다.",
    },
    nextAction: { label: "지역 전체 갭 순위 보기", href: "/analysis/gap" },
  },
  "ai-economy": {
    id: "ai-economy",
    character: "관제",
    premise: "금리·환율·공급을 한 판에 띄우고 바뀐 것만 켭니다",
    composition: "console",
    palette: p("#3730A3", "#A3AAFF", "#EEEFFE", "rgba(163,170,255,.14)"),
    runMotion: "pulse",
    reveal: "flip",
    runStages: [
      "국토부 실거래 대조 — 거시가 실제 거래에 닿았는지 보는 중",
      "전월세·입주 예정 — 공급 지표를 갱신하는 중",
      "뉴스 — 지표를 흔든 사건을 찾는 중",
      "지표별 신호등을 켜는 중",
    ],
    tone: {
      strong: "지표가 같은 방향을 봅니다. 흔치 않은 정렬이에요.",
      mixed: "지표가 엇갈립니다 — 어느 쪽 지표를 믿는지가 곧 관점입니다.",
      weak: "누르는 지표가 많습니다. 무엇이 먼저 풀려야 하는지 보세요.",
      thin: "최근 갱신된 지표가 모자랍니다.",
    },
    nextAction: { label: "지표 임계치 알림 걸기", href: "/notifications" },
  },
  "contract-risk": {
    id: "contract-risk",
    character: "정독",
    premise: "조항을 한 줄씩 읽어 협상해야 할 문장을 집어냅니다",
    composition: "ledger",
    palette: p("#9F1239", "#FB9CBB", "#FDEFF3", "rgba(251,156,187,.14)"),
    runMotion: "scan",
    reveal: "stagger-rows",
    runStages: [
      "조항 나누는 중 — 문장 단위로 자릅니다",
      "표준 계약서와 대조하는 중",
      "특약을 따로 모으는 중",
      "협상이 필요한 문장을 표시하는 중",
    ],
    tone: {
      strong: "크게 걸리는 문장은 없습니다. 법률 자문을 대신하지는 않습니다.",
      mixed: "손볼 문장이 몇 개 있습니다. 표시된 곳부터 보세요.",
      weak: "그대로 서명하기 어려운 문장이 있습니다. 위쪽부터 확인하세요.",
      thin: "읽을 조항이 모자랍니다. 계약서 본문을 붙여 넣어 주세요.",
    },
    nextAction: { label: "단지 리스크도 함께 보기", href: "/analysis/ai/ai-risk" },
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

export function resultOrder(composition: CompositionArchetype): readonly ResultBlock[] {
  switch (composition) {
    case "matrix":
    case "atlas":
    case "console":
    case "workbook":
      return ["headline", "body", "widget", "counters"];
    case "ledger":
      return ["headline", "widget", "counters", "body"];
    default:
      /* gauge · dossier · calculator · allocation · trajectory · route */
      return ["headline", "widget", "body", "counters"];
  }
}

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
export function personaVars(persona: ToolPersona): Record<string, string> {
  return {
    "--tool-accent": persona.palette.accent,
    "--tool-accent-dark": persona.palette.accentDark,
    "--tool-soft": persona.palette.soft,
    "--tool-soft-dark": persona.palette.softDark,
  };
}
