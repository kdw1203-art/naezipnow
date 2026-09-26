/**
 * [1008 · J] 내 집 마련 여정 — 6단계(순수 데이터). /journey 화면·HowTo JSON-LD·홈 입구가 같은 배열을 읽는다.
 *
 * 규칙
 *  - 할 일(tasks)은 **지금 실제로 열리는 화면**만 잇는다(check:route-links 가 경로를 확인한다).
 *    /quiz 는 같은 판에 Q 가 만든 "실거래가 게임"(app/quiz)이다.
 *  - 설명은 그 화면이 실제로 하는 일만 적는다(없는 기능을 약속하지 않는다).
 *  - "다 했어요"는 사람이 누른 것만 저장한다. 자동 신호(lib/journey/signals.ts)는 '진행 중' 표시까지만.
 */
import type { JourneyStageId } from "./state";

export type JourneyTask = {
  label: string;
  desc: string;
  href: string;
  /** 로그인해야 열리는 화면 — 라벨 옆에 작게 적는다 */
  login?: boolean;
};

export type JourneyStage = {
  id: JourneyStageId;
  n: number;
  title: string;
  /** 스텝퍼·진행 링에 쓰는 짧은 이름 */
  short: string;
  /** 왜 필요한가 — 한 줄 */
  why: string;
  /** app/components/Icon.tsx 이름 */
  icon: string;
  tasks: readonly JourneyTask[];
  /** 예산으로 지도 보기(억, /map?priceMax=) — 홈 HomeBudgetChips 와 같은 값·같은 형식 */
  budgetChips?: readonly number[];
};

export const JOURNEY_STAGES: readonly JourneyStage[] = [
  {
    id: "market",
    n: 1,
    title: "시장 감 잡기",
    short: "시장 감",
    why: "요즘 얼마에 거래되는지 알아야 나중에 본 집이 비싼지 싼지 가늠할 수 있어요.",
    icon: "compass",
    tasks: [
      { label: "실거래가 게임", desc: "실제로 거래된 가격을 맞혀 보며 감을 익혀요.", href: "/quiz" },
      { label: "지도에서 최근 실거래 보기", desc: "관심 동네 단지들의 최근 거래가를 지도에서 봐요.", href: "/map" },
      { label: "용어사전", desc: "전용면적·LTV 같은 말을 쉬운 말로 풀어 뒀어요.", href: "/glossary" },
    ],
  },
  {
    id: "budget",
    n: 2,
    title: "예산 정하기",
    short: "예산",
    why: "대출·세금까지 넣어 ‘실제로 쓸 수 있는 돈’을 알아야 헛걸음을 줄여요.",
    icon: "wallet",
    tasks: [
      {
        label: "대출·필요 현금 계산",
        desc: "매매가·소득·가진 돈을 넣으면 월 상환액과 취득세를 더한 필요 현금을 계산해요.",
        href: "/calculator",
      },
      { label: "중개보수 계산", desc: "거래 금액에 따른 중개보수 상한을 미리 봐요.", href: "/calculator/brokerage" },
    ],
    budgetChips: [3, 5, 7, 10],
  },
  {
    id: "shortlist",
    n: 3,
    title: "후보 좁히기",
    short: "후보",
    why: "후보를 3~5곳으로 줄여야 현장 확인과 비교에 시간을 쓸 수 있어요.",
    icon: "target",
    tasks: [
      { label: "단지 종합 진단", desc: "단지 하나를 넣으면 항목별로 따져 종합 점수로 정리해요.", href: "/analysis/ai/ai-diagnosis" },
      { label: "단지 이름으로 찾기", desc: "이름을 알면 바로 그 단지의 실거래·기록으로 가요.", href: "/search" },
      {
        label: "관심 단지 모아 보기",
        desc: "마음에 드는 단지를 모아 두면 가격 변동을 한곳에서 볼 수 있어요.",
        href: "/my/watchlist",
        login: true,
      },
    ],
  },
  {
    id: "visit",
    n: 4,
    title: "현장 확인(임장)",
    short: "임장",
    why: "사진과 숫자로는 안 보이는 소음·경사·주차·관리 상태는 직접 가 봐야 알아요.",
    icon: "footprints",
    tasks: [
      { label: "임장 동선 짜기", desc: "하루에 돌 단지 순서를 정해 지도 위에 이어 줘요.", href: "/analysis/ai/ai-inspection" },
      { label: "임장노트 쓰기", desc: "현장에서 본 것을 항목별로 적어 두면 나중에 나란히 비교할 수 있어요.", href: "/notes/new" },
      { label: "지역별 임장 가이드", desc: "동네마다 현장에서 볼 점을 모아 뒀어요.", href: "/imjang" },
    ],
  },
  {
    id: "decide",
    n: 5,
    title: "비교·결정",
    short: "비교",
    why: "같은 기준으로 나란히 놓아야 느낌이 아니라 근거로 고를 수 있어요.",
    icon: "scale",
    tasks: [
      { label: "비교함에서 나란히 보기", desc: "후보를 2곳 이상 담아 한 표에서 비교해요.", href: "/analysis/compare" },
      { label: "매수 타이밍 보기", desc: "지역 거래량 흐름으로 지금이 어느 국면인지 봐요.", href: "/analysis/ai/ai-timing" },
      { label: "내 임장노트 다시 보기", desc: "다녀온 곳의 기록을 한곳에서 다시 읽어요.", href: "/notes?tab=mine", login: true },
    ],
  },
  {
    id: "contract",
    n: 6,
    title: "계약·잔금·입주",
    short: "계약",
    why: "도장을 찍은 뒤에도 신고·대출·등기·세금·전입신고까지 기한이 정해진 일이 이어져요.",
    icon: "key",
    tasks: [
      {
        label: "계약·잔금 일정표",
        desc: "계약일·잔금일을 넣으면 할 일과 법정 기한을 날짜순으로 정리해요.",
        href: "/journey/contract",
      },
      {
        label: "계약 전 체크리스트·특약",
        desc: "등기부·건축물대장 보는 법과 자주 쓰는 특약을 정리했어요.",
        href: "/guides/contract",
      },
      { label: "규제·의무 안내", desc: "규제지역·대출·세금 제도를 계약 전에 확인해요.", href: "/guides/regulations" },
    ],
  },
];

export function journeyStage(id: JourneyStageId): JourneyStage {
  const s = JOURNEY_STAGES.find((x) => x.id === id);
  if (!s) throw new Error(`[journey] 모르는 단계: ${id}`);
  return s;
}

/** 예산 칩 → 지도 링크(억). 홈 HomeBudgetChips 와 같은 `?priceMax=` 형식(lib/map/entry-params parseEokParam). */
export function budgetMapHref(eok: number): string {
  return `/map?priceMax=${eok}`;
}

/** HowTo JSON-LD 단계 — 화면에 보이는 제목·한 줄·할 일 이름만으로 만든다(스키마 전용 문장 없음). */
export function journeyHowToSteps(): { name: string; text: string }[] {
  return JOURNEY_STAGES.map((s) => ({
    name: `${s.n}단계 · ${s.title}`,
    text: `${s.why} 할 일: ${s.tasks.map((t) => t.label).join(", ")}${s.budgetChips ? ", 예산 안의 단지 지도에서 보기" : ""}.`,
  }));
}
