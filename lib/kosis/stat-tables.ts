/**
 * KOSIS 부동산 보조지표 통계표 레지스트리.
 *
 * ⚠️ KOSIS 통계표(orgId/tblId)는 표 개편으로 변동될 수 있습니다. 표별 적재 건수와
 *    KOSIS 오류 코드(err 20 분류축 누락 · 30 자료 없음 · 11 인증키 …)가 market_ingest_log 에 남으므로,
 *    실패한 표는 KOSIS 통계목록에서 최신 orgId/tblId 로 교정하세요.
 *
 * [1104] 표 구조를 KOSIS 공개 통계표 화면(statHtml · 2026-11-04 조회)의 분류·항목 정의로 다시 맞췄다.
 *  · 분류축(objL) 개수는 표의 축 수와 **정확히** 같아야 한다 — 모자라면 err 20, 넘치면 err 21.
 *  · 미분양(2축: 구분=시도 · 시군구) · 착공(3축: 구분 · 부문명 · 시도별) 은 예전 설정(objL1 만)으로는 매번 err 20.
 *  · 인허가 DT_MLTM_666 은 **연간**(1990~2025 · 시도) 표다 — 월(M)로 물으면 자료가 없다.
 *  · 주택보급률 예전 ID DT_2KAA101 은 국토부(116)에 없는 표(통계청 101 의 같은 ID 는 "국토면적 · 국가별")였다
 *    → 국토부 (新)주택보급률 DT_MLTM_2100(연간 · 시도 · 항목 "보급률").
 *  · 주민등록인구 DT_1B040A3 는 항목이 셋(T20 총 · T21 남 · T22 여)이라 itmId=ALL 이면 남·여가 총인구를 덮어쓴다 → T20.
 *  · 인허가 · 착공 · 보급률은 시도 단위만 있다 — 시군구에 붙이지 않고 "sido-<영문>" 지역으로 싣는다(지어내지 않음).
 */
import type { MarketMetric } from "@/lib/market/types";

/** KOSIS 응답 행의 분류 열(C1 · C2 · C3) */
export type KosisAxis = "C1" | "C2" | "C3";

export interface KosisTable {
  /** 적재 식별 라벨 */
  label: string;
  orgId: string;
  tblId: string;
  /** 'M' 월간 | 'Y' 연간 */
  prdSe: "M" | "Y";
  /** 항목 ID (기본 ALL) — 여러 항목 표는 하나만 고른다 */
  itmId?: string;
  /** [1104] objL1..objLn — 표의 분류축 수만큼(KOSIS 는 축 수가 다르면 err 20/21) */
  objL: readonly string[];
  /** [1104] 지역 단위 — 시군구 표는 내부 시군구 카탈로그로, 시도 표는 "sido-<영문>" 으로 */
  regionLevel: "sigungu" | "sido";
  /** [1104] 지역 이름이 오는 분류 열 */
  regionAxis: KosisAxis;
  /** [1104] 시도 이름이 따로 오는 분류 열(2축 시도>시군구 표). 없으면 행정구역 코드 앞 2자리로 시도를 안다 */
  sidoAxis?: KosisAxis;
  /** [1104] 지역 외 분류축 고정값(이름 정확 일치) — 예: 착공 표의 구분·부문명 "총계" */
  fixedNames?: Partial<Record<"C1_NM" | "C2_NM" | "C3_NM", string>>;
  /** ITM_NM 부분일치 필터 (여러 항목 표에서 특정 항목만) */
  itmNmIncludes?: string;
  /** [1104] ITM_NM 정확 일치 필터 — "보급률" 과 "보급률(다가구 구분거처 반영)" 을 가른다 */
  itmNmExact?: string;
  /** 매핑할 내부 지표 */
  metric: MarketMetric;
}

export const KOSIS_TABLES: KosisTable[] = [
  // 시·군·구별 미분양현황 (국토교통부, 월간, 2축: 구분=시도 · 시군구 — 항목 1개 13103871087T1 "미분양현황")
  {
    label: "미분양주택현황",
    orgId: "116",
    tblId: "DT_MLTM_2082",
    prdSe: "M",
    objL: ["ALL", "ALL"],
    regionLevel: "sigungu",
    regionAxis: "C2",
    sidoAxis: "C1",
    metric: "unsold_units",
  },
  // 행정구역(시군구)별 주민등록세대수 (국가데이터처, 월간, 1축: 행정구역 — 항목 T1 "세대수")
  {
    label: "주민등록세대수",
    orgId: "101",
    tblId: "DT_1B040B3",
    prdSe: "M",
    itmId: "T1",
    objL: ["ALL"],
    regionLevel: "sigungu",
    regionAxis: "C1",
    metric: "households",
  },
  // 행정구역(시군구)별, 성별 인구수 (국가데이터처, 월간, 1축) — [1104] 항목 T20 "총인구수"만
  {
    label: "주민등록인구",
    orgId: "101",
    tblId: "DT_1B040A3",
    prdSe: "M",
    itmId: "T20",
    objL: ["ALL"],
    regionLevel: "sigungu",
    regionAxis: "C1",
    metric: "population",
  },
  // [#139] 지역별 주택건설 인허가실적 (국토교통부) — [1104] 연간(Y) · 시도 1축(계획/실적 행은 시도가 아니라 빠진다)
  // KOSIS 월별 인허가 표(DT_MLTM_1946 등)는 "월별 누계"라 월 값으로 쓰면 틀린다 — 연간 표를 쓴다.
  {
    label: "주택건설인허가실적",
    orgId: "116",
    tblId: "DT_MLTM_666",
    prdSe: "Y",
    objL: ["ALL"],
    regionLevel: "sido",
    regionAxis: "C1",
    metric: "housing_permits",
  },
  // [#139] 주택건설 착공실적(월계) (국토교통부, 월간) — [1104] 3축(구분 · 부문명 · 시도별), 구분·부문명 "총계"만
  {
    label: "주택건설착공실적",
    orgId: "116",
    tblId: "DT_MLTM_5386",
    prdSe: "M",
    objL: ["ALL", "ALL", "ALL"],
    regionLevel: "sido",
    regionAxis: "C3",
    fixedNames: { C1_NM: "총계", C2_NM: "총계" },
    metric: "housing_starts",
  },
  // (新)주택보급률 (국토교통부, 연간, 1축: 구분=시도) — [1104] 예전 DT_2KAA101 은 없는 표 · 항목 6개 중 "보급률"만
  {
    label: "주택보급률",
    orgId: "116",
    tblId: "DT_MLTM_2100",
    prdSe: "Y",
    itmNmExact: "보급률",
    objL: ["ALL"],
    regionLevel: "sido",
    regionAxis: "C1",
    metric: "housing_supply_ratio",
  },
];
