/* [1101 · 지역 화면 7벌 → 1벌] 한 지역을 보는 화면이 일곱 주소로 흩어져 있었다 — 지역 분석(/region/id) · 실거래 구간(/tx/이름) ·
   전월세(/rent/id) · 시장 온도 주간 기록(/analysis/temperature/id) · 동네 홈(/town/id) · 월간 리포트(/region/id/report) · 시세·타이밍(쿼리).
   서로를 잇는 길은 화면마다 다른 칩 · 문장 링크 · 레일 카드였고, 검색에서 "강남구"를 치면 어디로 가는지 정해져 있지 않았다(소유자 2026-11-02 검토).

   주소는 그대로 둔다(색인 · 공유 링크 · 사이트맵이 이미 이 주소들이다). 대신 여섯 화면이 **같은 탭 줄**을 머리 아래에 둔다 —
   하나의 지역 화면에 탭이 여섯인 것처럼 읽힌다. 탭은 그 지역에 실제로 있는 화면만(빈 화면 · 404 로 보내지 않는다):
     · 실거래 구간 — 실거래 표기와 대조해 찾은 슬러그가 있을 때만(lib/market/tx-bands findTxRegionForMarketRegion 과 같은 후보 규칙)
     · 전월세 — 수도권 지역만(/rent 가 다루는 범위 · lib/rent/params isSudogwonRegion)
     · 시장 온도 — 온도를 매주 기록하는 지역만(서울 · 수도권 권역)
   시세·타이밍은 지역 화면이 아니라 도구(쿼리 · canonical 은 파라미터 없는 경로)라 탭에 넣지 않는다.

   순수 함수 — 서버 조각(app/components/region/RegionTabs)이 가용성을 판정해 넘긴다. 단위 테스트가 그대로 부른다. */
import { REGION_CATALOG } from "@/lib/region/catalog";
import { marketRegionNameCandidates } from "@/lib/market/region-name-candidates";

export type RegionTabKey = "overview" | "tx" | "rent" | "temperature" | "town" | "report" | "imjang";

export type RegionTab = { key: RegionTabKey; label: string; href: string };

export const REGION_TAB_LABEL: Readonly<Record<RegionTabKey, string>> = {
  overview: "개요",
  tx: "실거래 구간",
  rent: "전월세",
  temperature: "시장 온도",
  town: "동네",
  report: "월간 리포트",
  /* [1121 · 기능 통폐합 3단계] 지역 임장 가이드(/imjang/[실거래 구간 슬러그]) — 같은 지역의 따로 떨어진 화면을 탭으로 */
  imjang: "임장 가이드",
};

export function regionTabs(input: {
  /** 지역 카탈로그 id(/region/[id] · /town/[id] · /rent/[id] · 온도 id 가 같은 값) */
  id: string;
  /** 실거래 구간 화면의 슬러그(없으면 그 탭이 없다) */
  txSlug: string | null;
  hasRent: boolean;
  hasTemperature: boolean;
}): RegionTab[] {
  const id = input.id.trim();
  if (!id) return [];
  const enc = encodeURIComponent(id);
  const tabs: RegionTab[] = [{ key: "overview", label: REGION_TAB_LABEL.overview, href: `/region/${enc}` }];
  if (input.txSlug) tabs.push({ key: "tx", label: REGION_TAB_LABEL.tx, href: `/tx/${encodeURIComponent(input.txSlug)}` });
  if (input.hasRent) tabs.push({ key: "rent", label: REGION_TAB_LABEL.rent, href: `/rent/${enc}` });
  if (input.hasTemperature) tabs.push({ key: "temperature", label: REGION_TAB_LABEL.temperature, href: `/analysis/temperature/${enc}` });
  tabs.push({ key: "town", label: REGION_TAB_LABEL.town, href: `/town/${enc}` });
  tabs.push({ key: "report", label: REGION_TAB_LABEL.report, href: `/region/${enc}/report` });
  /* 임장 가이드는 실거래 구간과 같은 슬러그(lib/imjang/guide getImjangGuide = findTxRegionBySlug) — 실거래 구간 탭이 있을 때만 */
  if (input.txSlug) tabs.push({ key: "imjang", label: REGION_TAB_LABEL.imjang, href: `/imjang/${encodeURIComponent(input.txSlug)}` });
  return tabs;
}

/** 실거래 구간 화면의 지역 이름("서울 강남구" · "고양 덕양구" · "평택시") → 카탈로그 id. 폐지 지역은 건너뛴다.
 *  같은 후보 규칙(marketRegionNameCandidates)을 거꾸로 대조한다 — 못 찾으면 null(그 화면에는 탭 줄을 그리지 않는다). */
export function catalogIdForTxRegionName(txName: string): string | null {
  const target = txName.trim();
  if (!target) return null;
  for (const info of REGION_CATALOG) {
    if (info.retired) continue;
    if (marketRegionNameCandidates(info.id, info.name).includes(target)) return info.id;
  }
  return null;
}
