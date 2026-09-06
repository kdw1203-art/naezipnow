"use client";

import { usePathname } from "next/navigation";
import { useScrolledPast } from "@/lib/client/use-scroll-state";
import { backToTopLane } from "@/lib/client/shell-gates";

/** 이만큼 내려갔을 때만 뜬다 — 한 화면 남짓은 손가락으로 올리는 게 더 빠르다 */
const SHOW_AFTER_PX = 800;

/**
 * [966] 맨 위로 — 긴 목록·리포트에서 우하단에 뜨는 44px 원.
 *
 * 자리: right 14px · bottom = 탭바 위 12px (--nz-tabbar-offset). /town 과 /notes 는
 * 같은 자리에 글쓰기 FAB(52px, njn-fab)가 있어 그 **위로 60px** 올린다(52 + 여백 8).
 * 왼쪽으로 비키는 방식은 버리고 위로 올리는 쪽을 골랐다 — 오른쪽 엄지 동선을 유지하고,
 * 본문 카드 위를 가로로 가리지 않는다. FAB 는 md 이상에서 사라지므로 올림도 md 에서
 * 풀린다(CSS 가 판정, .back-to-top[data-lane="lifted"]).
 *
 * [970 · B-08 · B-09] 레인 판정은 lib/client/shell-gates backToTopLane(순수 함수):
 *  - lifted 는 FAB 가 실제로 있는 /notes·/town 정확 일치만(예전 startsWith 는 /notes/new 의
 *    저장 바와 맞닿게 했다).
 *  - /notes/new·/notes/[id]/edit 는 "savebar" 레인 — 저장 바 위로. NoteForm 이 body 클래스를
 *    달지 않아(다른 에이전트 파일) 경로로 판정한다. 바가 원래 CTA 보임 여부로 떴다 사라져도
 *    FAB 자리는 고정이라 스크롤 중 튀지 않는다.
 *  - /complex/[id] 액션 바는 MobileActionBar 가 이미 body.nz-has-actionbar 를 달므로 CSS 가
 *    그 클래스로 올린다(경로 판정이면 바가 없는 /complex/browse 까지 올라간다).
 *  - 쿠키 배너가 떠 있는 동안(body.nz-consent-open)은 CSS 가 숨긴다 [970 · A-39].
 *
 * 보임/숨김은 CSS 클래스(.is-visible)로 페이드·스케일 — 숨김 상태는 visibility:hidden
 * 이라 탭 순서·보조기술에도 안 잡힌다. 감속 모션 설정이면 전환 없이 즉시 바뀐다.
 */
export function BackToTop() {
  const pathname = usePathname();
  /* [968 · 12] 자체 scroll 리스너 대신 공용 스크롤 상태(헤더·탭바와 리스너 하나를 공유).
     800px 경계를 넘나들 때만 리렌더한다. */
  const visible = useScrolledPast(SHOW_AFTER_PX);

  const lane = backToTopLane(pathname);

  const toTop = () => {
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };

  return (
    <button
      type="button"
      aria-label="맨 위로"
      onClick={toTop}
      data-lane={lane === "default" ? undefined : lane}
      className={`back-to-top press njn-lift fixed z-40 flex h-11 w-11 items-center justify-center rounded-full bg-brand-navy text-on-dark shadow-[0_6px_18px_rgba(11,37,69,.3)] ${
        visible ? "is-visible" : ""
      }`}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 14.5 12 8.5l6 6" />
      </svg>
    </button>
  );
}
