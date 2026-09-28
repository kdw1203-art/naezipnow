/**
 * [1024] K-apt 공동주택 관리비 API 클라이언트 — 공용관리비 + 개별사용료 → 단지·월 한 행.
 *
 * 서비스(공공데이터포털 "국토교통부_공동주택 관리비 정보"):
 *   공용관리비  AptCmnuseManageCostService  / getHsmpCmnuseManageCostInfo
 *   개별사용료  AptIndvdlzManageCostService / getHsmpIndvdlzManageCostInfo
 *   파라미터    kaptCode(단지코드) · searchDate(YYYYMM)
 * 인증키는 apt-master 와 같은 data.go.kr 인코딩 키(MOLIT_SERVICE_KEY / DATA_GO_KR_ENCODING_KEY).
 *
 * // [1024] 미검증: data.go.kr 문서로 확인 필요 — 저장소에는 이 API 를 부른 적이 없다. 서비스명은 브리프의
 * // 표준 표기, 오퍼레이션명·파라미터명(kaptCode·searchDate)은 포털 문서의 관례를 따랐다. 단지 목록/기본정보가
 * // 2026-08 개편으로 V4/V5 가 됐듯 이 서비스도 V2 접미가 붙었을 수 있어 APT_MGMT_COST_API_VERSION(숫자)로 덮는다
 * // (예: 2 → AptCmnuseManageCostServiceV2 / getHsmpCmnuseManageCostInfoV2). 응답 항목명도 문서로 확인 전이라,
 * // 항목을 이름으로 고르지 않고 **식별 필드를 뺀 숫자 항목의 합**으로 총액을 만든다(아래 sumCostFields).
 * // 응답이 없으면 행을 만들지 않는다 — 지어내지 않는다.
 */
import { fetchAptJson } from "@/lib/national-data/apartment-api";

const VERSION = String(process.env.APT_MGMT_COST_API_VERSION ?? "").replace(/\D/g, "");
const V = VERSION ? `V${VERSION}` : "";
export const KAPT_COMMON_COST_SERVICE = `AptCmnuseManageCostService${V}`;
export const KAPT_COMMON_COST_OP = `getHsmpCmnuseManageCostInfo${V}`;
export const KAPT_INDIVIDUAL_COST_SERVICE = `AptIndvdlzManageCostService${V}`;
export const KAPT_INDIVIDUAL_COST_OP = `getHsmpIndvdlzManageCostInfo${V}`;

/**
 * 금액이 아닌 식별·메타 필드 — 합산에서 뺀다. 응답에 이 밖의 문자열 필드가 있어도 숫자로 못 읽으면 자연히 빠진다.
 * // [1024] 미검증: 문서 확인 뒤 소계 필드(있다면)를 여기에 추가해 이중 합산을 막아야 한다.
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

/**
 * 응답 항목 하나의 금액 합(원). 숫자로 읽히는 필드가 하나도 없으면 null — "0원"과 "모름"을 섞지 않는다.
 * 음수는 환급·정산 항목일 수 있어 그대로 더한다(합이 음수면 null 로 버린다 — 관리비 총액이 음수일 수는 없다).
 */
export function sumCostFields(item: Record<string, unknown>, identityKeys = MGMT_FEE_IDENTITY_KEYS): number | null {
  let sum = 0;
  let seen = 0;
  for (const [k, v] of Object.entries(item)) {
    if (identityKeys.has(k)) continue;
    if (v === null || v === undefined) continue;
    const text = String(v).replace(/,/g, "").trim();
    if (text === "" || !/^-?\d+(\.\d+)?$/.test(text)) continue;
    const n = Number(text);
    if (!Number.isFinite(n)) continue;
    sum += n;
    seen += 1;
  }
  if (seen === 0 || sum < 0) return null;
  return Math.round(sum);
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
): MgmtFeeRow | null {
  const code = kaptCode.trim();
  if (!code || !/^\d{6}$/.test(ym)) return null;
  if (commonKrw == null && individualKrw == null) return null;
  const total = (commonKrw ?? 0) + (individualKrw ?? 0);
  const area = manageAreaM2 != null && Number.isFinite(manageAreaM2) && manageAreaM2 > 0 ? manageAreaM2 : null;
  return {
    kapt_code: code,
    ym,
    common_krw: commonKrw,
    individual_krw: individualKrw,
    total_krw: Math.round(total),
    per_m2_krw: area ? Math.round(total / area) : null,
    source: "k-apt",
    fetched_at: fetchedAt,
  };
}

/** 한 단지·한 달의 공용관리비·개별사용료 합. strict — 인증·한도 오류는 던진다(크론 로그에 사유가 남아야 한다). */
export async function fetchKaptMgmtFee(
  kaptCode: string,
  ym: string,
): Promise<{ commonKrw: number | null; individualKrw: number | null; mode: "live" | "mock" }> {
  const params = { kaptCode, searchDate: ym };
  const common = await fetchAptJson(KAPT_COMMON_COST_SERVICE, KAPT_COMMON_COST_OP, params, 10, true);
  const individual = await fetchAptJson(KAPT_INDIVIDUAL_COST_SERVICE, KAPT_INDIVIDUAL_COST_OP, params, 10, true);
  const mode: "live" | "mock" = common.mode === "live" || individual.mode === "live" ? "live" : "mock";
  return {
    commonKrw: common.items[0] ? sumCostFields(common.items[0]) : null,
    individualKrw: individual.items[0] ? sumCostFields(individual.items[0]) : null,
    mode,
  };
}
