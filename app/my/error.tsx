"use client";

import { AreaError } from "@/app/components/AreaError";

/** [992 · A7] my 영역 오류 경계 — 루트로 떨어지지 않고 이 영역의 말로 안내한다. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AreaError
      area="my"
      title="마이 화면에 문제가 생겼어요"
      desc="계정 정보는 안전해요. 다시 시도하거나 설정으로 이동해 주세요."
      error={error}
      reset={reset}
      links={[{ href: "/my", label: "마이" }, { href: "/my/settings", label: "설정" }, { href: "/", label: "홈" }]}
    />
  );
}
