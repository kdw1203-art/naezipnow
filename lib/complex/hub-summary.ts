/**
 * [v4 · 한 화면 한 가지] 단지 허브 머리·요약 목록의 **표시용 순수 함수** — 서버 화면(page.tsx)과 단위테스트가 같이 쓴다.
 *
 * 왜 따로 뺐나: v4 에서 단지 허브는 "머리 사실 한 줄 + 대표가 하나 + 요약 목록(행)" 으로 줄었다. 예전엔 같은 사실
 * (준공·세대·주소·입주물량·역·학교)이 칩 줄·지표 6칸·단지 정보 카드·섹션 카드에 흩어져 두세 번씩 나왔다.
 * 여기서는 **이미 받은 값만** 한 줄·한 행으로 접는다(새 조회·새 수치 없음). 값이 없는 조각은 통째로 빠진다
 * ("—"·빈 괄호를 만들지 않는다). React·server-only 를 import 하지 않는다.
 */

/** 머리 사실 한 줄 재료 — 대표행(ComplexRow)에서 온 값만 */
export interface HeadFactInput {
  buildYear: number | null;
  households: number | null;
  roadAddress: string | null;
  address: string | null;
  /** 올해(KST) — 테스트가 고정한다 */
  nowYear: number;
}

/**
 * "1994년 준공 · 32년차 · 1,258세대 · 창원시 성산구 상남동 44-1" — 있는 값만.
 * 주소는 도로명이 있으면 도로명, 없으면 지번(예전 단지 정보 카드와 같은 우선순위). 아무것도 없으면 null.
 */
export function headFactLine(f: HeadFactInput): string | null {
  const parts: string[] = [];
  if (f.buildYear && f.buildYear > 1900) {
    parts.push(`${f.buildYear}년 준공`);
    const age = f.nowYear - f.buildYear;
    if (age >= 1) parts.push(`${age}년차`);
  }
  if (f.households && f.households > 0) parts.push(`${f.households.toLocaleString("ko-KR")}세대`);
  const addr = f.roadAddress?.trim() || f.address?.trim() || "";
  if (addr) parts.push(addr);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** 입주물량 한 줄(lib/market/supply SupplyItem 과 구조 호환) */
export interface SupplyRowInput {
  moveInYm: string;
  aptName: string | null;
  households: number | null;
  address: string | null;
  region: string;
  bizType: string | null;
}

/** 목록에 보이는 최대 행 수 — v4 브리프 "인근 입주물량 최대 4행" */
export const SUPPLY_ROWS_MAX = 4;

/**
 * 인근 입주물량 목록 — 이번 달 이후(입주 예정)를 먼저, 하나도 없으면 최근 물량으로 채운다(예전 UpcomingSupply 규칙).
 * `upcoming` 은 보여 주는 행이 **예정**인지(이번 달 이상) — 제목·요약 행이 "예정"이라고 말해도 되는지.
 */
export function supplyRows<T extends SupplyRowInput>(
  items: readonly T[],
  nowYm: string,
  max = SUPPLY_ROWS_MAX,
): { rows: T[]; upcoming: boolean } {
  const future = items.filter((i) => /^\d{6}$/.test(i.moveInYm.trim()) && i.moveInYm.trim() >= nowYm);
  if (future.length > 0) return { rows: future.slice(0, max), upcoming: true };
  return { rows: items.slice(0, max), upcoming: false };
}

/** "202609" → "2026.09" (형식이 아니면 그대로) */
export function ymDotLabel(ym: string): string {
  const s = ym.trim();
  return /^\d{6}$/.test(s) ? `${s.slice(0, 4)}.${s.slice(4)}` : s;
}

/**
 * 요약 행 "인근 입주 예정" 값 — 가장 가까운 예정 달과 그 달의 세대 합("2026.09 · 36세대").
 * 같은 달에 여러 단지면 세대를 더한다. 예정 물량이 없으면 null(지난 물량을 "예정"이라 부르지 않는다).
 */
export function nearestSupplyValue(
  items: readonly SupplyRowInput[],
  nowYm: string,
): { ym: string; value: string; names: string[] } | null {
  const { rows, upcoming } = supplyRows(items, nowYm, Number.MAX_SAFE_INTEGER);
  if (!upcoming || rows.length === 0) return null;
  const ym = rows[0].moveInYm.trim();
  const same = rows.filter((r) => r.moveInYm.trim() === ym);
  const hh = same.reduce((s, r) => s + (r.households ?? 0), 0);
  const names = same.map((r) => r.aptName?.trim()).filter((n): n is string => Boolean(n));
  return { ym, value: hh > 0 ? `${ymDotLabel(ym)} · ${hh.toLocaleString("ko-KR")}세대` : ymDotLabel(ym), names };
}

/** 직선거리 → "도보 약 8분" (80m/분 — 예전 ComplexNearbyPoi 와 같은 환산) */
export function walkMinutesLabel(distanceM: number): string {
  return `도보 약 ${Math.max(1, Math.round(distanceM / 80))}분`;
}

/** 직선거리 → "650m" · "1.2km" */
export function distanceLabel(distanceM: number): string {
  return distanceM >= 1000 ? `${(distanceM / 1000).toFixed(1)}km` : `${Math.round(distanceM)}m`;
}
