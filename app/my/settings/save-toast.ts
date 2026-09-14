/**
 * [1000] 설정 토글 저장 토스트의 간격 규칙 — 순수 함수(node:test 대상).
 *
 * 토글은 즉시 저장이라 연달아 누르면 "저장했어요"가 겹겹이 쌓인다. 마지막 토스트에서
 * 1.5초 안이면 건너뛴다(저장 자체는 항상 한다 — 토스트만 줄인다).
 */
export const SAVE_TOAST_GAP_MS = 1500;

/** 지금 토스트를 띄워도 되는가. lastAt 은 마지막으로 띄운 시각(ms), 0 이면 아직 없음. */
export function shouldShowSaveToast(lastAt: number, now: number, gapMs = SAVE_TOAST_GAP_MS): boolean {
  if (!Number.isFinite(lastAt) || lastAt <= 0) return true;
  return now - lastAt >= gapMs;
}
