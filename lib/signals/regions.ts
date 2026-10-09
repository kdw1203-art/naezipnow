/**
 * [1048] 다요인 분석의 지역 이름 맞추기 — 순수(서버에서만 쓴다 · 전국 시군구 표를 읽어 무겁다).
 *
 *  · transactionRegionName — 임장노트의 자유 표기("경기 안양시 동안구 관양동") → 실거래 지역 이름("안양 동안구").
 *    단지 화면은 이미 이 표기를 갖고 있다(axisRegionName).
 *  · sidoForRegionName — 실거래 지역 이름 → 시도("경기"). 매수우위(시도 단위) · 주택가격전망 CSI 묶음을 고른다.
 */
import { findCatalogRegionByName } from "@/lib/region/catalog";
import { sidoByName, sidoByShort, type SidoInfo } from "@/lib/region/sido";
import { parseRegionParts } from "@/lib/notes/region-match";
import { getAllSido, getSigunguBySido } from "@/lib/national-data/region-codes";
import { decodeNameIdSafe, pureIdFromParam } from "@/lib/seo/complex-slug";

const METRO_SHORT = new Set(["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종"]);

/** 노트 지역 표기 → 실거래 지역 이름. 구·군을 못 찾으면 시 이름(하남시) · 아무것도 없으면 원문 */
export function transactionRegionName(raw: string | null | undefined): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const { si, gu } = parseRegionParts(text);
  if (si && gu) {
    if (METRO_SHORT.has(si)) return `${si} ${gu}`;
    if (si.endsWith("시")) return `${si.replace(/시$/, "")} ${gu}`;
    /* 도 + 군("경기 양평군") */
    const sido = sidoByName(si);
    return sido ? `${sido.short} ${gu}` : `${si} ${gu}`;
  }
  if (si) return si === "세종" ? "세종시" : si;
  return text;
}

/** 시(市) 이름 → 상위 도. "안양" → 경기 · "천안" → 충남 */
const CITY_TO_SIDO: Map<string, string> = (() => {
  const out = new Map<string, string>();
  for (const sidoName of getAllSido()) {
    const sido = sidoByName(sidoName);
    if (!sido) continue;
    for (const info of getSigunguBySido(sidoName)) {
      const name = info.sigungu.split(" ")[0];
      if (/[시군]$/.test(name)) {
        out.set(name, sido.short);
        out.set(name.replace(/[시군]$/, ""), sido.short);
      }
    }
  }
  return out;
})();

/** 실거래 지역 이름 → 시도. 카탈로그(수도권·광역시) → 첫 낱말이 시도 → 시 이름 → 못 찾으면 null */
export function sidoForRegionName(regionName: string | null | undefined): SidoInfo | null {
  const name = String(regionName ?? "").trim();
  if (!name) return null;
  const cat = findCatalogRegionByName(name);
  if (cat) return sidoByShort(cat.city ?? "서울");
  const first = name.split(/\s+/)[0];
  /* 정확한 시도 표기("서울" · "광주" · "세종시")가 먼저. "광주시"(경기 광주)는 시도 표기 목록에 없어 아래 시 이름으로 간다 */
  const direct = sidoByName(first);
  if (direct) return direct;
  const short = CITY_TO_SIDO.get(first) ?? CITY_TO_SIDO.get(first.replace(/시$/, ""));
  return short ? sidoByShort(short) : null;
}

/** 임장노트 → 실거래 지역 이름. 단지 id(주소창 표기 · 순수 id 모두)가 풀리면 그 지역, 아니면 노트 지역 표기 */
export function noteSignalRegion(region: string | null | undefined, complexParam: string | null | undefined): string {
  const param = String(complexParam ?? "").trim();
  if (param) {
    let pure = param;
    try {
      pure = pureIdFromParam(decodeURIComponent(param));
    } catch {
      pure = pureIdFromParam(param);
    }
    const decoded = decodeNameIdSafe(pure);
    if (decoded?.region) return decoded.region;
  }
  return transactionRegionName(region);
}
