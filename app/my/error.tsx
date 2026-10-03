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
      /* [1028 · 제안 3] 오류 문구 표준 — "불러오지 못했어요" + "잠시 후 다시 시도해 주세요." + 도움이 되는 사실 한 줄 */
      title="마이 화면 불러오기 실패"
      desc="잠시 후 다시 시도해 주세요. 계정 정보는 안전해요."
      error={error}
      reset={reset}
      links={[{ href: "/my", label: "마이" }, { href: "/my/settings", label: "설정" }, { href: "/", label: "홈" }]}
    />
  );
}
