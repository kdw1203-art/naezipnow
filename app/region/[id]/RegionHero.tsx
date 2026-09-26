import Link from "next/link";
import { Delta } from "@/app/components/num/Delta";
import { Explain } from "@/app/components/explain/Explain";
import { formatByKey } from "@/lib/format/by-key";
import { formatKrwShort } from "@/lib/market/format";
import { ymLong, ymMonth, type RegionOverview } from "./region-overview";

/* [1009 · H] 지역 화면 머리 — 토스식 "한 화면 한 메시지": 결론 한 줄 → 큰 숫자 넷 → 출처 → 다음 행동.
 *
 * 왜(2026-09-22 운영 /region/gangnam): 검색 착지 화면의 첫 카드가 "평균 매매가 — · 중위 매매가 — · 전월 대비 — ·
 * 전세가율 —" 네 칸이었다(서울 구 스냅샷 행이 비어 있다 — region-overview.ts 헤더). 같은 화면 아래에는 부동산원
 * 지수 13개월이 막대로 있었는데도 "요즘 어때?"에 답하는 문장이 없었다. 여기서는
 *   ① 결론(지수의 실제 전월 변화) ② 둘째 줄(1년 전 대비) ③ 숫자 칸(지수·평균가·전세가율·거래량, 칸마다 비교 기준)
 *   ④ 출처·기준일 ⑤ 지도·월간 리포트·동네 홈 으로 잇는다.
 * 숫자가 없는 칸은 그리지 않는다(가짜 "—" 칸 없음). ⓘ 의 "이렇게 계산했어요"는 region-overview.ts 계산 그대로.
 * 서버 컴포넌트 — ⓘ 버튼(Explain)만 클라이언트 조각이다. */

function Tile({
  label,
  explain,
  value,
  delta,
  basis,
  foot,
}: {
  label: string;
  explain: React.ReactNode;
  value: React.ReactNode;
  delta?: React.ReactNode;
  basis?: string;
  foot?: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-bg px-3 py-2.5">
      <div className="flex min-h-[24px] items-center gap-0.5 t-caption font-bold text-text-3">
        <span className="min-w-0 break-words">{label}</span>
        {explain}
      </div>
      <div className="t-title t-num text-ink">{value}</div>
      {delta ? (
        <div className="flex flex-wrap items-baseline gap-x-1 t-sub">
          {delta}
          {basis ? <span className="t-caption text-text-3">{basis}</span> : null}
        </div>
      ) : null}
      {foot ? <div className="t-caption text-text-3 break-words">{foot}</div> : null}
    </div>
  );
}

export function RegionHero({
  id,
  name,
  mapRegion,
  overview,
  freshnessLine,
}: {
  id: string;
  name: string;
  /** 지도 딥링크 이름 — "서울 강남구"·"경기 수원시 영통구"(구 이름만이면 "중구"가 서울로 풀린다) */
  mapRegion: string;
  overview: RegionOverview;
  /** 실거래 신선도 한 줄 — 페이지가 단지 허브와 같은 조각(<MarketFreshnessLine>)을 넘긴다(tests/unit/product-1007 이 잠금) */
  freshnessLine?: React.ReactNode;
}) {
  const { index, jeonse, volume, volumeOpen, avgPrice } = overview;
  const openNote =
    volumeOpen.length > 0
      ? volumeOpen.map((v) => `${ymMonth(v.ym)} ${v.count.toLocaleString("ko-KR")}건`).join(" · ") + " 신고 중"
      : null;
  const tiles: React.ReactNode[] = [];

  if (index) {
    tiles.push(
      <Tile
        key="index"
        label="매매 시세 지수"
        explain={
          <Explain
            term="maemae-gagyeok-jisu"
            how={[
              "한국부동산원이 매달 공표하는 이 지역 아파트 매매가격지수(월간)를 그대로 옮겨요.",
              "전월 대비 = (이번 달 지수 − 지난달 지수) ÷ 지난달 지수 × 100",
              "지역 전체의 흐름이라 개별 단지 가격과는 다를 수 있어요.",
            ]}
            source={`한국부동산원 R-ONE · ${ymLong(index.ym)} 기준`}
          />
        }
        value={formatByKey(index.value, "num1")}
        delta={index.momPct !== null ? <Delta pct={index.momPct} srContext="전월보다" /> : null}
        basis="전월 대비"
        foot={`${ymLong(index.ym)} · 부동산원`}
      />,
    );
  }
  if (avgPrice) {
    const reb = avgPrice.basis === "reb";
    tiles.push(
      <Tile
        key="avg"
        label="평균 매매가"
        explain={
          <Explain
            title="평균 매매가"
            body="이 지역 아파트 한 채 값의 평균이에요. 면적·연식을 가리지 않은 평균이라 단지·평형마다 실제 값은 크게 달라요."
            how={
              reb
                ? ["한국부동산원이 공표한 이 지역 아파트 평균 매매가격(월간)을 옮겨요."]
                : [
                    /* [1009 · H 리뷰] 월 집계는 **계약월** 기준(market_region_monthly.month = contract_ym) — "신고"가 아니라 "계약" */
                    `${avgPrice.ym ? ymLong(avgPrice.ym) : "그 달"}에 계약해 국토교통부에 신고된 이 지역 아파트 매매 ${
                      avgPrice.trades?.toLocaleString("ko-KR") ?? ""
                    }건의 가격을 단순 평균했어요(해제 신고 제외).`,
                    "어떤 평형이 많이 팔렸는지에 따라 달마다 크게 움직여요 — 추세는 위 시세 지수로 보세요.",
                  ]
            }
            source={
              reb
                ? `한국부동산원 R-ONE${avgPrice.ym ? ` · ${ymLong(avgPrice.ym)} 기준` : ""}`
                : `국토교통부 실거래가 공개시스템${avgPrice.ym ? ` · ${ymLong(avgPrice.ym)} 계약분` : ""}`
            }
          />
        }
        value={formatKrwShort(avgPrice.krw)}
        foot={
          reb
            ? `${avgPrice.ym ? `${ymLong(avgPrice.ym)} · ` : ""}부동산원`
            : `${avgPrice.ym ? `${ymMonth(avgPrice.ym)} ` : ""}계약 ${avgPrice.trades?.toLocaleString("ko-KR") ?? ""}건 평균`
        }
      />,
    );
  }
  if (jeonse) {
    tiles.push(
      <Tile
        key="jeonse"
        label="전세가율"
        explain={
          <Explain
            term="jeonse-garyul"
            how={[
              "한국부동산원이 공표한 이 지역 아파트 전세가율(매매가 대비 전세가 비율)을 옮겨요.",
              "전월 대비는 지난달 전세가율과의 차이(%p)예요.",
            ]}
            source={`한국부동산원 R-ONE${jeonse.ym ? ` · ${ymLong(jeonse.ym)} 기준` : ""}`}
          />
        }
        value={`${jeonse.value.toFixed(1)}%`}
        delta={jeonse.ppChange !== null ? <Delta pp={jeonse.ppChange} srContext="전월보다" /> : null}
        basis="전월 대비"
        foot={jeonse.ym ? `${ymLong(jeonse.ym)} · 부동산원` : "부동산원"}
      />,
    );
  }
  if (volume) {
    tiles.push(
      <Tile
        key="volume"
        label="매매 거래량"
        explain={
          <Explain
            term="geoRae-ryang"
            how={[
              "국토교통부에 신고된 이 지역 아파트 매매 건수를 계약한 달 기준으로 셌어요.",
              "신고 기한(계약 후 30일)이 지나지 않은 달은 아직 신고가 들어오는 중이라 이 칸에서 빼고 따로 적어요.",
              "전월 대비는 신고가 끝난 두 달끼리 비교해요.",
            ]}
            source="국토교통부 실거래가 공개시스템"
          />
        }
        value={`${volume.count.toLocaleString("ko-KR")}건`}
        delta={volume.momPct !== null ? <Delta pct={volume.momPct} srContext="전월보다" /> : null}
        basis="전월 대비"
        foot={`${ymLong(volume.ym)} 계약분${openNote ? ` · ${openNote}` : ""}`}
      />,
    );
  }

  return (
    <section aria-labelledby="region-hero-h" className="rise-in card mb-4 p-[var(--pad-card)]">
      {overview.headlineCaption && (
        <p className="m-0 t-caption text-text-3 break-words">{overview.headlineCaption}</p>
      )}
      <h2 id="region-hero-h" className="mt-0.5 t-title text-ink break-words">
        {overview.headline ?? `${name} 아파트 시세 한눈에`}
      </h2>
      {overview.subline && <p className="m-0 mt-0.5 t-body font-bold text-text-2">{overview.subline}</p>}
      {!overview.hasReb && (
        <p className="m-0 mt-1.5 t-sub text-text-3">
          한국부동산원 지역 통계는 아직 없어요 — 공표되면 붙어요. 아래 숫자는 국토교통부 실거래 신고 자료예요.
        </p>
      )}
      {tiles.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">{tiles}</div>
      )}
      <p className="m-0 mt-2.5 t-caption text-text-3 break-words">
        출처 ·{" "}
        {[overview.hasReb ? "한국부동산원(R-ONE) 월간 통계" : null, "국토교통부 실거래 신고"]
          .filter(Boolean)
          .join(" · ")}{" "}
        · 매물 호가 아님
      </p>
      {freshnessLine}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/map?region=${encodeURIComponent(mapRegion)}`}
          className="chip inline-flex items-center border border-line bg-surface px-3 py-1.5 t-sub font-bold text-primary no-underline"
        >
          지도에서 단지 보기 ›
        </Link>
        <Link
          href={`/region/${id}/report`}
          className="chip inline-flex items-center border border-line bg-surface px-3 py-1.5 t-sub font-bold text-text-1 no-underline"
        >
          월간 리포트 ›
        </Link>
        <Link
          href={`/town/${id}`}
          className="chip inline-flex items-center border border-line bg-surface px-3 py-1.5 t-sub font-bold text-text-1 no-underline"
        >
          {name} 동네 홈 ›
        </Link>
      </div>
    </section>
  );
}

export default RegionHero;
