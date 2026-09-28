import "server-only";
/* [1023 · AI 분석] 티저 지역 고정 해제 — 적재 함수에 regionId 인자를 넣고(캐시 키에 인자가 실린다) 허브 대표 지역 8곳을
   한 벌씩 더 적는다(loadHubTeasersByRegion). 강남구 한 벌(loadHubTeasers)은 예전 그대로 — 카드 기본값. */

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/invalidate";
import { loadLatestTemperatures } from "@/app/components/MarketTempWidget";
import { listRegionTemperatureHistory } from "@/lib/market/temperature-archive";
import { getRegionSnapshot, getRegionSeries } from "@/lib/market/store";
import { getBaseRate } from "@/lib/market/base-rate";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import {
  CARD_REGION_MONTHLY_NAMES,
  formatEok,
  type MonthlyRow,
} from "@/lib/newui/home-region-fallback";
import { pickLatestMonthlyAverage, shortMonthLabel } from "@/lib/market/region-snapshot-fallback";

/* 분석 허브 카드 티저(#411 → UI-09) — 각 도구 카드에 "그 도구의 실측 숫자 한 줄 + 추세선".
 *
 * 사실 우선: 전부 실데이터고, 조회 실패/없음이면 해당 티저는 없다 → 카드에
 * 그 줄이 **빠진다**(가짜 수치·"—" 채움 없음). 스파크라인도 마찬가지로
 * 점이 2개 미만이면 그리지 않는다(Sparkline 이 스스로 null 을 낸다).
 *
 * [UI-09] 숫자 하나만으로는 "이 도구가 뭘 하는지"가 안 읽혔다. 같은 원천에서
 * 12구간 시계열을 함께 얹어, 카드에서 **방향**까지 보이게 한다. 새 계산은 없고
 * 이미 크론이 쌓아 둔 market_region_series / market_temperature_snapshot 을 읽는다.
 *
 * 비용: 허브는 세션 때문에 force-dynamic 이라 요청마다 돈다. 티저 원천은
 * 주간(온도)·일간(스냅샷·기준금리)·월간(지수) 갱신이라 1시간 unstable_cache 로 접는다
 * — 온도 최신값은 MarketTempWidget 의 캐시 한 벌을 그대로 재사용한다.
 * 실패는 던져서 캐시에 눌러앉지 않게 한다(위젯과 같은 판단). [1007] 다만 "값이 없음" 은
 * 실패가 아니라 결과라 null 로 캐시한다 — 가격 티저 주석 참고.
 *
 * [1010] 1시간 → 1일 + market 태그.
 * 근거: 이 세 캐시는 **요청마다 키가 같다**(강남구 고정, 인자 없음) — 즉 한 벌을 모든
 * 요청이 공유한다. 원천은 주간(온도)·일간(스냅샷)·월간(지수) 갱신이라 1시간 눈금이
 * 잴 수 있는 변화가 없었고, /analysis 하루 1,886 렌더 × 캐시 3개가 그만큼 ISR Write 를
 * 만들었다(재렌더 1회 = 페이지 + 그 렌더가 만든 데이터 캐시 항목들).
 * 태그를 붙인 이유가 핵심이다 — TTL 을 늘리는 대신 실거래·부동산원 적재 직후
 * revalidateTag("market")(lib/cache/invalidate.ts SOURCE_MAP.molit·reb)이 즉시 비운다.
 * 신선도는 시간이 아니라 적재가 정한다.
 */

/** 허브 대표 지역 — 홈 KPI 와 같은 기준(강남: 지수·스냅샷·온도 모두 실존 확인). */
const HUB_REGION_ID = "gangnam";
const HUB_REGION_LABEL = "강남구";

/** [1023] 고른 단지의 지역으로 바꿔 보여 줄 수 있는 지역 — 홈 카드 지역(CARD_REGION_MONTHLY_NAMES) 앞 8곳.
 *  캐시가 지역 수만큼 늘어나므로(하루 1회 적재) 여기서 끊는다. 목록 밖 지역은 강남구 한 벌 그대로. */
export const HUB_TEASER_REGIONS: readonly { id: string; label: string }[] = [
  { id: "gangnam", label: HUB_REGION_LABEL },
  { id: "mapo", label: "마포구" },
  { id: "songpa", label: "송파구" },
  { id: "namyangju", label: "남양주시" },
  { id: "seocho", label: "서초구" },
  { id: "yongsan", label: "용산구" },
  { id: "seongdong", label: "성동구" },
  { id: "seongnam-bundang", label: "성남 분당구" },
];

/** 카드에 얹는 시계열 길이 — 12구간(월 12개월 / 주 12주). */
const SPARK_POINTS = 12;

/** tool-catalog 의 HubTool.teaser 키와 1:1. */
export type TeaserKey = "price" | "timing" | "temp" | "gap" | "baseRate";

export interface HubTeaser {
  /** 큰 숫자 한 줄 (예: "3,038만") */
  value: string;
  /** 그 숫자가 무엇인지 — 지역·기준 시점을 반드시 포함한다 */
  caption: string;
  /** 스파크라인 값 (오래된 → 최근). 2개 미만이면 선을 안 그린다. */
  series: readonly number[];
  /** [1009 · A] 값이 변동률이면 숫자(%) — 카드가 <Delta>(▲ 빨강·▼ 파랑)로 그린다. value 는 글자 대체용 */
  deltaPct?: number | null;
}

/** 있는 것만 담긴다 — 없는 키는 아예 없다(=카드에서 그 줄이 빠진다). */
export type HubTeasers = Partial<Record<TeaserKey, HubTeaser>>;

function fmtWeek(weekStart: string): string {
  const m = weekStart.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[1])}.${m[2]} 주` : weekStart;
}

/** "2026-07-01" · "202607" → "26.07" (캡션용 짧은 기준 시점).
 *  [1007] 스냅샷 period 는 R-ONE 원자료의 YYYYMM 이라 "202607" 꼴도 받는다 — 예전 정규식은
 *  하이픈 꼴만 알아 "· 202607 기준" 으로 나갔다. 둘 다 아니면 null(모르는 시점을 지어내지 않음). */
function fmtMonth(period: string | null): string | null {
  if (!period) return null;
  const m = period.match(/^(\d{2})(\d{2})-(\d{2})/);
  if (m) return `${m[2]}.${m[3]}`;
  return shortMonthLabel(period);
}

/* ── [1007] 가격 티저 — "없음" 은 결과이고, 실패만 예외다 ──────────────────────
 *
 * 실측(2026-09-20, Vercel 로그): `unstable_cache(["analysis-hub-price-teaser-v1"])` 가
 * "스냅샷 없음" 을 **throw** 해서 캐시에 아무것도 남지 않았고, /analysis 요청(하루 1,828회,
 * 99% 크롤러)마다 market_region_price 를 다시 치고 오류 로그를 한 줄씩 남겼다. 원인은
 * 강남구 REB 행이 period='' · per_m2_sale=null 로 비어 있던 것(lib/reb/price-rows.ts).
 *
 * 그래서 둘을 가른다.
 *  · 조회 **실패**(DB 오류) → 던진다. 실패를 1시간 캐시하면 장애가 끝나도 티저가 빈다.
 *  · 조회 성공인데 **값이 없음** → null 을 돌려주고 그대로 1시간 캐시한다. 빈 결과도
 *    결과다 — 요청마다 다시 물어봐야 같은 답이다.
 *  · 값이 없을 때는 홈과 같은 원천(market_region_monthly — 국토부 신고 실거래 월 집계)
 *    으로 내려가 "실거래 평균(기준월)" 을 낸다. 이건 시세가 아니라 신고가 평균이라
 *    문구에 출처·기준월을 달고, "시세" 라는 말은 REB 값일 때만 쓴다.
 */
type PriceTeaserSource =
  | { kind: "reb"; perM2Manwon: number; period: string | null }
  | { kind: "monthly"; avgWon: number; month: string; count: number };

async function loadMonthlyFallback(regionId: string): Promise<PriceTeaserSource | null> {
  const sb = getReadOnlySupabase();
  if (!sb) return null;
  const monthlyName = CARD_REGION_MONTHLY_NAMES[regionId];
  if (!monthlyName) return null;
  /* 최근 10개월이면 부분 집계(당월)를 건너뛰어도 넉넉하다 — 홈 폴백과 같은 창 */
  const { data, error } = await sb
    .from("market_region_monthly")
    .select("region_name, month, transaction_count, avg_deal_amount_krw, trend_delta_pct")
    .eq("deal_type", "trade")
    .eq("property_type", "apartment")
    .eq("region_name", monthlyName)
    .order("month", { ascending: false })
    .limit(10);
  if (error) throw new Error(`market_region_monthly(${monthlyName}) 조회 실패: ${error.message}`);
  const pick = pickLatestMonthlyAverage((data ?? []) as MonthlyRow[], monthlyName);
  return pick ? { kind: "monthly", avgWon: pick.avgWon, month: pick.month, count: pick.count } : null;
}

const loadSnapshotTeaser = cache(
  /* [1010] TTL·태그 근거는 이 파일 아래 주석 참고 */
  unstable_cache(
    async (regionId: string): Promise<PriceTeaserSource | null> => {
      const snap = await getRegionSnapshot(regionId);
      if (snap && typeof snap.perM2Sale === "number" && snap.perM2Sale > 0) {
        /* per_m2_sale 은 **원** 단위다 (프로덕션 실측 30,384,497원/㎡ ≈ 3,038만).
           첫 배포에서 원값에 '만'을 붙여 "30,384,497만"으로 나갔다 — 만원 환산. */
        return { kind: "reb", perM2Manwon: Math.round(snap.perM2Sale / 10_000), period: snap.period ?? null };
      }
      return loadMonthlyFallback(regionId);
    },
    /* [1023] v3: regionId 인자 — unstable_cache 는 인자를 키에 싣는다(지역별 한 벌) */
    ["analysis-hub-price-teaser-v3"],
    { revalidate: 86_400, tags: [CACHE_TAGS.market] },
  ),
);

/** "2026-06-15" ~ "2026-09-07" → 12(주). 날짜가 아니면 null */
function weeksBetween(from: string | undefined, to: string | undefined): number | null {
  if (!from || !to) return null;
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return Math.round((b - a) / (7 * 86_400_000));
}

/* 지수 시계열 — 월간/주간 각각 한 벌씩만 읽어 캐시한다(카드 4장이 공유). */
const loadSeries = cache(
  unstable_cache(
    async (regionId: string) => {
      const [saleMonthly, saleWeekly, ratioMonthly] = await Promise.all([
        getRegionSeries(regionId, "sale_index", "monthly", SPARK_POINTS),
        getRegionSeries(regionId, "sale_index", "weekly", SPARK_POINTS),
        getRegionSeries(regionId, "jeonse_ratio", "monthly", SPARK_POINTS),
      ]);
      return {
        saleMonthly: saleMonthly.map((p) => p.value),
        saleWeekly: saleWeekly.map((p) => p.value),
        /* [1009 · A · 리뷰] 첫~끝 점 사이 주 수 — 빠진 주가 있어도 날짜(주 시작일 "2026-09-07")로 센다 */
        saleWeeklySpan: weeksBetween(saleWeekly[0]?.period, saleWeekly[saleWeekly.length - 1]?.period),
        ratio: ratioMonthly,
      };
    },
    /* v2: saleWeeklySpan 추가(모양이 바뀌어 옛 캐시를 읽지 않게) · [1023] v3: regionId 인자 */
    ["analysis-hub-series-v3"],
    { revalidate: 86_400, tags: [CACHE_TAGS.market] },
  ),
);

/** 온도 스파크라인용 12주 이력 — 최신값·헤드라인은 위젯 캐시에서 따로 온다. */
const loadTempHistory = cache(
  unstable_cache(
    (regionId: string) => listRegionTemperatureHistory(regionId, SPARK_POINTS),
    /* [1023] v2: regionId 인자 */
    ["analysis-hub-temp-history-v2"],
    { revalidate: 86_400, tags: [CACHE_TAGS.market] },
  ),
);

export async function loadHubTeasers(regionId: string = HUB_REGION_ID): Promise<HubTeasers> {
  const regionLabel = HUB_TEASER_REGIONS.find((r) => r.id === regionId)?.label ?? HUB_REGION_LABEL;
  const [tempRes, tempHistRes, priceRes, seriesRes, baseRes] =
    await Promise.allSettled([
      loadLatestTemperatures(),
      loadTempHistory(regionId),
      loadSnapshotTeaser(regionId),
      loadSeries(regionId),
      getBaseRate(),
    ]);

  const out: HubTeasers = {};
  const series = seriesRes.status === "fulfilled" ? seriesRes.value : null;

  /* ── 가격 티저: REB ㎡당 매매가(시세) 또는 실거래 평균(폴백) + 12개월 매매가격지수 ── */
  if (priceRes.status === "fulfilled" && priceRes.value) {
    const src = priceRes.value;
    if (src.kind === "reb") {
      const month = fmtMonth(src.period);
      out.price = {
        value: `㎡당 ${src.perM2Manwon.toLocaleString("ko-KR")}만`,
        caption: `${regionLabel} 매매 시세 · 부동산원${month ? ` · ${month} 기준` : ""}`,
        series: series?.saleMonthly ?? [],
      };
    } else {
      /* [1007] 실거래 평균은 시세가 아니다 — 출처(국토부 신고)·기준월·건수를 그대로 적는다 */
      const month = shortMonthLabel(src.month);
      out.price = {
        value: `평균 ${formatEok(src.avgWon)}`,
        caption: `${regionLabel} 실거래 평균 · 국토부 신고 ${src.count.toLocaleString("ko-KR")}건${month ? ` · ${month} 기준` : ""}`,
        series: series?.saleMonthly ?? [],
      };
    }
  }

  /* ── 지역 시세 추세: 최근 12주 매매가격지수의 첫·끝 변화율 ── */
  if (series && series.saleWeekly.length >= 2) {
    const w = series.saleWeekly;
    const first = w[0];
    const last = w[w.length - 1];
    if (first > 0) {
      const pct = Math.round(((last - first) / first) * 1000) / 10;
      out.timing = {
        value: `${pct > 0 ? "+" : ""}${pct}%`,
        /* [1009 · A] 비교 기준을 캡션에 — "기준 없는 %" 금지(표기 표준).
           [리뷰] 주간 점 n개의 첫~끝은 n−1주다(12점 → "11주 전 대비") — 날짜로 센 주 수가 있으면 그것을 쓴다 */
        caption: `${regionLabel} 매매지수 · ${series.saleWeeklySpan ?? w.length - 1}주 전 대비`,
        series: w,
        deltaPct: pct,
      };
    }
  }

  /* ── 지역별 시장 온도: 이번 주 점수 + 주간 이력 ── */
  if (tempRes.status === "fulfilled") {
    /* [1023] 대표 지역(강남)만 첫 행으로 물러선다 — 다른 지역은 그 지역 행이 없으면 티저를 내지 않는다(카드는 강남 한 벌로) */
    const row =
      tempRes.value.rows.find((r) => r.current.regionId === regionId) ??
      (regionId === HUB_REGION_ID ? (tempRes.value.rows[0] ?? null) : null);
    if (row) {
      const hist =
        tempHistRes.status === "fulfilled" &&
        row.current.regionId === regionId
          ? tempHistRes.value.map((s) => s.score)
          : [];
      out.temp = {
        value: `${row.current.score}/100`,
        caption: `${row.current.regionLabel} · ${row.current.headline} · ${fmtWeek(row.current.weekStart)}`,
        series: hist,
      };
    }
  }

  /* ── 전국 전세가율 랭킹: 대표 지역 전세가율 + 12개월 추이 ── */
  if (series && series.ratio.length > 0) {
    const vals = series.ratio.map((p) => p.value);
    const last = series.ratio[series.ratio.length - 1];
    out.gap = {
      value: `${Math.round(last.value * 10) / 10}%`,
      caption: `${regionLabel} 전세가율${fmtMonth(last.period) ? ` · ${fmtMonth(last.period)} 기준` : ""}`,
      series: vals,
    };
  }

  /* ── 금리 스트레스 테스트: 실 기준금리(시계열 없음 — 숫자 한 줄만) ── */
  if (baseRes.status === "fulfilled" && baseRes.value?.label) {
    out.baseRate = {
      value: baseRes.value.label,
      caption: "한국은행 기준금리가 계산에 그대로 들어가요",
      series: [],
    };
  }

  return out;
}

/** [1023] 허브 대표 지역 8곳의 티저 — 키는 regionId. 실패한 지역은 빠진다(카드는 강남 한 벌로 물러선다).
 *  기준금리(baseRate)는 지역과 무관하므로 여기서는 빼고 시장 4종만 싣는다. */
export async function loadHubTeasersByRegion(): Promise<Record<string, HubTeasers>> {
  const settled = await Promise.allSettled(
    HUB_TEASER_REGIONS.map(async (r) => [r.id, await loadHubTeasers(r.id)] as const),
  );
  const out: Record<string, HubTeasers> = {};
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    const [id, t] = s.value;
    const { baseRate: _omit, ...market } = t;
    void _omit;
    if (Object.keys(market).length > 0) out[id] = market;
  }
  return out;
}
