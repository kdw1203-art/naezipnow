/**
 * [1008 · Q] 만원 → "12억 4,500만" — 실거래 한 건을 **반올림 없이** 적는 표기(순수, 클라이언트 안전).
 *
 * 왜 lib/format/krw.ts 가 아닌가: 그쪽 스타일은 전부 억 소수("12.5억")로 줄인다 — 평균·요약에는
 * 맞지만, 게임(/quiz)·호가 점검처럼 "그 한 건이 정확히 얼마였나"를 맞히고 비교하는 화면에서는
 * 12억 4,500만과 12억 5,000만이 같은 "12.5억"으로 보인다. 국토부 신고 금액은 만원 단위 정수라
 * 억·만 두 토막이면 원값 그대로 적힌다.
 *   formatEokMan(124500) → "12억 4,500만"
 *   formatEokMan(120000) → "12억"
 *   formatEokMan(9800)   → "9,800만"
 *   formatEokMan(0 | NaN | null) → "—"
 *
 * [1009] 네이버 부동산·토스 표기 관례를 사이트 표준으로 삼으면서 옵션을 붙였다(기본 출력은 그대로).
 *   formatEokMan(124500, { unit: "만원" }) → "12억 4,500만원" · 120000 → "12억원" · 9800 → "9,800만원"
 *   formatEokMan(null, { empty: "-" })     → "-"
 * 정수 만원이 아닌 값(평균가 등)은 만원 자리에서 반올림한다 — 평균을 이 표기로 쓸 땐 "평균" 이라는
 * 말을 함께 적어 한 건 값으로 읽히지 않게 한다.
 */
export type EokManOptions = {
  /** 끝 단위 — 기본 "만"(원 생략, 네이버 부동산 목록) · 문장·영수증은 "만원" */
  unit?: "만" | "만원";
  /** 0·음수·NaN·null 일 때. 기본 "—" */
  empty?: string;
};

export function formatEokMan(manwon: number | null | undefined, opts: EokManOptions = {}): string {
  const p = eokManParts(manwon);
  if (!p) return opts.empty ?? "—";
  const won = opts.unit === "만원";
  if (p.eok === 0) return `${p.man.toLocaleString("ko-KR")}만${won ? "원" : ""}`;
  if (p.man === 0) return `${p.eok.toLocaleString("ko-KR")}억${won ? "원" : ""}`;
  return `${p.eok.toLocaleString("ko-KR")}억 ${p.man.toLocaleString("ko-KR")}만${won ? "원" : ""}`;
}

/**
 * [1009] 억·만 두 토막 — 큰 숫자 타이포(숫자는 굵고 크게, 단위는 작고 옅게)를 그릴 때 쓴다.
 * 0·음수·NaN·null 이면 null.
 */
export function eokManParts(manwon: number | null | undefined): { eok: number; man: number } | null {
  if (manwon == null || !Number.isFinite(manwon) || manwon <= 0) return null;
  const v = Math.round(manwon);
  return { eok: Math.floor(v / 10_000), man: v % 10_000 };
}
