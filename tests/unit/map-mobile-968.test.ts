import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHROME_COMPACT_MEDIA,
  CHROME_RESTORE_DELAY_MS,
  nextChromeState,
  shouldScheduleRestore,
  type MapChromeEvent,
  type MapChromeState,
} from "../../lib/map/chrome-state.ts";

/* [968 · 24] 모바일 지도 크롬 접기 — 전이 규칙은 map-client.tsx(5,000줄) 밖의 순수
   함수라 브라우저 없이 표로 검증한다. */

const narrow = { narrow: true };
const wide = { narrow: false };

test("nextChromeState — 좁은 화면에서 dragstart 는 접는다", () => {
  assert.equal(nextChromeState("dragstart", "expanded", narrow), "compact");
  assert.equal(nextChromeState("dragstart", "compact", narrow), "compact");
});

test("nextChromeState — 넓은 화면(≥768)에서는 어떤 이벤트도 접지 않는다", () => {
  const events: MapChromeEvent[] = ["dragstart", "idle", "idle-timeout", "tap", "widen"];
  for (const evt of events) {
    assert.equal(nextChromeState(evt, "expanded", wide), "expanded", evt);
    /* 이미 접혀 있던 상태로 넓어져도 즉시 편다 */
    assert.equal(nextChromeState(evt, "compact", wide), "expanded", evt);
  }
});

test("nextChromeState — 잠금(필터 패널·목록 뷰·입력 중)이면 dragstart 가 상태를 바꾸지 않는다", () => {
  assert.equal(nextChromeState("dragstart", "expanded", { narrow: true, locked: true }), "expanded");
  /* 잠금은 '접지 않기'지 '펴기'가 아니다 — 이미 접힌 건 그대로 */
  assert.equal(nextChromeState("dragstart", "compact", { narrow: true, locked: true }), "compact");
});

test("nextChromeState — idle 은 상태를 유지한다(복원은 타이머가 맡는다)", () => {
  assert.equal(nextChromeState("idle", "compact", narrow), "compact");
  assert.equal(nextChromeState("idle", "expanded", narrow), "expanded");
});

test("nextChromeState — idle-timeout · tap · widen 은 편다", () => {
  for (const evt of ["idle-timeout", "tap", "widen"] as const) {
    assert.equal(nextChromeState(evt, "compact", narrow), "expanded", evt);
    assert.equal(nextChromeState(evt, "expanded", narrow), "expanded", evt);
  }
});

test("nextChromeState — 실제 시나리오: 끌기 → 멈춤 → 1.2초 뒤 복원, 사이에 다시 끌면 유지", () => {
  let s: MapChromeState = "expanded";
  s = nextChromeState("dragstart", s, narrow);
  assert.equal(s, "compact");
  s = nextChromeState("idle", s, narrow);
  assert.equal(s, "compact");
  assert.equal(shouldScheduleRestore("idle", s), true);
  /* 타이머 전에 다시 끌기 시작 — 호출부가 타이머를 지우고 compact 유지 */
  s = nextChromeState("dragstart", s, narrow);
  assert.equal(s, "compact");
  s = nextChromeState("idle", s, narrow);
  s = nextChromeState("idle-timeout", s, narrow);
  assert.equal(s, "expanded");
});

test("shouldScheduleRestore — compact 상태의 idle 에서만 타이머를 건다", () => {
  assert.equal(shouldScheduleRestore("idle", "compact"), true);
  assert.equal(shouldScheduleRestore("idle", "expanded"), false);
  assert.equal(shouldScheduleRestore("dragstart", "compact"), false);
  assert.equal(shouldScheduleRestore("tap", "compact"), false);
  assert.equal(shouldScheduleRestore("idle-timeout", "compact"), false);
});

test("상수 — 복원 지연 1.2초, 접기 경계는 Tailwind md 미만(767px)", () => {
  assert.equal(CHROME_RESTORE_DELAY_MS, 1200);
  assert.equal(CHROME_COMPACT_MEDIA, "(max-width: 767px)");
});
