/**
 * [1025c · /pro] 브리핑 견본 — /pro 머리 옆 미니 문서의 재료. 값은 시안 mock1025c(= mock1024 · 운영 DB 2026-09-28 실측)
 * 의 공작아파트 값 **그대로**(추정·가공 없음). 화면에는 "견본 · 공작아파트 · 2026-08 기준" 라벨을 단다 — 지금 값이 아니라
 * 그때의 실측이라는 뜻. 브리핑 본문(page.tsx)과 같은 재료 이름을 쓴다(요약 띠 · 미니 3 · 개요 8 · 표 · 전세가율 줄).
 * 순수 상수 — DOM·DB 없음(테스트가 잠근다).
 */
import type { MiniSeries } from "./model";

export interface BriefSampleMini extends Pick<MiniSeries, "points" | "line" | "count"> {
  areaM2: number;
  /** "38㎡ · 2026 161건" 의 오른쪽 */
  countLabel: string;
  price: string;
  sub: string;
}

export const BRIEF_SAMPLE = {
  label: "견본 · 공작아파트 · 2026-08 기준",
  name: "공작아파트",
  address: "경기 안양시 동안구 관양동 1588 · 관평로212번길 21",
  publisher: "○○공인중개사 · 010-0000-0000",
  issued: "발행 2026-09-29 · 내집나우 실거래 기준",
  latestCaption: "최근 실거래 · 38㎡ · 2026-08-29 · 6층",
  latestPrice: "5억 5,000만",
  conclusion: "최근 12개월 매매 152건 · 최근 5억 5,000만 · 전세가율 46.5%",
  jeonsePct: 46.5,
  minisCaption: "점 = 실거래 · 막대 = 건수",
  minis: [
    { areaM2: 38, countLabel: "2026 161건", count: 161, price: "5억 5,000만", points: [{ ym: "202608", day: 29, man: 55_000, fx: 0.93, fy: 0.55, latest: true }], line: [], sub: "08-29 · 6층" },
    {
      areaM2: 50,
      countLabel: "2026 81건",
      count: 81,
      price: "7억 9,500만",
      points: [
        { ym: "202607", day: 15, man: 74_500, fx: 0.55, fy: 0.35, latest: false },
        { ym: "202608", day: 22, man: 79_500, fx: 0.86, fy: 0.75, latest: true },
      ],
      line: [],
      sub: "중앙 7억 4,500만 → 08-22 · 15층",
    },
    { areaM2: 60, countLabel: "2026 66건", count: 66, price: "9억 3,000만", points: [{ ym: "202608", day: 30, man: 93_000, fx: 0.96, fy: 0.7, latest: true }], line: [], sub: "08-30 · 10층" },
  ] as BriefSampleMini[],
  overviewCaption: "단지 대장 기준",
  overview: [
    ["세대", "1,710"],
    ["동", "14"],
    ["준공", "1993.03"],
    ["주차/세대", "0.40"],
    ["승강기", "28"],
    ["난방", "지역난방"],
    ["건설사", "(주)부영"],
    ["관리", "위탁관리"],
  ] as [string, string][],
  tableCaption: "2026 · 해제 제외 · 38㎡ 강조",
  tableHead: ["타입", "최근가", "계약일 · 층", "중앙값 · 3개월", "건수"],
  table: [
    ["38㎡", "5억 5,000만", "2026-08-29 · 6층", "—", "161"],
    ["50㎡", "7억 9,500만", "2026-08-22 · 15층", "7억 4,500만", "81"],
    ["60㎡", "9억 3,000만", "2026-08-30 · 10층", "—", "66"],
  ] as string[][],
  highlightRow: 0,
  ratioCaption: "최근 6개월",
  ratio: [
    ["전세가율", "46.5%", "전세 중앙 ÷ 매매 중앙"],
    ["갭", "—", "매매 중앙 − 전세 중앙"],
    ["관리비 · ㎡당 월", "—", "최근 12개월 평균"],
  ] as [string, string, string][],
  footer: "내집나우 실거래 기준",
} as const;

/** /pro 3칸의 "무엇이 나오는지" 한 줄 결과 — 견본 값으로만 말한다 */
export const PRO_RESULT_LINES = {
  brief: "공작아파트 → 최근 12개월 매매 152건 · 5억 5,000만 · 전세가율 46.5% 한 장",
  widget: "홈페이지에 38·50·60㎡ 최근가 표 — 실거래 갱신마다 바뀜 · 출처 표기 포함",
  watch: "담당 단지에 새 실거래·가격 변동 → 수신함에 한 줄 · 로그인 필요 · 무료",
} as const;

/** 결론 줄 — 측정 문구가 아니다("30초" 아님 · 단계 수) */
export const PRO_CONCLUSION = "단지 이름 하나로 A4 한 장 · 인쇄까지 3단계";
export const PRO_STEPS = [{ label: "단지 검색" }, { label: "사무소명 · 연락처" }, { label: "PDF 로 저장" }] as const;
