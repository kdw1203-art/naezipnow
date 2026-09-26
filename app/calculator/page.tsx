import { getMortgageRates } from "@/lib/finance/mortgage-rates";
import { CalculatorClient } from "./calculator-client";
import { buildPageMetadata } from "@/lib/seo/page-metadata";

/* P2-4: 금리 실연동 — /api/finance/mortgage-rates 가 쓰는 lib 함수를 서버에서 직접
   호출해 클라이언트 계산기에 주입. 실데이터 실패 시 폴백 표 + "예시" 배지. */

/* [1008 · M] 설명을 실제 계산에 맞춘다 — 지역·보유 주택별 한도(10·15 대책 기준)가 이 화면의 핵심이 됐다. */
export const metadata = buildPageMetadata({
  title: "대출 계산기",
  description:
    "집 살 때 최대 대출·필요 현금·월 상환액을 계산합니다. 지역(규제지역·수도권·그 외)과 보유 주택에 따른 LTV와 수도권·규제지역 주택가격 구간 한도(10·15 대책 기준)를 반영합니다.",
  path: "/calculator",
  og: { badge: "계산기", sub: "최대 대출·필요 현금·월 상환액 — 10·15 대책 기준" },
});

/* [1010] 21,600 → 86,400(1일). "공시 금리 캐시 주기와 동일"이라고 적혀 있었지만 실제
   주기는 24시간이다(lib/finance/mortgage-rates.ts TTL_MS = 24 * 3_600_000) — 페이지 TTL 이
   데이터 캐시보다 짧아서, 같은 금리표를 하루 네 번 다시 굽고 있었다. 눈금을 데이터 쪽에
   맞춘다. 나머지(LTV·한도 규칙)는 코드 상수라 배포로만 바뀐다. */
export const revalidate = 86_400;

export default async function CalculatorPage() {
  const mortgage = await getMortgageRates();
  return <CalculatorClient mortgage={mortgage} />;
}
