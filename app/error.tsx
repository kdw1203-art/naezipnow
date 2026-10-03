"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ErrorState } from "@/app/components/ui/EmptyState";
import { reportClientError } from "@/lib/client/error-report";

/**
 * G10: 라우트 세그먼트 에러 바운더리 — 지금까지 없어서, 렌더 중 예외가 나면
 * Next 기본 화면(영문)만 떴다. 실패를 "데이터 없음"처럼 보이게 하지 않고,
 * 무엇이 안 됐는지 + 다시 시도 경로를 한국어로 보여준다.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  /* [1025 · #30] 배포 직후 옛 청크를 든 탭은 "Loading chunk … failed" 로 이 화면을 본다(2026-09-28 프로덕션 2회 관측).
     코드 문제가 아니라 파일이 바뀐 것이므로 한 번만 새로고침한다 — 같은 세션에서 두 번째면 그대로 보여 준다(무한 새로고침 방지). */
  useEffect(() => {
    try {
      const msg = String(error?.message ?? "");
      const chunkFail = /Loading chunk [\w-]+ failed|ChunkLoadError|Failed to fetch dynamically imported module/i.test(msg);
      if (!chunkFail) return;
      const key = "nz:chunk-reload:" + window.location.pathname;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    } catch {
      /* noop */
    }
  }, [error]);

  useEffect(() => {
    // 서버 모니터링 싱크로 전달(실패해도 무시 — 에러 화면이 또 깨지면 안 된다)
    // [1027 · 제안 28] 브라우저 스택·오류 이름·빌드 표식을 같이 싣는다(lib/client/error-report)
    reportClientError(error, "route");
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-[520px] flex-col items-center justify-center gap-4 px-6">
      <ErrorState
        /* [1028 · 제안 3·12] 오류 문구 표준 — "불러오지 못했어요" + "잠시 후 다시 시도해 주세요." */
        title="화면을 불러오지 못했어요"
        desc="잠시 후 다시 시도해 주세요."
        cause={error.digest ? `오류 코드 ${error.digest}` : undefined}
        onRetry={reset}
        retryLabel="다시 시도"
        className="w-full"
      />
      <div className="flex gap-2 t-body">
        <Link href="/" className="font-bold text-primary">
          홈으로
        </Link>
        <span className="text-text-3">·</span>
        <Link href="/support" className="font-bold text-primary">
          문의하기
        </Link>
      </div>
    </main>
  );
}
