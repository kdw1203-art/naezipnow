"use client";
/* [1057] /u/[handle] 오류 경계 — 프로필·공개 노트 조회가 실패했을 때. 예전엔 실패를 화면으로 그려 돌려줘(ISR 하루)
   "공개한 임장노트 없음"이 하루 동안 굳었다. 페이지는 던지고, 여기서 사실대로 적는다(캐시되지 않는다). */
import { AreaError } from "@/app/components/AreaError";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <AreaError
      area="profile"
      title="프로필 불러오기 실패"
      desc="공개 노트 불러오기 실패 포함 · 잠시 후 다시"
      error={error}
      reset={reset}
      links={[
        { href: "/notes", label: "공개 노트" },
        { href: "/town", label: "동네이야기" },
        { href: "/", label: "홈" },
      ]}
    />
  );
}
