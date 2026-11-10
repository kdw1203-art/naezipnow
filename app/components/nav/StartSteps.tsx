"use client";

import { useEffect, useState } from "react";
import Link from "@/app/components/IntentLink";
import { readAuthedHint } from "@/lib/auth/authed-hint";
import { START_HEADING, START_STEPS, currentStep, signupHref, type StartFrom } from "@/lib/nav/start-steps";

/* [1124 · 처음 온 사람의 길] 비회원에게만 보이는 네 단계 줄(가입 → 임장노트 → 지도 → AI 분석) + 전문가 등록 한 줄.
   서버 HTML 에 그대로 실려 나가고(공유 캐시 화면 · 크롤 경로), 로그인 힌트 쿠키가 있으면 마운트 뒤 걷는다 —
   회원에게 "가입" 을 다시 권하지 않는다. 채움 버튼 없음(화면의 주 버튼은 그 화면의 것). */
export function StartSteps({ from, returnTo, className = "" }: { from: StartFrom; returnTo?: string; className?: string }) {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    setAuthed(readAuthedHint());
  }, []);
  if (authed) return null;
  const here = currentStep(from);
  return (
    <section aria-labelledby={`start-steps-${from}`} className={`card rounded-2xl p-[var(--pad-card)] ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={`start-steps-${from}`} className="m-0 t-section text-ink">
          {START_HEADING[from]}
        </h2>
        {/* [1125] 비회원은 /my/expert-profile 에서 로그인 벽만 봤다 — 등록 신청 화면으로 바로 */}
        <Link href="/town/experts/apply" className="tap-line inline-block py-[5px] t-sub font-bold text-primary no-underline">
          중개사 · 전문가 등록 ›
        </Link>
      </div>
      <ol className="m-0 mt-2.5 grid list-none grid-cols-2 gap-2 p-0 md:grid-cols-4">
        {START_STEPS.map((s, i) => {
          const inner = (
            <>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft t-caption font-bold text-primary tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block t-body font-bold text-ink">{s.title}</span>
                <span className="block t-caption text-text-3 break-words">{s.key === here ? "지금 보는 화면" : s.sub}</span>
              </span>
            </>
          );
          return (
            <li key={s.key}>
              {s.key === here ? (
                <div className="flex min-h-14 items-center gap-2.5 rounded-xl border border-line bg-bg px-3 py-2">{inner}</div>
              ) : (
                <Link
                  href={s.key === "signup" ? signupHref(returnTo) : s.href}
                  className="press flex min-h-14 items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2 no-underline hover:border-line-strong"
                >
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default StartSteps;
