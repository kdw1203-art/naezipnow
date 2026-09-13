"use client";

import { AreaError } from "@/app/components/AreaError";

/** [992 · A7] payment 영역 오류 경계 — 루트로 떨어지지 않고 이 영역의 말로 안내한다. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AreaError
      area="payment"
      title="결제 결과 화면에 문제가 생겼어요"
      desc="결제 자체는 결제창에서 처리됐어요. 이용권이 켜졌는지는 마이 페이지에서 바로 확인할 수 있고, 결제 내역은 구독 관리에 남아요."
      error={error}
      reset={reset}
      links={[{ href: "/my", label: "마이에서 플랜 확인" }, { href: "/subscription#billing", label: "결제 내역" }]}
    />
  );
}
