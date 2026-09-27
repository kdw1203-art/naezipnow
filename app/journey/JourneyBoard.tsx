"use client";
/* [1012] 규칙 8 — 굵기 800 이상 금지: 이 파일의 font-extrabold/black 7곳을 font-bold(700)로 바꿨다. */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/app/components/Icon";
import { useMoment } from "@/app/components/motion/MomentProvider";
import { useToast } from "@/app/components/toast/ToastProvider";
import { budgetMapHref, JOURNEY_STAGES, type JourneyCountLabels, type JourneyStage } from "@/lib/journey/stages";
import {
  countDone,
  currentStageId,
  JOURNEY_STAGE_IDS,
  toggleStageDone,
  type JourneyStageId,
} from "@/lib/journey/state";
import { updateJourney, useJourney, type JourneySync } from "@/lib/journey/client-store";
import { readJourneySignals, subscribeJourneySignals, type JourneySignals } from "@/lib/journey/signals";
import { formatKoreanDay, kstDayOf } from "@/lib/journey/dates";
/* [v4] 승인 시안의 목록 행 부품(서버·클라이언트 공용 — 훅 없음) */
import { SummaryRow } from "@/app/complex/[id]/SummaryRow";

/* ============================================================
   [1008 · J] /journey — 내 집 마련 여정 6단계.

   [v4 · 한 화면 한 가지] 네이비 히어로(진행 링·여섯 칸 스텝퍼·설명 문단) → 흰 바탕 머리(제목 + 사실 한 줄 +
   "다음 단계" 한 줄). 단계 카드(번호 타일·아이콘 타일·설명 문장·할 일 타일 격자) → 단계마다 **구분선 목록 행**
   (왼쪽 화면 이름 / 오른쪽 실측 숫자 + `›`). 재미는 두 순간만 남긴다 — 체크 표시가 한 번 튈 때(njnPop),
   여섯 단계를 다 채웠을 때의 도장 장면(MomentProvider celebrate). 전부 prefers-reduced-motion 에서 멈춘다.

   서버 HTML 은 모두에게 같다(정적 페이지) — 진행·신호는 마운트 뒤 이 기기/계정에서 읽는다(lib/journey/client-store).
   ============================================================ */

/* [1012 · R2] 리뷰 B −1 — 저장 안내에 숫자(체크 칸 수 · 계정에 있는 체크 수)와 어디에(이 기기·계정). */
/* [v4 · 규칙 3] 문장 → 사실 한 줄(비회원 줄은 tests/unit/town-1012 가 잠근 문구 그대로) */
function syncLine(sync: JourneySync, ready: boolean, done: number, total: number): string {
  if (!ready || sync === "loading") return "진행 상황 불러오는 중…";
  switch (sync) {
    case "account":
      return `체크 ${done}/${total}개 · 내 계정에 저장(다른 기기에서도)`;
    case "saving":
      return "계정에 저장하는 중…";
    case "fallback":
      return `계정 저장 실패 · 체크 ${done}/${total}개는 이 기기에만 · 다음에 열 때 계정에 합침`;
    default:
      return `체크 ${total}개는 이 기기에 저장 · 로그인하면 계정에도 저장돼 다른 기기에서 이어 볼 수 있어요`;
  }
}

/* [v4 · 규칙 5] 할 일 = 구분선 목록 행(SummaryRow — 승인 시안 부품). 설명 문장(desc)은 화면에서 뺐다 —
   행 이름이 곧 화면 이름이고, 오른쪽은 실측 한 토막(없으면 `›`만). 로그인 화면은 보조 줄 한 단어. */
/* [v4.1 · 리퀴드 목록] 여섯 단계의 할 일 묶음은 톤을 순환(blue→hanji→mint→sand→blue→hanji) — 이웃한 단계가
   같은 색을 갖지 않는다(globals.css `data-tone`). */
const STAGE_TONES = ["blue", "hanji", "mint", "sand", "blue", "hanji"] as const;

function StageTasks({
  stage,
  counts,
  tone,
}: {
  stage: JourneyStage;
  counts: JourneyCountLabels["tasks"];
  tone: (typeof STAGE_TONES)[number];
}) {
  return (
    <ul data-tone={tone} className="card m-0 flex list-none flex-col divide-y divide-line rounded-lg p-0 px-4">
      {stage.tasks.map((t) => {
        /* [1012 · R2] 규칙 7 — 행 오른쪽 실측 한 토막. 카탈로그의 count 는 늘 비어 있고(정적 숫자 금지)
           페이지가 실데이터로 만든 counts 에서 href 로 찾는다. 없으면 화살표만. */
        const count = t.count ?? counts[t.href];
        return <SummaryRow key={t.href} label={t.label} sub={t.login ? "로그인" : undefined} value={count} href={t.href} />;
      })}
      {stage.budgetChips && (
        /* 예산 칩 — 누르면 지도가 그 상한으로 열린다(필터 입구라 칩으로 남긴다). 한 줄 가로 스크롤 */
        <li className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
          <span className="t-body font-bold text-ink">예산 안의 단지 지도</span>
          <span className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {stage.budgetChips.map((eok) => (
              <Link
                key={eok}
                href={budgetMapHref(eok)}
                className="chip inline-flex min-h-[32px] shrink-0 items-center border border-line bg-surface px-3 t-sub font-bold text-text-2 no-underline hover:border-primary hover:text-primary"
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

export function JourneyBoard({
  counts = {},
  stageNotes = {},
}: {
  /** [1012 · R2] href → 카드 오른쪽 실측("오늘 10문제") — app/journey/page.tsx 가 서버에서 읽어 넘긴다 */
  counts?: JourneyCountLabels["tasks"];
  /** [1012 · R2] 단계 id → 단계 설명 뒤 실측 한 토막("국토교통부 2026.08 신고분까지") */
  stageNotes?: JourneyCountLabels["stages"];
}) {
  const { state, ready, sync } = useJourney();
  const { showMoment } = useMoment();
  const { showToast } = useToast();
  const [signals, setSignals] = useState<JourneySignals>({});
  /* 방금 체크한 단계 — 체크 표시가 한 번 튄다(njn-pop-once). 키를 바꿔 매번 다시 재생 */
  const [pop, setPop] = useState<{ id: JourneyStageId; n: number } | null>(null);

  useEffect(() => {
    const read = () => setSignals(readJourneySignals());
    read();
    return subscribeJourneySignals(read);
  }, []);

  const total = JOURNEY_STAGE_IDS.length;
  const done = ready ? countDone(state) : 0;
  const current = ready ? currentStageId(state) : null;
  const currentStage = current ? JOURNEY_STAGES.find((s) => s.id === current) ?? null : null;
  /* [1012] 규칙 6·7 — 머리 사실 줄은 실측으로: 단계 정의에 실린 화면(할 일) 수와
     다음 단계의 첫 할 일. 둘 다 lib/journey/stages 의 실제 목록에서 센다. */
  const taskTotal = JOURNEY_STAGES.reduce((n, st) => n + st.tasks.length + (st.budgetChips ? 1 : 0), 0);
  const firstTask = currentStage?.tasks[0] ?? null;
  /* ⑥ 신호 — 일정표에 계약일을 넣었다(여정 상태 안의 사실) */
  const contractDate = state.contract?.contractDate ?? null;
  const signalFor = (id: JourneyStageId): string | null =>
    id === "contract" ? (contractDate ? `일정표 · 계약일 ${formatKoreanDay(contractDate)}` : null) : signals[id] ?? null;

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
        title: "여정 6단계 완주", /* [1012] 규칙 6 — 느낌표 금지 */
        subtitle: "여섯 단계를 모두 체크했어요. 새 집에서의 시작을 응원해요.",
        pill: "내 집 마련 여정 완료",
      });
      return;
    }
    const upcoming = currentStageId(next);
    const upcomingStage = upcoming ? JOURNEY_STAGES.find((x) => x.id === upcoming) : null;
    showToast(
      `‘${stage?.title ?? "단계"}’ 완료로 표시했어요`,
      upcoming && upcomingStage ? { label: `다음: ${upcomingStage.short}`, onClick: () => scrollToStage(upcoming) } : undefined,
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

  /* [v4 · 규칙 1] 머리 사실 한 줄 — 단계 수 · 화면 수 · (불러온 뒤) 체크 수. 숫자만 */
  const headFact = [`${total}단계`, `화면 ${taskTotal}개`, ...(ready ? [`체크 ${done}/${total}`] : [])].join(" · ");

  return (
    /* [v4 · 규칙 12] 데스크톱도 가운데 한 줄(최대 760px) */
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
      {/* ── [v4 · 규칙 1·4] 머리 — 흰 바탕 제목 + 사실 한 줄 + 다음 단계 한 줄(네이비 히어로·진행 링·스텝퍼 없음) ── */}
      <header className="flex flex-col gap-0.5">
        <h1 id="journey-title" className="t-title text-ink">
          내 집 마련 여정
        </h1>
        <p className="t-sub text-text-3">{headFact}</p>
        {/* 다음 단계(같은 화면 앵커) · 먼저 할 일(그 단계의 첫 화면) — 예전 히어로의 칩·링크 두 개를 한 줄로 */}
        <p className="mt-1 t-sub text-text-2" aria-live="polite">
          {ready && currentStage ? (
            <>
              다음{" "}
              <a href={`#stage-${currentStage.id}`} className="tap-line font-bold text-ink no-underline">
                {currentStage.n}. {currentStage.title} ›
              </a>
              {firstTask && (
                <>
                  {" · "}
                  <Link href={firstTask.href} className="tap-line font-bold text-primary no-underline">
                    {firstTask.label} ›
                  </Link>
                </>
              )}
            </>
          ) : ready ? (
            "여섯 단계 모두 체크"
          ) : (
            "진행 상황 확인 중…"
          )}
        </p>
      </header>

      {/* ── [v4 · 규칙 5] 여섯 단계 — 단계 제목 한 줄 + 보조 한 줄(상태·실측) / 할 일은 구분선 목록 행 ── */}
      <ol className="m-0 flex list-none flex-col gap-8 p-0" aria-label="내 집 마련 여섯 단계">
        {JOURNEY_STAGES.map((s, i) => {
          const doneAt = ready ? state.done[s.id] ?? null : null;
          const isDone = Boolean(doneAt);
          const isCurrent = ready && current === s.id;
          const signal = !isDone ? signalFor(s.id) : null;
          const popKey = pop?.id === s.id ? pop.n : 0;
          /* [v4 · 규칙 3] 보조 한 줄 — 상태(체크한 날·진행 중) + 실측(stageNotes: 최신 신고월 등).
             단계 설명 문장(why)은 화면에서 뺐다(HowTo 스키마도 화면과 같게 — app/journey/page.tsx) */
          const facts = [
            isDone && doneAt ? `${formatKoreanDay(kstDayOf(doneAt) ?? doneAt.slice(0, 10))} 체크` : null,
            signal ? `진행 중 · ${signal}` : null,
            stageNotes[s.id] ?? null,
          ].filter((x): x is string => Boolean(x));
          return (
            <li
              key={s.id}
              id={`stage-${s.id}`}
              data-state={isDone ? "done" : isCurrent ? "current" : "todo"}
              className="flex scroll-mt-24 flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="m-0 t-section text-ink">
                    <span className="sr-only">{s.n}단계 · </span>
                    <span aria-hidden="true" className={`t-num ${isCurrent ? "text-brand-hanji-ink" : "text-text-3"}`}>
                      {s.n}
                    </span>{" "}
                    {s.title}
                  </h2>
                  {(isCurrent || facts.length > 0) && (
                    <p className="m-0 mt-0.5 truncate t-sub text-text-3">
                      {isCurrent && <span className="font-bold text-brand-hanji-ink">지금 단계</span>}
                      {isCurrent && facts.length > 0 ? " · " : ""}
                      {facts.join(" · ")}
                    </p>
                  )}
                </div>
                {/* 체크 — 조작 버튼이라 아이콘을 남긴다(v4 규칙 7). 이름은 aria-label 이 온전히(동사 + 대상) */}
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
                  aria-pressed={isDone}
                  aria-label={isDone ? `${s.short} 단계 완료` : `${s.short} 단계 완료로 표시`}
                  disabled={!ready}
                  className={`jr-done btn-md press shrink-0 gap-1 ${isDone ? "jr-done--on" : "btn-outline"}`}
                >
                  <Icon
                    key={popKey}
                    name="check"
                    size={16}
                    strokeWidth={2.4}
                    className={isDone && popKey ? "njn-pop-once" : ""}
                  />
                  {isDone ? "완료" : "완료 표시"}
                </button>
              </div>
              <StageTasks stage={s} counts={counts} tone={STAGE_TONES[i % STAGE_TONES.length]} />
            </li>
          );
        })}
      </ol>

      {/* ── [v4 · 규칙 3] 맨 끝 캡션 — 저장 위치 · 로그인 · 체크 지우기 · 안내 한 줄 ── */}
      <div className="flex flex-col gap-1">
        <p className="m-0 t-caption text-text-3" aria-live="polite">
          {syncLine(sync, ready, done, total)}
          {ready && sync === "guest" && (
            <>
              {" "}
              <Link href="/login?callbackUrl=%2Fjourney" className="tap-line font-bold text-primary no-underline">
                로그인 ›
              </Link>
            </>
          )}
        </p>
        <p className="m-0 t-caption text-text-3">일반적인 순서 안내 · 법률·세무 판단은 계약·잔금 일정표의 근거 법령 확인</p>
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
  );
}
