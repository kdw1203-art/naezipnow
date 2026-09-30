/* [1026b · 시나리오·비교] 비교표 한 행의 모양과 표기 — page.tsx 에 있던 것을 그대로 옮겼다(결론은 page.tsx · 표는 CompareTable 지연 조각이
   같은 표기를 써야 해서 한 곳에 둔다). 표기 규칙은 바뀌지 않았다. */
import { formatKrwWon } from "@/lib/format/krw";
import { formatEokMan } from "@/lib/format/eok-man";

/** POST /api/analysis/complex-compare 한 행 */
export type CompareItem = {
  id: string;
  name: string;
  region: string;
  hasData: boolean;
  /** [1008 · Q] 조회 실패(hasData=false 와 함께) — "거래 없음"과 다른 문장으로 */
  failed?: boolean;
  avg6mKrw: number | null;
  avgPyeong6mKrw: number | null;
  count6m: number;
  count12m: number;
  latest: { ym: string; amountKrw: number; areaM2: number | null; floor: number | null } | null;
};

/** [967 · 31] 원 → "8.45억" — lib/format/krw.ts "eok". null 만 "—" 이고 0 은 "0억" 이던 기존 얼굴 유지 */
export function fmtEok(krw: number | null): string {
  if (krw === null) return "—";
  return formatKrwWon(krw, { style: "eok", below: "eok", empty: false });
}

/** [1009 · A] 원 → 평당가 "3,383만" · "1억 2,017만"(표기 표준: 억 미전환 금지). 평균이라 머리글에 "평균"을 적는다 */
export function fmtPyeong(krw: number | null): string {
  if (krw === null) return "—";
  return formatEokMan(krw / 10_000);
}

/** [1009 · A] 한 건의 실거래 — 정밀 표기 "8억 4,500만"(네이버 부동산 목록 관례) */
export function fmtDeal(krw: number | null): string {
  if (krw === null) return "—";
  return formatEokMan(krw / 10_000);
}

export function fmtYm(ym: string): string {
  return /^\d{6}$/.test(ym) ? `${ym.slice(2, 4)}.${ym.slice(4)}` : ym;
}
