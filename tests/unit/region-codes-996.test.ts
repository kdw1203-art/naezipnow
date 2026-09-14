import { test } from "node:test";
import assert from "node:assert/strict";
import { listLeafSigungu, getSigunguInfo, currentSigunguCd, isParentSigunguCd, sidoShortLabel } from "@/lib/national-data/region-codes";
/* [996] 2026-07 행정구역 개편 반영 — 수집 목록·폐지 코드 조회·표기 */
test("region-codes 996 — leaf list, retired lookups, labels", () => {
  const leaf = listLeafSigungu();
  const codes = new Set(leaf.map((i) => i.sigunguCd));
  assert.ok(leaf.length >= 250 && leaf.length <= 280, String(leaf.length));
  for (const c of ["41110","41130","41590","41000","29110","46110","28110","28140","28260"]) assert.ok(!codes.has(c), c);
  for (const c of ["36110","12330","12110","28125","28155","28275","28290","41591","41597","41111","11680"]) assert.ok(codes.has(c), c);
  assert.ok(isParentSigunguCd("41590") && isParentSigunguCd("41110") && !isParentSigunguCd("41591"));
  assert.equal(currentSigunguCd("29155"), "12270");
  assert.equal(getSigunguInfo("46110")?.sigungu, "목포시");
  assert.equal(getSigunguInfo("46110")?.retired?.successor, "12110");
  assert.equal(sidoShortLabel({ sido: "전남광주통합특별시", sigungu: "광산구" }), "광주");
  assert.equal(sidoShortLabel({ sido: "전남광주통합특별시", sigungu: "목포시" }), "전남");
});
