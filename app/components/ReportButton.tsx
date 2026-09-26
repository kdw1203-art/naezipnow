"use client";

/**
 * 신고 연결 (#81) — 작은 "신고" 텍스트 버튼 → 사유 선택 → POST /api/moderation/content-report
 * (구 코드 components/report-post-form.tsx 패턴 이식, 새 디자인 토큰 적용)
 *
 * [1009 · T] 결과 반응 — 사유를 고르면 그 칸에 도는 링(busy), 접수되면 토스트 "신고를 접수했어요" + 자리 글자
 * "신고했어요"(체크가 한 번 튄다). 실패는 원인+해결. 사유 칩이 10px 글자·높이 20px 이라 손가락으로 누르기 어려웠다
 * (실측 390px: 칩 높이 20px) → 12px 글자 · 높이 32px, "신고"·"취소"는 글 속 단추 기준 24px.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/components/Icon";
import { useToast } from "@/app/components/toast/ToastProvider";

const CATEGORIES = [
  { id: "spam", label: "스팸" },
  { id: "defamation", label: "욕설·비방" },
  { id: "fraud", label: "허위 정보" },
  { id: "other", label: "기타" },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

export function ReportButton({
  postId,
  commentId,
  className,
}: {
  postId: string;
  commentId?: string;
  className?: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<CategoryId | null>(null);
  const [state, setState] = useState<"idle" | "done" | "error">("idle");

  async function submit(category: (typeof CATEGORIES)[number]) {
    if (busyId) return;
    setBusyId(category.id);
    setState("idle");
    try {
      const res = await fetch("/api/moderation/content-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId,
          commentId: commentId ?? null,
          reason: `${category.label} 신고`,
          reportCategory: category.id,
        }),
      });
      if (res.status === 401 || res.status === 403) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      setState("done");
      setOpen(false);
      showToast("신고를 접수했어요 — 운영팀이 확인해요");
    } catch {
      setState("error");
    } finally {
      setBusyId(null);
    }
  }

  if (state === "done") {
    return (
      <span className={`inline-flex min-h-[24px] items-center gap-1 text-[12px] font-bold text-success ${className ?? ""}`}>
        <Icon name="check" size={13} strokeWidth={2.6} className="njn-pop-once" />
        신고했어요
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-[24px] items-center text-[12px] text-text-3 underline decoration-line underline-offset-2 transition-colors hover:text-danger ${className ?? ""}`}
      >
        신고
      </button>
    );
  }

  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className ?? ""}`}>
      <span className="text-[12px] text-text-3">신고 사유:</span>
      {CATEGORIES.map((c) => (
        <button
          key={c.id}
          type="button"
          disabled={busyId !== null}
          aria-busy={busyId === c.id || undefined}
          onClick={() => void submit(c)}
          className="chip press inline-flex min-h-[32px] items-center gap-1 border border-line bg-surface px-2.5 text-[12px] font-bold text-text-2 transition-colors hover:border-danger hover:text-danger disabled:opacity-60"
        >
          {busyId === c.id && <span className="njn-ring njn-ring--ink" aria-hidden="true" />}
          {c.label}
        </button>
      ))}
      <button
        type="button"
        disabled={busyId !== null}
        onClick={() => {
          setOpen(false);
          setState("idle");
        }}
        className="inline-flex min-h-[24px] items-center px-1 text-[12px] text-text-3"
      >
        취소
      </button>
      {state === "error" && (
        <span role="alert" className="text-[12px] font-bold text-danger">
          접수하지 못했어요 — 잠시 후 다시 눌러 주세요
        </span>
      )}
    </span>
  );
}
