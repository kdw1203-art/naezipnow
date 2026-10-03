/** AI 워크벤치용 정적 데이터(실거래 API 연동 전 단계). */

export type TxType = "매매" | "전세" | "월세";

export type WorkbenchComplex = {
  id: string;
  name: string;
  districtId: string;
  districtLabel: string;
  dong: string;
  /** 만원/㎡ 환산 기준 매매 호가(만원) */
  priceSaleMan: number;
  priceJeonMan: number;
  /** ㎡ */
  areaSqm: number;
  /** 준공연도 */
  yearBuilt: number;
  /** 세대수 */
  households: number;
  /** 역세권 점수 0-100 */
  transitScore: number;
  /** 학군 점수 */
  schoolScore: number;
  /** 개발호재 점수 */
  devScore: number;
  /** 유동성(거래량 지수) */
  liquidityIdx: number;
  /** AI 내부 등급 */
  aiGrade: "S" | "A" | "B" | "C";
  /** 연별 예측 가정 상승률 % (매매 5년) */
  trendPct5y: number;
};

export const DISTRICT_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "gangnam", label: "강남구" },
  { id: "seocho", label: "서초구" },
  { id: "songpa", label: "송파구" },
  { id: "mapo", label: "마포구" },
  { id: "yongsan", label: "용산구" },
  { id: "seongdong", label: "성동구" },
  { id: "yangcheon", label: "양천구" },
  { id: "yeongdeungpo", label: "영등포구" },
  { id: "dongjak", label: "동작구" },
  { id: "gwanak", label: "관악구" },
  { id: "eunpyeong", label: "은평구" },
  { id: "gangseo", label: "강서구" },
  { id: "nowon", label: "노원구" },
  { id: "jongno", label: "종로구" },
  { id: "jung", label: "중구" },
  { id: "gwangjin", label: "광진구" },
  { id: "gangdong", label: "강동구" },
  { id: "guro", label: "구로구" },
];

export const WORKBENCH_COMPLEXES: WorkbenchComplex[] = [
  {
    id: "c1",
    name: "은마아파트",
    districtId: "gangnam",
    districtLabel: "강남구",
    dong: "대치동",
    priceSaleMan: 250000,
    priceJeonMan: 135000,
    areaSqm: 76,
    yearBuilt: 1979,
    households: 4386,
    transitScore: 88,
    schoolScore: 96,
    devScore: 92,
    liquidityIdx: 82,
    aiGrade: "A",
    trendPct5y: 28,
  },
  {
    id: "c2",
    name: "래미안 원베일리",
    districtId: "seocho",
    districtLabel: "서초구",
    dong: "반포동",
    priceSaleMan: 420000,
    priceJeonMan: 210000,
    areaSqm: 84,
    yearBuilt: 2016,
    households: 3420,
    transitScore: 90,
    schoolScore: 88,
    devScore: 78,
    liquidityIdx: 76,
    aiGrade: "S",
    trendPct5y: 22,
  },
  {
    id: "c3",
    name: "잠실 엘스",
    districtId: "songpa",
    districtLabel: "송파구",
    dong: "잠실동",
    priceSaleMan: 220000,
    priceJeonMan: 120000,
    areaSqm: 59,
    yearBuilt: 2008,
    households: 2890,
    transitScore: 92,
    schoolScore: 82,
    devScore: 70,
    liquidityIdx: 88,
    aiGrade: "A",
    trendPct5y: 18,
  },
  {
    id: "c4",
    name: "마포래미안푸르지오",
    districtId: "mapo",
    districtLabel: "마포구",
    dong: "아현동",
    priceSaleMan: 165000,
    priceJeonMan: 98000,
    areaSqm: 84,
    yearBuilt: 2004,
    households: 1820,
    transitScore: 86,
    schoolScore: 78,
    devScore: 88,
    liquidityIdx: 80,
    aiGrade: "A",
    trendPct5y: 24,
  },
  {
    id: "c5",
    name: "한남 더힐",
    districtId: "yongsan",
    districtLabel: "용산구",
    dong: "한남동",
    priceSaleMan: 480000,
    priceJeonMan: 220000,
    areaSqm: 112,
    yearBuilt: 2012,
    households: 600,
    transitScore: 72,
    schoolScore: 80,
    devScore: 90,
    liquidityIdx: 58,
    aiGrade: "S",
    trendPct5y: 20,
  },
  {
    id: "c6",
    name: "성수 트리마제",
    districtId: "seongdong",
    districtLabel: "성동구",
    dong: "성수동",
    priceSaleMan: 195000,
    priceJeonMan: 105000,
    areaSqm: 59,
    yearBuilt: 2021,
    households: 980,
    transitScore: 84,
    schoolScore: 74,
    devScore: 86,
    liquidityIdx: 90,
    aiGrade: "A",
    trendPct5y: 26,
  },
  {
    id: "c7",
    name: "목동 파크자이",
    districtId: "yangcheon",
    districtLabel: "양천구",
    dong: "목동",
    priceSaleMan: 178000,
    priceJeonMan: 92000,
    areaSqm: 84,
    yearBuilt: 2006,
    households: 2200,
    transitScore: 80,
    schoolScore: 88,
    devScore: 84,
    liquidityIdx: 78,
    aiGrade: "A",
    trendPct5y: 21,
  },
  {
    id: "c8",
    name: "여의도 자이",
    districtId: "yeongdeungpo",
    districtLabel: "영등포구",
    dong: "여의도동",
    priceSaleMan: 310000,
    priceJeonMan: 165000,
    areaSqm: 84,
    yearBuilt: 2008,
    households: 3100,
    transitScore: 94,
    schoolScore: 76,
    devScore: 82,
    liquidityIdx: 72,
    aiGrade: "A",
    trendPct5y: 17,
  },
  {
    id: "c9",
    name: "흑석 아크로리버파크",
    districtId: "dongjak",
    districtLabel: "동작구",
    dong: "흑석동",
    priceSaleMan: 142000,
    priceJeonMan: 78000,
    areaSqm: 59,
    yearBuilt: 2014,
    households: 1500,
    transitScore: 78,
    schoolScore: 80,
    devScore: 80,
    liquidityIdx: 84,
    aiGrade: "B",
    trendPct5y: 19,
  },
  {
    id: "c10",
    name: "신림 푸르지오",
    districtId: "gwanak",
    districtLabel: "관악구",
    dong: "신림동",
    priceSaleMan: 88000,
    priceJeonMan: 52000,
    areaSqm: 59,
    yearBuilt: 2005,
    households: 2600,
    transitScore: 82,
    schoolScore: 70,
    devScore: 62,
    liquidityIdx: 86,
    aiGrade: "B",
    trendPct5y: 14,
  },
  {
    id: "c11",
    name: "불광 롯데캐슬",
    districtId: "eunpyeong",
    districtLabel: "은평구",
    dong: "불광동",
    priceSaleMan: 112000,
    priceJeonMan: 68000,
    areaSqm: 84,
    yearBuilt: 2007,
    households: 1400,
    transitScore: 88,
    schoolScore: 72,
    devScore: 74,
    liquidityIdx: 80,
    aiGrade: "B",
    trendPct5y: 16,
  },
  {
    id: "c12",
    name: "마곡 힐스테이트",
    districtId: "gangseo",
    districtLabel: "강서구",
    dong: "마곡동",
    priceSaleMan: 125000,
    priceJeonMan: 72000,
    areaSqm: 84,
    yearBuilt: 2019,
    households: 1800,
    transitScore: 86,
    schoolScore: 74,
    devScore: 88,
    liquidityIdx: 88,
    aiGrade: "A",
    trendPct5y: 20,
  },
];

export function complexById(id: string): WorkbenchComplex | undefined {
  return WORKBENCH_COMPLEXES.find((c) => c.id === id);
}

/** RTMS/MOLIT 우선 단지 검색 — API 실패 시 로컬 mock 폴백 */
export async function searchWorkbenchComplexes(
  query: string,
  districtLabel?: string,
): Promise<WorkbenchComplex[]> {
  const q = query.trim().toLowerCase();
  if (!q) return WORKBENCH_COMPLEXES.slice(0, 6);
  const local = WORKBENCH_COMPLEXES.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      (districtLabel ? c.districtLabel.includes(districtLabel) : false) ||
      c.dong.includes(q),
  );
  if (typeof window === "undefined") {
    return local.length ? local : WORKBENCH_COMPLEXES.slice(0, 4);
  }
  try {
    const params = new URLSearchParams({ q: query, limit: "8" });
    if (districtLabel) params.set("district", districtLabel);
    const res = await fetch(`/api/public-data/national/molit-geocoder?${params}`);
    if (res.ok) {
      const json = (await res.json()) as {
        items?: Array<{ aptName?: string; address?: string; district?: string }>;
      };
      const fromApi = (json.items ?? [])
        .filter((it) => it.aptName)
        .map((it, i) => {
          const match = WORKBENCH_COMPLEXES.find((c) => c.name.includes(it.aptName!.slice(0, 4)));
          if (match) return match;
          return {
            id: `rtms-${i}`,
            name: it.aptName!,
            districtId: "unknown",
            districtLabel: it.district ?? districtLabel ?? "—",
            dong: it.address ?? "",
            priceSaleMan: 0,
            priceJeonMan: 0,
            areaSqm: 84,
            yearBuilt: 2000,
            households: 0,
            transitScore: 70,
            schoolScore: 70,
            devScore: 65,
            liquidityIdx: 70,
            aiGrade: "B" as const,
            trendPct5y: 0,
          } satisfies WorkbenchComplex;
        });
      if (fromApi.length) return fromApi;
    }
  } catch {
    /* fallback */
  }
  return local.length ? local : WORKBENCH_COMPLEXES.slice(0, 4);
}

export function jeonseRatio(c: WorkbenchComplex): number {
  if (!c.priceSaleMan) return 0;
  return (c.priceJeonMan / c.priceSaleMan) * 100;
}

export function compositeScore(c: WorkbenchComplex): number {
  return Math.round(
    c.transitScore * 0.22 +
      c.schoolScore * 0.2 +
      c.devScore * 0.22 +
      c.liquidityIdx * 0.18 +
      Math.min(100, jeonseRatio(c) * 1.2) * 0.18,
  );
}

/* [1027] 여기 있던 예시 표를 지웠다 — TIMING_FULL(구별 매수 신호·강도) · ECONOMY_FULL(기준금리·주담대 금리·
   미분양 등 13개 지표) · ECONOMY_THERMOMETER · RISK_BLOCKS(리스크 점수) · computeRiskDashboardScores.
   전부 코드에 박은 고정값이라 실제 시장과 무관했는데, 외부 AI 모델의 참고 데이터와 공개 주소
   /api/economy/monitor 로 나가고 있었다. 실제 값은 lib/ai/verdict.ts · /api/ai/context 가 만든다. */

export type ChecklistCategory = {
  id: string;
  title: string;
  weight: number;
  items: Array<{ id: string; label: string; weight: number }>;
};

export const CHECKLIST_FULL: ChecklistCategory[] = [
  {
    id: "cat1",
    title: "입지·교통",
    weight: 28,
    items: [
      { id: "i1", label: "지하철 도보 10분 이내(환승역 포함)", weight: 8 },
      { id: "i2", label: "광역버스·GTX 등 광역 교통", weight: 5 },
      { id: "i3", label: "주요 업무지구 30분 이내", weight: 5 },
      { id: "i4", label: "학·병원·마트 생활권", weight: 4 },
      { id: "i36", label: "버스·승용 접근·정류장·IC 거리", weight: 3 },
      { id: "i37", label: "간선도로·철도 소음·미세먼지 거리 검토", weight: 3 },
    ],
  },
  {
    id: "cat2",
    title: "단지·물리",
    weight: 24,
    items: [
      { id: "i5", label: "세대당 주차 1.0대 이상", weight: 5 },
      { id: "i6", label: "난방·누수·외벽 등 하자 이력 낮음", weight: 4 },
      { id: "i7", label: "커뮤니티·보안 시설 충실", weight: 5 },
      { id: "i8", label: "층간소음·일조 검토 완료", weight: 4 },
      { id: "i38", label: "동·층·향 채광·통풍 현장 확인", weight: 3 },
      { id: "i39", label: "발코니·확장·베란다 구조 적법 여부", weight: 3 },
    ],
  },
  {
    id: "cat3",
    title: "학군·거주",
    weight: 24,
    items: [
      { id: "i9", label: "통학 동선·학교 밀집도", weight: 6 },
      { id: "i10", label: "학원가·돌봄 인프라", weight: 5 },
      { id: "i11", label: "공원·저소음 환경", weight: 4 },
      { id: "i12", label: "재난·침수 이력 없음", weight: 3 },
      { id: "i40", label: "배정 학교·학군 정책 변동 리스크", weight: 3 },
      { id: "i41", label: "주차·유모차 동선·엘리베이터 대기", weight: 3 },
    ],
  },
  {
    id: "cat4",
    title: "투자·수익",
    weight: 30,
    items: [
      { id: "i13", label: "전세가율·임대수익률 목표치 충족", weight: 7 },
      { id: "i14", label: "재건축·리모델링 파이프라인", weight: 7 },
      { id: "i15", label: "주변 호재(도시정비·상업) 가시화", weight: 6 },
      { id: "i16", label: "실거래 추세·회전율 양호", weight: 4 },
      { id: "i42", label: "급매·호가 스프레드·협상 여지", weight: 3 },
      { id: "i43", label: "분양·입주 물량 시점과의 겹침", weight: 3 },
    ],
  },
  {
    id: "cat5",
    title: "리스크·대출",
    weight: 23,
    items: [
      { id: "i17", label: "규제지역·LTV·DSR 여유", weight: 6 },
      { id: "i18", label: "금리 상승 시 상환 시나리오", weight: 5 },
      { id: "i19", label: "공급 과잉·분양 물량 점검", weight: 4 },
      { id: "i20", label: "세금(취득세·보유세) 시뮬 완료", weight: 3 },
      { id: "i21", label: "스트레스 금리(+2%p) 상환액 재계산", weight: 3 },
      { id: "i22", label: "중도상환 수수료·만기 구조 확인", weight: 2 },
    ],
  },
  {
    id: "cat6",
    title: "관리비·운영",
    weight: 16,
    items: [
      { id: "i23", label: "관리비 항목·인상 이력 확인", weight: 4 },
      { id: "i24", label: "장기수선충당금·외벽·지붕 공사 계획", weight: 4 },
      { id: "i25", label: "엘리베이터·기계식 주차 유지 상태", weight: 3 },
      { id: "i26", label: "경비·CCTV·출입 통제 운영 방식", weight: 3 },
      { id: "i27", label: "입주민 민원·분쟁 공개 채널 확인", weight: 2 },
    ],
  },
  {
    id: "cat7",
    title: "법률·등기·특약",
    weight: 16,
    items: [
      { id: "i28", label: "등기부등본 근저당·가압류·가처분 여부", weight: 5 },
      { id: "i29", label: "건축물대장 용도·위반·불법 확장 여부", weight: 4 },
      { id: "i30", label: "매도인·임대인 권원 관계(소유권) 확인", weight: 3 },
      { id: "i31", label: "계약서 특약(하자·환불·위약금) 검토", weight: 4 },
    ],
  },
  {
    id: "cat8",
    title: "입주·거래 절차",
    weight: 14,
    items: [
      { id: "i32", label: "잔금일·이사 일정·열쇠 인수 절차", weight: 4 },
      { id: "i33", label: "확정일자·전입신고(전·월세) 일정", weight: 4 },
      { id: "i34", label: "중개보수·실비 정산 범위 확인", weight: 3 },
      { id: "i35", label: "하자 검수 체크리스트·담당 연락처", weight: 3 },
    ],
  },
];
