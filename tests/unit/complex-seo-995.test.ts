/* [995] 단지 SEO(D1) — 읍면동 파싱·평형 요약·최근 12개월 건수·JSON-LD 주소 회귀.
   제목·설명·첫 화면 칩은 전부 이 순수 함수들로 만들어지므로 여기서 규칙을 고정한다
   ("undefined"·지어낸 숫자가 새 나가지 않게). */
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseDong,
  areaBandTitle,
  topAreaBands,
  bandPriceLabel,
  ymShortLabel,
  shiftYm,
  countDealsInWindow,
  resolveRegionId,
} from "../../lib/complex/dong.ts";
import { complexResidenceJsonLd, breadcrumbJsonLd } from "../../lib/seo/jsonld.ts";

test("parseDong — 지번 주소에서 읍면동을 뽑는다(시/도·시군구·번지는 무시)", () => {
  assert.equal(parseDong("서울 송파구 잠실동 22"), "잠실동");
  assert.equal(parseDong("강북구 미아동 1353"), "미아동");
  assert.equal(parseDong("충청남도 공주시 금흥동"), "금흥동");
  assert.equal(parseDong("경기도 성남시 분당구 정자동 1"), "정자동");
  assert.equal(parseDong("세종특별자치시 한솔동"), "한솔동");
  assert.equal(parseDong("서울 종로구 종로1가 24-1"), "종로1가");
  assert.equal(parseDong("경기 김포시 통진읍 마송리 100"), "마송리");
  assert.equal(parseDong("상리"), "상리");
});

test("parseDong — 없으면 null(도로명·빈값·건물 동 번호는 읍면동이 아니다)", () => {
  assert.equal(parseDong("서울 송파구 올림픽로 435"), null);
  assert.equal(parseDong(""), null);
  assert.equal(parseDong(null), null);
  assert.equal(parseDong(undefined), null);
  assert.equal(parseDong("서울 송파구"), null);
  /* "101동" 은 건물 동 — 번지 뒤에 오므로 멈추고, 앞에 있어도 숫자 시작이라 거른다 */
  assert.equal(parseDong("서울 송파구 잠실동 22 101동"), "잠실동");
  assert.equal(parseDong("101동 202호"), null);
});

const BANDS = [
  { label: "~59㎡", count: 4, latestManwon: 98_000, latestYm: "202607" },
  { label: "60~85㎡", count: 12, latestManwon: 125_000, latestYm: "202608" },
  { label: "85~102㎡", count: 12, latestManwon: 150_000, latestYm: "202605" },
  { label: "135㎡~", count: 1, latestManwon: 0, latestYm: "202601" },
];

test("topAreaBands — 건수 내림차순, 같은 건수면 면적 오름차순(원래 순서) 유지, 값 없는 구간 제외", () => {
  assert.deepEqual(
    topAreaBands(BANDS, 3).map((b) => b.label),
    ["60~85㎡", "85~102㎡", "~59㎡"],
  );
  assert.deepEqual(topAreaBands(BANDS, 2).map((b) => b.label), ["60~85㎡", "85~102㎡"]);
  assert.deepEqual(topAreaBands([], 2), []);
  assert.deepEqual(topAreaBands(null, 2), []);
});

test("areaBandTitle — '구간 최근가 · 구간 최근가' (eok1 표기), 재료 없으면 빈 문자열", () => {
  assert.equal(areaBandTitle(BANDS), "60~85㎡ 12.5억 · 85~102㎡ 15억");
  assert.equal(areaBandTitle(BANDS, bandPriceLabel, 1), "60~85㎡ 12.5억");
  assert.equal(areaBandTitle([]), "");
  assert.equal(areaBandTitle(undefined), "");
  /* 포맷터 주입 — 제목 실험 등에서 다른 표기를 쓸 수 있게 */
  assert.equal(areaBandTitle(BANDS, (m) => `${m}만`, 1), "60~85㎡ 125000만");
  assert.equal(bandPriceLabel(98_000), "9.8억");
  assert.equal(bandPriceLabel(8_500), "8,500만");
});

test("ymShortLabel — '202608' → '26.8월', 형식이 아니면 null", () => {
  assert.equal(ymShortLabel("202608"), "26.8월");
  assert.equal(ymShortLabel("202512"), "25.12월");
  assert.equal(ymShortLabel("2026-08"), null);
  assert.equal(ymShortLabel("202613"), null);
  assert.equal(ymShortLabel(null), null);
});

test("shiftYm / countDealsInWindow — 달력 기준 12개월 창(거래 없는 달이 빠져 있어도 정확)", () => {
  assert.equal(shiftYm("202609", -11), "202510");
  assert.equal(shiftYm("202601", -1), "202512");
  assert.equal(shiftYm("202512", 1), "202601");
  const series = [
    { ym: "202509", dealCount: 5 }, // 창 밖(2025.10~2026.09)
    { ym: "202510", dealCount: 2 }, // 창 시작월 — 포함
    { ym: "202603", dealCount: 3 },
    { ym: "202608", dealCount: 4 },
    { ym: "202610", dealCount: 9 }, // 미래(기준월 뒤) — 제외
  ];
  assert.equal(countDealsInWindow(series, "202609", 12), 9);
  /* ComplexTransactionRow 모양(yyyymm·deal_count)도 같은 함수로 */
  assert.equal(
    countDealsInWindow(
      [
        { yyyymm: "202606", deal_count: 1 },
        { yyyymm: "202409", deal_count: 7 },
      ],
      "202609",
    ),
    1,
  );
  assert.equal(countDealsInWindow(series, "", 12), 0);
  assert.equal(countDealsInWindow([], "202609", 12), 0);
});

test("resolveRegionId — 시/도+시군구로 허브 id 를 찾고, 시/도가 다르면 null(부분 일치 오탐 차단)", () => {
  assert.equal(resolveRegionId("서울", "송파구"), "songpa");
  assert.equal(resolveRegionId("서울", "중구"), "jung");
  assert.equal(resolveRegionId("부산", "중구"), "busan-jung");
  assert.equal(resolveRegionId("부산", "해운대구"), "busan-haeundae");
  assert.equal(resolveRegionId("경기", "성남시 분당구"), "seongnam-bundang");
  /* 예전 regionIdForName("부산") 은 부분 일치로 busan-jung 을 냈다 — 시군구 없이는 null */
  assert.equal(resolveRegionId("부산", ""), null);
  assert.equal(resolveRegionId("충남", "공주시"), null);
  assert.equal(resolveRegionId(null, null), null);
});

test("complexResidenceJsonLd — dong 이 있으면 addressLocality=읍면동, 없으면 시군구(기존 호환)", () => {
  const withDong = complexResidenceJsonLd({
    id: "x",
    name: "잠실엘스",
    address: "서울 송파구 잠실동 22",
    regionName: "서울",
    locality: "송파구",
    dong: "잠실동",
  }) as { address: Record<string, unknown> };
  assert.equal(withDong.address["@type"], "PostalAddress");
  assert.equal(withDong.address.addressCountry, "KR");
  assert.equal(withDong.address.addressRegion, "서울");
  assert.equal(withDong.address.addressLocality, "잠실동");
  assert.equal(withDong.address.streetAddress, "서울 송파구 잠실동 22");

  const withoutDong = complexResidenceJsonLd({
    id: "x",
    name: "잠실엘스",
    regionName: "서울",
    locality: "송파구",
    dong: null,
  }) as { address: Record<string, unknown> };
  assert.equal(withoutDong.address.addressLocality, "송파구");
});

test("breadcrumbJsonLd — 홈 → 지역 → 단지 세 단계(전부 URL 있음), 지역 없으면 두 단계", () => {
  const regionId: string | null = "songpa";
  const three = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    ...(regionId ? [{ name: "서울 송파구", url: `/region/${regionId}` }] : []),
    { name: "잠실엘스", url: "/complex/abc" },
  ]) as { itemListElement: { position: number; name: string; item?: string }[] };
  assert.equal(three.itemListElement.length, 3);
  assert.deepEqual(
    three.itemListElement.map((i) => i.position),
    [1, 2, 3],
  );
  assert.ok(three.itemListElement[1].item?.endsWith("/region/songpa"));
  assert.ok(three.itemListElement.every((i) => typeof i.item === "string" && i.item.length > 0));

  const two = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "잠실엘스", url: "/complex/abc" },
  ]) as { itemListElement: unknown[] };
  assert.equal(two.itemListElement.length, 2);
});
