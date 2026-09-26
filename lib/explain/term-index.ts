/**
 * [1009] 용어 설명(ⓘ) 버튼이 **처음 그릴 때** 필요한 것 — 슬러그 → 용어 이름.
 *
 * 왜 따로 두나: 설명 본문(lib/seo/glossary-terms.ts, 56개 · 약 40KB)은 버튼을 누를 때 늦게 불러온다
 * (단지 허브 /complex/[id] 는 번들 예산 480KB 중 472KB 를 쓰고 있다). 그런데 버튼의 이름
 * ("전세가율 설명 보기")은 누르기 전에 있어야 스크린리더가 읽는다. 이름만 여기 둔다.
 * 두 목록이 어긋나지 않게 tests/unit/explain-1009.test.ts 가 원본과 한 글자씩 대조한다 —
 * 용어사전에 항목을 더하면 여기에도 더해야 테스트가 통과한다.
 */
export const EXPLAIN_TERM_NAMES = {
  silgeoraega: "실거래가",
  hoga: "호가",
  haejegeorae: "해제거래",
  pyeongdanga: "평당가",
  "maemae-gagyeok-jisu": "매매가격지수",
  sigogonggae: "실거래가 공개시스템",
  "geoRae-ryang": "거래량",
  "gap-tuja": "갭투자",
  imjang: "임장",
  jeonyongmyeonjeok: "전용면적",
  gonggeupmyeonjeok: "공급면적",
  gongyongmyeonjeok: "공용면적",
  gyeyakmyeonjeok: "계약면적",
  jeonyongryul: "전용률",
  "gukmin-pyeonghyeong": "국민평형",
  panshanghyeong: "판상형 / 타워형",
  jeonse: "전세",
  wolse: "월세",
  banjeonse: "반전세",
  bojeunggeum: "보증금",
  "jeonse-garyul": "전세가율",
  "jeonwolse-jeonhwanyul": "전월세전환율",
  "gyeyaks-gaengsin-cheonggugwon": "계약갱신요구권",
  ltv: "LTV (주택담보대출비율)",
  dsr: "DSR (총부채원리금상환비율)",
  dti: "DTI (총부채상환비율)",
  "wonligeum-gyundeung": "원리금균등상환",
  "wongeum-gyundeung": "원금균등상환",
  "geochi-gigan": "거치기간",
  "junggangeum-daechul": "중도금대출",
  "gongsi-gagyeok": "공시가격",
  chwideukse: "취득세",
  jaesanse: "재산세",
  jongbuse: "종합부동산세",
  "yangdo-sodeukse": "양도소득세",
  cheongyak: "청약",
  "cheongyak-gajeom": "청약가점",
  "teukbyeol-gonggeup": "특별공급",
  bunyanggwon: "분양권",
  mibunyang: "미분양",
  "ipju-mulryang": "입주물량",
  jeongbisaeop: "정비사업",
  jaegaebal: "재개발",
  jaegeonchuk: "재건축",
  "anjeon-jindan": "안전진단",
  ipjugwon: "입주권",
  gyeongmae: "부동산 경매",
  gongmae: "공매",
  "gwolli-bunseok": "권리분석",
  "deunggibu-deungbon": "등기부등본",
  geunjeodang: "근저당권",
  jeonsegwon: "전세권",
  "hwakjeong-ilja": "확정일자",
  daehangryeok: "대항력",
  "usun-byeonjegwon": "우선변제권",
  "sijang-ondo": "시장 온도",
} as const;

export type ExplainTerm = keyof typeof EXPLAIN_TERM_NAMES;

export function explainTermName(term: string): string | null {
  return (EXPLAIN_TERM_NAMES as Record<string, string>)[term] ?? null;
}
