/* [1070] 소유자 2026-10-16 — "지도에서 단지를 누르면 분석으로 넘어가지 않는 것 같아 더 자연스럽게" ·
 * "분석 순서·계산 방법·접기 디자인을 보기 편하고 심플하게".
 *  W1 지도 서랍 — 보이는 단지를 **목록으로도** 고른다(마커만이 유일한 길이 아니다).
 *  W2 같은 값 — 목록과 마커는 같은 뷰포트 응답을 쓰고, 고르는 경로도 같은 handleMarker 다.
 *  W3 펼친 칸 — 신호 칩 줄 끝에 모수·링크를 이어 붙여 세 줄 → 두 줄.
 *  W4 행동 줄 — 주 단추는 왼쪽, "접기"는 오른쪽 끝의 조용한 글자.
 *
 * 왜 목록인가(실측): 서랍은 서울시청 level 6(zoom 15)에서 열리는데 그 자리는 실거래 단지가 드물고,
 * 지도 SDK 가 안 뜨면 OSM 대체 지도에는 마커 자체가 없다 — 그때 고를 길이 검색뿐이었다. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PICK_DEFAULT_LEVEL, POINT_MODE_MIN_ZOOM, approxBounds, isPointZoom, levelToZoom } from "@/lib/map/pick-zoom";

const read = (p: string) => readFileSync(p, "utf8");

test("W1·W2 지도 서랍 — 보이는 단지를 목록으로도 고른다 · 경로는 마커와 같다", () => {
  const src = read("app/analysis/MapPickDrawer.tsx");
  /* 목록은 뷰포트 응답(view.points)에서 그대로 나온다 — 지도와 어긋날 수 없다 */
  assert.match(src, /view\.mode === "points" && view\.points\.length > 0 && \(/);
  assert.match(src, /view\.points\.slice\(0, 12\)\.map/);
  /* 고르는 경로는 마커와 같은 handleMarker — 조립(resolvePickedComplexById)이 한 곳이다 */
  assert.match(src, /onClick=\{\(\) => void handleMarker\(\{ id: p\.id, lat: p\.lat, lng: p\.lng, label: p\.name \}\)\}/);
  /* 폰 탭 면 44px 이상 */
  assert.match(src, /className="press flex min-h-11 w-full items-center/);
  /* 조회 중에는 두 번 눌리지 않는다 */
  assert.match(src, /disabled=\{resolving !== null\}/);
  /* 서랍이 열리는 축척은 여전히 "열자마자 고를 수 있는" 쪽이다(975 규칙) */
  assert.ok(isPointZoom(21 - PICK_DEFAULT_LEVEL), `level ${PICK_DEFAULT_LEVEL} 이 포인트 모드가 아니다`);
  assert.equal(POINT_MODE_MIN_ZOOM, 14);
});

test("W1c 지도가 안 떠도 목록은 선다 — 열릴 때 한 번 근사 경계로 물어본다", () => {
  const src = read("app/analysis/MapPickDrawer.tsx");
  assert.match(src, /void loadViewport\(\{ bounds: approxBounds\(center, levelToZoom\(level\)\)/);
  /* 근사 경계는 중심을 감싸고, 축척이 커질수록 좁아진다 */
  const c = { lat: 37.5665, lng: 126.978 };
  const b15 = approxBounds(c, 15);
  assert.ok(b15.swLat < c.lat && c.lat < b15.neLat, "위도가 중심을 감싸지 않는다");
  assert.ok(b15.swLng < c.lng && c.lng < b15.neLng, "경도가 중심을 감싸지 않는다");
  const b13 = approxBounds(c, 13);
  assert.ok(b13.neLng - b13.swLng > b15.neLng - b15.swLng, "멀리서 본 상자가 더 좁다");
  /* 서울 한복판 880×420px 기준이면 몇 킬로미터 안쪽이다(대륙만 한 상자가 아니다) */
  assert.ok(b15.neLat - b15.swLat < 0.05, "상자가 너무 크다");
  assert.equal(levelToZoom(PICK_DEFAULT_LEVEL), 15);
});

test("W1b 단지가 없을 때는 없다고 말하고 다음 할 일을 준다", () => {
  const src = read("app/analysis/MapPickDrawer.tsx");
  assert.match(src, /이 화면에는 실거래가 있는 단지 없음 · 지도를 옮기거나 위에서 검색/);
  /* 지도가 대체(OSM)로 내려가도 목록이 있으면 그 길을 말한다 — "검색뿐"은 더 이상 사실이 아니다 */
  assert.match(src, /지도를 불러오지 못했어요 · 아래 목록이나 검색으로 고르세요/);
  assert.match(src, /지도 불러오기 실패 · 위 검색창에 단지명을 넣어 주세요\./);
  /* 지도가 안 뜨면 목록이 자리를 더 쓴다 */
  assert.match(src, /mapDown \? "max-h-\[78%\]" : "max-h-\[46%\]"/);
});

test("W3 펼친 칸 — 모수·링크가 칩 줄 끝에 붙어 한 줄이 준다", () => {
  const src = read("app/analysis/hub-tool-detail.tsx");
  assert.match(src, /<li className="ml-1 t-caption text-text-3">고른 실행에 \{signalLabels\.length\}가지<\/li>/);
  assert.match(src, /\/methodology#signals/);
  /* 칩 줄 아래에 따로 서 있던 줄은 없다 */
  assert.doesNotMatch(src, /flex flex-col gap-1\.5 text-text-2/);
  /* 순서도 같은 칩 꼴 그대로(1068) */
  assert.equal((src.match(/rounded-full border border-line bg-surface/g) ?? []).length, 2);
});

test("W4 행동 줄 — 주 단추 왼쪽 · 접기는 오른쪽 끝의 조용한 글자", () => {
  const src = read("app/analysis/hub-tiers.tsx");
  assert.match(src, /<div className="flex items-center justify-between gap-2">/);
  assert.match(src, /aria-label=\{`\$\{c\.title\} 접기`\}[\s\S]{0,160}t-caption text-text-3/);
  /* 주 단추는 그대로 btn-soft 하나 */
  assert.match(src, /className="btn-soft inline-flex min-h-10 items-center px-4 t-sub font-bold no-underline"/);
});
