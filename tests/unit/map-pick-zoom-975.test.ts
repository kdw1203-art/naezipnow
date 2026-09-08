import { test } from "node:test";
import assert from "node:assert/strict";
import { mapLevelToNaverZoom } from "../../lib/map/naver-maps-sdk.ts";
import {
  POINT_MODE_MIN_ZOOM,
  PICK_DEFAULT_LEVEL,
  isPointZoom,
} from "../../lib/map/pick-zoom.ts";

/* [975] "지도에서 단지 고르기" 가 성립하려면 **열자마자 고를 수 있어야** 한다.
 *
 * 실제로 겪은 실패는 이렇다: 서랍은 level 로 "지금 개별 단지가 오는 축척인가"를
 * 스스로 계산했고, 서버는 zoom 으로 판단했다. 두 경계가 level 7(zoom 14)에서
 * 한 칸 어긋나서, 서버가 단지 300곳을 보낸 화면이 "이 화면에는 실거래가 있는
 * 단지가 없어요" 라고 말했다. 사용자에게는 지도가 그냥 고장 난 것으로 보인다.
 *
 * 그래서 (1) 경계값은 한 곳(lib/map/pick-zoom)에서만 정하고,
 * (2) 서랍의 시작 축척이 그 경계 안이라는 사실을 여기서 잠근다. */

test("서랍 기본 축척은 개별 단지가 오는 구간이다", () => {
  const zoom = mapLevelToNaverZoom(PICK_DEFAULT_LEVEL);
  assert.ok(
    zoom >= POINT_MODE_MIN_ZOOM,
    `기본 level ${PICK_DEFAULT_LEVEL} → zoom ${zoom} 은 포인트 경계(${POINT_MODE_MIN_ZOOM}) 밖이다`,
  );
  assert.equal(isPointZoom(zoom), true);
});

test("경계 바로 아래는 묶음 모드다 — 경계가 실제로 경계다", () => {
  assert.equal(isPointZoom(POINT_MODE_MIN_ZOOM), true);
  assert.equal(isPointZoom(POINT_MODE_MIN_ZOOM - 1), false);
});

test("level → zoom 은 21 - level 이며 상·하한에서 잘린다", () => {
  assert.equal(mapLevelToNaverZoom(6), 15);
  assert.equal(mapLevelToNaverZoom(7), 14);
  assert.equal(mapLevelToNaverZoom(0), 21);
  assert.equal(mapLevelToNaverZoom(25), 1);
});
