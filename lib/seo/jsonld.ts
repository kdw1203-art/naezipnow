/**
 * schema.org JSON-LD 빌더 — SEO 구조화 데이터 (서버/클라이언트 공용, 순수 함수).
 * 실데이터로 존재하는 필드만 채운다(허위 데이터 금지). null/undefined/빈값은 compact 로 제거.
 * 각 페이지 본문에서 <script type="application/ld+json"> 로 주입한다.
 */

import { DEFAULT_DESKTOP_ORIGIN } from "@/lib/platform-shell";

const BASE_URL = DEFAULT_DESKTOP_ORIGIN; /* [947] 도메인 단일 소스 */

/** null·undefined·빈문자열·빈객체를 재귀적으로 제거 (0·false 는 보존) */
function compact<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((v) => compact(v))
      .filter((v) => v !== undefined && v !== null) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined || v === null || v === "") continue;
      const cv = compact(v);
      if (cv === undefined || cv === null || cv === "") continue;
      if (
        typeof cv === "object" &&
        !Array.isArray(cv) &&
        Object.keys(cv as Record<string, unknown>).length === 0
      ) {
        continue;
      }
      if (Array.isArray(cv) && cv.length === 0) continue;
      out[k] = cv;
    }
    return out as T;
  }
  return value;
}

function absoluteUrl(path: string): string {
  return path.startsWith("http") ? path : `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/* ---------- 우편 주소 ---------- */

function postalAddress(input: {
  streetAddress?: string | null;
  /** 시/도 — 예: "서울" */
  addressRegion?: string | null;
  /** 시군구·읍면동 — 예: "송파구", "잠실동" */
  addressLocality?: string | null;
}): Record<string, unknown> | undefined {
  const street = input.streetAddress?.trim() || undefined;
  const region = input.addressRegion?.trim() || undefined;
  const locality = input.addressLocality?.trim() || undefined;
  if (!street && !region && !locality) return undefined;
  return compact({
    "@type": "PostalAddress",
    addressCountry: "KR",
    addressRegion: region,
    addressLocality: locality,
    streetAddress: street,
  });
}

/** 실좌표가 있을 때만 GeoCoordinates. 0,0(미지오코딩 기본값)은 좌표 없음으로 본다. */
function geoCoordinates(
  lat?: number | null,
  lng?: number | null,
): Record<string, unknown> | undefined {
  if (typeof lat !== "number" || typeof lng !== "number") return undefined;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat === 0 && lng === 0) return undefined;
  return { "@type": "GeoCoordinates", latitude: lat, longitude: lng };
}

/* ---------- RealEstateListing (/listings/[id]) ---------- */

export function realEstateListingJsonLd(input: {
  id: string;
  name: string;
  description?: string | null;
  priceKrw?: number | null;
  offerLabel?: string | null;
  areaM2?: number | null;
  address?: string | null;
  regionName?: string | null;
  images?: string[];
}): Record<string, unknown> {
  const url = `${BASE_URL}/listings/${input.id}`;
  const obj: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "@id": url,
    url,
    name: input.name,
    description: input.description?.trim() || undefined,
    image:
      input.images && input.images.length > 0
        ? input.images.map((i) => absoluteUrl(i))
        : undefined,
    address: postalAddress({
      streetAddress: input.address,
      addressRegion: input.regionName,
    }),
    floorSize:
      input.areaM2 && input.areaM2 > 0
        ? { "@type": "QuantitativeValue", value: input.areaM2, unitCode: "MTK" }
        : undefined,
    offers:
      input.priceKrw && input.priceKrw > 0
        ? compact({
            "@type": "Offer",
            price: input.priceKrw,
            priceCurrency: "KRW",
            name: input.offerLabel?.trim() || undefined,
            availability: "https://schema.org/InStock",
          })
        : undefined,
  };
  return compact(obj);
}

/* ---------- Residence/Place + AggregateOffer (/complex/[id]) ---------- */

export function complexResidenceJsonLd(input: {
  id: string;
  name: string;
  address?: string | null;
  /** 시/도 — addressRegion. 예: "서울" */
  regionName?: string | null;
  /** 시군구 — 예: "송파구". 호출부(/complex/[id])가 예전부터 넘기던 자리. */
  locality?: string | null;
  /** [995] 읍면동 — 예: "잠실동". 있으면 이것이 addressLocality 가 되고 locality(시군구)는
   *  streetAddress(전체 주소)에 이미 들어 있으므로 잃지 않는다. 없으면 locality 를 쓴다 —
   *  주소를 추정해 채우지 않는다. 선택 필드라 기존 호출부는 그대로다. */
  dong?: string | null;
  /** 지오코딩된 실좌표. 없으면 geo 자체를 넣지 않는다. */
  lat?: number | null;
  lng?: number | null;
  /** 총 세대수 — 공공데이터에 있을 때만 */
  households?: number | null;
  /** 표시용 가격대(예: "8.2억") — 데이터 있을 때만 */
  priceRange?: string | null;
  /** 최근 실거래가(원) — AggregateOffer 용 */
  latestAmountKrw?: number | null;
}): Record<string, unknown> {
  const url = `${BASE_URL}/complex/${encodeURIComponent(input.id)}`;
  const obj: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ApartmentComplex",
    "@id": url,
    url,
    name: input.name,
    address: postalAddress({
      streetAddress: input.address,
      addressRegion: input.regionName,
      addressLocality: input.dong?.trim() || input.locality,
    }),
    geo: geoCoordinates(input.lat, input.lng),
    numberOfAccommodationUnits:
      typeof input.households === "number" && input.households > 0
        ? { "@type": "QuantitativeValue", value: input.households }
        : undefined,
    priceRange: input.priceRange?.trim() || undefined,
    makesOffer:
      input.latestAmountKrw && input.latestAmountKrw > 0
        ? {
            "@type": "AggregateOffer",
            priceCurrency: "KRW",
            lowPrice: input.latestAmountKrw,
            highPrice: input.latestAmountKrw,
            offerCount: 1,
          }
        : undefined,
  };
  return compact(obj);
}

/* ---------- Place (/region/[id]) ---------- */

export function regionPlaceJsonLd(input: {
  id: string;
  name: string;
  description?: string | null;
  /** 상위 시/도 — 예: 지역이 "송파구"면 "서울". 없으면 지역명 자체를 시/도로 둔다. */
  parentRegion?: string | null;
}): Record<string, unknown> {
  const url = `${BASE_URL}/region/${input.id}`;
  const parent = input.parentRegion?.trim() || undefined;
  const obj: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Place",
    "@id": url,
    url,
    name: input.name,
    description: input.description?.trim() || undefined,
    // 상위 시/도를 알면 addressRegion=시/도 + addressLocality=구 로 나눠 적는다.
    // 모르면 지역명 하나만 addressRegion 으로 둔다(없는 상위 지역을 지어내지 않는다).
    address: parent
      ? postalAddress({ addressRegion: parent, addressLocality: input.name })
      : postalAddress({ addressRegion: input.name }),
  };
  return compact(obj);
}

/* ---------- BreadcrumbList ---------- */

/**
 * BreadcrumbList JSON-LD.
 *
 * ⚠️ url 없는 중간 항목은 **버린다**. 구글은 마지막 요소를 뺀 모든 ListItem 에
 * item(URL)을 요구하고, 없으면 심각 오류로 그 페이지의 탐색경로를 통째로
 * 무시한다. 2026-07-27 Search Console 경고가 정확히 이것이었다 —
 * "'item' 입력란이 누락되었습니다(경로: 'itemListElement')".
 *
 * 원인은 호출부에서 목적지 없는 라벨을 크럼으로 넣은 것이었다:
 *   /complex/[id] → { name: v.dong }        (동 이름, 해당 페이지 없음)
 *   /region/[id]  → { name: "지역 시세" }   (지역 목록 페이지 없음)
 * 둘 다 2만 5천여 개 단지 페이지와 지역 페이지에 깔려 있었다.
 *
 * 왜 호출부만 고치지 않고 여기서 막는가: 이 두 라우트는 ISR 동적 페이지라
 * 빌드 산출물에 HTML 이 없고, 그래서 check-jsonld 게이트가 볼 수 없다
 * (스크립트 상단에 명시된 사각지대). 게이트가 못 잡는 자리는 자료구조가
 * 대신 막아야 한다 — 링크 없는 단계는 애초에 탐색경로의 단계가 아니다.
 *
 * position 은 걸러낸 뒤 1부터 다시 매긴다(구글은 연속된 번호를 요구한다).
 */
export function breadcrumbJsonLd(
  items: Array<{ name: string; url?: string }>,
): Record<string, unknown> {
  const navigable = items.filter(
    (it, i) => i === items.length - 1 || Boolean(it.url?.trim()),
  );
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: navigable.map((it, i) =>
      compact({
        "@type": "ListItem",
        position: i + 1,
        name: it.name,
        item: it.url ? absoluteUrl(it.url) : undefined,
      }),
    ),
  };
}

/* ---------- FAQPage (G13/S19 — Q&A 블록과 반드시 같은 배열에서 생성) ---------- */

export type FaqItem = { q: string; a: string };

/**
 * FAQPage JSON-LD. 규칙: 화면에 실제로 보이는 Q&A 와 같은 items 배열로만 만든다 —
 * 화면에 없는 질문을 스키마에만 넣는 것은 구글 정책 위반이자 허위 표기다.
 */
export function faqJsonLd(items: FaqItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };
}

/* ---------- HowTo (/guides — 화면에 실제 렌더되는 단계 배열로만 생성) ---------- */

export type HowToStep = { name: string; text: string };

/**
 * HowTo JSON-LD. FAQPage 와 같은 규칙: 화면에 보이는 단계 배열(STAGES 등)을
 * 그대로 받아 만든다 — 화면에 없는 단계를 스키마에만 넣는 것은 허위 표기다.
 * position 은 배열 순서 그대로 1부터.
 */
export function howToJsonLd(input: {
  name: string;
  description?: string | null;
  /** 이 HowTo 가 실리는 페이지 경로 (예: "/guides/contract") */
  path: string;
  steps: HowToStep[];
}): Record<string, unknown> {
  return compact({
    "@context": "https://schema.org",
    "@type": "HowTo",
    "@id": `${absoluteUrl(input.path)}#howto`,
    name: input.name,
    description: input.description?.trim() || undefined,
    step: input.steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  });
}

/* ---------- [1006 · E] 발행 주체 참조 · WebPage(speakable) · Dataset · DataCatalog ---------- */

/** 전역 Organization 노드의 @id (app/components/SiteJsonLd.tsx 가 낸다) */
export const ORGANIZATION_ID = `${BASE_URL}/#organization`;
/** 전역 WebSite 노드의 @id */
export const WEBSITE_ID = `${BASE_URL}/#website`;

/**
 * Article.publisher · Dataset.creator 자리에 넣는 참조.
 * 이름·URL 을 다시 적지 않고 전역 노드를 가리킨다 — 같은 주체가 페이지마다
 * 다른 노드로 읽히지 않게(G16). 이미 /reports·/digest·/notes/best 가 이 모양이다.
 */
export function publisherRef(): { "@id": string } {
  return { "@id": ORGANIZATION_ID };
}

/** 지역 허브 Place 노드의 @id — regionPlaceJsonLd 와 같은 규칙 */
export function regionEntityId(id: string): string {
  return `${BASE_URL}/region/${id}`;
}

/** 단지 허브 ApartmentComplex 노드의 @id — complexResidenceJsonLd 와 같은 규칙 */
export function complexEntityId(id: string): string {
  return `${BASE_URL}/complex/${encodeURIComponent(id)}`;
}

/**
 * WebPage + speakable. schema.org 는 speakable 을 WebPage·Article 에만 둔다(Place·
 * ApartmentComplex 에는 없다) — 그래서 지역·단지 허브는 엔티티 노드 옆에 WebPage
 * 노드를 하나 더 내고 mainEntity 로 엔티티를 가리킨다.
 *
 * cssSelector 는 **페이지에 실제로 있는 셀렉터만** 넘긴다(기본값은 인용 요약 블록
 * `[data-ai-summary]`). 없는 셀렉터를 적으면 스키마가 빈 곳을 가리키는 거짓이 된다.
 * dateModified 는 집계가 실제로 갱신된 날(ISO)이어야 한다 — 렌더 시각을 넣지 않는다.
 */
export function webPageJsonLd(input: {
  path: string;
  name: string;
  description?: string | null;
  /** ISO 날짜("2026-09-19") 또는 ISO 일시 */
  dateModified?: string | null;
  /** 기본 ["[data-ai-summary]"] */
  speakableSelectors?: string[];
  /** 이 페이지의 주 엔티티 @id (regionEntityId·complexEntityId) */
  mainEntityId?: string | null;
}): Record<string, unknown> {
  const url = absoluteUrl(input.path);
  const selectors = (input.speakableSelectors ?? ["[data-ai-summary]"]).filter(
    (s) => typeof s === "string" && s.trim() !== "",
  );
  return compact({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: input.name,
    description: input.description?.trim() || undefined,
    inLanguage: "ko-KR",
    isPartOf: { "@id": WEBSITE_ID },
    publisher: publisherRef(),
    dateModified: input.dateModified?.trim() || undefined,
    mainEntity: input.mainEntityId ? { "@id": input.mainEntityId } : undefined,
    speakable:
      selectors.length > 0
        ? { "@type": "SpeakableSpecification", cssSelector: selectors }
        : undefined,
  });
}

/** 국토교통부 실거래가 공개시스템 — Dataset.isBasedOn 기본값 (/tx·/analysis/temperature 와 동일) */
export const MOLIT_RT_URL = "https://rt.molit.go.kr";

/**
 * Dataset — 페이지가 **실제로 보여 주는** 집계만 기술한다(S18/G15).
 * 값이 없는 필드는 넣지 않는다(temporalCoverage·dateModified 를 지어내지 않는다).
 * distributionUrl 은 같은 집계를 기계가 받아갈 수 있는 실재 URL 만(공개 API).
 */
export function datasetJsonLd(input: {
  path: string;
  name: string;
  description: string;
  keywords?: string[];
  /** "2025-09/2026-08" — ymRangeToTemporalCoverage 로 만든다 */
  temporalCoverage?: string | null;
  dateModified?: string | null;
  variableMeasured?: string | string[] | null;
  /** 원출처 — 기본 국토교통부 실거래 */
  isBasedOn?: string | string[];
  /** 공개 API 등 실재하는 배포 URL(JSON) */
  distributionUrl?: string | null;
  /** 지역명("서울 송파구") — 있을 때만 */
  spatialCoverage?: string | null;
}): Record<string, unknown> {
  const url = absoluteUrl(input.path);
  return compact({
    "@context": "https://schema.org",
    "@type": "Dataset",
    "@id": `${url}#dataset`,
    name: input.name,
    description: input.description,
    url,
    inLanguage: "ko-KR",
    creator: publisherRef(),
    isBasedOn: input.isBasedOn ?? MOLIT_RT_URL,
    license: `${BASE_URL}/methodology`,
    keywords: input.keywords,
    temporalCoverage: input.temporalCoverage?.trim() || undefined,
    dateModified: input.dateModified?.trim() || undefined,
    variableMeasured: input.variableMeasured ?? undefined,
    spatialCoverage: input.spatialCoverage?.trim() || undefined,
    distribution: input.distributionUrl
      ? [
          {
            "@type": "DataDownload",
            contentUrl: input.distributionUrl,
            encodingFormat: "application/json",
          },
        ]
      : undefined,
  });
}

/**
 * DataCatalog — 공개 집계 API 문서(/developers)처럼 여러 Dataset 을 묶어 내놓는
 * 페이지용. dataset 배열이 비면 만들지 않는다(null) — 빈 카탈로그를 내보내지 않는다.
 */
export function dataCatalogJsonLd(input: {
  path: string;
  name: string;
  description: string;
  datasets: Array<{ path: string; name: string; description: string }>;
}): Record<string, unknown> | null {
  if (input.datasets.length === 0) return null;
  const url = absoluteUrl(input.path);
  return compact({
    "@context": "https://schema.org",
    "@type": "DataCatalog",
    "@id": `${url}#catalog`,
    name: input.name,
    description: input.description,
    url,
    inLanguage: "ko-KR",
    provider: publisherRef(),
    dataset: input.datasets.map((d) =>
      compact({
        "@type": "Dataset",
        "@id": `${absoluteUrl(d.path)}#dataset`,
        name: d.name,
        description: d.description,
        url: absoluteUrl(d.path),
        creator: publisherRef(),
        isBasedOn: MOLIT_RT_URL,
        license: `${BASE_URL}/methodology`,
      }),
    ),
  });
}

/** JSON-LD 객체 → 안전한 <script> 문자열 (XSS 차단: < 이스케이프) */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
