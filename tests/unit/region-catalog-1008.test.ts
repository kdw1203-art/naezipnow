import { test } from "node:test";
import assert from "node:assert/strict";
import { citySuffixedRegionKey, findCatalogRegionByName, regionIdForName } from "@/lib/region/catalog";

/* [1008] 국토부 실거래 region_name("안양 동안구") ↔ 카탈로그("안양시 동안구") — 경기 시·구 단지의
   AI 분석이 "데이터 없음"으로 나오던 원인(소유자 캡처 2026-09-21). */

test("[1008] 시 없이 적힌 경기 시·구 이름이 카탈로그 id 로 풀린다", () => {
  assert.equal(regionIdForName("안양 동안구"), "anyang-dongan");
  assert.equal(regionIdForName("수원 영통구"), "suwon-yeongtong");
  assert.equal(regionIdForName("성남 분당구"), "seongnam-bundang");
  assert.equal(regionIdForName("용인 수지구"), "yongin-suji");
  assert.equal(regionIdForName("고양 일산서구"), "goyang-ilsanseo");
});

test("[1008] 기존 이름은 그대로 — 정식 이름·서울 구·광역시 구", () => {
  assert.equal(regionIdForName("안양시 동안구"), "anyang-dongan");
  assert.equal(regionIdForName("서울 강남구"), "gangnam");
  assert.equal(regionIdForName("강남구"), "gangnam");
  assert.equal(regionIdForName("부산 강서구"), "busan-gangseo");
  assert.equal(regionIdForName("화성 동탄구"), "hwaseong-dongtan");
});

test("[1008] 보정은 정확 일치만 — 카탈로그에 없는 시·구를 엉뚱한 곳에 붙이지 않는다", () => {
  assert.equal(findCatalogRegionByName("창원 마산회원구"), undefined);
  assert.equal(findCatalogRegionByName("천안 서북구"), undefined);
});

test("[1008] citySuffixedRegionKey — 두 낱말 · 앞 낱말에 행정 접미 없음 · 뒤 낱말이 구/군일 때만", () => {
  assert.equal(citySuffixedRegionKey("안양 동안구"), "안양시동안구");
  assert.equal(citySuffixedRegionKey("안양시 동안구"), null);
  assert.equal(citySuffixedRegionKey("서울 강남구"), "서울시강남구");
  assert.equal(citySuffixedRegionKey("남양주시"), null);
  assert.equal(citySuffixedRegionKey("안양 평촌동"), null);
});
