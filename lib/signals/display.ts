/**
 * [1048] 다요인 분석 표시 낱말 — 판(SignalBoard)이 클라이언트 화면(AI 분석 결과)에도 놓이므로
 * 엔진 전체를 싣지 않게 표시에 필요한 함수·상수만 따로 둔다(첫 로드 JS 예산).
 *
 * [1052] 기준 시점(asOf)은 원천마다 꼴이 다르다 — "202608" · "2026-10-05" · "2026.09" · "20261008" ·
 * "2026.06~2026.08". 문자열 그대로 정렬하면 "2026-10-05" < "202608"("-" 가 "0" 보다 앞)이라 최신이 뒤집힌다.
 * 비교 · 표시는 asOfKey(숫자 yyyymm[dd])를 거친다.
 */

/**
 * 오름 쪽 · 내림 쪽 · 강함의 경계 — 엔진(끌어올림/누름 요인)과 판(막대 낱말 · 색)이 같은 값을 쓴다.
 * |점수| ≥ lean → "쪽"(끌어올림·누름 요인), |점수| ≥ strong → "강함". 그 사이는 중립.
 */
export const SIGNAL_LEAN = { lean: 0.5, strong: 1 } as const;

/**
 * 기준 시점 → 비교용 숫자 키 "yyyymm" 또는 "yyyymmdd". 기간("2026.06~2026.08")은 끝 쪽.
 * 읽을 수 없는 꼴(분기 "2026Q2" 등)은 null.
 */
export function asOfKey(s: string | null | undefined): string | null {
  const raw = String(s ?? "").trim();
  if (!raw) return null;
  const tail = raw
    .split(/[~∼–—]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .pop();
  if (!tail) return null;
  const compact = /^(\d{4})(\d{2})(\d{2})?(?!\d)/.exec(tail);
  const sep = compact ? null : /^(\d{4})\s*[.\-/년]\s*(\d{1,2})(?:\s*[.\-/월]\s*(\d{1,2})(?!\d))?/.exec(tail);
  const m = compact ?? sep;
  if (!m) return null;
  const y = m[1];
  const mo = Number(m[2]);
  if (!(mo >= 1 && mo <= 12)) return null;
  const mm = String(mo).padStart(2, "0");
  if (m[3] === undefined) return `${y}${mm}`;
  const d = Number(m[3]);
  if (!(d >= 1 && d <= 31)) return `${y}${mm}`;
  return `${y}${mm}${String(d).padStart(2, "0")}`;
}

/** "202608" → "2026.08" · "2026-08-01" → "2026.08.01" · "2026.9" → "2026.09" · 못 읽으면 null */
export function ymLabel(s: string | null | undefined): string | null {
  const k = asOfKey(s);
  if (!k) return null;
  return k.length === 8 ? `${k.slice(0, 4)}.${k.slice(4, 6)}.${k.slice(6, 8)}` : `${k.slice(0, 4)}.${k.slice(4, 6)}`;
}

/**
 * 여러 기준 시점 중 가장 늦은 것(표시 꼴). 같은 달이면 날짜까지 적힌 쪽을 고른다(더 구체적).
 * 읽을 수 없는 값은 건너뛴다.
 */
export function latestAsOf(values: readonly (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const v of values) {
    const k = asOfKey(v);
    if (!k) continue;
    if (best === null || k.padEnd(8, "0") > best.padEnd(8, "0")) best = k;
  }
  return best ? ymLabel(best) : null;
}

/** 점수 → 막대 방향 낱말(화면 · 프롬프트 공용) */
export function scoreWord(score: number | null): string {
  if (score === null) return "미반영";
  if (score >= SIGNAL_LEAN.strong) return "오름 쪽 강함";
  if (score >= SIGNAL_LEAN.lean) return "오름 쪽";
  if (score > -SIGNAL_LEAN.lean) return "중립";
  if (score > -SIGNAL_LEAN.strong) return "내림 쪽";
  return "내림 쪽 강함";
}

/** 점수 → 오름(+1) · 중립(0) · 내림(−1) — 판의 색과 엔진의 끌어올림/누름이 같은 경계를 쓴다 */
export function scoreLean(score: number | null): -1 | 0 | 1 {
  if (score === null) return 0;
  if (score >= SIGNAL_LEAN.lean) return 1;
  if (score <= -SIGNAL_LEAN.lean) return -1;
  return 0;
}

type FactorStateLike = { status: "ok" | "thin" | "none" | "failed"; score: number | null };

/**
 * [1052] 점수가 없는 까닭 — 불러오기 실패 · 자료 없음 · 표본 적음(점수 미반영)을 가른다. 점수가 있으면 null.
 * 판의 오른쪽 낱말 · 반영 수 풀이 · AI 프롬프트 줄이 같은 낱말을 쓴다.
 */
export function unscoredReason(f: FactorStateLike): "불러오기 실패" | "자료 없음" | "표본 적음" | null {
  if (f.status === "failed") return "불러오기 실패";
  if (f.status === "none") return "자료 없음";
  if (f.score === null) return "표본 적음";
  return null;
}

/** 요인 한 줄의 상태 낱말 — 점수가 있으면 방향 낱말, 없으면 까닭 */
export function factorStateWord(f: FactorStateLike): string {
  return unscoredReason(f) ?? scoreWord(f.score);
}

/** 반영 수 풀이 — 점수가 있는 요인만 used. 나머지는 까닭별 개수 */
export function coverageBreakdown(factors: readonly FactorStateLike[]): {
  used: number;
  total: number;
  thin: number;
  failed: number;
  none: number;
} {
  const out = { used: 0, total: factors.length, thin: 0, failed: 0, none: 0 };
  for (const f of factors) {
    const why = unscoredReason(f);
    if (why === null) out.used += 1;
    else if (why === "불러오기 실패") out.failed += 1;
    else if (why === "자료 없음") out.none += 1;
    else out.thin += 1;
  }
  return out;
}
