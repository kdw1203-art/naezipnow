import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  CARRY_OVER_MAX_AGE_MS,
  NOTE_STEPS,
  canSave,
  carryOverAgeLabel,
  readCarryOver,
  readOneHand,
  serializeCarryOver,
  serializeOneHand,
  stepDone,
  stepOfField,
} from "../../lib/notes/form-steps.ts";

const NOW = Date.UTC(2026, 8, 10, 3, 0, 0);

test("단계는 셋이고 번호가 1·2·3 이다 — 탭이 세 칸이라는 전제가 코드 여러 곳에 있다", () => {
  assert.equal(NOTE_STEPS.length, 3);
  assert.deepEqual(
    NOTE_STEPS.map((s) => s.n),
    [1, 2, 3],
  );
  /* 짧은 이름은 390px 3열에 들어가야 한다 */
  for (const s of NOTE_STEPS) assert.ok(s.short.length <= 4, s.short);
});

test("저장 조건은 위치 하나 — 1단계만 채우고도 저장된다(30초 노트의 근거)", () => {
  assert.equal(canSave(true), true);
  assert.equal(canSave(false), false);
});

test("위치 오류는 1단계로 보낸다", () => {
  assert.equal(stepOfField("location"), 1);
});

test("완료 표시는 단계별 사실을 그대로 본다", () => {
  assert.deepEqual(stepDone({ located: true, judged: false, wrote: false }), {
    1: true,
    2: false,
    3: false,
  });
  assert.deepEqual(stepDone({ located: false, judged: true, wrote: true }), {
    1: false,
    2: true,
    3: true,
  });
});

test("이어받기 — 정상 값은 그대로 읽힌다", () => {
  const raw = serializeCarryOver(
    { aptName: "은마아파트", region: "서울 강남구 대치동", complexId: "c1", lat: 37.5, lng: 127.06 },
    NOW,
  );
  assert.ok(raw);
  const got = readCarryOver(raw, NOW + 1000);
  assert.equal(got?.aptName, "은마아파트");
  assert.equal(got?.complexId, "c1");
  assert.equal(got?.lat, 37.5);
});

test("이어받기 — 단지명이나 지역이 비면 제안하지 않는다(빈 칸을 채워 주는 척하지 않는다)", () => {
  assert.equal(serializeCarryOver({ aptName: "  ", region: "서울", complexId: null, lat: null, lng: null }, NOW), null);
  assert.equal(readCarryOver(JSON.stringify({ aptName: "은마", region: "", savedAt: NOW }), NOW), null);
});

test("이어받기 — 14일이 지나면 안 띄운다", () => {
  const raw = serializeCarryOver(
    { aptName: "은마아파트", region: "서울 강남구", complexId: null, lat: null, lng: null },
    NOW,
  );
  assert.ok(raw);
  assert.ok(readCarryOver(raw, NOW + CARRY_OVER_MAX_AGE_MS - 1));
  assert.equal(readCarryOver(raw, NOW + CARRY_OVER_MAX_AGE_MS + 1), null);
});

test("이어받기 — 미래 시각은 기기 시계가 틀어진 것이라 믿지 않는다", () => {
  const raw = JSON.stringify({ aptName: "은마", region: "서울", savedAt: NOW + 60_000 });
  assert.equal(readCarryOver(raw, NOW), null);
});

test("이어받기 — 깨진 JSON·다른 형식은 조용히 없는 것으로 본다", () => {
  assert.equal(readCarryOver("{", NOW), null);
  assert.equal(readCarryOver("null", NOW), null);
  assert.equal(readCarryOver('"문자열"', NOW), null);
  assert.equal(readCarryOver(null, NOW), null);
  /* savedAt 이 없던 예전 형식 */
  assert.equal(readCarryOver(JSON.stringify({ aptName: "은마", region: "서울" }), NOW), null);
});

test("이어받기 — 좌표가 숫자가 아니면 버린다(NaN 이 지도로 넘어가면 빈 지도가 뜬다)", () => {
  const raw = JSON.stringify({
    aptName: "은마",
    region: "서울",
    lat: "37.5",
    lng: Number.NaN,
    savedAt: NOW,
  });
  const got = readCarryOver(raw, NOW);
  assert.equal(got?.lat, null);
  assert.equal(got?.lng, null);
});

test("언제 것인지 밝힌다 — 모르는 값이 채워지면 불안하다", () => {
  const day = 24 * 60 * 60 * 1000;
  assert.equal(carryOverAgeLabel(NOW, NOW), "오늘");
  assert.equal(carryOverAgeLabel(NOW - day, NOW), "어제");
  assert.equal(carryOverAgeLabel(NOW - 3 * day, NOW), "3일 전");
});

test("한 손 모드 — 저장값은 '1'/'0' 뿐이고 그 밖은 꺼짐", () => {
  assert.equal(serializeOneHand(true), "1");
  assert.equal(serializeOneHand(false), "0");
  assert.equal(readOneHand("1"), true);
  assert.equal(readOneHand("0"), false);
  assert.equal(readOneHand(null), false);
  assert.equal(readOneHand("true"), false);
});
