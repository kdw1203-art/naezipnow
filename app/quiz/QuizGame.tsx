"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { Won } from "@/app/components/num/Won";
import { CountUp } from "@/app/components/motion/CountUp";
import { TweenMoney } from "@/app/calculator/TweenMoney";
import { useCopy } from "@/lib/ui/use-copy";
import { formatEokMan } from "@/lib/format/eok-man";
import {
  QUIZ_STORE_KEY,
  areaLabel,
  compareFact,
  isCorrectGuess,
  kstDateOf,
  parseQuizStore,
  quizDateLabel,
  quizScoreMessage,
  quizShareText,
  recordQuizResult,
  ymDotLabel,
  type QuizDay,
  type QuizDayRecord,
  type QuizEntry,
  type QuizGuess,
  type QuizStore,
} from "@/lib/quiz/price-game";
import { QuizReveal } from "./QuizReveal";
import { QuizRail } from "./QuizRail";

/* [1008 · Q] 실거래가 게임 — 문제는 페이지(ISR)가 싣고 온 것만 쓴다. 이 컴포넌트는 **네트워크를
   부르지 않는다**(봇이 JS 를 실행해도 API 호출 0 — 1007 실측: 함수 호출의 99% 가 봇).
   기록(오늘·최고)은 이 기기의 localStorage 에만 — 개인화 서버 읽기가 없어야 CDN 캐시가 산다.

   [1020] 소유자 지시("시안대로 좀더 고도화", quiz-d/m.png) — "좌우 대결판 + 답 뒤에 배우는 칸".
   · 루트는 `contents` — page.tsx 의 lg 그리드에 본문(가운데 열)·레일(오른쪽 300px, QuizRail)이 각각 칸으로 들어간다.
   · 첫 줄 = 진행 점 10칸 + "N / 10 · 맞힘 M". 대결판은 한 카드: md+ A | VS(세로선 + 네이비 코인) | B, 폰은 세로.
   · 답 줄(▼ B가 더 싸요 / ▲ B가 더 비싸요)은 md+ 에서 카드 안 고정(bg-bg), 폰은 지금처럼 탭바 위 sticky.
   · 공개 칸은 카드 아래 새 카드(QuizReveal: 가격 막대 둘 · 3.3㎡당 · 차이 · 준공/층 차이 · 링크 · 다음 버튼).
   · 끝 화면·키보드·공유·다시 풀기·조각(confetti)·기록 저장 로직은 그대로. */

type Phase = "play" | "reveal" | "done";

function readStore(): QuizStore {
  try {
    return parseQuizStore(window.localStorage.getItem(QUIZ_STORE_KEY));
  } catch {
    return parseQuizStore(null);
  }
}

function writeStore(s: QuizStore): void {
  try {
    window.localStorage.setItem(QUIZ_STORE_KEY, JSON.stringify(s));
  } catch {
    /* 사생활 보호 모드 등 — 기록만 못 남고 게임은 그대로 */
  }
}

/** 오늘(KST) 판을 고른다. HTML 이 오래돼 오늘 판이 없으면 가장 가까운 판 — 날짜는 화면에 그대로 적는다 */
function pickDay(days: readonly QuizDay[], today: string): QuizDay {
  const exact = days.find((d) => d.date === today);
  if (exact) return exact;
  return today > days[days.length - 1].date ? days[days.length - 1] : days[0];
}

function floorText(e: QuizEntry): string {
  return e.floor ? ` · ${e.floor}층` : "";
}

/* 끝 화면 조각 — 결정적 좌표(렌더마다 같은 모양). 모션 최소화면 아예 그리지 않는다 */
const CONFETTI: ReadonlyArray<readonly [number, number, number]> = [
  [-120, -80, 200], [-86, -118, -140], [-40, -130, 90], [8, -140, -210], [52, -124, 160], [96, -104, -90],
  [126, -70, 230], [-132, -24, -60], [138, -18, 120], [-70, -60, 300], [70, -56, -250], [0, -92, 45],
];
const CONFETTI_TONES = ["bg-brand-red", "bg-primary", "bg-warning", "bg-success"] as const;

/* [1009 · T] 공개되는 B 가격은 **A 가격에서 굴러가며** 도착한다(토스증권 체결가 관례) — 오르는지 내리는지가 숫자의 움직임으로
   먼저 보인다. 색은 등락 토큰(--up 빨강 ▲ / --down 파랑 ▼ — lib/format/delta 한국 관례): 예전엔 text-danger/text-primary 라
   오류색·테마색을 빌려 썼다. 굴림은 520ms(카운트업 예외) · 모션 최소화면 바로 최종 값. */
const REVEAL_MS = 520;

/** 대결판 한 면 — 배지 + 지역 · 단지명 · 사실 2×2(준공 / 전용 / 층 / 계약) · 점선 아래 최근 실거래가 */
function Side({
  tag,
  entry,
  revealed,
  tone,
  enter,
  rollFrom,
}: {
  tag: "A" | "B";
  entry: QuizEntry;
  revealed: boolean;
  /** 공개된 B 의 가격 색 — 올랐으면 빨강, 내렸으면 파랑(시세 화면의 ▲▼ 관례) */
  tone?: "up" | "down";
  /** 새 라운드에 올라온 면 — B 가 A 자리로 올라오는 모양 */
  enter: boolean;
  /** 공개될 때 이 가격(만원)에서 굴러 출발한다 — B 면만 */
  rollFrom?: number;
}) {
  const toneCls = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink";
  const facts: Array<[string, string]> = [
    ["준공", entry.buildYear ? `${entry.buildYear}년` : "—"],
    ["전용", `${areaLabel(entry.areaM2)}㎡`],
    ["층", entry.floor ? `${entry.floor}층` : "—"],
    ["계약", ymDotLabel(entry.ym)],
  ];
  return (
    <article
      className={`flex min-w-0 flex-col gap-1.5 p-4 ${enter ? "motion-safe:animate-[revealUp_420ms_var(--ease-out)_both]" : ""}`}
      aria-label={`${tag} ${entry.name}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full t-caption font-bold text-on-dark ${
            tag === "A" ? "bg-primary" : "bg-brand-red"
          }`}
          aria-hidden="true"
        >
          {tag}
        </span>
        <span className="truncate t-caption text-text-3">{entry.region}</span>
      </div>
      <h2 className="t-section break-words text-ink">{entry.name}</h2>
      <dl className="mt-1 grid grid-cols-2 gap-x-2.5 gap-y-1">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="t-caption font-semibold text-text-3">{k}</dt>
            <dd className="m-0 t-sub text-text-2">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto border-t border-dashed border-line pt-3">
        <p className="t-caption text-text-3">최근 실거래가</p>
        <p className="mt-0.5">
          {revealed ? (
            rollFrom !== undefined ? (
              <span className={`inline-flex items-baseline gap-1 t-title ${toneCls}`}>
                {tone && (
                  <span aria-hidden="true" className="t-sub">
                    {tone === "up" ? "▲" : "▼"}
                  </span>
                )}
                <TweenMoney value={entry.priceManwon} from={rollFrom} unit="만" ms={REVEAL_MS} />
              </span>
            ) : (
              <Won manwon={entry.priceManwon} unit="만" className={`t-title ${toneCls}`} />
            )
          ) : (
            <span className="t-title tracking-wide text-text-3">
              <span aria-hidden="true">?억 ?,???만</span>
              <span className="sr-only">가격은 답한 뒤 공개돼요</span>
            </span>
          )}
        </p>
      </div>
    </article>
  );
}

/** 답 버튼 두 개 — md+ 카드 안 줄과 폰 sticky 줄이 같은 것을 그린다. 공개 뒤에는 고른 쪽만 테두리(inset) */
function AnswerButtons({
  onAnswer,
  picked,
  disabled,
}: {
  onAnswer: (g: QuizGuess) => void;
  picked: QuizGuess | null;
  disabled: boolean;
}) {
  const base = "press inline-flex h-[52px] items-center justify-center gap-1.5 rounded-xl t-section font-bold";
  return (
    <>
      <button
        type="button"
        onClick={() => onAnswer("lower")}
        disabled={disabled}
        aria-pressed={picked === "lower"}
        className={`${base} bg-down-soft text-down ${picked === "lower" ? "qz-ans--picked" : ""}`}
      >
        ▼ B가 더 싸요
        <kbd className="hidden rounded border border-line px-1 t-caption font-bold text-text-3 pointer-fine:inline">←</kbd>
      </button>
      <button
        type="button"
        onClick={() => onAnswer("higher")}
        disabled={disabled}
        aria-pressed={picked === "higher"}
        className={`${base} bg-up-soft text-up ${picked === "higher" ? "qz-ans--picked" : ""}`}
      >
        ▲ B가 더 비싸요
        <kbd className="hidden rounded border border-line px-1 t-caption font-bold text-text-3 pointer-fine:inline">→</kbd>
      </button>
    </>
  );
}

export function QuizGame({ days }: { days: QuizDay[] }) {
  const [day, setDay] = useState<QuizDay>(days[0]);
  const [stale, setStale] = useState(false);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>("play");
  const [results, setResults] = useState<boolean[]>([]);
  const [picked, setPicked] = useState<QuizGuess | null>(null);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [store, setStore] = useState<QuizStore | null>(null);
  /** 다시 풀기 — 오늘 기록(첫 판)을 바꾸지 않는다 */
  const [replay, setReplay] = useState(false);
  /** 방금 끝낸 판인가(조각은 이때만) */
  const [justFinished, setJustFinished] = useState(false);
  /* 다음 버튼은 둘(md+ 공개 카드 안 · 폰 sticky) — 포커스는 보이는 쪽에 */
  const cardNextRef = useRef<HTMLButtonElement | null>(null);
  const stickyNextRef = useRef<HTMLButtonElement | null>(null);
  const { copy, copied } = useCopy("결과를 복사했어요");

  const total = day.entries.length - 1;
  const a = day.entries[Math.min(round, total - 1)];
  const b = day.entries[Math.min(round + 1, total)];
  const lastOk = results[results.length - 1] === true;
  const correct = results.filter(Boolean).length;

  /* 마운트 뒤: 오늘(KST) 판 고르기 + 이 기기 기록 읽기. 오늘 이미 풀었으면 결과부터 */
  useEffect(() => {
    const today = kstDateOf(Date.now());
    const chosen = pickDay(days, today);
    const s = readStore();
    setDay(chosen);
    setStale(chosen.date !== today);
    setStore(s);
    if (s.days[chosen.date]) setPhase("done");
  }, [days]);

  const answer = useCallback(
    (guess: QuizGuess) => {
      if (phase !== "play") return;
      const ok = isCorrectGuess(a.priceManwon, b.priceManwon, guess);
      const nextStreak = ok ? streak + 1 : 0;
      setResults((r) => [...r, ok]);
      setPicked(guess);
      setStreak(nextStreak);
      setBestStreak((best) => Math.max(best, nextStreak));
      setPhase("reveal");
    },
    [phase, a, b, streak],
  );

  const next = useCallback(() => {
    if (phase !== "reveal") return;
    if (round + 1 < total) {
      setRound((r) => r + 1);
      setPicked(null);
      setPhase("play");
      return;
    }
    const rec: QuizDayRecord = { score: results.filter(Boolean).length, total, streak: bestStreak };
    if (!replay) {
      const saved = recordQuizResult(store ?? readStore(), day.date, rec);
      writeStore(saved);
      setStore(saved);
    }
    setJustFinished(true);
    setPhase("done");
  }, [phase, round, total, results, bestStreak, replay, store, day.date]);

  const restart = () => {
    setRound(0);
    setResults([]);
    setPicked(null);
    setStreak(0);
    setBestStreak(0);
    setReplay(true);
    setJustFinished(false);
    setPhase("play");
  };

  /* 공개 뒤 "다음" 버튼으로 포커스 — 키보드만으로 끝까지 간다(스크롤은 건드리지 않는다). 숨은(display:none) 쪽은 건너뛴다 */
  useEffect(() => {
    if (phase !== "reveal") return;
    const el = [cardNextRef.current, stickyNextRef.current].find((n) => n && n.offsetParent !== null);
    el?.focus({ preventScroll: true });
  }, [phase]);

  /* ← 더 싸요 · → 더 비싸요 · 공개 뒤 → 다음(Enter·Space 는 포커스된 버튼이 받는다) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (phase === "play" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        answer(e.key === "ArrowRight" ? "higher" : "lower");
      } else if (phase === "reveal" && e.key === "ArrowRight") {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, answer, next]);

  const share = async (rec: QuizDayRecord, replayShare: boolean) => {
    const text = quizShareText(day.date, rec, replayShare);
    const url = new URL("/quiz", window.location.href).toString();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "실거래가 게임 — 오늘의 10문제", text, url });
        return;
      } catch (e) {
        /* 시트를 닫은 것은 취소 — 클립보드로 대신하지 않는다 */
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    await copy(`${text}\n${url}`);
  };

  const fact = phase !== "play" ? compareFact(a.priceManwon, b.priceManwon) : null;
  const announce =
    phase === "reveal" && fact
      ? `${lastOk ? "정답" : "오답"}. B는 A보다 ${formatEokMan(fact.diffManwon)} ${fact.direction === "higher" ? "비싸요" : "싸요"}.`
      : "";

  /* [1015 · 규칙 D] 각주는 사실 나열 — "~아니에요/~나와요" 없이 */
  const caption = (
    <p className="t-caption leading-relaxed text-text-3">
      국토교통부 실거래가 신고(해제 신고 제외) · 아파트 전용 80~86㎡ · {ymDotLabel(day.fromYm)}~
      {ymDotLabel(day.toYm)} 계약 중 단지별 가장 최근 1건 · 매물 호가 아님 · 같은 날은 같은 문제
    </p>
  );

  if (phase === "done") {
    const firstRec = store?.days[day.date] ?? null;
    const rec: QuizDayRecord =
      !replay && firstRec ? firstRec : { score: results.filter(Boolean).length, total, streak: bestStreak };
    /* [1008 · Q] 다시 풀기는 답을 아는 판이다 — 공유는 그 날의 첫 판 기록으로, 첫 판 기록이 없으면
       "(다시 풀기)"를 붙인다(리뷰 C: 날짜만 붙여 오늘 결과처럼 나갔다) */
    const shareRec = replay && firstRec ? firstRec : rec;
    const shareAsReplay = replay && !firstRec;
    const best = store?.best ?? null;
    const burst = justFinished && rec.score >= Math.ceil(rec.total * 0.8);
    return (
      <div className="contents">
        <div className="mt-3 flex min-w-0 flex-col gap-3 max-md:gap-2.5 lg:col-start-1">
          <section className="card relative overflow-hidden rounded-3xl px-5 py-6 text-center max-md:px-4 max-md:py-4" aria-label="오늘 결과">
            {burst && (
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 motion-reduce:hidden">
                {CONFETTI.map(([dx, dy, rot], i) => (
                  <span
                    key={i}
                    className={`absolute left-1/2 top-[42%] h-[7px] w-[7px] rounded-sm opacity-0 motion-safe:animate-[njnConfetti_1.4s_ease-out_forwards] ${CONFETTI_TONES[i % CONFETTI_TONES.length]}`}
                    style={{ "--dx": `${dx}px`, "--dy": `${dy}px`, "--rot": `${rot}deg` } as CSSProperties}
                  />
                ))}
              </div>
            )}
            <p className="t-sub font-bold text-text-3">
              {quizDateLabel(day.date)} {replay ? "다시 풀기 결과" : "결과"}
            </p>
            {/* [1009 · T] 점수는 방금 끝낸 판에서만 0 부터 굴러 올라간다(CountUp — 화면에 들어올 때 한 번, 모션 최소화면 바로) */}
            <p className="mt-1 tabular-nums text-ink motion-safe:animate-[njnPop_520ms_var(--njn-pop)]">
              {justFinished ? (
                <CountUp value={rec.score} className="t-display font-bold" />
              ) : (
                <span className="t-display font-bold">{rec.score}</span>
              )}
              <span className="t-title text-text-3"> / {rec.total}</span>
            </p>
            <p className="mt-1 t-body font-bold text-text-1">{quizScoreMessage(rec.score, rec.total)}</p>
            <p className="mt-1 t-sub text-text-3">
              최장 연속 정답 {rec.streak}
              {best && !(best.date === day.date && best.score === rec.score && best.streak === rec.streak)
                ? ` · 최고 기록 ${best.score}/${best.total}(${quizDateLabel(best.date)})`
                : ""}
              {replay ? " · 오늘 기록은 첫 판만" : ""}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {/* [1009 · T] 복사로 넘어간 공유는 버튼 자리에서도 "복사했어요" + 체크가 한 번 튄다(토스트와 함께) */}
              <button
                type="button"
                onClick={() => void share(shareRec, shareAsReplay)}
                className="btn-primary inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 t-body font-bold"
              >
                {copied ? (
                  <Icon key="done" name="check" size={16} strokeWidth={2.6} className="njn-pop-once" />
                ) : (
                  <Icon key="share" name="share" size={16} />
                )}
                {copied ? "복사했어요" : replay && firstRec ? "첫 판 기록 공유" : "결과 공유"}
              </button>
              <button
                type="button"
                onClick={restart}
                className="btn-secondary inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 t-body font-bold"
              >
                <Icon name="repeat" size={16} />
                다시 풀기
              </button>
            </div>
            <p className="mt-3 inline-flex items-center justify-center gap-1 t-sub text-text-2">
              <Icon name="calendar" size={14} />
              새 문제는 내일 0시(한국 시간)
            </p>
          </section>

          {/* [1015 · 규칙 B·I] 사용법 문장("마음에 걸린 단지가 있나요? …") 삭제 · 카드 묶음 → 리퀴드 행 목록(blue = 실거래) */}
          <section aria-labelledby="quiz-seen" className="flex flex-col gap-2">
            <h2 id="quiz-seen" className="px-0.5 t-section text-ink">
              오늘 본 단지 <span className="t-sub font-medium text-text-3">{day.entries.length}곳</span>
            </h2>
            <ol data-tone="blue" className="lq-panel m-0 flex list-none flex-col divide-y p-0">
              {day.entries.map((e, i) => {
                /* 방금 푼 판이면 이 단지가 B 였던 라운드의 결과(첫 단지는 A 로만 나왔다) */
                const hit = i > 0 && results.length === total ? results[i - 1] : null;
                return (
                  <li key={`${e.region}|${e.name}`}>
                    <Link
                      href={e.href}
                      className="flex min-h-11 items-center justify-between gap-3 py-2.5 no-underline"
                    >
                      <span className="min-w-0">
                        <span className="block t-body font-bold break-words text-ink">
                          {hit !== null && (
                            <span
                              className={`mr-1.5 inline-block rounded px-1 align-[1px] t-caption font-bold ${
                                hit ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
                              }`}
                            >
                              {hit ? "맞힘" : "틀림"}
                            </span>
                          )}
                          {e.name}
                        </span>
                        <span className="block t-sub text-text-3">
                          {e.region} · 전용 {areaLabel(e.areaM2)}㎡{floorText(e)} · {ymDotLabel(e.ym)}
                        </span>
                      </span>
                      <span className="t-num shrink-0 text-right t-body font-bold text-ink">
                        {formatEokMan(e.priceManwon)}
                        <span className="ml-1 font-bold text-text-3" aria-hidden="true">›</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
          {caption}
        </div>
        <QuizRail day={day} store={store} round={round} revealed done streak={0} />
      </div>
    );
  }

  const up = fact?.direction === "higher";
  return (
    <div className="contents">
      <div className="mt-3 flex min-w-0 flex-col gap-2.5 lg:col-start-1">
        <div aria-live="polite" className="sr-only">
          {announce}
        </div>

        {/* 첫 줄 — 날짜 · 진행 점 10칸 + "N / 10 · 맞힘 M" */}
        <div className="flex items-center justify-between gap-2">
          <p className="t-sub font-bold text-text-2">
            {quizDateLabel(day.date)} {stale ? "문제 · 새 문제 준비 중" : "오늘의 문제"}
          </p>
          <div className="flex flex-col items-end gap-1">
            <ol className="flex gap-1" aria-hidden="true">
              {Array.from({ length: total }, (_, i) => (
                <li
                  key={i}
                  className={`h-1.5 w-4 rounded-full md:w-5 ${
                    i < results.length ? (results[i] ? "bg-success" : "bg-danger") : i === round ? "bg-primary" : "bg-divider"
                  }`}
                />
              ))}
            </ol>
            <p className="flex items-center gap-1.5 t-caption tabular-nums text-text-3">
              {streak >= 2 && (
                <span
                  key={streak}
                  className="inline-flex items-center gap-0.5 rounded-full bg-warning-soft px-1.5 py-0.5 font-bold text-warning motion-safe:animate-[njnPop_420ms_var(--njn-pop)]"
                >
                  <Icon name="flame" size={12} />
                  {streak}연속
                </span>
              )}
              <span>
                {round + 1} / {total} · 맞힘 {correct}
              </span>
            </p>
          </div>
        </div>

        {/* 대결판 — 한 카드: md+ A | VS | B, 폰은 세로. 답 줄은 md+ 에서만 카드 안(폰은 아래 sticky) */}
        <section className="card overflow-hidden rounded-2xl" aria-label="오늘의 문제 대결판">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)]">
            <Side key={`a-${round}`} tag="A" entry={a} revealed enter={round > 0} />
            <div className="qz-vs" aria-hidden="true">
              <b>VS</b>
            </div>
            <Side
              key={`b-${round}`}
              tag="B"
              entry={b}
              revealed={phase === "reveal"}
              tone={up ? "up" : "down"}
              enter={round > 0}
              rollFrom={a.priceManwon}
            />
          </div>
          <div className="hidden grid-cols-2 gap-2 border-t border-line bg-bg p-3 md:grid">
            <AnswerButtons onAnswer={answer} picked={picked} disabled={phase !== "play"} />
          </div>
        </section>
        {caption}

        {phase === "reveal" && (
          <QuizReveal
            key={`r-${round}`}
            a={a}
            b={b}
            ok={lastOk}
            round={round}
            total={total}
            onNext={next}
            nextRef={cardNextRef}
          />
        )}

        {/* 엄지 영역 — 폰만: 탭바 위에 붙는다(바닥에 닿기 전엔 제자리). md+ 는 카드 안 줄이 대신한다 */}
        <div className="sticky bottom-[calc(var(--nz-tabbar-offset)+8px)] z-10 md:hidden">
          {phase === "play" ? (
            <div className="glass grid grid-cols-2 gap-1.5 rounded-2xl p-1.5 shadow-[var(--shadow-float)]">
              <AnswerButtons onAnswer={answer} picked={null} disabled={false} />
            </div>
          ) : (
            <div className="glass rounded-2xl p-1.5 shadow-[var(--shadow-float)]">
              <button
                ref={stickyNextRef}
                type="button"
                onClick={next}
                /* h-[52px] — 터치 기기의 .btn-primary 하한(44px, globals.css)이 min-h 유틸을 이겨 답 버튼(52px)보다 낮아졌다 */
                className="btn-primary inline-flex h-[52px] w-full items-center justify-center gap-1.5 rounded-xl t-section font-bold"
              >
                {round + 1 < total ? `다음 문제 (${round + 2} / ${total})` : "결과 보기"}
              </button>
            </div>
          )}
        </div>
      </div>
      <QuizRail day={day} store={store} round={round} revealed={phase === "reveal"} done={false} streak={streak} />
    </div>
  );
}
