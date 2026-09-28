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
  /**
   * [1012 · R2] 카드 오른쪽의 실측 한 토막("오늘 10문제" · "가이드 48곳" · "용어 56개").
   * **카탈로그에는 절대 적지 않는다** — 값은 app/journey/page.tsx 가 실데이터를 읽어
   * journeyCountLabels() 로 만들고 JourneyBoard 가 href 로 찾아 붙인다. 없는 값은 표시하지 않는다.
   */
  count?: string;
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
    /* [1012 · R2] 규칙 6 — 언제(집 보러 가기 전)·어디서(국토교통부 신고분)를 문장에. 최신 신고월·시군구 수는
       화면이 실데이터로 덧붙인다(journeyCountLabels stages.market).
       [1015 · 규칙 D] "~익혀요 — ~하려면요" 대화체·대시 잇기 → 사실 두 문장. 아래 desc 도 같은 규칙. */
    why: "집 보러 가기 전 국토교통부 실거래 신고분으로 요즘 거래가부터. 본 집이 비싼지 싼지 가늠하는 기준.",
    icon: "compass",
    tasks: [
      /* [1012 · R2] 규칙 6·7 — 무엇(전용 84㎡ 안팎 두 단지의 실거래)·출처(국토교통부)·언제(날마다) */
      { label: "실거래가 게임", desc: "전용 84㎡ 안팎 두 단지 중 더 비싼 쪽 맞히기 · 국토교통부 신고분 · 날마다 새 문제", href: "/quiz" },
      { label: "지도에서 최근 실거래 보기", desc: "관심 동네 단지들의 최근 거래가", href: "/map" },
      { label: "용어사전", desc: "전용면적·LTV 같은 말의 뜻", href: "/glossary" },
    ],
  },
  {
    id: "budget",
    n: 2,
    title: "예산 정하기",
    short: "예산",
    why: "대출·세금까지 넣은 ‘실제로 쓸 수 있는 돈’이 헛걸음을 줄인다.",
    icon: "wallet",
    tasks: [
      {
        label: "대출·필요 현금 계산",
        desc: "매매가·소득·가진 돈 → 월 상환액 · 취득세를 더한 필요 현금",
        href: "/calculator",
      },
      { label: "중개보수 계산", desc: "거래 금액별 중개보수 법정 상한", href: "/calculator/brokerage" },
    ],
    budgetChips: [3, 5, 7, 10],
  },
  {
    id: "shortlist",
    n: 3,
    title: "후보 좁히기",
    short: "후보",
    why: "후보를 3~5곳으로 줄여야 현장 확인과 비교에 시간을 쓸 수 있다.",
    icon: "target",
    tasks: [
      { label: "단지 종합 진단", desc: "단지 하나를 항목별로 따진 종합 점수", href: "/analysis/ai/ai-diagnosis" },
      { label: "단지 이름으로 찾기", desc: "단지 이름 → 실거래·기록", href: "/search" },
      {
        label: "관심 단지 모아 보기",
        desc: "관심 단지의 가격 변동을 한곳에서",
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
    why: "사진과 숫자로는 안 보이는 소음·경사·주차·관리 상태는 현장에서만 확인된다.",
    icon: "footprints",
    tasks: [
      { label: "임장 동선 짜기", desc: "하루에 돌 단지 순서를 지도 위에", href: "/analysis/ai/ai-inspection" },
      { label: "임장노트 쓰기", desc: "현장에서 본 것을 항목별로 기록, 나중에 나란히 비교", href: "/notes/new" },
      { label: "지역별 임장 가이드", desc: "동네별 현장 체크포인트", href: "/imjang" },
    ],
  },
  {
    id: "decide",
    n: 5,
    title: "비교·결정",
    short: "비교",
    why: "같은 기준으로 나란히 놓아야 느낌이 아니라 근거로 고른다.",
    icon: "scale",
    tasks: [
      { label: "비교함에서 나란히 보기", desc: "후보 2곳 이상을 한 표에서", href: "/analysis/compare" },
      { label: "매수 타이밍 보기", desc: "지역 거래량 흐름으로 본 지금의 국면", href: "/analysis/ai/ai-timing" },
      { label: "내 임장노트 다시 보기", desc: "다녀온 곳의 기록을 한곳에서", href: "/notes?tab=mine", login: true },
    ],
  },
  {
    id: "contract",
    n: 6,
    title: "계약·잔금·입주",
    short: "계약",
    why: "계약 뒤에도 신고·대출·등기·세금·전입신고까지 기한이 정해진 일이 이어진다.",
    icon: "key",
    tasks: [
      {
        label: "계약·잔금 일정표",
        desc: "계약일·잔금일 → 할 일과 법정 기한을 날짜순으로",
        href: "/journey/contract",
      },
      {
        label: "계약 전 체크리스트·특약",
        desc: "등기부·건축물대장 보는 법 · 자주 쓰는 특약",
        href: "/guides/contract",
      },
      { label: "규제·의무 안내", desc: "규제지역·대출·세금 제도의 개념", href: "/guides/regulations" },
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

/* ── [1012 · R2] 카드 오른쪽 숫자 — 순수 함수(입력은 서버가 읽은 실데이터, lib/journey/counts.ts) ── */

export type JourneyCountInput = {
  /** 오늘 실거래가 게임 문제 수 — lib/quiz/load-price-game 오늘 판 사슬 길이 − 1 */
  quizRounds: number | null;
  /** 실거래가 있는 시군구 수 — lib/newui/home-coverage(홈 "전국 N개 시군구"와 같은 값) */
  regionCount: number | null;
  /** 국토교통부 실거래 최신 신고월 "YYYYMM" — lib/market/tx-bands 지역 목록의 latestYm 최댓값 */
  latestYm: string | null;
  /** 임장 가이드 지역 수 — /imjang 인덱스와 같은 listImjangRegions(48).length */
  imjangRegions: number | null;
  /** 용어사전 항목 수 — lib/seo/glossary-terms GLOSSARY_TERMS.length */
  glossaryTerms: number | null;
  /** 중개보수 법정 상한 요율 구간 수 — lib/finance/brokerage SALE_HOUSE_BRACKETS.length */
  brokerageBrackets: number | null;
  /** 대출 규정 확인일 "YYYY-MM-DD" — lib/finance/loan-rules LOAN_RULES_CHECKED_AT */
  loanRulesCheckedAt: string | null;
};

export type JourneyCountLabels = {
  /** href → 카드 오른쪽 한 토막 */
  tasks: Readonly<Partial<Record<string, string>>>;
  /** 단계 id → 단계 설명(why) 뒤에 붙는 실측 한 토막 */
  stages: Readonly<Partial<Record<JourneyStageId, string>>>;
};

const pos = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const ko = (v: number) => v.toLocaleString("ko-KR");

/**
 * 실데이터 → 카드 라벨. 값이 null·0 이면 그 칸은 비운다(지어내지 않는다).
 *  · /quiz "오늘 10문제" · /map "218개 시군구" · /glossary "용어 56개" · /imjang "가이드 48곳"
 *  · /calculator "규정 2026.09 확인" · /calculator/brokerage "요율 구간 6개"
 *  · market 단계 "국토교통부 2026.08 신고분까지"
 */
export function journeyCountLabels(input: JourneyCountInput): JourneyCountLabels {
  const tasks: Partial<Record<string, string>> = {};
  const stages: Partial<Record<JourneyStageId, string>> = {};
  if (pos(input.quizRounds)) tasks["/quiz"] = `오늘 ${ko(input.quizRounds)}문제`;
  if (pos(input.regionCount)) tasks["/map"] = `${ko(input.regionCount)}개 시군구`;
  if (pos(input.glossaryTerms)) tasks["/glossary"] = `용어 ${ko(input.glossaryTerms)}개`;
  if (pos(input.imjangRegions)) tasks["/imjang"] = `가이드 ${ko(input.imjangRegions)}곳`;
  if (pos(input.brokerageBrackets)) tasks["/calculator/brokerage"] = `요율 구간 ${ko(input.brokerageBrackets)}개`;
  if (input.loanRulesCheckedAt && /^\d{4}-\d{2}-\d{2}$/.test(input.loanRulesCheckedAt)) {
    tasks["/calculator"] = `규정 ${input.loanRulesCheckedAt.slice(0, 4)}.${input.loanRulesCheckedAt.slice(5, 7)} 확인`;
  }
  if (input.latestYm && /^\d{6}$/.test(input.latestYm)) {
    stages.market = `국토교통부 ${input.latestYm.slice(0, 4)}.${input.latestYm.slice(4)} 신고분까지`;
  }
  return { tasks, stages };
}

/** HowTo JSON-LD 단계 — 화면에 보이는 제목·한 줄·할 일 이름만으로 만든다(스키마 전용 문장 없음). */
export function journeyHowToSteps(): { name: string; text: string }[] {
  return JOURNEY_STAGES.map((s) => ({
    name: `${s.n}단계 · ${s.title}`,
    text: `${s.why} 할 일: ${s.tasks.map((t) => t.label).join(", ")}${s.budgetChips ? ", 예산으로 지도 보기" : ""}.`,
  }));
}
