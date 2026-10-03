/* [1024 · 원룸·오피스텔] /rent — 수도권 시군구 목록(서울·경기·인천 = 비아파트 수집 범위). 지역마다 최근 12개월 건수가 있으면 적는다.
   searchParams 를 읽지 않는 ISR(6시간). 건수 조회는 lib/rent/region-counts.ts(한 행 탐침 → 0 이면 지역별 조회 없음). */
import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { PageHead } from "@/app/components/PageHead";
import { REGION_CATALOG } from "@/lib/region/catalog";
import { groupRegionsByCity } from "@/lib/town/region-groups";
import { seoAlternates } from "@/lib/seo/alternates";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { logger } from "@/lib/log";
import { isSudogwonRegion } from "@/lib/rent/params";
import { getSudogwonRentCounts, type RentRegionCount } from "@/lib/rent/region-counts";
import { DEFAULT_OG_IMAGES } from "@/lib/seo/page-metadata";

export const revalidate = 21_600;

const TITLE = "원룸·오피스텔 실거래 월세 · 수도권";

export async function generateMetadata(): Promise<Metadata> {
  const counts = await getSudogwonRentCounts().catch(() => null);
  const any = (counts ?? []).some((c) => c.total > 0);
  const title = `${TITLE} | 내집나우`;
  const description = "서울·경기·인천 시군구별 오피스텔·연립다세대·단독다가구 전월세 실거래 — 국토교통부 신고 기준. 매물 호가가 아닙니다.";
  return {
    title,
    description,
    alternates: seoAlternates("/rent"),
    /* 행이 하나도 없으면(수집 전) 목록도 색인하지 않는다 — 링크 전부가 noindex 페이지다 */
    ...(any ? {} : { robots: { index: false, follow: true } }),
    openGraph: { title, description, type: "website", images: DEFAULT_OG_IMAGES },
  };
}

export default async function RentIndexPage() {
  let counts: RentRegionCount[] | null = null;
  try {
    counts = await getSudogwonRentCounts();
  } catch (e) {
    logger.warn("[rent] 수도권 건수 조회 실패 — 목록은 건수 없이 그린다", e);
  }
  const byId = new Map((counts ?? []).map((c) => [c.id, c.total]));
  const total = (counts ?? []).reduce((a, c) => a + c.total, 0);
  const groups = groupRegionsByCity(REGION_CATALOG.filter(isSudogwonRegion));

  return (
    <PageShell wide>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript([
            breadcrumbJsonLd([
              { name: "홈", url: "/" },
              { name: "원룸·오피스텔 실거래 월세", url: "/rent" },
            ]),
          ]),
        }}
      />
      <PageHead
        icon="building"
        title={TITLE}
        sub="국토교통부 오피스텔·연립다세대·단독다가구 전월세 신고 · 시군구 → 법정동"
        facts={
          <>
            <span>신고된 실거래 · 매물 아님</span>
            <span>{total > 0 ? `최근 12개월 ${total.toLocaleString("ko-KR")}건` : "수도권 오피스텔·연립·단독 전월세 수집 전"}</span>
            <span>아파트 전월세는 단지 화면</span>
          </>
        }
      />
      <div className="mt-4 flex flex-col gap-3 max-md:mt-3">
        {groups.map((g) => (
          <section key={g.key} className="card p-[var(--pad-card)]" aria-labelledby={`rent-city-${g.key}`}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 id={`rent-city-${g.key}`} className="t-section text-ink">
                {g.city}
              </h2>
              <span className="t-caption text-text-3">{g.items.length}곳</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {g.items.map((r) => {
                const n = byId.get(r.id) ?? 0;
                return (
                  <Link
                    key={r.id}
                    href={`/rent/${r.id}`}
                    className="chip press inline-flex min-h-10 items-center gap-1 border border-line bg-surface px-3 py-1.5 t-sub text-text-2 no-underline"
                  >
                    {r.name}
                    {n > 0 && <span className="t-caption font-medium text-text-3 tabular-nums">{n.toLocaleString("ko-KR")}</span>}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-4 t-caption text-text-3">매물이 아니라 국토교통부에 신고된 실거래 · 계약 후 30일 안 신고 · 최근 1~2개월은 늘 수 있음</p>
    </PageShell>
  );
}
