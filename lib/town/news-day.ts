/**
 * [1097 · 디자인] 뉴스룸 행을 날짜(한국 시간)로 묶는다 — 소유자 2026-10-31 "구분이 제대로 안 되어 있는 것 같아 가독성이 떨어져"(뉴스룸 데스크톱).
 * 40행이 얇은 선 하나로만 나뉘어 한 덩어리로 읽혔다. 날짜 머리("10월 31일 (금) · 12건")가 묶음의 경계가 된다.
 *
 * 라벨은 절대 날짜만 — "오늘·어제"는 렌더 시각에 매여 서버(ISR 5분)와 브라우저가 다르게 그릴 수 있다(hydration 불일치).
 * 연도는 첫 묶음과 다를 때만 앞에 적는다(데이터만으로 정해진다). 순수 함수(클라이언트 · node:test 공용).
 */
import { kstParts, WEEKDAY_KO } from "@/lib/format/kst";

export type NewsDayGroup<T> = { key: string; label: string; rows: T[] };

/** "2026-10-31" — KST 날짜 키. 파싱 실패면 "" (한 묶음 "날짜 없음"으로 모인다) */
export function newsDayKey(iso: string): string {
  const p = kstParts(iso);
  if (!p) return "";
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** "10월 31일 (금)" · 연도가 다르면 "2025년 12월 31일 (수)" */
export function newsDayLabel(key: string, baseYear: number | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return "날짜 없음";
  const p = kstParts(`${key}T12:00:00+09:00`);
  const year = Number(m[1]);
  const body = `${Number(m[2])}월 ${Number(m[3])}일${p ? ` (${WEEKDAY_KO[p.weekday]})` : ""}`;
  return baseYear !== null && year !== baseYear ? `${year}년 ${body}` : body;
}

/** 입력 순서를 지키며(목록은 이미 최신순) 같은 날짜를 한 묶음으로 */
export function groupNewsRowsByDay<T extends { publishedAt: string }>(rows: readonly T[]): NewsDayGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = newsDayKey(r.publishedAt);
    const arr = map.get(k);
    if (arr) arr.push(r);
    else map.set(k, [r]);
  }
  const first = [...map.keys()].find((k) => k !== "");
  const baseYear = first ? Number(first.slice(0, 4)) : null;
  return [...map.entries()].map(([key, items]) => ({ key: key || "none", label: newsDayLabel(key, baseYear), rows: items }));
}
