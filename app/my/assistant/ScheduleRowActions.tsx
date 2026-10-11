"use client";
/* [1057] AI 비서의 임장 일정 줄에 완료·취소·삭제가 없어 등록한 일정이 막다른 길이었다(D-day 가 지나야 사라졌다).
   세 글자 버튼 → PATCH(completed·cancelled) · DELETE /api/inspection/schedule(기존 API) → router.refresh() 로 서버가 목록을 다시 그린다.
   확인 창은 없고 결과는 토스트 한 줄(삭제는 "되돌릴 수 없음" 명시). 채움 파랑은 이 화면의 "대화 열기" 하나라 글자 버튼이다. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/components/toast/ToastProvider";

type Action = "completed" | "cancelled" | "delete";

const DONE_TOAST: Record<Action, string> = {
  completed: "일정 완료 처리",
  cancelled: "일정 취소",
  delete: "일정 삭제 · 되돌릴 수 없음",
};

const FAIL_TOAST: Record<Action, string> = {
  completed: "일정 저장 실패 · 잠시 후 다시",
  cancelled: "일정 저장 실패 · 잠시 후 다시",
  delete: "일정 삭제 실패 · 잠시 후 다시",
};

const BTN = "inline-flex min-h-[40px] items-center px-1.5 t-sub font-bold text-text-2 md:min-h-6 disabled:opacity-60";

export function ScheduleRowActions({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [busy, setBusy] = useState<Action | null>(null);

  const run = async (action: Action) => {
    if (busy) return;
    setBusy(action);
    try {
      const res =
        action === "delete"
          ? await fetch(`/api/inspection/schedule?id=${encodeURIComponent(id)}`, { method: "DELETE" })
          : await fetch("/api/inspection/schedule", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id, status: action }),
            });
      if (!res.ok) {
        /* 404 는 이미 지워졌거나 남의 일정 — 목록을 다시 받아 사실대로 보인다 */
        showToast(res.status === 404 ? "일정 없음 · 목록 갱신" : FAIL_TOAST[action]);
        if (res.status === 404) router.refresh();
        return;
      }
      showToast(`${label} · ${DONE_TOAST[action]}`);
      router.refresh();
    } catch {
      showToast(FAIL_TOAST[action]);
    } finally {
      setBusy(null);
    }
  };

  return (
    <span className="flex shrink-0 items-center gap-0.5" aria-label={`${label} 일정 조작`}>
      <button type="button" className={BTN} disabled={busy !== null} aria-busy={busy === "completed" || undefined} onClick={() => void run("completed")}>
        완료
      </button>
      <span className="t-caption text-text-3" aria-hidden="true">
        ·
      </span>
      <button type="button" className={BTN} disabled={busy !== null} aria-busy={busy === "cancelled" || undefined} onClick={() => void run("cancelled")}>
        취소
      </button>
      <span className="t-caption text-text-3" aria-hidden="true">
        ·
      </span>
      <button type="button" className={`${BTN} text-danger`} disabled={busy !== null} aria-busy={busy === "delete" || undefined} onClick={() => void run("delete")}>
        삭제
      </button>
    </span>
  );
}
