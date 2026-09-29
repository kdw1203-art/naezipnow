/**
 * [1025] K-apt 공동주택 관리비 API 클라이언트 — V3 오퍼레이션 22개(공용 17 + 개별 5) → 단지·월 한 행(+항목별 금액).
 *
 * [1024] 는 서비스명을 브리프 표기(접미 없음)·오퍼레이션 하나(getHsmpCmnuseManageCostInfo)로 짐작해 불렀고, 첫 실행이
 * 200곳 전부 HTTP 400(그런 오퍼레이션이 없다)이었다. 실제 API(2026-09-29 확인):
 *
 *   공용관리비  https://apis.data.go.kr/1613000/AptCmnuseManageCostServiceV3/<op>   op 17개
 *     인건비 getHsmpLaborCostInfoV3 · 제세공과금 getHsmpTaxdueInfoV3 · 차량유지비 getHsmpVhcleMntncCostInfoV3 ·
 *     그밖의부대비용 getHsmpEtcCostInfoV3 · 사무비 getHsmpOfcrkCostInfoV3 · 피복비 getHsmpClothingCostInfoV3 ·
 *     교육훈련비 getHsmpEduTraingCostInfoV3 · 청소비 getHsmpCleaningCostInfoV3 · 경비비 getHsmpGuardCostInfoV3 ·
 *     소독비 getHsmpDisinfectionCostInfoV3 · 승강기유지비 getHsmpElevatorMntncCostInfoV3 ·
 *     지능형홈네트워크 getHsmpHomeNetworkMntncCostInfoV3 · 수선비 getHsmpRepairsCostInfoV3 ·
 *     시설유지비 getHsmpFacilityMntncCostInfoV3 · 안전점검비 getHsmpSafetyCheckUpCostInfoV3 ·
 *     재해예방비 getHsmpDisasterPreventionCostInfoV3 · 위탁관리수수료 getHsmpConsignManageFeeInfoV3
 *   개별사용료  https://apis.data.go.kr/1613000/AptIndvdlzManageCostServiceV3/<op>  op 5개
 *     난방비 getHsmpHeatCostInfoV3 · 급탕비 getHsmpHotWaterCostInfoV3 · 가스사용료 getHsmpGasRentalFeeInfoV3 ·
 *     전기료 getHsmpElectricityCostInfoV3 · 수도료 getHsmpWaterCostInfoV3
 *   파라미터    kaptCode(단지코드) · searchDate(YYYYMM)
 *   응답        response.body.item — 그 달 자료가 없으면 null(행 없음)
 *
 * 금액 규칙 — 공용은 op 별 금액 칸 합. 문서에 칸 이름이 확인된 다섯 op 는 이름으로 더하고(인건비·제세공과금·차량유지비·
 * 그밖의부대비용·사무비), 나머지 op 는 식별 칸(kaptCode·kaptName·searchDate …)을 뺀 숫자 칸 합(sumCostFields).
 * 개별사용료는 공용(…C)·전용(…P) 칸 합 — C/P 로 끝나는 숫자 칸이 하나도 없으면 숫자 칸 합으로 대신한다.
 * 응답이 없으면(item null) 그 항목은 null — 0 과 모름을 섞지 않는다. 행은 22개 항목이 전부 null 이면 만들지 않는다.
 *
 * 호출량 — 단지당 22회 × 1회 200곳 = 4,400/일. 다른 크론과 합쳐 data.go.kr 일일 한도 10,000 안(molit-core 주석).
 * 인증키는 apt-master 와 같은 data.go.kr 인코딩 키(MOLIT_SERVICE_KEY / DATA_GO_KR_ENCODING_KEY).
 * 버전은 APT_MGMT_COST_API_VERSION(숫자, 기본 3)으로 덮는다 — 다음 개편 때 코드를 다시 고치지 않게.
 */
import { fetchAptJson } from "@/lib/national-data/apartment-api";

const VERSION = String(process.env.APT_MGMT_COST_API_VERSION ?? "3").replace(/\D/g, "") || "3";
const V = `V${VERSION}`;
export const KAPT_COMMON_COST_SERVICE = `AptCmnuseManageCostService${V}`;
export const KAPT_INDIVIDUAL_COST_SERVICE = `AptIndvdlzManageCostService${V}`;

export interface MgmtFeeOpSpec {
  /** 오퍼레이션명(버전 접미 포함) */
  op: string;
  /** items jsonb 의 키(영문, 안정) */
  key: string;
  /** 한글 항목명(로그·화면) */
  label: string;
  /** 문서로 확인된 금액 칸 — 있으면 이 칸만 더한다 */
  fields?: readonly string[];
}

/** 공용관리비 17개 */
export const KAPT_COMMON_COST_OPS: readonly MgmtFeeOpSpec[] = [
  {
    op: `getHsmpLaborCostInfo${V}`,
    key: "labor",
    label: "인건비",
    fields: ["pay", "sundryCost", "bonus", "pension", "accidentPremium", "employPremium", "nationalPension", "healthPremium", "welfareBenefit"],
  },
  { op: `getHsmpTaxdueInfo${V}`, key: "taxdue", label: "제세공과금", fields: ["electCost", "telCost", "postageCost", "taxrestCost"] },
  { op: `getHsmpVhcleMntncCostInfo${V}`, key: "vehicle", label: "차량유지비", fields: ["fuelCost", "refairCost", "carInsurance", "carEtc"] },
  { op: `getHsmpEtcCostInfo${V}`, key: "etc", label: "그밖의부대비용", fields: ["careItemCost", "accountingCost", "hiddenCost"] },
  { op: `getHsmpOfcrkCostInfo${V}`, key: "office", label: "사무비", fields: ["officeSupply", "bookSupply", "transportCost"] },
  { op: `getHsmpClothingCostInfo${V}`, key: "clothing", label: "피복비" },
  { op: `getHsmpEduTraingCostInfo${V}`, key: "training", label: "교육훈련비" },
  { op: `getHsmpCleaningCostInfo${V}`, key: "cleaning", label: "청소비" },
  { op: `getHsmpGuardCostInfo${V}`, key: "guard", label: "경비비" },
  { op: `getHsmpDisinfectionCostInfo${V}`, key: "disinfection", label: "소독비" },
  { op: `getHsmpElevatorMntncCostInfo${V}`, key: "elevator", label: "승강기유지비" },
  { op: `getHsmpHomeNetworkMntncCostInfo${V}`, key: "homeNetwork", label: "지능형홈네트워크설비유지비" },
  { op: `getHsmpRepairsCostInfo${V}`, key: "repairs", label: "수선비" },
  { op: `getHsmpFacilityMntncCostInfo${V}`, key: "facility", label: "시설유지비" },
  { op: `getHsmpSafetyCheckUpCostInfo${V}`, key: "safetyCheck", label: "안전점검비" },
  { op: `getHsmpDisasterPreventionCostInfo${V}`, key: "disasterPrevention", label: "재해예방비" },
  { op: `getHsmpConsignManageFeeInfo${V}`, key: "consignFee", label: "위탁관리수수료" },
];

/** 개별사용료 5개 — 공용(…C)·전용(…P) 칸 합 */
export const KAPT_INDIVIDUAL_COST_OPS: readonly MgmtFeeOpSpec[] = [
  { op: `getHsmpHeatCostInfo${V}`, key: "heat", label: "난방비" },
  { op: `getHsmpHotWaterCostInfo${V}`, key: "hotWater", label: "급탕비" },
  { op: `getHsmpGasRentalFeeInfo${V}`, key: "gas", label: "가스사용료" },
  { op: `getHsmpElectricityCostInfo${V}`, key: "electricity", label: "전기료" },
  { op: `getHsmpWaterCostInfo${V}`, key: "water", label: "수도료" },
];

/** 단지당 호출 수(22) — 일일 한도 계산·테스트가 본다 */
export const KAPT_MGMT_FEE_CALLS_PER_COMPLEX = KAPT_COMMON_COST_OPS.length + KAPT_INDIVIDUAL_COST_OPS.length;

/**
 * 금액이 아닌 식별·메타 필드 — 합산에서 뺀다. 응답에 이 밖의 문자열 필드가 있어도 숫자로 못 읽으면 자연히 빠진다.
 */
export const MGMT_FEE_IDENTITY_KEYS: ReadonlySet<string> = new Set([
  "kaptCode",
  "kaptName",
  "searchDate",
  "resultCode",
  "resultMsg",
  "numOfRows",
  "pageNo",
  "totalCount",
  "bjdCode",
  "sigunguCd",
  "sido",
  "sigungu",
]);

function toAmount(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const text = String(v).replace(/,/g, "").trim();
  if (text === "" || !/^-?\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/**
 * 응답 항목 하나의 금액 합(원). 숫자로 읽히는 필드가 하나도 없으면 null — "0원"과 "모름"을 섞지 않는다.
 * 음수는 환급·정산 항목일 수 있어 그대로 더한다(합이 음수면 null 로 버린다 — 관리비 총액이 음수일 수는 없다).
 */
export function sumCostFields(item: Record<string, unknown>, identityKeys = MGMT_FEE_IDENTITY_KEYS): number | null {
  let sum = 0;
  let seen = 0;
  for (const [k, v] of Object.entries(item)) {
    if (identityKeys.has(k)) continue;
    const n = toAmount(v);
    if (n === null) continue;
    sum += n;
    seen += 1;
  }
  if (seen === 0 || sum < 0) return null;
  return Math.round(sum);
}

/** 이름이 정해진 칸만 더한다 — 하나도 없으면 null */
export function sumNamedFields(item: Record<string, unknown>, fields: readonly string[]): number | null {
  let sum = 0;
  let seen = 0;
  for (const f of fields) {
    const n = toAmount(item[f]);
    if (n === null) continue;
    sum += n;
    seen += 1;
  }
  if (seen === 0 || sum < 0) return null;
  return Math.round(sum);
}

/** 개별사용료 — 공용(…C)·전용(…P) 칸 합. 그런 칸이 없으면 숫자 칸 합 */
export function sumIndividualFields(item: Record<string, unknown>, identityKeys = MGMT_FEE_IDENTITY_KEYS): number | null {
  const cp = Object.keys(item).filter((k) => !identityKeys.has(k) && /[CP]$/.test(k));
  const named = cp.length > 0 ? sumNamedFields(item, cp) : null;
  return named ?? sumCostFields(item, identityKeys);
}

/** op 한 개의 응답 항목 → 금액(원). item 이 없으면 null */
export function amountForOp(spec: MgmtFeeOpSpec, item: Record<string, unknown> | undefined, individual: boolean): number | null {
  if (!item) return null;
  if (spec.fields) return sumNamedFields(item, spec.fields);
  return individual ? sumIndividualFields(item) : sumCostFields(item);
}

/** 항목별 금액(원) — 키는 MgmtFeeOpSpec.key, 응답 없음은 null */
export type MgmtFeeItems = Record<string, number | null>;

/** 항목 합 — 전부 null 이면 null */
export function sumItems(items: MgmtFeeItems, keys: readonly string[]): number | null {
  let sum = 0;
  let seen = 0;
  for (const k of keys) {
    const v = items[k];
    if (v == null || !Number.isFinite(v)) continue;
    sum += v;
    seen += 1;
  }
  return seen === 0 ? null : Math.round(sum);
}

export interface MgmtFeeRow {
  kapt_code: string;
  /** YYYYMM */
  ym: string;
  common_krw: number | null;
  individual_krw: number | null;
  total_krw: number;
  /** 관리비부과면적(㎡)당 총액 — 면적을 모르면 null */
  per_m2_krw: number | null;
  source: "k-apt";
  fetched_at: string;
  /** [1025] 항목별 금액(원) — 마이그레이션 <ts>_1025_mgmt_fee_items 의 jsonb items. 없으면 열을 보내지 않는다 */
  items?: MgmtFeeItems;
}

/**
 * 순수: 두 합계 → complex_mgmt_fee 행. 둘 다 null 이면 null(행 없음).
 * per_m2 는 관리비부과면적(apartment_complexes.metadata.manageAreaM2)이 있을 때만.
 */
export function toMgmtFeeRow(
  kaptCode: string,
  ym: string,
  commonKrw: number | null,
  individualKrw: number | null,
  manageAreaM2: number | null,
  fetchedAt = new Date().toISOString(),
  items?: MgmtFeeItems,
): MgmtFeeRow | null {
  const code = kaptCode.trim();
  if (!code || !/^\d{6}$/.test(ym)) return null;
  if (commonKrw == null && individualKrw == null) return null;
  const total = (commonKrw ?? 0) + (individualKrw ?? 0);
  const area = manageAreaM2 != null && Number.isFinite(manageAreaM2) && manageAreaM2 > 0 ? manageAreaM2 : null;
  const row: MgmtFeeRow = {
    kapt_code: code,
    ym,
    common_krw: commonKrw,
    individual_krw: individualKrw,
    total_krw: Math.round(total),
    per_m2_krw: area ? Math.round(total / area) : null,
    source: "k-apt",
    fetched_at: fetchedAt,
  };
  if (items) row.items = items;
  return row;
}

/** op 호출 동시 수(단지 안) — 22회를 순차로 돌리면 200곳이 크론 예산(240초)을 넘는다 */
const OP_CONCURRENCY = 4;

async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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

export interface KaptMgmtFeeFetch {
  commonKrw: number | null;
  individualKrw: number | null;
  /** 22개 항목별 금액(원) — 응답 없는 항목은 null */
  items: MgmtFeeItems;
  /** 항목 중 하나라도 응답이 있었는가 */
  mode: "live" | "mock";
}

/**
 * 한 단지·한 달의 공용관리비·개별사용료 — 22회 호출. strict — 인증·한도·HTTP 오류는 던진다(크론 로그에 사유가 남아야
 * 한다). op 하나라도 던지면 단지 전체를 실패로 본다 — 절반만 더한 총액은 관리비가 아니다.
 */
export async function fetchKaptMgmtFee(kaptCode: string, ym: string): Promise<KaptMgmtFeeFetch> {
  const params = { kaptCode, searchDate: ym };
  const targets = [
    ...KAPT_COMMON_COST_OPS.map((spec) => ({ spec, service: KAPT_COMMON_COST_SERVICE, individual: false })),
    ...KAPT_INDIVIDUAL_COST_OPS.map((spec) => ({ spec, service: KAPT_INDIVIDUAL_COST_SERVICE, individual: true })),
  ];
  const results = await mapConcurrent(targets, OP_CONCURRENCY, async (t) => {
    try {
      const res = await fetchAptJson(t.service, t.spec.op, params, 10, true);
      return { t, item: res.items[0], live: res.mode === "live", error: null as string | null };
    } catch (e) {
      return { t, item: undefined, live: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(`${failed.t.spec.label}(${failed.t.spec.op}) ${failed.error}`);

  const items: MgmtFeeItems = {};
  let live = false;
  for (const r of results) {
    items[r.t.spec.key] = amountForOp(r.t.spec, r.item, r.t.individual);
    if (r.live) live = true;
  }
  return {
    commonKrw: sumItems(items, KAPT_COMMON_COST_OPS.map((s) => s.key)),
    individualKrw: sumItems(items, KAPT_INDIVIDUAL_COST_OPS.map((s) => s.key)),
    items,
    mode: live ? "live" : "mock",
  };
}
