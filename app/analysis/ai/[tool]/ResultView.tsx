"use client";

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
import { verdictNextActions, verdictNoteMemo } from "@/lib/ai/next-action-routing";
import { addToCompareTray } from "@/lib/newui/compare-tray";
import { hasSession } from "@/lib/client/has-session";
import { freeQuotaLabel, weeklyPassCheckoutHref } from "@/lib/payments/paywall-links";
import { useCopy } from "@/lib/ui/use-copy";
import { PriceHistoryChart } from "@/app/components/viz/PriceHistoryChart";
import { ScoreRadar } from "@/app/components/viz/ScoreRadar";
import { Icon } from "@/app/components/Icon";
import { Explain } from "@/app/components/explain/Explain";
import { Delta } from "@/app/components/num/Delta";
import { useToast } from "@/app/components/toast/ToastProvider";
import { VerdictCard, ymLabel } from "./VerdictCard";
import { MyNotesChip } from "./VerdictBoard";
import { tileDisplay } from "./verdict-display";
import { metricExplain, tileExplain } from "./verdict-explain";
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
        if (t.startsWith("> ")) return <div key={i} className="rounded-[10px] bg-warning-soft px-3 py-2 t-sub font-bold text-warning">{t.slice(2)}</div>;
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
        <h2 className="t-section font-extrabold text-ink">{title}</h2>
        {sub && <span className="t-caption text-text-3">{sub}</span>}
      </div>
      {children}
    </section>
  );
}

/* ── 도구별 주인공 그림 ─────────────────────────────────────────────── */

const LIGHT_WORD = { green: "사는 쪽에 유리", yellow: "보통", red: "파는 쪽에 유리", na: "자료 없음" } as const;
const LIGHT_BG = { green: "bg-success", yellow: "bg-warning", red: "bg-danger" } as const;

/** 매수 타이밍 — 신호등 3개(빨강·노랑·초록 중 켜진 것) + 왜 한 줄 */
function SignalLights({ signals }: { signals: Insight["signals"] }) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {signals.map((s) => (
        <li key={s.key} className="flex flex-col gap-1.5 rounded-[12px] bg-bg px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="t-body font-extrabold text-ink">{s.label}</span>
            <span className="flex items-center gap-1 rounded-full bg-surface px-1.5 py-1" aria-hidden="true">
              {(["red", "yellow", "green"] as const).map((c) => (
                <span key={c} className={`h-3 w-3 rounded-full ${LIGHT_BG[c]} ${s.state === c ? "" : "opacity-20"}`} />
              ))}
            </span>
          </div>
          <span
            className={`t-sub font-extrabold ${s.state === "green" ? "text-success" : s.state === "red" ? "text-danger" : s.state === "yellow" ? "text-warning" : "text-text-3"}`}
          >
            {LIGHT_WORD[s.state]}
          </span>
          <span className="t-sub text-text-2">{s.basis}</span>
        </li>
      ))}
    </ul>
  );
}

const CHECK_META = {
  pass: { icon: "check", cls: "text-success", word: "통과" },
  warn: { icon: "warning", cls: "text-danger", word: "주의" },
  info: { icon: "help", cls: "text-warning", word: "참고" },
  na: { icon: "circle", cls: "text-text-3", word: "자료 없음" },
} as const;

/** 리스크 점검 — 5가지 체크리스트(통과·주의·참고·자료 없음) */
function RiskChecklist({ checks }: { checks: NonNullable<Insight["checks"]> }) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {checks.map((c) => {
        const m = CHECK_META[c.status];
        return (
          <li key={c.key} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
            <span className={`mt-0.5 shrink-0 ${m.cls}`}>
              <Icon name={m.icon} size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="t-body font-extrabold text-ink">
                  {c.label} <span className={`t-sub font-extrabold ${m.cls}`}>{m.word}</span>
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

/** 종합 진단 — 레이더 + 항목별 막대와 한 줄 이유 */
function ScoreBreakdown({ radar }: { radar: Insight["radar"] }) {
  return (
    <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[300px_minmax(0,1fr)]">
      <ScoreRadar items={radar} />
      <ul className="flex flex-col gap-2.5">
        {radar.map((a) => (
          <li key={a.key} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="w-[68px] shrink-0 t-sub font-extrabold text-text-1">{a.label}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
                {a.score != null && <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(3, a.score)}%` }} />}
              </span>
              <span className="w-[52px] shrink-0 text-right t-sub font-extrabold tabular-nums text-ink">
                {a.score != null ? `${a.score}점` : "—"}
              </span>
            </div>
            <span className="pl-[76px] t-caption text-text-3">{a.basis}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 임장 동선 — 이 단지 + 같은 지역 거래 많은 단지(최근 6개월) 순서 */
function RouteList({ picked, similar, onPick }: { picked: PickedLite; similar: Similar[]; onPick: (s: Similar) => void }) {
  const max = Math.max(1, ...similar.map((s) => s.txCount));
  return (
    <ol className="flex flex-col gap-2">
      <li className="flex items-center gap-3 rounded-[12px] bg-primary-soft px-3 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary t-sub font-extrabold text-white">1</span>
        <span className="min-w-0 flex-1 break-words t-body font-extrabold text-ink">{picked.name}</span>
        <span className="shrink-0 t-caption font-bold text-primary">지금 보는 단지</span>
      </li>
      {similar.map((s, i) => (
        <li key={s.id} className="flex items-center gap-3 rounded-[12px] bg-bg px-3 py-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line-strong t-sub font-extrabold text-text-1">
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
    <Card title="계약 전에 확인할 것" sub={contract.ratioSource === "region" ? "전세가율은 지역 평균 — 이 집 값을 넣으면 다시 계산" : "② 에 넣은 값으로 계산"}>
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
          <b className="text-ink">{formatKrwWon(contract.saleEstimateMan * 10_000, { style: "short" })}</b>이에요 — 실거래가와 견줘 보세요.
        </p>
      )}
      <div className="flex flex-col gap-1.5 rounded-[12px] bg-bg px-3 py-3">
        <h3 className="t-sub font-extrabold text-text-1">계약서 특약·챙길 일</h3>
        <ul className="flex flex-col gap-1">
          {contract.clauses.map((c, i) => (
            <li key={i} className="t-sub text-text-2">
              · {c}
            </li>
          ))}
        </ul>
      </div>
      <p className="t-caption text-text-3">
        일반 정보예요(법률 자문 아님). 전입신고·확정일자의 효력은 주택임대차보호법 제3조(대항력)·제3조의2(우선변제)에 따라요.
      </p>
    </Card>
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
      <Card title="대출 계산">
        <p className="t-sub text-text-2">② 에 대출 비율과 금리를 넣고 다시 계산하면 대출액·월 상환액·이자가 여기에 나와요.</p>
      </Card>
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
        <Explain term="ltv" how="기준 가격 × 대출 비율(② 에 넣은 값)이에요." source="입력값 계산" />
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
    <Card title="대출 계산" sub="원리금균등 상환">
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5">
        {rows.map(([k, v], i) => (
          <div key={i} className="contents">
            <dt className="t-sub text-text-2">{k}</dt>
            <dd className="text-right t-sub font-extrabold tabular-nums text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {loan.yields && loan.holdingYears != null ? (
        <div className="flex flex-col gap-1.5 rounded-[12px] bg-bg px-3 py-3">
          <h3 className="t-sub font-extrabold text-text-1">{loan.holdingYears}년 뒤 팔면 — 넣은 돈 대비 연 수익률(가정)</h3>
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
            가격 가정은 시세 예측과 같은 낙관·기본·비관 시나리오예요.
          </p>
        </div>
      ) : (
        <p className="t-sub text-text-2">② 에 보유 기간을 넣으면 그 기간 뒤 팔았을 때의 연 수익률(가정)도 계산해요.</p>
      )}
      <p className="t-caption text-text-3">
        {loan.termAssumed ? "상환 기간을 비워 30년으로 계산했어요. " : ""}취득세·중개보수·보유세·임대료는 넣지 않았어요 — 실제 부담은 더 커요.
      </p>
    </Card>
  );
}

/* ── [1008 · 리뷰 A-3] 투자 체크리스트 — 확인할 항목(체크 상태는 이 기기에만 저장) ─────────────── */

function checklistKey(complexId: string | null) {
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
  return (
    <Card title={`확인할 항목 ${total}개`} sub={`완료 ${done}/${total} · 체크는 이 기기에 저장돼요`}>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
        {groups.map((g) => (
          <fieldset key={g.title} className="flex flex-col gap-0.5">
            <legend className="mb-1 t-sub font-extrabold text-text-1">{g.title}</legend>
            {g.items.map((it) => (
              <label key={it.id} className="flex min-h-[40px] items-center gap-2.5 rounded-[10px] px-1 t-sub text-text-1">
                <input type="checkbox" className="h-5 w-5 shrink-0" checked={checked.has(it.id)} onChange={() => onToggle(it.id)} />
                <span className={checked.has(it.id) ? "text-text-3 line-through" : ""}>{it.label}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
    </Card>
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
    <Card title="나란히 비교" sub="기준일·출처는 자세히 보기">
      {/* relative — 칸 안 <Delta> 의 sr-only 가 가로 스크롤 상자를 벗어나 문서 폭을 늘리지 않게 */}
      <div className="relative overflow-x-auto">
        <table className="w-full table-fixed border-collapse t-sub">
          <thead>
            <tr>
              <th scope="col" className="w-[30%] pb-2 text-left t-caption font-bold text-text-3">항목</th>
              {tray.map((c) => (
                <th key={c.id} scope="col" className="break-words pb-2 text-left font-extrabold text-ink">
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
                  <td key={c.id} className="py-2 font-extrabold text-ink">
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
                      <span className="break-words font-extrabold tabular-nums text-ink">
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
    </Card>
  );
}

/* ── 실거래 흐름 카드 ──────────────────────────────────────────────── */

function PriceFlowCard({
  tool,
  series,
  verdict,
  hasPrice,
  failed,
}: {
  tool: AiAnalysisToolId;
  series: ComplexTradeSeries | null;
  verdict: Verdict | null;
  hasPrice: boolean;
  /** [1008 · 리뷰 A-9] 매매 조회가 실패했다 — "거래 없음"과 다르다 */
  failed: boolean;
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
    "점선: 거래가 없거나 적은 달을 건너뛴 자리예요(빈 달을 지어내 잇지 않아요).",
    ...(scenario ? [`시나리오: ${scenarioAssumptionLine(scenario)}`] : []),
    "그래프를 누른 채 좌우로 움직이면(마우스는 올리기만 해도) 그 달 값이 위 큰 숫자에 나와요.",
  ];
  return (
    <Card
      title={title}
      sub={
        months.length > 0 ? (
          <span className="inline-flex items-center gap-0.5">
            읽는 법
            <Explain title="그래프 읽는 법" how={readHow} source={`국토교통부 실거래(신고) · ${range}`} />
          </span>
        ) : undefined
      }
    >
      {months.length > 0 ? (
        <>
          <PriceHistoryChart
            months={months}
            label={series?.label ?? null}
            basis={series?.basis ?? "unit"}
            scenario={scenario ? { startKrw: scenario.startKrw, years: scenario.years, path: scenario.path } : null}
          />
          {series?.sparse && (
            <p className="rounded-[10px] bg-bg px-3 py-2 t-sub text-text-2">
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
        <p className="rounded-[10px] bg-bg px-3 py-3 t-sub text-text-2">
          {failed || hasPrice
            ? "그래프 자료를 지금은 불러오지 못했어요. 잠시 뒤 다시 열어 주세요."
            : "이 단지는 최근 매매 실거래가 없어 그래프를 그리지 않았어요."}
        </p>
      )}
    </Card>
  );
}

/* ── 다음 할 일(최대 3개) ─────────────────────────────────────────── */

function NextActions({
  tool,
  coreTool,
  picked,
  verdict,
  fallback,
  checklistItems,
}: {
  tool: AiAnalysisToolId;
  coreTool: boolean;
  picked: PickedLite | null;
  verdict: Verdict | null;
  /** 단지가 없는 도구(경제 모니터·계약 점검) — 도구가 정한 다음 행동 하나 */
  fallback: { label: string; href: string };
  /** 투자 체크리스트 — 결과 목록을 노트 고려사항으로 옮긴다 */
  /** [1008 · 리뷰 A-3] 투자 체크리스트 — 아직 체크하지 않은 항목(노트 고려사항으로 옮긴다) */
  checklistItems?: string[] | null;
}) {
  const [watch, setWatch] = useState<"idle" | "busy" | "done" | "login" | "fail">("idle");
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
      else if (next === "fail") showToast("담지 못했어요 — 연결이 잠시 불안정해요. 다시 눌러 주세요");
    } catch {
      setWatch("fail");
      showToast("담지 못했어요 — 인터넷 연결을 확인하고 다시 눌러 주세요");
    }
  }, [picked, watch, showToast]);

  if (!picked) {
    return (
      <div className="flex flex-wrap gap-2" aria-label="다음 할 일">
        <Link href={fallback.href} className="tool-fill press btn-md no-underline">
          {fallback.label} ›
        </Link>
      </div>
    );
  }
  /* 1순위 — 결론·핵심 숫자가 메모 초안으로 들어가는 노트 링크(핵심 4종 규칙, 나머지 도구도 같은 초안) */
  const noteHref = (() => {
    if (coreTool) return verdictNextActions({ tool, verdict, complexId: picked.id, complexName: picked.name, region: picked.region }).primary.href;
    const qs = new URLSearchParams({ apt: picked.name, region: picked.region, complexId: picked.id });
    if (verdict) qs.set("memo", verdictNoteMemo({ tool, verdict }));
    return `/notes/new?${qs.toString()}`;
  })();
  const loginHref = `/login?callbackUrl=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search : "/analysis")}`;
  return (
    <div className="flex flex-col gap-2" aria-label="다음 할 일">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {tool === "my-checklist" && checklistItems && checklistItems.length > 0 ? (
          <Link
            href={`${noteHref}&fromChecklist=1`}
            onClick={() => {
              /* [AI-24] 아직 체크하지 않은 항목(최대 10개)을 노트 고려사항으로 이관 */
              try {
                const items = checklistItems.filter((l) => l.length >= 4 && l.length <= 60).slice(0, 10);
                if (items.length) window.localStorage.setItem("nz_ai_checklist", JSON.stringify({ at: Date.now(), items }));
              } catch {
                /* 저장 실패해도 이동은 그대로 */
              }
            }}
            className="tool-fill press btn-md gap-1.5 no-underline"
          >
            <Icon name="notebook-pen" size={16} /> 체크리스트로 노트 시작
          </Link>
        ) : (
          <Link href={noteHref} className="tool-fill press btn-md gap-1.5 no-underline">
            <Icon name="notebook-pen" size={16} /> 이 단지 임장노트 쓰기
          </Link>
        )}
        {watch === "login" ? (
          <Link href={loginHref} className="btn-secondary btn-md gap-1.5 no-underline">
            <Icon name="heart" size={16} /> 로그인하고 담기
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => void addWatch()}
            disabled={watch === "busy" || watch === "done"}
            aria-busy={watch === "busy" || undefined}
            className="btn-secondary btn-md gap-1.5"
          >
            {watch === "busy" ? (
              <span className="njn-ring njn-ring--ink" aria-hidden="true" />
            ) : watch === "done" ? (
              /* 담긴 순간 체크가 한 번 튄다(njn-pop-once — 모션 최소화면 globals.css 가 끈다) */
              <span className="njn-pop-once inline-flex text-primary" aria-hidden="true">
                <Icon name="check" size={16} />
              </span>
            ) : (
              <Icon name="heart" size={16} />
            )}
            {watch === "done" ? "관심 단지에 담았어요" : watch === "busy" ? "담는 중" : watch === "fail" ? "다시 담기" : "관심 단지 담기"}
          </button>
        )}
        <Link
          href="/analysis/compare"
          onClick={() => {
            const r = addToCompareTray({ id: picked.id, name: picked.name, region: picked.region });
            showToast(
              r.ok
                ? `${picked.name}을(를) 비교함에 담았어요`
                : r.reason === "full"
                  ? "비교함이 가득 찼어요 · 최대 5곳이에요"
                  : "이 브라우저에서는 비교함을 쓸 수 없어요(저장 공간이 막혀 있어요)",
            );
          }}
          className="btn-secondary btn-md gap-1.5 no-underline"
        >
          <Icon name="scale" size={16} /> 다른 단지와 비교
        </Link>
      </div>
      {/* 예전엔 노트 버튼의 title= 말풍선(마우스를 올려야만 보임)에만 있던 설명 — 휴대폰에도 보이게 */}
      <p className="t-caption text-text-3">임장노트에는 이 결과의 결론과 핵심 숫자가 메모 초안으로 들어가요.</p>
    </div>
  );
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
}: {
  tool: AiAnalysisToolId;
  picked: PickedLite | null;
  verdict: Verdict | null;
  footnotes: Footnote[];
  counters: string[];
  ctx: Ctx;
  result: RunResult | null;
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
      <summary className="flex min-h-[40px] cursor-pointer items-center justify-between gap-2 t-body font-extrabold text-ink">
        자세히 보기
        <span className="t-caption font-bold text-text-3">데이터 출처 {evidence.length}곳 · 결과가 달라지는 경우 · 공유</span>
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        <div>
          <h3 className="t-sub font-extrabold text-text-1">데이터 출처</h3>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {evidence.map((e) => (
              <li key={e.label} className="flex flex-wrap items-baseline gap-x-2 t-sub text-text-2">
                <b className="font-extrabold text-text-1">{e.label}</b>
                <span className="break-words">{e.source}</span>
                {ymLabel(e.asOf) && <span className="text-text-3">{ymLabel(e.asOf)}</span>}
                {e.confidence !== "ok" && (
                  <span className="t-caption font-extrabold text-warning">
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
            <h3 className="t-sub font-extrabold text-text-1">결과가 달라지는 경우</h3>
            <ul className="mt-1.5 flex flex-col gap-1">
              {counters.map((c, i) => (
                <li key={i} className="t-sub text-text-2">· {c}</li>
              ))}
            </ul>
          </div>
        )}

        {ctx.news?.items?.length ? (
          <div>
            <h3 className="t-sub font-extrabold text-text-1">관련 뉴스</h3>
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
            <h3 className="t-sub font-extrabold text-text-1">이웃 임장노트</h3>
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
                  className="min-h-[40px] w-full min-w-0 max-w-[220px] rounded-[10px] border border-line bg-surface px-2.5 t-sub"
                />
              </>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}

/* ── 본체 ─────────────────────────────────────────────────────────── */

export function ResultView({
  tool,
  coreTool,
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
  fallbackAction,
  onPickSimilar,
}: {
  tool: AiAnalysisToolId;
  coreTool: boolean;
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
  fallbackAction: { label: string; href: string };
  onPickSimilar: (s: Similar) => void;
}) {
  const external = Boolean(result?.ok && result.source && result.source !== "internal" && result.source !== "stub");
  const hasComplex = Boolean(picked && ctx.complex);
  const at = result?.at ? new Date(result.at) : null;
  const checklist = useChecklistState(tool === "my-checklist" ? (picked?.id ?? null) : null);
  const uncheckedLabels =
    tool === "my-checklist" && verdict?.checklist
      ? verdict.checklist.flatMap((g) => g.items).filter((i) => !checklist.checked.has(i.id)).map((i) => i.label)
      : null;

  return (
    <div className="flex flex-col gap-3">
      {/* ① 결과 요약 */}
      <div className="card tool-rail flex flex-col gap-2 rounded-2xl p-4">
        {verdict ? (
          <VerdictCard
            verdict={verdict}
            bare
            metricAside={(() => {
              const c = metricExplain(verdict);
              return c ? <Explain {...c} /> : null;
            })()}
            tileAside={(t) => {
              const c = tileExplain(t);
              return c ? <Explain {...c} size={12} /> : null;
            }}
          />
        ) : (
          <p className="t-body text-text-2">결과를 만들 자료가 아직 없어요.</p>
        )}
        {/* [1008 · 리뷰 A-3] "내 조건 반영"은 결과가 쓰는 입력이 실제로 들어갔을 때만 */}
        {result?.ok && at && (result.appliedCalc || external) && (
          <p className="t-caption font-bold text-text-3">
            {result.appliedCalc ? "내 조건 반영 · " : ""}
            {at.getHours()}:{String(at.getMinutes()).padStart(2, "0")} 계산
            {external ? " · 아래에 AI 해설" : ""}
          </p>
        )}
      </div>

      {/* 실행 실패 — 결제·로그인 안내는 방금 결과를 본 이 자리에서 */}
      {result && !result.ok && (
        <div className="card flex flex-col gap-2.5 rounded-2xl p-4" role="status">
          {result.code === "QUOTA_EXCEEDED" ? (
            <>
              <p className="t-section font-extrabold text-ink">{result.error ?? "무료 AI 해설을 모두 사용했어요."}</p>
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
                className="inline-flex min-h-[24px] items-center font-extrabold text-primary no-underline"
              >
                로그인 ›
              </Link>
            </p>
          ) : (
            <p className="t-body font-bold text-danger">{result.error ?? "실행하지 못했어요 — 잠시 뒤 다시 눌러 주세요."}</p>
          )}
        </div>
      )}

      {/* ② 도구의 주인공 그림 */}
      {tool === "ai-diagnosis" && insight.radar.length > 0 && (
        <Card title="5가지 항목 점수" sub="0~100점 · 높을수록 좋아요">
          <ScoreBreakdown radar={insight.radar} />
        </Card>
      )}
      {tool === "ai-timing" && (
        <Card title="지금 사도 될까 — 신호등 3개" sub="지역 단위 흐름 · 매수자 입장">
          <SignalLights signals={insight.signals} />
        </Card>
      )}
      {tool === "ai-risk" && insight.checks && insight.checks.length > 0 && (
        <Card title="위험 신호 5가지" sub="걸리면 주의 · 자료 없음은 '위험 없음'이 아니에요">
          <RiskChecklist checks={insight.checks} />
        </Card>
      )}
      {tool === "contract-risk" && verdict?.contract && <ContractCard contract={verdict.contract} />}
      {tool === "ai-simulator" && <LoanCard loan={verdict?.loan ?? null} />}
      {tool === "my-checklist" && verdict?.checklist && (
        <ChecklistCard groups={verdict.checklist} checked={checklist.checked} onToggle={checklist.toggle} />
      )}
      {tool === "ai-compare" && compareTray && compareTray.length >= 2 && (
        <CompareTable tray={compareTray} currentId={picked?.id ?? null} currentVerdict={verdict} />
      )}
      {tool === "ai-inspection" && picked && (
        <Card title="하루 임장 순서" sub="같은 지역 · 최근 6개월 거래 많은 순">
          {similar.length > 0 ? (
            <RouteList picked={picked} similar={similar} onPick={onPickSimilar} />
          ) : (
            <p className="t-sub text-text-2">같은 지역에 함께 볼 거래 많은 단지가 아직 없어요 — 이 단지에 집중해 보세요.</p>
          )}
          <Link href={`/map?complexId=${encodeURIComponent(picked.id)}`} className="inline-flex min-h-[24px] items-center self-start t-sub font-bold text-primary no-underline">
            지도에서 위치 보기 ›
          </Link>
        </Card>
      )}
      {tool === "ai-compare" && similar.length > 0 && picked && (
        <Card title="함께 비교해 볼 단지" sub="같은 지역 · 최근 6개월 거래 많은 순 · 누르면 비교에 담아요(최대 3곳)">
          <RouteList picked={picked} similar={similar} onPick={onPickSimilar} />
        </Card>
      )}

      {/* 이 단지 실거래 흐름(시세 예측은 시나리오와 같은 축) */}
      {hasComplex && tool !== "my-checklist" && (
        <PriceFlowCard
          tool={tool}
          series={series}
          verdict={verdict}
          hasPrice={Boolean(ctx.complex?.price)}
          failed={Boolean(ctx.unavailable?.includes("실거래가"))}
        />
      )}

      {/* ③ 다음 할 일 */}
      <NextActions
        tool={tool}
        coreTool={coreTool}
        picked={hasComplex ? picked : null}
        verdict={verdict}
        fallback={fallbackAction}
        checklistItems={uncheckedLabels}
      />

      {/* ④ AI 해설 — 외부 모델 서술만 */}
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
          <p className="t-caption text-text-3">숫자는 위 결과 요약·데이터 출처를 기준으로 보세요. AI 문장은 틀릴 수 있어요.</p>
        </Card>
      )}
      {!running && result?.ok && result.askedLlm && !external && (
        <p className="rounded-[10px] bg-bg px-3.5 py-2.5 t-sub text-text-2">
          지금은 AI 해설을 받지 못해 공공데이터 자동 계산 결과만 보여 드려요. 잠시 뒤 다시 눌러 주세요.
        </p>
      )}

      {/* ⑤ 자세히 보기 */}
      <Details
        tool={tool}
        picked={hasComplex ? picked : null}
        verdict={verdict}
        footnotes={footnotes}
        counters={verdict?.counters?.length ? verdict.counters : insight.counters}
        ctx={ctx}
        result={result}
      />
    </div>
  );
}
