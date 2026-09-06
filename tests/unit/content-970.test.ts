import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checksFromSavedNote,
  composeScoresFromChecks,
  countCheckedItems,
  levelFromAxisScore,
} from "../../lib/notes/note-scores.ts";
import {
  catalogCityForRegionId,
  groupBySido,
  OTHER_SIDO_LABEL,
  sameSidoFirst,
  sidoOfRegionName,
} from "../../lib/market/sido-group.ts";
import { REGION_CATALOG } from "../../lib/region/catalog.ts";

/* [970 · B-10] 현장 체크 → 5축 점수. 미선택 축은 0(서버 규약 "미입력") */

test("composeScoresFromChecks — 아무것도 고르지 않으면 다섯 축 전부 0", () => {
  assert.deepEqual(composeScoresFromChecks({}), {
    location: 0,
    school: 0,
    transport: 0,
    facility: 0,
    future: 0,
  });
  assert.equal(countCheckedItems({}), 0);
});

test("composeScoresFromChecks — 고른 항목만 축에 들어가고 나머지 축은 0 으로 남는다", () => {
  const s = composeScoresFromChecks({ 교통: "좋음" });
  assert.equal(s.transport, 5);
  /* 입지는 경사·교통 평균인데 경사가 없으니 교통만으로 5 */
  assert.equal(s.location, 5);
  assert.equal(s.school, 0);
  assert.equal(s.facility, 0);
  assert.equal(s.future, 0);
  assert.equal(countCheckedItems({ 교통: "좋음" }), 1);
});

test("composeScoresFromChecks — 전부 고르면 예전 식과 같은 값(시설 5항목 평균 반올림)", () => {
  const s = composeScoresFromChecks({
    채광: "좋음",
    소음: "보통",
    주차: "아쉬움",
    교통: "좋음",
    경사: "보통",
    보안: "보통",
    학군: "보통",
    관리: "보통",
    호재: "보통",
  });
  assert.deepEqual(s, { location: 4, school: 3, transport: 5, facility: 3, future: 3 });
});

test("levelFromAxisScore — 0 은 '보통'이 아니라 null(미입력)", () => {
  assert.equal(levelFromAxisScore(0), null);
  assert.equal(levelFromAxisScore(1), "아쉬움");
  assert.equal(levelFromAxisScore(3), "보통");
  assert.equal(levelFromAxisScore(5), "좋음");
});

test("checksFromSavedNote — fieldRatings 가 있으면 그 키만, 기본값으로 채우지 않는다", () => {
  const zero = { location: 0, school: 0, transport: 0, facility: 0, future: 0 };
  assert.deepEqual(checksFromSavedNote({ 교통: "좋음", 학군: "이상한값" }, zero), { 교통: "좋음" });
  /* 예전 노트(9키 전부)는 그대로 복원 */
  const full = checksFromSavedNote(
    { 채광: "좋음", 소음: "보통", 주차: "아쉬움", 교통: "좋음", 경사: "보통", 보안: "보통", 학군: "보통", 관리: "보통", 호재: "보통" },
    zero,
  );
  assert.equal(Object.keys(full).length, 9);
});

test("checksFromSavedNote — fieldRatings 없는 구버전은 축 점수 역변환, 0 축은 비운다", () => {
  const out = checksFromSavedNote(undefined, { location: 0, school: 0, transport: 5, facility: 0, future: 1 });
  assert.deepEqual(out, { 교통: "좋음", 호재: "아쉬움" });
});

/* [970 · B-02 · B-03] 지역 id → 시/도 (카탈로그 단일 출처) */

test("catalogCityForRegionId — 서울 25구는 '서울', 5대 광역시·경기·인천은 각자", () => {
  assert.equal(catalogCityForRegionId("gangnam"), "서울");
  assert.equal(catalogCityForRegionId("daegu-jung"), "대구");
  assert.equal(catalogCityForRegionId("ulsan-jung"), "울산");
  assert.equal(catalogCityForRegionId("incheon-jung"), "인천");
  assert.equal(catalogCityForRegionId("goyang-deogyang"), "경기");
  assert.equal(catalogCityForRegionId("no-such-region"), null);
});

/* [970 · B-34] 실거래 region_name 표기 → 시/도 묶음 */

test("sidoOfRegionName — 광역 접두는 그대로, 경기 시·구 표기는 카탈로그로, 모르면 null", () => {
  assert.equal(sidoOfRegionName("서울 강남구"), "서울");
  assert.equal(sidoOfRegionName("대구 중구"), "대구");
  assert.equal(sidoOfRegionName("부산진구"), "부산");
  assert.equal(sidoOfRegionName("수원 영통구"), "경기");
  assert.equal(sidoOfRegionName("고양시 덕양구"), "경기");
  assert.equal(sidoOfRegionName("광명시"), "경기");
  /* 부분 일치로 붙이지 않는다 — 포항 남구를 부산 남구로 만들면 안 된다 */
  assert.equal(sidoOfRegionName("포항 남구"), null);
  assert.equal(sidoOfRegionName("청주 흥덕구"), null);
  /* 경기 광주시는 광주광역시가 아니다 */
  assert.notEqual(sidoOfRegionName("광주시"), "광주");
});

test("groupBySido — 거래 많은 시/도부터, 모르는 지역은 맨 끝 '그 밖의 지역', 묶음 안 순서 유지", () => {
  const rows = [
    { name: "청주 흥덕구", tx: 500 },
    { name: "서울 강남구", tx: 300 },
    { name: "대구 중구", tx: 400 },
    { name: "서울 송파구", tx: 200 },
  ];
  const groups = groupBySido(rows, (r) => r.name, (r) => r.tx);
  assert.deepEqual(
    groups.map((g) => [g.sido, g.items.map((r) => r.name)]),
    [
      ["서울", ["서울 강남구", "서울 송파구"]],
      ["대구", ["대구 중구"]],
      [OTHER_SIDO_LABEL, ["청주 흥덕구"]],
    ],
  );
});

/* [970 · B-33] 다른 지역 리포트 — 같은 시/도 우선 */

test("sameSidoFirst — 대구 중구 리포트의 '다른 지역'은 대구 구·군이 먼저, 자기 자신은 뺀다", () => {
  const out = sameSidoFirst(REGION_CATALOG, "daegu-jung");
  assert.ok(out.length > 0);
  assert.ok(out.every((r) => r.id !== "daegu-jung"));
  const first = out.slice(0, 7);
  assert.ok(first.every((r) => r.city === "대구"), first.map((r) => r.id).join(","));
  /* 서울 구는 대구 뒤에 */
  const seoulIdx = out.findIndex((r) => r.id === "gangnam");
  const lastDaegu = out.map((r) => r.city).lastIndexOf("대구");
  assert.ok(seoulIdx > lastDaegu);
});
