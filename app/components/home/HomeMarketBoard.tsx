import Link from "@/app/components/IntentLink";
import { getRegionMonthlyVolume, getRegionSeries, getRegionSnapshot } from "@/lib/market/store";
import { buildRegionOverview } from "@/app/region/[id]/region-overview";
import { buildRegionTrendDatasets } from "@/app/region/[id]/region-trends";
import { regionHeroTiles } from "@/app/region/[id]/RegionHero";
import { RegionTrendCard } from "@/app/region/[id]/RegionTrendCard";
import { logger } from "@/lib/log";
import { RegionSearchBox } from "@/app/analysis/region-search-box";
import { REGION_ALIASES, REGION_CATALOG } from "@/lib/region/catalog";
import { listRegionSiseRegions } from "@/lib/region/region-sise";
import type { RegionMarketSnapshot } from "@/lib/market/types";

/* [1114 · 홈 = 지역 화면 형식] 소유자 2026-11-09(지역 종합 캡처 두 장): "이런 형식은 그대로 두고 이런 그래프 · 표를 적극 사용해주고
   홈 화면은 잘 어우러지도록". 지역 화면 머리의 숫자 칸(regionHeroTiles)과 시세 흐름 카드(RegionTrendCard · 지표 탭 + 훑는 선)를
   **같은 함수 · 같은 조각** 그대로 대표 지역 하나에 그린다 — 홈과 지역 화면이 한 모양이 된다.
   데이터: 지역 화면과 같은 로더 넷(스냅샷 · 매매가격지수 24 · 전세가율 24 · 월별 거래량 12). 홈 ISR(300초) 안에서 한 번.
   실패는 실패로(한 줄) · 값이 하나도 없으면 칸을 그리지 않는다(가짜 "—" 칸 없음). 같은 숫자는 여기 한 곳 —
   오늘의 시장 띠의 지역 슬라이드와 지역 동향 표에서는 이 지역을 뺀다(app/page.tsx). */

function hasValues(s: RegionMarketSnapshot | null): s is RegionMarketSnapshot {
  if (!s || !/^\d{6}$/.test(s.period)) return false;
  return [s.avgSale, s.medianSale, s.jeonseRatio, s.saleChangeMonthly].some((v) => typeof v === "number" && Number.isFinite(v));
}

export async function HomeMarketBoard({ id, name }: { id: string; name: string }) {
  let failed = false;
  const [snapshot, indexSeries, jeonseSeries, volume] = await Promise.all([
    getRegionSnapshot(id).catch((e: unknown) => {
      logger.warn(`[home] ${id} 스냅샷 조회 실패`, e);
      return null;
    }),
    getRegionSeries(id, "sale_index", "monthly", 24).catch((e: unknown) => {
      failed = true;
      logger.warn(`[home] ${id} 매매가격지수 조회 실패`, e);
      return [];
    }),
    getRegionSeries(id, "jeonse_ratio", "monthly", 24).catch((e: unknown) => {
      logger.warn(`[home] ${id} 전세가율 조회 실패`, e);
      return [];
    }),
    getRegionMonthlyVolume(id, name, 12).catch((e: unknown) => {
      failed = true;
      logger.warn(`[home] ${id} 월별 거래량 조회 실패`, e);
      return [];
    }),
  ]);
  const now = new Date();
  const overview = buildRegionOverview({ name, snapshot: hasValues(snapshot) ? snapshot : null, indexSeries, jeonseSeries, volume, now });
  const tiles = regionHeroTiles(overview);
  const datasets = buildRegionTrendDatasets({ name, indexSeries, jeonseSeries, volume, now });
  const regionHref = `/region/${encodeURIComponent(id)}`;
  const searchRegions = listRegionSiseRegions(REGION_CATALOG, REGION_ALIASES);

  if (tiles.length === 0 && datasets.length === 0) {
    return failed ? (
      <p className="card m-0 rounded-2xl px-4 py-3.5 t-sub text-text-3">{name} 시장 숫자 불러오기 실패 · 잠시 후 다시</p>
    ) : null;
  }

  return (
    <>
      {tiles.length > 0 && (
        <section aria-labelledby="home-market-h" className="card p-[var(--pad-card)]">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="home-market-h" className="m-0 t-sub font-bold text-text-2 break-words">
              {overview.headlineCaption ?? `${name} 실거래·가격지수 요약`}
            </h2>
            <Link href={regionHref} className="tap-line inline-block shrink-0 py-[5px] t-sub font-bold text-primary no-underline">
              {name} 종합 ›
            </Link>
          </div>
          {/* [1123 · 다른 지역도] 대표 지역 한 곳만 보이던 칸 — 검색칸(시 · 구 · 동)으로 다른 지역 종합 화면으로 바로 */}
          <div className="mt-2 md:max-w-[360px]">
            <RegionSearchBox regions={searchRegions} pickIds={[]} />
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2 md:grid-cols-4">{tiles}</div>
          <p className="m-0 mt-2.5 t-caption text-text-3 break-words">
            출처 · {overview.hasReb ? "한국부동산원(R-ONE) 월간 통계 · 국토교통부 실거래 신고" : "국토교통부 실거래 신고"} · 매물 호가 아님
          </p>
        </section>
      )}
      {datasets.length > 0 && <RegionTrendCard heading={`${name} 시세 흐름`} datasets={datasets} className="" />}
    </>
  );
}

export default HomeMarketBoard;
