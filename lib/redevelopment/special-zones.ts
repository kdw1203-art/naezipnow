/**
 * [1191] 1기 신도시 선도지구 · 2차 후보 · 도심 공공주택 복합사업 — 공표 · 보도 자료로 정리한 구역 목록(순수 자료 + 순수 함수).
 *
 * 소유자(2026-11-16): "분당 평촌 부천 일산 선도지구 후보지 및 선도지구 선정지구, 가로주택, 도심복합도 지도에 표시".
 * 위치를 지어내지 않는다 —
 *   선도지구 · 후보: 구역을 이루는 단지의 좌표(complex_geocode, 실거래 주소 지오코딩)의 평균. 단지가 하나도 안 잡히면 싣지 않는다.
 *   도심복합: 구역 이름(또는 공표 이름에 든 역 · 학교 · 공원 · 주민센터)으로 장소 검색 — 그 자치구 안이고 이름이 맞는 것만. 못 찾으면 싣지 않는다.
 * 실제 싣기는 zone-locate-run(주 1회 크론 · 관리자 실행)이 한다.
 */

export type SpecialZone = {
  id: string;
  name: string;
  typeKey: "newtown_lead" | "newtown_cand" | "dosim_public" | "garo" | "small_scale";
  stageKey: "designated" | "moving" | "done";
  sido: string;
  /** 지도 · 목록에 쓰는 시군구 이름 */
  sigungu: string;
  /** complex_geocode.region_name 에서 공백을 뺀 것 */
  regionKey: string;
  households: number | null;
  summary: string;
  source: string;
  sourceUrl: string;
  /** 단지 좌표 평균으로 찍을 때 — complex_geocode.complex_name 과 꼭 같은 이름 */
  complexes?: string[];
  /** 장소 검색으로 찍을 때 — 검색어와 장소 이름에 꼭 들어 있어야 하는 말 */
  place?: { query: string; mustContain: string; note?: string };
  /** 공표된 대표 지번으로 찍을 때 — 지오코딩 결과가 그 시군구 안일 때만 */
  lot?: string;
};

const SRC_LEAD = "국토교통부 1기 신도시 선도지구 선정(2024.11.27) · 지자체 고시 보도";
const URL_LEAD = "https://news.bizwatch.co.kr/article/real_estate/2024/11/27/0012";
const URL_DESIG = "https://www.housingherald.co.kr/news/articleView.html?idxno=60690";
const SRC_CAND = "2차 정비 추진 보도(한국경제 2026.05.04)";
const URL_CAND = "https://www.hankyung.com/article/2026050328191";
const SRC_DOSIM = "국토교통부 · LH 도심 공공주택 복합사업 지구 지정 발표";

const lead = (z: Omit<SpecialZone, "typeKey" | "stageKey" | "source" | "sourceUrl"> & { designated?: boolean }): SpecialZone => ({
  ...z,
  typeKey: "newtown_lead",
  stageKey: "designated",
  source: SRC_LEAD,
  sourceUrl: z.designated ? URL_DESIG : URL_LEAD,
});
const cand = (z: Omit<SpecialZone, "typeKey" | "stageKey" | "source" | "sourceUrl" | "summary"> & { summary?: string }): SpecialZone => ({
  summary: "1기 신도시 2차 정비 후보 · 주민제안 · 정비계획 초안 준비(2026.05 보도)",
  ...z,
  typeKey: "newtown_cand",
  stageKey: "designated",
  source: SRC_CAND,
  sourceUrl: URL_CAND,
});
const dosim = (z: Omit<SpecialZone, "typeKey" | "stageKey" | "source">): SpecialZone => ({ ...z, typeKey: "dosim_public", stageKey: "designated", source: SRC_DOSIM });

const garo = (z: Omit<SpecialZone, "typeKey" | "stageKey" | "source" | "sourceUrl" | "sido" | "summary">): SpecialZone => ({
  ...z,
  sido: "경기",
  typeKey: "garo",
  stageKey: "moving",
  summary: "가로주택정비사업 · 착공(부천시 2026.08.31 기준)",
  source: "부천시 정비사업 통합 홈페이지 · 가로주택정비사업 추진현황",
  sourceUrl: "https://bucheon.go.kr/site/homepage/menu/viewMenu?menuid=173002007004",
});

const smallBc = (z: Omit<SpecialZone, "typeKey" | "source" | "sourceUrl" | "sido" | "summary">): SpecialZone => ({
  ...z,
  sido: "경기",
  typeKey: "small_scale",
  summary: `소규모재건축사업 · ${z.stageKey === "done" ? "준공" : "착공"}(부천시 2026.09.30 기준)`,
  source: "부천시 정비사업 통합 홈페이지 · 소규모재건축사업 추진현황",
  sourceUrl: "https://bucheon.go.kr/site/homepage/menu/viewMenu?menuid=173002006003",
});

const BD = { sido: "경기", sigungu: "성남시 분당구", regionKey: "성남분당구" };
const PC = { sido: "경기", sigungu: "안양시 동안구", regionKey: "안양동안구" };
const JD = { sido: "경기", sigungu: "부천시 원미구", regionKey: "부천원미구" };
const SB = { sido: "경기", sigungu: "군포시", regionKey: "군포시" };
const ISD = { sido: "경기", sigungu: "고양시 일산동구", regionKey: "고양일산동구" };
const ISS = { sido: "경기", sigungu: "고양시 일산서구", regionKey: "고양일산서구" };

const SEL = "1기 신도시 선도지구(2024.11 선정)";
const DESIG = `${SEL} · 특별정비구역 지정 고시(2026.01)`;

export const SPECIAL_ZONES: SpecialZone[] = [
  /* ── 1차 선도지구(2024.11.27 선정 13곳) ── 목련마을 빌라단지 · 정발마을 2·3단지(연립)는 단지 좌표가 없어 싣지 않는다 */
  lead({ id: "nt-bd-saetbyeol", name: "분당 샛별마을(동성·라이프·우방·삼부·현대)", ...BD, households: 2843, summary: DESIG, designated: true,
    complexes: ["샛별마을(동성)", "샛별마을(라이프)", "샛별마을(우방)", "샛별마을(삼부)"] }),
  lead({ id: "nt-bd-yangji", name: "분당 양지마을(금호·청구·한양)", ...BD, households: 4392, summary: `${SEL} · 도시계획위원회 심의 통과(2026.02 보도)`,
    complexes: ["양지마을(금호1)", "양지마을(2단지)(청구)", "양지마을(3단지)(금호)", "양지마을(5단지)(한양501-514)", "양지마을(5단지)(한양515-529)", "양지마을(6단지)(금호,청구)", "양지마을(6단지)(한양603동)"] }),
  lead({ id: "nt-bd-sibeom", name: "분당 시범단지(우성·현대)·장안타운건영3차", ...BD, households: 3713, summary: DESIG, designated: true,
    complexes: ["시범우성", "시범현대", "장안타운(건영)"] }),
  lead({ id: "nt-is-baeksong", name: "일산 백송마을(1·2·3·5단지)", ...ISD, households: 2732, summary: `${SEL} · 위치는 백송마을 단지 평균`,
    complexes: ["백송마을(대림)", "백송마을(대우)", "백송마을(두산)", "백송마을(벽산)", "백송마을(삼부)", "백송마을(삼호)", "백송마을(선경)", "백송마을(우성)", "백송마을(임광)", "백송마을(코오롱)", "백송마을(풍림)", "백송마을(한신)"] }),
  lead({ id: "nt-is-hugok", name: "일산 후곡마을(3·4·10·15단지)", ...ISS, households: 2564, summary: SEL,
    complexes: ["후곡마을(현대3)", "후곡마을(동아10)", "후곡마을(건영15)"] }),
  lead({ id: "nt-is-gangchon", name: "일산 강촌마을(3·5·7·8단지)", ...ISD, households: 3616, summary: `${SEL} · 위치는 강촌마을 단지 평균`,
    complexes: ["강촌마을(동아)", "강촌마을(라이프)", "강촌마을(미도파)", "강촌마을(선경)", "강촌마을(영남)", "강촌마을(우방)", "강촌마을(진흥)", "강촌마을(코오롱)", "강촌마을(한신)", "강촌마을(한양6)"] }),
  lead({ id: "nt-pc-kkum-gwiin", name: "평촌 꿈마을 금호·한신·라이프·현대(귀인블록)", ...PC, households: 1750, summary: DESIG, designated: true,
    complexes: ["꿈마을금호", "꿈마을한신", "꿈마을라이프", "꿈마을현대"] }),
  lead({ id: "nt-pc-saem", name: "평촌 샘마을 임광·우방·쌍용·대우·한양", ...PC, households: 2334, summary: `${SEL} · 정비계획 초안 제출(2025.11)`,
    complexes: ["샘마을임광", "샘마을우방", "샘마을쌍용", "샘마을대우", "샘마을한양"] }),
  lead({ id: "nt-pc-kkum-minbaek", name: "평촌 꿈마을 우성·건영5·동아·건영3(민백블록)", ...PC, households: 1376, summary: DESIG, designated: true,
    complexes: ["꿈마을우성", "꿈마을건영5차", "꿈마을동아", "꿈마을건영3차"] }),
  lead({ id: "nt-jd-bandal", name: "중동 반달마을 삼익·동아·선경·건영", ...JD, households: 3570, summary: SEL,
    complexes: ["반달마을(삼익)", "반달마을(동아)", "반달마을(선경)", "반달마을(건영)"] }),
  lead({ id: "nt-jd-eunha", name: "중동 은하마을 대우동부·효성쌍용·주공1·2단지", ...JD, households: 2387, summary: SEL,
    complexes: ["은하마을(대우)", "은하마을(동부)", "은하마을(효성)", "은하마을(쌍용)", "은하마을(주공1)", "은하마을(주공2)"] }),
  lead({ id: "nt-sb-11", name: "산본 자이백합·삼성장미·주공11(11구역)", ...SB, households: 2758, summary: DESIG, designated: true,
    complexes: ["백합", "삼성장미", "주공11"] }),
  lead({ id: "nt-sb-9-2", name: "산본 한양백두·동성백두·극동백두(9-2구역)", ...SB, households: 1862, summary: DESIG, designated: true,
    complexes: ["한양백두", "백두(동성)", "백두(극동)"] }),

  /* ── 2차 후보(보도에 이름이 나온 곳만) ── 평촌 A-2(샛별한양1·2·3)는 단지 좌표가 없어 싣지 않는다 */
  cand({ id: "nt-bd-c-sibeom1", name: "분당 시범1구역(한양·삼성한신)", ...BD, households: null, complexes: ["시범한양", "시범삼성", "시범한신"] }),
  cand({ id: "nt-bd-c-parktown", name: "분당 파크타운", ...BD, households: null, complexes: ["파크타운(대림)", "파크타운(롯데)", "파크타운(삼익)", "파크타운(서안)"] }),
  cand({ id: "nt-bd-c-jeongdeun", name: "분당 정든마을", ...BD, households: null,
    complexes: ["정든마을(1단지)(동아)", "정든마을(2단지)(동아)", "정든마을(4단지)(우성)", "정든마을(5단지)(신화)", "정든마을(6단지)(우성)", "정든마을(6단지)(한진)", "정든마을(7단지)(한진)", "정든마을(8단지)(한진)"] }),
  cand({ id: "nt-bd-c-sangrok", name: "분당 상록마을", ...BD, households: null,
    complexes: ["상록마을(라이프1차)", "상록마을(라이프2차)", "상록마을(보성)", "상록마을(우성)1", "상록마을(임광)"] }),
  cand({ id: "nt-pc-c-a1", name: "평촌 A-1 관악타운·부영·성원", ...PC, households: null, summary: "1기 신도시 2차 정비 후보 · 초안 접수(2026.05 보도)", complexes: ["관악", "관악부영4", "관악성원"] }),
  cand({ id: "nt-pc-c-a4", name: "평촌 A-4 은하수한양5·샛별한양6", ...PC, households: null, summary: "1기 신도시 2차 정비 후보 · 초안 접수(2026.05 보도)",
    complexes: ["은하수마을한양", "샛별한양6(고층1109-4)", "샛별한양6(고층1109-6)", "샛별한양6(고층1109)", "샛별한양6(저층)"] }),
  cand({ id: "nt-pc-c-a5", name: "평촌 A-5 한가람한양·삼성·두산", ...PC, households: null, summary: "1기 신도시 2차 정비 후보 · 초안 접수(2026.05 보도)", complexes: ["한가람(한양)", "한가람(삼성)", "한가람(두산)"] }),
  cand({ id: "nt-pc-c-a9", name: "평촌 A-9 목련두산6·우성7", ...PC, households: null, summary: "1기 신도시 2차 정비 후보 · 초안 접수(2026.05 보도)", complexes: ["목련두산", "목련우성7"] }),
  cand({ id: "nt-pc-c-a13", name: "평촌 A-13 초원부영", ...PC, households: null, summary: "1기 신도시 2차 정비 후보 · 초안 접수(2026.05 보도)", complexes: ["초원부영"] }),

  /* ── 도심 공공주택 복합사업 ── 증산4구역 · 인천 가정1구역은 이미 지도에 있다. 부천원미 · 고은산 서측은 찍을 기준점이 없어 싣지 않는다 */
  dosim({ id: "ds-singil2", name: "신길2구역(도심공공복합)", sido: "서울", sigungu: "영등포구", regionKey: "서울영등포구", households: 1326,
    summary: "도심 공공주택 복합사업 · 본지구 지정(2021.12)", sourceUrl: "https://www.korea.kr/briefing/pressReleaseView.do?newsId=156489168", place: { query: "신길2구역", mustContain: "신길2" } }),
  dosim({ id: "ds-singil4", name: "신길4구역(도심공공복합)", sido: "서울", sigungu: "영등포구", regionKey: "서울영등포구", households: 1273,
    summary: "도심 공공주택 복합사업 · 지구 지정(2026.09)", sourceUrl: "https://view.asiae.co.kr/article/2026101609234273860", place: { query: "신길4구역", mustContain: "신길4" } }),
  dosim({ id: "ds-banghak", name: "방학역 인근(도심공공복합)", sido: "서울", sigungu: "도봉구", regionKey: "서울도봉구", households: 409,
    summary: "도심 공공주택 복합사업 · 본지구 지정(2021.12)", sourceUrl: "https://www.korea.kr/briefing/pressReleaseView.do?newsId=156489168", place: { query: "방학역", mustContain: "방학역", note: "방학역" } }),
  dosim({ id: "ds-yeonsinnae", name: "연신내역 인근(도심공공복합)", sido: "서울", sigungu: "은평구", regionKey: "서울은평구", households: 427,
    summary: "도심 공공주택 복합사업 · 본지구 지정(2021.12)", sourceUrl: "https://www.korea.kr/briefing/pressReleaseView.do?newsId=156489168", place: { query: "연신내역", mustContain: "연신내역", note: "연신내역" } }),
  dosim({ id: "ds-ssangmun", name: "쌍문역 동측·서측(도심공공복합)", sido: "서울", sigungu: "도봉구", regionKey: "서울도봉구", households: 1734,
    summary: "도심 공공주택 복합사업 · 본지구 지정(2021.12) · 동측 646 · 서측 1,088세대", sourceUrl: "https://www.korea.kr/briefing/pressReleaseView.do?newsId=156489168", place: { query: "쌍문역", mustContain: "쌍문역", note: "쌍문역" } }),
  dosim({ id: "ds-mokdong-stn", name: "목동역 인근(도심공공복합)", sido: "서울", sigungu: "양천구", regionKey: "서울양천구", households: null,
    summary: "도심 공공주택 복합사업 · 예정지구 지정(2025.12)", sourceUrl: "https://www.apnews.kr/news/articleView.html?idxno=3044119", place: { query: "목동역", mustContain: "목동역", note: "목동역" } }),
  dosim({ id: "ds-mok4-gangseo", name: "목4동 강서고 인근(도심공공복합)", sido: "서울", sigungu: "양천구", regionKey: "서울양천구", households: null,
    summary: "도심 공공주택 복합사업 · 예정지구 지정(2025.12)", sourceUrl: "https://www.apnews.kr/news/articleView.html?idxno=3044119", place: { query: "강서고등학교", mustContain: "강서고", note: "강서고등학교" } }),
  dosim({ id: "ds-nokbeon", name: "녹번동 근린공원 인근(도심공공복합)", sido: "서울", sigungu: "은평구", regionKey: "서울은평구", households: 2676,
    summary: "도심 공공주택 복합사업 · 지구 지정(2026.09)", sourceUrl: "https://view.asiae.co.kr/article/2026101609234273860", place: { query: "녹번근린공원", mustContain: "녹번", note: "녹번근린공원" } }),
  dosim({ id: "ds-songjung", name: "송중동 주민센터 인근(도심공공복합)", sido: "서울", sigungu: "강북구", regionKey: "서울강북구", households: 1083,
    summary: "도심 공공주택 복합사업 · 지구 지정(2026.09)", sourceUrl: "https://view.asiae.co.kr/article/2026101609234273860", place: { query: "송중동주민센터", mustContain: "송중동", note: "송중동 주민센터" } }),
  dosim({ id: "ds-mia16", name: "미아16구역(도심공공복합)", sido: "서울", sigungu: "강북구", regionKey: "서울강북구", households: null,
    summary: "도심 공공주택 복합사업 · 예정지구 지정(2025.12)", sourceUrl: "https://www.apnews.kr/news/articleView.html?idxno=3044119", place: { query: "미아16구역", mustContain: "미아16" } }),
  dosim({ id: "ds-jangwi12", name: "장위12구역(도심공공복합)", sido: "서울", sigungu: "성북구", regionKey: "서울성북구", households: null,
    summary: "도심 공공주택 복합사업 · 추진 중(2026.10 보도)", sourceUrl: "https://view.asiae.co.kr/article/2026101609234273860", place: { query: "장위12구역", mustContain: "장위12" } }),
  /* ── 가로주택정비 · 부천(착공 단계 · 부천시 정비사업 통합 홈페이지 "추진현황" 2026.08.31 기준) ──
     부천 가로주택 110구역 중 대표 지번이 공표된 착공 21곳. 위치 = 공표 지번 지오코딩(그 구 안일 때만) */
  garo({ id: "gr-bc-01", name: "부천 여월동 광남복지 가로주택", sigungu: "부천시 오정구", regionKey: "부천오정구", households: 102, lot: "경기도 부천시 오정구 여월동 8-6" }),
  garo({ id: "gr-bc-02", name: "부천 영동주택 가로주택", sigungu: "부천시 오정구", regionKey: "부천오정구", households: 164, lot: "경기도 부천시 오정구 원종동 288" }),
  garo({ id: "gr-bc-03", name: "부천 삼우아파트·성원주택·수정빌라 가로주택", sigungu: "부천시 오정구", regionKey: "부천오정구", households: 108, lot: "경기도 부천시 오정구 고강동 310-9" }),
  garo({ id: "gr-bc-04", name: "부천 로얄빌라 가로주택", sigungu: "부천시 오정구", regionKey: "부천오정구", households: 72, lot: "경기도 부천시 오정구 고강동 334-7" }),
  garo({ id: "gr-bc-05", name: "부천 부촌3차아파트 외 가로주택", sigungu: "부천시 오정구", regionKey: "부천오정구", households: 231, lot: "경기도 부천시 오정구 오정동 140-5" }),
  garo({ id: "gr-bc-06", name: "부천 은성빌라 가로주택", sigungu: "부천시 오정구", regionKey: "부천오정구", households: 82, lot: "경기도 부천시 오정구 원종동 136-4" }),
  garo({ id: "gr-bc-07", name: "부천 우진아파트 가로주택", sigungu: "부천시 오정구", regionKey: "부천오정구", households: 48, lot: "경기도 부천시 오정구 오정동 570-5" }),
  garo({ id: "gr-bc-08", name: "부천 대성연립 가로주택", sigungu: "부천시 오정구", regionKey: "부천오정구", households: 62, lot: "경기도 부천시 오정구 원종동 335" }),
  garo({ id: "gr-bc-09", name: "부천 오정613 가로주택", sigungu: "부천시 오정구", regionKey: "부천오정구", households: 200, lot: "경기도 부천시 오정구 오정동 613" }),
  garo({ id: "gr-bc-10", name: "부천 범안동 130번지 일원 가로주택", sigungu: "부천시 소사구", regionKey: "부천소사구", households: 59, lot: "경기도 부천시 소사구 괴안동 130-13" }),
  garo({ id: "gr-bc-11", name: "부천 대현청실 외2 가로주택", sigungu: "부천시 소사구", regionKey: "부천소사구", households: 252, lot: "경기도 부천시 소사구 괴안동 106-1" }),
  garo({ id: "gr-bc-12", name: "부천 원종동 성락아파트 가로주택", sigungu: "부천시 오정구", regionKey: "부천오정구", households: 172, lot: "경기도 부천시 오정구 원종동 276-2" }),
  garo({ id: "gr-bc-13", name: "부천 성산주택 가로주택", sigungu: "부천시 오정구", regionKey: "부천오정구", households: 33, lot: "경기도 부천시 오정구 고강동 292-3" }),
  garo({ id: "gr-bc-14", name: "부천 고강동 한일빌라 외 가로주택", sigungu: "부천시 오정구", regionKey: "부천오정구", households: 92, lot: "경기도 부천시 오정구 고강동 419-2" }),
  garo({ id: "gr-bc-15", name: "부천 원종공항연립 가로주택", sigungu: "부천시 오정구", regionKey: "부천오정구", households: 207, lot: "경기도 부천시 오정구 원종동 298-1" }),
  garo({ id: "gr-bc-16", name: "부천 오정동 139-5번지 외 가로주택", sigungu: "부천시 오정구", regionKey: "부천오정구", households: 131, lot: "경기도 부천시 오정구 오정동 139-5" }),
  garo({ id: "gr-bc-17", name: "부천 상신빌라 가로주택", sigungu: "부천시 오정구", regionKey: "부천오정구", households: 119, lot: "경기도 부천시 오정구 오정동 139-2" }),
  garo({ id: "gr-bc-18", name: "부천 원종동 한아름아파트 가로주택", sigungu: "부천시 오정구", regionKey: "부천오정구", households: 75, lot: "경기도 부천시 오정구 원종동 135-2" }),
  garo({ id: "gr-bc-19", name: "부천 소사본동 277-30번지 일원 가로주택", sigungu: "부천시 소사구", regionKey: "부천소사구", households: 79, lot: "경기도 부천시 소사구 소사본동 277-30" }),
  garo({ id: "gr-bc-20", name: "부천 장미연립 가로주택", sigungu: "부천시 원미구", regionKey: "부천원미구", households: 150, lot: "경기도 부천시 원미구 원미동 150-1" }),
  garo({ id: "gr-bc-21", name: "부천 삼우4차아파트 가로주택", sigungu: "부천시 오정구", regionKey: "부천오정구", households: 185, lot: "경기도 부천시 오정구 고강동 396" }),
  /* ── 소규모재건축 · 부천(부천시 정비사업 통합 홈페이지 "추진현황" 2026.09.30 기준 · 30구역 중 지번이 공표된 착공 3 · 준공 5) ── */
  smallBc({ id: "sr-bc-01", name: "부천 진양아파트 소규모재건축", sigungu: "부천시 소사구", regionKey: "부천소사구", households: 73, stageKey: "moving", lot: "경기도 부천시 소사구 소사본동 191-3" }),
  smallBc({ id: "sr-bc-02", name: "부천 대흥연립 소규모재건축", sigungu: "부천시 원미구", regionKey: "부천원미구", households: 19, stageKey: "moving", lot: "경기도 부천시 원미구 역곡동 79-13" }),
  smallBc({ id: "sr-bc-03", name: "부천 송내동 성우아파트 소규모재건축", sigungu: "부천시 소사구", regionKey: "부천소사구", households: 86, stageKey: "moving", lot: "경기도 부천시 소사구 송내동 365-1" }),
  smallBc({ id: "sr-bc-04", name: "부천 금호아파트 소규모재건축", sigungu: "부천시 소사구", regionKey: "부천소사구", households: null, stageKey: "done", lot: "경기도 부천시 소사구 괴안동 167-10" }),
  smallBc({ id: "sr-bc-05", name: "부천 오건아파트 소규모재건축", sigungu: "부천시 오정구", regionKey: "부천오정구", households: null, stageKey: "done", lot: "경기도 부천시 오정구 원종동 159-1" }),
  smallBc({ id: "sr-bc-06", name: "부천 청암아파트 소규모재건축", sigungu: "부천시 소사구", regionKey: "부천소사구", households: null, stageKey: "done", lot: "경기도 부천시 소사구 괴안동 91-1" }),
  smallBc({ id: "sr-bc-07", name: "부천 건부아파트 소규모재건축", sigungu: "부천시 원미구", regionKey: "부천원미구", households: null, stageKey: "done", lot: "경기도 부천시 원미구 심곡동 95-1" }),
  smallBc({ id: "sr-bc-08", name: "부천 한아름아파트5차 소규모재건축", sigungu: "부천시 소사구", regionKey: "부천소사구", households: null, stageKey: "done", lot: "경기도 부천시 소사구 괴안동 184" }),
];

export type Pt = { name: string; lat: number; lng: number };

/** 구역을 이루는 단지 좌표의 평균 — 하나도 안 잡히면 null. 잡힌 단지 이름도 돌려준다 */
export function complexCentroid(names: readonly string[], list: readonly Pt[]): { lat: number; lng: number; matched: string[] } | null {
  const want = new Set(names);
  const hits = list.filter((c) => want.has(c.name) && Number.isFinite(c.lat) && Number.isFinite(c.lng));
  if (hits.length === 0) return null;
  /* 같은 좌표로 지오코딩된 단지(한 주소 여러 이름)는 한 번만 센다 */
  const seen = new Set<string>();
  const uniq = hits.filter((h) => {
    const k = `${h.lat.toFixed(6)},${h.lng.toFixed(6)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const lat = uniq.reduce((s, h) => s + h.lat, 0) / uniq.length;
  const lng = uniq.reduce((s, h) => s + h.lng, 0) / uniq.length;
  return { lat: Math.round(lat * 1e7) / 1e7, lng: Math.round(lng * 1e7) / 1e7, matched: hits.map((h) => h.name) };
}

/** 장소 검색 결과에서 받아들일 것 — 이름에 꼭 들어 있어야 하는 말 + 그 자치구 주소 */
export function pickPlace<T extends { name: string; address: string; roadAddress: string }>(
  items: readonly T[],
  mustContain: string,
  inSigungu: (addr: string) => boolean,
): T | null {
  const key = mustContain.replace(/\s/g, "");
  return items.find((p) => p.name.replace(/\s/g, "").includes(key) && (inSigungu(p.address) || inSigungu(p.roadAddress))) ?? null;
}

/** 지도 안내창 주소 줄 — 어떤 기준으로 찍었는지 */
export function specialAddress(z: SpecialZone, how: { matched?: string[]; placeName?: string }): string {
  if (z.lot) return `${z.lot.replace(/^경기도 /, "")} 일대`;
  if (how.placeName) return `${z.sigungu} · ${how.placeName} 기준점(구역 경계 아님)`;
  const n = how.matched?.length ?? 0;
  return `${z.sigungu} · 단지 ${n}곳 좌표 평균`;
}
