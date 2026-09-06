import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatKstDate,
  formatKstDateTime,
  formatKstLongDate,
  formatKstMeetingTime,
  formatKstShortDate,
  isSameKstMonth,
  kstParts,
} from "../../lib/format/kst.ts";
import { cityOfRegion, groupRegionsByCity } from "../../lib/town/region-groups.ts";
import {
  buildNewsRegionChips,
  findNewsRegionChip,
  sidoOfNewsRegion,
} from "../../lib/town/news-regions.ts";
import { REGION_CATALOG } from "../../lib/region/catalog.ts";

/* [970 · C-01 · C-04] 한국 시간 절대 시각 — 실행 환경 시간대와 무관해야 한다.
   2026-09-05T19:30:00Z 는 KST 로 9월 6일(일) 04:30 — UTC 로 찍으면 날짜·요일이 모두 틀린다. */
const T = "2026-09-05T19:30:00.000Z";

test("kstParts — UTC 입력을 한국 날짜·시각·요일로", () => {
  const p = kstParts(T);
  assert.ok(p);
  assert.equal(p.year, 2026);
  assert.equal(p.month, 9);
  assert.equal(p.day, 6);
  assert.equal(p.hour, 4);
  assert.equal(p.minute, 30);
  assert.equal(p.weekday, 0, "일요일 (UTC 로는 토요일)");
  assert.equal(kstParts("not-a-date"), null);
  assert.equal(kstParts(null), null);
});

test("KST 포맷 — 기존 화면 얼굴을 유지한다", () => {
  assert.equal(formatKstDateTime(T), "2026.09.06 04:30");
  assert.equal(formatKstDate(T), "2026.09.06");
  assert.equal(formatKstShortDate(T), "09.06");
  assert.equal(formatKstMeetingTime(T), "9.6 (일) 04:30");
  assert.equal(formatKstLongDate(T), "2026년 9월 6일");
  assert.equal(formatKstLongDate(T, { weekday: true, time: true }), "2026년 9월 6일 (일) 04:30");
  /* 자정 경계 — 15:00Z = 00:00 KST(다음 날) */
  assert.equal(formatKstMeetingTime("2026-09-05T15:00:00Z"), "9.6 (일) 00:00");
  /* 요일 전 범위 — 2026-09-07(월) ~ 09-12(토) */
  assert.equal(formatKstMeetingTime("2026-09-07T03:00:00Z"), "9.7 (월) 12:00");
  assert.equal(formatKstMeetingTime("2026-09-12T03:00:00Z"), "9.12 (토) 12:00");
  assert.equal(formatKstDateTime("2026-09-05T14:59:00Z"), "2026.09.05 23:59");
  /* 실패는 빈 문자열 — 호출부가 "일정 미정" 등으로 바꾼다 */
  assert.equal(formatKstDateTime("garbage"), "");
  assert.equal(formatKstMeetingTime(undefined), "");
});

test("isSameKstMonth — 한국 달력 기준 (UTC 로는 8월인 9월 1일 00:30 KST)", () => {
  assert.equal(isSameKstMonth("2026-08-31T15:30:00Z", "2026-09-15T00:00:00Z"), true);
  assert.equal(isSameKstMonth("2026-08-31T14:30:00Z", "2026-09-15T00:00:00Z"), false);
  assert.equal(isSameKstMonth("x", "2026-09-15T00:00:00Z"), false);
});

/* [970 · C-17] 동네 홈 인덱스 — 카탈로그 전량이 시·도 그룹으로 빠짐없이 들어간다 */
test("groupRegionsByCity — 전량 포함 · 서울 먼저 · 자기 자신 제외", () => {
  const groups = groupRegionsByCity();
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  assert.equal(total, REGION_CATALOG.length, "카탈로그 전량이 그룹에 들어간다");
  assert.equal(groups[0].city, "서울");
  assert.equal(groups[0].key, "seoul");
  assert.equal(groups[0].items.length, 25, "서울 25구");
  assert.ok(groups.some((g) => g.city === "경기"));
  assert.ok(groups.some((g) => g.city === "부산"));
  /* key 는 DOM id 로 쓰므로 그룹끼리 겹치지 않는다 */
  assert.equal(new Set(groups.map((g) => g.key)).size, groups.length);

  const without = groupRegionsByCity(REGION_CATALOG, "gangnam");
  assert.equal(without.reduce((n, g) => n + g.items.length, 0), REGION_CATALOG.length - 1);
  assert.ok(!without[0].items.some((r) => r.id === "gangnam"));
});

test("cityOfRegion — city 가 비면 서울", () => {
  assert.equal(cityOfRegion("gangnam"), "서울");
  assert.equal(cityOfRegion("seongnam-bundang"), "경기");
  assert.equal(cityOfRegion("busan-haeundae"), "부산");
  assert.equal(cityOfRegion("nope"), "서울", "모르는 id 도 기본값(빈 그룹을 열지 않게)");
});

/* [970 · C-23] 뉴스 지역 칩 — 빈도순 + 시·도 접기 */
test("sidoOfNewsRegion — 시·도 그 자체 / 시·군·구 → 시·도 / 모르면 null", () => {
  assert.equal(sidoOfNewsRegion("서울"), "서울");
  assert.equal(sidoOfNewsRegion("서울특별시"), "서울");
  assert.equal(sidoOfNewsRegion("경기도"), "경기");
  assert.equal(sidoOfNewsRegion("강남구"), "서울");
  assert.equal(sidoOfNewsRegion("성남시 분당구"), "경기");
  assert.equal(sidoOfNewsRegion("경기 성남시"), "경기", "앞 토막이 시·도면 그것");
  assert.equal(sidoOfNewsRegion("해운대구"), "부산");
  assert.equal(sidoOfNewsRegion(""), null);
  assert.equal(sidoOfNewsRegion("전국"), null);
});

test("buildNewsRegionChips — 건수순, 시·도로 접히고 하위 칩은 2개 이상일 때만", () => {
  const cities = [
    "강남구", // 등장순 1 — 예전엔 이게 첫 칩
    "경기", "경기", "경기",
    "서울", "서울",
    "송파구", "송파구", "송파구", "송파구",
    "전국",
    "", null, undefined,
  ];
  const chips = buildNewsRegionChips(cities);
  assert.deepEqual(
    chips.map((c) => [c.label, c.count]),
    [
      ["서울", 7],
      ["경기", 3],
      ["전국", 1],
    ],
    "시·도 합산 건수 내림차순 · 빈 값 제외",
  );
  const seoul = chips[0];
  assert.deepEqual([...seoul.values].sort(), ["강남구", "서울", "송파구"].sort(), "시·도 칩은 하위 값 전부를 거른다");
  assert.deepEqual(
    seoul.children.map((c) => [c.label, c.count]),
    [
      ["송파구", 4],
      ["강남구", 1],
    ],
    "하위 칩은 건수순 · 시·도 이름 자체는 하위가 아니다",
  );
  assert.deepEqual(chips[1].children, [], "경기는 하위 값이 없어 펼 것이 없다");
  assert.deepEqual(chips[2].values, ["전국"], "해석 안 되는 값은 제 이름으로 독립 칩");
});

test("buildNewsRegionChips — 상한", () => {
  const many = ["서울", "경기", "인천", "부산", "대구", "대전", "광주", "울산", "세종", "제주"];
  assert.equal(buildNewsRegionChips(many, { maxGroups: 8 }).length, 8);
  const seoulLeaves = ["강남구", "송파구", "마포구", "노원구"];
  const chips = buildNewsRegionChips(seoulLeaves, { maxChildren: 2 });
  assert.equal(chips[0].children.length, 2);
});

test("findNewsRegionChip — 시·도 라벨과 하위 라벨(URL ?region=) 모두 찾는다", () => {
  const chips = buildNewsRegionChips(["강남구", "송파구", "서울"]);
  const top = findNewsRegionChip(chips, "서울");
  assert.ok(top && top.parent === null && top.chip.label === "서울");
  const leaf = findNewsRegionChip(chips, "송파구");
  assert.ok(leaf && leaf.parent?.label === "서울" && leaf.chip.values.length === 1);
  assert.equal(findNewsRegionChip(chips, "없는곳"), null);
  assert.equal(findNewsRegionChip(chips, null), null);
});
