import Link from "next/link";
import type { HomeBriefing, HomeRegionCard } from "@/lib/newui/home-data";
import { HOME_LIST, HomeRow, HomeSectionHead, RegionRow } from "./HomeRows";
import { HomeMyRegionRow } from "./HomeMyRegionRow";

/* ============================================================
   [v4 · 규칙 2·4·5] 홈 "지역 동향" — 행 목록(숫자는 오른쪽). 서버 조각 + 로그인 관심지역 행(클라이언트 한 조각).

   예전: 2열 카드 4장(RegionPulseCards — 클라이언트 · 16주 스파크라인 그리기 애니메이션 · 가격 카운트업 · 카드마다
   "지수 전월 대비"·"선 · 16주 시세 지수"·"부동산원" 캡션) + 네이비 "오늘의 한 줄" 회전 배너의 지역 문장 +
   AI 패널 안 "오늘의 시장 브리핑 (참고)" 문단과 기준 배지.
   지금: 제목 + 사실 한 줄(브리핑 — "서울 25개 구 중 N곳 상승, 평균 ▲x%" · 기준월) → 지역 행 4개(RegionRow) →
   끝 캡션 한 줄(관심지역 설정). 기준·출처 문장은 페이지 끝 데이터 출처로. 카드·스파크라인·애니메이션은 뺐다 —
   클라이언트 JS 는 관심지역 행 하나만 남는다.

   제목은 "지역 동향"([1009 · H 리뷰]) — 서울 카드 가격이 국토부 신고 실거래 평균이라 "시세" 낱말 규칙에 걸린다.
   ============================================================ */

export function HomeRegionTrend({
  regions,
  briefing,
  stale,
  failed,
}: {
  regions: HomeRegionCard[];
  briefing: HomeBriefing | null;
  /** [1002] 스냅샷 실패 → 마지막 월 집계 폴백 카드(값은 실측, 시점이 오래됨) */
  stale: boolean;
  /** 폴백까지 실패 */
  failed: boolean;
}) {
  const shown = regions.slice(0, 4);
  return (
    <section aria-labelledby="home-region-h" className="flex flex-col gap-2">
      <HomeSectionHead
        id="home-region-h"
        title="지역 동향"
        link={{ href: "/map", label: "지도 보기 ›" }}
        fact={briefing ? `${briefing.text} · ${briefing.asOfLabel}` : null}
      />
      <ul data-tone="blue" className={HOME_LIST}>
        {shown.length === 0 ? (
          /* [v4 · 규칙 8] 빈 상태 한 줄 — 실패와 "아직 없음"을 다르게. 지도 링크는 머리 오른쪽에 그대로 */
          <HomeRow muted label={failed ? "지역 동향을 지금 불러오지 못했어요" : "지역 실거래 집계 아직 없음"} />
        ) : (
          <>
            {/* 로그인 사용자의 관심지역(목록에 없을 때만) — 서버 HTML 에는 없다 */}
            <HomeMyRegionRow shownIds={shown.map((r) => r.id)} />
            {shown.map((r) => (
              <RegionRow key={r.id} card={r} />
            ))}
          </>
        )}
      </ul>
      <p className="t-caption text-text-3">
        {/* [1002] 오래된 값을 "지금"으로 위장하지 않는다 — 폴백이면 그 사실을 캡션 앞에 */}
        {stale && shown.length > 0 ? "실시간 집계 조회 실패 — 마지막 월 집계 · " : ""}
        <Link href="/my/settings#region" className="tap-line font-bold text-primary no-underline">
          관심지역 설정 ›
        </Link>
      </p>
    </section>
  );
}
