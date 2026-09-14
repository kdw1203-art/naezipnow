import Link from "next/link";

/* [1002] 예산으로 찾기 — 조건 탐색 입구 한 줄.
 *
 * 히어로 검색은 "단지 이름을 아는 사람"의 입구다. 이름을 모르는 방문자(대부분의 첫
 * 방문)는 검색창에 칠 게 없다. 예산 한 칸을 고르면 지도 필터로 바로 들어간다 —
 * /map 은 `?priceMax=`(억 단위, app/map/page.tsx parseEokParam)를 읽어 매물·시세 필터에
 * 그대로 꽂는다. 지역은 시세 카드 첫 장과 같은 곳(실데이터)이고, 카드가 하나도 없으면
 * 지역 없이 예산만 넘긴다(없는 지역을 기본값으로 지어내지 않는다).
 *
 * 서버 컴포넌트·클라이언트 JS 없음 — 홈 번들 예산(/ 495KB)에 한 바이트도 얹지 않는다.
 * 칩은 위 지역 칩(HomeHeroSearch)과 같은 `.chip` 옷이다: 터치 기기에서는 globals.css 의
 * (pointer: coarse) 블록이 a.chip 을 40px 로 키운다(모바일 탭 게이트 기준). */

const BUDGET_EOK = [3, 5, 7, 10] as const;

export function HomeBudgetChips({ regionName }: { regionName: string | null }) {
  const region = regionName ? `region=${encodeURIComponent(regionName)}&` : "";
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5">
      {/* 좁은 화면(390px)에서는 라벨을 줄여 칩 4개가 한 줄에 들어가게 — 뜻은 같다 */}
      <span className="t-caption font-semibold text-text-3">
        <span className="sm:hidden">예산</span>
        <span className="hidden sm:inline">예산으로 찾기</span>
      </span>
      {BUDGET_EOK.map((eok) => (
        <Link
          key={eok}
          href={`/map?${region}priceMax=${eok}`}
          className="chip inline-flex items-center bg-surface px-3 py-1.5 t-sub font-bold text-text-2 no-underline shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(16,28,54,.12)]"
        >
          {eok}억 이하
        </Link>
      ))}
    </div>
  );
}
