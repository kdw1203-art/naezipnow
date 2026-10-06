"use client";

import { useState } from "react";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";
import { useToast } from "@/app/components/toast/ToastProvider";
import {
  applyMyRating,
  filledWidthPx,
  RATING_MAX,
  type RatingSummary,
} from "@/lib/inspection/note-rating-math";

/* [1043 · 임장노트 참여] 독자 평가 — 공개 임장노트에 읽은 사람이 별점(1~5)을 남긴다.
 *
 * 소유자 지시(2026-10-06): "임장노트에 사용자가 별점이나 점수를 매겨서 평가를 하고 댓글도 달고 사용자가 참여하는 임장노트".
 * 댓글(NoteComments)과 한 카드 안에 선다 — 위는 평가, 아래는 댓글.
 *
 *  · 왼쪽: 지금까지의 평균과 인원(서버 값). 0명이면 "평가 없음"(0점이라고 적지 않는다)
 *  · 오른쪽: 내 평가 — 별 다섯 개(칸마다 40px). 누르면 바로 저장되고, 다시 누르면 바뀐다(한 사람 한 번)
 *  · 로그인 전에는 누르면 로그인 안내(댓글 칸과 같은 길) · 내 노트에는 누르는 별이 없다(작성자의 항목 점수는 노트 안에 있다)
 * 누가 몇 점을 줬는지는 서버에서 내려오지 않는다 — 평균·인원·내 점수뿐. 권한의 진실은 서버(POST …/rating)가 다시 본다. */

const STAR_PATH =
  "M11.5 2.5a.55.55 0 0 1 1 0l2.6 5.3 5.8.8a.55.55 0 0 1 .3.95l-4.2 4 1 5.8a.55.55 0 0 1-.8.6L12 17.8l-5.2 2.75a.55.55 0 0 1-.8-.6l1-5.8-4.2-4a.55.55 0 0 1 .3-.95l5.8-.8Z";

function Star({ on, size }: { on: boolean; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={on ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="round"
      aria-hidden="true"
      className={on ? "text-warning" : "text-line-strong"}
    >
      <path d={STAR_PATH} />
    </svg>
  );
}

export function NoteRating({
  noteId,
  initial,
  initialMine,
  loggedIn,
  isOwner,
}: {
  noteId: string;
  initial: RatingSummary;
  initialMine: number | null;
  loggedIn: boolean;
  isOwner: boolean;
}) {
  const { promptSignup } = useSoftSignup();
  const { showToast } = useToast();
  const [summary, setSummary] = useState<RatingSummary>(initial);
  const [mine, setMine] = useState<number | null>(initialMine);
  const [hover, setHover] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const askLogin = () =>
    promptSignup({
      action: "note_rating",
      title: "로그인 필요 · 평가",
      benefit: "로그인하면 평가가 계정에 남고, 언제든 바꿀 수 있어요.",
    });

  async function rate(stars: number) {
    if (busy) return;
    if (!loggedIn) {
      askLogin();
      return;
    }
    if (stars === mine) return;
    const before = { summary, mine };
    /* 먼저 그린다 — 서버 값이 오면 그 값으로 덮는다(다른 사람의 평가가 그 사이 들어왔을 수 있다) */
    setSummary(applyMyRating(summary, mine, stars));
    setMine(stars);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inspection/notes/${noteId}/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stars }),
      });
      if (res.status === 401) {
        setSummary(before.summary);
        setMine(before.mine);
        askLogin();
        return;
      }
      const data = (await res.json().catch(() => null)) as
        | { count?: number; average?: number | null; mine?: number | null; error?: string }
        | null;
      if (!res.ok || !data || typeof data.count !== "number") {
        setSummary(before.summary);
        setMine(before.mine);
        setError(data?.error ?? "평가 저장 실패 · 잠시 후 다시");
        return;
      }
      setSummary({ count: data.count, average: data.average ?? null });
      setMine(data.mine ?? stars);
      showToast(before.mine ? "평가를 바꿨어요" : "평가를 남겼어요");
    } catch {
      setSummary(before.summary);
      setMine(before.mine);
      setError("연결 끊김 · 다시 시도");
    } finally {
      setBusy(false);
    }
  }

  const preview = hover ?? mine ?? 0;

  return (
    <div id="rating" className="flex scroll-mt-24 flex-col gap-2">
      <div className="t-body font-bold text-ink">독자 평가 {summary.count.toLocaleString("ko-KR")}</div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        {/* 지금까지의 평가 — 평균 · 별 · 인원 */}
        {summary.count > 0 && summary.average != null ? (
          <div className="flex items-center gap-2.5" aria-label={`독자 평가 평균 ${summary.average.toFixed(1)}점 · ${summary.count}명`}>
            <span className="t-title t-num text-ink">{summary.average.toFixed(1)}</span>
            {/* 평균만큼만 채운다(4.5 = 네 개 반) — 빈 별 다섯 위에 채운 별 다섯을 평균 너비로 잘라 겹친다.
                별 18px · 간격 2px: 채운 너비 = 꽉 찬 별 수 × 20 + 남은 소수 × 18 */}
            <span className="relative inline-flex" aria-hidden="true">
              <span className="flex items-center gap-0.5">
                {Array.from({ length: RATING_MAX }, (_, i) => (
                  <Star key={i} on={false} size={18} />
                ))}
              </span>
              <span
                className="absolute inset-y-0 left-0 flex items-center gap-0.5 overflow-hidden"
                style={{ width: filledWidthPx(summary.average, 18, 2) }}
              >
                {Array.from({ length: RATING_MAX }, (_, i) => (
                  <span key={i} className="shrink-0">
                    <Star on size={18} />
                  </span>
                ))}
              </span>
            </span>
            <span className="t-sub text-text-3">{summary.count.toLocaleString("ko-KR")}명</span>
          </div>
        ) : (
          <p className="t-body text-text-3">평가 없음</p>
        )}

        {/* 내 평가 — 내 노트에는 그리지 않는다 */}
        {!isOwner && (
          <div className="flex items-center gap-2">
            <span className="t-sub font-bold text-text-2">{mine ? `내 평가 ${mine}점` : "내 평가"}</span>
            <div
              role="radiogroup"
              aria-label="내 평가(별점)"
              className="flex items-center"
              onMouseLeave={() => setHover(null)}
            >
              {Array.from({ length: RATING_MAX }, (_, i) => {
                const n = i + 1;
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={mine === n}
                    aria-label={`${n}점`}
                    disabled={busy}
                    onClick={() => void rate(n)}
                    onMouseEnter={() => setHover(n)}
                    onFocus={() => setHover(n)}
                    onBlur={() => setHover(null)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg disabled:opacity-60"
                  >
                    <Star on={n <= preview} size={24} />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="t-sub font-bold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
