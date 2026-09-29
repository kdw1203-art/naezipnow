/* [1025 · 담당 S] /calculator/rent-vs-buy — 살까·빌릴까(매매·전세·월세 N년 총비용). 서버는 금리 공시(getMortgageRates —
   /calculator 대출 계산기·홈 loanRate 와 같은 로더)만 읽어 대표 금리를 넘기고, 입력·계산은 전부 브라우저(RentVsBuyClient).
   공시가 없으면 금리 칸은 빈칸 — 출처 없는 숫자를 기본값으로 두지 않는다. 대표 금리 = 은행별 변동금리(없으면 고정) 범위
   중간값의 평균(/calculator 의 deriveAverageRate 와 같은 식). */
import { PageShell } from "@/app/components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { getMortgageRates } from "@/lib/finance/mortgage-rates";
import { representativeRate } from "@/lib/finance/calc-summary";
import { RentVsBuyClient, type RateDefault } from "./RentVsBuyClient";

export const metadata = buildPageMetadata({
  title: "살까, 빌릴까 — 매매·전세·월세 총비용 계산기",
  description:
    "매매(대출 이자·취득세·중개보수·자기자본 기회비용·기대 상승분)와 전세·월세의 보유 기간 총비용을 비교합니다. 단지를 고르면 국토교통부 실거래 12개월 중앙값으로 채우고, 손익분기 상승률과 상승률 민감도를 함께 계산합니다.",
  path: "/calculator/rent-vs-buy",
  og: { badge: "계산기", sub: "매매·전세·월세 총비용 · 손익분기 상승률" },
});

/* 금리 공시 캐시 주기(lib/finance/mortgage-rates TTL 24h)와 같은 눈금 — /calculator 와 동일 */
export const revalidate = 86_400;

export default async function RentVsBuyPage() {
  const mortgage = await getMortgageRates();
  const rateDefault: RateDefault = {
    pct: mortgage.live ? representativeRate(mortgage.rates) : null,
    source: mortgage.source,
    asOf: mortgage.live ? mortgage.asOf : null,
  };
  return (
    <PageShell wide>
      <div className="mx-auto flex w-full max-w-[1200px] flex-col">
        <RentVsBuyClient rateDefault={rateDefault} />
      </div>
    </PageShell>
  );
}
