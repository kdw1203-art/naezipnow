/**
 * [1057] 기간성 효과(매물 상단 노출·추천글·닉네임 효과·시즌 배지)를 다시 샀을 때의 새 만료 시각 — 순수(단위 시험 대상).
 * **지금 남은 기간 뒤에 이어 붙인다**: max(현재 만료, 지금) + 일수. lib/listings/store-db boostListing 과 같은 규칙.
 * 예전 상점 라우트는 네 효과 모두 `now + days` 로 덮어써 남은 기간이 사라졌다.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export function extendUntil(currentUntil: string | null | undefined, days: number, now: number = Date.now()): string {
  const prev = currentUntil ? Date.parse(String(currentUntil)) : NaN;
  const base = Number.isFinite(prev) && prev > now ? prev : now;
  return new Date(base + days * DAY_MS).toISOString();
}
