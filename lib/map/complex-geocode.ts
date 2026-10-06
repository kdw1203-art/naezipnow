import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { isNaverMapsRestConfigured, naverGeocode } from "@/lib/map/naver-maps-rest";
import {
  buildGeocodePlan,
  buildHintQueries,
  cleanLotAddress,
  expectedSidoKeys,
  GEOCODE_RULES_SINCE,
  hasBuildingNo,
  hitInSido,
  isPlaceholderLot,
  type GeocodeQuery,
} from "@/lib/map/geocode-query";
import { regionSido, regionSigunguByCode } from "@/lib/map/geocode-region";
import {
  chunk,
  pgErrorText,
  regionsByName,
  NAME_IN_CHUNK,
  REGION_IN_MAX,
} from "@/lib/map/geocode-chunk";
import { logger } from "@/lib/log";

/**
 * 단지 좌표 지오코딩 캐시 — complex_geocode 테이블.
 * market_transactions 엔 좌표가 없어, 네이버(NCP) 지오코딩 결과를 1회 저장하고 지도/허브에서 재사용.
 */
export type Coord = { lat: number; lng: number };

/** region+name 조합 키 (배치 매칭용) */
export function coordKey(region: string, name: string): string {
  return JSON.stringify([region, name]);
}

/**
 * 캐시에서 좌표 배치 조회 (status ok 만). 반환: coordKey → Coord
 *
 * [1003] 단지명은 NAME_IN_CHUNK 개씩 끊어 부른다. 예전엔 받은 이름을 통째로
 * `.in()` 에 실었는데, 이 함수를 부르는 /api/map/supply-markers 는 1,500행까지
 * 넘긴다 — 한글 이름 1,500개면 URL 이 200KB 가 넘어 프록시가 요청을 자르고,
 * 라우트는 503("좌표 캐시 조회에 실패했어요")만 돌려줬다. 자세한 계산은
 * lib/map/geocode-chunk.ts 주석. 결과를 조각마다 합치므로 동작은 이전과 같다.
 */
export async function getCachedCoordMap(
  pairs: { region: string; name: string }[],
): Promise<Map<string, Coord>> {
  const out = new Map<string, Coord>();
  const sb = getServiceSupabase();
  if (!sb || pairs.length === 0) return out;
  const byName = regionsByName(pairs);
  const want = new Set(pairs.map((p) => coordKey(p.region, p.name)));

  for (const namePart of chunk([...byName.keys()], NAME_IN_CHUNK)) {
    const regionPart = [...new Set(namePart.flatMap((n) => byName.get(n) ?? []))];
    let q = sb
      .from("complex_geocode")
      .select("region_name, complex_name, lat, lng, status")
      .in("complex_name", namePart)
      .eq("status", "ok");
    /* 지역은 이 조각에 실린 이름들의 것만 싣는다 — PK(region_name, complex_name)
       인덱스를 계속 타기 위해서다. 그래도 너무 많으면 빼는데 결과는 같다:
       아래 want 필터가 (지역, 단지명) 짝을 다시 맞추기 때문이다. */
    if (regionPart.length <= REGION_IN_MAX) q = q.in("region_name", regionPart);
    const { data, error } = await q;
    /* 빈 Map 을 돌려주면 부르는 쪽에는 "좌표가 캐시된 단지가 하나도 없다"로 보인다 —
       지도에서 마커가 통째로 사라지는 모습이다. 못 읽었으면 못 읽었다고 던진다. */
    if (error) {
      throw new Error(`complex_geocode 조회 실패: ${pgErrorText(error, namePart.length)}`);
    }
    for (const r of (data as
      | { region_name: string; complex_name: string; lat: number | null; lng: number | null }[]
      | null) ?? []) {
      const k = coordKey(r.region_name, r.complex_name);
      if (want.has(k) && r.lat != null && r.lng != null) {
        out.set(k, { lat: Number(r.lat), lng: Number(r.lng) });
      }
    }
  }
  return out;
}

export type GeocodeProgress = {
  /** 좌표가 있는 단지(집계 뷰의 단지 가운데) */
  ok: number;
  /** 못 찾음으로 적힌 단지 */
  notfound: number;
  /** 아직 묻지 않은 단지 */
  untried: number;
  /** 집계 뷰의 단지 수(= 분모) */
  total: number;
  /** 집계 뷰 밖의 행(분양·입주 단지 등) — 좌표 있음 · 못 찾음 */
  otherOk: number;
  otherNotfound: number;
  configured: boolean;
};

/**
 * 지오코딩 진행 상황 — 관리자 데이터 페이지용.
 * [1043] 예전엔 분자(좌표 있는 행 **전체** — 분양·전월세 단지 포함)를 분모(매매 단지 수)로 나눠 늘 100% · 남음 0 이었다.
 * 같은 모집단(집계 뷰의 단지 39,354곳)에서 센다 — public.geocode_coverage().
 */
export async function getGeocodeProgress(): Promise<GeocodeProgress> {
  const sb = getServiceSupabase();
  const base: GeocodeProgress = {
    ok: 0,
    notfound: 0,
    untried: 0,
    total: 0,
    otherOk: 0,
    otherNotfound: 0,
    configured: isNaverMapsRestConfigured(),
  };
  if (!sb) return base;
  const { data, error } = await sb.rpc("geocode_coverage");
  if (error) throw new Error(`geocode_coverage 조회 실패: ${pgErrorText(error)}`);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  const n = (k: string) => Math.max(0, Number(row?.[k] ?? 0) || 0);
  return {
    ok: n("with_coord"),
    notfound: n("notfound"),
    untried: n("untried"),
    total: n("complexes"),
    otherOk: n("other_with_coord"),
    otherNotfound: n("other_notfound"),
    configured: base.configured,
  };
}

/**
 * 지오코딩 1회 시도 결과 — "못 찾음"과 "오류"를 구분한다.
 * 예전 코드는 API 예외까지 삼켜 notfound 로 저장했는데, 그러면 키 미설정·쿼터 초과
 * 같은 일시 오류가 영구 실패로 캐시돼 다시는 시도되지 않는 문제가 있었다.
 */
type GeocodeAttempt =
  | { kind: "ok"; coord: Coord; query: string }
  | { kind: "notfound" }
  | { kind: "error"; message: string };

/**
 * [1043] allowed — 기대하는 시·도 열쇠들(비어 있으면 검증 없음). 돌아온 주소의 시·도가 다르면 "없음"으로 친다 —
 * 다른 도시에 찍힌 좌표를 성공으로 굳히는 것보다 좌표가 없는 편이 낫다(없으면 다음 후보·다음 실행이 다시 찾는다).
 */
async function tryGeocode(query: string, allowed: readonly string[]): Promise<GeocodeAttempt> {
  try {
    const items = await naverGeocode(query, 1, { fresh: true });
    const it = items[0];
    if (it && Number.isFinite(it.lat) && Number.isFinite(it.lng)) {
      const where = it.jibunAddress || it.roadAddress || it.address;
      if (!hitInSido(where, allowed)) {
        logger.warn(`[geocode] 시·도 불일치로 버림: "${query}" → "${where}" (기대 ${allowed.join("·")})`);
        return { kind: "notfound" };
      }
      return { kind: "ok", coord: { lat: it.lat, lng: it.lng }, query };
    }
    return { kind: "notfound" }; // API는 정상 응답, 결과가 없을 뿐
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 다단 지오코딩 — 네이버 지오코더는 POI(단지명)가 아니라 "주소" 전용이다. 후보는 주소형만
 * (도로명 → 시/도 보정 지번 → 원본 지번 — lib/map/geocode-query.ts). [1043] 단지명 후보는 없앴다.
 *
 * 모든 시도가 "결과 없음"이어야 notfound. 시도 중 오류가 하나라도 있고 성공이
 * 없으면 error — 호출부는 이 경우 캐시에 저장하지 않는다(다음 배치에서 재시도).
 */
async function geocodeWithFallback(
  queries: readonly GeocodeQuery[],
  allowed: readonly string[],
): Promise<GeocodeAttempt> {
  let lastError: GeocodeAttempt | null = null;
  const seen = new Set<string>();
  for (const raw of queries) {
    const q = raw.query.trim();
    if (!q || seen.has(q)) continue;
    seen.add(q);
    const r = await tryGeocode(q, allowed);
    if (r.kind === "ok") return r;
    if (r.kind === "error") lastError = r;
  }
  return lastError ?? { kind: "notfound" };
}

type TxHints = { roadName: string | null; lotAddress: string | null; regionCode: string | null };

/**
 * [1043] 거래 원본에서 주소 단서를 찾는다 — 첫 후보가 전부 "없음"일 때만 부른다(단지당 조회 2회).
 *   · 전월세 신고(raw.roadnm): 도로명 + 건물번호("지제동삭1로 41") — 매매 신고에는 이 칸이 없다
 *   · 매매 신고(address): 블록 자리가 아닌 진짜 지번이 있는 가장 최근 행
 * 집계 뷰의 주소는 min(address) 라 "가-" · "BL-" 같은 블록 자리가 뽑히는 단지가 있다(거래 많은 신축 택지).
 * 못 읽으면 빈 단서 — 단서는 "있으면 찾는" 후보일 뿐이다.
 */
async function loadTxHints(
  sb: NonNullable<ReturnType<typeof getServiceSupabase>>,
  region: string,
  name: string,
): Promise<TxHints> {
  const out: TxHints = { roadName: null, lotAddress: null, regionCode: null };
  try {
    const [rent, trade] = await Promise.all([
      sb
        .from("market_transactions")
        .select("region_code, roadnm:raw->>roadnm")
        .eq("transaction_type", "rent")
        .eq("is_cancelled", false)
        .eq("region_name", region)
        .eq("complex_name", name)
        .order("contract_ym", { ascending: false })
        .limit(40),
      sb
        .from("market_transactions")
        .select("region_code, address")
        .eq("transaction_type", "trade")
        .eq("is_cancelled", false)
        .eq("region_name", region)
        .eq("complex_name", name)
        .order("contract_ym", { ascending: false })
        .limit(60),
    ]);
    for (const r of (rent.data as { region_code: string | null; roadnm: string | null }[] | null) ?? []) {
      out.regionCode ??= r.region_code?.trim() || null;
      const road = (r.roadnm ?? "").trim();
      if (!out.roadName && hasBuildingNo(road)) out.roadName = road;
      if (out.roadName && out.regionCode) break;
    }
    for (const r of (trade.data as { region_code: string | null; address: string | null }[] | null) ?? []) {
      out.regionCode ??= r.region_code?.trim() || null;
      const addr = (r.address ?? "").trim();
      if (!out.lotAddress && addr && !isPlaceholderLot(addr)) out.lotAddress = addr;
      if (out.lotAddress && out.regionCode) break;
    }
  } catch (e) {
    logger.warn(`[geocode] ${region} ${name} 거래 단서 조회 실패(단서 없이 진행)`, e);
  }
  return out;
}

/**
 * [1043] 단지 좌표 — **캐시만** 읽는다(없으면 null). 단지 화면·브리핑이 쓴다.
 *
 * 예전(geocodeAndCache)엔 캐시에 없으면 그 자리에서 외부 지오코더를 불렀다 — 화면을 그리는 길 위에서
 * 네이버 호출이 최대 3번 줄을 섰고(단지 화면 TTFB 1초대의 한 원인), 그렇게 찍힌 좌표는 검증도 없었다.
 * 좌표를 채우는 일은 백필(크론 하루 200곳 · 관리 화면 실행 단추)이 맡는다.
 */
export async function getCachedCoord(region: string, name: string): Promise<Coord | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data: cached, error } = await sb
    .from("complex_geocode")
    .select("lat, lng, status")
    .eq("region_name", region)
    .eq("complex_name", name)
    .maybeSingle();
  if (error) {
    logger.warn(`[geocode] ${region} ${name} 캐시 조회 실패: ${pgErrorText(error)}`);
    return null;
  }
  return cached && cached.status === "ok" && cached.lat != null && cached.lng != null
    ? { lat: Number(cached.lat), lng: Number(cached.lng) }
    : null;
}

/**
 * 분양·입주 단지 한 곳의 좌표 확보 — 캐시 우선, 없으면 지오코딩 후 저장(supply-geocode 전용).
 * region 은 시·도 짧은 이름("경기" · "서울"), address 는 공고의 주소("경기도 과천시 별양동 7번지 일원").
 *
 * [1043] ① 주소의 꼬리("번지 일원" · "외 157필지" · 괄호)를 떼고 묻는다 — 못 찾음 348건의 대부분이 이 꼬리였다.
 *        ② 돌아온 주소의 시·도가 region 과 다르면 버린다. ③ retryNotfound 면 "못 찾음"으로 굳은 행도 다시 묻는다.
 */
export async function geocodeAndCache(
  region: string,
  name: string,
  query?: string,
  opts: { retryNotfound?: boolean } = {},
): Promise<Coord | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data: cached, error: cachedError } = await sb
    .from("complex_geocode")
    .select("lat, lng, status")
    .eq("region_name", region)
    .eq("complex_name", name)
    .maybeSingle();
  /* 캐시 조회 실패를 "캐시 없음"으로 흘려보내면 아래에서 다시 지오코딩을 하고,
     그 결과가 notfound 면 이미 잘 저장돼 있던 좌표를 notfound 로 덮어쓴다.
     못 읽었을 때는 쓰지 않는다 — 다음 요청이 다시 시도하면 된다. */
  if (cachedError) {
    logger.warn(
      `[geocode] ${region} ${name} 캐시 조회 실패(재지오코딩 안 함): ${pgErrorText(cachedError)}`,
    );
    return null;
  }
  if (cached) {
    if (cached.status === "ok" && cached.lat != null && cached.lng != null) {
      return { lat: Number(cached.lat), lng: Number(cached.lng) };
    }
    if (!opts.retryNotfound) return null;
  }
  if (!isNaverMapsRestConfigured()) return null;

  const cleaned = cleanLotAddress(query);
  const plan: GeocodeQuery[] = cleaned ? [{ query: cleaned, kind: "lot" }] : [];
  /* 읽을 지번이 없는 공고("… 공동주택용지 31BL")는 묻지 않고 못 찾음으로 적는다 */
  const attempt: GeocodeAttempt =
    plan.length > 0 ? await geocodeWithFallback(plan, expectedSidoKeys(region)) : { kind: "notfound" };
  if (attempt.kind === "error") {
    // 일시 오류를 notfound 로 굳히지 않는다 — 저장 없이 로그만
    logger.warn(`[geocode] ${region} ${name} 오류(캐시 저장 안 함): ${attempt.message}`);
    return null;
  }
  const coord = attempt.kind === "ok" ? attempt.coord : null;
  const { error: saveError } = await sb.from("complex_geocode").upsert(
    {
      region_name: region,
      complex_name: name,
      query: attempt.kind === "ok" ? attempt.query : (query || `${region} ${name}`).trim(),
      lat: coord?.lat ?? null,
      lng: coord?.lng ?? null,
      status: coord ? "ok" : "notfound",
      geocoded_at: new Date().toISOString(),
    },
    { onConflict: "region_name,complex_name" },
  );
  if (saveError) logger.warn(`[geocode] ${region} ${name} 저장 실패: ${pgErrorText(saveError)}`);
  return coord;
}

/**
 * 배치 대상들의 도로명 주소를 한 번에 읽는다(K-apt 대장 → complex_tx_stats).
 *
 * [971] 네이버 지오코더는 주소 전용이고, 그중에서도 **도로명 주소**를 가장 잘
 * 읽는다. 지금 못 찾는 177건의 상당수는 신축·택지라 실거래 지번이 "가-"·"BL-2"
 * 같은 블록 번호여서 애초에 주소가 아니다 — 그런 단지도 대장에는 도로명이 있다.
 * 조회가 실패하면 빈 맵을 돌려준다: 도로명은 "있으면 더 좋은" 후보일 뿐이라,
 * 못 읽었다고 백필을 멈출 이유가 없다.
 *
 * [1003] 여기도 단지명을 끊어 부른다. 한 라운드는 150~200단지라 예전 방식이면
 * URL 이 30KB 안팎 — 프록시가 자르면 "지번으로 진행" 경고만 남고 도로명은 영영
 * 붙지 않았다(조용히 나쁜 쪽으로만 흐르는 실패였다).
 */
async function loadRoadAddresses(
  sb: NonNullable<ReturnType<typeof getServiceSupabase>>,
  rows: { region_name: string; complex_name: string }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (rows.length === 0) return out;
  const byName = regionsByName(
    rows.map((r) => ({ region: r.region_name, name: r.complex_name })),
  );
  const want = new Set(rows.map((r) => coordKey(r.region_name, r.complex_name)));
  for (const namePart of chunk([...byName.keys()], NAME_IN_CHUNK)) {
    const regionPart = [...new Set(namePart.flatMap((n) => byName.get(n) ?? []))];
    let q = sb
      .from("complex_tx_stats")
      .select("region_name, complex_name, road_address")
      .in("complex_name", namePart)
      .not("road_address", "is", null)
      .limit(2000);
    if (regionPart.length <= REGION_IN_MAX) q = q.in("region_name", regionPart);
    const { data, error } = await q;
    if (error) {
      // 여기까지 모은 것만 들고 돌아간다 — 실패해도 백필은 지번으로 계속한다.
      logger.warn(
        `[geocode] 도로명 주소 조회 실패(지번으로 진행): ${pgErrorText(error, namePart.length)}`,
      );
      return out;
    }
    for (const r of (data as
      | { region_name: string; complex_name: string; road_address: string | null }[]
      | null) ?? []) {
      const k = coordKey(r.region_name, r.complex_name);
      if (want.has(k) && r.road_address) out.set(k, r.road_address);
    }
  }
  return out;
}

/**
 * 배치 백필(cron/관리자) — 아직 지오코딩 안 된 상위 거래량 단지 N개를 지오코딩·저장.
 * 네이버 API rate-limit 완충을 위해 호출 간 소폭 지연.
 *
 * 처리량 메모(2026-07-26): 예전엔 단지 1건마다 upsert 를 개별 왕복으로 보냈다.
 * Vercel(iad1) → Supabase 왕복이 건당 ~200ms 라 500건이면 저장에만 100초가 갔고,
 * 지오코딩 시간까지 더하면 maxDuration(300초)에 걸려 라운드가 중간에 잘렸다.
 * 이제 UPSERT_CHUNK 단위로 모아 보내고(왕복 500회 → 5회), 시간 예산을 넘기기 전에
 * 스스로 멈춰 지금까지 결과를 저장하고 정상 응답한다 — 잘리는 대신 이어달린다.
 */
const UPSERT_CHUNK = 100;
/** 라운드 자체 종료 기한 — maxDuration(300s)·curl(290s)보다 앞서 끊는다. */
const TIME_BUDGET_MS = 240_000;

export async function backfillGeocode(
  limit = 150,
): Promise<{
  processed: number;
  ok: number;
  /** [1043] ok 중 거래 원본 단서(도로명·진짜 지번)로 찾은 수 */
  hinted?: number;
  errors?: number;
  errorSample?: string;
  skipped?: boolean;
  /** 시간 예산으로 조기 종료했는가 (남은 대상은 다음 라운드가 이어서 처리) */
  budgetStopped?: boolean;
}> {
  const sb = getServiceSupabase();
  if (!sb) return { processed: 0, ok: 0, skipped: true };
  if (!isNaverMapsRestConfigured()) return { processed: 0, ok: 0, skipped: true };

  /* 대상 목록 조회가 실패했는데 []로 흘리면 processed:0 · ok:0 으로 "할 일이
     없었다"는 정상 응답이 되어, 크론 브리핑에는 백필이 잘 돌고 있는 것처럼 남는다. */
  /* [1043] v2 — 예전 줄(미시도 + 7일 지난 못 찾음)에 "규칙이 바뀌기 전에 못 찾은 행"을 더한다
     (supabase/migrations/20261006152844_1043_geocode_coverage_and_requeue.sql). */
  const { data, error: rpcError } = await sb.rpc("complexes_needing_geocode_v2", {
    p_limit: limit,
    p_retry_before: GEOCODE_RULES_SINCE,
  });
  if (rpcError) {
    throw new Error(`complexes_needing_geocode_v2 조회 실패: ${pgErrorText(rpcError)}`);
  }
  const rows =
    (data as
      | { region_name: string; complex_name: string; address: string | null; trade_count: number }[]
      | null) ?? [];

  const roadByKey = await loadRoadAddresses(sb, rows);

  let ok = 0;
  /* [1043] 거래 원본의 도로명·지번 단서로 찾은 수 — 첫 후보(집계 뷰 주소)로는 못 찾던 단지 */
  let hinted = 0;
  let errors = 0;
  let processed = 0;
  let budgetStopped = false;
  let errorSample: string | undefined;
  const startedAt = Date.now();
  let pending: Record<string, unknown>[] = [];

  const flush = async () => {
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];
    const { error } = await sb
      .from("complex_geocode")
      .upsert(batch, { onConflict: "region_name,complex_name" });
    if (error) {
      // 저장 실패는 조용히 넘기지 않는다 — 예전엔 upsert 오류를 아무도 안 봐서
      // "지오코딩은 성공했는데 좌표가 안 늘어나는" 현상의 원인이 안 보였다.
      errors += batch.length;
      errorSample ??= `저장 실패: ${pgErrorText(error, batch.length)}`;
      logger.warn(`[geocode] upsert ${batch.length}건 실패: ${pgErrorText(error)}`);
    }
  };

  for (const r of rows) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      budgetStopped = true;
      break;
    }
    processed += 1;
    /* 주소형 쿼리만(네이버 지오코더는 주소 전용). [971] 도로명(대장) → 시/도 보정 지번 → 원본 지번 순 — 구체적인 주소일수록
       다른 도시의 같은 이름 동네로 잘못 찍힐 여지가 줄어든다.
       [1043] ① 시·도를 알면 지번 앞에 붙인 후보를 더하고, 돌아온 주소의 시·도가 다르면 버린다.
              ② 그래도 없으면 거래 원본에서 도로명("지제동삭1로 41")·진짜 지번을 찾아 한 번 더 묻는다(loadTxHints). */
    const sido = regionSido(r.region_name);
    let allowed = expectedSidoKeys(sido);
    let attempt = await geocodeWithFallback(
      buildGeocodePlan({
        region: r.region_name,
        name: r.complex_name,
        address: r.address,
        roadAddress: roadByKey.get(coordKey(r.region_name, r.complex_name)),
        sido,
      }),
      allowed,
    );
    if (attempt.kind === "notfound") {
      const hints = await loadTxHints(sb, r.region_name, r.complex_name);
      const info = hints.regionCode ? regionSigunguByCode(hints.regionCode) : null;
      if (info) allowed = expectedSidoKeys(info.sido);
      const second = buildHintQueries({
        sido: info?.sido ?? sido,
        sigungu: info?.sigungu ?? null,
        roadName: hints.roadName,
        lotAddress: hints.lotAddress,
      });
      if (second.length > 0) {
        attempt = await geocodeWithFallback(second, allowed);
        if (attempt.kind === "ok") hinted += 1;
      }
    }
    if (attempt.kind === "error") {
      // 오류는 notfound 로 저장하지 않는다 — 다음 배치가 다시 시도한다
      errors += 1;
      if (!errorSample) errorSample = attempt.message; // 크론 로그·브리핑용 첫 사유
      logger.warn(
        `[geocode] ${r.region_name} ${r.complex_name} 오류(캐시 저장 안 함): ${attempt.message}`,
      );
      await new Promise((res) => setTimeout(res, 40));
      continue;
    }
    const coord = attempt.kind === "ok" ? attempt.coord : null;
    pending.push({
      region_name: r.region_name,
      complex_name: r.complex_name,
      query:
        attempt.kind === "ok"
          ? attempt.query
          : (r.address?.trim() || `${r.region_name} ${r.complex_name}`).trim(),
      lat: coord?.lat ?? null,
      lng: coord?.lng ?? null,
      status: coord ? "ok" : "notfound",
      trade_count: r.trade_count,
      geocoded_at: new Date().toISOString(),
    });
    if (coord) ok += 1;
    if (pending.length >= UPSERT_CHUNK) await flush();
    await new Promise((res) => setTimeout(res, 40));
  }
  await flush();
  return { processed, ok, hinted, errors, errorSample, budgetStopped };
}
