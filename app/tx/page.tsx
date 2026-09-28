import type { Metadata } from "next";
import Link from "next/link";
import { AdZone } from "@/app/components/ads/AdZone";
import { Explain } from "@/app/components/explain/Explain";
import { PageShell } from "../components/PageShell";
import {
  getTxCoverage,
  listTxRegions,
  MIN_BAND_TX,
  type TxRegionSummary,
} from "@/lib/market/tx-bands";
import { formatYmRange } from "@/lib/market/format";
import { groupBySido } from "@/lib/market/sido-group";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";
import { logger } from "@/lib/log";

/* ============================================================
   실거래 구간 인덱스 — /tx
   국토교통부 실거래(market_transactions) 기반 지역 목록.
   면적대·가격대 랜딩(/tx/[region]/[kind]/[band])의 진입점이자
   프로그래매틱 SEO 페이지들을 크롤러에 이어 주는 허브.

   ── "못 읽었다" 와 "없다" 를 절대 섞지 않는다 ──────────────────
   이 페이지는 예전에 `listTxRegions().catch(() => [])` 로 실패를 빈 배열로
   바꿨다. 2026-07-25 에 market_agg MV 의 GRANT 가 사라져 모든 조회가
   42501(permission denied)로 떨어졌을 때, 그 빈 배열이 "실거래 데이터를
   불러오지 못했습니다" 로 렌더돼 프리렌더 HTML 에 굳었고 — 배포가
   revalidate(1시간)보다 잦아 스스로 낫지도 않았다 — 하루 동안 아무도 몰랐다.
   로그에는 경고 한 줄뿐이었고 오류 코드조차 남지 않았다.

   그래서 지금은 로더가 예외를 던지고(lib/market/tx-bands.ts), 이 페이지가
   세 가지 상태를 각각 다르게 렌더한다:
     1) 정상 — 지역 목록
     2) 조회 실패 — 그렇게 말하고, robots noindex 를 건다(깨진 페이지를
        색인시키지 않는다). 원인은 서버 로그에 code·hint 까지 남긴다.
     3) 정말로 빈 결과 — "아직 구간이 없다" 는 별개의 문장
   ============================================================ */

/* [B001 1단계] 1h → 24h. 이 페이지의 원천(국토부 실거래)은 하루 1번 적재라
   더 자주 재렌더할 이유가 없다 — 26k 페이지 크롤 재렌더가 DB 를 밀던 문제의 반쪽. */
/* [1010] 24h → 7일. 원천(국토부 실거래)은 하루 1회 적재이고, 적재 직후
   lib/cache/invalidate.ts SOURCE_MAP.molit 이 "/tx" 를 이미 비운다 — 시간 TTL 은
   안전망일 뿐이다. 하루 눈금으로 두면 적재가 없는 날에도 크롤러 방문마다 다시 그린다. */
export const revalidate = 604_800;

const PATH = "/tx";

type TxIndexData = {
  regions: TxRegionSummary[];
  coverage: Awaited<ReturnType<typeof getTxCoverage>> | null;
  /** 조회 자체가 실패한 사유. null 이면 "읽었고 결과가 이만큼" 이라는 뜻이다. */
  loadError: string | null;
};

/**
 * 순차로 부른다(Promise.all 아님). getTxCoverage() 는 listTxRegions() 가 채워 둔
 * 모듈 캐시를 그대로 쓰므로, 나란히 띄우면 같은 쿼리를 두 번 던지게 된다.
 */
async function loadTxIndex(): Promise<TxIndexData> {
  try {
    const regions = await listTxRegions();
    const coverage = await getTxCoverage();
    return { regions, coverage, loadError: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(
      "[/tx] 실거래 구간 집계를 읽지 못했습니다 — 거래가 없는 것이 아니라 조회가 실패했습니다:",
      message,
    );
    return { regions: [], coverage: null, loadError: message };
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const { regions, loadError } = await loadTxIndex();
  // 구간에 정리된 건수. 전체 신고분과 다를 수 있어 문장에서도 "정리했다"로 쓴다.
  const total = regions.reduce((s, r) => s + r.txCount, 0);
  const description =
    regions.length > 0
      ? `국토교통부 아파트 매매 실거래 ${total.toLocaleString("ko-KR")}건을 ${regions.length}개 지역 × 면적대·가격대 구간으로 정리했습니다. 신고 기준 ${formatYmRange(
          regions.reduce<string | null>((a, r) => (r.firstYm && (!a || r.firstYm < a) ? r.firstYm : a), null),
          regions.reduce<string | null>((a, r) => (r.latestYm && (!a || r.latestYm > a) ? r.latestYm : a), null),
        )}. 매물 호가가 아닙니다.`
      : "국토교통부 아파트 매매 실거래를 지역·면적대·가격대로 나눠 봅니다. 매물 호가가 아닙니다.";
  return {
    title: "지역별 면적대·가격대 실거래 | 내집나우",
    description,
    alternates: seoAlternates(PATH),
    // 조회가 실패한 상태의 껍데기를 색인시키지 않는다. 다음 재검증에서 성공하면
    // 이 지시는 사라진다 — 실패를 색인에 남기는 것보다 잠깐 빠지는 편이 낫다.
    ...(loadError ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: "지역별 면적대·가격대 실거래 | 내집나우",
      description,
      url: `https://naezipnow.com${PATH}`,
      type: "website",
      /* [C004] og:image 부재 2페이지 중 하나 — 제목 박힌 동적 카드 */
      images: [
        {
          url: `/api/og?${new URLSearchParams({ title: "지역별 실거래 한눈에" }).toString()}`,
          width: 1200,
          height: 630,
        },
      ],
    },
  };
}

export default async function TxIndexPage() {
  const { regions, coverage, loadError } = await loadTxIndex();
  const total = regions.reduce((s, r) => s + r.txCount, 0);
  // 커버리지: 구간에 정리된 건수(total)와 면적대 셀 전체 합을 분리해서 받는다.
  // 둘이 다르면 그 차이를 감추지 않고 문장으로 드러낸다 — 아래 uncovered 참고.
  const uncovered = coverage ? Math.max(0, coverage.totalTx - coverage.coveredTx) : 0;
  const firstYm = regions.reduce<string | null>(
    (a, r) => (r.firstYm && (!a || r.firstYm < a) ? r.firstYm : a),
    null,
  );
  const latestYm = regions.reduce<string | null>(
    (a, r) => (r.latestYm && (!a || r.latestYm > a) ? r.latestYm : a),
    null,
  );
  const range = formatYmRange(firstYm, latestYm);

  /* 항목 46d — 허브의 실제 지역 목록을 ItemList 로 기술한다. 값은 전부
     페이지가 이미 렌더하는 실데이터(listTxRegions)에서만 온다 — 조회 실패
     (regions=[])면 노드 자체를 내보내지 않는다(빈 목록을 사실처럼 광고 금지). */
  const itemListJsonLd =
    regions.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "지역별 아파트 매매 실거래 구간",
          numberOfItems: regions.length,
          itemListElement: regions.slice(0, 100).map((r, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: `${r.name} 실거래 구간`,
            url: `https://naezipnow.com/tx/${encodeURIComponent(r.slug)}`,
          })),
        }
      : null;

  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "지역별 실거래 구간", url: PATH },
  ]);

  return (
    <PageShell breadcrumb="홈 › 지역별 실거래 구간" title="지역별 면적대·가격대 실거래">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(itemListJsonLd ? [crumbs, itemListJsonLd] : crumbs),
        }}
      />

      {/* [1015 · 규칙 B] 설명 문단 → 사실 한 줄(지역 수 · 건수 · 기간 · 출처). 집계 범위 설명과 "읽는 법" 네 줄은 ⓘ 하나로 접는다.
          숫자는 전부 실데이터(listTxRegions·getTxCoverage). */}
      <p className="rise-in mb-4 flex flex-wrap items-center gap-x-1 t-sub text-text-2 max-md:mb-3">
        {total > 0 ? (
          <>
            <strong className="text-ink">{regions.length}개 지역</strong> ·{" "}
            <strong className="text-ink">{total.toLocaleString("ko-KR")}건</strong>
            {range && ` · ${range} 신고 기준`} · 국토교통부 실거래 · 매물 호가 아님
          </>
        ) : (
          <>국토교통부 아파트 매매 실거래 · 지역 × 면적대·가격대 · 매물 호가 아님</>
        )}
        <Explain
          title="이 숫자를 읽는 법"
          body={[
            "실거래 신고가. 매물 호가·중개사 제시가가 아니며, 계약 후 신고까지 시차가 있어 최근 달은 건수가 더 늘어날 수 있다.",
            "면적은 전용면적 기준. 분양면적(공급면적)으로 부르는 평수와 다르다.",
            "구간 평균은 그 구간에 신고된 거래만의 평균. 지역 전체나 특정 단지의 현재 가격이 아니다.",
            `거래 ${MIN_BAND_TX}건 미만 구간은 평균이 한두 건에 흔들려 페이지를 만들지 않고, 그 거래는 위 합계에도 넣지 않았다.`,
            ...(uncovered > 0 && coverage
              ? [
                  `같은 기간 면적이 확인된 신고분 ${coverage.totalTx.toLocaleString("ko-KR")}건 가운데 구간당 ${MIN_BAND_TX}건에 못 미친 ${uncovered.toLocaleString("ko-KR")}건은 위 숫자에서 빠져 있다.`,
                ]
              : []),
          ]}
          source={`국토교통부 실거래가 공개시스템${range ? ` · ${range} 신고분` : ""} · 해제 신고분 제외`}
        />
      </p>

      {/* [1015 · 규칙 F·G] 데스크톱 2단 — 본문(지역 목록) + 340px 레일(관련 용어 · 관련 화면 · 데이터 출처 · 광고 1). 폰은 한 열, 광고는 끝 1. */}
      <div className="grid grid-cols-1 gap-4 max-md:gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
      <div className="min-w-0">
      {loadError ? (
        <section className="rise-in-1 card p-[var(--pad-card)]">
          {/* 모바일 실측 18 — py-8 은 세 줄 문구에 화면의 40% 를 차지했다. 문구는
              그대로(정직성 유지), 여백만 줄인다. */}
          <p className="py-4 text-center t-body text-text-3 md:py-8">
            실거래 집계를 <strong className="text-ink">불러오지 못했습니다</strong>.
            <br />
            거래가 없다는 뜻이 아니라 조회 자체가 실패했다는 뜻입니다. 잠시 후 다시
            확인해 주세요.
          </p>
        </section>
      ) : regions.length === 0 ? (
        <section className="rise-in-1 card p-[var(--pad-card)]">
          <p className="py-4 text-center t-body text-text-3 md:py-8">
            아직 구간으로 정리된 지역이 없습니다.
            <br />
            한 구간에 거래 {MIN_BAND_TX}건이 모이면 이곳에 지역이 나타납니다.
          </p>
        </section>
      ) : (
        <section className="rise-in-1 card p-[var(--pad-card)]">
          {/* [1015 · 규칙 C] 제목 옆 부연("구간별 페이지로 이동") 삭제 — 정렬 기준만 캡션으로 */}
          <h2 className="t-section text-ink">지역</h2>
          <p className="mt-0.5 t-caption text-text-3">거래 많은 순</p>
          {/* 웹13 — 1440px 에서 3열이 성겨 보였다 → xl 4열. "거래 많은 순"
              정렬 근거를 미니바로 시각화 — 최대 지역 대비 비율이라 축이
              하나뿐이고, 수치는 이미 옆에 그대로 적혀 있다(막대는 보조). */}
          {/* [970 · B-34] 214개 지역을 한 열로 늘어놓으면 모바일에서 14,000px 이었다 — 시/도별
              <details> 로 접는다(첫 묶음만 펼침). 링크는 접혀 있어도 HTML 에 있어 크롤링·
              색인에는 영향이 없고, 서버 컴포넌트라 JS 없이 동작한다. 묶음 순서는 거래 많은
              시/도부터, 카탈로그로 시/도를 모르는 지역은 맨 끝 "그 밖의 지역". */}
          {(() => {
            const maxTx = regions.reduce((m, r) => Math.max(m, r.txCount), 0);
            const groups = groupBySido(regions, (r) => r.name, (r) => r.txCount);
            return (
              <div className="mt-3 flex flex-col gap-2 max-md:mt-2">
                {groups.map((g, gi) => {
                  const groupTx = g.items.reduce((sum, r) => sum + r.txCount, 0);
                  return (
                    <details
                      key={g.sido}
                      open={gi === 0}
                      className="group rounded-lg border border-border bg-surface"
                    >
                      <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                        <span className="t-body font-bold text-ink">
                          {g.sido}{" "}
                          <span className="t-sub font-medium text-text-3">{g.items.length}개 지역</span>
                        </span>
                        <span className="shrink-0 t-sub text-text-3">
                          {groupTx.toLocaleString("ko-KR")}건{" "}
                          <span aria-hidden className="ml-1 inline-block transition-transform group-open:rotate-180">
                            ▾
                          </span>
                        </span>
                      </summary>
                      <div className="grid grid-cols-1 gap-2 px-3 pb-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {g.items.map((r) => (
                          <Link
                            key={r.slug}
                            prefetch={false}
                            href={`/tx/${encodeURIComponent(r.slug)}`}
                            className="tile flex flex-col gap-1.5 rounded-lg border border-border px-3 py-2.5 t-body"
                          >
                            <span className="flex items-baseline justify-between gap-3">
                              <span className="font-bold text-ink">{r.name}</span>
                              <span className="shrink-0 t-sub text-text-3">
                                {r.txCount.toLocaleString("ko-KR")}건 · 구간{" "}
                                {r.areaCells.length + r.priceCells.length}
                              </span>
                            </span>
                            {maxTx > 0 && (
                              <span
                                aria-hidden
                                className="block h-[3px] overflow-hidden rounded-full bg-bg"
                              >
                                <span
                                  className="block h-full rounded-full bg-primary/45"
                                  style={{ width: `${Math.max(3, Math.round((r.txCount / maxTx) * 100))}%` }}
                                />
                              </span>
                            )}
                          </Link>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            );
          })()}
        </section>
      )}

      {/* [1015 · 규칙 B] "이 숫자를 읽는 법" 설명 블록은 위 ⓘ 로 접었다. 용어 링크(항목 14)와 관련 화면 링크는 오른쪽 레일로. */}
      {/* [961 → 1015 · 규칙 G] 페이지 끝 광고 1 — 예전 AdSenseUnit(읽는 법 아래·데스크톱 전용) 자리 */}
      <AdZone placement="page_bottom" seed={5} plan={null} className="mt-6 max-md:mt-4" />
      </div>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-[76px] lg:self-start">
        {/* 항목 14 — 용어 첫 등장에 용어사전 링크. [1015] 문장 속 링크 → 레일의 행 목록 */}
        <nav aria-label="관련 용어" data-tone="hanji" className="lq-panel flex flex-col divide-y">
          {[
            ["/glossary/silgeoraega", "실거래 신고가"],
            ["/glossary/hoga", "호가"],
            ["/glossary/jeonyongmyeonjeok", "전용면적"],
            ["/glossary/gonggeupmyeonjeok", "공급면적(분양면적)"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="flex min-h-[40px] items-center justify-between gap-2 py-2 t-sub font-bold text-ink no-underline">
              {label} <span aria-hidden="true" className="text-text-3">›</span>
            </Link>
          ))}
          <Link href="/glossary" className="flex min-h-[40px] items-center justify-between gap-2 py-2 t-sub font-bold text-primary no-underline">
            부동산 용어사전 <span aria-hidden="true">›</span>
          </Link>
        </nav>
        <nav aria-label="관련 화면" data-tone="blue" className="lq-panel flex flex-col divide-y">
          {/* /analysis/price 는 robots Disallow(데모 수치) — 색인 허브에서 차단 경로로 링크하지 않는다(항목 46c). timing 은 색인 허용이다. */}
          {[
            ["/complex/browse", "단지 실거래 브라우즈"],
            ["/complex/compare", "단지 vs 단지 비교"],
            ["/analysis/timing", "지역 거래 흐름 · 타이밍 분석"],
            ["/imjang", "임장 가이드"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="flex min-h-[40px] items-center justify-between gap-2 py-2 t-sub font-bold text-ink no-underline">
              {label} <span aria-hidden="true" className="text-text-3">›</span>
            </Link>
          ))}
        </nav>
        <p className="px-1 t-caption leading-[1.6] text-text-3">
          데이터 출처: 국토교통부 실거래가 공개시스템 신고분(해제 신고분 제외){range ? ` · ${range}` : ""} · 구간당 {MIN_BAND_TX}건 이상만
        </p>
        <AdZone placement="sidebar" seed={1} plan={null} className="hidden lg:block" />
      </aside>
      </div>
    </PageShell>
  );
}
