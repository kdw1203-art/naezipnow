import { test } from "node:test";
import assert from "node:assert/strict";
import { announcementFromDetail, competitionRateNumber, normApplyDate } from "../../lib/applyhome/normalize";

/* [994 · D4] 청약 공고 정규화 — 저장소에 들어가는 값의 모양 */

test("[994] normApplyDate — 8자리·구분자 있는 날짜만, 아니면 null", () => {
  assert.equal(normApplyDate("2026-09-15"), "2026-09-15");
  assert.equal(normApplyDate("20260915"), "2026-09-15");
  assert.equal(normApplyDate("2026.09.15"), "2026-09-15");
  assert.equal(normApplyDate("2026-13-01"), null);
  assert.equal(normApplyDate("202609"), null);
  assert.equal(normApplyDate(""), null);
  assert.equal(normApplyDate(undefined), null);
});

test("[994] competitionRateNumber — 숫자 원문만 숫자로, 미달 표기는 null", () => {
  assert.equal(competitionRateNumber("12.5"), 12.5);
  assert.equal(competitionRateNumber("3"), 3);
  assert.equal(competitionRateNumber("(△3)"), null);
  assert.equal(competitionRateNumber("-"), null);
  assert.equal(competitionRateNumber(undefined), null);
});

test("[994] announcementFromDetail — 키·단지명이 없으면 적재하지 않는다", () => {
  assert.equal(announcementFromDetail({ HOUSE_MANAGE_NO: "", PBLANC_NO: "1", HOUSE_NM: "x" }), null);
  assert.equal(announcementFromDetail({ HOUSE_MANAGE_NO: "1", PBLANC_NO: "1", HOUSE_NM: " " }), null);
  const a = announcementFromDetail({
    HOUSE_MANAGE_NO: "2026000123",
    PBLANC_NO: "2026000123",
    HOUSE_NM: " 래미안 테스트 ",
    HOUSE_SECD_NM: "APT",
    SUBSCRPT_AREA_CODE_NM: "서울",
    HSSPLY_ADRES: "서울특별시 강남구 …",
    TOT_SUPLY_HSHLDCO: 500,
    RCEPT_BGNDE: "2026-09-20",
    RCEPT_ENDDE: "2026-09-22",
    RCRIT_PBLANC_DE: "2026-09-10",
    PRZWNER_PRESNATN_DE: "2026-09-29",
    MVN_PREARNGE_YM: "202812",
    PBLANC_URL: "https://www.applyhome.co.kr/x",
  });
  assert.ok(a);
  assert.equal(a?.house_nm, "래미안 테스트");
  assert.equal(a?.region, "서울");
  assert.equal(a?.tot_supply, 500);
  assert.equal(a?.rcept_bgnde, "2026-09-20");
  assert.equal(a?.przwner_de, "2026-09-29");
  assert.equal(a?.mvn_ym, "202812");
});
