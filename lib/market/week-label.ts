/* [1021] 주 라벨 두 개 — lib/market/temperature.ts 는 server-only 라 클라이언트(TempMapClient)가 import 할 수 없다.
   순수 문자열 함수만 여기로 옮기고 temperature.ts 는 재수출한다(호출부 경로 그대로). */

/** 'YYYY-MM-DD' → "26.07.20" (차트 축·표 라벨) */
export function formatWeekLabel(weekStart: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStart);
  return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : weekStart;
}

/** 'YYYY-MM-DD' → "2026년 7월 20일" (본문 문장용) */
export function formatWeekKorean(weekStart: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStart);
  return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : weekStart;
}
