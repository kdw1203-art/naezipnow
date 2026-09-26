"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AIPanel } from "@/app/components/AIPanel";
import { AiRetryButton } from "./ai-retry-button";
import { AI_POLL_INTERVAL_MS, pollIsSettled, shouldKeepPolling } from "@/lib/notes/ai-status";

/* [1005 · A4] AI 정리 대기 카드 — `?ai=pending` 으로 온 상세가 AI 요약 자리에 그린다.
   작성 화면은 AI 응답을 기다리지 않고 넘어오므로, 여기서 GET /api/inspection/notes/{id} 를
   2.5초마다 물어 `note.aiAnalysis` 가 생기면 `?ai=ok` 로 바꿔 서버 렌더를 다시 받는다.
   90초 안에 안 오면 "늦어지고 있어요" — 결과를 지어내지 않고 재시도(소유자)와 "나중에"만 둔다.
   [M3] 수정 저장은 옛 분석이 남아 있으므로 `expectedHash`(지금 내용의 해시)를 받아
   `note.metadata.aiContentHash` 가 그것과 같아질 때까지 기다린다 — 존재만 보면 첫 틱에 옛
   요약을 새 것이라고 확정한다. 신규 저장(이전 분석 없음)은 종전대로 존재만 본다.
   번들은 작게: useEffect + fetch + useRouter. 진행 표시는 온점 호흡(.njn-dot--breathe,
   감속 모션이면 멈춘다 — globals.css [946]) 하나다. */

type Phase = "polling" | "late" | "dismissed";

export function AiPendingCard({
  noteId,
  canRetry,
  defaultIntent = "실거주",
  fallback = null,
  expectedHash = null,
}: {
  noteId: string;
  /** 소유자만 재시도 — 비소유자는 기다리거나 나중에 다시 연다 */
  canRetry: boolean;
  defaultIntent?: "실거주" | "투자" | "전월세";
  /** [M3] 수정 저장 — 옛 분석이 남아 있을 때 지금 내용의 해시. 이 값과 같아져야 끝난 것이다 */
  expectedHash?: string | null;
  /** "나중에 볼게요" 뒤에 그릴 평소 AI 요약 패널(서버가 만든 규칙 기반 요약) */
  fallback?: ReactNode;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("polling");
  const navigated = useRef(false);

  useEffect(() => {
    if (phase !== "polling") return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const started = Date.now();

    const tick = async () => {
      if (!alive) return;
      try {
        const res = await fetch(`/api/inspection/notes/${encodeURIComponent(noteId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!alive) return;
        /* 권한·존재 문제는 기다려도 안 풀린다 — 바로 "늦어지고 있어요"로 */
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          setPhase("late");
          return;
        }
        if (res.ok) {
          const json: unknown = await res.json().catch(() => null);
          if (!alive) return;
          if (pollIsSettled(json, expectedHash) && !navigated.current) {
            navigated.current = true;
            /* scroll:false — 본문을 읽던 중에 결과가 와도 화면을 맨 위로 튕기지 않는다 */
            router.replace(`/notes/${encodeURIComponent(noteId)}?ai=ok`, { scroll: false });
            router.refresh();
            return;
          }
        }
      } catch {
        /* 일시 오류(네트워크·503) — 다음 틱에 다시 묻는다 */
      }
      if (!alive) return;
      if (shouldKeepPolling(Date.now() - started + AI_POLL_INTERVAL_MS)) {
        timer = setTimeout(() => void tick(), AI_POLL_INTERVAL_MS);
      } else {
        setPhase("late");
      }
    };
    timer = setTimeout(() => void tick(), AI_POLL_INTERVAL_MS);

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      controller.abort();
    };
  }, [noteId, phase, router, expectedHash]);

  if (phase === "dismissed") return <>{fallback}</>;

  return (
    <AIPanel title="AI 요약" disclaimer={false}>
      {phase === "polling" ? (
        <div role="status" aria-live="polite" className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="njn-dot njn-dot--breathe shrink-0" aria-hidden="true" />
            <span className="t-body font-extrabold text-white">AI 정리 중…</span>
          </div>
          <p className="t-sub text-ai-muted">
            노트는 저장됐어요. 이 화면에 그대로 두면 정리가 끝나는 대로 자동으로 반영돼요.
          </p>
        </div>
      ) : (
        <div role="status" aria-live="polite" className="flex flex-col gap-1.5">
          <p className="t-body font-extrabold text-white">AI 정리가 늦어지고 있어요</p>
          <p className="t-sub text-ai-muted">
            노트는 저장돼 있어요. 서버가 바쁘거나 요청이 전달되지 않았을 수 있어요 —{" "}
            {canRetry
              ? "아래에서 다시 정리를 요청하거나, 나중에 이 노트를 다시 열어 확인해 주세요."
              : "나중에 이 노트를 다시 열어 확인해 주세요."}
          </p>
          {canRetry && <AiRetryButton noteId={noteId} defaultIntent={defaultIntent} />}
          <button
            type="button"
            onClick={() => setPhase("dismissed")}
            className="press mt-1 inline-flex min-h-[40px] w-fit items-center rounded-lg bg-white/10 px-3 py-2 t-sub font-extrabold text-ai-text"
          >
            나중에 볼게요
          </button>
        </div>
      )}
    </AIPanel>
  );
}
