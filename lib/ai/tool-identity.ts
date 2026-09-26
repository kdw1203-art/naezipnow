/**
 * AI 분석 도구 12종의 시그니처(색·아이콘·메트릭·use case·라이브 위젯) 단일 진실 소스.
 * [1008 · W] tagline·useCase·tips 를 실제 화면이 하는 일에 맞춰 쉬운 말로 고쳤다 — 예전 문구 일부는 없는 기능을
 * 말했다("환경·교통·권리 4축으로 분포", "조항을 붙여넣으면 AI가 분류", "관망 개월수를 입력하면 알림 추천").
 * Hero·LivePreviewPanel·ResultSignatureCard·Digest 등 모든 UI가 여기서 색·라벨을 가져온다.
 */

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Briefcase,
  CheckSquare,
  ClipboardCheck,
  Clock,
  Compass,
  FileSearch,
  GitCompare,
  LineChart,
  PieChart,
  TrendingUp,
} from "lucide-react";
import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";

export type SignatureWidgetKind =
  | "radar"
  | "lineChart"
  | "routeMap"
  | "signalGauge"
  | "boxPlot"
  | "compareGrid"
  | "rateCounter"
  | "gapMeter"
  | "indicatorChips"
  | "checklistProgress"
  | "assetDonut"
  | "clauseCounter";

export type ToolIdentity = {
  id: AiAnalysisToolId;
  title: string;
  tagline: string;
  /** Tailwind 가능한 brand 색상 (hex). */
  accentColor: string;
  /** "from-... to-..." Tailwind 그라데이션 토큰. */
  accentGradient: string;
  /** 우측 페이드 / 결과 카드 액센트 보조 색. */
  accentSoftBg: string;
  /** Lucide 아이콘. */
  icon: LucideIcon;
  /** 결과 핵심 메트릭 라벨 (예: "투자 점수"). */
  metricLabel: string;
  /** 결과 메트릭 단위 (예: "점", "원"). */
  metricUnit: string;
  /** 도구 한 줄 use case. */
  useCase: string;
  /** 우측 라이브 패널의 시그니처 위젯 종류. */
  signatureWidget: SignatureWidgetKind;
  /** 사용 팁(2~3줄). */
  tips: string[];
};

const FALLBACK: ToolIdentity = {
  id: "ai-diagnosis",
  title: "AI 분석",
  tagline: "조건을 입력하면 AI가 정리해 드립니다",
  accentColor: "#3182f6",
  accentGradient: "from-[#3182f6] to-[#1b64da]",
  accentSoftBg: "bg-[#eef4ff]",
  icon: BarChart3,
  metricLabel: "결과",
  metricUnit: "",
  useCase: "관심 지역·단지에 대한 AI 분석",
  signatureWidget: "radar",
  tips: ["조건을 정확히 입력할수록 정확도가 높아져요."],
};

export const TOOL_IDENTITIES: Record<AiAnalysisToolId, ToolIdentity> = {
  "ai-diagnosis": {
    id: "ai-diagnosis",
    title: "종합 진단",
    tagline: "5가지 항목 점수로 단지를 한눈에",
    accentColor: "#3182f6",
    accentGradient: "from-[#3182f6] to-[#1b64da]",
    accentSoftBg: "bg-[#eef4ff]",
    icon: BarChart3,
    metricLabel: "투자 점수",
    metricUnit: "점",
    useCase: "가격 흐름·거래·공급·이웃 평가·금리로 본 종합 점수",
    signatureWidget: "radar",
    tips: [
      "단지를 고르면 점수와 그래프가 바로 나와요.",
      "점수가 낮은 항목은 '리스크 점검'으로 이어서 보세요.",
    ],
  },
  "ai-prediction": {
    id: "ai-prediction",
    title: "시세 예측",
    tagline: "1~5년 뒤 가격 시나리오(낙관·기본·비관)",
    accentColor: "#3182f6",
    accentGradient: "from-[#3182f6] to-[#1b64da]",
    accentSoftBg: "bg-[#eef4ff]",
    icon: LineChart,
    metricLabel: "예측 가격",
    metricUnit: "만원",
    useCase: "최근 실거래가에서 출발한 1~5년 가격 시나리오",
    signatureWidget: "lineChart",
    tips: [
      "시나리오는 가정 계산이에요 — ② 내 조건에서 기준 가격·기간을 바꿔 볼 수 있어요.",
      "기본 시나리오는 지역 매매지수 1년 흐름의 절반 속도(연 ±4% 이내)가 이어진다는 가정이에요.",
    ],
  },
  "ai-risk": {
    id: "ai-risk",
    title: "리스크 점검",
    tagline: "거래량·전세가율·입주·미분양·월세 5가지 위험 신호",
    accentColor: "#f04452",
    accentGradient: "from-[#f04452] to-[#f87171]",
    accentSoftBg: "bg-[#fef2f2]",
    icon: AlertTriangle,
    metricLabel: "리스크 등급",
    metricUnit: "",
    useCase: "매수 전에 걸리는 위험 신호 점검",
    signatureWidget: "boxPlot",
    tips: [
      "걸린 항목부터 확인하세요.",
      "'자료 없음'은 위험이 없다는 뜻이 아니에요.",
    ],
  },
  "ai-compare": {
    id: "ai-compare",
    title: "다른 단지와 비교",
    tagline: "담은 단지 2~3곳을 같은 숫자 칸으로 나란히",
    accentColor: "#3182f6",
    accentGradient: "from-[#3182f6] to-[#1b64da]",
    accentSoftBg: "bg-[#eef4ff]",
    icon: GitCompare,
    metricLabel: "비교 등수",
    metricUnit: "",
    useCase: "후보 단지의 가격·거래·지역 흐름을 한 표로 비교",
    signatureWidget: "compareGrid",
    tips: [
      "검색으로 단지를 2~3곳 담으면 같은 숫자 칸으로 나란히 놓아요.",
      "가중치를 직접 정하는 비교는 '다른 단지와 비교' 화면에서 해요.",
    ],
  },
  "ai-inspection": {
    id: "ai-inspection",
    title: "임장 동선",
    tagline: "같은 지역 함께 볼 단지로 하루 임장 순서",
    accentColor: "#3182f6",
    accentGradient: "from-[#3182f6] to-[#1b64da]",
    accentSoftBg: "bg-[#eef4ff]",
    icon: Compass,
    metricLabel: "추천 단지",
    metricUnit: "곳",
    useCase: "같은 지역에서 함께 볼 단지와 임장 순서",
    signatureWidget: "routeMap",
    tips: [
      "같은 지역에서 최근 거래가 많은 단지를 함께 볼 곳으로 골라요.",
      "결과를 임장노트로 바로 옮길 수 있어요.",
    ],
  },
  "my-checklist": {
    id: "my-checklist",
    title: "투자 체크리스트",
    tagline: "임장·매수 전 확인 항목 체크리스트",
    accentColor: "#3182f6",
    accentGradient: "from-[#3182f6] to-[#1b64da]",
    accentSoftBg: "bg-[#eef4ff]",
    icon: ClipboardCheck,
    metricLabel: "완료 항목",
    metricUnit: "개",
    useCase: "임장·매수 전 확인 항목 정리",
    signatureWidget: "checklistProgress",
    tips: [
      "체크리스트를 임장노트로 옮겨 현장에서 채우세요.",
    ],
  },
  "ai-portfolio": {
    id: "ai-portfolio",
    title: "내 자산 구성 진단",
    tagline: "관심 단지가 어느 지역·가격대에 몰렸는지",
    accentColor: "#3182f6",
    accentGradient: "from-[#3182f6] to-[#1b64da]",
    accentSoftBg: "bg-[#eef4ff]",
    icon: PieChart,
    metricLabel: "다각화 점수",
    metricUnit: "점",
    useCase: "관심 단지의 지역·가격대 쏠림 점검",
    signatureWidget: "assetDonut",
    tips: [
      "로그인 후 관심 단지를 불러오면 쏠림을 봐요.",
    ],
  },
  "ai-timing": {
    id: "ai-timing",
    title: "매수 타이밍",
    tagline: "가격 흐름·거래 열기·입주 물량 신호등",
    accentColor: "#3182f6",
    accentGradient: "from-[#3182f6] to-[#1b64da]",
    accentSoftBg: "bg-[#eef4ff]",
    icon: Clock,
    metricLabel: "매수 시그널",
    metricUnit: "",
    useCase: "지금 사기 좋은지 신호등 3개로 확인",
    signatureWidget: "signalGauge",
    tips: [
      "신호등은 지역 단위 흐름이에요 — 단지 사정은 임장으로 확인하세요.",
    ],
  },
  "ai-simulator": {
    id: "ai-simulator",
    title: "수익률 계산",
    tagline: "대출 비율·금리로 월 상환액·이자, 보유 기간으로 시나리오 수익률",
    accentColor: "#3182f6",
    accentGradient: "from-[#3182f6] to-[#1b64da]",
    accentSoftBg: "bg-[#eef4ff]",
    icon: TrendingUp,
    metricLabel: "연 수익률",
    metricUnit: "%",
    useCase: "기준 가격·대출로 본 월 상환액과 시나리오별 연 수익률(세금·임대료 제외)",
    signatureWidget: "rateCounter",
    tips: [
      "대출 비율·금리를 넣고 다시 계산하면 월 상환액·총 이자가 나와요.",
      "보유 기간까지 넣으면 낙관·기본·비관 가격에 팔았을 때의 연 수익률을 계산해요(가정).",
    ],
  },
  "ai-gap": {
    id: "ai-gap",
    title: "갭투자 진단",
    tagline: "매매가와 전세가 차이(갭)와 역전세 위험",
    accentColor: "#3182f6",
    accentGradient: "from-[#3182f6] to-[#1b64da]",
    accentSoftBg: "bg-[#eef4ff]",
    icon: Activity,
    metricLabel: "갭 비율",
    metricUnit: "%",
    useCase: "갭(매매가 − 전세가)과 역전세 위험",
    signatureWidget: "gapMeter",
    tips: [
      "매매가·전세가를 넣으면 갭을 정확히 계산해요.",
    ],
  },
  "ai-economy": {
    id: "ai-economy",
    title: "경제지표 모니터",
    tagline: "금리·미분양 등 큰 지표 신호 모아 보기",
    accentColor: "#3182f6",
    accentGradient: "from-[#3182f6] to-[#1b64da]",
    accentSoftBg: "bg-[#eef4ff]",
    icon: BarChart3,
    metricLabel: "지표 신호",
    metricUnit: "",
    useCase: "금리·미분양이 집값에 주는 신호",
    signatureWidget: "indicatorChips",
    tips: [
      "기준금리 알림을 걸어 두면 조건이 됐을 때 알려 드려요.",
    ],
  },
  "contract-risk": {
    id: "contract-risk",
    title: "계약 리스크 점검",
    tagline: "전세 계약 위험(전세가율·등기부·보증보험) 점검",
    accentColor: "#f04452",
    accentGradient: "from-[#f04452] to-[#f87171]",
    accentSoftBg: "bg-[#fef2f2]",
    icon: FileSearch,
    metricLabel: "위험 조항",
    metricUnit: "건",
    useCase: "전세 계약 전 위험 점검",
    signatureWidget: "clauseCounter",
    tips: [
      "이 집 전세가율(보증금 ÷ 매매가)과 등기부·보증보험 확인 여부를 넣으면 확인할 것과 특약 문장이 나와요.",
      "입력이 없으면 지역 평균 전세가율로 본 참고값이에요.",
    ],
  },
};

/** 잘못된 toolId 대응. */
export function getToolIdentity(toolId: AiAnalysisToolId | string): ToolIdentity {
  const t = TOOL_IDENTITIES[toolId as AiAnalysisToolId];
  return t ?? FALLBACK;
}

/** brief 아이콘 (lucide) re-export — 외부에서 import 편의. */
export { Briefcase, CheckSquare };
