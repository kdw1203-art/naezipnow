/* [1083] 동별 실거래 허브 — /dong. 사이트맵 문턱(단지 3곳 · 최근 6개월 50건)을 넘는 동 전부를 지역별로 — 사이트맵 dongs 섹션의 허브이자
   크롤 경로. 지역 머리는 /tx/<지역>(면적대·가격대)으로, 칩은 /dong/<지역>/<동>으로. 조회 실패는 던진다(빈 허브를 사실처럼 내지 않는다). */
import type { Metadata } from "next";
import Link from "@/app/components/IntentLink";
import { AdZone } from "@/app/components/ads/AdZone";
import { HubBreadcrumbLd } from "@/app/components/seo/HubBreadcrumbLd";
import { PageShell } from "@/app/components/PageShell";
import { listSitemapDongs } from "@/lib/dong/landing";
import { dongPath } from "@/lib/dong/format";
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
     두 번 싣는다). 지역마다 거래 많은 동 1곳만 직접 잇고, 나머지는 /tx/<지역>의 "동별"(상한 20)이 잇는다 — 허브 → 지역 → 동, 깊이 3. */
  const HUB_PER_REGION = 1;

  return (
    <PageShell breadcrumb="홈 › 동별 실거래" title="동별 아파트 실거래">
      <HubBreadcrumbLd trail={[{ name: "동별 실거래", path: "/dong" }]} />
      <p className="rise-in mb-4 t-sub text-text-2 max-md:mb-3">
        동 <strong className="text-ink">{n(dongs.length)}곳</strong> · 지역 <strong className="text-ink">{n(groups.length)}곳</strong> · 최근 6개월 매매 신고{" "}
        <strong className="text-ink">{n(totalRecent)}건</strong> · 단지 3곳·거래 50건 이상인 동만 · 국토교통부 실거래 · 매물 호가 아님
      </p>
      <section className="card rounded-2xl px-4 py-2" data-tone="blue">
        <h2 className="sr-only">지역별 동 목록</h2>
        <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
          {groups.map((g) => (
            <li key={g.region} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
              <Link href={`/tx/${encodeURIComponent(g.regionSlug)}`} className="tap-line t-sub font-bold text-ink no-underline hover:text-primary">
                {g.region}
              </Link>
              <span className="t-caption tabular-nums text-text-3">
                동 {n(g.items.length)}곳 · {n(g.total)}건
              </span>
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                {g.items.slice(0, HUB_PER_REGION).map((d) => (
                  <Link key={d.dong} prefetch={false} href={dongPath(d.region, d.dong)} className="tap-line t-sub font-bold text-primary no-underline">
                    {d.dong} <span className="font-medium text-text-3">{n(d.recentTradeCount)}</span>
                  </Link>
                ))}
                {g.items.length > HUB_PER_REGION && (
                  <Link href={`/tx/${encodeURIComponent(g.regionSlug)}`} className="tap-line t-sub text-text-2 no-underline hover:text-primary">
                    {n(g.items.length - HUB_PER_REGION)}곳 더 ›
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <p className="mt-4 t-caption text-text-3">
        동은 지번 주소의 읍·면·동 토큰으로 가른 값 · 지역당 거래 많은 동 20곳까지 · 건수는 최근 6개월 매매 신고(해제 제외) · 지역 이름을 누르면 그 지역의 동 전체 · 집계 내집나우
      </p>
      <AdZone placement="page_bottom" seed={5} plan={null} className="mt-6 max-md:mt-4" />
    </PageShell>
  );
}
