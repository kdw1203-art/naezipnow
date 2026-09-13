import type { NoteLevel } from "@/lib/notes/note-scores";

/* [995] 재방문 작성 화면의 "지난 체크" 띠 — 의존성 없는 작은 모듈. 작성 폼(/notes/new
   번들, 예산 470KB)이 revisit-prefill 전체(체크리스트 카탈로그·점수 규칙)를 끌고 오지
   않도록 분리했다. 판정 조립(buildRevisitPrefill)은 서버(page.tsx)에서만 돈다. */

/** "지난 체크" 띠 — 라벨 + 글리프. 좋음 ✓ · 보통 – · 아쉬움 ✗. 최대 6개(현장에서 한 줄). */
export const PREVIOUS_CHECKS_MAX = 6;
export function previousCheckChips(
  checks: Record<string, NoteLevel>,
  order: readonly string[],
): Array<{ label: string; level: NoteLevel; glyph: "✓" | "–" | "✗" }> {
  const out: Array<{ label: string; level: NoteLevel; glyph: "✓" | "–" | "✗" }> = [];
  const keys = [...order.filter((k) => k in checks), ...Object.keys(checks).filter((k) => !order.includes(k))];
  for (const k of keys) {
    const lv = checks[k];
    if (!lv) continue;
    out.push({ label: k, level: lv, glyph: lv === "좋음" ? "✓" : lv === "아쉬움" ? "✗" : "–" });
    if (out.length >= PREVIOUS_CHECKS_MAX) break;
  }
  return out;
}
