import "server-only";
/* [1026c] 서비스 미신청(403)이면 첫 단지 한 곳에서 멈춘다 — 아래 ingestKaptMgmtFeeBatch 주석. */
/**
 * [1025] K-apt 관리비 → `complex_mgmt_fee(kapt_code, ym, common_krw, individual_krw, total_krw, per_m2_krw, items)` 적재.
 *
 * [1025] 첫 실행(2026-09-29) "처리=200 적재=0 실패=200 · HTTP 400" 의 원인은 오퍼레이션명이었다(kapt-mgmt-fee-api.ts 머리).
 * 이제 단지당 22회(공용 17 + 개별 5) — 200곳 = 4,400회/일. 항목별 금액은 jsonb `items` 로 같이 쓴다. 마이그레이션
 * (`_1025_mgmt_fee_items`)이 아직 안 붙어 items 열이 없으면 그 열만 빼고 다시 쓴다(총액 적재가 열 하나 때문에 멈추지 않게).
 *
 * 후보 고르기(1회 200곳): 수도권(11·41·28) 대장(source_key='k-apt-basic') 중 **실거래가 있는 단지 우선**.
 *   · 뷰 `kapt_mgmt_fee_candidates`(마이그레이션 20260928125309) — has_tx(complex_master_link 에 kapt_code 가
 *     있는가) 내림차순 · 단지코드 오름차순. 뷰가 아직 없으면(마이그레이션 미적용) 대장 표를 직접 읽어 코드순으로 간다.
 *   · 커서 = 대장 metadata.mgmtFeeYm(마지막으로 시도한 달). 대상 달보다 오래된 행만 고른다 → 매달 한 바퀴.
 *     스탬프는 병합 RPC(upsert_apartment_complexes)로만 쓴다(기존 metadata 를 지우지 않는 유일한 경로).
 * 대상 달: 기본 2개월 전(관리비 공개 지연). ?ym= 로 지정.
 * 키 없음 → 0행 + skipped 사유. 응답 없음 → 행 없음(지어내지 않음), mgmtFeeStatus='miss' 로 다음 달에 다시.
 * API 장애(성공 0·오류 있음) → 스탬프를 찍지 않는다(그날 200곳을 miss 로 낙인찍지 않기 위해 — apt-detail 과 같은 규칙).
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { isDataGoKrEncodingConfigured } from "@/lib/public-data/data-go-kr-keys";
import { APT_MASTER_SOURCE_KEY } from "@/lib/complex/apartment-master";
import { fetchKaptMgmtFee, toMgmtFeeRow, type MgmtFeeRow } from "@/lib/national-data/kapt-mgmt-fee-api";
import { shiftYm } from "@/lib/market/molit-core";
import { logger } from "@/lib/log";

export const MGMT_FEE_BATCH = 200;
/** 호출 간격(ms) — apt-detail 과 같은 정중함 */
const DELAY_MS = 60;
const CONCURRENCY = 2;
const UPSERT_CHUNK = 200;

export interface MgmtFeeCandidate {
  kapt_code: string;
  name: string;
  address: string | null;
  lawd_cd: string | null;
  has_tx: boolean;
  manage_area_m2: number | null;
}

export interface MgmtFeeIngestResult {
  ym: string;
  processed: number;
  /** complex_mgmt_fee 에 쓴 행 수 */
  inserted: number;
  /** 응답은 있었으나 금액을 못 읽은/없는 단지 */
  miss: number;
  failed: number;
  stamped: number;
  /** [1026c] not-registered = data.go.kr 서비스 활용신청 전(HTTP 403) — 첫 단지 한 곳으로 확인하고 나머지는 부르지 않는다 */
  skipped?: "no-service" | "no-key" | "no-rows" | "not-registered";
  candidateSource: "view" | "table" | "none";
  errors: string[];
}

/** 기본 대상 달 — 2개월 전(YYYYMM) */
export function defaultMgmtFeeYm(now = new Date()): string {
  const cur = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return shiftYm(cur, -2);
}

async function pickCandidates(
  sb: NonNullable<ReturnType<typeof getServiceSupabase>>,
  ym: string,
  limit: number,
): Promise<{ rows: MgmtFeeCandidate[]; source: "view" | "table"; error?: string }> {
  /* 1) 뷰 — 실거래 있는 단지 우선 */
  const view = await sb
    .from("kapt_mgmt_fee_candidates")
    .select("kapt_code,name,address,lawd_cd,has_tx,manage_area_m2,mgmt_fee_ym")
    .or(`mgmt_fee_ym.is.null,mgmt_fee_ym.lt.${ym}`)
    .order("has_tx", { ascending: false })
    .order("kapt_code", { ascending: true })
    .limit(limit);
  if (!view.error) {
    return {
      rows: ((view.data ?? []) as Record<string, unknown>[]).map((r) => ({
        kapt_code: String(r.kapt_code),
        name: String(r.name ?? ""),
        address: (r.address as string | null) ?? null,
        lawd_cd: (r.lawd_cd as string | null) ?? null,
        has_tx: Boolean(r.has_tx),
        manage_area_m2: r.manage_area_m2 == null ? null : Number(r.manage_area_m2) || null,
      })),
      source: "view",
    };
  }
  logger.warn("[kapt-mgmt-fee] 후보 뷰 조회 실패 — 대장 표로 대체(실거래 우선 순서 없음)", view.error.message);

  /* 2) 대장 표 직접 — 수도권 · 아직 이 달을 시도하지 않은 행 */
  const table = await sb
    .from("apartment_complexes")
    .select("external_id,name,address,lawd_cd,metadata")
    .eq("source_key", APT_MASTER_SOURCE_KEY)
    .or("lawd_cd.like.11*,lawd_cd.like.41*,lawd_cd.like.28*")
    .or(`metadata->>mgmtFeeYm.is.null,metadata->>mgmtFeeYm.lt.${ym}`)
    .order("external_id", { ascending: true })
    .limit(limit);
  if (table.error) return { rows: [], source: "table", error: table.error.message };
  return {
    rows: ((table.data ?? []) as Record<string, unknown>[])
      .filter((r) => typeof r.external_id === "string" && r.external_id)
      .map((r) => {
        const md = (r.metadata ?? {}) as Record<string, unknown>;
        const area = Number(md.manageAreaM2);
        return {
          kapt_code: String(r.external_id),
          name: String(r.name ?? ""),
          address: (r.address as string | null) ?? null,
          lawd_cd: (r.lawd_cd as string | null) ?? null,
          has_tx: false,
          manage_area_m2: Number.isFinite(area) && area > 0 ? area : null,
        };
      }),
    source: "table",
  };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function ingestKaptMgmtFeeBatch(opts: { ym?: string; limit?: number; now?: Date } = {}): Promise<MgmtFeeIngestResult> {
  const now = opts.now ?? new Date();
  const ym = /^\d{6}$/.test(opts.ym ?? "") ? (opts.ym as string) : defaultMgmtFeeYm(now);
  const limit = Math.max(1, Math.min(500, opts.limit ?? MGMT_FEE_BATCH));
  const base: MgmtFeeIngestResult = {
    ym,
    processed: 0,
    inserted: 0,
    miss: 0,
    failed: 0,
    stamped: 0,
    candidateSource: "none",
    errors: [],
  };
  const sb = getServiceSupabase();
  if (!sb) return { ...base, skipped: "no-service" };
  if (!isDataGoKrEncodingConfigured()) return { ...base, skipped: "no-key" };

  const picked = await pickCandidates(sb, ym, limit);
  base.candidateSource = picked.source;
  if (picked.error) return { ...base, failed: limit, errors: [picked.error] };
  if (picked.rows.length === 0) return { ...base, skipped: "no-rows" };

  /* [1026c] 서비스 미신청 확인 — 2026-09-30 실행이 200곳 전부 "AptCmnuseManageCostServiceV3 HTTP 403"(활용신청 전)으로 실패했다.
     같은 403 을 200번 부를 이유가 없다: 첫 단지 한 곳으로 보고 403 이면 바로 멈추고 무엇을 신청해야 하는지 로그에 남긴다. */
  try {
    await fetchKaptMgmtFee(picked.rows[0].kapt_code, ym);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/HTTP 403/.test(msg)) {
      const svc = (msg.match(/Apt[A-Za-z]+ServiceV3/) ?? [])[0] ?? "관리비 서비스";
      return {
        ...base,
        processed: 1,
        failed: 1,
        skipped: "not-registered",
        errors: [`data.go.kr ${svc} 활용신청 필요(HTTP 403) — 신청·승인 뒤 다음 실행부터 적재`],
      };
    }
  }

  const fetchedAt = now.toISOString();
  const outcomes = await mapWithConcurrency(picked.rows, CONCURRENCY, async (c) => {
    try {
      const fee = await fetchKaptMgmtFee(c.kapt_code, ym);
      await new Promise((r) => setTimeout(r, DELAY_MS));
      const row = toMgmtFeeRow(c.kapt_code, ym, fee.commonKrw, fee.individualKrw, c.manage_area_m2, fetchedAt, fee.items);
      return row ? { kind: "ok" as const, c, row } : { kind: "miss" as const, c };
    } catch (e) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
      return { kind: "error" as const, c, error: e instanceof Error ? e.message : String(e) };
    }
  });

  const rows: MgmtFeeRow[] = [];
  let miss = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const o of outcomes) {
    if (o.kind === "ok") rows.push(o.row);
    else if (o.kind === "miss") miss += 1;
    else {
      failed += 1;
      if (errors.length < 3) errors.push(`${o.c.kapt_code}: ${o.error}`);
    }
  }

  let inserted = 0;
  /* [1025] items 열이 아직 없으면(마이그레이션 미적용 — PostgREST "Could not find the 'items' column") 그 열만 빼고 다시 */
  let itemsColumnMissing = false;
  const withoutItems = (chunk: MgmtFeeRow[]) => chunk.map(({ items: _items, ...rest }) => rest);
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    let chunk: MgmtFeeRow[] = rows.slice(i, i + UPSERT_CHUNK);
    if (itemsColumnMissing) chunk = withoutItems(chunk);
    let { error } = await sb.from("complex_mgmt_fee").upsert(chunk, { onConflict: "kapt_code,ym" });
    if (error && !itemsColumnMissing && /items/.test(error.message) && /column/i.test(error.message)) {
      itemsColumnMissing = true;
      if (errors.length < 3) errors.push("complex_mgmt_fee.items 열 없음(마이그레이션 미적용) — 항목별 금액 없이 적재");
      ({ error } = await sb.from("complex_mgmt_fee").upsert(withoutItems(chunk), { onConflict: "kapt_code,ym" }));
    }
    if (error) {
      failed += chunk.length;
      if (errors.length < 3) errors.push(`complex_mgmt_fee upsert: ${error.message}`);
    } else inserted += chunk.length;
  }

  /* 스탬프 — 성공이 하나라도 있거나 오류가 0 이면 찍는다(전부 오류 = API 장애 → 다음 실행이 같은 200곳을 다시). */
  let stamped = 0;
  const anyOk = rows.length > 0;
  if (anyOk || failed === 0) {
    const okCodes = new Set(rows.map((r) => r.kapt_code));
    const stampRows = outcomes
      .filter((o) => o.kind !== "error")
      .map((o) => ({
        source_key: APT_MASTER_SOURCE_KEY,
        external_id: o.c.kapt_code,
        name: o.c.name,
        address: o.c.address,
        lawd_cd: o.c.lawd_cd,
        metadata: {
          mgmtFeeYm: ym,
          mgmtFeeStatus: okCodes.has(o.c.kapt_code) ? "ok" : "miss",
          mgmtFeeFetchedAt: fetchedAt,
        },
      }));
    for (let i = 0; i < stampRows.length; i += UPSERT_CHUNK) {
      const chunk = stampRows.slice(i, i + UPSERT_CHUNK);
      const { error } = await sb.rpc("upsert_apartment_complexes", { rows: chunk });
      if (error) {
        if (errors.length < 3) errors.push(`스탬프 실패: ${error.message}`);
      } else stamped += chunk.length;
    }
  }

  return {
    ym,
    processed: picked.rows.length,
    inserted,
    miss,
    failed,
    stamped,
    candidateSource: picked.source,
    errors,
  };
}
