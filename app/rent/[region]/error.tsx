"use client";
/* [1024 · 원룸·오피스텔] /rent/[region] 오류 경계 — 실거래 조회가 실패했을 때(런타임). 빈 표로 "신고 없음"처럼 보이게 하지 않는다. */
import { AreaError } from "@/app/components/AreaError";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <AreaError
      area="rent"
      title="실거래 자료를 불러오지 못했어요"
      desc="잠시 후 다시 시도해 주세요."
      error={error}
      reset={reset}
      links={[
        { href: "/rent", label: "지역 목록" },
        { href: "/town", label: "동네이야기" },
        { href: "/", label: "홈" },
      ]}
    />
  );
}
