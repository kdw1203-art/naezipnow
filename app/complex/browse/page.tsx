import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import {
  SEOUL_BROWSE_REGIONS,
  buildComplexTxSlug,
  listDistrictComplexSummaries,
  regionDisplayName,
  type ComplexSummary,
  type ComplexTxRegion,
} from "@/lib/market/complex-transactions";
/* [v4] 공용 표(ComplexSummaryTable — /region/[id] 도 쓴다, 가로 스크롤 560px)는 두고, 이 화면은 같은 요약을
   구분선 목록 행으로 직접 그린다. 링크 규칙(정본 /complex/{id}, 없으면 /complex/tx)은 표와 같다 */
import { complexHrefFromNames } from "@/lib/seo/complex-slug";
import { formatKrwShort } from "@/lib/market/format";
import { seoAlternates } from "@/lib/seo/alternates";
import { logger } from "@/lib/log";

/* ============================================================
   서울 단지 브라우즈 — /complex/browse?district=서울+강남구
   구 선택 칩(강남4구 우선) → 해당 구 단지별 실거래 요약.
   국토부 실거래가(market_transactions) 기반 — 매물 호가 아님.
   비로그인 열람 허용(index 대상).
   ============================================================ */

const DEFAULT_REGION_ID = "gangnam";

function resolveRegion(districtParam: string | undefined): ComplexTxRegion {
  const fallback =
    SEOUL_BROWSE_REGIONS.find((r) => r.id === DEFAULT_REGION_ID) ?? SEOUL_BROWSE_REGIONS[0];
  if (!districtParam) return fallback;
  const q = districtParam.trim().replace(/\s+/g, " ");
  return (
    SEOUL_BROWSE_REGIONS.find(
      (r) => r.id === q || r.name === q || regionDisplayName(r) === q,
    ) ?? fallback
  );
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ district?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const region = resolveRegion(sp.district);
  const label = regionDisplayName(region);
  const title = `${label} 아파트 단지별 실거래 현황 | 내집나우`;
  const description = `${label} 아파트 단지별 최근 실거래가·평단가·12개월 거래량 — 국토교통부 실거래가 기반(매물 호가 아님). 서울 25개 구 단지 현황을 한 화면에서 확인하세요.`;
  return {
    title,
    description,
    robots: { index: true, follow: true },
    // 구 필터(`?district=`)는 canonical 에서 떨어뜨린다 — 같은 표를 필터만 바꿔 보여주는
    // URL 들이 각자 색인되면 신호가 쪼개진다.
    alternates: seoAlternates("/complex/browse"),
    openGraph: {
      title,
      description,
      siteName: "내집나우",
      locale: "ko_KR",
      type: "website",
      /* [C004] 12페이지 실측에서 og:image 없는 페이지가 여기와 /tx 뿐이었다.
         공유 카드가 빈 회색으로 나가면 눌리지 않는다 — 제목 박힌 동적 카드. */
      images: [
        {
          url: `/api/og?${new URLSearchParams({ title: `${label} 단지별 실거래` }).toString()}`,
          width: 1200,
          height: 630,
        },
      ],
    },
  };
}

export default async function ComplexBrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ district?: string }>;
}) {
  const sp = await searchParams;
  const region = resolveRegion(sp.district);
  const label = regionDisplayName(region);
  /* 조회 실패와 "거래 0건"을 구분해서 넘긴다 — 예전에는 둘 다 "준비 중입니다"로
     나갔는데, 장애 중에 그 문장은 거짓이다. */
  let summaries: ComplexSummary[] = [];
  let summariesFailed = false;
  try {
    summaries = await listDistrictComplexSummaries(region, 30);
  } catch (e) {
    summariesFailed = true;
    logger.error(
      `[/complex/browse] ${region.id} 단지 요약 조회 실패:`,
      e instanceof Error ? e.message : String(e),
    );
  }

  const LINK = "tap-line font-bold text-primary no-underline";

  return (
    <PageShell breadcrumb="홈 › 단지 실거래 › 서울 단지 브라우즈">
      {/* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄 → 구 칩 한 줄(필터) → 단지 구분선 행(오른쪽 최근 실거래가) → 링크 한 줄.
          지운 것: 사용법 문단(두 문장 → 사실 줄), 네이비 선택 칩(→ 한지 + 남색 chip-active), 가로 스크롤 표(→ 행),
          채움 파랑 + 카드 타일 CTA 4개(→ 링크 한 줄). */}
      <div className="mx-auto flex max-w-[760px] flex-col gap-6">
        <header className="flex flex-col gap-0.5">
          <h1 className="rise-in t-title text-ink">서울 단지별 실거래 현황</h1>
          <p className="t-sub text-text-3">
            {label} · 단지 {summaries.length}곳 · 국토교통부 실거래 · 호가 아님
          </p>
        </header>

        {/* 구 선택 칩 — 강남4구 우선. [v4] 필터 칩 = 한 줄 가로 스크롤 · 선택 = 한지 + 남색(chip-active) */}
        <nav
          aria-label="구 선택"
          className="-mx-3.5 flex gap-1.5 overflow-x-auto px-3.5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0"
        >
          {SEOUL_BROWSE_REGIONS.map((r) => {
            const active = r.id === region.id;
            return (
              <Link
                key={r.id}
                href={`/complex/browse?district=${encodeURIComponent(regionDisplayName(r))}`}
                aria-current={active ? "page" : undefined}
                className={`chip inline-flex min-h-[32px] shrink-0 items-center px-3 t-sub font-bold no-underline ${
                  active ? "chip-active" : "border border-line bg-surface text-text-2"
                }`}
              >
                {r.name}
              </Link>
            );
          })}
        </nav>

        {/* 해당 구 단지 요약 — [v4 · 규칙 5] 구분선 행: 왼쪽 단지 + 보조 한 줄 / 오른쪽 최근 실거래가 */}
        <section className="flex flex-col gap-2">
          <h2 className="flex items-baseline gap-1.5 t-section text-ink">
            {label} 단지 <span className="t-num text-text-3">{summaries.length}</span>
            <span className="t-sub font-medium text-text-3">최신 거래순</span>
          </h2>
          {summariesFailed ? (
            /* "못 읽었다"와 "없다"를 섞지 않는다 */
            <p className="card rounded-lg px-4 py-6 text-center t-body text-text-3">단지별 실거래를 불러오지 못했어요 · 조회 실패(데이터 없음 아님)</p>
          ) : summaries.length === 0 ? (
            <p className="card rounded-lg px-4 py-6 text-center t-body text-text-3">이 구의 단지별 실거래 준비 중</p>
          ) : (
            <ul data-tone="blue" className="card flex flex-col divide-y divide-line rounded-lg px-4">
              {summaries.map((s) => (
                <li key={s.complexName}>
                  {/* 항목 41 — 사이트맵이 내는 정본 URL(/complex/{id}). region_name 이 비면 실거래 상세로 물러선다 */}
                  <Link
                    href={
                      s.regionName
                        ? complexHrefFromNames(s.regionName, s.complexName)
                        : `/complex/tx/${buildComplexTxSlug(s.complexName, region.id)}`
                    }
                    className="press flex min-h-14 items-center justify-between gap-x-3 py-3 no-underline"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate t-body font-bold text-ink">{s.complexName}</span>
                      <span className="mt-0.5 block truncate t-sub tabular-nums text-text-3">
                        {[
                          s.representativeAreaM2 !== null ? `대표 ${s.representativeAreaM2}㎡` : null,
                          s.buildYear ? `${s.buildYear}년` : null,
                          `12개월 ${s.txCount12m}건`,
                          s.avgPricePerPyeongKrw !== null ? `${formatKrwShort(s.avgPricePerPyeongKrw)}/평` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end">
                      <span className="t-body t-num text-ink">{formatKrwShort(s.latestAmountKrw)}</span>
                      <span className="t-caption tabular-nums text-text-3">
                        {s.latestYm.length === 6 ? `${s.latestYm.slice(2, 4)}.${s.latestYm.slice(4)}` : s.latestYm}
                        {s.latestAreaM2 !== null ? ` · ${s.latestAreaM2.toFixed(0)}㎡` : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* A5 — 면적대·가격대 랜딩 진입점 + [1012 · 규칙 5] 동사 + 구체 대상(구 이름). [v4] 버튼·타일 → 링크 한 줄 */}
        <p className="t-sub text-text-3" style={{ lineHeight: "24px" }}>
          <Link href={`/region/${region.id}`} className={LINK}>
            {region.name} 시세 허브 보기
          </Link>
          {" · "}
          <Link href={`/map?region=${encodeURIComponent(regionDisplayName(region))}`} className={LINK}>
            {region.name} 지도에서 보기
          </Link>
          {" · "}
          <Link href="/complex/compare" className={LINK}>
            {region.name} 단지끼리 비교하기
          </Link>
          {" · "}
          <Link href="/notes/new" className={LINK}>
            {region.name} 임장노트 쓰기
          </Link>
          {" · "}
          <Link href="/tx" className={LINK}>
            지역별 면적대·가격대 실거래 보기
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
