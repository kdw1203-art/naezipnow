/* [1110 · AI 분석 2차 통폐합] /analysis/timing = **지역 시세 분석** — 고르는 자리.
   소유자 2026-11-07: 지역 시세 도구 5줄 → 하나, "눌렀을 때 지역을 검색하거나 지역(시 · 구 · 동) 단위로 분석해서 종합적으로".
   예전 이 주소의 화면(시세·타이밍 — 기본 지역 한 곳의 12개월 지수 · 거래량 · 온도, 지역 전환은 /api/timing)은 지역 종합 화면
   (/region/[id] 시세 흐름 카드 · 시장 온도 탭)이 같은 사실을 더 넓게 보여 주고 있어 지웠다 — 같은 사실 두 곳 금지.
   주소는 그대로 둔다(색인 · 리다이렉트 표 6규칙 · 앱 안 링크 30여 곳이 "지역 흐름 보기"로 이 주소를 가리킨다 — 이제 전부 이 고르는 자리로
   온다). ?region= 가 붙은 옛 링크는 클라이언트가 그 지역 종합 화면으로 넘긴다(legacy-region-param). 서버는 쿼리를 읽지 않는다(ISR 1일).
   본문 조각(region-sise-entry)은 허브(/analysis #tier-market)와 같다. */
import { ShellBreadcrumb } from "../../components/PageShell";
import { PageHead } from "@/app/components/PageHead";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { loadRegionSiseData, RegionSiseEntry } from "../region-sise-entry";
import { LegacyRegionParam } from "./legacy-region-param";

/* [1010] 하루 — 원천(부동산원 스냅샷 · 주간 온도)은 하루 1회 · 주 1회 갱신. 이 경로는 lib/region/invalidate-market.ts
   invalidateMarketAnalysisRoutes() 가 하루 1회 비운다(예전 그대로). */
export const revalidate = 86_400;

export const metadata = buildPageMetadata({
  title: "지역 시세 분석 — 시 · 구 · 동으로 찾는 지역 종합",
  description:
    "시 · 구 · 동 이름으로 지역을 고르면 개요 · 실거래 구간 · 전월세 · 시장 온도 · 동네 · 월간 리포트를 한 화면에서 봅니다. 시/도별 평균 매매가 · 전세가율 · 시장 온도 비교. 한국부동산원 공표 통계 · 국토교통부 실거래 기준.",
  path: "/analysis/timing",
});

export default async function RegionSisePage() {
  const data = await loadRegionSiseData("[/analysis/timing]");
  return (
    <div className="flex flex-col gap-4 max-md:gap-3">
      <ShellBreadcrumb>분석 › 지역 시세 분석</ShellBreadcrumb>
      <LegacyRegionParam regions={data.regions} />
      <PageHead
        icon="trending-up"
        title="지역 시세 분석"
        sub={`시 · 구 · 동 검색 → 개요 · 실거래 구간 · 전월세 · 시장 온도 · 동네 · 월간 리포트 · 지역 ${data.regions.length}곳`}
        subOnPhone
      />
      <RegionSiseEntry data={data} autoFocus />
    </div>
  );
}
