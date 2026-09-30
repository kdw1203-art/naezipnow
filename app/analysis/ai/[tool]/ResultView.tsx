"use client";
/* [1026b · AI 분석 8종] 12종 모두 한 순서 — 예전 8종 순서(결과 요약 카드 → 주인공 그림 → 실거래 → 다음 할 일 버튼 3개(도구 색 채움) →
   AI 해설 → 자세히)와 NextActions 를 걷었다. 8종 결론 히어로는 tool-signature.tsx(SummaryLine + 대표 수치 + 대표 그림 한 카드):
   리스크 점검 위험 신호 5가지 · 수익률 계산 대출 계산 · 비교 나란히 비교 · 체크리스트 확인할 항목 · 계약 점검 계약 전에 확인할 것을
   히어로 카드 안 SigFigure 로. 비교의 "함께 비교해 볼 단지"는 손잡이(폰 내 조건 뒤). 실거래 흐름은 데스크톱 펼침·폰 닫힘(FoldCard) ·
   근거·출처 닫힘 · 다른 도구 칩 줄(비교·자산 구성 제외). 다음 행동은 레일·폰 하단 바(ResultRail). "② 에 …" → "내 조건에 …". */
/* [1026 · 단지 분석 4종] 1025 표준 — variant="complex" 순서: 결론 히어로(대표 그림 카드 첫 줄: t-title 결론 + 판정 칩 +
   근거 한 줄 + 다음 행동 한 줄(lib/ai/conclusion-next) + 다른 도구 칩 줄(VerdictChips — 맨 아래 보드를 올렸다)) → 대표 그림 →
   KPI 4칸 → (폰) 내 조건 → (예측) 해마다·가정 → AI 해설 → 이 단지 실거래가 흐름(FoldCard: 진단·예측·타이밍은 데스크톱 펼침·폰 닫힘,
   임장 동선은 닫힘) → 근거·출처(<details> 닫힘 · "근거 N개 · 오래된 자료 N개") → 자세히 보기. 관심 단지 담기 로직은 useWatchAdd
   하나(레일 액션 카드·예전 NextActions 공용). 데이터·API·계산은 그대로. */
/* [1022 · 단지 분석 고도화] 지시 3 — variant="complex" 에서 ① 이전 실행 기록(lib/ai/history-store 에 verdict 가 설 때 저장 →
   lib/ai/history-compare 로 "지난번 N점 → 지금 M점"·"지난번 좋음 2 : 주의 1" 한 줄, 있을 때만) ② 시세 예측 시나리오 강조 상태
   (부채꼴·해마다 표가 같은 focus) ③ 비용 포함 손익분기(lib/ai/scenario-breakeven — 내 조건의 대출 비율·금리가 있을 때만)
   ④ 종합 진단 타일 아래 "근거 N개 · 오래된 자료 N개"(verdict.evidence 만 센다). 데이터 로딩·API 는 그대로. */
/* [1012 · 규칙 8] font-bold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
/* [1021 · 단지 분석 /analysis/ai] 단지 분석 4종(진단·예측·동선·타이밍)은 variant="complex" — 시안(mock8)대로
   대표 그림(signature-cards.tsx) → 타일 4칸 → (예측: 해마다·가정) → 실거래 흐름 → 근거·출처 → AI 해설 → 자세히 보기.
   노트·관심·비교 버튼은 오른쪽 레일(ResultRail.tsx)로 옮겼다. 나머지 8종은 예전 순서 그대로. */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { cleanAiLine } from "@/lib/ai/ai-tail";
import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";
import type { Verdict } from "@/lib/ai/verdict";
import type { ComplexTradeSeries } from "@/lib/ai/result-series";
import type { ContractCheck } from "@/lib/ai/contract-check";
import type { LoanCalc } from "@/lib/ai/loan-calc";
import { scenarioAssumptionLine } from "@/lib/ai/price-scenarios";
import { formatKrwWon } from "@/lib/format/krw";
import { formatEokMan } from "@/lib/format/eok-man";
import { DELTA_ARROW, DELTA_CLASS, DELTA_WORD, deltaDir } from "@/lib/format/delta";
import { verdictNextActions } from "@/lib/ai/next-action-routing";
import { conclusionNext } from "@/lib/ai/conclusion-next";
import { buildGroupKey, listHistory, pushHistory, type HistoryEntry } from "@/lib/ai/history-store";
import { countSignals, encodeSignalCombo, scoreHistoryLine, shouldRecord, signalHistoryLine } from "@/lib/ai/history-compare";
import { scenarioBreakEven } from "@/lib/ai/scenario-breakeven";
import type { ScenarioKey } from "@/lib/ai/price-scenarios";
import { hasSession } from "@/lib/client/has-session";
import { freeQuotaLabel, weeklyPassCheckoutHref } from "@/lib/payments/paywall-links";
import { useCopy } from "@/lib/ui/use-copy";
import { PriceHistoryChart } from "@/app/components/viz/PriceHistoryChart";
import { Icon } from "@/app/components/Icon";
import { Explain } from "@/app/components/explain/Explain";
import { Delta } from "@/app/components/num/Delta";
import { useToast } from "@/app/components/toast/ToastProvider";
import { VerdictTiles, ymLabel } from "./VerdictCard";
import { MyNotesChip, VerdictChips } from "./VerdictBoard";
import { tileDisplay, verdictSources } from "./verdict-display";
import { metricExplain, tileExplain } from "./verdict-explain";
import { DiagnosisSignature, InspectionSignature, PredictionSignature, ScenarioTables, TimingSignature } from "./signature-cards";
import { SigFigure, ToolSignature } from "./tool-signature";
import { isFrameTool } from "./frame-tools";
import type { Ctx, Footnote, Insight, PickedLite, RunResult, Similar } from "./workbench-types";

/* ============================================================
   [1008 · W] AI 분석 결과 화면 — 처음 온 사람이 5초 안에 "무엇을 봐야 하는지" 알게.

   소유자 캡처(공작아파트 · 시세 예측/리스크 점검): 판단 카드·근거 각주·궤적·갈래·판단 보류 같은
   내부 말, 흩어진 버튼 6개, 같은 정보 여러 번, 그래프 0개. 이 파일이 그 자리를 한 순서로 세운다:
     ① 결과 요약 — 상태 알약 + 쉬운 한 줄 결론 + 대표 수치 + 핵심 숫자 4칸(출처 한 줄, 모르면 "자료 없음")
     ② 그래프 — 도구의 주인공(레이더·신호등·위험 체크리스트·동선) + 이 단지 실거래 흐름(시세 예측은 시나리오)
     ③ 다음 할 일 — 최대 3개(임장노트 쓰기 · 관심 단지 담기 · 다른 단지와 비교), 실제로 동작하는 경로만
     ④ AI 해설 — "분석 실행"으로 받은 외부 모델 서술만(자체 규칙 본문은 싣지 않는다 — 아래 주석)
     ⑤ 자세히 보기(접힘 한 곳) — 데이터 출처 · 결과가 달라지는 경우 · 뉴스·노트 · 링크·프리셋·피드백
   next/dynamic(ssr:false) 청크 — 워크벤치 본체 번들(예산 480KB)에 들어가지 않는다.
   수치는 전부 서버(lib/ai/verdict.ts · /api/ai/context)가 만든 것이다. 여기서는 그리기만 한다.

   [1009 · A] 토스증권·네이버 부동산 관례로 다듬었다 — 숫자 옆 ⓘ(누르면 "이렇게 계산했어요" 시트, 모바일에서도 읽힘),
   가격은 <Won>·등락은 <Delta>(▲ 빨강·▼ 파랑 + 비교 기준), 그래프는 누르고 끌면 그 달 값(PriceHistoryChart),
   담기·저장·복사·의견은 결과를 토스트로 알린다(버튼 문구만 바뀌던 것). 마우스를 올려야 보이던 title= 설명은 걷었다.

   자체 규칙 본문(analysis-engine buildInternalAnalysisMarkdown)을 싣지 않는 이유: 리스크·타이밍 본문은
   앱 안의 예시 표(workbench-constants 의 RISK_BLOCKS·TIMING_FULL — "강남구 매수 강도 82" 같은 고정값)를
   늘어놓는다. 고른 단지와 무관한 숫자라 결과 화면에 두면 거짓이 된다(보고서에 남김).
   ============================================================ */

const MD_LINE = /\*\*(.+?)\*\*/g;
function renderBold(s: string) {
  return s.split(MD_LINE).map((p, i) =>
    i % 2 === 1 ? (
      <b key={i} className="font-bold text-ink">
        {p}
      </b>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}
/** AI 해설 경량 렌더(##·-·**·>) — 외부 md 라이브러리 없이 */
function MdLite({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1 t-body text-text-1">
      {text.split("\n").map((ln, i) => {
        /* [1008 · 리뷰 A-18] 예전 실행 기록의 꼬리 줄 — 밑줄 기울임 문자와 내부 말을 걷는다(lib/ai/ai-tail) */
        const t = cleanAiLine(ln.trim());
        if (!t) return <div key={i} className="h-1" />;
        if (t.startsWith("## ")) return <div key={i} className="mt-2 t-section text-ink">{t.slice(3)}</div>;
        if (t.startsWith("> ")) return <div key={i} className="rounded-lg bg-warning-soft px-3 py-2 t-sub font-bold text-warning">{t.slice(2)}</div>;
        if (t.startsWith("- ") || t.startsWith("* ")) return <div key={i} className="pl-3">· {renderBold(t.slice(2))}</div>;
        if (t === "---") return <hr key={i} className="my-1 border-line" />;
        return <div key={i}>{renderBold(t)}</div>;
      })}
    </div>
  );
}

function Card({ title, sub, children, id }: { title: string; sub?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="card flex scroll-mt-20 flex-col gap-3 rounded-2xl p-4" aria-label={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <h2 className="t-section font-bold text-ink">{title}</h2>
        {sub && <span className="t-caption text-text-3">{sub}</span>}
      </div>
      {children}
    </section>
  );
}

/* ── 도구별 주인공 그림 ─────────────────────────────────────────────── */

const CHECK_META = {
  pass: { icon: "check", cls: "text-success", word: "통과" },
  warn: { icon: "warning", cls: "text-warning", word: "주의" },
  info: { icon: "help", cls: "text-primary", word: "참고" },
  na: { icon: "circle", cls: "text-text-3", word: "자료 없음" },
} as const;

/** 리스크 점검 — 5가지 체크리스트(통과·주의·참고·자료 없음). [1026b] 색은 1025 판정 색(통과 초록 · 주의 주황 · 참고 파랑) */
function RiskChecklist({ checks }: { checks: NonNullable<Insight["checks"]> }) {
  return (
    <ul className="flex flex-col divide-y divide-line" data-tone="plain">
      {checks.map((c) => {
        const m = CHECK_META[c.status];
        return (
          <li key={c.key} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
            <span className={`mt-0.5 shrink-0 ${m.cls}`}>
              <Icon name={m.icon} size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="t-body font-bold text-ink">
                  {c.label} <span className={`t-sub font-bold ${m.cls}`}>{m.word}</span>
                </span>
                <span className="t-body font-bold tabular-nums text-text-1">{c.value ?? "—"}</span>
              </div>
              <p className="t-sub text-text-2">{c.detail}</p>
              <p className="t-caption text-text-3">기준: {c.rule}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** 임장 동선 — 이 단지 + 같은 지역 거래 많은 단지(최근 6개월) 순서 */
function RouteList({ picked, similar, onPick }: { picked: PickedLite; similar: Similar[]; onPick: (s: Similar) => void }) {
  const max = Math.max(1, ...similar.map((s) => s.txCount));
  return (
    <ol className="flex flex-col gap-2">
      <li className="flex items-center gap-3 rounded-lg bg-primary-soft px-3 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary t-sub font-bold text-white">1</span>
        <span className="min-w-0 flex-1 break-words t-body font-bold text-ink">{picked.name}</span>
        <span className="shrink-0 t-caption font-bold text-primary">지금 보는 단지</span>
      </li>
      {similar.map((s, i) => (
        <li key={s.id} className="flex items-center gap-3 rounded-lg bg-bg px-3 py-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line-strong t-sub font-bold text-text-1">
            {i + 2}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="break-words t-body font-bold text-ink">{s.name}</span>
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-line" aria-hidden="true">
                <span className="block h-full rounded-full bg-primary opacity-60" style={{ width: `${Math.round((s.txCount / max) * 100)}%` }} />
              </span>
              <span className="shrink-0 t-caption tabular-nums text-text-3">최근 6개월 {s.txCount.toLocaleString("ko-KR")}건</span>
            </span>
          </span>
          <button type="button" onClick={() => onPick(s)} className="btn-secondary btn-md shrink-0 px-3 t-sub">
            이 단지 보기
          </button>
        </li>
      ))}
    </ol>
  );
}

/* ── [1008 · 리뷰 A-3] 전월세 계약 점검 — 입력으로 만든 사실 목록(lib/ai/contract-check.ts) ──────── */

const ISSUE_META = {
  danger: { icon: "warning", cls: "text-danger" },
  warning: { icon: "warning", cls: "text-warning" },
  todo: { icon: "circle", cls: "text-text-3" },
} as const;

function ContractCard({ contract }: { contract: ContractCheck }) {
  return (
    <SigFigure title="계약 전에 확인할 것" sub={contract.ratioSource === "region" ? "전세가율은 지역 평균 — 이 집 값을 넣으면 다시 계산" : "내 조건에 넣은 값으로 계산"}>
      {contract.issues.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {contract.issues.map((it, i) => (
            <li key={i} className="flex items-start gap-2 t-sub text-text-1">
              <Icon name={ISSUE_META[it.tone].icon} size={16} className={`mt-0.5 shrink-0 ${ISSUE_META[it.tone].cls}`} />
              <span>{it.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-sub text-text-2">넣은 조건에서 바로 걸리는 항목은 없어요.</p>
      )}
      {contract.saleEstimateMan != null && (
        <p className="t-sub text-text-2">
          보증금 ÷ 전세가율로 거꾸로 잡은 매매가는 약{" "}
          <b className="text-ink">{formatKrwWon(contract.saleEstimateMan * 10_000, { style: "short" })}</b> · 실거래가와 비교 기준.
        </p>
      )}
      <div className="flex flex-col gap-1.5 rounded-lg bg-bg px-3 py-3">
        <h4 className="t-sub font-bold text-text-1">계약서 특약·챙길 일</h4>
        <ul className="flex flex-col gap-1">
          {contract.clauses.map((c, i) => (
            <li key={i} className="t-sub text-text-2">
              · {c}
            </li>
          ))}
        </ul>
      </div>
      <p className="t-caption text-text-3">
        일반 정보(법률 자문 아님). 전입신고·확정일자의 효력은 주택임대차보호법 제3조(대항력)·제3조의2(우선변제)에 따른다.
      </p>
    </SigFigure>
  );
}

/* ── [1008 · 리뷰 A-3] 수익률 계산 — 원리금균등 대출 계산(lib/ai/loan-calc.ts) ──────────────── */

function manWonText(krw: number): string {
  const t = formatKrwWon(krw, { style: "short" });
  return /만$/.test(t) ? `${t}원` : t;
}

function LoanCard({ loan }: { loan: LoanCalc | null }) {
  if (!loan) {
    return (
      <SigFigure title="대출 계산">
        <p className="t-sub text-text-2">내 조건에 대출 비율과 금리를 넣고 다시 계산하면 대출액·월 상환액·이자가 여기에 나와요.</p>
      </SigFigure>
    );
  }
  /* [1009 · A] 입력으로 계산한 금액은 정밀 표기("20억 2,800만원") — 짧은 "20.3억"은 계산 결과를 뭉갠다(표기 표준).
     시나리오 가격(판 값·차익)은 가정이라 짧은 표기를 그대로 둔다(예측을 실제보다 정밀하게 보이지 않게). */
  const won = (krw: number) => formatEokMan(krw / 10_000, { unit: "만원" });
  const rows: [ReactNode, ReactNode][] = [
    [
      loan.priceKind === "input" ? "기준 가격(입력)" : "기준 가격(최근 실거래 평균)",
      won(loan.priceKrw),
    ],
    [
      <span key="k" className="inline-flex items-center gap-0.5">
        대출액({loan.ltvPct}%)
        <Explain term="ltv" how="기준 가격 × 대출 비율(내 조건에 넣은 값)이에요." source="입력값 계산" />
      </span>,
      won(loan.loanKrw),
    ],
    ["내 돈(가격 − 대출)", won(loan.equityKrw)],
    [`월 상환액(금리 ${loan.ratePct}% · ${loan.termYears}년)`, won(loan.monthlyKrw)],
    [`${loan.termYears}년 총 이자`, won(loan.totalInterestKrw)],
    ...(loan.holdingInterestKrw != null ? ([[`${loan.holdingYears}년 보유 동안 낸 이자`, won(loan.holdingInterestKrw)]] as [ReactNode, ReactNode][]) : []),
    [
      "금리가 1%p 오르면 월 상환액",
      <span key="v" className="inline-flex flex-wrap items-baseline justify-end gap-x-1.5">
        {won(loan.monthlyPlus1ppKrw)}
        <Delta
          pct={((loan.monthlyPlus1ppKrw - loan.monthlyKrw) / loan.monthlyKrw) * 100}
          diffManwon={(loan.monthlyPlus1ppKrw - loan.monthlyKrw) / 10_000}
          srContext="지금보다"
          className="t-caption"
        />
      </span>,
    ],
  ];
  const Y_LABEL = { opt: "낙관", base: "기본", pess: "비관" } as const;
  return (
    <SigFigure title="대출 계산" sub="원리금균등 상환">
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5">
        {rows.map(([k, v], i) => (
          <div key={i} className="contents">
            <dt className="t-sub text-text-2">{k}</dt>
            <dd className="text-right t-sub font-bold tabular-nums text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {loan.yields && loan.holdingYears != null ? (
        <div className="flex flex-col gap-1.5 rounded-lg bg-bg px-3 py-3">
          <h4 className="t-sub font-bold text-text-1">{loan.holdingYears}년 뒤 팔면 — 넣은 돈 대비 연 수익률(가정)</h4>
          <ul className="flex flex-col gap-1">
            {loan.yields.map((y) => {
              /* [1009 · A] 이익 = 빨강 ▲ · 손실 = 파랑 ▼(등락 관례). 예전엔 손실만 오류색(text-danger)이라
                 "손해"가 경고처럼, 이익은 무색으로 보였다 */
              const dir = deltaDir(y.annualPct);
              return (
                <li key={y.key} className="flex flex-wrap items-baseline justify-between gap-x-2 t-sub">
                  <span className="text-text-2">
                    {Y_LABEL[y.key]}(가격 연 {y.annualPricePct > 0 ? "+" : ""}
                    {y.annualPricePct}%) · 판 값 {formatKrwWon(y.salePriceKrw, { style: "short" })}
                  </span>
                  <b className={`tabular-nums ${dir ? DELTA_CLASS[dir] : "text-text-2"}`}>
                    연 {dir && dir !== "flat" ? <span aria-hidden="true">{DELTA_ARROW[dir]} </span> : null}
                    {dir && <span className="sr-only">{DELTA_WORD[dir]} </span>}
                    {Math.abs(y.annualPct)}% · {y.profitKrw >= 0 ? `차익 ${manWonText(y.profitKrw)}` : `손해 ${manWonText(-y.profitKrw)}`}
                  </b>
                </li>
              );
            })}
          </ul>
          <p className="t-caption text-text-3">
            넣은 돈 = 계약 때 내 돈 + {loan.holdingYears}년 동안 낸 원리금({manWonText(loan.yields[0].cashOutKrw)}) · 받는 돈 = 판 값 − 남은 대출.
            가격 가정은 시세 예측과 같은 낙관·기본·비관 시나리오.
          </p>
        </div>
      ) : (
        <p className="t-sub text-text-2">내 조건에 보유 기간을 넣으면 그 기간 뒤 팔았을 때의 연 수익률(가정)도 계산.</p>
      )}
      <p className="t-caption text-text-3">
        {loan.termAssumed ? "상환 기간을 비워 30년으로 계산했어요. " : ""}취득세·중개보수·보유세·임대료는 넣지 않았어요 — 실제 부담은 더 커요.
      </p>
    </SigFigure>
  );
}

/* ── [1022] 이전 실행 기록 — verdict 가 설 때 history-store(localStorage)에 남기고, 같은 키의 이전 항목을 돌려준다 ──
   같은 날 같은 값이면 다시 저장하지 않는다(history-compare.shouldRecord) — 새로 고칠 때마다 "지난번"이 몇 분 전이 되지 않게. */

function useRunHistory(
  tool: AiAnalysisToolId,
  groupKey: string | null,
  current: { score: number | null; oneLine: string | null; headline: string | null; createdAt: string | null },
): HistoryEntry[] {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const { score, oneLine, headline, createdAt } = current;
  useEffect(() => {
    if (!groupKey || !createdAt) {
      setEntries([]);
      return;
    }
    const before = listHistory(tool, groupKey);
    if (shouldRecord(before, { score, oneLine, createdAt })) pushHistory({ tool, groupKey, score, headline, oneLine, createdAt });
    setEntries(listHistory(tool, groupKey));
  }, [tool, groupKey, score, oneLine, headline, createdAt]);
  return entries;
}

/* ── [1008 · 리뷰 A-3] 투자 체크리스트 — 확인할 항목(체크 상태는 이 기기에만 저장) ─────────────── */

/** [1026b] 레일의 "체크리스트로 노트 시작"이 누를 때 같은 키에서 체크 상태를 읽는다 */
export function checklistKey(complexId: string | null) {
  return `nz_ai_checklist_v1:${complexId ?? "none"}`;
}

function useChecklistState(complexId: string | null) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(checklistKey(complexId));
      setChecked(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setChecked(new Set());
    }
  }, [complexId]);
  const toggle = useCallback(
    (id: string) => {
      setChecked((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        try {
          window.localStorage.setItem(checklistKey(complexId), JSON.stringify([...next]));
        } catch {
          /* 저장이 막혀도 이번 화면에서는 체크가 된다 */
        }
        return next;
      });
    },
    [complexId],
  );
  return { checked, toggle };
}

function ChecklistCard({
  groups,
  checked,
  onToggle,
}: {
  groups: NonNullable<Verdict["checklist"]>;
  checked: Set<string>;
  onToggle: (id: string) => void;
}) {
  const total = groups.reduce((a, g) => a + g.items.length, 0);
  const done = groups.reduce((a, g) => a + g.items.filter((i) => checked.has(i.id)).length, 0);
  /* [1026b · 통합] 폰은 앞 두 분야만 펼치고 나머지는 "더 보기"(43항목이 한 번에 3,000px 이던 것 — 1025 표준 "긴 목록 → 앞 몇 개 + 더 보기").
     데스크톱(md+)은 2열로 전부. 체크 상태·저장 키는 그대로다. */
  const [allOnPhone, setAllOnPhone] = useState(false);
  const PHONE_GROUPS = 2;
  const restItems = groups.slice(PHONE_GROUPS).reduce((a, g) => a + g.items.length, 0);
  return (
    <SigFigure title={`확인할 항목 ${total}개`} sub={`완료 ${done}/${total} · 체크는 이 기기에 저장돼요`}>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
        {groups.map((g, gi) => (
          <fieldset key={g.title} className={`flex flex-col gap-0.5 ${gi >= PHONE_GROUPS && !allOnPhone ? "max-md:hidden" : ""}`}>
            <legend className="mb-1 t-sub font-bold text-text-1">{g.title}</legend>
            {g.items.map((it) => (
              <label key={it.id} className="flex min-h-[40px] items-center gap-2.5 rounded-lg px-1 t-sub text-text-1">
                <input type="checkbox" className="h-5 w-5 shrink-0" checked={checked.has(it.id)} onChange={() => onToggle(it.id)} />
                <span className={checked.has(it.id) ? "text-text-3 line-through" : ""}>{it.label}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      {groups.length > PHONE_GROUPS && !allOnPhone && (
        /* .btn-md 의 display(inline-flex, 레이어 밖 규칙)가 md:hidden 을 이긴다 — 숨김은 감싸는 div 가 맡는다 */
        <div className="mt-2 md:hidden">
          <button type="button" onClick={() => setAllOnPhone(true)} className="btn-outline btn-md w-full">
            나머지 {groups.length - PHONE_GROUPS}개 분야 · {restItems}항목 더 보기
          </button>
        </div>
      )}
    </SigFigure>
  );
}

/* ── [1008 · 리뷰 A-3] 다른 단지와 비교 — 담은 단지의 같은 숫자 칸을 나란히 ─────────────────── */

function CompareTable({ tray, currentId, currentVerdict }: { tray: PickedLite[]; currentId: string | null; currentVerdict: Verdict | null }) {
  const [byId, setById] = useState<Record<string, { verdict: Verdict | null; failed: boolean }>>({});
  const ids = tray.map((c) => c.id).join(",");
  useEffect(() => {
    let cancelled = false;
    for (const c of tray) {
      if (c.id === currentId && currentVerdict) continue;
      /* 같은 공개 응답(CDN 캐시) — 담은 단지만, 이 화면에서 한 번씩 */
      fetch(`/api/ai/context?complexId=${encodeURIComponent(c.id)}&tool=ai-compare`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!cancelled) setById((prev) => ({ ...prev, [c.id]: { verdict: j?.ok ? (j.verdict ?? null) : null, failed: !j?.ok } }));
        })
        .catch(() => {
          if (!cancelled) setById((prev) => ({ ...prev, [c.id]: { verdict: null, failed: true } }));
        });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  const col = (id: string) => (id === currentId && currentVerdict ? { verdict: currentVerdict, failed: false } : byId[id]);
  const labels = (currentVerdict?.tiles ?? Object.values(byId).find((x) => x.verdict?.tiles)?.verdict?.tiles ?? []).map((t) => ({ key: t.key, label: t.label }));
  return (
    <SigFigure title="나란히 비교" sub="기준일·출처는 근거·출처">
      {/* relative — 칸 안 <Delta> 의 sr-only 가 가로 스크롤 상자를 벗어나 문서 폭을 늘리지 않게 */}
      <div className="relative overflow-x-auto">
        <table className="w-full table-fixed border-collapse t-sub">
          <thead>
            <tr>
              <th scope="col" className="w-[30%] pb-2 text-left t-caption font-bold text-text-3">항목</th>
              {tray.map((c) => (
                <th key={c.id} scope="col" className="break-words pb-2 text-left font-bold text-ink">
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-line">
              <th scope="row" className="py-2 text-left font-bold text-text-2">종합 진단</th>
              {tray.map((c) => {
                const v = col(c.id);
                return (
                  <td key={c.id} className="py-2 font-bold text-ink">
                    {!v ? "…" : v.failed ? "못 불러옴" : (v.verdict?.bandReason?.match(/종합 점수 (\d+)점/)?.[1] ?? "—") + (v.verdict?.bandReason?.match(/종합 점수 \d+점/) ? "점" : "")}
                  </td>
                );
              })}
            </tr>
            {labels.map((l) => (
              <tr key={l.key} className="border-t border-line">
                <th scope="row" className="py-2 text-left font-bold text-text-2">{l.label}</th>
                {tray.map((c) => {
                  const v = col(c.id);
                  const t = v?.verdict?.tiles?.find((x) => x.key === l.key);
                  /* [1009 · A] 등락 칸은 ▲ 빨강·▼ 파랑으로 — 세 단지가 같은 칸에서 방향이 바로 갈린다 */
                  const d = t ? tileDisplay(t) : null;
                  return (
                    <td key={c.id} className="py-2 pr-1 align-top">
                      <span className="break-words font-bold tabular-nums text-ink">
                        {!v ? "…" : v.failed ? "못 불러옴" : d?.kind === "delta" ? <Delta pct={d.pct} digits={d.digits} srContext={d.base} /> : (t?.value ?? "—")}
                      </span>
                      {/* 좁은 화면에선 설명 줄을 접는다 — 칸 폭(3곳 × 80px)에 "2026.03~2026.08" 이 넘쳐 옆 칸을 덮었다 */}
                      {t?.note && <span className="hidden break-all t-caption text-text-3 sm:block">{t.note}</span>}
                      {/* 가격 칸은 평형이 달라 값만으론 견줄 수 없다 — 좁은 화면에도 평형만은 적는다 */}
                      {t?.note && l.key === "price" && <span className="block t-caption text-text-3 sm:hidden">{t.note.split(" 최근")[0]}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SigFigure>
  );
}

/* ── 실거래 흐름 카드 ──────────────────────────────────────────────── */

/** [1026] 접는 카드 — 데스크톱(lg+)에서만 처음부터 펼칠지(wideOpen). 결과 청크는 ssr:false 라 첫 렌더에서 폭을 읽는다 */
function useWideOpen(wideOpen: boolean): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(() => wideOpen && typeof window !== "undefined" && window.matchMedia?.("(min-width: 1024px)").matches === true);
  return [open, setOpen];
}

function FoldCard({ title, sub, wideOpen, children }: { title: string; sub?: ReactNode; wideOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useWideOpen(wideOpen);
  return (
    <details className="card group rounded-2xl p-4 max-md:p-3.5" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="flex min-h-[40px] cursor-pointer flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
        <h2 className="t-section font-bold text-ink">{title}</h2>
        {sub && <span className="t-caption tabular-nums text-text-3">{sub}</span>}
      </summary>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </details>
  );
}

function PriceFlowCard({
  tool,
  series,
  verdict,
  hasPrice,
  failed,
  fold = null,
}: {
  tool: AiAnalysisToolId;
  series: ComplexTradeSeries | null;
  verdict: Verdict | null;
  hasPrice: boolean;
  /** [1008 · 리뷰 A-9] 매매 조회가 실패했다 — "거래 없음"과 다르다 */
  failed: boolean;
  /** [1026] 접기 — "wide": 데스크톱 펼침·폰 닫힘 · "closed": 늘 닫힘 · null: 예전 카드 */
  fold?: "wide" | "closed" | null;
}) {
  const scenario = tool === "ai-prediction" ? (verdict?.scenario ?? null) : null;
  const months = series?.months ?? [];
  const title = scenario ? `앞으로 ${scenario.years}년, 세 가지 시나리오` : "이 단지 실거래가 흐름";
  const range = series ? `${ymLabel(months[0]?.ym) ?? ""}~${ymLabel(series.asOf) ?? ""}` : "";
  const unitWord = series?.basis === "band" ? "면적대" : "평형";
  /* [1009 · A] 1008 에는 그래프 아래 설명 문단이 셋(선의 평형·시나리오 출발점·신고 지연)이라 그래프보다 글이 길었다
     (390px 실측 — 문단 3개 11줄). 읽는 법은 ⓘ 시트로 옮기고, 화면에는 결론을 바꾸는 사실(거래가 적다 · 시나리오는
     가정이다)과 출처 한 줄만 남긴다. */
  const readHow = [
    `선: ${series?.label ?? "대표 평형"} 월평균이에요. 이 단지에서 가장 많이 거래된 ${unitWord} 하나만 이었어요 — ${unitWord}마다 가격이 달라 섞으면 그 달 팔린 구성에 따라 선이 출렁여요.`,
    `막대: 그 달 전체 매매 건수 — 진한 부분이 선과 같은 ${unitWord}이에요.`,
    "속 빈 점: 거래가 1~2건뿐인 달이에요. 한두 건 값이 흐름처럼 보이지 않게 선에서 뺐어요.",
    "점선: 거래가 없거나 적은 달을 건너뛴 자리(빈 달을 지어내 잇지 않는다).",
    ...(scenario ? [`시나리오: ${scenarioAssumptionLine(scenario)}`] : []),
    "그래프를 누른 채 좌우로 움직이면(마우스는 올리기만 해도) 그 달 값이 위 큰 숫자에 나와요.",
  ];
  const readHowNode =
    months.length > 0 ? (
      <span className="inline-flex items-center gap-0.5">
        읽는 법
        <Explain title="그래프 읽는 법" how={readHow} source={`국토교통부 실거래(신고) · ${range}`} />
      </span>
    ) : undefined;
  const body = (
    <>
      {months.length > 0 ? (
        <>
          <PriceHistoryChart
            months={months}
            label={series?.label ?? null}
            basis={series?.basis ?? "unit"}
            scenario={scenario ? { startKrw: scenario.startKrw, years: scenario.years, path: scenario.path } : null}
          />
          {series?.sparse && (
            <p className="rounded-lg bg-bg px-3 py-2 t-sub text-text-2">
              거래가 적어 추이를 그리기 어려워요 — 거래가 있었던 달만 점으로 찍었어요.
            </p>
          )}
          {scenario && (
            <p className="t-sub text-text-2">
              시나리오는{" "}
              {scenario.startKind === "input" ? "내가 넣은 기준 가격" : `최근 실거래 평균(${series?.label ?? "대표 평형"})`}{" "}
              <b className="text-ink">{formatKrwWon(scenario.startKrw, { style: "short" })}</b>에서 출발한 <b className="text-ink">가정 계산</b>이에요 — 예측이
              아니에요. 규칙은 &lsquo;읽는 법&rsquo;에 있어요.
            </p>
          )}
          <p className="t-caption text-text-3 break-words">
            출처 국토교통부 실거래(신고) · {range}
            {months.length < 12 ? ` · 모인 자료 ${months.length}개월치` : ""} · 최근 1~2개월은 신고 중이라 덜 잡혔을 수 있어요
          </p>
        </>
      ) : (
        <p className="rounded-lg bg-bg px-3 py-3 t-sub text-text-2">
          {failed || hasPrice
            ? "그래프 자료를 지금은 불러오지 못했어요. 잠시 뒤 다시 열어 주세요."
            : "이 단지는 최근 매매 실거래가 없어 그래프를 그리지 않았어요."}
        </p>
      )}
    </>
  );
  if (fold) {
    /* 요약 줄 안에는 누르는 것(ⓘ)을 두지 않는다 — 누르면 접힘이 같이 바뀐다. 읽는 법은 펼친 뒤 첫 줄에 */
    return (
      <FoldCard
        title={title}
        sub={months.length > 0 ? `${range} · ${months.length}개월` : undefined}
        wideOpen={fold === "wide"}
      >
        {readHowNode && <span className="self-end t-caption text-text-3">{readHowNode}</span>}
        {body}
      </FoldCard>
    );
  }
  return (
    <Card title={title} sub={readHowNode}>
      {body}
    </Card>
  );
}

/* ── 다음 할 일(최대 3개) ─────────────────────────────────────────── */

/** [1026] 관심 단지 담기 — 레일 액션 카드의 로직. [1026b] 12종 모두 레일(예전 NextActions 버튼 줄은 걷었다) */
export type WatchState = "idle" | "busy" | "done" | "login" | "fail";
export function useWatchAdd(picked: PickedLite | null): { watch: WatchState; addWatch: () => Promise<void> } {
  const [watch, setWatch] = useState<WatchState>("idle");
  const { showToast } = useToast();
  /* [1009 · A] 결과는 토스트로 — 예전엔 버튼 문구만 바뀌었고, 비교함이 가득 찼다는 안내는 링크가 비교 화면으로
     넘어가며 사라져 **아무도 보지 못했다**(onClick 에서 state 를 세우고 곧바로 이동). 토스트는 화면을 넘어 남는다. */
  const addWatch = useCallback(async () => {
    if (!picked || watch === "busy" || watch === "done") return;
    if (!(await hasSession())) {
      setWatch("login");
      showToast("관심 단지는 로그인하면 담을 수 있어요", { label: "로그인", href: `/login?callbackUrl=${encodeURIComponent(window.location.pathname + window.location.search)}` });
      return;
    }
    setWatch("busy");
    try {
      const res = await fetch("/api/me/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complexId: picked.id, complexName: picked.name }),
      });
      const next = res.ok ? "done" : res.status === 401 ? "login" : "fail";
      setWatch(next);
      /* 토스트는 한 줄 — 390px 에서 잘리지 않는 길이로(핵심 먼저, 이름은 뒤) */
      if (next === "done") showToast(`관심 단지에 담았어요 · ${picked.name}`, { label: "관심 단지 보기", href: "/my/watchlist" });
      else if (next === "fail") showToast("담지 못했어요. 연결을 확인하고 다시 눌러 주세요");
    } catch {
      setWatch("fail");
      showToast("담지 못했어요 — 인터넷 연결을 확인하고 다시 눌러 주세요");
    }
  }, [picked, watch, showToast]);
  return { watch, addWatch };
}

/* ── 자세히 보기(접힘 한 곳) ──────────────────────────────────────── */

function Details({
  tool,
  picked,
  verdict,
  footnotes,
  counters,
  ctx,
  result,
  hideEvidence = false,
}: {
  tool: AiAnalysisToolId;
  picked: PickedLite | null;
  verdict: Verdict | null;
  footnotes: Footnote[];
  counters: string[];
  ctx: Ctx;
  result: RunResult | null;
  /** [1021] 단지 분석 4종은 "근거 · 출처" 카드가 위에 따로 선다 — 여기서는 되풀이하지 않는다 */
  hideEvidence?: boolean;
}) {
  const [feedback, setFeedback] = useState<"idle" | "busy" | "sent">("idle");
  const [note, setNote] = useState("");
  /* [1009 · A] 복사·저장·의견은 토스트로 결과를 알린다(공용 useCopy — 실패하면 실패 문구) */
  const { copy, copied } = useCopy("결과 링크를 복사했어요");
  const { showToast } = useToast();
  const [preset, setPreset] = useState<"idle" | "busy" | "done">("idle");
  const evidence = verdict?.evidence?.length
    ? verdict.evidence.map((e) => ({ label: e.label, source: e.source, asOf: e.asOf, confidence: e.confidence, href: e.href }))
    : footnotes.map((f) => ({ label: f.label, source: f.source, asOf: f.asOf, confidence: "ok" as const, href: f.href }));
  const shareUrl = result?.ok && result.runId ? `/analysis/ai/r/${result.runId}` : null;

  /* [1009 · A · 리뷰] 의견은 로그인한 사람만 기록된다(/api/ai/feedback 은 비로그인 401). 예전엔 보내기 전에
     "기록했어요"를 먼저 띄워, 비로그인 👍 도 기록된 것처럼 보였다 — 서버가 받았을 때만 고맙다고 한다. */
  const loginHref = () => `/login?callbackUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  const sendFeedback = async (rating: "up" | "down") => {
    if (feedback !== "idle") return;
    if (!(await hasSession())) {
      showToast("의견은 로그인하면 남길 수 있어요", { label: "로그인", href: loginHref() });
      return;
    }
    setFeedback("busy");
    try {
      const res = await fetch("/api/ai/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, targetType: "workbench", targetId: result?.runId ?? tool, context: { tool, note: note.slice(0, 200) } }),
      });
      if (res.ok) {
        setFeedback("sent");
        showToast(rating === "up" ? "의견 고마워요 — 도움이 된 결과로 기록했어요" : "의견 고마워요 — 아쉬운 점을 다음 판에 반영할게요");
        return;
      }
      setFeedback("idle");
      if (res.status === 401) showToast("로그인이 끝나 의견을 못 보냈어요", { label: "로그인", href: loginHref() });
      else if (res.status === 429) showToast("의견을 너무 자주 보냈어요 — 잠시 뒤 다시 눌러 주세요");
      else showToast("의견을 보내지 못했어요 — 잠시 뒤 다시 눌러 주세요");
    } catch {
      setFeedback("idle");
      showToast("의견을 못 보냈어요 · 인터넷 연결을 확인해 주세요");
    }
  };
  const savePreset = async () => {
    if (!picked || preset !== "idle") return;
    if (!(await hasSession())) {
      showToast("즐겨 쓰는 단지는 로그인하면 저장할 수 있어요", {
        label: "로그인",
        href: `/login?callbackUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      });
      return;
    }
    setPreset("busy");
    try {
      const res = await fetch("/api/ai/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool,
          name: `${picked.name} · ${new Date().toISOString().slice(5, 10)}`,
          objective: { complexId: picked.id, complexName: picked.name, region: picked.region },
        }),
      });
      setPreset(res.ok ? "done" : "idle");
      showToast(
        res.ok
          ? `즐겨 쓰는 단지에 저장했어요 · ${picked.name}`
          : res.status === 401
            ? "로그인이 끝나 저장하지 못했어요 — 다시 로그인해 주세요"
            : "저장하지 못했어요 — 잠시 뒤 다시 눌러 주세요",
      );
    } catch {
      setPreset("idle");
      showToast("저장하지 못했어요 · 인터넷 연결을 확인해 주세요");
    }
  };

  return (
    <details className="card group rounded-2xl p-4">
      <summary className="flex min-h-[40px] cursor-pointer items-center justify-between gap-2 t-body font-bold text-ink">
        자세히 보기
        <span className="t-caption font-bold text-text-3">
          {hideEvidence ? "" : `데이터 출처 ${evidence.length}곳 · `}결과가 달라지는 경우 · 공유
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        <div className={hideEvidence ? "hidden" : ""}>
          <h3 className="t-sub font-bold text-text-1">데이터 출처</h3>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {evidence.map((e) => (
              <li key={e.label} className="flex flex-wrap items-baseline gap-x-2 t-sub text-text-2">
                <b className="font-bold text-text-1">{e.label}</b>
                <span className="break-words">{e.source}</span>
                {ymLabel(e.asOf) && <span className="text-text-3">{ymLabel(e.asOf)}</span>}
                {e.confidence !== "ok" && (
                  <span className="t-caption font-bold text-warning">
                    {e.confidence === "thin" ? "거래 적음 · 참고용" : e.confidence === "stale" ? "오래된 자료" : "자료 부족"}
                  </span>
                )}
                {e.href && (
                  <Link href={e.href} className="inline-flex min-h-[24px] items-center font-bold text-primary no-underline">
                    원본 ›
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {picked && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <MyNotesChip complexId={picked.id} />
            </div>
          )}
        </div>

        {counters.length > 0 && (
          <div>
            <h3 className="t-sub font-bold text-text-1">결과가 달라지는 경우</h3>
            <ul className="mt-1.5 flex flex-col gap-1">
              {counters.map((c, i) => (
                <li key={i} className="t-sub text-text-2">· {c}</li>
              ))}
            </ul>
          </div>
        )}

        {ctx.news?.items?.length ? (
          <div>
            <h3 className="t-sub font-bold text-text-1">관련 뉴스</h3>
            <ul className="mt-1.5 flex flex-col gap-1">
              {ctx.news.items.slice(0, 3).map((n) => (
                <li key={n.id}>
                  <Link href={`/town/news/${n.id}`} className="inline-flex min-h-[24px] items-center break-words t-sub font-bold text-text-1 no-underline">
                    · {n.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {ctx.notes && ctx.notes.count > 0 && (
          <div>
            <h3 className="t-sub font-bold text-text-1">이웃 임장노트</h3>
            <p className="mt-1 t-sub text-text-2">
              {ctx.notes.count}건{ctx.notes.avgScore != null ? ` · 평균 ${ctx.notes.avgScore}점(5점 만점)` : ""}
              {ctx.notes.latest && (
                <Link href={`/notes/${ctx.notes.latest.id}`} className="ml-2 inline-flex min-h-[24px] items-center font-bold text-primary no-underline">
                  최신 노트 보기 ›
                </Link>
              )}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-line pt-3">
          {result?.ok && result.usage && (
            <p className="t-caption text-text-3">
              {freeQuotaLabel(result.usage.used, result.usage.limit, result.usage.lifetime)}
              {result.usage.limit != null && (
                <>
                  {" · "}
                  <Link
                    href={result.usage.lifetime ? weeklyPassCheckoutHref(typeof window !== "undefined" ? window.location.pathname + window.location.search : null) : "/subscription"}
                    className="inline-flex min-h-[24px] items-center font-bold text-primary no-underline"
                  >
                    {result.usage.lifetime ? "주간권 1,100원으로 더 쓰기 ›" : "더 필요하면 플러스 ›"}
                  </Link>
                </>
              )}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {shareUrl && (
              <button
                type="button"
                onClick={() => void copy(`${location.origin}${shareUrl}`)}
                className="btn-secondary btn-md gap-1.5 px-3 t-sub"
              >
                {copied ? (
                  <span className="njn-pop-once inline-flex text-primary" aria-hidden="true">
                    <Icon name="check" size={14} />
                  </span>
                ) : (
                  <Icon name="link" size={14} />
                )}
                {copied ? "복사했어요" : "결과 링크 복사"}
              </button>
            )}
            {picked && (
              <button
                type="button"
                onClick={() => void savePreset()}
                disabled={preset !== "idle"}
                aria-busy={preset === "busy" || undefined}
                className="btn-secondary btn-md gap-1.5 px-3 t-sub"
              >
                {preset === "busy" ? (
                  <span className="njn-ring njn-ring--ink" aria-hidden="true" />
                ) : preset === "done" ? (
                  <span className="njn-pop-once inline-flex text-primary" aria-hidden="true">
                    <Icon name="check" size={14} />
                  </span>
                ) : (
                  <Icon name="star" size={14} />
                )}
                {preset === "done" ? "즐겨 쓰는 단지에 저장됨" : preset === "busy" ? "저장하는 중" : "이 단지 즐겨 쓰기"}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 t-sub text-text-2">
            {feedback === "sent" ? (
              "의견 고마워요 — 다음 판에 반영할게요."
            ) : (
              <>
                <span className="font-bold">이 결과가 도움이 됐나요?</span>
                <button type="button" aria-label="도움 됐어요" aria-busy={feedback === "busy"} disabled={feedback === "busy"} onClick={() => void sendFeedback("up")} className="btn-secondary btn-md px-3 disabled:opacity-60">
                  <Icon name="thumbs-up" size={16} />
                </button>
                <button type="button" aria-label="아쉬워요" aria-busy={feedback === "busy"} disabled={feedback === "busy"} onClick={() => void sendFeedback("down")} className="btn-secondary btn-md px-3 disabled:opacity-60">
                  <Icon name="thumbs-down" size={16} />
                </button>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="한 줄 이유(선택)"
                  aria-label="한 줄 이유"
                  className="min-h-[40px] w-full min-w-0 max-w-[220px] rounded-lg border border-line bg-surface px-2.5 t-sub"
                />
              </>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}

/* ── [1021] 근거 · 출처 카드(단지 분석 4종) — evidence 행 + 내 임장노트 칩 + 다음 행동 한 줄(next-action-routing) ──
   [1026] 펼친 목록 → <details> 닫힘. 요약 줄 = "근거 N개 · 오래된 자료 N개"(verdict.evidence 의 confidence 만 센다). */

const CONF_WORD: Record<string, string> = { thin: "거래 적음 · 참고용", insufficient: "자료 부족", stale: "오래된 자료" };

function EvidenceCard({ tool, picked, verdict, footnotes }: { tool: AiAnalysisToolId; picked: PickedLite | null; verdict: Verdict | null; footnotes: Footnote[] }) {
  const evidence = verdict?.evidence?.length
    ? verdict.evidence.map((e) => ({ label: e.label, source: e.source, asOf: e.asOf, confidence: e.confidence, href: e.href }))
    : footnotes.map((f) => ({ label: f.label, source: f.source, asOf: f.asOf, confidence: "ok" as const, href: f.href }));
  const next = picked ? verdictNextActions({ tool, verdict, complexId: picked.id, complexName: picked.name, region: picked.region }).secondary : null;
  const evidenceN = evidence.length;
  const staleN = evidence.filter((e) => e.confidence === "stale").length;
  return (
    <details className="card group rounded-2xl p-4 max-md:p-3.5" aria-label="근거 · 출처">
      <summary className="flex min-h-[40px] cursor-pointer flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
        <h2 className="t-body font-bold text-ink">근거 · 출처</h2>
        <span className="t-caption tabular-nums text-text-3">{`근거 ${evidenceN}개 · 오래된 자료 ${staleN}개`}</span>
      </summary>
      {evidence.length > 0 ? (
        <ul className="mt-2 flex flex-col divide-y divide-line" data-tone="plain">
          {evidence.map((e) => (
            <li key={e.label} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 t-sub">
              <span className="min-w-0 font-bold text-ink break-words">{e.label}</span>
              <span className="flex flex-wrap items-baseline gap-x-1.5 t-caption text-text-3">
                <span className="break-words">{e.source}</span>
                {ymLabel(e.asOf) && <span>· {ymLabel(e.asOf)}</span>}
                {e.confidence !== "ok" && CONF_WORD[e.confidence] && <span className="font-bold text-warning">· {CONF_WORD[e.confidence]}</span>}
                {e.href && (
                  <Link href={e.href} className="inline-flex min-h-[24px] items-center font-bold text-primary no-underline">
                    원본 ›
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 t-sub text-text-3">데이터 출처가 아직 없어요.</p>
      )}
      {(picked || next) && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
          <span className="flex flex-wrap gap-1.5">{picked && <MyNotesChip complexId={picked.id} />}</span>
          {next && (
            <Link href={next.href} className="inline-flex min-h-[24px] items-center t-sub font-bold text-primary no-underline">
              {next.label} ›
            </Link>
          )}
        </div>
      )}
    </details>
  );
}

/* ── 본체 ─────────────────────────────────────────────────────────── */

export function ResultView({
  tool,
  picked,
  ctx,
  verdict,
  insight,
  footnotes,
  series,
  similar,
  result,
  compareTray,
  running,
  askedLlm,
  character,
  onPickSimilar,
  onHorizon,
  phoneCondition,
  tuning = null,
}: {
  tool: AiAnalysisToolId;
  picked: PickedLite | null;
  ctx: Ctx;
  verdict: Verdict | null;
  insight: Insight;
  footnotes: Footnote[];
  series: ComplexTradeSeries | null;
  similar: Similar[];
  /** 이 단지로 한 실행 결과(없으면 null) */
  result: RunResult | null;
  /** [1008 · 리뷰 A-3] 비교 도구 — 담은 단지(없으면 null) */
  compareTray?: PickedLite[] | null;
  running: boolean;
  /** 지금 도는 실행이 AI 해설을 요청했나 */
  askedLlm: boolean;
  /** 도구 성격 한 낱말(실행 중 문구) */
  character: string;
  onPickSimilar: (s: Similar) => void;
  /** [1021] 시세 예측 기간 칩 → TuningForm 의 horizonMonths 를 바꾸고 다시 계산(기존 입력·기존 실행) */
  onHorizon?: ((months: string) => void) | null;
  /** [1021] 폰 한 열 순서(타일 → 내 조건 → 근거)를 위해 타일 아래에 놓는 "내 조건" 카드(lg 에서는 레일이 그린다) */
  phoneCondition?: ReactNode;
  /** [1022] 내 조건(TuningForm) 현재 값 — 시세 예측 손익분기 선의 재료(대출 비율·금리·상환 기간). 입력 즉시 선이 움직인다 */
  tuning?: Record<string, string | boolean> | null;
}) {
  /* [1022] 시세 예측 — 강조한 시나리오(부채꼴·해마다 표가 같이 본다) */
  const [scenarioFocus, setScenarioFocus] = useState<ScenarioKey | null>(null);
  /* [1022] 이전 실행 기록 — 종합 진단은 같은 단지, 매수 타이밍은 같은 지역 */
  const metricScore = tool === "ai-diagnosis" && verdict?.metric && /^\d+(\.\d+)?$/.test(verdict.metric.value) ? Number(verdict.metric.value) : null;
  const signalCombo = tool === "ai-timing" ? encodeSignalCombo(countSignals(insight.signals.map((x) => x.state))) : null;
  const historyKey =
    verdict
      ? tool === "ai-diagnosis" && picked
        ? buildGroupKey(tool, [picked.id])
        : tool === "ai-timing" && ctx.region?.name
          ? buildGroupKey(tool, [ctx.region.name])
          : null
      : null;
  const history = useRunHistory(tool, historyKey, {
    score: metricScore,
    oneLine: signalCombo,
    headline: verdict?.headline ?? null,
    createdAt: verdict?.computedAt ?? null,
  });
  const external = Boolean(result?.ok && result.source && result.source !== "internal" && result.source !== "stub");
  const hasComplex = Boolean(picked && ctx.complex);
  const at = result?.at ? new Date(result.at) : null;
  const checklist = useChecklistState(tool === "my-checklist" ? (picked?.id ?? null) : null);

  const failure = result && !result.ok && (
    <div className="card flex flex-col gap-2.5 rounded-2xl p-4" role="status">
      {result.code === "QUOTA_EXCEEDED" ? (
        <>
          <p className="t-section font-bold text-ink">{result.error ?? "무료 AI 해설을 모두 사용했어요."}</p>
          <p className="t-body text-text-2">
            {/* [1004 · 리뷰] "한도 없이"는 사실이 아니다 — 주간권은 plan=pro 라 AI 분석 월 50회(access.ts ai_analysis) */}
            플러스 주간권은 <b className="text-ink">1,100원으로 7일 동안</b> 이 도구 12종을 월 50회까지 쓸 수 있어요. 자동 갱신
            없는 1회 결제예요.
          </p>
          <Link
            href={weeklyPassCheckoutHref(typeof window !== "undefined" ? window.location.pathname + window.location.search : null)}
            className="btn-primary btn-md no-underline"
          >
            주간권 1,100원으로 계속하기
          </Link>
          <Link href="/subscription" className="inline-flex min-h-[24px] items-center self-center t-sub font-bold text-text-3 no-underline">
            월간 2,900원 · 다른 플랜 보기 ›
          </Link>
        </>
      ) : result.code === "LOGIN_REQUIRED" ? (
        <p className="t-body font-bold text-text-1">
          AI 해설은 로그인하면 받을 수 있어요.{" "}
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search : "/analysis")}`}
            className="inline-flex min-h-[24px] items-center font-bold text-primary no-underline"
          >
            로그인 ›
          </Link>
        </p>
      ) : (
        <p className="t-body font-bold text-danger">{result.error ?? "실행하지 못했어요 — 잠시 뒤 다시 눌러 주세요."}</p>
      )}
    </div>
  );

  const narrative = (
    <>
      {running && askedLlm && (
        <Card title="AI 해설" id="ai-narrative">
          <p className="flex items-center gap-2 t-sub text-text-2" aria-live="polite">
            <span className="njn-dot njn-dot--breathe" aria-hidden="true" />
            {character} 결과를 문장으로 정리하는 중이에요…
          </p>
        </Card>
      )}
      {!running && external && result?.markdown && (
        <Card title="AI 해설" sub="[AI 서술] · 외부 AI 모델이 쓴 문장" id="ai-narrative">
          <MdLite text={result.markdown} />
          <p className="t-caption text-text-3">숫자의 기준은 위 결과 요약·데이터 출처 · AI 문장은 틀릴 수 있음</p>
        </Card>
      )}
      {!running && result?.ok && result.askedLlm && !external && (
        <p className="rounded-lg bg-bg px-3.5 py-2.5 t-sub text-text-2">
          AI 해설을 지금 받지 못해 공공데이터 자동 계산 결과만 표시. 잠시 뒤 다시 눌러 주세요.
        </p>
      )}
    </>
  );

  /* ── [1021 → 1026 → 1026b] 12종 한 순서 ─────────────────────────────────────── */
  /* [1026] 결론 히어로(대표 그림 카드 첫 줄) → 그림 → KPI 4칸 → (폰) 내 조건 → 세부(접힘). 다음 행동은 레일 액션 카드·폰 하단 바
     [1026b] 나머지 8종 히어로 = ToolSignature(결론 + 판정 칩 + 대표 수치 + 대표 그림) · 비교의 함께 볼 단지는 손잡이 자리 */
  const tiles = verdict?.tiles ?? [];
  const sources = verdict ? verdictSources(verdict) : null;
  const asOf = ymLabel(verdict?.metric?.asOf ?? tiles.find((t) => t.asOf)?.asOf ?? null);
  const scenario = tool === "ai-prediction" ? (verdict?.scenario ?? null) : null;
  /* [1022] 비용 포함 손익분기 — 내 조건에 대출 비율·금리가 있을 때만(scenario-breakeven 이 null 이면 선 없음) */
  const breakEven =
    scenario && tuning
      ? scenarioBreakEven({ startKrw: scenario.startKrw, years: scenario.years, ltvPct: tuning.ltvPct, ratePct: tuning.mortgageRatePct, termYears: tuning.loanTermYears })
      : null;
  const historyLine =
    tool === "ai-diagnosis"
      ? scoreHistoryLine(history, { score: metricScore, createdAt: verdict?.computedAt ?? null })
      : tool === "ai-timing"
        ? signalHistoryLine(history, verdict?.computedAt ?? null)
        : null;
  /* [1026] 결론 아래 두 줄 — 다음 행동 한 줄(가장 약한 축/신호 → 이어서 볼 도구) · 다른 도구 칩 줄(판정 배지) */
  const cid = hasComplex && picked ? picked.id : null;
  const next = verdict
    ? conclusionNext({
        tool,
        complexId: cid,
        radar: insight.radar,
        signals: insight.signals,
        annualBasePct: scenario?.annual.base ?? null,
        similarCount: similar.length,
      })
    : null;
  /* [1026b] 다른 도구 칩 줄 — 대상이 여럿인 비교·자산 구성은 세우지 않는다(예전 보드와 같은 규칙) */
  const tools =
    hasComplex && picked && tool !== "ai-compare" && tool !== "ai-portfolio" ? (
      <VerdictChips tool={tool} complexId={picked.id} complexName={picked.name} region={picked.region} verdict={verdict} />
    ) : null;
  /* 결론 머리의 "{단지명}: " 은 걷는다 — 바로 위 단지 줄·절차 한 줄이 이미 말한다(보드 칸과 같은 규칙, 문장은 그대로) */
  const namePrefix = picked ? `${picked.name}: ` : null;
  const heroVerdict =
    verdict && namePrefix && verdict.headline.startsWith(namePrefix) ? { ...verdict, headline: verdict.headline.slice(namePrefix.length) } : verdict;
  const metricAside = (() => {
    const c = verdict ? metricExplain(verdict) : null;
    return c ? <Explain {...c} /> : null;
  })();
  /* [1026b] 8종 대표 그림 — 도구가 이미 그리던 것만(갭·경제지표·자산 구성은 대표 수치가 그림 자리) */
  const figure =
    tool === "ai-risk" && insight.checks && insight.checks.length > 0 ? (
      <SigFigure title="위험 신호 5가지" sub="걸리면 주의 · 자료 없음은 '위험 없음'이 아니에요">
        <RiskChecklist checks={insight.checks} />
      </SigFigure>
    ) : tool === "contract-risk" && verdict?.contract ? (
      <ContractCard contract={verdict.contract} />
    ) : tool === "ai-simulator" ? (
      <LoanCard loan={verdict?.loan ?? null} />
    ) : tool === "my-checklist" && verdict?.checklist ? (
      <ChecklistCard groups={verdict.checklist} checked={checklist.checked} onToggle={checklist.toggle} />
    ) : tool === "ai-compare" && compareTray && compareTray.length >= 2 ? (
      <CompareTable tray={compareTray} currentId={picked?.id ?? null} currentVerdict={verdict} />
    ) : null;
  return (
    <div className="flex flex-col gap-3">
      {failure}
      {/* ① 결론 히어로 + 대표 그림 */}
      {tool === "ai-diagnosis" && (
        <DiagnosisSignature
          verdict={heroVerdict}
          radar={insight.radar}
          asOf={asOf}
          complexId={cid}
          historyLine={historyLine}
          next={next}
          tools={tools}
          metricAside={metricAside}
        />
      )}
      {tool === "ai-prediction" && (
        <PredictionSignature
          verdict={heroVerdict}
          scenario={scenario}
          onHorizon={onHorizon}
          asOf={asOf}
          focus={scenarioFocus}
          onFocus={setScenarioFocus}
          breakEven={breakEven}
          next={next}
          tools={tools}
        />
      )}
      {tool === "ai-timing" && (
        <TimingSignature verdict={heroVerdict} signals={insight.signals} series={series} asOf={asOf} historyLine={historyLine} next={next} tools={tools} />
      )}
      {tool === "ai-inspection" && picked && (
        <InspectionSignature
          picked={picked}
          similar={similar}
          recent6={series?.recent6 ?? null}
          onPick={onPickSimilar}
          verdict={heroVerdict}
          asOf={asOf}
          next={next}
          tools={tools}
        />
      )}
      {!isFrameTool(tool) && heroVerdict && (
        <ToolSignature
          verdict={heroVerdict}
          asOf={asOf}
          label="결론"
          tools={tools}
          metricAside={metricAside}
          hideMetric={(tool === "my-checklist" && Boolean(verdict?.checklist)) || (tool === "ai-compare" && Boolean(compareTray && compareTray.length >= 2))}
        >
          {figure}
        </ToolSignature>
      )}
      {!verdict && <p className="card rounded-2xl p-4 t-body text-text-2">결과를 만들 자료가 아직 없어요.</p>}

      {/* ② KPI 4칸(한 줄) + 출처·기준 한 줄 */}
      {tiles.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <VerdictTiles
            tiles={tiles}
            tileAside={(t) => {
              const c = tileExplain(t);
              return c ? <Explain {...c} size={12} /> : null;
            }}
          />
          <p className="t-caption text-text-3 break-words">
            {sources ? `출처 ${sources} · ` : ""}공공데이터 자동 계산{asOf ? ` · 기준 ${asOf}` : ""}
            {result?.ok && at && (result.appliedCalc || external)
              ? ` · ${result.appliedCalc ? "내 조건 반영 · " : ""}${at.getHours()}:${String(at.getMinutes()).padStart(2, "0")} 계산`
              : ""}
          </p>
        </div>
      )}

      {/* 폰 한 열: 결론 → 그림 → 손잡이(내 조건, 접이식) → 세부 */}
      {phoneCondition && <div className="lg:hidden">{phoneCondition}</div>}

      {/* [1026b] 비교 — 함께 비교해 볼 단지(누르면 비교에 담는다 · 손잡이) */}
      {tool === "ai-compare" && similar.length > 0 && picked && (
        <Card title="함께 비교해 볼 단지" sub="같은 지역 · 최근 6개월 거래 많은 순 · 최대 3곳">
          <RouteList picked={picked} similar={similar} onPick={onPickSimilar} />
        </Card>
      )}

      {/* 시세 예측 — 해마다 표 · 가정 */}
      {scenario && <ScenarioTables scenario={scenario} startLabel={series?.label ?? ctx.complex?.price?.bandLabel ?? null} focus={scenarioFocus} />}

      {/* ③ AI 해설(받았을 때만) */}
      {narrative}

      {/* ④ 이 단지 실거래 흐름 — 데스크톱 펼침·폰 닫힘 · 임장 동선: 닫힘(예측은 위 부채꼴이 시나리오라 여기선 과거만) · 체크리스트는 없음 */}
      {hasComplex && tool !== "my-checklist" && (
        <PriceFlowCard
          tool={tool === "ai-prediction" ? "ai-diagnosis" : tool}
          series={series}
          verdict={verdict}
          hasPrice={Boolean(ctx.complex?.price)}
          failed={Boolean(ctx.unavailable?.includes("실거래가"))}
          fold={tool === "ai-inspection" ? "closed" : "wide"}
        />
      )}

      {/* ⑤ 근거 · 출처(닫힘) + 단지 홈 링크 */}
      <EvidenceCard tool={tool} picked={hasComplex ? picked : null} verdict={verdict} footnotes={footnotes} />

      {/* ⑥ 자세히 보기 — 출처는 위 카드가 말했다 */}
      <Details
        tool={tool}
        picked={hasComplex ? picked : null}
        verdict={verdict}
        footnotes={footnotes}
        counters={verdict?.counters?.length ? verdict.counters : insight.counters}
        ctx={ctx}
        result={result}
        hideEvidence
      />
    </div>
  );
}
