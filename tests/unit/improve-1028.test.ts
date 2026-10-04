/* [1028] 문구·화면 개선 제안 20 — 내가 고친 로직(공매 목록 · 입주 물량 기간 · 단지 결과 요약 키 · 직거래·등기 표식 ·
   신고가 대비 · 입주 연차 · 청약 표기 · 시장 온도 구간 이름)의 규칙을 잠근다. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { applyDealMarks, dealMarkKey, type DealMarks } from "../../lib/complex/deal-marks.ts";
import {
  belowHighPct,
  builtYearsLabel,
  buildTxTrendData,
  overviewStripCells,
  recentDealRows,
} from "../../app/complex/[id]/complex-v2-model.ts";
import { competitionLabel, houseTypeLabel } from "../../lib/applyhome/normalize.ts";
import type { HubDeal } from "../../lib/complex/hub-price.ts";
import { sidoShort, sigunguDistribution } from "../../lib/onbid/region-summary.ts";
import { HOUSE_ADS } from "../../lib/ads/house-ads.ts";
import { SUPPLY_WINDOW_MONTHS, addMonthsYm, inSupplyWindow, shownMonths, supplyWindow } from "../../lib/supply/window.ts";
import { PLAN_FEATURE_MATRIX } from "../../lib/subscriptions/plans.ts";

const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/* ── 17. 공매 목록 ─────────────────────────────────────────────────────── */

test("[1028 · 17] 공매 — 진행 목록은 오늘 이후 마감부터 읽고, 건수는 DB 가 센다", () => {
  const src = code("lib/onbid/store.ts");
  assert.match(src, /export function bidEndFloor\(now: Date = new Date\(\)\): string/);
  assert.ok(src.includes(".or(`bid_end.gte.${floor},bid_end.is.null`)"), "진행 목록 하한 + 마감일 미상은 남긴다");
  assert.ok(src.includes('.lt("bid_end", floor).order("bid_end", { ascending: false }).limit(RECENT_CLOSED_LIMIT)'), "지난 공고는 따로 최근 것만");
  assert.ok(src.includes('.select("id", { count: "exact", head: true })'), "건수는 head count");
  assert.ok(src.includes(".or(`bid_end.gte.${bidEndFloor()},bid_end.is.null`)"), "건수와 목록이 같은 기준");
  assert.ok(!/\.select\("bid_end"\)\s*\.limit\(5000\)/.test(src), "1,000행에서 잘리던 셈법이 남아 있지 않다");
});

test("[1028 · 17] bidEndFloor — 한국 시간의 오늘 0시(12자리)", async () => {
  /* store.ts 는 server-only 를 끌어오므로 같은 식을 여기서 한 번 더 계산해 꼴만 본다 */
  const src = code("lib/onbid/store.ts");
  const body = src.slice(src.indexOf("export function bidEndFloor"), src.indexOf("/** 최근 마감 물건을"));
  assert.ok(body.includes("9 * 60 * 60 * 1000"), "UTC+9");
  assert.ok(body.includes("}0000`"), "그 날 0시");
  const floorOf = (iso: string) => {
    const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
    const p2 = (n: number) => String(n).padStart(2, "0");
    return `${kst.getUTCFullYear()}${p2(kst.getUTCMonth() + 1)}${p2(kst.getUTCDate())}0000`;
  };
  assert.equal(floorOf("2026-10-02T15:30:00Z"), "202610030000", "UTC 10/2 15:30 = 한국 10/3 00:30");
  assert.equal(floorOf("2026-10-02T14:59:00Z"), "202610020000");
  assert.ok("202609302350" < floorOf("2026-10-03T01:00:00Z"), "지난 마감은 하한보다 앞(사전순 = 시간순)");
});

test("[1028 · 17] 공매 지역 요약 — 시도 + 시군구로 묶는다(다른 도시의 '동구'를 합치지 않는다)", () => {
  assert.equal(sidoShort("대전광역시"), "대전");
  assert.equal(sidoShort("서울특별시"), "서울");
  assert.equal(sidoShort("경기도"), "경기");
  assert.equal(sidoShort("충청북도"), "충북");
  assert.equal(sidoShort("경상남도"), "경남");
  assert.equal(sidoShort("강원특별자치도"), "강원");
  assert.equal(sidoShort("세종특별자치시"), "세종");
  assert.equal(sidoShort(null), "");
  const rows = sigunguDistribution([
    { sido: "대전광역시", sigungu: "동구" },
    { sido: "대구광역시", sigungu: "동구" },
    { sido: "대구광역시", sigungu: "동구" },
    { sido: "대전광역시", sigungu: "유성구" },
    { sido: null, sigungu: "강남구" },
    { sido: "서울특별시", sigungu: null },
  ]);
  assert.deepEqual(
    rows.map((r) => [r.name, r.sido, r.gu, r.count]),
    [
      ["대구 동구", "대구광역시", "동구", 2],
      ["대전 동구", "대전광역시", "동구", 1],
      ["대전 유성구", "대전광역시", "유성구", 1],
      ["강남구", null, "강남구", 1],
    ],
  );
  assert.equal(sigunguDistribution([{ sido: "서울특별시", sigungu: "중구" }], 0).length, 0, "상한을 받는다");
});

test("[1028 · 17] 공매 조건 — 목록 · 지난 공고 · 건수가 같은 조건을 걸고, 시도는 정확일치", () => {
  const src = code("lib/onbid/store.ts");
  assert.ok(src.includes('if (opts.sido?.trim()) steps.push({ kind: "eq", column: "sido", value: opts.sido.trim() });'));
  assert.equal((src.match(/auctionFilterSteps\(opts\)/g) ?? []).length, 2, "목록과 건수가 같은 걸음을 쓴다");
  const api = code("app/api/auctions/route.ts");
  assert.ok(api.includes("const sido = /^[가-힣]{2,10}$/.test(sidoRaw) ? sidoRaw : undefined;"), "시도 값은 한글 2~10자만");
  assert.ok(api.includes("filtered ? getActiveAuctionCount({ usage, sigungu: gu, sido }) : Promise.resolve(null)"), "조건 건수는 DB 집계");
  const ui = code("app/auctions/AuctionsClient.tsx");
  /* [1030 · G6] 시도 칩이 생겨 시군구 해제는 시도를 남긴다 — 고를 때는 여전히 시도를 같이 보낸다 */
  assert.ok(ui.includes("onClick={() => set(on ? { gu: null } : { gu: g.gu, sido: g.sido })}"), "지역 요약 칸은 시도를 같이 보낸다");
  assert.ok(ui.includes("표시 중 ${cards.length.toLocaleString()}건 기준"), "요약 칸은 받은 목록 기준임을 적는다");
  assert.ok(!code("app/auctions/page.tsx").includes('title: "수도권 공매 물건'), "5대 광역시가 들어온 뒤의 제목");
});

/* ── 18. 입주 물량 기간 ────────────────────────────────────────────────── */

test("[1028 · 18] 입주 물량 — 창은 달력 기준 '이번 달부터 24개월', 그래프·합계·지역 요약이 같은 창", () => {
  assert.equal(SUPPLY_WINDOW_MONTHS, 24);
  assert.equal(addMonthsYm("202610", 23), "202809");
  assert.equal(addMonthsYm("202612", 1), "202701");
  assert.equal(addMonthsYm("202701", -1), "202612");
  const w = supplyWindow("202610");
  assert.deepEqual(w, { fromYm: "202610", toYm: "202809" });
  assert.ok(inSupplyWindow("202610", w) && inSupplyWindow("202809", w));
  assert.ok(!inSupplyWindow("202609", w) && !inSupplyWindow("202810", w));
  assert.ok(!inSupplyWindow("202700", w) && !inSupplyWindow("", w), "달이 없거나 잘못 적힌 값은 창 밖");
  /* 창 안의 달만 — 자료가 2032년까지 있어도 끝은 2028.09 */
  const dense = ["202608", "202609", "202610", "202611", "202809", "202810", "203203"].map((ym) => ({ ym }));
  assert.deepEqual(shownMonths(dense, w), { months: [{ ym: "202610" }, { ym: "202611" }, { ym: "202809" }], windowed: true });
  /* 물량이 드문 지역 — "자료 있는 달 24개"가 아니라 달력 24개월: 창 안 한 달뿐이면 그 한 달만 */
  const sparse = ["202703", "202905", "203001"].map((ym) => ({ ym }));
  assert.deepEqual(shownMonths(sparse, w).months, [{ ym: "202703" }]);
  /* 창 안에 하나도 없으면 가진 달을 보이되 windowed=false(화면은 "24개월"이라 적지 않는다) */
  const far = ["202905", "203001"].map((ym) => ({ ym }));
  assert.deepEqual(shownMonths(far, w), { months: far, windowed: false });

  const src = code("app/supply/SupplyClient.tsx");
  assert.ok(src.includes("const { months: monthlyShown, windowed } = shownMonths(monthly, win);"));
  assert.ok(src.includes("const regions = deriveRegions(items, regionsWindowed ? win : null);"), "지역별 요약도 같은 창");
  assert.ok(src.includes("const totalHouseholds = monthlyShown.reduce("), "합계는 보이는 달만");
  assert.ok(/const peak =\s*monthlyShown\.length > 0\s*\? monthlyShown\.reduce/.test(src), "가장 많은 달도 보이는 달 안에서");
  assert.ok(!/monthly\.slice\(-24\)/.test(src) && !src.includes("{monthlyShown.length}개월"), "자료 있는 달 수를 '개월'로 적지 않는다");
  assert.ok(src.includes('<AIPanel title="입주 물량 요약" ai={false}'), "규칙 계산 요약에는 AI 배지가 없다");
});

/* ── 19. 단지 결과 요약 키 ─────────────────────────────────────────────── */

test("[1028 · 19] 단지 결과 요약 — 실거래 조회 키는 canonical_id(kapt 형태 id 아님)", () => {
  const page = code("app/complex/[id]/page.tsx");
  assert.ok(page.includes("prefetchAxisSummary({ rowId: r.canonical_id, city: r.city, district: r.district })"));
  assert.ok(page.includes("<ComplexAxisSummary complexId={rowForFacts?.canonical_id ?? v.id}"));
  assert.ok(!page.includes("prefetchAxisSummary({ rowId: r.id,"));
});

/* ── 13. 직거래·등기 표식 ──────────────────────────────────────────────── */

const D = (ym: string, day: number, man: number, area = 114.7, floor = 10): HubDeal => ({ ym, day, man, area, floor });

test("[1028 · 13] 표식 — 키가 같은 거래에만 붙고, 표식이 없으면 원래 객체 그대로", () => {
  const deals = [D("202609", 15, 57000, 114.7, 20), D("202609", 12, 84000, 114.7, 8), D("202608", 15, 82000, 114.7, 19)];
  const marks: DealMarks = {
    direct: new Set([dealMarkKey(deals[0])]),
    registered: new Map([
      [dealMarkKey(deals[0]), "26.09.18"],
      [dealMarkKey(deals[2]), "26.08.31"],
    ]),
  };
  const out = applyDealMarks(deals, marks);
  assert.deepEqual(out[0], { ...deals[0], direct: true, rgst: "26.09.18" });
  assert.equal(out[1], deals[1], "표식 없는 거래는 같은 객체");
  assert.deepEqual(out[2], { ...deals[2], rgst: "26.08.31" });
  assert.equal(applyDealMarks(deals, null), deals, "표식을 못 읽으면 목록 그대로");
  assert.equal(applyDealMarks(deals, { direct: new Set(), registered: new Map() }), deals);
});

test("[1028 · 13] 최근 실거래 표 · 추이 머리 — 직거래·등기가 행과 최근/신저가 점에 실린다", () => {
  const deals = applyDealMarks(
    [D("202609", 15, 57000, 114.7, 20), D("202609", 12, 84000, 114.7, 8), D("202609", 7, 84800, 114.7, 17), D("202608", 15, 82000, 114.7, 19)],
    {
      direct: new Set([dealMarkKey(D("202609", 15, 57000, 114.7, 20))]),
      registered: new Map([[dealMarkKey(D("202608", 15, 82000, 114.7, 19)), "26.08.31"]]),
    },
  );
  const rows = recentDealRows(deals, 10);
  assert.equal(rows[0].man, 57000);
  assert.equal(rows[0].direct, true);
  assert.equal(rows[0].rgst, null);
  assert.equal(rows[1].direct, false);
  assert.equal(rows[3].rgst, "26.08.31");
  const trend = buildTxTrendData(deals, null, "202610")!;
  const t = trend.types[0];
  assert.equal(t.latest?.man, 57000);
  assert.equal(t.latest?.direct, true, "가장 최근 계약이 직거래면 그렇게 적는다");
  assert.equal(t.low?.direct, true, "신저가 점도 같은 거래");
  assert.equal(t.high?.direct, undefined, "직거래가 아닌 점에는 표식이 없다");
  const table = code("app/complex/[id]/RecentDealsTable.tsx");
  assert.ok(table.includes("직거래") && table.includes("등기"));
  const section = code("app/complex/[id]/TxTrendSection.tsx");
  assert.ok(section.includes('p.direct ? "직거래" : null'));
});

test("[1028 · 13] 표식 조회 — 해제 제외·아파트·매매 조건을 그대로 건다", () => {
  const src = code("lib/complex/complex-store.ts");
  const a = src.indexOf("const loadTradeMarkRowsShared");
  const body = src.slice(a, src.indexOf("export async function getComplexDealMarks"));
  assert.equal((body.match(/\.eq\("is_cancelled", false\)/g) ?? []).length, 2);
  assert.equal((body.match(/\.eq\("property_type", "apartment"\)/g) ?? []).length, 2);
  assert.ok(body.includes('.eq("raw->>dealingGbn", "직거래")'));
  assert.ok(body.includes(".limit(40)"), "등기일은 최근 실거래 표가 쓰는 만큼만");
});

/* ── 14. 신고가 대비 · 16. 입주 연차 ───────────────────────────────────── */

test("[1028 · 14] 신고가 대비 — 낮을 때만 음수 %, 같거나 높으면 없음", () => {
  assert.equal(Math.round(belowHighPct(102800, 105200)! * 10) / 10, -2.3);
  assert.equal(belowHighPct(105200, 105200), null);
  assert.equal(belowHighPct(110000, 105200), null);
  assert.equal(belowHighPct(null, 105200), null);
  assert.equal(belowHighPct(102800, null), null);
  assert.equal(belowHighPct(0, 105200), null);
});

test("[1028 · 16] 입주 연차 — 준공 해가 1년차, 올해를 받았을 때만 준공 칸 곁말", () => {
  assert.equal(builtYearsLabel(2016, 2026), "11년차");
  assert.equal(builtYearsLabel(2026, 2026), "1년차");
  assert.equal(builtYearsLabel(2027, 2026), null, "아직 준공 전");
  assert.equal(builtYearsLabel(null, 2026), null);
  const row = { households: 4250, building_count: 35, build_year: 2016, parking_per_hh: 1.16, heating: "지역난방", builder_name: "삼성물산" };
  const withYear = overviewStripCells(row, { nowYear: 2026 }).find((c) => c.key === "buildYear")!;
  assert.equal(withYear.value, "2016");
  assert.equal(withYear.note, "11년차");
  const noYear = overviewStripCells(row).find((c) => c.key === "buildYear")!;
  assert.equal(noYear.note, undefined, "올해를 안 넘기면 예전 그대로(브리핑 견본 등)");
});

/* ── 15. 청약 표기 ─────────────────────────────────────────────────────── */

test("[1028 · 15] 청약 — 주택형·경쟁률 원문을 읽기 쉬운 표기로, 꼴이 다르면 원문 그대로", () => {
  assert.equal(houseTypeLabel("084.9890A"), "84㎡A");
  assert.equal(houseTypeLabel("114.8419"), "114㎡");
  assert.equal(houseTypeLabel("059.9742A"), "59㎡A");
  assert.equal(houseTypeLabel("200.4768B"), "200㎡B");
  assert.equal(houseTypeLabel("84A"), "84A", "꼴이 다르면 그대로");
  assert.equal(houseTypeLabel(""), "—");
  assert.equal(competitionLabel("3.60"), "3.6 : 1");
  assert.equal(competitionLabel("1.00"), "1 : 1");
  assert.equal(competitionLabel("48.33"), "48.33 : 1");
  assert.equal(competitionLabel("(△1)"), "미달 1세대");
  assert.equal(competitionLabel("(△12)"), "미달 12세대");
  assert.equal(competitionLabel("-"), "—");
  assert.equal(competitionLabel(null), "—");
  assert.equal(competitionLabel("추첨"), "추첨", "꼴이 다르면 그대로");
  const client = code("app/apply/ApplySearchClient.tsx");
  assert.ok(client.includes("{competitionLabel(item.competitionRate)}"));
  assert.ok(client.includes("item.rankCode ? ` · ${item.rankCode}순위` : \"\""), "순위를 줄마다 적는다");
});

/* ── 20. 시장 온도 구간 이름 ───────────────────────────────────────────── */

test("[1028 · 20] 시장 온도 — 구간 이름은 눈금만 말하고(경계 그대로), 성분은 따로 적는다", () => {
  const src = code("lib/market/temperature.ts");
  assert.ok(src.includes('return score >= 65 ? "뜨거움" : score >= 55 ? "따뜻함" : score >= 45 ? "중립" : score >= 35 ? "서늘함" : "차가움";'));
  for (const old of ["가격·거래 모두 달아오르는 구간", "완만한 회복 흐름", "방향성 탐색 구간", "가격·거래 모두 식은 구간"]) {
    assert.ok(!src.includes(`? "${old}"`) && !src.includes(`: "${old}"`), `옛 이름이 값으로 남지 않았다: ${old}`);
  }
  assert.ok(src.includes("export const TEMPERATURE_FORMULA_VERSION = 1;"), "계산 규칙은 그대로라 공식 버전도 그대로");
  for (const advice of ["고점 추격은 신중히", "급매 중심으로 관찰할 시기", "바닥 다지기 가능성을 지켜보세요"]) {
    assert.ok(!src.includes(advice), `추세 설명에 권유 문장이 없다: ${advice}`);
  }
  const archive = code("lib/market/temperature-archive.ts");
  assert.ok(archive.includes("headline: temperatureHeadline(Number(r.score ?? 0)),"), "지난 주 기록도 점수에서 다시 만든다");
  assert.ok(archive.includes("momentum_points,volume_points,volume_window_months,"));
});

/* ── 11. 틀린 설명 ─────────────────────────────────────────────────────── */

test("[1028 · 11] 요금제 안내 카드 — 한도는 요금제 비교표의 무료 칸과 같은 말(걸리지 않는 한도를 말하지 않는다)", () => {
  const ad = HOUSE_ADS.find((a) => a.id === "house_subscription");
  assert.ok(ad);
  const free = (f: string) => PLAN_FEATURE_MATRIX.find((r) => r.feature === f)?.free;
  assert.equal(ad.body, `AI 분석 도구 ${free("AI 분석 도구")} · AI 임장노트 자동정리 ${free("AI 임장노트 자동정리")}`);
  assert.equal(ad.body, "AI 분석 도구 누적 3회 · AI 임장노트 자동정리 월 2회");
  assert.ok(!ad.body.includes("동네 분석 요약"), "[1004]에 비교표에서 뺀 한도(실제로 걸리지 않음)");
  for (const a of HOUSE_ADS) {
    assert.ok(!/[?!]/.test(a.title), `${a.id} 제목에 물음·느낌표 없음`);
    assert.ok(!/보세요|하세요/.test(a.body), `${a.id} 본문에 권유 없음`);
  }
});

/* ── 그림을 다시 보다 고친 것 ──────────────────────────────────────────── */

test("[1028 · 13] 최근 실거래 표 — 폰에서 배지가 표 밖으로 잘리지 않는다(최소 폭 · 줄바꿈 · 폰 여백)", () => {
  const src = code("app/complex/[id]/RecentDealsTable.tsx");
  assert.ok(src.includes('<table className="w-full min-w-[300px] border-collapse t-body">'), "표 최소 폭이 390px 폰의 보이는 폭(349)보다 작다");
  assert.ok(!src.includes("min-w-[360px]"));
  assert.ok(src.includes('<td className="py-2">'), "비고 칸은 줄바꿈 금지를 걸지 않는다");
  assert.ok(src.includes('<span className="inline-flex flex-wrap items-center gap-1">'), "배지가 모자라면 칸 안에서 줄을 바꾼다");
  const badges = src.match(/inline-flex items-center whitespace-nowrap rounded-sm [^"]*max-md:px-1"/g) ?? [];
  assert.equal(badges.length, 4, "해제 · 신고가 · 직거래 · 등기 — 낱말은 안 꺾이고 폰에서 여백을 줄인다");
});

test("[1028 · 17] 공매 — 묶음 제목에 그 묶음의 카드 수를 건수처럼 적지 않는다", () => {
  const src = code("app/auctions/AuctionsClient.tsx");
  assert.ok(!src.includes("진행 중 물건 ({ongoing.length}건)"));
  assert.ok(!src.includes("({imminent.length}건)"));
  assert.ok(src.includes("마감 임박 · D-3 이내"), "임박 기준(D-3 이내)은 ddayFrom 의 urgent 와 같다");
  assert.ok(src.includes("return { label: `D-${diff}`, urgent: diff <= 3 };"));
});

test("[1028 · 3·8] 괄호 꼬리 \"(조회 실패)\"와 남은 내부 말(실데이터 · 실시세)", () => {
  for (const p of ["app/digest/page.tsx", "app/redevelopment/[id]/page.tsx"]) {
    assert.ok(!/\(조회 실패\)|\(일부 조회 실패\)/.test(code(p)), `${p} 괄호 꼬리 없음`);
  }
  assert.ok(code("app/digest/page.tsx").includes("시세 불러오기 실패 · 잠시 후 다시"));
  assert.ok(code("app/redevelopment/[id]/page.tsx").includes("가까운 구역 불러오기 실패 · 잠시 후 다시"));
  assert.ok(!code("lib/missions/missions.ts").includes("실데이터로"));
  assert.ok(!/>\s*실시세 \{/.test(code("app/analysis/ai-note-analysis.tsx")));
  assert.ok(code("app/analysis/ai-note-analysis.tsx").includes("지역 통계 {state.result.marketSummary}"));
});
