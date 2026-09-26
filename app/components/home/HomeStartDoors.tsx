import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import { HOME_START_DOORS, HOME_START_DOORS_TITLE } from "@/lib/brand/home-copy";

/* [1008 · J] "어디서부터 시작할까요?" — 검색 바로 아래, 문 네 개.
 *
 * 왜: 홈 14명/30일·중앙 체류 5.1초 — 검색창은 "단지 이름을 아는 사람"의 입구라, 이름을 모르거나
 * 아직 무엇을 할지 모르는 첫 방문은 칠 게 없다. 상황(구경·후보·계약·처음)으로 고르게 한다.
 *
 * 서버 컴포넌트 · 클라이언트 JS 없음(홈 번들 예산 / 462/495 에 0바이트) · [991] 원칙대로 첫 화면은 정적
 * (rise-in·data-reveal 없음). 재질은 위 칩 줄(.chip)과 다르게 **한 장의 판을 네 칸으로 나눈 면**(.jr-doors,
 * gap 1px 이 칸 사이 선이 된다) — 칩 세 줄이 겹쳐 보이지 않게. 모바일 2×2, md 부터 한 줄.
 * 네 칸 모두 한 칸 전체가 링크라 터치 56px(주요 조작 40px 이상).
 * [1009 · H] 누르면 눌린다(.press scale .985) — 예전엔 배경색만 바뀌는 호버(마우스)뿐이라 터치에선 반응이 없었다. */
export function HomeStartDoors() {
  return (
    <nav aria-label={HOME_START_DOORS_TITLE} className="mx-auto flex w-full max-w-[760px] flex-col gap-1.5">
      <p className="m-0 text-center t-sub font-extrabold text-text-2">{HOME_START_DOORS_TITLE}</p>
      <div className="jr-doors grid grid-cols-2 gap-px md:grid-cols-4">
        {HOME_START_DOORS.map((d) => (
          <Link key={d.href} href={d.href} className="jr-door press">
            <span className="jr-door__ico" aria-hidden="true">
              <Icon name={d.icon} size={17} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="t-body font-extrabold leading-[1.35] text-ink break-words">{d.title}</span>
              <span className="t-caption font-bold text-text-3">{d.sub} ›</span>
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
