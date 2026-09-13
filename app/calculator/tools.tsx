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
    intro: (
      <>
        중개보수는 <b className="text-ink">법으로 정한 상한요율 이내에서 협의</b>로 정합니다.
        매매가나 보증금·월세를 넣으면 내 거래의 법정 상한액이 바로 나와요 — 협의의 출발점으로
        쓰세요.
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
      "전세 보증금을 월세로, 월세를 전세로 환산합니다. 전월세 전환율을 직접 조정해 우리 집 조건으로 계산해 보세요.",
    ogSub: "전세 ↔ 월세 환산 · 전환율 조정",
    intro: (
      <>
        전세와 월세 조건을 같은 저울에 올리는 계산기예요. 보증금을 낮추는 대신 월세를 얼마나
        내는 게 손해가 아닌지, <b className="text-ink">전환율</b>을 바꿔 가며 비교해 보세요.
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
        매매가에서 전세가를 뺀 것이 <b className="text-ink">갭(실투자금)</b>, 매매가 대비 전세가의
        비율이 <b className="text-ink">전세가율</b>이에요. 갭이 작을수록 진입은 쉽지만, 전세가가
        빠지면 그만큼 돌려막을 돈이 필요해집니다 — 두 숫자를 같이 보세요.
      </>
    ),
    render: () => <GapRatio />,
  },
  {
    id: "rental-yield",
    label: "임대수익률 계산기",
    title: "임대수익률 계산기",
    description:
      "매매가·보증금·월세로 연 임대수익률을 계산합니다. 대출 없이 순수 자기자본 기준의 수익률을 빠르게 확인해 보세요.",
    ogSub: "실투자금 기준 연 수익률",
    intro: (
      <>
        월세 물건의 수익률은 <b className="text-ink">(연 월세 수입) ÷ (실투자금)</b>으로 봅니다.
        매매가에서 보증금을 뺀 실투자금 기준이라, 보증금 비중이 큰 물건일수록 수익률이 다르게
        보여요.
      </>
    ),
    render: () => <RentalYield />,
  },
];

export function findCalculatorTool(id: string): CalculatorTool | null {
  return CALCULATOR_TOOLS.find((t) => t.id === id) ?? null;
}
