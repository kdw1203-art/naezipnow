"use client";

/* 항목 B10 — 부동산 계산기 (전월세 전환 · 갭/전세가율 · 임대수익률)
   전부 클라이언트 계산 · 외부 데이터/ API 없음. 기존 계산기 UI 패턴(카드·다크 결과패널·
   풀라운드 탭·억/만원 포맷)에 맞춤.

   [1009 · T] 토스 계산기 관례로 결과를 다시 짰다(2026-09-22 실측: 결론 문장 0 · ⓘ 0 · 숫자 굴림 0 · 지역 포맷터 3개).
    · 결과 패널 맨 위에 **결론 한 줄** — 입력한 값으로 만든 문장("전세 5억원을 … 월세는 183만 3,333원이에요").
    · 큰 숫자는 입력이 바뀌면 이전 값에서 굴러간다(TweenMoney·TweenPercent, 모션 최소화면 즉시).
    · 전월세 전환율·전세가율·갭투자 옆 ⓘ — 용어사전 정의 + 이 화면의 식.
    · 금액 표기는 사이트 표준(lib/finance/money → lib/format/eok-man): "8억 4,000만원", 월세는 원 단위 "183만 3,333원"
      (예전 formatMan1 "183.3만원"은 만원 소수라 실제 이체 금액과 달랐다).
    · 도구·방향 전환은 공용 Segmented(선택 표시가 미끄러진다). 결과 패널의 raw hex(#ff9d9d)·text-white 는 토큰으로. */

import { useId, useState, type ReactNode } from "react";
import { Icon } from "@/app/components/Icon";
import { Segmented } from "@/app/components/ui/Segmented";
import { Explain } from "@/app/components/explain/Explain";
import { manwonText, nb, wonText } from "@/lib/finance/money";
import { TweenMoney, TweenPercent } from "./TweenMoney";
import { rentalYieldConclusion } from "@/lib/finance/calc-summary";

const TOOLS = [
  { value: "jeonse", label: "전월세 전환" },
  { value: "gap", label: "갭·전세가율" },
  { value: "yield", label: "임대수익률" },
] as const;
type Tool = (typeof TOOLS)[number]["value"];

/* ---------- 공통 유틸 ---------- */

/** 입력 문자열 → 숫자 (비어있거나 파싱 불가 시 0) */
function num(s: string): number {
  const n = parseFloat(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** 퍼센트 (기본 2자리) — 결론 문장용 */
function pct(x: number, digits = 2): string {
  return `${x.toFixed(digits)}%`;
}

/* ---------- 공통 컴포넌트 ---------- */

function Field({
  label,
  explain,
  value,
  onChange,
  unit,
  placeholder,
  hint,
}: {
  label: string;
  /** 라벨 옆 ⓘ — [1009 · T 리뷰] **label 밖 형제**로 둔다. 예전엔 label 안에 두어 ⓘ 단추가 label 의 연결 대상(첫 labelable
      자손)이 됐다 — "전월세 전환율" 글자를 누르면 입력칸 대신 설명 시트가 열리고 포커스도 단추로 갔다(헤드리스 재현).
      이제 label 은 htmlFor 로 입력칸만 가리키는 글자이고, 입력칸 이름도 label 에서 온다(aria-label 불필요). */
  explain?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  placeholder?: string;
  /** 칸 아래 한 줄 — 넣은 금액을 "8억 4,000만원"으로 읽어 준다(입력칸 설명으로도 읽힌다) */
  hint?: string | null;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-0.5">
        <label htmlFor={id} className="text-[13px] text-text-2">
          {label}
        </label>
        {explain}
      </div>
      <div className="relative flex items-center">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-describedby={hint ? hintId : undefined}
          className="input w-full px-3 py-2.5 pr-12 text-right text-[13px] font-extrabold text-ink"
        />
        <span className="pointer-events-none absolute right-3 text-[12px] font-semibold text-text-3">
          {unit}
        </span>
      </div>
      {hint && (
        <span id={hintId} className="t-num text-right text-[12px] font-semibold text-text-3">
          {hint}
        </span>
      )}
    </div>
  );
}

/** 다크 결과 패널 안의 보조 행 */
function ResultRow({
  label,
  value,
  tone = "text-ai-text",
}: {
  label: ReactNode;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-ai-muted">{label}</span>
      <span className={`t-num font-bold ${tone}`}>{value}</span>
    </div>
  );
}

/** 다크 결과 패널 — 결론 한 줄 → 큰 숫자 → 보조 행 → 식(패널 밖 각주) */
function ResultPanel({
  conclusion,
  primaryLabel,
  primaryValue,
  children,
  note,
}: {
  /** 입력값으로 만든 결론 문장 — 계산이 안 되면 null(문장을 지어내지 않는다) */
  conclusion: string | null;
  primaryLabel: ReactNode;
  primaryValue: ReactNode;
  children?: ReactNode;
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* [--text-3]: ⓘ 단추 색(var(--text-3))이 어두운 면에서 흐려 패널 안에서만 ai-muted 로 읽게 한다 */}
      <div className="ai-panel flex flex-col gap-2.5 rounded-[18px] p-[18px] shadow-[0_14px_36px_rgba(16,28,54,.22)] [--text-3:var(--ai-muted)]">
        {conclusion && <p className="t-body break-words font-bold text-ai-text">{conclusion}</p>}
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="flex items-center gap-0.5 text-[13px] text-ai-muted">{primaryLabel}</span>
          <span className="t-title text-ai-text">{primaryValue}</span>
        </div>
        {children}
      </div>
      {note && <div className="px-1 text-[12px] leading-[1.6] text-text-3">{note}</div>}
    </div>
  );
}

function ToolCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="card flex flex-col gap-3 rounded-[18px] p-[18px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-extrabold text-ink">{title}</span>
        <span className="text-[12px] font-medium text-text-3">{subtitle}</span>
      </div>
      {children}
    </div>
  );
}

/** 칸 아래 금액 읽기 — 0 이하·빈칸이면 없음 */
function manHint(s: string): string | null {
  const v = num(s);
  return v > 0 ? manwonText(v) : null;
}

/* ---------- 1. 전월세 전환 ---------- */

const DIRECTIONS = [
  { value: "toWolse", label: "전세 → 월세" },
  { value: "toJeonse", label: "월세 → 전세" },
] as const;

export function JeonseWolse() {
  const [dir, setDir] = useState<"toWolse" | "toJeonse">("toWolse");
  const [jeonse, setJeonse] = useState("50000"); // 전세보증금 (만원)
  const [deposit, setDeposit] = useState("10000"); // 월세보증금 (만원)
  const [rate, setRate] = useState("5.5"); // 전월세전환율 (%)
  const [monthly, setMonthly] = useState("165"); // 월세 (만원) — 역산 입력

  const rateN = num(rate);
  const gapToConvert = num(jeonse) - num(deposit);
  const monthlyRent = (gapToConvert * (rateN / 100)) / 12; // 전세→월세 (만원)
  const convertedJeonse = rateN > 0 ? num(deposit) + (num(monthly) * 12) / (rateN / 100) : 0; // 월세→전세 (만원)

  const rateExplain = (
    <Explain
      term="jeonwolse-jeonhwanyul"
      how={[
        "전세 → 월세: 월세 = (전세보증금 − 월세보증금) × 전환율 ÷ 12",
        "월세 → 전세: 전세보증금 = 월세보증금 + 월세 × 12 ÷ 전환율",
        "계약 중에 보증금을 월세로 바꿀 때는 법이 정한 상한(연 10%와 한국은행 기준금리 + 2%p 중 낮은 쪽)을 넘을 수 없어요.",
      ]}
      source="주택임대차보호법 제7조의2 · 같은 법 시행령 제9조"
      size={12}
    />
  );

  const toWolseSentence =
    rateN <= 0
      ? null
      : gapToConvert <= 0
        ? "월세보증금이 전세보증금보다 크거나 같아 월세로 바꿀 금액이 없어요"
        : `전세 ${nb(manwonText(num(jeonse)))}을 보증금 ${nb(manwonText(num(deposit)))}으로 바꾸면 월세는 ${nb(wonText(monthlyRent * 10_000))}이에요`;
  const toJeonseSentence =
    rateN <= 0 || num(monthly) <= 0
      ? null
      : `보증금 ${nb(manwonText(num(deposit)))}에 월세 ${nb(manwonText(num(monthly)))}이면 전세로는 ${nb(manwonText(convertedJeonse))}이에요`;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ToolCard title="1. 전월세 전환" subtitle="전세 ↔ 월세 환산">
        <Segmented
          options={DIRECTIONS}
          value={dir}
          onChange={setDir}
          ariaLabel="전환 방향"
          className="w-full [&>button]:flex-1"
        />

        {dir === "toWolse" ? (
          <>
            <Field label="전세보증금" value={jeonse} onChange={setJeonse} unit="만원" hint={manHint(jeonse)} />
            <Field label="월세보증금" value={deposit} onChange={setDeposit} unit="만원" hint={manHint(deposit)} />
          </>
        ) : (
          <>
            <Field label="월세보증금" value={deposit} onChange={setDeposit} unit="만원" hint={manHint(deposit)} />
            <Field label="월세" value={monthly} onChange={setMonthly} unit="만원" hint={manHint(monthly)} />
          </>
        )}
        <Field label="전월세 전환율" explain={rateExplain} value={rate} onChange={setRate} unit="%" />
      </ToolCard>

      {dir === "toWolse" ? (
        <ResultPanel
          conclusion={toWolseSentence}
          primaryLabel="예상 월세"
          primaryValue={<TweenMoney value={Math.max(monthlyRent, 0) * 10_000} unit="원" />}
          note="월세 = (전세보증금 − 월세보증금) × 전환율 ÷ 12"
        >
          <ResultRow label="전환 대상 금액" value={manwonText(gapToConvert)} />
          <ResultRow label="연 환산 (월세 × 12)" value={wonText(Math.max(monthlyRent, 0) * 12 * 10_000)} />
        </ResultPanel>
      ) : (
        <ResultPanel
          conclusion={toJeonseSentence}
          primaryLabel="환산 전세보증금"
          primaryValue={<TweenMoney value={convertedJeonse} />}
          note="전세보증금 = 월세보증금 + (월세 × 12 ÷ 전환율)"
        >
          <ResultRow label="월세보증금" value={manwonText(num(deposit))} />
          <ResultRow label="월세 자본환산분" value={manwonText(convertedJeonse - num(deposit))} />
        </ResultPanel>
      )}
    </div>
  );
}

/* ---------- 2. 갭·전세가율 ---------- */

export function GapRatio() {
  const [price, setPrice] = useState("84000"); // 매매가 (만원)
  const [jeonse, setJeonse] = useState("60000"); // 전세가 (만원)

  const priceN = num(price);
  const jeonseN = num(jeonse);
  const gap = priceN - jeonseN;
  const ratio = priceN > 0 ? (jeonseN / priceN) * 100 : null;

  const conclusion =
    priceN <= 0 || jeonseN <= 0 || ratio === null
      ? null
      : gap < 0
        ? `전세가가 매매가보다 ${nb(manwonText(-gap))} 높아요 — 집을 팔아도 보증금을 다 돌려주기 어려운 상태예요`
        : `매매가 ${nb(manwonText(priceN))}에 전세 ${nb(manwonText(jeonseN))}이면 갭은 ${nb(manwonText(gap))}, 전세가율은 ${pct(ratio, 1)}예요`;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ToolCard title="2. 갭 · 전세가율" subtitle="갭투자 실투자금 · 전세가율">
        <Field label="매매가" value={price} onChange={setPrice} unit="만원" hint={manHint(price)} />
        <Field label="전세가" value={jeonse} onChange={setJeonse} unit="만원" hint={manHint(jeonse)} />
      </ToolCard>

      <ResultPanel
        conclusion={conclusion}
        primaryLabel={
          <>
            갭 (매매 − 전세)
            <Explain term="gap-tuja" how="갭 = 매매가 − 전세가 — 전세를 끼고 살 때 내 돈으로 채울 금액이에요." size={12} />
          </>
        }
        primaryValue={<TweenMoney value={gap} />}
        note="갭은 매매가에서 전세가를 뺀 갭투자 실투자금이며, 전세가율(전세 ÷ 매매)이 높을수록 갭이 작아집니다. 취득세·중개보수는 넣지 않았어요."
      >
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="flex items-center gap-0.5 text-ai-muted">
            전세가율 (전세 ÷ 매매)
            <Explain term="jeonse-garyul" how="전세가율 = 전세가 ÷ 매매가 × 100" size={12} />
          </span>
          <TweenPercent value={ratio} digits={1} className="text-[15px] text-ai-accent" />
        </div>
        <ResultRow label="매매가" value={manwonText(priceN)} />
        <ResultRow label="전세가" value={manwonText(jeonseN)} />
      </ResultPanel>
    </div>
  );
}

/* ---------- 3. 임대수익률 ---------- */

export function RentalYield() {
  const [price, setPrice] = useState("84000"); // 매매가 (만원)
  const [deposit, setDeposit] = useState("5000"); // 보증금 (만원)
  const [monthly, setMonthly] = useState("200"); // 월세 (만원)
  const [loan, setLoan] = useState("0"); // 대출금 (만원, 선택)
  const [loanRate, setLoanRate] = useState("4.0"); // 금리 (%, 선택)

  const priceN = num(price);
  const depositN = num(deposit);
  const loanN = num(loan);

  const annualRent = num(monthly) * 12; // 연 임대수익 (총)
  const annualInterest = loanN * (num(loanRate) / 100); // 연 대출이자
  const netAnnual = annualRent - annualInterest; // 대출이자 차감 순수익

  const investNoLoan = priceN - depositN; // 실투자금 (무대출)
  const equity = priceN - depositN - loanN; // 자기자본 (레버리지)

  const simpleYield = investNoLoan > 0 ? (annualRent / investNoLoan) * 100 : null;
  const leveragedYield = equity > 0 ? (netAnnual / equity) * 100 : null;

  const hasLoan = loanN > 0;
  const primaryYield = hasLoan ? leveragedYield : simpleYield;

  /* [1009 · T 리뷰] 결론 문장은 lib/finance/calc-summary(단위검증) — 이자가 월세보다 많으면 "손해"라고 말한다
     (예전: 매매 8.4억·보증금 5천·월세 100만·대출 6억·4% → "연 -6.32%를 버는 셈이에요") */
  const conclusion = rentalYieldConclusion({
    annualRentManwon: annualRent,
    annualInterestManwon: annualInterest,
    investNoLoanManwon: investNoLoan,
    equityManwon: equity,
    hasLoan,
  });
  const losing = primaryYield !== null && primaryYield < 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ToolCard title="3. 임대수익률" subtitle="연 수익률 · 자기자본수익률">
        <Field label="매매가" value={price} onChange={setPrice} unit="만원" hint={manHint(price)} />
        <Field label="보증금" value={deposit} onChange={setDeposit} unit="만원" hint={manHint(deposit)} />
        <Field label="월세" value={monthly} onChange={setMonthly} unit="만원" hint={manHint(monthly)} />
        <div className="flex items-center gap-2 border-t border-divider pt-3">
          <Icon name="landmark" size={14} className="text-text-3" />
          <span className="text-[12px] font-semibold text-text-3">대출 (선택 · 레버리지 반영)</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="대출금" value={loan} onChange={setLoan} unit="만원" hint={manHint(loan)} />
          <Field label="금리" value={loanRate} onChange={setLoanRate} unit="%" />
        </div>
      </ToolCard>

      <ResultPanel
        conclusion={conclusion}
        primaryLabel={hasLoan ? "자기자본수익률 (레버리지)" : "연 임대수익률"}
        primaryValue={<TweenPercent value={primaryYield} className={losing ? "text-ai-danger" : undefined} />}
        note={
          hasLoan
            ? "자기자본수익률 = (연 임대수익 − 연 대출이자) ÷ 실투자금(매매가 − 보증금 − 대출금). 세금·관리비·공실은 넣지 않았어요."
            : "연 수익률 = 연 임대수익(월세 × 12) ÷ 실투자금(매매가 − 보증금). 세금·관리비·공실은 넣지 않았어요."
        }
      >
        <ResultRow label="연 임대수익 (월세 × 12)" value={manwonText(annualRent)} />
        {hasLoan && (
          <>
            <ResultRow label="연 대출이자" value={manwonText(annualInterest)} tone="text-ai-danger" />
            <ResultRow
              label="순 임대수익"
              value={manwonText(netAnnual)}
              tone={netAnnual < 0 ? "text-ai-danger" : undefined}
            />
          </>
        )}
        <ResultRow
          label={hasLoan ? "실투자금 (자기자본)" : "실투자금 (매매 − 보증금)"}
          value={manwonText(hasLoan ? equity : investNoLoan)}
        />
        {hasLoan && simpleYield !== null && (
          <ResultRow label="단순 수익률 (무대출 기준)" value={pct(simpleYield)} />
        )}
      </ResultPanel>
    </div>
  );
}

/* [개선 #6, 2026-08-22] 세 도구를 export 로 열었다 — /calculator/* 개별 검색
   랜딩(전월세 전환·갭·수익률)이 같은 컴포넌트를 그대로 재사용한다(로직 단일 출처). */

/* ---------- 컨테이너 ---------- */

export function RealEstateTools() {
  const [tool, setTool] = useState<Tool>("jeonse");

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        options={TOOLS}
        value={tool}
        onChange={setTool}
        ariaLabel="부동산 계산기 종류"
        className="rise-in w-full [&>button]:flex-1"
      />

      <div className="rise-in-1">
        {tool === "jeonse" && <JeonseWolse />}
        {tool === "gap" && <GapRatio />}
        {tool === "yield" && <RentalYield />}
      </div>
    </div>
  );
}
