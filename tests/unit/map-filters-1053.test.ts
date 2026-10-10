/* [1053 · 지도 상세 필터 2] 단지 조건 · 마커 표시 값.
 *
 * 잠그는 사실:
 *  F1 난방 묶음(지역 · 개별 · 중앙 · 기타) · 시공사 이름(주식회사 표기 걷기 · 바뀐 회사 이름 한 묶음 · 공동 시공 첫 회사).
 *  F2 세대당 주차 — 둘 다 있을 때만 · 0 세대 · 10대 넘는 대장 오류는 버림.
 *  F3 조건 통과 — 건 조건의 값이 없으면 빠진다(모르는 값을 맞는 값으로 치지 않음) · 전세 보기는 평당가만 건너뜀.
 *  F4 걸린 조건 낱말 · 칩 옆 수 · 평당가 막대 · 마커 글자 · 호버 한 줄 · 저장값 해석(틀린 칸만 기본값).
 *  F5 서버 — map_complex_attrs_v2(실패하면 v1) · 마이그레이션 사본 md5 · service_role 전용.
 *  F6 화면 — 패널 "단지 조건" · 목록(filteredDanji)에도 걸림 · 마커 · 넓게 볼 때 고지 · 초기화 · 슬라이더 문구 바로잡기. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  EMPTY_CX,
  builderLabel,
  cxActive,
  cxCounts,
  cxSummary,
  heatingKey,
  hoverFacts,
  metricLabel,
  parkingPerHousehold,
  parseCx,
  parseMetric,
  passesCx,
  pyeongHistogram,
  type CxPoint,
} from "@/lib/map/complex-filters";

const read = (p: string) => readFileSync(p, "utf8");

test("F1 난방 · 시공사", () => {
  assert.equal(heatingKey("지역난방"), "district");
  assert.equal(heatingKey("개별난방"), "individual");
  assert.equal(heatingKey("개별난방+기타"), "individual");
  assert.equal(heatingKey("중앙난방"), "central");
  assert.equal(heatingKey("기타"), "other");
  assert.equal(heatingKey(""), null);
  assert.equal(heatingKey(null), null);

  assert.equal(builderLabel("현대건설(주)"), "현대건설");
  assert.equal(builderLabel("(주)대우건설"), "대우건설");
  assert.equal(builderLabel("㈜ 한양"), "한양");
  assert.equal(builderLabel("주식회사 롯데건설"), "롯데건설");
  assert.equal(builderLabel("현대산업개발(주)"), "HDC현대산업개발");
  assert.equal(builderLabel("대림산업"), "DL이앤씨(대림산업)");
  assert.equal(builderLabel("포스코건설"), "포스코이앤씨(포스코건설)");
  assert.equal(builderLabel("대한주택공사"), "LH(한국토지주택공사)");
  assert.equal(builderLabel("한국토지주택공사"), "LH(한국토지주택공사)");
  assert.equal(builderLabel("SK건설"), "SK에코플랜트(SK건설)");
  assert.equal(builderLabel("삼성물산,현대건설"), "삼성물산");
  assert.equal(builderLabel("GS건설+포스코건설"), "GS건설");
  assert.equal(builderLabel("현대건설외2개사"), "현대건설");
  /* 운영 대장 실측 표기(대치·도곡 2026-10-10) */
  assert.equal(builderLabel("주)롯데건설"), "롯데건설");
  assert.equal(builderLabel("삼성물산주식회사"), "삼성물산");
  assert.equal(builderLabel("에스케이건설(주)"), "SK에코플랜트(SK건설)");
  assert.equal(builderLabel("LG건설"), "GS건설");
  assert.equal(builderLabel("선경건설"), "SK에코플랜트(SK건설)");
  assert.equal(builderLabel("삼성건설"), "삼성물산");
  assert.equal(builderLabel("현대,쌍용,GS"), "현대");
  assert.equal(builderLabel("-"), null);
  assert.equal(builderLabel(""), null);
  assert.equal(builderLabel(undefined), null);
});

test("F2 세대당 주차", () => {
  assert.equal(parkingPerHousehold(1200, 1000), 1.2);
  assert.equal(parkingPerHousehold(1333, 1000), 1.33);
  assert.equal(parkingPerHousehold(0, 500), 0);
  assert.equal(parkingPerHousehold(100, 0), null);
  assert.equal(parkingPerHousehold(null, 100), null);
  assert.equal(parkingPerHousehold(100, null), null);
  assert.equal(parkingPerHousehold(50_000, 100), null, "10대 넘으면 대장 오류");
});

const A: CxPoint = { pyeongManwon: 5200, heating: "district", parkingPerHh: 1.35, buildings: 12, elevators: 40, recentTrades: 14, builder: "현대건설" };
const B: CxPoint = { pyeongManwon: 2800, heating: "individual", parkingPerHh: 0.9, buildings: 1, elevators: 0, recentTrades: 2, builder: "한양" };
const C: CxPoint = { recentTrades: 0 }; // 대장 없는 소규모 단지

test("F3 조건 통과", () => {
  assert.equal(cxActive(EMPTY_CX), false);
  for (const p of [A, B, C]) assert.equal(passesCx(p, EMPTY_CX), true);

  const heat = { ...EMPTY_CX, heating: "district" as const };
  assert.equal(cxActive(heat), true);
  assert.equal(passesCx(A, heat), true);
  assert.equal(passesCx(B, heat), false);
  assert.equal(passesCx(C, heat), false, "값 없는 단지는 빠진다");

  const park = { ...EMPTY_CX, parkingMin: "1.2" as const };
  assert.equal(passesCx(A, park), true);
  assert.equal(passesCx(B, park), false);
  assert.equal(passesCx(C, park), false);

  const solo = { ...EMPTY_CX, buildingsMin: "2" as const };
  assert.equal(passesCx(A, solo), true);
  assert.equal(passesCx(B, solo), false, "나홀로(1개 동) 제외");

  const recent = { ...EMPTY_CX, recentMin: "1" as const };
  assert.equal(passesCx(C, recent), false, "0건");
  assert.equal(passesCx(B, recent), true);

  const elev = { ...EMPTY_CX, elevator: "yes" as const };
  assert.equal(passesCx(A, elev), true);
  assert.equal(passesCx(B, elev), false);
  assert.equal(passesCx(C, elev), false);

  const builder = { ...EMPTY_CX, builder: "현대건설" };
  assert.equal(passesCx(A, builder), true);
  assert.equal(passesCx(B, builder), false);

  const py = { ...EMPTY_CX, pyeong: [3000, null] as [number | null, number | null] };
  assert.equal(passesCx(A, py), true);
  assert.equal(passesCx(B, py), false);
  assert.equal(passesCx(C, py), false);
  assert.equal(passesCx(B, py, { price: false }), true, "전세 보기는 평당가(매매) 조건을 건너뛴다");
});

test("F4 낱말 · 수 · 막대 · 마커 · 저장값", () => {
  assert.deepEqual(cxSummary(EMPTY_CX), []);
  assert.deepEqual(
    cxSummary({ pyeong: [3000, 6000], heating: "district", parkingMin: "1.2", buildingsMin: "2", recentMin: "5", elevator: "yes", builder: "현대건설" }),
    ["평당 3,000만~6,000만", "지역난방", "세대당 주차 1.2대+", "2개 동+(나홀로 제외)", "6개월 매매 5건+", "승강기 있음", "시공 현대건설"],
  );
  assert.deepEqual(cxSummary({ ...EMPTY_CX, pyeong: [null, 4000] }), ["평당 4,000만 이하"]);

  const c = cxCounts([A, B, C, { builder: "현대건설", heating: "district" }]);
  assert.equal(c.total, 4);
  assert.equal(c.heating.district, 2);
  assert.equal(c.heating.individual, 1);
  assert.equal(c.heatingKnown, 3);
  assert.deepEqual(c.parking, { "1": 1, "1.2": 1, "1.5": 0 });
  assert.equal(c.parkingKnown, 2);
  assert.deepEqual(c.buildings, { "2": 1, "5": 1, "10": 1 });
  assert.deepEqual(c.recent, { "1": 2, "5": 1, "10": 1 });
  assert.equal(c.recentKnown, 3);
  assert.equal(c.elevator, 1);
  assert.equal(c.elevatorKnown, 2);
  assert.deepEqual(c.builders[0], { label: "현대건설", n: 2 });
  assert.equal(c.pyeongKnown, 2);

  const h = pyeongHistogram([A, B, C], 10);
  assert.equal(h.n, 2);
  assert.equal(h.bins.length, 10);
  assert.equal(h.bins.reduce((x, y) => x + y, 0), 2);
  assert.ok(h.lo !== null && h.hi !== null && h.lo <= 2800 && h.hi >= 5200);
  assert.deepEqual(pyeongHistogram([C], 5), { lo: null, hi: null, n: 0, bins: [0, 0, 0, 0, 0] });

  assert.equal(metricLabel({ avgPriceManwon: 125_000 }, "price"), "13억");
  assert.equal(metricLabel({ avgPriceManwon: 85_000 }, "price"), "8.5억");
  assert.equal(metricLabel({ avgPriceManwon: 9_500 }, "price"), "9,500만");
  assert.equal(metricLabel(A, "recent"), "14건");
  assert.equal(metricLabel(C, "recent"), "0건");
  assert.equal(metricLabel({ buildYear: 2019 }, "year"), "2019년");
  assert.equal(metricLabel({ households: 3375 }, "households"), "3,375세대");
  assert.equal(metricLabel(A, "parking"), "주차 1.35");
  assert.equal(metricLabel(C, "parking"), null, "값 없으면 알약 없음");
  assert.equal(metricLabel(A, "pyeong"), null, "평당가는 기존 색 단계 함수가 그린다");

  assert.deepEqual(hoverFacts(A), ["지역난방", "세대당 주차 1.35대", "12개 동", "6개월 매매 14건", "현대건설"]);
  assert.deepEqual(hoverFacts(C), ["6개월 매매 0건"]);

  assert.deepEqual(parseCx(null), EMPTY_CX);
  assert.deepEqual(parseCx({ heating: "district", parkingMin: "9", pyeong: [3000, "x"], builder: "현대건설", elevator: "yes" }), {
    ...EMPTY_CX,
    heating: "district",
    pyeong: [3000, null],
    builder: "현대건설",
    elevator: "yes",
  });
  assert.equal(parseCx({ builder: "x".repeat(41) }).builder, "all");
  assert.equal(parseMetric("recent"), "recent");
  assert.equal(parseMetric("evil"), "pyeong");
});

test("F5 서버 · DB", () => {
  const route = read("app/api/map/clusters/route.ts");
  assert.match(route, /sb\.rpc\("map_complex_attrs_v2", args\)/);
  assert.match(route, /sb\.rpc\("map_complex_attrs", args\)/, "v2 실패 시 v1");
  assert.ok(route.indexOf('"map_complex_attrs_v2"') < route.indexOf('sb.rpc("map_complex_attrs", args)'));
  for (const f of ["recentTrades", "parkingPerHh", "buildings", "elevators", "heating", "builder"]) {
    assert.match(route, new RegExp(`if \\(attrs\\.${f} !== undefined\\) point\\.${f} = attrs\\.${f};`), f);
  }
  const mig = readFileSync("supabase/migrations/20261010093918_1053_map_complex_attrs_v2.sql");
  assert.equal(createHash("md5").update(mig).digest("hex"), "e815019fee5c7bc6d211317955e440ec");
  const sql = mig.toString("utf8");
  assert.ok(!sql.endsWith("\n"));
  assert.match(sql, /from public, anon, authenticated;/);
  assert.match(sql, /to service_role;$/);
  assert.match(sql, /nullif\(h\.heating, ''\), nullif\(h\.builder, ''\)/);
});

test("F6 화면 연결", () => {
  const mc = read("app/map/map-client.tsx");
  assert.match(mc, /<span className="t-body font-bold text-ink">단지 조건<\/span>/);
  assert.match(mc, /label="마커에 표시"/);
  assert.match(mc, /label="최근 6개월 매매\(국토교통부\)"/);
  /* 목록에도 걸린다 — 점에 없는 단지는 값을 모르므로 뺀다 */
  assert.match(mc, /return p !== undefined && passesCx\(p, cx, \{ price: txType !== "rent" \}\);/);
  /* 마커 */
  assert.match(mc, /if \(cxOn && !passesCx\(p, cx, \{ price: txType !== "rent" \}\)\) continue;/);
  assert.match(mc, /\(rangeActive \|\| cxOn\) && txType !== "rent"/);
  assert.match(mc, /setCx\(EMPTY_CX\);\n\s+\/\* \[1027\] 정비사업 걸러 보기도 같이 푼다/);
  assert.match(mc, /\}\)\.concat\(cxSummary\(cx\)\)/);
  /* 선언 순서 — 목록 memo 가 읽는 값은 그보다 위에 있어야 한다(렌더 중 TDZ) */
  const at = (re: RegExp) => mc.search(re);
  const fd = at(/const filteredDanji = useMemo/);
  for (const re of [/const \[extraPoints, setExtraPoints\]/, /const \[cx, setCx\]/, /const pointById = useMemo/, /const \[txType, setTxType\]/]) {
    assert.ok(at(re) > 0 && at(re) < fd, String(re));
  }
  assert.ok(at(/const cxMatchCount = useMemo/) > at(/const \[txType, setTxType\]/));
  /* 패널 안에서 뒤에 선언된 clusterMode 를 읽지 않는다 */
  const panel = mc.slice(at(/const filterPanel = filtersExpanded/), at(/const filterPanel = filtersExpanded/) + 9000);
  assert.ok(!panel.includes("clusterMode"));
  const slider = read("app/map/HistogramRangeSlider.tsx");
  assert.ok(!slider.includes("걸러지지 않아요"), "실제 동작과 반대 문구");
  assert.match(slider, /값 없는 단지는 조건을 걸면 제외/);
  assert.match(read("components/map/NaverMap.tsx"), /hoverFacts\?: string\[\];/);
});
