/* [1043 · 지오코딩] 지역 표기 → 시·도 — 순수(서버 전용 사슬 밖 · 유닛 테스트가 직접 부른다).
 *
 * complex_geocode·실거래의 region_name 은 "서울 종로구" · "수원 영통구" · "평택시" 꼴이다(lib/market/molit-core 의
 * molitRegionLabel). 도 단위 시·군은 앞에 도 이름이 없어 "평택시 지제동 1048"만으로 묻게 되고, 돌아온 답이 맞는 도인지
 * 견줄 기준도 없었다. 시군구 표에서 같은 표기를 만드는 행을 찾아 시·도를 돌려준다.
 * 같은 표기가 두 시·도에 있으면("고성군" = 강원 · 경남) 모른다고 답한다 — 한쪽을 고르면 절반은 틀린다.
 * 분양 단지의 region 은 시·도 짧은 이름("경기" · "서울")이라 그대로 시·도다. */
import {
  currentSigunguCd,
  getAllSido,
  getSigunguBySido,
  getSigunguInfo,
  type SigunguInfo,
} from "@/lib/national-data/region-codes";
import { molitRegionLabel } from "@/lib/market/molit-core";
import { sidoKeyOf } from "@/lib/map/geocode-query";

/**
 * 시군구 행의 **시·도**(도 이름). 표의 sido 칸은 구가 있는 시의 구 행에서 "수원시"처럼 상위 시를 담는다 —
 * 시·도는 코드 앞 두 자리의 시·도 행(41000 = 경기도)에서 읽는다. 그 행이 없으면(세종) 그 칸을 그대로 쓴다.
 */
function provinceOf(info: Pick<SigunguInfo, "sigunguCd" | "sido">): string {
  return getSigunguInfo(`${info.sigunguCd.slice(0, 2)}000`)?.sido ?? info.sido;
}

let byLabel: Map<string, Set<string>> | null = null;

function labelIndex(): Map<string, Set<string>> {
  if (byLabel) return byLabel;
  const m = new Map<string, Set<string>>();
  for (const sido of getAllSido()) {
    for (const info of getSigunguBySido(sido)) {
      if (info.sigungu === info.sido) continue;
      const label = molitRegionLabel(info);
      const province = provinceOf(info);
      const set = m.get(label);
      if (set) set.add(province);
      else m.set(label, new Set([province]));
    }
  }
  byLabel = m;
  return m;
}

/** region_name → 시·도 공식 이름("경기도"). 모르거나 둘 이상이면 null */
export function regionSido(regionName: string | null | undefined): string | null {
  const label = (regionName ?? "").trim();
  if (!label) return null;
  const hit = labelIndex().get(label);
  if (hit) return hit.size === 1 ? [...hit][0] : null;
  /* 분양 단지: "경기" · "서울" · "강원" 처럼 시·도 짧은 이름 한 토막 */
  if (!label.includes(" ") && !/(시|군|구)$/.test(label) && sidoKeyOf(label)) return label;
  return null;
}

/** 시군구 코드(폐지 코드면 후속 코드) → 공식 시·도·시군구 이름("경기도" · "용인시 수지구") */
export function regionSigunguByCode(code: string | null | undefined): Pick<SigunguInfo, "sido" | "sigungu"> | null {
  const c = (code ?? "").trim();
  if (!/^\d{5}$/.test(c)) return null;
  const info = getSigunguInfo(currentSigunguCd(c)) ?? getSigunguInfo(c);
  if (!info || info.sigunguCd.endsWith("000")) return null;
  return { sido: provinceOf(info), sigungu: info.sigungu };
}
