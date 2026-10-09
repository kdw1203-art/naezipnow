"use client";

/* [1052 · 번들] 계산기의 "최대 대출 계산식" 카드 — 따로 받는 청크(서버 렌더는 그대로 · 첫 HTML 에 있다).
   /calculator 가 목록 밖 상한 495KB 에 2.5KB 안쪽(493.3KB · 1051 실측 · 여유 경고)이었다. Vercel 빌드는 공개 설정값이 더 들어가
   로컬보다 조금 크다(1047·1048 배포가 /notes/[id] 로 막힌 것과 같은 길) — 규칙 카드(가격을 넣어야 보이는 칸)를 떼어 여유를 만든다.
   내용·계산은 그대로(calculator-client 에서 옮김). */
import { manwonText } from "@/lib/finance/money";
import {
  ACQ_TAX_SOURCES,
  LOAN_RULES_BASIS_LABEL,
  LOAN_RULE_SOURCES,
  PRICE_TIER_CAPS,
  type computeLoanLimit,
  type Ownership,
} from "@/lib/finance/loan-rules";

export function LoanRuleCard({
  limit,
  priceN,
  maxLoan,
  regionLabel,
  ownership,
  capitalOrRegulated,
  moveInMonths,
  stressFloor,
  extLinkCls,
}: {
  limit: ReturnType<typeof computeLoanLimit>;
  priceN: number;
  maxLoan: number;
  regionLabel: string;
  ownership: Ownership;
  capitalOrRegulated: boolean;
  moveInMonths: number | null;
  stressFloor: number | null;
  extLinkCls: string;
}) {
  return (
    <section className="rise-in-2 card flex flex-col gap-2.5 rounded-3xl px-5 py-[18px] max-md:p-3.5" aria-labelledby="calc-rule">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <h2 id="calc-rule" className="t-body font-bold text-ink">
          최대 대출 계산식
        </h2>
        <span className="t-sub font-bold text-primary">{LOAN_RULES_BASIS_LABEL}</span>
      </div>
      <div className="rounded-lg bg-bg px-3.5 py-3 t-body leading-relaxed text-text-1">
        <div className="font-bold text-ink">
          최대 대출 ={" "}
          {limit.capManwon !== null && limit.binding !== "none"
            ? "min(LTV × 매매가, 가격 구간 한도)"
            : "LTV × 매매가"}
        </div>
        {limit.binding === "none" ? (
          <div className="mt-1 break-words">
            = {limit.ltvPct}% × {manwonText(priceN)} = <b className="text-ink">0원</b>. {regionLabel}에서
            &lsquo;{ownership}&rsquo;은 주택 구입 주담대 불가(6·27 대책).
          </div>
        ) : limit.capManwon !== null ? (
          <div className="mt-1 break-words">
            = min(<b className={limit.binding === "ltv" ? "text-primary" : undefined}>{limit.ltvPct}% × {manwonText(priceN)} = {manwonText(limit.ltvAmountManwon)}</b>,{" "}
            <b className={limit.binding === "cap" ? "text-primary" : undefined}>{manwonText(limit.capManwon)}</b>) ={" "}
            <b className="text-ink">{manwonText(maxLoan)}</b>
          </div>
        ) : (
          <div className="mt-1 break-words">
            = {limit.ltvPct}% × {manwonText(priceN)} = <b className="text-ink">{manwonText(maxLoan)}</b>
          </div>
        )}
        <div className="mt-1 t-sub text-text-3">
          {regionLabel} · {ownership} LTV {limit.ltvPct}%
          {limit.binding === "none"
            ? ""
            : capitalOrRegulated
              ? " · 수도권·규제지역 가격 구간 한도 적용"
              : " · 금액 상한 없음, LTV·DSR 기준"}
        </div>
      </div>
      {capitalOrRegulated && limit.binding !== "none" && (
        <ul className="grid grid-cols-1 gap-1 t-sub sm:grid-cols-3" aria-label="주택가격별 주담대 한도">
          {PRICE_TIER_CAPS.map((t) => {
            const active = limit.capManwon === t.capManwon;
            return (
              <li
                key={t.label}
                className={`rounded-lg px-2.5 py-1.5 ${
                  active ? "bg-primary-soft font-bold text-primary" : "bg-bg text-text-2"
                }`}
              >
                {t.label}
              </li>
            );
          })}
        </ul>
      )}
      <ul className="flex list-disc flex-col gap-1 pl-4 t-sub leading-relaxed text-text-2">
        {moveInMonths !== null && limit.binding !== "none" && (
          <li>주담대로 집을 사면 {moveInMonths}개월 안에 전입 의무.</li>
        )}
        {ownership === "1주택 처분조건" && (
          <li>
            {capitalOrRegulated
              ? "기존 집을 6개월 안에 팔아야 무주택과 같은 LTV."
              : "기존 집을 팔아야 하는 기한은 은행 확인."}
          </li>
        )}
        {!capitalOrRegulated && ownership === "생애최초" && (
          <li>수도권 밖 생애최초는 도입 당시(2022.8) 금액 한도 6억원. 지금 적용되는지는 은행 확인.</li>
        )}
        {stressFloor !== null && (
          <li>
            은행 DSR(소득 대비 원리금) 심사는 금리에 스트레스 금리(하한 {stressFloor}%)를 더해 계산. 소득에 따라 한도가 더 줄 수 있음.
          </li>
        )}
        <li>정책대출(보금자리론·디딤돌)은 자체 한도·자격이 별도. 한국주택금융공사 확인.</li>
        <li>토지거래허가구역이면 계약 전 허가 필요, 실거주 의무. 해당 여부는 토지이음 확인.</li>
      </ul>
      <p className="rounded-lg bg-warning-soft px-3 py-2 t-sub font-semibold leading-relaxed text-text-1">
        실제 한도는 DSR·소득·신용·은행 심사로 더 낮을 수 있음. 일반 정보이며 금융·법률·세무 자문이 아님.
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 t-sub text-text-3">
        <span>출처</span>
        {LOAN_RULE_SOURCES.slice(0, 2).map((s) => (
          <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer" className={extLinkCls}>
            {s.label}
          </a>
        ))}
      </div>
      <details className="t-sub text-text-3">
        <summary className="inline-flex min-h-[40px] cursor-pointer items-center font-bold text-text-2">
          근거 더 보기
        </summary>
        <ul className="mt-1 flex flex-col gap-0.5">
          {[...LOAN_RULE_SOURCES.slice(2), ...ACQ_TAX_SOURCES].map((s) => (
            <li key={s.href}>
              <a href={s.href} target="_blank" rel="noopener noreferrer" className={extLinkCls}>
                {s.label}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-1 leading-relaxed">
          근거: 금융위원회 가계부채 대책(6·27 · 9·7 · 10·15) · 지방세법 제11조·제13조의2 · 지방세특례제한법
          제36조의3. 확인일 2026-09-21.
        </p>
        {/* [1015 · 규칙 B·J] 예전 "참고 안내" 카드(계산 기준·제외 항목 한 문단)를 이 접힘 안으로 — 같은 사실을 두 카드에 두지 않는다 */}
        <p className="mt-2 leading-relaxed">
          계산 기준: 최대 대출은 {LOAN_RULES_BASIS_LABEL} 규칙(지역·보유 주택별 LTV, 수도권·규제지역 주택가격 구간 한도).
          월 상환액은 입력한 대출 금액·금리·기간의 원리금균등 식. 취득세는 대략 구간(1주택 계열 1.1~3.3%, 규제지역 추가
          구입 8.4%, 생애최초 12억 이하 최대 200만원 감면)이며 전용 85㎡ 초과 농어촌특별세와 3주택 이상 중과(12%)는
          제외. 필요 현금에는 중개보수 법정 상한(공인중개사법 시행규칙 제20조, 부가세 별도) 포함, 등기 비용·이사비는
          제외. 향후 가격 상승·수익률은 확정된 사실이 아니라 표시하지 않음.
        </p>
      </details>
    </section>
  );
}

export default LoanRuleCard;
