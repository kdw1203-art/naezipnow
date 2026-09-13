"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ErrorState } from "@/app/components/ui/EmptyState";

/**
 * [992 · A7] 영역별 오류 경계의 공통 몸체.
 *
 * 그동안 error.tsx 는 루트 하나(app/error.tsx)뿐이었다 — 지도·노트·분석·결제·마이가 전부
 * 같은 "화면을 그리는 중 문제가 생겼어요"로 떨어졌고, 결제 화면이 깨지면 방금 낸 돈이
 * 어떻게 됐는지 아무 말도 없었다. 영역마다 **무엇이 안 됐고 어디로 가면 되는지**가 다르다.
 * 계측(/api/monitoring/client-error)은 루트와 같은 싱크, scope 에 영역 이름을 싣는다.
 */
export function AreaError({
  area,
  title,
  desc,
  error,
  reset,
  links,
}: {
  area: string;
  title: string;
  desc: string;
  error: Error & { digest?: string };
  reset: () => void;
  /** 되돌아갈 곳 — 첫 항목이 그 영역의 홈 */
  links: { href: string; label: string }[];
}) {
  useEffect(() => {
    try {
      void fetch("/api/monitoring/client-error", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: error.message || "unknown client error",
          digest: error.digest,
          path: typeof window !== "undefined" ? window.location.pathname : null,
          scope: `route:${area}`,
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* noop */
    }
  }, [error, area]);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-[520px] flex-col items-center justify-center gap-4 px-6">
      <ErrorState
        title={title}
        desc={desc}
        cause={error.digest ? `오류 코드 ${error.digest}` : undefined}
        onRetry={reset}
        retryLabel="다시 시도"
        className="w-full"
      />
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px]">
        {links.map((l, i) => (
          <span key={l.href} className="flex items-center gap-2">
            {i > 0 && <span className="text-text-3">·</span>}
            <Link href={l.href} className="inline-block py-[5px] font-bold text-primary">
              {l.label}
            </Link>
          </span>
        ))}
        <span className="text-text-3">·</span>
        <Link href="/support" className="inline-block py-[5px] font-bold text-primary">
          문의하기
        </Link>
      </div>
    </main>
  );
}
