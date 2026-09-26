/**
 * [1008 · J] 날짜 계산(YYYY-MM-DD, UTC 달력 — 시간대 영향 없음). 순수.
 * 계약·잔금 일정표(lib/journey/contract.ts)와 여정 화면이 같이 쓴다 — 여정 화면이 일정표 항목 글(수 KB)까지
 * 싣지 않도록 따로 둔다.
 *
 * "오늘"은 한국 날짜(KST)다(리뷰 C): 법정 기한은 한국 달력의 날이라, 기기 시간대가 다르면(해외 출장·시간대 설정)
 * D-day 가 하루 어긋났다. 시각 → 날짜 변환은 lib/format/kst(서버·클라이언트 공용, Asia/Seoul 고정)를 쓴다.
 */
import { kstParts } from "@/lib/format/kst";

function parts(day: string): [number, number, number] {
  const [y, m, d] = day.split("-").map(Number);
  return [y, m, d];
}

function toDay(t: Date): string {
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, "0");
  const d = String(t.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** YYYY-MM-DD + n일 */
export function addDays(day: string, n: number): string {
  const [y, m, d] = parts(day);
  return toDay(new Date(Date.UTC(y, m - 1, d + n)));
}

/** to - from (일) */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** "9월 30일(수)" */
export function formatKoreanDay(day: string): string {
  const [y, m, d] = parts(day);
  const w = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일(${w})`;
}

/** 시각(epoch ms·ISO·Date)의 한국 날짜 YYYY-MM-DD — 읽을 수 없으면 null */
export function kstDayOf(input: string | number | Date): string | null {
  const p = kstParts(input);
  if (!p) return null;
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** 오늘(한국 날짜) — 브라우저에서만 부른다(서버 렌더에서 부르면 정적 HTML 에 빌드한 날이 박힌다) */
export function kstToday(nowMs: number = Date.now()): string {
  return kstDayOf(nowMs) ?? new Date(nowMs + 9 * 3_600_000).toISOString().slice(0, 10);
}

/** "D-3" · "D-day" · "2일 지남" */
export function ddayLabel(daysLeft: number): string {
  if (daysLeft > 0) return `D-${daysLeft}`;
  if (daysLeft === 0) return "D-day";
  return `${-daysLeft}일 지남`;
}

