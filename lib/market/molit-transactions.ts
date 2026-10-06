/**
 * [1025] 응답 실패 사유(molit-api detail)를 첫오류 로그에 · sliceSize 상한 60 → 200(이력 백필 160곳)
 * 국토교통부 실거래가(RTMS) → `market_transactions` 적재.
 *
 * 배경(사실 우선): 기존 `molit-transactions-ingest` 크론은 운영 DB에 존재하지 않는
 * `complexes` 테이블을 조회하고 no-op 인 `upsertTransactions()` 를 호출해 매번
 * `{processed:0, reason:"no complexes in DB"}` 만 반환했다 — 즉 실질적으로 죽은 경로였다.
 * 실거래 실데이터는 `market_transactions`(source='MOLIT') 에 있으므로 이 모듈이
 * 같은 스키마로 직접 적재한다.
 *
 * 중복 안전장치: 플랫폼 ETL 이 이미 채운 (region_code, contract_ym) 조합은 건너뛴다.
 * 해시 레시피가 서로 달라 external_key 가 겹치지 않으므로, 같은 구·같은 달을 다시
 * 넣으면 거래 건수·평균가 집계가 이중 계상된다. 따라서 "비어 있는 구·월"만 채운다.
 * → 결과적으로 전국 미커버 시군구/최신월을 넓히는 방향으로만 동작한다.
 */
/* [1024] keepRaw:false(이력·비아파트는 raw 미저장) · types 명시 · 유형별 커버 판정 · codes+gapsFirst 조합 ·
   비아파트 그룹(officetel·rowhouse·house) 확장 — 이력 백필(molit-history-backfill)·비아파트(molit-nonapt-ingest)가 쓴다 */
import { createHash } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchMolitDeals, type MolitDeal, type MolitRtmsType } from "@/lib/national-data/molit-api";
import { getSigunguInfo, listLeafSigungu, type SigunguInfo } from "@/lib/national-data/region-codes";
import { logIngest } from "@/lib/market/store";
import type { RefreshAggregatesResult } from "@/lib/market/refresh-aggregates";
import { logger } from "@/lib/log";
import { isServiceNotRegistered } from "@/lib/market/ingest-outcome";
/* [1010] "이번 적재가 실제로 바꾼 단지" 수집기 — 순수 모듈(단위 테스트가 규칙을 고정한다) */
import {
  createTouchedComplexSink,
  TOUCHED_COMPLEX_CAP,
} from "@/lib/market/touched-complexes";

/* 호출부(크론·테스트)가 한 곳만 알면 되게 다시 내보낸다 */
export { createTouchedComplexSink, TOUCHED_COMPLEX_CAP };
export type { TouchedComplexSink } from "@/lib/market/touched-complexes";
/* [1024] 순수 도우미는 molit-core.ts 에 둔다(server-only 사슬 밖 → node:test 가 직접 부른다). 여기서 다시 내보낸다. */
import {
  chunkRows,
  compactRaw,
  isCapitalAreaCode,
  isRecentMonth,
  isStatementTimeout,
  mergeRedo,
  molitDatasetLabel,
  molitRegionLabel,
  MOLIT_REDO_KEY,
  redoCodesFor,
  redoTypesKey,
  UPSERT_CHUNK_ROWS,
  UPSERT_MIN_CHUNK_ROWS,
  type RedoEntry,
} from "@/lib/market/molit-core";
import { readCursor, writeCursor } from "@/lib/market/molit-cursor";
export {
  CAPITAL_AREA_PREFIXES,
  compactRaw,
  isCapitalAreaCode,
  isRecentMonth,
  molitDatasetLabel,
  molitRegionLabel,
  NONAPT_PROPERTY_TYPES,
  RECENT_MONTHS,
  shiftYm,
} from "@/lib/market/molit-core";
export type { NonAptPropertyType } from "@/lib/market/molit-core";

/** 1평 = 3.305785㎡ */
const M2_PER_PYEONG = 3.305785;

/**
 * 적재 대상 유형.
 *
 * ── 왜 아파트만 켜져 있나 (2026-07-27) ──────────────────────────────────────
 * 국토부 API 는 오피스텔·연립다세대도 준다(lib/national-data/molit-api.ts 의
 * RTMS_TYPES 에 이미 있다). 그런데 켜기 전에 두 가지가 먼저 필요했다.
 *
 *  1) 집계가 유형을 구분해야 한다. 어제까지 map_price_point_mv·complex_tx_stats·
 *     tx_band_* 는 property_type 조건이 **없었다**. 그 상태로 오피스텔을 넣으면
 *     지도 색상·평단가·"평균 매매가"가 아파트와 오피스텔을 섞어 평균 낸다.
 *     화면 어디에도 안 드러나고 숫자만 그럴듯하게 틀린다.
 *     → 마이그레이션 20260727150000 에서 다섯 집계에 조건을 명시했다.
 *  2) 화면에 유형 선택이 있어야 한다. 없으면 데이터를 넣어도 아무도 못 본다.
 *     지도 필터의 "유형"은 아직 아파트 단일이다.
 *
 *  (1)은 끝났고 (2)는 남았다. 그래서 수집만 먼저 켤 수 있게 스위치를 둔다 —
 *  국토부 API 는 과거 월을 되짚어 주긴 하지만 지금부터 쌓아 두면 나중에 화면이
 *  붙는 날 바로 보여 줄 수 있다.
 *
 * ── 켜는 법 ─────────────────────────────────────────────────────────────────
 * 환경변수 `MOLIT_PROPERTY_TYPES` (쉼표 구분, 기본 "apartment"):
 *   apartment            아파트 매매·전월세      (기본)
 *   officetel            오피스텔 매매·전월세
 *   rowhouse             연립다세대 매매·전월세  ([1024] rh-rent 추가)
 *   house                단독·다가구 매매·전월세 ([1024] 신규)
 * 예) MOLIT_PROPERTY_TYPES=apartment,officetel
 *
 * [1024] 비아파트는 매일 크론 `molit-nonapt-ingest` 가 env 와 무관하게 `types` 옵션으로 켠다
 * (수도권·최근 12개월·raw 미저장). 여기 env 는 전국 일일 크론(molit-transactions-ingest)용이다.
 *
 * 켜기 전에 알아 둘 것: 유형 하나당 시군구 253개 × 월 1회 왕복이 그대로 늘고,
 * market_transactions 행 수도 함께 늘어난다. DB 용량·ETL 시간에 직접 영향이 있다
 * (2026-07-27 에 Nano 티어가 데이터 증가로 응답 불능이 된 전례가 있다).
 */
type TargetType = {
  type: MolitRtmsType;
  transactionType: "trade" | "rent";
  /** market_transactions.property_type 에 그대로 들어간다 — 집계가 이 값으로 유형을 가른다 */
  propertyType: string;
};

const ALL_TARGET_TYPES: Record<string, TargetType[]> = {
  apartment: [
    { type: "apt-sale", transactionType: "trade", propertyType: "apartment" },
    { type: "apt-rent", transactionType: "rent", propertyType: "apartment" },
  ],
  officetel: [
    { type: "offi-sale", transactionType: "trade", propertyType: "officetel" },
    { type: "offi-rent", transactionType: "rent", propertyType: "officetel" },
  ],
  rowhouse: [
    { type: "rh-sale", transactionType: "trade", propertyType: "rowhouse" },
    { type: "rh-rent", transactionType: "rent", propertyType: "rowhouse" },
  ],
  house: [
    { type: "sh-sale", transactionType: "trade", propertyType: "house" },
    { type: "sh-rent", transactionType: "rent", propertyType: "house" },
  ],
};

/** [1024] 유형 그룹 키(apartment·officetel·rowhouse·house) 목록 — 테스트·크론 파라미터 검증용 */
export function listTargetTypeKeys(): string[] {
  return Object.keys(ALL_TARGET_TYPES);
}

/**
 * 이번 실행에서 수집할 유형 목록.
 *
 * 알 수 없는 값은 조용히 무시하지 않고 경고로 남긴다 — 오타 하나로 오피스텔이
 * 안 쌓이고 있는데 아무도 모르는 상황을 만들지 않기 위해서다.
 *
 * @param explicit [1024] env 대신 호출부가 그룹 키를 직접 준다(비아파트 크론). 비어 있으면 env.
 */
export function resolveTargetTypes(explicit?: readonly string[]): TargetType[] {
  const raw = explicit?.length
    ? explicit.join(",")
    : (process.env.MOLIT_PROPERTY_TYPES ?? "apartment").trim();
  const keys = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const out: TargetType[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    const group = ALL_TARGET_TYPES[k];
    if (!group) {
      logger.warn(
        `[molit] MOLIT_PROPERTY_TYPES 에 모르는 값이 있어 건너뜁니다: "${k}" (가능: ${Object.keys(ALL_TARGET_TYPES).join(", ")})`,
      );
      continue;
    }
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(...group);
  }
  // 전부 알 수 없는 값이면 아무것도 안 쌓이는 것보다 기본값이 낫다.
  return out.length > 0 ? out : ALL_TARGET_TYPES.apartment;
}

/* [1027] molitRegionLabel(시군구 정보 → region_name 표기)은 순수 함수라 molit-core.ts 로 옮겼다 —
   지역 알림 구독 값 정리(lib/alerts/region-value.ts)와 그 단위 테스트가 실제 함수를 부른다. 여기서 다시 내보낸다. */

/**
 * 구(區)를 가진 시의 **상위 코드** — RTMS 가 한 번도 응답한 적이 없다.
 *
 * 실측(2026-07-27): 이 12개 코드로 적재된 market_transactions 는 전부 0건인데,
 * 각 시의 하위 구 코드에는 거래가 다 들어와 있다 — 수원 22,866건(41111·41113·
 * 41115·41117), 용인 20,029건, 고양 18,115건, 청주 14,446건, 창원 14,320건,
 * 천안 12,883건, 성남 12,691건, 안양 10,311건, 부천 10,246건, 전주 9,051건,
 * 안산 6,837건, 포항 6,670건. 국토교통부 실거래가 API 는 자치구가 있는 시에
 * 대해서는 구 단위 코드로만 답한다.
 *
 * 그래서 이 12개를 대상에서 빼도 **빠지는 거래는 0건**이고, 매 실행 왕복만
 * 12번(유형 2종이므로 호출 24번) 줄어든다. 하위 구 코드는 그대로 남는다 —
 * 위 목록이 그 근거다. 코드를 지우는 게 아니라 수집 대상에서만 빼므로,
 * 나중에 상위 코드가 응답하기 시작하면 이 상수만 비우면 된다.
 *
 * (legal_regions.enabled 로도 같은 13개를 꺼 뒀지만 그 컬럼은 어느 코드도
 *  읽지 않는다 — 기록용이다. 실제로 호출을 줄이는 건 이 목록이다.)
 */
const MOLIT_PARENT_ONLY_CODES = new Set([
  "41110", // 경기 수원시
  "41130", // 경기 성남시
  "41170", // 경기 안양시
  "41190", // 경기 부천시
  "41270", // 경기 안산시
  "41280", // 경기 고양시
  "41460", // 경기 용인시
  "43110", // 충북 청주시
  "44130", // 충남 천안시
  "47110", // 경북 포항시
  "48120", // 경남 창원시
  "52110", // 전북 전주시
  "41590", // 경기 화성시 — [996] 2026년 만세·효행·병점·동탄구 신설 뒤 상위 코드가 됐다(4월부터 0행 실측)
]);

/** 전국 시군구 코드(자치구 단위) — 앞자리 코드순 */
export function listMolitSigungu(): SigunguInfo[] {
  /* [996] 상위 코드 판정은 표에서 파생(listLeafSigungu) — 아래 상수는 근거 기록 + 이중 안전장치 */
  return listLeafSigungu().filter((i) => !MOLIT_PARENT_ONLY_CODES.has(i.sigunguCd));
}

/** [1024] 수도권 시군구(자치구 단위, 코드순) — 이력 백필·비아파트 수집 대상 */
export function listCapitalSigungu(): SigunguInfo[] {
  return listMolitSigungu().filter((i) => isCapitalAreaCode(i.sigunguCd));
}

/**
 * [997] 계약월 yyyymm 에 적재 행이 0인 시군구(코드 오름차순, limit 개). 조회 실패는 "빈 곳"으로 세지 않는다 —
 * 못 읽은 코드는 건너뛴다(빈 곳으로 잘못 세면 이미 채운 달을 다시 받는다).
 *
 * @param propertyTypes [1024] 이 유형들만 세어 "빈 곳"을 판정한다(비우면 유형 무관). 아파트 92만 행이
 *   이미 있는 (구, 월)에 오피스텔을 넣으려면 아파트 행을 세면 안 된다 — 전부 "채워짐"이 된다.
 */
/**
 * [1040] 조각 upsert — 한 문장에 UPSERT_CHUNK_ROWS 행까지. 문장 시간 제한(57014)에 걸린 조각은 반으로 쪼개 한 번 더 넣는다.
 * written 은 실제로 들어간 행 수다(뒤 조각이 실패해도 앞 조각은 들어갔다 — 호출부가 그 (구, 월)을 다시 받기 명단에 올린다).
 */
export async function upsertInChunks(
  sb: SupabaseClient,
  payload: Record<string, unknown>[],
): Promise<{ written: number; error: string | null; statements: number }> {
  const queue = chunkRows(payload, UPSERT_CHUNK_ROWS);
  let written = 0;
  let statements = 0;
  while (queue.length > 0) {
    const chunk = queue.shift() as Record<string, unknown>[];
    statements += 1;
    const { error } = await sb.from("market_transactions").upsert(chunk, { onConflict: "external_key" });
    if (!error) {
      written += chunk.length;
      continue;
    }
    if (isStatementTimeout(error.message) && chunk.length > UPSERT_MIN_CHUNK_ROWS) {
      const half = Math.ceil(chunk.length / 2);
      queue.unshift(chunk.slice(0, half), chunk.slice(half));
      continue;
    }
    return { written, error: error.message, statements };
  }
  return { written, error: null, statements };
}

export async function findCoverageGaps(
  sb: SupabaseClient,
  yyyymm: string,
  candidates: SigunguInfo[],
  limit: number,
  propertyTypes?: readonly string[],
): Promise<SigunguInfo[]> {
  const out: SigunguInfo[] = [];
  for (const info of candidates) {
    if (out.length >= limit) break;
    let q = sb
      .from("market_transactions")
      .select("id", { count: "exact", head: true })
      .eq("region_code", info.sigunguCd)
      .eq("contract_ym", yyyymm);
    if (propertyTypes?.length) q = q.in("property_type", [...propertyTypes]);
    const { count, error } = await q;
    if (error) continue;
    if ((count ?? 0) === 0) out.push(info);
  }
  return out;
}


function pricePerPyeong(amountKrw: number | null, areaM2: number | null): number | null {
  if (!amountKrw || !areaM2 || areaM2 <= 0) return null;
  const pyeong = areaM2 / M2_PER_PYEONG;
  if (pyeong <= 0) return null;
  return Math.round(amountKrw / pyeong);
}

function manwonToKrw(v: number | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10000) : null;
}

/**
 * 해제(취소)된 계약인가.
 *
 * RTMS 매매 응답은 정상 거래에 cdealType=" "(공백 한 칸), 해제신고된 계약에
 * cdealType="O" 와 해제사유발생일(cdealDay, 예 "26.07.10")을 준다. 전월세 응답에는
 * 두 필드가 아예 없다.
 *
 * 이 값을 그동안 raw 에 담기만 하고 아무도 보지 않았다. 그 결과 2026-07-25 기준
 * 매매 22,869행 중 402행(1.76%)의 "없던 일이 된 계약"이 평균가·구간집계·지도
 * 시세·알림가에 정상 거래로 섞여 있었다(361개 단지 영향, 그중 33개 단지는 실거래가
 * 전부 해제분이라 존재 근거 자체가 해제된 계약뿐이었다). — #150
 */
export function isCancelledDeal(raw: Record<string, unknown> | null | undefined): boolean {
  const type = String(raw?.cdealType ?? "").trim();
  if (type.toUpperCase() === "O") return true;
  // cdealType 이 비어도 해제일자가 찍혀 오는 응답이 있어 함께 본다(보수적 판정).
  return String(raw?.cdealDay ?? "").trim().length > 0;
}

/** 거래 1건 → market_transactions row. 필수값(계약일·단지명) 없으면 null. */
function toRow(
  deal: MolitDeal,
  ctx: {
    info: SigunguInfo;
    regionName: string;
    yyyymm: string;
    kind: "trade" | "rent";
    type: MolitRtmsType;
    propertyType: string;
    /** [1024] false 면 raw 를 저장하지 않는다(과거월·비아파트). 해제 판정은 여기서 이미 끝난다. */
    keepRaw: boolean;
  },
): Record<string, unknown> | null {
  const day = Number(deal.dealDate.slice(8, 10));
  if (!deal.dealDate || !Number.isFinite(day) || day <= 0) return null;
  const name = (deal.name ?? "").trim();
  if (!name) return null;

  const dealKrw = manwonToKrw(deal.dealManwon);
  const depositKrw = manwonToKrw(deal.depositManwon);
  const monthlyKrw = manwonToKrw(deal.monthlyManwon);
  if (ctx.kind === "trade" && !dealKrw) return null;
  if (ctx.kind === "rent" && !depositKrw) return null;

  const areaM2 = typeof deal.areaM2 === "number" && deal.areaM2 > 0 ? deal.areaM2 : null;
  const jibun = (deal.raw.jibun ?? "").trim();
  const umd = (deal.umd ?? "").trim();
  const address = [ctx.info.sigungu, umd, jibun].filter(Boolean).join(" ") || null;

  // external_key — 플랫폼 ETL(40자리 sha1 hex)과 절대 충돌하지 않도록 접두사를 둔다.
  const digest = createHash("sha1")
    .update(
      [ctx.type, ctx.info.sigunguCd, ctx.yyyymm, name, umd, jibun, areaM2 ?? "", deal.floor ?? "", day, dealKrw ?? depositKrw ?? "", monthlyKrw ?? ""].join("|"),
    )
    .digest("hex");

  return {
    external_key: `molit-cron:${digest}`,
    source: "MOLIT",
    transaction_type: ctx.kind,
    /* 예전엔 "apartment" 로 고정돼 있었다. 오피스텔·연립다세대를 켜면 그 거래까지
       아파트로 적재돼, 유형을 구분하는 집계가 있어도 소용이 없었다. */
    property_type: ctx.propertyType,
    region_code: ctx.info.sigunguCd,
    region_name: ctx.regionName,
    complex_name: name,
    address,
    contract_ym: ctx.yyyymm,
    contract_day: day,
    deal_amount_krw: dealKrw,
    deposit_krw: depositKrw,
    /* 전세 표기는 0 하나로 통일한다 — NULL 과 0 이 섞이면 `is null` 로 골라도
       `= 0` 으로 골라도 조용히 일부가 샌다 (데이터 품질 검사 jeonse_dual_encoding).
       원천이 값을 아예 안 준 rent 행도 "월세 없음(전세)" 사실은 같으므로 0. */
    monthly_rent_krw: ctx.kind === "rent" ? (monthlyKrw ?? 0) : monthlyKrw,
    area_m2: areaM2,
    floor: Number.isFinite(deal.floor) ? deal.floor : null,
    build_year: Number.isFinite(deal.buildYear) ? deal.buildYear : null,
    /* 월세(월세액>0) 행의 평단가는 계산하지 않는다(null). 보증금÷평은 월세를
       무시한 거짓 평단가고(보증금 3천/월 180 집이 "평당 1.2만원"), 월세를
       반영하려면 전월세 환산율을 지어내야 한다 — 몰라서 비우는 것이 틀리게
       채우는 것보다 낫다. 전세(월세 0)는 보증금이 곧 가격이므로 그대로 계산.
       (2026-08-10 데이터 품질 검사 rent_ppp_from_deposit 221,420행의 재발 방지.
        기존 행은 마이그레이션이 null 로 비웠다 — 복원식은 그 파일에.) */
    price_per_pyeong_krw:
      ctx.kind === "rent" && (monthlyKrw ?? 0) > 0
        ? null
        : pricePerPyeong(ctx.kind === "trade" ? dealKrw : depositKrw, areaM2),
    // 해제분도 행 자체는 남긴다(해제 이력도 사실이다). 다만 시세·집계·알림에서는
    // is_cancelled=true 로 걸러진다 — 판정은 적재 시 한 번만 한다.
    is_cancelled: isCancelledDeal(deal.raw),
    raw: ctx.keepRaw ? deal.raw : compactRaw(deal.raw),
    collected_at: new Date().toISOString(),
  };
}

export interface MolitIngestResult {
  ok: boolean;
  configured: boolean;
  yyyymm: string;
  /** 이번 실행이 처리한 시군구 슬라이스 인덱스 */
  slice: number;
  sliceSize: number;
  totalSigungu: number;
  /** 실제 API 호출·적재를 시도한 시군구 수 */
  attempted: number;
  /** 이미 데이터가 있어 건너뛴 시군구 수 */
  alreadyCovered: number;
  /** 적재된 행 수 */
  inserted: number;
  /** API 가 0건을 반환한 시군구 수 */
  empty: number;
  errors: number;
  /**
   * DB 연속 오류로 남은 시군구를 처리하지 못하고 중단했는가.
   *
   * true 면 이 실행은 "슬라이스를 다 돌았는데 데이터가 없었다" 가 아니라
   * "확인하지 못한 채 멈췄다" 는 뜻이다. 두 상태를 섞으면 다음 실행이
   * "이미 봤다" 고 착각한다.
   */
  aborted: boolean;
  regions: { code: string; name: string; rows: number; status: "inserted" | "covered" | "empty" | "error" }[];
  /**
   * [1010] 이번 실행이 **실제로 upsert 한 행들**의 (region_name, complex_name) 집합.
   *
   * 왜 필요한가: 단지 허브(/complex/[id])의 ISR TTL 을 6시간 → 7일로 넓히는 대신,
   * 적재가 끝난 순간 **바뀐 단지만** 비운다(크론 라우트가 encodeComplexId 로 id 를 만들어
   * invalidateComplexIds 에 넘긴다). 안 바뀐 단지는 크롤러가 몇 번을 와도 CDN HIT 이다 —
   * 실측(2026-09-20~22): /complex/[id] 하루 11,523 렌더 vs 사람 방문 30일 27회.
   *
   * 상한(TOUCHED_COMPLEX_CAP)을 넘으면 잘라내고 touchedTruncated=true 를 세운다 —
   * 메모리와 크론 응답을 이 목록이 좌우하면 안 된다. 잘린 몫은 7일 TTL 이 받는다.
   */
  touchedComplexes: { region: string; name: string }[];
  /** 상한에 걸려 잘라낸 단지가 있는가 */
  touchedTruncated: boolean;
  reason?: string;
  /**
   * 적재 후 실거래 집계 MV 재계산 결과.
   * 적재된 행이 0이면 집계가 달라질 수 없어 호출하지 않는다(= undefined).
   */
  aggregates?: RefreshAggregatesResult;
}

function ymOf(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 전달(yyyymm) — 신고지연이 대부분 반영된 완전한 달 */
export function defaultTargetMonth(now = new Date()): string {
  return ymOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

/** 당월(yyyymm) — 이번 달 새 실거래 */
export function currentTargetMonth(now = new Date()): string {
  return ymOf(now);
}

/**
 * yyyymm 미지정 시 자동 대상 월 — **당월과 전월을 날짜 홀짝으로 번갈아** 고른다.
 *
 * 왜 바꿨나 (2026-08-12 실측 결함): 예전엔 전달만 수집했다. 신고지연(계약 후 30일
 * 내 신고)으로 전달이 더 완전하다는 이유였는데, 부작용이 컸다 — 전달이 한 번
 * 완전 커버되면(‘기존커버=24 시도=0’) 그 뒤로는 매일 돌아도 새로 적재할 게 없어
 * **당월 실거래가 사이트에 영영 안 올라온다.** 8월 12일에 사이트 최신 계약월이
 * 여전히 202607(7월)에 멈춰 있었던 게 정확히 이 때문이다.
 *   · 당월(짝수날): 이번 달 새 실거래를 들여와 신선도 확보(초반엔 표본이 얇지만
 *     매일 늘어난다).
 *   · 전월(홀수날): 뒤늦게 신고된 지난달 계약을 계속 흡수해 완전성 유지.
 * 크론이 하루 1회라 창(12h) 홀짝은 매일 같은 값이 되므로, 창이 아니라 **일수**
 * 홀짝으로 나눈다. 이미 채운 (시군구,계약월)은 건너뛰므로 재방문 비용은 낮다.
 */
export function autoTargetMonth(now = new Date()): string {
  const dayNum = Math.floor(now.getTime() / (1000 * 60 * 60 * 24));
  return dayNum % 2 === 0 ? currentTargetMonth(now) : defaultTargetMonth(now);
}

/**
 * 시군구 슬라이스 단위 실거래 적재.
 *
 * @param opts.yyyymm     대상 계약월(기본: 전달)
 * @param opts.sliceSize  1회 실행에서 처리할 시군구 수(기본 16)
 * @param opts.slice      슬라이스 인덱스(기본: 12시간 창 기준 자동 회전)
 * @param opts.codes      특정 시군구 코드만 처리(수동 실행용)
 * @param opts.gapsFirst  [997] 그 달에 **0행인 시군구**만 골라 처리(sliceSize 개까지). 행정구역 개편(996)처럼
 *                        코드가 바뀌어 한 번도 못 채운 구·월을 슬라이스 회전(8일 주기·당월 한정)에 맡기지 않고
 *                        GH ETL 이 매일 지난 달들에 대해 메운다. 빈 곳이 없으면 아무것도 하지 않는다.
 *                        [1024] codes 와 함께 주면 **그 코드들 중** 빈 곳만 고른다(수도권 백필).
 * @param opts.keepRaw    [1024] false 면 raw 를 저장하지 않는다(기본 true — 일일 크론은 예전과 같다).
 * @param opts.types      [1024] 유형 그룹 키(apartment·officetel·rowhouse·house). 비우면 env(MOLIT_PROPERTY_TYPES).
 * @param opts.maxPages   [1024] 유형·구·월당 최대 페이지(기본 1 = 예전과 같다). 백필은 3.
 */
export async function ingestMolitTransactions(opts: {
  yyyymm?: string;
  sliceSize?: number;
  slice?: number;
  codes?: string[];
  gapsFirst?: boolean;
  now?: Date;
  keepRaw?: boolean;
  types?: readonly string[];
  maxPages?: number;
} = {}): Promise<MolitIngestResult> {
  const now = opts.now ?? new Date();
  const yyyymm = (opts.yyyymm ?? autoTargetMonth(now)).replace(/[^0-9]/g, "").slice(0, 6);
  const all = listMolitSigungu();
  /* [1025] 상한 60 → 200 — 이력 백필이 1회 160곳을 넘긴다(gapsFirst 경로). 일일 크론 기본 16 은 그대로 */
  const sliceSize = Math.max(1, Math.min(200, opts.sliceSize ?? 16));
  const keepRaw = opts.keepRaw ?? true;
  const maxPages = Math.max(1, Math.min(10, opts.maxPages ?? 1));
  /* 수집 유형은 실행마다 환경변수로 정해진다(기본 아파트). 왜 스위치로 뒀는지는
     ALL_TARGET_TYPES 위 주석 참고. [1024] 호출부가 types 를 주면 env 를 보지 않는다. */
  const targetTypes = resolveTargetTypes(opts.types);
  /* [1024] 커버 판정은 이 실행이 다루는 property_type 만 센다 — 아파트 행이 있다고 오피스텔이 "채워진" 게 아니다 */
  const propertyTypes = [...new Set(targetTypes.map((t) => t.propertyType))];
  logger.info(
    `[molit] ${yyyymm} 수집 유형: ${targetTypes.map((t) => t.type).join(", ")}`,
  );

  const base: Omit<MolitIngestResult, "ok" | "reason"> = {
    configured: true,
    yyyymm,
    slice: 0,
    sliceSize,
    totalSigungu: all.length,
    attempted: 0,
    alreadyCovered: 0,
    inserted: 0,
    empty: 0,
    errors: 0,
    aborted: false,
    regions: [],
    touchedComplexes: [],
    touchedTruncated: false,
  };

  const sb = getServiceSupabase();
  if (!sb) {
    return { ...base, ok: false, configured: false, reason: "Supabase 미설정" };
  }

  /* [1040] 덜 들어간 (구, 월) — 지난 실행에서 앞 조각만 들어간 곳. 빈 곳 찾기(gapsFirst)는 행이 하나라도 있으면
     건너뛰므로, 명단에 있는 구는 맨 앞에 세우고 "채워짐" 판정도 건너뛴다. 명단을 못 읽으면 빈 명단으로 간다. */
  const typesKey = redoTypesKey(propertyTypes);
  const redoStore = await readCursor<{ items?: RedoEntry[] }>(MOLIT_REDO_KEY);
  const redoList: RedoEntry[] = Array.isArray(redoStore?.items) ? (redoStore?.items as RedoEntry[]) : [];
  const redoCodes = new Set(redoCodesFor(redoList, yyyymm, typesKey));
  const redoAdd: RedoEntry[] = [];
  const redoDone: RedoEntry[] = [];
  const withRedoFirst = (candidates: SigunguInfo[], gaps: SigunguInfo[]): SigunguInfo[] => {
    if (redoCodes.size === 0) return gaps;
    const first = candidates.filter((i) => redoCodes.has(i.sigunguCd));
    const rest = gaps.filter((i) => !redoCodes.has(i.sigunguCd));
    return [...first, ...rest].slice(0, Math.max(sliceSize, first.length));
  };

  let targets: SigunguInfo[];
  let sliceIdx = 0;
  if (opts.codes?.length) {
    const infos = opts.codes
      .map((c) => getSigunguInfo(c.trim()))
      .filter((i): i is SigunguInfo => Boolean(i));
    if (opts.gapsFirst) {
      /* [1024] 주어진 코드 집합 안에서 빈 (시군구, 계약월, 유형)만 — 수도권 이력 백필이 쓴다. 상한은 sliceSize. */
      targets = withRedoFirst(infos, await findCoverageGaps(sb, yyyymm, infos, sliceSize, propertyTypes));
      sliceIdx = -1;
    } else {
      targets = infos.slice(0, 60);
    }
  } else if (opts.gapsFirst) {
    /* [997] 빈 (시군구, 계약월) 먼저 — (region_code, contract_ym) 인덱스로 HEAD 카운트만 돈다(코드당 1왕복,
       전국 ~260개 ≈ 수 초). 빈 곳이 없으면 targets 가 비어 루프가 바로 끝난다(= 로그 "시도=0"). */
    targets = withRedoFirst(all, await findCoverageGaps(sb, yyyymm, all, sliceSize, propertyTypes));
    sliceIdx = -1;
  } else {
    const windows = Math.max(1, Math.ceil(all.length / sliceSize));
    sliceIdx = opts.slice ?? Math.floor(now.getTime() / (1000 * 60 * 60 * 12)) % windows;
    targets = all.slice(sliceIdx * sliceSize, sliceIdx * sliceSize + sliceSize);
  }

  const result: MolitIngestResult = { ...base, ok: true, slice: sliceIdx };

  /* 첫 오류의 실제 메시지. 2026-07-25 장애 때 적재 로그에는 "오류=13"이라는 숫자만
     남아 있어서, 원인(legal_regions FK 위반)을 찾으려면 Postgres 로그를 뒤져야 했다 —
     Vercel 런타임 로그는 보존 기간이 짧아 이미 사라진 뒤였다. 로그는 "몇 개 실패"가
     아니라 "왜 실패"까지 남아야 다음 사람이 같은 삽질을 반복하지 않는다. */
  let firstError: string | null = null;

  /* [1010] 실제로 upsert 된 행에서만 모은다 — 건너뛴 구(covered)·빈 응답·오류는 담지 않는다.
     상한을 넘으면 더 담지 않고 표식만 세운다(createTouchedComplexSink) — 여기서 자라는 것은
     메모리와 크론 응답 크기다. */
  const touched = createTouchedComplexSink();

  /* 연속 DB 오류 차단기 ───────────────────────────────────────────────────
     2026-07-26, 무료 플랜 DB 가 디스크 I/O 로 막혀 PostgREST 가 사실상 모든
     요청에 503 을 내는 동안, 이 루프는 두 시간 넘게 시군구를 끝까지 돌며
     HEAD·POST 를 계속 쐈다. 적재된 행은 0이었고, 그 부하 자체가 DB 회복을
     막았다(= 배포까지 같이 멈췄다).

     DB 가 연속으로 죽어 있으면 남은 시군구도 같은 답을 받는다. 계속 두드려서
     얻는 것은 없고 잃는 것만 있다 — 조기에 멈추고 "중단했다" 고 보고하는 편이
     사실에 가깝고 DB 에도 숨통을 준다. 성공하면 카운터는 0으로 돌아가므로
     간헐적 오류로는 멈추지 않는다. */
  const DB_ERROR_ABORT_THRESHOLD = 5;
  let consecutiveDbErrors = 0;
  let aborted = false;
  /* [1030 · 5차] 국토부 쪽이 "등록되지 않은 서비스키"(resultCode 30)로 답하면 그 서비스는 이 키로 **활용신청이 안 된 것**이라
     남은 시군구·다음 유형도 전부 같은 답이다. 2026-10-03·04 실측: 비아파트 수집이 매일 42회를 두드려 42회 실패하고
     "실패 · 0행"으로만 남았다. 첫 응답에서 멈추고 무엇을 신청해야 하는지 적는다 — 승인되면 다음 실행이 그대로 이어진다. */
  let notRegistered: string | null = null;

  /** DB 오류 1건 기록. 차단 임계에 닿으면 true(= 루프를 끊어라)를 돌려준다. */
  async function noteDbFailure(info: SigunguInfo, regionName: string, msg: string): Promise<boolean> {
    consecutiveDbErrors += 1;
    result.errors += 1;
    result.regions.push({ code: info.sigunguCd, name: regionName, rows: 0, status: "error" });
    firstError ??= `${info.sigunguCd}: ${msg}`;
    logger.warn("[molit-tx]", info.sigunguCd, msg);
    if (consecutiveDbErrors >= DB_ERROR_ABORT_THRESHOLD) return true;
    /* 흔들리는 DB 에 곧바로 다음 요청을 얹지 않는다 — 연속 실패마다 물러선다. */
    await new Promise((r) => setTimeout(r, 1_000 * consecutiveDbErrors));
    return false;
  }

  for (const info of targets) {
    const regionName = molitRegionLabel(info);
    try {
      // 이미 플랫폼 ETL 이 채운 구·월이면 건너뜀 (이중 계상 방지)
      /* [1024] 이 실행의 유형만 센다 — 아파트 행이 있는 (구, 월)에 오피스텔을 넣을 수 있어야 한다 */
      const { count, error: coverageError } = await sb
        .from("market_transactions")
        .select("id", { count: "exact", head: true })
        .eq("region_code", info.sigunguCd)
        .eq("contract_ym", yyyymm)
        .in("property_type", propertyTypes);
      /* 조회 실패를 "아직 안 채워졌다" 로 바꾸지 않는다. 여기서 그냥 진행하면
         이미 채운 달을 MOLIT 에서 다시 받아 다시 upsert 한다 — 실패한 DB 를
         더 두드리면서, 확인도 못 한 채. 못 읽었으면 못 읽었다고 센다. */
      if (coverageError) {
        if (await noteDbFailure(info, regionName, `기존 적재 여부 확인 실패 — ${coverageError.message}`)) {
          aborted = true;
          break;
        }
        continue;
      }
      consecutiveDbErrors = 0;
      /* 최근 달(신고지연 흡수 구간)은 행이 있어도 다시 받는다 — external_key upsert 라 이중 계상 없음 */
      const isRecent = isRecentMonth(yyyymm, now);
      if (!isRecent && (count ?? 0) > 0 && !redoCodes.has(info.sigunguCd)) {
        result.alreadyCovered += 1;
        result.regions.push({ code: info.sigunguCd, name: regionName, rows: count ?? 0, status: "covered" });
        continue;
      }

      result.attempted += 1;
      const rows: Record<string, unknown>[] = [];
      let mode: "live" | "mock" = "mock";
      /* [1024] "못 불렀다"(키 없음·네트워크·오류 XML)와 "불렀는데 0건"을 가른다. 예전엔 셋 다 mode:"mock" 하나로
         configured=false·"빈응답" 이 됐다. 이력 백필 커서는 configured=false 면 달을 넘기지 않으므로, 진짜 거래가
         없는 구(옹진군 같은 곳)를 "키 없음"으로 읽으면 백필이 그 달에 영원히 멈춘다. 반대로 네트워크 실패를
         "0건"으로 읽으면 그 (구, 월)이 빈 채로 넘어간다. */
      let notConfigured = false;
      let fetchFailed = false;
      /* [1025] 첫 실패의 사유(molit-api detail — "RTMSDataSvcOffiRent 30 SERVICE_KEY_IS_NOT_REGISTERED_ERROR" 등).
         2026-09-29 비아파트 42건이 "응답 실패(네트워크·5xx·오류 XML)" 로만 남아 원인을 못 짚었다. */
      let fetchDetail: string | null = null;
      for (const t of targetTypes) {
        const res = await fetchMolitDeals(t.type, {
          lawdCd: info.sigunguCd, // 이름 매칭 금지 — 동명이구 오적재 방지 (아래 커밋 메시지 참고)
          district: info.sigungu,
          yyyymm,
          numOfRows: 1000,
          maxPages,
        });
        if (res.mode === "live") mode = "live";
        else if (res.reason === "not-configured") notConfigured = true;
        else if (res.reason === "fetch-failed") fetchFailed = true;
        if (res.reason === "fetch-failed") fetchDetail ??= res.detail ?? null;
        if (res.reason === "fetch-failed" && res.detail && isServiceNotRegistered(res.detail)) {
          notRegistered ??= res.detail.split(/\s+/)[0] || res.detail;
          break;
        }
        for (const deal of res.deals) {
          const row = toRow(deal, {
            info,
            regionName,
            yyyymm,
            kind: t.transactionType,
            type: t.type,
            propertyType: t.propertyType,
            keepRaw,
          });
          if (row) rows.push(row);
        }
      }

      if (notConfigured) {
        // 인증키 미설정 — 조용히 종료(가짜 데이터 생성 금지)
        result.configured = false;
        result.regions.push({ code: info.sigunguCd, name: regionName, rows: 0, status: "empty" });
        result.empty += 1;
        continue;
      }
      if (fetchFailed) {
        /* 유형 하나라도 못 받았으면 이 구·월은 통째로 다음 실행에 — 절반만 넣으면 (구, 월, 유형) 커버 판정이
           "채워짐"이 되어 나머지 절반은 영영 안 온다. DB 오류가 아니므로 연속 오류 차단기는 건드리지 않는다. */
        result.errors += 1;
        result.regions.push({ code: info.sigunguCd, name: regionName, rows: 0, status: "error" });
        firstError ??= `${info.sigunguCd}: 국토부 API 응답 실패(${fetchDetail ?? "네트워크·5xx·오류 XML"})`;
        logger.warn("[molit-tx]", info.sigunguCd, yyyymm, "국토부 API 응답 실패", fetchDetail ?? "(사유 없음)");
        if (notRegistered) {
          aborted = true;
          break;
        }
        continue;
      }
      if (mode !== "live" || rows.length === 0) {
        /* 정상 응답인데 0건 — 그 달 그 구에 신고된 거래가 없다(사실) */
        if (redoCodes.has(info.sigunguCd)) redoDone.push({ code: info.sigunguCd, ym: yyyymm, types: typesKey });
        result.empty += 1;
        result.regions.push({ code: info.sigunguCd, name: regionName, rows: 0, status: "empty" });
        continue;
      }

      // external_key 중복 제거 후 upsert
      const dedup = new Map<string, Record<string, unknown>>();
      for (const r of rows) dedup.set(String(r.external_key), r);
      const payload = [...dedup.values()];

      /* [1040] 500행씩 나눠 넣는다 — 한 구 한 달치(백필은 최대 6,000행)를 한 문장으로 넣으면 문장 시간 제한(8초)에
         걸린다(2026-10-06 시흥시). 시간 제한에 걸린 조각은 반으로 쪼개 다시 넣는다(upsertInChunks). */
      const redoEntry: RedoEntry = { code: info.sigunguCd, ym: yyyymm, types: typesKey };
      const up = await upsertInChunks(sb, payload);
      if (up.error) {
        /* 앞 조각은 들어갔다(사실) — 행 수에 세고, 이 (구, 월)을 다음 실행이 먼저 다시 받게 적어 둔다 */
        if (up.written > 0) {
          result.inserted += up.written;
          redoAdd.push(redoEntry);
        }
        if (await noteDbFailure(info, regionName, `${up.error}(${up.written}/${payload.length}행 저장)`)) {
          aborted = true;
          break;
        }
        continue;
      }
      if (redoCodes.has(info.sigunguCd)) redoDone.push(redoEntry);
      consecutiveDbErrors = 0;
      result.inserted += payload.length;
      /* [1010] upsert 가 성공한 뒤에만 센다 — 실패한 구의 단지를 비우면 "바뀌었다"는 거짓말이다. */
      for (const r of payload) touched.note(regionName, String(r.complex_name ?? ""));
      result.regions.push({ code: info.sigunguCd, name: regionName, rows: payload.length, status: "inserted" });
    } catch (e) {
      result.errors += 1;
      result.regions.push({ code: info.sigunguCd, name: regionName, rows: 0, status: "error" });
      const msg = e instanceof Error ? e.message : String(e);
      firstError ??= `${info.sigunguCd}: ${msg}`;
      logger.warn("[molit-tx]", info.sigunguCd, msg);
    }

    // data.go.kr rate limit 여유
    await new Promise((r) => setTimeout(r, 150));
  }

  /* [1040] 다시 받기 명단 갱신 — 바뀐 게 있을 때만 쓴다. 쓰기 실패는 경고뿐(writeCursor) — 적재 결과는 사실이다. */
  if (redoAdd.length > 0 || redoDone.length > 0) {
    await writeCursor(MOLIT_REDO_KEY, { items: mergeRedo(redoList, redoAdd, redoDone), updatedAt: now.toISOString() });
  }

  result.aborted = aborted;
  result.ok = result.errors === 0;
  /* [1010] 크론 라우트가 이 집합만 비운다(invalidateComplexIds). 순서는 적재 순서 그대로 —
     무효화 상한에 걸려 잘려도 "먼저 적재된 시군구부터" 라는 뜻이 유지된다. */
  result.touchedComplexes = touched.list();
  result.touchedTruncated = touched.truncated();
  if (aborted && notRegistered) {
    result.reason =
      `활용신청 필요 — ${notRegistered}: 공공데이터포털(data.go.kr)에서 이 서비스를 활용신청하고 승인되면 다음 실행이 이어서 받는다. ` +
      `남은 시군구 ${Math.max(0, targets.length - result.regions.length)}곳은 시도하지 않음(같은 답).` +
      (firstError ? ` 첫오류=${firstError.slice(0, 160)}` : "");
  } else if (aborted) {
    /* "슬라이스를 다 봤다" 와 구분되게 이유를 남긴다 — 남은 시군구는 미확인이다. */
    result.reason =
      `데이터베이스 오류가 ${DB_ERROR_ABORT_THRESHOLD}회 연속이라 중단했습니다. ` +
      `남은 시군구(${Math.max(0, targets.length - result.regions.length)}곳)는 확인하지 못했습니다 — ` +
      `적재 완료가 아니라 중단입니다.` +
      (firstError ? ` 첫오류=${firstError.slice(0, 200)}` : "");
  }

  /* 적재 직후 집계 재계산 — **부르지 않는다.**
   *
   * 예전 주석은 "실측 8.75초" 라고 적혀 있었지만, 지금 이 경로는 PostgREST 를
   * 지나므로 authenticator 의 statement_timeout(8초)을 물려받는다. DB 쪽
   * refresh_market_aggregates() 는 600초 미만 예산이면 스스로 물러나도록
   * 되어 있어(예산 가드), 이 호출은 **매번 deferred 로 끝났다.**
   *
   * 실측(2026-08-26): etl_runs 의 market-aggregates-http 최근 9건이 전부
   *   {"reason":"insufficient statement_timeout","budget_ms":8000,"required_ms":600000}
   * 이다. 즉 이 줄은 5일 동안 아홉 번 불려서 아홉 번 아무 일도 안 하고,
   * 대신 etl_runs 에 잡음만 아홉 줄 남겼다.
   *
   * 집계 갱신은 pg_cron market-aggregates-daily(19:00 UTC, 900초 예산)가
   * 책임진다. 2026-08-26 에 그 잡의 무거운 구간(25개월 전체 재구축)을 최근
   * 4개월로 줄여 5.5초로 떨어뜨렸으므로, 하루 한 번으로 충분히 따라온다.
   * 여기서 다시 부르려면 8초 안에 끝나는 별도 경량 함수가 있어야 하고,
   * 그건 지금 없다 — 없는 것을 있는 척 부르지 않는다. */
  void aborted;

  await logIngest({
    source: "molit",
    dataset: `${molitDatasetLabel(propertyTypes)} ${yyyymm}`,
    origin: "cron-fetch",
    rows: result.inserted,
    /* [1040] 활용신청이 안 된 서비스(국토부 30번 응답)는 고장이 아니라 바깥 승인 대기 — 한 행도 못 넣었으면 skipped
       (needsServiceApproval 주석). 그 밖의 오류는 예전대로 error. */
    status:
      aborted && notRegistered && result.inserted === 0
        ? "skipped"
        : result.errors > 0
          ? "error"
          : result.inserted > 0
            ? "ok"
            : "skipped",
    message:
      `slice=${result.slice} 시도=${result.attempted} 기존커버=${result.alreadyCovered} 빈응답=${result.empty} 오류=${result.errors}` +
      (keepRaw ? "" : " raw=미저장") +
      /* [1040] 중단 사유를 가른다 — 활용신청 중단에도 "DB오류 5회 연속"이라고 적혀 원인을 잘못 짚게 했다 */
      (aborted
        ? notRegistered
          ? ` 중단=활용신청 필요(${notRegistered} · 남은 시군구 미시도)`
          : ` 중단=DB오류${DB_ERROR_ABORT_THRESHOLD}회연속(남은 시군구 미확인)`
        : "") +
      (firstError ? ` 첫오류=${firstError.slice(0, 300)}` : ""),
  });

  return result;
}
