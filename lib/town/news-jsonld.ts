/**
 * [1006] 뉴스 상세 NewsArticle JSON-LD — 순수 함수(테스트 가능).
 *
 * 왜 따로: 예전에는 우리 요약(seo.jsonld)이 있는 기사에만 구조화 데이터가 나갔다.
 * 우리 요약이 없는 옛 기사 페이지는 noindex 라도 **어떤 페이지인지**(기사 · 발행일 ·
 * 발행자 · 원문)는 마크업으로 말해 두는 편이 정직하다. 규칙은 scripts/check-jsonld.mjs
 * 와 맞춘다 — NewsArticle 은 headline 필수, undefined/null 이 문자열로 굳지 않게
 * 빈 값은 애초에 넣지 않는다.
 *
 * 발행자(publisher)는 전역 Organization(app/components/SiteJsonLd — @id …/#organization)
 * 과 같은 이름·URL 을 쓴다. 저작 주체는 내집나우다(본문이 원문 전재가 아니라 우리 요약
 * 이므로 — lib/news-seo.ts buildNewsJsonLd 주석). 원 매체는 isBasedOn / citation 으로.
 * 요약 본문은 자동 수집 요약이라 유료벽·저작권 주장 없이 isAccessibleForFree: true 만.
 */
import { DEFAULT_DESKTOP_ORIGIN } from "@/lib/platform-shell";

const BASE_URL = DEFAULT_DESKTOP_ORIGIN;
/* lib/seo/page-metadata 의 SITE_NAME 과 같은 값. 그 모듈은 next/headers 를 끌고 들어와
   (alternates 경유) 단위 테스트에서 import 할 수 없어 여기 상수로 둔다 —
   tests/unit/town-1006.test.ts 가 두 값의 일치를 소스 문자열로 검사한다. */
const SITE_NAME = "내집나우";

/** 전역 SiteJsonLd 의 Organization 과 같은 @id — 페이지가 그 노드를 참조하며 이름·URL 도 함께 적는다 */
export function publisherOrganization(): Record<string, unknown> {
  return {
    "@type": "Organization",
    "@id": `${BASE_URL}/#organization`,
    name: SITE_NAME,
    url: BASE_URL,
    logo: {
      "@type": "ImageObject",
      url: `${BASE_URL}/icons/icon-192.png`,
    },
  };
}

export type NewsArticleInput = {
  /** 정식 URL(slug 포함) */
  url: string;
  headline: string;
  description?: string | null;
  /** 원문 발행 시각(ISO) — 없으면 수집 시각 */
  datePublished?: string | null;
  /** 우리 쪽 갱신 시각(ISO) */
  dateModified?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  image?: string | null;
  /** 분류(부동산·경제…) — articleSection */
  section?: string | null;
  keywords?: string[] | null;
};

function isoOrNull(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** 우리가 직접 만드는 NewsArticle 노드 — 값이 없는 필드는 키 자체를 넣지 않는다 */
export function newsArticleJsonLd(input: NewsArticleInput): Record<string, unknown> {
  const published = isoOrNull(input.datePublished);
  const modified = isoOrNull(input.dateModified) ?? published;
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: input.headline.trim(),
    url: input.url,
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
    inLanguage: "ko-KR",
    isAccessibleForFree: true,
    author: { "@type": "Organization", name: SITE_NAME, url: BASE_URL },
    publisher: publisherOrganization(),
  };
  const desc = input.description?.replace(/\s+/g, " ").trim();
  if (desc) node.description = desc;
  if (published) node.datePublished = published;
  if (modified) node.dateModified = modified;
  if (input.image && /^https?:\/\//.test(input.image)) node.image = [input.image];
  const section = input.section?.trim();
  if (section) node.articleSection = section;
  const keywords = (input.keywords ?? []).map((k) => String(k ?? "").trim()).filter(Boolean);
  if (keywords.length) node.keywords = keywords.join(", ");
  if (input.sourceUrl) {
    node.isBasedOn = input.sourceUrl;
    node.citation = {
      "@type": "CreativeWork",
      ...(input.sourceName?.trim() ? { name: input.sourceName.trim() } : {}),
      url: input.sourceUrl,
    };
  }
  return node;
}

/**
 * DB 가 만들어 둔 구조화 데이터(lib/news-seo buildNewsJsonLd — 단일 노드 또는 FAQ 를 담은
 * @graph)에 **빠진 필드만** 우리 기본값으로 채운다. DB 값이 있으면 그쪽이 이긴다 —
 * 요약·키워드는 그쪽이 더 정확하다. 발행자·isAccessibleForFree·dateModified 처럼
 * DB 가 안 적는 값은 여기서 보장된다.
 */
export function withNewsArticleDefaults(
  existing: Record<string, unknown> | null,
  base: Record<string, unknown>,
): Record<string, unknown> {
  if (!existing) return base;
  const fill = (node: Record<string, unknown>): Record<string, unknown> => {
    if (node["@type"] !== "NewsArticle" && node["@type"] !== "Article") return node;
    const out: Record<string, unknown> = { ...node };
    for (const [k, v] of Object.entries(base)) {
      if (k === "@context") continue;
      const cur = out[k];
      if (cur === undefined || cur === null || cur === "") out[k] = v;
    }
    /* 발행자는 항상 전역 Organization 참조 모양으로 통일한다(@id 가 붙어야 하나로 묶인다) */
    out.publisher = publisherOrganization();
    return out;
  };
  const graph = existing["@graph"];
  if (Array.isArray(graph)) {
    return {
      ...existing,
      "@graph": graph.map((n) =>
        n && typeof n === "object" ? fill(n as Record<string, unknown>) : n,
      ),
    };
  }
  return fill(existing);
}
