/**
 * [1104] KOSIS Open API — 요청 주소 · 응답 해석 · 지역 매핑 · 수집 기록 문구. 순수(단위 시험 대상 · server-only 아님).
 *
 * 왜 따로 뽑았나 — 운영 실측(market_ingest_log source='kosis', 2026-06-15 ~ 11-03 115회 전부 0건, 적재 이력 0):
 *  · 요청에 jsonVD=Y 가 없었다(오타 jsonVifId=""). KOSIS 는 jsonVD=Y 가 없으면 키에 따옴표가 없는
 *    JS 객체({err:"10",errMsg:"…"} · [{ORG_ID:"101",…}])를 준다 — JSON.parse 가 성공·실패 응답 모두에서 깨졌고,
 *    client 는 경고만 남기고 빈 배열을 돌려 "0건(키 활성화/표ID 확인 필요)"으로 묻었다.
 *    키가 맞든 틀리든, 표가 맞든 틀리든 같은 0건이라 무엇이 문제인지 기록에 남지 않았다.
 *  · 실패는 모두 HTTP 200 + { err, errMsg } 다(Content-Type 도 text/html). 이제 코드·문구를 그대로 기록한다.
 */
import { matchRegionFromClsFullNm, type RegionMatch } from "@/lib/market/region-code";
import { sidoByName } from "@/lib/region/sido";
import type { KosisTable } from "./stat-tables";

export const KOSIS_PARAM_URL = "https://kosis.kr/openapi/Param/statisticsParameterData.do";

/** 통계자료(Param) 요청 주소. apiKey 가 들어가므로 이 문자열은 로그·오류 메시지에 싣지 않는다. */
export function buildKosisUrl(table: KosisTable, opts: { apiKey: string; recentCount?: number }): string {
  const n = Math.floor(Number(opts.recentCount ?? (table.prdSe === "M" ? 2 : 1)));
  const qs = new URLSearchParams({
    method: "getList",
    apiKey: opts.apiKey,
    itmId: table.itmId ?? "ALL",
    format: "json",
    // [1104] 없으면 따옴표 없는 JS 객체가 온다(JSON.parse 실패) — 1104 이전 115회 0건의 원인
    jsonVD: "Y",
    prdSe: table.prdSe,
    newEstPrdCnt: String(Number.isFinite(n) ? Math.max(1, Math.min(24, n)) : 2),
    orgId: table.orgId,
    tblId: table.tblId,
  });
  // [1104] 분류축은 표의 축 수만큼 — 모자라면 err 20(필수요청변수 누락)
  table.objL.forEach((v, i) => qs.set(`objL${i + 1}`, v));
  return `${KOSIS_PARAM_URL}?${qs.toString()}`;
}

/** 통계자료 응답 한 행(jsonVD=Y · 값은 모두 문자열) */
export interface RawKosisRow {
  PRD_DE?: string;
  C1?: string;
  C1_NM?: string;
  C2?: string;
  C2_NM?: string;
  C3?: string;
  C3_NM?: string;
  ITM_ID?: string;
  ITM_NM?: string;
  DT?: string | number;
  UNIT_NM?: string;
}

export type KosisParsed =
  | { ok: true; rows: RawKosisRow[] }
  | { ok: false; code: string; message: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** KOSIS 공식 오류 코드 → 뜻(errMsg 가 비었을 때) */
const KOSIS_ERR_TEXT: Record<string, string> = {
  "10": "인증KEY 누락",
  "11": "인증KEY 기간만료·유효하지 않음",
  "20": "필수요청변수 누락",
  "21": "잘못된 요청변수",
  "30": "조회결과 없음",
  "31": "조회결과 40,000셀 초과",
  "40": "호출가능건수 제한",
  "41": "호출가능 ROW수 제한",
  "42": "사용자별 이용 제한",
  "50": "서버오류",
};

/** 응답 본문 → 행 목록 또는 KOSIS 오류(코드 · 문구). JSON 이 아니어도 던지지 않는다. */
export function parseKosisResponse(text: string): KosisParsed {
  const body = String(text ?? "").trim();
  if (!body) return { ok: false, code: "empty", message: "빈 응답" };
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    // [1104] jsonVD 없는 옛 모양({err:"11",errMsg:"…"})도 코드는 읽는다 — 묻지 않는다
    const m = body.match(/^\{\s*"?err"?\s*:\s*"?([^",}]*)"?\s*(?:,\s*"?errMsg"?\s*:\s*"([^"]*)")?/);
    if (m) return { ok: false, code: m[1].trim() || "?", message: (m[2] ?? "").trim() };
    const snippet = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
    return { ok: false, code: "non-json", message: `JSON 아님: ${snippet || "빈 응답"}` };
  }
  if (Array.isArray(json)) return { ok: true, rows: json.filter(isObj) as RawKosisRow[] };
  if (isObj(json) && ("err" in json || "errMsg" in json)) {
    return { ok: false, code: String(json.err ?? "?").trim(), message: String(json.errMsg ?? "").trim() };
  }
  return { ok: false, code: "unexpected", message: "알 수 없는 응답 형식(배열 · err 없음)" };
}

export type KosisErrorKind = "auth" | "no-data" | "request" | "limit" | "server" | "format" | "network";

/** 오류 코드 → 누가 무엇을 해야 하는지 가르는 묶음 */
export function kosisErrorKind(code: string): KosisErrorKind {
  if (code === "10" || code === "11") return "auth";
  if (code === "30") return "no-data";
  if (code === "20" || code === "21" || code === "31") return "request";
  if (code === "40" || code === "41" || code === "42") return "limit";
  if (code === "50") return "server";
  if (/^HTTP 5\d\d$/.test(code)) return "server";
  if (/^HTTP \d+$/.test(code)) return "request";
  if (code === "timeout" || code === "network") return "network";
  return "format";
}

/** 기록용 한 조각 — "KOSIS err 11 유효하지 않은 인증KEY입니다." */
export function describeKosisError(e: { code: string; message: string }): string {
  if (/^\d+$/.test(e.code)) {
    const text = e.message || KOSIS_ERR_TEXT[e.code] || "";
    return `KOSIS err ${e.code}${text ? ` ${text}` : ""}`.slice(0, 120);
  }
  if (e.code === "timeout") return "KOSIS 응답 시간 초과";
  if (e.code === "network") return "KOSIS 연결 실패";
  return `KOSIS ${e.code === "non-json" || e.code === "unexpected" || e.code === "empty" ? "" : `${e.code} `}${e.message}`.trim().slice(0, 120);
}

/* ── 지역 매핑 ─────────────────────────────────────────────────────── */

/** 행정구역 코드 앞 2자리 → 시도(주민등록 표는 시도 이름 열이 없고 코드만 계층이다: 11 · 11110 …) */
const SIDO_BY_CODE: Record<string, string> = {
  "11": "서울",
  "12": "전남광주", // [998] 2026-07 전남광주통합특별시
  "26": "부산",
  "27": "대구",
  "28": "인천",
  "29": "광주",
  "30": "대전",
  "31": "울산",
  "36": "세종",
  "41": "경기",
  "42": "강원",
  "51": "강원",
  "43": "충북",
  "44": "충남",
  "45": "전북",
  "52": "전북",
  "46": "전남",
  "47": "경북",
  "48": "경남",
  "50": "제주",
};

const tight = (s: string) => s.replace(/\s+/g, "");

/** KOSIS 시도 표기("서울" · "서울특별시" · "전남광주" · "전남광주통합특별시") → 내부 city 후보 */
function citiesOf(sido: string): string[] {
  const t = tight(sido);
  if (t.startsWith("전남광주") || t.startsWith("광주전남")) return ["광주", "전남"];
  const s = sidoByName(t);
  return [s ? s.short : t];
}

/** [1104] 매칭 결과가 그 시도 안인지 — 부산 "동구" 가 서울 강동구로, 대구 "중구" 가 서울 중구로 가지 않게 */
function inCities(m: RegionMatch | null, cities: readonly string[]): RegionMatch | null {
  return m && cities.includes(m.city) ? m : null;
}

function field(row: RawKosisRow, key: string): string {
  const v = (row as Record<string, unknown>)[key];
  return v === undefined || v === null ? "" : String(v).trim();
}

export interface KosisRegion {
  id: string;
  name: string;
  city: string;
  level: "sido" | "sigungu";
}

/** 시군구 표 한 행 → 내부 시군구(못 찾으면 null — 비슷한 이름에 붙이지 않는다) */
function sigunguOf(table: KosisTable, row: RawKosisRow, nameByCode5: Map<string, string>): KosisRegion | null {
  const ax = table.regionAxis;
  const name = field(row, `${ax}_NM`);
  if (!name) return null;
  let sido: string | undefined;
  let parent: string | undefined;
  if (table.sidoAxis) {
    sido = field(row, `${table.sidoAxis}_NM`) || undefined;
  } else {
    // 1축 행정구역 표 — 2자리(시도) · 전국(00) 행은 시군구가 아니다
    const code = field(row, ax);
    if (!/^\d{5,}$/.test(code)) return null;
    sido = SIDO_BY_CODE[code.slice(0, 2)];
    const c5 = code.slice(0, 5);
    // 일반구(41111 장안구 …)는 상위 시(41110 수원시) 이름을 붙여 "수원시 장안구" 로 찾는다
    if (c5[4] !== "0") parent = nameByCode5.get(`${c5.slice(0, 4)}0`);
  }
  if (!sido) return null;
  const cities = citiesOf(sido);
  let m: RegionMatch | null = null;
  if (parent && !tight(name).startsWith(tight(parent))) {
    m = inCities(matchRegionFromClsFullNm(`${sido}>${parent}>${name}`), cities);
  }
  m = m ?? inCities(matchRegionFromClsFullNm(`${sido}>${name}`), cities);
  return m ? { ...m, level: "sigungu" } : null;
}

/** 시도 표 한 행 → "sido-<영문>"(세종은 시군구 id 'sejong' 그대로 — lib/region/sido.ts 규칙) */
function sidoOf(table: KosisTable, row: RawKosisRow): KosisRegion | null {
  const s = sidoByName(field(row, `${table.regionAxis}_NM`));
  if (!s) return null; // 전국 · 수도권 · 계획/실적 · 전남광주(내부 시도 id 없음)
  return { id: s.id, name: s.short, city: s.short, level: s.id.startsWith("sido-") ? "sido" : "sigungu" };
}

export interface KosisDataRow {
  region: KosisRegion;
  /** yyyymm 또는 yyyy */
  period: string;
  itmNm: string;
  value: number;
}

export interface KosisMapped {
  rows: KosisDataRow[];
  /** 항목·고정 분류·값 조건을 지난 행 중 지역을 못 찾은 수(시도 합계 · 경기 시 단위 등) */
  unmatched: number;
}

/** 응답 행 → 내부 지역 행. 값이 숫자가 아니면("-" 등) 버린다 — 0으로 바꾸지 않는다. */
export function mapKosisRows(table: KosisTable, raw: readonly RawKosisRow[]): KosisMapped {
  const nameByCode5 = new Map<string, string>();
  if (!table.sidoAxis && table.regionLevel === "sigungu") {
    for (const r of raw) {
      const code = field(r, table.regionAxis);
      const name = field(r, `${table.regionAxis}_NM`);
      if (/^\d{5,}$/.test(code) && name && !nameByCode5.has(code.slice(0, 5))) nameByCode5.set(code.slice(0, 5), name);
    }
  }
  const rows: KosisDataRow[] = [];
  let unmatched = 0;
  for (const r of raw) {
    const itmId = field(r, "ITM_ID");
    const itmNm = field(r, "ITM_NM");
    if (table.itmId && table.itmId !== "ALL" && itmId && itmId !== table.itmId) continue;
    if (table.itmNmIncludes && !itmNm.includes(table.itmNmIncludes)) continue;
    if (table.itmNmExact && tight(itmNm) !== tight(table.itmNmExact)) continue;
    if (table.fixedNames) {
      const fixed = Object.entries(table.fixedNames) as Array<[string, string]>;
      if (!fixed.every(([k, v]) => tight(field(r, k)) === tight(v))) continue;
    }
    const period = field(r, "PRD_DE");
    if (!/^\d{4}(\d{2})?$/.test(period)) continue;
    const dt = typeof r.DT === "number" ? r.DT : field(r, "DT").replace(/,/g, "");
    if (dt === "") continue;
    const value = Number(dt);
    if (!Number.isFinite(value)) continue;
    const region = table.regionLevel === "sido" ? sidoOf(table, r) : sigunguOf(table, r, nameByCode5);
    if (!region) {
      unmatched += 1;
      continue;
    }
    rows.push({ region, period, itmNm, value });
  }
  return { rows, unmatched };
}

/** KOSIS PRD_DE(yyyymm | yyyy) → YYYY-MM-DD (연간은 1월 1일 — 시계열은 monthly 로 통일) */
export function kosisPeriodToDate(prd: string): string {
  if (/^\d{6}$/.test(prd)) return `${prd.slice(0, 4)}-${prd.slice(4, 6)}-01`;
  if (/^\d{4}$/.test(prd)) return `${prd}-01-01`;
  return prd;
}

/* ── 수집 기록 ─────────────────────────────────────────────────────── */

export interface KosisTableOutcome {
  label: string;
  /** KOSIS 가 돌려준 행 수 */
  received: number;
  /** 내부 지역에 붙은 행 수 */
  matched: number;
  /** 지역을 못 찾은 행 수 */
  unmatched: number;
  error: { code: string; message: string } | null;
}

/** 적재 0 이고 실패가 있으면 error — "skipped(0건)"로 묻지 않는다. 자료 없음(err 30)만이면 skipped. */
export function kosisIngestStatus(saved: number, outcomes: readonly KosisTableOutcome[]): "ok" | "error" | "skipped" {
  if (saved > 0) return "ok";
  const failed = outcomes.some((o) => o.error && kosisErrorKind(o.error.code) !== "no-data");
  const mappedButNotSaved = outcomes.some((o) => o.matched > 0);
  return failed || mappedButNotSaved ? "error" : "skipped";
}

const KIND_HINT: Record<Exclude<KosisErrorKind, "no-data">, string> = {
  auth: "인증키 확인 필요 — Vercel env KOSIS_API_KEY(KOSIS 공유서비스 kosis.kr/openapi › 인증키 발급·활용신청)",
  request: "표 구조·요청변수 확인 필요(lib/kosis/stat-tables.ts · 코드 쪽)",
  limit: "KOSIS 호출 한도 초과 · 잠시 후 다시",
  server: "KOSIS 서버 오류 · 잠시 후 다시",
  network: "KOSIS 연결 실패 · 잠시 후 다시",
  format: "KOSIS 응답 형식 이상 · 잠시 후 다시",
};

/**
 * market_ingest_log 한 줄 — 표마다 적재 수(응답 수) 또는 KOSIS 오류 코드·문구, 끝에 누가 할 일인지.
 * 예: "series=812 · 미분양주택현황 212건(응답 576행) · 주택보급률 실패(KOSIS err 20 필수요청변수값이 누락되었습니다.) · 표 구조·요청변수 확인 필요(…)"
 */
export function kosisIngestMessage(saved: number, outcomes: readonly KosisTableOutcome[]): string {
  const matchedTotal = outcomes.reduce((a, o) => a + o.matched, 0);
  const head = `series=${saved}` + (matchedTotal > saved ? `(매핑 ${matchedTotal} 중 · DB 저장 실패 확인)` : "");
  const errs = outcomes.filter((o) => o.error);
  const first = errs[0]?.error;
  // 모든 표가 같은 오류면 한 번만(인증키 오류가 6번 반복되지 않게)
  if (first && errs.length === outcomes.length && errs.every((o) => o.error!.code === first.code)) {
    const kind = kosisErrorKind(first.code);
    return [
      head,
      `${outcomes.length}개 표 모두 ${describeKosisError(first)}`,
      ...(kind === "no-data" ? [] : [KIND_HINT[kind]]),
    ].join(" · ");
  }
  const parts = outcomes.map((o) => {
    if (o.error) {
      if (kosisErrorKind(o.error.code) === "no-data") return `${o.label} 0건(KOSIS 자료 없음 · err 30)`;
      return `${o.label} 실패(${describeKosisError(o.error)})`;
    }
    if (o.matched === 0 && o.received > 0) return `${o.label} 0건(응답 ${o.received}행 · 지역 매칭 0)`;
    if (o.received > o.matched) return `${o.label} ${o.matched}건(응답 ${o.received}행)`;
    return `${o.label} ${o.matched}건`;
  });
  const kinds = new Set(
    errs.map((o) => kosisErrorKind(o.error!.code)).filter((k): k is Exclude<KosisErrorKind, "no-data"> => k !== "no-data"),
  );
  return [head, ...parts, ...[...kinds].map((k) => KIND_HINT[k])].join(" · ");
}
