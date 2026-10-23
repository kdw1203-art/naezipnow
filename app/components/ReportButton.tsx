"use client";
/* [1022 · 정렬·글씨·테마] 지시 4 — 임의 px(text-[NNpx]·text-xs) → 램프 유틸(t-caption/t-sub/t-body/t-section/t-title) · 이모지 아이콘 식별자 → 선 아이콘 이름. 구조·데이터 변경 없음. */

/**
 * 신고 연결 (#81) — 작은 "신고" 텍스트 버튼 → 사유 선택 → POST /api/moderation/content-report
 * (구 코드 components/report-post-form.tsx 패턴 이식, 새 디자인 토큰 적용)
 *
 * [1009 · T] 결과 반응 — 사유를 고르면 그 칸에 도는 링(busy), 접수되면 토스트 "신고를 접수했어요" + 자리 글자
 * "신고했어요"(체크가 한 번 튄다). 실패는 원인+해결. 사유 칩이 10px 글자·높이 20px 이라 손가락으로 누르기 어려웠다
 * (실측 390px: 칩 높이 20px) → 12px 글자 · 높이 32px, "신고"·"취소"는 글 속 단추 기준 24px.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/components/Icon";
import { useToast } from "@/app/components/toast/ToastProvider";
import { currentLoginReturnHref } from "@/lib/client/use-return-href";

/* [1058 · C3] 신고 대상 종류 — 거주민 후기는 content_reports 에 들어갈 수 없다(CHECK target_type ∈ post·comment·note ·
   complex_reviews 에 신고 열도 없다). 틀린 사실: 후기의 "신고"가 글 신고 API 로 가서 400("이 항목은 신고 대상이 아님")을 받았다.
   후기는 문의(support_tickets)로 접수한다 — 미리 채운 문의 폼 링크. */
export type ReportTargetType = "post" | "comment" | "review";

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
  targetType,
}: {
  postId: string;
  commentId?: string;
  className?: string;
  /** [1058 · C3] "review" 면 글 신고 API 대신 문의 폼(/support?topic=report&ref=review:<id>) 링크 */
  targetType?: ReportTargetType;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<CategoryId | null>(null);
  const [state, setState] = useState<"idle" | "done" | "error">("idle");

  if (targetType === "review") {
    const ref = `review:${postId.replace(/^complex-review:/, "")}`;
    return (
      <Link
        href={`/support?topic=report&ref=${encodeURIComponent(ref)}`}
        className={`tap-line inline-flex items-center t-sub text-text-3 underline decoration-line underline-offset-2 transition-colors hover:text-danger ${className ?? ""}`}
      >
        신고 · 문의로 접수
      </Link>
    );
  }

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
        /* [1086 · A4] 로그인 뒤 이 글로 돌아온다 */
        router.push(currentLoginReturnHref());
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      setState("done");
      setOpen(false);
      showToast("신고를 접수했어요. 운영팀이 확인해요");
    } catch {
      setState("error");
    } finally {
      setBusyId(null);
    }
  }

  if (state === "done") {
    return (
      <span className={`inline-flex min-h-[24px] items-center gap-1 t-sub font-bold text-success ${className ?? ""}`}>
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
        className={`inline-flex min-h-[24px] min-w-[24px] justify-center items-center t-sub text-text-3 underline decoration-line underline-offset-2 transition-colors hover:text-danger ${className ?? ""}`}
      >
        신고
      </button>
    );
  }

  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className ?? ""}`}>
      <span className="t-sub text-text-3">신고 사유:</span>
      {CATEGORIES.map((c) => (
        <button
          key={c.id}
          type="button"
          disabled={busyId !== null}
          aria-busy={busyId === c.id || undefined}
          onClick={() => void submit(c)}
          className="chip press inline-flex min-h-[32px] items-center gap-1 border border-line bg-surface px-2.5 t-sub font-bold text-text-2 transition-colors hover:border-danger hover:text-danger disabled:opacity-60"
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
        className="inline-flex min-h-[24px] items-center px-1 t-sub text-text-3"
      >
        취소
      </button>
      {state === "error" && (
        <span role="alert" className="t-sub font-bold text-danger">
          접수하지 못했어요. 잠시 후 다시 눌러 주세요
        </span>
      )}
    </span>
  );
}
