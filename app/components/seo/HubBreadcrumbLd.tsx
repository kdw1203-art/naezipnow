import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";

/* [1082] 허브 화면의 BreadcrumbList JSON-LD — 운영 실측(2026-10-21)에서 가이드·입주·정비사업·임장노트·단지 목록·뉴스·청약 허브 7곳에
   브레드크럼 스키마가 없었다(상세 쪽은 전부 있음). 한 줄 "홈 › 이름" — 화면의 breadcrumb 글자와 같은 이름을 쓴다. 서버 조각(JS 0). */
export function HubBreadcrumbLd({ trail }: { trail: Array<{ name: string; path: string }> }) {
  const crumbs = breadcrumbJsonLd([{ name: "홈", url: "/" }, ...trail.map((t) => ({ name: t.name, url: t.path }))]);
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbs) }} />;
}
