/**
 * [1191] 서울 소규모정비사업 현황(서울 열린데이터광장 OA-23113 · 서비스 vnBsnsSmalNmtn) — 순수 함수.
 * 가로주택정비 · 소규모재건축 · 소규모재개발 · 자율주택 · 모아타운 사업장을 사업위치(BSNS_ADDR)로 지오코딩해 지도에 싣는다.
 * 실제 호출 · 싣기는 zone-locate-run 이 한다. 위치를 못 찾으면 싣지 않는다.
 */
export const SEOUL_SMALL_SERVICE = "vnBsnsSmalNmtn";
export const SEOUL_SMALL_URL = "https://data.seoul.go.kr/dataList/OA-23113/S/1/datasetView.do";
export const SEOUL_SMALL_SOURCE = "서울시 도시계획사업(서울플랜+) 소규모정비사업 현황";

export type SeoulSmallRow = {
  seq: string;
  name: string;
  gu: string;
  addr: string;
  kind: string;
  stage: string;
  households: number | null;
};

const s = (v: unknown) => (v == null ? "" : String(v).trim());

export function parseSeoulSmall(r: Record<string, unknown>): SeoulSmallRow | null {
  const seq = s(r.BASIC_INFO_SEQ);
  const name = s(r.BSNS_NAME);
  const addr = s(r.BSNS_ADDR);
  if (!seq || !name || !addr) return null;
  const hh = Number(String(r.SUPLY_HSHLD ?? "").replace(/[^0-9.]/g, ""));
  return {
    seq,
    name,
    gu: s(r.SITE_CODE_NM),
    addr,
    kind: [s(r.CLASSIFY_G_NM), s(r.CLASSIFY_L_NM)].filter(Boolean).join(" "),
    stage: s(r.PROPEL_CD_NM) || s(r.PROPEL_DT),
    households: Number.isFinite(hh) && hh > 0 ? Math.round(hh) : null,
  };
}

/** 사업 종류 → 지도 분류 */
export function seoulSmallType(kind: string): "garo" | "moa" | "small_scale" {
  if (/가로/.test(kind)) return "garo";
  if (/모아/.test(kind)) return "moa";
  return "small_scale";
}

/** 추진 단계 → 지도 단계(모르면 구역지정 · 후보) */
export function seoulSmallStage(stage: string): "designated" | "committee" | "union" | "plan_approved" | "mgmt_approved" | "moving" | "done" {
  const t = stage.replace(/\s/g, "");
  if (/준공|입주/.test(t)) return "done";
  if (/착공|이주|철거/.test(t)) return "moving";
  if (/관리처분/.test(t)) return "mgmt_approved";
  if (/사업시행|건축심의|통합심의/.test(t)) return "plan_approved";
  if (/조합/.test(t)) return "union";
  if (/추진위|준비위/.test(t)) return "committee";
  return "designated";
}

/** 자치구 이름("강동구" · "서울특별시 강동구") → "강동구" */
export function seoulGu(gu: string, addr: string): string | null {
  const m = /([가-힣]{1,4}구)(?:\s|$)/.exec(`${gu} `) ?? /([가-힣]{1,4}구)\s/.exec(`${addr} `);
  return m ? m[1] : null;
}

/** 지오코딩 질의 — 주소에 시가 없으면 "서울특별시 ○○구"를 앞에 붙인다. 여러 지번("123-4 외 5필지")은 첫 지번만 */
export function seoulSmallQuery(addr: string, gu: string): string {
  const first = addr.split(/[,·]|\s외\s|\s일대|\s일원/)[0].trim();
  const withGu = first.includes(gu) ? first : `${gu} ${first}`;
  return /서울/.test(withGu) ? withGu : `서울특별시 ${withGu}`;
}
