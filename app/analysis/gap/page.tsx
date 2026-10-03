/* [1026 · 지역 시세] 1025 표준 — 절차 · 결론 한 줄 · 본문 | 레일 340(조건 · 내 예산 · 다음 행동) · 폰 카드 목록 · 폰 하단 바는 GapScreener
   (조건이 클라이언트 상태라 결론도 거기서 바뀐다). 여기서는 섹션 점을 파랑 하나로(.nz-dot-blue)만 감싼다. 데이터 로딩·revalidate·
   searchParams 안 읽음·FAQ(JSON-LD)·출처 줄(면책)은 그대로.
   [1023 · AI 분석] 머리 통일 — h1 t-display 손 마크업(.pxs-head) → 공용 PageHead(t-title). 본문은 그대로. */
import { TOOL_PERSONAS, personaVars } from "@/lib/ai/tool-persona";
import { PageShell } from "@/app/components/PageShell";
import { PageHead } from "@/app/components/PageHead";
import { getAllRegionSnapshots } from "@/lib/market/store";
import {
  getRegionRentYieldMap,
  rentYieldPct,
  type RegionRentYieldMap,
} from "@/lib/market/rent-yield";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { logger } from "@/lib/log";
import { ErrorState } from "@/app/components/ui";
import { faqJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { Explain } from "@/app/components/explain/Explain";
import { OTHER_SIDO_LABEL, sidoOfRegionName } from "@/lib/market/sido-group";
import { GAP_HOW, type Row } from "./RankTable";
import { GapScreener } from "./GapScreener";

/* [1021 · 지역 시세 gap] 시안(mock8/gap)대로 — 네이비/히스토그램 히어로(ToolHero)·상위 15/하위 10·시도별 세 표 대신
   머리(아이콘 칩·제목·사실 한 줄 | 오른쪽 "N곳" 칩) → 조건 패널(당시 280px 왼쪽 열 — [1026] 오른쪽 레일 340) + 타일 4칸 + 결과 표(GapScreener).
   조건은 URL 쿼리에 남기되 서버는 searchParams 를 읽지 않는다(ISR 캐시 정책 유지) — 전체 목록을 내려 주고 클라이언트가 거른다.
   데이터 로딩·revalidate·metadata·FAQ(JSON-LD)·출처 줄은 그대로. 시/도는 lib/market/sido-group(기존 함수)로 — 예전의
   "구로 끝나면 서울" 규칙은 사상구·광주 북구를 서울·경기로 묶었다. */

/* [3차 · AI 분석 확충] 전세가율·갭 스크리너.
 *
 * 데이터: market_region_price 전 지역 스냅샷(REB/KB 공표 통계 — 이미 매일 적재됨).
 * 화면: 전세가율 상·하위 지역 랭킹과 "추정 갭"(평균 매매가 − 평균 매매가×전세가율).
 * 원칙: 산술 사실만 서술한다. 전세가율이 높다 = 갭이 작다는 산술이지 "사도 된다"가
 * 아니며, 그 동전의 뒷면(역전세·보증금 위험)을 같은 화면에서 함께 말한다.
 * 지역 평균은 단지·면적별 편차를 가리므로 각 행이 지역 허브로 연결된다. */

export const metadata = buildPageMetadata({
  title: "전세가율·갭 스크리너 · 지역별 랭킹",
  description:
    "전국 시군구 전세가율 상·하위 랭킹과 평균 매매가 기준 추정 갭. 한국부동산원 공표 통계 기반.",
  path: "/analysis/gap",
  og: { badge: "분석", sub: "전세가율 랭킹 · 추정 갭 · 공표 통계 기반" },
});

/* [1010] 1h → 1일. 이 화면의 원천은 하루 1회 적재되는 국토부 실거래·집계이고,
   적재 직후 lib/cache/invalidate.ts SOURCE_MAP.molit(+reb)이 이 경로를 이미 비운다 —
   시간 TTL 은 안전망일 뿐이다. 실측(2026-09-20~22) 이 축의 분석 화면은 하루 수천 회
   렌더되는데 사람 방문은 7일 합계 ~120건이고, 크롤러 재방문 간격은 ≈2.2일이라
   1시간 눈금은 방문마다 재렌더를 뜻했다. */
export const revalidate = 86_400;

export default async function GapScreenerPage() {
  let rows: Row[] = [];
  let loadFailed = false;
  try {
    const map = await getAllRegionSnapshots();
    for (const [regionId, s] of map) {
      if (s.jeonseRatio === undefined || !Number.isFinite(s.jeonseRatio)) continue;
      if (s.jeonseRatio <= 0 || s.jeonseRatio >= 100) continue; // 자료 오류 방어
      const avgSale = s.avgSale && s.avgSale > 0 ? s.avgSale : undefined;
      rows.push({
        regionId,
        name: s.regionName,
        ratio: s.jeonseRatio,
        avgSale,
        gap: avgSale !== undefined ? Math.round(avgSale * (1 - s.jeonseRatio / 100)) : undefined,
        period: s.period,
        source: s.source,
        saleChange:
          s.saleChangeMonthly !== undefined && Number.isFinite(s.saleChangeMonthly)
            ? s.saleChangeMonthly
            : undefined,
        group: sidoOfRegionName(s.regionName) ?? OTHER_SIDO_LABEL,
      });
    }
  } catch (e) {
    logger.error("[analysis/gap] 스냅샷 로드 실패", e);
    loadFailed = true;
  }

  /* [#94 잔여] 월세 환산 수익률 — RPC 1회로 전 지역 중앙값을 받아 행에 붙인다.
     실패는 열 결측("—")일 뿐 페이지 실패가 아니다 — 본문(전세가율)은 그대로 산다. */
  let yieldFailed = false;
  if (!loadFailed && rows.length > 0) {
    let yieldMap: RegionRentYieldMap | null = null;
    try {
      yieldMap = await getRegionRentYieldMap();
    } catch (e) {
      /* 표본이 없어서 빈 칸인 것과 조회가 실패해서 빈 칸인 것은 전혀 다른
         사실이다. 예전엔 로그만 남기고 화면에는 "—" 만 나갔다. */
      logger.error("[analysis/gap] 월세 수익률 RPC 실패 — 열 없이 렌더", e);
      yieldFailed = true;
    }
    if (yieldMap) {
      for (const r of rows) {
        const yr = yieldMap.get(r.name);
        const y = rentYieldPct(r.avgSale, yr);
        if (y !== null) r.rentYield = Math.round(y * 10) / 10;
        /* [AI-28] 전월세 신고 실측 갭 — 추정(비율 환산)을 실측으로 대체 */
        if (
          yr &&
          yr.jeonseCount >= 30 &&
          yr.jeonseMedianDepositKrw &&
          r.avgSale &&
          r.avgSale > yr.jeonseMedianDepositKrw
        ) {
          r.measuredGap = Math.round(r.avgSale - yr.jeonseMedianDepositKrw);
          r.jeonseSample = yr.jeonseCount;
        }
      }
    }
  }

  rows = rows.sort((a, b) => b.ratio - a.ratio);
  const median =
    rows.length > 0 ? rows[Math.floor(rows.length / 2)].ratio : null;
  const measured = rows.filter((r) => r.measuredGap !== undefined).length;

  return (
    <PageShell breadcrumb="분석 › 전세가율·갭" toolScope={personaVars(TOOL_PERSONAS["market:gap"])}>
      {/* 머리 — 아이콘 칩 · 제목 · 사실 한 줄(정의·계산은 ⓘ) | 집계 지역 수 칩. [1023] 공용 PageHead(t-title) */}
      <PageHead
        icon="landmark"
        title="전세가율·갭 스크리너"
        sub={
          <>
            한국부동산원 공표 전세가율 + 평균 매매가 · 갭 = 평균 매매가 − 전세 신고 중앙값(최근 3개월) · 전세 30건 미만은 비율 환산 추정
            <Explain
              term="jeonse-garyul"
              title="전세가율과 갭"
              body="전세가율은 매매가 대비 전세가의 비율이고, 높을수록 갭이 작다."
              how={GAP_HOW}
              source="한국부동산원(REB) 공표 지역 통계 · 국토교통부 전월세 실거래 신고"
            />
          </>
        }
        subOnPhone
        actions={
          rows.length > 0 ? (
            <>
              <span className="chip chip-soft chip-pad t-sub">{rows.length}곳</span>
              {measured > 0 && (
                <span className="chip chip-pad t-sub border border-line text-text-2">실측 갭 {measured}곳</span>
              )}
            </>
          ) : undefined
        }
      />

      {loadFailed ? (
        <div className="mt-3">
          <ErrorState
            title="지역 시세 불러오기 실패"
            desc="잠시 후 다시 시도해 주세요."
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-3">
          <ErrorState
            title="전세가율 데이터 없음"
            desc="공표 통계 적재(매일) 뒤 표시."
            action={{ href: "/analysis", label: "다른 분석 도구 보기" }}
          />
        </div>
      ) : (
        <div className="nz-dot-blue mt-3">
          {yieldFailed && (
            <div className="mb-3 rounded-lg border border-line bg-warning-soft px-3.5 py-2.5">
              <p className="t-sub text-ink">
월세 환산 수익률·실측 갭 열 불러오기 실패 · 전세가율 열은 그대로 볼 수 있어요.
              </p>
            </div>
          )}
          <GapScreener rows={rows} median={median} yieldFailed={yieldFailed} />
          {/* 출처 줄 — 표 바로 아래(시안). 문구는 그대로 */}
          <p className="mt-2 t-caption text-text-3">
            출처 한국부동산원(REB) 공표 지역 통계 · 지역·출처별 공표 주기 기준(각 행의 기준 열) · 공표 통계의 산술 정리이며 투자 권유가 아님 · 판단과 책임은 이용자에게 있음
          </p>
        </div>
      )}

      {/* [#55] FAQ — 화면에 실제로 보이는 문답과 같은 배열로만 JSON-LD 생성 (허위 표기 금지 규칙) */}
      {(() => {
        const faq = [
          {
            q: "전세가율이란 무엇인가요?",
            a: "매매가 대비 전세가의 비율입니다. 예를 들어 매매가 10억 원, 전세가 7억 원이면 전세가율은 70%입니다. 비율이 높을수록 매매가와 전세가의 차이(갭)가 작습니다.",
          },
          {
            q: "추정 갭은 어떻게 계산하나요?",
            a: "평균 매매가 × (1 − 전세가율)로 계산합니다. 지역 평균 기준이므로 단지·면적에 따라 실제 갭은 크게 다를 수 있습니다.",
          },
          {
            q: "전세가율이 높으면 안전한 지역인가요?",
            a: "아닙니다. 전세가율이 높다는 것은 갭이 작다는 산술일 뿐이며, 전세가 하락 시 보증금 반환 부담(역전세)과 매매가·전세가 역전 위험도 함께 커집니다.",
          },
          {
            q: "월세 환산 수익률은 어떻게 계산하나요?",
            a: "최근 3개월 그 지역 월세 신고의 중앙값을 써서, (월세 중앙값 × 12) ÷ (평균 매매가 − 월세 보증금 중앙값)으로 계산한 연 수익률입니다. 지역 평균 매매가와 단지가 뒤섞인 중앙값의 결합이라 참고 지표이며, 표본이 30건 미만인 지역은 표시하지 않습니다. 세금·수리비·공실은 반영되지 않습니다.",
          },
        ];
        return (
          <section className="mt-8">
            <h2 className="mb-2 t-title text-ink">자주 묻는 질문</h2>
            <div className="flex flex-col gap-2">
              {faq.map((f) => (
                <details key={f.q} className="card tile rounded-lg px-4 py-3">
                  <summary className="cursor-pointer t-section text-ink">{f.q}</summary>
                  <p className="mt-2 t-body text-text-2">{f.a}</p>
                </details>
              ))}
            </div>
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: jsonLdScript([faqJsonLd(faq)]) }}
            />
          </section>
        );
      })()}

    </PageShell>
  );
}
