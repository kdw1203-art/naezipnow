"use client";

import { useState } from "react";
import { Icon } from "@/app/components/Icon";

/**
 * AI 출력 품질 피드백 — 도움됨/부족함.
 * KPI·퍼널의 AI 실행 수와 분리해 `ai_feedback` 이벤트로만 쌓는다.
 *
 * [987 · 후기 수집] 여기에 **한 줄**을 받는 자리를 붙였다.
 *
 * 배경: 바깥 피드백으로 "고객 후기 페이지를 만들라"는 제안을 받았는데, 지금
 * 인용할 사람이 아무도 없다(가입 14명 · 외부 공개 노트 0건 · 후기 테이블 0행).
 * 없는 후기를 지어내는 것은 이 저장소가 금지한 일이고, 983에서 "운영진 예시"
 * 라벨을 붙여 과장을 걷어낸 것과도 정면으로 어긋난다.
 *
 * 대신 **모으는 장치**를 먼저 둔다. 엄지만 받으면 숫자가 쌓이지 후기가 쌓이지
 * 않는다 — 인용할 수 있는 건 문장이다. 그리고 인용 동의를 따로 받는다:
 * 동의 없이 쓴 문장을 나중에 소개 페이지에 올리는 일이 없게, 동의 여부를
 * 문장과 같이 저장한다.
 *
 * 새 테이블을 만들지 않는다. 기존 이벤트(platform_activity_events)의 context 에
 * 실어 보낸다 — 후기가 실제로 쌓이기 전에 스키마부터 만드는 것은 이 세션에서
 * 계속 피해 온 순서다(재방문 알림·동행 작성과 같은 이유).
 */
export function AiFeedbackButtons({
  targetType,
  targetId,
  context,
}: {
  targetType: string;
  targetId?: string | null;
  context?: Record<string, unknown>;
}) {
  const [choice, setChoice] = useState<"up" | "down" | null>(null);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [quotable, setQuotable] = useState(false);
  const [sentComment, setSentComment] = useState(false);

  const post = async (
    rating: "up" | "down",
    extra?: { comment?: string; quotable?: boolean },
  ) => {
    await fetch("/api/ai/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType,
        targetId: targetId ?? null,
        rating,
        context: { ...(context ?? {}), ...(extra ?? {}) },
      }),
    });
  };

  const send = async (rating: "up" | "down") => {
    if (busy || choice) return;
    setBusy(true);
    setChoice(rating);
    try {
      await post(rating);
    } catch {
      /* 피드백 실패해도 UI는 선택 유지 — 다시 누르지 않음 */
    } finally {
      setBusy(false);
    }
  };

  const sendComment = async () => {
    const text = comment.trim();
    if (!text || busy || !choice || sentComment) return;
    setBusy(true);
    try {
      await post(choice, { comment: text.slice(0, 300), quotable });
      setSentComment(true);
    } catch {
      /* 실패해도 다시 누를 수 있게 sentComment 는 그대로 둔다 */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px] text-text-3">
      <span>이 정리가 도움이 됐나요?</span>
      <button
        type="button"
        disabled={busy || choice !== null}
        onClick={() => void send("up")}
        aria-pressed={choice === "up"}
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-bold transition ${
          choice === "up"
            ? "border-primary bg-primary-soft text-primary"
            : "border-line bg-surface text-text-2 hover:border-primary/40"
        }`}
      >
        <Icon name="thumbs-up" size={12} />
        도움됨
      </button>
      <button
        type="button"
        disabled={busy || choice !== null}
        onClick={() => void send("down")}
        aria-pressed={choice === "down"}
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-bold transition ${
          choice === "down"
            ? "border-danger/40 bg-danger-soft text-danger"
            : "border-line bg-surface text-text-2 hover:border-danger/30"
        }`}
      >
        <Icon name="thumbs-down" size={12} />
        부족함
      </button>
      {choice && (
        <span className="text-text-3">반영했어요 · 실행 수 KPI와는 따로 집계해요</span>
      )}

      {/* 한 줄 받기 — 엄지만으로는 인용할 문장이 안 모인다. 선택이고, 안 써도 된다. */}
      {choice && !sentComment && (
        <div className="mt-1 flex w-full flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="t-caption text-text-3">
              한 줄만 더 남겨 주실래요? (선택 · 안 쓰셔도 됩니다)
            </span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 300))}
              rows={2}
              maxLength={300}
              placeholder={
                choice === "up"
                  ? "어떤 점이 도움이 됐는지 한 줄로"
                  : "무엇이 부족했는지 한 줄로"
              }
              className="w-full rounded-[10px] border border-line bg-surface px-3 py-2 t-sub text-text-1"
            />
          </label>
          {/* 인용 동의는 따로 받는다 — 동의 없이 쓴 문장을 나중에 소개에 올리지 않는다 */}
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={quotable}
              onChange={(e) => setQuotable(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#1d4fd8]"
            />
            <span className="t-caption leading-[1.6] text-text-3">
              이 문장을 내집나우 소개에 <b className="text-text-2">이름 없이</b> 인용해도
              좋아요 — 체크하지 않으면 개선에만 씁니다.
            </span>
          </label>
          <button
            type="button"
            onClick={() => void sendComment()}
            disabled={busy || comment.trim().length === 0}
            className="chip w-fit border border-line-strong bg-surface px-3 t-sub font-bold text-text-1 disabled:opacity-50"
          >
            보내기
          </button>
        </div>
      )}
      {sentComment && (
        <span className="w-full t-caption text-text-3">
          한 줄 고맙습니다{quotable ? " · 인용 동의도 함께 저장했어요" : ""}.
        </span>
      )}
    </div>
  );
}
