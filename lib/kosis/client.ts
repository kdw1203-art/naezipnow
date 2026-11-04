/** KOSIS 국가통계포털 Open API 클라이언트 (서버 전용). 요청 주소 · 응답 해석 · 지역 매핑은 ./parse (순수). */
import { logger } from "@/lib/log";
import type { KosisTable } from "./stat-tables";
import { buildKosisUrl, mapKosisRows, parseKosisResponse, type KosisDataRow } from "./parse";

export type { KosisDataRow } from "./parse";

export function kosisKey(): string {
  return process.env.KOSIS_API_KEY?.trim() ?? "";
}

export function isKosisConfigured(): boolean {
  return kosisKey().length > 0;
}

export interface KosisFetchResult {
  rows: KosisDataRow[];
  /** KOSIS 가 돌려준 행 수(지역 매핑 전) */
  received: number;
  /** 지역을 못 찾은 행 수 */
  unmatched: number;
  /** [1104] 실패 사유 — KOSIS err 코드·문구 · HTTP · 시간 초과. 예전엔 경고 로그로만 남기고 빈 배열(=0건)이었다 */
  error: { code: string; message: string } | null;
}

/**
 * 한 KOSIS 통계표의 최신 N개 시점을 내부 지역으로 매핑해 반환. 던지지 않는다 —
 * 실패는 error 에 코드·문구로 담아 수집 기록(market_ingest_log)에 그대로 남긴다.
 * 요청 주소에 apiKey 가 있으므로 주소는 어디에도 싣지 않는다.
 */
export async function fetchKosisTable(
  table: KosisTable,
  opts: { recentCount?: number } = {},
): Promise<KosisFetchResult> {
  const empty = (error: KosisFetchResult["error"]): KosisFetchResult => ({ rows: [], received: 0, unmatched: 0, error });
  if (!isKosisConfigured()) return empty({ code: "10", message: "KOSIS_API_KEY 미설정" });

  let text: string;
  try {
    const res = await fetch(buildKosisUrl(table, { apiKey: kosisKey(), recentCount: opts.recentCount }), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    text = await res.text();
    if (!res.ok) {
      logger.warn(`[kosis] ${table.label} HTTP ${res.status}`);
      return empty({ code: `HTTP ${res.status}`, message: "" });
    }
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    logger.warn(`[kosis] ${table.label} fetch failed`, err instanceof Error ? err.name : String(err));
    return empty({ code: timeout ? "timeout" : "network", message: "" });
  }

  const parsed = parseKosisResponse(text);
  if (!parsed.ok) {
    // [1104] 실패 코드를 버리지 않는다 — 인증키(10·11) · 요청변수(20·21) · 자료 없음(30) 을 기록에서 가른다
    logger.warn(`[kosis] ${table.label} err ${parsed.code}`, parsed.message);
    return empty({ code: parsed.code, message: parsed.message });
  }
  const mapped = mapKosisRows(table, parsed.rows);
  return { rows: mapped.rows, received: parsed.rows.length, unmatched: mapped.unmatched, error: null };
}
