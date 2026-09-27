/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
import type { Metadata } from "next";
import Link from "next/link";
import { AdSenseUnit } from "@/app/components/ads/AdSenseUnit";
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

  /* [v4 · 규칙 1] 머리 사실 한 줄 — 지역 수 · 건수 · 신고 기간 · "호가 아님"(숫자·출처만) */
  const headFact = [
    ...(total > 0 ? [`${regions.length}개 지역`, `${total.toLocaleString("ko-KR")}건`] : []),
    ...(range ? [`${range} 신고`] : []),
    "국토교통부 실거래 · 호가 아님",
  ].join(" · ");
  const GLOSS = "tap-line font-bold text-ink underline decoration-line underline-offset-2";

  return (
    <PageShell breadcrumb="홈 › 지역별 실거래 구간">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(itemListJsonLd ? [crumbs, itemListJsonLd] : crumbs),
        }}
      />

      {/* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄 → 시/도별 접힘 목록(구분선 행, 오른쪽 건수) → 이어 보기 한 줄 →
          맨 끝 접힘 "읽는 법·출처". 지운 것: 소개 문단(세 문장 → 사실 줄), 지역 타일 격자·미니 막대(→ 행 오른쪽 숫자),
          "이 숫자를 읽는 법" 카드(→ 맨 끝 접힘, 용어사전 링크는 그대로), 링크 문단(→ 한 줄). */}
      <div className="mx-auto flex max-w-[760px] flex-col gap-8">
        <header className="flex flex-col gap-0.5">
          <h1 className="rise-in t-title text-ink">지역별 면적대·가격대 실거래</h1>
          <p className="t-sub text-text-3">{headFact}</p>
        </header>

        {loadError ? (
          /* "못 읽었다"와 "없다"를 섞지 않는다(정직성) — 한 줄 */
          <p className="card rounded-lg px-4 py-6 text-center t-body text-text-3">
            실거래 집계를 <strong className="text-ink">불러오지 못했어요</strong> · 조회 실패(거래 없음 아님) · 잠시 후 다시 열기
          </p>
        ) : regions.length === 0 ? (
          <p className="card rounded-lg px-4 py-6 text-center t-body text-text-3">
            구간으로 정리된 지역 없음 · 한 구간에 거래 {MIN_BAND_TX}건이 모이면 생김
          </p>
        ) : (
          <section aria-labelledby="tx-regions-h" className="flex flex-col gap-2">
            <h2 id="tx-regions-h" className="flex items-baseline gap-1.5 t-section text-ink">
              지역 <span className="t-sub font-medium text-text-3">거래 많은 순</span>
            </h2>
            {/* [970 · B-34] 214개 지역을 한 열로 늘어놓으면 모바일에서 14,000px 이었다 — 시/도별
                <details> 로 접는다(첫 묶음만 펼침). 링크는 접혀 있어도 HTML 에 있어 크롤링·
                색인에는 영향이 없고, 서버 컴포넌트라 JS 없이 동작한다. 묶음 순서는 거래 많은
                시/도부터, 카탈로그로 시/도를 모르는 지역은 맨 끝 "그 밖의 지역".
                [v4 · 규칙 5] 묶음 = 1px 구분선 행, 묶음 안 지역 = 구분선 행(왼쪽 이름 + 구간 수 / 오른쪽 건수) */}
            <div data-tone="blue" className="card flex flex-col divide-y divide-line rounded-lg px-4">
              {groupBySido(regions, (r) => r.name, (r) => r.txCount).map((g, gi) => {
                const groupTx = g.items.reduce((sum, r) => sum + r.txCount, 0);
                return (
                  <details key={g.sido} open={gi === 0} className="group">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 [&::-webkit-details-marker]:hidden">
                      <span className="t-body font-bold text-ink">
                        {g.sido} <span className="t-sub font-medium text-text-3">{g.items.length}개 지역</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="t-body t-num text-ink">{groupTx.toLocaleString("ko-KR")}건</span>
                        <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
                          ›
                        </span>
                      </span>
                    </summary>
                    {/* [v4.1 · 리퀴드 목록] 펼친 안쪽 목록은 hanji — 바깥 blue 판 안에서 구분된다 */}
                    <ul data-tone="hanji" className="mb-2 flex flex-col divide-y divide-line border-t border-line pl-3">
                      {g.items.map((r) => (
                        <li key={r.slug}>
                          <Link
                            prefetch={false}
                            href={`/tx/${encodeURIComponent(r.slug)}`}
                            className="press flex min-h-12 items-center justify-between gap-x-3 py-2.5 no-underline"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block t-body font-bold text-ink">{r.name}</span>
                              <span className="block truncate t-sub text-text-3">
                                구간 {r.areaCells.length + r.priceCells.length}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              <span className="t-body t-num text-ink">{r.txCount.toLocaleString("ko-KR")}건</span>
                              <span aria-hidden="true" className="t-body text-text-3">
                                ›
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}
            </div>
            {/* 빠진 거래는 감추지 않는다 — 문단 → 사실 캡션 한 줄 */}
            {uncovered > 0 && coverage && (
              <p className="t-caption text-text-3">
                면적 확인 신고 {coverage.totalTx.toLocaleString("ko-KR")}건 중 구간당 {MIN_BAND_TX}건 미만{" "}
                {uncovered.toLocaleString("ko-KR")}건 제외
              </p>
            )}
          </section>
        )}

        {/* 이어 보기 — 예전 링크 문단(네 문장)을 링크 한 줄로. /analysis/price 는 robots Disallow(데모 수치) —
            색인 허브에서 차단 경로로 링크하지 않는다(항목 46c). timing 은 색인 허용이다. */}
        <p className="t-sub text-text-3" style={{ lineHeight: "24px" }}>
          <Link href="/complex/browse" className="tap-line font-bold text-primary no-underline">
            단지 실거래 브라우즈
          </Link>
          {" · "}
          <Link href="/complex/compare" className="tap-line font-bold text-primary no-underline">
            단지 vs 단지 비교
          </Link>
          {" · "}
          <Link href="/analysis/timing" className="tap-line font-bold text-primary no-underline">
            타이밍 분석
          </Link>
          {" · "}
          <Link href="/imjang" className="tap-line font-bold text-primary no-underline">
            임장 가이드
          </Link>
        </p>

        {/* 애드센스 데스크탑 유닛 — 목록 아래 빈공간. 모바일 미노출. */}
        <AdSenseUnit />

        {/* [v4 · 규칙 3] "이 숫자를 읽는 법" 카드 → 맨 끝 접힘 하나. 항목 14 — 용어 첫 등장에 용어사전 링크 */}
        <details className="group border-t border-line pt-1">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
            읽는 법·출처
            <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          {/* [1005] 문장 속 용어 링크를 24px 히트로 세우면 그 줄만 높아진다 — 줄 간격을 24px 로 */}
          <ul className="flex flex-col gap-1 pb-3 t-sub text-text-2" style={{ lineHeight: "24px" }}>
            <li>
              <Link href="/glossary/silgeoraega" className={GLOSS}>
                실거래 신고가
              </Link>{" "}
              · 매물{" "}
              <Link href="/glossary/hoga" className={GLOSS}>
                호가
              </Link>
              ·중개사 제시가 아님 · 최근 달은 신고 지연으로 늘 수 있음
            </li>
            <li>
              면적 ={" "}
              <Link href="/glossary/jeonyongmyeonjeok" className={GLOSS}>
                전용면적
              </Link>{" "}
              ·{" "}
              <Link href="/glossary/gonggeupmyeonjeok" className={GLOSS}>
                분양면적(공급면적)
              </Link>{" "}
              평수와 다름
            </li>
            <li>구간 평균 = 그 구간 신고 거래만의 평균 · 지역 전체·특정 단지의 현재 가격 아님</li>
            <li>거래 {MIN_BAND_TX}건 미만 구간은 페이지·합계 제외 — 없는 거래가 아니라 표본 부족</li>
            <li>
              <Link href="/glossary" className="tap-line font-bold text-primary no-underline">
                부동산 용어사전에서 찾기 ›
              </Link>
            </li>
          </ul>
        </details>
      </div>
    </PageShell>
  );
}
