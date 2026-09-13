"use client";

import { AreaError } from "@/app/components/AreaError";

/** [992 · A7] analysis 영역 오류 경계 — 루트로 떨어지지 않고 이 영역의 말로 안내한다. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AreaError
      area="analysis"
      title="분석 화면에 문제가 생겼어요"
      desc="실행 횟수는 결과가 저장된 경우에만 차감돼요. 다시 시도하거나 분석 허브에서 다른 도구를 열어 보세요."
      error={error}
      reset={reset}
      links={[{ href: "/analysis", label: "분석 허브" }, { href: "/", label: "홈" }]}
    />
  );
}
