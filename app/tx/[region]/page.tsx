/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import {
  findTxRegionBySlug,
  listTxRegions,
  MIN_BAND_TX,
  type BandCell,
  type TxRegionSummary,
} from "@/lib/market/tx-bands";
import { BAND_KIND_LABEL, type BandKind } from "@/lib/market/bands";
import { formatKrwShort, formatYm, formatYmRange } from "@/lib/market/format";
import { breadcrumbJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";
import { QaBlock } from "@/app/components/QaBlock";
import { CitationBlock } from "@/app/components/CitationBlock";

/* ============================================================
   지역 실거래 구간 허브 — /tx/[region]
   그 지역의 면적대·가격대 랜딩을 한자리에 모은다.
   region 슬러그는 market_transactions.region_name 의 공백을 하이픈으로 바꾼 값이며,
   DB 에 없는 값은 404 (임의 문자열로 빈 페이지가 양산되는 걸 막는다).
   ============================================================ */

/* [B001 1단계] 1h → 24h. 이 페이지의 원천(국토부 실거래)은 하루 1번 적재라
   더 자주 재렌더할 이유가 없다 — 26k 페이지 크롤 재렌더가 DB 를 밀던 문제의 반쪽. */
/* [1010] 24h → 7일. 위 판단은 맞았지만 눈금이 여전히 시간이었다. 실거래 수집은 시군구
   슬라이스 회전이라 **하루에 바뀌는 지역은 16~24곳**뿐인데, 24시간 TTL 은 214개 지역
   전부를 매일 다시 그리게 한다. 이제 바뀐 지역만
   lib/region/invalidate-market.ts invalidateChangedMarketRegions() 가 비우고,
   안 바뀐 지역은 7일 내내 CDN HIT 이다(재렌더 0 · ISR Write 0). */
export const revalidate = 604_800;
/* 빈 배열 = "빌드 때 미리 만들 경로는 없다". 이 export 가 있어야 Next 가 이
   라우트를 ISR 로 분류한다 — 없으면 `revalidate` 를 적어 둬도 요청마다 서버
   렌더로 돌면서 Next 가 `private, no-cache, no-store` 를 실어 보내고, CDN 은
   한 벌도 재사용하지 못한다(2026-07-28 함수 호출 소진 사고. 자세한 내용은
   app/complex/[id]/page.tsx 의 같은 자리 주석). dynamicParams 기본값이 true 라
   실제 요청이 오면 그때 만들어 캐시한다. */
export function generateStaticParams(): { region: string }[] {
  return [];
}


/**
 * null 은 "그런 지역이 없다"(→ 404) 일 때만이다. 조회 실패는 던진다 —
 * 예전의 `.catch(() => null)` 은 DB 장애를 404 로 바꿔 크롤러에게 "이 URL 은
 * 없어졌다" 고 확정 신고하는 꼴이었다(5xx 는 재시도를 부르지만 404 는 색인에서
 * 지운다). 자세한 경위는 lib/market/tx-bands.ts 헤더 참고.
 */
async function load(regionSlug: string): Promise<TxRegionSummary | null> {
  return findTxRegionBySlug(regionSlug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ region: string }>;
}): Promise<Metadata> {
  const { region: slug } = await params;
  const region = await load(slug);
  if (!region) {
    return { title: "지역 실거래 구간 | 내집나우", robots: { index: false, follow: false } };
  }
  const range = formatYmRange(region.firstYm, region.latestYm);
  const title = `${region.name} 아파트 실거래 ${region.txCount.toLocaleString("ko-KR")}건 — 면적대·가격대별 | 내집나우`;
  const description = `${region.name} 아파트 매매 실거래를 면적대(${region.areaCells.length}구간)·가격대(${region.priceCells.length}구간)로 나눠 봅니다. 국토교통부 신고 기준${
    range ? ` ${range}` : ""
  } ${region.txCount.toLocaleString("ko-KR")}건. 매물 호가가 아닙니다.`;
  const path = `/tx/${encodeURIComponent(region.slug)}`;
  return {
    title,
    description,
    alternates: seoAlternates(path),
    openGraph: { title, description, url: `https://naezipnow.com${path}`, type: "website" },
  };
}

/* [v4 · 규칙 5] 구간 표(가로 스크롤 460px) → 구분선 목록 행: 왼쪽 구간(굵게) + 보조 한 줄(거래·단지·평균) /
   오른쪽 중앙값 + `›`(행 전체가 구간 페이지 링크). 출처 캡션은 두 목록 뒤 한 번만(같은 사실 한 번). */
function BandTable({
  region,
  kind,
  cells,
}: {
  region: TxRegionSummary;
  kind: BandKind;
  cells: BandCell[];
}) {
  if (cells.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-baseline gap-1.5 t-section text-ink">
          {BAND_KIND_LABEL[kind]}별 <span className="t-num text-text-3">{cells.length}</span>
        </h2>
        <span className="t-caption text-text-3">중앙값</span>
      </div>
      {/* [v4.1 · 리퀴드 목록] 면적별 = blue · 가격대별 = mint(돈) — 위아래로 붙는 두 묶음이 다른 색 */}
      <ul data-tone={kind === "area" ? "blue" : "mint"} className="card flex flex-col divide-y divide-line rounded-lg px-4">
        {cells.map((c) => (
          <li key={c.bandSlug}>
            <Link
              prefetch={false}
              href={`/tx/${encodeURIComponent(region.slug)}/${kind}/${c.bandSlug}`}
              className="press flex min-h-14 items-center justify-between gap-x-3 py-3 no-underline"
            >
              <span className="min-w-0 flex-1">
                <span className="block t-body font-bold text-ink">{c.bandLabel}</span>
                <span className="mt-0.5 block truncate t-sub tabular-nums text-text-3">
                  {c.txCount.toLocaleString("ko-KR")}건 · 단지 {c.complexCount.toLocaleString("ko-KR")}곳 · 평균{" "}
                  {formatKrwShort(c.avgKrw)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="t-body t-num text-ink">{formatKrwShort(c.medianKrw)}</span>
                <span aria-hidden="true" className="t-body text-text-3">
                  ›
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* G5+G12 — 지역 Q&A: 이 페이지가 이미 가진 실데이터로만 답을 만든다.
   수치가 없으면 그 질문은 넣지 않는다(빈 답·추정 금지). */
function buildRegionFaq(region: TxRegionSummary, range: string | null): FaqItem[] {
  const items: FaqItem[] = [];
  if (region.txCount > 0) {
    items.push({
      q: `${region.name} 아파트 실거래는 몇 건인가요?`,
      a: `국토교통부 신고 기준${range ? ` ${range}` : ""} ${region.name} 아파트 매매 실거래는 ${region.txCount.toLocaleString("ko-KR")}건, 거래 단지는 ${region.complexCount.toLocaleString("ko-KR")}곳입니다. 매물 호가가 아닌 신고된 실거래만 집계한 값입니다.`,
    });
  }
  const topArea = [...region.areaCells].sort((a, b) => b.txCount - a.txCount)[0];
  if (topArea) {
    items.push({
      q: `${region.name}에서 가장 거래가 많은 면적대는 어디인가요?`,
      a: `전용면적 ${topArea.bandLabel} 구간이 ${topArea.txCount.toLocaleString("ko-KR")}건으로 가장 많이 거래됐고, 이 구간의 거래금액 중앙값은 ${formatKrwShort(topArea.medianKrw)}입니다${range ? ` (${range} 신고 기준)` : ""}.`,
    });
  }
  const topPrice = [...region.priceCells].sort((a, b) => b.txCount - a.txCount)[0];
  if (topPrice) {
    items.push({
      q: `${region.name} 아파트는 주로 어느 가격대에서 거래되나요?`,
      a: `${topPrice.bandLabel} 구간의 거래가 ${topPrice.txCount.toLocaleString("ko-KR")}건으로 가장 많습니다${range ? ` (${range} 신고 기준)` : ""}. 계약 후 신고까지 최대 30일의 시차가 있어 최근 달 수치는 이후 늘어날 수 있습니다.`,
    });
  }
  return items;
}

export default async function TxRegionPage({
  params,
}: {
  params: Promise<{ region: string }>;
}) {
  const { region: slug } = await params;
  const region = await load(slug);
  if (!region) notFound();

  const range = formatYmRange(region.firstYm, region.latestYm);
  const faq = buildRegionFaq(region, range);

  /* 웹9 — 같은 시/도의 다른 지역 칩. region.name 은 "서울 강남구" 꼴이라 첫
     토큰이 시/도다(좌표 인접 계산은 다음 단계 — 지금은 행정 그룹만). 실재하는
     허브(listTxRegions 결과 = /tx 목록과 동일)만 링크한다 — 죽은 링크 금지.
     조회 실패면 칩 없이 렌더한다(보조 내비게이션이라 페이지를 막지 않는다). */
  const sido = region.name.split(" ")[0] ?? "";
  let siblings: TxRegionSummary[] = [];
  if (sido) {
    try {
      siblings = (await listTxRegions())
        .filter((r) => r.slug !== region.slug && r.name.split(" ")[0] === sido)
        .slice(0, 12);
    } catch {
      siblings = [];
    }
  }

  /* S18/G15 — Dataset 스키마: 이 페이지가 실제로 보여주는 집계를 데이터셋으로 기술.
     구글 데이터셋 검색 노출 + AI 의 출처 인식(원출처 국토교통부 명시). */
  const datasetJsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${region.name} 아파트 매매 실거래 집계`,
    description: `${region.name} 아파트 매매 실거래 ${region.txCount.toLocaleString("ko-KR")}건의 면적대·가격대별 집계${range ? ` (${range} 신고 기준)` : ""}. 해제 신고분 제외.`,
    url: `https://naezipnow.com/tx/${encodeURIComponent(region.slug)}`,
    inLanguage: "ko-KR",
    creator: { "@id": "https://naezipnow.com/#organization" },
    isBasedOn: "https://rt.molit.go.kr",
    license: "https://naezipnow.com/methodology",
    keywords: [region.name, "아파트", "실거래가", "매매"],
    /* 항목 45 — 기계 판독용 신선도·기간·인용 가능한 API. 값은 전부 페이지가
       이미 가진 실데이터에서만 온다 — 없으면 필드 자체를 넣지 않는다. */
    ...(region.lastDataAt
      ? { dateModified: region.lastDataAt.toISOString().slice(0, 10) }
      : {}),
    ...(region.firstYm && region.latestYm
      ? {
          temporalCoverage: `${region.firstYm.slice(0, 4)}-${region.firstYm.slice(4, 6)}/${region.latestYm.slice(0, 4)}-${region.latestYm.slice(4, 6)}`,
        }
      : {}),
    distribution: [
      {
        "@type": "DataDownload",
        contentUrl: "https://naezipnow.com/api/public/v1/regions/monthly",
        encodingFormat: "application/json",
      },
    ],
  };
  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "지역별 실거래 구간", url: "/tx" },
    { name: region.name, url: `/tx/${encodeURIComponent(region.slug)}` },
  ]);

  return (
    <PageShell breadcrumb={`홈 › 지역별 실거래 구간 › ${region.name}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript([crumbs, datasetJsonLd]) }}
      />

      {/* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄 → 면적대·가격대 구분선 행(오른쪽 중앙값) → 출처 캡션 한 줄 →
          같은 시/도 지역 칩 한 줄 → 링크 한 줄 → 맨 끝 접힘 "데이터 출처·Q&A".
          지운 것: 소개 문단(→ 사실 줄), 표 두 개의 출처 줄 중복(→ 한 번), 맨 끝 설명 문단(/tx 읽는 법과 같은 말),
          하우스 광고(AdZone). */}
      <div className="mx-auto flex max-w-[760px] flex-col gap-8">
        <header className="flex flex-col gap-0.5">
          <h1 className="rise-in t-title text-ink">{region.name} 면적대·가격대별 실거래</h1>
          <p className="t-sub text-text-3">
            매매 {region.txCount.toLocaleString("ko-KR")}건 · 단지 {region.complexCount.toLocaleString("ko-KR")}곳
            {range ? ` · ${range} 신고` : ""} · 호가 아님
          </p>
        </header>

        <BandTable region={region} kind="area" cells={region.areaCells} />
        <div className="flex flex-col gap-2">
          <BandTable region={region} kind="price" cells={region.priceCells} />
          <p className="t-caption text-text-3">
            국토교통부 실거래 신고{region.latestYm ? ` · ${formatYm(region.latestYm)} 신고분까지` : ""} · 전용면적 기준 ·
            해제 신고 제외 · {MIN_BAND_TX}건 미만 구간 제외
          </p>
        </div>

        {/* 웹9 — 같은 시/도 인접 지역(실재 허브만). [v4] 여러 줄 칩 → 한 줄 가로 스크롤(지역 줄 부품) */}
        {siblings.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="t-section text-ink">
              {sido} 다른 지역 <span className="t-sub font-medium text-text-3">거래 많은 순</span>
            </h2>
            <div className="-mx-3.5 flex gap-2 overflow-x-auto px-3.5 [scrollbar-width:none] md:mx-0 md:px-0">
              {siblings.map((s) => (
                <Link
                  key={s.slug}
                  prefetch={false}
                  href={`/tx/${encodeURIComponent(s.slug)}`}
                  className="chip inline-flex min-h-[32px] shrink-0 items-center border border-line bg-surface px-3 t-sub font-bold text-text-2 no-underline transition-colors hover:border-primary hover:text-primary"
                >
                  {s.name.slice(sido.length).trim() || s.name}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* [1012 · 규칙 5] 링크 = 구체 대상. [v4] 설명 문단은 지우고 링크 한 줄만 */}
        <p className="t-sub text-text-3">
          <Link href="/tx" className="tap-line font-bold text-primary no-underline">
            지역별 실거래 구간 목록
          </Link>
          {" · "}
          <Link href="/complex/browse" className="tap-line font-bold text-primary no-underline">
            단지별 실거래 브라우즈
          </Link>
          {" · "}
          {/* 시세(보기) → 임장(가기) 연결 — 같은 지역 원천이라 슬러그가 1:1 이다 */}
          <Link href={`/imjang/${encodeURIComponent(region.slug)}`} className="tap-line font-bold text-primary no-underline">
            이 지역 임장 가이드
          </Link>
        </p>

        {/* [v4 · 규칙 3] 맨 끝 접힘 하나 — G5+G13 Q&A(FAQPage 스키마 · 같은 배열) + G8 인용문 */}
        {(faq.length > 0 || region.txCount > 0) && (
          <details className="group border-t border-line pt-1">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
              데이터 출처·Q&amp;A
              <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            <div className="flex flex-col pb-3 pt-1">
              <QaBlock title={`${region.name} 실거래 Q&A`} items={faq} />
              {region.txCount > 0 && (
                <CitationBlock
                  sentence={`내집나우(naezipnow.com) 집계에 따르면, ${region.name} 아파트 매매 실거래는${range ? ` ${range}` : ""} ${region.txCount.toLocaleString("ko-KR")}건이다 (국토교통부 실거래 신고 기반, 해제분 제외).`}
                />
              )}
            </div>
          </details>
        )}
      </div>
    </PageShell>
  );
}
