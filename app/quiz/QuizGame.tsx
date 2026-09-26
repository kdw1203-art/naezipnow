"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { Won } from "@/app/components/num/Won";
import { Delta } from "@/app/components/num/Delta";
import { CountUp } from "@/app/components/motion/CountUp";
import { TweenMoney } from "@/app/calculator/TweenMoney";
import { useCopy } from "@/lib/ui/use-copy";
import { formatEokMan } from "@/lib/format/eok-man";
import { pctChange } from "@/lib/format/delta";
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

/* [1008 · Q] 실거래가 게임 — 문제는 페이지(ISR)가 싣고 온 것만 쓴다. 이 컴포넌트는 **네트워크를
   부르지 않는다**(봇이 JS 를 실행해도 API 호출 0 — 1007 실측: 함수 호출의 99% 가 봇).
   기록(오늘·최고)은 이 기기의 localStorage 에만 — 개인화 서버 읽기가 없어야 CDN 캐시가 산다. */

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

function EntryCard({
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
  /** 새 라운드에 올라온 카드 — B 가 A 자리로 올라오는 모양 */
  enter: boolean;
  /** 공개될 때 이 가격(만원)에서 굴러 출발한다 — B 카드만 */
  rollFrom?: number;
}) {
  const toneCls = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink";
  return (
    <article
      className={`card rounded-2xl px-4 py-3.5 ${enter ? "motion-safe:animate-[revealUp_420ms_var(--ease-out)_both]" : ""}`}
      aria-label={`${tag} ${entry.name}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full t-sub font-extrabold ${
            tag === "A" ? "bg-brand-navy text-on-dark" : "bg-brand-hanji text-brand-hanji-ink"
          }`}
          aria-hidden="true"
        >
          {tag}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="t-section break-words text-ink">{entry.name}</h2>
          <p className="mt-0.5 t-sub text-text-3">
            {entry.region}
            {entry.buildYear ? ` · ${entry.buildYear}년 준공` : ""}
          </p>
          <p className="t-sub text-text-3">
            전용 {areaLabel(entry.areaM2)}㎡{floorText(entry)} · {ymDotLabel(entry.ym)} 계약
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2 border-t border-divider pt-2">
        <span className="t-caption font-bold text-text-3">최근 실거래가</span>
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
          <span className="t-title tracking-widest text-text-3">
            <span aria-hidden="true">?억 ????만</span>
            <span className="sr-only">가격은 답한 뒤 공개돼요</span>
          </span>
        )}
      </div>
    </article>
  );
}

export function QuizGame({ days }: { days: QuizDay[] }) {
  const [day, setDay] = useState<QuizDay>(days[0]);
  const [stale, setStale] = useState(false);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>("play");
  const [results, setResults] = useState<boolean[]>([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [store, setStore] = useState<QuizStore | null>(null);
  /** 다시 풀기 — 오늘 기록(첫 판)을 바꾸지 않는다 */
  const [replay, setReplay] = useState(false);
  /** 방금 끝낸 판인가(조각은 이때만) */
  const [justFinished, setJustFinished] = useState(false);
  const nextRef = useRef<HTMLButtonElement | null>(null);
  const { copy, copied } = useCopy("결과를 복사했어요");

  const total = day.entries.length - 1;
  const a = day.entries[Math.min(round, total - 1)];
  const b = day.entries[Math.min(round + 1, total)];
  const lastOk = results[results.length - 1] === true;

  /* 마운트 뒤: 오늘(KST) 판 고르기 + 이 기기 기록 읽기. 오늘 이미 풀었으면 결과부터 */
  useEffect(() => {
    const today = kstDateOf(Date.now());
    const picked = pickDay(days, today);
    const s = readStore();
    setDay(picked);
    setStale(picked.date !== today);
    setStore(s);
    if (s.days[picked.date]) setPhase("done");
  }, [days]);

  const answer = useCallback(
    (guess: QuizGuess) => {
      if (phase !== "play") return;
      const ok = isCorrectGuess(a.priceManwon, b.priceManwon, guess);
      const nextStreak = ok ? streak + 1 : 0;
      setResults((r) => [...r, ok]);
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
    setStreak(0);
    setBestStreak(0);
    setReplay(true);
    setJustFinished(false);
    setPhase("play");
  };

  /* 공개 뒤 "다음" 버튼으로 포커스 — 키보드만으로 끝까지 간다(스크롤은 건드리지 않는다) */
  useEffect(() => {
    if (phase === "reveal") nextRef.current?.focus({ preventScroll: true });
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
        await navigator.share({ title: "실거래가 게임 — 더 비쌀까, 더 쌀까?", text, url });
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

  const caption = (
    <p className="t-caption leading-relaxed text-text-3">
      국토교통부 실거래가 신고(해제 신고 제외) · 아파트 전용 80~86㎡ · {ymDotLabel(day.fromYm)}~
      {ymDotLabel(day.toYm)} 계약 중 단지별 가장 최근 1건 · 매물 호가가 아니에요. 같은 날엔 누구에게나
      같은 문제가 나와요.
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
      <div className="mt-3 flex flex-col gap-3">
        <section className="card relative overflow-hidden rounded-[18px] px-5 py-6 text-center" aria-label="오늘 결과">
          {burst && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 motion-reduce:hidden">
              {CONFETTI.map(([dx, dy, rot], i) => (
                <span
                  key={i}
                  className={`absolute left-1/2 top-[42%] h-[7px] w-[7px] rounded-[2px] opacity-0 motion-safe:animate-[njnConfetti_1.4s_ease-out_forwards] ${CONFETTI_TONES[i % CONFETTI_TONES.length]}`}
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
              <CountUp value={rec.score} className="t-display font-extrabold" />
            ) : (
              <span className="t-display font-extrabold">{rec.score}</span>
            )}
            <span className="t-title text-text-3"> / {rec.total}</span>
          </p>
          <p className="mt-1 t-body font-bold text-text-1">{quizScoreMessage(rec.score, rec.total)}</p>
          <p className="mt-1 t-sub text-text-3">
            최장 연속 정답 {rec.streak}
            {best && !(best.date === day.date && best.score === rec.score && best.streak === rec.streak)
              ? ` · 최고 기록 ${best.score}/${best.total}(${quizDateLabel(best.date)})`
              : ""}
            {replay ? " · 오늘 기록은 첫 판만 남아요" : ""}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {/* [1009 · T] 복사로 넘어간 공유는 버튼 자리에서도 "복사했어요" + 체크가 한 번 튄다(토스트와 함께) */}
            <button
              type="button"
              onClick={() => void share(shareRec, shareAsReplay)}
              className="btn-primary inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 t-body font-extrabold"
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
              다시 풀어 보기
            </button>
          </div>
          <p className="mt-3 inline-flex items-center justify-center gap-1 t-sub text-text-2">
            <Icon name="calendar" size={14} />
            내일 0시(한국 시간)에 새 문제가 열려요
          </p>
        </section>

        <section aria-labelledby="quiz-seen" className="flex flex-col gap-2">
          <h2 id="quiz-seen" className="px-0.5 t-section text-ink">
            오늘 본 단지 <span className="t-sub font-medium text-text-3">{day.entries.length}곳</span>
          </h2>
          <p className="px-0.5 t-sub text-text-3">
            마음에 걸린 단지가 있나요? 눌러서 면적대별 실거래·거래 흐름을 자세히 볼 수 있어요.
          </p>
          <ol className="flex flex-col gap-1.5">
            {day.entries.map((e, i) => {
              /* 방금 푼 판이면 이 단지가 B 였던 라운드의 결과(첫 단지는 A 로만 나왔다) */
              const hit = i > 0 && results.length === total ? results[i - 1] : null;
              return (
              <li key={`${e.region}|${e.name}`}>
                <Link
                  href={e.href}
                  className="card tile flex min-h-11 items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 no-underline"
                >
                  <span className="min-w-0">
                    <span className="block t-body font-bold break-words text-ink">
                      {hit !== null && (
                        <span
                          className={`mr-1.5 inline-block rounded px-1 align-[1px] t-caption font-extrabold ${
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
                  <span className="shrink-0 text-right t-body font-extrabold tabular-nums text-ink">
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
    );
  }

  const up = fact?.direction === "higher";
  return (
    <div className="mt-3 flex flex-col gap-2.5">
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="t-sub font-bold text-text-2">
          {quizDateLabel(day.date)} {stale ? "문제 · 새 문제를 준비하고 있어요" : "오늘의 문제"}
        </p>
        <div className="flex items-center gap-1.5">
          {streak >= 2 && (
            <span
              key={streak}
              className="inline-flex items-center gap-0.5 rounded-full bg-warning-soft px-2 py-0.5 t-sub font-extrabold text-warning motion-safe:animate-[njnPop_420ms_var(--njn-pop)]"
            >
              <Icon name="flame" size={13} />
              {streak}연속
            </span>
          )}
          <span className="t-sub font-bold tabular-nums text-text-3">
            {round + 1} / {total}
          </span>
        </div>
      </div>
      <ol className="flex gap-1" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <li
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i < results.length ? (results[i] ? "bg-success" : "bg-danger") : i === round ? "bg-primary" : "bg-divider"
            }`}
          />
        ))}
      </ol>

      <EntryCard key={`a-${round}`} tag="A" entry={a} revealed enter={round > 0} />
      <div className="relative z-[1] -my-4 flex justify-center" aria-hidden="true">
        <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 t-caption font-extrabold text-text-3">
          VS
        </span>
      </div>
      <EntryCard
        key={`b-${round}`}
        tag="B"
        entry={b}
        revealed={phase === "reveal"}
        tone={up ? "up" : "down"}
        enter={round > 0}
        rollFrom={a.priceManwon}
      />

      {phase === "reveal" && fact && (
        <div
          className={`rounded-2xl px-4 py-3 motion-safe:animate-[scaleIn_260ms_var(--ease-out)_both] ${
            lastOk ? "bg-success-soft" : "bg-danger-soft"
          }`}
        >
          <p className={`t-body font-extrabold ${lastOk ? "text-success" : "text-danger"}`}>
            {lastOk ? "정답!" : "아쉬워요"}
          </p>
          {/* [1009 · T] 차이는 등락 표기 한 토막(<Delta>: ▲ 빨강/▼ 파랑 · 금액 먼저 · 기준 = A) — 예전 "(+12%)" 는 색·화살표 없이
              반올림 정수였다 */}
          <p className="mt-0.5 t-body text-text-1">
            B는 A보다{" "}
            <Delta
              pct={pctChange(b.priceManwon, a.priceManwon)}
              diffManwon={b.priceManwon - a.priceManwon}
              className="font-bold"
            />{" "}
            {up ? "비싸요" : "싸요"} · {ymDotLabel(b.ym)}
            {floorText(b)}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-3">
            <Link href={b.href} className="inline-flex min-h-[24px] items-center t-sub font-bold text-primary">
              {b.name} 보기 ›
            </Link>
            <Link href={a.href} className="inline-flex min-h-[24px] items-center t-sub font-bold text-text-2">
              {a.name} 보기 ›
            </Link>
          </p>
        </div>
      )}

      {/* 엄지 영역 — 모바일은 탭바 위에 붙는다(바닥에 닿기 전엔 제자리) */}
      <div className="sticky bottom-[calc(var(--nz-tabbar-offset)+8px)] z-10 md:bottom-4">
        {phase === "play" ? (
          <div className="glass rounded-2xl p-1.5 shadow-[var(--shadow-float)]">
            <p className="px-1 pb-1.5 pt-0.5 text-center t-sub font-bold text-text-2">
              B가 A보다 더 비쌀까요, 더 쌀까요?
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => answer("lower")}
                className="press inline-flex min-h-[52px] items-center justify-center gap-1.5 rounded-xl bg-down-soft t-section font-extrabold text-down"
              >
                ▼ 더 싸요
                <kbd className="hidden rounded border border-line px-1 t-caption font-bold text-text-3 pointer-fine:inline">←</kbd>
              </button>
              <button
                type="button"
                onClick={() => answer("higher")}
                className="press inline-flex min-h-[52px] items-center justify-center gap-1.5 rounded-xl bg-up-soft t-section font-extrabold text-up"
              >
                ▲ 더 비싸요
                <kbd className="hidden rounded border border-line px-1 t-caption font-bold text-text-3 pointer-fine:inline">→</kbd>
              </button>
            </div>
          </div>
        ) : (
          <div className="glass rounded-2xl p-1.5 shadow-[var(--shadow-float)]">
            <button
              ref={nextRef}
              type="button"
              onClick={next}
              /* h-[52px] — 터치 기기의 .btn-primary 하한(44px, globals.css)이 min-h 유틸을 이겨 답 버튼(52px)보다 낮아졌다 */
              className="btn-primary inline-flex h-[52px] w-full items-center justify-center gap-1.5 rounded-xl t-section font-extrabold"
            >
              {round + 1 < total ? "다음 문제 →" : "결과 보기"}
            </button>
          </div>
        )}
      </div>
      {caption}
    </div>
  );
}
