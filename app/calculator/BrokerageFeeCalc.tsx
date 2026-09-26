"use client";

import { useMemo, useState } from "react";
import { Segmented } from "@/app/components/ui/Segmented";
import { Explain } from "@/app/components/explain/Explain";
import {
  BROKERAGE_BASIS,
  LEASE_HOUSE_BRACKETS,
  SALE_HOUSE_BRACKETS,
  bracketLine,
  brokerageFeeCap,
  leaseAmountWon,
  type BrokerageDeal,
  type BrokerageProperty,
} from "@/lib/finance/brokerage";
import { nb, wonText } from "@/lib/finance/money";
import { TweenMoney } from "./TweenMoney";

/* [개선 #6, 2026-08-22] 중개보수(중개수수료) 계산기.
 *
 * 요율은 공인중개사법 시행규칙 제20조의 **법정 상한요율표** 그대로다
 * (한국공인중개사협회 게시 요율표와 대조 확인, 2026-08-22).
 * - 상한이지 확정 보수가 아니다 — 실제 보수는 상한 안에서 협의로 정한다.
 * - 임대차 거래금액 = 보증금 + 월세×100. 그 값이 5천만원 미만이면
 *   보증금 + 월세×70 으로 다시 계산한다(시행규칙 산정 방식 그대로).
 * - 부가가치세(10%)는 별도다.
 * 이 사실들은 화면에 그대로 고지한다 — 계산기가 확정 금액처럼 말하면 안 된다.
 *
 * [1009 · T] 요율표를 lib/finance/brokerage.ts 로 옮겼다(대출 계산기의 필요 현금도 같은 표를 쓴다). 옮기면서 **한도액 오류**를
 * 고쳤다: 예전 표의 `25_0000_0`·`80_0000_0`·`20_0000_0`·`30_0000_0` 은 숫자 구분자 때문에 250만·800만·200만·300만원
 * (법정 25만·80만·20만·30만원의 10배)이라 한도가 한 번도 걸리지 않았다 — 1억 8천만원 매매는 "최대 900,000원 ·
 * 0.5% (한도 8,000,000원)"으로 나왔다(법정 상한 800,000원). 이제 한도가 걸리고, 그 사실을 문장으로 말한다.
 * 결과는 결론 한 줄 + 굴러가는 큰 숫자(원 단위 "336만원"), 유형 전환은 공용 Segmented.
 */

const DEALS = [
  { value: "sale", label: "매매·교환" },
  { value: "lease", label: "임대차 (전세·월세)" },
] as const;
const PROPS = [
  { value: "house", label: "주택" },
  { value: "officetel", label: "오피스텔 (85㎡ 이하)" },
  { value: "other", label: "토지·상가 등" },
] as const;

const inputCls =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink placeholder:text-text-3";

export function BrokerageFeeCalc() {
  const [deal, setDeal] = useState<BrokerageDeal>("sale");
  const [prop, setProp] = useState<BrokerageProperty>("house");
  const [priceMan, setPriceMan] = useState("80000"); // 매매가 (만원)
  const [depositMan, setDepositMan] = useState("30000"); // 보증금 (만원)
  const [monthlyMan, setMonthlyMan] = useState("0"); // 월세 (만원)

  const result = useMemo(() => {
    const toWon = (s: string) => Math.max(0, Number(s.replace(/[^0-9.]/g, "")) || 0) * 10000;
    let amount = 0;
    let amountNote = "";
    if (deal === "sale") {
      amount = toWon(priceMan);
      amountNote = "거래금액 = 매매가";
    } else {
      const lease = leaseAmountWon(toWon(depositMan), toWon(monthlyMan));
      amount = lease.amountWon;
      amountNote = lease.note;
    }
    const fee = brokerageFeeCap({ amountWon: amount, deal, property: prop });
    return fee ? { ...fee, amountNote } : null;
  }, [deal, prop, priceMan, depositMan, monthlyMan]);

  /* 결론 한 줄 — 실제 계산값으로만(금액이 없으면 문장도 없다) */
  const dealWord = deal === "sale" ? "매매" : "임대차";
  const conclusion = result
    ? `거래금액 ${nb(wonText(result.amountWon))} ${dealWord}의 중개보수는 최대 ${nb(wonText(result.feeWon))}이에요`
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3 rounded-[18px] p-[18px]">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-extrabold text-ink">중개보수 상한 계산</span>
          <span className="text-[12px] font-medium text-text-3">법정 상한요율 기준</span>
        </div>

        <Segmented options={DEALS} value={deal} onChange={setDeal} ariaLabel="거래 유형" className="self-start" />
        <Segmented options={PROPS} value={prop} onChange={setProp} ariaLabel="매물 종류" className="max-w-full self-start overflow-x-auto" />

        {deal === "sale" ? (
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-text-2">매매가 (만원)</span>
            <input
              type="text"
              inputMode="numeric"
              value={priceMan}
              onChange={(e) => setPriceMan(e.target.value)}
              className={inputCls}
              aria-label="매매가 (만원)"
            />
          </label>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-text-2">보증금 (만원)</span>
              <input
                type="text"
                inputMode="numeric"
                value={depositMan}
                onChange={(e) => setDepositMan(e.target.value)}
                className={inputCls}
                aria-label="보증금 (만원)"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-text-2">월세 (만원)</span>
              <input
                type="text"
                inputMode="numeric"
                value={monthlyMan}
                onChange={(e) => setMonthlyMan(e.target.value)}
                className={inputCls}
                aria-label="월세 (만원)"
              />
            </label>
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-1.5 rounded-2xl bg-bg p-4">
            {conclusion && <p className="t-body break-words font-bold text-ink">{conclusion}</p>}
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="flex items-center gap-0.5 t-sub text-text-3">
                법정 상한
                <Explain
                  title="중개보수(법정 상한)"
                  body={[
                    "중개사무소에 내는 보수의 법정 최고액이에요. 실제 보수는 이 금액 안에서 중개사와 협의해 정해요.",
                    "부가가치세 10%는 따로예요. 시·도 조례로 일부 다를 수 있어요.",
                  ]}
                  how={[
                    "상한 = 거래금액 × 상한요율 — 구간 한도액이 있으면 그 금액까지",
                    `주택 매매: ${bracketLine(SALE_HOUSE_BRACKETS)}`,
                    `주택 임대차: ${bracketLine(LEASE_HOUSE_BRACKETS)}`,
                    "임대차 거래금액 = 보증금 + 월세 × 100 (5천만원 미만이면 월세 × 70)",
                  ]}
                  source={BROKERAGE_BASIS}
                  size={12}
                />
              </span>
              <TweenMoney value={result.feeWon} unit="원" className="t-title text-primary" />
            </div>
            <div className="text-[12px] text-text-3">{result.amountNote}</div>
            <div className="text-[12px] text-text-2">
              거래금액 <b className="t-num font-bold text-ink">{wonText(result.amountWon)}</b> · 적용 상한요율{" "}
              <b className="font-bold text-ink">{result.rateLabel}</b>
            </div>
            <div className="text-[12px] leading-[1.7] text-text-3">
              {result.capped
                ? `요율대로면 ${wonText(result.amountWon * result.rate)}이지만 구간 한도액이 적용돼 ${wonText(result.feeWon)}까지예요. `
                : ""}
              법정 <b>상한</b>이며 확정 보수가 아니에요 — 실제 보수는 이 금액 이내에서 중개사와 협의해 정합니다.
              부가가치세 10%는 별도입니다. 일반 정보이며 법률·세무 자문이 아니에요.
            </div>
          </div>
        )}
      </div>

      {/* 요율표 전문 — 계산 근거를 그대로 공개한다 (검색 사용자가 찾는 표이기도 하다) */}
      <div className="card flex flex-col gap-3 rounded-[18px] p-[18px]">
        <span className="text-[13px] font-extrabold text-ink">주택 중개보수 상한요율표</span>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-text-3">
                <th className="py-1.5 pr-2 font-semibold">거래금액</th>
                <th className="py-1.5 pr-2 font-semibold">매매·교환</th>
                <th className="py-1.5 font-semibold">임대차</th>
              </tr>
            </thead>
            <tbody className="text-text-1 tabular-nums">
              <tr className="border-b border-divider"><td className="py-1.5 pr-2">5천만원 미만</td><td className="pr-2">0.6% · 한도 25만</td><td>0.5% · 한도 20만</td></tr>
              <tr className="border-b border-divider"><td className="py-1.5 pr-2">5천만 ~ 1억</td><td className="pr-2">0.5% · 한도 80만</td><td>0.4% · 한도 30만</td></tr>
              <tr className="border-b border-divider"><td className="py-1.5 pr-2">1억 ~ 2억</td><td className="pr-2">0.5% · 한도 80만</td><td>0.3%</td></tr>
              <tr className="border-b border-divider"><td className="py-1.5 pr-2">2억 ~ 6억</td><td className="pr-2">0.4%</td><td>0.3%</td></tr>
              <tr className="border-b border-divider"><td className="py-1.5 pr-2">6억 ~ 9억</td><td className="pr-2">0.4%</td><td>0.4%</td></tr>
              <tr className="border-b border-divider"><td className="py-1.5 pr-2">9억 ~ 12억</td><td className="pr-2">0.5%</td><td>0.4%</td></tr>
              <tr className="border-b border-divider"><td className="py-1.5 pr-2">12억 ~ 15억</td><td className="pr-2">0.6%</td><td>0.5%</td></tr>
              <tr><td className="py-1.5 pr-2">15억 이상</td><td className="pr-2">0.7%</td><td>0.6%</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-[12px] leading-[1.7] text-text-3">
          오피스텔(전용 85㎡ 이하·주거설비 갖춤): 매매 0.5% · 임대차 0.4%. 토지·상가 등
          주택 외: 0.9% 이내 협의. 근거: 공인중개사법 시행규칙 제20조(법정 상한요율) ·
          한국공인중개사협회 게시 요율표 대조(2026-08). 지자체 조례로 일부 다를 수 있어요.
        </p>
      </div>
    </div>
  );
}
