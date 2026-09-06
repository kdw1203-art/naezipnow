/**
 * [968 · 36 · 37] 스와이프 판정 — 바텀시트 끌어서 닫기와 사진 캐러셀이 같이 쓰는 순수 함수.
 *
 * 왜 따로 뺐나: "세로 스크롤인지 가로 넘김인지"를 각 컴포넌트가 제각각 어림잡으면
 * 한쪽은 스크롤 중에 사진이 넘어가고 다른 쪽은 끌어도 안 닫힌다. 숫자와 규칙을
 * 한 곳에 두고 브라우저 없이 검증한다(tests/unit/forms-mobile-968.test.ts).
 */

/** 축을 정하는 최소 이동(px) — 이보다 작으면 아직 모른다 */
export const SHEET_AXIS_SLOP = 8;

/** 시트를 닫는 세로 끌기(px) */
export const SHEET_CLOSE_DY = 60;

/** 캐러셀 넘김으로 인정하는 최소 가로 이동(px) */
export const SWIPE_MIN_DX = 40;

/** 가로 이동이 세로의 몇 배여야 가로 스와이프로 보는지 */
export const SWIPE_AXIS_RATIO = 1.5;

/**
 * 포인터가 slop 이상 움직였을 때 주축을 정한다. 아직 안 움직였으면 null.
 * 같은 거리면 세로(스크롤)를 우선한다 — 세로를 뺏는 쪽이 더 나쁘다.
 */
export function decideSwipeAxis(dx: number, dy: number, slop = SHEET_AXIS_SLOP): "x" | "y" | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < slop && ay < slop) return null;
  return ax > ay ? "x" : "y";
}

/** 세로 축으로 아래 방향 threshold 이상 끌고 놓았는가 */
export function shouldCloseSheet(
  axis: "x" | "y" | null,
  dy: number,
  threshold = SHEET_CLOSE_DY,
): boolean {
  return axis === "y" && dy >= threshold;
}

/**
 * 캐러셀 가로 스와이프인가 — |dx| 가 minDx 를 넘고 |dy| 의 ratio 배 이상일 때만.
 * 반환값은 넘길 방향: 왼쪽으로 끌면(dx<0) 다음(+1), 오른쪽으로 끌면 이전(−1), 아니면 0.
 */
export function horizontalSwipeDelta(
  dx: number,
  dy: number,
  opts?: { minDx?: number; ratio?: number },
): -1 | 0 | 1 {
  const minDx = opts?.minDx ?? SWIPE_MIN_DX;
  const ratio = opts?.ratio ?? SWIPE_AXIS_RATIO;
  const ax = Math.abs(dx);
  if (ax <= minDx) return 0;
  if (ax <= ratio * Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}
