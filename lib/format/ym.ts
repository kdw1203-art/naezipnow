import { kstParts } from "@/lib/format/kst";

/* [1055] yyyymm 산술 — 한국 달 기준 · 날짜 넘침 없음.
 * 서버(Vercel)는 UTC 라 `new Date().getMonth()` 가 매월 1일 00~09시(KST)엔 전달을 가리키고,
 * `setMonth(getMonth() - n)` 은 31일에 날짜가 넘쳐 한 달이 밀린다(10/31 → "11/31" → 12/1).
 * 운영에서 같은 셈이 열 곳 넘게 각자 적혀 있어 한 곳으로 모은다(lib/complex/complex-facts 는 여기서 다시 내보낸다). */

/** 이번 달 yyyymm — KST. KST 를 못 구하면 UTC 달로 후퇴 */
export function currentYm(d: Date = new Date()): string {
  const p = kstParts(d);
  if (p) return `${p.year}${String(p.month).padStart(2, "0")}`;
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** nowYm 에서 n 개월 전 yyyymm (n=0 이면 그대로). 창은 [from, now] 양끝 포함 → 달 수 = n+1 */
export function ymMonthsBefore(nowYm: string, n: number): string {
  const y = Number(nowYm.slice(0, 4));
  const m = Number(nowYm.slice(4, 6));
  const total = y * 12 + (m - 1) - n;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${yy}${String(mm).padStart(2, "0")}`;
}

/** "yyyymm" → "yyyy.mm" (형식이 아니면 그대로) */
export function ymDotLabel(ym: string): string {
  return /^\d{6}$/.test(ym) ? `${ym.slice(0, 4)}.${ym.slice(4, 6)}` : ym;
}
