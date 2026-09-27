import { strict as assert } from "node:assert";
import test from "node:test";

import { feedAuthorLabel, feedDisplayTitle } from "../../lib/town/feed-regions";

/* [v4 · 요약본] 소유자 "글자를 요약본으로 간단하게" — 목록 행 제목에서 메타 줄과 겹치는 지역·괄호 부연을 뗀다 */
test("Lab 제목 — 앞의 지역 낱말과 괄호 부연을 뗀다", () => {
  assert.equal(
    feedDisplayTitle("서울 동대문구 용두동 청량리역 한양수자인 그라시엘(2023-06 준공, 4,086세대)", "서울 동대문구 용두동", { lab: true }),
    "청량리역 한양수자인 그라시엘",
  );
  assert.equal(feedDisplayTitle("경기 수원 팔달구 고등동 수원역푸르지오자이(2021", "수원 팔달구", { lab: true }), "수원역푸르지오자이");
  /* 괄호 뒤 부연(면적 등)까지 끊는다 */
  assert.equal(feedDisplayTitle("서울 강남구 대치동 대치삼성(래미안, 2000년) 59.88m² 전세", "서울 강남구", { lab: true }), "대치삼성");
});

test("사람 글 — 괄호는 뜻일 수 있어 그대로, 이 카드의 지역 낱말만 뗀다", () => {
  assert.equal(feedDisplayTitle("마포구 아현동 (급매) 보고 왔어요", "마포구 아현동"), "(급매) 보고 왔어요");
  /* 지명처럼 끝나는 보통 낱말("이동")은 사람 글에서 떼지 않는다 */
  assert.equal(feedDisplayTitle("이동 동선 짜 봤어요", "서울 마포구"), "이동 동선 짜 봤어요");
});

test("지역과 겹치지 않으면 그대로 · 남는 게 두 글자 미만이면 원문", () => {
  assert.equal(feedDisplayTitle("8·13 대책이 지정한 신규 공공택지(강서", "서울 강서구 염창동", { lab: true }), "8·13 대책이 지정한 신규 공공택지");
  /* 마지막 낱말은 남긴다 — 제목 전체가 지역이면 가장 좁은 지역명이 제목이 된다 */
  assert.equal(feedDisplayTitle("서울 강남구", "서울 강남구", { lab: true }), "강남구");
  assert.equal(feedDisplayTitle("", "서울"), "");
});

test("작성자 — 첫 마디만", () => {
  assert.equal(feedAuthorLabel("내집나우 Lab · AI 임장노트 #12"), "내집나우 Lab");
  assert.equal(feedAuthorLabel("마포댁"), "마포댁");
  assert.equal(feedAuthorLabel(null), "");
});
