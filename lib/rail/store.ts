import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import {
  isKricOk,
  kricUrl,
  normalizeStationRow,
  normalizeTransfers,
  parseKricPayload,
  redactUrl,
  rollingSlice,
  summarizeTimetable,
  type KricOperation,
  type KricPage,
  type RailStation,
} from "@/lib/rail/kric-parse";

/**
 * [1064] 레일포털(KRIC) 적재 — 하루 한 번 배치.
 *
 * 저장 자리: public.kv_store_99a854cb(key text PK · value jsonb · service_role 전용). 표를 새로 만들지 않는다
 * (이 저장소는 마이그레이션을 쓰지 않는 규약이라 1061 검색 기록과 같은 자리를 쓴다). 키 접두사:
 *   rail:lines          노선·역 묶음 한 장(최근 1회분) + 받은 열 이름
 *   rail:transfers      역별 환승 노선 한 장
 *   rail:timetable:<역코드>   역 하나의 요일별 첫차·막차·편수(돌아가며 조금씩 채운다)
 *   rail:state          커서·마지막 실행 기록(관리 화면이 읽는다)
 *
 * 공급자 요청(메일): "1일 1회 GET 또는 배치" · 매크로 금지. 그래서 노선·환승은 하루 한 번 통째로,
 * 시간표는 역 목록을 돌아가며 하루 TIMETABLE_PER_RUN 개만 받는다. 전체를 한 번에 긁지 않는다.
 */

const TABLE = "kv_store_99a854cb";
export const KEY_LINES = "rail:lines";
export const KEY_TRANSFERS = "rail:transfers";
export const KEY_STATE = "rail:state";
export const KEY_TIMETABLE_PREFIX = "rail:timetable:";

/** 하루에 받을 역 시간표 수 — 역 1,000개 안팎이면 보름쯤에 한 바퀴 */
export const TIMETABLE_PER_RUN = 60;
/** 한 번의 크론이 쓰는 벽시계 예산 */
const RUN_BUDGET_MS = 240_000;
const FETCH_TIMEOUT_MS = 15_000;

export function isKricConfigured(): boolean {
  return Boolean(process.env.KRIC_SERVICE_KEY?.trim());
}

async function kvGet<T>(key: string): Promise<T | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from(TABLE).select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(`레일 기록 조회 실패: ${error.message}`);
  return (data?.value as T | undefined) ?? null;
}

async function kvSet(key: string, value: unknown): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("저장소 준비 안 됨");
  const { error } = await sb.from(TABLE).upsert({ key, value }, { onConflict: "key" });
  if (error) throw new Error(`레일 기록 저장 실패: ${error.message}`);
}

/** 한 번 호출 — 키 값은 어떤 메시지에도 싣지 않는다(주소를 가린 꼴로만 적는다) */
async function callKric(op: KricOperation, params: Record<string, string>): Promise<KricPage> {
  const key = process.env.KRIC_SERVICE_KEY?.trim();
  if (!key) throw new Error("KRIC_SERVICE_KEY 미설정");
  const url = kricUrl(op, key, params);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store", headers: { Accept: "application/json" } });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} ${redactUrl(url).slice(0, 120)} ${text.slice(0, 120)}`);
    return parseKricPayload(text);
  } finally {
    clearTimeout(timer);
  }
}

export type RailState = {
  /** 시간표를 어디까지 받았나(역 목록 안 위치) */
  timetableCursor: number;
  lastRunAt: string | null;
  lastOk: boolean;
  lastMessage: string | null;
  /** 처음 한 번 사람이 열 이름을 맞출 수 있게 남긴다 */
  sampleColumns: { lines: string[]; transfers: string[]; timetable: string[] };
  counts: { stations: number; withCoords: number; transfers: number; timetables: number };
};

const BLANK_STATE: RailState = {
  timetableCursor: 0,
  lastRunAt: null,
  lastOk: false,
  lastMessage: null,
  sampleColumns: { lines: [], transfers: [], timetable: [] },
  counts: { stations: 0, withCoords: 0, transfers: 0, timetables: 0 },
};

export async function readRailState(): Promise<RailState> {
  const v = await kvGet<Partial<RailState>>(KEY_STATE);
  if (!v || typeof v !== "object") return BLANK_STATE;
  return {
    ...BLANK_STATE,
    ...v,
    sampleColumns: { ...BLANK_STATE.sampleColumns, ...(v.sampleColumns ?? {}) },
    counts: { ...BLANK_STATE.counts, ...(v.counts ?? {}) },
  };
}

export async function readRailStations(): Promise<RailStation[]> {
  const v = await kvGet<{ stations?: RailStation[] }>(KEY_LINES);
  return Array.isArray(v?.stations) ? v.stations : [];
}

export type RailSyncResult = {
  configured: boolean;
  stations: number;
  withCoords: number;
  transfers: number;
  timetablesFetched: number;
  stoppedBy: "done" | "time-budget";
  messages: string[];
};

/**
 * 하루 한 번 — 노선(역 목록) · 환승 · 시간표 조각.
 * 실패는 던지지 않고 메시지로 모은다(세 가지 중 하나가 막혀도 나머지는 받는다). 호출부가 기록을 남긴다.
 */
export async function syncRail(nowMs: number = Date.now()): Promise<RailSyncResult> {
  const out: RailSyncResult = {
    configured: isKricConfigured(),
    stations: 0,
    withCoords: 0,
    transfers: 0,
    timetablesFetched: 0,
    stoppedBy: "done",
    messages: [],
  };
  if (!out.configured) return out;
  const state = await readRailState();
  const next: RailState = { ...state, lastRunAt: new Date(nowMs).toISOString(), lastOk: true, lastMessage: null };

  /* 1) 노선·역 — 한 번에 통째로(작은 표) */
  let stations: RailStation[] = await readRailStations();
  try {
    const page = await callKric({ service: "trainUseInfo", operation: "subwayRouteInfo" }, {});
    next.sampleColumns.lines = page.columns;
    if (!isKricOk(page)) throw new Error(`결과 코드 ${page.code ?? "없음"} ${page.message ?? ""}`.trim());
    const got = page.rows.map(normalizeStationRow).filter((s): s is RailStation => s !== null);
    if (got.length > 0) {
      stations = got;
      await kvSet(KEY_LINES, { fetchedAt: next.lastRunAt, columns: page.columns, stations });
    }
  } catch (e) {
    const msg = `노선정보: ${e instanceof Error ? e.message : String(e)}`;
    out.messages.push(msg);
    next.lastOk = false;
  }
  out.stations = stations.length;
  out.withCoords = stations.filter((s) => s.lat !== null && s.lng !== null).length;

  /* 2) 환승 — 한 번에 통째로 */
  try {
    const page = await callKric({ service: "convenientInfo", operation: "stationTransferInfo" }, {});
    next.sampleColumns.transfers = page.columns;
    if (!isKricOk(page)) throw new Error(`결과 코드 ${page.code ?? "없음"} ${page.message ?? ""}`.trim());
    const transfers = normalizeTransfers(page.rows);
    if (transfers.length > 0) {
      await kvSet(KEY_TRANSFERS, { fetchedAt: next.lastRunAt, columns: page.columns, transfers });
      out.transfers = transfers.length;
    }
  } catch (e) {
    out.messages.push(`환승정보: ${e instanceof Error ? e.message : String(e)}`);
    next.lastOk = false;
  }

  /* 3) 시간표 — 역을 돌아가며 조금씩(공급자 요청: 하루 1회 배치) */
  const { slice, nextCursor } = rollingSlice(stations, state.timetableCursor, TIMETABLE_PER_RUN);
  const startedAt = Date.now();
  for (const st of slice) {
    if (Date.now() - startedAt > RUN_BUDGET_MS) {
      out.stoppedBy = "time-budget";
      break;
    }
    try {
      const page = await callKric(
        { service: "trainUseInfo", operation: "subwayTimetable" },
        {
          railOprIsttCd: st.oprCd ?? "",
          lnCd: st.lineCd ?? "",
          stinCd: st.stinCd,
          /* 평일·토·휴일 세 가지를 한 번에 주지 않는 규격이라 평일(8)만 받고, 나머지는 다음 바퀴에서. */
          dayCd: "8",
        },
      );
      if (next.sampleColumns.timetable.length === 0) next.sampleColumns.timetable = page.columns;
      if (!isKricOk(page)) continue;
      const summary = summarizeTimetable(page.rows);
      if (Object.keys(summary.byDay).length === 0) continue;
      await kvSet(`${KEY_TIMETABLE_PREFIX}${st.stinCd}`, {
        fetchedAt: next.lastRunAt,
        stinCd: st.stinCd,
        stinNm: st.stinNm,
        lineNm: st.lineNm,
        ...summary,
      });
      out.timetablesFetched += 1;
    } catch (e) {
      /* 역 하나가 막혀도 배치를 멈추지 않는다 — 처음 한 건만 메시지에 남긴다 */
      if (out.messages.length < 4) out.messages.push(`시간표(${st.stinCd}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  next.timetableCursor = nextCursor;
  next.counts = {
    stations: out.stations,
    withCoords: out.withCoords,
    transfers: out.transfers || state.counts.transfers,
    timetables: state.counts.timetables + out.timetablesFetched,
  };
  next.lastMessage = out.messages[0] ?? null;
  try {
    await kvSet(KEY_STATE, next);
  } catch (e) {
    logger.warn("[rail] 상태 저장 실패", e instanceof Error ? e.message : String(e));
  }
  return out;
}
