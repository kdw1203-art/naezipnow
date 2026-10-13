/* [1064] 레일포털(철도산업정보센터 KRIC) OpenAPI — 순수 규칙. 서버 전용 import 없음(단위 시험 대상).
 *
 * 승인받은 것(소유자 메일 2026-10-12 · 사용기간 2026.10.12~2027.10.12):
 *   trainUseInfo/subwayTimetable     열차별 운행시각표
 *   trainUseInfo/subwayRouteInfo     도시철도 전체노선정보
 *   convenientInfo/stationTransferInfo  역사별 환승정보
 * 제공 범위: **도시·광역철도만** — 일반역·KTX 역은 들어 있지 않다(메일 명시). 화면 문구도 그렇게 적는다.
 * 요청 예의: 서비스별 횟수 제한은 없으나 "1일 1회 GET 또는 배치"를 요청받았다 — 크론은 하루 한 번, 역 시간표는
 * 돌아가며 조금씩(lib/rail/store 의 조각 크기) 받는다. 매크로·반복 호출 금지.
 *
 * 응답 모양을 코드에 박지 않는 이유: 공개된 규격 문서가 로그인·첨부파일 뒤에 있어 열 이름을 확정할 수 없다.
 * 그래서 (1) 어떤 깊이에 있든 **객체 배열 하나**를 찾아 줄로 삼고, (2) 열 이름은 별칭 표로 읽고,
 * (3) 못 읽은 열 이름은 그대로 관리 화면에 보여 준다(= 처음 한 번 사람이 눈으로 맞춘다).
 */

export const KRIC_BASE = "https://openapi.kric.go.kr/openapi";

export type KricOperation =
  | { service: "trainUseInfo"; operation: "subwayTimetable" }
  | { service: "trainUseInfo"; operation: "subwayRouteInfo" }
  | { service: "convenientInfo"; operation: "stationTransferInfo" };

/** 요청 주소 — serviceKey 는 그대로 싣는다(값을 로그·오류 메시지에 넣지 않는 책임은 호출부). */
export function kricUrl(op: KricOperation, serviceKey: string, params: Record<string, string> = {}): string {
  const u = new URL(`${KRIC_BASE}/${op.service}/${op.operation}`);
  u.searchParams.set("serviceKey", serviceKey);
  u.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return u.toString();
}

/** 주소에서 키를 가린 꼴 — 오류 메시지·로그용 */
export function redactUrl(url: string): string {
  return url.replace(/serviceKey=[^&]*/i, "serviceKey=***");
}

export type KricPage = {
  rows: Array<Record<string, unknown>>;
  /** 공급자가 준 결과 코드(있으면) — "00" 이 성공 */
  code: string | null;
  message: string | null;
  /** 첫 줄의 열 이름 — 관리 화면이 보여 준다(별칭 표를 맞추는 근거) */
  columns: string[];
};

const CODE_KEYS = ["resultCode", "result_code", "rtCd", "code", "retCode", "returnCode", "status"];
const MSG_KEYS = ["resultMsg", "result_msg", "message", "msg", "errMsg", "returnAuthMsg"];

function firstString(obj: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

/** 어느 깊이에 있든 "객체들의 배열" 가운데 가장 큰 것을 줄 묶음으로 본다(깊이 6까지). */
function deepestRows(value: unknown, depth = 0): Array<Record<string, unknown>> {
  if (depth > 6 || !value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    const objs = value.filter((v) => v && typeof v === "object" && !Array.isArray(v)) as Array<Record<string, unknown>>;
    if (objs.length > 0) return objs;
    return [];
  }
  let best: Array<Record<string, unknown>> = [];
  for (const v of Object.values(value as Record<string, unknown>)) {
    const got = deepestRows(v, depth + 1);
    if (got.length > best.length) best = got;
  }
  return best;
}

/** 응답 JSON → 줄·결과 코드. 문자열(JSON 본문)도 받는다. */
export function parseKricPayload(payload: unknown): KricPage {
  let json: unknown = payload;
  if (typeof payload === "string") {
    try {
      json = JSON.parse(payload);
    } catch {
      return { rows: [], code: null, message: payload.slice(0, 160), columns: [] };
    }
  }
  const rows = deepestRows(json);
  let code: string | null = null;
  let message: string | null = null;
  if (json && typeof json === "object" && !Array.isArray(json)) {
    const top = json as Record<string, unknown>;
    code = firstString(top, CODE_KEYS);
    message = firstString(top, MSG_KEYS);
    for (const v of Object.values(top)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        code = code ?? firstString(v as Record<string, unknown>, CODE_KEYS);
        message = message ?? firstString(v as Record<string, unknown>, MSG_KEYS);
      }
    }
  }
  return { rows, code, message, columns: rows[0] ? Object.keys(rows[0]).slice(0, 24) : [] };
}

/** 성공 판정 — 코드가 없으면 줄 수로 본다(공급자마다 코드 유무가 다르다) */
export function isKricOk(page: KricPage): boolean {
  if (page.code === null) return page.rows.length > 0;
  return page.code === "00" || page.code === "0" || /^success$/i.test(page.code);
}

/* ── 열 이름 별칭 ─────────────────────────────────────────────────────────── */

const ALIAS = {
  oprCd: ["railOprIsttCd", "operIsttCd", "oprIsttCd", "railOprIsttNm"],
  lineCd: ["lnCd", "lineCd", "routeCd", "lnNm"],
  lineNm: ["lnNm", "lineNm", "routeNm", "lnCdNm"],
  stinCd: ["stinCd", "statnCd", "stationCd", "stinCdNm"],
  stinNm: ["stinNm", "statnNm", "stationNm", "stinNmKor", "stnKrNm"],
  lat: ["stinLat", "lat", "latitude", "yCrdnt", "ycrd", "wgs84Lat", "gpsY"],
  lng: ["stinLot", "lon", "lng", "longitude", "xCrdnt", "xcrd", "wgs84Lon", "gpsX"],
  order: ["stinConsOrdr", "stinOrdr", "ordr", "seq", "stinSeq"],
  transferLine: ["trnsitLnCd", "transferLnCd", "trnsitLnNm", "transferLineNm", "lnCd"],
  trainNo: ["trnNo", "trainNo"],
  dayCd: ["dayCd", "weekTag", "dayNm"],
  arrive: ["arvTm", "arriveTm", "arrTime"],
  depart: ["dptTm", "departTm", "depTime"],
} as const;

function pick(row: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function num(row: Record<string, unknown>, keys: readonly string[]): number | null {
  const s = pick(row, keys);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type RailStation = {
  oprCd: string | null;
  lineCd: string | null;
  lineNm: string | null;
  stinCd: string;
  stinNm: string | null;
  lat: number | null;
  lng: number | null;
  order: number | null;
};

/** 노선정보 한 줄 → 역. 역 코드가 없으면 버린다(키가 없으면 아무 데도 못 잇는다). */
export function normalizeStationRow(row: Record<string, unknown>): RailStation | null {
  const stinCd = pick(row, ALIAS.stinCd);
  if (!stinCd) return null;
  const lat = num(row, ALIAS.lat);
  const lng = num(row, ALIAS.lng);
  /* 한국 영역 밖 좌표는 버린다(0,0 이나 자리바꿈을 그대로 지도에 올리지 않는다) */
  const okLat = lat !== null && lat >= 33 && lat <= 39;
  const okLng = lng !== null && lng >= 124 && lng <= 132;
  return {
    oprCd: pick(row, ALIAS.oprCd),
    lineCd: pick(row, ALIAS.lineCd),
    lineNm: pick(row, ALIAS.lineNm),
    stinCd,
    stinNm: pick(row, ALIAS.stinNm),
    lat: okLat && okLng ? lat : null,
    lng: okLat && okLng ? lng : null,
    order: num(row, ALIAS.order),
  };
}

export type RailTransfer = { stinCd: string; stinNm: string | null; lines: string[] };

/** 환승정보 줄 묶음 → 역마다 환승 노선 이름 목록(중복 제거 · 빈 값 제외) */
export function normalizeTransfers(rows: ReadonlyArray<Record<string, unknown>>): RailTransfer[] {
  const byStation = new Map<string, RailTransfer>();
  for (const row of rows) {
    const stinCd = pick(row, ALIAS.stinCd);
    if (!stinCd) continue;
    const cur = byStation.get(stinCd) ?? { stinCd, stinNm: pick(row, ALIAS.stinNm), lines: [] };
    const line = pick(row, ALIAS.transferLine);
    if (line && !cur.lines.includes(line)) cur.lines.push(line);
    if (!cur.stinNm) cur.stinNm = pick(row, ALIAS.stinNm);
    byStation.set(stinCd, cur);
  }
  return [...byStation.values()];
}

export type TimetableSummary = {
  /** 요일 구분 코드(제공자 표기 그대로) → 첫차·막차·편수 */
  byDay: Record<string, { first: string; last: string; trains: number }>;
};

/** "053000" · "05:30" · "5:30:00" → 분. 못 읽으면 null */
export function toMinutes(raw: string | null | undefined): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const digits = s.replace(/[^0-9]/g, "");
  if (digits.length < 3 || digits.length > 6) return null;
  /* 자릿수로 시·분을 가른다: 3·5자리는 시가 한 자리("530"·"53000"), 4·6자리는 두 자리("0530"·"053000").
     초는 뒤에 붙어 있어도 버린다. */
  const hourLen = digits.length % 2 === 1 ? 1 : 2;
  const hh = Number(digits.slice(0, hourLen));
  const mm = Number(digits.slice(hourLen, hourLen + 2));
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || mm > 59) return null;
  /* 막차가 25:10 처럼 24 를 넘겨 오는 표기를 그대로 둔다(다음 날 새벽) */
  return hh * 60 + mm;
}

function hhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 시각표 줄 묶음 → 요일별 첫차·막차·편수. 출발 시각이 없으면 도착 시각으로 본다. */
export function summarizeTimetable(rows: ReadonlyArray<Record<string, unknown>>): TimetableSummary {
  const acc = new Map<string, { min: number; max: number; trains: number }>();
  for (const row of rows) {
    const day = pick(row, ALIAS.dayCd) ?? "";
    const t = toMinutes(pick(row, ALIAS.depart) ?? pick(row, ALIAS.arrive));
    if (t === null) continue;
    const cur = acc.get(day) ?? { min: t, max: t, trains: 0 };
    cur.min = Math.min(cur.min, t);
    cur.max = Math.max(cur.max, t);
    cur.trains += 1;
    acc.set(day, cur);
  }
  const byDay: TimetableSummary["byDay"] = {};
  for (const [day, v] of acc) byDay[day] = { first: hhmm(v.min), last: hhmm(v.max), trains: v.trains };
  return { byDay };
}

/**
 * 돌아가며 받기 — 전체 목록에서 cursor 부터 size 개. 끝에 닿으면 처음으로 돌아간다.
 * "하루 1회 배치" 요청을 지키면서도 전체를 며칠에 걸쳐 채우는 방법이다.
 */
export function rollingSlice<T>(all: readonly T[], cursor: number, size: number): { slice: T[]; nextCursor: number } {
  if (all.length === 0 || size <= 0) return { slice: [], nextCursor: 0 };
  const start = ((cursor % all.length) + all.length) % all.length;
  const slice: T[] = [];
  for (let i = 0; i < Math.min(size, all.length); i += 1) slice.push(all[(start + i) % all.length]);
  return { slice, nextCursor: (start + slice.length) % all.length };
}
