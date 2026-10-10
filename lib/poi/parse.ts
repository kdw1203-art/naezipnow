/**
 * [1053 · #96] 생활 인프라 표준데이터(학교 · 도시철도역) 응답 해석 — 순수(단위 시험 대상 · server-only 아님).
 *
 * 같은 표준데이터가 공공데이터포털에서 두 모양으로 나온다:
 *  · odcloud   api.odcloud.kr/api/15xxxxxx/v1/uddi:…
 *              { page, perPage, totalCount, currentCount, matchCount, data: [{ 열 이름: 값 }] }
 *              실패는 { code: -4, msg: "등록되지 않은 인증키 입니다." } 같은 모양.
 *  · 오픈API   api.data.go.kr/openapi/tn_pubr_…_api
 *              { response: { header: { resultCode, resultMsg },
 *                            body: { items: [...] | { item: [...] | {...} } | "", totalCount, numOfRows, pageNo } } }
 *              인증 실패는 type=json 이어도 XML(<OpenAPI_ServiceResponse> … <returnAuthMsg>)로 온다.
 * 열 이름도 한글(위도 · 역위도 · 역사명 · 노선명 · 학교명 · 학교급구분 …)과 영문(lat · LATITUDE · STATN_NM · LINE_NM …)이
 * 섞인다 — 열 이름을 정규화(소문자 · 공백/밑줄/괄호 제거)해 별칭 목록으로 고른다.
 *
 * 여기서 정하지 않는 것: 저장(lib/poi/store.ts) · 크론 보호(app/api/cron/poi-ingest).
 */

export type PoiKind = "schools" | "stations";
export type PoiRow = Record<string, unknown>;
export type PoiFlavor = "odcloud" | "openapi";

/* ── 열 고르기 ─────────────────────────────────────────────────────────── */

export function normKey(k: string): string {
  return k.normalize("NFC").toLowerCase().replace(/[\s_\-()[\]./]/g, "");
}

function indexRow(row: PoiRow): Map<string, unknown> {
  const m = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) {
    const nk = normKey(k);
    if (!m.has(nk)) m.set(nk, v);
  }
  return m;
}

function textOf(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "object") return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s ? s : null;
}

function numOf(v: unknown): number | null {
  const s = textOf(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function pickIn(idx: Map<string, unknown>, aliases: readonly string[]): unknown {
  for (const a of aliases) {
    const v = idx.get(a);
    if (textOf(v) !== null) return v;
  }
  return undefined;
}

/* 별칭은 normKey 를 거친 모양으로 적는다(소문자 · 밑줄 없음) */
const LAT_KEYS = ["위도", "역위도", "학교위도", "lat", "latitude", "la", "wgs84lat"] as const;
const LNG_KEYS = ["경도", "역경도", "학교경도", "lng", "lon", "long", "longitude", "lo", "wgs84lng", "wgs84lon"] as const;

const STATION_KEYS = {
  name: ["역사명", "역명", "역이름", "역사이름", "statnnm", "stationnm", "stationname", "sttnnm", "stnnm", "stnname"],
  line: ["노선명", "호선명", "호선", "선명", "linenm", "linename", "line", "routenm", "routename", "lnnm"],
  id: ["역사id", "역사아이디", "역번호", "역코드", "역사코드", "statnid", "stationid", "stationcd", "sttnid", "sttnno", "stnid", "stncd"],
  operator: ["운영기관명", "운영기관", "operinsttnm", "operatornm", "operator", "opernm"],
  address: ["역사도로명주소", "소재지도로명주소", "도로명주소", "rdnmadr", "sttnrdnmadr", "roadaddress", "역사지번주소", "소재지지번주소", "lnmadr"],
} as const;

const SCHOOL_KEYS = {
  name: ["학교명", "schoolnm", "schulnm", "schoolname"],
  id: ["학교id", "학교아이디", "학교코드", "표준학교코드", "schoolid", "schoolcode", "sdschulcode", "schulcode"],
  category: ["학교급구분", "학교급", "학교종류명", "schoolse", "schoolkind", "schoollevel", "schulkndscnm"],
  sido: ["시도교육청명", "시도명", "edcsportnm", "atptofcdcscnm", "ctprvnnm", "sido"],
  address: ["소재지도로명주소", "도로명주소", "rdnmadr", "roadaddress", "소재지지번주소", "lnmadr"],
} as const;

/** 별칭에 없으면 열 이름에 "위도"/"latitude" · "경도"/"longitude" 가 든 첫 열(예: "위도(WGS84)") */
function coordFallback(idx: Map<string, unknown>, ko: string, en: string): unknown {
  for (const [k, v] of idx) {
    if ((k.includes(ko) || k.includes(en)) && numOf(v) !== null) return v;
  }
  return undefined;
}

export function isKoreaLatLng(lat: number, lng: number): boolean {
  return lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
}

export type PoiSkipReason = "no-coord" | "out-of-range" | "no-name";

export type StationRecord = {
  source_key: string;
  name: string;
  line: string | null;
  operator: string | null;
  address: string | null;
  lat: number;
  lng: number;
};
export type SchoolRecord = {
  source_key: string;
  name: string;
  category: string | null;
  sido: string | null;
  address: string | null;
  lat: number;
  lng: number;
};

export type NormalizedPoi<K extends PoiKind> =
  | { ok: true; record: K extends "stations" ? StationRecord : SchoolRecord; swapped: boolean }
  | { ok: false; reason: PoiSkipReason };

/**
 * 표준데이터 한 줄 → 저장할 행. 좌표가 없거나 한국 밖이면 · 이름이 없으면 버린다(이유를 돌려준다).
 * 위도·경도 열이 뒤바뀐 줄(위도 127 · 경도 37)은 범위가 겹치지 않으므로 바로잡고 swapped 로 알린다.
 */
export function normalizePoiRow<K extends PoiKind>(kind: K, row: PoiRow): NormalizedPoi<K> {
  const idx = indexRow(row);
  let lat = numOf(pickIn(idx, LAT_KEYS) ?? coordFallback(idx, "위도", "latitude"));
  let lng = numOf(pickIn(idx, LNG_KEYS) ?? coordFallback(idx, "경도", "longitude"));
  if (lat === null || lng === null || (lat === 0 && lng === 0)) return { ok: false, reason: "no-coord" };
  let swapped = false;
  if (!isKoreaLatLng(lat, lng) && isKoreaLatLng(lng, lat)) {
    [lat, lng] = [lng, lat];
    swapped = true;
  }
  if (!isKoreaLatLng(lat, lng)) return { ok: false, reason: "out-of-range" };
  const at = `${lat.toFixed(4)},${lng.toFixed(4)}`;

  if (kind === "stations") {
    const name = textOf(pickIn(idx, STATION_KEYS.name));
    if (!name) return { ok: false, reason: "no-name" };
    const line = textOf(pickIn(idx, STATION_KEYS.line));
    const id = textOf(pickIn(idx, STATION_KEYS.id));
    const operator = textOf(pickIn(idx, STATION_KEYS.operator));
    /* 역번호는 운영기관·노선마다 따로 매겨진다(부산 1호선 101 ≠ 서울 1호선 101) — 셋을 함께 열쇠로 */
    const source_key = id ? `stn:${operator ?? ""}|${line ?? ""}|${id}` : `stn:${name}|${line ?? ""}|${at}`;
    const record: StationRecord = {
      source_key,
      name,
      line,
      operator,
      address: textOf(pickIn(idx, STATION_KEYS.address)),
      lat,
      lng,
    };
    return { ok: true, record, swapped } as NormalizedPoi<K>;
  }

  const name = textOf(pickIn(idx, SCHOOL_KEYS.name));
  if (!name) return { ok: false, reason: "no-name" };
  const id = textOf(pickIn(idx, SCHOOL_KEYS.id));
  const address = textOf(pickIn(idx, SCHOOL_KEYS.address));
  /* 학교 이름은 전국에서 겹친다("중앙초등학교") — ID 가 없으면 좌표를 열쇠에 넣는다 */
  const source_key = id ? `sch:${id}` : `sch:${name}|${at}`;
  const record: SchoolRecord = {
    source_key,
    name,
    category: textOf(pickIn(idx, SCHOOL_KEYS.category)),
    sido: (textOf(pickIn(idx, SCHOOL_KEYS.sido)) ?? address?.split(" ")[0] ?? null)?.slice(0, 20) ?? null,
    address,
    lat,
    lng,
  };
  return { ok: true, record, swapped } as NormalizedPoi<K>;
}

/* ── 응답 모양 ─────────────────────────────────────────────────────────── */

export type PoiPage = {
  flavor: PoiFlavor | null;
  rows: PoiRow[];
  totalCount: number | null;
  /** 원천이 돌려준 실패(인증키 · 형식 등). 있으면 rows 는 비어 있다 */
  error: string | null;
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const rowsOf = (v: unknown): PoiRow[] => (Array.isArray(v) ? v.filter(isObj) : isObj(v) ? [v] : []);

/** 오픈API 의 "자료 없음"(마지막 쪽을 넘긴 요청) — 실패가 아니라 0줄 */
const OPENAPI_OK = new Set(["00", "0", "000", "INFO-000"]);
const OPENAPI_NODATA = new Set(["03", "INFO-200"]);

/** 응답 본문(문자열) → 줄 목록 · 전체 건수 · 실패 이유 */
export function parsePoiPayload(text: string): PoiPage {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    const msg =
      text.match(/<returnAuthMsg>([^<]*)</)?.[1] ??
      text.match(/<resultMsg>([^<]*)</)?.[1] ??
      text.match(/<errMsg>([^<]*)</)?.[1] ??
      text.replace(/\s+/g, " ").trim().slice(0, 80);
    return { flavor: null, rows: [], totalCount: null, error: `JSON 아님: ${msg || "빈 응답"}` };
  }
  return parsePoiJson(json);
}

export function parsePoiJson(json: unknown): PoiPage {
  if (!isObj(json)) return { flavor: null, rows: [], totalCount: null, error: "응답 형식 아님" };

  /* odcloud */
  if (Array.isArray(json.data)) {
    return {
      flavor: "odcloud",
      rows: rowsOf(json.data),
      totalCount: numOf(json.totalCount) ?? numOf(json.matchCount),
      error: null,
    };
  }
  if ("code" in json && "msg" in json && !("response" in json)) {
    return { flavor: "odcloud", rows: [], totalCount: null, error: `odcloud ${String(json.code)} ${String(json.msg)}`.slice(0, 160) };
  }

  /* 오픈API tn_pubr_* — response 감싸개가 없는 변형({ header, body })도 받는다 */
  const resp = isObj(json.response) ? json.response : isObj(json.body) ? json : null;
  if (resp) {
    const header = isObj(resp.header) ? resp.header : {};
    const code = textOf(header.resultCode);
    if (code && OPENAPI_NODATA.has(code)) return { flavor: "openapi", rows: [], totalCount: 0, error: null };
    if (code && !OPENAPI_OK.has(code)) {
      return { flavor: "openapi", rows: [], totalCount: null, error: `openapi ${code} ${textOf(header.resultMsg) ?? ""}`.trim().slice(0, 160) };
    }
    const body = isObj(resp.body) ? resp.body : {};
    const items = body.items;
    const rows = Array.isArray(items) ? rowsOf(items) : isObj(items) ? rowsOf(items.item) : [];
    return { flavor: "openapi", rows, totalCount: numOf(body.totalCount), error: null };
  }

  return { flavor: null, rows: [], totalCount: null, error: "알 수 없는 응답 형식(data · response.body.items 없음)" };
}

/* ── 요청 주소 ─────────────────────────────────────────────────────────── */

/** 인코딩된 키(%2B …)를 넣어도 한 번만 인코딩되게 — URLSearchParams 가 다시 인코딩한다 */
export function decodeServiceKey(key: string): string {
  const k = key.trim();
  if (!/%[0-9A-Fa-f]{2}/.test(k)) return k;
  try {
    return decodeURIComponent(k);
  } catch {
    return k;
  }
}

const ALLOWED_HOSTS = new Set(["api.odcloud.kr", "api.data.go.kr", "apis.data.go.kr"]);

/**
 * env(POI_*_API_PATH) → 원천 주소. 받는 모양:
 *   /api/15021148/v1/uddi:…                     → https://api.odcloud.kr/api/…            (odcloud)
 *   /openapi/tn_pubr_public_…_api · tn_pubr_…   → https://api.data.go.kr/openapi/…       (오픈API)
 *   https://api.odcloud.kr/… · http(s)://api.data.go.kr/openapi/…  (전체 주소 — 위 두 곳만)
 * 그 밖이면 null(설정 오류).
 */
export function poiSourceBase(apiPath: string): { url: URL; flavor: PoiFlavor } | null {
  const p = apiPath.trim();
  if (!p) return null;
  let url: URL;
  try {
    if (/^https?:\/\//i.test(p)) url = new URL(p);
    else if (p.startsWith("/api/")) url = new URL(`https://api.odcloud.kr${p}`);
    else if (p.startsWith("/openapi/")) url = new URL(`https://api.data.go.kr${p}`);
    else if (/^tn_pubr_/i.test(p)) url = new URL(`https://api.data.go.kr/openapi/${p}`);
    else return null;
  } catch {
    return null;
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) return null;
  url.protocol = "https:";
  const flavor: PoiFlavor = url.hostname === "api.odcloud.kr" ? "odcloud" : "openapi";
  return { url, flavor };
}

export function poiPageUrl(base: { url: URL; flavor: PoiFlavor }, serviceKey: string, page: number, perPage: number): string {
  const u = new URL(base.url.toString());
  u.searchParams.set("serviceKey", decodeServiceKey(serviceKey));
  if (base.flavor === "odcloud") {
    u.searchParams.set("page", String(page));
    u.searchParams.set("perPage", String(perPage));
    u.searchParams.set("returnType", "JSON");
  } else {
    u.searchParams.set("pageNo", String(page));
    u.searchParams.set("numOfRows", String(perPage));
    u.searchParams.set("type", "json");
  }
  return u.toString();
}

/* ── 쪽 넘기기 ─────────────────────────────────────────────────────────── */

export type PageStep = "next" | "done" | "page-cap" | "repeated";

/**
 * 다음 쪽을 물을지. 끝: 0줄 · 전체 건수에 닿음 · (건수를 모를 때) 요청보다 적게 옴.
 * 안전장치: 쪽 상한(page-cap) · 앞 쪽과 첫 줄이 같으면(쪽 번호를 무시하는 원천) repeated — 같은 줄을 끝없이 받지 않는다.
 * 건수를 알면 요청보다 적게 와도 이어 묻는다(원천이 한 쪽 크기를 줄여 주는 경우).
 */
export function nextPageStep(s: {
  page: number;
  perPage: number;
  got: number;
  fetchedSoFar: number;
  totalCount: number | null;
  maxPages: number;
  firstRowSig: string | null;
  prevFirstRowSig: string | null;
}): PageStep {
  if (s.got === 0) return "done";
  if (s.prevFirstRowSig !== null && s.firstRowSig === s.prevFirstRowSig) return "repeated";
  if (s.totalCount !== null) {
    if (s.fetchedSoFar >= s.totalCount) return "done";
  } else if (s.got < s.perPage) {
    return "done";
  }
  if (s.page >= s.maxPages) return "page-cap";
  return "next";
}

export function rowSignature(row: PoiRow | undefined): string | null {
  if (!row) return null;
  try {
    return JSON.stringify(row).slice(0, 400);
  } catch {
    return null;
  }
}

/* ── 역 묶기(같은 역의 여러 노선) ─────────────────────────────────────── */

export type StationRow = { name: unknown; line?: unknown; lat: unknown; lng: unknown };
export type MergedStation = { name: string; line: string | null; lat: number; lng: number; distanceM: number };

function distM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.sqrt(a)));
}

/** 같은 역인지 가르는 열쇠 — 공백 · 끝의 "역"을 뗀다("강남역" = "강남") */
export function stationKey(name: string): string {
  const k = name.replace(/\s+/g, "").replace(/역$/, "");
  return k || name.trim();
}

export function stationDisplayName(name: string): string {
  const k = stationKey(name);
  return /역$/.test(k) ? k : `${k}역`;
}

const lineCollator = new Intl.Collator("ko", { numeric: true });

/**
 * 표준데이터는 노선마다 한 줄(강남 2호선 · 강남 신분당선)이다 — 같은 이름은 하나로 묶고 노선을 모은다.
 * 좌표 · 거리는 가장 가까운 줄의 것(직선 거리). 반경 밖 · 좌표 없음은 뺀다. 가까운 순 최대 limit.
 * 노선은 "2호선·신분당선"처럼 가운뎃점으로 잇는다(숫자 노선 먼저).
 */
export function mergeStationRows(
  rows: readonly StationRow[],
  center: { lat: number; lng: number },
  radiusM: number,
  limit = 6,
): MergedStation[] {
  const groups = new Map<string, { name: string; lat: number; lng: number; distanceM: number; lines: Set<string> }>();
  for (const r of rows) {
    const name = textOf(r.name);
    const lat = numOf(r.lat);
    const lng = numOf(r.lng);
    if (!name || lat === null || lng === null) continue;
    const d = distM(center.lat, center.lng, lat, lng);
    if (d > radiusM) continue;
    const key = stationKey(name);
    const line = textOf(r.line);
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { name: stationDisplayName(name), lat, lng, distanceM: d, lines: new Set(line ? [line] : []) });
      continue;
    }
    if (line) g.lines.add(line);
    if (d < g.distanceM) Object.assign(g, { lat, lng, distanceM: d });
  }
  return [...groups.values()]
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, Math.max(0, limit))
    .map((g) => ({
      name: g.name,
      line: g.lines.size ? [...g.lines].sort(lineCollator.compare).join("·") : null,
      lat: g.lat,
      lng: g.lng,
      distanceM: g.distanceM,
    }));
}

/** 화면 이름표 — "강남역 · 2호선·신분당선" (노선을 모르면 역 이름만) */
export function stationLabel(s: { name: string; line: string | null }): string {
  return s.line ? `${s.name} · ${s.line}` : s.name;
}
