import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_DIMENSION,
  SKIP_BYTES,
  isResizableType,
  needsReencode,
  outputMime,
  renamedForMime,
  targetDimensions,
} from "../../lib/client/image-resize-math.ts";
import {
  IMAGE_SRCSET_WIDTHS,
  buildImageSrcSet,
  canOptimizeImage,
  optimizedImageUrl,
} from "../../lib/images/srcset.ts";
import {
  SHEET_AXIS_SLOP,
  SHEET_CLOSE_DY,
  SWIPE_AXIS_RATIO,
  SWIPE_MIN_DX,
  decideSwipeAxis,
  horizontalSwipeDelta,
  shouldCloseSheet,
} from "../../lib/client/swipe-gesture.ts";

/* [968 · 18] 사진 리사이즈 계산 · [968 · 17] /_next/image srcset 조립 ·
   [968 · 36 · 37] 바텀시트·캐러셀 스와이프 판정 — 전부 브라우저 없이 검증 가능한 순수 함수다. */

/* ── [968 · 18] 리사이즈 계산 ─────────────────────────────────────────── */

test("[968 · 18] targetDimensions — 긴 변을 상한에 맞추고 비율을 지킨다", () => {
  assert.deepEqual(targetDimensions(4000, 3000, 1600), { width: 1600, height: 1200, scale: 0.4 });
  assert.deepEqual(targetDimensions(3000, 4000, 1600), { width: 1200, height: 1600, scale: 0.4 });
  /* 정사각형 */
  assert.deepEqual(targetDimensions(2000, 2000, 1000), { width: 1000, height: 1000, scale: 0.5 });
  /* 기본 상한은 MAX_DIMENSION */
  assert.equal(targetDimensions(3200, 100).width, MAX_DIMENSION);
});

test("[968 · 18] targetDimensions — 상한 이하는 확대하지 않는다", () => {
  assert.deepEqual(targetDimensions(800, 600, 1600), { width: 800, height: 600, scale: 1 });
  assert.deepEqual(targetDimensions(1600, 900, 1600), { width: 1600, height: 900, scale: 1 });
});

test("[968 · 18] targetDimensions — 극단 비율·이상 입력에서도 1px 이상", () => {
  /* 1×4000 파노라마: 반올림하면 0 이 되는 폭을 1 로 지킨다 */
  assert.deepEqual(targetDimensions(1, 4000, 1600), { width: 1, height: 1600, scale: 0.4 });
  assert.deepEqual(targetDimensions(4000, 1, 1600), { width: 1600, height: 1, scale: 0.4 });
  /* 0·음수·NaN 상한이면 그대로 두되 최소 1 */
  assert.deepEqual(targetDimensions(0, 0, 1600), { width: 1, height: 1, scale: 1 });
  assert.equal(targetDimensions(500, 300, 0).width, 500);
  assert.equal(targetDimensions(500, 300, Number.NaN).height, 300);
});

test("[968 · 18] needsReencode — 상한 이내 + 작은 파일만 건너뛴다", () => {
  /* 작고 가벼움 → 손대지 않음 */
  assert.equal(needsReencode(1200, 900, 400_000), false);
  /* 경계값: 딱 상한·딱 SKIP_BYTES 는 건너뛴다 */
  assert.equal(needsReencode(1600, 1200, SKIP_BYTES), false);
  /* 크기는 작지만 무거움(고화질 JPEG) → 재인코딩 */
  assert.equal(needsReencode(1200, 900, SKIP_BYTES + 1), true);
  /* 픽셀이 큼 → 재인코딩 */
  assert.equal(needsReencode(4000, 3000, 100_000), true);
  /* 옵션 상한 */
  assert.equal(needsReencode(1200, 900, 100_000, { max: 1000 }), true);
  assert.equal(needsReencode(1200, 900, 100_000, { max: 1200, skipBytes: 50_000 }), true);
});

test("[968 · 18] outputMime·renamedForMime — 투명 PNG 만 PNG 유지, 확장자는 결과 형식", () => {
  assert.equal(outputMime("image/png", true), "image/png");
  assert.equal(outputMime("image/png", false), "image/jpeg");
  assert.equal(outputMime("image/jpeg", true), "image/jpeg");
  assert.equal(outputMime("image/webp", false), "image/jpeg");
  assert.equal(renamedForMime("IMG_0001.HEIC.jpeg", "image/jpeg"), "IMG_0001.HEIC.jpg");
  assert.equal(renamedForMime("chart.png", "image/png"), "chart.png");
  assert.equal(renamedForMime("chart.png", "image/jpeg"), "chart.jpg");
  /* 이름이 비면(확장자만 있어도) photo — 종전 image-resize.ts 의 renamed() 와 같은 규칙 */
  assert.equal(renamedForMime("", "image/jpeg"), "photo.jpg");
  assert.equal(renamedForMime(".hidden", "image/webp"), "photo.webp");
});

test("[968 · 18] isResizableType — 캔버스로 구워도 되는 형식만", () => {
  assert.equal(isResizableType("image/jpeg"), true);
  assert.equal(isResizableType("image/png"), true);
  assert.equal(isResizableType("image/webp"), true);
  /* GIF 는 첫 프레임만 남고, HEIC 는 브라우저가 못 굽는다 */
  assert.equal(isResizableType("image/gif"), false);
  assert.equal(isResizableType("image/heic"), false);
  assert.equal(isResizableType("application/pdf"), false);
});

/* ── [968 · 17] srcset ─────────────────────────────────────────────────── */

const SUPABASE_SRC =
  "https://abcdefgh.supabase.co/storage/v1/object/sign/notes/a.jpg?token=xyz";

test("[968 · 17] canOptimizeImage — next.config remotePatterns 와 같은 호스트만", () => {
  assert.equal(canOptimizeImage(SUPABASE_SRC), true);
  assert.equal(canOptimizeImage("https://phinf.pstatic.net/a/b.png"), true);
  assert.equal(canOptimizeImage("https://images.unsplash.com/x.jpg"), false);
  assert.equal(canOptimizeImage("http://abcdefgh.supabase.co/x.jpg"), false);
  assert.equal(canOptimizeImage("https://evil.supabase.co.attacker.com/x.jpg"), false);
  assert.equal(canOptimizeImage(""), false);
  assert.equal(canOptimizeImage(null), false);
  assert.equal(canOptimizeImage(undefined), false);
});

test("[968 · 17] buildImageSrcSet — 폭마다 /_next/image 후보, 허용 밖은 빈 문자열", () => {
  const set = buildImageSrcSet(SUPABASE_SRC);
  const parts = set.split(", ");
  assert.equal(parts.length, IMAGE_SRCSET_WIDTHS.length);
  for (const [i, w] of IMAGE_SRCSET_WIDTHS.entries()) {
    assert.equal(parts[i], `${optimizedImageUrl(SUPABASE_SRC, w)} ${w}w`);
    assert.ok(parts[i].startsWith(`/_next/image?url=${encodeURIComponent(SUPABASE_SRC)}&w=${w}&q=75 `));
  }
  /* 서명 토큰(query)이 인코딩돼 그대로 실린다 — 변환기가 원본을 받을 수 있어야 한다 */
  assert.ok(set.includes(encodeURIComponent("?token=xyz")));
  assert.equal(buildImageSrcSet("https://images.unsplash.com/x.jpg"), "");
  /* 폭·화질 지정 */
  assert.equal(buildImageSrcSet(SUPABASE_SRC, [384], 60), `${optimizedImageUrl(SUPABASE_SRC, 384, 60)} 384w`);
});

/* ── [968 · 36] 바텀시트 끌어서 닫기 ──────────────────────────────────── */

test("[968 · 36] decideSwipeAxis — slop 미만은 미정, 넘으면 큰 쪽 축·같으면 세로", () => {
  assert.equal(decideSwipeAxis(3, 4), null);
  assert.equal(decideSwipeAxis(SHEET_AXIS_SLOP - 1, SHEET_AXIS_SLOP - 1), null);
  assert.equal(decideSwipeAxis(0, SHEET_AXIS_SLOP), "y");
  assert.equal(decideSwipeAxis(SHEET_AXIS_SLOP, 0), "x");
  assert.equal(decideSwipeAxis(12, 30), "y");
  assert.equal(decideSwipeAxis(-30, 12), "x");
  /* 동률은 스크롤(세로) 우선 */
  assert.equal(decideSwipeAxis(20, 20), "y");
  assert.equal(decideSwipeAxis(20, -20), "y");
});

test("[968 · 36] shouldCloseSheet — 세로 축으로 아래 60px 이상일 때만", () => {
  assert.equal(shouldCloseSheet("y", SHEET_CLOSE_DY), true);
  assert.equal(shouldCloseSheet("y", SHEET_CLOSE_DY + 40), true);
  assert.equal(shouldCloseSheet("y", SHEET_CLOSE_DY - 1), false);
  /* 위로 끌기는 닫기가 아니다 */
  assert.equal(shouldCloseSheet("y", -100), false);
  /* 가로 축·미정이면 닫지 않는다 */
  assert.equal(shouldCloseSheet("x", 200), false);
  assert.equal(shouldCloseSheet(null, 200), false);
  assert.equal(shouldCloseSheet("y", 30, 20), true);
});

/* ── [968 · 37] 캐러셀 스와이프 축 판정 ────────────────────────────────── */

test("[968 · 37] horizontalSwipeDelta — |dx|>40 이면서 |dx|>1.5·|dy| 일 때만 넘긴다", () => {
  /* 왼쪽으로 끌면 다음(+1), 오른쪽으로 끌면 이전(−1) */
  assert.equal(horizontalSwipeDelta(-80, 0), 1);
  assert.equal(horizontalSwipeDelta(80, 0), -1);
  /* 예전 규칙이 넘겨 버리던 케이스: 세로 스크롤 중 살짝 비껴간 손가락 */
  assert.equal(horizontalSwipeDelta(-60, 120), 0);
  assert.equal(horizontalSwipeDelta(-60, 50), 0);
  /* 경계: |dx| 는 minDx 를 "넘어야" 하고, 비율도 "넘어야" 한다 */
  assert.equal(horizontalSwipeDelta(-SWIPE_MIN_DX, 0), 0);
  assert.equal(horizontalSwipeDelta(-(SWIPE_MIN_DX + 1), 0), 1);
  assert.equal(horizontalSwipeDelta(-60, 60 / SWIPE_AXIS_RATIO), 0);
  assert.equal(horizontalSwipeDelta(-60, 60 / SWIPE_AXIS_RATIO - 1), 1);
  /* 옵션 */
  assert.equal(horizontalSwipeDelta(-30, 0, { minDx: 20 }), 1);
  assert.equal(horizontalSwipeDelta(-60, 50, { ratio: 1 }), 1);
});
