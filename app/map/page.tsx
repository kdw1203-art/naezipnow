import { unstable_cache } from "next/cache";
import { MapClientLazy as MapClient } from "./MapClientLazy";
import type { DanjiItem, TradeItem } from "./map-client";
import {
  encodeComplexId,
  type ComplexTransactionRow,
} from "@/lib/complex/complex-store";
import { loadRegionMarketMarkers } from "@/lib/map/region-market";
import { pctDelta, deltaLabel } from "@/lib/map/trade-stats";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { withBudget } from "@/lib/async/with-budget";
import { seoAlternates } from "@/lib/seo/alternates";
import { saveLastGood, loadLastGood } from "@/lib/cache/last-good";
import { formatKrwManwon } from "@/lib/format/krw";
import { resolveNaverMapClientId } from "@/lib/map/naver-maps-sdk";

/* [1007] ISR 10분 — 예전엔 `auth()`(내 노트 수·예산 프리필·내 노트 레이어 기본값)와
   `searchParams`(region·complexId·noteId·apt·lat·lng·z·type·price…) 때문에 force-dynamic 이었고,
   24h 실측 함수 호출 911회 중 사람 방문은 한 자릿수였다(7일 페이지뷰 ~120건 전체). 크롤러
   요청마다 함수·세션·지역 RPC 가 돌았다. 이 페이지는 이제 **공유분**(좌표·시세·세대수·지역
   마커 — 모두에게 같은 값, 아래 loadSharedDanji 10분 캐시와 같은 눈금)만 그리고, 세션·주소에
   달린 초기값은 MapClientLazy(클라이언트)가 마운트 뒤 만들어 MapClient 에 예전과 같은 props 로
   넘긴다(판정 규칙: lib/map/entry-params). 서버 렌더에 사용자별 값은 한 조각도 없다. */
/* [1010] 600 → 21,600(6시간). 이 화면의 서버 HTML 을 바꾸는 것은 국토부 실거래 적재뿐이고,
   적재 크론이 끝나면 SOURCE_MAP.molit 이 "/map" 을 즉시 비운다(lib/cache/invalidate.ts).
   실측(2026-09-20~22): /map 하루 911회 함수 호출 · 사람 방문은 그 극히 일부 — 10분 눈금은
   크롤 1회당 재렌더 1회와 사실상 같았다. 신선도는 이제 TTL 이 아니라 적재가 맡는다. */
export const revalidate = 21_600;

/* `?region=` 같은 필터가 붙어도 색인되는 주소는 `/map` 하나여야 한다.
   필터 조합마다 별도 URL 이 색인되면 같은 화면이 수십 개로 쪼개진다. */
export const metadata = {
  title: "지도에서 비교 | 내집나우",
  description:
    "임장노트에 남긴 단지를 실거래 시세와 함께 지도에서 비교하세요. 기록 → AI 정리 → 지도 비교 흐름의 비교 단계입니다.",
  alternates: seoAlternates("/map"),
};

/** 만원 단위 → "8.4억" / "8,200만" 라벨 — [967 · 31] lib/format/krw.ts "eok1"(단지 허브와 같은 얼굴).
 *  [1009 · C] 지도 말풍선·목록의 값은 그 달 거래 **평균**이라 짧은 표기가 표준이다(한 건 값이면 formatEokMan). */
const formatManwon = (manwon: number): string => formatKrwManwon(manwon, { style: "eok1" });

function toTrades(tx: ComplexTransactionRow[]): TradeItem[] {
  // 과거→최신 순 입력 — 최신 3건을 최신순으로
  const items: TradeItem[] = [];
  for (let i = tx.length - 1; i >= 0 && items.length < 3; i--) {
    const row = tx[i];
    const prev = i > 0 ? tx[i - 1].avg_manwon : undefined;
    // 그 달 거래가 3건 미만이면 등락률 대신 "표본 부족" (공통 헬퍼 규칙)
    const { delta, tone } = deltaLabel(pctDelta(row.avg_manwon, prev), row.deal_count);
    items.push({
      date: `${row.yyyymm.slice(0, 4)}.${row.yyyymm.slice(4, 6)}`,
      price: formatManwon(row.avg_manwon),
      sub: `${row.deal_count}건`,
      delta,
      tone,
    });
  }
  return items;
}

/** 배치 조회로 만든 단지별 부가정보 — 실거래에서 직접 얻을 수 있는 실값만 */
interface ComplexFacts {
  /** 최근 24개월 거래의 build_year 최빈값(없으면 null) */
  buildYear: number | null;
  /** 최근 24개월 거래 전용면적 평균(㎡) */
  avgAreaM2: number | null;
}

function toDanjiItem(
  regionName: string,
  complexName: string,
  tx: ComplexTransactionRow[],
  facts: ComplexFacts,
  coord: { lat: number; lng: number },
  myNoteCount: number,
  households: number | null,
): DanjiItem {
  const latest = tx.length > 0 ? tx[tx.length - 1] : null;
  const prev = tx.length > 1 ? tx[tx.length - 2] : null;
  const momPct = latest ? pctDelta(latest.avg_manwon, prev?.avg_manwon) : null;
  // 최신월 표본이 3건 미만이면 전월비 대신 "표본 부족" (item3 — pctDelta 공통 헬퍼)
  const { delta, tone } = deltaLabel(momPct, latest?.deal_count ?? null);
  const { district } = splitRegion(regionName);
  const metaParts = [
    facts.buildYear ? `${facts.buildYear}년` : null,
    district || null,
  ].filter((v): v is string => Boolean(v));
  return {
    id: encodeComplexId(regionName, complexName),
    name: complexName,
    note: myNoteCount > 0 ? `노트 ${myNoteCount}건` : null,
    meta: metaParts.length > 0 ? metaParts.join(" · ") : "정보 준비 중",
    /* [1009 · C] "시세 준비 중" → "실거래 없음" — 실거래만 있는 화면에 "시세"라는 말을 쓰지 않는다(표기 표준) */
    price: latest ? formatManwon(latest.avg_manwon) : "실거래 없음",
    delta,
    deltaTone: tone,
    size: "면적 통합",
    lat: coord.lat,
    lng: coord.lng,
    avgPriceWon: latest ? latest.avg_manwon * 10_000 : null,
    momPct,
    areaM2: facts.avgAreaM2,
    buildYear: facts.buildYear,
    /* 세대수 — 예전엔 무조건 null 이었다("실데이터 소스 미연동"). 국토부 상세(V4)
       백필이 돌면서 complex_tx_stats 에 값이 들어왔고, 세대수 범위 슬라이더도
       실제로 동작하게 됐다. 값이 아직 없는 단지는 그대로 null 로 둔다 —
       0 으로 채우면 "0세대 단지"가 되고, 세대수 필터에서 잘못 걸린다. */
    households,
    buildingType: "아파트", // 국토부 아파트 실거래만 수집 — 유형 칩도 아파트 단일
    trades: toTrades(tx),
    latestYm: latest ? `${latest.yyyymm.slice(0, 4)}.${latest.yyyymm.slice(4, 6)}` : null,
    latestDealCount: latest?.deal_count ?? null,
  };
}

/** region_name("서울 송파구") → city/district */
function splitRegion(region: string): { city: string; district: string } {
  const parts = region.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { city: region, district: region };
  return { city: parts[0], district: parts.slice(1).join(" ") };
}

/** 좌표 캐시(complex_geocode)에 저장된 지오코딩 완료 단지 조회 */
async function loadGeocodedComplexes(
  limit: number,
): Promise<{ region_name: string; complex_name: string; lat: number; lng: number }[]> {
  /* 2026-07-26: 실패를 `[]` 로 삼켰다. 그러면 지도 좌측 패널이 "수도권 단지 0",
     모바일 목록이 "이 지역 단지 목록을 준비 중이에요" 로 그려진다 — 좌표 캐시를
     못 읽은 것뿐인데 아직 준비가 안 된 서비스처럼 보인다. 실패는 던진다.
     (행이 0개인 것은 진짜 빈 상태이므로 그대로 `[]`.) */
  const sb = getServiceSupabase();
  if (!sb) throw new Error("[map] Supabase 서비스 클라이언트를 만들 수 없습니다 (환경변수 누락)");
  const { data, error } = await sb
    .from("complex_geocode")
    .select("region_name, complex_name, lat, lng")
    .eq("status", "ok")
    .not("lat", "is", null)
    .order("trade_count", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`complex_geocode 조회 실패: ${error.message}`);
  if (!Array.isArray(data)) throw new Error("complex_geocode 응답이 배열이 아닙니다");
  return (
    data as { region_name: string; complex_name: string; lat: number; lng: number }[]
  ).filter((g) => g.complex_name && Number.isFinite(g.lat) && Number.isFinite(g.lng));
}

/** 단지 키 — 배치 행과 좌표 행을 잇는다 */
function pairKey(region: string, name: string): string {
  return `${region}${name}`;
}

/** N개월 전 YYYYMM (contract_ym 텍스트 비교용) */
function ymMonthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 배치 조회 하드캡 — 최신월부터 담기므로 잘려도 최근 데이터가 남는다 */
const MAX_TX_ROWS = 12_000;
/** 실거래 조회 기간(개월) — 단지별 전량 조회 대신 최근 24개월만 */
const TX_LOOKBACK_MONTHS = 24;

/**
 * 지도 데이터 한 블록에 주는 시간(ms).
 *
 * 이 라우트는 maxDuration=300 이고, DB 가 밀리는 날 실제로 그 300초를 다 태우고
 * `Vercel Runtime Timeout Error` 로 죽은 기록이 있다. 그렇게 죽으면 화면이 아예
 * 안 뜬다 — 아래 danjiLoadFailed 안내조차 못 보여 준다. 45초에 접으면 적어도
 * "지금은 못 불러왔다"는 화면은 뜬다.
 *
 * 45초로 잡은 이유: 사이트맵 섹션 로더와 같은 값이다(SECTION_LOAD_BUDGET_MS).
 * 정상일 때 이 두 조회는 수 초 안에 끝나므로, 45초를 넘겼다는 건 이미
 * "느린 날"이 아니라 "안 되는 날"이라는 뜻이다.
 */
const MAP_SECTION_BUDGET_MS = 45_000;

interface TxRow {
  region_name: string;
  complex_name: string;
  contract_ym: string;
  deal_amount_krw: number;
  area_m2: number | null;
  build_year: number | null;
}

/**
 * 지도 목록 단지들의 실거래를 **한 번의 IN 쿼리**로 배치 조회.
 * 예전엔 단지 30개 × getTransactionHistory(전 기간) 병렬 30콜(N+1)이었다.
 * 최근 24개월로 제한하고 (region,name) 쌍 재검증으로 IN×IN 교차곱 오매칭을 거른다.
 */
async function fetchTxBatch(
  geo: { region_name: string; complex_name: string }[],
): Promise<Map<string, TxRow[]>> {
  const out = new Map<string, TxRow[]>();
  const sb = getServiceSupabase();
  if (!sb || geo.length === 0) return out;
  const regions = [...new Set(geo.map((g) => g.region_name))];
  const names = [...new Set(geo.map((g) => g.complex_name))];
  const want = new Set(geo.map((g) => pairKey(g.region_name, g.complex_name)));
  const { data, error } = await sb
    .from("market_transactions")
    .select("region_name, complex_name, contract_ym, deal_amount_krw, area_m2, build_year")
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    .gt("deal_amount_krw", 0)
    .gte("contract_ym", ymMonthsAgo(TX_LOOKBACK_MONTHS))
    .in("region_name", regions)
    .in("complex_name", names)
    .order("contract_ym", { ascending: false })
    .limit(MAX_TX_ROWS);
  /* 이 조회 하나가 목록 전체의 시세를 담당한다. 실패를 빈 맵으로 흘려보내면
     30개 단지가 **모두** "시세 준비 중" 으로 그려진다 — 실거래가 멀쩡히 쌓여
     있는 단지들에 대고 "아직 데이터가 없다"고 단정하는 셈이다.
     loadSharedDanjiUncached 는 이미 실패를 던지도록 되어 있고(위 주석), MapPage 는
     dbRun.state === "error" 를 따로 안내한다. 여기서도 못 읽었으면 던진다. */
  if (error) {
    throw new Error(
      `market_transactions 조회 실패 (지도 시세 배치): ${error.message ?? "알 수 없는 오류"}`,
    );
  }
  for (const r of (data as TxRow[] | null) ?? []) {
    const key = pairKey(r.region_name, r.complex_name);
    if (!want.has(key)) continue;
    const arr = out.get(key);
    if (arr) arr.push(r);
    else out.set(key, [r]);
  }
  return out;
}

/** 단지 한 곳의 배치 행 → 월별 집계(과거→최신, 최근 6개월) + 부가정보 */
function aggregateComplex(
  complexId: string,
  rows: TxRow[],
): { tx: ComplexTransactionRow[]; facts: ComplexFacts } {
  const byYm = new Map<string, { sum: number; n: number; min: number; max: number }>();
  let areaSum = 0;
  let areaN = 0;
  const yearVotes = new Map<number, number>();
  for (const r of rows) {
    const amt = Number(r.deal_amount_krw);
    if (!r.contract_ym || !Number.isFinite(amt) || amt <= 0) continue;
    const cur = byYm.get(r.contract_ym) ?? { sum: 0, n: 0, min: amt, max: amt };
    cur.sum += amt;
    cur.n += 1;
    cur.min = Math.min(cur.min, amt);
    cur.max = Math.max(cur.max, amt);
    byYm.set(r.contract_ym, cur);
    const area = r.area_m2 != null ? Number(r.area_m2) : NaN;
    if (Number.isFinite(area) && area > 0) {
      areaSum += area;
      areaN += 1;
    }
    const by = r.build_year != null ? Number(r.build_year) : NaN;
    if (Number.isFinite(by) && by > 1900) {
      yearVotes.set(by, (yearVotes.get(by) ?? 0) + 1);
    }
  }
  const tx: ComplexTransactionRow[] = [...byYm.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([ym, v]) => ({
      complex_id: complexId,
      yyyymm: ym,
      area_m2: null,
      avg_manwon: Math.round(v.sum / v.n / 10_000),
      min_manwon: Math.round(v.min / 10_000),
      max_manwon: Math.round(v.max / 10_000),
      deal_count: v.n,
      source: "molit",
    }));
  let buildYear: number | null = null;
  let bestVotes = 0;
  for (const [year, votes] of yearVotes) {
    if (votes > bestVotes || (votes === bestVotes && buildYear != null && year > buildYear)) {
      bestVotes = votes;
      buildYear = year;
    }
  }
  return {
    tx,
    facts: {
      buildYear,
      avgAreaM2: areaN > 0 ? Math.round((areaSum / areaN) * 10) / 10 : null,
    },
  };
}

/**
 * 지도 목록 단지들의 세대수를 complex_tx_stats(집계 MV)에서 한 번에 읽는다.
 *
 * 실거래(market_transactions)에는 세대수가 없어서 예전엔 그냥 null 이었다.
 * 국토부 단지 상세(V4) 백필이 채운 값이 MV 에 들어와 있으므로 그걸 읽는다.
 * 조회 실패는 빈 맵 — 세대수만 안 보일 뿐 목록은 그대로 뜬다.
 */
async function fetchHouseholds(
  geo: { region_name: string; complex_name: string }[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const sb = getServiceSupabase();
  if (!sb || geo.length === 0) return out;
  const want = new Set(geo.map((g) => pairKey(g.region_name, g.complex_name)));
  const { data, error } = await sb
    .from("complex_tx_stats")
    .select("region_name,complex_name,households")
    .in("region_name", [...new Set(geo.map((g) => g.region_name))])
    .in("complex_name", [...new Set(geo.map((g) => g.complex_name))])
    .not("households", "is", null)
    .limit(2_000);
  if (error) {
    logger.warn("[map] 세대수 조회 실패 — 세대수 없이 진행", { message: error.message });
    return out;
  }
  for (const r of (data as { region_name: string; complex_name: string; households: number }[] | null) ?? []) {
    const key = pairKey(r.region_name, r.complex_name);
    if (!want.has(key)) continue;
    const n = Number(r.households);
    if (Number.isFinite(n) && n > 0) out.set(key, n);
  }
  return out;
}

/**
 * 실거래·지오코딩 좌표 기반 지도 단지 로드.
 * 좌표 캐시만 읽는다 — 백필은 cron(geocode-complexes)이 담당하고,
 * 요청 경로의 동기 지오코딩(예전 부트스트랩)은 응답 지연 요인이라 제거했다.
 */
async function loadSharedDanjiUncached(): Promise<{ items: DanjiItem[]; region: string }> {
  /* 2026-07-26: 통째로 try/catch 해서 조회 실패도 `null`, 좌표가 0건인 것도 `null`
     이었다. 호출부는 둘을 구분할 방법이 없어서 두 경우 모두 "단지 0" 으로 그렸다.
     이제 실패는 던지고, 빈 결과만 빈 목록으로 돌려준다.
     [938 · B007] 단, DB 포화 시간대의 조회 타임아웃(실측 일 2~4건)은 마지막
     정상본으로 잇는다 — 이 데이터는 전 방문자 공용이고 원천이 하루 한 번
     갱신되므로, 몇 시간 전 정상본이 "지금 못 불러왔다" 화면보다 사실에 가깝다.
     정상본이 없거나 이틀 넘게 낡았으면 예전처럼 던진다. */
  try {
    const fresh = await loadSharedDanjiLive();
    /* await — 서버리스에서 비동기 잔여 작업은 응답 후 얼어붙을 수 있다.
       10분에 한 번(재생성 시)만 도는 소형 upsert 라 대기 비용은 무시 수준. */
    await saveLastGood(SHARED_DANJI_LKG_KEY, fresh);
    return fresh;
  } catch (err) {
    const lkg = await loadLastGood<{ items: DanjiItem[]; region: string }>(
      SHARED_DANJI_LKG_KEY,
      48,
    );
    if (lkg && Array.isArray(lkg.value.items) && lkg.value.items.length > 0) {
      logger.warn("[map] 공유 단지 배치 실패 — 마지막 정상본으로 대체", {
        fetchedAt: lkg.fetchedAt,
        cause: err instanceof Error ? err.message : String(err),
      });
      return lkg.value;
    }
    throw err;
  }
}

const SHARED_DANJI_LKG_KEY = "map:shared-danji-v1";

async function loadSharedDanjiLive(): Promise<{ items: DanjiItem[]; region: string }> {
  const geo = await loadGeocodedComplexes(30);
  if (geo.length === 0) return { items: [], region: "수도권" };

  const [txByComplex, householdsByComplex] = await Promise.all([
    fetchTxBatch(geo),
    fetchHouseholds(geo),
  ]);

  /* myNoteCount 는 여기서 항상 0 — 이 함수는 **모든 방문자가 공유하는** 캐시에
     들어가므로 사용자별 데이터를 한 조각도 섞으면 안 된다(A 의 노트 수가 B 의
     화면에 캐시로 새는 사고). 내 노트 표시는 [1007] 부터 MapClientLazy 가 브라우저에서
     그 사람 것만 덧입힌다(lib/map/entry-params.overlayMyNoteCounts). */
  const items = geo.map((g) => {
    const id = encodeComplexId(g.region_name, g.complex_name);
    const rows = txByComplex.get(pairKey(g.region_name, g.complex_name)) ?? [];
    const { tx, facts } = aggregateComplex(id, rows);
    return toDanjiItem(
      g.region_name,
      g.complex_name,
      tx,
      facts,
      { lat: g.lat, lng: g.lng },
      0,
      householdsByComplex.get(pairKey(g.region_name, g.complex_name)) ?? null,
    );
  });

  // 패널 헤더 라벨 — 최빈 시/도
  const counts = new Map<string, number>();
  for (const g of geo) {
    const { city } = splitRegion(g.region_name);
    if (city) counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  let region = "수도권";
  let best = 0;
  for (const [k, n] of counts) {
    if (n > best) {
      best = n;
      region = k;
    }
  }
  return { items, region };
}

/**
 * 공유분(좌표·시세·세대수) 10분 캐시. 예전엔 이 페이지가 auth·searchParams 때문에
 * force-dynamic 이라 요청마다 위 3개 배치 조회를 다시 쳤다 — 내용은 모든
 * 방문자에게 동일한데도. [1007] 페이지 자체가 ISR(600)이 되어 이 캐시는 재생성 렌더
 * 사이의 두 번째 방어선이다. 실패는 캐시되지 않고 그대로 던져진다(withBudget 이 받아
 * danjiLoadFailed 로 정직하게 그린다) — 빈 결과를 실패 대신 얼리는 일은 없다.
 */
/* [1010] 600초 → 7일 + "market" 태그. 위 region-market 과 같은 이유다(라우트 TTL 의 뚜껑). */
const loadSharedDanji = unstable_cache(loadSharedDanjiUncached, ["map-shared-danji-v1"], {
  revalidate: 604_800,
  tags: ["map-danji", "market"],
});

/* [1007] 개인분(내 노트 수·예산·내 노트 레이어)은 서버에서 읽지 않는다 — MapClientLazy 가
   세션 프로브 뒤 브라우저 안에서 그 사람 것만 덧입힌다(lib/map/entry-params.overlayMyNoteCounts).
   `?region=` 좌표 해석(search_regions RPC)도 같은 RPC 를 쓰는 /api/regions/search(CDN 24h)로 옮겼다 —
   legal_regions 252행 중 183행이 좌표가 없어 못 푸는 경우가 남는 사실(2026-08-06 실측)은 그대로다. */

export default async function MapPage() {
  /* 사실 우선: 허위 단지(공작아파트 등)를 채우지 않는다. 다만 "조회 실패" 와
     "빈 결과" 는 갈라서 내려보낸다 — 예전에는 둘 다 빈 목록이라 화면이
     "이 지역 단지 목록을 준비 중이에요" 라고 잘못 안내했다. */
  /* 상한을 두는 이유: DB 가 밀리는 날 이 페이지가 300초를 다 태우고
     `Vercel Runtime Timeout Error` 로 죽은 기록이 있다. 그러면 화면이 아예 안 뜬다 —
     아래 danjiLoadFailed 안내조차 못 보여 준다. 45초에 접으면 적어도 "지금은 못
     불러왔다"는 화면은 뜬다. 늦게라도 정확한 답보다 제때 뜨는 답이 낫다. */
  const [dbRun, markersRun] = await Promise.all([
    withBudget(
      Promise.resolve().then(() => loadSharedDanji()),
      MAP_SECTION_BUDGET_MS,
    ),
    withBudget(
      Promise.resolve().then(() => loadRegionMarketMarkers()),
      MAP_SECTION_BUDGET_MS,
    ),
  ]);

  if (dbRun.state === "timeout") {
    logger.error(`[map] 단지 목록 조회가 ${MAP_SECTION_BUDGET_MS}ms 안에 끝나지 않았습니다`);
  } else if (dbRun.state === "error") {
    logger.error("[map] 단지 목록 조회 실패", dbRun.error);
  }
  if (markersRun.state === "timeout") {
    logger.error(`[map] 지역 시세 마커 조회가 ${MAP_SECTION_BUDGET_MS}ms 안에 끝나지 않았습니다`);
  } else if (markersRun.state === "error") {
    logger.error("[map] 지역 시세 마커 조회 실패", markersRun.error);
  }

  const dbLoaded =
    dbRun.state === "ok" ? { ok: true as const, value: dbRun.value } : { ok: false as const };
  const markersLoaded =
    markersRun.state === "ok"
      ? { ok: true as const, value: markersRun.value }
      : { ok: false as const };

  /* [968 · 23] 지도 SDK Client ID 를 서버에서 내려준다. /api/map/sdk-config 가 주는
     값과 같은 함수(resolveNaverMapClientId)라 결과도 같다 — env 는 배포 단위로 굳으므로
     ISR 렌더에서 읽어도 요청마다 읽던 것과 같은 값이다. 공개 값(maps.js URL 에 노출, NCP
     도메인 등록으로 보호)이므로 HTML 에 실려도 새는 게 없다. 브라우저는 "청크 → sdk-config
     fetch → maps.js → 타일" 에서 fetch 한 왕복을 통째로 건너뛴다. */
  const ncpKeyId = resolveNaverMapClientId();

  return (
    <>
      {/* [968 · 23] SDK·타일 호스트 preconnect — React 19 가 <head> 로 끌어올린다.
          host 는 실제 요청과 CSP(lib/security/content-security-policy.ts) 가 허용하는
          것만: oapi.map.naver.com(script-src, maps.js) · nrbe.pstatic.net(script-src
          https://*.pstatic.net 의 SDK 번들 + img-src https: 의 래스터 타일 —
          scripts/measure-map-overlays.mjs 가 차단 목록에 적어 둔 실측 호스트).
          crossOrigin 은 붙이지 않는다 — <script src>·<img> 는 비-CORS 연결이라
          anonymous 로 미리 연 소켓은 재사용되지 않는다. */}
      <link rel="preconnect" href="https://oapi.map.naver.com" />
      <link rel="preconnect" href="https://nrbe.pstatic.net" />
      {/* [C003 2026-08-31] 이 페이지에 h1 이 없었다(12페이지 실측 중 유일).
          지도는 시각 UI 라 보이는 제목이 어색하므로 sr-only 로 문서 제목만 준다 —
          검색엔진·스크린리더에게 "이 문서의 주제"를 말하는 최소한의 기본기. */}
      <h1 className="sr-only">지도에서 실거래가 비교</h1>
      <MapClient
        ncpKeyId={ncpKeyId}
        danji={dbLoaded.ok ? dbLoaded.value.items : []}
        regionLabel={dbLoaded.ok ? dbLoaded.value.region : "수도권"}
        regionMarkers={markersLoaded.ok ? markersLoaded.value : []}
        danjiLoadFailed={!dbLoaded.ok}
        regionMarkersLoadFailed={!markersLoaded.ok}
      />
    </>
  );
}
