"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/app/components/Icon";
import { useMoment } from "@/app/components/motion/MomentProvider";
import { useToast } from "@/app/components/toast/ToastProvider";
import { budgetMapHref, JOURNEY_STAGES, type JourneyStage } from "@/lib/journey/stages";
import {
  countDone,
  currentStageId,
  JOURNEY_STAGE_IDS,
  toggleStageDone,
  type JourneyStageId,
} from "@/lib/journey/state";
import { updateJourney, useJourney, type JourneySync } from "@/lib/journey/client-store";
import { readJourneySignals, subscribeJourneySignals, type JourneySignals } from "@/lib/journey/signals";
import { ddayLabel, formatKoreanDay, kstDayOf, kstToday } from "@/lib/journey/dates";
import { buildContractTimeline, SOON_DAYS, type ContractDates, type TimelineGroup } from "@/lib/journey/contract";

/* ============================================================
   [1008 · J] /journey — 내 집 마련 여정 6단계.

   [1020] 소유자: 시안(journey-d/m.png)을 보고 "좀더 고도화 시켜줘" — 시안대로 실제 화면을 만든다.
   핵심 = "노선도 + 지금 단계 하나".
    · 네이비 히어로(.hub-hero) 제거 — 흰 카드·테마 토큰만.
    · 데스크톱(lg+) 3열: 왼쪽 레일(진행 링 + 세로 노선도 6역 + 저장 위치, sticky) · 가운데(단계 6개 — 지금 단계만
      펼친 카드, 나머지는 한 줄 접힘) · 오른쪽 레일(다가오는 마감 3개 · 진행 중 신호 · 일정표 입구).
    · 폰·태블릿: 제목 + 작은 진행 링 + "지금 N단계 · 제목" 한 줄, 그 아래 단계 칩 가로 레일, 단계 목록.
    · 펼침 상태는 이 컴포넌트 안(여러 개 펼칠 수 있다). ready 전에는 전부 접힘(첫 렌더 정적).
    · 숫자는 있는 것만 — 시안의 "1 / 3"(할 일 체크 수)·"내 기록"은 저장된 값이 없어 그리지 않는다.
   재미는 세 순간에만 — 진행 링이 차오를 때, 체크 표시가 한 번 튈 때(njnPop), 여섯 단계를 다 채웠을 때의
   도장 장면(MomentProvider celebrate). 전부 prefers-reduced-motion 에서 멈춘다.

   서버 HTML 은 모두에게 같다(정적 페이지) — 진행·신호는 마운트 뒤 이 기기/계정에서 읽는다(lib/journey/client-store).
   ============================================================ */

const RING_R = 40;
const RING_C = 2 * Math.PI * RING_R;

/* [1020] 진행 링 — 흰 카드 위(jr-ring--light). size 로 폰(52)·레일(72) 크기를 나눈다 */
function ProgressRing({ done, total, ready, size }: { done: number; total: number; ready: boolean; size: number }) {
  const ratio = total > 0 ? done / total : 0;
  return (
    <div className="jr-ring jr-ring--light" style={{ width: size, height: size }} data-ready={ready ? "true" : "false"}>
      <svg viewBox="0 0 96 96" width={size} height={size} aria-hidden="true">
        <circle className="jr-ring__track" cx="48" cy="48" r={RING_R} fill="none" strokeWidth="8" />
        <circle
          className="jr-ring__arc"
          cx="48"
          cy="48"
          r={RING_R}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={RING_C.toFixed(2)}
          strokeDashoffset={(RING_C * (1 - ratio)).toFixed(2)}
          transform="rotate(-90 48 48)"
        />
      </svg>
      <div className="jr-ring__label">
        <span className="t-section t-num text-ink">
          {done}
          <span className="t-caption font-bold text-text-3">/{total}</span>
        </span>
      </div>
    </div>
  );
}

/* [1015 · 규칙 D] 저장 위치는 사실 한 줄 — "~돼요/~어요" 안내문 넷을 명사형으로 */
function syncLine(sync: JourneySync, ready: boolean): string {
  if (!ready || sync === "loading") return "진행 상황 불러오는 중";
  switch (sync) {
    case "account":
      return "체크 저장 위치: 내 계정";
    case "saving":
      return "계정에 저장 중";
    case "fallback":
      return "체크 저장 위치: 이 기기(계정 저장 실패, 다음 접속 때 합침)";
    default:
      return "체크 저장 위치: 이 기기";
  }
}

function SyncLine({ sync, ready, className }: { sync: JourneySync; ready: boolean; className?: string }) {
  return (
    <p className={`m-0 t-caption text-text-3 ${className ?? ""}`} aria-live="polite">
      {syncLine(sync, ready)}
      {ready && sync === "guest" && (
        <>
          {" "}
          <Link
            href="/login?callbackUrl=%2Fjourney"
            className="inline-flex min-h-[24px] items-center font-bold text-primary underline-offset-2 hover:underline"
          >
            로그인 ›
          </Link>
        </>
      )}
    </p>
  );
}

/* [1015 · 규칙 I] 단계 카드 안의 할 일은 행 목록(lq-panel + divide-y).
   [1020] 흰 카드 **안**이므로 data-tone="plain"(판을 걷고 행 사이 선만). */
function StageTasks({ stage }: { stage: JourneyStage }) {
  return (
    <ul data-tone="plain" className="lq-panel m-0 flex list-none flex-col divide-y p-0">
      {stage.tasks.map((t) => (
        <li key={t.href} className="min-w-0">
          <Link href={t.href} className="flex min-h-[48px] items-center gap-2 py-2.5 no-underline">
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="t-body font-bold text-ink">{t.label}</span>
                {t.login && (
                  <span className="t-caption rounded border border-line px-1 font-bold text-text-3">로그인</span>
                )}
              </span>
              <span className="mt-0.5 block t-sub text-text-2">{t.desc}</span>
            </span>
            <span aria-hidden="true" className="shrink-0 t-body font-bold text-primary">
              ›
            </span>
          </Link>
        </li>
      ))}
      {stage.budgetChips && (
        <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
          <span className="t-body font-bold text-ink">예산으로 지도 보기</span>
          <span className="flex flex-wrap gap-1.5">
            {stage.budgetChips.map((eok) => (
              <Link
                key={eok}
                href={budgetMapHref(eok)}
                className="chip inline-flex min-h-[32px] items-center border border-line bg-surface px-3 t-sub font-bold text-text-2 no-underline hover:border-primary hover:text-primary"
              >
                {eok}억 이하
              </Link>
            ))}
          </span>
        </li>
      )}
    </ul>
  );
}

/** 접힘 행에 늘어놓는 할 일 이름 — "단지 종합 진단 · 이름으로 찾기 · 관심 단지" */
function taskNames(stage: JourneyStage): string {
  const names = stage.tasks.map((t) => t.label);
  if (stage.budgetChips) names.push("예산으로 지도 보기");
  return names.join(" · ");
}

/** 체크한 시각(ISO) → "9월 24일(수)" */
function doneDay(doneAt: string): string {
  return formatKoreanDay(kstDayOf(doneAt) ?? doneAt.slice(0, 10));
}

/* [1020] 다가오는 마감 — 일정표 그룹 중 날짜가 있고 다 체크하지 않은 것을 남은 날 오름차순 3개 */
function upcomingDeadlines(groups: readonly TimelineGroup[]): TimelineGroup[] {
  return groups
    /* 지난 날은 법정 기한(미체크)만 — "계약 전 확인 18일 지남"은 이미 계약한 사람에게 마감이 아니다 */
    .filter((g) => g.daysLeft !== null && !g.allChecked && (g.daysLeft >= 0 || g.meta.legal))
    .sort((a, b) => (a.daysLeft as number) - (b.daysLeft as number))
    .slice(0, 3);
}

/** D-day 글자색 — 7일 안(지남 포함)은 주홍, 법정 기한은 노랑, 그 밖은 옅게 */
function ddayTone(g: TimelineGroup): string {
  if (g.daysLeft !== null && g.daysLeft <= SOON_DAYS) return "text-brand-red";
  if (g.meta.legal) return "text-warning";
  return "text-text-3";
}

/* [1020] 오른쪽 레일(데스크톱) · 단계 목록 아래(폰) — 같은 내용 */
function DeadlineCard({
  ready,
  today,
  groups,
}: {
  ready: boolean;
  today: string | null;
  groups: readonly TimelineGroup[];
}) {
  const dated = groups.some((g) => g.due !== null);
  const upcoming = upcomingDeadlines(groups);
  return (
    <section className="card flex flex-col" aria-labelledby="jr-deadline-title">
      <div className="flex flex-wrap items-baseline gap-x-1.5 px-3.5 pt-3 pb-1.5">
        <h2 id="jr-deadline-title" className="m-0 t-sub font-bold text-ink">
          다가오는 마감
        </h2>
        <span className="t-caption text-text-3">계약·잔금 일정표 기준</span>
      </div>
      {!ready || !today ? (
        <p className="m-0 px-3.5 pb-3 t-caption text-text-3">날짜 계산 중</p>
      ) : !dated ? (
        <p className="m-0 px-3.5 pb-3 t-caption text-text-3">
          계약잔금 일정표에 날짜를 넣으면 마감이 여기 보입니다{" "}
          <Link
            href="/journey/contract"
            className="inline-flex min-h-[24px] items-center font-bold text-primary underline-offset-2 hover:underline"
          >
            열기 ›
          </Link>
        </p>
      ) : upcoming.length === 0 ? (
        <p className="m-0 px-3.5 pb-3 t-caption text-text-3">
          남은 기한 없음{" "}
          <Link
            href="/journey/contract"
            className="inline-flex min-h-[24px] items-center font-bold text-primary underline-offset-2 hover:underline"
          >
            일정표 ›
          </Link>
        </p>
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col p-0">
            {upcoming.map((g) => (
              <li key={g.phase} className="flex items-center justify-between gap-3 border-t border-divider px-3.5 py-2.5">
                <div className="min-w-0">
                  <div className="t-sub font-bold text-ink">{g.meta.title}</div>
                  <div className="t-caption text-text-3">
                    {g.meta.dueText} · {g.due ? formatKoreanDay(g.due) : ""}
                  </div>
                </div>
                <span className={`shrink-0 t-section t-num ${ddayTone(g)}`}>{ddayLabel(g.daysLeft as number)}</span>
              </li>
            ))}
          </ul>
          <p className="m-0 border-t border-divider px-3.5 py-2.5 t-caption text-text-3">
            날짜는 계약·잔금 일정표에서 입력{" "}
            <Link
              href="/journey/contract"
              className="inline-flex min-h-[24px] items-center font-bold text-primary underline-offset-2 hover:underline"
            >
              열기 ›
            </Link>
          </p>
        </>
      )}
    </section>
  );
}

export function JourneyBoard() {
  const { state, ready, sync } = useJourney();
  const { showMoment } = useMoment();
  const { showToast } = useToast();
  const [signals, setSignals] = useState<JourneySignals>({});
  /* 방금 체크한 단계 — 체크 표시가 한 번 튄다(njn-pop-once). 키를 바꿔 매번 다시 재생 */
  const [pop, setPop] = useState<{ id: JourneyStageId; n: number } | null>(null);
  /* [1020] 펼침 — 사람이 누른 것만 기억. 값이 없는 단계는 "지금 단계면 펼침"(ready 전에는 전부 접힘) */
  const [openMap, setOpenMap] = useState<Partial<Record<JourneyStageId, boolean>>>({});
  /* 오늘(한국 날짜) — 마운트 뒤에만(서버 렌더에 빌드한 날이 박히지 않게) */
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setSignals(readJourneySignals());
    read();
    return subscribeJourneySignals(read);
  }, []);
  useEffect(() => {
    setToday(kstToday());
  }, []);

  const total = JOURNEY_STAGE_IDS.length;
  const done = ready ? countDone(state) : 0;
  const current = ready ? currentStageId(state) : null;
  const currentStage = current ? JOURNEY_STAGES.find((s) => s.id === current) ?? null : null;
  /* ⑥ 신호 — 일정표에 계약일을 넣었다(여정 상태 안의 사실) */
  const contractDate = state.contract?.contractDate ?? null;
  const signalFor = (id: JourneyStageId): string | null =>
    id === "contract" ? (contractDate ? `일정표 · 계약일 ${formatKoreanDay(contractDate)}` : null) : signals[id] ?? null;
  const isOpen = (id: JourneyStageId): boolean => openMap[id] ?? (ready && current === id);

  /* [1020] 오른쪽 레일 재료 — 일정표 그룹(lib/journey/contract)·진행 중 신호 */
  const plan = state.contract;
  const dates: ContractDates = {
    contractDate: plan?.contractDate ?? null,
    midDate: plan?.midDate ?? null,
    balanceDate: plan?.balanceDate ?? null,
    moveInDate: plan?.moveInDate ?? null,
  };
  const groups = ready ? buildContractTimeline(dates, new Set(plan?.checked ?? []), today) : [];
  const signalRows = ready
    ? JOURNEY_STAGES.map((s) => ({ stage: s, signal: state.done[s.id] ? null : signalFor(s.id) })).filter(
        (r): r is { stage: JourneyStage; signal: string } => Boolean(r.signal),
      )
    : [];

  /* [1009 · T] 체크 결과를 토스트로 — 켜면 "다음 단계"로 바로 가는 길, 풀면 "되돌리기"(처음 체크한 시각 그대로 되살린다).
     예전엔 버튼 글자만 바뀌어 스크롤 중에는 무엇이 저장됐는지 놓쳤고, 실수로 푼 체크는 날짜가 사라졌다. */
  const scrollToStage = (id: JourneyStageId) => {
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduce = false;
    }
    document.getElementById(`stage-${id}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };
  /* [1020] 노선도·칩에서 누르면 그 단계를 펼치고 스크롤 */
  const goTo = (id: JourneyStageId) => {
    setOpenMap((m) => ({ ...m, [id]: true }));
    window.requestAnimationFrame(() => scrollToStage(id));
  };
  const toggleOpen = (id: JourneyStageId) => {
    setOpenMap((m) => ({ ...m, [id]: !isOpen(id) }));
  };
  const toggle = (id: JourneyStageId) => {
    const stage = JOURNEY_STAGES.find((x) => x.id === id);
    const doneAt = state.done[id] ?? null;
    const next = updateJourney((s) => toggleStageDone(s, id, new Date().toISOString()));
    if (doneAt) {
      showToast(`‘${stage?.title ?? "단계"}’ 체크를 풀었어요`, {
        label: "되돌리기",
        onClick: () =>
          updateJourney((s) =>
            s.done[id] ? s : { ...s, done: { ...s.done, [id]: doneAt }, updatedAt: new Date().toISOString() },
          ),
      });
      return;
    }
    setPop((p) => ({ id, n: (p?.n ?? 0) + 1 }));
    if (countDone(next) === total) {
      showMoment({
        kind: "celebrate",
        title: "여정 완주",
        subtitle: "여섯 단계를 모두 체크했어요.",
        pill: "내 집 마련 여정 완료",
      });
      return;
    }
    const upcoming = currentStageId(next);
    const upcomingStage = upcoming ? JOURNEY_STAGES.find((x) => x.id === upcoming) : null;
    showToast(
      `‘${stage?.title ?? "단계"}’ 완료로 표시했어요`,
      upcoming && upcomingStage ? { label: `다음: ${upcomingStage.short}`, onClick: () => goTo(upcoming) } : undefined,
    );
  };

  /* [1009 · T] 모두 지우기 — window.confirm 대신 지우고 "되돌리기"(체크 시각까지 그대로). 일정표는 건드리지 않는다. */
  const resetAll = () => {
    const before = { ...state.done };
    const n = Object.keys(before).length;
    if (n === 0) return;
    updateJourney((s) => ({ ...s, done: {}, updatedAt: new Date().toISOString() }));
    showToast(`체크 ${n}개를 지웠어요`, {
      label: "되돌리기",
      onClick: () => updateJourney((s) => ({ ...s, done: { ...before, ...s.done }, updatedAt: new Date().toISOString() })),
    });
  };

  /* 머리 한 줄 — "지금 2단계 · 예산 정하기" */
  const headLine = !ready ? "진행 상황 확인 중" : currentStage ? `지금 ${currentStage.n}단계 · ${currentStage.title}` : "여섯 단계 모두 완료";
  const railLine = !ready
    ? "진행 상황 확인 중"
    : currentStage
      ? `${done}단계 완료 · 지금 ${currentStage.n}단계`
      : "여섯 단계 모두 완료";

  const stageState = (id: JourneyStageId): "done" | "now" | "todo" =>
    ready && state.done[id] ? "done" : ready && current === id ? "now" : "todo";

  return (
    <div className="grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-[250px_minmax(0,1fr)_300px] lg:items-start lg:gap-6">
      {/* ── 왼쪽: 폰·태블릿은 머리(링 + 제목 + 한 줄 + 칩 레일), 데스크톱은 sticky 레일(카드 안 링 + 노선도) ── */}
      <aside className="jr-rail flex flex-col gap-3 lg:sticky lg:top-[76px] lg:self-start" aria-label="여정 진행">
        <div className="jr-rail-card flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="lg:hidden">
              <ProgressRing done={done} total={total} ready={ready} size={52} />
            </div>
            <div className="hidden lg:block">
              <ProgressRing done={done} total={total} ready={ready} size={72} />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <h1 id="journey-title" className="jr-rail-title m-0 t-title text-ink">
                내 집 마련 여정
              </h1>
              <p className="m-0 t-caption text-text-3 lg:hidden">{headLine}</p>
              <p className="m-0 hidden t-caption text-text-3 lg:block">{railLine}</p>
            </div>
          </div>

          {/* 세로 노선도 — 데스크톱 */}
          <ol className="jr-line hidden lg:block" aria-label="여정 단계 노선도">
            {JOURNEY_STAGES.map((s) => {
              const st = stageState(s.id);
              const doneAt = st === "done" ? state.done[s.id] ?? null : null;
              const signal = st === "done" ? null : signalFor(s.id);
              const meta = doneAt ? `${doneDay(doneAt)} 완료` : signal ?? (st === "now" ? `할 일 ${s.tasks.length + (s.budgetChips ? 1 : 0)}개` : null);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => goTo(s.id)}
                    data-state={st}
                    aria-current={st === "now" ? "step" : undefined}
                    className="jr-st press"
                  >
                    <span className="jr-st__dot" aria-hidden="true">
                      {st === "done" ? <Icon name="check" size={12} strokeWidth={3} /> : s.n}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="jr-st__lbl">
                        <span className="sr-only">{s.n}단계 · </span>
                        {s.title}
                        {st === "done" && <span className="sr-only"> (완료)</span>}
                      </span>
                      {meta && <span className="t-caption text-text-3">{meta}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <SyncLine sync={sync} ready={ready} className="hidden lg:block" />
        </div>

        {/* 단계 칩 가로 레일 — 폰·태블릿 */}
        <nav aria-label="여정 단계 바로가기" className="jr-steps--light flex gap-1.5 overflow-x-auto lg:hidden">
          {JOURNEY_STAGES.map((s) => {
            const st = stageState(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => goTo(s.id)}
                aria-current={st === "now" ? "step" : undefined}
                data-state={st === "now" ? "current" : st}
                className="jr-step"
              >
                <span className="jr-step__n" aria-hidden="true">
                  {st === "done" ? <Icon name="check" size={12} strokeWidth={3} /> : s.n}
                </span>
                <span className="min-w-0 truncate">{s.short}</span>
                {st === "done" && <span className="sr-only">(완료)</span>}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ── 가운데: 여섯 단계 — 지금 단계만 펼침, 나머지 한 줄 접힘 ── */}
      <div className="flex min-w-0 flex-col gap-3 md:gap-4">
        <ol className="jr-list m-0 flex list-none flex-col p-0" aria-label="내 집 마련 여섯 단계">
          {JOURNEY_STAGES.map((s) => {
            const doneAt = ready ? state.done[s.id] ?? null : null;
            const isDone = Boolean(doneAt);
            const isCurrent = ready && current === s.id;
            const signal = !isDone ? signalFor(s.id) : null;
            const popKey = pop?.id === s.id ? pop.n : 0;
            const open = isOpen(s.id);
            const nextStage = JOURNEY_STAGES.find((x) => x.n === s.n + 1) ?? null;
            const li = `stage-${s.id}`;
            if (!open) {
              return (
                <li key={s.id} id={li} className="jr-li jr-li--fold scroll-mt-24">
                  {/* 접힘 행 = 제목(h2) 안의 버튼(WAI 아코디언). 미리보기(할 일 이름·펼치기)는 제목 이름에서 뺀다 */}
                  <h2 className="m-0">
                    <button
                      type="button"
                      onClick={() => toggleOpen(s.id)}
                      aria-expanded={false}
                      data-state={isDone ? "done" : isCurrent ? "now" : "todo"}
                      className="jr-fold"
                    >
                      <span className="jr-fold__n" aria-hidden="true">
                        {isDone ? <Icon name="check" size={12} strokeWidth={3} /> : s.n}
                      </span>
                      <span className="shrink-0 t-body font-bold text-text-2">
                        <span className="sr-only">{s.n}단계 · </span>
                        {s.title}
                        {isDone && <span className="sr-only"> (완료)</span>}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-right t-caption font-normal text-text-3" aria-hidden="true">
                        {isDone && doneAt ? `${doneDay(doneAt)} 완료` : taskNames(s)}
                      </span>
                      <span className="shrink-0 t-caption font-bold text-text-3" aria-hidden="true">
                        펼치기 ›
                      </span>
                    </button>
                  </h2>
                </li>
              );
            }
            return (
              <li
                key={s.id}
                id={li}
                data-state={isDone ? "done" : isCurrent ? "current" : "todo"}
                className={`jr-li jr-li--open scroll-mt-24 ${isCurrent ? "jr-li--now" : isDone ? "jr-li--done" : ""}`}
              >
                <div className="flex items-start gap-3 p-4 pb-0 max-md:p-3.5 max-md:pb-0 md:p-5 md:pb-0">
                  <span className="jr-stage__num" aria-hidden="true">
                    {isDone ? (
                      <Icon key={popKey} name="check" size={18} strokeWidth={2.6} className={popKey ? "njn-pop-once" : ""} />
                    ) : (
                      s.n
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h2 className="m-0 t-section text-ink">
                        <span className="sr-only">{s.n}단계 · </span>
                        {s.title}
                      </h2>
                      {isCurrent && <span className="jr-badge jr-badge--now">지금 단계</span>}
                      {isDone && <span className="jr-badge jr-badge--done">완료</span>}
                      {signal && <span className="jr-badge jr-badge--active">진행 중 · {signal}</span>}
                    </div>
                    <p className="m-0 mt-1 t-sub text-text-2">{s.why}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleOpen(s.id)}
                    aria-expanded={true}
                    aria-controls={`${li}-body`}
                    className="inline-flex h-10 shrink-0 items-center gap-0.5 rounded-lg px-2 t-caption font-bold text-text-3 hover:bg-bg"
                  >
                    접기
                    <span aria-hidden="true">›</span>
                  </button>
                </div>

                <div id={`${li}-body`} className="px-4 max-md:px-3.5 md:px-5">
                  <div className="mt-3 max-md:mt-2">
                    <StageTasks stage={s} />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-divider px-4 py-3 max-md:mt-2 max-md:px-3.5 max-md:py-2.5 md:px-5">
                  {/* 체크한 날만 — "끝냈으면 체크해 두세요" 사용법 문장은 뺐다(버튼이 곧 그 말이다) */}
                  <span className="t-caption text-text-3">{isDone && doneAt ? `${doneDay(doneAt)} 완료` : ""}</span>
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    aria-pressed={isDone}
                    disabled={!ready}
                    className={`jr-done btn-md press gap-1.5 ${isDone ? "jr-done--on" : isCurrent ? "btn-primary" : "btn-soft"}`}
                  >
                    <Icon name="check" size={16} strokeWidth={2.4} />
                    {isDone ? "완료" : nextStage ? `이 단계 완료 → 다음: ${nextStage.short}` : "이 단계 완료"}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>

        {/* 폰·태블릿 — 레일 내용 중 꼭 필요한 것만 본문 아래 */}
        <div className="flex flex-col gap-3 lg:hidden">
          <DeadlineCard ready={ready} today={today} groups={groups} />
          <Link href="/journey/contract" className="btn-soft btn-md w-full no-underline">
            계약·잔금 일정표
          </Link>
          <SyncLine sync={sync} ready={ready} />
        </div>

        <div className="flex flex-col gap-2 px-1 pb-2">
          {/* [1015 · 규칙 B] "일반적인 순서를 돕는 안내예요…" 세 문장 → 고지 한 줄 */}
          <p className="m-0 t-caption text-text-3">일반 정보이며 법률·세무 자문이 아닙니다. 순서는 바꿔도 됩니다.</p>
          {ready && done > 0 && (
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex min-h-[24px] w-fit items-center t-caption font-bold text-text-3 underline-offset-2 hover:underline"
            >
              체크 모두 지우기
            </button>
          )}
        </div>
      </div>

      {/* ── 오른쪽 레일(데스크톱): 다가오는 마감 · 진행 중 신호 · 일정표 입구 ── */}
      <aside className="hidden lg:flex lg:flex-col lg:gap-3 lg:sticky lg:top-[76px] lg:self-start" aria-label="마감과 신호">
        <DeadlineCard ready={ready} today={today} groups={groups} />
        {signalRows.length > 0 && (
          <section className="card flex flex-col" aria-labelledby="jr-signal-title">
            <h2 id="jr-signal-title" className="m-0 px-3.5 pt-3 pb-1.5 t-sub font-bold text-ink">
              진행 중 신호
            </h2>
            <ul className="m-0 flex list-none flex-col p-0">
              {signalRows.map(({ stage, signal }) => (
                <li key={stage.id} className="border-t border-divider px-3.5 py-2.5">
                  <button type="button" onClick={() => goTo(stage.id)} className="flex w-full min-w-0 flex-col items-start text-left">
                    <span className="t-caption text-text-3">
                      {stage.n}단계 · {stage.title}
                    </span>
                    <span className="t-sub font-bold text-ink">{signal}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <Link href="/journey/contract" className="btn-soft btn-md w-full no-underline">
          계약·잔금 일정표
        </Link>
      </aside>
    </div>
  );
}
