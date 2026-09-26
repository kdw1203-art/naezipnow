"use client";

import { AreaError } from "@/app/components/AreaError";

/** [1008 · Q] 실거래가 게임 오류 경계 — 문제 풀을 못 읽었을 때(런타임). 가짜 문제로 메우지 않는다. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AreaError
      area="quiz"
      title="오늘의 문제를 불러오지 못했어요"
      desc="실거래 자료를 읽는 중에 문제가 생겼어요. 지어낸 문제는 내지 않아요 — 잠시 뒤 다시 시도해 주세요."
      error={error}
      reset={reset}
      links={[{ href: "/map", label: "지도" }, { href: "/", label: "홈" }]}
    />
  );
}
