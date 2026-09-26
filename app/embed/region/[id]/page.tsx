import type { Metadata } from "next";
import { findCatalogRegionById } from "@/lib/region/catalog";
import { getRegionSnapshot, getRegionMonthlyVolume, getRegionSeries } from "@/lib/market/store";
import { buildRegionOverview, ymLong } from "@/app/region/[id]/region-overview";
import type { RegionMarketSnapshot } from "@/lib/market/types";
import { formatKrwShort, formatYm } from "@/lib/market/format";
import { logger } from "@/lib/log";
import { DELTA_ARROW, DELTA_WORD, absPctText, deltaDir } from "@/lib/format/delta";

/* [1009 · H] 등락 표기를 사이트 표준으로(lib/format/delta: ▲/▼ 소수 한 자리 · |x|<0.05% 보합).
   색은 사이트 토큰 --up/--down 의 **라이트 값**을 그대로 적는다 — 이 카드는 남의 블로그 안(iframe)에 흰 카드로
   고정돼 있어, 보는 사람의 OS 가 다크면 토큰이 밝은 값으로 바뀌어 흰 바탕 위 대비가 무너진다(다른 글자색도 같은 이유로 고정). */
const EMBED_DELTA_COLOR = { up: "#cf2a3a", down: "#1b64da", flat: "#4a5568" } as const;

/* ============================================================
   [#88] 중개사무소용 지역 시세 위젯 — /embed/region/[id]
   지역 시세 요약을 블로그·홈페이지에 <iframe> 한 줄로 싣는 카드.
   단지 위젯(embed/complex)과 같은 규칙:
   - 실데이터만, 조회 실패 시 "불러올 수 없음" 카드 (never crash)
   - 사이트 크롬 없음(embed 레이아웃), noindex
   - 출처(한국부동산원·국토교통부)와 내집나우 링크가 카드 안에 박힌다 — 퍼가기가 곧 백링크
   ============================================================ */

/* [1010] 1h → 7일. 이 카드의 값은 /region/[id] 머리와 같은 원천(부동산원 스냅샷 +
   월별 거래량)이고, 같은 호출(invalidateRegionCodes)이 /embed/region/{id} 까지 함께
   비운다(lib/cache/invalidate.ts). 남의 블로그 안에 박혀 크롤러에게 더 자주 긁히는
   화면이라, 시간이 아니라 적재가 재생성을 정하게 하는 효과가 특히 크다. */
export const revalidate = 604_800;
export function generateStaticParams(): Array<{ id: string }> {
  return [];
}

export const metadata: Metadata = {
  /* [970 · C-25] 제목 접미 통일 `| 내집나우` */
  title: "지역 아파트 시세 | 내집나우",
  robots: { index: false, follow: false },
};

function FallbackCard({ name }: { name: string }) {
  return (
    <div
      style={{ fontFamily: "system-ui, sans-serif" }}
      className="flex flex-col gap-1 rounded-2xl border border-[#e3e8f1] bg-white p-4"
    >
      <div className="text-[15px] font-extrabold text-[#1c2433]">{name || "지역"} 시세</div>
      <p className="text-[12px] text-[#6b7686]">
        시세를 불러오지 못했어요. 잠시 후 새로고침하면 표시됩니다.
      </p>
      <a
        href="https://naezipnow.com"
        target="_blank"
        rel="noopener noreferrer"
        className="text-[12px] font-bold text-[#1d4fd8]"
      >
        내집나우에서 보기 ↗
      </a>
    </div>
  );
}

export default async function EmbedRegionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const region = findCatalogRegionById(id);
  if (!region) return <FallbackCard name="" />;

  let snap: RegionMarketSnapshot | null = null;
  let volumeLabel: string | null = null;
  /* [1009 · H] 서울 구는 부동산원 스냅샷 행이 period '' · 값 null 로 비어 있다(2026-09-22 운영 실측) — 예전 카드는
     "— 기준" 한 줄에 가격도 등락도 없는 빈 카드를 남의 블로그에 띄웠다. 지역 화면과 같은 규칙(region-overview.ts)으로
     부동산원 월간 지수·전세가율 시계열과 국토부 월 집계(신고가 끝난 달)를 함께 읽어 채운다. */
  let indexSeries: Array<{ period: string; value: number }> = [];
  let jeonseSeries: Array<{ period: string; value: number }> = [];
  let volume: Awaited<ReturnType<typeof getRegionMonthlyVolume>> = [];
  try {
    [snap, indexSeries, jeonseSeries, volume] = await Promise.all([
      getRegionSnapshot(id),
      getRegionSeries(id, "sale_index", "monthly", 13).catch(() => []),
      getRegionSeries(id, "jeonse_ratio", "monthly", 2).catch(() => []),
      getRegionMonthlyVolume(id, region.name, 3).catch(() => []),
    ]);
  } catch (e) {
    logger.error(`[embed/region] ${id} 조회 실패`, e);
    return <FallbackCard name={region.name} />;
  }
  /* 스냅샷 행이 아예 없어도 지수·월 집계가 있으면 그걸로 그린다 — 아무 숫자도 없을 때만 아래에서 "불러올 수 없음" */
  const statSnap = snap && /^\d{6}$/.test(snap.period) ? snap : null;
  const ov = buildRegionOverview({
    name: region.name,
    snapshot: statSnap,
    indexSeries,
    jeonseSeries,
    volume,
    now: new Date(),
  });
  /* 월 집계는 계약월 기준 — "7월 계약 매매 189건"(신고 기한이 지난 달) */
  if (ov.volume) volumeLabel = `${ymLong(ov.volume.ym)} 계약 매매 ${ov.volume.count.toLocaleString("ko-KR")}건`;
  /* 아무 숫자도 없으면 빈 카드 대신 "불러올 수 없음" 카드 */
  if (!ov.avgPrice && !ov.index && !ov.jeonse && !ov.volume) return <FallbackCard name={region.name} />;
  const periodYm = statSnap?.period ?? ov.index?.ym ?? ov.volume?.ym ?? null;

  const change =
    statSnap && statSnap.saleChangeMonthly !== undefined && Number.isFinite(statSnap.saleChangeMonthly)
      ? statSnap.saleChangeMonthly
      : (ov.index?.momPct ?? null);

  return (
    <div
      style={{ fontFamily: "system-ui, sans-serif" }}
      className="flex flex-col gap-2 rounded-2xl border border-[#e3e8f1] bg-white p-4"
    >
      {/* [#107] 임베드 채택 비콘 — 부모 페이지(host)만 일집계, 개인 식별 없음 */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            'try{var r=document.referrer;if(r&&navigator.sendBeacon){navigator.sendBeacon("/api/embed/beacon",new Blob([JSON.stringify({ref:r,kind:"region"})],{type:"application/json"}))}}catch(e){}',
        }}
      />

      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[15px] font-extrabold text-[#1c2433]">
          {region.name} 아파트 시세
        </div>
        {periodYm && <div className="text-[10px] text-[#8b94a6]">{formatYm(periodYm)} 기준</div>}
      </div>

      <div className="flex flex-wrap items-end gap-x-5 gap-y-1.5">
        {ov.avgPrice && (
          <div>
            <div className="text-[10px] text-[#8b94a6]">
              {ov.avgPrice.basis === "reb" ? "평균 매매가" : "신고 실거래 평균"}
            </div>
            <div className="text-[21px] font-extrabold leading-tight tabular-nums text-[#1c2433]">
              {formatKrwShort(ov.avgPrice.krw)}
            </div>
          </div>
        )}
        {change !== null && (() => {
          const dir = deltaDir(change) ?? "flat";
          return (
            <div>
              <div className="text-[10px] text-[#8b94a6]">매매지수 전월 대비</div>
              <div
                className="text-[15px] font-extrabold leading-tight tabular-nums"
                style={{ color: EMBED_DELTA_COLOR[dir] }}
              >
                <span className="sr-only">{DELTA_WORD[dir]} </span>
                {dir === "flat" ? "보합" : `${DELTA_ARROW[dir]} ${absPctText(change)}`}
              </div>
            </div>
          );
        })()}
        {ov.jeonse && (
          <div>
            <div className="text-[10px] text-[#8b94a6]">전세가율</div>
            <div className="text-[15px] font-extrabold leading-tight tabular-nums text-[#1c2433]">
              {ov.jeonse.value.toFixed(1)}%
            </div>
          </div>
        )}
      </div>

      {volumeLabel && <div className="text-[12px] text-[#4a5568]">{volumeLabel}</div>}

      <div className="flex items-center justify-between border-t border-[#f0f3f8] pt-2">
        {/* [1009 · H] 출처는 이 카드가 실제로 쓴 자료만 — 예전 "한국부동산원·KB 공표 통계"는 KB 자료를 쓰지 않는데 적혀 있었고,
            국토부 신고 거래량·평균을 싣게 된 지금은 국토교통부가 빠지면 안 된다 */}
        <span className="text-[10px] text-[#8b94a6]">
          {[
            ov.hasReb || change !== null ? "한국부동산원 공표 통계" : null,
            ov.volume || ov.avgPrice?.basis === "tx" ? "국토교통부 실거래 신고" : null,
          ]
            .filter(Boolean)
            .join(" · ")}{" "}
          · 매물 호가 아님
        </span>
        <a
          href={`https://naezipnow.com/region/${id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] font-extrabold text-[#1d4fd8]"
        >
          내집나우에서 자세히 ↗
        </a>
      </div>
    </div>
  );
}
