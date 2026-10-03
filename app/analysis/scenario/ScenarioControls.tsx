"use client";
/* [1026b · 시나리오·비교] 손잡이 — 예전 왼쪽 긴 열 "조건 설정" 카드를 두 장(조건 · 시나리오)으로 나눠 옮겼다(절차 한 줄의 1·2단계와 같은 이름).
   데스크톱은 오른쪽 레일, 폰은 결론 아래 접이식 — 자리는 ScenarioClient 가 useDesktop 으로 하나만 고른다(단지 검색이 둘이 되지 않게).
   next/dynamic(ssr:false · ScenarioLazy.tsx)으로 싣는다 — 단지 검색(ComplexPicker) · 지역 목록(seoul-districts) · ⓘ 설명 사전 · Segmented 가
   이 조각으로 빠져 /analysis/scenario 첫 묶음이 줄어든다. 입력·범위·딥링크·계산은 전부 예전 그대로(상태는 본체가 들고 있다).
   바뀐 모양: "직접 입력" 줄 → 기준 금리 줄 오른쪽 숫자칸(같은 입력 · 같은 aria-label) · 입력칸·버튼 40px · 글자 램프(t-sub) · 흰 카드 한 모양. */

import { Explain } from "@/app/components/explain/Explain";
import { TweenNumber } from "@/app/components/motion/TweenNumber";
import { Segmented } from "@/app/components/ui/Segmented";
import { ComplexPicker, type PickedComplex } from "../ComplexPicker";
import { useMapPick } from "../use-map-pick";
import type { RateContext } from "./ScenarioClient";
import { REGION_OPTIONS } from "./scenario-regions";

const RATE_OFFSETS: { label: string; offset: number }[] = [
  { label: "기준", offset: 0 },
  { label: "-1.0%p", offset: -1 },
  { label: "-0.5%p", offset: -0.5 },
  { label: "+0.5%p", offset: 0.5 },
  { label: "+1.0%p", offset: 1 },
  { label: "+2.0%p", offset: 2 },
];
const PRICE_CHIPS: { label: string; pct: number }[] = [
  { label: "▲ +10% 급등", pct: 10 },
  { label: "▲ +5%", pct: 5 },
  { label: "보합", pct: 0 },
  { label: "▼ -5%", pct: -5 },
  { label: "▼ -10%", pct: -10 },
  { label: "▼ -20% 급락", pct: -20 },
];
const PERIOD_CHIPS = ["3년", "5년", "10년"];

/** "202607" | "20260701" → "2026.07". 형식이 다르면 원문 그대로. */
function fmtCycle(cycle: string): string {
  const m = /^(\d{4})(\d{2})/.exec(cycle);
  return m ? `${m[1]}.${m[2]}` : cycle;
}

/* [1009 · A] 날것 rgba → 토큰(bg-primary-soft), 선택 상태를 스크린리더에도(aria-pressed), 눌림(press).
   시세 칩의 ▲▼ 는 등락색으로 — 화살표만 있고 색이 없었다. */
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const m = /^([▲▼])\s?(.*)$/.exec(label);
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`press min-h-[40px] rounded-lg px-3 py-2 t-sub ${
        active ? "border-[1.5px] border-primary bg-primary-soft font-bold text-primary" : "border border-line bg-surface text-text-2"
      }`}
    >
      {m ? (
        <>
          <span aria-hidden="true" className={m[1] === "▲" ? "delta-up" : "delta-down"}>
            {m[1]}
          </span>{" "}
          <span className="sr-only">{m[1] === "▲" ? "상승" : "하락"} </span>
          {m[2]}
        </>
      ) : (
        label
      )}
    </button>
  );
}

export type ScenarioControlsProps = {
  rates: RateContext;
  regionId: string;
  onRegion: (id: string) => void;
  onComplex: (c: PickedComplex) => void;
  loadingBaseline: boolean;
  isReal: boolean;
  /** "대상" 줄 — 본체가 만든 문자열(예전 표기 그대로) */
  targetText: string;
  /** 출처 줄 — 실시세일 때만 */
  sourceText: string | null;
  ltvPct: number;
  setLtvPct: (v: number) => void;
  incomeManwon: number;
  setIncomeManwon: (v: number) => void;
  baseRate: number;
  setBaseRate: (v: number) => void;
  cashWon: number;
  rateOffset: number;
  setRateOffset: (v: number) => void;
  pricePct: number;
  setPricePct: (v: number) => void;
  period: string;
  setPeriod: (v: string) => void;
};

const CARD = "card flex flex-col gap-3 rounded-2xl p-4 max-md:p-3.5";
const NUM_INPUT = "min-h-10 rounded-lg border border-line bg-surface px-2 py-1 text-right t-body font-bold text-ink";

export function ScenarioControls(p: ScenarioControlsProps) {
  /* [975] 단지 선택은 검색·지도 두 길이 같은 함수로 모인다 — 어느 쪽으로 골라도 기준가 프리필과 지역 전환이 똑같이 일어나야 한다. */
  const { openMap, mapNode } = useMapPick(p.onComplex, "시장·대출 시나리오");
  const { rates } = p;

  return (
    <>
      {/* [975] 지도에서 단지 고르기 — 열기 전에는 내려받지 않는다 */}
      {mapNode}
      <section className={CARD} aria-label="조건">
        <h2 className="t-section text-ink">조건</h2>

        {/* 단지 선택 → 그 단지 지역의 실시세로 기준가 프리필 */}
        <ComplexPicker label="단지로 기준가 채우기" onSelect={p.onComplex} onMapClick={openMap} />

        {/* 지역 실시세 프리필 */}
        <label className="flex flex-col gap-1">
          {/* [1028] "실시세"(내부 말) → "지역 평균가" — 고르면 그 지역의 평균 매매가(한국부동산원 통계)로 계산한다 */}
          <span className="t-sub font-bold text-text-2">기준 지역 (지역 평균가)</span>
          <select
            value={p.regionId}
            onChange={(e) => p.onRegion(e.target.value)}
            className="min-h-10 w-full rounded-lg border border-line bg-surface px-2.5 py-2 t-sub font-bold text-ink"
          >
            <option value="">예시 시세로 계산 (8.4억)</option>
            {REGION_OPTIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          {p.regionId && !p.loadingBaseline && !p.isReal && (
            <span className="t-sub text-text-3">이 지역은 평균가 자료가 없어 예시 시세로 계산</span>
          )}
        </label>

        <div className="flex justify-between gap-2 t-body">
          <span className="shrink-0 text-text-2">대상</span>
          <span className="text-right font-bold text-ink">{p.targetText}</span>
        </div>
        {p.sourceText && (
          <div className="flex justify-between gap-2 t-sub text-text-3">
            <span className="shrink-0">출처</span>
            <span className="text-right">{p.sourceText}</span>
          </div>
        )}

        {/* 대출 비율 — 예전 슬라이더는 40%에 고정된 그림이었다. 실제 입력으로 교체. */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between t-body">
            <span className="inline-flex items-center gap-0.5 text-text-2">
              대출 비율
              <Explain
                term="ltv"
                how={[
                  "대출액 = 기준 시세 × 대출 비율 · 필요 현금 = 기준 시세 − 대출액",
                  "실제 한도는 지역(규제지역 여부)·보유 주택 수·가격대에 따라 다르다. 계산기에서 내 조건으로 확인.",
                ]}
              />
            </span>
            <span className="font-bold tabular-nums text-ink">
              <TweenNumber value={p.ltvPct} format="int" suffix="%" />
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={70}
            step={5}
            value={p.ltvPct}
            onChange={(e) => p.setLtvPct(Number(e.target.value))}
            aria-label="대출 비율 (%)"
            className="h-9 w-full cursor-pointer accent-primary max-md:h-11"
          />
        </div>

        <label className="flex items-center justify-between gap-2 t-body">
          <span className="text-text-2">연 소득</span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              min={100}
              max={100_000}
              step={100}
              value={p.incomeManwon}
              onChange={(e) => p.setIncomeManwon(Math.max(0, Number(e.target.value)))}
              aria-label="연 소득 (만원)"
              className={`w-[90px] ${NUM_INPUT}`}
            />
            <span className="font-bold text-text-2">만원</span>
          </span>
        </label>

        {/* [D68] 금리는 이 화면에서 가장 많이 만지는 값 — 슬라이더는 "훑어보기", 숫자칸은 "내 대출 금리 정확히 넣기".
            [1026b] 예전 "직접 입력" 줄의 숫자칸을 기준 금리 줄 오른쪽으로 올렸다(같은 입력 · 같은 aria-label · 한 줄 줄임). */}
        <div className="flex flex-col gap-1">
          <label className="flex items-center justify-between gap-2 t-body">
            <span className="text-text-2">기준 금리</span>
            <span className="flex items-center gap-1">
              <input
                type="number"
                min={0.5}
                max={15}
                step={0.05}
                value={p.baseRate}
                onChange={(e) => p.setBaseRate(Number(e.target.value))}
                aria-label="기준 금리 (연 %)"
                className={`w-[76px] ${NUM_INPUT}`}
              />
              <span className="font-bold text-text-2">%</span>
            </span>
          </label>
          <input
            type="range"
            min={2}
            max={9}
            step={0.05}
            value={Math.min(9, Math.max(2, p.baseRate))}
            onChange={(e) => p.setBaseRate(Number(e.target.value))}
            aria-label="기준 금리 (연 %) 슬라이더"
            className="h-9 w-full cursor-pointer accent-primary max-md:h-11"
          />
        </div>

        {/* 지금 금리 참고 — 서버가 넘긴 실공시(한국은행 기준금리·금감원 주담대). 정책금리는 대출금리가 아니라 참고용,
            주담대 중앙값은 '적용' 버튼으로 채운다. 값이 없으면(키 미설정) 블록 자체를 감춰 지어낸 숫자를 만들지 않는다. */}
        {(rates.policy || rates.mortgageMedian != null) && (
          <div className="rounded-lg border border-line bg-bg px-3 py-2 t-sub">
            <div className="font-bold text-text-2">지금 금리 참고</div>
            {rates.policy && (
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-text-3">한국은행 기준금리(정책)</span>
                <span className="font-bold text-ink">
                  {rates.policy.label}
                  {rates.policy.cycle ? <span className="ml-1 font-semibold text-text-3">{fmtCycle(rates.policy.cycle)}</span> : null}
                </span>
              </div>
            )}
            {rates.mortgageMedian != null && (
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-text-3">
                  시중 주담대 변동 중앙값
                  {rates.mortgageAsOf ? <span className="ml-0.5 text-text-3">({rates.mortgageAsOf})</span> : null}
                </span>
                <button
                  type="button"
                  onClick={() => p.setBaseRate(Number(rates.mortgageMedian!.toFixed(2)))}
                  className="min-h-10 shrink-0 rounded-lg border-[1.5px] border-primary px-2 t-sub font-bold text-primary"
                >
                  {rates.mortgageMedian.toFixed(2)}% 적용
                </button>
              </div>
            )}
            <div className="mt-1.5 t-caption text-text-3">실제 대출 금리 = 기준금리 + 가산금리(신용·LTV·상품별) · 위 값은 참고용</div>
          </div>
        )}

        <div className="flex justify-between gap-2 border-t border-divider pt-3 t-body">
          <span className="text-text-2">필요 현금 (시세−대출)</span>
          <TweenNumber value={p.cashWon / 10_000} format="eokmanwon" className="text-right font-bold text-ink" />
        </div>
        <p className="m-0 t-caption text-text-3">{p.isReal ? "지역 평균가 · 30년 원리금균등 상환" : "예시 시세 · 30년 원리금균등 상환"}</p>
      </section>

      <section className={CARD} aria-label="시나리오">
        <h2 className="t-section text-ink">시나리오</h2>
        <div className="flex flex-col gap-1.5">
          <div className="t-sub font-bold text-text-2">금리</div>
          <div className="flex flex-wrap gap-1.5">
            {RATE_OFFSETS.map((c) => (
              <Chip
                key={c.label}
                label={c.offset === 0 ? `기준 ${p.baseRate}%` : c.label}
                active={p.rateOffset === c.offset}
                onClick={() => p.setRateOffset(c.offset)}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="t-sub font-bold text-text-2">시세</div>
          <div className="flex flex-wrap gap-1.5">
            {PRICE_CHIPS.map((c) => (
              <Chip key={c.label} label={c.label} active={p.pricePct === c.pct} onClick={() => p.setPricePct(c.pct)} />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="t-sub font-bold text-text-2">보유 기간</div>
          {/* [1009 · A] 세 가지 중 하나 — 같은 화면 상태 전환이라 공용 Segmented(선택 표시가 미끄러진다) */}
          <Segmented
            options={PERIOD_CHIPS.map((c) => ({ value: c, label: c }))}
            value={p.period}
            onChange={p.setPeriod}
            ariaLabel="보유 기간"
            className="self-start"
          />
        </div>
      </section>
    </>
  );
}

export default ScenarioControls;
