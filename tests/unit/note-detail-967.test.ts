import { strict as assert } from "node:assert";
import test from "node:test";

import {
  matchesInterest,
  parseRegionParts,
  rankRelatedNotes,
  regionAffinity,
  regionKey,
} from "../../lib/notes/region-match";
import { noteCoordsFromMetadata, noteMapHref } from "../../lib/notes/note-coords";

/* [967 · 13] 지역 매칭 — 상세 관련 노트와 목록 관심 지역 칩이 같은 잣대를 쓴다 */

test("parseRegionParts — 시·구·동을 자유 텍스트에서 뽑는다", () => {
  assert.deepEqual(parseRegionParts("경기 안양시 동안구 관양동"), {
    si: "안양시",
    gu: "동안구",
    dong: "관양동",
  });
  assert.deepEqual(parseRegionParts("서울특별시 송파구 가락동"), {
    si: "서울",
    gu: "송파구",
    dong: "가락동",
  });
  assert.deepEqual(parseRegionParts("서울 강남구"), { si: "서울", gu: "강남구", dong: "" });
  assert.deepEqual(parseRegionParts("경기"), { si: "경기", gu: "", dong: "" });
  assert.deepEqual(parseRegionParts("  "), { si: "", gu: "", dong: "" });
});

test("regionKey — 공백·광역 접미를 접어 부분 포함 비교 키를 만든다", () => {
  assert.equal(regionKey("서울특별시 송파구"), "서울송파구");
  assert.equal(regionKey(" 경기 안양시  동안구 "), "경기안양시동안구");
  assert.equal(regionKey(null), "");
});

test("regionAffinity — 동 > 구 > 시 순으로 촘촘할수록 높다", () => {
  const base = "서울 송파구 가락동";
  assert.equal(regionAffinity(base, "서울 송파구 가락동"), 3);
  assert.equal(regionAffinity(base, "서울특별시 송파구 가락동"), 3, "광역 접미는 같은 시");
  assert.equal(regionAffinity(base, "서울 송파구 잠실동"), 2, "같은 구 다른 동");
  assert.equal(regionAffinity(base, "서울 송파구"), 2, "구까지만 적은 노트도 같은 구");
  assert.equal(regionAffinity(base, "서울 강남구 역삼동"), 1, "같은 시 다른 구");
  assert.equal(regionAffinity(base, "경기 성남시 분당구"), 0);
});

test("regionAffinity — 동명이 같아도 구가 다르면 동 일치로 치지 않는다", () => {
  // 부천 중동 vs 인천 남동구 중동 — 우연한 동명
  assert.equal(regionAffinity("경기 부천시 원미구 중동", "인천 남동구 중동"), 0);
  // 구를 안 적은 쪽은 판정을 미룬다(호환) — 같은 시 안이면 동 일치
  assert.equal(regionAffinity("서울 송파구 가락동", "서울 가락동"), 3);
});

test("regionAffinity — 구조가 안 잡히는 표기는 양방향 부분 포함으로 1", () => {
  assert.equal(regionAffinity("경기 성남시 분당구 판교동", "판교"), 1);
  assert.equal(regionAffinity("판교", "경기 성남시 분당구 판교동"), 1);
  assert.equal(regionAffinity("", "서울"), 0);
});

test("matchesInterest — 넓은 구독(서울)도 좁은 구독(안양시 동안구)도 맞춘다", () => {
  assert.equal(matchesInterest("서울 강남구 역삼동", ["서울"]), true);
  assert.equal(matchesInterest("경기 안양시 동안구 관양동", ["안양시 동안구"]), true);
  assert.equal(matchesInterest("경기 안양시 동안구 관양동", ["송파구"]), false);
  assert.equal(matchesInterest("서울 송파구", ["송파구", "부산"]), true);
  assert.equal(matchesInterest("서울 송파구", []), false);
  assert.equal(matchesInterest(null, ["서울"]), false);
});

test("rankRelatedNotes — 같은 동 → 같은 구 → 같은 시, 자기 자신 제외, 상한 6", () => {
  const notes = [
    { id: "self", region: "서울 송파구 가락동" },
    { id: "gu-1", region: "서울 송파구 잠실동" },
    { id: "si-1", region: "서울 강남구 역삼동" },
    { id: "dong-1", region: "서울특별시 송파구 가락동" },
    { id: "other", region: "부산 해운대구" },
    { id: "gu-2", region: "서울 송파구" },
    { id: "dong-2", region: "서울 송파구 가락동" },
    { id: "si-2", region: "서울" },
    { id: "si-3", region: "서울 마포구" },
  ];
  const ranked = rankRelatedNotes(notes, { id: "self", region: "서울 송파구 가락동" });
  assert.deepEqual(
    ranked.map((n) => n.id),
    ["dong-1", "dong-2", "gu-1", "gu-2", "si-1", "si-2"],
  );
  assert.ok(!ranked.some((n) => n.id === "self"), "자기 자신은 빠진다");
  assert.ok(!ranked.some((n) => n.id === "other"), "무관한 지역은 넣지 않는다");
  assert.equal(rankRelatedNotes(notes, { id: "self", region: "서울 송파구 가락동" }, 2).length, 2);
});

test("rankRelatedNotes — 같은 단계 안에서는 입력 순서(최신순)를 유지한다", () => {
  const notes = [
    { id: "a", region: "서울 송파구 잠실동" },
    { id: "b", region: "서울 송파구 방이동" },
    { id: "c", region: "서울 송파구 문정동" },
  ];
  assert.deepEqual(
    rankRelatedNotes(notes, { id: "x", region: "서울 송파구 가락동" }).map((n) => n.id),
    ["a", "b", "c"],
  );
});

/* [967 · 11] 미니맵 좌표 — /map 의 parseCoordFocus 와 같은 범위, 같은 파라미터 이름 */

test("noteCoordsFromMetadata — 한국 좌표 범위 밖·비수치·(0,0) 은 없는 것으로 본다", () => {
  assert.deepEqual(noteCoordsFromMetadata({ lat: 37.5, lng: 127.1 }), { lat: 37.5, lng: 127.1 });
  assert.deepEqual(noteCoordsFromMetadata({ latitude: "37.5", longitude: "127.1" }), {
    lat: 37.5,
    lng: 127.1,
  });
  assert.equal(noteCoordsFromMetadata({ lat: 0, lng: 0 }), null);
  assert.equal(noteCoordsFromMetadata({ lat: 51.5, lng: -0.1 }), null);
  assert.equal(noteCoordsFromMetadata({ lat: "abc", lng: 127 }), null);
  assert.equal(noteCoordsFromMetadata(null), null);
  assert.equal(noteCoordsFromMetadata({}), null);
});

test("noteMapHref — /map 이 실제로 읽는 lat·lng·z 만 싣고, z 는 6~19 로 죈다", () => {
  const href = noteMapHref({ lat: 37.5, lng: 127.1 });
  const u = new URL(href, "https://naezipnow.com");
  assert.equal(u.pathname, "/map");
  assert.equal(u.searchParams.get("lat"), "37.5");
  assert.equal(u.searchParams.get("lng"), "127.1");
  assert.equal(u.searchParams.get("z"), "16");
  assert.equal(u.searchParams.has("zoom"), false, "/map 에 zoom 파라미터는 없다");
  assert.equal(new URL(noteMapHref({ lat: 37.5, lng: 127.1 }, 30), "https://x").searchParams.get("z"), "19");
  assert.equal(new URL(noteMapHref({ lat: 37.5, lng: 127.1 }, 1), "https://x").searchParams.get("z"), "6");
});
