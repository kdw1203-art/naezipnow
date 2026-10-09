/* [1051 · 홈 실시간 토론] 홈 맨 아래 "실시간 토론" 칸 — 머리(서버)와 판(클라이언트 · 화면 가까이 오면 받음).
   소유자 지시(2026-10-09): "홈 하단에 이런 실시간 토론을 할 수 있는 창이 있으면 좋겠어"(네이버 증권 '오늘의 종목 토론').
   답: 단위 = 지역 + 단지 · 사람 글이 없으면 자동 소식 섞기(사람 글 위) · 홈 창에서 바로 한 줄. */
import Link from "next/link";
import { TalkPanelLazy } from "@/app/components/talk/TalkPanelLazy";

export function HomeTalkSection() {
  return (
    <section id="talk" aria-labelledby="home-talk-title" className="card mt-3 flex scroll-mt-24 flex-col gap-3 rounded-2xl px-4 py-4 md:mt-4 md:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h2 id="home-talk-title" className="t-section text-ink">
            실시간 토론
          </h2>
          <span className="t-caption text-text-3">수도권 지역 · 단지 한 줄 · 새 글 30초마다</span>
        </div>
        <Link href="/talk" className="tap-line t-sub font-bold text-primary no-underline">
          전체 토론 보기 ›
        </Link>
      </div>
      <TalkPanelLazy variant="home" />
    </section>
  );
}

export default HomeTalkSection;
