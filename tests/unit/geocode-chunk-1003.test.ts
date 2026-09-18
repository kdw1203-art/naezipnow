import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chunk,
  pgErrorText,
  regionsByName,
  NAME_IN_CHUNK,
  REGION_IN_MAX,
} from "../../lib/map/geocode-chunk.ts";

/* [1003] 지오코딩 조회 쪼개기 · PostgREST 오류 문구.
 *
 * 2026-09-17 사고: supply-ingest 가 `.in("complex_name", […582개])` 를 한 번에
 * 보냈다. 한글 단지명 9,140자 → 퍼센트 인코딩 ~82KB 짜리 GET 이라 프록시가 잘랐고,
 * supabase-js 는 message 가 **빈 문자열**인 오류를 만들었다. 남은 기록은
 * "complex_geocode 조회 실패: " 한 줄 — 사유가 없어 아무도 원인을 못 봤고,
 * 그 사이 좌표 백필은 한 건도 돌지 않았다.
 *
 * 그래서 여기서 두 가지를 못 박는다:
 *  ① 쪼개기는 조각을 하나도 잃지 않는다(합치면 원본과 같다).
 *  ② 오류 문구는 **절대 비지 않는다** — 사유가 없으면 없다고 적고, 키 개수를
 *     함께 남겨 다음 URL 길이 사고가 스스로 이름을 대게 한다.
 *
 * 두 server 모듈(complex-geocode·supply-geocode)은 `server-only` 라 node:test 로
 * 못 읽는다. 그래서 판단만 lib/map/geocode-chunk.ts 에 떼어 두고 여기서 검증한다
 * (geocode-query.ts / geocode-971.test.ts 와 같은 구조).
 */

test("chunk — 빈 목록은 조각도 없다", () => {
  assert.deepEqual(chunk([], 40), []);
  assert.deepEqual(chunk([], 1), []);
});

test("chunk — 딱 나누어떨어지면 모든 조각이 같은 크기", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5, 6], 3), [
    [1, 2, 3],
    [4, 5, 6],
  ]);
  assert.deepEqual(chunk([1, 2], 2), [[1, 2]]);
});

test("chunk — 나머지는 마지막 조각에만 남는다", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  // 목록보다 조각이 크면 통째로 하나
  assert.deepEqual(chunk([1, 2, 3], 40), [[1, 2, 3]]);
});

test("chunk — size 1 이면 한 개씩", () => {
  assert.deepEqual(chunk(["가", "나", "다"], 1), [["가"], ["나"], ["다"]]);
});

test("chunk — 0·음수·NaN 은 1로 본다(무한 루프 방지)", () => {
  assert.deepEqual(chunk([1, 2], 0), [[1], [2]]);
  assert.deepEqual(chunk([1, 2], -5), [[1], [2]]);
  assert.deepEqual(chunk([1, 2], Number.NaN), [[1], [2]]);
});

test("chunk — 순서를 지키고 원본을 건드리지 않는다", () => {
  const src = ["서울 강남구", "부산 해운대구", "대구 수성구", "인천 연수구", "광주 서구"];
  const parts = chunk(src, 2);
  assert.deepEqual(parts.flat(), src); // 잃는 것도 뒤바뀌는 것도 없다
  assert.equal(src.length, 5);
  parts[0][0] = "바뀜";
  assert.equal(src[0], "서울 강남구"); // 조각은 복사본이다
});

test("chunk — 실제 사고 규모(582개)를 나눈 결과가 합치면 그대로", () => {
  const names = Array.from({ length: 582 }, (_, i) => `단지${i}`);
  const parts = chunk(names, NAME_IN_CHUNK);
  assert.equal(parts.length, Math.ceil(582 / NAME_IN_CHUNK));
  assert.ok(parts.every((p) => p.length <= NAME_IN_CHUNK));
  assert.deepEqual(parts.flat(), names);
});

test("chunk 크기 — 조각 하나의 URL 이 8KB 예산 안에 있다", () => {
  /* 근거(2026-09-17 실측): 이름 1개 ≈ 15.7자 × 9바이트(한글 UTF-8 3바이트의
     퍼센트 인코딩) + 구분자 ≈ 142바이트, 지역 1개 ≈ 50바이트, 기본 경로·필터 ≈ 200.
     같은 조건으로 supabase-js 가 만든 실제 URL 은 7,521바이트였다(공식과 1% 차).
     이 상수를 키우면(예: 80) 같은 사고가 다시 난다 — 그래서 게이트로 둔다. */
  const bytes = NAME_IN_CHUNK * 142 + REGION_IN_MAX * 50 + 200;
  assert.ok(bytes < 8000, `조각 하나가 ${bytes}바이트 — 8KB 예산 초과`);
  // 지역은 조각의 이름 수보다 많아질 일이 드물다 — 상한이 그보다 작으면 안전핀이 아니다
  assert.ok(REGION_IN_MAX >= NAME_IN_CHUNK, "지역 상한이 이름 조각보다 작다");
});

test("regionsByName — 이름마다 지역을 모으고 중복은 한 번만", () => {
  const byName = regionsByName([
    { region: "서울 송파구", name: "리센츠" },
    { region: "서울 송파구", name: "리센츠" }, // 같은 짝은 한 번만
    { region: "부산 해운대구", name: "래미안" },
    { region: "서울 강남구", name: "래미안" }, // 같은 이름, 다른 지역
  ]);
  assert.deepEqual([...byName.keys()], ["리센츠", "래미안"]);
  assert.deepEqual(byName.get("리센츠"), ["서울 송파구"]);
  assert.deepEqual(byName.get("래미안"), ["부산 해운대구", "서울 강남구"]);
  assert.deepEqual(regionsByName([]).size, 0);
});

test("regionsByName + chunk — 조각의 지역만 실어도 원하는 짝은 하나도 안 빠진다", () => {
  /* 쪼갠 조회가 (지역 IN 조각지역, 이름 IN 조각이름)이어도 원래 짝은 전부
     그 조각 안에 들어 있어야 한다 — 빠지면 지도에서 마커가 조용히 사라진다. */
  const pairs = Array.from({ length: 95 }, (_, i) => ({
    region: `지역${i % 30}`,
    name: `단지${i}`,
  }));
  const byName = regionsByName(pairs);
  const covered = new Set<string>();
  for (const namePart of chunk([...byName.keys()], NAME_IN_CHUNK)) {
    const regionPart = new Set(namePart.flatMap((n) => byName.get(n) ?? []));
    const nameSet = new Set(namePart);
    for (const p of pairs) {
      if (nameSet.has(p.name) && regionPart.has(p.region)) covered.add(`${p.region}${p.name}`);
    }
  }
  assert.equal(covered.size, pairs.length);
});

test("pgErrorText — message 가 비어도 빈 문자열을 돌려주지 않는다", () => {
  // 이 한 줄이 사고의 핵심이었다: "complex_geocode 조회 실패: " 뒤가 비었다
  assert.equal(pgErrorText({ message: "" }), "알 수 없는 오류");
  assert.equal(pgErrorText({ message: "   " }), "알 수 없는 오류");
  assert.equal(pgErrorText({}), "알 수 없는 오류");
  assert.equal(pgErrorText(null), "알 수 없는 오류");
  assert.equal(pgErrorText({ message: null, code: null, details: null, hint: null }), "알 수 없는 오류");
});

test("pgErrorText — message 가 있으면 그대로 쓴다", () => {
  assert.equal(pgErrorText({ message: "permission denied" }), "permission denied");
});

test("pgErrorText — message 가 비어도 code·details·hint 로 사유를 만든다", () => {
  const text = pgErrorText({
    message: "",
    code: "PGRST102",
    details: "Request-URI Too Large",
    hint: "쿼리를 나눠 보내세요",
  });
  assert.match(text, /PGRST102/);
  assert.match(text, /Request-URI Too Large/);
  assert.match(text, /쿼리를 나눠 보내세요/);
  assert.notEqual(text.trim(), "");
});

test("pgErrorText — 키 개수를 알면 함께 적는다(URL 길이 사고가 스스로 이름을 댄다)", () => {
  assert.equal(pgErrorText({ message: "" }, 582), "알 수 없는 오류 (키 582개)");
  assert.match(pgErrorText({ message: "boom" }, 40), /boom \(키 40개\)/);
  // 키 0개도 사실이다 — 생략하지 않는다
  assert.match(pgErrorText({ message: "boom" }, 0), /\(키 0개\)/);
  // 모르면 붙이지 않는다
  assert.equal(pgErrorText({ message: "boom" }), "boom");
  assert.equal(pgErrorText({ message: "boom" }, Number.NaN), "boom");
});

test("pgErrorText — 어떤 입력에도 빈 문자열은 없다", () => {
  const inputs = [
    null,
    {},
    { message: "" },
    { message: "", code: "" },
    { message: "  ", details: "  ", hint: "  " },
    { code: "23505" },
    { hint: "재시도" },
  ];
  for (const e of inputs) {
    assert.ok(pgErrorText(e).trim().length > 0, `빈 문구: ${JSON.stringify(e)}`);
    assert.ok(pgErrorText(e, 7).includes("7"), `키 개수 누락: ${JSON.stringify(e)}`);
  }
});
