import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  PREVIOUS_CHECKS_MAX,
  buildRevisitPrefill,
  previousCheckChips,
  previousRoundOf,
  type RevisitSourceNote,
} from "../../lib/inspection/revisit-prefill.ts";

/* [995 · 3] 재방문 프리필 — 무엇을 잇고 무엇을 새로 적는지 */

const TODAY = "2026-09-13";

function prevNote(over: Partial<RevisitSourceNote> = {}): RevisitSourceNote {
  return {
    id: "note-1",
    region: "서울 강남구 대치동",
    aptName: "래미안대치팰리스",
    visitDate: "2026-08-01T00:00:00.000Z",
    scores: { location: 5, school: 4, transport: 3, facility: 0, future: 0 },
    checklist: [
      { label: "지하철역 도보 10분 이내", done: true },
      { label: "버스 정류장 3개 이상", done: false },
      { label: "겨울철 저층 채광 재확인", done: true },
      { label: "관리비 내역 문의", done: false },
    ],
    sections: {
      pros: "초품아 · 역세권",
      cons: "이중주차",
      memo: "지난번 메모 — 오후 채광 좋았음",
    },
    metadata: {
      complexId: "c-123",
      lat: 37.49,
      lng: 127.06,
      propertyType: "아파트",
      visitTimeSlot: "오전",
      visitPurpose: "투자",
      fieldRatings: { 채광: "좋음", 주차: "아쉬움", 소음: "보통" },
      todoLevels: { "겨울철 저층 채광 재확인": "중요" },
      satisfaction: 7,
      round: 2,
    },
    ...over,
  };
}

test("위치·단지 id·좌표·태그·유형·목적을 잇는다", () => {
  const p = buildRevisitPrefill(prevNote(), TODAY);
  assert.equal(p.region, "서울 강남구 대치동");
  assert.equal(p.aptName, "래미안대치팰리스");
  assert.equal(p.complexId, "c-123");
  assert.equal(p.lat, 37.49);
  assert.equal(p.lng, 127.06);
  assert.deepEqual(p.tags, [
    { label: "초품아", tone: "pos" },
    { label: "역세권", tone: "pos" },
    { label: "이중주차", tone: "neg" },
  ]);
  assert.equal(p.visit.propertyType, "아파트");
  assert.equal(p.visit.visitPurpose, "투자");
});

test("사진·메모는 비어 있고 시간대는 잇지 않는다 — 이번 방문의 관찰은 새로 적는다", () => {
  const p = buildRevisitPrefill(prevNote(), TODAY);
  assert.equal(p.memo, "");
  assert.deepEqual(p.photos, []);
  assert.equal(p.visitDate, TODAY);
  /* 시간대 키 자체가 없다 — 지금 시각이 기본값이 되게 폼에 맡긴다 */
  assert.ok(!("visitTimeSlot" in p.visit));
  /* 요약·제목·날씨·만족도도 결과에 없다 */
  assert.ok(!("summary" in p) && !("title" in p) && !("weather" in p) && !("satisfaction" in p));
});

test("체크리스트: 알려진 항목은 완료 상태를, 커스텀 고려사항은 목록만(완료 표시 없이) 잇는다", () => {
  const p = buildRevisitPrefill(prevNote(), TODAY);
  assert.deepEqual(p.checklistDone, ["지하철역 도보 10분 이내"]);
  assert.deepEqual(p.todos, [
    { text: "겨울철 저층 채광 재확인", level: "중요" },
    { text: "관리비 내역 문의", level: "보통" },
  ]);
});

test("지난 현장 체크·축 점수·방문일은 읽기 전용 값으로 붙는다", () => {
  const p = buildRevisitPrefill(prevNote(), TODAY);
  assert.deepEqual(p.previousChecks, { 채광: "좋음", 주차: "아쉬움", 소음: "보통" });
  assert.deepEqual(p.previousScores, { location: 5, school: 4, transport: 3, facility: 0, future: 0 });
  assert.equal(p.previousVisitDate, "2026-08-01");
  assert.equal(p.previousNoteId, "note-1");
});

test("회차: 이전 round 가 있으면 +1, 없거나 깨졌으면 1회차였던 것으로 본다", () => {
  assert.equal(buildRevisitPrefill(prevNote(), TODAY).round, 3);
  assert.equal(buildRevisitPrefill(prevNote(), TODAY).previousRound, 2);
  const noRound = buildRevisitPrefill(prevNote({ metadata: { complexId: "c-1" } }), TODAY);
  assert.equal(noRound.previousRound, 1);
  assert.equal(noRound.round, 2);
  assert.equal(previousRoundOf({ round: "abc" }), 1);
  assert.equal(previousRoundOf({ round: 0 }), 1);
  assert.equal(previousRoundOf({ round: 2.5 }), 1);
  assert.equal(previousRoundOf({ round: "4" }), 4);
});

test("metadata 가 없어도 동작한다 — 위치 문자열만 잇고 나머지는 비거나 null", () => {
  const p = buildRevisitPrefill(
    prevNote({ metadata: null, sections: {}, checklist: [], aptName: null }),
    TODAY,
  );
  assert.equal(p.region, "서울 강남구 대치동");
  assert.equal(p.aptName, "");
  assert.equal(p.complexId, null);
  assert.equal(p.lat, null);
  assert.equal(p.lng, null);
  assert.deepEqual(p.tags, []);
  assert.deepEqual(p.checklistDone, []);
  assert.deepEqual(p.todos, []);
  assert.equal(p.visit.propertyType, null);
  assert.equal(p.round, 2);
  /* fieldRatings 가 없으면 축 점수 역변환 — 0 축(facility·future)은 비운다 */
  assert.equal(p.previousChecks["학군"], "좋음");
  assert.ok(!("채광" in p.previousChecks));
});

test("좌표 0,0 은 좌표가 아니다 — null 로 떨어진다", () => {
  const p = buildRevisitPrefill(prevNote({ metadata: { lat: 0, lng: 0 } }), TODAY);
  assert.equal(p.lat, null);
  assert.equal(p.lng, null);
});

test("지난 체크 띠 — 표시 순서를 따르고 글리프를 붙이며 6개에서 자른다", () => {
  const chips = previousCheckChips(
    { 호재: "보통", 채광: "좋음", 주차: "아쉬움" },
    ["채광", "소음", "주차", "교통", "경사", "보안", "학군", "관리", "호재"],
  );
  assert.deepEqual(
    chips.map((c) => `${c.label}${c.glyph}`),
    ["채광✓", "주차✗", "호재–"],
  );
  const many = previousCheckChips(
    { 채광: "좋음", 소음: "좋음", 주차: "좋음", 교통: "좋음", 경사: "좋음", 보안: "좋음", 학군: "좋음" },
    ["채광", "소음", "주차", "교통", "경사", "보안", "학군"],
  );
  assert.equal(many.length, PREVIOUS_CHECKS_MAX);
  assert.deepEqual(previousCheckChips({}, ["채광"]), []);
});
