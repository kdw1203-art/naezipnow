"use client";

import Link from "next/link";
import { quizDateLabel, type QuizDay, type QuizStore } from "@/lib/quiz/price-game";

/* [1020 · 게임 /quiz] 오른쪽 레일(lg 만) — 소유자 지시("시안대로 좀더 고도화", quiz-d.png)대로 두 카드:
   ① 기록 — 이 기기 localStorage(readStore) 에 **있는 값만** 줄로(참여한 날 수 · 오늘 · 최고 기록 · 지금 판 연속).
      없는 값은 줄을 통째로 생략하고, 줄이 하나도 없으면 카드도 생략. 로그인 안내는 넣지 않는다(기록은 기기 저장이 사실).
   ② 지금까지 나온 단지 — 공개된 것만(인덱스 ≤ round+1). 공개 전 B 는 이름만(링크·지역 없음 — 단지 허브로 가면 가격이 보인다).
      결과 화면에서는 전부. 시안의 "이번 주 · 전체 정답률" 은 저장소에 없는 값이라 그리지 않는다. */

export function QuizRail({
  day,
  store,
  round,
  revealed,
  done,
  streak,
}: {
  day: QuizDay;
  store: QuizStore | null;
  round: number;
  /** 이번 라운드 B 가 공개됐나 */
  revealed: boolean;
  done: boolean;
  /** 지금 판 연속 정답 */
  streak: number;
}) {
  const dayCount = store ? Object.keys(store.days).length : 0;
  const today = store?.days[day.date] ?? null;
  const best = store?.best ?? null;
  const rows: Array<{ k: string; v: string; sub?: string }> = [];
  if (dayCount > 0) rows.push({ k: "참여한 날", v: `${dayCount}일` });
  if (today) rows.push({ k: "오늘", v: `${today.score} / ${today.total}` });
  if (best) rows.push({ k: "최고 기록", v: `${best.score} / ${best.total}`, sub: quizDateLabel(best.date) });
  if (!done && streak > 0) rows.push({ k: "지금 판 연속", v: `${streak}` });

  /* 공개된 단지 — 라운드 r 의 A 는 entries[r], B 는 entries[r+1]. 공개 전 B 는 이름만 */
  const shownUntil = done ? day.entries.length - 1 : round + 1;
  const entries = day.entries.slice(0, shownUntil + 1);
  const hiddenIdx = done || revealed ? -1 : round + 1;

  return (
    <aside
      className="hidden lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:flex lg:flex-col lg:gap-3 lg:sticky lg:top-[76px] lg:self-start"
      aria-label="게임 기록"
    >
      {rows.length > 0 && (
        <section className="card rounded-2xl p-3">
          <h2 className="t-caption font-bold text-text-3">기록</h2>
          <dl className="mt-1.5 flex flex-col gap-1.5">
            {rows.map((r) => (
              <div key={r.k} className="flex items-baseline justify-between gap-2 t-sub">
                <dt className="text-text-2">{r.k}</dt>
                <dd className="m-0 text-right tabular-nums font-bold text-ink">
                  {r.v}
                  {r.sub ? <span className="ml-1 t-caption font-medium text-text-3">{r.sub}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 border-t border-line pt-2 t-caption text-text-3">이 기기에 저장 · 첫 판만 기록</p>
        </section>
      )}

      <section className="card rounded-2xl p-3" aria-label="지금까지 나온 단지">
        <h2 className="t-caption font-bold text-text-3">
          {done ? "오늘 나온 단지" : "지금까지 나온 단지"}{" "}
          <span className="font-medium">{entries.length}곳</span>
        </h2>
        <ol className="m-0 mt-1.5 flex list-none flex-col gap-1 p-0">
          {entries.map((e, i) => (
            <li key={`${e.region}|${e.name}`} className="flex items-center justify-between gap-2 t-sub">
              {i === hiddenIdx ? (
                <span className="min-w-0 truncate text-text-2">{e.name}</span>
              ) : (
                <>
                  <Link href={e.href} className="min-w-0 truncate font-bold text-ink no-underline">
                    {e.name}
                  </Link>
                  <span className="shrink-0 t-caption text-text-3">{e.region}</span>
                </>
              )}
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}
