import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REGION_CATALOG,
  findCatalogRegionById,
  findCatalogRegionByName,
  findCatalogSuccessors,
  regionIdForName,
} from "@/lib/region/catalog";
import { matchRegionFromClsFullNm, matchRegionByName } from "@/lib/market/region-code";
import { sidoOfRegionName, catalogCityForRegionId } from "@/lib/market/sido-group";
import { marketRegionNameCandidates } from "@/lib/market/region-name-candidates";
import { getSigunguInfo, sidoShortLabel } from "@/lib/national-data/region-codes";

/* [998] 2026-07 행정구역 개편 — 지역 카탈로그·REB 이름 해석·시/도 묶음 */

test("카탈로그 — 신설 구 id 가 있고, 옛 id 는 남아 있으며, id 중복이 없다", () => {
  for (const id of [
    "incheon-jemulpo",
    "incheon-yeongjong",
    "incheon-seohae",
    "incheon-geomdan",
    "hwaseong-dongtan",
    "hwaseong-manse",
    "hwaseong-hyohaeng",
    "hwaseong-byeongjeom",
    "sejong",
    "incheon-seo",
    "incheon-jung",
    "gwangju-gwangsan",
  ]) {
    assert.ok(findCatalogRegionById(id), id);
  }
  const ids = REGION_CATALOG.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "id 중복");
  const names = REGION_CATALOG.map((r) => r.name.replace(/\s+/g, ""));
  assert.equal(new Set(names).size, names.length, "이름(공백 제거) 중복 — 정규화 키가 충돌한다");
  /* 신설 구는 인천 소속, 화성 구는 경기, 세종은 세종 */
  assert.equal(catalogCityForRegionId("incheon-geomdan"), "인천");
  assert.equal(catalogCityForRegionId("hwaseong-dongtan"), "경기");
  assert.equal(catalogCityForRegionId("sejong"), "세종");
  /* 좌표는 근사치지만 형식은 지킨다 */
  for (const r of REGION_CATALOG) {
    assert.ok(Number.isFinite(r.lat) && Number.isFinite(r.lng) && r.lat > 33 && r.lat < 39, r.id);
  }
});

test("폐지 구 — retired 표식과 후속 구가 실제 카탈로그 항목으로 풀린다", () => {
  const seo = findCatalogRegionById("incheon-seo")!;
  assert.equal(seo.retired, "2026-07-01");
  assert.deepEqual(
    findCatalogSuccessors("incheon-seo").map((s) => s.id),
    ["incheon-seohae", "incheon-geomdan"],
  );
  assert.deepEqual(
    findCatalogSuccessors("incheon-jung").map((s) => s.name),
    ["제물포구", "영종구"],
  );
  /* 후속 구는 폐지되지 않았고, 폐지 아닌 지역은 후속이 없다 */
  assert.equal(findCatalogRegionById("incheon-geomdan")?.retired, undefined);
  assert.deepEqual(findCatalogSuccessors("gangnam"), []);
  assert.deepEqual(findCatalogSuccessors("no-such"), []);
  /* successors 는 전부 실존 id */
  for (const r of REGION_CATALOG) {
    for (const s of r.successors ?? []) assert.ok(findCatalogRegionById(s), `${r.id} → ${s}`);
  }
  /* 광주 5구는 폐지가 아니다(통합시 소속 변경일 뿐) */
  assert.equal(findCatalogRegionById("gwangju-gwangsan")?.retired, undefined);
});

test("카탈로그 이름 조회 — 별칭은 정확 일치로 붙고 통용 지명은 후속 구를 가리킨다", () => {
  assert.equal(regionIdForName("인천 검단구"), "incheon-geomdan");
  assert.equal(regionIdForName("인천광역시 검단구"), "incheon-geomdan");
  assert.equal(regionIdForName("전남광주 광산구"), "gwangju-gwangsan");
  assert.equal(regionIdForName("전남광주통합특별시 광산구"), "gwangju-gwangsan");
  assert.equal(regionIdForName("화성 동탄구"), "hwaseong-dongtan");
  assert.equal(regionIdForName("세종시"), "sejong");
  assert.equal(regionIdForName("청라"), "incheon-seohae");
  assert.equal(regionIdForName("검단"), "incheon-geomdan");
  /* 옛 표기는 여전히 옛(폐지) 항목이다 — 옛 통계 페이지로 간다 */
  assert.equal(regionIdForName("인천 서구"), "incheon-seo");
  assert.equal(regionIdForName("서구"), "incheon-seo");
  /* 부분 일치 "화성"·"화성시" 는 예전처럼 동탄이 먼저 */
  assert.equal(findCatalogRegionByName("화성시")?.id, "hwaseong-dongtan");
});

test("R-ONE CLS_FULLNM — 옛 표기·통합시 새 표기·신설 구가 모두 카탈로그로 풀린다", () => {
  /* 기존 규칙 유지 */
  assert.equal(matchRegionFromClsFullNm("서울>강남구")?.id, "gangnam");
  assert.equal(matchRegionFromClsFullNm("경기>경부1권>안양시>만안구")?.id, "anyang-manan");
  assert.equal(matchRegionFromClsFullNm("인천>중구")?.id, "incheon-jung");
  assert.equal(matchRegionFromClsFullNm("인천>서구")?.id, "incheon-seo");
  assert.equal(matchRegionFromClsFullNm("광주>광산구")?.id, "gwangju-gwangsan");
  assert.equal(matchRegionFromClsFullNm("광주>동구")?.id, "gwangju-dong");
  /* 인천 신설 구 */
  assert.equal(matchRegionFromClsFullNm("인천>검단구")?.id, "incheon-geomdan");
  assert.equal(matchRegionFromClsFullNm("인천광역시>서해구")?.id, "incheon-seohae");
  assert.equal(matchRegionFromClsFullNm("인천>제물포구")?.id, "incheon-jemulpo");
  assert.equal(matchRegionFromClsFullNm("인천>영종구")?.id, "incheon-yeongjong");
  /* 전남광주통합특별시 — 어느 표기로 오든 광주 구에 붙는다 */
  assert.equal(matchRegionFromClsFullNm("전남광주>광산구")?.id, "gwangju-gwangsan");
  assert.equal(matchRegionFromClsFullNm("전남광주통합특별시>광산구")?.id, "gwangju-gwangsan");
  assert.equal(matchRegionFromClsFullNm("전남광주>동구")?.id, "gwangju-dong");
  assert.equal(matchRegionFromClsFullNm("전남광주통합특별시>북구")?.id, "gwangju-buk");
  /* 전남 시·군은 카탈로그에 없다 — 지어내지 않고 null */
  assert.equal(matchRegionFromClsFullNm("전남광주>목포시"), null);
  assert.equal(matchRegionFromClsFullNm("전남>목포시"), null);
  /* 화성시 구 — 권역 세그먼트를 건너뛰고 "화성시 동탄구" */
  assert.equal(matchRegionFromClsFullNm("경기>경부2권>화성시>동탄구")?.id, "hwaseong-dongtan");
  assert.equal(matchRegionFromClsFullNm("경기>경부2권>화성시>병점구")?.id, "hwaseong-byeongjeom");
  assert.equal(matchRegionFromClsFullNm("경기>화성시>만세구")?.id, "hwaseong-manse");
  /* 세종 — 시 자체가 시군구 */
  assert.equal(matchRegionFromClsFullNm("세종>세종시")?.id, "sejong");
  assert.equal(matchRegionFromClsFullNm("세종")?.id, "sejong");
  /* 다른 시도 단독 세그먼트는 여전히 null(서울 전체는 별도 규칙이 받는다) */
  assert.equal(matchRegionFromClsFullNm("서울"), null);
  /* 옛 인천 동구는 카탈로그에 없다 — 예전 규칙은 남동구에 붙였다(통계 오염). 이제 null */
  assert.equal(matchRegionFromClsFullNm("인천>동구"), null);
  assert.equal(matchRegionFromClsFullNm("인천>남동구")?.id, "incheon-namdong");
});

test("matchRegionByName — 별칭 정확 일치가 부분 일치보다 먼저", () => {
  assert.equal(matchRegionByName("광주 광산구")?.id, "gwangju-gwangsan");
  assert.equal(matchRegionByName("전남광주 광산구")?.id, "gwangju-gwangsan");
  assert.equal(matchRegionByName("검단구", "인천")?.id, "incheon-geomdan");
  assert.equal(matchRegionByName("화성 동탄구")?.id, "hwaseong-dongtan");
});

test("sidoOfRegionName — 실거래 표기(molitRegionLabel)가 시/도로 묶인다", () => {
  assert.equal(sidoOfRegionName("화성 동탄구"), "경기");
  assert.equal(sidoOfRegionName("광주 광산구"), "광주");
  assert.equal(sidoOfRegionName("인천 검단구"), "인천");
  assert.equal(sidoOfRegionName("인천 서해구"), "인천");
  assert.equal(sidoOfRegionName("세종시"), "세종");
  /* 전남 시·군은 카탈로그에 없다 → 예전처럼 null("그 밖의 지역") */
  assert.equal(sidoOfRegionName("전남 목포시"), null);
  assert.equal(sidoOfRegionName("목포시"), null);
  /* 경기 광주시는 광주가 아니다(기존 규칙 유지) */
  assert.notEqual(sidoOfRegionName("광주시"), "광주");
  assert.equal(sidoOfRegionName("포항 남구"), null);
});

test("실거래 region_name 후보 — 적재 표기(molitRegionLabel: '<짧은 시도> <구>' · 시군은 이름만)와 맞물린다", () => {
  /* molit-transactions.ts 는 server-only 의존이 있어 여기서 직접 부르지 않는다 — 코드 표의 이름과
     sidoShortLabel 로 같은 표기를 조립해 카탈로그 후보와 대조한다. */
  const label = (cd: string) => {
    const info = getSigunguInfo(cd)!;
    if (info.sigungu.includes(" ")) return info.sigungu.replace(/시\s/, " ");
    return info.sigungu.endsWith("구") ? `${sidoShortLabel(info)} ${info.sigungu}` : info.sigungu;
  };
  assert.equal(label("28290"), "인천 검단구");
  assert.equal(label("41597"), "화성 동탄구");
  assert.equal(label("12330"), "광주 광산구");
  assert.equal(label("36110"), "세종시");
  /* 카탈로그 이름 → 실거래 후보에 위 표기가 들어 있다 */
  assert.ok(marketRegionNameCandidates("incheon-geomdan", "검단구").includes("인천 검단구"));
  assert.ok(marketRegionNameCandidates("hwaseong-dongtan", "화성시 동탄구").includes("화성 동탄구"));
  assert.ok(marketRegionNameCandidates("gwangju-gwangsan", "광산구").includes("광주 광산구"));
  assert.ok(marketRegionNameCandidates("busan-haeundae", "해운대구").includes("부산 해운대구"));
  assert.deepEqual(marketRegionNameCandidates("sejong", "세종시"), ["세종시"]);
  /* 서울·기존 규칙은 그대로 */
  assert.deepEqual(marketRegionNameCandidates("gangnam", "강남구"), ["강남구", "서울 강남구"]);
});
