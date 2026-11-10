/* [1101 · 지역 화면 7벌 → 1벌] 지역 화면 공통 탭 줄 — 서버 조각(JS 0). 규칙 · 이유는 lib/region/region-tabs.ts 머리 주석.
   여섯 화면(지역 분석 · 실거래 구간 · 전월세 · 시장 온도 · 동네 홈 · 월간 리포트)이 머리 바로 아래 같은 자리에 같은 줄을 둔다.
   모양은 뉴스룸 분류 탭과 같은 밑줄 탭(.news-tabs · 40px · 폰 가로 밀기) — 사이트에 탭 꼴이 하나 더 생기지 않게.
   탭이 하나뿐인 지역(카탈로그 밖 · 실거래 구간만 있는 곳)은 줄을 그리지 않는다. */
import Link from "@/app/components/IntentLink";
import { findCatalogRegionById, REGION_CATALOG } from "@/lib/region/catalog";
import { regionSwitchMarkers } from "@/lib/region/region-switch";
import { RegionSwitcher } from "./RegionSwitcher";
import { isSudogwonRegion } from "@/lib/rent/params";
import { hasAnyNonAptRent } from "@/lib/rent/any-rows";
import { findTemperatureRegion } from "@/lib/market/temperature";
import { findTxRegionForMarketRegion } from "@/lib/market/tx-bands";
import { regionTabs, type RegionTabKey } from "@/lib/region/region-tabs";
import { logger } from "@/lib/log";

export async function RegionTabs({
  id,
  current,
  txSlug,
  className = "",
}: {
  /** 지역 카탈로그 id */
  id: string;
  /** 지금 화면 */
  current: RegionTabKey;
  /** 실거래 구간 슬러그를 화면이 이미 알면 넘긴다(모르면 undefined — 여기서 찾는다 · null 이면 그 탭 없음) */
  txSlug?: string | null;
  className?: string;
}) {
  const info = findCatalogRegionById(id);
  if (!info || info.retired) return null;
  let slug: string | null = txSlug === undefined ? null : txSlug;
  if (txSlug === undefined) {
    try {
      slug = (await findTxRegionForMarketRegion(info.id, info.name))?.slug ?? null;
    } catch (e) {
      /* 실거래 구간 목록을 못 읽었으면 그 탭만 빠진다(추측한 주소로 링크하지 않는다) */
      logger.warn("[RegionTabs] 실거래 구간 슬러그 조회 실패:", e instanceof Error ? e.message : String(e));
      slug = null;
    }
  }
  /* [1102] 전월세 탭은 수도권 + 자료가 한 행이라도 있을 때만 — 0행인 동안은 "—" 화면으로 보내지 않는다 */
  const hasRent = isSudogwonRegion(info) && (await hasAnyNonAptRent());
  const tabs = regionTabs({
    id: info.id,
    txSlug: slug,
    hasRent,
    hasTemperature: Boolean(findTemperatureRegion(info.id)),
  });
  if (tabs.length < 2) return null;
  /* [1122] 다른 지역 찾기 — 한 지역만 보이는 화면에서 검색 · 시/도 필터 · 지도로 다른 지역으로(지금 탭 그대로) */
  const switchMarkers = regionSwitchMarkers(REGION_CATALOG, current, (rid) => Boolean(findTemperatureRegion(rid)));
  return (
    <div className={className}>
    <nav aria-label={`${info.name} 지역 화면`} className="region-tabs news-tabs">
      {tabs.map((t) =>
        t.key === current ? (
          <Link key={t.key} href={t.href} aria-current="page" prefetch={false}>
            {t.label}
          </Link>
        ) : (
          <Link key={t.key} href={t.href} prefetch={false}>
            {t.label}
          </Link>
        ),
      )}
    </nav>
    <RegionSwitcher markers={switchMarkers} currentName={info.name} defaultSido={info.city ?? "서울"} />
    </div>
  );
}

export default RegionTabs;
