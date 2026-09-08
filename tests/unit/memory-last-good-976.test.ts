import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryLastGoodStore } from "../../lib/cache/memory-last-good.ts";

/* [976] DB 가 밀릴 때 폴백이 같은 DB 를 읽으면 같이 죽는다.
 *
 * 967 의 정상본 폴백은 public_data_cache(=같은 Postgres)에 있었다. 그래서 포화
 * 시간대에 본 조회와 폴백이 나란히 타임아웃 났다(실측: 최근 7일 477건 · 189명).
 * 이 층은 왕복 0회로, **이 인스턴스가 직접 성공했던 값**만 낸다. */

const HOUR = 3_600_000;

test("성공한 값을 그대로 돌려준다", () => {
  const s = new MemoryLastGoodStore<number[]>(24 * HOUR);
  s.save("k", [1, 2, 3], 1_000);
  const hit = s.read("k", 1_000 + HOUR);
  assert.deepEqual(hit?.value, [1, 2, 3]);
  assert.equal(hit?.fetchedAt, new Date(1_000).toISOString());
});

test("한 번도 성공하지 않은 키는 null — 없는 값을 지어내지 않는다", () => {
  const s = new MemoryLastGoodStore<number[]>(24 * HOUR);
  assert.equal(s.read("never", 0), null);
});

test("창을 벗어난 정상본은 버린다(그리고 지운다)", () => {
  const s = new MemoryLastGoodStore<string>(24 * HOUR);
  s.save("k", "old", 0);
  assert.equal(s.read("k", 24 * HOUR - 1)?.value, "old"); // 창 안
  assert.equal(s.read("k", 24 * HOUR + 1), null); // 창 밖
  // 지워졌으므로 시계를 되돌려도 돌아오지 않는다
  assert.equal(s.read("k", HOUR), null);
});

test("시계가 거꾸로 가면(음수 나이) 믿지 않는다", () => {
  const s = new MemoryLastGoodStore<string>(24 * HOUR);
  s.save("k", "v", 10 * HOUR);
  assert.equal(s.read("k", 9 * HOUR), null);
});

test("같은 키는 최신 성공본으로 덮어쓴다", () => {
  const s = new MemoryLastGoodStore<string>(24 * HOUR);
  s.save("k", "first", 0);
  s.save("k", "second", HOUR);
  assert.equal(s.read("k", 2 * HOUR)?.value, "second");
});

test("clear() 후에는 아무것도 남지 않는다", () => {
  const s = new MemoryLastGoodStore<string>(24 * HOUR);
  s.save("k", "v", 0);
  s.clear();
  assert.equal(s.read("k", 0), null);
});
