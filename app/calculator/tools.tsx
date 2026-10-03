import type { ReactNode } from "react";
import { BrokerageFeeCalc } from "./BrokerageFeeCalc";
import { GapRatio, JeonseWolse, RentalYield } from "./realestate-tools";

/* ============================================================
   [992] 계산기 4종의 단일 출처 — 예전엔 페이지 파일 넷이 같은 셸(PageShell · CalculatorNav ·
   소개 문단 · 도구)을 각자 복사하고 있었다. URL 은 그대로다(검색 랜딩: "중개수수료 계산",
   "전월세 전환" 은 각자 검색량이 있는 별개 질의라 나눠 둔 것이다). 파일만 하나로 —
   app/calculator/[tool]/page.tsx 가 이 표를 읽는다. 대출 계산기(/calculator)는 실금리 조회가
   있어 별도 페이지로 남는다.
   ============================================================ */

export type CalculatorToolId = "brokerage" | "jeonse-monthly" | "gap" | "rental-yield";

export type CalculatorTool = {
  id: CalculatorToolId;
  /** CalculatorNav·브레드크럼용 짧은 이름 */
  label: string;
  /** <title> */
  title: string;
  description: string;
  ogSub: string;
  intro: ReactNode;
  render: () => ReactNode;
  /** [#55] HowTo — 화면의 "이용 방법" 목록과 JSON-LD 가 같은 배열을 쓴다 */
  howTo?: { name: string; description: string; steps: { name: string; text: string }[] };
};

const BROKERAGE_STEPS = [
  { name: "거래 유형 선택", text: "매매·전세·월세 중 내 거래 유형을 고릅니다. 월세는 보증금과 월세를 함께 입력합니다." },
  { name: "거래 금액 입력", text: "매매가 또는 보증금(월세 포함 시 환산보증금 자동 계산)을 입력하면 거래금액 구간이 정해집니다." },
  { name: "법정 상한액 확인 후 협의", text: "구간별 상한요율과 한도액으로 계산된 법정 상한액을 확인하고, 그 이내에서 중개사와 협의합니다. 부가세는 별도입니다." },
];

export const CALCULATOR_TOOLS: readonly CalculatorTool[] = [
  {
    id: "brokerage",
    label: "중개보수 계산기",
    title: "부동산 중개보수(중개수수료) 계산기",
    description:
      "매매·전세·월세 중개수수료 상한을 법정 요율표로 계산합니다. 거래금액 구간별 상한요율·한도액, 오피스텔·상가 요율까지 한 화면에.",
    ogSub: "법정 상한요율표 기준 · 매매·전세·월세",
    /* [1015 · 규칙 B·D] 소개 문단은 사실 한 줄 — 사용법("넣으면 … 나와요")·권유("쓰세요")는 뺐다 */
    intro: (
      <>
        중개보수는 <b className="text-ink">법정 상한요율 이내에서 협의</b>. 공인중개사법 시행규칙 제20조 요율표 기준, 부가세
        별도.
      </>
    ),
    render: () => <BrokerageFeeCalc />,
    howTo: {
      name: "부동산 중개보수(중개수수료) 계산하는 방법",
      description: "법정 상한요율표로 매매·전세·월세 중개보수 상한액을 계산하는 3단계.",
      steps: BROKERAGE_STEPS,
    },
  },
  {
    id: "jeonse-monthly",
    label: "전월세 전환 계산기",
    title: "전월세 전환 계산기 — 전세↔월세 환산",
    description:
      "전세 보증금을 월세로, 월세를 전세로 환산합니다. 전월세 전환율을 직접 조정할 수 있습니다.",
    ogSub: "전세 ↔ 월세 환산 · 전환율 조정",
    intro: (
      <>
        월세 = (전세보증금 − 월세보증금) × <b className="text-ink">전환율</b> ÷ 12. 계약 중 전환은 주택임대차보호법의
        상한(연 10%와 기준금리 + 2%p 중 낮은 쪽) 이내.
      </>
    ),
    render: () => <JeonseWolse />,
  },
  {
    id: "gap",
    label: "갭·전세가율 계산기",
    title: "갭투자·전세가율 계산기",
    description:
      "매매가와 전세가로 갭(실투자금)과 전세가율을 계산합니다. 전세가율이 높을수록 적은 돈으로 사는 대신 역전세 위험도 커집니다.",
    ogSub: "갭(실투자금)과 전세가율을 한 번에",
    intro: (
      <>
        <b className="text-ink">갭(실투자금)</b> = 매매가 − 전세가 · <b className="text-ink">전세가율</b> = 전세가 ÷ 매매가.
        갭이 작을수록 초기 자금은 적게 들지만, 전세가가 내리면 그만큼 돌려줄 돈이 필요합니다.
      </>
    ),
    render: () => <GapRatio />,
  },
  {
    id: "rental-yield",
    label: "임대수익률 계산기",
    title: "임대수익률 계산기",
    description:
      "매매가·보증금·월세로 연 임대수익률을 계산합니다. 대출 없는 자기자본 기준과 대출 반영 기준을 함께 계산합니다.",
    ogSub: "실투자금 기준 연 수익률",
    intro: (
      <>
        연 수익률 = <b className="text-ink">(연 월세 수입) ÷ (실투자금)</b>. 실투자금 = 매매가 − 보증금(대출이 있으면 −
        대출금). 세금·관리비·공실은 제외.
      </>
    ),
    render: () => <RentalYield />,
  },
];

export function findCalculatorTool(id: string): CalculatorTool | null {
  return CALCULATOR_TOOLS.find((t) => t.id === id) ?? null;
}
