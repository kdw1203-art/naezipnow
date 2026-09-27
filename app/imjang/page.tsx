/* [1012] 규칙 8 — 굵기 800 이상 금지: 이 파일의 font-extrabold/black 3곳을 font-bold(700)로 바꿨다. */
import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { listImjangRegions } from "@/lib/imjang/guide";
import { IMJANG_CHECKPOINTS } from "@/lib/imjang/checkpoints";
import type { TxRegionSummary } from "@/lib/market/tx-bands";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";
import { logger } from "@/lib/log";

/* ============================================================
   임장 가이드 인덱스 — /imjang (전략 정본 §4-2)

   "임장" 키워드군의 허브. 지역 목록은 /tx 와 같은 원천(실거래 구간이 있는
   지역만)이라, 여기 실리는 지역 링크는 전부 실데이터가 있는 페이지다.
   조회 실패는 실패로 그린다 — 지역이 없는 것과 못 읽은 것은 다른 말이다.
   ============================================================ */

/* [B001 1단계] 1h → 24h. 이 페이지의 원천(국토부 실거래)은 하루 1번 적재라
   더 자주 재렌더할 이유가 없다 — 26k 페이지 크롤 재렌더가 DB 를 밀던 문제의 반쪽. */
/* [1010] 24h → 7일. 크롤러 재방문이 ≈2.2일이라 하루 눈금은 방문마다 재렌더와 거의 같았다.
   이 화면의 원천은 국토부 실거래뿐이고(거래 많은 순 상위 48곳), 적재 크론이 이번 슬라이스에서
   건드린 지역이 있으면 이 인덱스를 즉시 비운다 —
   app/api/cron/molit-transactions-ingest → invalidateImjangForTxRegions(). */
export const revalidate = 604_800;

const PATH = "/imjang";

type IndexData = { regions: TxRegionSummary[]; loadError: string | null };

async function loadIndex(): Promise<IndexData> {
  try {
    return { regions: await listImjangRegions(48), loadError: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error("[/imjang] 지역 목록 조회 실패 — 지역이 없는 것이 아니라 조회가 실패했습니다:", message);
    return { regions: [], loadError: message };
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const { regions, loadError } = await loadIndex();
  const title = "임장 가이드 — 지역별 답사 준비와 현장 체크포인트 | 내집나우";
  const description =
    regions.length > 0
      ? `${regions.length}개 지역의 임장(현장 답사) 가이드: 실거래 데이터로 단지 우선순위를 잡고, 현장에서만 확인되는 체크포인트 ${IMJANG_CHECKPOINTS.length}가지로 답사합니다. 실거래가는 누구나 봅니다 — 현장은 가 본 사람만 압니다.`
      : `임장(현장 답사) 준비 가이드: 실거래 데이터로 단지 우선순위를 잡고, 현장 체크포인트 ${IMJANG_CHECKPOINTS.length}가지로 답사합니다.`;
  return {
    title,
    description,
    alternates: seoAlternates(PATH),
    ...(loadError ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description, url: `https://naezipnow.com${PATH}`, type: "website" },
  };
}

export default async function ImjangIndexPage() {
  const { regions, loadError } = await loadIndex();

  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "임장 가이드", url: PATH },
  ]);

  return (
    <PageShell breadcrumb="홈 › 임장 가이드">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbs) }} />

      {/* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄 → 지역 격자(2열 · 같은 높이 행 · 오른쪽 거래 건수) → 체크포인트 구분선 행 →
          채움 파랑 1개(임장노트 쓰기) + 링크 한 줄. 지운 것: 소개 문단(→ 사실 줄), 여러 줄로 감기는 칩 구름(→ 2열 격자),
          체크포인트 카드 격자(높이가 다른 카드 → 행), 실패 카드 두 문장(→ 한 줄). */}
      <div className="mx-auto flex max-w-[760px] flex-col gap-8">
        <header className="flex flex-col gap-0.5">
          <h1 className="rise-in t-title text-ink">임장 가이드</h1>
          {/* [1012] 규칙 6·7 — 어디서·몇 곳·몇 가지(실측). "시세" 는 실거래만 있는 곳에서 금지 */}
          <p className="t-sub text-text-3">
            {regions.length > 0 ? `${regions.length}개 지역 · ` : ""}현장 체크포인트 {IMJANG_CHECKPOINTS.length}가지 · 국토교통부 실거래
          </p>
        </header>

        {/* 지역 목록 — 실데이터 있는 지역만, 거래 많은 순 */}
        <section className="flex flex-col gap-2">
          <h2 className="flex items-baseline gap-1.5 t-section text-ink">
            지역별 가이드 <span className="t-sub font-medium text-text-3">거래 많은 순</span>
          </h2>
          {loadError ? (
            <p className="card rounded-lg px-4 py-4 t-body text-text-2">
              <b className="text-ink">지역 목록을 불러오지 못했어요</b> · 조회 실패(지역 없음 아님) · 잠시 후 새로고침
            </p>
          ) : regions.length === 0 ? (
            <p className="card rounded-lg px-4 py-4 t-body text-text-2">실거래 구간이 정리된 지역 없음</p>
          ) : (
            /* [v4 · 규칙 10] 칩 구름 → 2열 격자(행과 열이 맞는 같은 높이 칸) */
            <ul data-tone="blue" className="lq-panel card grid grid-cols-2 gap-x-4 rounded-lg px-4">
              {regions.map((r) => (
                <li key={r.slug} className="border-b border-line">
                  <Link
                    prefetch={false}
                    href={`/imjang/${encodeURIComponent(r.slug)}`}
                    className="press flex min-h-12 items-center justify-between gap-2 no-underline"
                  >
                    <span className="min-w-0 truncate t-body font-bold text-ink">{r.name}</span>
                    <span className="shrink-0 t-sub t-num text-text-3">{r.txCount.toLocaleString("ko-KR")}건</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 표준 체크포인트 — 인덱스에도 전문 (지역과 무관한 공통 지식). [v4 · 규칙 5] 카드 격자 → 구분선 행 */}
        <section className="flex flex-col gap-2">
          <h2 className="flex items-baseline gap-1.5 t-section text-ink">
            현장 체크포인트 <span className="t-num text-text-3">{IMJANG_CHECKPOINTS.length}</span>
            <span className="t-sub font-medium text-text-3">데이터로는 알 수 없는 것</span>
          </h2>
          <ol data-tone="sand" className="card flex flex-col divide-y divide-line rounded-lg px-4">
            {IMJANG_CHECKPOINTS.map((c, i) => (
              <li key={c.title} className="flex min-h-14 items-start gap-3 py-3">
                <span className="w-5 shrink-0 t-body t-num text-text-3">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1">
                  <span className="block t-body font-bold text-ink">{c.title}</span>
                  <span className="mt-0.5 block t-sub text-text-3">{c.why}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <div className="flex flex-col gap-2">
          {/* [v4 · 규칙 2] 채움 파랑은 이 화면에 이것 하나 */}
          <Link href="/notes/new" className="btn-primary press flex min-h-12 items-center justify-center rounded-lg px-4 t-body no-underline">
            체크포인트 {IMJANG_CHECKPOINTS.length}가지로 임장노트 쓰기
          </Link>
          <Link href="/tx" className="tap-line w-fit t-sub font-bold text-primary no-underline">
            지역별 실거래 구간 보기 ›
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
