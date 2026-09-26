import { strict as assert } from "node:assert";
import test from "node:test";

import {
  clockLabel,
  draftComparable,
  parseDraft,
  type NoteDraft,
} from "../../lib/notes/draft-summary";
import {
  MANUAL_LOCATION_MAX,
  mergeUploadedPhotos,
  validateManualLocation,
} from "../../lib/notes/note-form-utils";

/* [1005] 임장노트 작성 폼 — 초안 스키마(판단·고려사항)와 위치 직접 입력의 순수 부분.

   A3: 1초 자동 저장이 buildDraft 와 다른 객체를 만들어 판단이 빠졌고, 고려사항은
   스키마에 없었다. 이제 build → JSON → parseDraft 왕복에서 둘 다 살아남아야 한다.
   A1: 위치는 유일한 필수값인데 직접 입력 경로가 없었다 — 검증 규칙을 여기서 고정한다. */

function fullDraft(): NoteDraft {
  return {
    v: 1,
    savedAt: "2026-09-19T09:30:00.000Z",
    checks: { 채광: "좋음", 주차: "아쉬움" },
    visit: { 유형: "아파트", 시간대: "오후", 목적: "실거주" },
    tags: ["초품아"],
    doneTodos: ["주차 만차 시간대 재확인"],
    satisfaction: 7.5,
    memo: "남향, 오후 채광 좋음",
    loc: { aptName: "은마아파트", region: "서울 강남구", complexId: "c1", lat: 37.49, lng: 127.06 },
    photos: ["https://cdn.example/a.jpg"],
    isPublic: false,
    groupChecked: { "loc-1": true },
    weather: "맑음",
    openGroups: { location: true },
    visitDate: "2026-09-18",
    decision: { choice: "hold", reasons: ["주차가 아쉬움", "채광은 좋음"] },
    todoItems: [
      { text: "주차 만차 시간대 재확인", level: "중요" },
      { text: "관리비 내역 문의", level: "보통" },
    ],
  };
}

test("[1005 · A3] 초안 왕복 — 판단(choice·reasons)과 고려사항(text·level)이 그대로 돌아온다", () => {
  const d = fullDraft();
  const back = parseDraft(JSON.stringify(d));
  assert.ok(back);
  assert.deepEqual(back.decision, { choice: "hold", reasons: ["주차가 아쉬움", "채광은 좋음"] });
  assert.deepEqual(back.todoItems, [
    { text: "주차 만차 시간대 재확인", level: "중요" },
    { text: "관리비 내역 문의", level: "보통" },
  ]);
  /* 나머지 필드도 손실 없음 */
  assert.equal(back.memo, d.memo);
  assert.deepEqual(back.loc, d.loc);
  assert.equal(back.visitDate, "2026-09-18");
  assert.deepEqual(back.checks, d.checks);
  assert.equal(back.satisfaction, 7.5);
});

test("[1005 · A3] 구버전 초안(판단·고려사항 없음)도 읽힌다 — 두 필드는 undefined", () => {
  const legacy = {
    v: 1,
    savedAt: "2026-09-01T00:00:00Z",
    checks: {},
    visit: {},
    tags: [],
    doneTodos: [],
    satisfaction: null,
    memo: "",
  };
  const back = parseDraft(JSON.stringify(legacy));
  assert.ok(back);
  assert.equal(back.decision, undefined);
  assert.equal(back.todoItems, undefined);
});

test("[1005 · LOW-d] 명시적 빈 고려사항([])은 []로 읽힌다 — 비운 목록을 복원할 수 있게(키 없음과 다르다)", () => {
  const back = parseDraft(JSON.stringify({ ...fullDraft(), todoItems: [] }));
  assert.ok(back);
  assert.deepEqual(back.todoItems, []);
});

test("[1005 · H1] 초안 복원의 사진 합치기 — 초안 순서 먼저, 그 뒤 지금 올라간 것(URL 중복 제거·상한)", () => {
  /* 로그인하고 돌아와 큐에서 막 올라간 live 사진이 초안의 photos: [] 에 지워지면 안 된다 */
  assert.deepEqual(mergeUploadedPhotos([], ["https://cdn/x.jpg"], 10), ["https://cdn/x.jpg"]);
  assert.deepEqual(
    mergeUploadedPhotos(["https://cdn/a.jpg", "https://cdn/b.jpg"], ["https://cdn/b.jpg", "https://cdn/c.jpg"], 10),
    ["https://cdn/a.jpg", "https://cdn/b.jpg", "https://cdn/c.jpg"],
  );
  assert.deepEqual(mergeUploadedPhotos(["a", "b"], ["c", "d"], 3), ["a", "b", "c"]);
});

test("[1005 · A3] 깨진 판단·고려사항은 버린다(다른 필드는 살린다) — 지어내지 않는다", () => {
  const raw = {
    ...fullDraft(),
    decision: { choice: "maybe", reasons: ["x"] },
    todoItems: [
      { text: "  ", level: "중요" },
      { text: "정상 항목", level: "이상한값" },
      { text: "정상 항목", level: "중요" },
      "문자열",
      null,
    ],
  };
  const back = parseDraft(JSON.stringify(raw));
  assert.ok(back);
  assert.equal(back.decision, undefined);
  /* 빈 텍스트·중복 제거, 알 수 없는 중요도는 보통 */
  assert.deepEqual(back.todoItems, [{ text: "정상 항목", level: "보통" }]);
  assert.equal(back.memo, "남향, 오후 채광 좋음");
});

test("[1005 · A3] 판단 근거는 3줄까지 — 그 이상은 잘라 읽는다(API 도 같은 상한)", () => {
  const raw = { ...fullDraft(), decision: { choice: "buy", reasons: ["a", "b", "c", "d"] } };
  const back = parseDraft(JSON.stringify(raw));
  assert.deepEqual(back?.decision, { choice: "buy", reasons: ["a", "b", "c"] });
});

test("[1005 · A3] 비교 정규형 — 판단·고려사항만 달라도 다른 초안이다(수정 모드 복원 배너의 근거)", () => {
  const base = fullDraft();
  const same = draftComparable({ ...base, savedAt: "2026-09-19T10:00:00Z", openGroups: {} });
  assert.equal(draftComparable(base), same, "저장 시각·접기 상태는 내용이 아니다");
  assert.notEqual(
    draftComparable({ ...base, decision: { choice: "buy", reasons: base.decision!.reasons } }),
    draftComparable(base),
  );
  assert.notEqual(
    draftComparable({ ...base, todoItems: [{ text: "새 항목", level: "보통" }] }),
    draftComparable(base),
  );
  /* 판단·고려사항이 없는 초안은 "없음"으로 비교된다(빈 배열·null) */
  assert.equal(
    draftComparable({ ...base, decision: undefined, todoItems: undefined }),
    draftComparable({ ...base, decision: undefined, todoItems: [] }),
  );
});

test("[967 · 4] clockLabel — HH:MM, 깨진 시각은 null", () => {
  const iso = new Date(2026, 8, 19, 9, 5).toISOString();
  assert.equal(clockLabel(iso), "09:05");
  assert.equal(clockLabel("nope"), null);
});

test("[1005 · A1] 위치 직접 입력 — 지역·단지명 둘 다 2자 이상, 공백 정리", () => {
  const ok = validateManualLocation("  서울   강남구 ", " 은마아파트 ");
  assert.deepEqual(ok, { ok: true, region: "서울 강남구", aptName: "은마아파트" });

  const r1 = validateManualLocation("", "은마아파트");
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.field, "region");

  const r2 = validateManualLocation("강", "은마아파트");
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.field, "region");

  const r3 = validateManualLocation("서울 강남구", "은");
  assert.equal(r3.ok, false);
  if (!r3.ok) assert.equal(r3.field, "aptName");

  const r4 = validateManualLocation("서울 강남구", "   ");
  assert.equal(r4.ok, false);
  if (!r4.ok) assert.equal(r4.field, "aptName");
});

test("[1005 · A1] 직접 입력 상한 — 60자에서 자른다(URL 프리필과 같은 수)", () => {
  const long = "가".repeat(MANUAL_LOCATION_MAX + 20);
  const r = validateManualLocation(long, long);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.region.length, MANUAL_LOCATION_MAX);
    assert.equal(r.aptName.length, MANUAL_LOCATION_MAX);
  }
});
