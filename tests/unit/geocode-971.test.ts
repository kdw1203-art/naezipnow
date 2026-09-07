import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGeocodeQueries, withSidoPrefix } from "../../lib/map/geocode-query.ts";

/* [971] 지오코딩 질의 후보 — 순서와 시/도 보정.
 *
 * 이 파이프라인에서 제일 비싼 실수는 "못 찾음"이 아니라 **다른 도시로 찍힘**이다.
 * 실거래 주소가 "남구 신정동 …" 처럼 시/도 없이 오기 때문인데, 같은 이름의 구가
 * 전국에 여럿이라 지오코더가 아무 데나 고를 수 있다. 아래는 그 보정과 후보 순서를
 * 고정한다. */

test("withSidoPrefix — 시/도 없는 지번에 region 앞 토막을 붙인다", () => {
  assert.equal(withSidoPrefix("울산 남구", "남구 신정동 산107-50"), "울산 남구 신정동 산107-50");
  assert.equal(withSidoPrefix("대구 중구", "중구 남산동 100"), "대구 중구 남산동 100");
});

test("withSidoPrefix — 보탤 게 없으면 빈 문자열", () => {
  // 이미 시/도가 붙어 있다
  assert.equal(withSidoPrefix("고양 일산동구", "고양시 일산동구 장항동 1"), "");
  // region 이 한 토막이면 빌려 줄 앞 토막이 없다
  assert.equal(withSidoPrefix("김포시", "김포시 고촌읍 신곡리 1"), "");
  assert.equal(withSidoPrefix("가평군", "가평군 가평읍 대곡리 694"), "");
  // 주소 자체가 없다
  assert.equal(withSidoPrefix("울산 남구", null), "");
  assert.equal(withSidoPrefix("울산 남구", "   "), "");
});

test("buildGeocodeQueries — 도로명 → 보정 지번 → 원본 지번 → 지역+이름 → 이름", () => {
  assert.deepEqual(
    buildGeocodeQueries({
      region: "울산 남구",
      name: "드림펠리스",
      address: "남구 신정동 산107-50",
      roadAddress: "울산광역시 남구 대학로 100",
    }),
    [
      "울산광역시 남구 대학로 100",
      "울산 남구 신정동 산107-50",
      "남구 신정동 산107-50",
      "울산 남구 드림펠리스",
      "드림펠리스",
    ],
  );
});

test("buildGeocodeQueries — 도로명이 없으면 그 자리를 비우고 나머지 순서는 그대로", () => {
  assert.deepEqual(
    buildGeocodeQueries({ region: "가평군", name: "가평자이", address: "가평군 가평읍 대곡리 695" }),
    ["가평군 가평읍 대곡리 695", "가평군 가평자이", "가평자이"],
  );
});

test("buildGeocodeQueries — 빈 값·중복 후보는 지운다(예산이 후보 수로 잡힌다)", () => {
  const qs = buildGeocodeQueries({ region: "김포시", name: "김포시", address: "김포시" });
  assert.deepEqual(qs, ["김포시", "김포시 김포시"]);
  assert.equal(new Set(qs).size, qs.length);
});
