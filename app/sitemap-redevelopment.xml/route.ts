import { sitemapSectionRoute } from "@/lib/seo/sitemap-sections";

/* [1027] 정비사업 구역 상세 사이트맵 — /redevelopment/[id]. 정책은 lib/seo/sitemap-sections.ts 에.
   (Next 앱 라우터는 sitemap-[유형].xml 부분 동적 세그먼트를 지원하지 않아 유형마다 파일이 하나씩.) */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = sitemapSectionRoute("redevelopment");
