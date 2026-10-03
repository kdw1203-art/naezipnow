import { fetchAllSeoulRows } from "../openapi-client";
import { upisSigungu } from "../upis";

export type UpisRebuildProject = {
  id: string;
  zoneName: string;
  category: string;
  midCategory: string;
  subCategory: string;
  position: string;
  areaSqm: number;
  reportType: string;
  city: string;
};

export type UpisRebuildPayload = {
  district: string;
  city: string;
  projects: UpisRebuildProject[];
  activeProjects: number;
  plannedProjects: number;
  /* [1027] estimatedUnits · nearestCompletionYear 를 지웠다. 앞의 것은 "구역 면적 합계 ÷ 85㎡",
     뒤의 것은 "올해 + 3년"이었다 — 원천(upisRebuild)에 세대수도 준공 예정도 없는데 계산으로 만들어
     임장 리포트 근거 줄("추정 세대 … · 최근 준공 …")에 실어 보냈다. 모르는 값은 싣지 않는다. */
  mode: "live" | "mock";
};

function mapRow(row: Record<string, unknown>): UpisRebuildProject {
  const area = Number(row.AREA_EXS ?? row.AREA_CHG_AFTR ?? 0);
  return {
    id: String(row.RPT_MNG_CD ?? row.PRJC_CD ?? ""),
    zoneName: String(row.RGN_NM ?? row.PSTN_NM ?? "미상 구역"),
    category: String(row.LCLSF ?? ""),
    midCategory: String(row.MCLSF ?? ""),
    subCategory: String(row.SCLSF ?? ""),
    position: String(row.PSTN_NM ?? ""),
    areaSqm: Number.isFinite(area) ? area : 0,
    reportType: String(row.RPT_TYPE ?? ""),
    city: String(row.LOGVM ?? "서울특별시"),
  };
}

function isActiveProject(p: UpisRebuildProject): boolean {
  const text = `${p.subCategory}${p.midCategory}${p.category}`;
  return /재개발|재건축|정비|조합|시행|착공/.test(text);
}

export async function fetchUpisRebuild(
  params: { city?: string; district?: string },
  /* [1029] 조서가 6,581건(2026-10)이라 3쪽(3,000건)으로는 뒷 구역이 빠졌다 — 7쪽까지. 7일 캐시라 구마다 주 1회다. */
  maxPages = 7,
): Promise<UpisRebuildPayload> {
  const district = params.district ?? "";
  /* [1029] 구는 조서 코드 앞 5자리(11680 = 강남구) → 지자체 → 위치명·지역명 순으로 읽는다(lib/seoul/upis.upisSigungu).
     예전엔 구역명에 구 이름 줄기가 들어가면 걸려서 "관악구 강남아파트 재건축"이 강남구 건수에 섞였다. */
  const batch = await fetchAllSeoulRows("upisRebuild", { maxPages, pageSize: 1000 });
  const projects = batch.rows
    .filter((row) => {
      if (!district) return true;
      const gu = upisSigungu({
        rptMngCd: String(row.RPT_MNG_CD ?? ""),
        logvm: String(row.LOGVM ?? ""),
        pstnNm: String(row.PSTN_NM ?? ""),
        rgnNm: String(row.RGN_NM ?? ""),
      });
      return gu === district.trim();
    })
    .map(mapRow);

  const active = projects.filter(isActiveProject);
  const planned = projects.filter((p) => !isActiveProject(p));

  return {
    district: district || "전체",
    city: params.city ?? "서울",
    projects: projects.slice(0, 200),
    activeProjects: active.length,
    plannedProjects: planned.length,
    mode: "live",
  };
}
