/* [967] 동네·지도·알림·전문가 순수 헬퍼 단위 테스트
   - lib/town/feed-filters.ts   (21 — 피드 필터 ↔ URL)
   - lib/map/filter-summary.ts  (23 — 접힌 필터 요약)
   - lib/experts/trust-line.ts  (26 — 전문가 신뢰 한 줄)
   - lib/notifications/read-event.ts (24 — 읽음 이벤트 detail 파싱) */
import { strict as assert } from "node:assert";
import test from "node:test";

import {
  parseTownFeedFilters,
  townFeedFilterQuery,
  TOWN_FEED_DEFAULT_FILTERS,
} from "../../lib/town/feed-filters";
import { summarizeMapFilters, manwonLabel } from "../../lib/map/filter-summary";
import { expertTrustLine, expertTrustSegments } from "../../lib/experts/trust-line";
import { readNotificationsReadDetail } from "../../lib/notifications/read-event";

/* ---------- 21 · 피드 필터 URL ---------- */

test("[21] 빈 검색 문자열은 기본 필터", () => {
  assert.deepEqual(parseTownFeedFilters(""), TOWN_FEED_DEFAULT_FILTERS);
  assert.deepEqual(parseTownFeedFilters("?"), TOWN_FEED_DEFAULT_FILTERS);
});

test("[21] kind·sort·mine 을 읽고, 모르는 값은 기본값으로 떨어뜨린다", () => {
  assert.deepEqual(parseTownFeedFilters("?kind=note&sort=latest&mine=1"), {
    kind: "note",
    sort: "latest",
    mine: true,
  });
  assert.deepEqual(parseTownFeedFilters("?kind=video&sort=hot&mine=yes"), TOWN_FEED_DEFAULT_FILTERS);
});

test("[21] 기본값은 URL 에 적지 않는다 — /town 그대로", () => {
  assert.equal(townFeedFilterQuery(TOWN_FEED_DEFAULT_FILTERS), "");
  assert.equal(townFeedFilterQuery({ kind: "post", sort: "reco", mine: false }), "?kind=post");
  assert.equal(
    townFeedFilterQuery({ kind: "note", sort: "latest", mine: true }),
    "?kind=note&sort=latest&mine=1",
  );
});

test("[21] 다른 파라미터는 보존하고 필터 키만 갈아 끼운다", () => {
  const q = townFeedFilterQuery({ kind: "all", sort: "latest", mine: false }, "?ref_code=abc&kind=note&mine=1");
  const sp = new URLSearchParams(q);
  assert.equal(sp.get("ref_code"), "abc");
  assert.equal(sp.get("sort"), "latest");
  assert.equal(sp.get("kind"), null, "전체(all)는 지워져야 한다");
  assert.equal(sp.get("mine"), null);
});

test("[21] parse → query → parse 왕복이 같다", () => {
  const f = { kind: "note" as const, sort: "latest" as const, mine: true };
  assert.deepEqual(parseTownFeedFilters(townFeedFilterQuery(f)), f);
});

/* ---------- 23 · 지도 필터 요약 ---------- */

const EMPTY = {
  tradeKey: "all",
  propertyKindKey: "all",
  roomsKey: "all",
  bathroomsKey: "all",
  parkingKey: "all",
  commuteKey: "off",
  ranges: {
    price: [null, null] as [number | null, number | null],
    area: [null, null] as [number | null, number | null],
    year: [null, null] as [number | null, number | null],
    households: [null, null] as [number | null, number | null],
  },
};

test("[23] 아무 필터도 없으면 빈 배열", () => {
  assert.deepEqual(summarizeMapFilters(EMPTY), []);
});

test("[23] 거래유형·면적·가격 — 예시 문구 그대로", () => {
  const segs = summarizeMapFilters({
    ...EMPTY,
    tradeKey: "sale",
    ranges: { ...EMPTY.ranges, price: [null, 100_000], area: [84, null] },
  });
  assert.deepEqual(segs, ["매매", "10억 이하", "84㎡ 이상"]);
});

test("[23] 양끝 범위는 단위를 한 번만 붙인다 · 연도는 이후/이전", () => {
  const segs = summarizeMapFilters({
    ...EMPTY,
    ranges: {
      price: [50_000, 90_000],
      area: [59, 84],
      year: [2010, null],
      households: [null, 500],
    },
  });
  assert.deepEqual(segs, ["5억~9억", "59~84㎡", "2010년 이후", "500세대 이하"]);
  const before = summarizeMapFilters({ ...EMPTY, ranges: { ...EMPTY.ranges, year: [null, 2000] } });
  assert.deepEqual(before, ["2000년 이전"]);
});

test("[23] 매물 상세·출퇴근 필터 — 칩 문구와 같은 말", () => {
  const segs = summarizeMapFilters({
    ...EMPTY,
    tradeKey: "monthly",
    propertyKindKey: "officetel",
    roomsKey: "2",
    bathroomsKey: "1",
    parkingKey: "1",
    commuteKey: "30",
  });
  assert.deepEqual(segs, ["월세", "오피스텔", "방 2개+", "욕실 1개+", "주차 1대+", "출퇴근 ≤30분"]);
});

test("[23] 토막 수 = 걸린 축 수 (map-client activeCount 와 같은 셈)", () => {
  const state = {
    ...EMPTY,
    tradeKey: "jeonse",
    roomsKey: "3",
    commuteKey: "45",
    ranges: { ...EMPTY.ranges, price: [null, 60_000] as [number | null, number | null] },
  };
  const keys = [state.tradeKey, state.propertyKindKey, state.roomsKey, state.bathroomsKey, state.parkingKey, state.commuteKey]
    .filter((k) => k !== "all" && k !== "off").length;
  const axes = (["price", "area", "year", "households"] as const)
    .filter((k) => state.ranges[k][0] !== null || state.ranges[k][1] !== null).length;
  assert.equal(summarizeMapFilters(state).length, keys + axes);
});

test("[23] 만원 표기 — 억 단위와 만 단위", () => {
  assert.equal(manwonLabel(123_000), "12억");
  assert.equal(manwonLabel(85_000), "8.5억");
  assert.equal(manwonLabel(80_000), "8억");
  assert.equal(manwonLabel(8_200), "8,200만");
});

/* ---------- 26 · 전문가 신뢰 한 줄 ---------- */

test("[26] 있는 값만 적는다 — 전부 있으면 네 토막", () => {
  assert.equal(
    expertTrustLine({ verified: true, consultations: 12, responseLabel: "약 3시간 내 답변", reviews: 4 }),
    "인증 완료 · 답변 12건 · 약 3시간 내 답변 · 후기 4건",
  );
});

test("[26] 없는 값은 토막째 빠진다 — 0 이나 '—' 로 채우지 않는다", () => {
  assert.equal(
    expertTrustLine({ verified: false, consultations: 0, responseLabel: null, reviews: 0 }),
    null,
  );
  assert.deepEqual(
    expertTrustSegments({ verified: true, consultations: 0, responseLabel: "   ", reviews: 0 }),
    ["인증 완료"],
  );
  assert.deepEqual(
    expertTrustSegments({ verified: false, consultations: 3, responseLabel: undefined, reviews: 1 }),
    ["답변 3건", "후기 1건"],
  );
});

test("[26] 음수·NaN 은 없는 값으로 본다, 큰 수는 천 단위 구분", () => {
  assert.deepEqual(
    expertTrustSegments({ verified: false, consultations: Number.NaN, responseLabel: null, reviews: -2 }),
    [],
  );
  assert.deepEqual(
    expertTrustSegments({ verified: false, consultations: 1234, responseLabel: null, reviews: 0 }),
    ["답변 1,234건"],
  );
});

/* ---------- 24 · 알림 읽음 이벤트 ---------- */

test("[24] detail.remaining 만 믿는다 — 없거나 숫자가 아니면 null", () => {
  const ok = { detail: { remaining: 3 } } as unknown as Event;
  assert.equal(readNotificationsReadDetail(ok), 3);
  const neg = { detail: { remaining: -1 } } as unknown as Event;
  assert.equal(readNotificationsReadDetail(neg), 0);
  const bad = { detail: { remaining: "3" } } as unknown as Event;
  assert.equal(readNotificationsReadDetail(bad), null);
  const none = {} as unknown as Event;
  assert.equal(readNotificationsReadDetail(none), null);
});
