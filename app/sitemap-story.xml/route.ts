import { sitemapSectionRoute } from "@/lib/seo/sitemap-sections";

/* [1006] 이야기(이웃 글) 사이트맵 — /town/story/[id]. 정책은 lib/seo/sitemap-sections.ts 에.
   (Next 앱 라우터는 sitemap-[유형].xml 부분 동적 세그먼트를 지원하지 않아 유형마다 파일이 하나씩.) */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = sitemapSectionRoute("story");
