"use client";

import { useEffect, type ReactNode } from "react";

/* [1025b · 결정·비서] 폰 하단 고정 바 — 화면의 **유일한 다음 행동** 하나를 담는다(결정 카드 "결정 저장" ·
   AI 비서 "대화 열기"). 단지 상세의 MobileActionBar(967 · 17)와 같은 자리·유리판·그림자(.complex-actionbar 가
   탭바 위 8px · riseIn · 입력 포커스 중 숨김을 이미 맡는다). 데스크톱(lg+)은 오른쪽 레일이 같은 버튼을 그리므로
   바는 lg:hidden. 마운트 동안 body 에 .nz-has-primarybar 를 달아 본문 끝·맨 위로·토스트가 바 위로 올라간다.
   버튼 자체(btn-primary)는 호출부가 children 으로 넘긴다 — 한 파일에 채움 파랑 리터럴이 하나만 남게. */
export function MobilePrimaryBar({ label, children }: { label: string; children: ReactNode }) {
  useEffect(() => {
    document.body.classList.add("nz-has-primarybar");
    return () => document.body.classList.remove("nz-has-primarybar");
  }, []);

  return (
    <div data-noprint role="region" aria-label={label} className="complex-actionbar fixed inset-x-0 z-30 flex justify-center px-3 lg:hidden">
      <div className="glass w-full max-w-[560px] rounded-2xl p-1.5 shadow-[var(--shadow-md)]">{children}</div>
    </div>
  );
}
