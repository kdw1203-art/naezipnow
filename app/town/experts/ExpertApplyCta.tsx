import Link from "next/link";

/* 전문가 등록 진입 버튼.
   [1047] 예전에는 이 버튼이 모달 양식(증빙은 https 주소만)을 열었다. 소유자 지시(2026-10-09)로 등록은 서류 첨부가 있는
   한 화면 양식(/town/experts/apply · ApplyForm)으로 옮겼고, 이 컴포넌트는 그 화면으로 가는 링크만 남는다(쓰는 곳 이름 그대로).
   정책상 받지 않는 직업군은 분류 체계(lib/experts/taxonomy)에 없다 — 토스 심사 약속. */
export function ExpertApplyCta({
  className = "btn-primary btn-cta rounded-xl px-5 py-2.5 t-body",
  label = "전문가 등록하기",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <Link href="/town/experts/apply" className={`${className} inline-flex items-center justify-center no-underline`}>
      {label}
    </Link>
  );
}
