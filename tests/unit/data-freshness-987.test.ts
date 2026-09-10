import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  STALE_AFTER_HOURS,
  freshnessLabel,
  isStale,
} from "../../lib/newui/freshness-format.ts";

const NOW = Date.UTC(2026, 8, 10, 12, 0, 0);
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

test("갱신 시각 — 시간·일 단위로 정확히 말한다", () => {
  assert.equal(freshnessLabel(hoursAgo(0.5), NOW), "1시간 이내");
  assert.equal(freshnessLabel(hoursAgo(3), NOW), "3시간 전");
  assert.equal(freshnessLabel(hoursAgo(23), NOW), "23시간 전");
  assert.equal(freshnessLabel(hoursAgo(49), NOW), "2일 전");
});

test("30일이 넘으면 날짜를 그대로 적는다 — 그쯤 되면 '며칠 전'이 위로가 안 된다", () => {
  assert.match(freshnessLabel(hoursAgo(24 * 45), NOW) ?? "", /^\d{4}\. \d{1,2}\. \d{1,2}\.$/);
});

test("못 읽는 값·미래 시각은 null — 없는 것을 '최근'으로 뭉개지 않는다", () => {
  assert.equal(freshnessLabel("어제", NOW), null);
  assert.equal(freshnessLabel("", NOW), null);
  assert.equal(freshnessLabel(hoursAgo(-3), NOW), null);
});

test("48시간이 넘으면 밀린 것으로 표시한다 — 982에서 13일 실패가 화면에 안 보였다", () => {
  assert.equal(STALE_AFTER_HOURS, 48);
  assert.equal(isStale(hoursAgo(47), NOW), false);
  assert.equal(isStale(hoursAgo(49), NOW), true);
  assert.equal(isStale("쓰레기", NOW), false);
});
