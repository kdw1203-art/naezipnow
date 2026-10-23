"use client";

import { AreaError } from "@/app/components/AreaError";

/** [992 · A7] notes 영역 오류 경계 — 루트로 떨어지지 않고 이 영역의 말로 안내한다. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AreaError
      area="notes"
      title="임장노트 화면 불러오기 실패"
      desc="작성 중이던 내용은 이 기기 임시저장에 남음 · 노트 쓰기에서 이어 쓰기"
      error={error}
      reset={reset}
      links={[{ href: "/notes/new", label: "노트 쓰기" }, { href: "/notes", label: "공개 노트" }, { href: "/", label: "홈" }]}
    />
  );
}
