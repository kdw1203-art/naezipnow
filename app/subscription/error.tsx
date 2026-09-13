"use client";

import { AreaError } from "@/app/components/AreaError";

/** [992 · A7] subscription 영역 오류 경계 — 루트로 떨어지지 않고 이 영역의 말로 안내한다. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AreaError
      area="subscription"
      title="구독 화면에 문제가 생겼어요"
      desc="결제는 토스페이먼츠 결제창에서만 이루어져요 — 이 화면의 오류로 결제가 진행되거나 취소되지는 않아요."
      error={error}
      reset={reset}
      links={[{ href: "/subscription", label: "구독 안내" }, { href: "/my", label: "마이" }]}
    />
  );
}
