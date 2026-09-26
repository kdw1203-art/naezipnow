/**
 * [1009 · H] 지역 시세 흐름 카드(RegionTrendCard)의 지표 데이터 — 순수 함수.
 * 페이지와 검증 하네스가 같은 함수를 쓰게 따로 뺐다(렌더 코드에 계산을 두면 둘이 어긋난다).
 * ScrubLine 에는 포맷을 **이름**으로 넘긴다(서버 → 클라이언트 props 는 직렬화돼야 한다).
 */
import type { RegionTrendDataset } from "./RegionTrendCard";
import {
  countsToTrend,
  seriesToTrend,
  splitByReporting,
  toYm,
  trendRanges,
  ymMonth,
  type SeriesPoint,
  type VolumePoint,
} from "./region-overview";

export function buildRegionTrendDatasets(input: {
  name: string;
  indexSeries: readonly SeriesPoint[];
  jeonseSeries: readonly SeriesPoint[];
  volume: readonly VolumePoint[];
  now: Date;
}): RegionTrendDataset[] {
  const { name, now } = input;
  const out: RegionTrendDataset[] = [];

  const idx = seriesToTrend("index", "시세 지수", input.indexSeries);
  if (idx) {
    out.push({
      ...idx,
      format: "num1",
      tone: "auto",
      title: "매매가격지수",
      caption: "월간",
      ariaLabel: `${name} 아파트 매매가격지수 월별 추이`,
      footnote: `한국부동산원(R-ONE) 월간 아파트 매매가격지수 · ${idx.fullLabels[idx.fullLabels.length - 1]}까지`,
      ranges: trendRanges(idx.values.length),
      explain: {
        term: "maemae-gagyeok-jisu",
        how: [
          "한국부동산원이 매달 공표하는 이 지역 아파트 매매가격지수(월간)를 그대로 그려요.",
          "누르고 끌면 그 달 지수와 기간 첫 달 대비 변동률이 위에 떠요.",
        ],
        source: "한국부동산원 R-ONE",
      },
    });
  }

  const jr = seriesToTrend("jeonse", "전세가율", input.jeonseSeries);
  if (jr) {
    out.push({
      ...jr,
      format: "pct1",
      tone: "auto",
      title: "전세가율",
      caption: "매매가 대비 전세가",
      ariaLabel: `${name} 아파트 전세가율 월별 추이`,
      footnote: `한국부동산원(R-ONE) 월간 전세가율 · ${jr.fullLabels[jr.fullLabels.length - 1]}까지`,
      ranges: trendRanges(jr.values.length),
      explain: {
        term: "jeonse-garyul",
        how: [
          "한국부동산원이 공표한 이 지역 아파트 전세가율을 달마다 그려요.",
          "위에 뜨는 변동은 기간 첫 달과의 차이(%p)예요.",
        ],
        source: "한국부동산원 R-ONE",
      },
    });
  }

  const vol = countsToTrend("volume", "거래량", input.volume, now);
  if (vol) {
    const open = splitByReporting(
      input.volume
        .filter((v) => toYm(v.month) !== null)
        .map((v) => ({ month: toYm(v.month) as string, count: v.count })),
      now,
    ).open;
    const openNote =
      open.length > 0
        ? ` · ${open.map((v) => `${ymMonth(v.month)} ${v.count.toLocaleString("ko-KR")}건`).join("·")}은 신고 기한(30일) 안이라 선에서 뺐어요`
        : "";
    out.push({
      ...vol,
      format: "int",
      suffix: "건",
      tone: "primary",
      title: "월별 매매 거래량",
      caption: "신고가 끝난 달",
      ariaLabel: `${name} 아파트 매매 월별 신고 건수`,
      footnote: `국토교통부 실거래 신고 · 계약월 기준${openNote}`,
      explain: {
        term: "geoRae-ryang",
        how: [
          "국토교통부에 신고된 이 지역 아파트 매매 건수를 계약한 달 기준으로 셌어요.",
          "신고 기한(계약 후 30일)이 지나지 않은 달은 아직 신고가 들어오는 중이라 선에서 빼고 아래에 따로 적어요.",
        ],
        source: "국토교통부 실거래가 공개시스템",
      },
    });
  }
  return out;
}
