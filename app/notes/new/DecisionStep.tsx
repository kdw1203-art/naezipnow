"use client";

import { useMemo } from "react";
import {
  DECISION_CHOICES,
  DECISION_REASON_MAX,
  DECISION_REASONS_MAX,
  decisionLabel,
  suggestDecision,
  type DecisionChoice,
} from "@/lib/inspection/decision";
import { composeScoresFromChecks, type NoteLevel } from "@/lib/notes/note-scores";

/* ============================================================
   [996 · 4] 3단계 맨 위 "판단" 카드 — 살까 · 보류 · 패스 · 다시 보기.

   규칙(lib/inspection/decision)이 **제안**하고 사용자가 **고른다**. 제안된 칩에는
   고르기 전까지 "제안" 배지가 붙고, 근거 3줄은 제안으로 채워 두되 고칠 수 있다.
   고르는 순간 근거가 부모 상태에 확정된다 — 그 뒤 2단계에서 체크를 바꿔도 적어 둔
   근거는 안 움직인다(내가 쓴 글이 저절로 바뀌면 안 된다). "제안대로 다시 채우기"가
   되돌리는 길이다.

   next/dynamic(3단계에서만) — /notes/new 예산(470KB)에 여유가 1KB 뿐이라 판단
   모듈·칩 UI 를 첫 로드에 넣지 않는다. 상태는 NoteForm 이 든다(저장 페이로드).
   ============================================================ */

export type DecisionStepProps = {
  checks: Record<string, NoteLevel>;
  checklistDoneCount: number;
  checklistTotal: number;
  choice: DecisionChoice | null;
  /** null = 아직 손대지 않음(제안 그대로 보인다) */
  reasons: string[] | null;
  onChoice: (c: DecisionChoice) => void;
  onReasons: (r: string[] | null) => void;
};

export function DecisionStep({
  checks,
  checklistDoneCount,
  checklistTotal,
  choice,
  reasons,
  onChoice,
  onReasons,
}: DecisionStepProps) {
  const suggestion = useMemo(
    () =>
      suggestDecision({
        checks,
        scores: composeScoresFromChecks(checks),
        checklistDoneCount,
        checklistTotal,
      }),
    [checks, checklistDoneCount, checklistTotal],
  );
  const shown = reasons ?? suggestion.reasons;
  /* 3칸 고정 — 빈 칸은 저장 때 빠진다 */
  const lines = Array.from({ length: DECISION_REASONS_MAX }, (_, i) => shown[i] ?? "");

  const editLine = (i: number, v: string) => {
    const next = [...lines];
    next[i] = v.slice(0, DECISION_REASON_MAX);
    onReasons(next);
  };

  return (
    <div className="rise-in-6 card flex flex-col gap-2.5 p-4">
      <div className="flex items-center justify-between gap-2">
        {/* [1015 · 규칙 C·D] 물음형 부연("이 집, 어떻게 할까")은 지웠다 */}
        <div className="t-body font-bold text-ink">판단</div>
        {reasons !== null && (
          /* [989] 문장 옆 텍스트 조작 — 24px(py-[5px] + 12px 글자) */
          <button
            type="button"
            onClick={() => onReasons(null)}
            className="shrink-0 py-[5px] t-sub font-bold text-primary"
          >
            제안대로 다시 채우기
          </button>
        )}
      </div>
      <div role="radiogroup" aria-label="판단" className="grid grid-cols-4 gap-1.5">
        {DECISION_CHOICES.map((c) => {
          const active = choice === c;
          const suggested = choice === null && suggestion.choice === c;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                /* 고르는 순간 근거를 확정한다 — 제안 문장을 내 것으로 받아들인 셈 */
                if (reasons === null) onReasons(suggestion.reasons);
                onChoice(c);
              }}
              /* [1015 · 규칙 9] 고른 칸 = 한지 + 남색(현장 체크 칸과 같은 세 토큰) — 파랑은 CTA·링크에만.
                 제안 칸은 같은 남색 점선 테두리 */
              className={`relative flex min-h-[44px] flex-col items-center justify-center rounded-lg px-1 t-sub ${
                active
                  ? "border-[1.5px] border-brand-hanji-ink bg-brand-hanji font-bold text-brand-hanji-ink"
                  : suggested
                    ? "border-[1.5px] border-dashed border-brand-hanji-ink bg-surface font-bold text-text-1"
                    : "border border-line bg-surface font-semibold text-text-2"
              }`}
            >
              {decisionLabel(c)}
              {suggested && (
                <span className="mt-0.5 rounded bg-brand-hanji px-1 t-caption font-bold text-brand-hanji-ink">
                  제안
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-1.5">
        {lines.map((v, i) => (
          <input
            key={i}
            type="text"
            value={v}
            maxLength={DECISION_REASON_MAX}
            onChange={(e) => editLine(i, e.target.value)}
            placeholder={i === 0 ? "근거 (예: 남향이라 오후 채광 좋음)" : "근거 (선택)"}
            aria-label={`판단 근거 ${i + 1}`}
            enterKeyHint="done"
            className="min-h-[40px] w-full rounded-lg border border-line bg-surface px-3 t-body text-text-1 outline-none placeholder:text-text-3 focus:border-primary"
          />
        ))}
      </div>
      {/* [1015 · 규칙 D] 사실만 — 무엇을 근거로 무엇을 제안했는지 */}
      <p className="t-caption text-text-3">
        규칙 제안 {decisionLabel(suggestion.choice)} · {suggestion.basis} · 최종 선택은 작성자
      </p>
    </div>
  );
}
