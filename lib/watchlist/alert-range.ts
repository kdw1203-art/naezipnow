/* [1057 · B10] 실거래 알림 범위(억 입력 ↔ 원) — 순수 함수(클라이언트 입력 칸·API 검증·단위 시험 공용).
   user_watchlist.alert_price_min/max 는 원 단위다. 입력 칸은 억(8.5) — 빈 칸은 "범위 없음"(null). */
import { formatKrwWon } from "@/lib/format/krw";

const KRW_PER_EOK = 100_000_000;
/** 입력 상한 — 1,000억(단지 매매가 범위 밖은 오타다) */
export const ALERT_EOK_MAX = 1000;

export type EokParse = { ok: true; krw: number | null } | { ok: false; reason: "nan" | "range" };

/** "8.5" → 850,000,000 · "" → null(지움) · 숫자 아님·0 이하·1,000억 초과 → ok:false. 소수 둘째 자리(100만원)까지 */
export function parseEokInput(raw: string): EokParse {
  const s = raw.replace(/[,\s억원]/g, "").trim();
  if (!s) return { ok: true, krw: null };
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, reason: "nan" };
  const eok = Number(s);
  if (!Number.isFinite(eok) || eok <= 0 || eok > ALERT_EOK_MAX) return { ok: false, reason: "range" };
  return { ok: true, krw: Math.round(eok * 100) * (KRW_PER_EOK / 100) };
}

/** 원 → 입력 칸 글자("8.5" · "12") — 없으면 빈 칸 */
export function eokInputFromKrw(krw: number | null | undefined): string {
  if (krw == null || !Number.isFinite(krw) || krw <= 0) return "";
  const eok = Math.round((krw / KRW_PER_EOK) * 100) / 100;
  return String(eok);
}

/** 둘 다 있을 때 최소 > 최대면 거짓 */
export function alertRangeOrdered(minKrw: number | null, maxKrw: number | null): boolean {
  if (minKrw == null || maxKrw == null) return true;
  return minKrw <= maxKrw;
}

/** 행 아래 한 줄 — "알림 범위 8.5억~9.5억" · 한쪽만이면 "알림 범위 8.5억~" · 없으면 null(서버 행·저장 직후 화면이 같은 글자) */
export function alertRangeLabel(minKrw: number | null, maxKrw: number | null): string | null {
  if (minKrw == null && maxKrw == null) return null;
  const f = (krw: number) => formatKrwWon(krw, { style: "short" });
  return `알림 범위 ${minKrw != null ? f(minKrw) : ""}~${maxKrw != null ? f(maxKrw) : ""}`;
}
