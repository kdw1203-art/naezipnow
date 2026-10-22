import { sitemapSectionRoute } from "@/lib/seo/sitemap-sections";

/* [1083] 법정동 실거래 사이트맵 — 내용·정책은 lib/seo/sitemap-sections.ts(dongs) · 로더는 lib/seo/build-sitemap loadDongEntries. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* 지역 214곳 × RPC 1회(10분 메모) — 콜드 첫 응답이 길 수 있어 상한을 넉넉히 */
export const maxDuration = 60;

export const GET = sitemapSectionRoute("dongs");
