import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import {
  mergeStationRows,
  nextPageStep,
  normalizePoiRow,
  parsePoiPayload,
  poiPageUrl,
  poiSourceBase,
  rowSignature,
  type PoiFlavor,
  type PoiKind,
  type PoiPage,
  type PoiSkipReason,
} from "@/lib/poi/parse";

/* ============================================================
   [#96] 생활 인프라 — 도보권 학교·도시철도역.
   데이터: 공공데이터포털 표준데이터 2종(공공누리 1유형 — 출처 표시 후 자유 이용)
     · 전국초중등학교위치표준데이터  → poi_schools
     · 전국도시철도역사정보표준데이터 → poi_stations
   인제스트는 원천 경로를 환경변수로 받는다(UDDI 가 업로드마다 바뀌는
   구조라 코드에 박지 않는다). 두 모양 다 받는다(응답 해석 · 열 이름 별칭은 lib/poi/parse.ts):
     POI_SCHOOLS_API_PATH  예: /api/15021148/v1/uddi:xxxxxxxx          (odcloud)
                           또는 /openapi/tn_pubr_public_…_api           (api.data.go.kr 오픈API)
     POI_STATIONS_API_PATH 예: /api/15041335/v1/uddi:xxxxxxxx  또는 /openapi/tn_pubr_…_api
     (전체 주소 https://api.odcloud.kr/… · https://api.data.go.kr/openapi/… 도 된다)
   serviceKey 는 청약 인제스트와 같은 DATA_GO_KR_SERVICE_KEY(디코딩 키)를 재사용한다 —
   인코딩 키를 넣어도 한 번 풀어서 쓴다.
   ============================================================ */

export type NearbySchool = {
  name: string;
  category: string | null;
  distanceM: number;
};
export type NearbyStation = {
  name: string;
  line: string | null;
  distanceM: number;
};
export type NearbyPoi = {
  schools: NearbySchool[];
  stations: NearbyStation[];
};

const SCHOOL_RADIUS_M = 1200;
const STATION_RADIUS_M = 1500;

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/**
 * 단지 좌표 기준 도보권 POI. 데이터 미적재(테이블 비어 있음)면 둘 다 빈 배열 —
 * 호출부는 섹션을 그리지 않는다. 조회 실패는 throw (없음과 구분).
 */
export async function getNearbyPoi(lat: number, lng: number): Promise<NearbyPoi> {
  const sb = getServiceSupabase();
  if (!sb) return { schools: [], stations: [] };

  // bbox 필터 — 1도 위도 ≈ 111km, 경도는 위도 보정
  const latPad = SCHOOL_RADIUS_M / 111_000 + 0.003;
  const lngPad = latPad / Math.max(0.2, Math.cos((lat * Math.PI) / 180));

  const [schoolsR, stationsR] = await Promise.all([
    sb
      .from("poi_schools")
      .select("name, category, lat, lng")
      .gte("lat", lat - latPad)
      .lte("lat", lat + latPad)
      .gte("lng", lng - lngPad)
      .lte("lng", lng + lngPad)
      .limit(300),
    sb
      .from("poi_stations")
      .select("name, line, lat, lng")
      .gte("lat", lat - latPad)
      .lte("lat", lat + latPad)
      .gte("lng", lng - lngPad)
      .lte("lng", lng + lngPad)
      .limit(120),
  ]);
  if (schoolsR.error) throw new Error(`poi_schools 조회 실패: ${schoolsR.error.message}`);
  if (stationsR.error) throw new Error(`poi_stations 조회 실패: ${stationsR.error.message}`);

  const schools = (schoolsR.data ?? [])
    .map((r) => ({
      name: String(r.name),
      category: r.category ? String(r.category) : null,
      distanceM: haversineM(lat, lng, Number(r.lat), Number(r.lng)),
    }))
    .filter((s) => s.distanceM <= SCHOOL_RADIUS_M)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 6);

  /* [1053] 표준데이터는 노선마다 한 줄 — 같은 역은 하나로 묶고 노선을 모은다("강남역 · 2호선·신분당선") */
  const stations = mergeStationRows(stationsR.data ?? [], { lat, lng }, STATION_RADIUS_M, 4).map((s) => ({
    name: s.name,
    line: s.line,
    distanceM: s.distanceM,
  }));

  return { schools, stations };
}

/* ── 인제스트 ────────────────────────────────────────────────────────── */

export type PoiIngestResult = {
  configured: boolean;
  reason?: string;
  /** 원천 모양 — odcloud(api.odcloud.kr) · openapi(api.data.go.kr/openapi/tn_pubr_*) */
  source?: PoiFlavor;
  /** 원천에서 받은 줄 수 */
  fetched: number;
  /** 저장하지 않은 줄 수(아래 이유별 합) */
  skipped: number;
  skippedBy: Record<PoiSkipReason | "duplicate", number>;
  /** 위도·경도 열이 뒤바뀌어 바로잡은 줄 수(저장됨) */
  swapped: number;
  upserted: number;
  pages: number;
  /** 원천이 알려 준 전체 건수(모르면 null) */
  totalCount: number | null;
  /** 끝까지 못 읽었으면 그 이유 — page-cap(쪽 상한) · repeated(같은 쪽 반복) · time-budget(시간 상한) */
  stoppedBy: "page-cap" | "repeated" | "time-budget" | null;
  /** 첫 줄의 열 이름(최대 20) — 저장 0건일 때 열 이름이 맞는지 보는 단서 */
  columns: string[];
};

const PAGE_SIZE = 1000;
const MAX_PAGES = 40; // 학교 ~1.2만 줄 = 13쪽 · 역 ~1천 줄 = 1~2쪽
const PAGE_TIMEOUT_MS = 20_000;
/* 크론 함수 상한 300초 안에서 두 종류가 차례로 돈다 — 한 종류에 120초 */
const KIND_BUDGET_MS = 120_000;
const UPSERT_CHUNK = 500;

function blankCounts(): Omit<PoiIngestResult, "configured" | "reason" | "source"> {
  return {
    fetched: 0,
    skipped: 0,
    skippedBy: { "no-coord": 0, "out-of-range": 0, "no-name": 0, duplicate: 0 },
    swapped: 0,
    upserted: 0,
    pages: 0,
    totalCount: null,
    stoppedBy: null,
    columns: [],
  };
}

function emptyResult(reason: string): PoiIngestResult {
  return { configured: false, reason, ...blankCounts() };
}

/** 한 쪽 받기 — 시간 상한 · 일시 장애(네트워크 · 5xx · 429)는 한 번 더 */
async function fetchPoiPage(url: string): Promise<PoiPage> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        cache: "no-store",
      });
      const text = await res.text();
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} ${text.replace(/\s+/g, " ").slice(0, 120)}`);
        if (res.status >= 500 || res.status === 429) {
          lastErr = err;
          continue;
        }
        throw err;
      }
      return parsePoiPayload(text);
    } catch (e) {
      lastErr = e;
      const transient = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError" || e instanceof TypeError);
      if (!transient) throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function ingestPoi(kind: PoiKind): Promise<PoiIngestResult> {
  const sb = getServiceSupabase();
  const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY?.trim();
  const apiPath =
    kind === "schools"
      ? process.env.POI_SCHOOLS_API_PATH?.trim()
      : process.env.POI_STATIONS_API_PATH?.trim();
  if (!sb) return emptyResult("no-db");
  if (!serviceKey) return emptyResult("no-key");
  if (!apiPath) {
    // 오너 패킷 ⑧ — 표준데이터 "오픈API 상세"의 요청 주소(odcloud /api/… 또는 /openapi/tn_pubr_…)를 env 로 등록해야 켜진다
    return emptyResult("no-path");
  }
  const base = poiSourceBase(apiPath);
  if (!base) return emptyResult("bad-path");

  const table = kind === "schools" ? "poi_schools" : "poi_stations";
  const out: PoiIngestResult = { configured: true, source: base.flavor, ...blankCounts() };
  const seen = new Set<string>();
  const startedAt = Date.now();
  let prevSig: string | null = null;

  for (let page = 1; ; page += 1) {
    if (Date.now() - startedAt > KIND_BUDGET_MS) {
      out.stoppedBy = "time-budget";
      break;
    }
    const url = poiPageUrl(base, serviceKey, page, PAGE_SIZE);
    let got: PoiPage;
    try {
      got = await fetchPoiPage(url);
    } catch (e) {
      /* 주소에 serviceKey 가 들어 있다 — 메시지에 주소를 싣지 않는다 */
      throw new Error(`${table} ${base.flavor} ${page}쪽 받기 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (got.error) throw new Error(`${table} ${base.flavor} ${page}쪽: ${got.error}`);
    out.pages = page;
    if (got.totalCount !== null) out.totalCount = got.totalCount;
    if (page === 1 && got.rows[0]) out.columns = Object.keys(got.rows[0]).slice(0, 20);
    out.fetched += got.rows.length;

    const batch: Array<Record<string, unknown>> = [];
    const now = new Date().toISOString();
    for (const r of got.rows) {
      const n = normalizePoiRow(kind, r);
      if (!n.ok) {
        out.skippedBy[n.reason] += 1;
        continue;
      }
      /* 같은 열쇠가 한 upsert 에 두 번 들어가면 Postgres 가 통째로 거절한다 — 먼저 온 줄만 */
      if (seen.has(n.record.source_key)) {
        out.skippedBy.duplicate += 1;
        continue;
      }
      seen.add(n.record.source_key);
      if (n.swapped) out.swapped += 1;
      batch.push({ ...n.record, updated_at: now });
    }
    for (let i = 0; i < batch.length; i += UPSERT_CHUNK) {
      const chunk = batch.slice(i, i + UPSERT_CHUNK);
      const { error } = await sb.from(table).upsert(chunk, { onConflict: "source_key" });
      if (error) {
        logger.error(`[poi] ${table} upsert 실패 (${page}쪽 ${i}~)`, error);
        throw new Error(`${table} upsert 실패(${page}쪽 · 앞서 ${out.upserted}건 저장): ${error.message}`);
      }
      out.upserted += chunk.length;
    }

    const sig = rowSignature(got.rows[0]);
    const step = nextPageStep({
      page,
      perPage: PAGE_SIZE,
      got: got.rows.length,
      fetchedSoFar: out.fetched,
      totalCount: out.totalCount,
      maxPages: MAX_PAGES,
      firstRowSig: sig,
      prevFirstRowSig: prevSig,
    });
    prevSig = sig;
    if (step === "next") continue;
    if (step !== "done") out.stoppedBy = step;
    break;
  }

  out.skipped = Object.values(out.skippedBy).reduce((a, b) => a + b, 0);
  return out;
}

/** 크론 기록 한 줄 — 받은 수 · 뺀 수(이유별) · 저장 수 · 쪽 · 끊긴 이유 */
export function poiIngestSummary(r: PoiIngestResult): string {
  if (!r.configured) return r.reason ?? "미구성";
  const by = r.skippedBy;
  const skippedDetail = r.skipped
    ? ` (좌표없음 ${by["no-coord"]} · 범위밖 ${by["out-of-range"]} · 이름없음 ${by["no-name"]} · 중복 ${by.duplicate})`
    : "";
  return [
    `원천=${r.source ?? "?"}`,
    `조회=${r.fetched}${r.totalCount !== null ? `/${r.totalCount}` : ""}`,
    `제외=${r.skipped}${skippedDetail}`,
    `업서트=${r.upserted}`,
    `페이지=${r.pages}`,
    ...(r.swapped ? [`위경도뒤바뀜=${r.swapped}`] : []),
    ...(r.stoppedBy ? [`중단=${r.stoppedBy}`] : []),
    ...(r.fetched > 0 && r.upserted === 0 ? [`열=${r.columns.join(",")}`] : []),
  ].join(" ");
}
