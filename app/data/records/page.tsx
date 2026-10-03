import type { Metadata } from "next";
import { cache } from "react";
import { PageShell } from "../../components/PageShell";
import { getPublicRecordDatasetStatsResult } from "@/lib/market/public-records";
import { RecordsSearchClient } from "./RecordsSearchClient";
import { CODEF_PRODUCTS } from "@/lib/codef/endpoints";
import { seoAlternates } from "@/lib/seo/alternates";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-bold(800) 를 전부 font-bold(700) 로 내렸다. */

/* ── ISR 전환 (사용량 절감 14차, 2026-08-11) ────────────────────────────────
   예전에는 force-dynamic + ?complex= 서버 재렌더였다. ?complex= 는 자유 텍스트
   DB 검색이라 클라이언트 메모리 필터로 못 바꾼다 — 검색만 /api/public-records
   (검색어별 CDN 캐시)로 분리하고, 이 페이지는 통계(적재 현황)만 ISR 로 품는다.
   실측(2026-08-11): public_property_records 0행(CODEF 자격 증명 대기) —
   현황은 전부 "연동 대기"가 사실이고, 통계 로더는 실패 시 base(0건)를
   돌려주지만 그 표시는 "연동 대기"라 거짓 주장이 되지는 않는다. */
/* [1010] 600 → 86,400(1일). 화면의 통계는 국토부 실거래 적재로만 바뀌고, 적재 직후
   SOURCE_MAP.molit 이 "/data/records" 를 비운다. ?complex= 검색은 /api/public-records
   (검색어별 CDN 600초)라 이 TTL 과 무관하다. */
export const revalidate = 86_400;

/* 메타데이터와 본문이 같은 통계를 한 번만 읽는다 */
const loadStats = cache(getPublicRecordDatasetStatsResult);

/* [1027] 적재가 0건인 동안은 색인하지 않는다. 운영 2026-10-03: 11개 자료 전부 "연동 대기"·"총 0건 적재"인데
   robots 는 index 였고 사이트맵에도 실려 있었다 — 내용 없는 쪽을 검색엔진에 내는 셈이다. 자료가 한 건이라도
   들어오면 저절로 색인이 열린다(사이트맵 정적 목록에는 그때 다시 넣는다 — lib/seo/build-sitemap.ts). */
export async function generateMetadata(): Promise<Metadata> {
  const { ok, stats } = await loadStats();
  const totalRows = stats.reduce((s, d) => s + d.rows, 0);
  return {
    title: "공공 부동산 자료 현황 | 내집나우",
    description:
      "KB 시세·공시가격·실거래·신고이력 등 공공·공개 부동산 자료의 제공 상태와 단지별 조회.",
    /* 검색 제외는 **읽어서 0건임을 확인했을 때만**. 못 읽은 날에 0건으로 치면 자료가 있는데도 하루 동안 색인에서 빠진다 */
    ...(ok && totalRows === 0 ? { robots: { index: false, follow: true } } : {}),
    // N7 — 필터·정렬 파라미터 조합이 별개 URL 로 색인되지 않도록 canonical 고정
    alternates: seoAlternates("/data/records"),
  };
}

export default async function DataRecordsPage() {
  const { stats } = await loadStats();
  const totalRows = stats.reduce((s, d) => s + d.rows, 0);

  return (
    <PageShell
      breadcrumb="홈 › 데이터 › 공공 자료 현황"
      title="공공 부동산 자료 현황"
    >
      <p className="rise-in mb-5 text-[13px] leading-[1.6] text-text-2">
        준비 중인 공공 자료 목록이에요. 지금 쓰는 자료는 &lsquo;데이터 출처&rsquo;에 있어요.
      </p>

      {/* 자료별 제공 상태 — [1028 · 제안 8] 내부 말("데이터셋 연동 현황·적재") → 일반 말. 합계는 1건 이상일 때만 */}
      <section className="rise-in-1 card mb-6 p-[var(--pad-card)]">
        <h2 className="text-[15px] font-bold text-ink">
          자료별 제공 상태
          {totalRows > 0 && (
            <span className="text-[12px] font-medium text-text-3">
              {" "}
              총 {totalRows.toLocaleString()}건
            </span>
          )}
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {CODEF_PRODUCTS.map((p) => {
            const s = stats.find((x) => x.dataset === p.dataset);
            const rows = s?.rows ?? 0;
            return (
              <div
                key={p.key}
                className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-ink">{p.label}</div>
                  <div className="mt-0.5 truncate text-[12px] text-text-3">
                    {p.description}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {rows > 0 ? (
                    <span className="text-[12px] font-bold text-primary">
                      {rows.toLocaleString()}건
                    </span>
                  ) : (
                    <span className="rounded-full bg-bg chip-pad t-caption font-semibold text-text-3">
                      준비 중
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {/* [1011] "‘연동 대기’ 자료는 CODEF(codef.io) 자격 증명 설정 후 자동 적재됩니다" 를 걷었다
            (소유자 지시) — 어떤 중계사와 어떤 자격 증명으로 자료를 끌어오는지는 쓰는 사람이 알 필요가
            없다. 칸마다 붙은 "준비 중" 배지([1028] 옛 "연동 대기")가 아직 못 보여 준다는 사실을 이미 말한다. */}
        <p className="mt-3 text-[12px] leading-[1.6] text-text-3">
          {/* [1028 · 제안 11] "KB"를 뺐다 — 지역 통계는 전부 한국부동산원 자료다(2026-10-03 운영: market_region_price 109개 지역 source=reb, market_price_indices REB·BOK, KB 수집 기록 0건). KB 자료가 실제로 들어오면 되살린다. */}
          실거래 지도는 국토교통부 실거래가, 지역 통계는 한국부동산원 자료로 운영 중이에요.
        </p>
      </section>

      {/* 단지 검색 */}
      <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
        <h2 className="text-[15px] font-bold text-ink">단지 자료 조회</h2>
        <RecordsSearchClient />
      </section>

      <p className="mb-4 text-[12px] leading-[1.6] text-text-3">
        본 자료는 공공·공개 데이터를 취합한 참고용 정보이며, 실제 거래·계약 조건과 다를 수
        있습니다. 투자 판단의 책임은 이용자 본인에게 있습니다.
      </p>
    </PageShell>
  );
}
