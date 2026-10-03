import { fetchAllSeoulRows, matchesDistrict } from "../openapi-client";

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
  maxPages = 3,
): Promise<UpisRebuildPayload> {
  const district = params.district ?? "";
  /* [1027] 구 이름의 **끝** "구"만 떼고, 두 글자 이상일 때만 구역명에서 찾는다. 예전에는 첫 "구"를 지워
     "구로구" → "로구"(종로구 구역이 걸린다) · "중구" → "중"(아무 구역이나 걸린다)이 돼, 임장 리포트의
     "진행 N건 · 계획 M건"이 다른 구의 구역까지 세었다. */
  const stem = district.replace(/구$/, "");
  const batch = await fetchAllSeoulRows("upisRebuild", { maxPages, pageSize: 1000 });
  const projects = batch.rows
    .map(mapRow)
    .filter((p) => {
      if (!district) return true;
      return (
        matchesDistrict(district, p.zoneName) ||
        matchesDistrict(district, p.position) ||
        (stem.length >= 2 && p.zoneName.includes(stem))
      );
    });

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
