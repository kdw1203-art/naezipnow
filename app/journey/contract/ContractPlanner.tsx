"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/app/components/Icon";
import { useToast } from "@/app/components/toast/ToastProvider";
import { Won } from "@/app/components/num/Won";
import { TweenMoney } from "@/app/calculator/TweenMoney";
import { manwonText, shareText, shareTexts } from "@/lib/finance/money";
import {
  buildContractIcs,
  buildContractTimeline,
  contractDateWarnings,
  ddayLabel,
  depositAtTenPercent,
  formatKoreanDay,
  hasCalendarEvents,
  HOLIDAY_YEARS,
  kstToday,
  LAW_CHECKED_ON,
  nextDeadline,
  overdueLegalCount,
  paymentSplit,
  REST_DAY_LAWS,
  REST_DAY_RULE,
  restDayNote,
  type ContractDates,
  type ContractPhase,
  type PaymentSplit,
  type TimelineGroup,
} from "@/lib/journey/contract";
import { isIsoDay, PRICE_MANWON_MAX, withContractPlan, type ContractPlan } from "@/lib/journey/state";
import { updateJourney, useJourney } from "@/lib/journey/client-store";

/* ============================================================
   [1008 · J] 계약·잔금 일정표 — 입력(날짜·매매가) → 날짜순 할 일 + D-day + 캘린더(.ics)·인쇄.

   서버 호출 없이 브라우저에서 계산한다(lib/journey/contract.ts). 저장은 여정 상태의 contract 칸 —
   비회원은 이 기기, 로그인하면 계정(lib/journey/client-store). "오늘"은 마운트 뒤에만 계산한다
   (서버 렌더와 첫 렌더가 같아야 수화가 어긋나지 않는다 — 그 전에는 D-day 를 그리지 않는다). 오늘은 한국 날짜(KST).

   [리뷰 C] 입력칸(날짜 넷·매매가)과 체크·지우기는 계정 진행을 불러오는 동안(ready=false) 막는다 — 불러오는 사이
   적은 값이 계정의 계약일·잔금일·체크를 지우던 경쟁을 입구에서 막는다(저장소도 따로 막는다, lib/journey/sync.ts).
   ============================================================ */

const EMPTY_PLAN: ContractPlan = {
  contractDate: null,
  midDate: null,
  balanceDate: null,
  moveInDate: null,
  priceManwon: null,
  checked: [],
  updatedAt: null,
};

type DateKey = "contractDate" | "midDate" | "balanceDate" | "moveInDate";

const DATE_FIELDS: { key: DateKey; label: string; hint: string }[] = [
  { key: "contractDate", label: "계약일", hint: "계약서에 서명하는 날" },
  { key: "balanceDate", label: "잔금일", hint: "잔금을 보내고 집을 넘겨받는 날" },
  { key: "midDate", label: "중도금일", hint: "있을 때만" },
  { key: "moveInDate", label: "입주일", hint: "잔금일과 다를 때만" },
];

function nowIso(): string {
  return new Date().toISOString();
}

/* 지난 날의 빨강은 법정 기한에만 — 계약 전·계약일 같은 날이 지난 것은 "지남"(흐린 회색)으로.
   이미 계약을 마친 사람에게 "계약 전 확인 3일 지남"을 경고색으로 띄우면 겁만 준다. */
function stateClass(g: TimelineGroup): string {
  if (g.allChecked) return "done";
  if (g.daysLeft === null) return "undated";
  if (g.daysLeft < 0) return g.meta.legal ? "overdue" : "past";
  if (g.daysLeft === 0) return "today";
  return g.daysLeft <= 7 ? "soon" : "later";
}

function ddayText(g: TimelineGroup, st: string): string {
  if (g.allChecked) return "완료";
  if (st === "past") return "지남";
  return g.daysLeft === null ? "" : ddayLabel(g.daysLeft);
}

/** [1009 · T 리뷰] 큰 D-day 를 스크린리더로 읽을 말 — "D-5" 대신 "기한까지 5일 남았어요" */
function ddaySpeech(g: TimelineGroup, st: string): string {
  if (g.allChecked) return "모두 끝냈어요";
  if (g.daysLeft === null) return "";
  if (g.daysLeft < 0) return st === "overdue" ? `법정 기한이 ${-g.daysLeft}일 지났어요` : "기한이 지났어요";
  if (g.daysLeft === 0) return "오늘이 기한이에요";
  return `기한까지 ${g.daysLeft}일 남았어요`;
}

function GroupBadge({ g }: { g: TimelineGroup }) {
  if (g.meta.legal) return <span className="jr-badge jr-badge--legal">법정 기한</span>;
  if (g.meta.suggested) return <span className="jr-badge jr-badge--soft">권장</span>;
  return null;
}

/**
 * 날짜 칸 하나 — 칸에 보이는 글(draft)과 저장값을 따로 둔다.
 * [리뷰 C · date-type4.mjs] 데스크톱 크롬에서 연도를 고쳐 치면 중간값 "0002-11-30"·"0020-11-30"… 이 input 으로 들어온다.
 * 예전엔 그 값을 그대로 저장하려다 정규화가 버려(null) 칸과 저장된 날짜가 통째로 지워졌다. 이제는
 *  - 달력에 있는 날(isIsoDay)일 때만 저장, 완전히 비웠을 때만 지운다.
 *  - 칸 일부만 지운 상태(validity.badInput — 값은 "")와 중간값은 무시한다(저장값을 지우지 않는다).
 *  - 칸을 떠날 때 칸의 글이 저장값과 다르고 틀린 값이면 저장값으로 되돌린다(보이는 것 = 저장된 것).
 */
function DateField({
  label,
  hint,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  hint: string;
  value: string | null;
  disabled: boolean;
  onCommit: (v: string | null) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  /* 저장값이 밖에서 바뀌면(계정에서 불러옴·모두 지우기·다른 탭) 칸을 맞춘다 */
  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="flex flex-col">
        <span className="t-sub font-extrabold text-text-1">{label}</span>
        <span className="t-caption font-semibold text-text-3">{hint}</span>
      </span>
      <input
        type="date"
        value={draft}
        min="2000-01-01"
        max="2100-12-31"
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          if (v === "") {
            if (!e.currentTarget.validity.badInput) onCommit(null);
            return;
          }
          if (isIsoDay(v)) onCommit(v);
        }}
        onBlur={() => {
          if (draft !== (value ?? "") && !isIsoDay(draft)) setDraft(value ?? "");
        }}
        className="jr-input"
      />
    </label>
  );
}

/**
 * [1009 · T] 금액 칸 하나(만원) — 칸에 보이는 글(draft)과 저장값을 따로 둔다(DateField 와 같은 약속).
 * 오른쪽에 넣은 금액을 "8억 5,000만원"으로 읽어 준다 — 0 이 네 개 붙은 숫자를 세지 않게.
 */
function MoneyField({
  id,
  label,
  hint,
  value,
  disabled,
  onCommit,
  extra,
}: {
  id: string;
  label: string;
  hint: string;
  value: number | null;
  disabled: boolean;
  onCommit: (v: number | null) => void;
  extra?: ReactNode;
}) {
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  useEffect(() => {
    setDraft(value != null ? String(value) : "");
  }, [value]);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="t-sub font-extrabold text-text-1">
        {label} <span className="font-semibold text-text-3">· {hint}</span>
      </label>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <div className="relative w-full max-w-[200px]">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="예: 85000"
            value={draft}
            disabled={disabled}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, "").slice(0, 8);
              setDraft(digits);
              const n = digits ? Number(digits) : null;
              onCommit(n !== null && Number.isInteger(n) && n > 0 && n <= PRICE_MANWON_MAX ? n : null);
            }}
            className="jr-input w-full pr-12"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 t-sub font-bold text-text-3">
            만원
          </span>
        </div>
        {value != null && <Won manwon={value} className="t-body text-text-1" />}
        {extra}
      </div>
    </div>
  );
}

/** [1009 · T] 계약금 · 중도금 · 잔금 비율 막대 — 넣은 금액으로만(잔금을 모르면 그리지 않는다) */
function PaymentBar({ split }: { split: PaymentSplit }) {
  if (split.balanceManwon === null) return null;
  /* 세 칸의 합 = 매매가(잔금 = 매매가 − 계약금 − 중도금) — 비율은 그 합 대비 */
  const parts = [
    { key: "deposit", label: "계약금", manwon: split.depositManwon ?? 0, dot: "bg-primary" },
    { key: "mid", label: "중도금", manwon: split.midManwon ?? 0, dot: "bg-warning" },
    { key: "balance", label: "잔금", manwon: split.balanceManwon, dot: "bg-ink" },
  ].filter((x) => x.manwon > 0);
  /* [1009 · T 리뷰] 비율 글자는 합이 정확히 100% 가 되게(최대 잔여법) — 계산기 구성 막대와 같은 함수 */
  const shares = shareTexts(parts.map((x) => x.manwon));
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-bg p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className="t-sub font-extrabold text-text-1">
          잔금 <TweenMoney value={split.balanceManwon} className="text-ink" />
        </span>
        <span className="t-caption text-text-3">매매가 − 계약금{split.midManwon ? " − 중도금" : ""}</span>
      </div>
      <div
        className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-line"
        role="img"
        aria-label={parts.map((x, i) => `${x.label} ${manwonText(x.manwon)}(${shares[i]})`).join(", ")}
      >
        {parts.map((x) => (
          <span
            key={x.key}
            className={`h-full min-w-[3px] basis-0 ${x.dot} motion-safe:transition-[flex-grow] motion-safe:duration-300`}
            style={{ flexGrow: x.manwon }}
          />
        ))}
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-0.5 p-0 t-caption text-text-2">
        {parts.map((x, i) => (
          <li key={x.key} className="inline-flex items-center gap-1">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${x.dot}`} />
            {x.label} <b className="t-num font-bold text-text-1">{manwonText(x.manwon, "만")}</b>
            <span className="t-num">{shares[i]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 이 단계 날에 나가는 돈 — 계약일 = 계약금, 중도금일 = 중도금, 잔금일 = 잔금 */
function phaseAmount(phase: ContractPhase, split: PaymentSplit | null): { label: string; manwon: number } | null {
  if (!split) return null;
  if (phase === "contractDay" && split.depositManwon) return { label: "계약금", manwon: split.depositManwon };
  if (phase === "mid" && split.midManwon) return { label: "중도금", manwon: split.midManwon };
  if (phase === "balanceDay" && split.balanceManwon) return { label: "잔금", manwon: split.balanceManwon };
  return null;
}

/** 요약 줄의 큰 D-day 색(네이비 면 위) — 오늘·7일 안은 호박색, 지난 법정 기한은 주홍 */
const BIG_DDAY_TONE: Record<string, string> = {
  today: "text-on-navy-amber",
  soon: "text-on-navy-amber",
  overdue: "text-brand-red-dark",
};

export function ContractPlanner() {
  const { state, ready, sync } = useJourney();
  const { showToast } = useToast();
  const plan = state.contract ?? EMPTY_PLAN;
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => {
    setToday(kstToday());
  }, []);

  const dates: ContractDates = {
    contractDate: plan.contractDate,
    midDate: plan.midDate,
    balanceDate: plan.balanceDate,
    moveInDate: plan.moveInDate,
  };
  /* 19개 항목의 날짜 계산 — 렌더마다 다시 해도 싸다(메모 없이 입력과 늘 같은 값) */
  const groups = buildContractTimeline(dates, new Set(plan.checked), today);
  const warnings = contractDateWarnings(dates);
  const next = nextDeadline(groups);
  const totalItems = groups.reduce((n, g) => n + g.items.length, 0);
  const doneItems = groups.reduce((n, g) => n + g.items.filter((i) => i.checked).length, 0);
  const hasDates = Boolean(plan.contractDate || plan.balanceDate);
  const anyDated = groups.some((g) => g.due !== null);
  const canCalendar = hasCalendarEvents(groups);
  /* [1009 · T] 계약금·중도금·잔금 — 매매가와 계약금을 넣었을 때만 잔금을 계산한다(lib/journey/contract paymentSplit) */
  const split = paymentSplit(plan);
  /* 남은 기한이 없을 때의 요약 — 지난 법정 기한에 체크 안 한 일이 있으면 그 수를 말한다(리뷰 C) */
  const overdue = overdueLegalCount(groups);
  const noNextText = !today
    ? "날짜 계산 중…"
    : overdue > 0
      ? `지난 법정 기한에 체크하지 않은 일이 ${overdue}개 있어요`
      : doneItems === totalItems
        ? "할 일을 모두 체크했어요"
        : "남은 기한이 없어요";

  const setDate = (key: DateKey, value: string | null) => {
    updateJourney((s) => withContractPlan(s, { ...(s.contract ?? EMPTY_PLAN), [key]: value }, nowIso()));
  };
  const setAmount = (key: "priceManwon" | "depositManwon" | "midManwon", value: number | null) => {
    updateJourney((s) => withContractPlan(s, { ...(s.contract ?? EMPTY_PLAN), [key]: value }, nowIso()));
  };
  const toggleItem = (id: string) => {
    updateJourney((s) => {
      const cur = s.contract ?? EMPTY_PLAN;
      const checked = cur.checked.includes(id) ? cur.checked.filter((x) => x !== id) : [...cur.checked, id];
      return withContractPlan(s, { ...cur, checked }, nowIso());
    });
  };
  /* [1009 · T] 모두 지우기 — 확인 창(window.confirm) 대신 지우고 토스트에 "되돌리기"(지운 일정표를 그대로 되살린다).
     확인 창은 흐름을 끊고, 휴대폰에서는 브라우저 기본 창이라 사이트 말투와도 달랐다. */
  const clearAll = () => {
    const before = state.contract;
    updateJourney((s) => withContractPlan(s, null, nowIso()));
    if (!before) return;
    showToast("일정표를 지웠어요", {
      label: "되돌리기",
      onClick: () => {
        updateJourney((s) => withContractPlan(s, before, nowIso()));
        showToast("일정표를 되돌렸어요");
      },
    });
  };
  const downloadIcs = () => {
    try {
      const ics = buildContractIcs(groups, { now: new Date(), pageUrl: `${window.location.origin}/journey/contract` });
      const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "naezipnow-contract-schedule.ics";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      /* 토스트는 한 줄(390px 에서 23자 안쪽) — 여는 법은 버튼 아래 안내가 말한다 */
      showToast("캘린더 파일을 내려받았어요");
    } catch {
      showToast("캘린더 파일을 만들지 못했어요 — 인쇄로 저장해 주세요");
    }
  };

  const saveNote =
    !ready || sync === "loading"
      ? "불러오는 중…"
      : sync === "account" || sync === "saving"
        ? "내 계정에 저장돼요"
        : sync === "fallback"
          ? "지금은 이 기기에만 저장돼요"
          : "이 기기에 저장돼요 · 로그인하면 계정에 저장";

  const calcHref = plan.priceManwon ? `/calculator?price=${plan.priceManwon}` : "/calculator";
  const nextState = next ? stateClass(next) : null;

  return (
    <div className="flex flex-col gap-4">
      {/* ── 입력 ── */}
      <section className="card rounded-2xl p-4 md:p-5" aria-labelledby="jr-plan-inputs">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="jr-plan-inputs" className="m-0 t-section text-ink">
            날짜 넣기
          </h2>
          <span className="t-caption font-bold text-text-3" aria-live="polite">
            {saveNote}
          </span>
        </div>
        {/* 모바일도 두 칸 — 날짜칸 넷이 한 줄씩 쌓이면 입력 카드만 세로 500px 이었다 */}
        <div className="mt-3 grid grid-cols-2 gap-x-2.5 gap-y-3 lg:grid-cols-4 lg:gap-x-3">
          {DATE_FIELDS.map((f) => (
            <DateField
              key={f.key}
              label={f.label}
              hint={f.hint}
              value={plan[f.key]}
              disabled={!ready}
              onCommit={(v) => setDate(f.key, v)}
            />
          ))}
        </div>

        {/* [1009 · T] 금액(선택) — 매매가 · 계약금 · 중도금 → 잔금. 넣으면 계약일·중도금일·잔금일 칸에 금액이 붙는다. */}
        <div className="mt-4 flex flex-col gap-3 border-t border-divider pt-4">
          <MoneyField
            id="jr-price"
            label="매매가"
            hint="선택 — 잔금·취득세·대출 계산에 써요"
            value={plan.priceManwon}
            disabled={!ready}
            onCommit={(v) => setAmount("priceManwon", v)}
            extra={
              <Link
                href={calcHref}
                className="jr-noprint inline-flex min-h-[40px] items-center t-sub font-extrabold text-primary no-underline hover:underline"
              >
                취득세·대출 계산 ›
              </Link>
            }
          />
          <MoneyField
            id="jr-deposit"
            label="계약금"
            hint="계약일에 보내는 돈"
            value={plan.depositManwon ?? null}
            disabled={!ready}
            onCommit={(v) => setAmount("depositManwon", v)}
            extra={
              plan.priceManwon != null && plan.depositManwon == null ? (
                <button
                  type="button"
                  disabled={!ready}
                  onClick={() => setAmount("depositManwon", depositAtTenPercent(plan.priceManwon as number))}
                  className="jr-noprint chip press inline-flex min-h-[40px] items-center border border-line bg-surface px-3 t-sub font-bold text-text-2"
                >
                  매매가의 10%로 넣기
                </button>
              ) : plan.priceManwon != null && plan.depositManwon != null ? (
                <span className="t-sub t-num font-semibold text-text-3">
                  매매가의 {shareText(plan.depositManwon / plan.priceManwon)}
                </span>
              ) : null
            }
          />
          <MoneyField
            id="jr-mid"
            label="중도금"
            hint="있을 때만 · 여러 번이면 합계"
            value={plan.midManwon ?? null}
            disabled={!ready}
            onCommit={(v) => setAmount("midManwon", v)}
          />
          {split?.over && (
            <p className="m-0 flex items-start gap-1.5 rounded-xl bg-warning-soft p-3 t-sub font-bold text-warning" role="status">
              <Icon name="warning" size={14} className="mt-0.5 shrink-0" />
              계약금과 중도금을 더한 금액이 매매가보다 커요. 금액을 확인해 주세요.
            </p>
          )}
          {split && split.balanceManwon !== null && <PaymentBar split={split} />}
          {split && split.depositManwon === null && (
            <p className="m-0 t-caption text-text-3">계약금을 넣으면 잔금(매매가 − 계약금 − 중도금)을 계산해 잔금일 칸에 적어요.</p>
          )}
        </div>

        {warnings.length > 0 && (
          <ul className="m-0 mt-3 flex list-none flex-col gap-1 rounded-xl bg-warning-soft p-3" role="status">
            {warnings.map((w) => (
              <li key={w} className="flex items-start gap-1.5 t-sub font-bold text-warning">
                <Icon name="warning" size={14} className="mt-0.5 shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        )}
        <div className="jr-noprint mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadIcs}
            disabled={!canCalendar}
            className="btn-primary btn-md gap-1.5"
          >
            <Icon name="calendar" size={16} />
            캘린더에 추가(.ics)
          </button>
          <button type="button" onClick={() => window.print()} className="btn-soft btn-md gap-1.5">
            <Icon name="file-text" size={16} />
            인쇄·PDF로 저장
          </button>
          {(hasDates || plan.checked.length > 0 || plan.priceManwon != null || plan.depositManwon != null || plan.midManwon != null) && (
            <button
              type="button"
              onClick={clearAll}
              disabled={!ready}
              className="inline-flex min-h-[40px] items-center px-2 t-sub font-bold text-text-3 underline-offset-2 hover:underline disabled:opacity-50"
            >
              모두 지우기
            </button>
          )}
        </div>
        {!canCalendar && (
          <p className="jr-noprint m-0 mt-2 t-caption text-text-3">
            {anyDated
              ? "남은 기한이 없어요 — 지난 날이나 모두 체크한 일은 캘린더에 넣지 않아요."
              : "계약일이나 잔금일을 넣으면 기한마다 알림이 붙은 캘린더 일정으로 내려받을 수 있어요."}
          </p>
        )}
        {canCalendar && (
          <p className="jr-noprint m-0 mt-2 t-caption text-text-3">
            내려받은 .ics 파일을 열면 휴대폰·PC 캘린더에 기한마다 알림이 붙은 일정이 들어가요.
          </p>
        )}
      </section>

      {/* ── 요약 — 다음 할 일 · 남은 날(크게) · 진행 막대 ── */}
      {hasDates && (
        <section className="jr-summary flex flex-col gap-3 rounded-2xl p-4" aria-label="다음 할 일">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="t-caption font-extrabold tracking-wider text-on-dark-muted">다음 할 일</span>
              {next && next.due ? (
                <>
                  <span className="t-section break-words text-on-dark">{next.meta.title}</span>
                  <span className="t-sub text-on-dark-muted">
                    {formatKoreanDay(next.due)}
                    {(next.meta.legal || next.meta.suggested) && ` · ${next.meta.dueText}`}
                  </span>
                </>
              ) : (
                <span className="t-section text-on-dark">{noNextText}</span>
              )}
              {/* 다가오는 기한이 있어도 지난 법정 기한을 체크하지 않았으면 함께 말한다 — 요약만 보고 넘어가지 않게 */}
              {next && overdue > 0 && (
                <span className="t-caption font-bold text-on-dark-muted">
                  지난 법정 기한에 체크하지 않은 일 {overdue}개 — 아래 목록에서 확인하세요
                </span>
              )}
            </div>
            {/* [1009 · T] D-day 를 크게 — 요약에서 가장 먼저 읽혀야 하는 숫자(예전엔 제목 옆 작은 알약이었다) */}
            {next && next.daysLeft !== null && nextState && (
              <span className={`t-display t-num shrink-0 leading-none ${BIG_DDAY_TONE[nextState] ?? "text-on-dark"}`}>
                {/* [1009 · T 리뷰] 역할 없는 span 의 aria-label 은 스크린리더가 읽지 않는다 — 보이는 "D-5"는 숨기고 말로 읽힌다 */}
                <span aria-hidden="true">{ddayText(next, nextState)}</span>
                <span className="sr-only">{ddaySpeech(next, nextState)}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="jr-bar flex-1" aria-hidden="true">
              <i style={{ transform: `scaleX(${totalItems ? doneItems / totalItems : 0})` }} />
            </div>
            <span className="t-sub t-num shrink-0 font-extrabold text-on-dark">
              체크 {doneItems}/{totalItems}
            </span>
          </div>
        </section>
      )}

      {/* ── 날짜순 할 일 ── */}
      <ol className="jr-timeline m-0 flex list-none flex-col gap-3 p-0" aria-label="계약·잔금 할 일">
        {groups.map((g) => {
          const st = stateClass(g);
          const money = phaseAmount(g.phase, split);
          return (
            <li key={g.phase} className="jr-group card rounded-2xl p-4 md:p-5" data-state={st}>
              {/* 줄바꿈 없이 — 쉬는 날 설명 한 줄이 붙어도 D-day 는 오른쪽 위에 남는다(390px 에서 아래 줄로 떨어졌다) */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="t-caption font-extrabold tracking-wide text-text-3">
                    {g.due ? formatKoreanDay(g.due) : "날짜를 넣으면 기한이 붙어요"}
                  </span>
                  <h3 className="m-0 flex flex-wrap items-center gap-1.5 t-section text-ink">
                    {g.meta.title}
                    <GroupBadge g={g} />
                  </h3>
                  {/* 기한 설명은 제목이 말하지 않는 것만(법정·권장) — "계약일 / 계약하는 날" 같은 되풀이는 뺀다 */}
                  {(g.meta.legal || g.meta.suggested) && <span className="t-sub text-text-2">{g.meta.dueText}</span>}
                  {/* 마지막 날이 쉬는 날이라 미뤄진 기한 — 왜 날짜가 "30일째"가 아닌지 말한다 */}
                  {restDayNote(g) && <span className="t-caption font-semibold text-text-3">{restDayNote(g)}</span>}
                  {/* [1009 · T] 그날 나가는 돈 — 넣은 금액으로만(정밀 표기) */}
                  {money && (
                    <span className="t-sub text-text-2">
                      {money.label} <Won manwon={money.manwon} className="t-body text-ink" />
                    </span>
                  )}
                </div>
                {g.daysLeft !== null && (
                  <span className="jr-dday" data-state={st}>
                    {ddayText(g, st)}
                  </span>
                )}
              </div>
              <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
                {g.items.map(({ item, checked }) => (
                  <li key={item.id} className="jr-item" data-checked={checked ? "true" : "false"}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      aria-label={item.title}
                      onClick={() => toggleItem(item.id)}
                      disabled={!ready}
                      className="jr-check"
                    >
                      <span className="jr-check__box" aria-hidden="true">
                        {checked && <Icon name="check" size={14} strokeWidth={3} className="njn-pop-once" />}
                      </span>
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="jr-item__title t-body font-extrabold text-ink">{item.title}</span>
                        {item.required && <span className="jr-badge jr-badge--legal">계약 전 필수</span>}
                      </div>
                      <p className="m-0 mt-0.5 t-sub leading-[1.65] text-text-2">{item.desc}</p>
                      {(item.laws?.length || item.links?.length || item.more) && (
                        <div className="jr-refs mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 t-caption">
                          {item.laws?.map((l) => (
                            <a
                              key={l.href}
                              href={l.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-[24px] items-center gap-1 font-bold text-text-2 underline-offset-2 hover:underline"
                            >
                              <Icon name="scale" size={12} className="shrink-0" />
                              {l.label}
                            </a>
                          ))}
                          {item.links?.map((l) => (
                            <a
                              key={l.href}
                              href={l.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-[24px] items-center gap-1 font-bold text-primary underline-offset-2 hover:underline"
                            >
                              <Icon name="link" size={12} className="shrink-0" />
                              {l.label}
                            </a>
                          ))}
                          {item.more && (
                            <Link
                              href={item.more.href === "/calculator" ? calcHref : item.more.href}
                              className="inline-flex min-h-[24px] items-center font-extrabold text-primary no-underline hover:underline"
                            >
                              {item.more.label} ›
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>

      {/* ── 고지 ── */}
      <aside className="flex flex-col gap-1.5 rounded-2xl border border-line bg-bg p-4" aria-label="안내">
        <p className="m-0 flex items-start gap-1.5 t-sub font-extrabold text-text-1">
          <Icon name="shield" size={15} className="mt-0.5 shrink-0 text-text-3" />
          일반 정보이며 법률·세무 자문이 아닙니다.
        </p>
        <p className="m-0 t-caption leading-[1.7] text-text-3">
          법정 기한은 {LAW_CHECKED_ON}에 국가법령정보센터(law.go.kr) 원문으로 확인했어요. 기한 날짜는 기준일 다음 날부터
          셌고(민법 제157조), {REST_DAY_RULE}. 공휴일은 {HOLIDAY_YEARS.join("·")}년 월력요항(우주항공청)과 공휴일 법령으로
          계산했고, 그 밖의 해는 토·일만 반영해요 — 마지막 날이 가까우면 미리 하세요. 규제지역·토지거래허가구역·대출 기준은
          바뀔 수 있으니 계약 전에 공식 안내와 거래하는 은행·중개사무소에 꼭 확인하세요. 넣은 날짜·금액은 이 기기에,
          로그인하면 내 계정에만 저장돼요.
        </p>
        <p className="jr-refs m-0 flex flex-wrap items-center gap-x-3 t-caption">
          {REST_DAY_LAWS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[24px] items-center gap-1 font-bold text-text-2 underline-offset-2 hover:underline"
            >
              <Icon name="scale" size={12} className="shrink-0" />
              {l.label}
            </a>
          ))}
        </p>
      </aside>
    </div>
  );
}
