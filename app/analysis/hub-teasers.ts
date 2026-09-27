import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/invalidate";
import { loadLatestTemperatures } from "@/app/components/MarketTempWidget";
import { getRegionSnapshot, getRegionSeries } from "@/lib/market/store";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import {
  CARD_REGION_MONTHLY_NAMES,
  formatEok,
  type MonthlyRow,
} from "@/lib/newui/home-region-fallback";
import { pickLatestMonthlyAverage, shortMonthLabel } from "@/lib/market/region-snapshot-fallback";

/* 분석 허브 지역 시세 행 티저(#411 → UI-09 → v4) — 각 행 오른쪽의 "그 도구의 실측 숫자 하나".
 *
 * 사실 우선: 전부 실데이터고, 조회 실패/없음이면 해당 티저는 없다 → 행 오른쪽이 `›` 로
 * 돌아간다(가짜 수치·"—" 채움 없음).
 *
 * [v4 · 한 화면 한 가지] 행 = 이름 + 보조 한 줄(지역·기준 시점) / 오른쪽 값. 12구간 추세선(스파크라인)과
 * 그 재료(온도 12주 이력 조회)·예시 계산 카드용 기준금리 조회를 걷었다 — 허브에서 그 카드들이 빠졌다.
 * 출처(국토교통부·한국부동산원)는 행마다 적지 않고 섹션 끝 캡션 한 줄(tool-catalog MARKET_SOURCES)이 말한다.
 * 지수 시계열(loadSeries)은 타이밍 변화율·전세가율 값의 원천이라 그대로 읽는다(캐시 키도 그대로).
 *
 * [1010] 1시간 → 1일 + market 태그.
 * 근거: 이 캐시들은 **요청마다 키가 같다**(강남구 고정, 인자 없음) — 즉 한 벌을 모든
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

/** 지수 시계열 길이 — 12구간(월 12개월 / 주 12주). 타이밍 변화율·전세가율 최근값의 원천 */
const SPARK_POINTS = 12;

/** tool-catalog 의 HubTool.teaser 키와 1:1. */
export type TeaserKey = "price" | "timing" | "temp" | "gap";

export interface HubTeaser {
  /** 행 오른쪽 숫자 (예: "30.2억" · "45점" · "52.3%") */
  value: string;
  /** 행 보조 한 줄 — 그 숫자가 무엇인지. 지역·기준 시점을 반드시 포함한다(출처는 섹션 끝 캡션) */
  caption: string;
  /** [1009 · A] 값이 변동률이면 숫자(%) — 행이 <Delta>(▲ 빨강·▼ 파랑)로 그린다. value 는 글자 대체용 */
  deltaPct?: number | null;
}

/** 있는 것만 담긴다 — 없는 키는 아예 없다(=행 오른쪽이 `›`). */
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

async function loadMonthlyFallback(): Promise<PriceTeaserSource | null> {
  const sb = getReadOnlySupabase();
  if (!sb) return null;
  const monthlyName = CARD_REGION_MONTHLY_NAMES[HUB_REGION_ID];
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
    async (): Promise<PriceTeaserSource | null> => {
      const snap = await getRegionSnapshot(HUB_REGION_ID);
      if (snap && typeof snap.perM2Sale === "number" && snap.perM2Sale > 0) {
        /* per_m2_sale 은 **원** 단위다 (프로덕션 실측 30,384,497원/㎡ ≈ 3,038만).
           첫 배포에서 원값에 '만'을 붙여 "30,384,497만"으로 나갔다 — 만원 환산. */
        return { kind: "reb", perM2Manwon: Math.round(snap.perM2Sale / 10_000), period: snap.period ?? null };
      }
      return loadMonthlyFallback();
    },
    ["analysis-hub-price-teaser-v2"],
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
    async () => {
      const [saleMonthly, saleWeekly, ratioMonthly] = await Promise.all([
        getRegionSeries(HUB_REGION_ID, "sale_index", "monthly", SPARK_POINTS),
        getRegionSeries(HUB_REGION_ID, "sale_index", "weekly", SPARK_POINTS),
        getRegionSeries(HUB_REGION_ID, "jeonse_ratio", "monthly", SPARK_POINTS),
      ]);
      return {
        saleMonthly: saleMonthly.map((p) => p.value),
        saleWeekly: saleWeekly.map((p) => p.value),
        /* [1009 · A · 리뷰] 첫~끝 점 사이 주 수 — 빠진 주가 있어도 날짜(주 시작일 "2026-09-07")로 센다 */
        saleWeeklySpan: weeksBetween(saleWeekly[0]?.period, saleWeekly[saleWeekly.length - 1]?.period),
        ratio: ratioMonthly,
      };
    },
    /* v2: saleWeeklySpan 추가(모양이 바뀌어 옛 캐시를 읽지 않게) */
    ["analysis-hub-series-v2"],
    { revalidate: 86_400, tags: [CACHE_TAGS.market] },
  ),
);

export async function loadHubTeasers(): Promise<HubTeasers> {
  const [tempRes, priceRes, seriesRes] = await Promise.allSettled([
    loadLatestTemperatures(),
    loadSnapshotTeaser(),
    loadSeries(),
  ]);

  const out: HubTeasers = {};
  const series = seriesRes.status === "fulfilled" ? seriesRes.value : null;

  /* ── 가격: REB ㎡당 매매가(시세) 또는 실거래 평균(폴백) ── */
  if (priceRes.status === "fulfilled" && priceRes.value) {
    const src = priceRes.value;
    if (src.kind === "reb") {
      const month = fmtMonth(src.period);
      out.price = {
        value: `${src.perM2Manwon.toLocaleString("ko-KR")}만`,
        caption: `${HUB_REGION_LABEL} ㎡당 매매 시세${month ? ` · ${month} 기준` : ""}`,
      };
    } else {
      /* [1007] 실거래 평균은 시세가 아니다 — 기준월·건수를 그대로 적는다("시세" 라는 말을 쓰지 않는다) */
      const month = shortMonthLabel(src.month);
      out.price = {
        value: formatEok(src.avgWon),
        caption: `${HUB_REGION_LABEL} 실거래 평균${month ? ` · ${month}` : ""} 신고 ${src.count.toLocaleString("ko-KR")}건`,
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
        caption: `${HUB_REGION_LABEL} 매매지수 · ${series.saleWeeklySpan ?? w.length - 1}주 전 대비`,
        deltaPct: pct,
      };
    }
  }

  /* ── 지역별 시장 온도: 이번 주 점수(0~100) ── */
  if (tempRes.status === "fulfilled") {
    const row =
      tempRes.value.rows.find((r) => r.current.regionId === HUB_REGION_ID) ??
      tempRes.value.rows[0] ??
      null;
    if (row) {
      out.temp = {
        value: `${row.current.score}점`,
        caption: `${row.current.regionLabel} · ${row.current.headline} · ${fmtWeek(row.current.weekStart)}`,
      };
    }
  }

  /* ── 전세가율: 대표 지역 최근값 ── */
  if (series && series.ratio.length > 0) {
    const last = series.ratio[series.ratio.length - 1];
    const month = fmtMonth(last.period);
    out.gap = {
      value: `${Math.round(last.value * 10) / 10}%`,
      caption: `${HUB_REGION_LABEL} 전세가율${month ? ` · ${month} 기준` : ""}`,
    };
  }

  return out;
}
