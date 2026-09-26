import { test } from "node:test";
import assert from "node:assert/strict";
import { krwText, listingPriceLine, marketCompare, MARKET_FLAT_PCT } from "../../app/listings/price-text.ts";
import { restoreListingAt } from "../../app/listings/compare-restore.ts";
import { LISTING_COMPARE_ENTRY_OPEN } from "../../app/listings/compare-entry.ts";
import { add, clear, getSnapshot, remove, type CompareListing } from "../../components/listing-compare-store.ts";

/* [1009 · T] 매물 호가 정밀 표기 · 실거래 대비 배지(등락 토큰). 숫자는 가짜 입력이다. */

test("호가는 한 건의 가격 — 억·만 정밀 표기(28.6억으로 줄이지 않는다)", () => {
  assert.equal(krwText(2_860_000_000), "28억 6,000만");
  assert.equal(krwText(2_855_000_000), "28억 5,500만");
  assert.equal(krwText(98_000_000), "9,800만");
  assert.equal(krwText(null), "—");
  assert.equal(krwText(0), "—");
  assert.equal(
    listingPriceLine({ listingType: "sale", priceKrw: 1_245_000_000, depositKrw: null, monthlyKrw: null }),
    "매매 12억 4,500만",
  );
  assert.equal(
    listingPriceLine({ listingType: "jeonse", priceKrw: null, depositKrw: 600_000_000, monthlyKrw: null }),
    "전세 6억",
  );
  assert.equal(
    listingPriceLine({ listingType: "monthly", priceKrw: null, depositKrw: 100_000_000, monthlyKrw: 1_200_000 }),
    "월세 1억 / 120만",
  );
});

test("실거래 대비 — ▲ 빨강 · ▼ 파랑 · ±3% 안은 '실거래 수준', 값이 없으면 null", () => {
  const up = marketCompare(5);
  assert.equal(up?.dir, "up");
  assert.equal(up?.label, "▲ 5%");
  assert.equal(up?.sentence, "최근 실거래 중위가보다 5% 높아요");
  assert.match(up?.badgeClass ?? "", /delta-up delta-up-b/);
  const down = marketCompare(-8);
  assert.equal(down?.label, "▼ 8%");
  assert.equal(down?.sentence, "최근 실거래 중위가보다 8% 낮아요");
  assert.equal(down?.textClass, "delta-down");
  const flat = marketCompare(MARKET_FLAT_PCT - 1);
  assert.equal(flat?.dir, "flat");
  assert.equal(flat?.label, "실거래 수준");
  assert.equal(marketCompare(-3)?.dir, "down");
  assert.equal(marketCompare(null), null);
  assert.equal(marketCompare(Number.NaN), null);
});

/* [1009 · T 리뷰] 비교함 되돌리기는 원래 자리로 · 가득 차 있으면 거절(다른 칸이 밀려나지 않게) · 입구는 닫혀 있다 */
test("비교함 한 칸 되돌리기 — 맨 뒤가 아니라 원래 자리로, 가득 차면 거절", () => {
  const item = (id: string): CompareListing => ({
    id,
    complexName: `단지${id}`,
    regionName: null,
    listingType: "sale",
    priceKrw: 1_000_000_000,
    depositKrw: null,
    monthlyKrw: null,
    areaM2: 84,
    floor: 3,
    createdAt: "2026-09-22T00:00:00Z",
    refreshedAt: null,
    source: "owner",
    ownerVerified: false,
  });
  const ids = () => getSnapshot().map((i) => i.id).join(",");
  clear();
  ["a", "b", "c"].forEach((id) => add(item(id)));
  remove("b");
  assert.equal(ids(), "a,c");
  assert.equal(restoreListingAt(item("b"), 1), true);
  assert.equal(ids(), "a,b,c");
  // 이미 들어 있으면 그대로 성공
  assert.equal(restoreListingAt(item("b"), 0), true);
  assert.equal(ids(), "a,b,c");
  // 뺀 뒤 다른 매물로 가득 찼으면 거절 — 기존 칸이 밀려나지 않는다
  remove("a");
  add(item("d"));
  assert.equal(ids(), "b,c,d");
  assert.equal(restoreListingAt(item("a"), 0), false);
  assert.equal(ids(), "b,c,d");
  clear();
});

test("매물 비교 입구 — 소유자 결정 전까지 닫혀 있다(/listings/compare 는 보관 경로)", () => {
  assert.equal(LISTING_COMPARE_ENTRY_OPEN, false);
});
