/**
 * [1048] 시도 표 — 짧은 이름 · 정식 이름 · 내부 id · 한국은행 소비자동향조사 지역 묶음. 순수(클라이언트 안전).
 *
 * 쓰는 곳
 *  · lib/reb/client.ts — 한국부동산원 매매수급동향(매수우위)은 시도·권역 단위로만 나온다. 지금까지는
 *    서울 광역 행만 잡고(지수 전용) 나머지 시도 행은 버렸다(운영 실측 2026-10-09: 매수우위 지역 1곳 = 세종뿐).
 *    시도 행을 "sido-<영문>" id 로 받아 매수우위·전세수급 두 지표만 시계열에 싣는다.
 *  · lib/signals/load.ts — 단지·노트의 지역 → 시도 → 매수우위 · 주택가격전망 CSI 묶음.
 */

export type SidoInfo = {
  /** 짧은 이름 — "서울" · "경기" */
  short: string;
  /** market_region_series.region_id — 세종은 시군구 id 'sejong' 을 그대로 쓴다(기존 적재) */
  id: string;
  /** 표기 변형(정식 이름 · 옛 이름) */
  names: string[];
  /** 한국은행 소비자동향조사 지역 묶음(주택가격전망 CSI) */
  csiGroup: "서울" | "6대광역시" | "기타도시";
};

export const SIDO_LIST: readonly SidoInfo[] = [
  { short: "서울", id: "sido-seoul", names: ["서울", "서울특별시", "서울시"], csiGroup: "서울" },
  { short: "부산", id: "sido-busan", names: ["부산", "부산광역시", "부산시"], csiGroup: "6대광역시" },
  { short: "대구", id: "sido-daegu", names: ["대구", "대구광역시", "대구시"], csiGroup: "6대광역시" },
  { short: "인천", id: "sido-incheon", names: ["인천", "인천광역시", "인천시"], csiGroup: "6대광역시" },
  { short: "광주", id: "sido-gwangju", names: ["광주", "광주광역시"], csiGroup: "6대광역시" },
  { short: "대전", id: "sido-daejeon", names: ["대전", "대전광역시", "대전시"], csiGroup: "6대광역시" },
  { short: "울산", id: "sido-ulsan", names: ["울산", "울산광역시", "울산시"], csiGroup: "6대광역시" },
  { short: "세종", id: "sejong", names: ["세종", "세종특별자치시", "세종시"], csiGroup: "기타도시" },
  { short: "경기", id: "sido-gyeonggi", names: ["경기", "경기도"], csiGroup: "기타도시" },
  { short: "강원", id: "sido-gangwon", names: ["강원", "강원도", "강원특별자치도"], csiGroup: "기타도시" },
  { short: "충북", id: "sido-chungbuk", names: ["충북", "충청북도"], csiGroup: "기타도시" },
  { short: "충남", id: "sido-chungnam", names: ["충남", "충청남도"], csiGroup: "기타도시" },
  { short: "전북", id: "sido-jeonbuk", names: ["전북", "전라북도", "전북특별자치도"], csiGroup: "기타도시" },
  { short: "전남", id: "sido-jeonnam", names: ["전남", "전라남도"], csiGroup: "기타도시" },
  { short: "경북", id: "sido-gyeongbuk", names: ["경북", "경상북도"], csiGroup: "기타도시" },
  { short: "경남", id: "sido-gyeongnam", names: ["경남", "경상남도"], csiGroup: "기타도시" },
  { short: "제주", id: "sido-jeju", names: ["제주", "제주도", "제주특별자치도"], csiGroup: "기타도시" },
];

const BY_NAME = new Map<string, SidoInfo>(SIDO_LIST.flatMap((s) => s.names.map((n) => [n, s] as const)));

/** 시도 표기 하나 → 시도. 정확 일치만(부분 일치는 "광주시"(경기)를 광주광역시로 잘못 붙인다) */
export function sidoByName(name: string | null | undefined): SidoInfo | null {
  const t = String(name ?? "").replace(/\s+/g, "").trim();
  return t ? BY_NAME.get(t) ?? null : null;
}

export function sidoByShort(short: string | null | undefined): SidoInfo | null {
  return SIDO_LIST.find((s) => s.short === short) ?? null;
}

/**
 * R-ONE 분류 전체 이름("전국>수도권>경기" · "경기" · "지방권>강원")에서 **시도 한 칸만** 남는 행 → 시도.
 * 전국 · "…권" 세그먼트는 지우고, 아래에 시·구가 더 달려 있으면(세그먼트 2개 이상) 시도 행이 아니다.
 */
export function sidoFromClsFullNm(clsFullNm: string | null | undefined): SidoInfo | null {
  if (!clsFullNm) return null;
  const rest = clsFullNm
    .split(">")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s !== "전국" && !s.endsWith("권"));
  if (rest.length !== 1) return null;
  return sidoByName(rest[0]);
}
