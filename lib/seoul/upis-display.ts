/* [1029] 서울 UPIS 결정 조서 — 화면 전용(가벼운) 모듈. 지역 코드표(lib/national-data/region-codes)를 끌어오지 않는다 —
   /redevelopment 클라이언트 조각(SeoulPlanBrowser)이 이 파일만 읽어 번들 예산(495KB) 안에 머문다.
   파싱·시군구 판별은 lib/seoul/upis.ts(서버·적재·테스트). */

export const UPIS_SERVICES = ["upisRebuild", "upisUrbanDev", "upisDistUnitPlan"] as const;
export type UpisService = (typeof UPIS_SERVICES)[number];
export const UPIS_ANNOUNCEMENT_SERVICE = "upisAnnouncement" as const;

export const UPIS_SERVICE_META: Record<UpisService, { label: string; short: string; datasetId: string; datasetUrl: string }> = {
  upisRebuild: {
    label: "정비사업",
    short: "정비",
    datasetId: "OA-20281",
    datasetUrl: "https://data.seoul.go.kr/dataList/OA-20281/S/1/datasetView.do",
  },
  upisUrbanDev: {
    label: "도시개발사업",
    short: "도시개발",
    datasetId: "OA-20287",
    datasetUrl: "https://data.seoul.go.kr/dataList/OA-20287/S/1/datasetView.do",
  },
  upisDistUnitPlan: {
    label: "지구단위계획",
    short: "지구단위",
    datasetId: "OA-20280",
    datasetUrl: "https://data.seoul.go.kr/dataList/OA-20280/S/1/datasetView.do",
  },
};

export const UPIS_SOURCE_LABEL = "서울 열린데이터광장 · 도시계획 결정 조서";
export const UPIS_SOURCE_URL = "https://data.seoul.go.kr/dataList/OA-20281/S/1/datasetView.do";

export function isUpisService(v: string): v is UpisService {
  return (UPIS_SERVICES as readonly string[]).includes(v);
}

/** DB 행(seoul_upis_records) · 화면이 쓰는 모양 */
export type UpisRecord = {
  rptMngCd: string;
  service: UpisService;
  prjcCd: string | null;
  rptType: string | null;
  lclsf: string | null;
  mclsf: string | null;
  sclsf: string | null;
  pstnNm: string | null;
  rgnNm: string | null;
  areaExs: number | null;
  areaChgAftr: number | null;
  dcsnAncmntMngCd: string | null;
  sigungu: string | null;
  emd: string | null;
  /** 코드에 박힌 날짜(YYYY-MM-DD) — 결정고시 코드 우선, 없으면 조서 코드. 공식 고시일은 seoul_upis_announcements 가 정본 */
  codeDate: string | null;
};

export type UpisAnnouncement = {
  ancmntMngCd: string;
  prjcCd: string | null;
  ancmntType: string | null;
  ancmntNo: string | null;
  ancmntYmd: string | null;
  ancmntInst: string | null;
  tkcgInst: string | null;
  ttl: string | null;
  cn: string | null;
};

/** 조서의 "구분" 한 낱말 — 소분류 > 중분류 > 대분류(원문 그대로) */
export function upisKind(r: Pick<UpisRecord, "sclsf" | "mclsf" | "lclsf">): string {
  return r.sclsf ?? r.mclsf ?? r.lclsf ?? "—";
}

/** 면적 표기 — 변경 후 > 기정. "63,270㎡" · 0 이거나 없으면 "—" */
export function upisAreaLabel(r: Pick<UpisRecord, "areaExs" | "areaChgAftr">): string {
  const v = r.areaChgAftr && r.areaChgAftr > 0 ? r.areaChgAftr : r.areaExs && r.areaExs > 0 ? r.areaExs : null;
  if (v == null) return "—";
  return `${Math.round(v).toLocaleString("ko-KR")}㎡`;
}

/** "2022-12-05" → "2022.12.05" */
export function upisDateLabel(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 10).replace(/-/g, ".");
}

/** 구별 요약 한 줄 — 서비스별 건수 */
export type UpisGuSummary = { sigungu: string; rebuild: number; urbanDev: number; distUnitPlan: number; total: number };

/** [1029b] 조서 검색어 정리 — 구역 이름·동·위치를 찾는 글자. PostgREST or/ilike 에 들어가므로 %, _, 쉼표, 괄호, 따옴표를
 *  걷고 공백은 하나로. 낱말 3개까지(모두 들어 있는 행만). 남는 글자가 없으면 null. */
export const UPIS_QUERY_MAX = 40;
export function normalizeUpisQuery(raw: string | null | undefined): string | null {
  const cleaned = (raw ?? "")
    .replace(/[%_,()'"`\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, UPIS_QUERY_MAX);
  if (!cleaned || !/[가-힣A-Za-z0-9]/.test(cleaned)) return null;
  return cleaned;
}
export function upisQueryTokens(q: string | null | undefined): string[] {
  const n = normalizeUpisQuery(q);
  if (!n) return [];
  return n.split(" ").filter((t) => t.length >= 1).slice(0, 3);
}
