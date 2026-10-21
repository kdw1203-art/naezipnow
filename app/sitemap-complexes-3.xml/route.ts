import { sitemapSectionRoute } from "@/lib/seo/sitemap-sections";

/* [1081] 단지 사이트맵 조각 3/6 — 거래 많은 순 5,000개(lib/seo/build-sitemap loadComplexChunkEntries). 내용·정책은
   lib/seo/sitemap-sections.ts 한 곳에 모아 두고 여기서는 위임만 한다. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = sitemapSectionRoute("complexes-3");
