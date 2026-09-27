"use client";

import { AreaError } from "@/app/components/AreaError";

/** [992 · A7] map 영역 오류 경계 — 루트로 떨어지지 않고 이 영역의 말로 안내한다. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AreaError
      area="map"
      title="지도를 그리는 중 문제가 생겼어요"
      desc="지도 데이터나 위치 정보를 불러오지 못했어요. 다시 시도하거나 단지 검색으로 찾아보세요."
      error={error}
      reset={reset}
      links={[{ href: "/map", label: "지도 다시 열기" }, { href: "/search", label: "단지 검색" }, { href: "/", label: "홈" }]}
    />
  );
}
