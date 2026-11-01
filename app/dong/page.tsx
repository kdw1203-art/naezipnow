/* [1083] 동별 실거래 허브 — /dong. 사이트맵 문턱(단지 3곳 · 최근 6개월 50건)을 넘는 동 전부를 지역별로 — 사이트맵 dongs 섹션의 허브이자
   크롤 경로. 지역 머리는 /tx/<지역>(면적대·가격대)으로, 칩은 /dong/<지역>/<동>으로. 조회 실패는 던진다(빈 허브를 사실처럼 내지 않는다). */
import type { Metadata } from "next";
import { TopBanner } from "@/app/components/ads/TopBanner";
import { AdZone } from "@/app/components/ads/AdZone";
import { HubBreadcrumbLd } from "@/app/components/seo/HubBreadcrumbLd";
import { PageShell } from "@/app/components/PageShell";
import { listSitemapDongs } from "@/lib/dong/landing";
import { groupBySido, sidoOfMarketRegionName } from "@/lib/market/sido-group";
import { DongHubGroups, type DongHubRegionWire, type DongHubSidoWire } from "./DongHubGroups";
import { seoAlternates } from "@/lib/seo/alternates";
import { DEFAULT_OG_IMAGES } from "@/lib/seo/page-metadata";

export const revalidate = 86_400;
/* 지역 214곳 × RPC 1회 — 콜드 첫 렌더가 길 수 있다 */
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "동별 아파트 실거래가 — 법정동 단위 매매 신고·단지·중앙값 | 내집나우",
  description:
    "법정동(읍·면·동) 단위 아파트 매매 실거래 — 동마다 단지 목록·최근 6개월 신고 건수·월별 추이·면적대별 중앙값·최근 실거래. 국토교통부 실거래 신고 기준, 단지 3곳·거래 50건 이상인 동만 싣습니다.",
  alternates: seoAlternates("/dong"),
  openGraph: {
    title: "동별 아파트 실거래가 — 법정동 단위 매매 신고·단지·중앙값 | 내집나우",
    description: "법정동 단위 아파트 매매 실거래 — 단지 목록·최근 6개월 신고 건수·월별 추이·면적대별 중앙값.",
    type: "website",
    images: DEFAULT_OG_IMAGES,
  },
};

const n = (v: number) => v.toLocaleString("ko-KR");

export default async function DongHubPage() {
  const dongs = await listSitemapDongs();
  const byRegion = new Map<string, { region: string; regionSlug: string; total: number; items: typeof dongs }>();
  for (const d of dongs) {
    const g = byRegion.get(d.region) ?? { region: d.region, regionSlug: d.regionSlug, total: 0, items: [] };
    g.total += d.recentTradeCount;
    g.items.push(d);
    byRegion.set(d.region, g);
  }
  const groups = [...byRegion.values()].sort((a, b) => b.total - a.total || a.region.localeCompare(b.region, "ko"));
  const totalRecent = dongs.reduce((s, d) => s + d.recentTradeCount, 0);
  /* 허브는 지역 단위로 접는다 — 동 1,153곳을 한 쪽에 다 그리면 HTML 1.1MB, 지역당 3곳이어도 580KB(로컬 실측 · RSC 페이로드가 글을
     두 번 싣는다). 지역마다 거래 많은 동 1곳만 직접 잇고, 나머지는 /tx/<지역>의 "동별"(상한 20)이 잇는다 — 허브 → 지역 → 동, 깊이 3.
     [1096 · 고도화 · 비용] 192줄 한 목록 → 시/도 묶음(details · 첫 묶음 펼침 · 실거래 표기 전수 해석이라 "그 밖의 지역" 없음) ·
     줄은 클라이언트 조각(DongHubGroups)이 압축 행으로 그린다 — 420KB(마크업 168KB · RSC 212KB) 의 RSC 몫이 props 로 준다. */
  const sidoGroups: DongHubSidoWire[] = groupBySido(groups, (g) => g.region, (g) => g.total, sidoOfMarketRegionName).map((sg) => [
    sg.sido,
    sg.items.map((g): DongHubRegionWire => {
      /* 지역마다 거래 많은 동 1곳(HUB_PER_REGION = 1) — 최댓값을 직접 고른다(입력 순서에 기대지 않는다) */
      const top = g.items.reduce((m, d) => (d.recentTradeCount > m.recentTradeCount ? d : m));
      return [g.regionSlug, g.region, g.items.length, g.total, top.dong, top.recentTradeCount];
    }),
  ]);

  return (
    <PageShell breadcrumb="홈 › 동별 실거래" title="동별 아파트 실거래">
      <HubBreadcrumbLd trail={[{ name: "동별 실거래", path: "/dong" }]} />
      <p className="rise-in mb-4 t-sub text-text-2 max-md:mb-3">
        동 <strong className="text-ink">{n(dongs.length)}곳</strong> · 지역 <strong className="text-ink">{n(groups.length)}곳</strong> · 시/도{" "}
        <strong className="text-ink">{n(sidoGroups.length)}곳</strong> · 최근 6개월 매매 신고 <strong className="text-ink">{n(totalRecent)}건</strong> · 단지 3곳·거래 50건
        이상인 동만 · 국토교통부 실거래 · 매물 호가 아님
      </p>
      {/* [1098 · 배너] 상단 띠 배너 자리 */}
      <TopBanner placement="page_bottom" plan={null} className="mb-4 max-md:mb-3" />
      <section className="rise-in-1" aria-label="시/도별 동 목록">
        <h2 className="sr-only">시/도별 동 목록</h2>
        <DongHubGroups groups={sidoGroups} />
      </section>
      <p className="mt-4 t-caption text-text-3">
        동은 지번 주소의 읍·면·동 토큰으로 가른 값 · 지역당 거래 많은 동 20곳까지 · 건수는 최근 6개월 매매 신고(해제 제외) · 지역 이름을 누르면 그 지역의 동 전체 · 집계 내집나우
      </p>
      <AdZone placement="page_bottom" seed={5} plan={null} className="mt-6 max-md:mt-4" />
    </PageShell>
  );
}
