/**
 * 도구별 보정 입력 **목록** — 서버에서만 읽는다.
 *
 * 왜 분리했나: 이 목록(12종 문자열)을 클라이언트 워크벤치가 직접 import 하면
 * 통째로 브라우저 번들에 실려 /analysis/ai/[tool] 이 예산(480KB)을 넘었다(483KB 실측).
 * 서버가 **그 도구의 필드만** 골라 prop 으로 내려준다. 타입과 값 변환기는
 * lib/ai/tool-tuning.ts 에 있다(클라이언트도 쓴다).
 *
 * 규칙은 그쪽 파일 머리에 있다 — 핵심은 하나: **엔진이 읽지 않는 입력은 만들지 않는다.**
 * tests/unit/tool-tuning-981.test.ts 가 analysis-engine.ts 소스를 읽어 대조한다.
 */

import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";
import type { TuningField } from "@/lib/ai/tool-tuning";

export const TOOL_TUNING: Record<AiAnalysisToolId, readonly TuningField[]> = {
  /* engine 596~640: currentPriceMan · areaPyeong · regionFreeText */
  "ai-diagnosis": [
    /* [1008 · W] "기준 시세" → "기준 가격" — 이 단지 값은 실거래가지 시세가 아니다. 단지를 고르면 최근 실거래가로 자동으로 채운다 */
    { kind: "number", key: "currentPriceMan", label: "기준 가격", unit: "만원", placeholder: "비우면 최근 실거래가", hint: "단지를 고르면 최근 실거래가로 채워져요" },
    { kind: "number", key: "areaPyeong", label: "면적", unit: "평", placeholder: "예: 34" },
    { kind: "text", key: "regionFreeText", label: "동네", placeholder: "예: 대치동", hint: "구까지만 알면 비워도 돼요" },
  ],
  /* engine 596~640 + 예측 기간 */
  "ai-prediction": [
    /* [1008 · W] "출발 시세"·"세 갈래" → "기준 가격"·"시나리오"(소유자 캡처: 6.5억 단지에 5억이 들어가 있었다 —
       이제 단지를 고르면 최근 실거래가로 자동으로 채우고, 사용자가 고친 값은 덮지 않는다) */
    { kind: "number", key: "currentPriceMan", label: "기준 가격", unit: "만원", placeholder: "비우면 최근 실거래가", hint: "시나리오가 이 가격에서 출발해요", calc: true },
    { kind: "number", key: "areaPyeong", label: "면적", unit: "평", placeholder: "예: 34" },
    {
      kind: "select",
      key: "horizonMonths",
      calc: true,
      label: "내다볼 기간",
      hint: "길수록 시나리오 사이가 벌어져요",
      options: [
        { value: "", label: "기본(1년)" },
        { value: "12", label: "1년" },
        { value: "36", label: "3년" },
        { value: "60", label: "5년" },
      ],
    },
  ],
  /* engine 235~268 · 700~704: region 중심 — 추가 보정 없음 */
  "ai-risk": [],
  /* engine 168~234 · 671: compareMemo */
  "ai-compare": [
    { kind: "textarea", key: "compareMemo", label: "비교에서 중요한 것", placeholder: "예: 학군보다 출퇴근 시간이 먼저", hint: "AI 해설이 이 기준으로 비교해요" },
  ],
  /* engine 402~443 · 782~790: goal · mustHaves · maxTravelMinutes · preferredInspectionDays */
  "ai-inspection": [
    { kind: "text", key: "goal", label: "이번 임장의 목적", placeholder: "예: 3년 내 실거주 갈아타기" },
    { kind: "text", key: "mustHaves", label: "꼭 볼 것", placeholder: "예: 초품아, 역 10분", hint: "쉼표로 나눠 적어 주세요" },
    { kind: "number", key: "maxTravelMinutes", label: "이동 시간 한도", unit: "분", placeholder: "예: 40", hint: "동선을 묶는 범위가 돼요" },
    { kind: "text", key: "preferredInspectionDays", label: "다닐 수 있는 날", placeholder: "예: 주말 오전" },
  ],
  /* engine 329~347 · 743~748: propertyName · checklistFocus */
  "my-checklist": [
    { kind: "text", key: "propertyName", label: "점검할 대상", placeholder: "예: 은마아파트 34평" },
    { kind: "text", key: "checklistFocus", label: "중점적으로 볼 것", placeholder: "예: 권리관계", hint: "그 항목이 앞으로 나와요" },
  ],
  /* engine 384~401 · 766: 브라우저 로컬 보유 자산 — 별도 입력 없음 */
  "ai-portfolio": [],
  /* engine 269~306 · 705~739: horizonMonths · urgency · entryStrategy · watchList */
  "ai-timing": [
    {
      kind: "select",
      key: "horizonMonths",
      label: "목표 기간",
      options: [
        { value: "", label: "기본(12개월)" },
        { value: "6", label: "6개월" },
        { value: "12", label: "12개월" },
        { value: "24", label: "24개월" },
      ],
    },
    {
      kind: "select",
      key: "urgency",
      label: "급한 정도",
      options: [
        { value: "", label: "선택 안 함" },
        { value: "지금 당장", label: "지금 당장" },
        { value: "올해 안", label: "올해 안" },
        { value: "천천히", label: "천천히" },
      ],
    },
    {
      kind: "select",
      key: "entryStrategy",
      label: "들어가는 방식",
      options: [
        { value: "", label: "선택 안 함" },
        { value: "한 번에", label: "한 번에" },
        { value: "나눠서", label: "나눠서" },
        { value: "기다렸다가", label: "기다렸다가" },
      ],
    },
    { kind: "textarea", key: "watchList", label: "지켜보는 곳", placeholder: "줄바꿈으로 여러 곳", hint: "AI 해설에 참고돼요" },
  ],
  /* engine 366~383 · 596~640(ltv·금리·상환기간): 이 도구의 주인공 입력이다 */
  /* [1008 · 리뷰 A-3] 결과 화면이 원리금균등으로 월 상환액·이자를 실제로 계산한다(lib/ai/loan-calc.ts) —
     기준 가격(비우면 최근 실거래가)·대출 비율·금리·상환 기간·보유 기간. 목표 수익률은 AI 해설에만 쓰인다. */
  "ai-simulator": [
    { kind: "number", key: "currentPriceMan", label: "기준 가격", unit: "만원", placeholder: "비우면 최근 실거래가", calc: true },
    { kind: "number", key: "ltvPct", label: "대출 비율", unit: "%", placeholder: "예: 60", hint: "가격의 몇 %를 빌리는지", calc: true },
    { kind: "number", key: "mortgageRatePct", label: "금리", unit: "%", placeholder: "예: 4.2", hint: "여기 1%p가 결과를 가장 크게 흔들어요", calc: true },
    { kind: "number", key: "loanTermYears", label: "상환 기간", unit: "년", placeholder: "비우면 30년", calc: true },
    { kind: "number", key: "holdingYears", label: "보유 기간", unit: "년", placeholder: "예: 5", hint: "이 기간 동안 낸 이자를 따로 보여 줘요", calc: true },
    { kind: "number", key: "targetYieldPct", label: "목표 수익률", unit: "%", placeholder: "예: 5" },
  ],
  /* engine 750~762: 갭 = maeMan - jeonMan. 이 둘이 없으면 갭이 계산되지 않는다 */
  "ai-gap": [
    { kind: "number", key: "maeMan", label: "매매가", unit: "만원", placeholder: "비우면 최근 실거래가", hint: "이 값과 아래 전세가의 차이가 갭이에요", calc: true },
    { kind: "number", key: "jeonMan", label: "전세가", unit: "만원", placeholder: "예: 78000", calc: true },
  ],
  /* engine 307~328 · 741: 지표 목록 고정 — 추가 입력 없음 */
  "ai-economy": [],
  /* engine 806~816: jeonseMan · marketRatioPct · hasRegistrationCheck · hasInsurance */
  "contract-risk": [
    { kind: "number", key: "jeonseMan", label: "전세 보증금", unit: "만원", placeholder: "예: 78000", calc: true },
    { kind: "number", key: "marketRatioPct", label: "이 집 전세가율", unit: "%", placeholder: "비우면 지역 평균", hint: "보증금 ÷ 매매가 × 100", calc: true },
    { kind: "toggle", key: "hasRegistrationCheck", label: "등기부등본을 확인했다", calc: true },
    { kind: "toggle", key: "hasInsurance", label: "전세보증보험에 가입한다", calc: true },
  ],
};

export function tuningFields(tool: AiAnalysisToolId): readonly TuningField[] {
  return TOOL_TUNING[tool] ?? [];
}

/**
 * 화면이 들고 있던 문자열/체크 상태를 엔진 입력으로 바꾼다.
 *
 * 비운 칸은 **키 자체를 넣지 않는다** — 빈 문자열을 보내면 엔진의
 * `Number(in_.x ?? 0)` 가 0 으로 읽어서 "0 만원을 입력했다"가 된다.
 * 토글은 끈 상태도 뜻이 있으므로(계약 도구의 "등기부등본 미확인 → 경고") 항상 보낸다.
 */
