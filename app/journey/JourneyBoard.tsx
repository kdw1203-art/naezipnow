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
import { formatKoreanDay, kstDayOf } from "@/lib/journey/dates";

/* ============================================================
   [1008 · J] /journey — 내 집 마련 여정 6단계.

   구성 문법은 분석 허브(app/analysis/page.tsx)와 같다: 네이비 히어로(.hub-hero) 한 장이 "지금 어디"를 말하고,
   그 아래 카드가 "무엇을"을 말한다. 재미는 세 순간에만 — 진행 링이 차오를 때, 체크 표시가 한 번 튈 때
   (njnPop), 여섯 단계를 다 채웠을 때의 도장 장면(MomentProvider celebrate). 전부 prefers-reduced-motion 에서 멈춘다.

   서버 HTML 은 모두에게 같다(정적 페이지) — 진행·신호는 마운트 뒤 이 기기/계정에서 읽는다(lib/journey/client-store).
   ============================================================ */

const RING_R = 40;
const RING_C = 2 * Math.PI * RING_R;

function ProgressRing({ done, total, ready }: { done: number; total: number; ready: boolean }) {
  const ratio = total > 0 ? done / total : 0;
  return (
    <div className="jr-ring" data-ready={ready ? "true" : "false"}>
      <svg viewBox="0 0 96 96" width="96" height="96" aria-hidden="true">
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
        <span className="t-title t-num font-bold text-on-dark">
          {done}
          <span className="t-sub font-bold text-on-dark-muted">/{total}</span>
        </span>
        <span className="t-caption font-bold text-on-dark-muted">단계 완료</span>
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

/* [1015 · 규칙 I] 단계 카드 안의 할 일은 리퀴드 행 목록(lq-panel + divide-y) — 단계 순서대로 blue/hanji/mint/sand 순환.
   격자 타일 → 행(이름 / 한 줄 / ›). 카드·히어로 뼈대는 그대로. */
const STAGE_TONES = ["blue", "hanji", "mint", "sand"] as const;

function StageTasks({ stage, tone }: { stage: JourneyStage; tone: (typeof STAGE_TONES)[number] }) {
  return (
    <ul data-tone={tone} className="lq-panel m-0 flex list-none flex-col divide-y p-0">
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

export function JourneyBoard() {
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

  return (
    <div className="flex flex-col gap-5 max-md:gap-3 md:gap-6">
      {/* ── 히어로: 지금 어디 — 진행 링 + 여섯 칸 ── */}
      {/* 워터마크(BrandWatermark)는 두지 않는다 — 오른쪽 위가 진행 링 자리라 곡선이 "다음 단계" 글자 뒤를 지났다 */}
      {/* [1015 · 규칙 D] 물음형 제목 → 명사. 안내 문단("여섯 단계로 나눴어요…")은 히어로의 단계 칸이 이미 말하므로 뺐다.
          [1015 · 규칙 E] 폰 안쪽 여백·간격 압축(max-md:) */}
      <section className="hub-hero card-pad-lg flex flex-col gap-4 max-md:gap-3 max-md:py-4" aria-labelledby="journey-title">
        <div className="flex flex-col gap-4 max-md:gap-3 md:flex-row md:items-center md:justify-between md:gap-6">
          <div className="flex max-w-[600px] flex-col gap-1.5">
            <span className="t-caption font-bold tracking-wider text-on-dark-muted">6단계</span>
            <h1 id="journey-title" className="t-display text-balance text-on-dark">
              내 집 마련 여정
            </h1>
            <p className="t-body max-w-[52ch] text-on-dark-muted">시장 감 · 예산 · 후보 · 임장 · 비교 · 계약</p>
          </div>
          <div className="flex items-center gap-4">
            <ProgressRing done={done} total={total} ready={ready} />
            <div className="flex min-w-0 flex-col gap-1.5">
              {ready && currentStage ? (
                <>
                  <span className="t-caption font-bold text-on-dark-muted">다음 단계</span>
                  <a
                    href={`#stage-${currentStage.id}`}
                    className="brand-photo-chip chip inline-flex min-h-[40px] w-fit items-center gap-1.5 px-3 t-sub font-bold no-underline"
                  >
                    {currentStage.n}. {currentStage.title} ›
                  </a>
                </>
              ) : ready ? (
                <span className="t-sub font-bold text-on-dark">여섯 단계 모두 완료</span>
              ) : (
                <span className="t-sub text-on-dark-muted">진행 상황 확인 중</span>
              )}
            </div>
          </div>
        </div>

        <nav aria-label="여정 단계 바로가기" className="grid grid-cols-3 gap-1.5 lg:grid-cols-6">
          {JOURNEY_STAGES.map((s) => {
            const isDone = ready && Boolean(state.done[s.id]);
            const isCurrent = ready && current === s.id;
            const signal = !isDone ? signalFor(s.id) : null;
            return (
              <a
                key={s.id}
                href={`#stage-${s.id}`}
                aria-current={isCurrent ? "step" : undefined}
                data-state={isDone ? "done" : isCurrent ? "current" : "todo"}
                className="jr-step"
              >
                <span className="jr-step__n" aria-hidden="true">
                  {isDone ? <Icon name="check" size={12} strokeWidth={3} /> : s.n}
                </span>
                <span className="min-w-0 truncate md:hidden">{s.short}</span>
                <span className="hidden min-w-0 truncate md:inline">{s.title}</span>
                {isDone && <span className="sr-only">(완료)</span>}
                {/* [1009 · T] title= 말풍선 제거 — 휴대폰에서는 보이지 않았다. 무엇이 진행 중인지는 아래 단계 카드의
                    "진행 중 · …" 배지가 글로 말한다 */}
                {signal && (
                  <span className="jr-step__dot">
                    <span className="sr-only">(진행 중)</span>
                  </span>
                )}
              </a>
            );
          })}
        </nav>
        <p className="m-0 t-caption text-on-dark-muted" aria-live="polite">
          {syncLine(sync, ready)}
          {ready && sync === "guest" && (
            <>
              {" "}
              <Link
                href="/login?callbackUrl=%2Fjourney"
                className="inline-flex min-h-[24px] items-center font-bold text-on-dark underline-offset-2 hover:underline"
              >
                로그인 ›
              </Link>
            </>
          )}
        </p>
      </section>

      {/* ── 여섯 단계 ── */}
      <ol className="m-0 flex list-none flex-col gap-3 p-0 max-md:gap-2" aria-label="내 집 마련 여섯 단계">
        {JOURNEY_STAGES.map((s, si) => {
          const doneAt = ready ? state.done[s.id] ?? null : null;
          const isDone = Boolean(doneAt);
          const isCurrent = ready && current === s.id;
          const signal = !isDone ? signalFor(s.id) : null;
          const popKey = pop?.id === s.id ? pop.n : 0;
          return (
            <li
              key={s.id}
              id={`stage-${s.id}`}
              data-state={isDone ? "done" : isCurrent ? "current" : "todo"}
              className="jr-stage card scroll-mt-24 rounded-2xl p-4 max-md:p-3.5 md:p-5"
            >
              <div className="flex items-start gap-3">
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
                <span className="jr-stage__icon hidden sm:flex" aria-hidden="true">
                  <Icon name={s.icon} size={18} />
                </span>
              </div>

              <div className="mt-3 max-md:mt-2">
                <StageTasks stage={s} tone={STAGE_TONES[si % STAGE_TONES.length]} />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-3 max-md:mt-2 max-md:pt-2">
                {/* 체크한 날만 — "끝냈으면 체크해 두세요" 사용법 문장은 뺐다(버튼이 곧 그 말이다) */}
                <span className="t-caption text-text-3">
                  {isDone && doneAt ? `${formatKoreanDay(kstDayOf(doneAt) ?? doneAt.slice(0, 10))} 체크` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
                  aria-pressed={isDone}
                  disabled={!ready}
                  className={`jr-done btn-md press gap-1.5 ${isDone ? "jr-done--on" : "btn-soft"}`}
                >
                  <Icon name="check" size={16} strokeWidth={2.4} />
                  {isDone ? "완료" : "완료로 표시"}
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      {/* ── 끝: 계약 입구 ── */}
      {/* [1015 · 규칙 D] 물음형 제목("계약을 앞두고 있나요?") → 명사. 설명 한 줄은 사실만 */}
      <section className="card flex flex-col gap-3 rounded-2xl p-4 max-md:gap-2 max-md:p-3.5 md:flex-row md:items-center md:justify-between md:p-5">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="t-section text-ink">계약·잔금 일정표</span>
          <span className="t-sub text-text-2">계약일·잔금일 입력 → 거래신고·취득세·등기·전입신고 기한을 날짜순으로</span>
        </div>
        <Link href="/journey/contract" className="btn-primary btn-md shrink-0 no-underline">
          일정표 만들기
        </Link>
      </section>

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
  );
}
