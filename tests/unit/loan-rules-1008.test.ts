import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACQ_TAX_SOURCES,
  LEGACY_LTV_2023,
  LOAN_REGIONS,
  LOAN_RULES_BASIS_LABEL,
  LOAN_RULE_SOURCES,
  LTV_TABLE,
  OWNERSHIPS,
  REGULATED_AREAS,
  acquisitionRateLabel,
  acquisitionTaxOf,
  computeLoanLimit,
  isLoanRegion,
  isOwnership,
  loanRegionFromRegionName,
  maxTermYears,
  moveInDeadlineMonths,
  priceTierCapManwon,
  stressRateFloorPct,
  type Ownership,
} from "../../lib/finance/loan-rules.ts";

/* [1008 · M] /calculator 한도 규칙(10·15 대책 기준 · 2026.09 확인)을 잠근다.
 * 예전 화면은 2023.3 완화 기준(무주택 70%)이라 서울 8.4억 무주택자에게 최대 대출 5억 8,800만원을
 * 보여 줬다 — 규제지역 LTV 40% 로는 3억 3,600만원이다. 테스트 숫자는 규칙 확인용 가짜 입력이다. */

const EOK = 10_000; // 1억 = 10,000만원

test("LTV 표 — 규제지역 40%(무주택·처분조건) · 생애최초 70% · 수도권 추가 구입 0% · 그 외 지역 70/80/60", () => {
  assert.deepEqual(LTV_TABLE.regulated, { 생애최초: 70, 무주택: 40, "1주택 처분조건": 40, 다주택: 0 });
  assert.deepEqual(LTV_TABLE.capital, { 생애최초: 70, 무주택: 70, "1주택 처분조건": 70, 다주택: 0 });
  assert.deepEqual(LTV_TABLE.other, { 생애최초: 80, 무주택: 70, "1주택 처분조건": 70, 다주택: 60 });
  // 예전 규칙은 "그 외 지역" 줄과 같다 — 규제지역·수도권만 달라졌다
  for (const o of OWNERSHIPS) assert.equal(LTV_TABLE.other[o], LEGACY_LTV_2023[o]);
});

test("소유자 캡처 기준 값: 서울 8.4억 무주택 → 최대 대출 3억 3,600만원(예전 5억 8,800만원)", () => {
  const r = computeLoanLimit({ priceManwon: 84_000, region: "regulated", ownership: "무주택" });
  assert.equal(r.maxLoanManwon, 33_600);
  assert.equal(r.binding, "ltv");
  assert.equal((84_000 * LEGACY_LTV_2023["무주택"]) / 100, 58_800);
});

test("최대 대출 = min(LTV × 매매가, 가격 구간 한도) — 어느 쪽이 정했는지도 알려 준다", () => {
  // 서울 20억 무주택: 40% = 8억 > 15~25억 구간 한도 4억 → 4억
  const a = computeLoanLimit({ priceManwon: 20 * EOK, region: "regulated", ownership: "무주택" });
  assert.deepEqual(
    { ltv: a.ltvAmountManwon, cap: a.capManwon, max: a.maxLoanManwon, by: a.binding },
    { ltv: 8 * EOK, cap: 4 * EOK, max: 4 * EOK, by: "cap" },
  );
  // 서울 30억 생애최초: 70% = 21억 > 25억 초과 한도 2억 → 2억(생애최초도 금액 한도 적용 — 금융위 FAQ)
  const b = computeLoanLimit({ priceManwon: 30 * EOK, region: "regulated", ownership: "생애최초" });
  assert.equal(b.maxLoanManwon, 2 * EOK);
  assert.equal(b.binding, "cap");
  // 수도권 비규제 10억 생애최초: 70% = 7억 > 6억 → 6억
  const c = computeLoanLimit({ priceManwon: 10 * EOK, region: "capital", ownership: "생애최초" });
  assert.equal(c.maxLoanManwon, 6 * EOK);
  // 수도권 비규제 8억 무주택: 70% = 5.6억 < 6억 → 5.6억
  const d = computeLoanLimit({ priceManwon: 8 * EOK, region: "capital", ownership: "무주택" });
  assert.equal(d.maxLoanManwon, 56_000);
  assert.equal(d.binding, "ltv");
  // 그 외 지역: 금액 상한 없음 — 10억 생애최초 80% = 8억
  const e = computeLoanLimit({ priceManwon: 10 * EOK, region: "other", ownership: "생애최초" });
  assert.equal(e.capManwon, null);
  assert.equal(e.maxLoanManwon, 8 * EOK);
});

test("가격 구간 경계는 '이하' — 15억·25억 딱 그 값은 아래 구간", () => {
  assert.equal(priceTierCapManwon("regulated", 15 * EOK), 6 * EOK);
  assert.equal(priceTierCapManwon("regulated", 15 * EOK + 1), 4 * EOK);
  assert.equal(priceTierCapManwon("regulated", 25 * EOK), 4 * EOK);
  assert.equal(priceTierCapManwon("regulated", 25 * EOK + 1), 2 * EOK);
  assert.equal(priceTierCapManwon("capital", 3 * EOK), 6 * EOK);
  assert.equal(priceTierCapManwon("other", 30 * EOK), null);
  // 15억 무주택 서울: 40% = 6억 = 한도 6억 → LTV 가 정한 것으로 본다(둘이 같음)
  const r = computeLoanLimit({ priceManwon: 15 * EOK, region: "regulated", ownership: "무주택" });
  assert.equal(r.maxLoanManwon, 6 * EOK);
});

test("수도권·규제지역 추가 구입(다주택)은 LTV 0% — 대출 불가로 표시", () => {
  for (const region of ["regulated", "capital"] as const) {
    const r = computeLoanLimit({ priceManwon: 9 * EOK, region, ownership: "다주택" });
    assert.equal(r.maxLoanManwon, 0);
    assert.equal(r.binding, "none");
  }
  const other = computeLoanLimit({ priceManwon: 5 * EOK, region: "other", ownership: "다주택" });
  assert.equal(other.maxLoanManwon, 3 * EOK);
});

test("최대 대출은 어떤 입력에서도 LTV × 매매가·금액 한도를 넘지 않는다", () => {
  for (const region of ["regulated", "capital", "other"] as const) {
    for (const o of OWNERSHIPS) {
      for (let price = 5_000; price <= 450_000; price += 7_500) {
        const r = computeLoanLimit({ priceManwon: price, region, ownership: o });
        assert.ok(r.maxLoanManwon <= (price * r.ltvPct) / 100 + 1e-9);
        if (r.capManwon !== null) assert.ok(r.maxLoanManwon <= r.capManwon);
        assert.ok(r.maxLoanManwon >= 0);
      }
    }
  }
});

test("수도권·규제지역 부가 규칙 — 만기 30년·전입 6개월·스트레스 금리 하한 3%, 그 외 지역은 확인 못 한 값(null)", () => {
  assert.equal(maxTermYears("regulated"), 30);
  assert.equal(maxTermYears("capital"), 30);
  assert.equal(maxTermYears("other"), null);
  assert.equal(moveInDeadlineMonths("regulated"), 6);
  assert.equal(moveInDeadlineMonths("other"), null);
  assert.equal(stressRateFloorPct("capital"), 3);
  assert.equal(stressRateFloorPct("other"), null);
});

test("규제지역 명단 — 서울 전역 + 경기 12곳(2025.10.16) + 3곳(2026.7.1)", () => {
  const all = REGULATED_AREAS.flatMap((g) => g.names).join(" ");
  for (const n of ["서울 25개 구 전역", "과천", "광명", "분당", "수정", "중원", "영통", "장안", "팔달", "동안", "수지", "의왕", "하남", "동탄", "기흥", "구리"]) {
    assert.ok(all.includes(n), `${n} 누락`);
  }
  assert.equal(REGULATED_AREAS.find((g) => g.since === "2026-07-01")?.names.length, 3);
});

test("기준일·출처 — 화면에 붙는 문구와 공식 출처(정책브리핑·금융위원회)", () => {
  assert.equal(LOAN_RULES_BASIS_LABEL, "10·15 대책 기준 · 2026.09 확인");
  assert.ok(LOAN_RULE_SOURCES.length >= 3);
  for (const s of [...LOAN_RULE_SOURCES, ...ACQ_TAX_SOURCES]) {
    assert.match(s.href, /^https:\/\/www\.(korea\.kr|fsc\.go\.kr)\//, s.href);
  }
  assert.ok(LOAN_RULE_SOURCES.some((s) => s.href.includes("newsId=148950959")), "10·15 정책브리핑");
  assert.ok(LOAN_RULE_SOURCES.some((s) => s.href.includes("fsc.go.kr/no010101/84824")), "6·27 금융위");
});

test("형 가드", () => {
  assert.equal(isOwnership("무주택"), true);
  assert.equal(isOwnership("2주택"), false);
  assert.equal(isLoanRegion("capital"), true);
  assert.equal(isLoanRegion("seoul"), false);
  assert.deepEqual(
    LOAN_REGIONS.map((r) => r.key),
    ["regulated", "capital", "other"],
  );
});

/* ── 취득세: calculator-client 에서 옮긴 규칙 — region 없이 부르면 예전과 **똑같아야** 한다 ── */
function legacyAcquisitionTaxOf(priceManwon: number, o: Ownership): number {
  let ratePct: number;
  if (o === "다주택") {
    ratePct = 8.4;
  } else if (priceManwon <= 60000) {
    ratePct = 1.1;
  } else if (priceManwon >= 90000) {
    ratePct = 3.3;
  } else {
    ratePct = ((priceManwon / 10000) * (2 / 3) - 3) * 1.1;
  }
  let tax = priceManwon * (ratePct / 100);
  if (o === "생애최초" && priceManwon <= 120000) {
    tax = Math.max(0, tax - 200);
  }
  return tax;
}
function legacyAcquisitionRateLabel(priceManwon: number, o: Ownership): string {
  if (o === "다주택") return "약 8.4%";
  if (priceManwon <= 60000) return "약 1.1%";
  if (priceManwon >= 90000) return "약 3.3%";
  return "약 1.1~3.3% 구간";
}

test("취득세 — region 없이 부르면 예전 계산기와 동작 동일(다른 화면이 import 해도 값이 안 바뀐다)", () => {
  for (const o of OWNERSHIPS) {
    for (let price = 10_000; price <= 400_000; price += 2_500) {
      assert.equal(acquisitionTaxOf(price, o), legacyAcquisitionTaxOf(price, o), `${o} ${price}`);
      assert.equal(acquisitionRateLabel(price, o), legacyAcquisitionRateLabel(price, o), `${o} ${price}`);
    }
  }
});

test("취득세 — 규제지역(조정대상지역) 추가 구입은 8.4%, 비조정 2주택은 일반세율(중과는 비조정 3주택부터)", () => {
  assert.equal(acquisitionRateLabel(10 * EOK, "다주택", "regulated"), "약 8.4%");
  assert.equal(acquisitionRateLabel(10 * EOK, "다주택", "capital"), "약 3.3%");
  assert.equal(acquisitionRateLabel(5 * EOK, "다주택", "other"), "약 1.1%");
  assert.equal(acquisitionTaxOf(5 * EOK, "다주택", "other"), 5 * EOK * 0.011);
  // 1주택 계열은 지역과 무관
  assert.equal(acquisitionTaxOf(8 * EOK, "무주택", "regulated"), acquisitionTaxOf(8 * EOK, "무주택", "other"));
  // 생애최초 12억 이하 200만원 감면
  assert.equal(acquisitionTaxOf(5 * EOK, "생애최초", "regulated"), 5 * EOK * 0.011 - 200);
  assert.equal(acquisitionTaxOf(13 * EOK, "생애최초", "regulated"), 13 * EOK * 0.033);
});

test("지역 이름 → 계산기 지역(단지 화면 링크용) — 운영 region_name 표기, 모르면 추측하지 않는다", () => {
  const cases: [string, string | null][] = [
    // 운영 실거래 region_name(lawd_region_map) 대표 표기 — 리뷰 B 지정
    ["서울 강남구", "regulated"],
    ["화성 동탄구", "regulated"],
    ["인천 연수구", "capital"],
    ["부천 원미구", "capital"],
    ["광주시", "capital"], // 경기 광주시
    ["광주 북구", "other"], // 광주광역시
    ["창원 성산구", "other"],
    ["사천시", "other"],
    ["세종시", "other"],
    ["제주시", "other"],
    // 경기 규제지역은 구 단위까지
    ["안양 동안구", "regulated"],
    ["안양 만안구", "capital"],
    ["성남 분당구", "regulated"],
    ["수원 영통구", "regulated"],
    ["수원 권선구", "capital"],
    ["용인 기흥구", "regulated"],
    ["용인 처인구", "capital"],
    ["화성 병점구", "capital"],
    ["과천시", "regulated"],
    ["구리시", "regulated"],
    ["하남시", "regulated"],
    ["동두천시", "capital"],
    ["연천군", "capital"],
    ["인천 검단구", "capital"],
    // 그 외 지역 — 광역시·도 이름, 시·군, 시 + 구
    ["부산 해운대구", "other"],
    ["대구 군위군", "other"],
    ["광주 광산구", "other"],
    ["청주 상당구", "other"],
    ["포항 남구", "other"],
    ["고성군", "other"], // 경남·강원 둘 다 그 외 지역
    ["서귀포시", "other"],
    // 카탈로그·주소식 표기
    ["서울특별시 노원구", "regulated"],
    ["안양시 동안구", "regulated"],
    ["안양시동안구", "regulated"],
    ["경기도 성남시 수정구", "regulated"],
    ["경기 광주시", "capital"],
    ["세종특별자치시", "other"],
    ["강원특별자치도 춘천시", "other"],
    ["광주광역시 북구", "other"],
    // 모르는 것은 null
    ["", null],
    ["   ", null],
    ["중구", null],
    ["강남구", null],
    ["광주", null],
    ["수원시", null], // 구 단위로 규제가 갈린다
    ["용인시", null],
    ["경기", null],
  ];
  for (const [name, want] of cases) {
    assert.equal(loanRegionFromRegionName(name), want, name);
  }
});

test("리뷰 B 재현: 창원 5억 무주택 — 이름으로 지역을 풀면 70%(3.5억), 기본값(규제지역)이면 40%(2억)였다", () => {
  const region = loanRegionFromRegionName("창원 성산구");
  assert.equal(region, "other");
  const r = computeLoanLimit({ priceManwon: 5 * EOK, region: region ?? "regulated", ownership: "무주택" });
  assert.equal(r.maxLoanManwon, 35_000);
});
