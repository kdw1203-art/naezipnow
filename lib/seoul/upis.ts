/* [1029] 서울 도시계획정보체계(UPIS) 결정 조서 — 순수 모듈(서버 전용 아님 · 단위테스트 대상).
   서울 열린데이터광장 Open API 4종을 한 꼴로 다룬다:
     upisRebuild      정비사업(정비구역 지정·변경 조서)        OA-20281
     upisUrbanDev     도시개발사업(도시개발구역)                OA-20287
     upisDistUnitPlan 지구단위계획(지구단위계획구역)            OA-20280
     upisAnnouncement 결정고시(고시번호·고시일자·제목)          OA-20283
   원문 항목: RPT_MNG_CD(조서관리코드) · PRJC_CD(프로젝트코드) · LOGVM(지자체) · RPT_TYPE(조서유형: 신설·변경…) · LCLSF/MCLSF/SCLSF
   (대·중·소분류) · PSTN_NM(위치명) · RGN_NM(지역명) · AREA_EXS(면적 기정) · AREA_CHG_AFTR(면적 변경 후) · DCSN_ANCMNT_MNG_CD(결정고시
   관리코드). 좌표·세대수·진행단계는 없다 — 그래서 지도 마커가 아니라 구·동별 목록과 구역 상세의 "결정 이력"으로 싣는다.
   이용허락: 저작자표시 · 비영리 · 변경금지(열린데이터광장 표기) — 화면마다 출처 한 줄을 적고 값은 원문 그대로 둔다. */
import { getSigunguInfo } from "@/lib/national-data/region-codes";

export * from "./upis-display";
import { isUpisService, type UpisAnnouncement, type UpisGuSummary, type UpisRecord, type UpisService } from "./upis-display";

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

const SEOUL_GU_RE = /(종로|중|용산|성동|광진|동대문|중랑|성북|강북|도봉|노원|은평|서대문|마포|양천|강서|구로|금천|영등포|동작|관악|서초|강남|송파|강동)구/;

/**
 * 시군구 — ① 코드 앞 5자리(11680 = 강남구. 11000 은 서울시청 접수라 구를 모른다) ② 지자체(LOGVM) 가 "○○구"
 * ③ 위치명·지역명 안의 "○○구". 셋 다 없으면 null(지어내지 않는다 — 소공동·태평로 같은 도심 조서가 여기 든다).
 */
export function upisSigungu(row: { rptMngCd?: string | null; logvm?: string | null; pstnNm?: string | null; rgnNm?: string | null }): string | null {
  const cd = (row.rptMngCd ?? "").slice(0, 5);
  if (/^11\d{3}$/.test(cd) && cd !== "11000") {
    const info = getSigunguInfo(cd);
    if (info && info.sido === "서울특별시") return info.sigungu;
  }
  const lv = (row.logvm ?? "").trim();
  if (/^[가-힣]{1,4}구$/.test(lv) && SEOUL_GU_RE.test(lv)) return lv.match(SEOUL_GU_RE)![0];
  for (const text of [row.pstnNm, row.rgnNm]) {
    const m = (text ?? "").match(SEOUL_GU_RE);
    if (m) return m[0];
  }
  return null;
}

const EMD_TOKEN_RE = /^([가-힣][가-힣0-9]*?(?:동|가|읍|면|리))(?:\d.*|일대|일원)?$/;

/** 읍면동 — 위치명("성동구 하왕십리동 890번지 일대" → "하왕십리동" · "태평로2가 43일대" → "태평로2가" · "신림8동 1644번지" → "신림8동").
 *  번지(숫자로 시작하는 토큰) 앞까지 보고, 여러 동이 나열되면 첫 동. 없으면 null. */
export function upisEmd(pstnNm: string | null | undefined): string | null {
  const raw = (pstnNm ?? "").replace(/[(),·]/g, " ").trim();
  if (!raw) return null;
  for (const tok of raw.split(/\s+/)) {
    if (/^\d/.test(tok)) break;
    if (/(시|구|군|도)$/.test(tok)) continue;
    const m = tok.match(EMD_TOKEN_RE);
    if (m && m[1].length >= 2) return m[1];
  }
  return null;
}

/** 관리코드에 박힌 날짜 — "11680AGZ202212050001" → "2022-12-05". 없으면 null. */
export function upisCodeDate(code: string | null | undefined): string | null {
  const m = (code ?? "").match(/^\d{5}[A-Z]{3}(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const yy = Number(y);
  const mm = Number(mo);
  const dd = Number(d);
  if (yy < 1960 || yy > 2100 || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${y}-${mo}-${d}`;
}

/** 원문 row → DB 행(컬럼 이름 = 표 컬럼). 조서관리코드가 없는 행은 null(기본키 없음). */
export function upisRowToRecord(service: UpisService, row: Record<string, unknown>): Record<string, unknown> | null {
  const rptMngCd = str(row.RPT_MNG_CD);
  if (!rptMngCd) return null;
  const pstnNm = str(row.PSTN_NM);
  const rgnNm = str(row.RGN_NM);
  const dcsn = str(row.DCSN_ANCMNT_MNG_CD);
  return {
    rpt_mng_cd: rptMngCd,
    service,
    prjc_cd: str(row.PRJC_CD),
    rpt_type: str(row.RPT_TYPE),
    lclsf: str(row.LCLSF),
    mclsf: str(row.MCLSF),
    sclsf: str(row.SCLSF),
    pstn_nm: pstnNm,
    rgn_nm: rgnNm,
    area_exs: num(row.AREA_EXS),
    area_chg_aftr: num(row.AREA_CHG_AFTR),
    dcsn_ancmnt_mng_cd: dcsn,
    sigungu: upisSigungu({ rptMngCd, logvm: str(row.LOGVM), pstnNm, rgnNm }),
    emd: upisEmd(pstnNm),
    code_date: upisCodeDate(dcsn) ?? upisCodeDate(rptMngCd),
    raw: row,
    fetched_at: new Date().toISOString(),
  };
}

/** 결정고시 원문 row → DB 행. 고시일자 "20221205" · "2022-12-05" 둘 다 받는다. */
export function upisAnnouncementToRecord(row: Record<string, unknown>): Record<string, unknown> | null {
  const cd = str(row.ANCMNT_MNG_CD);
  if (!cd) return null;
  const ymdRaw = str(row.ANCMNT_YMD);
  let ymd: string | null = null;
  if (ymdRaw) {
    const digits = ymdRaw.replace(/\D/g, "");
    if (/^\d{8}$/.test(digits)) ymd = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  return {
    ancmnt_mng_cd: cd,
    prjc_cd: str(row.PRJC_CD),
    ancmnt_type: str(row.ANCMNT_TYPE),
    ancmnt_no: str(row.ANCMNT_NO),
    ancmnt_ymd: ymd,
    ancmnt_inst: str(row.ANCMNT_INST),
    tkcg_inst: str(row.TKCG_INST),
    ttl: str(row.TTL),
    cn: str(row.CN)?.slice(0, 4000) ?? null,
    raw: row,
    fetched_at: new Date().toISOString(),
  };
}

/** DB 행 → 화면 모양 */
export function mapUpisRecord(r: Record<string, unknown>): UpisRecord | null {
  const rptMngCd = str(r.rpt_mng_cd);
  const service = str(r.service);
  if (!rptMngCd || !service || !isUpisService(service)) return null;
  return {
    rptMngCd,
    service,
    prjcCd: str(r.prjc_cd),
    rptType: str(r.rpt_type),
    lclsf: str(r.lclsf),
    mclsf: str(r.mclsf),
    sclsf: str(r.sclsf),
    pstnNm: str(r.pstn_nm),
    rgnNm: str(r.rgn_nm),
    areaExs: num(r.area_exs),
    areaChgAftr: num(r.area_chg_aftr),
    dcsnAncmntMngCd: str(r.dcsn_ancmnt_mng_cd),
    sigungu: str(r.sigungu),
    emd: str(r.emd),
    codeDate: str(r.code_date)?.slice(0, 10) ?? null,
  };
}

export function mapUpisAnnouncement(r: Record<string, unknown>): UpisAnnouncement | null {
  const cd = str(r.ancmnt_mng_cd);
  if (!cd) return null;
  return {
    ancmntMngCd: cd,
    prjcCd: str(r.prjc_cd),
    ancmntType: str(r.ancmnt_type),
    ancmntNo: str(r.ancmnt_no),
    ancmntYmd: str(r.ancmnt_ymd)?.slice(0, 10) ?? null,
    ancmntInst: str(r.ancmnt_inst),
    tkcgInst: str(r.tkcg_inst),
    ttl: str(r.ttl),
    cn: str(r.cn),
  };
}

/**
 * 구역 이름의 줄기 토큰 — 구역 상세(/redevelopment/[id])의 이름으로 조서를 찾을 때 쓴다.
 * "잠실주공5단지 재건축" → ["잠실주공5단지"] · "여의도 시범아파트 재건축" → ["여의도", "시범아파트"] · "한남3구역" → ["한남3구역"].
 * 사업 종류 낱말(재개발·재건축·정비사업·구역 …)은 뺀다. 남는 글자가 두 자 미만이면 빈 배열.
 */
export function zoneNameStems(name: string | null | undefined): string[] {
  const cleaned = (name ?? "")
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/(주택)?(재개발|재건축|도시환경|도시정비|소규모|가로주택|리모델링|정비사업|정비구역|사업구역)/g, " ")
    .trim();
  const toks = cleaned.split(/\s+/).filter((x) => x.length >= 2 && !/^(사업|구역|지구|정비)$/.test(x));
  return toks.slice(0, 2);
}

/** PostgREST ilike 패턴 — 토큰 사이와 앞뒤에 % */
export function zoneNamePattern(name: string | null | undefined): string | null {
  const toks = zoneNameStems(name);
  if (toks.length === 0) return null;
  return `%${toks.map((x) => x.replace(/[%_]/g, "")).join("%")}%`;
}

export function summarizeByGu(rows: readonly { sigungu: string | null; service: UpisService }[]): UpisGuSummary[] {
  const map = new Map<string, UpisGuSummary>();
  for (const r of rows) {
    const gu = r.sigungu ?? "구 미상";
    const cur = map.get(gu) ?? { sigungu: gu, rebuild: 0, urbanDev: 0, distUnitPlan: 0, total: 0 };
    if (r.service === "upisRebuild") cur.rebuild++;
    else if (r.service === "upisUrbanDev") cur.urbanDev++;
    else cur.distUnitPlan++;
    cur.total++;
    map.set(gu, cur);
  }
  return [...map.values()].sort((a, b) => (a.sigungu === "구 미상" ? 1 : b.sigungu === "구 미상" ? -1 : b.total - a.total || a.sigungu.localeCompare(b.sigungu, "ko")));
}
